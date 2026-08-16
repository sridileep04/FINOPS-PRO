"""Scheduled, once-a-day (default) refresh of the pricing_cache table
via the real AWS Price List Query API -- decoupled from resource
scanning entirely, so scans never wait on a live pricing call.

Deliberately does NOT use dedicated platform AWS credentials. Pricing
data is public AWS metadata, identical for every account in a given
region -- there's nothing customer-specific about it -- so this just
borrows a boto3 session from whichever currently-connected customer
account happens to have `pricing:GetProducts` allowed, tries the next
one if that account's policy doesn't include it, and gives up
gracefully (leaving those SKUs to retry on the next scheduled run) if
none of them do.
"""
import json
import logging
from datetime import datetime, timedelta, timezone

from botocore.exceptions import ClientError, NoCredentialsError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.aws_account import AwsAccount, ValidationStatus
from app.models.bff import PricingCache
from app.models.resource_snapshot import ResourceSnapshot
from app.services import aws_session_service
from app.services.pricing_service import CACHE_TTL, _RDS_ENGINE_MAP
from app.tasks.celery_app import celery_app
from app.tasks.report_tasks import SyncSessionLocal

logger = logging.getLogger(__name__)


def _stale_or_missing(db: Session, service_code: str, sku_key: str, region: str) -> bool:
    row = db.execute(
        select(PricingCache).where(
            PricingCache.service_code == service_code,
            PricingCache.sku_key == sku_key,
            PricingCache.region == region,
        )
    ).scalar_one_or_none()
    if row is None:
        return True
    return datetime.now(timezone.utc) - row.fetched_at.replace(tzinfo=timezone.utc) > CACHE_TTL


def _needed_skus(db: Session) -> list[dict]:
    """Distinct (resource_type, region, sub-attributes) combos actually
    present in the most recent snapshot of any customer's resources,
    that don't already have a fresh cached price."""
    needed = []

    ec2_rows = db.execute(
        select(ResourceSnapshot.region, ResourceSnapshot.attributes["instance_type"].astext)
        .where(ResourceSnapshot.resource_type == "ec2_instance")
        .distinct()
    ).all()
    for region, instance_type in ec2_rows:
        if region and instance_type and _stale_or_missing(db, "AmazonEC2", f"ec2:{instance_type}", region):
            needed.append({"service_code": "AmazonEC2", "sku_key": f"ec2:{instance_type}", "region": region,
                            "filters": [
                                {"Type": "TERM_MATCH", "Field": "instanceType", "Value": instance_type},
                                {"Type": "TERM_MATCH", "Field": "regionCode", "Value": region},
                                {"Type": "TERM_MATCH", "Field": "operatingSystem", "Value": "Linux"},
                                {"Type": "TERM_MATCH", "Field": "tenancy", "Value": "Shared"},
                                {"Type": "TERM_MATCH", "Field": "preInstalledSw", "Value": "NA"},
                                {"Type": "TERM_MATCH", "Field": "capacitystatus", "Value": "Used"},
                            ]})

    ebs_rows = db.execute(
        select(ResourceSnapshot.region, ResourceSnapshot.attributes["volume_type"].astext)
        .where(ResourceSnapshot.resource_type == "ebs_volume")
        .distinct()
    ).all()
    for region, volume_type in ebs_rows:
        if region and volume_type and _stale_or_missing(db, "AmazonEC2", f"ebs:{volume_type}", region):
            needed.append({"service_code": "AmazonEC2", "sku_key": f"ebs:{volume_type}", "region": region,
                            "filters": [
                                {"Type": "TERM_MATCH", "Field": "volumeApiName", "Value": volume_type},
                                {"Type": "TERM_MATCH", "Field": "regionCode", "Value": region},
                                {"Type": "TERM_MATCH", "Field": "productFamily", "Value": "Storage"},
                            ]})

    rds_rows = db.execute(
        select(ResourceSnapshot.region, ResourceSnapshot.attributes["class"].astext, ResourceSnapshot.attributes["engine"].astext)
        .where(ResourceSnapshot.resource_type == "rds_instance")
        .distinct()
    ).all()
    rds_regions = set()
    for region, db_class, engine_raw in rds_rows:
        if not region:
            continue
        rds_regions.add(region)
        engine = _RDS_ENGINE_MAP.get((engine_raw or "").lower())
        if db_class and engine and _stale_or_missing(db, "AmazonRDS", f"rds:{db_class}:{(engine_raw or '').lower()}", region):
            needed.append({"service_code": "AmazonRDS", "sku_key": f"rds:{db_class}:{(engine_raw or '').lower()}", "region": region,
                            "filters": [
                                {"Type": "TERM_MATCH", "Field": "instanceType", "Value": db_class},
                                {"Type": "TERM_MATCH", "Field": "regionCode", "Value": region},
                                {"Type": "TERM_MATCH", "Field": "databaseEngine", "Value": engine},
                                {"Type": "TERM_MATCH", "Field": "deploymentOption", "Value": "Single-AZ"},
                            ]})
    for region in rds_regions:
        if _stale_or_missing(db, "AmazonRDS", "rds:storage:gp2", region):
            needed.append({"service_code": "AmazonRDS", "sku_key": "rds:storage:gp2", "region": region,
                            "filters": [
                                {"Type": "TERM_MATCH", "Field": "regionCode", "Value": region},
                                {"Type": "TERM_MATCH", "Field": "productFamily", "Value": "Database Storage"},
                                {"Type": "TERM_MATCH", "Field": "volumeType", "Value": "General Purpose"},
                            ]})

    return needed


def _extract_ondemand_price(price_list_json_strings: list[str]) -> tuple[float, str] | None:
    for raw in price_list_json_strings:
        product = json.loads(raw)
        for term in product.get("terms", {}).get("OnDemand", {}).values():
            for dim in term.get("priceDimensions", {}).values():
                price_str = dim.get("pricePerUnit", {}).get("USD")
                if price_str and float(price_str) > 0:
                    return float(price_str), dim.get("unit")
    return None


def _store(db: Session, service_code: str, sku_key: str, region: str, price: float | None, unit: str | None) -> None:
    row = db.execute(
        select(PricingCache).where(
            PricingCache.service_code == service_code, PricingCache.sku_key == sku_key, PricingCache.region == region,
        )
    ).scalar_one_or_none()
    if row is None:
        row = PricingCache(service_code=service_code, sku_key=sku_key, region=region)
        db.add(row)
    row.price_per_unit_usd = price
    row.unit = unit
    row.fetched_at = datetime.now(timezone.utc)
    db.commit()


def _candidate_accounts(db: Session) -> list[AwsAccount]:
    return list(db.execute(
        select(AwsAccount).where(AwsAccount.validation_status == ValidationStatus.VALID)
    ).scalars().all())


@celery_app.task(name="pricing.refresh_cache", bind=True, max_retries=1)
def refresh_pricing_cache(self):
    db: Session = SyncSessionLocal()
    try:
        needed = _needed_skus(db)
        if not needed:
            logger.info("Pricing refresh: nothing stale, skipping")
            return

        accounts = _candidate_accounts(db)
        if not accounts:
            logger.warning("Pricing refresh: no validated AWS accounts available to borrow credentials from")
            return

        fetched, denied = 0, 0
        for item in needed:
            priced = False
            for account in accounts:
                try:
                    session = aws_session_service.get_boto3_session(account)
                    client = session.client("pricing", region_name="us-east-1")
                    resp = client.get_products(ServiceCode=item["service_code"], Filters=item["filters"], MaxResults=5)
                except ClientError as exc:
                    code = exc.response.get("Error", {}).get("Code", "")
                    if code in ("AccessDenied", "AccessDeniedException", "UnauthorizedOperation"):
                        continue  # try the next account
                    logger.warning("Pricing refresh: %s failed for %s: %s", item["sku_key"], account.id, exc)
                    continue
                except (NoCredentialsError, aws_session_service.SessionBuildError) as exc:
                    logger.warning("Pricing refresh: could not build session for account %s: %s", account.id, exc)
                    continue

                result = _extract_ondemand_price(resp.get("PriceList", []))
                _store(db, item["service_code"], item["sku_key"], item["region"],
                       result[0] if result else None, result[1] if result else None)
                fetched += 1
                priced = True
                break
            if not priced:
                denied += 1
                logger.warning("Pricing refresh: no available account could price %s in %s", item["sku_key"], item["region"])

        logger.info("Pricing refresh complete: %d priced, %d skipped (no account had pricing:GetProducts)", fetched, denied)
    finally:
        db.close()
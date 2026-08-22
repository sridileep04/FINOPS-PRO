"""Read-only pricing lookups for resource cost estimation.

Deliberately has NO network calls in it. `pricing_refresh_task.py` is the
only thing that ever talks to the AWS Pricing API and writes to
`pricing_cache`, on its own schedule (daily by default). This file just
reads whatever's already cached, so calling it from the scan pipeline
never slows a scan down or depends on the Pricing API being reachable.

If a price hasn't been cached yet, functions here return None -- callers
should render "N/A", not "$0.00". It'll be a live number by the next
scheduled refresh.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.bff import PricingCache

HOURS_PER_MONTH = 730
CACHE_TTL = timedelta(days=1)  # a cached price older than this is treated as "not cached"

_RDS_ENGINE_MAP = {
    # steampipe's `engine` attribute -> AWS Pricing API's `databaseEngine`
    "postgres": "PostgreSQL", "mysql": "MySQL", "mariadb": "MariaDB",
    "oracle-se2": "Oracle", "oracle-ee": "Oracle", "sqlserver-ex": "SQL Server",
    "sqlserver-web": "SQL Server", "sqlserver-se": "SQL Server", "sqlserver-ee": "SQL Server",
    "aurora-postgresql": "Aurora PostgreSQL", "aurora-mysql": "Aurora MySQL",
}


def get_cached_price(db: Session, service_code: str, sku_key: str, region: str) -> float | None:
    row = db.execute(
        select(PricingCache).where(
            PricingCache.service_code == service_code,
            PricingCache.sku_key == sku_key,
            PricingCache.region == region,
        )
    ).scalar_one_or_none()
    if row is None or row.price_per_unit_usd is None:
        return None
    if datetime.now(timezone.utc) - row.fetched_at.replace(tzinfo=timezone.utc) > CACHE_TTL:
        return None  # stale -- refresh task will pick it up on its next pass
    return float(row.price_per_unit_usd)


def estimate_ec2_monthly_cost(db: Session, region: str, attributes: dict) -> float | None:
    state = (attributes.get("state") or "").lower()
    if state and state != "running":
        return 0.0  # stopped/terminated instances aren't billed for compute
    instance_type = attributes.get("instance_type")
    if not instance_type or not region:
        return None
    hourly = get_cached_price(db, "AmazonEC2", f"ec2:{instance_type}", region)
    return round(hourly * HOURS_PER_MONTH, 2) if hourly else None


def estimate_ebs_monthly_cost(db: Session, region: str, attributes: dict) -> float | None:
    size_gb = attributes.get("size_gb")
    volume_type = attributes.get("volume_type")
    if size_gb is None or not volume_type or not region:
        return None
    gb_month_rate = get_cached_price(db, "AmazonEC2", f"ebs:{volume_type}", region)
    return round(float(size_gb) * gb_month_rate, 2) if gb_month_rate else None


def estimate_eip_monthly_cost(attributes: dict) -> float:
    # Flat-rate, doesn't vary by region/time -- no cache lookup needed.
    return 0.0 if attributes.get("association_id") else round(0.005 * HOURS_PER_MONTH, 2)


def estimate_rds_monthly_cost(db: Session, region: str, attributes: dict) -> float | None:
    db_class = attributes.get("class")
    engine_raw = (attributes.get("engine") or "").lower()
    storage_gb = attributes.get("allocated_storage_gb") or 0
    if not db_class or not region:
        return None

    engine = _RDS_ENGINE_MAP.get(engine_raw)
    compute_cost = 0.0
    if engine:
        hourly = get_cached_price(db, "AmazonRDS", f"rds:{db_class}:{engine_raw}", region)
        compute_cost = hourly * HOURS_PER_MONTH if hourly else 0.0

    storage_rate = get_cached_price(db, "AmazonRDS", "rds:storage:gp2", region)
    storage_cost = float(storage_gb) * storage_rate if storage_rate else 0.0

    total = compute_cost + storage_cost
    return round(total, 2) if total > 0 else None


def estimate_monthly_cost(db: Session, resource_type: str, region: str | None, attributes: dict) -> float | None:
    region = region or ""
    if resource_type == "ec2_instance":
        return estimate_ec2_monthly_cost(db, region, attributes)
    if resource_type == "ebs_volume":
        return estimate_ebs_monthly_cost(db, region, attributes)
    if resource_type == "eip":
        return estimate_eip_monthly_cost(attributes)
    if resource_type == "rds_instance":
        return estimate_rds_monthly_cost(db, region, attributes)
    return None
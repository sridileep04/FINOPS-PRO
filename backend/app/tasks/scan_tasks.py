import asyncio
import logging
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.request_context import request_id_var
from app.models.aws_account import AwsAccount, ValidationStatus
from app.models.daily_cost import DailyCost
from app.models.metric_sample import MetricSample
from app.models.resource_snapshot import ResourceSnapshot
from app.models.scan_run import ScanRun, ScanStatus
from app.services import analysis_service
from app.services.resource_scanner_service import collect_account_data
from app.tasks.celery_app import celery_app
from app.tasks.report_tasks import SyncSessionLocal
from app.services import pricing_service

logger = logging.getLogger(__name__)


def _upsert_resource_snapshots(db, account: AwsAccount, scan_run_id, resource_type: str, rows: list[dict], today: date) -> int:
    count = 0
    for row in rows:
        resource_id = row.get("resource_id")
        if not resource_id:
            continue
        created_at = row.get("created_at")
        if isinstance(created_at, str):
            try:
                created_at = datetime.fromisoformat(created_at)
            except ValueError:
                created_at = None

        existing = db.execute(
            select(ResourceSnapshot).where(
                ResourceSnapshot.aws_account_id == account.id,
                ResourceSnapshot.resource_id == resource_id,
                ResourceSnapshot.snapshot_date == today,
            )
        ).scalar_one_or_none()

        attributes = row.get("attributes") or {}
        tags = row.get("tags")
        estimated_cost = pricing_service.estimate_monthly_cost(db, resource_type, row.get("region"), attributes)
        
        if existing:
            existing.attributes = attributes
            existing.tags = tags
            existing.region = row.get("region")
            existing.resource_created_at = created_at
            existing.estimated_monthly_cost_usd = estimated_cost
            existing.removed_at = None
        else:
            db.add(ResourceSnapshot(
                aws_account_id=account.id, scan_run_id=scan_run_id, resource_id=resource_id,
                resource_type=resource_type, region=row.get("region"), snapshot_date=today,
                resource_created_at=created_at, tags=tags, attributes=attributes,
                estimated_monthly_cost_usd=estimated_cost, removed_at=None,
            ))
        count += 1
    return count


def _upsert_metric_samples(db, account: AwsAccount, rows: list[dict]) -> int:
    count = 0
    for row in rows:
        resource_id = row.get("instance_id")
        ts = row.get("timestamp")
        if not resource_id or not ts:
            continue
        if isinstance(ts, str):
            ts = datetime.fromisoformat(ts)

        existing = db.execute(
            select(MetricSample).where(
                MetricSample.aws_account_id == account.id,
                MetricSample.resource_id == resource_id,
                MetricSample.metric_name == "cpu_utilization",
                MetricSample.timestamp == ts,
            )
        ).scalar_one_or_none()
        if existing:
            continue

        db.add(MetricSample(
            aws_account_id=account.id, resource_id=resource_id, resource_type="ec2_instance",
            metric_name="cpu_utilization", granularity="hourly", timestamp=ts,
            average=row.get("average"), maximum=row.get("maximum"), minimum=row.get("minimum"),
        ))
        count += 1
    return count


def _upsert_daily_costs(db, account: AwsAccount, rows: list[dict]) -> int:
    count = 0
    for row in rows:
        service = row.get("service")
        usage_date = row.get("usage_date")
        cost = row.get("cost")
        if not service or usage_date is None or cost is None:
            continue
        if isinstance(usage_date, str):
            usage_date = date.fromisoformat(usage_date)

        existing = db.execute(
            select(DailyCost).where(
                DailyCost.aws_account_id == account.id,
                DailyCost.usage_date == usage_date,
                DailyCost.service == service,
            )
        ).scalar_one_or_none()
        if existing:
            existing.cost_usd = cost
        else:
            db.add(DailyCost(aws_account_id=account.id, usage_date=usage_date, service=service, cost_usd=cost))
        count += 1
    return count


@celery_app.task(name="scans.run_account_scan", bind=True, max_retries=1, default_retry_delay=60)
def run_account_scan_task(self, aws_account_id: str):
    token = request_id_var.set(f"scan-{aws_account_id}")
    db = SyncSessionLocal()
    try:
        account = db.get(AwsAccount, aws_account_id)
        if account is None:
            logger.error("Scan: account %s not found", aws_account_id)
            return

        scan_run = ScanRun(customer_id=account.customer_id, aws_account_id=account.id, status=ScanStatus.RUNNING)
        db.add(scan_run)
        db.commit()
        db.refresh(scan_run)

        today = date.today()
        try:
            data = asyncio.run(collect_account_data(account))

            resources_scanned = 0
            for resource_type, rows in data.inventory.items():
                resources_scanned += _upsert_resource_snapshots(db, account, scan_run.id, resource_type, rows, today)
                current_ids = {r.get("resource_id") for r in rows if r.get("resource_id")}
                _sync_removed_state(db, account, resource_type, current_ids, today)
            _upsert_metric_samples(db, account, data.cpu_metrics)
            _upsert_daily_costs(db, account, data.daily_costs)
            db.commit()

            scan_run.status = ScanStatus.SUCCESS
            scan_run.resources_scanned = resources_scanned
            if data.errors:
                scan_run.error_message = "; ".join(f"{k}: {v[:200]}" for k, v in data.errors.items())
            scan_run.completed_at = datetime.now(timezone.utc)
            db.commit()

            analysis_service.run_all_analyses(db, account.customer_id, account.id)
        except Exception as exc:  # noqa: BLE001
            db.rollback() 
            logger.exception("Scan failed for account %s", aws_account_id)
            scan_run.status = ScanStatus.FAILED
            scan_run.error_message = str(exc)[:4000]
            scan_run.completed_at = datetime.now(timezone.utc)
            db.commit()
            raise
    finally:
        db.close()
        request_id_var.reset(token)
def run_all_accounts_scan_task():
    """Fan-out entry point for the nightly cron (see celery beat_schedule
    in app.tasks.celery_app): enqueues one scan per validated account
    rather than scanning them serially in a single task."""
    db = SyncSessionLocal()
    try:
        account_ids = db.execute(
            select(AwsAccount.id).where(AwsAccount.validation_status == ValidationStatus.VALID)
        ).scalars().all()
        for account_id in account_ids:
            run_account_scan_task.delay(str(account_id))
        logger.info("Enqueued nightly scan for %d accounts", len(account_ids))
        return len(account_ids)
    finally:
        db.close()

def _sync_removed_state(db: Session, account, resource_type: str, current_ids: set[str], today: date) -> None:
    """Anything of this resource_type that was known before today but
    isn't in today's scan results is gone from AWS -- stamp removed_at
    (once) on its most recent row. Also clears removed_at if an id
    reappears (recreated with the same id)."""
    prior_ids = {
        r[0] for r in db.execute(
            select(ResourceSnapshot.resource_id).where(
                ResourceSnapshot.aws_account_id == account.id,
                ResourceSnapshot.resource_type == resource_type,
                ResourceSnapshot.snapshot_date < today,
            ).distinct()
        ).all()
    }
    newly_missing = prior_ids - current_ids
    for resource_id in newly_missing:
        latest = db.execute(
            select(ResourceSnapshot).where(
                ResourceSnapshot.aws_account_id == account.id,
                ResourceSnapshot.resource_type == resource_type,
                ResourceSnapshot.resource_id == resource_id,
            ).order_by(ResourceSnapshot.snapshot_date.desc()).limit(1)
        ).scalar_one_or_none()
        if latest and latest.removed_at is None:
            latest.removed_at = datetime.now(timezone.utc)

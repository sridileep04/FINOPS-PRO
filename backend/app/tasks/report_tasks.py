import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.request_context import request_id_var
from app.models.aws_account import AwsAccount
from app.models.report import Report, ReportStatus
from app.services import steampipe_client
from app.services.cost_queries import get_query_for_report
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)

# Celery workers use a plain sync engine/session -- simpler than bridging
# async SQLAlchemy into a sync task runner.
_engine = create_engine(settings.SYNC_DATABASE_URL, pool_pre_ping=True)
SyncSessionLocal = sessionmaker(bind=_engine)


@celery_app.task(name="reports.run_report", bind=True, max_retries=2, default_retry_delay=30)
def run_report_task(self, report_id: str):
    # Tag every log line and every downstream steampipe-service call for
    # this task with the report ID, so a support engineer can grep one
    # ID across both services' logs.
    token = request_id_var.set(f"report-{report_id}")
    db: Session = SyncSessionLocal()
    try:
        report: Report | None = db.get(Report, report_id)
        if report is None:
            logger.error("Report %s not found", report_id)
            return

        account: AwsAccount | None = db.get(AwsAccount, report.aws_account_id)
        if account is None:
            report.status = ReportStatus.FAILED
            report.error_message = "Linked AWS account no longer exists"
            report.completed_at = datetime.now(timezone.utc)
            db.commit()
            return

        report.status = ReportStatus.RUNNING
        report.started_at = datetime.now(timezone.utc)
        db.commit()

        try:
            if report.report_type.value == "custom_query":
                sql = report.params.get("sql") if report.params else None
                if not sql:
                    raise ValueError("custom_query report requires params.sql")
            else:
                sql = get_query_for_report(report.report_type, report.params)

            rows = asyncio.run(steampipe_client.run_query(account, sql))

            report.status = ReportStatus.SUCCESS
            report.result = {"row_count": len(rows), "rows": rows}
        except Exception as exc:  # noqa: BLE001 - persist any failure onto the report row
            logger.exception("Report %s failed", report_id)
            report.status = ReportStatus.FAILED
            report.error_message = str(exc)[:4000]
        finally:
            report.completed_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()
        request_id_var.reset(token)

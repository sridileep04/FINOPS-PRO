import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.report import Report, ReportStatus, ReportType
from app.tasks.report_tasks import run_report_task


async def create_and_enqueue_report(
    db: AsyncSession,
    customer_id: uuid.UUID,
    aws_account_id: uuid.UUID,
    report_type: ReportType,
    params: dict | None = None,
) -> Report:
    report = Report(
        customer_id=customer_id,
        aws_account_id=aws_account_id,
        report_type=report_type,
        status=ReportStatus.PENDING,
        params=params,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    async_result = run_report_task.delay(str(report.id))
    report.celery_task_id = async_result.id
    await db.commit()
    await db.refresh(report)
    return report

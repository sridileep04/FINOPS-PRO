import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.aws_account import AwsAccount
from app.models.finding import Finding, FindingSeverity, FindingStatus, FindingType
from app.models.scan_run import ScanRun
from app.models.user import User
from app.services import analysis_service
from app.tasks.scan_tasks import run_account_scan_task

router = APIRouter(prefix="/aws-accounts", tags=["insights"])


async def _get_owned_account(db: AsyncSession, user: User, account_id: uuid.UUID) -> AwsAccount:
    result = await db.execute(
        select(AwsAccount).where(AwsAccount.id == account_id, AwsAccount.customer_id == user.customer_id)
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=404, detail="AWS account not found")
    return account


@router.post("/{account_id}/scan", status_code=202)
async def trigger_scan(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Manually kicks off the same inventory+metrics+cost sweep that runs
    automatically every night at 02:00 UTC for every validated account."""
    await _get_owned_account(db, user, account_id)
    async_result = run_account_scan_task.delay(str(account_id))
    return {"task_id": async_result.id, "status": "queued"}


@router.get("/{account_id}/scans")
async def list_scans(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_account(db, user, account_id)
    result = await db.execute(
        select(ScanRun).where(ScanRun.aws_account_id == account_id).order_by(ScanRun.started_at.desc()).limit(30)
    )
    scans = result.scalars().all()
    return [
        {
            "id": s.id, "status": s.status, "resources_scanned": s.resources_scanned,
            "error_message": s.error_message, "started_at": s.started_at, "completed_at": s.completed_at,
        }
        for s in scans
    ]


@router.get("/{account_id}/findings")
async def list_findings(
    account_id: uuid.UUID,
    finding_type: FindingType | None = Query(None),
    severity: FindingSeverity | None = Query(None),
    finding_status: FindingStatus = Query(FindingStatus.OPEN),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Underutilized/rightsizing, orphaned resources, security issues,
    night-shutdown candidates, and cost anomalies all come back from this
    one endpoint -- filter with `finding_type` to split them out."""
    await _get_owned_account(db, user, account_id)

    stmt = select(Finding).where(Finding.aws_account_id == account_id, Finding.status == finding_status)
    if finding_type:
        stmt = stmt.where(Finding.finding_type == finding_type)
    if severity:
        stmt = stmt.where(Finding.severity == severity)
    stmt = stmt.order_by(Finding.severity.desc(), Finding.last_seen_at.desc()).limit(500)

    result = await db.execute(stmt)
    findings = result.scalars().all()
    return [
        {
            "id": f.id, "finding_type": f.finding_type, "severity": f.severity, "status": f.status,
            "resource_id": f.resource_id, "resource_type": f.resource_type,
            "title": f.title, "description": f.description, "recommendation": f.recommendation,
            "estimated_monthly_savings_usd": float(f.estimated_monthly_savings_usd) if f.estimated_monthly_savings_usd is not None else None,
            "details": f.details, "first_detected_at": f.first_detected_at, "last_seen_at": f.last_seen_at,
        }
        for f in findings
    ]


@router.post("/{account_id}/findings/{finding_id}/resolve")
async def resolve_finding(
    account_id: uuid.UUID,
    finding_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_account(db, user, account_id)
    result = await db.execute(
        select(Finding).where(Finding.id == finding_id, Finding.aws_account_id == account_id)
    )
    finding = result.scalar_one_or_none()
    if finding is None:
        raise HTTPException(status_code=404, detail="Finding not found")
    finding.status = FindingStatus.RESOLVED
    await db.commit()
    return {"status": "resolved"}


@router.get("/{account_id}/cost-forecast")
async def get_cost_forecast(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Month-to-date spend, extrapolated to month end, overall and per
    service. Backed by the daily_costs table populated by the nightly scan."""
    await _get_owned_account(db, user, account_id)

    return await db.run_sync(lambda sync_session: analysis_service.predict_month_end_cost(sync_session, account_id))


@router.get("/{account_id}/resources/new")
async def get_new_resources(
    account_id: uuid.UUID,
    on_date: date = Query(default_factory=date.today, alias="date"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Resources first seen created on `date` (defaults to today), each
    with an estimated cost contribution for the rest of the month --
    exactly the "what got created today, and what will it cost us by
    month end" view."""
    await _get_owned_account(db, user, account_id)

    return await db.run_sync(lambda sync_session: analysis_service.list_resources_created_on(sync_session, account_id, on_date))

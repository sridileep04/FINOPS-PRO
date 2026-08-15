import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.rate_limit import rate_limit_custom_query
from app.db.session import get_db
from app.models.aws_account import AwsAccount
from app.models.report import Report, ReportType
from app.models.user import User
from app.schemas.report import CustomQueryCreate, ReportCreate, ReportOut
from app.services.report_service import create_and_enqueue_report

router = APIRouter(prefix="/reports", tags=["reports"])

# Custom queries must be a single, read-only SELECT statement. Steampipe's
# postgres foreign tables are inherently read-only for AWS resources, but
# this blocks obviously dangerous statements (multiple statements, writes
# against steampipe's own catalog, etc.) before we ever spawn a process.
_DISALLOWED_KEYWORDS = re.compile(
    r"\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|vacuum)\b", re.IGNORECASE
)


async def _get_owned_account(db: AsyncSession, user: User, account_id: uuid.UUID) -> AwsAccount:
    result = await db.execute(
        select(AwsAccount).where(AwsAccount.id == account_id, AwsAccount.customer_id == user.customer_id)
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=404, detail="AWS account not found")
    return account


@router.post("", response_model=ReportOut, status_code=status.HTTP_202_ACCEPTED)
async def create_report(
    payload: ReportCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_account(db, user, payload.aws_account_id)
    report = await create_and_enqueue_report(
        db, user.customer_id, payload.aws_account_id, payload.report_type, payload.params
    )
    return report


@router.post(
    "/custom-query", response_model=ReportOut, status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(rate_limit_custom_query)],
)
async def create_custom_query_report(
    payload: CustomQueryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_account(db, user, payload.aws_account_id)

    sql = payload.sql.strip().rstrip(";")
    if len(sql) > settings.MAX_CUSTOM_QUERY_LENGTH:
        raise HTTPException(status_code=422, detail=f"Query exceeds max length of {settings.MAX_CUSTOM_QUERY_LENGTH} characters")
    if ";" in sql:
        raise HTTPException(status_code=422, detail="Only a single statement is allowed")
    if not sql.lower().startswith("select") and not sql.lower().startswith("with"):
        raise HTTPException(status_code=422, detail="Only SELECT queries are allowed")
    if _DISALLOWED_KEYWORDS.search(sql):
        raise HTTPException(status_code=422, detail="Query contains a disallowed keyword")

    report = await create_and_enqueue_report(
        db, user.customer_id, payload.aws_account_id, ReportType.CUSTOM_QUERY, {"sql": sql}
    )
    return report


@router.get("", response_model=list[ReportOut])
async def list_reports(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Report).where(Report.customer_id == user.customer_id).order_by(Report.created_at.desc()).limit(200)
    )
    return result.scalars().all()


@router.get("/{report_id}", response_model=ReportOut)
async def get_report(report_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Report).where(Report.id == report_id, Report.customer_id == user.customer_id)
    )
    report = result.scalar_one_or_none()
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return report

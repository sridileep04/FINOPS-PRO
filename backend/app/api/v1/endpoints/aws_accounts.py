import asyncio
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_admin, get_current_user
from app.db.session import get_db
from app.models.aws_account import AwsAccount, ValidationStatus
from app.models.user import User
from app.schemas.aws_account import AwsAccountCreate, AwsAccountOut
from app.services import permission_check_service, steampipe_client
from app.services.aws_credential_service import build_account_kwargs
logger = logging.getLogger(__name__) 

router = APIRouter(prefix="/aws-accounts", tags=["aws-accounts"])


async def _get_owned_account(db: AsyncSession, user: User, account_id: uuid.UUID) -> AwsAccount:
    result = await db.execute(
        select(AwsAccount).where(AwsAccount.id == account_id, AwsAccount.customer_id == user.customer_id)
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=404, detail="AWS account not found")
    return account


@router.post("", response_model=AwsAccountOut, status_code=status.HTTP_201_CREATED)
async def create_aws_account(
    payload: AwsAccountCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_admin),
):
    """Accepts either of the 2 UI options: cross_account_role or
    access_keys (see AwsAccountCreate for the fields each requires).

    Right after creation, a background task runs both the connectivity
    check (`steampipe_client.validate_account`) and the full permission
    probe (`permission_check_service.run_permission_check`), so by the
    time the frontend polls GET /{id} or GET /{id}/permissions, the
    "does this work, and what does it let us do" answer is ready.
    """
    try:
        kwargs = build_account_kwargs(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    account = AwsAccount(customer_id=user.customer_id, **kwargs)
    db.add(account)
    await db.commit()
    await db.refresh(account)
    logger.info("Created new AWS account %s for customer %s", account.id, user.customer_id)

    background_tasks.add_task(_validate_and_check_permissions_background, str(account.id))
    return account


async def _validate_and_check_permissions_background(account_id: str) -> None:
    # Runs in its own short-lived DB session since BackgroundTasks execute
    # after the request's session dependency has already been closed.
    from app.db.session import AsyncSessionLocal
    logger.info("Background permission check for account %s starting", account_id)
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(AwsAccount).where(AwsAccount.id == uuid.UUID(account_id)))
        account = result.scalar_one_or_none()
        if account is None:
            logger.warning("Account %s not found for background permission check", account_id)
            return

        ok, message = await steampipe_client.validate_account(account)
        account.validation_status = ValidationStatus.VALID if ok else ValidationStatus.INVALID
        account.validation_message = message
        account.last_validated_at = datetime.now(timezone.utc)
        logger.info("Background validation for account %s: %s :%s", account_id, message,ok)
        # permission_check_service uses boto3 (sync) -- run it off the
        # event loop thread so we don't block other requests.
        report = await asyncio.to_thread(permission_check_service.run_permission_check, account)
        logger.info("Background permission check for account %s: %s", account_id, report)
        account.permission_report = report
        account.permission_checked_at = datetime.now(timezone.utc)

        await db.commit()


@router.get("", response_model=list[AwsAccountOut])
async def list_aws_accounts(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(AwsAccount).where(AwsAccount.customer_id == user.customer_id))
    return result.scalars().all()


@router.get("/{account_id}", response_model=AwsAccountOut)
async def get_aws_account(account_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await _get_owned_account(db, user, account_id)


@router.post("/{account_id}/validate", response_model=AwsAccountOut)
async def revalidate_aws_account(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_admin),
):
    account = await _get_owned_account(db, user, account_id)
    ok, message = await steampipe_client.validate_account(account)
    account.validation_status = ValidationStatus.VALID if ok else ValidationStatus.INVALID
    account.validation_message = message
    account.last_validated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(account)
    return account


@router.post("/{account_id}/permissions/check")
async def check_account_permissions(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_admin),
):
    """Runs the full capability probe synchronously (a handful of cheap,
    read-only AWS calls -- typically 2-5 seconds) and returns the report
    directly, so the frontend can render "here's exactly what you gave us
    access to" right after the customer submits credentials, without
    polling. Also updates the account's stored validation status."""
    account = await _get_owned_account(db, user, account_id)
    report = await asyncio.to_thread(permission_check_service.run_permission_check, account)

    account.permission_report = report
    account.permission_checked_at = datetime.now(timezone.utc)
    if report["overall_status"] == "connection_failed":
        account.validation_status = ValidationStatus.INVALID
    else:
        account.validation_status = ValidationStatus.VALID
    account.validation_message = report.get("trust_check", {}).get("message")
    account.last_validated_at = datetime.now(timezone.utc)
    await db.commit()

    return report


@router.get("/{account_id}/permissions")
async def get_account_permissions(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    account = await _get_owned_account(db, user, account_id)
    if account.permission_report is None:
        raise HTTPException(
            status_code=404,
            detail="Permissions haven't been checked yet -- POST /{account_id}/permissions/check first",
        )
    return {"checked_at": account.permission_checked_at, **account.permission_report}


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_aws_account(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_admin),
):
    account = await _get_owned_account(db, user, account_id)
    await db.delete(account)
    await db.commit()

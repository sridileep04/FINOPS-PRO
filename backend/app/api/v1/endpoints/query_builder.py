import logging
import re
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_current_user
from app.core.rate_limit import rate_limit_custom_query
from app.db.session import get_db
from app.models.aws_account import AwsAccount, ValidationStatus
from app.models.user import User
from app.schemas.query_builder import QueryExecuteRequest, QueryExecuteResponse
from app.services import bff_helpers as bh
from app.services import query_builder_catalog as catalog
from app.services import query_builder_sandbox, query_builder_service, steampipe_client
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/query-builder", tags=["query-builder"])

# The underlying engine's own name/hostname must never reach the client --
# only its user-facing product name should. Any exception text on its way
# out gets scrubbed through this first; the raw message is still logged
# server-side in full for debugging.
_ENGINE_NAME_RE = re.compile(r"steampipe(-service)?", re.IGNORECASE)


def _public_error(message: str) -> str:
    return _ENGINE_NAME_RE.sub("cloud query engine", message)


@router.get("/catalog")
async def get_catalog(user: User = Depends(get_current_user)):
    return catalog.catalog_payload()


@router.get("/accounts")
async def list_queryable_accounts(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if getattr(user, "is_sandbox", False):
        return [{
            "id": "sandbox-account",
            "label": "Sandbox Demo Account",
            "region": "us-east-1",
            "status": "valid",
        }]

    accounts = await bh.get_customer_accounts(db, user.customer_id)
    return [
        {
            "id": str(a.id),
            "label": a.account_name,
            "region": a.default_region,
            "status": a.validation_status.value if a.validation_status else "pending",
        }
        for a in accounts
    ]


async def _get_owned_account(db: AsyncSession, user: User, account_id: uuid.UUID) -> AwsAccount:
    accounts = await bh.get_customer_accounts(db, user.customer_id)
    for a in accounts:
        if a.id == account_id:
            return a
    raise HTTPException(status_code=404, detail="AWS account not found")


@router.post("/execute", response_model=QueryExecuteResponse, dependencies=[Depends(rate_limit_custom_query)])
async def execute_query(
    payload: QueryExecuteRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        built = query_builder_service.build_query(
            service_key=payload.service,
            column_keys=payload.columns,
            conditions=[c.model_dump() for c in payload.conditions],
            match=payload.match,
            order_by=payload.order_by,
            order_dir=payload.order_dir,
            limit=payload.limit,
        )
    except query_builder_service.QueryBuilderError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    start = time.monotonic()

    if getattr(user, "is_sandbox", False):
        rows = query_builder_sandbox.run_sandbox_query(
            payload.service,
            [c["key"] for c in built.columns],
            [c.model_dump() for c in payload.conditions],
            payload.match,
            min(payload.limit or query_builder_service.DEFAULT_LIMIT, query_builder_service.MAX_LIMIT),
        )
        execution_ms = int((time.monotonic() - start) * 1000)
        return QueryExecuteResponse(
            sql=built.sql,
            columns=built.columns,
            rows=rows,
            row_count=len(rows),
            truncated=False,
            execution_ms=execution_ms,
            account_label="Sandbox Demo Account",
            is_sandbox=True,
        )

    accounts = await bh.get_customer_accounts(db, user.customer_id)
    if not accounts:
        raise HTTPException(
            status_code=409,
            detail="No AWS account connected yet -- add one under Integrations before running a live query.",
        )

    if payload.account_id:
        account = await _get_owned_account(db, user, payload.account_id)
    else:
        valid = [a for a in accounts if a.validation_status == ValidationStatus.VALID]
        account = valid[0] if valid else accounts[0]

    try:
        rows = await steampipe_client.run_query(account, built.sql)
    except steampipe_client.SteampipeQueryTimeout as exc:
        logger.warning("Query Studio timed out for account %s: %s", account.id, exc)
        raise HTTPException(status_code=504, detail=_public_error(str(exc))) from exc
    except steampipe_client.SteampipeError as exc:
        logger.warning("Query Studio execution failed for account %s: %s", account.id, exc)
        raise HTTPException(status_code=502, detail=_public_error(str(exc))) from exc

    execution_ms = int((time.monotonic() - start) * 1000)
    limit = min(payload.limit or query_builder_service.DEFAULT_LIMIT, query_builder_service.MAX_LIMIT)

    return QueryExecuteResponse(
        sql=built.sql,
        columns=built.columns,
        rows=rows,
        row_count=len(rows),
        truncated=len(rows) >= limit,
        execution_ms=execution_ms,
        account_label=account.account_name,
        is_sandbox=False,
    )
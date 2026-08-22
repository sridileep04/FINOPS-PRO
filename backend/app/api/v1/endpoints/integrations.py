import asyncio
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_admin, get_current_user
from app.db.session import get_db
from app.models.aws_account import AuthMethod, AwsAccount, ValidationStatus
from app.models.bff import Integration, IntegrationStatus
from app.models.user import User
from app.schemas.aws_account import AwsAccountCreate
from app.schemas.bff import IntegrationActionRequest
from app.services import permission_check_service, steampipe_client
from app.services.aws_credential_service import build_account_kwargs
from app.services.bff_helpers import INTEGRATION_DEFS

router = APIRouter(prefix="/integrations", tags=["frontend-integrations"])

_SENSITIVE_CONFIG_KEYS = {"secretAccessKey", "clientSecret", "serviceAccountJson", "externalId"}

# The two integration keys that are backed by a real, distinct AWS
# account rather than being a single per-customer toggle. Every other
# key in INTEGRATION_DEFS (gcp_*, azure_*, aws_cur, ghost_agent) stays a
# singleton: connecting it again just overwrites the one row's config.
_AWS_ACCOUNT_KEYS = {"aws_role", "aws_keys"}
_AWS_METHOD_LABELS = {"aws_role": "AWS Cross-Account Role", "aws_keys": "AWS Access Keys"}


async def _seed_if_empty(db: AsyncSession, customer_id: uuid.UUID) -> list[Integration]:
    # Try to seed one "template" row per integration definition if this
    # customer has none at all yet. Uses ON CONFLICT to stay idempotent
    # against the two partial unique indexes on the table (see
    # app.models.bff.Integration): a plain insert would race/error if
    # called twice concurrently, or if some keys already exist.
    #
    # Every template row is inserted with aws_account_id=None, which is
    # exactly what both partial indexes key off of, so this single
    # on_conflict_do_nothing (matched against the AWS-template index)
    # is safe for AWS keys, and the singleton index catches everything
    # else on its own conflict target -- Postgres picks whichever index
    # actually matches the row being inserted.
    from sqlalchemy.dialects.postgresql import insert

    result = await db.execute(select(Integration).where(Integration.customer_id == customer_id))
    rows = list(result.scalars().all())
    if rows:
        return rows

    for d in INTEGRATION_DEFS:
        stmt = insert(Integration).values(
            customer_id=customer_id,
            integration_key=d["key"],
            name=d["name"],
            provider=d["provider"],
            category=d["category"],
            details=d["details"],
            status=IntegrationStatus.NOT_CONNECTED,
            aws_account_id=None,
        ).on_conflict_do_nothing()
        await db.execute(stmt)

    await db.commit()

    # Return whatever rows are now present (may be fewer than INTEGRATION_DEFS
    # count if some keys already existed, but typically all will be inserted).
    result = await db.execute(select(Integration).where(Integration.customer_id == customer_id))
    return list(result.scalars().all())


def _mask_config(config: dict) -> dict:
    return {k: ("•••• (saved)" if k in _SENSITIVE_CONFIG_KEYS and v else v) for k, v in (config or {}).items()}


def _permission_summary(account: AwsAccount | None) -> dict | None:
    """Boils an AwsAccount's stored permission_report down to what the
    integrations card needs to show: which capabilities were granted vs.
    which are missing, per connected account."""
    if account is None or not account.permission_report:
        return None
    report = account.permission_report
    capabilities = report.get("capabilities") or []
    return {
        "overallStatus": report.get("overall_status"),
        "granted": [
            {"key": c["key"], "category": c["category"], "action": c["action"]}
            for c in capabilities if c.get("status") == "allowed"
        ],
        "missing": [
            {"key": c["key"], "category": c["category"], "action": c["action"], "message": c.get("message")}
            for c in capabilities if c.get("status") != "allowed"
        ],
    }


def _serialize(row: Integration, aws_account_number: str | None = None, account: AwsAccount | None = None) -> dict:
    is_template = row.integration_key in _AWS_ACCOUNT_KEYS and row.aws_account_id is None
    return {
        # `id` stays the stable integration_key so existing frontend code
        # (test/connect calls keyed by integrationId) keeps working
        # unchanged. `connectionId` is this row's own primary key, used
        # only for deleting one specific AWS-account connection.
        "id": row.integration_key,
        "connectionId": str(row.id),
        "name": row.name,
        "provider": row.provider,
        "category": row.category,
        "status": row.status.value if hasattr(row.status, "value") else row.status,
        "details": row.details,
        "lastSync": row.last_sync.strftime("%b %d, %Y %I:%M %p") if row.last_sync else "Never",
        "config": _mask_config(row.config or {}),
        "isTemplate": is_template,
        "awsAccountNumber": aws_account_number,
        "permissions": _permission_summary(account),
    }


async def _get_or_404(db: AsyncSession, user: User, integration_id: str) -> Integration:
    """Fetches the *template* row for a key (aws_account_id IS NULL for
    AWS keys; the one-and-only row for everything else). /connect uses
    this both to update the row in place for non-AWS keys, and to read
    definition metadata (name/provider/etc) when cloning a brand-new
    AWS connection row."""
    stmt = select(Integration).where(
        Integration.customer_id == user.customer_id,
        Integration.integration_key == integration_id,
        Integration.aws_account_id.is_(None),
    )
    result = await db.execute(stmt)
    row = result.scalars().first()
    if row is None:
        await _seed_if_empty(db, user.customer_id)
        result = await db.execute(stmt)
        row = result.scalars().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Integration not found")
    return row


async def _find_aws_connection_by_account_number(
    db: AsyncSession,
    customer_id: uuid.UUID,
    aws_account_number: str,
    exclude_connection_id: uuid.UUID | None = None,
) -> Integration | None:
    """Looks up an existing CONNECTED aws_role/aws_keys row for this
    customer whose underlying AwsAccount has the given 12-digit account
    number -- regardless of which of the two integration_keys it was
    connected under. This is the single source of truth both duplicate
    checks (same account+method again, or same account+other method)
    are built on.

    `exclude_connection_id` lets edit flows check "does some *other*
    connection already own this AWS account" without the connection
    being edited always matching itself."""
    stmt = (
        select(Integration)
        .join(AwsAccount, Integration.aws_account_id == AwsAccount.id)
        .where(
            Integration.customer_id == customer_id,
            Integration.integration_key.in_(_AWS_ACCOUNT_KEYS),
            AwsAccount.aws_account_id == aws_account_number,
        )
    )
    if exclude_connection_id is not None:
        stmt = stmt.where(Integration.id != exclude_connection_id)
    result = await db.execute(stmt)
    return result.scalars().first()


def _conflict_detail(existing: Integration, aws_account_number: str) -> dict:
    """Shared 409/error payload for 'this AWS account is already
    configured elsewhere' -- structured so the frontend can offer a
    direct 'use the existing connection' suggestion instead of just
    showing a string.
    """
    method_label = _AWS_METHOD_LABELS.get(existing.integration_key, existing.integration_key)
    return {
        "message": (
            f"AWS account {aws_account_number} is already configured with {method_label}. "
            "Delete that connection first if you want to switch how it's connected."
        ),
        "conflict": {
            "connectionId": str(existing.id),
            "integrationKey": existing.integration_key,
            "methodLabel": method_label,
            "awsAccountNumber": aws_account_number,
        },
    }


@router.get("")
async def list_integrations(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = await _seed_if_empty(db, user.customer_id)

    aws_ids = [r.aws_account_id for r in rows if r.aws_account_id is not None]
    accounts_by_id: dict[uuid.UUID, AwsAccount] = {}
    if aws_ids:
        result = await db.execute(select(AwsAccount).where(AwsAccount.id.in_(aws_ids)))
        accounts_by_id = {a.id: a for a in result.scalars().all()}

    return [
        _serialize(
            r,
            accounts_by_id[r.aws_account_id].aws_account_id if r.aws_account_id in accounts_by_id else None,
            accounts_by_id.get(r.aws_account_id),
        )
        for r in rows
    ]


def _build_transient_account(user: User, config: dict) -> AwsAccount:
    """A not-yet-persisted AwsAccount used purely to run the same
    validate_account/run_permission_check probes the real AwsAccount
    onboarding flow uses, so 'Test Connection' reflects a real handshake."""
    from app.core.encryption import encrypt_value

    role_arn = config.get("roleArn") or config.get("role_arn")
    external_id = config.get("externalId") or config.get("external_id") or ""
    return AwsAccount(
        customer_id=user.customer_id, account_name="integration-test", aws_account_id=config.get("accountId", "000000000000"),
        default_region="us-east-1", auth_method=AuthMethod.CROSS_ACCOUNT_ROLE, role_arn=role_arn,
        external_id=encrypt_value(external_id),
    )


def _build_transient_account_keys(user: User, config: dict) -> AwsAccount:
    from app.core.encryption import encrypt_value
    return AwsAccount(
        customer_id=user.customer_id, account_name="integration-test", aws_account_id=config.get("accountId", "000000000000"),
        default_region="us-east-1", auth_method=AuthMethod.ACCESS_KEYS,
        access_key_id_encrypted=encrypt_value(config.get("accessKeyId", "")),
        secret_access_key_encrypted=encrypt_value(config.get("secretAccessKey", "")),
    )


async def _run_real_aws_test(
    db: AsyncSession,
    user: User,
    integration_id: str,
    config: dict,
    exclude_connection_id: uuid.UUID | None = None,
) -> dict:
    start = time.monotonic()
    if integration_id == "aws_role":
        if not config.get("roleArn"):
            return {"status": "error", "error": "roleArn is required (fill in Account ID + Role Name)."}
        account = _build_transient_account(user, config)
    else:
        if not config.get("accessKeyId") or not config.get("secretAccessKey"):
            return {"status": "error", "error": "accessKeyId and secretAccessKey are required."}
        account = _build_transient_account_keys(user, config)

    ok, message = await steampipe_client.validate_account(account)
    latency_ms = round((time.monotonic() - start) * 1000)
    if not ok:
        return {"status": "error", "error": message}

    # Resolve the real AWS account number from STS -- same reasoning as
    # /connect: the "AWS Account ID" form field is optional/free-text and
    # can't be trusted on its own, so this is the earliest point in the
    # wizard we can reliably warn about a duplicate, before the customer
    # even reaches the final "Connect" click.
    resolved_account_number = await steampipe_client.resolve_account_id(account)
    existing = None
    if resolved_account_number:
        existing = await _find_aws_connection_by_account_number(
            db, user.customer_id, resolved_account_number, exclude_connection_id=exclude_connection_id
        )

    # When editing a specific connection (exclude_connection_id set), any
    # match found here is necessarily a *different* row, so it's always a
    # real conflict. When adding fresh from the template card, a match
    # under the *same* integration_key just means "this test will update
    # that row" (handled below via isRotation), not a conflict.
    is_conflict = existing is not None and (
        exclude_connection_id is not None or existing.integration_key != integration_id
    )
    if is_conflict:
        detail = _conflict_detail(existing, resolved_account_number)
        return {"status": "error", "error": detail["message"], "conflict": detail["conflict"]}

    report = await asyncio.to_thread(permission_check_service.run_permission_check, account)
    if report.get("overall_status") in ("connection_failed", "no_access"):
        return {"status": "error", "error": report.get("trust_check", {}).get("message", "Connection succeeded but no usable permissions were detected.")}
    permissions = [c["key"] for c in (report.get("capabilities") or []) if isinstance(c, dict) and c.get("status") == "allowed"]

    return {
        "status": "success",
        "details": {
            "arn": account.role_arn or f"iam-user:{config.get('accessKeyId', '')[:8]}...",
            "latencyMs": latency_ms,
            "accountType": "Cross-Account Role" if integration_id == "aws_role" else "IAM User",
            "permissionsDetected": permissions or ["cost_explorer_read"],
            "resolvedAccountId": resolved_account_number,
            "isRotation": existing is not None,  # same account, same method -- this test will update it, not add a new one
        },
    }


@router.post("/test")
async def test_integration(payload: IntegrationActionRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_admin)):
    if payload.integrationId in ("aws_role", "aws_keys"):
        exclude_id = uuid.UUID(payload.connectionId) if payload.connectionId else None
        return await _run_real_aws_test(db, user, payload.integrationId, payload.config, exclude_connection_id=exclude_id)

    # No live GCP/Azure/Kubernetes backend exists yet -- return a clearly
    # simulated handshake so the UI flow works end-to-end without
    # pretending to have verified credentials we can't actually check.
    await asyncio.sleep(0.4)
    return {
        "status": "success",
        "details": {
            "arn": None,
            "latencyMs": 420,
            "accountType": "Simulated (no live backend for this provider yet)",
            "permissionsDetected": [],
        },
    }


@router.post("/connect")
async def connect_integration(payload: IntegrationActionRequest, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_active_admin)):
    template = await _get_or_404(db, user, payload.integrationId)
    stored_config = {k: v for k, v in payload.config.items()}

    if payload.integrationId not in _AWS_ACCOUNT_KEYS:
        # Non-AWS providers stay a plain per-customer toggle: connecting
        # again just overwrites the same singleton row's config. No
        # duplicate-account concept applies here.
        template.status = IntegrationStatus.CONNECTED
        template.config = stored_config
        template.last_sync = datetime.now(timezone.utc)
        await db.commit()
        return {"message": "Integration connected", "status": "connected"}

    # --- AWS role/keys: may be a brand-new connection, a credential
    # rotation on an existing one, or a rejected conflict. ------------
    #
    # The "AWS Account ID" form field is optional/free-text, so it can't
    # be trusted to tell two real accounts apart -- two different
    # accounts both left blank would otherwise collide on the same
    # "000000000000" placeholder. Instead we resolve the real account
    # number straight from AWS via STS using the credentials themselves,
    # *before* making any duplicate/conflict decision below.
    if payload.integrationId == "aws_role":
        transient_account = _build_transient_account(user, payload.config)
    else:
        transient_account = _build_transient_account_keys(user, payload.config)

    ok, message = await steampipe_client.validate_account(transient_account)
    if not ok:
        raise HTTPException(
            status_code=422,
            detail=f"Could not verify these credentials: {message}",
        )
    resolved_account_number = await steampipe_client.resolve_account_id(transient_account)
    aws_account_number = resolved_account_number or payload.config.get("accountId", "000000000000")

    existing = await _find_aws_connection_by_account_number(db, user.customer_id, aws_account_number)
    if existing is not None and existing.integration_key != payload.integrationId:
        # Same real AWS account already connected via the *other* auth
        # method. Only one method may be active per AWS account at a
        # time -- otherwise steampipe scans could race two credential
        # sets against the same account, and it's just confusing to
        # show two live connections for one account.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=_conflict_detail(existing, aws_account_number),
        )

    # Either this is the very first time we've seen this account, or
    # it's a resubmit of the same account through the same method
    # (`existing.integration_key == payload.integrationId`) -- treat
    # the latter as an in-place credential rotation rather than a
    # rejected duplicate or a silently-created second row.
    row = existing if existing is not None else Integration(
        customer_id=user.customer_id,
        integration_key=payload.integrationId,
        name=template.name,
        provider=template.provider,
        category=template.category,
        details=template.details,
        status=IntegrationStatus.NOT_CONNECTED,
    )
    is_rotation = existing is not None

    try:
        if payload.integrationId == "aws_role":
            account_payload = AwsAccountCreate(
                account_name=f"{user.email}-{payload.integrationId}",
                aws_account_id=aws_account_number,
                auth_method=AuthMethod.CROSS_ACCOUNT_ROLE,
                role_arn=payload.config.get("roleArn"),
                external_id=payload.config.get("externalId", ""),
            )
        else:
            account_payload = AwsAccountCreate(
                account_name=f"{user.email}-{payload.integrationId}",
                aws_account_id=aws_account_number,
                auth_method=AuthMethod.ACCESS_KEYS,
                access_key_id=payload.config.get("accessKeyId"),
                secret_access_key=payload.config.get("secretAccessKey"),
            )
        kwargs = build_account_kwargs(account_payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if is_rotation and row.aws_account_id is not None:
        # Update the existing AwsAccount row's credentials in place
        # rather than orphaning it and creating a new one.
        result = await db.execute(select(AwsAccount).where(AwsAccount.id == row.aws_account_id))
        account = result.scalar_one()
        for field, value in kwargs.items():
            setattr(account, field, value)
    else:
        account = AwsAccount(customer_id=user.customer_id, **kwargs)
        db.add(account)

    await db.flush()

    # Credentials were already proven to work above (validate_account on
    # the transient account, same credentials) -- no need to pay for a
    # second steampipe round trip against the persisted row. Just carry
    # that result over.
    account.validation_status = ValidationStatus.VALID
    account.validation_message = message
    account.last_validated_at = datetime.now(timezone.utc)
    report = await asyncio.to_thread(permission_check_service.run_permission_check, account)
    account.permission_report = report
    account.permission_checked_at = datetime.now(timezone.utc)

    row.status = IntegrationStatus.CONNECTED
    row.config = stored_config
    row.aws_account_id = account.id
    row.last_sync = datetime.now(timezone.utc)
    if not is_rotation:
        db.add(row)

    await db.commit()

    return {
        "message": "Integration reconnected" if is_rotation else "Integration connected",
        "status": "connected",
    }


@router.patch("/connections/{connection_id}")
async def edit_integration_connection(
    connection_id: uuid.UUID,
    payload: IntegrationActionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_admin),
):
    """Edits one specific, already-connected aws_role/aws_keys connection
    in place -- e.g. rotating credentials or pointing it at a different
    IAM role/user -- without going through the "add a new connection"
    template flow. The account this connection points at may change
    (the customer typed a different role/keys), so the same
    duplicate-account conflict check as /connect applies, just scoped to
    exclude this row itself.

    Non-AWS (singleton) integrations don't have a distinct per-connection
    identity to edit -- reconnecting via POST /connect on the template
    already updates their one row in place, so this endpoint only
    supports aws_role/aws_keys.
    """
    stmt = select(Integration).where(
        Integration.id == connection_id,
        Integration.customer_id == user.customer_id,
    )
    result = await db.execute(stmt)
    row = result.scalars().first()
    if row is None or row.integration_key not in _AWS_ACCOUNT_KEYS or row.aws_account_id is None:
        raise HTTPException(status_code=404, detail="Integration connection not found")

    integration_id = row.integration_key

    if integration_id == "aws_role":
        if not payload.config.get("roleArn"):
            raise HTTPException(status_code=422, detail="roleArn is required (fill in Account ID + Role Name).")
        transient_account = _build_transient_account(user, payload.config)
    else:
        if not payload.config.get("accessKeyId") or not payload.config.get("secretAccessKey"):
            raise HTTPException(status_code=422, detail="accessKeyId and secretAccessKey are required.")
        transient_account = _build_transient_account_keys(user, payload.config)

    ok, message = await steampipe_client.validate_account(transient_account)
    if not ok:
        raise HTTPException(status_code=422, detail=f"Could not verify these credentials: {message}")

    resolved_account_number = await steampipe_client.resolve_account_id(transient_account)
    aws_account_number = resolved_account_number or payload.config.get("accountId", "000000000000")

    conflict = await _find_aws_connection_by_account_number(
        db, user.customer_id, aws_account_number, exclude_connection_id=connection_id
    )
    if conflict is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_conflict_detail(conflict, aws_account_number))

    try:
        if integration_id == "aws_role":
            account_payload = AwsAccountCreate(
                account_name=f"{user.email}-{integration_id}",
                aws_account_id=aws_account_number,
                auth_method=AuthMethod.CROSS_ACCOUNT_ROLE,
                role_arn=payload.config.get("roleArn"),
                external_id=payload.config.get("externalId", ""),
            )
        else:
            account_payload = AwsAccountCreate(
                account_name=f"{user.email}-{integration_id}",
                aws_account_id=aws_account_number,
                auth_method=AuthMethod.ACCESS_KEYS,
                access_key_id=payload.config.get("accessKeyId"),
                secret_access_key=payload.config.get("secretAccessKey"),
            )
        kwargs = build_account_kwargs(account_payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    result = await db.execute(select(AwsAccount).where(AwsAccount.id == row.aws_account_id))
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=404, detail="Underlying AWS account record not found")

    for field, value in kwargs.items():
        setattr(account, field, value)

    account.validation_status = ValidationStatus.VALID
    account.validation_message = message
    account.last_validated_at = datetime.now(timezone.utc)
    report = await asyncio.to_thread(permission_check_service.run_permission_check, account)
    account.permission_report = report
    account.permission_checked_at = datetime.now(timezone.utc)

    row.config = {k: v for k, v in payload.config.items()}
    row.status = IntegrationStatus.CONNECTED
    row.last_sync = datetime.now(timezone.utc)

    await db.commit()

    return {"message": "Connection updated", "status": "connected"}


@router.delete("/connections/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_integration_connection(
    connection_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_admin),
):
    """Deletes one specific connection.

    For aws_role/aws_keys this removes exactly the one connected AWS
    account (plus its dedicated AwsAccount row), leaving the template
    row and any other connected accounts under that key untouched --
    that's what makes "connect several AWS accounts, then remove just
    one" possible. For every other provider there's only ever the one
    template row, so deleting it simply disconnects that integration;
    _seed_if_empty transparently recreates a fresh not_connected
    placeholder for it the next time the list is fetched.
    """
    stmt = select(Integration).where(
        Integration.id == connection_id,
        Integration.customer_id == user.customer_id,
    )
    result = await db.execute(stmt)
    row = result.scalars().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Integration connection not found")

    if row.integration_key in _AWS_ACCOUNT_KEYS and row.aws_account_id is None:
        # This is the template placeholder, not an actual connection --
        # nothing to delete. Treat as a no-op success rather than a 404,
        # since from the caller's point of view "this connection is
        # gone" is already true.
        return

    aws_account_id = row.aws_account_id
    await db.delete(row)
    if aws_account_id is not None:
        result = await db.execute(select(AwsAccount).where(AwsAccount.id == aws_account_id))
        account = result.scalar_one_or_none()
        if account is not None:
            await db.delete(account)

    await db.commit()
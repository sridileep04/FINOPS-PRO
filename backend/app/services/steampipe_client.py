"""
Talks to the standalone steampipe-service over HTTP instead of spawning a
steampipe subprocess in this process. This backend never touches the
steampipe binary, never writes an AWS credential file to disk, and never
needs the ~200MB aws plugin in its own image -- all of that lives in one
small, tightly-scoped microservice (see /steampipe-service) that this
backend is the only thing allowed to call.

Keeps the same function names as the old app.services.steampipe_service
(run_query, validate_account, SteampipeError, SteampipeQueryTimeout) so
every caller (resource_scanner_service, report_tasks, aws_accounts
endpoints) needed only an import change, not a rewrite.
"""
from __future__ import annotations
import logging

import httpx

from app.core.config import settings
from app.core.encryption import decrypt_value
from app.core.request_context import request_id_var
from app.models.aws_account import AuthMethod, AwsAccount
logger = logging.getLogger(__name__)

class SteampipeError(RuntimeError):
    pass


class SteampipeQueryTimeout(SteampipeError):
    pass


def _build_auth_payload(account: AwsAccount) -> dict:
    """Decrypts credentials in-memory, for the duration of this one call,
    and sends them to the steampipe-service over the internal network.
    Nothing is written to disk or logged here -- see steampipe-service's
    own workspace.py for how it's handled on the other end (0600 files,
    deleted immediately after use, redacted from error messages)."""
    if account.auth_method == AuthMethod.CROSS_ACCOUNT_ROLE:
        return {
            "method": "cross_account_role",
            "region": account.default_region,
            "role_arn": account.role_arn,
            "external_id": decrypt_value(account.external_id),
        }
    if account.auth_method == AuthMethod.ACCESS_KEYS:
        return {
            "method": "access_keys",
            "region": account.default_region,
            "access_key_id": decrypt_value(account.access_key_id_encrypted),
            "secret_access_key": decrypt_value(account.secret_access_key_encrypted),
        }
    logger.error("In build_auth_payload for account %s for customer %s: unsupported auth method %s", account.id, account.customer_id, account.auth_method)
    raise SteampipeError(f"Unsupported auth method: {account.auth_method}")


async def run_query(account: AwsAccount, sql: str) -> list[dict]:
    payload = {
        "sql": sql,
        "auth": _build_auth_payload(account),
        "request_tag": str(account.id),
    }
    headers = {
        "Authorization": f"Bearer {settings.STEAMPIPE_SERVICE_TOKEN}",
        "X-Request-ID": request_id_var.get(),
    }
    logger.info("run_query headers --> %s", headers)
    logger.info("runquery payload--->%s", payload)
    try:
        logger.info("run_query for account %s sending request to steampipe-service: %s Steampipeurl ->%s", account.id, payload, settings.STEAMPIPE_SERVICE_URL)
        async with httpx.AsyncClient(timeout=settings.STEAMPIPE_CLIENT_TIMEOUT_SECONDS) as client:
            resp = await client.post(f"{settings.STEAMPIPE_SERVICE_URL}/execute", json=payload, headers=headers)
            logger.info("run_query for account %s returned response: %s", account.id, resp.json())
    except httpx.TimeoutException as exc:
        raise SteampipeQueryTimeout(f"steampipe-service did not respond within the client timeout: {exc}") from exc
    except httpx.RequestError as exc:
        raise SteampipeError(f"Could not reach steampipe-service: {exc}") from exc

    if resp.status_code == 504:
        raise SteampipeQueryTimeout(resp.json().get("detail", "Query timed out"))
    if resp.status_code >= 400:
        try:
            detail = resp.json().get("detail", resp.text)
        except ValueError:
            detail = resp.text
        raise SteampipeError(f"steampipe-service returned {resp.status_code}: {detail}")

    return resp.json()["rows"]


async def validate_account(account: AwsAccount) -> tuple[bool, str]:
    logger.info("In validate_account for account %s for customer %s", account.id, account.customer_id)
    """Cheap connectivity check: query aws_sts_caller_identity through the
    real steampipe-service call path, exactly what production reports
    use, so a green check in the UI actually means reports will work."""
    try:
        rows = await run_query(account, "select account_id, arn from aws_sts_caller_identity")
        logger.info("validate_account for account %s returned rows: %s", account.id, rows)
        if rows:
            return True, f"Connected as {rows[0].get('arn', 'unknown identity')}"
        return False, "Query returned no rows"
    except SteampipeQueryTimeout:
        logger.warning("validate_account for account %s timed out", account.id)
        return False, "Connection to steampipe-service timed out"
    except SteampipeError as exc:
        logger.error("validate_account for account %s failed with error: %s", account.id, str(exc))
        return False, str(exc)

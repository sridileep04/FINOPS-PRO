import logging
import re
import secrets

from fastapi import Header, HTTPException, status
from app.config import settings


logger = logging.getLogger(__name__)

_DISALLOWED_KEYWORDS = re.compile(
    r"\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|vacuum|reindex)\b",
    re.IGNORECASE,
)


def verify_service_token(authorization: str = Header(default="")) -> None:
    # logger.info("In verify_service_token with authorization header: %s", authorization)
    """Every request must present `Authorization: Bearer <SERVICE_AUTH_TOKEN>`.
    This service should also be network-isolated (no published port, only
    reachable from the backend's internal Docker/VPC network) -- this
    token is the second layer, not the only one."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    # logger.info("In verify_service_token with token: %s", token)
    if not secrets.compare_digest(token, settings.SERVICE_AUTH_TOKEN):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def validate_sql(sql: str) -> str:
    # logger.info("In validate_sql: %s", sql)
    """Defense-in-depth: the main backend already restricts custom queries
    to a single read-only SELECT before it ever gets here, but this
    service must not blindly trust its caller either -- if the backend
    were ever compromised or misconfigured, this is the last line of
    defense against anything destructive reaching the steampipe FDW."""
    cleaned = sql.strip().rstrip(";")
    if ";" in cleaned:
        raise HTTPException(status_code=422, detail="Only a single SQL statement is allowed")
    lowered = cleaned.lower()
    if not (lowered.startswith("select") or lowered.startswith("with")):
        raise HTTPException(status_code=422, detail="Only SELECT queries are allowed")
    if _DISALLOWED_KEYWORDS.search(cleaned):
        raise HTTPException(status_code=422, detail="Query contains a disallowed keyword")
    if len(cleaned) > 20_000:
        raise HTTPException(status_code=422, detail="Query is too long")
    return cleaned
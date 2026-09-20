import asyncio
import logging

from fastapi import Depends, FastAPI, HTTPException, Request

from app.config import settings
from app.schemas import ExecuteRequest, ExecuteResponse
from app.security import validate_sql, verify_service_token
from app.workspace import SteampipeError, SteampipeQueryTimeout, execute_query
from prometheus_client import Gauge
from prometheus_fastapi_instrumentator import Instrumentator

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
logger = logging.getLogger("steampipe-service")

app = FastAPI(
    title="Steampipe Query Service",
    description="Internal-only microservice: takes a SQL query + AWS credentials, runs it through Steampipe, returns rows. No database, no persistence, no state.",
    version="1.0.0",
)

Instrumentator(
    should_ignore_untemplated=True,
    excluded_handlers=["/health", "/metrics"],
).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
concurrent_queries = Gauge("steampipe_concurrent_queries", "In-flight steampipe queries")

# Caps how many `steampipe query` subprocesses run at once across ALL
# tenants, so a burst of concurrent report/scan requests can't exhaust
# this container's CPU/memory. Excess requests get a 429 rather than
# piling up and starving each other.
_semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_QUERIES)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/execute", response_model=ExecuteResponse, dependencies=[Depends(verify_service_token)])
async def execute(request: ExecuteRequest, http_request: Request):
    request_id = http_request.headers.get("X-Request-ID", "-")
    sql = validate_sql(request.sql)
    if _semaphore.locked():
        logger.warning("Steampipe service at capacity (%s concurrent queries) [request_id=%s]", settings.MAX_CONCURRENT_QUERIES, request_id)

    async with _semaphore:
        concurrent_queries.inc()
        try:
            rows = await execute_query(request.auth, sql)
        except SteampipeQueryTimeout as exc:
            raise HTTPException(status_code=504, detail=str(exc)) from exc
        except SteampipeError as exc:
            # Log server-side with the tag and correlation ID for
            # debugging, but never log the SQL or credentials themselves.
            logger.warning("Query failed (tag=%s, request_id=%s): %s", request.request_tag, request_id, exc)
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        finally:
            concurrent_queries.dec()

    return ExecuteResponse(rows=rows, row_count=len(rows))
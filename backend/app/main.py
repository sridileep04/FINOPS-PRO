import logging
import uuid

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.request_context import request_id_var
from app.db.session import AsyncSessionLocal

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
logger = logging.getLogger("finops")
app = FastAPI(
    title="FinOps Reporting API",
    description="Multi-tenant FinOps backend: connects to customer AWS accounts via cross-account role or access keys, queries them through the steampipe-service microservice, and generates cost/usage reports.",
    version="1.0.0",
)

if settings.cors_is_wildcard_in_production:
    logger.warning(
        "CORS_ORIGINS is '*' while ENVIRONMENT=production -- combined with "
        "allow_credentials=True this effectively trusts any origin. Set "
        "CORS_ORIGINS to your real frontend origin(s) before going live."
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Every request gets a correlation ID (reused if the caller already
    sent one), stored in a contextvar so log lines anywhere in this
    request's lifecycle can include it, and echoed back in the response
    header. steampipe_client.py forwards this same ID to steampipe-service,
    so a single request can be traced across both services' logs."""

    async def dispatch(self, request: Request, call_next):
        incoming_id = request.headers.get("X-Request-ID")
        request_id = incoming_id or uuid.uuid4().hex
        token = request_id_var.set(request_id)
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)
        response.headers["X-Request-ID"] = request_id
        return response


app.add_middleware(RequestIDMiddleware)
app.include_router(api_router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s [request_id=%s]", request.method, request.url, request_id_var.get())
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error", "request_id": request_id_var.get()},
    )


@app.get("/health", tags=["health"])
async def health():
    """Liveness only: is the process up and serving requests? No
    dependency checks -- an orchestrator restarting this container
    because Postgres is briefly unavailable would make an outage worse,
    not better. Use /health/ready for that."""
    return {"status": "ok"}


@app.get("/health/ready", tags=["health"])
async def readiness():
    """Readiness: can this instance actually serve traffic right now?
    Checks the dependencies every request needs (Postgres, Redis).
    Suitable for a load balancer target group health check or a k8s
    readiness probe -- an instance that fails this should be taken out
    of rotation, not restarted."""
    checks = {}

    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("select 1"))
        checks["database"] = "ok"
    except Exception as exc:  # noqa: BLE001
        checks["database"] = f"error: {exc}"

    try:
        from redis.asyncio import Redis

        redis = Redis.from_url(settings.REDIS_URL)
        await redis.ping()
        await redis.aclose()
        checks["redis"] = "ok"
    except Exception as exc:  # noqa: BLE001
        checks["redis"] = f"error: {exc}"

    all_ok = all(v == "ok" for v in checks.values())
    return JSONResponse(status_code=200 if all_ok else 503, content={"status": "ok" if all_ok else "not_ready", "checks": checks})

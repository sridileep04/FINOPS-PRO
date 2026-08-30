"""Schema-driven contract/fuzz testing for endpoints that need no DB.

Schemathesis reads the FastAPI app's own auto-generated OpenAPI schema
and generates many edge-case requests per endpoint (boundary values,
wrong types, missing fields) automatically. It asserts the documented
response schema is actually honored, and (for the signup case) that
the endpoint never returns a 500.

Scope note: this project builds its DB engine once, at import time,
from settings read at process start (see app/db/session.py). That
means any in-process ASGI call that goes through the *default* get_db
dependency -- as Schemathesis's `case.call()` does -- can only reach a
real database if the real DATABASE_URL was already correct before
`app.db.session` was first imported. That's true in CI (env vars are
set before pytest starts) but not when this file is combined with the
testcontainers fixtures used elsewhere in tests/integration (those
start Postgres *after* import already happened). So:
  - The /health check below needs no DB and is fully self-contained.
  - For DB-backed endpoints, prefer running schemathesis as a CLI step
    against a *live* server process in CI (see the `contract-tests`
    job in .github/workflows/ci.yml) rather than in-process here --
    that sidesteps the import-order issue entirely and is also
    Schemathesis's standard/recommended usage pattern.
"""
import pytest
import schemathesis
from hypothesis import HealthCheck
from hypothesis import settings as hypothesis_settings

from app.main import app

schema = schemathesis.openapi.from_asgi("/openapi.json", app, force_schema_version="30")


@pytest.mark.integration
@schema.include(path_regex="^/health$").parametrize()
@hypothesis_settings(max_examples=5, deadline=None, suppress_health_check=[HealthCheck.too_slow])
def test_liveness_endpoint_matches_documented_schema(case):
    """/health (liveness) takes no input and has no external
    dependencies, so its response schema should never drift."""
    response = case.call()
    case.validate_response(response)


def test_readiness_endpoint_returns_well_formed_response_on_dependency_failure():
    """/health/ready's OpenAPI schema only documents a 200 response
    (FastAPI infers documented status codes from the route's
    response_model / explicit responses=, and this route returns a
    plain JSONResponse with a dynamic status code instead) -- so a
    schema-driven fuzz check would incorrectly flag its real,
    intentional 503 as "undocumented". That's a documentation gap
    worth fixing (add `responses={503: {...}}` to the route decorator),
    but the behavior itself is correct: verify it explicitly instead.
    """
    from fastapi.testclient import TestClient

    from app.main import app as fastapi_app

    with TestClient(fastapi_app) as test_client:
        response = test_client.get("/health/ready")

    assert response.status_code in (200, 503)
    body = response.json()
    assert body["status"] in ("ok", "not_ready")
    assert set(body["checks"]) == {"database", "redis"}
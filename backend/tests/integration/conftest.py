"""Integration-test fixtures.

Why testcontainers instead of SQLite-in-memory: this app uses Postgres-
specific features (pgvector's `vector` column type, JSONB, server-side
`func.now()` defaults) that SQLite either can't represent or silently
behaves differently for. A test suite that passes against SQLite but
fails against real Postgres gives false confidence, so every
integration test in this package runs against the same
`pgvector/pgvector:pg16` image used in production (see backend/test.md).

Flow, once per test session:
1. Start a disposable Postgres container.
2. Point app.core.config.settings + a fresh async engine at it.
3. Run the project's REAL Alembic migrations against it (not
   `Base.metadata.create_all()` -- that would test the models, not the
   migrations, and migration bugs are exactly the kind of thing that
   should be caught before they hit staging/prod).
4. Hand out an httpx.AsyncClient wired to the FastAPI app via
   ASGITransport (in-process, no real network socket) for endpoint tests.

Each test function gets a transaction that's rolled back afterwards, so
tests never leak state into one another and can run in any order.
"""
import asyncio
import os
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from testcontainers.postgres import PostgresContainer


@pytest.fixture(scope="session")
def postgres_container():
    with PostgresContainer("pgvector/pgvector:pg16", driver="asyncpg") as container:
        # Also expose a psycopg-style sync URL for Alembic, which uses
        # SYNC_DATABASE_URL / a sync engine internally.
        sync_url = container.get_connection_url().replace("postgresql+asyncpg://", "postgresql+psycopg://")
        os.environ["DATABASE_URL"] = container.get_connection_url()
        os.environ["SYNC_DATABASE_URL"] = sync_url
        os.environ["DB_HOST"] = container.get_container_host_ip()
        os.environ["DB_PORT"] = str(container.get_exposed_port(5432))
        os.environ["DB_USER"] = container.username
        os.environ["DB_PASSWORD"] = container.password
        os.environ["DB_NAME"] = container.dbname
        yield container


@pytest.fixture(scope="session")
def run_migrations(postgres_container):
    """Runs `alembic upgrade head` against the container once per session."""
    from alembic import command
    from alembic.config import Config

    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    alembic_cfg = Config(os.path.join(backend_dir, "alembic.ini"))
    alembic_cfg.set_main_option("script_location", os.path.join(backend_dir, "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", os.environ["SYNC_DATABASE_URL"])
    command.upgrade(alembic_cfg, "head")
    yield


@pytest_asyncio.fixture
async def db_engine(run_migrations):
    engine = create_async_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine) -> AsyncGenerator[AsyncSession, None]:
    """Wraps each test in a transaction that's rolled back at teardown,
    so tests never see data left behind by a previous test."""
    connection = await db_engine.connect()
    transaction = await connection.begin()
    session_factory = async_sessionmaker(bind=connection, expire_on_commit=False, class_=AsyncSession)
    session = session_factory()

    yield session

    await session.close()
    await transaction.rollback()
    await connection.close()


@pytest_asyncio.fixture
async def client(db_session) -> AsyncGenerator[AsyncClient, None]:
    """An httpx client that calls the FastAPI app in-process, with
    get_db overridden to hand out the same rolled-back-at-teardown
    session every request in this test uses."""
    from app.db.session import get_db
    from app.main import app

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac
    app.dependency_overrides.clear()
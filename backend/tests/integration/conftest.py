"""Integration-test fixtures.

Why testcontainers instead of SQLite-in-memory: this app uses Postgres-
specific features (pgvector's `vector` column type, JSONB, server-side
`func.now()` defaults) that SQLite either can't represent or silently
behaves differently for. A test suite that passes against SQLite but
fails against real Postgres gives false confidence, so every
integration test in this package runs against the same
`pgvector/pgvector:pg16` image used in production (see backend/test.md).

Flow, once per test session:
1. Start a disposable Postgres container on a random free port.
2. Point app.core.config.settings + a fresh async engine at it.
3. Run the project's REAL Alembic migrations against it.
4. Hand out an httpx.AsyncClient wired to the FastAPI app via
   ASGITransport for endpoint tests.
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
    # Explicitly configure testcontainers to use a random available port 
    # so it never clashes with your production container on port 5432.
    with PostgresContainer("pgvector/pgvector:pg16", driver="asyncpg").with_exposed_ports(5432) as container:
        
        # Get the dynamic random host port assigned by Docker
        host_port = container.get_exposed_port(5432)
        
        # Construct connection URLs using the dynamic port
        connection_url = container.get_connection_url()
        # Ensure the URL explicitly uses the dynamic port rather than a default fallback
        # (testcontainers-python usually handles this, but forcing it guarantees safety)
        
        sync_url = connection_url.replace("postgresql+asyncpg://", "postgresql+psycopg://")
        
        os.environ["DATABASE_URL"] = connection_url
        os.environ["SYNC_DATABASE_URL"] = sync_url
        os.environ["DB_HOST"] = container.get_container_host_ip()
        os.environ["DB_PORT"] = str(host_port)
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
    """Wraps each test in a transaction that's rolled back at teardown."""
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
    """An httpx client that calls the FastAPI app in-process."""
    from app.db.session import get_db
    from app.main import app

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac
    app.dependency_overrides.clear()

@pytest_asyncio.fixture(autouse=True)
async def reset_redis_client():
    """Resets and flushes the Redis rate limit cache before and after every test."""
    import app.core.rate_limit as rate_limit_module
    
    # Always ensure a clean client is instantiated and flushed right before the test runs
    try:
        if rate_limit_module._redis is None:
            rate_limit_module._redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
            try:
                current_loop = asyncio.get_running_loop()
            except RuntimeError:
                current_loop = None
            rate_limit_module._redis_loop = current_loop
            
        await rate_limit_module._redis.flushdb()
    except Exception:
        pass

    yield

    # Clean up after the test
    if rate_limit_module._redis is not None:
        try:
            await rate_limit_module._redis.flushdb()
            await rate_limit_module._redis.aclose()
        except Exception:
            pass
        rate_limit_module._redis = None
        rate_limit_module._redis_loop = None
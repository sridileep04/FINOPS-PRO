"""Loaded by pytest before any test module in tests/ is collected.

app.core.config.Settings() is instantiated at import time (module-level
`settings = Settings()`), and several required fields (DB_USER,
SECRET_KEY, STEAMPIPE_SERVICE_TOKEN, ...) have no defaults. So anything
that imports app.* -- directly or transitively -- needs those env vars
present *before* the first `import app...` anywhere in the test session.
Doing it here, in the top-level conftest, guarantees that ordering.

Integration tests (tests/integration/conftest.py) override DB_HOST/
DB_PORT/DATABASE_URL afterwards with the real testcontainers Postgres
connection info -- see that file for how the app's DB engine is
rebuilt against the container instead of these placeholder values.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env.test", override=False)

# Belt-and-suspenders: also set directly in case this process already
# had a partial environment (e.g. a real .env picked up by direnv).
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("DB_USER", "test")
os.environ.setdefault("DB_PASSWORD", "test")
os.environ.setdefault("DB_HOST", "localhost")
os.environ.setdefault("DB_PORT", "5432")
os.environ.setdefault("DB_NAME", "test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")
os.environ.setdefault("STEAMPIPE_SERVICE_TOKEN", "test-steampipe-token")
os.environ.setdefault("ENCRYPTION_BACKEND", "fernet")
os.environ.setdefault("CREDENTIAL_ENCRYPTION_KEY", "2GgDKzdgBGAf1ImFVdMDixC9OjmZt9JwqL9fxjbggZ0=")
os.environ.setdefault("SEED_DEMO_USERS", "false")
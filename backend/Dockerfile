# =============================================================================
# Stage 1: builder -- compiles/installs Python dependencies into an isolated
# venv. Keeping this separate from the runtime stage means build tools
# (gcc, headers needed by some wheels) never end up in the final image,
# which shrinks the attack surface and the image size.
# =============================================================================
FROM python:3.12-slim AS builder

# Pin apt package versions is impractical for base OS packages (debian
# doesn't reliably keep old versions in the mirror), so instead we pin the
# base image tag/digest and keep the package list minimal.
# Debian package versions aren't pinned here deliberately: bookworm's apt
# mirror doesn't guarantee long-term availability of a specific pinned
# version string, so a hardcoded version here would eventually break the
# build outright. Reproducibility instead comes from pinning the base
# image tag (python:3.12-slim) and rebuilding regularly to pick up
# security patches -- see the weekly scheduled Trivy scan in
# .github/workflows/ci.yml, which is what actually catches drift here.
# hadolint ignore=DL3008
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Install into a venv rather than system site-packages: makes the
# "copy only what's needed" step in Stage 2 trivial (copy one directory)
# and keeps the runtime image free of pip/setuptools/wheel metadata.
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip==24.2 \
    && pip install --no-cache-dir -r requirements.txt

# =============================================================================
# Stage 2: runtime -- minimal image, non-root user, no build tools.
# =============================================================================
FROM python:3.12-slim AS runtime

# libpq5 (not libpq-dev): the runtime shared library asyncpg/psycopg need,
# without the headers/compiler-time-only libpq-dev package.
# curl: used only by the HEALTHCHECK below.
# See the same note in Stage 1 above -- version pinning debian packages
# here isn't reliably reproducible long-term; the base image tag +
# scheduled Trivy scans are the actual reproducibility/patch strategy.
# hadolint ignore=DL3008
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 \
        curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 10001 -s /usr/sbin/nologin appuser

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Copy application code last (after dependency install) so that code-only
# changes don't invalidate the dependency-install layer cache.
COPY --chown=appuser:appuser alembic.ini ./alembic.ini
COPY --chown=appuser:appuser alembic ./alembic
COPY --chown=appuser:appuser app ./app
COPY --chown=appuser:appuser docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Never bake secrets or a real .env into the image -- every credential
# (DB password, SECRET_KEY, STEAMPIPE_SERVICE_TOKEN, etc.) is supplied at
# `docker run` / `docker compose up` time via env_file or -e flags, and
# .dockerignore below explicitly excludes .env* from the build context so
# a stray local .env can't be COPYed in by accident even by a future edit
# to this file.

USER appuser

EXPOSE 8000

# Distinguishes "process is up" from "process can actually serve traffic"
# (DB/Redis reachable) -- see GET /health vs /health/ready in app/main.py.
# Docker/orchestrators use this to gate traffic and restart hung containers.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
# API_WORKERS is read by docker-entrypoint.sh, defaulting to 2 if unset --
# matches the value already documented in backend/.env.example.
CMD ["uvicorn-server"]
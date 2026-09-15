# =============================================================================
# Stage 1: builder -- compiles/installs Python dependencies into an isolated
# venv. Keeping this separate from the runtime stage means build tools
# (gcc, headers needed by some wheels) never end up in the final image,
# which shrinks the attack surface and the image size.
# =============================================================================
FROM python:3.12-slim AS builder

RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip==24.2 \
    && pip install --no-cache-dir -r requirements.txt

# =============================================================================
# Stage 2: runtime -- minimal image, non-root user, no build tools.
# =============================================================================
FROM python:3.12-slim AS runtime
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
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

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
# API_WORKERS is read by docker-entrypoint.sh, defaulting to 2 if unset --
# matches the value already documented in backend/.env.example.
CMD ["uvicorn-server"]
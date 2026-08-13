# =================================================================amo
# Stage 1: Build & Pre-cache Steampipe and Plugins
# =================================================================
FROM debian:bookworm-slim AS builder

ARG STEAMPIPE_VERSION=latest

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates tar \
    && rm -rf /var/lib/apt/lists/*

# Install Steampipe binary
RUN set -eux; \
    if [ "$STEAMPIPE_VERSION" = "latest" ]; then \
        URL="https://github.com/turbot/steampipe/releases/latest/download/steampipe_linux_amd64.tar.gz"; \
    else \
        URL="https://github.com/turbot/steampipe/releases/download/v${STEAMPIPE_VERSION}/steampipe_linux_amd64.tar.gz"; \
    fi; \
    curl -fsSL -o /tmp/steampipe.tar.gz "$URL"; \
    tar -xzf /tmp/steampipe.tar.gz -C /usr/local/bin; \
    chmod +x /usr/local/bin/steampipe; \
    rm /tmp/steampipe.tar.gz

# Set up build workspace directories
ENV STEAMPIPE_INSTALL_DIR=/home/steampipe/.steampipe
ENV STEAMPIPE_WORKSPACES_DIR=/home/steampipe/workspaces

RUN useradd -m -u 10001 steampipe \
    && mkdir -p "$STEAMPIPE_INSTALL_DIR" "$STEAMPIPE_WORKSPACES_DIR" \
    && chown -R steampipe:steampipe /home/steampipe

USER steampipe
WORKDIR /home/steampipe

# Install plugin and extract underlying Postgres database components
RUN steampipe --version && steampipe plugin install aws
RUN steampipe service start && steampipe service stop

# =================================================================
# Stage 2: Runtime Image
# =================================================================
FROM debian:bookworm-slim

# Install Python runtime cleanly
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user matching builder stage
RUN useradd -m -u 10001 steampipe

# Copy compiled Steampipe binary and pre-cached plugins/postgres state from builder
COPY --from=builder /usr/local/bin/steampipe /usr/local/bin/steampipe
COPY --chown=steampipe:steampipe --from=builder /home/steampipe /home/steampipe

# Set required environment variables
ENV STEAMPIPE_INSTALL_DIR=/home/steampipe/.steampipe
ENV STEAMPIPE_WORKSPACES_DIR=/home/steampipe/workspaces

# Setup application directory
WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

COPY app ./app
RUN chown -R steampipe:steampipe /app

# Switch to non-root user for execution
USER steampipe
EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]


# # Standalone microservice whose only job is: accept a SQL query + a set of
# # AWS credentials over HTTP, run it through Steampipe, return the rows.
# # It never touches Postgres, never sees a customer record, never persists
# # anything -- it is a pure, stateless query executor.
# FROM debian:bookworm-slim

# # Pin a specific Steampipe release for reproducible builds. Check
# # https://github.com/turbot/steampipe/releases for the current version
# # before bumping. Set to "latest" to always pull the newest release
# # instead (fine for a first deploy, not recommended once you're pinning
# # other infra for reproducibility).
# ARG STEAMPIPE_VERSION=latest

# RUN apt-get update && apt-get install -y --no-install-recommends \
#         curl ca-certificates tar gnupg \
#     && rm -rf /var/lib/apt/lists/*

# # IMPORTANT: we deliberately do NOT use `curl ... | sh` against Steampipe's
# # install.sh here. That script shells out to `sudo` unconditionally to move
# # the binary into /usr/local/bin -- which fails the build inside minimal
# # containers that don't have sudo installed, even when already running as
# # root. Downloading the pinned release tarball directly and extracting it
# # ourselves avoids that failure mode entirely and is fully reproducible.
# RUN set -eux; \
#     if [ "$STEAMPIPE_VERSION" = "latest" ]; then \
#         URL="https://github.com/turbot/steampipe/releases/latest/download/steampipe_linux_amd64.tar.gz"; \
#     else \
#         URL="https://github.com/turbot/steampipe/releases/download/v${STEAMPIPE_VERSION}/steampipe_linux_amd64.tar.gz"; \
#     fi; \
#     curl -fsSL -o /tmp/steampipe.tar.gz "$URL"; \
#     tar -xzf /tmp/steampipe.tar.gz -C /usr/local/bin; \
#     chmod +x /usr/local/bin/steampipe; \
#     rm /tmp/steampipe.tar.gz

# # Non-root user: this service only ever needs to write to its own
# # workspace/plugin-cache directories, never to system paths.
# RUN useradd -m -u 10001 steampipe
# ENV STEAMPIPE_INSTALL_DIR=/home/steampipe/.steampipe
# ENV STEAMPIPE_WORKSPACES_DIR=/home/steampipe/workspaces

# RUN mkdir -p "$STEAMPIPE_INSTALL_DIR" "$STEAMPIPE_WORKSPACES_DIR" \
#     && chown -R steampipe:steampipe /home/steampipe

# USER steampipe
# WORKDIR /home/steampipe

# # Plugin binary is baked into the image at build time -- no shared volume,
# # no init container, no race with other services. Every replica of this
# # service is self-contained and stateless.
# RUN steampipe --version && steampipe plugin install aws

# # Also pre-extract the embedded Postgres binaries into
# # STEAMPIPE_INSTALL_DIR/db/<version>/postgres at build time, not on the
# # first real query. `service start`/`stop` triggers that extraction
# # without needing any AWS connection configured. Each per-request pool
# # slot (see app/workspace.py) symlinks these binaries in rather than
# # re-downloading/extracting them itself.
# RUN steampipe service start && steampipe service stop

# # --- Python runtime for the thin FastAPI wrapper around the steampipe CLI ---
# USER root
# RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip \
#     && rm -rf /var/lib/apt/lists/*

# WORKDIR /app
# COPY requirements.txt .
# RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# COPY app ./app
# RUN chown -R steampipe:steampipe /app

# USER steampipe
# EXPOSE 8001
# CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
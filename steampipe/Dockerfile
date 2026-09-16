# =================================================================amo
# Stage 1: Build & Pre-cache Steampipe and Plugins
# =================================================================
FROM debian:bookworm-slim AS builder

ARG STEAMPIPE_VERSION=latest

RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
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

RUN rm -rf "$STEAMPIPE_INSTALL_DIR"/db/*/data

# =================================================================
# Stage 2: Runtime Image
# =================================================================
FROM debian:bookworm-slim

# Install Python runtime cleanly. Same apt-get upgrade reasoning as the
# builder stage above -- this is the stage that actually ships and gets
# scanned.
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
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

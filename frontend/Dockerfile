# =============================================================================
# Stage 1: build -- compiles the Vite/React app into static assets.
# Node/npm and the entire node_modules tree never reach the final image.
# =============================================================================
FROM node:20-slim AS builder

WORKDIR /build

# Copy only the manifest files first so `npm ci` is cached across builds
# whenever application code changes but dependencies don't.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# =============================================================================
# Stage 2: runtime -- unprivileged nginx serving the pre-built static bundle.
# =============================================================================
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

# nginxinc/nginx-unprivileged (not plain `nginx`) already runs as a
# non-root user and listens on a port >1024 by default -- avoids needing
# our own useradd/chown dance just to drop root, and avoids the common
# footgun of a "non-root" nginx image that still binds to port 80 (which
# requires CAP_NET_BIND_SERVICE and quietly re-adds a privilege).
COPY --from=builder /build/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8080/ >/dev/null 2>&1 || exit 1

# Base image's default USER (non-root, uid 101) and CMD (nginx -g "daemon off;")
# are both already correct for this use case -- no override needed.
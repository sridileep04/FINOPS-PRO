# Devops setup guide

# 1. Backend Docker image
## docker-entrypoint.sh make it executable
``` chmod +x backend/docker-entrypoint.sh ```

## Build & test it standalone (no compose needed)
```
cd backend
docker build -t finops-backend:local .
docker run --rm -p 8000:8000 --env-file ../.env finops-backend:local
```

# 2. Frontend Docker image

#### Stage 1 (node:20-slim) runs npm ci && npm run build. Stage 2 serves the static output through nginxinc/nginx-unprivileged (non-root by default — no manual useradd/capability juggling needed). nginx.conf adds security headers (CSP, X-Frame-Options, HSTS, Referrer-Policy), reverse-proxies /api/* to the backend container, and falls back to index.html for client-side routes.

## Build & test it standalone
```
cd frontend
docker build -t finops-frontend:local .
docker run --rm -p 8080:8080 finops-frontend:local
# visit http://localhost:8080 -- note /api calls will fail here since
# there's no `backend` hostname to resolve outside docker-compose
```

# 3. Docker Compose — the full stack

## edit .env and fill in real values
``` cp .env.example .env ```

## Generate the two crypto values:
```
# SECRET_KEY and STEAMPIPE_SERVICE_TOKEN
openssl rand -hex 32

# CREDENTIAL_ENCRYPTION_KEY
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

## Run it — local dev (hot reload, exposed DB/Redis ports)
```
docker compose up --build
```
#### docker-compose.override.yml is picked up automatically — no extra flag needed. This exposes Postgres on 127.0.0.1:5432, Redis on 127.0.0.1:6379, and the backend directly on 127.0.0.1:8000 for debugging, on top of the frontend at http://localhost:80

## Run it — production-shaped
```
docker compose -f docker-compose.yml up --build -d
```

## stop the containers
```
docker compose down          # stop + remove containers
docker compose down -v       # also wipe the postgres_data/redis_data volumes -- full reset
```

## Check it's healthy
```
docker compose ps            # shows health status per service
curl http://localhost/health # through the frontend's nginx proxy
```

# 4. GitHub Actions CI/CD workflow

### The 7 jobs, and when each runs
### 1.backend-unit-tests ->every push/PR-> pytest unit tests + DB-independent contract tests
### 2.backend-integration-tests->every push/PR->pytest integration tests against a real testcontainers Postgres
### 3.frontend-unit-tests->every push/PR->Vitest + coverage
### 4.security->every push/PR->the consolidated DevSecOps gate — see below
### 5.e2e-tests->push to main, nightly, manual->builds and runs the real docker-compose.yml stack, then Playwright against it
### 6.performance-smoke-test->every push/PR->fast (~30s) k6 auth-endpoint canary
### 7.performance-load-test->nightly, manual->heavier (~3min) k6 ramping load test
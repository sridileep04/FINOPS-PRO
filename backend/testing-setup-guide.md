# 1.Backend Unit Tests

## Create file backend/.env.test
## Add below line
## CREDENTIAL_ENCRYPTION_KEY=paste the generated key
## command to generate key ->python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

## Install below
```
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements-dev.txt
```
## Run the Unit Tests
```
pytest tests/unit -v
pytest tests/unit --cov=app --cov-report=term-missing   # with coverage
```

# 2.Backend Integration Tests (Postgres via Testcontainers)

### Note :-Requires Docker Desktop (or Docker Engine) running. Same venv as Section 1 — requirements-dev.txt already includes testcontainers[postgres], httpx, moto, respx
## Run Integration Tests
```
pytest tests/integration -v -m integration
```

# 3.API Contract/Fuzz Tests (Schemathesis)

### Note :-requirements-dev.txt should have schemathesis==3.39.16
### This reads FastAPI app's own OpenAPI schema and auto-generates edge-case requests against /health and /health/ready to catch schema drift — no DB needed for this particular file.
## Run test_api_contract test
```
pytest tests/integration/test_api_contract.py -v
```

# 4.Frontend Unit/Component Tests (Vitest + React Testing Library)

### verify this scripts are present in package.json and devDependencies
```
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```
```
"@testing-library/jest-dom": "^6.6.3",
"@testing-library/react": "^16.0.1",
"@testing-library/user-event": "^14.5.2",
"@vitest/coverage-v8": "^2.1.4",
"jsdom": "^25.0.1",
"msw": "^2.6.4",
"vitest": "^2.1.4"
```
## Run below commands to run frontend tests
```
cd frontend
npm install
npm test                    # runs once
npm run test:watch          # watch mode while developing
npm run test:coverage       # with coverage report
```

# 5.E2E Tests (Playwright)

## Install dependencies
```
cd e2e
npm install
npx playwright install --with-deps chromium firefox webkit   # one-time, downloads browser binaries
```

### Note :-Make sure your full stack is running first: backend + Postgres + Redis (see backend/test.md), and the frontend dev server (Playwright will auto-start npm run dev for you if nothing's already on port 3000 — see webServer in playwright.config.ts).

## Command to run e2e tests
```
npm test                 # headless, all 3 browsers
npm run test:headed      # watch it click through an actual browser window
npm run test:ui          # Playwright's interactive debugging UI
npm run report           # view the HTML report after a run
```

# 6.Performance Testing (k6)
## Install below
```
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Or just download the binary directly:
curl -sL -o k6.tar.gz https://github.com/grafana/k6/releases/download/v0.55.0/k6-v0.55.0-linux-amd64.tar.gz
tar xzf k6.tar.gz && sudo mv k6-v0.55.0-linux-amd64/k6 /usr/local/bin/
```
### Note:-Make sure your backend + DB are running first (localhost:8000 by default).

## Run tests
```
# Fast smoke test (~30s, good for every CI build)
k6 run perf/auth-smoke-test.js

# Heavier ramping load test (~3 min, good for scheduled/nightly runs)
k6 run perf/dashboard-load-test.js

# Against a different environment
k6 run -e BASE_URL=https://staging.example.com perf/dashboard-load-test.js
```

### Note:-k6 will print pass/fail against the thresholds defined in each script (e.g. "95% of requests must complete under 800ms") and exit non-zero if violated — that's what makes it CI-friendly.


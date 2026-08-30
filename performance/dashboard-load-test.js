/**
 * Load test for FINOPS-PRO's read-heavy dashboard endpoints.
 *
 * Why these endpoints: dashboard.py's /summary, /trend, /breakdown
 * etc. run aggregation queries (SUM/GROUP BY over daily_costs,
 * resource_snapshots) rather than simple row lookups -- these are the
 * ones most likely to degrade under concurrent load as data volume
 * grows, unlike a straightforward GET /aws-accounts/{id}.
 *
 * Logs into the shared sandbox account once per virtual user (real
 * signups would pile up fake customers in whatever DB this runs
 * against) and reuses that JWT for every request the VU makes,
 * mirroring how a real browser session behaves.
 *
 * Usage:
 *   k6 run perf/dashboard-load-test.js
 *   k6 run -e BASE_URL=https://staging.example.com perf/dashboard-load-test.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

const loginFailureRate = new Rate('login_failures');
const dashboardDuration = new Trend('dashboard_summary_duration', true);

export const options = {
    scenarios: {
        // Ramps from a light warm-up load up to a sustained peak, then
        // back down -- surfaces both "does it work under normal load"
        // and "does it degrade gracefully as load climbs" in one run.
        ramping_dashboard_load: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 10 },  // warm-up
                { duration: '1m', target: 50 },   // typical peak
                { duration: '1m', target: 100 },  // stress the aggregation queries
                { duration: '30s', target: 0 },   // cool-down
            ],
            gracefulRampDown: '10s',
        },
    },
    thresholds: {
        // Fail the CI job if these are violated -- tune these numbers
        // against real measured baselines once the app has production
        // traffic patterns; these starting values assume a
        // dashboard-summary query should stay well under a second even
        // under load, and that the API shouldn't be flaky under 100
        // concurrent users.
        http_req_duration: ['p(95)<800', 'p(99)<1500'],
        http_req_failed: ['rate<0.01'],
        login_failures: ['rate<0.01'],
        dashboard_summary_duration: ['p(95)<500'],
    },
};

export function setup() {
    // Confirm the target is even up before spending the full ramp
    // profile hammering a dead server -- fails fast with a clear
    // message instead of a wall of connection-refused errors.
    const res = http.get(`${BASE_URL}/health`);
    if (res.status !== 200) {
        throw new Error(`Target ${BASE_URL} is not healthy (got ${res.status}) -- aborting load test`);
    }
}

export default function () {
    const loginRes = http.post(
        `${BASE_URL}/api/v1/auth/login`,
        JSON.stringify({ email: 'sandbox@aetherfin.com', password: 'sandbox_secret_key' }),
        { headers: { 'Content-Type': 'application/json' } },
    );

    const loginOk = check(loginRes, {
        'login succeeded': (r) => r.status === 200,
        'login returned a token': (r) => !!r.json('token'),
    });
    loginFailureRate.add(!loginOk);
    if (!loginOk) {
        sleep(1);
        return;
    }

    const token = loginRes.json('token');
    const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

    const summaryRes = http.get(`${BASE_URL}/api/v1/dashboard/summary`, authHeaders);
    dashboardDuration.add(summaryRes.timings.duration);
    check(summaryRes, { 'dashboard summary succeeded': (r) => r.status === 200 });

    const trendRes = http.get(`${BASE_URL}/api/v1/dashboard/trend`, authHeaders);
    check(trendRes, { 'dashboard trend succeeded': (r) => r.status === 200 });

    const breakdownRes = http.get(`${BASE_URL}/api/v1/dashboard/breakdown`, authHeaders);
    check(breakdownRes, { 'dashboard breakdown succeeded': (r) => r.status === 200 });

    // A real user pauses to read the screen between actions -- without
    // this, k6 would fire requests back-to-back far faster than any
    // real browser session, testing a scenario that doesn't reflect
    // actual usage.
    sleep(Math.random() * 2 + 1);
}
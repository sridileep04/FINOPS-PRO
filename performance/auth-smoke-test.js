/**
 * Lightweight smoke test for the auth endpoints, meant to run on every
 * CI build (fast: ~30s) as a canary -- separate from
 * dashboard-load-test.js's heavier, scheduled-only ramp profile.
 *
 * Password hashing (pwdlib/argon2, see app/core/security.py) is
 * deliberately slow-ish per call by design (that's what makes it
 * resistant to offline brute-force), so this also catches a real
 * regression class: someone accidentally making hashing *more*
 * expensive (e.g. bumping argon2 work factors without load-testing
 * the login endpoint's throughput first).
 *
 * Usage:
 *   k6 run perf/auth-smoke-test.js
 */
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

export const options = {
    vus: 20,
    duration: '30s',
    thresholds: {
        http_req_duration: ['p(95)<1000'],
        http_req_failed: ['rate<0.01'],
    },
};

export default function () {
    const res = http.post(
        `${BASE_URL}/api/v1/auth/login`,
        JSON.stringify({ email: 'sandbox@aetherfin.com', password: 'sandbox_secret_key' }),
        { headers: { 'Content-Type': 'application/json' } },
    );

    check(res, {
        'status is 200': (r) => r.status === 200,
        'response has a token': (r) => !!r.json('token'),
    });
}
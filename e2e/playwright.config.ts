import { defineConfig, devices } from '@playwright/test';

/**
 * BASE_URL lets this same config target three different things without
 * editing files:
 *   - local dev:      unset -> Playwright starts `npm run dev` itself (see webServer below)
 *   - CI:              set to the docker-composed stack's frontend URL
 *   - staging/preview: set to a deployed URL, and `webServer` is skipped
 */
const baseURL = process.env.BASE_URL || 'http://localhost:3000';
const isCI = !!process.env.CI;

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: isCI, // fails the build if someone accidentally commits .only()
    retries: isCI ? 2 : 0, // a little retry budget in CI absorbs infra flakiness; none locally so failures are seen immediately
    workers: isCI ? 2 : undefined,
    reporter: isCI ? [['html', { open: 'never' }], ['github']] : 'list',

    use: {
        baseURL,
        trace: 'on-first-retry', // captures a debuggable trace only when a test actually failed once
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },

    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ],

    // Only spin up a dev server automatically when no external BASE_URL was
    // given -- in CI we point BASE_URL at the already-running docker-compose
    // stack instead (see .github/workflows/ci.yml, job `e2e-tests`).
    webServer: process.env.BASE_URL
        ? undefined
        : {
            command: 'npm run dev',
            cwd: '../frontend',
            url: baseURL,
            reuseExistingServer: !isCI,
            timeout: 120_000,
        },
});
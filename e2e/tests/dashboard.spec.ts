import { expect, test } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

/**
 * These log in as the shared public sandbox account (see auth.spec.ts)
 * rather than a fresh signup, specifically *because* the sandbox is
 * served from static mock data (app.services.sandbox_data) instead of
 * a real customer's AWS scan. That makes these navigation tests fast
 * and deterministic regardless of whether any real AWS account has
 * been connected in the environment under test.
 */
test.describe('Dashboard navigation', () => {
    test.beforeEach(async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login('sandbox@aetherfin.com', 'sandbox_secret_key');
        await expect(page).toHaveURL(/\/dashboard/);
    });

    test('the main dashboard shows the Mission Control heading', async ({ page }) => {
        await expect(page.getByRole('heading', { name: 'Mission Control' })).toBeVisible();
    });

    test('can navigate to the Integrations page', async ({ page }) => {
        await page.goto('/dashboard/integrations');
        await expect(page).toHaveURL(/\/dashboard\/integrations/);
        // Not asserting a specific heading text here since Integrations.tsx
        // is a large, frequently-changing page -- this is a routing/
        // render smoke test, not a content test for this page.
        await expect(page.locator('body')).not.toContainText('Error Boundary');
    });

    test('can navigate to the Resource Explorer page', async ({ page }) => {
        await page.goto('/dashboard/resources');
        await expect(page).toHaveURL(/\/dashboard\/resources/);
    });

    test('can navigate to the Optimizations page', async ({ page }) => {
        await page.goto('/dashboard/optimizations');
        await expect(page).toHaveURL(/\/dashboard\/optimizations/);
    });

    test('can navigate to the AI Copilot page and see the chat input', async ({ page }) => {
        await page.goto('/dashboard/copilot');
        await expect(page.getByPlaceholder(/ask about your cloud spend/i)).toBeVisible();
    });

    test('can navigate to Settings', async ({ page }) => {
        await page.goto('/dashboard/settings');
        await expect(page).toHaveURL(/\/dashboard\/settings/);
    });

    test('the sandbox account cannot perform write actions (mutation guard)', async ({ page }) => {
        // Mirrors the backend's forbid_sandbox_mutation dependency
        // (app/api/deps.py): connecting a real AWS account should be
        // blocked for the shared demo identity. This checks the
        // API-level guard directly via the page's own fetch, since the
        // exact UI control for "add account" lives inside the large
        // Integrations page and is more brittle to drive end-to-end.
        const response = await page.evaluate(async () => {
            const token = window.localStorage.getItem('token')?.replace(/^"|"$/g, '');
            const res = await fetch('/api/v1/aws-accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    account_name: 'Should Be Blocked',
                    aws_account_id: '123456789012',
                    auth_method: 'access_keys',
                    access_key_id: 'AKIAEXAMPLE',
                    secret_access_key: 'secret',
                }),
            });
            return res.status;
        });

        expect(response).toBe(403);
    });
});
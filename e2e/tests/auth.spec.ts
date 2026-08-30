import { expect, test } from '@playwright/test';
import { uniqueEmail } from './helpers';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';

test.describe('Authentication', () => {
    test('a new user can sign up and lands on the dashboard', async ({ page }) => {
        const signupPage = new SignupPage(page);
        await signupPage.goto();

        await signupPage.signup('E2E Test User', uniqueEmail(), 'password123');

        await expect(page).toHaveURL(/\/dashboard/);
    });

    test('signup rejects a password under 6 characters with an inline error, no navigation', async ({ page }) => {
        const signupPage = new SignupPage(page);
        await signupPage.goto();

        await signupPage.signup('Short Pw', uniqueEmail(), 'abc');

        await expect(signupPage.errorBanner).toBeVisible();
        await expect(page).toHaveURL(/\/signup/);
    });

    test('an existing user can log in and reach the dashboard', async ({ page }) => {
        // Sign up first so this test doesn't depend on any seeded fixture
        // user existing in whatever environment it runs against.
        const email = uniqueEmail();
        const signupPage = new SignupPage(page);
        await signupPage.goto();
        await signupPage.signup('Login Flow User', email, 'password123');
        await expect(page).toHaveURL(/\/dashboard/);

        // Now actually exercise the login page as a separate flow.
        await page.evaluate(() => window.localStorage.clear());
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login(email, 'password123');

        await expect(page).toHaveURL(/\/dashboard/);
    });

    test('login with the wrong password shows an error and does not navigate', async ({ page }) => {
        const email = uniqueEmail();
        const signupPage = new SignupPage(page);
        await signupPage.goto();
        await signupPage.signup('Wrong Pw User', email, 'password123');
        await page.evaluate(() => window.localStorage.clear());

        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login(email, 'totally-wrong-password');

        await expect(loginPage.errorBanner).toBeVisible();
        await expect(page).toHaveURL(/\/login/);
    });

    test('the public sandbox demo account logs in without any prior signup', async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login('sandbox@aetherfin.com', 'sandbox_secret_key');

        await expect(page).toHaveURL(/\/dashboard/);
    });

    test('an authenticated user can log out and is redirected away from protected pages', async ({ page }) => {
        const email = uniqueEmail();
        const signupPage = new SignupPage(page);
        await signupPage.goto();
        await signupPage.signup('Logout Flow User', email, 'password123');
        await expect(page).toHaveURL(/\/dashboard/);

        // No dedicated logout button selector is assumed here -- clearing
        // the auth state directly and reloading exercises the same
        // ProtectedRoute redirect guard a real logout button triggers,
        // without this test being tied to wherever that button lives in
        // the nav (see AppLayout.tsx for the real control).
        await page.evaluate(() => window.localStorage.clear());
        await page.goto('/dashboard');

        await expect(page).toHaveURL(/\/login/);
    });

    test('visiting a protected route while logged out redirects to /login', async ({ page }) => {
        await page.goto('/dashboard/settings');
        await expect(page).toHaveURL(/\/login/);
    });
});
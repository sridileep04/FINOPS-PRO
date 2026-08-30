import type { Page } from '@playwright/test';

export class LoginPage {
    constructor(private page: Page) { }

    async goto() {
        await this.page.goto('/login');
    }

    async login(email: string, password: string) {
        await this.page.locator('input[type="email"]').fill(email);
        await this.page.locator('input[type="password"]').fill(password);
        await this.page.getByRole('button', { name: /sign in/i }).click();
    }

    get errorBanner() {
        // The error <div> has no test id in the app -- matched by role
        // instead since it's the only alert-like text block on this page.
        return this.page.locator('text=/Incorrect email or password|Login failed|An error occurred/');
    }
}
import type { Page } from '@playwright/test';

export class SignupPage {
    constructor(private page: Page) { }

    async goto() {
        await this.page.goto('/signup');
    }

    async signup(name: string, email: string, password: string) {
        await this.page.locator('input[type="text"]').fill(name);
        await this.page.locator('input[type="email"]').fill(email);
        await this.page.locator('input[type="password"]').fill(password);
        await this.page.getByRole('button', { name: /create account|sign up/i }).click();
    }

    get errorBanner() {
        return this.page.locator('text=/already registered|at least|failed|error/i');
    }
}
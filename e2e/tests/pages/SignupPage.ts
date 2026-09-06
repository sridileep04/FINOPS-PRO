import type { Page } from '@playwright/test';

export class SignupPage {
    constructor(private page: Page) {}

    async goto() {
        await this.page.goto('/signup');
    }

    async signup(name: string, email: string, password: string) {
        await this.page.locator('input[type="text"]').fill(name);
        await this.page.locator('input[type="email"]').fill(email);
        await this.page.locator('input[type="password"]').fill(password);
        // The real submit button reads "Get Started Free" (and "Creating
        // Account..." while the request is in flight) -- NOT "Create
        // Account" or "Sign Up", which is what this locator originally
        // (and incorrectly) searched for. Matching on type="submit"
        // instead of button text is also more resilient to future copy
        // changes than hardcoding either exact string.
        await this.page.locator('button[type="submit"]').click();
    }

    get errorBanner() {
        return this.page.locator('text=/already registered|at least|failed|error/i');
    }
}
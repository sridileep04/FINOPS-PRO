import { describe, expect, it } from 'vitest';
import { isSandboxUser, SANDBOX_EMAIL } from './sandbox';

describe('isSandboxUser', () => {
    it('is true for the exact sandbox email', () => {
        expect(isSandboxUser({ email: SANDBOX_EMAIL })).toBe(true);
    });

    it('is false for any other email', () => {
        expect(isSandboxUser({ email: 'real-customer@example.com' })).toBe(false);
    });

    it('is false for null or undefined user without throwing', () => {
        expect(isSandboxUser(null)).toBe(false);
        expect(isSandboxUser(undefined)).toBe(false);
    });

    it('is false for a user object with no email field', () => {
        expect(isSandboxUser({})).toBe(false);
    });

    it('is case-sensitive (matches the backend SANDBOX_EMAIL constant exactly)', () => {
        // If this ever needs to be case-insensitive, the backend
        // comparison in app/api/v1/endpoints/auth.py (which lowercases
        // payload.email before comparing) would need updating too --
        // this test exists so that drift between the two is caught here
        // rather than as a subtle "sandbox banner doesn't show" bug.
        expect(isSandboxUser({ email: SANDBOX_EMAIL.toUpperCase() })).toBe(false);
    });
});
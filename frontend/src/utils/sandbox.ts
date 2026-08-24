// The public "Explore Sandbox" flow (Landing.tsx `handleExploreSandbox`) logs
// into this one fixed demo account (backend: SANDBOX_EMAIL in
// app/api/v1/endpoints/auth.py) so anonymous visitors can click around
// without connecting a real AWS account. There's no live cloud data behind
// it -- see AppLayout.tsx's `demoEnvironments`.
//
// Anything that needs to behave differently for the sandbox account
// (mock environment list, which chat backend to call, etc.) should import
// `isSandboxUser` from here rather than re-checking the email string
// inline -- keeps the sandbox identity in exactly one place.
export const SANDBOX_EMAIL = 'sandbox@aetherfin.com';

export function isSandboxUser(user: { email?: string } | null | undefined): boolean {
    return user?.email === SANDBOX_EMAIL;
}
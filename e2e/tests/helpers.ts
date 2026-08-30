export function uniqueEmail(prefix = 'e2e'): string {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}
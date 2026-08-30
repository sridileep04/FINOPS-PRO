import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkAwsConnection } from './awsHealth';

describe('checkAwsConnection', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns false immediately for an empty token, without calling fetch', async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);

        const result = await checkAwsConnection('');

        expect(result).toBe(false);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('sends the token as a Bearer header', async () => {
        const fetchSpy = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ status: 'connected' }),
        });
        vi.stubGlobal('fetch', fetchSpy);

        await checkAwsConnection('my-jwt-token');

        expect(fetchSpy).toHaveBeenCalledWith(
            '/api/v1/aws/health',
            expect.objectContaining({ headers: { Authorization: 'Bearer my-jwt-token' } }),
        );
    });

    it.each(['connected', 'warning'])('returns true when status is "%s"', async (status) => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ status }),
        }));

        expect(await checkAwsConnection('token')).toBe(true);
    });

    it('returns false for a non-ok HTTP response', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

        expect(await checkAwsConnection('token')).toBe(false);
    });

    it('returns false for an unrecognized status value', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ status: 'disconnected' }),
        }));

        expect(await checkAwsConnection('token')).toBe(false);
    });

    it('returns false (not throw) when fetch itself rejects -- e.g. offline/network error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
        // Silence the expected console.error from the function's catch block.
        vi.spyOn(console, 'error').mockImplementation(() => { });

        await expect(checkAwsConnection('token')).resolves.toBe(false);
    });
});
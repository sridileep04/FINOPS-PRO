import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';

const TEST_USER = { id: 1, email: 'user@example.com', name: 'Test User', role: 'admin' };

/** A minimal consumer component that exercises the hook's full public
 * surface, so we test AuthProvider/useAuth the way real components
 * actually use them rather than reaching into internals. */
function AuthProbe() {
    const { user, token, login, logout, isLoading } = useAuth();
    return (
        <div>
            <div data-testid="loading">{String(isLoading)}</div>
            <div data-testid="user-email">{user?.email ?? 'none'}</div>
            <div data-testid="token">{token ?? 'none'}</div>
            <button onClick={() => login('  a-raw-token  ', TEST_USER)}>Log in</button>
            <button onClick={logout}>Log out</button>
        </div>
    );
}

function renderWithProvider() {
    return render(
        <AuthProvider>
            <AuthProbe />
        </AuthProvider>,
    );
}

describe('AuthProvider / useAuth', () => {
    afterEach(() => {
        window.localStorage.clear();
    });

    it('starts with no user/token and isLoading resolves to false', async () => {
        renderWithProvider();
        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
        expect(screen.getByTestId('user-email')).toHaveTextContent('none');
    });

    it('login() trims the token and persists both token and user to localStorage', async () => {
        const user = userEvent.setup();
        renderWithProvider();
        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

        await user.click(screen.getByText('Log in'));

        expect(screen.getByTestId('token')).toHaveTextContent('a-raw-token');
        expect(screen.getByTestId('user-email')).toHaveTextContent('user@example.com');
        expect(window.localStorage.getItem('token')).toBe('a-raw-token');
        expect(JSON.parse(window.localStorage.getItem('user')!)).toEqual(TEST_USER);
    });

    it('logout() clears state and localStorage', async () => {
        const user = userEvent.setup();
        renderWithProvider();
        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

        await user.click(screen.getByText('Log in'));
        await user.click(screen.getByText('Log out'));

        expect(screen.getByTestId('user-email')).toHaveTextContent('none');
        expect(window.localStorage.getItem('token')).toBeNull();
        expect(window.localStorage.getItem('user')).toBeNull();
    });

    it('rehydrates user/token from localStorage on mount (survives a page refresh)', async () => {
        window.localStorage.setItem('token', 'persisted-token');
        window.localStorage.setItem('user', JSON.stringify(TEST_USER));

        renderWithProvider();

        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
        expect(screen.getByTestId('token')).toHaveTextContent('persisted-token');
        expect(screen.getByTestId('user-email')).toHaveTextContent('user@example.com');
    });

    it('strips accidental leading/trailing quote characters from a stored token', async () => {
        // Guards against a real historical footgun: JSON.stringify-ing a
        // token before storing it (or a stray copy/paste) leaves quote
        // characters around the value, which would otherwise be sent
        // verbatim in the Authorization header and rejected by the API.
        window.localStorage.setItem('token', '"quoted-token"');
        window.localStorage.setItem('user', JSON.stringify(TEST_USER));

        renderWithProvider();

        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
        expect(screen.getByTestId('token')).toHaveTextContent('quoted-token');
    });

    it('does not crash when stored user JSON is corrupted, and continues with no user', async () => {
        window.localStorage.setItem('token', 'some-token');
        window.localStorage.setItem('user', '{not-valid-json');

        renderWithProvider();

        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
        expect(screen.getByTestId('user-email')).toHaveTextContent('none');
    });

    it('logs out automatically when an "auth:unauthorized" event fires (401 from any API call)', async () => {
        const user = userEvent.setup();
        renderWithProvider();
        await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
        await user.click(screen.getByText('Log in'));
        expect(screen.getByTestId('user-email')).toHaveTextContent('user@example.com');

        act(() => {
            window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        });

        await waitFor(() => expect(screen.getByTestId('user-email')).toHaveTextContent('none'));
        expect(window.localStorage.getItem('token')).toBeNull();
    });

    it('useAuth throws a clear error when used outside an AuthProvider', () => {
        // Prevents a confusing "Cannot read properties of undefined"
        // deep inside a component tree -- fail fast with a clear message.
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        function Broken() {
            useAuth();
            return null;
        }
        expect(() => render(<Broken />)).toThrow('useAuth must be used within an AuthProvider');
        consoleSpy.mockRestore();
    });
});
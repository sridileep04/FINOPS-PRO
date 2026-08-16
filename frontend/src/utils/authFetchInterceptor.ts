// Installed once at app bootstrap. Wraps the global fetch so that any
// 401 from our own API (e.g. an expired JWT) triggers a logout, no
// matter which page/component made the call.
const originalFetch = window.fetch;

window.fetch = async (...args: Parameters<typeof fetch>) => {
    const response = await originalFetch(...args);

    const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
    const isAuthEndpoint = url.includes('/api/v1/auth/login') || url.includes('/api/v1/auth/signup');

    if (response.status === 401 && url.includes('/api/') && !isAuthEndpoint) {
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }

    return response;
};

export { };
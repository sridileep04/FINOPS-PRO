import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// Every test in this app that touches AuthContext relies on
// localStorage as the source of truth for "am I logged in" -- without
// clearing it between tests, a token written in one test would leak
// into the next test's initial render.
afterEach(() => {
    window.localStorage.clear();
});
// Simple feature flag for runtime test helpers
export const TEST_HELPERS_ENABLED = ((): boolean => {
    try {
        // During build, process.env is inlined. Accept '1' or 'true'.
        // Checked BEFORE the production gate: the e2e production build
        // (Playwright webServer prod mode; .env.local sets the flag) rehearses
        // against a mainnet-faithful `next start` server. A real deployment
        // never sets the flag, so its build inlines `false` here and falls
        // through to the hard-off below.
        if (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_ENABLE_TEST_HELPERS) {
            const v = String(process.env.NEXT_PUBLIC_ENABLE_TEST_HELPERS).toLowerCase();
            return v === '1' || v === 'true';
        }
    } catch (e) {
        // ignore
    }
    // RA-5: Never enable test helpers in production builds absent the
    // explicit build-time opt-in above — including the URL fallback below.
    try {
        if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'production') {
            return false;
        }
    } catch { /* ignore */ }
    // Runtime fallback: enabled whenever the page is loaded with ?e2e=mock or
    // any devnet-flavored mode such as ?e2e=devnet or ?e2e=devnet-share.
    // This avoids requiring a server restart just to flip the build-time flag.
    try {
        if (typeof window !== 'undefined') {
            const v = new URLSearchParams(window.location.search).get('e2e');
            return v === 'mock' || v === 'devnet' || (typeof v === 'string' && v.startsWith('devnet-'));
        }
    } catch (e) {
        // ignore
    }
    return false;
})();

interface PendingPermitState {
    target: string;
    data: string;
}

export function windowSafe(): Window | undefined {
    if (typeof window === 'undefined') return undefined;
    return window;
}



// Simple feature flag for runtime test helpers
export const TEST_HELPERS_ENABLED = ((): boolean => {
    // RA-5: Never enable test helpers in production builds
    try {
        if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'production') {
            return false;
        }
    } catch { /* ignore */ }
    try {
        // During build, process.env is inlined. Accept '1' or 'true'.
        if (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_ENABLE_TEST_HELPERS) {
            const v = String(process.env.NEXT_PUBLIC_ENABLE_TEST_HELPERS).toLowerCase();
            return v === '1' || v === 'true';
        }
    } catch (e) {
        // ignore
    }
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

/**
 * Returns a named function from the E2E mock window object, or null if
 * test helpers are disabled or the function is not present.
 */
export function getMockFn<T = (...args: unknown[]) => unknown>(name: string): T | null {
    try {
        if (!TEST_HELPERS_ENABLED) return null;
        const _win = windowSafe();
        if (!_win) return null;
        const fn = (_win as unknown as Record<string, unknown>)[name];
        return typeof fn === 'function' ? (fn as T) : null;
    } catch {
        return null;
    }
}


export type E2EMode = "mock" | "devnet" | null;

const E2E_MODE_STORAGE_KEY = "figaro:e2e-mode";

export function getE2EModeFromSearchParams(search: string | URLSearchParams): E2EMode {
    const params = typeof search === "string"
        ? new URLSearchParams(search.startsWith("?") ? search : `?${search}`)
        : search;
    const mode = params.get("e2e");

    return mode === "mock" || mode === "devnet" ? mode : null;
}

/**
 * Detect the e2e session mode for the current page.
 *
 * The URL query string (`?e2e=mock` / `?e2e=devnet`) is the authoritative
 * source. When present it is mirrored into sessionStorage so subsequent
 * client-side navigations within the same tab still report the mode —
 * Next.js `<Link>` does not propagate query params by default, and the
 * mock event-store module is shared across all routes anyway.
 *
 * Production builds return null unless the build carried the explicit
 * NEXT_PUBLIC_ENABLE_TEST_HELPERS opt-in — the e2e rehearsal build does
 * (Playwright webServer prod mode); a real deployment never does, so its
 * build inlines the hard-off.
 */
export function getE2EModeSession(): E2EMode {
    if (typeof window === "undefined") return null;
    // Same build-time opt-in as TEST_HELPERS_ENABLED (lib/core/testHelpers.ts)
    // — parsed inline because lib/shared must not import lib/core.
    if (process.env.NODE_ENV === "production") {
        const v = String(process.env.NEXT_PUBLIC_ENABLE_TEST_HELPERS ?? "").toLowerCase();
        if (v !== "1" && v !== "true") return null;
    }

    const urlMode = getE2EModeFromSearchParams(window.location.search);
    if (urlMode) {
        try {
            window.sessionStorage.setItem(E2E_MODE_STORAGE_KEY, urlMode);
        } catch {
            // sessionStorage unavailable (e.g. private mode) — URL detection
            // alone still works for any page that carries the query param.
        }
        return urlMode;
    }

    try {
        const stored = window.sessionStorage.getItem(E2E_MODE_STORAGE_KEY);
        return stored === "mock" || stored === "devnet" ? stored : null;
    } catch {
        return null;
    }
}

export function isE2EMockSession(): boolean {
    return getE2EModeSession() === "mock";
}

export function isE2EDevnetSession(): boolean {
    return getE2EModeSession() === "devnet";
}

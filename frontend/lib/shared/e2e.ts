import { TEST_HELPERS_ENABLED } from "@/lib/shared/testHelpers";

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
    // Same-layer sibling: testHelpers.ts is lib/shared/, not lib/kernel/, so
    // importing it carries no cross-layer weight. Scoped to the production
    // branch only — TEST_HELPERS_ENABLED's own URL fallback is a MODULE-INIT-
    // TIME read of window.location.search, which would go stale across a
    // client-side navigation that adds ?e2e= after the first load; the
    // production branch never reaches that fallback (it resolves purely from
    // the build-time env var), so consulting it here is safe, and the live
    // urlMode/sessionStorage read below stays the sole source outside production.
    if (process.env.NODE_ENV === "production" && !TEST_HELPERS_ENABLED) return null;

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

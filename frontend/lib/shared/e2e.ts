export type E2EMode = "mock" | "devnet" | null;

export function getE2EModeFromSearchParams(search: string | URLSearchParams): E2EMode {
    const params = typeof search === "string"
        ? new URLSearchParams(search.startsWith("?") ? search : `?${search}`)
        : search;
    const mode = params.get("e2e");

    return mode === "mock" || mode === "devnet" ? mode : null;
}

export function getE2EModeSession(): E2EMode {
    if (typeof window === "undefined") return null;
    if (process.env.NODE_ENV === "production") return null;
    return getE2EModeFromSearchParams(window.location.search);
}

export function isE2EMockSession(): boolean {
    return getE2EModeSession() === "mock";
}

export function isE2EDevnetSession(): boolean {
    return getE2EModeSession() === "devnet";
}

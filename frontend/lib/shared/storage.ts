export function isBrowserStorageAvailable(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function readJsonStorage<T>(key: string, fallback: T): T {
    if (!isBrowserStorageAvailable()) return fallback;

    try {
        const stored = localStorage.getItem(key);
        return stored ? (JSON.parse(stored) as T) : fallback;
    } catch {
        return fallback;
    }
}

export function writeJsonStorage<T>(key: string, value: T) {
    if (!isBrowserStorageAvailable()) return;
    localStorage.setItem(key, JSON.stringify(value, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v
    ));
}

// ---------------------------------------------------------------------------
// Session-only storage (cleared when tab closes).
// Use for sensitive data like ephemeral private keys.
// ---------------------------------------------------------------------------

export function readSessionStorage<T>(key: string, fallback: T): T {
    if (typeof window === "undefined" || typeof sessionStorage === "undefined") return fallback;
    try {
        const stored = sessionStorage.getItem(key);
        return stored ? (JSON.parse(stored) as T) : fallback;
    } catch {
        return fallback;
    }
}

export function writeSessionStorage<T>(key: string, value: T) {
    if (typeof window === "undefined" || typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(key, JSON.stringify(value, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v
    ));
}

/**
 * The one web-storage seam. Every read, write, removal and key listing of
 * localStorage ("local") or sessionStorage ("session", cleared when the tab
 * closes — for sensitive data like ephemeral private keys) goes through here.
 * Storage is absent on the server, may be disabled or refused (private mode, a
 * sandboxed frame) and may be full: a read then yields its fallback, a write
 * returns `false`, and nothing throws into the caller.
 */
export type StorageArea = "local" | "session";

function storageArea(area: StorageArea): Storage | null {
    if (typeof window === "undefined") return null;
    try {
        // Reading the property itself throws where storage is blocked.
        return (area === "local" ? window.localStorage : window.sessionStorage) ?? null;
    } catch {
        return null;
    }
}

/** The stored text under `key`, or null when none is held or storage is unavailable. */
export function readStorage(key: string, area: StorageArea = "local"): string | null {
    try {
        return storageArea(area)?.getItem(key) ?? null;
    } catch {
        return null;
    }
}

/** Store `text` under `key`; false when storage is unavailable or refuses the write (quota). */
export function writeStorage(key: string, text: string, area: StorageArea = "local"): boolean {
    const storage = storageArea(area);
    if (!storage) return false;
    try {
        storage.setItem(key, text);
        return true;
    } catch {
        return false;
    }
}

export function removeStorage(key: string, area: StorageArea = "local"): void {
    try {
        storageArea(area)?.removeItem(key);
    } catch {
        // Nothing to remove where storage is unavailable.
    }
}

export function readJsonStorage<T>(key: string, fallback: T, area: StorageArea = "local"): T {
    const stored = readStorage(key, area);
    if (!stored) return fallback;
    try {
        return JSON.parse(stored) as T;
    } catch {
        return fallback;
    }
}

/** Store `value` as JSON (a bigint as its decimal string); false when the
 *  value cannot be serialized or the write is refused. */
export function writeJsonStorage<T>(key: string, value: T, area: StorageArea = "local"): boolean {
    let text: string;
    try {
        text = JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    } catch {
        return false;
    }
    return writeStorage(key, text, area);
}

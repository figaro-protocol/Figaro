/**
 * lib/shared/uriFetcher.ts
 *
 * Generic fetch+parse+cache helper for IPFS / HTTP content-addressed
 * documents. Two lib modules (`catalogueFetcher`, `merchantBranding`)
 * previously each rolled their own copy of the same pipeline:
 *
 *   if (!uri) return null;
 *   if (cache.hit) return cache.value;
 *   url = resolveContentURI(uri);
 *   doc = await safeJsonFromResponse(await fetch(url));
 *   parsed = parse(doc);
 *   cache.set(uri, parsed);
 *   return parsed;
 *
 * This module is the single source. Each fetcher becomes a 3-line wrapper
 * that supplies a `parse` function and (optionally) a TTL.
 */

import { resolveContentURI } from "@/lib/shared/merchantBranding";
import { safeJsonFromResponse } from "@/lib/shared/safeJson";

export interface UriFetcherConfig<T> {
    /**
     * Parse / validate the fetched document. Either return a parsed `T`
     * or `null` to signal "unrecognised shape, drop this URI". Throwing
     * is also acceptable — callers see null on any error.
     */
    parse: (doc: unknown, sourceLabel: string) => T | null;
    /**
     * Cache TTL in milliseconds. `Infinity` (the default) keeps entries
     * indefinitely until `invalidate(uri)` or `clear()` is called.
     */
    cacheTtlMs?: number;
    /**
     * Optional fetch override (for injected transports / tests). Defaults
     * to the global `fetch`.
     */
    fetch?: (url: string) => Promise<Response>;
}

export interface UriFetcher<T> {
    /** Fetch + parse + cache. Returns null on empty URI, fetch failure, or unrecognised shape. */
    fetch(uri: string): Promise<T | null>;
    /** Drop a single entry from the cache. Call after a write so the next read sees fresh data. */
    invalidate(uri: string): void;
    /** Drop the entire cache (for tests). */
    clear(): void;
}

interface CacheEntry<T> {
    value: T;
    ts: number;
}

/**
 * Build a fetch+parse+cache pipeline keyed by content URI. The returned
 * object has stable identity — keep it module-local so its cache survives
 * across calls.
 */
export function createUriFetcher<T>(config: UriFetcherConfig<T>): UriFetcher<T> {
    const ttl = config.cacheTtlMs ?? Number.POSITIVE_INFINITY;
    const fetcher = config.fetch ?? ((url: string) => fetch(url));
    const cache = new Map<string, CacheEntry<T>>();

    return {
        async fetch(uri: string): Promise<T | null> {
            if (!uri) return null;

            const cached = cache.get(uri);
            if (cached && Date.now() - cached.ts < ttl) {
                return cached.value;
            }

            try {
                const url = resolveContentURI(uri);
                if (!url) return null;
                const res = await fetcher(url);
                const doc = await safeJsonFromResponse(res);
                if (!doc) return null;

                const parsed = config.parse(doc, uri);
                if (parsed === null) return null;

                cache.set(uri, { value: parsed, ts: Date.now() });
                return parsed;
            } catch {
                return null;
            }
        },
        invalidate(uri: string): void {
            cache.delete(uri);
        },
        clear(): void {
            cache.clear();
        },
    };
}

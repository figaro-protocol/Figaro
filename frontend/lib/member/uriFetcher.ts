/**
 * lib/member/uriFetcher.ts
 *
 * Generic fetch+parse+cache helper for a member's own IPFS documents. The
 * one pipeline its callers (`catalogFetcher`, `memberBranding`,
 * `profileFetcher`) share:
 *
 *   if (!uri) return null;
 *   if (cache.hit) return cache.value;
 *   url = resolveMemberDocumentUri(uri);   // null for http(s)
 *   doc = await safeJsonFromResponse(await fetch(url));
 *   parsed = parse(doc);
 *   cache.set(uri, parsed);
 *   return parsed;
 *
 * This module is the single source. Each fetcher is a short wrapper
 * that supplies a `parse` function and (optionally) a TTL.
 *
 * IPFS-only, as images are (`resolveImageUri`): every URI read here is
 * chosen by a member through a permissionless registry, and a raw http(s)
 * locator would send every viewer's IP, User-Agent and timing to a host that
 * member picked. Through IPFS the viewer's own gateway answers. The write
 * path pins to IPFS and anchors `ipfs://` (`catalogPublisher`), so a profile
 * this frontend publishes always reads back; an http(s) URI reads as absent.
 * `resolveMemberDocumentUri` is that rule, exported for the member reads that
 * keep their own fetch (`discoveryService`, `useMemberBoundAssemblies`).
 */

import { fetchCappedContent, resolveContentUri } from "@/lib/shared/ipfsService";
import { safeJsonFromResponse } from "@/lib/shared/safeJson";

export interface UriFetcherConfig<T> {
    /**
     * Parse / validate the fetched document. Either return a parsed `T`
     * or `null` to signal "unrecognized shape, drop this URI". Throwing
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
    /** Fetch + parse + cache. Returns null on empty URI, fetch failure, or unrecognized shape. */
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

/** A raw http(s) locator — a host the member chose. */
function isHttpUri(uri: string): boolean {
    return uri.startsWith("http://") || uri.startsWith("https://");
}

/**
 * The gateway URL a document a member pinned is read from, or null — an
 * http(s) locator reads as absent (the viewer's request never goes to a host
 * the member chose), as does any URI `resolveContentUri` refuses.
 */
export function resolveMemberDocumentUri(uri: string): string | null {
    if (!uri || isHttpUri(uri)) return null;
    return resolveContentUri(uri);
}

/**
 * Build a fetch+parse+cache pipeline keyed by content URI. The returned
 * object has stable identity — keep it module-local so its cache survives
 * across calls.
 */
export function createUriFetcher<T>(config: UriFetcherConfig<T>): UriFetcher<T> {
    const ttl = config.cacheTtlMs ?? Number.POSITIVE_INFINITY;
    const cache = new Map<string, CacheEntry<T>>();

    return {
        async fetch(uri: string): Promise<T | null> {
            if (!uri) return null;

            const cached = cache.get(uri);
            if (cached && Date.now() - cached.ts < ttl) {
                return cached.value;
            }

            try {
                const url = resolveMemberDocumentUri(uri);
                if (!url) return null;
                // Size-capped fetch (F4): an oversized member-pinned document
                // aborts mid-stream (throws → the catch below → null). An
                // injected `config.fetch` transport is capped the same way.
                const res = await fetchCappedContent(url, { fetch: config.fetch });
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

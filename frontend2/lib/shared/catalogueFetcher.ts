/**
 * lib/shared/catalogueFetcher.ts
 *
 * Fetches the full SellerCatalogueMetadata document from a seller's metadataURI
 * (on-chain pointer → IPFS/HTTP → parsed catalogue).
 *
 * This is the read path. The write path (pin + updateProfile) lives in
 * cataloguePublisher.ts.
 */

import type { SellerCatalogueMetadata } from "@/lib/shared/sellerCatalogueMetadata";
import { parseSellerCatalogueDocument } from "@/lib/shared/sellerCatalogueMetadataParser";
import { resolveContentURI } from "@/lib/shared/merchantBranding";

// ── Cache ─────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface CacheEntry {
    data: SellerCatalogueMetadata;
    ts: number;
}

const catalogueCache = new Map<string, CacheEntry>();

/**
 * Fetch and parse the full merchant metadata (including catalogue/menu)
 * from a content URI.
 *
 * Returns null if the URI is empty, the fetch fails, or parsing fails.
 * Results are cached in-memory by URI with a 15-minute TTL.
 */
export async function fetchMerchantCatalogue(
    metadataURI: string
): Promise<SellerCatalogueMetadata | null> {
    if (!metadataURI) return null;

    const cached = catalogueCache.get(metadataURI);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

    try {
        const url = resolveContentURI(metadataURI);
        const res = await fetch(url);
        if (!res.ok) return null;

        const doc = await res.json();
        const parsed = parseSellerCatalogueDocument(doc, metadataURI);

        catalogueCache.set(metadataURI, { data: parsed, ts: Date.now() });
        return parsed;
    } catch {
        return null;
    }
}

/**
 * Invalidate a specific URI from the catalogue cache.
 * Call after publishing an update so the next read gets the new version.
 */
export function invalidateCatalogueCache(metadataURI: string): void {
    catalogueCache.delete(metadataURI);
}

/**
 * Clear the entire catalogue cache (for tests).
 */
export function clearCatalogueCache(): void {
    catalogueCache.clear();
}

/**
 * lib/shared/catalogueFetcher.ts
 *
 * Fetches the full SellerCatalogueMetadata document from a seller's
 * metadataURI (on-chain pointer → IPFS/HTTP → parsed catalogue).
 *
 * This is the read path. The write path (pin + updateProfile) lives in
 * `cataloguePublisher.ts`. Backed by the generic `createUriFetcher`
 * pipeline in `lib/shared/uriFetcher.ts`.
 */

import type { SellerCatalogueMetadata } from "@/lib/seller/sellerCatalogueMetadata";
import { parseSellerCatalogueDocument } from "@/lib/seller/sellerCatalogueMetadataParser";
import { createUriFetcher } from "@/lib/shared/uriFetcher";

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const catalogueFetcher = createUriFetcher<SellerCatalogueMetadata>({
    cacheTtlMs: CACHE_TTL_MS,
    parse: (doc, sourceLabel) => parseSellerCatalogueDocument(doc, sourceLabel),
});

/**
 * Fetch and parse the full seller metadata (including catalogue/menu)
 * from a content URI. Returns null if the URI is empty, the fetch fails,
 * or parsing fails. Results are cached in-memory by URI with a 15-minute TTL.
 */
export const fetchSellerCatalogue = catalogueFetcher.fetch;

/**
 * Invalidate a specific URI from the catalogue cache.
 * Call after publishing an update so the next read gets the new version.
 */
export const invalidateCatalogueCache = catalogueFetcher.invalidate;

/** Clear the entire catalogue cache (for tests). */
export const clearCatalogueCache = catalogueFetcher.clear;

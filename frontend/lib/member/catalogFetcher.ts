/**
 * lib/shared/catalogFetcher.ts
 *
 * Fetches the full MemberCatalogMetadata document from a member's
 * metadataURI (on-chain pointer → IPFS/HTTP → parsed catalog).
 *
 * This is the read path. The write path (pin + updateProfile) lives in
 * `catalogPublisher.ts`. Backed by the generic `createUriFetcher`
 * pipeline in `lib/member/uriFetcher.ts`.
 */

import type { MemberCatalogMetadata } from "@/lib/member/memberCatalogMetadata";
import { parseMemberCatalogDocument } from "@/lib/member/memberCatalogMetadataParser";
import { createUriFetcher } from "@/lib/member/uriFetcher";

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const catalogFetcher = createUriFetcher<MemberCatalogMetadata>({
    cacheTtlMs: CACHE_TTL_MS,
    parse: (doc, sourceLabel) => parseMemberCatalogDocument(doc, sourceLabel),
});

/**
 * Fetch and parse the full member metadata (including the catalog)
 * from a content URI. Returns null if the URI is empty, the fetch fails,
 * or parsing fails. Results are cached in-memory by URI with a 15-minute TTL.
 */
export const fetchMemberCatalog = catalogFetcher.fetch;

/**
 * Invalidate a specific URI from the catalog cache.
 * Call after publishing an update so the next read gets the new version.
 */
export const invalidateCatalogCache = catalogFetcher.invalidate;

/** Clear the entire catalog cache (for tests). */
export const clearCatalogCache = catalogFetcher.clear;

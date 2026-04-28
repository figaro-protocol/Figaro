/**
 * lib/shared/courierOfferingFetcher.ts
 *
 * Fetches the full CourierOfferingMetadata document from a courier's metadataURI
 * (on-chain pointer → IPFS/HTTP → parsed offering).
 *
 * Parallel to catalogueFetcher.ts for merchants.
 */

import type { CourierOfferingMetadata } from "@/lib/shared/courierOfferingMetadata";
import { resolveContentURI } from "@/lib/shared/merchantBranding";
import { safeJsonFromResponse } from "@/lib/shared/safeJson";

// ── Cache ─────────────────────────────────────────────────────────────────────

const offeringCache = new Map<string, CourierOfferingMetadata>();

/**
 * Fetch and parse a courier offering metadata document from a content URI.
 * Returns null if the URI is empty, the fetch fails, or the document is invalid.
 * Results are cached in-memory by URI.
 */
export async function fetchCourierOffering(
    metadataURI: string
): Promise<CourierOfferingMetadata | null> {
    if (!metadataURI) return null;

    const cached = offeringCache.get(metadataURI);
    if (cached) return cached;

    try {
        const url = resolveContentURI(metadataURI);
        const res = await fetch(url);
        const doc = await safeJsonFromResponse<Record<string, unknown> | null>(res);

        // Basic shape validation
        if (!doc || typeof doc !== "object") return null;
        if (!doc.subjectAddress || typeof doc.subjectAddress !== "string") return null;
        if (doc.archetypeId !== "courier-delivery") return null;
        if (!Array.isArray(doc.serviceAreas) || doc.serviceAreas.length === 0) return null;

        const offering = doc as unknown as CourierOfferingMetadata;
        offeringCache.set(metadataURI, offering);
        return offering;
    } catch {
        return null;
    }
}

/**
 * Invalidate a specific URI from the offering cache.
 */
export function invalidateOfferingCache(metadataURI: string): void {
    offeringCache.delete(metadataURI);
}

/**
 * Clear the entire offering cache (for tests).
 */
export function clearOfferingCache(): void {
    offeringCache.clear();
}

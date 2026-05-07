/**
 * lib/shared/courierOfferingFetcher.ts
 *
 * Fetches the full CourierOfferingMetadata document from a courier's
 * metadataURI (on-chain pointer → IPFS/HTTP → parsed offering).
 *
 * Parallel to `catalogueFetcher.ts` for merchants. Backed by the generic
 * `createUriFetcher` pipeline in `lib/shared/uriFetcher.ts`. Discriminates
 * a courier offering by structural typing (`courierId` + non-empty
 * `serviceAreas`), not by a nominal `archetypeId` literal.
 */

import type { CourierOfferingMetadata } from "@/lib/shared/courierOfferingMetadata";
import { createUriFetcher } from "@/lib/shared/uriFetcher";

function parseCourierOffering(doc: unknown): CourierOfferingMetadata | null {
    if (!doc || typeof doc !== "object") return null;
    const record = doc as Record<string, unknown>;
    if (!record.subjectAddress || typeof record.subjectAddress !== "string") return null;
    if (!record.courierId || typeof record.courierId !== "string") return null;
    if (!Array.isArray(record.serviceAreas) || record.serviceAreas.length === 0) return null;
    return record as unknown as CourierOfferingMetadata;
}

const offeringFetcher = createUriFetcher<CourierOfferingMetadata>({
    parse: parseCourierOffering,
});

/**
 * Fetch and parse a courier offering metadata document from a content URI.
 * Returns null if the URI is empty, the fetch fails, or the document is
 * not a recognisable courier offering shape. Results are cached in-memory
 * by URI.
 */
export const fetchCourierOffering = offeringFetcher.fetch;

/** Invalidate a specific URI from the offering cache. */
export const invalidateOfferingCache = offeringFetcher.invalidate;

/** Clear the entire offering cache (for tests). */
export const clearOfferingCache = offeringFetcher.clear;

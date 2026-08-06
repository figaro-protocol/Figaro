/**
 * lib/seller/memberProfileAdapter.ts
 *
 * Catalogue-items reader for the separately-pinned catalogue document at
 * `profile.catalogueURI`. Profile parsing is delegated to the canonical
 * strict parser in `memberProfileMetadata.ts`.
 */

import type { CatalogueItemMetadata } from "@/lib/seller/sellerCatalogueMetadata";

/**
 * Parse catalogue items from a catalogue document (`items`). Returns null if
 * absent. Yields the canonical `CatalogueItemMetadata` directly — there is
 * no separate adapter item type.
 */
export function tryParseCatalogueItems(doc: unknown): CatalogueItemMetadata[] | null {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
    const r = doc as Record<string, unknown>;
    const raw = Array.isArray(r.items) ? r.items : null;
    if (!raw) return null;
    return raw
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({
            id: typeof item.id === 'string' ? item.id : `item-${Math.random().toString(36).slice(2, 8)}`,
            name: typeof item.name === 'string' ? item.name : '',
            description: typeof item.description === 'string' ? item.description : undefined,
            price: typeof item.price === 'string' ? item.price : '0',
            category: typeof item.category === 'string' ? item.category : undefined,
            image: typeof item.image === 'string' ? item.image : undefined,
            available: typeof item.available === 'boolean' ? item.available : true,
            // Physical measures fold onto the cargo leaf at checkout (mass/volume
            // sum × quantity; packaged dimensions written for a single parcel).
            // Drop any one here and it silently vanishes from the committed leaf —
            // keep this symmetric with the canonical parser (sellerCatalogueMetadataParser).
            massGrams: typeof item.massGrams === 'number' ? item.massGrams : undefined,
            volumeMl: typeof item.volumeMl === 'number' ? item.volumeMl : undefined,
            lengthMm: typeof item.lengthMm === 'number' ? item.lengthMm : undefined,
            widthMm: typeof item.widthMm === 'number' ? item.widthMm : undefined,
            heightMm: typeof item.heightMm === 'number' ? item.heightMm : undefined,
            pricingPolicy: item.pricingPolicy === 'rate' ? 'rate' as const
                : item.pricingPolicy === 'fixed' ? 'fixed' as const : undefined,
            rateUnit: typeof item.rateUnit === 'string' ? item.rateUnit : undefined,
            rateQuantitySource: typeof item.rateQuantitySource === 'string' ? item.rateQuantitySource : undefined,
            // Catalogue-sourced clause values (freight class, hazmat, cold-chain,
            // a data product's license terms, …) fold onto their own leaves;
            // pass the record through structurally.
            clauseValues: item.clauseValues && typeof item.clauseValues === 'object' && !Array.isArray(item.clauseValues)
                ? (item.clauseValues as CatalogueItemMetadata['clauseValues'])
                : undefined,
            // The data this item sells (data-market listing). Same warning as
            // the physical measures: drop it here and the buyer surface loses
            // its data marking and checkout its context.
            dataSold: (() => {
                const rc = item.dataSold;
                if (!rc || typeof rc !== 'object' || Array.isArray(rc)) return undefined;
                const r2 = rc as Record<string, unknown>;
                const posture = r2.posture === 'buyer' ? 'buyer' as const
                    : r2.posture === 'seller' ? 'seller' as const : undefined;
                return typeof r2.compositionHash === 'string'
                    && /^0x[0-9a-fA-F]{64}$/.test(r2.compositionHash)
                    && typeof r2.clauseId === 'string'
                    && posture
                    ? {
                        compositionHash: r2.compositionHash as `0x${string}`,
                        clauseId: r2.clauseId,
                        posture,
                    }
                    : undefined;
            })(),
        }))
        .filter((item) => item.name.trim().length > 0);
}

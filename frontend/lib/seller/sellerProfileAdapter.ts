/**
 * lib/seller/sellerProfileAdapter.ts
 *
 * Catalogue-items reader for the separately-pinned catalogue document at
 * `profile.catalogueURI`. Profile parsing is delegated to the canonical
 * strict parser in `sellerProfileMetadata.ts`.
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
            available: typeof item.available === 'boolean' ? item.available : true,
            massGrams: typeof item.massGrams === 'number' ? item.massGrams : undefined,
            volumeMl: typeof item.volumeMl === 'number' ? item.volumeMl : undefined,
        }))
        .filter((item) => item.name.trim().length > 0);
}

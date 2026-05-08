/**
 * lib/shared/operatorProfileAdapter.ts
 *
 * Catalogue-items reader retained for the operator-profile → catalogue
 * link target. Profile parsing is delegated to the canonical strict parser
 * in `operatorProfileMetadata.ts`.
 */

export interface OperatorCatalogueItem {
    id: string;
    name: string;
    description?: string;
    price?: string;
    category?: string;
    available?: boolean;
}

/**
 * Parse catalogue items from a legacy operator-profile document. Returns null if
 * absent. Accepts items under either `items` (new shape) or `menu`
 * (legacy fat-profile shape) for backward compatibility while consumers
 * are migrating.
 */
export function tryParseCatalogueItems(doc: unknown): OperatorCatalogueItem[] | null {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
    const r = doc as Record<string, unknown>;
    const raw = Array.isArray(r.items) ? r.items : Array.isArray(r.menu) ? r.menu : null;
    if (!raw) return null;
    return raw
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({
            id: typeof item.id === 'string' ? item.id : `item-${Math.random().toString(36).slice(2, 8)}`,
            name: typeof item.name === 'string' ? item.name : '',
            description: typeof item.description === 'string' ? item.description : undefined,
            price: typeof item.price === 'string' ? item.price : undefined,
            category: typeof item.category === 'string' ? item.category : undefined,
            available: typeof item.available === 'boolean' ? item.available : true,
        }))
        .filter((item) => item.name.trim().length > 0);
}

/**
 * lib/shared/operatorProfileAdapter.ts
 *
 * Adapts the two-document structure produced by the operator onboarding
 * flow into the SellerCatalogue type used by the discovery module.
 *
 * Profile document parsing is delegated to the canonical strict parser
 * in `operatorProfileMetadata.ts`; this file holds only the SellerCatalogue
 * conversion + the bare-items reader for the catalogue link target.
 */

import type { SellerCatalogue, CatalogueItem } from '@/lib/seller/types';
import type { AcceptedTokenMetadata } from '@/lib/shared/sellerCatalogueMetadata';
import {
    OperatorProfileMetadata,
    tryParseOperatorProfileDocument,
} from '@/lib/shared/operatorProfileMetadata';

// ── Document shapes ────────────────────────────────────────────────────────────

/**
 * Re-export of the canonical profile shape under the historical name.
 * New code should import `OperatorProfileMetadata` directly.
 */
export type OperatorProfileDocument = OperatorProfileMetadata;

export interface OperatorCatalogueItem {
    id: string;
    name: string;
    description?: string;
    price?: string;
    category?: string;
    available?: boolean;
}

// ── Parsers ────────────────────────────────────────────────────────────────────

/**
 * Leniently parse an operator profile document. Returns null if it does
 * not have the expected shape (e.g. missing `name`).
 *
 * Delegates to `tryParseOperatorProfileDocument`. Retained as a thin
 * wrapper so call-sites that import this name keep working.
 */
export function tryParseOperatorProfile(doc: unknown): OperatorProfileDocument | null {
    const parsed = tryParseOperatorProfileDocument(doc);
    if (!parsed || !parsed.name.trim()) return null;
    return parsed;
}

/**
 * Parse catalogue items from a CatalogueBuilder document. Returns null if
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

// ── Conversion helpers ─────────────────────────────────────────────────────────

function serviceTypesToFulfillmentModes(serviceTypes: string[] = []): Array<'pickup' | 'delivery'> {
    const modes = new Set<'pickup' | 'delivery'>();
    for (const t of serviceTypes) {
        if (t === 'pickup' || t === 'on-site') modes.add('pickup');
        if (t === 'delivery') modes.add('delivery');
    }
    return modes.size > 0 ? [...modes] : ['pickup', 'delivery'];
}

// ── Main converter ─────────────────────────────────────────────────────────────

export function operatorProfileToCatalogue(
    address: string,
    profile: OperatorProfileDocument,
    items: OperatorCatalogueItem[],
    index: number,
): SellerCatalogue {
    const acceptedTokens: AcceptedTokenMetadata[] = (profile.acceptedTokens ?? []).map((token) => ({
        address: token.address,
        symbol: token.symbol,
        name: token.name,
    }));

    const menu: CatalogueItem[] = items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description ?? '',
        price: item.price ?? '0',
        image: '🍽️',
        category: item.category ?? 'General',
        available: item.available ?? true,
    }));

    return {
        id: `op-${address.toLowerCase().slice(2, 10)}-${index}`,
        name: profile.name,
        address,
        description: profile.description ?? '',
        specialty: profile.specialty ?? '',
        image: '🍽️',
        addressText: profile.location?.addressText,
        menu,
        acceptedTokens: acceptedTokens.length > 0 ? acceptedTokens : undefined,
        defaultTokenAddress: profile.defaultTokenAddress,
        agentServices: profile.services,
        // Fulfillment-mode declaration moved off the operator profile in
        // the schema split. Discovery-tier default until the per-assembly
        // binding-driven fulfilment model lands.
        fulfillmentModes: ['pickup', 'delivery'],
    };
}

/**
 * lib/shared/operatorProfileAdapter.ts
 *
 * Adapts the two-document structure that the operator onboarding flow produces
 * into the SellerCatalogue type used by the discovery module.
 *
 * OperatorOnboarding publishes an operator profile document (metadataURI on-chain):
 *   { name, serviceTypes, mechanisms, description, location, catalogueURI, acceptedTokens, services }
 *
 * CatalogueBuilder publishes a catalogue document (linked via catalogueURI):
 *   { version, name, denominatedIn, items: [{ id, name, description, price, category, available }] }
 *
 * Neither document matches SellerCatalogueMetadata, which is the richer format
 * used by the CatalogueEditorModule and devnet seed data.
 */

import type { SellerCatalogue, CatalogueItem } from '@/lib/seller/types';
import type { AcceptedTokenMetadata } from '@/lib/shared/sellerCatalogueMetadata';

// ── Document shapes ────────────────────────────────────────────────────────────

export interface OperatorProfileDocument {
    name: string;
    serviceTypes?: string[];
    mechanisms?: string[];
    description?: string;
    location?: string;
    catalogueURI?: string;
    acceptedTokens?: string[];
    services?: Record<string, string>;
}

export interface OperatorCatalogueItem {
    id: string;
    name: string;
    description?: string;
    price?: string;
    category?: string;
    available?: boolean;
}

// ── Parsers ────────────────────────────────────────────────────────────────────

/** Leniently parse an operator profile document. Returns null if it is not recognisable. */
export function tryParseOperatorProfile(doc: unknown): OperatorProfileDocument | null {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
    const r = doc as Record<string, unknown>;
    if (typeof r.name !== 'string' || !r.name.trim()) return null;
    return {
        name: r.name,
        serviceTypes: Array.isArray(r.serviceTypes)
            ? r.serviceTypes.filter((s): s is string => typeof s === 'string')
            : undefined,
        mechanisms: Array.isArray(r.mechanisms)
            ? r.mechanisms.filter((s): s is string => typeof s === 'string')
            : undefined,
        description: typeof r.description === 'string' ? r.description : undefined,
        location: typeof r.location === 'string' ? r.location : undefined,
        catalogueURI: typeof r.catalogueURI === 'string' ? r.catalogueURI : undefined,
        acceptedTokens: Array.isArray(r.acceptedTokens)
            ? r.acceptedTokens.filter((s): s is string => typeof s === 'string')
            : undefined,
        services:
            r.services && typeof r.services === 'object' && !Array.isArray(r.services)
                ? (r.services as Record<string, string>)
                : undefined,
    };
}

/** Parse catalogue items from a CatalogueBuilder document. Returns null if absent. */
export function tryParseCatalogueItems(doc: unknown): OperatorCatalogueItem[] | null {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
    const r = doc as Record<string, unknown>;
    if (!Array.isArray(r.items)) return null;
    return r.items
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

function inferCuisineFromItems(items: OperatorCatalogueItem[]): string {
    const first = items.find((i) => i.category?.trim());
    return first?.category ?? 'General';
}

function inferMinimumOrder(items: OperatorCatalogueItem[]): string {
    const prices = items
        .map((i) => (i.price ? parseFloat(i.price) : NaN))
        .filter((p) => !isNaN(p) && p > 0);
    return prices.length > 0 ? String(Math.min(...prices)) : '0.01';
}

// ── Main converter ─────────────────────────────────────────────────────────────

export function operatorProfileToCatalogue(
    address: string,
    profile: OperatorProfileDocument,
    items: OperatorCatalogueItem[],
    index: number,
): SellerCatalogue {
    const acceptedTokens: AcceptedTokenMetadata[] = (profile.acceptedTokens ?? []).map((addr) => ({
        address: addr as `0x${string}`,
        symbol: '',
        name: '',
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
        cuisine: inferCuisineFromItems(items),
        image: '🍽️',
        rating: 0,
        deliveryTime: '30-60 min',
        minimumOrder: inferMinimumOrder(items),
        menu,
        acceptedTokens: acceptedTokens.length > 0 ? acceptedTokens : undefined,
        fulfillmentModes: serviceTypesToFulfillmentModes(profile.serviceTypes),
    };
}

import type { PublicClient } from 'viem';
import { getActiveOperators } from '@/lib/core/indexer';
import type { SellerCatalogue } from '@/lib/seller/types';
import { MECHANISM_CONTRACTS } from '@/lib/mechanisms/contracts';
import { resolveContentURI } from '@/lib/shared/merchantBranding';
import { parseSellerCatalogueDocument } from '@/lib/shared/sellerCatalogueMetadataParser';
import type { SellerCatalogueMetadata } from '@/lib/shared/sellerCatalogueMetadata';
import {
    tryParseOperatorProfile,
    tryParseCatalogueItems,
    operatorProfileToCatalogue,
} from '@/lib/shared/operatorProfileAdapter';
import { SELLER_CATALOGUE_METADATA_RECORDS } from '@/lib/shared/runtimeIdentityRegistry';
import { safeJsonFromResponse } from '@/lib/shared/safeJson';

/** Only allow safe URI schemes for operator-declared image URLs. */
function isSafeImageURI(uri: string): boolean {
    return /^(https?:\/\/|ipfs:\/\/|\/ipfs\/)/i.test(uri);
}

export interface DiscoveryResult {
    restaurants: SellerCatalogue[];
    source: { ipfs: number; mock: number };
}

function metadataToCatalogue(
    cat: SellerCatalogueMetadata,
    index: number,
): SellerCatalogue {
    return {
        id: cat.merchantId || `ipfs-${index}`,
        name: cat.name,
        address: cat.subjectAddress,
        description: cat.description ?? '',
        cuisine: cat.cuisine ?? 'General',
        image: cat.branding?.logoURI && isSafeImageURI(cat.branding.logoURI) ? cat.branding.logoURI : '🍽️',
        rating: 0,
        deliveryTime: cat.estimatedFulfillment ?? '30-60 min',
        minimumOrder: cat.minimumOrder ?? '0.01',
        geohash: cat.location.geohash,
        menu: cat.menu.map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description ?? '',
            price: item.price,
            image: item.image ?? '🍽️',
            category: item.category,
            available: item.available,
        })),
        acceptedTokens: cat.acceptedTokens,
        fulfillmentModes: cat.fulfillmentModes,
    };
}

/**
 * Fixture catalogues projected from the runtime-identity manifest
 * (`local-runtime-identity.json`). Single canonical source for example
 * merchants — replaces the prior `MOCK_RESTAURANTS` table whose addresses
 * collided with the manifest's addresses on Anvil dev accounts.
 *
 * `source.mock` field name retained on `DiscoveryResult` for backward
 * compatibility with tests; semantically it now counts fixture catalogues
 * from the manifest, not legacy mock data.
 */
const FIXTURE_CATALOGUES: SellerCatalogue[] = SELLER_CATALOGUE_METADATA_RECORDS.map(
    (cat, index) => metadataToCatalogue(cat, index),
);

function mergeWithFixtures(registryCatalogues: SellerCatalogue[]): DiscoveryResult {
    const ipfsAddresses = new Set(registryCatalogues.map((restaurant) => restaurant.address.toLowerCase()));
    const fixturesNotCovered = FIXTURE_CATALOGUES.filter(
        (restaurant) => !ipfsAddresses.has(restaurant.address.toLowerCase()),
    );

    return {
        restaurants: [...registryCatalogues, ...fixturesNotCovered],
        source: { ipfs: registryCatalogues.length, mock: fixturesNotCovered.length },
    };
}

async function fetchOperatorAsCatalogue(
    address: string,
    metadataURI: string,
    index: number,
    fetchFn: (url: string) => Promise<Response>,
): Promise<SellerCatalogue | null> {
    const url = resolveContentURI(metadataURI);
    if (!url) return null;

    const res = await fetchFn(url);
    const doc = await safeJsonFromResponse<unknown>(res);
    if (!doc) return null;

    // Try SellerCatalogueMetadata format first (backward compat with seed data / CatalogueEditorModule)
    try {
        const cat = parseSellerCatalogueDocument(doc, metadataURI);
        return metadataToCatalogue(cat, index);
    } catch {
        // fall through to operator profile format
    }

    // Try operator profile format (OperatorOnboarding two-document structure)
    const profile = tryParseOperatorProfile(doc);
    if (!profile) return null;

    let items = tryParseCatalogueItems(doc) ?? [];

    if (profile.catalogueURI && items.length === 0) {
        try {
            const catUrl = resolveContentURI(profile.catalogueURI);
            if (catUrl) {
                const catRes = await fetchFn(catUrl);
                const catDoc = await safeJsonFromResponse<unknown>(catRes);
                if (catDoc) {
                    items = tryParseCatalogueItems(catDoc) ?? [];
                }
            }
        } catch {
            // proceed with empty items
        }
    }

    return operatorProfileToCatalogue(address, profile, items, index);
}

export interface DiscoveryService {
    isRegistryConfigured(): boolean;
    listFallbackRestaurants(): DiscoveryResult;
    listRestaurants(client: PublicClient, chainId: number): Promise<DiscoveryResult>;
}

export interface DiscoveryServiceOptions {
    fetchDocument?: (url: string) => Promise<Response>;
}

export function createDiscoveryService(
    options: DiscoveryServiceOptions = {},
): DiscoveryService {
    const fetchFn = options.fetchDocument ?? ((url: string) => fetch(url));

    const service: DiscoveryService = {
        isRegistryConfigured() {
            return !!MECHANISM_CONTRACTS.operatorRegistry && MECHANISM_CONTRACTS.operatorRegistry.length === 42;
        },
        listFallbackRestaurants() {
            return mergeWithFixtures([]);
        },
        async listRestaurants(client: PublicClient, chainId: number) {
            if (!service.isRegistryConfigured()) {
                return service.listFallbackRestaurants();
            }

            try {
                const operators = await getActiveOperators(client, chainId);

                if (operators.length === 0) {
                    return service.listFallbackRestaurants();
                }

                // Role lives in the catalogue (`archetypeId`), not on the
                // registry. fetchOperatorAsCatalogue is the gate that filters
                // out operators whose catalogue does not parse as a seller
                // catalogue — anything that does parse is shown.
                const results = await Promise.all(
                    operators.map(async (operator, index) => {
                        try {
                            if (!operator.metadataURI) return null;
                            return await fetchOperatorAsCatalogue(
                                operator.address,
                                operator.metadataURI,
                                index,
                                fetchFn,
                            );
                        } catch {
                            return null;
                        }
                    }),
                );

                const restaurants = results.filter((r): r is SellerCatalogue => r !== null);
                return mergeWithFixtures(restaurants);
            } catch {
                return service.listFallbackRestaurants();
            }
        },
    };

    return service;
}

export const DEFAULT_DISCOVERY_SERVICE: DiscoveryService = createDiscoveryService();

export { metadataToCatalogue, mergeWithFixtures };

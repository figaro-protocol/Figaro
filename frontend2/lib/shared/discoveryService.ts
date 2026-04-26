import type { PublicClient } from 'viem';
import { getActiveOperators } from '@/lib/core/indexer';
import { MOCK_RESTAURANTS } from '@/lib/marketplace/restaurants';
import type { Restaurant } from '@/lib/marketplace/types';
import { MECHANISM_CONTRACTS } from '@/lib/mechanisms/contracts';
import { resolveContentURI } from '@/lib/shared/merchantBranding';
import { parseSellerCatalogueDocument } from '@/lib/shared/sellerCatalogueMetadataParser';
import type { SellerCatalogueMetadata } from '@/lib/shared/sellerCatalogueMetadata';
import {
    tryParseOperatorProfile,
    tryParseCatalogueItems,
    operatorProfileToRestaurant,
} from '@/lib/shared/operatorProfileAdapter';

/** Only allow safe URI schemes for operator-declared image URLs. */
function isSafeImageURI(uri: string): boolean {
    return /^(https?:\/\/|ipfs:\/\/|\/ipfs\/)/i.test(uri);
}

export interface DiscoveryResult {
    restaurants: Restaurant[];
    source: { ipfs: number; mock: number };
}

function catalogueToRestaurant(
    cat: SellerCatalogueMetadata,
    index: number,
): Restaurant {
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

function mergeRestaurantsWithFallback(ipfsRestaurants: Restaurant[]): DiscoveryResult {
    const ipfsAddresses = new Set(ipfsRestaurants.map((restaurant) => restaurant.address.toLowerCase()));
    const mocksNotCovered = MOCK_RESTAURANTS.filter(
        (restaurant) => !ipfsAddresses.has(restaurant.address.toLowerCase()),
    );

    return {
        restaurants: [...ipfsRestaurants, ...mocksNotCovered],
        source: { ipfs: ipfsRestaurants.length, mock: mocksNotCovered.length },
    };
}

async function fetchOperatorAsRestaurant(
    address: string,
    metadataURI: string,
    index: number,
    fetchFn: (url: string) => Promise<Response>,
): Promise<Restaurant | null> {
    const url = resolveContentURI(metadataURI);
    if (!url) return null;

    const res = await fetchFn(url);
    if (!res.ok) return null;

    const doc = await res.json() as unknown;

    // Try SellerCatalogueMetadata format first (backward compat with seed data / CatalogueEditorModule)
    try {
        const cat = parseSellerCatalogueDocument(doc, metadataURI);
        return catalogueToRestaurant(cat, index);
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
                if (catRes.ok) {
                    const catDoc = await catRes.json() as unknown;
                    items = tryParseCatalogueItems(catDoc) ?? [];
                }
            }
        } catch {
            // proceed with empty items
        }
    }

    return operatorProfileToRestaurant(address, profile, items, index);
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
            return mergeRestaurantsWithFallback([]);
        },
        async listRestaurants(client: PublicClient, chainId: number) {
            if (!service.isRegistryConfigured()) {
                return service.listFallbackRestaurants();
            }

            try {
                const operators = await getActiveOperators(client, chainId);
                const merchants = operators.filter((operator) => operator.role === 1 || operator.role === 3);

                if (merchants.length === 0) {
                    return service.listFallbackRestaurants();
                }

                const results = await Promise.all(
                    merchants.map(async (operator, index) => {
                        try {
                            if (!operator.metadataURI) return null;
                            return await fetchOperatorAsRestaurant(
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

                const restaurants = results.filter((r): r is Restaurant => r !== null);
                return mergeRestaurantsWithFallback(restaurants);
            } catch {
                return service.listFallbackRestaurants();
            }
        },
    };

    return service;
}

export const DEFAULT_DISCOVERY_SERVICE: DiscoveryService = createDiscoveryService();

export { catalogueToRestaurant, mergeRestaurantsWithFallback };

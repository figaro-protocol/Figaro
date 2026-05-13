import type { PublicClient } from 'viem';
import { getActiveOperators } from '@/lib/core/indexer';
import type { SellerCatalogue } from '@/lib/seller/types';
import { MECHANISM_CONTRACTS } from '@/lib/mechanisms/contracts';
import { resolveContentURI } from '@/lib/shared/merchantBranding';
import type { SellerCatalogueMetadata } from '@/lib/shared/sellerCatalogueMetadata';
import {
    OperatorProfileMetadata,
    tryParseOperatorProfileDocument,
} from '@/lib/shared/operatorProfileMetadata';
import { tryParseCatalogueItems } from '@/lib/shared/operatorProfileAdapter';
import { safeJsonFromResponse } from '@/lib/shared/safeJson';

/** Only allow safe URI schemes for operator-declared image URLs. */
function isSafeImageURI(uri: string): boolean {
    return /^(https?:\/\/|ipfs:\/\/|\/ipfs\/)/i.test(uri);
}

export interface DiscoveryResult {
    catalogues: SellerCatalogue[];
    source: { ipfs: number; mock: number };
}

function profileToCatalogue(
    profile: OperatorProfileMetadata,
    catalogue: SellerCatalogueMetadata | undefined,
    index: number,
): SellerCatalogue {
    return {
        id: profile.slug || `ipfs-${index}`,
        name: profile.name,
        address: profile.subjectAddress ?? catalogue?.subjectAddress ?? '0x0',
        description: profile.description ?? '',
        specialty: profile.specialty ?? '',
        image: profile.branding?.logoURI && isSafeImageURI(profile.branding.logoURI)
            ? profile.branding.logoURI
            : '🍽️',
        geohash: profile.location?.geohash,
        addressText: profile.location?.addressText,
        menu: (catalogue?.menu ?? []).map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description ?? '',
            price: item.price,
            image: item.image ?? '🍽️',
            category: item.category,
            available: item.available,
            massGrams: item.massGrams,
            volumeMl: item.volumeMl,
            classOfService: item.classOfService,
        })),
        acceptedTokens: profile.acceptedTokens,
        defaultTokenAddress: profile.defaultTokenAddress,
        agentServices: profile.services,
        fulfillmentModes: [],
        unitSystem: catalogue?.unitSystem,
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

    // The on-chain metadataURI points to the operator profile document.
    // The profile carries identity / branding / accepted tokens, plus a
    // catalogueURI pointing to the (separately-pinned) volatile items
    // list.
    const profile = tryParseOperatorProfileDocument(doc);
    if (!profile) return null;

    // Stamp the wallet onto the profile so downstream renderers can
    // route from the listing back to /m/<address>.
    const stamped: OperatorProfileMetadata = {
        ...profile,
        subjectAddress: profile.subjectAddress ?? (address as `0x${string}`),
    };

    let items: ReturnType<typeof tryParseCatalogueItems> = null;

    // First-class items live in the catalogue document at profile.catalogueURI.
    if (profile.catalogueURI) {
        try {
            const catUrl = resolveContentURI(profile.catalogueURI);
            if (catUrl) {
                const catRes = await fetchFn(catUrl);
                const catDoc = await safeJsonFromResponse<unknown>(catRes);
                if (catDoc) {
                    items = tryParseCatalogueItems(catDoc);
                }
            }
        } catch {
            // proceed with empty items
        }
    }

    // Backward-compat: legacy fat profiles inlined the items as `menu`.
    if (!items) {
        items = tryParseCatalogueItems(doc);
    }

    const catalogue: SellerCatalogueMetadata | undefined = items && items.length > 0
        ? {
            subjectAddress: stamped.subjectAddress!,
            menu: items.map((i) => ({
                id: i.id,
                name: i.name,
                description: i.description,
                price: i.price ?? '0',
                category: i.category ?? 'General',
                available: i.available ?? true,
            })),
            version: '1.0.0',
        }
        : undefined;

    return profileToCatalogue(stamped, catalogue, index);
}

export interface DiscoveryService {
    isRegistryConfigured(): boolean;
    listCatalogues(client: PublicClient, chainId: number): Promise<DiscoveryResult>;
}

export interface DiscoveryServiceOptions {
    fetchDocument?: (url: string) => Promise<Response>;
}

const EMPTY_RESULT: DiscoveryResult = { catalogues: [], source: { ipfs: 0, mock: 0 } };

export function createDiscoveryService(
    options: DiscoveryServiceOptions = {},
): DiscoveryService {
    const fetchFn = options.fetchDocument ?? ((url: string) => fetch(url));

    const service: DiscoveryService = {
        isRegistryConfigured() {
            return !!MECHANISM_CONTRACTS.operatorRegistry && MECHANISM_CONTRACTS.operatorRegistry.length === 42;
        },
        async listCatalogues(client: PublicClient, chainId: number) {
            if (!service.isRegistryConfigured()) {
                return EMPTY_RESULT;
            }

            try {
                const operators = await getActiveOperators(client, chainId);
                if (operators.length === 0) return EMPTY_RESULT;

                // The catalogue's items signal what business the seller is
                // in; there is no nominal categorization field to filter on.
                // fetchOperatorAsCatalogue is the gate that drops operators
                // whose document doesn't parse as a seller catalogue.
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

                const catalogues = results.filter((r): r is SellerCatalogue => r !== null);
                return {
                    catalogues,
                    source: { ipfs: catalogues.length, mock: 0 },
                };
            } catch {
                return EMPTY_RESULT;
            }
        },
    };

    return service;
}

export const DEFAULT_DISCOVERY_SERVICE: DiscoveryService = createDiscoveryService();

export { profileToCatalogue };

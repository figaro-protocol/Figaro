import type { PublicClient } from 'viem';
import { getActiveSellers } from '@/lib/core/indexer';
import type { SellerCatalogue } from '@/lib/seller/types';
import { MECHANISM_CONTRACTS } from '@/lib/mechanisms/contracts';
import { resolveContentUri } from "@/lib/shared/ipfsService";
import type { SellerCatalogueMetadata } from '@/lib/seller/sellerCatalogueMetadata';
import {
    SellerProfileMetadata,
    tryParseSellerProfileDocument,
} from '@/lib/seller/sellerProfileMetadata';
import { tryParseCatalogueItems } from '@/lib/seller/sellerProfileAdapter';
import { safeJsonFromResponse } from '@/lib/shared/safeJson';

interface DiscoveryResult {
    catalogues: SellerCatalogue[];
    source: { ipfs: number; mock: number };
}

function profileToCatalogue(
    profile: SellerProfileMetadata,
    catalogue: SellerCatalogueMetadata | undefined,
): SellerCatalogue | null {
    // No address ⇒ no listing. The real path stamps the on-chain wallet onto
    // the profile (fetchSellerAsCatalogue), so this only drops genuinely
    // address-less docs — never coins a 0x0 / positional id.
    const address = profile.subjectAddress ?? catalogue?.subjectAddress;
    if (!address) return null;
    return {
        id: address.toLowerCase(),
        name: profile.name,
        address,
        description: profile.description ?? '',
        specialty: profile.specialty ?? '',
        // Absence is absence — a logo only when the seller declared a resolvable
        // one (scheme-checked by resolveContentUri, the single owner of the
        // allowlist); the UI renders a neutral placeholder otherwise.
        image: profile.branding?.logoURI && resolveContentUri(profile.branding.logoURI)
            ? profile.branding.logoURI
            : undefined,
        geohash: profile.location?.geohash,
        addressText: profile.location?.addressText,
        items: catalogue?.items ?? [],
        acceptedTokens: profile.acceptedTokens,
        defaultTokenAddress: profile.defaultTokenAddress,
        agentServices: profile.services,
        unitSystem: catalogue?.unitSystem,
    };
}

async function fetchSellerAsCatalogue(
    address: string,
    metadataURI: string,
    fetchFn: (url: string) => Promise<Response>,
): Promise<SellerCatalogue | null> {
    const url = resolveContentUri(metadataURI);
    if (!url) return null;

    const res = await fetchFn(url);
    const doc = await safeJsonFromResponse<unknown>(res);
    if (!doc) return null;

    // The on-chain metadataURI points to the seller profile document.
    // The profile carries identity / branding / accepted tokens, plus a
    // catalogueURI pointing to the (separately-pinned) volatile items
    // list.
    const profile = tryParseSellerProfileDocument(doc);
    if (!profile) return null;

    // Stamp the wallet onto the profile so downstream renderers can
    // route from the listing back to /m/<address>.
    const stamped: SellerProfileMetadata = {
        ...profile,
        subjectAddress: profile.subjectAddress ?? (address as `0x${string}`),
    };

    let items: ReturnType<typeof tryParseCatalogueItems> = null;

    // First-class items live in the catalogue document at profile.catalogueURI.
    if (profile.catalogueURI) {
        try {
            const catUrl = resolveContentUri(profile.catalogueURI);
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
            items: items,
            version: '1.0.0',
        }
        : undefined;

    return profileToCatalogue(stamped, catalogue);
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
            return !!MECHANISM_CONTRACTS.sellerRegistry && MECHANISM_CONTRACTS.sellerRegistry.length === 42;
        },
        async listCatalogues(client: PublicClient, chainId: number) {
            if (!service.isRegistryConfigured()) {
                return EMPTY_RESULT;
            }

            try {
                const sellers = await getActiveSellers(client, chainId);
                if (sellers.length === 0) return EMPTY_RESULT;

                // The catalogue's items signal what business the seller is
                // in; there is no nominal categorization field to filter on.
                // fetchSellerAsCatalogue is the gate that drops sellers
                // whose document doesn't parse as a seller catalogue.
                const results = await Promise.all(
                    sellers.map(async (seller) => {
                        try {
                            if (!seller.metadataURI) return null;
                            return await fetchSellerAsCatalogue(
                                seller.address,
                                seller.metadataURI,
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

;

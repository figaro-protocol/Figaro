import type { PublicClient } from 'viem';
import { getActiveSellers } from '@/lib/protocol/sellerRegistryIndexer';
import type { SellerCatalogue } from '@/lib/seller/types';
import { CONTRACTS } from "@/lib/kernel/contracts";
import { fetchCappedContent, resolveContentUri, type CappedContentResponse } from "@/lib/shared/ipfsService";
import type { SellerCatalogueMetadata } from '@/lib/seller/sellerCatalogueMetadata';
import {
    SellerProfileMetadata,
    tryParseSellerProfileDocument,
} from '@/lib/seller/sellerProfileMetadata';
import { tryParseCatalogueItems } from '@/lib/seller/sellerProfileAdapter';
import { safeJsonFromResponse } from '@/lib/shared/safeJson';

interface DiscoveryResult {
    catalogues: SellerCatalogue[];
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
        dimWeightDivisor: profile.dimWeightDivisor,
        agentServices: profile.services,
        unitSystem: catalogue?.unitSystem,
    };
}

async function fetchSellerAsCatalogue(
    address: string,
    metadataURI: string,
    fetchFn: (url: string) => Promise<CappedContentResponse>,
    publishedSlugs: ReadonlySet<string>,
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

    // The frontend's surfacing rule, applied EVENLY across every projection
    // (operator ruling 2026-07-02; extends the 2026-06-12 discover rule): the
    // contracts are permissionless — anyone can anchor any profile shape —
    // but this frontend surfaces only sellers whose profile binds ≥1 assembly
    // anchored in the AssemblyRegistry (the registry is the authority, the
    // profile an assertion). No anchored binding ⇒ absence, on /discover,
    // /s, and checkout alike.
    const hasAnchoredBinding = (profile.assemblyBindings ?? [])
        .some((b) => publishedSlugs.has(b.assemblySlug));
    if (!hasAnchoredBinding) return null;

    // Stamp the wallet onto the profile so downstream renderers can
    // route from the listing back to /s/<address>.
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
    /** `publishedSlugs` = the AssemblyRegistry's anchored slugs; the surfacing
     *  rule drops sellers without ≥1 anchored binding (applied evenly across
     *  every projection). */
    listCatalogues(client: PublicClient, chainId: number, publishedSlugs: ReadonlySet<string>): Promise<DiscoveryResult>;
}

export interface DiscoveryServiceOptions {
    fetchDocument?: (url: string) => Promise<Response>;
}

const EMPTY_RESULT: DiscoveryResult = { catalogues: [] };

export function createDiscoveryService(
    options: DiscoveryServiceOptions = {},
): DiscoveryService {
    // Size-capped fetch (F4): seller-pinned profile/catalogue documents are
    // external-party-controlled — an oversized body aborts mid-stream (throws →
    // the per-seller catch → that seller drops). An injected `fetchDocument`
    // transport is capped the same way.
    const fetchFn = (url: string) => fetchCappedContent(url, { fetch: options.fetchDocument });

    const service: DiscoveryService = {
        isRegistryConfigured() {
            return !!CONTRACTS.sellerRegistry && CONTRACTS.sellerRegistry.length === 42;
        },
        async listCatalogues(client: PublicClient, chainId: number, publishedSlugs: ReadonlySet<string>) {
            if (!service.isRegistryConfigured()) {
                return EMPTY_RESULT;
            }

            try {
                const sellers = await getActiveSellers(client, chainId);
                if (sellers.length === 0) return EMPTY_RESULT;

                // The catalogue's items signal what business the seller is
                // in; there is no nominal categorization field to filter on.
                // fetchSellerAsCatalogue is the gate that drops sellers
                // whose document doesn't parse as a seller catalogue or
                // binds no anchored assembly (the surfacing rule).
                const results = await Promise.all(
                    sellers.map(async (seller) => {
                        try {
                            if (!seller.metadataURI) return null;
                            return await fetchSellerAsCatalogue(
                                seller.address,
                                seller.metadataURI,
                                fetchFn,
                                publishedSlugs,
                            );
                        } catch {
                            return null;
                        }
                    }),
                );

                const catalogues = results.filter((r): r is SellerCatalogue => r !== null);
                return {
                    catalogues,
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

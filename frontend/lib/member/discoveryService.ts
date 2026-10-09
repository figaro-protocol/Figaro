import type { PublicClient } from 'viem';
import { getActiveMembers } from '@/lib/protocol/membersRegistryIndexer';
import type { MemberCatalog } from '@/lib/member/types';
import { CONTRACTS } from "@/lib/kernel/contracts";
import { fetchCappedContent, resolveContentUri, resolveMemberDocumentUri, type CappedContentResponse } from "@/lib/shared/ipfsService";
import type { MemberCatalogMetadata } from '@/lib/member/memberCatalogMetadata';
import {
    MemberProfileMetadata,
    tryParseMemberProfileDocument,
} from '@/lib/member/memberProfileMetadata';
import { tryParseCatalogItems } from '@/lib/member/memberProfileAdapter';
import { safeJsonFromResponse } from '@/lib/shared/safeJson';

interface DiscoveryResult {
    catalogs: MemberCatalog[];
}

function profileToCatalog(
    profile: MemberProfileMetadata,
    catalog: MemberCatalogMetadata | undefined,
): MemberCatalog | null {
    // No address ⇒ no listing. The real path stamps the on-chain wallet onto
    // the profile (fetchSellerAsCatalog), so this only drops genuinely
    // address-less docs — never coins a 0x0 / positional id.
    const address = profile.subjectAddress ?? catalog?.subjectAddress;
    if (!address) return null;
    return {
        name: profile.name,
        address,
        description: profile.description ?? '',
        specialty: profile.specialty ?? '',
        // Absence is absence — a logo only when the member declared a resolvable
        // one (scheme-checked by resolveContentUri, the single owner of the
        // allowlist); the UI renders a neutral placeholder otherwise.
        image: profile.branding?.logoURI && resolveContentUri(profile.branding.logoURI)
            ? profile.branding.logoURI
            : undefined,
        geohash: profile.location?.geohash,
        addressText: profile.location?.addressText,
        items: catalog?.items ?? [],
        acceptedTokens: profile.acceptedTokens,
        defaultTokenAddress: profile.defaultTokenAddress,
        profileClauseValues: profile.profileClauseValues,
        agentServices: profile.services,
        disclosurePolicy: profile.disclosurePolicy,
        unitSystem: catalog?.unitSystem,
    };
}

async function fetchSellerAsCatalog(
    address: string,
    metadataURI: string,
    fetchFn: (url: string) => Promise<CappedContentResponse>,
    publishedSlugs: ReadonlySet<string>,
): Promise<MemberCatalog | null> {
    // IPFS-only: the profile and its catalog are member-chosen URIs, and an
    // http(s) one reads as absent (`uriFetcher`).
    const url = resolveMemberDocumentUri(metadataURI);
    if (!url) return null;

    const res = await fetchFn(url);
    const doc = await safeJsonFromResponse<unknown>(res);
    if (!doc) return null;

    // The on-chain metadataURI points to the member profile document.
    // The profile carries identity / branding / accepted tokens, plus a
    // catalogURI pointing to the (separately-pinned) volatile items
    // list.
    const profile = tryParseMemberProfileDocument(doc);
    if (!profile) return null;

    // The frontend's surfacing rule, applied EVENLY across every projection
    // (it extends the discover rule): the
    // contracts are permissionless — anyone can anchor any profile shape —
    // but this frontend surfaces only members whose profile binds ≥1 assembly
    // anchored in the AssemblyRegistry (the registry is the authority, the
    // profile an assertion). No anchored binding ⇒ absence, on /discover,
    // /s, and checkout alike.
    const hasAnchoredBinding = (profile.assemblyBindings ?? [])
        .some((b) => publishedSlugs.has(b.assemblySlug));
    if (!hasAnchoredBinding) return null;

    // Stamp the wallet onto the profile so downstream renderers can
    // route from the listing back to /s/view?seller=<address>.
    const stamped: MemberProfileMetadata = {
        ...profile,
        subjectAddress: profile.subjectAddress ?? (address as `0x${string}`),
    };

    let items: ReturnType<typeof tryParseCatalogItems> = null;

    // First-class items live in the catalog document at profile.catalogURI.
    if (profile.catalogURI) {
        try {
            const catUrl = resolveMemberDocumentUri(profile.catalogURI);
            if (catUrl) {
                const catRes = await fetchFn(catUrl);
                const catDoc = await safeJsonFromResponse<unknown>(catRes);
                if (catDoc) {
                    items = tryParseCatalogItems(catDoc);
                }
            }
        } catch {
            // proceed with empty items
        }
    }

    const catalog: MemberCatalogMetadata | undefined = items && items.length > 0
        ? {
            subjectAddress: stamped.subjectAddress!,
            items: items,
            version: '1.0.0',
        }
        : undefined;

    return profileToCatalog(stamped, catalog);
}

export interface DiscoveryService {
    isRegistryConfigured(): boolean;
    /** `publishedSlugs` = the AssemblyRegistry's anchored slugs; the surfacing
     *  rule drops members without ≥1 anchored binding (applied evenly across
     *  every projection). */
    listCatalogs(client: PublicClient, chainId: number, publishedSlugs: ReadonlySet<string>): Promise<DiscoveryResult>;
}

export interface DiscoveryServiceOptions {
    fetchDocument?: (url: string) => Promise<Response>;
}

const EMPTY_RESULT: DiscoveryResult = { catalogs: [] };

export function createDiscoveryService(
    options: DiscoveryServiceOptions = {},
): DiscoveryService {
    // Size-capped fetch (F4): member-pinned profile/catalog documents are
    // external-party-controlled — an oversized body aborts mid-stream (throws →
    // the per-member catch → that member drops). An injected `fetchDocument`
    // transport is capped the same way.
    const fetchFn = (url: string) => fetchCappedContent(url, { fetch: options.fetchDocument });

    const service: DiscoveryService = {
        isRegistryConfigured() {
            return !!CONTRACTS.membersRegistry && CONTRACTS.membersRegistry.length === 42;
        },
        async listCatalogs(client: PublicClient, chainId: number, publishedSlugs: ReadonlySet<string>) {
            if (!service.isRegistryConfigured()) {
                return EMPTY_RESULT;
            }

            try {
                const sellers = await getActiveMembers(client, chainId);
                if (sellers.length === 0) return EMPTY_RESULT;

                // The catalog's items signal what business the member is
                // in; there is no nominal categorization field to filter on.
                // fetchSellerAsCatalog is the gate that drops members
                // whose document doesn't parse as a member catalog or
                // binds no anchored assembly (the surfacing rule).
                const results = await Promise.all(
                    sellers.map(async (seller) => {
                        try {
                            if (!seller.metadataURI) return null;
                            return await fetchSellerAsCatalog(
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

                const catalogs = results.filter((r): r is MemberCatalog => r !== null);
                return {
                    catalogs,
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

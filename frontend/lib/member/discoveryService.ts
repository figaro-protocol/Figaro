import type { PublicClient } from 'viem';
import { getActiveMembers } from '@/lib/protocol/membersRegistryIndexer';
import type { MemberCatalog } from '@/lib/member/types';
import { CONTRACTS } from "@/lib/kernel/contracts";
import { resolveMemberDocumentUri } from "@/lib/shared/ipfsService";
import type { MemberCatalogMetadata } from '@/lib/member/memberCatalogMetadata';
import type { MemberProfileMetadata } from '@/lib/member/memberProfileMetadata';
import { fetchMemberProfile } from '@/lib/member/profileFetcher';
import { fetchMemberCatalog } from '@/lib/member/catalogFetcher';

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
        // one (IPFS-only, checked by resolveMemberDocumentUri like every member
        // read; an http(s) logo is a server the reader cannot verify, so it
        // reads as absent); the UI renders a neutral placeholder otherwise.
        image: profile.branding?.logoURI && resolveMemberDocumentUri(profile.branding.logoURI)
            ? profile.branding.logoURI
            : undefined,
        geohash: profile.location?.geohash,
        addressText: profile.location?.addressText,
        items: catalog?.items ?? [],
        acceptedTokens: profile.acceptedTokens,
        defaultTokenAddress: profile.defaultTokenAddress,
        profileClauseValues: profile.profileClauseValues,
        agentServices: profile.services,
        assemblyBindings: profile.assemblyBindings,
        disclosurePolicy: profile.disclosurePolicy,
        unitSystem: catalog?.unitSystem,
    };
}

async function fetchSellerAsCatalog(
    address: string,
    metadataURI: string,
    publishedHashes: ReadonlySet<string>,
): Promise<MemberCatalog | null> {
    // The on-chain metadataURI points to the member profile document.
    // The profile carries identity / branding / accepted tokens, plus a
    // catalogURI pointing to the (separately-pinned) volatile items
    // list. Both are read through the ONE cached member-document path
    // (IPFS-only: an http(s) URI reads as absent; size-capped; parsed), and
    // a document that fails to read or parse surfaces nothing.
    const profile = await fetchMemberProfile(metadataURI);
    if (!profile) return null;

    // The frontend's surfacing rule, applied EVENLY across every projection
    // (it extends the discover rule): the
    // contracts are permissionless — anyone can anchor any profile shape —
    // but this frontend surfaces only members whose profile binds ≥1 assembly
    // anchored in the AssemblyRegistry (the registry is the authority, the
    // profile an assertion). No anchored binding ⇒ absence, on /discover,
    // /s, and checkout alike.
    const hasAnchoredBinding = (profile.assemblyBindings ?? [])
        .some((b) => publishedHashes.has(b.assemblyHash.toLowerCase()));
    if (!hasAnchoredBinding) return null;

    // Stamp the wallet onto the profile so downstream renderers can
    // route from the listing back to /s/view?seller=<address>.
    const stamped: MemberProfileMetadata = {
        ...profile,
        subjectAddress: profile.subjectAddress ?? (address as `0x${string}`),
    };

    // First-class items live in the catalog document at profile.catalogURI;
    // an absent or unreadable catalog lists the member with no items.
    const catalog = profile.catalogURI ? await fetchMemberCatalog(profile.catalogURI) : null;

    return profileToCatalog(stamped, catalog ?? undefined);
}

export interface DiscoveryService {
    isRegistryConfigured(): boolean;
    /** `publishedHashes` = the AssemblyRegistry's anchored composition
     *  hashes, lowercased; the surfacing rule drops members without ≥1
     *  anchored binding (applied evenly across every projection). */
    listCatalogs(client: PublicClient, chainId: number, publishedHashes: ReadonlySet<string>): Promise<DiscoveryResult>;
}

const EMPTY_RESULT: DiscoveryResult = { catalogs: [] };

export function createDiscoveryService(): DiscoveryService {
    const service: DiscoveryService = {
        isRegistryConfigured() {
            return !!CONTRACTS.membersRegistry && CONTRACTS.membersRegistry.length === 42;
        },
        async listCatalogs(client: PublicClient, chainId: number, publishedHashes: ReadonlySet<string>) {
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
                                publishedHashes,
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

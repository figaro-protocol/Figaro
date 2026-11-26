/**
 * lib/registries/useMemberListings.ts
 *
 * Discover-side counterpart to `useRegisteredCatalogs`. Reads
 * registered members from the on-chain `MembersRegistry` (via
 * event logs), fetches each member's profile JSON from IPFS,
 * CROSS-CHECKS each profile's claimed assembly bindings against the
 * ProcessRegistry (the registry is the authority — only members with
 * ≥1 anchored binding surface, and only their anchored bindings render),
 * and projects them into the generic `Listing` shape consumed by
 * `MemberDiscovery`. The listings are a `NetworkRead`: `present([])` when no
 * member is registered (the consumer renders its plain empty state);
 * `absent` when the MembersRegistry read, or the ProcessRegistry read the
 * bindings are checked against, failed, or no registry is configured — the
 * consumer renders nothing for it.
 */
"use client";

import {
    profileToListing,
    type Listing,
} from "@/lib/registries/memberListing";
import { getActiveMembers } from "@/lib/registries/membersRegistryIndexer";
import { fetchMemberProfile } from "@/lib/registries/profileFetcher";
import type { PublicClient } from "viem";
import { REGISTRY_CONTRACTS } from "@/lib/registries/contracts";
import { usePublishedCheckedRead } from "@/lib/registries/usePublishedCheckedRead";
import type { NetworkRead } from "@/lib/shared/networkRead";

function isRegistryConfigured(): boolean {
    return !!REGISTRY_CONTRACTS.membersRegistry
        && REGISTRY_CONTRACTS.membersRegistry.length === 42;
}

async function fetchProfileAsListing(
    address: string,
    metadataURI: string,
    publishedHashes: Set<string>,
): Promise<Listing | null> {
    const profile = await fetchMemberProfile(metadataURI);
    if (!profile) return null;
    const listing = profileToListing(profile, address);
    // Cross-check the profile's CLAIMED bindings against the
    // ProcessRegistry — the registry is the authority, the profile is an
    // assertion. Only anchored bindings survive; a member with none does
    // not surface on discover at all (no member
    // without a properly anchored assembly).
    const anchored = listing.bindings.filter((b) => publishedHashes.has(b.assemblyHash.toLowerCase()));
    if (anchored.length === 0) return null;
    return { ...listing, bindings: anchored };
}

async function listFromRegistry(
    client: PublicClient,
    chainId: number,
    publishedHashes: Set<string>,
): Promise<Listing[]> {
    const sellers = await getActiveMembers(client, chainId);
    if (sellers.length === 0) return [];
    const results = await Promise.all(
        sellers.map((op) => fetchProfileAsListing(op.address, op.metadataURI, publishedHashes)),
    );
    return results.filter((l): l is Listing => l !== null);
}

export function useMemberListings(): { read: NetworkRead<Listing[]> } {
    // The profile bindings are cross-checked against the ProcessRegistry
    // read: a failed assembly read never rejects every binding into
    // "nothing is registered".
    const read = usePublishedCheckedRead(
        "useMemberListings",
        isRegistryConfigured(),
        listFromRegistry,
        [],
    );
    return { read };
}

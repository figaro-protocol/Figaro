/**
 * lib/member/useMemberListings.ts
 *
 * Discover-side counterpart to `useRegisteredCatalogs`. Reads
 * registered members from the on-chain `MembersRegistry` (via
 * event logs), fetches each member's profile JSON from IPFS,
 * CROSS-CHECKS each profile's claimed assembly bindings against the
 * AssemblyRegistry (the registry is the authority — only members with
 * ≥1 anchored binding surface, and only their anchored bindings render),
 * and projects them into the generic `Listing` shape consumed by
 * `MemberDiscovery`. The listings are a `NetworkRead`: `present([])` when no
 * member is registered (the consumer renders its plain empty state);
 * `absent` when the MembersRegistry read, or the AssemblyRegistry read the
 * bindings are checked against, failed, or no registry is configured — the
 * consumer renders nothing for it.
 */
"use client";

import { useEffect, useState } from "react";
import { usePublicClient, useChainId } from "wagmi";
import {
    profileToListing,
    type Listing,
} from "@/lib/member/memberListing";
import { getActiveMembers } from "@/lib/protocol/membersRegistryIndexer";
import { fetchMemberProfile } from "@/lib/member/profileFetcher";
import type { PublicClient } from "viem";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { usePublishedAssemblies } from "@/lib/protocol/useAssemblyRegistry";
import { ABSENT, PENDING, readNetwork, type NetworkRead } from "@/lib/shared/networkRead";

function isRegistryConfigured(): boolean {
    return !!CONTRACTS.membersRegistry
        && CONTRACTS.membersRegistry.length === 42;
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
    // AssemblyRegistry — the registry is the authority, the profile is an
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
    const [read, setRead] = useState<NetworkRead<Listing[]>>(PENDING);
    const client = usePublicClient();
    const chainId = useChainId();
    // The AssemblyRegistry read the profile bindings are cross-checked
    // against. Pending is pending and absent is absent: the unchecked member
    // list is never rendered, and a failed assembly read never rejects every
    // binding into "nothing is registered".
    const { read: publishedAssemblies } = usePublishedAssemblies(undefined);

    useEffect(() => {
        if (!client || !isRegistryConfigured()) {
            setRead(ABSENT);
            return;
        }
        if (publishedAssemblies.status !== "present") {
            setRead(publishedAssemblies);
            return;
        }
        const publishedHashes = new Set(publishedAssemblies.value.map((a) => a.assemblyHash.toLowerCase()));

        let canceled = false;
        void readNetwork("useMemberListings", () => listFromRegistry(client, chainId, publishedHashes)).then((next) => {
            if (!canceled) setRead(next);
        });

        return () => {
            canceled = true;
        };
    }, [client, chainId, publishedAssemblies]);

    return { read };
}

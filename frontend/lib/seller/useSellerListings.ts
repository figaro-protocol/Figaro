/**
 * lib/mechanisms/useSellerListings.ts
 *
 * Discover-side counterpart to `useRegisteredCatalogues`. Reads
 * registered sellers from the on-chain `MembersRegistry` (via
 * event logs), fetches each seller's profile JSON from IPFS,
 * CROSS-CHECKS each profile's claimed assembly bindings against the
 * AssemblyRegistry (the registry is the authority — only sellers with
 * ≥1 anchored binding surface, and only their anchored bindings render),
 * and projects them into the generic `Listing` shape consumed by
 * `SellerDiscovery`. Returns an empty list when the registry isn't
 * configured or no sellers are registered — the consumer renders
 * the "no sellers yet" CTA.
 */
"use client";

import { useEffect, useState } from "react";
import { usePublicClient, useChainId } from "wagmi";
import {
    profileToListing,
    type Listing,
} from "@/lib/seller/sellerListing";
import { getActiveSellers } from "@/lib/protocol/membersRegistryIndexer";
import { fetchMemberProfile } from "@/lib/seller/profileFetcher";
import type { PublicClient } from "viem";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { usePublishedAssemblies } from "@/lib/protocol/useAssemblyRegistry";

export interface UseSellerListingsResult {
    listings: Listing[];
    isLoading: boolean;
}

const EMPTY_RESULT: UseSellerListingsResult = {
    listings: [],
    isLoading: false,
};

function isRegistryConfigured(): boolean {
    return !!CONTRACTS.membersRegistry
        && CONTRACTS.membersRegistry.length === 42;
}

async function fetchProfileAsListing(
    address: string,
    metadataURI: string,
    publishedSlugs: Set<string>,
): Promise<Listing | null> {
    const profile = await fetchMemberProfile(metadataURI);
    if (!profile) return null;
    const listing = profileToListing(profile, address);
    // Cross-check the profile's CLAIMED bindings against the
    // AssemblyRegistry — the registry is the authority, the profile is an
    // assertion. Only anchored bindings survive; a seller with none does
    // not surface on discover at all (user rule 2026-06-12: no seller
    // without a properly anchored assembly).
    const anchored = listing.bindings.filter((b) => publishedSlugs.has(b.assemblySlug));
    if (anchored.length === 0) return null;
    return { ...listing, bindings: anchored };
}

async function listFromRegistry(
    client: PublicClient,
    chainId: number,
    publishedSlugs: Set<string>,
): Promise<Listing[]> {
    const sellers = await getActiveSellers(client, chainId);
    if (sellers.length === 0) return [];
    const results = await Promise.all(
        sellers.map((op) => fetchProfileAsListing(op.address, op.metadataURI, publishedSlugs)),
    );
    return results.filter((l): l is Listing => l !== null);
}

export function useSellerListings(): UseSellerListingsResult {
    const [state, setState] = useState<UseSellerListingsResult>(EMPTY_RESULT);
    const client = usePublicClient();
    const chainId = useChainId();
    // The AssemblyRegistry read the profile bindings are cross-checked
    // against. `null` = the registry is still being read — that is LOADING,
    // not absence: the unchecked seller list is never rendered (NO FALLBACKS).
    const { data: publishedAssemblies } = usePublishedAssemblies(undefined);

    useEffect(() => {
        if (!client || !isRegistryConfigured()) {
            setState(EMPTY_RESULT);
            return;
        }
        if (publishedAssemblies === null) {
            setState((prev) => ({ ...prev, isLoading: true }));
            return;
        }
        const publishedSlugs = new Set(publishedAssemblies.map((a) => a.slug));

        let cancelled = false;
        setState((prev) => ({ ...prev, isLoading: true }));

        listFromRegistry(client, chainId, publishedSlugs)
            .then((fromRegistry) => {
                if (cancelled) return;
                setState({
                    listings: fromRegistry,
                    isLoading: false,
                });
            })
            .catch(() => {
                if (cancelled) return;
                setState(EMPTY_RESULT);
            });

        return () => {
            cancelled = true;
        };
    }, [client, chainId, publishedAssemblies]);

    return state;
}

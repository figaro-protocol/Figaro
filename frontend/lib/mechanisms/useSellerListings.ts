/**
 * lib/mechanisms/useSellerListings.ts
 *
 * Discover-side counterpart to `useRegisteredCatalogues`. Reads
 * registered sellers from the on-chain `SellerRegistry` (via
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
} from "@/lib/shared/sellerListing";
import { getActiveSellers } from "@/lib/core/indexer";
import { createUriFetcher } from "@/lib/shared/uriFetcher";
import { tryParseSellerProfileDocument } from "@/lib/shared/sellerProfileMetadata";
import type { PublicClient } from "viem";
import { MECHANISM_CONTRACTS } from "@/lib/mechanisms/contracts";
import { usePublishedAssemblies } from "@/lib/mechanisms/useAssemblyRegistry";

export interface UseSellerListingsResult {
    listings: Listing[];
    isLoading: boolean;
    /** Provenance counters retained for transcript / surface compatibility.
     *  `fixture` stays 0 in live mode; only `registry` is populated. */
    source: { registry: number; fixture: number };
}

const EMPTY_RESULT: UseSellerListingsResult = {
    listings: [],
    isLoading: false,
    source: { registry: 0, fixture: 0 },
};

function isRegistryConfigured(): boolean {
    return !!MECHANISM_CONTRACTS.sellerRegistry
        && MECHANISM_CONTRACTS.sellerRegistry.length === 42;
}

const profileFetcher = createUriFetcher({
    parse: (doc) => tryParseSellerProfileDocument(doc),
});

async function fetchProfileAsListing(
    address: string,
    metadataURI: string,
    publishedSlugs: Set<string>,
): Promise<Listing | null> {
    const profile = await profileFetcher.fetch(metadataURI);
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
                    source: { registry: fromRegistry.length, fixture: 0 },
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

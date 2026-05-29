/**
 * lib/mechanisms/useSellerListings.ts
 *
 * Discover-side counterpart to `useRegisteredCatalogues`. Reads
 * registered sellers from the on-chain `SellerRegistry` (via
 * event logs), fetches each seller's profile JSON from IPFS, and
 * projects them into the generic `Listing` shape consumed by
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
import { resolveContentUri } from "@/lib/shared/ipfsService";
import { safeJsonFromResponse } from "@/lib/shared/safeJson";
import { tryParseSellerProfileDocument } from "@/lib/shared/sellerProfileMetadata";
import type { PublicClient } from "viem";
import { MECHANISM_CONTRACTS } from "@/lib/mechanisms/contracts";

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

async function fetchProfileAsListing(
    address: string,
    metadataURI: string,
): Promise<Listing | null> {
    const url = resolveContentUri(metadataURI);
    if (!url) return null;
    try {
        const res = await fetch(url);
        const doc = await safeJsonFromResponse<unknown>(res);
        if (!doc) return null;
        const profile = tryParseSellerProfileDocument(doc);
        if (!profile) return null;
        return profileToListing(profile, address);
    } catch {
        return null;
    }
}

async function listFromRegistry(client: PublicClient, chainId: number): Promise<Listing[]> {
    const sellers = await getActiveSellers(client, chainId);
    if (sellers.length === 0) return [];
    const results = await Promise.all(
        sellers.map((op) => fetchProfileAsListing(op.address, op.metadataURI)),
    );
    return results.filter((l): l is Listing => l !== null);
}

export function useSellerListings(): UseSellerListingsResult {
    const [state, setState] = useState<UseSellerListingsResult>(EMPTY_RESULT);
    const client = usePublicClient();
    const chainId = useChainId();

    useEffect(() => {
        if (!client || !isRegistryConfigured()) {
            setState(EMPTY_RESULT);
            return;
        }

        let cancelled = false;
        setState((prev) => ({ ...prev, isLoading: true }));

        listFromRegistry(client, chainId)
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
    }, [client, chainId]);

    return state;
}

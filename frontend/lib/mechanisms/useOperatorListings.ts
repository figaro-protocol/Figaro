/**
 * lib/mechanisms/useOperatorListings.ts
 *
 * Discover-side counterpart to `useRegisteredCatalogues`. Reads
 * registered operators from the on-chain `OperatorRegistry` (via
 * event logs), fetches each operator's profile JSON from IPFS, and
 * projects them into the generic `Listing` shape consumed by
 * `OperatorDiscovery`. Returns an empty list when the registry isn't
 * configured or no operators are registered — the consumer renders
 * the "no operators yet" CTA.
 */
"use client";

import { useEffect, useState } from "react";
import { usePublicClient, useChainId } from "wagmi";
import {
    profileToListing,
    type Listing,
} from "@/lib/shared/operatorListing";
import { getActiveOperators } from "@/lib/core/indexer";
import { resolveContentURI } from "@/lib/shared/sellerBranding";
import { safeJsonFromResponse } from "@/lib/shared/safeJson";
import { tryParseOperatorProfileDocument } from "@/lib/shared/operatorProfileMetadata";
import type { PublicClient } from "viem";
import { MECHANISM_CONTRACTS } from "@/lib/mechanisms/contracts";

export interface UseOperatorListingsResult {
    listings: Listing[];
    isLoading: boolean;
    /** Provenance counters retained for transcript / surface compatibility.
     *  `fixture` stays 0 in live mode; only `registry` is populated. */
    source: { registry: number; fixture: number };
}

const EMPTY_RESULT: UseOperatorListingsResult = {
    listings: [],
    isLoading: false,
    source: { registry: 0, fixture: 0 },
};

function isRegistryConfigured(): boolean {
    return !!MECHANISM_CONTRACTS.operatorRegistry
        && MECHANISM_CONTRACTS.operatorRegistry.length === 42;
}

async function fetchProfileAsListing(
    address: string,
    metadataURI: string,
): Promise<Listing | null> {
    const url = resolveContentURI(metadataURI);
    if (!url) return null;
    try {
        const res = await fetch(url);
        const doc = await safeJsonFromResponse<unknown>(res);
        if (!doc) return null;
        const profile = tryParseOperatorProfileDocument(doc);
        if (!profile) return null;
        return profileToListing(profile, address);
    } catch {
        return null;
    }
}

async function listFromRegistry(client: PublicClient, chainId: number): Promise<Listing[]> {
    const operators = await getActiveOperators(client, chainId);
    if (operators.length === 0) return [];
    const results = await Promise.all(
        operators.map((op) => fetchProfileAsListing(op.address, op.metadataURI)),
    );
    return results.filter((l): l is Listing => l !== null);
}

export function useOperatorListings(): UseOperatorListingsResult {
    const [state, setState] = useState<UseOperatorListingsResult>(EMPTY_RESULT);
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

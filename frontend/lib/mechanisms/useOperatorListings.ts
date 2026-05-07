/**
 * lib/mechanisms/useOperatorListings.ts
 *
 * Discover-side counterpart to `useRegisteredCatalogues`. Reads
 * registered operators from the on-chain `OperatorRegistry` (via
 * event logs), fetches each operator's profile JSON from IPFS, and
 * projects them into the generic `Listing` shape consumed by
 * `OperatorDiscovery`. Falls back to the bundled runtime-identity
 * fixtures when no registry is configured or no operators are
 * registered. On-chain registrations take precedence over fixture
 * seeds for the same wallet.
 *
 * Mirror of `useRegisteredCatalogues` deliberately — discovery has
 * two surfaces (`/discover` listings and `/m/[merchant]` catalogues)
 * and they need to read the same on-chain source of truth.
 */
"use client";

import { useEffect, useState } from "react";
import { usePublicClient, useChainId } from "wagmi";
import {
    listOperatorsFromRuntimeIdentity,
    mergeListings,
    profileToListing,
    type Listing,
} from "@/lib/shared/operatorListing";
import { getActiveOperators } from "@/lib/core/indexer";
import { resolveContentURI } from "@/lib/shared/merchantBranding";
import { safeJsonFromResponse } from "@/lib/shared/safeJson";
import { tryParseOperatorProfileDocument } from "@/lib/shared/operatorProfileMetadata";
import type { PublicClient } from "viem";
import { MECHANISM_CONTRACTS } from "@/lib/mechanisms/contracts";

export interface UseOperatorListingsResult {
    listings: Listing[];
    isLoading: boolean;
    source: { registry: number; fixture: number };
}

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
    const fixtures = listOperatorsFromRuntimeIdentity();
    const [state, setState] = useState<UseOperatorListingsResult>({
        listings: fixtures,
        isLoading: false,
        source: { registry: 0, fixture: fixtures.length },
    });
    const client = usePublicClient();
    const chainId = useChainId();

    useEffect(() => {
        if (!client || !isRegistryConfigured()) {
            setState({
                listings: fixtures,
                isLoading: false,
                source: { registry: 0, fixture: fixtures.length },
            });
            return;
        }

        let cancelled = false;
        setState((prev) => ({ ...prev, isLoading: true }));

        listFromRegistry(client, chainId)
            .then((fromRegistry) => {
                if (cancelled) return;
                const merged = mergeListings(fromRegistry, fixtures);
                setState({
                    listings: merged,
                    isLoading: false,
                    source: {
                        registry: fromRegistry.length,
                        fixture: merged.length - fromRegistry.length,
                    },
                });
            })
            .catch(() => {
                if (cancelled) return;
                setState({
                    listings: fixtures,
                    isLoading: false,
                    source: { registry: 0, fixture: fixtures.length },
                });
            });

        return () => {
            cancelled = true;
        };
        // `fixtures` is recomputed each render but stable per-build, so
        // it doesn't need to be in deps; including it would loop.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client, chainId]);

    return state;
}

"use client";

/**
 * useMemberResolutionHistory — a member's public-graph resolution history, fetched
 * from the indexer. Recomputed from on-chain events on every load; nothing
 * is stored as a score. See DATA_LAYER.md §"Reputation derivation".
 */

import { useEffect, useState } from "react";
import { usePublicClient, useChainId } from "wagmi";
import { getSellerResolutionHistory, type MemberResolutionIndicators } from "@/lib/registries/memberResolutionHistory";
import { useDepsChanged } from "@/lib/shared/useDepsChanged";

export interface UseSellerResolutionHistoryResult {
    resolutionHistory: MemberResolutionIndicators | null;
    isLoading: boolean;
}

export function useMemberResolutionHistory(seller: string | undefined): UseSellerResolutionHistoryResult {
    const client = usePublicClient();
    const chainId = useChainId();
    const [resolutionHistory, setResolutionHistory] = useState<MemberResolutionIndicators | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // The synchronous resets run during render, on the render the inputs
    // change (`useDepsChanged`); the effect fetches only.
    // Keyed on whether a client is there, with the chain: the wallet library
    // keeps one client per chain, and a render may be handed a fresh object
    // for the same client (the export's prerender is), which as a key would
    // never end.
    const inputsChanged = useDepsChanged([!!client, chainId, seller]);
    if (inputsChanged) {
        if (!client || !seller) setResolutionHistory(null);
        else setIsLoading(true);
    }

    useEffect(() => {
        if (!client || !seller) return;
        let canceled = false;
        getSellerResolutionHistory(client, chainId, seller)
            .then((record) => {
                if (canceled) return;
                setResolutionHistory(record);
                setIsLoading(false);
            })
            .catch(() => {
                if (canceled) return;
                setResolutionHistory(null);
                setIsLoading(false);
            });
        return () => { canceled = true; };
    }, [client, chainId, seller]);

    return { resolutionHistory, isLoading };
}

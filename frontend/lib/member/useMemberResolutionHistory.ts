"use client";

/**
 * useMemberResolutionHistory — a member's public-graph resolution history, fetched
 * from the indexer. Recomputed from on-chain events on every load; nothing
 * is stored as a score. See DATA_LAYER.md §"Reputation derivation".
 */

import { useEffect, useState } from "react";
import { usePublicClient, useChainId } from "wagmi";
import { getSellerResolutionHistory, type MemberResolutionHistory } from "@/lib/composition/indexer";

export interface UseSellerResolutionHistoryResult {
    resolutionHistory: MemberResolutionHistory | null;
    isLoading: boolean;
}

export function useMemberResolutionHistory(seller: string | undefined): UseSellerResolutionHistoryResult {
    const client = usePublicClient();
    const chainId = useChainId();
    const [resolutionHistory, setResolutionHistory] = useState<MemberResolutionHistory | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!client || !seller) {
            setResolutionHistory(null);
            return;
        }
        let canceled = false;
        setIsLoading(true);
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

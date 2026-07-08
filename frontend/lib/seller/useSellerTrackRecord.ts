"use client";

/**
 * useSellerTrackRecord — a seller's public-graph track record, fetched
 * from the indexer. Recomputed from on-chain events on every load; nothing
 * is stored as a score. See PUBLIC_GRAPH_MODEL.md §"Reputation derivation".
 */

import { useEffect, useState } from "react";
import { usePublicClient, useChainId } from "wagmi";
import { getSellerTrackRecord, type SellerTrackRecord } from "@/lib/composition/indexer";

export interface UseSellerTrackRecordResult {
    trackRecord: SellerTrackRecord | null;
    isLoading: boolean;
}

export function useSellerTrackRecord(seller: string | undefined): UseSellerTrackRecordResult {
    const client = usePublicClient();
    const chainId = useChainId();
    const [trackRecord, setTrackRecord] = useState<SellerTrackRecord | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!client || !seller) {
            setTrackRecord(null);
            return;
        }
        let cancelled = false;
        setIsLoading(true);
        getSellerTrackRecord(client, chainId, seller)
            .then((record) => {
                if (cancelled) return;
                setTrackRecord(record);
                setIsLoading(false);
            })
            .catch(() => {
                if (cancelled) return;
                setTrackRecord(null);
                setIsLoading(false);
            });
        return () => { cancelled = true; };
    }, [client, chainId, seller]);

    return { trackRecord, isLoading };
}

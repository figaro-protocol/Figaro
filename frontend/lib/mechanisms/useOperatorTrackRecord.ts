"use client";

/**
 * useOperatorTrackRecord — an operator's public-graph track record, fetched
 * from the indexer. Recomputed from on-chain events on every load; nothing
 * is stored as a score. See PUBLIC_GRAPH_MODEL.md §"Reputation derivation".
 */

import { useEffect, useState } from "react";
import { usePublicClient, useChainId } from "wagmi";
import { getOperatorTrackRecord, type OperatorTrackRecord } from "@/lib/core/indexer";

export interface UseOperatorTrackRecordResult {
    trackRecord: OperatorTrackRecord | null;
    isLoading: boolean;
}

export function useOperatorTrackRecord(operator: string | undefined): UseOperatorTrackRecordResult {
    const client = usePublicClient();
    const chainId = useChainId();
    const [trackRecord, setTrackRecord] = useState<OperatorTrackRecord | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!client || !operator) {
            setTrackRecord(null);
            return;
        }
        let cancelled = false;
        setIsLoading(true);
        getOperatorTrackRecord(client, chainId, operator)
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
    }, [client, chainId, operator]);

    return { trackRecord, isLoading };
}

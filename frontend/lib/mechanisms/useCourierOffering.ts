/**
 * lib/mechanisms/useCourierOffering.ts
 *
 * React hook that reads a courier's metadataURI from OperatorRegistry events
 * (via the indexer), fetches and parses the CourierOfferingMetadata from IPFS.
 *
 * Parallel to useMerchantCatalogue.ts for merchants.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { usePublicClient, useChainId } from "wagmi";
import { getOperatorMetadataURI } from "@/lib/core/indexer";
import { fetchCourierOffering, invalidateOfferingCache } from "@/lib/shared/courierOfferingFetcher";
import type { CourierOfferingMetadata } from "@/lib/shared/courierOfferingMetadata";
import { extractErrorMessage } from "@/lib/shared/errors";

export interface UseCourierOfferingResult {
    offering: CourierOfferingMetadata | null;
    isLoading: boolean;
    error: string | null;
    refetch: () => void;
}

export function useCourierOffering(
    courierAddress: `0x${string}` | undefined
): UseCourierOfferingResult {
    const client = usePublicClient();
    const chainId = useChainId();
    const [offering, setOffering] = useState<CourierOfferingMetadata | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fetchKey, setFetchKey] = useState(0);

    useEffect(() => {
        if (!client || !courierAddress) {
            setOffering(null);
            setIsLoading(false);
            return;
        }

        let cancelled = false;
        setIsLoading(true);
        setError(null);

        getOperatorMetadataURI(client, chainId, courierAddress)
            .then(async (metadataURI) => {
                if (cancelled) return;
                if (!metadataURI) {
                    setOffering(null);
                    setIsLoading(false);
                    return;
                }
                const result = await fetchCourierOffering(metadataURI);
                if (!cancelled) {
                    setOffering(result);
                    setIsLoading(false);
                }
            })
            .catch((err) => {
                if (cancelled) return;
                setError(extractErrorMessage(err, "Failed to fetch courier offering"));
                setIsLoading(false);
            });

        return () => { cancelled = true; };
    }, [client, chainId, courierAddress, fetchKey]);

    const refetch = useCallback(() => {
        setFetchKey((k) => k + 1);
    }, []);

    return { offering, isLoading, error, refetch };
}

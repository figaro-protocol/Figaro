/**
 * lib/mechanisms/useDriverOffering.ts
 *
 * React hook that reads a driver's metadataURI from OperatorRegistry events
 * (via the indexer), fetches and parses the DriverOfferingMetadata from IPFS.
 *
 * Parallel to useMerchantCatalogue.ts for merchants.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { usePublicClient, useChainId } from "wagmi";
import { getOperatorMetadataURI } from "@/lib/core/indexer";
import { fetchDriverOffering, invalidateOfferingCache } from "@/lib/shared/driverOfferingFetcher";
import type { DriverOfferingMetadata } from "@/lib/shared/driverOfferingMetadata";

export interface UseDriverOfferingResult {
    offering: DriverOfferingMetadata | null;
    isLoading: boolean;
    error: string | null;
    refetch: () => void;
}

export function useDriverOffering(
    driverAddress: `0x${string}` | undefined
): UseDriverOfferingResult {
    const client = usePublicClient();
    const chainId = useChainId();
    const [offering, setOffering] = useState<DriverOfferingMetadata | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fetchKey, setFetchKey] = useState(0);

    useEffect(() => {
        if (!client || !driverAddress) {
            setOffering(null);
            setIsLoading(false);
            return;
        }

        let cancelled = false;
        setIsLoading(true);
        setError(null);

        getOperatorMetadataURI(client, chainId, driverAddress)
            .then(async (metadataURI) => {
                if (cancelled) return;
                if (!metadataURI) {
                    setOffering(null);
                    setIsLoading(false);
                    return;
                }
                const result = await fetchDriverOffering(metadataURI);
                if (!cancelled) {
                    setOffering(result);
                    setIsLoading(false);
                }
            })
            .catch((err) => {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : "Failed to fetch driver offering");
                setIsLoading(false);
            });

        return () => { cancelled = true; };
    }, [client, chainId, driverAddress, fetchKey]);

    const refetch = useCallback(() => {
        setFetchKey((k) => k + 1);
    }, []);

    return { offering, isLoading, error, refetch };
}

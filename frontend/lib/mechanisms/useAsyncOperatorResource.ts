/**
 * lib/mechanisms/useAsyncOperatorResource.ts
 *
 * Generic shape for "operator address → resolved metadataURI → fetched
 * resource" hooks. Two callers consolidate onto this:
 *   - useSellerBranding   → resolved branding
 *   - useOperatorCatalogue  → seller catalogue
 *
 * Each caller wraps this with a typed result alias and a fixed fetcher.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { usePublicClient, useChainId } from "wagmi";
import { getOperatorMetadataURI } from "@/lib/core/indexer";
import { extractErrorMessage } from "@/lib/shared/errors";

export interface UseAsyncOperatorResourceResult<T> {
    data: T | null;
    isLoading: boolean;
    error: string | null;
    /** Force re-fetch (bump the internal fetchKey). */
    refetch: () => void;
}

export interface UseAsyncOperatorResourceOptions<T> {
    /** Fetch a `T` from the resolved operator-metadata URI. */
    fetcher: (metadataURI: string) => Promise<T>;
    /** Fallback toast/error string when the fetcher throws. */
    failureMessage: string;
    /** Extra deps (e.g. a service handle) that should re-trigger the fetch. */
    extraDeps?: ReadonlyArray<unknown>;
}

export function useAsyncOperatorResource<T>(
    address: `0x${string}` | undefined,
    options: UseAsyncOperatorResourceOptions<T>,
): UseAsyncOperatorResourceResult<T> {
    const { fetcher, failureMessage, extraDeps } = options;
    const client = usePublicClient();
    const chainId = useChainId();
    const [data, setData] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fetchKey, setFetchKey] = useState(0);

    useEffect(() => {
        if (!client || !address) {
            setData(null);
            setIsLoading(false);
            setError(null);
            return;
        }
        let cancelled = false;
        setIsLoading(true);
        setError(null);

        getOperatorMetadataURI(client, chainId, address)
            .then(async (metadataURI) => {
                if (cancelled) return;
                if (!metadataURI) {
                    setData(null);
                    setIsLoading(false);
                    return;
                }
                const result = await fetcher(metadataURI);
                if (!cancelled) {
                    setData(result);
                    setIsLoading(false);
                }
            })
            .catch((err) => {
                if (cancelled) return;
                setError(extractErrorMessage(err, failureMessage));
                setIsLoading(false);
            });

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client, chainId, address, fetchKey, fetcher, failureMessage, ...(extraDeps ?? [])]);

    const refetch = useCallback(() => {
        setFetchKey((k) => k + 1);
    }, []);

    return { data, isLoading, error, refetch };
}

/**
 * lib/member/useAsyncMemberResource.ts
 *
 * Generic shape for "member address → resolved metadataURI → fetched
 * resource" hooks (e.g. useMemberBranding → resolved branding). Each caller
 * wraps this with a typed result alias and a fixed fetcher.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { usePublicClient, useChainId } from "wagmi";
import { getMemberMetadataURI } from "@/lib/protocol/membersRegistryIndexer";
import { extractErrorMessage } from "@/lib/shared/errors";
import { useDepsChanged } from "@/lib/shared/useDepsChanged";

export interface UseAsyncMemberResourceResult<T> {
    data: T | null;
    isLoading: boolean;
    error: string | null;
    /** Force re-fetch (bump the internal fetchKey). */
    refetch: () => void;
}

export interface UseAsyncMemberResourceOptions<T> {
    /** Fetch a `T` from the resolved member-metadata URI. */
    fetcher: (metadataURI: string) => Promise<T>;
    /** Fallback toast/error string when the fetcher throws. */
    failureMessage: string;
    /** Extra deps (e.g. a service handle) that should re-trigger the fetch. */
    extraDeps?: ReadonlyArray<unknown>;
}

export function useAsyncMemberResource<T>(
    address: `0x${string}` | undefined,
    options: UseAsyncMemberResourceOptions<T>,
): UseAsyncMemberResourceResult<T> {
    const { fetcher, failureMessage, extraDeps } = options;
    const client = usePublicClient();
    const chainId = useChainId();
    const [data, setData] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fetchKey, setFetchKey] = useState(0);

    // The synchronous resets run during render, on the render an input
    // changes (`useDepsChanged`); the effect fetches only.
    // Keyed on whether a client is there, with the chain: the wallet library
    // keeps one client per chain, and a render may be handed a fresh object
    // for the same client (the export's prerender is), which as a key would
    // never end.
    const inputsChanged = useDepsChanged([!!client, chainId, address, fetchKey, fetcher, failureMessage, ...(extraDeps ?? [])]);
    if (inputsChanged) {
        if (!client || !address) {
            setData(null);
            setIsLoading(false);
        } else {
            setIsLoading(true);
        }
        setError(null);
    }

    useEffect(() => {
        if (!client || !address) return;
        let canceled = false;

        getMemberMetadataURI(client, chainId, address)
            .then(async (metadataURI) => {
                if (canceled) return;
                if (!metadataURI) {
                    setData(null);
                    setIsLoading(false);
                    return;
                }
                const result = await fetcher(metadataURI);
                if (!canceled) {
                    setData(result);
                    setIsLoading(false);
                }
            })
            .catch((err) => {
                if (canceled) return;
                setError(extractErrorMessage(err, failureMessage));
                setIsLoading(false);
            });

        return () => { canceled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client, chainId, address, fetchKey, fetcher, failureMessage, ...(extraDeps ?? [])]);

    const refetch = useCallback(() => {
        setFetchKey((k) => k + 1);
    }, []);

    return { data, isLoading, error, refetch };
}

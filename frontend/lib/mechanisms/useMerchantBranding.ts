/**
 * lib/mechanisms/useMerchantBranding.ts
 *
 * React hook for resolving merchant branding from OperatorRegistry events.
 * Uses the indexer to find the latest metadataURI for a seller address,
 * fetches the metadata document, and returns resolved branding.
 */
"use client";

import { useState, useEffect } from "react";
import { usePublicClient, useChainId } from "wagmi";
import { getOperatorMetadataURI } from "@/lib/core/indexer";
import { extractErrorMessage } from "@/lib/shared/errors";
import {
    fetchMerchantBranding,
    type ResolvedMerchantBranding,
} from "@/lib/shared/merchantBranding";

export interface UseMerchantBrandingResult {
    branding: ResolvedMerchantBranding | null;
    isLoading: boolean;
    error: string | null;
}

export function useMerchantBranding(
    sellerAddress: `0x${string}` | undefined
): UseMerchantBrandingResult {
    const client = usePublicClient();
    const chainId = useChainId();
    const [branding, setBranding] = useState<ResolvedMerchantBranding | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!client || !sellerAddress) {
            setBranding(null);
            return;
        }

        let cancelled = false;
        setIsLoading(true);
        setError(null);

        getOperatorMetadataURI(client, chainId, sellerAddress)
            .then(async (metadataURI) => {
                if (cancelled) return;
                if (!metadataURI) {
                    setBranding(null);
                    setIsLoading(false);
                    return;
                }
                const result = await fetchMerchantBranding(metadataURI);
                if (!cancelled) {
                    setBranding(result);
                    setIsLoading(false);
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(extractErrorMessage(err, "Failed to fetch branding"));
                    setIsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [client, chainId, sellerAddress]);

    return { branding, isLoading, error };
}

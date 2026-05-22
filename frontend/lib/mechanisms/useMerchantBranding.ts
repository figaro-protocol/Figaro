/**
 * lib/mechanisms/useMerchantBranding.ts
 *
 * React hook for resolving merchant branding from OperatorRegistry events.
 * Uses the indexer to find the latest metadataURI for a seller address,
 * fetches the metadata document, and returns resolved branding.
 */
"use client";

import {
    fetchMerchantBranding,
    type ResolvedMerchantBranding,
} from "@/lib/shared/merchantBranding";
import { useAsyncOperatorResource } from "@/lib/mechanisms/useAsyncOperatorResource";

export interface UseMerchantBrandingResult {
    branding: ResolvedMerchantBranding | null;
    isLoading: boolean;
    error: string | null;
}

export function useMerchantBranding(
    sellerAddress: `0x${string}` | undefined
): UseMerchantBrandingResult {
    const { data, isLoading, error } = useAsyncOperatorResource(sellerAddress, {
        fetcher: fetchMerchantBranding,
        failureMessage: "Failed to fetch branding",
    });
    return { branding: data, isLoading, error };
}

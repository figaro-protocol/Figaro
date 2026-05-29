/**
 * lib/mechanisms/useSellerBranding.ts
 *
 * React hook for resolving merchant branding from SellerRegistry events.
 * Uses the indexer to find the latest metadataURI for a seller address,
 * fetches the metadata document, and returns resolved branding.
 */
"use client";

import {
    fetchSellerBranding,
    type ResolvedSellerBranding,
} from "@/lib/shared/sellerBranding";
import { useAsyncSellerResource } from "@/lib/mechanisms/useAsyncSellerResource";

export interface UseSellerBrandingResult {
    branding: ResolvedSellerBranding | null;
    isLoading: boolean;
    error: string | null;
}

export function useSellerBranding(
    sellerAddress: `0x${string}` | undefined
): UseSellerBrandingResult {
    const { data, isLoading, error } = useAsyncSellerResource(sellerAddress, {
        fetcher: fetchSellerBranding,
        failureMessage: "Failed to fetch branding",
    });
    return { branding: data, isLoading, error };
}

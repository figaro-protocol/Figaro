/**
 * lib/mechanisms/useMemberBranding.ts
 *
 * React hook for resolving seller branding from MembersRegistry events.
 * Uses the indexer to find the latest metadataURI for a seller address,
 * fetches the metadata document, and returns resolved branding.
 */
"use client";

import {
    fetchMemberBranding,
    type ResolvedMemberBranding,
} from "@/lib/seller/memberBranding";
import { useAsyncMemberResource } from "@/lib/seller/useAsyncMemberResource";

export interface UseMemberBrandingResult {
    branding: ResolvedMemberBranding | null;
    isLoading: boolean;
    error: string | null;
}

export function useMemberBranding(
    sellerAddress: `0x${string}` | undefined
): UseMemberBrandingResult {
    const { data, isLoading, error } = useAsyncMemberResource(sellerAddress, {
        fetcher: fetchMemberBranding,
        failureMessage: "Failed to fetch branding",
    });
    return { branding: data, isLoading, error };
}

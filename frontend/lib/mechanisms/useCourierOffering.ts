/**
 * lib/mechanisms/useCourierOffering.ts
 *
 * React hook that reads a courier's metadataURI from OperatorRegistry events
 * (via the indexer), fetches and parses the CourierOfferingMetadata from IPFS.
 *
 * Parallel to useMerchantCatalogue.ts for merchants.
 */
"use client";

import { fetchCourierOffering } from "@/lib/shared/courierOfferingFetcher";
import type { CourierOfferingMetadata } from "@/lib/shared/courierOfferingMetadata";
import { useAsyncMerchantResource } from "@/lib/mechanisms/useAsyncMerchantResource";

export interface UseCourierOfferingResult {
    offering: CourierOfferingMetadata | null;
    isLoading: boolean;
    error: string | null;
    refetch: () => void;
}

export function useCourierOffering(
    courierAddress: `0x${string}` | undefined
): UseCourierOfferingResult {
    const { data, isLoading, error, refetch } = useAsyncMerchantResource(courierAddress, {
        fetcher: fetchCourierOffering,
        failureMessage: "Failed to fetch courier offering",
    });
    return { offering: data, isLoading, error, refetch };
}

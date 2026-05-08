/**
 * lib/mechanisms/useMerchantCatalogue.ts
 *
 * React hook that resolves a seller's full catalogue from OperatorRegistry events.
 * Uses the indexer to find the latest metadataURI → fetches the
 * SellerCatalogueMetadata document from IPFS/HTTP → returns the parsed catalogue.
 */
"use client";

import { useMemo } from "react";
import {
    DEFAULT_CATALOGUE_SERVICE,
    type CatalogueService,
} from "@/lib/shared/catalogueService";
import type { SellerCatalogueMetadata } from "@/lib/shared/sellerCatalogueMetadata";
import { useAsyncMerchantResource } from "@/lib/mechanisms/useAsyncMerchantResource";

export interface UseMerchantCatalogueResult {
    catalogue: SellerCatalogueMetadata | null;
    isLoading: boolean;
    error: string | null;
    /** Force re-fetch (invalidate cache and re-read). Call after publishing. */
    refetch: () => void;
}

export interface UseMerchantCatalogueOptions {
    service?: CatalogueService;
}

export function useMerchantCatalogue(
    sellerAddress: `0x${string}` | undefined,
    options: UseMerchantCatalogueOptions = {},
): UseMerchantCatalogueResult {
    const service = options.service ?? DEFAULT_CATALOGUE_SERVICE;
    const fetcher = useMemo(
        () => (uri: string) => service.fetchMerchantCatalogue(uri),
        [service],
    );
    const { data, isLoading, error, refetch } = useAsyncMerchantResource(sellerAddress, {
        fetcher,
        failureMessage: "Failed to fetch catalogue",
        extraDeps: [service],
    });
    return { catalogue: data, isLoading, error, refetch };
}

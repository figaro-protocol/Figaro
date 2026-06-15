/**
 * lib/mechanisms/useSellerCatalogue.ts
 *
 * React hook that resolves a seller's full catalogue from SellerRegistry events.
 * Uses the indexer to find the latest metadataURI → fetches the
 * SellerCatalogueMetadata document from IPFS/HTTP → returns the parsed catalogue.
 */
"use client";

import { useMemo } from "react";
import {
    DEFAULT_CATALOGUE_SERVICE,
    type CatalogueService,
} from "@/lib/seller/catalogueService";
import type { SellerCatalogueMetadata } from "@/lib/seller/sellerCatalogueMetadata";
import { useAsyncSellerResource } from "@/lib/seller/useAsyncSellerResource";

export interface UseSellerCatalogueResult {
    catalogue: SellerCatalogueMetadata | null;
    isLoading: boolean;
    error: string | null;
    /** Force re-fetch (invalidate cache and re-read). Call after publishing. */
    refetch: () => void;
}

export interface UseSellerCatalogueOptions {
    service?: CatalogueService;
}

export function useSellerCatalogue(
    sellerAddress: `0x${string}` | undefined,
    options: UseSellerCatalogueOptions = {},
): UseSellerCatalogueResult {
    const service = options.service ?? DEFAULT_CATALOGUE_SERVICE;
    const fetcher = useMemo(
        () => (uri: string) => service.fetchSellerCatalogue(uri),
        [service],
    );
    const { data, isLoading, error, refetch } = useAsyncSellerResource(sellerAddress, {
        fetcher,
        failureMessage: "Failed to fetch catalogue",
        extraDeps: [service],
    });
    return { catalogue: data, isLoading, error, refetch };
}

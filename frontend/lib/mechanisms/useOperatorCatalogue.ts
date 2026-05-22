/**
 * lib/mechanisms/useOperatorCatalogue.ts
 *
 * React hook that resolves a seller's full catalogue from OperatorRegistry events.
 * Uses the indexer to find the latest metadataURI → fetches the
 * OperatorCatalogueMetadata document from IPFS/HTTP → returns the parsed catalogue.
 */
"use client";

import { useMemo } from "react";
import {
    DEFAULT_CATALOGUE_SERVICE,
    type CatalogueService,
} from "@/lib/shared/catalogueService";
import type { OperatorCatalogueMetadata } from "@/lib/shared/operatorCatalogueMetadata";
import { useAsyncOperatorResource } from "@/lib/mechanisms/useAsyncOperatorResource";

export interface UseOperatorCatalogueResult {
    catalogue: OperatorCatalogueMetadata | null;
    isLoading: boolean;
    error: string | null;
    /** Force re-fetch (invalidate cache and re-read). Call after publishing. */
    refetch: () => void;
}

export interface UseOperatorCatalogueOptions {
    service?: CatalogueService;
}

export function useOperatorCatalogue(
    sellerAddress: `0x${string}` | undefined,
    options: UseOperatorCatalogueOptions = {},
): UseOperatorCatalogueResult {
    const service = options.service ?? DEFAULT_CATALOGUE_SERVICE;
    const fetcher = useMemo(
        () => (uri: string) => service.fetchOperatorCatalogue(uri),
        [service],
    );
    const { data, isLoading, error, refetch } = useAsyncOperatorResource(sellerAddress, {
        fetcher,
        failureMessage: "Failed to fetch catalogue",
        extraDeps: [service],
    });
    return { catalogue: data, isLoading, error, refetch };
}

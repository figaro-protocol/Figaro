/**
 * lib/mechanisms/useMerchantCatalogue.ts
 *
 * React hook that resolves a seller's full catalogue from OperatorRegistry events.
 * Uses the indexer to find the latest metadataURI → fetches the
 * SellerCatalogueMetadata document from IPFS/HTTP → returns the parsed catalogue.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { usePublicClient, useChainId } from "wagmi";
import { getOperatorMetadataURI } from "@/lib/core/indexer";
import {
    DEFAULT_CATALOGUE_SERVICE,
    type CatalogueService,
} from "@/lib/shared/catalogueService";
import type { SellerCatalogueMetadata } from "@/lib/shared/sellerCatalogueMetadata";

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
    const client = usePublicClient();
    const chainId = useChainId();
    const service = options.service ?? DEFAULT_CATALOGUE_SERVICE;
    const [catalogue, setCatalogue] = useState<SellerCatalogueMetadata | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fetchKey, setFetchKey] = useState(0);

    useEffect(() => {
        if (!client || !sellerAddress) {
            setCatalogue(null);
            return;
        }

        let cancelled = false;
        setIsLoading(true);
        setError(null);

        getOperatorMetadataURI(client, chainId, sellerAddress)
            .then(async (metadataURI) => {
                if (cancelled) return;
                if (!metadataURI) {
                    setCatalogue(null);
                    setIsLoading(false);
                    return;
                }
                const result = await service.fetchMerchantCatalogue(metadataURI);
                if (!cancelled) {
                    setCatalogue(result);
                    setIsLoading(false);
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Failed to fetch catalogue");
                    setIsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [client, chainId, sellerAddress, fetchKey, service]);

    const refetch = useCallback(() => {
        // Can't easily invalidate by URI here since we don't store it,
        // but bumping fetchKey will re-run the full pipeline.
        setFetchKey((k) => k + 1);
    }, []);

    return {
        catalogue,
        isLoading,
        error,
        refetch,
    };
}

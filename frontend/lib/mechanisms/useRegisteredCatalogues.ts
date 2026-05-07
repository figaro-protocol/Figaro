/**
 * lib/mechanisms/useRegisteredCatalogues.ts
 *
 * Hook that discovers all registered operators from OperatorRegistry
 * events (via the indexer), fetches their catalogues from IPFS, and
 * projects them to the buyer-side `SellerCatalogue` UI type for the
 * discovery module. Plural-of-wallets — each wallet has at most one
 * catalogue.
 *
 * Falls back to bundled fixture data when no registry is configured
 * or when no operators are registered.
 */
"use client";

import { useState, useEffect } from "react";
import { usePublicClient, useChainId } from "wagmi";
import type { SellerCatalogue } from "@/lib/seller/types";
import {
    DEFAULT_DISCOVERY_SERVICE,
    type DiscoveryService,
} from "@/lib/shared/discoveryService";

export interface UseRegisteredCataloguesResult {
    /** Merged catalogue list: IPFS-fetched catalogues + bundled fixture fallbacks */
    catalogues: SellerCatalogue[];
    /** Whether the registry is being queried */
    isLoading: boolean;
    /** How many catalogues came from IPFS vs bundled fixture data */
    source: { ipfs: number; mock: number };
}

export interface UseRegisteredCataloguesOptions {
    service?: DiscoveryService;
}

export function useRegisteredCatalogues(
    options: UseRegisteredCataloguesOptions = {},
): UseRegisteredCataloguesResult {
    const service = options.service ?? DEFAULT_DISCOVERY_SERVICE;
    const [discoveryResult, setDiscoveryResult] = useState<UseRegisteredCataloguesResult>({
        catalogues: service.listFallbackCatalogues().catalogues,
        isLoading: false,
        source: service.listFallbackCatalogues().source,
    });
    const [isLoading, setIsLoading] = useState(false);
    const client = usePublicClient();
    const chainId = useChainId();

    useEffect(() => {
        if (!client || !service.isRegistryConfigured()) {
            setDiscoveryResult({
                ...service.listFallbackCatalogues(),
                isLoading: false,
            });
            return;
        }

        let cancelled = false;
        setIsLoading(true);

        service.listCatalogues(client, chainId)
            .then((result) => {
                if (cancelled) return;
                setDiscoveryResult({
                    ...result,
                    isLoading: false,
                });
                setIsLoading(false);
            })
            .catch(() => {
                if (!cancelled) {
                    setDiscoveryResult({
                        ...service.listFallbackCatalogues(),
                        isLoading: false,
                    });
                    setIsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [client, chainId, service]);

    return {
        catalogues: discoveryResult.catalogues,
        isLoading,
        source: discoveryResult.source,
    };
}

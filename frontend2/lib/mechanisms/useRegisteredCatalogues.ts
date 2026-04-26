/**
 * lib/mechanisms/useRegisteredCatalogues.ts
 *
 * Hook that discovers all registered merchants from OperatorRegistry events
 * (via the indexer), fetches their catalogues from IPFS, and converts them
 * to the marketplace Restaurant type for the buyer-side discovery module.
 *
 * Falls back to MOCK_RESTAURANTS when no registry is available (mock mode)
 * or when no merchants are registered.
 */
"use client";

import { useState, useEffect } from "react";
import { usePublicClient, useChainId } from "wagmi";
import type { Restaurant } from "@/lib/marketplace/types";
import {
    DEFAULT_DISCOVERY_SERVICE,
    type DiscoveryService,
} from "@/lib/shared/discoveryService";

export interface UseRegisteredCataloguesResult {
    /** Merged restaurant list: IPFS-fetched catalogues + mock fallbacks */
    restaurants: Restaurant[];
    /** Whether the registry is being queried */
    isLoading: boolean;
    /** How many restaurants came from IPFS vs mock data */
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
        restaurants: service.listFallbackRestaurants().restaurants,
        isLoading: false,
        source: service.listFallbackRestaurants().source,
    });
    const [isLoading, setIsLoading] = useState(false);
    const client = usePublicClient();
    const chainId = useChainId();

    useEffect(() => {
        if (!client || !service.isRegistryConfigured()) {
            setDiscoveryResult({
                ...service.listFallbackRestaurants(),
                isLoading: false,
            });
            return;
        }

        let cancelled = false;
        setIsLoading(true);

        service.listRestaurants(client, chainId)
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
                        ...service.listFallbackRestaurants(),
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
        restaurants: discoveryResult.restaurants,
        isLoading,
        source: discoveryResult.source,
    };
}

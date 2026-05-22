/**
 * lib/mechanisms/useRegisteredCatalogues.ts
 *
 * Hook that discovers all registered operators from OperatorRegistry
 * events (via the indexer), fetches their catalogues from IPFS, and
 * projects them to the buyer-side `OperatorCatalogue` UI type for the
 * discovery module. Plural-of-wallets — each wallet has at most one
 * catalogue.
 *
 * Returns an empty list when the registry isn't configured or no
 * operators have registered. Empty-state copy is the caller's
 * responsibility (e.g. `/discover` renders a "no operators yet" CTA).
 */
"use client";

import { useState, useEffect } from "react";
import { usePublicClient, useChainId } from "wagmi";
import type { OperatorCatalogue } from "@/lib/seller/types";
import {
    DEFAULT_DISCOVERY_SERVICE,
    type DiscoveryService,
} from "@/lib/shared/discoveryService";

export interface UseRegisteredCataloguesResult {
    catalogues: OperatorCatalogue[];
    isLoading: boolean;
    /** Per-source provenance. `ipfs` = catalogues fetched from
     *  OperatorRegistry → IPFS. `mock` stays 0 in live mode; the field
     *  remains on the type for callers that still surface a provenance
     *  badge, but no longer carries fixture data. */
    source: { ipfs: number; mock: number };
}

export interface UseRegisteredCataloguesOptions {
    service?: DiscoveryService;
}

const EMPTY_RESULT: UseRegisteredCataloguesResult = {
    catalogues: [],
    isLoading: false,
    source: { ipfs: 0, mock: 0 },
};

export function useRegisteredCatalogues(
    options: UseRegisteredCataloguesOptions = {},
): UseRegisteredCataloguesResult {
    const service = options.service ?? DEFAULT_DISCOVERY_SERVICE;
    const [discoveryResult, setDiscoveryResult] =
        useState<UseRegisteredCataloguesResult>(EMPTY_RESULT);
    const [isLoading, setIsLoading] = useState(false);
    const client = usePublicClient();
    const chainId = useChainId();

    useEffect(() => {
        if (!client || !service.isRegistryConfigured()) {
            setDiscoveryResult(EMPTY_RESULT);
            return;
        }

        let cancelled = false;
        setIsLoading(true);

        service.listCatalogues(client, chainId)
            .then((result) => {
                if (cancelled) return;
                setDiscoveryResult({ ...result, isLoading: false });
                setIsLoading(false);
            })
            .catch(() => {
                if (cancelled) return;
                setDiscoveryResult(EMPTY_RESULT);
                setIsLoading(false);
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

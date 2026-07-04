/**
 * lib/mechanisms/useRegisteredCatalogues.ts
 *
 * Hook that discovers all registered sellers from SellerRegistry
 * events (via the indexer), fetches their catalogues from IPFS, and
 * projects them to the buyer-side `SellerCatalogue` UI type for the
 * discovery module. Plural-of-wallets — each wallet has at most one
 * catalogue.
 *
 * Returns an empty list when the registry isn't configured or no
 * sellers have registered. Empty-state copy is the caller's
 * responsibility (e.g. `/discover` renders a "no sellers yet" CTA).
 */
"use client";

import { useState, useEffect } from "react";
import { usePublicClient, useChainId } from "wagmi";
import type { SellerCatalogue } from "@/lib/seller/types";
import {
    DEFAULT_DISCOVERY_SERVICE,
    type DiscoveryService,
} from "@/lib/seller/discoveryService";
import { usePublishedAssemblies } from "@/lib/protocol/useAssemblyRegistry";

export interface UseRegisteredCataloguesResult {
    catalogues: SellerCatalogue[];
    isLoading: boolean;
}

export interface UseRegisteredCataloguesOptions {
    service?: DiscoveryService;
}

const EMPTY_RESULT: UseRegisteredCataloguesResult = {
    catalogues: [],
    isLoading: false,
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
    // The AssemblyRegistry read the surfacing rule cross-checks against —
    // the SAME gate useSellerListings applies (rule applied evenly, operator
    // 2026-07-02). `null` = still reading — that is LOADING, not absence: the
    // unchecked seller list is never rendered (NO FALLBACKS).
    const { data: publishedAssemblies } = usePublishedAssemblies(undefined);

    useEffect(() => {
        if (!client || !service.isRegistryConfigured()) {
            setDiscoveryResult(EMPTY_RESULT);
            return;
        }
        if (publishedAssemblies === null) {
            setIsLoading(true);
            return;
        }
        const publishedSlugs = new Set(publishedAssemblies.map((a) => a.slug));

        let cancelled = false;
        setIsLoading(true);

        service.listCatalogues(client, chainId, publishedSlugs)
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
    }, [client, chainId, service, publishedAssemblies]);

    return {
        catalogues: discoveryResult.catalogues,
        isLoading,
    };
}

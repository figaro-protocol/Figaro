/**
 * lib/mechanisms/useRegisteredCatalogues.ts
 *
 * Hook that discovers all registered sellers from MembersRegistry
 * events (via the indexer), fetches their catalogues from IPFS, and
 * projects them to the buyer-side `MemberCatalogue` UI type for the
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
import type { MemberCatalogue } from "@/lib/member/types";
import {
    DEFAULT_DISCOVERY_SERVICE,
    type DiscoveryService,
} from "@/lib/member/discoveryService";
import { usePublishedAssemblies } from "@/lib/protocol/useAssemblyRegistry";

export interface UseRegisteredCataloguesResult {
    catalogues: MemberCatalogue[];
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
    // Re-read generation — bumped when the tab regains focus so a long-open
    // discovery surface refreshes from the chain instead of going stale.
    // Mirrors the generation/refetch idiom in useRegisteredClausesByWallet.
    const [generation, setGeneration] = useState(0);
    const client = usePublicClient();
    const chainId = useChainId();
    // The AssemblyRegistry read the surfacing rule cross-checks against —
    // the SAME gate useMemberListings applies (rule applied evenly, operator
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
    }, [client, chainId, service, publishedAssemblies, generation]);

    // A long-open tab's catalogue goes stale as sellers register/de-surface.
    // Refresh on focus (returning to the tab) and on tab re-visibility.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const bump = () => setGeneration((g) => g + 1);
        const onVisible = () => {
            if (document.visibilityState === "visible") bump();
        };
        window.addEventListener("focus", bump);
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            window.removeEventListener("focus", bump);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, []);

    return {
        catalogues: discoveryResult.catalogues,
        isLoading,
    };
}

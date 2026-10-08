/**
 * lib/mechanisms/useRegisteredCatalogs.ts
 *
 * Hook that discovers all registered members from MembersRegistry
 * events (via the indexer), fetches their catalogs from IPFS, and
 * projects them to the buyer-side `MemberCatalog` UI type for the
 * discovery module. Plural-of-wallets — each wallet has at most one
 * catalog.
 *
 * Returns an empty list when the registry isn't configured or no
 * members have registered. Empty-state copy is the caller's
 * responsibility (e.g. `/discover` renders a "no members yet" CTA).
 */
"use client";

import { useState, useEffect } from "react";
import { usePublicClient, useChainId } from "wagmi";
import type { MemberCatalog } from "@/lib/member/types";
import {
    DEFAULT_DISCOVERY_SERVICE,
    type DiscoveryService,
} from "@/lib/member/discoveryService";
import { usePublishedAssemblies } from "@/lib/protocol/useAssemblyRegistry";

export interface UseRegisteredCatalogsResult {
    catalogs: MemberCatalog[];
    isLoading: boolean;
}

export interface UseRegisteredCatalogsOptions {
    service?: DiscoveryService;
}

const EMPTY_RESULT: UseRegisteredCatalogsResult = {
    catalogs: [],
    isLoading: false,
};

export function useRegisteredCatalogs(
    options: UseRegisteredCatalogsOptions = {},
): UseRegisteredCatalogsResult {
    const service = options.service ?? DEFAULT_DISCOVERY_SERVICE;
    const [discoveryResult, setDiscoveryResult] =
        useState<UseRegisteredCatalogsResult>(EMPTY_RESULT);
    const [isLoading, setIsLoading] = useState(false);
    // Re-read generation — bumped when the tab regains focus so a long-open
    // discovery surface refreshes from the chain instead of going stale.
    // Mirrors the generation/refetch idiom in useRegisteredClausesByWallet.
    const [generation, setGeneration] = useState(0);
    const client = usePublicClient();
    const chainId = useChainId();
    // The AssemblyRegistry read the surfacing rule cross-checks against —
    // the SAME gate useMemberListings applies (rule applied evenly).
    // `null` = still reading — that is LOADING, not absence: the
    // unchecked member list is never rendered (NO FALLBACKS).
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

        let canceled = false;
        setIsLoading(true);

        service.listCatalogs(client, chainId, publishedSlugs)
            .then((result) => {
                if (canceled) return;
                setDiscoveryResult({ ...result, isLoading: false });
                setIsLoading(false);
            })
            .catch(() => {
                if (canceled) return;
                setDiscoveryResult(EMPTY_RESULT);
                setIsLoading(false);
            });

        return () => {
            canceled = true;
        };
    }, [client, chainId, service, publishedAssemblies, generation]);

    // A long-open tab's catalog goes stale as members register/de-surface.
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
        catalogs: discoveryResult.catalogs,
        isLoading,
    };
}

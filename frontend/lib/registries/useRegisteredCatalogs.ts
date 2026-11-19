/**
 * lib/registries/useRegisteredCatalogs.ts
 *
 * Hook that discovers all registered members from MembersRegistry
 * events (via the indexer), fetches their catalogs from IPFS, and
 * projects them to the buyer-side `MemberCatalog` UI type for the
 * discovery module. Plural-of-wallets — each wallet has at most one
 * catalog.
 *
 * The result is a `NetworkRead<MemberCatalog[]>`: `present([])` only when
 * the registry really holds no catalog; a failed registry read, a failed
 * catalog read, or a failed ProcessRegistry cross-check is `absent` — the
 * caller renders nothing for it, never "no members".
 */
"use client";

import { useState, useEffect } from "react";
import { usePublicClient, useChainId } from "wagmi";
import type { MemberCatalog } from "@/lib/registries/types";
import {
    DEFAULT_DISCOVERY_SERVICE,
    type DiscoveryService,
} from "@/lib/registries/discoveryService";
import { usePublishedAssemblies } from "@/lib/registries/useProcessRegistry";
import { useRefetchGeneration } from "@/hooks/useRefetchGeneration";
import { ABSENT, PENDING, mapRead, readNetwork, type NetworkRead } from "@/lib/shared/networkRead";
import { useDepsChanged } from "@/lib/shared/useDepsChanged";

export interface UseRegisteredCatalogsOptions {
    service?: DiscoveryService;
}

export function useRegisteredCatalogs(
    options: UseRegisteredCatalogsOptions = {},
): { read: NetworkRead<MemberCatalog[]> } {
    const service = options.service ?? DEFAULT_DISCOVERY_SERVICE;
    const [read, setRead] = useState<NetworkRead<MemberCatalog[]>>(PENDING);
    // Re-read generation — bumped when the tab regains focus so a long-open
    // discovery surface refreshes from the chain instead of going stale.
    const { generation, refetch: bump } = useRefetchGeneration();
    const client = usePublicClient();
    const chainId = useChainId();
    // The ProcessRegistry read the surfacing rule cross-checks against —
    // the SAME gate useMemberListings applies (rule applied evenly). Pending
    // is pending and absent is absent: the unchecked member list is never
    // rendered, and a failed assembly read never rejects every member.
    const { read: publishedAssemblies } = usePublishedAssemblies(undefined);

    // The reads that end without a fetch are set during render, on the
    // render the inputs change (`useDepsChanged`); the effect fetches only.
    // The reset reads only whether a client is there, so it is keyed on that.
    const inputsChanged = useDepsChanged([!!client, chainId, service, publishedAssemblies, generation]);
    if (inputsChanged) {
        if (!client || !service.isRegistryConfigured()) setRead(ABSENT);
        else if (publishedAssemblies.status !== "present") setRead(publishedAssemblies);
    }

    useEffect(() => {
        if (!client || !service.isRegistryConfigured() || publishedAssemblies.status !== "present") return;
        const publishedHashes = new Set(publishedAssemblies.value.map((a) => a.processDesignHash.toLowerCase()));

        let canceled = false;
        void readNetwork("useRegisteredCatalogs", () => service.listCatalogs(client, chainId, publishedHashes))
            .then((result) => {
                if (!canceled) setRead(mapRead(result, (r) => r.catalogs));
            });

        return () => {
            canceled = true;
        };
    }, [client, chainId, service, publishedAssemblies, generation]);

    // A long-open tab's catalog goes stale as members register/de-surface.
    // Refresh on focus (returning to the tab) and on tab re-visibility.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const onVisible = () => {
            if (document.visibilityState === "visible") bump();
        };
        window.addEventListener("focus", bump);
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            window.removeEventListener("focus", bump);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [bump]);

    return { read };
}

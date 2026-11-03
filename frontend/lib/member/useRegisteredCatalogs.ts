/**
 * lib/mechanisms/useRegisteredCatalogs.ts
 *
 * Hook that discovers all registered members from MembersRegistry
 * events (via the indexer), fetches their catalogs from IPFS, and
 * projects them to the buyer-side `MemberCatalog` UI type for the
 * discovery module. Plural-of-wallets — each wallet has at most one
 * catalog.
 *
 * The result is a `NetworkRead<MemberCatalog[]>`: `present([])` only when
 * the registry really holds no catalog; a failed registry read, a failed
 * catalog read, or a failed AssemblyRegistry cross-check is `absent` — the
 * caller renders nothing for it, never "no members".
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
import { useRefetchGeneration } from "@/hooks/useRefetchGeneration";
import { ABSENT, PENDING, mapRead, readNetwork, type NetworkRead } from "@/lib/shared/networkRead";

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
    // The AssemblyRegistry read the surfacing rule cross-checks against —
    // the SAME gate useMemberListings applies (rule applied evenly). Pending
    // is pending and absent is absent: the unchecked member list is never
    // rendered, and a failed assembly read never rejects every member.
    const { read: publishedAssemblies } = usePublishedAssemblies(undefined);

    useEffect(() => {
        if (!client || !service.isRegistryConfigured()) {
            setRead(ABSENT);
            return;
        }
        if (publishedAssemblies.status !== "present") {
            setRead(publishedAssemblies);
            return;
        }
        const publishedHashes = new Set(publishedAssemblies.value.map((a) => a.assemblyHash.toLowerCase()));

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
    }, []);

    return { read };
}

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

import { useEffect } from "react";
import type { MemberCatalog } from "@/lib/registries/types";
import {
    DEFAULT_DISCOVERY_SERVICE,
    type DiscoveryService,
} from "@/lib/registries/discoveryService";
import { usePublishedCheckedRead } from "@/lib/registries/usePublishedCheckedRead";
import { useRefetchGeneration } from "@/hooks/useRefetchGeneration";
import type { NetworkRead } from "@/lib/shared/networkRead";

export interface UseRegisteredCatalogsOptions {
    service?: DiscoveryService;
}

export function useRegisteredCatalogs(
    options: UseRegisteredCatalogsOptions = {},
): { read: NetworkRead<MemberCatalog[]> } {
    const service = options.service ?? DEFAULT_DISCOVERY_SERVICE;
    // Re-read generation — bumped when the tab regains focus so a long-open
    // discovery surface refreshes from the chain instead of going stale.
    const { generation, refetch: bump } = useRefetchGeneration();
    // The surfacing rule cross-checks against the ProcessRegistry read — the
    // SAME gate useMemberListings applies (rule applied evenly).
    const read = usePublishedCheckedRead(
        "useRegisteredCatalogs",
        service.isRegistryConfigured(),
        async (client, chainId, publishedHashes) => (await service.listCatalogs(client, chainId, publishedHashes)).catalogs,
        [service, generation],
    );

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

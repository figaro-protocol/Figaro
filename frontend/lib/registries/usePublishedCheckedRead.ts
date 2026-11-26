"use client";

/**
 * usePublishedCheckedRead — a read of the members registry that is checked
 * against the process designs published on the ProcessRegistry (the registry
 * is the authority; a member's profile only claims its bindings).
 *
 * The read is `absent` with no client or no configured registry. While the
 * ProcessRegistry read is pending or absent, so is this one: the unchecked
 * list is never rendered, and a failed ProcessRegistry read never rejects
 * every member. Once the published hashes are present, `load` runs with them
 * (lowercased) and its answer lands unless the inputs changed first; a throw
 * is `absent`.
 *
 * `deps` are the caller's own inputs to `load`; a change re-reads.
 */

import { useEffect, useState } from "react";
import { useChainId, usePublicClient } from "wagmi";
import { usePublishedAssemblies } from "@/lib/registries/useProcessRegistry";
import { ABSENT, PENDING, applyUntilCleanup, readNetwork, type NetworkRead } from "@/lib/shared/networkRead";
import { useDepsChanged } from "@/lib/shared/useDepsChanged";

type ReadClient = NonNullable<ReturnType<typeof usePublicClient>>;

export function usePublishedCheckedRead<T>(
    label: string,
    configured: boolean,
    load: (client: ReadClient, chainId: number, publishedHashes: Set<string>) => Promise<T>,
    deps: readonly unknown[],
): NetworkRead<T> {
    const [read, setRead] = useState<NetworkRead<T>>(PENDING);
    const client = usePublicClient();
    const chainId = useChainId();
    const { read: publishedAssemblies } = usePublishedAssemblies(undefined);

    // The reads that end without a fetch are set during render, on the
    // render the inputs change (`useDepsChanged`); the effect fetches only.
    // The reset reads only whether a client is there, so it is keyed on that.
    const inputsChanged = useDepsChanged([!!client, chainId, publishedAssemblies, ...deps]);
    if (inputsChanged) {
        if (!client || !configured) setRead(ABSENT);
        else if (publishedAssemblies.status !== "present") setRead(publishedAssemblies);
    }

    useEffect(() => {
        if (!client || !configured || publishedAssemblies.status !== "present") return;
        const publishedHashes = new Set(publishedAssemblies.value.map((a) => a.processDesignHash.toLowerCase()));
        return applyUntilCleanup(readNetwork(label, () => load(client, chainId, publishedHashes)), setRead);
        // `load` closes over `deps`, which the list names.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client, chainId, publishedAssemblies, configured, label, ...deps]);

    return read;
}

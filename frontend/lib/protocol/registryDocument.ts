/**
 * registryDocument — the two reads the agreement family (`useAgreementRegistry`) and the
 * assembly family (`useAssemblyRegistry`) restated: a staked-intent registry's BINDING for
 * one key, and the pinned document at the binding's `contentURI` verified against its
 * anchor. Each family keeps its own anchor, its own verifier and its own permanent failures
 * (parallel registries, never nested); this is the one shape of the read at the edge.
 * Null is absence everywhere: no binding, an unreachable pin, a document that is not the
 * anchor's.
 */

import type { Abi } from "viem";
import { DEFAULT_IPFS_SERVICE, fetchCappedContent } from "@/lib/shared/ipfsService";
import { publicClient } from "@/lib/shared/wagmi";

/** A registry's `bindings(key)` row: who registered it, when, whether the stake is
 *  withdrawn, and where the document is pinned. */
type RegistryBinding = readonly [`0x${string}`, bigint, boolean, string];

/** The registry's binding for one key (whatever its stake: bindings are never cleared),
 *  or null when the key is unbound, carries no `contentURI`, or the read fails. */
export async function readRegistryBinding(
    registry: `0x${string}`,
    abi: Abi,
    key: `0x${string}`,
    client: Pick<typeof publicClient, "readContract"> = publicClient,
): Promise<RegistryBinding | null> {
    try {
        const binding = (await client.readContract({
            address: registry, abi, functionName: "bindings", args: [key],
        })) as RegistryBinding;
        const [, registeredAt, , contentURI] = binding;
        return registeredAt === 0n || !contentURI ? null : binding;
    } catch {
        return null;
    }
}

/**
 * The pinned document at `contentURI`, size-capped (F4), read by the family's verifier.
 * `read` returns the verified document from the served text, or null when the bytes are
 * not the anchor's document, in which case `onRejected` runs once (the family notes the
 * permanent failure and warns) and the result is null. An unresolvable URI, a gateway
 * miss and an unreachable pin are null without a report: they are read again.
 */
export async function fetchPinnedDocument<T>(
    contentURI: string,
    read: (text: string) => T | null,
    onRejected: () => void,
): Promise<T | null> {
    const url = DEFAULT_IPFS_SERVICE.resolveFetchUrl(contentURI);
    if (!url) return null;
    try {
        const response = await fetchCappedContent(url);
        if (!response.ok) return null;
        const doc = read(await response.text());
        if (doc === null) onRejected();
        return doc;
    } catch {
        return null;
    }
}

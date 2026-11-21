/**
 * pathChoice.ts — the paths a buyer may pick at checkout, and the path an
 * order a counter-signer receives was signed for.
 *
 * The seller declares the paths it accepts in its binding of the assembly
 * (`ProcessBindingRecord.paths`, `acceptedPaths`); the direct path alone where
 * it declares none. Every named seller of the process, co-sellers included,
 * must accept the path too, since every order of a process is on its one
 * path (the two paths share no state). The batch path is offered only on a
 * deployment with a batch verifier and while a relay is in use whose report
 * matches the chain (`useCheckedRelay`): an order signed for it is sent to a
 * relay, and with none it could not be committed. The direct path needs no
 * relay.
 */
import { useEffect, useState } from "react";
import { useChainId } from "wagmi";
import type { CommitmentPayload } from "@figaro-protocol/sdk/agent";
import type { ResolutionUniverse } from "@figaro-protocol/sdk";
import { signedPath } from "@/lib/core/relayTransport";
import { ABSENT, PENDING, present, type NetworkRead } from "@/lib/shared/networkRead";
import { useDepsChanged } from "@/lib/shared/useDepsChanged";

/** The paths every named seller accepts, the direct path first: the
 *  intersection of their declared paths. Empty when they share none. */
function sharedPaths(sellersPaths: readonly (readonly ResolutionUniverse[])[]): ResolutionUniverse[] {
    const all = (path: ResolutionUniverse) => sellersPaths.length > 0 && sellersPaths.every((paths) => paths.includes(path));
    return (["direct", "batch"] as const).filter(all);
}

/** Whether the batch path is among the paths every named seller accepts,
 *  once every seller's binding is read: the condition to read the relays. */
export function batchShared(sellersPaths: readonly NetworkRead<readonly ResolutionUniverse[]>[]): boolean {
    if (sellersPaths.length === 0 || sellersPaths.some((r) => r.status !== "present")) return false;
    return sharedPaths(sellersPaths.map((r) => (r.status === "present" ? r.value : []))).includes("batch");
}

/**
 * The paths offered to the buyer, as a read over every named seller's
 * binding (the lead seller and each co-seller, designated or picked) and the
 * relay check. Absent when a seller's binding could not be read; pending
 * while one is read, or while the relays are checked for a batch path every
 * seller accepts. Present: the intersection of the sellers' paths, the batch
 * path kept only on a deployment with a verifier and with a relay in use.
 * Present and empty is the one final refusal.
 */
export function offeredPaths(
    sellersPaths: readonly NetworkRead<readonly ResolutionUniverse[]>[],
    batch: { verifier: boolean; relayInUse: NetworkRead<boolean> },
): NetworkRead<ResolutionUniverse[]> {
    if (sellersPaths.length === 0) return PENDING;
    if (sellersPaths.some((r) => r.status === "absent")) return ABSENT;
    if (sellersPaths.some((r) => r.status === "pending")) return PENDING;
    const shared = sharedPaths(sellersPaths.map((r) => (r.status === "present" ? r.value : [])));
    if (!shared.includes("batch") || !batch.verifier) return present(shared.filter((p) => p === "direct"));
    if (batch.relayInUse.status === "pending") return PENDING;
    const relay = batch.relayInUse.status === "present" && batch.relayInUse.value;
    return present(relay ? shared : shared.filter((p) => p === "direct"));
}

/** `payloadPath` as a read: pending while the signature is checked, absent
 *  when the payload carries no signature that verifies under either path. */
export function usePayloadPath(
    payload: Pick<CommitmentPayload, "commitment" | "buyerSig" | "sellerSig"> | null,
): NetworkRead<ResolutionUniverse> {
    const chainId = useChainId();
    const [read, setRead] = useState<NetworkRead<ResolutionUniverse>>(PENDING);
    const payloadChanged = useDepsChanged([payload, chainId]);
    if (payloadChanged) setRead(PENDING);
    useEffect(() => {
        if (!payload) return;
        let canceled = false;
        void payloadPath(payload, chainId)
            .then((path) => { if (!canceled) setRead(path ? present(path) : ABSENT); })
            .catch(() => { if (!canceled) setRead(ABSENT); });
        return () => { canceled = true; };
    }, [payload, chainId]);
    return read;
}

/** The path a received payload was signed for: the domain the signature
 *  already on it recovers under, the buyer's where it carries one, else the
 *  seller's. Null when it carries none, or none that verifies. */
export async function payloadPath(
    payload: Pick<CommitmentPayload, "commitment" | "buyerSig" | "sellerSig">,
    chainId: number,
): Promise<ResolutionUniverse | null> {
    const { commitment } = payload;
    if (payload.buyerSig) return signedPath(commitment, payload.buyerSig, commitment.buyer as `0x${string}`, chainId);
    if (payload.sellerSig) return signedPath(commitment, payload.sellerSig, commitment.seller as `0x${string}`, chainId);
    return null;
}

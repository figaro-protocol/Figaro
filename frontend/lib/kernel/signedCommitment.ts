/**
 * signedCommitment.ts — recover the SIGNED Commitment from indexer/event data.
 *
 * The `OrderCommitted` event (and the order store derived from it) carries the
 * DERIVED processId. But a ROOT order was SIGNED with `processId = 0` — the
 * kernel derives the process id as the root commitment's EIP-712 digest and
 * emits THAT. Every kernel path that recomputes an order's hash from
 * `hashStruct(commitment)` — the attestation coordinator, `resolveProcess` —
 * needs the SIGNED struct, so the root must carry `processId = 0` or the
 * recomputed `orderHash` misses (UnknownOrder / OrderNotCommitted). A sub-order's
 * signed processId equals the event's (its as-root digest differs from the
 * process id), so it is returned unchanged.
 */
import {
    computeOrderHash,
    restoreSignedProcessId as sdkRestoreSignedProcessId,
    type Commitment,
} from "@figaro-protocol/sdk";
import { CONTRACTS } from "@/lib/kernel/contracts";

function configuredCore(): `0x${string}` {
    if (!CONTRACTS.core) {
        throw new Error("Core contract address is not configured, so commitment hashes cannot be derived.");
    }
    return CONTRACTS.core as `0x${string}`;
}

/** This deployment's order hash for a commitment — the ONE home for the
 *  (commitment, chainId, Core address) hashing plumbing. Throws when the
 *  Core address is unconfigured. */
export function commitmentOrderHash(c: Commitment, chainId: number): `0x${string}` {
    return computeOrderHash(c, chainId, configuredCore());
}

/** Deployment-curried wrapper over the SDK's `restoreSignedProcessId` — the
 *  one home for the root-detection logic (a root reproduces its own processId
 *  as its as-root EIP-712 digest). */
export function restoreSignedProcessId(c: Commitment, chainId: number): Commitment {
    return sdkRestoreSignedProcessId(c, chainId, configuredCore());
}

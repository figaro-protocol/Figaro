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
import { computeCommitmentProcessId, type Commitment } from "@figaro/core";
import { CONTRACTS } from "@/lib/core/contracts";
import { hexEqual, ZERO_PROCESS_ID } from "@/lib/shared/evm";

export function restoreSignedProcessId(c: Commitment, chainId: number): Commitment {
    const asRoot = { ...c, processId: ZERO_PROCESS_ID };
    // If treating it as a root reproduces the event's processId (its EIP-712
    // digest), the signed commitment WAS a root with processId 0.
    return hexEqual(computeCommitmentProcessId(asRoot, chainId, CONTRACTS.core), c.processId)
        ? asRoot
        : c;
}

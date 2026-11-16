/**
 * signedCommitment.ts — recover the SIGNED Commitment from indexer/event data.
 *
 * The `OrderCommitted` event (and the order store derived from it) carries the
 * DERIVED processId. But a ROOT order was SIGNED with `processId = 0` — the
 * FigaroCore derives the process id as the root commitment's EIP-712 digest and
 * emits THAT. Every FigaroCore path that recomputes an order's hash from
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
import { CONTRACTS, getBatchVerifier } from "@/lib/core/contracts";

function configuredCore(): `0x${string}` {
    if (!CONTRACTS.core) {
        throw new Error("Core contract address is not configured, so commitment hashes cannot be derived.");
    }
    return CONTRACTS.core as `0x${string}`;
}

/** A commitment's order hash on the direct path, under FigaroCore's domain —
 *  the hash a write to FigaroCore or the attestation coordinator recomputes.
 *  Throws when the Core address is unconfigured. */
export function commitmentOrderHash(c: Commitment, chainId: number): `0x${string}` {
    return computeOrderHash(c, chainId, configuredCore());
}

/** A commitment's order hash under every order emitter's domain: FigaroCore's,
 *  and the batch verifier's when one is configured. A signed payload does not
 *  say which path will commit it, and a root order's id differs between the
 *  two domains, so a reader matching a payload to a committed order tries
 *  each. Throws when the Core address is unconfigured. */
export function commitmentOrderHashes(c: Commitment, chainId: number): `0x${string}`[] {
    const verifier = getBatchVerifier();
    const hashes = [computeOrderHash(c, chainId, configuredCore())];
    if (verifier) hashes.push(computeOrderHash(c, chainId, verifier));
    return hashes;
}

/** Deployment-curried wrapper over the SDK's `restoreSignedProcessId` — the
 *  one home for the root-detection logic (a root reproduces its own processId
 *  as its as-root EIP-712 digest). */
export function restoreSignedProcessId(c: Commitment, chainId: number): Commitment {
    return sdkRestoreSignedProcessId(c, chainId, configuredCore());
}

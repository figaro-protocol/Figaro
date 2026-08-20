/**
 * lib/audit/signatureVerdicts.ts — per-order EIP-712 signature verdicts for
 * the audit surface: did the buyer and the seller really sign the committed
 * struct hash?
 *
 * The OrderCommitted event carries every Commitment field but NO signatures —
 * the signature bytes exist on-chain only inside the commit transaction's
 * CALLDATA (`commit(c, buyerSig, sellerSig)` on the kernel, or
 * `swapAndCommit(c, buyerSig, sellerSig, …)` on the witness swap coordinator).
 * So this reader walks log → transactionHash → getTransaction →
 * decodeFunctionData, then checks each signature with the SDK's canonical
 * `verifyCommitmentSignature` — zero crypto is implemented in the frontend.
 *
 * The decoded struct is bound back to the order by recomputing the on-chain
 * order hash (`computeOrderHash`); a transaction whose decoded commitment does
 * not reproduce this order's hash (a wrapped commit this reader cannot parse)
 * yields "unavailable", never a false verdict. The decoded struct is the
 * SIGNED struct verbatim — a root order's calldata carries `processId = 0`,
 * exactly what the parties signed — so no processId restoration is needed.
 *
 * Note the calldata-decoding caution in ProcessClauseEvidence (witness VALUES
 * must never be faked from calldata) does not apply here: the signatures are
 * genuinely in calldata by construction — they are what the kernel verified.
 *
 * ── The batch universe ──────────────────────────────────────────────────────
 *
 * All of the above describes the DIRECT path only. There are two settlement
 * paths and two DISJOINT state universes (docs/SCALING_STRATEGY.md): a
 * batch-settled order emits no `OrderCommitted`, and `settleBatch` carries no
 * signature bytes in its calldata. So for batched trade the walk above finds
 * nothing, and reporting "unavailable" would understate what is actually known.
 *
 * What IS known, and why it is a different KIND of evidence: the zkVM guest
 * verifies both EIP-712 signatures itself (`prover/lib/src/kernel.rs:126,131`
 * recover the buyer and seller from the commitment digest inside `apply_commit`
 * and reject the batch on mismatch), and an attestation can only be applied to
 * an order the guest already holds as ACTIVE (`require_known_active_commitment`,
 * kernel.rs:311) — a status written ONLY by `apply_commit`. `FigaroBatchVerifier`
 * accepts a batch only against an immutable `programVKey`, and chains state via
 * `prevRoot == stateRoot`. So a verifier-re-emitted `Attestation` for an order
 * proves that order's commit passed both signature checks inside a proof this
 * verifier accepted.
 *
 * Two honesty constraints this reader keeps:
 *   1. The reader has NOT re-verified anything. It is trusting a proof it can
 *      independently check (verifier address + vkey are reported so it can).
 *   2. The named batch is the batch that ATTESTED the order. Guest state carries
 *      across batches, so the commit was proven in that batch or an EARLIER one
 *      in the same root chain — never claim it is the commit's own batch.
 */
import { decodeFunctionData, type Hex, type PublicClient } from "viem";
import {
    BATCH_VERIFIER_ABI,
    CORE_ABI,
    WITNESS_SWAP_AND_COMMIT_COORDINATOR_ABI,
    computeOrderHash,
    verifyCommitmentSignature,
    type Commitment,
} from "@figaro-protocol/sdk";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { getAllOrderCommitted, getStringArg } from "@/lib/kernel/indexer";
import { getBatchVerifier } from "@/lib/composition/contracts";
import { getAllBatchSettled, getBatchAttestationsByOrder } from "@/lib/composition/indexer";
import { hexEqual } from "@/lib/shared/evm";

/** One party's verdict.
 *  - "valid"/"invalid" — the reader RE-VERIFIED the signature from the commit
 *    transaction's calldata (direct path).
 *  - "proved" — the signature was verified inside the SP1 proof that settled a
 *    batch carrying this order. The reader did NOT recompute it; it is trusting
 *    a proof it can independently check. Never conflate with "valid".
 *  - "unavailable" — nothing on either path answered for this order; absence,
 *    never a failure. */
type SignatureVerdict = "valid" | "invalid" | "unavailable" | "proved";

/** What a reader needs to check the proof themselves, plus how tightly the
 *  order could be bound to a batch.
 *  @public — names the type of `OrderSignatureVerdicts.batch`, so any consumer
 *  reading batch provenance needs it even though nothing imports it by name
 *  today. */
export interface BatchProvenance {
    /** The batch whose settlement re-emitted this order's attestation. null when
     *  the order could not be bound to a specific batch — the weaker but still
     *  true statement (proved by SOME batch this verifier accepted). */
    batchId: bigint | null;
    /** The `settleBatch` transaction that batch was settled in; null when unbound. */
    transactionHash: Hex | null;
    /** The verifier that checked the proof — the address a reader queries. */
    verifier: `0x${string}`;
    /** The immutable program verification key the proof was checked against;
     *  null when it could not be read. */
    programVKey: Hex | null;
}

export interface OrderSignatureVerdicts {
    buyer: SignatureVerdict;
    seller: SignatureVerdict;
    /** The commit transaction the signatures were read from; null when no
     *  commit transaction was found for the order. */
    transactionHash: Hex | null;
    /** Set only for the "proved" verdict — the batch-path provenance a reader
     *  would check. null on the direct path. */
    batch: BatchProvenance | null;
}

const UNAVAILABLE: OrderSignatureVerdicts = {
    buyer: "unavailable",
    seller: "unavailable",
    transactionHash: null,
    batch: null,
};

/**
 * Decode a commit transaction's calldata into the signed struct + both
 * signature blobs. Tries the kernel's `commit` and the witness swap
 * coordinator's `swapAndCommit` (both lead with `c, buyerSig, sellerSig`).
 * Returns null for calldata that is neither.
 */
export function decodeCommitCalldata(
    input: Hex,
): { commitment: Commitment; buyerSig: Hex; sellerSig: Hex } | null {
    for (const abi of [CORE_ABI, WITNESS_SWAP_AND_COMMIT_COORDINATOR_ABI]) {
        try {
            const { functionName, args } = decodeFunctionData({ abi, data: input });
            if (functionName === "commit" || functionName === "swapAndCommit") {
                const [commitment, buyerSig, sellerSig] = args as unknown as [Commitment, Hex, Hex];
                return { commitment, buyerSig, sellerSig };
            }
        } catch {
            // Not this ABI — try the next.
        }
    }
    return null;
}

/**
 * Verdicts for one commit transaction's calldata, bound to `orderHash`.
 * Returns null when the calldata does not decode as a commit, or decodes to a
 * commitment that does not reproduce this order's on-chain hash — the caller
 * reports "unavailable" rather than a false verdict.
 */
export async function verdictsForCommitCalldata(
    input: Hex,
    orderHash: string,
    ctx: { chainId: number; core: `0x${string}` },
): Promise<Pick<OrderSignatureVerdicts, "buyer" | "seller"> | null> {
    const decoded = decodeCommitCalldata(input);
    if (!decoded) return null;
    const { commitment, buyerSig, sellerSig } = decoded;
    if (!hexEqual(computeOrderHash(commitment, ctx.chainId, ctx.core), orderHash)) return null;
    const [buyerOk, sellerOk] = await Promise.all([
        verifyCommitmentSignature(commitment, buyerSig, commitment.buyer, ctx),
        verifyCommitmentSignature(commitment, sellerSig, commitment.seller, ctx),
    ]);
    return { buyer: buyerOk ? "valid" : "invalid", seller: sellerOk ? "valid" : "invalid" };
}

/**
 * Batch-path provenance for an order, or null when the batch universe says
 * nothing about it.
 *
 * The binding is transitive and that is the strongest one on chain: the
 * verifier stores no per-order state and its public values carry no order
 * hashes (only roots + context + four aggregate hashes), so the sole per-order
 * trace a batch leaves is a re-emitted `Attestation`. That log's transaction is
 * the `settleBatch` call, and the `BatchSettled` in the SAME transaction names
 * the batch. An order the verifier never attested leaves no public trace at all
 * — hence null, never a manufactured verdict.
 */
async function resolveBatchProvenance(
    client: PublicClient,
    chainId: number,
    orderHash: string,
): Promise<BatchProvenance | null> {
    const verifier = getBatchVerifier();
    if (!verifier) return null;

    const attestations = await getBatchAttestationsByOrder(client, chainId, orderHash);
    if (attestations.length === 0) return null;

    // The vkey is what makes the proof checkable by the reader; report it when
    // readable, but its absence never invalidates the binding above.
    let programVKey: Hex | null = null;
    try {
        programVKey = await client.readContract({
            address: verifier,
            abi: BATCH_VERIFIER_ABI,
            functionName: "programVKey",
        }) as Hex;
    } catch {
        programVKey = null;
    }

    const transactionHash = attestations[0]?.transactionHash ?? null;
    if (!transactionHash) return { batchId: null, transactionHash: null, verifier, programVKey };

    // Name the batch by finding the BatchSettled emitted in the same settleBatch
    // transaction. Unbindable (log pruned, reorg, cache gap) degrades to the
    // weaker statement rather than guessing a batch id.
    let batchId: bigint | null = null;
    try {
        const settled = await getAllBatchSettled(client, chainId);
        const match = settled.find((l) => hexEqual(l.transactionHash ?? null, transactionHash));
        const raw = (match as { args?: { batchId?: unknown } } | undefined)?.args?.batchId;
        if (typeof raw === "bigint") batchId = raw;
        else if (typeof raw === "number") batchId = BigInt(raw);
    } catch {
        batchId = null;
    }

    return { batchId, transactionHash, verifier, programVKey };
}

/**
 * The audit-surface read: find the order's OrderCommitted log (the same cached
 * log store every other reader shares), fetch its transaction, and verify both
 * signatures against the struct the calldata actually carried.
 *
 * When the direct path has no commit log for the order, fall through to the
 * batch universe before reporting absence — an order settled there is not
 * unanswerable, it is answered by a proof rather than by calldata.
 */
export async function verifyOrderCommitSignatures(
    client: PublicClient,
    chainId: number,
    orderHash: string,
): Promise<OrderSignatureVerdicts> {
    const all = await getAllOrderCommitted(client, chainId);
    const log = all.find((l) => hexEqual(getStringArg(l, "orderHash"), orderHash));
    const transactionHash = log?.transactionHash ?? null;
    if (!transactionHash) return provedOrUnavailable(client, chainId, orderHash);

    let input: Hex;
    try {
        ({ input } = await client.getTransaction({ hash: transactionHash }));
    } catch {
        return UNAVAILABLE;
    }

    const verdicts = await verdictsForCommitCalldata(input, orderHash, {
        chainId,
        core: CONTRACTS.core,
    });
    if (!verdicts) return { ...UNAVAILABLE, transactionHash, batch: null };
    return { ...verdicts, transactionHash, batch: null };
}

/** The batch fallthrough: "proved" when the verifier's own logs bind this order
 *  to its proof, otherwise the existing "unavailable". */
async function provedOrUnavailable(
    client: PublicClient,
    chainId: number,
    orderHash: string,
): Promise<OrderSignatureVerdicts> {
    let batch: BatchProvenance | null = null;
    try {
        batch = await resolveBatchProvenance(client, chainId, orderHash);
    } catch {
        batch = null;
    }
    if (!batch) return UNAVAILABLE;
    return { buyer: "proved", seller: "proved", transactionHash: null, batch };
}

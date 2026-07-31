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
 */
import { decodeFunctionData, type Hex, type PublicClient } from "viem";
import {
    CORE_ABI,
    WITNESS_SWAP_AND_COMMIT_COORDINATOR_ABI,
    computeOrderHash,
    verifyCommitmentSignature,
    type Commitment,
} from "@figaro/sdk";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { getAllOrderCommitted, getStringArg } from "@/lib/kernel/indexer";
import { hexEqual } from "@/lib/shared/evm";

/** One party's verdict. "unavailable" = no readable commit calldata was found
 *  for the order (nothing to verify) — never rendered as a failure. */
type SignatureVerdict = "valid" | "invalid" | "unavailable";

export interface OrderSignatureVerdicts {
    buyer: SignatureVerdict;
    seller: SignatureVerdict;
    /** The commit transaction the signatures were read from; null when no
     *  commit transaction was found for the order. */
    transactionHash: Hex | null;
}

const UNAVAILABLE: OrderSignatureVerdicts = {
    buyer: "unavailable",
    seller: "unavailable",
    transactionHash: null,
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
 * The audit-surface read: find the order's OrderCommitted log (the same cached
 * log store every other reader shares), fetch its transaction, and verify both
 * signatures against the struct the calldata actually carried.
 */
export async function verifyOrderCommitSignatures(
    client: PublicClient,
    chainId: number,
    orderHash: string,
): Promise<OrderSignatureVerdicts> {
    const all = await getAllOrderCommitted(client, chainId);
    const log = all.find((l) => hexEqual(getStringArg(l, "orderHash"), orderHash));
    const transactionHash = log?.transactionHash ?? null;
    if (!transactionHash) return UNAVAILABLE;

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
    if (!verdicts) return { ...UNAVAILABLE, transactionHash };
    return { ...verdicts, transactionHash };
}

/**
 * orderCommitted.ts — the order once the SELLER has signed: broadcast on-chain.
 *
 * Both signatures are in hand, so the fully-signed commitment is submitted to
 * FigaroCore's unified `commit`. The kernel pulls both bonds (buyer + seller
 * must already have approved — see orderCommitmentFlow) and the order becomes a
 * live, bonded process. This is the only state that touches the chain.
 *
 * `commit` is injected (useFigaroActions) so this stays a pure, testable step.
 */
import type { Commitment, Hex } from "@figaro/core";
import type { CommitmentPayload } from "@/lib/core/orderSignedAndShared";

interface CommitBroadcaster {
    (commitment: Commitment, buyerSig: Hex, sellerSig: Hex): Promise<Hex>;
}

interface ReceiptClient {
    waitForTransactionReceipt(args: { hash: Hex }): Promise<{ status: string }>;
}

/**
 * Broadcast the fully-signed payload to FigaroCore. Optionally waits for the
 * receipt and throws if the commit reverted on-chain.
 */
export async function commitSignedOrder(params: {
    payload: CommitmentPayload;
    commit: CommitBroadcaster;
    publicClient?: ReceiptClient | null;
    waitForReceipt?: boolean;
}): Promise<Hex> {
    const { payload, commit, publicClient, waitForReceipt = false } = params;

    if (!payload.buyerSig || !payload.sellerSig) {
        throw new Error("Both signatures are required before an order can be committed.");
    }

    const hash = await commit(payload.commitment, payload.buyerSig, payload.sellerSig);

    if (waitForReceipt && publicClient && hash) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") {
            throw new Error(`Commit transaction reverted on-chain (tx ${hash}).`);
        }
    }

    return hash;
}

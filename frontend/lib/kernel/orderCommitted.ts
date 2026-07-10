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
import { assertOrderFitsResolveCap } from "@figaro/sdk";
import type { Commitment, Hex } from "@figaro/sdk";
import type { CommitmentPayload } from "@/lib/kernel/signedCommitment";
import { CONTRACTS } from "@/lib/kernel/contracts";

interface CommitBroadcaster {
    (commitment: Commitment, buyerSig: Hex, sellerSig: Hex): Promise<Hex>;
}

interface ReceiptClient {
    waitForTransactionReceipt(args: { hash: Hex }): Promise<{ status: string }>;
}

/** The subset of a viem PublicClient the resolve-cap guard needs. */
interface CapReadClient {
    readContract(args: unknown): Promise<unknown>;
    getBlock(args?: unknown): Promise<unknown>;
}

function canReadCap(client: unknown): client is CapReadClient {
    return (
        !!client &&
        typeof (client as CapReadClient).readContract === "function" &&
        typeof (client as CapReadClient).getBlock === "function"
    );
}

/**
 * Broadcast the fully-signed payload to FigaroCore. Optionally waits for the
 * receipt and throws if the commit reverted on-chain.
 *
 * Before broadcasting a SUB-ORDER, refuses any commit that would push the
 * live process past the chain's resolve ceiling (`assertOrderFitsResolveCap`)
 * — past it, `resolveProcess` cannot fit in one block and every bond in the
 * process is locked forever. The kernel cannot enforce the ceiling; this
 * choke point covers every UI commit path (buyer, seller accept, relay).
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

    if (canReadCap(publicClient)) {
        await assertOrderFitsResolveCap(
            publicClient as Parameters<typeof assertOrderFitsResolveCap>[0],
            CONTRACTS.core,
            payload.commitment.processId,
        );
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

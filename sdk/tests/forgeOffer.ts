import type { WalletClient } from "viem";
import { instantiateRootAgreement } from "../src/agent/originate.js";
import type { BuildOfferParams } from "../src/agent/originate.js";
import type { CommitmentPayload } from "../src/agent/coordination.js";
import { computeCheckoutHash } from "../src/agreement.js";
import { buildCommitment, buildDomain, ZERO_PROCESS_ID } from "../src/commitments.js";

/** A buyer outside the SDK signs whatever it likes: the offer `buildBuyerOffer`
 *  would build, signed by hand with the SDK's buyer-side gate never run. The
 *  seller's gate is then the one under test. */
export async function forgeBuyerOffer(
    wallet: WalletClient,
    params: Omit<BuildOfferParams, "specs" | "buyer"> & { specs?: unknown },
): Promise<CommitmentPayload> {
    const account = wallet.account;
    if (!account) throw new Error("forgeBuyerOffer: wallet has no account");
    const agreement = instantiateRootAgreement(params.assembly, {
        buyer: account.address, seller: params.seller, overrides: params.overrides,
    });
    const checkoutHash = computeCheckoutHash(agreement);
    const { commitment, typedData } = buildCommitment({
        processId: ZERO_PROCESS_ID, buyer: account.address, seller: params.seller, currency: params.currency,
        payment: params.payment, expectedCumulativeValue: params.payment,
        checkoutHash, salt: params.salt, deadline: params.deadline,
    }, buildDomain(params.chainId, params.core));
    const buyerSig = await wallet.signTypedData({ account, ...typedData });
    return { commitment, agreement, buyerSig };
}

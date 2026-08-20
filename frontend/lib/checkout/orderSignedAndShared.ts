/**
 * orderSignedAndShared.ts — the order once the BUYER has signed it.
 *
 * A buyer signature makes the order FINAL, so this is the first point it may be
 * pinned to IPFS. The signed payload (commitment + signatures + the agreement,
 * inline) is pinned and its CID is relayed to the seller over the coordination
 * channel, keyed by the on-chain order hash. The seller's /orders pending view
 * (orderPendingSellerSignature) surfaces it to counter-sign.
 *
 * The relay capability is a minimal STRUCTURAL type (CommitmentPayloadRelay),
 * satisfied by the handoff HandoffMessagingService at the call site — so
 * checkout stays decoupled from the handoff layer's concrete transport.
 */
import { publishAgreement } from "@/lib/kernel/agreementFetch";
import { commitmentOrderHash } from "@/lib/kernel/signedCommitment";
import {
    serializeCommitmentPayload,
    MAX_COMMITMENT_PAYLOAD_BYTES,
    type CommitmentPayload,
} from "@figaro-protocol/sdk/agent";
import type { IpfsService } from "@/lib/shared/ipfsService";

interface WalletMessageSigner {
    signMessage(params: { message: string }): Promise<`0x${string}`>;
}

/** The one transport capability this module needs — structural, so this module
 *  names no concrete transport. `HandoffMessagingService` (handoff/) satisfies it. */
export interface CommitmentPayloadRelay {
    sendCommitmentPayload(params: {
        address: string;
        walletClient?: WalletMessageSigner | null;
        recipientAddress: string;
        orderId: string;
        payload: string;
    }): Promise<void>;
}

// The payload byte ceiling is the SDK codec's ONE constant
// (MAX_COMMITMENT_PAYLOAD_BYTES) — wherever the payload travels, the same cap.
// The error-loudly posture stands: never fall back to a public IPFS pin — a
// plaintext pin is the exact leak this seam closes, and a withheld pin cannot
// carry the private plaintext the counterparty needs to sign.

/**
 * Relay the signed `payload` to the seller over the E2E-encrypted coordination
 * channel (NOT a public IPFS pin), keyed by the commitment's on-chain order
 * hash. The public-verification copy is the WITHHELD standalone agreement pin;
 * this delivers the plaintext the counterparty needs — including any
 * `private`-disposition section — without it ever touching a public surface
 * (audit F Arm 2). Returns that order hash.
 */
export async function shareSignedOrder(params: {
    payload: CommitmentPayload;
    recipientAddress: string;
    senderAddress: string;
    walletClient?: WalletMessageSigner | null;
    chainId: number;
    handoffMessaging: CommitmentPayloadRelay;
    evidenceTransport: Pick<IpfsService, "pinJSON" | "buildURI" | "resolveFetchUrl">;
}): Promise<string> {
    const {
        payload, recipientAddress, senderAddress, walletClient, chainId,
        handoffMessaging, evidenceTransport,
    } = params;

    // Pin the agreement body STANDALONE — WITHHELD of any private-disposition
    // section (publishAgreement → publicForm) — and remember its witnessed-URI
    // pointer, so the SENDER's own order/audit pages hydrate its PUBLIC shape by
    // hash after a fresh navigation, and anyone can verify the root. The private
    // plaintext is NOT here; it rides the channel below.
    await publishAgreement(payload.agreement, { evidenceTransport });

    const orderId = commitmentOrderHash(payload.commitment, chainId);
    const serialized = serializeCommitmentPayload(payload);
    if (new TextEncoder().encode(serialized).length > MAX_COMMITMENT_PAYLOAD_BYTES) {
        throw new Error(
            "Order payload too large to relay privately over the coordination channel — " +
                "large content belongs behind a content-handoff clause, not inline in the agreement.",
        );
    }
    await handoffMessaging.sendCommitmentPayload({
        address: senderAddress,
        walletClient,
        recipientAddress,
        orderId,
        payload: serialized,
    });
    return orderId;
}

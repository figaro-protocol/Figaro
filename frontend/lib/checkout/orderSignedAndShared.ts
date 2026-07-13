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
 * satisfied by the handoff CoordinationMessagingService at the call site — so
 * checkout stays decoupled from the handoff layer's concrete transport.
 */
import { publishAgreement } from "@/lib/kernel/agreementFetch";
import { commitmentOrderHash } from "@/lib/kernel/signedCommitment";
import {
    serializeCommitmentPayload,
    type CommitmentPayload,
} from "@figaro/sdk/agent";
import type { IpfsService } from "@/lib/shared/ipfsService";

interface WalletMessageSigner {
    signMessage(params: { message: string }): Promise<`0x${string}`>;
}

/** The one transport capability this module needs — structural, so this module
 *  names no concrete transport. `CoordinationMessagingService` (handoff/) satisfies it. */
export interface CommitmentPayloadRelay {
    sendCommitmentPayload(params: {
        address: string;
        walletClient?: WalletMessageSigner | null;
        recipientAddress: string;
        orderId: string;
        payloadCid: string;
    }): Promise<void>;
}

/**
 * Pin the signed `payload` to IPFS and relay its CID to the seller, keyed by the
 * commitment's on-chain order hash. Returns that order hash.
 */
export async function shareSignedOrder(params: {
    payload: CommitmentPayload;
    recipientAddress: string;
    senderAddress: string;
    walletClient?: WalletMessageSigner | null;
    chainId: number;
    coordinationMessaging: CommitmentPayloadRelay;
    evidenceTransport: Pick<IpfsService, "pinBlob" | "pinJSON" | "buildURI" | "resolveFetchUrl">;
}): Promise<string> {
    const {
        payload, recipientAddress, senderAddress, walletClient, chainId,
        coordinationMessaging, evidenceTransport,
    } = params;

    // Pin the agreement body STANDALONE (separate from the relayed payload) and
    // remember its witnessed-URI pointer, so the SENDER's own order/audit pages
    // can hydrate it by hash after a fresh navigation. The recipient does the
    // same when the payload arrives (orderPendingSellerSignature) — content
    // addressing makes both pins the same CID.
    await publishAgreement(payload.agreement, { evidenceTransport });

    const orderId = commitmentOrderHash(payload.commitment, chainId);
    const blob = new Blob([serializeCommitmentPayload(payload)], { type: "application/json" });
    const payloadCid = await evidenceTransport.pinBlob(blob);
    await coordinationMessaging.sendCommitmentPayload({
        address: senderAddress,
        walletClient,
        recipientAddress,
        orderId,
        payloadCid,
    });
    return orderId;
}

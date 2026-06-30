/**
 * orderSignedAndShared.ts — the order once the BUYER has signed it.
 *
 * A buyer signature makes the order FINAL, so this is the first point it may be
 * pinned to IPFS. The signed payload (commitment + signatures + the agreement,
 * inline) is pinned and its CID is relayed to the seller over the coordination
 * channel, keyed by the on-chain order hash. The seller's inbox
 * (orderPendingSellerSignature) surfaces it to counter-sign.
 *
 * core/ depends on no feature layer: the relay capability is a minimal
 * STRUCTURAL type (CommitmentPayloadRelay), satisfied by the handoff
 * CoordinationMessagingService at the call site.
 */
import {
    computeOrderHash,
    type Agreement,
    type Commitment,
    type Hex,
} from "@figaro/core";
import { CONTRACTS } from "@/lib/core/contracts";
import type { IpfsService } from "@/lib/shared/ipfsService";
import { strippingReviver } from "@/lib/shared/safeJson";

/** The order as a (partially-)signed transport envelope. */
export interface CommitmentPayload {
    commitment: Commitment;
    /** The agreement, inline — pinned with the payload so the recipient hydrates
     *  everything from a single CID. */
    agreement: Agreement;
    buyerSig?: Hex;
    sellerSig?: Hex;
}

/** Serialize a payload to compact JSON (bigints → hex strings). */
export function serializeCommitmentPayload(p: CommitmentPayload): string {
    return JSON.stringify(p, (_k, v) => (typeof v === "bigint" ? `0x${v.toString(16)}` : v));
}

/** Deserialize a payload back to typed form (hex strings → bigints). */
export function deserializeCommitmentPayload(json: string): CommitmentPayload {
    // strippingReviver drops __proto__/constructor/prototype at parse time so a
    // malicious relayed envelope can't pollute the prototype chain downstream.
    const raw = JSON.parse(json, strippingReviver);
    const c = raw.commitment;
    for (const f of ["payment", "salt", "deadline", "expectedCumulativeValue"]) {
        if (typeof c[f] === "string" && c[f].startsWith("0x")) c[f] = BigInt(c[f]);
    }
    return raw as CommitmentPayload;
}

interface WalletMessageSigner {
    signMessage(params: { message: string }): Promise<`0x${string}`>;
}

/** The one transport capability this module needs — structural, so core/ depends
 *  on no feature layer. `CoordinationMessagingService` (handoff/) satisfies it. */
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
    evidenceTransport: Pick<IpfsService, "pinBlob">;
}): Promise<string> {
    const {
        payload, recipientAddress, senderAddress, walletClient, chainId,
        coordinationMessaging, evidenceTransport,
    } = params;

    if (!CONTRACTS.core) {
        throw new Error(
            "Core contract address is not configured, so the transport order ID cannot be derived.",
        );
    }

    const orderId = computeOrderHash(payload.commitment, chainId, CONTRACTS.core);
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

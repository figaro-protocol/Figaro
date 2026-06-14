/**
 * commitmentShare — the single buyer/seller-side relay primitive.
 *
 * Pin a signed commitment payload to IPFS and hand its CID to the counter-party
 * over the coordination channel. The recipient's inbox subscription
 * (`subscribeAnyCommitmentPayload`) surfaces it as a pending order to
 * counter-sign. Shared by `CommitmentSharePanel` (one order, manual send) and
 * the multi-order checkout (each sub-order, relayed up front) — there is one
 * share path, not two.
 */

import type { CommitmentPayload } from "@/lib/core/useCommitmentFlow";
import type { IpfsService } from "@/lib/shared/ipfsService";
import { computeOrderHash } from "@/lib/core/commitmentStore";
import { CONTRACTS } from "@/lib/core/contracts";
import { strippingReviver } from "@/lib/shared/safeJson";

/** Serialize a commitment payload to compact JSON (bigints → hex strings). */
export function serializeCommitmentPayload(p: CommitmentPayload): string {
    return JSON.stringify(p, (_key, value) =>
        typeof value === "bigint" ? `0x${value.toString(16)}` : value,
    );
}

/** Deserialize a JSON payload back to a typed commitment (hex strings → bigints). */
export function deserializePayload(json: string): CommitmentPayload {
    // Strip __proto__ / constructor / prototype at parse time so a malicious
    // ?payload= parameter or XMTP-delivered envelope can't pollute the
    // prototype chain when downstream code spreads / Object.assigns the
    // parsed commitment.
    const raw = JSON.parse(json, strippingReviver);
    const c = raw.commitment;

    // Convert hex string fields back to bigint
    const bigintFields = ["payment", "salt", "deadline", "expectedCumulativeValue"];
    for (const f of bigintFields) {
        if (typeof c[f] === "string" && c[f].startsWith("0x")) {
            c[f] = BigInt(c[f]);
        }
    }
    return raw as CommitmentPayload;
}

/**
 * Drop the inline agreement when an `agreementUri` already carries it — keeps the
 * transported payload compact (the recipient hydrates the agreement from IPFS).
 */
export function buildTransportPayload(payload: CommitmentPayload): CommitmentPayload {
    if (payload.agreement && payload.agreementUri) {
        return { ...payload, agreement: undefined };
    }
    return payload;
}

interface WalletMessageSigner {
    signMessage(params: { message: string }): Promise<`0x${string}`>;
}

/** The one transport capability this module needs — structural, so core/
 *  depends on no feature layer. `CoordinationMessagingService` (handoff/)
 *  satisfies it. */
interface CommitmentPayloadRelay {
    sendCommitmentPayload(params: {
        address: string;
        walletClient?: WalletMessageSigner | null;
        recipientAddress: string;
        orderId: string;
        payloadCid: string;
    }): Promise<void>;
}

/**
 * Pin `payload` to IPFS and relay its CID to `recipientAddress` over the
 * coordination channel, keyed by the commitment's on-chain order hash.
 */
export async function shareCommitmentPayload(params: {
    payload: CommitmentPayload;
    recipientAddress: string;
    senderAddress: string;
    walletClient?: WalletMessageSigner | null;
    chainId: number;
    coordinationMessaging: CommitmentPayloadRelay;
    evidenceTransport: Pick<IpfsService, "pinBlob">;
}): Promise<void> {
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
    const payloadJson = serializeCommitmentPayload(buildTransportPayload(payload));
    const blob = new Blob([payloadJson], { type: "application/json" });
    const payloadCid = await evidenceTransport.pinBlob(blob);
    await coordinationMessaging.sendCommitmentPayload({
        address: senderAddress,
        walletClient,
        recipientAddress,
        orderId,
        payloadCid,
    });
}

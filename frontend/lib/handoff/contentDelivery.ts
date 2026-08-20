/**
 * contentDelivery — the counterparty-private content ceremony on a clause
 * declaring the `ecdh-content` interaction (the digital hand-off's
 * `encrypted-transfer` mode: the artifact travels the per-order ECDH
 * channel; the chain never learns the bytes).
 *
 * The DELIVERABLE is wrapped in a small envelope (filename + media type +
 * the artifact bytes) so the receiver can save what it paid for. The
 * completion evidence is `keccak256` of the ARTIFACT BYTES ALONE — the
 * spec's stage-1 `contentHash`, filed as a runtime attestation and verified
 * by the receiver rehashing what it decrypted. The envelope is transport
 * dressing and never hashes.
 *
 * Correlates on `<orderId>#content` — its own ceremony id (`./ceremony`
 * owns the isolation rule), so an address ceremony on the same order never
 * crosses keys or blobs with a content delivery.
 *
 * Channel-sized by design: the ceremony is an AFFORDANCE for artifacts that
 * fit a message (a design file, a credential, a dataset slice); larger
 * deliverables use the clause's `repository-grant` / `public-release`
 * modes, where the stage-1 witness form is the whole path.
 */
import { fromHex, keccak256, toHex } from "viem";
import type { HandoffChannel } from "@figaro-protocol/sdk/handoff";
import {
    decryptCeremonyBlob,
    requestCeremonyKey,
    sendCeremonyBlob,
    type SignChannelAuth,
} from "./ceremony";

/** The per-order content ceremony's correlation id — scoped so it never
 *  collides with the address ceremony's (the bare order hash). */
export function contentCeremonyId(orderId: string): string {
    return `${orderId}#content`;
}

/** Channel-sized cap on the artifact (bytes, pre-encryption). */
export const CONTENT_DELIVERY_MAX_BYTES = 128 * 1024;

/** The delivered artifact, decoded: what the receiver saves. */
export interface DeliveredContent {
    name: string;
    mediaType: string;
    bytes: Uint8Array;
    /** keccak256 of `bytes` — the spec's stage-1 completion evidence. */
    contentHash: `0x${string}`;
}

/** The spec's completion evidence: keccak256 over the artifact's bytes. */
export function contentHashOfBytes(bytes: Uint8Array): `0x${string}` {
    return keccak256(bytes);
}

interface ContentEnvelope {
    name: string;
    mediaType: string;
    bytesHex: `0x${string}`;
}

function tryDecodeContentEnvelope(raw: string): ContentEnvelope | null {
    try {
        const parsed = JSON.parse(raw) as Partial<ContentEnvelope>;
        if (typeof parsed.name !== "string" || typeof parsed.mediaType !== "string") return null;
        if (typeof parsed.bytesHex !== "string" || !/^0x[0-9a-fA-F]*$/.test(parsed.bytesHex)) return null;
        return { name: parsed.name, mediaType: parsed.mediaType, bytesHex: parsed.bytesHex as `0x${string}` };
    } catch {
        return null;
    }
}

/** Step 1 — either party requests the counterparty's content (the buyer
 *  requests the deliverable; a seller may request source materials the
 *  same way). Returns the public key sent. */
export async function requestContentDelivery(
    channel: HandoffChannel,
    params: { myAddress: string; recipientAddress: string; orderId: string; signAuth: SignChannelAuth },
): Promise<string> {
    return requestCeremonyKey(channel, {
        myAddress: params.myAddress,
        recipientAddress: params.recipientAddress,
        ceremonyId: contentCeremonyId(params.orderId),
        signAuth: params.signAuth,
    });
}

/** Step 2 — the answering party encrypts the artifact against the
 *  requester's public key and sends it. Returns the blob and the
 *  completion hash the sender attests at stage 1. Throws when the artifact
 *  exceeds the channel cap — larger deliverables belong to the clause's
 *  other modes. */
export async function sendContentDelivery(
    channel: HandoffChannel,
    params: {
        myAddress: string;
        recipientAddress: string;
        orderId: string;
        recipientPubKeyHex: string;
        artifact: { name: string; mediaType: string; bytes: Uint8Array };
        signAuth: SignChannelAuth;
    },
): Promise<{ blobB64: string; contentHash: `0x${string}` }> {
    const { name, mediaType, bytes } = params.artifact;
    if (bytes.length === 0) throw new Error("The artifact is empty — nothing to deliver.");
    if (bytes.length > CONTENT_DELIVERY_MAX_BYTES) {
        throw new Error(
            `The artifact exceeds the channel cap (${Math.round(CONTENT_DELIVERY_MAX_BYTES / 1024)} KiB) — use the repository-grant or public-release mode for large deliverables.`,
        );
    }
    const contentHash = contentHashOfBytes(bytes);
    const envelope: ContentEnvelope = { name, mediaType, bytesHex: toHex(bytes) };
    const { blobB64 } = await sendCeremonyBlob(channel, {
        myAddress: params.myAddress,
        recipientAddress: params.recipientAddress,
        ceremonyId: contentCeremonyId(params.orderId),
        recipientPubKeyHex: params.recipientPubKeyHex,
        plain: JSON.stringify(envelope),
        signAuth: params.signAuth,
    });
    return { blobB64, contentHash };
}

/** Step 3 — decrypt a received blob and rehash what arrived. Returns null
 *  when the blob doesn't decrypt or doesn't parse — a wrong-key or
 *  corrupted payload is absence, not an exception. The caller compares
 *  `contentHash` against the on-chain stage-1 attestation. */
export async function decryptContentDelivery(params: {
    myAddress: string;
    orderId: string;
    senderPubKeyHex: string;
    blobB64: string;
}): Promise<DeliveredContent | null> {
    const plain = await decryptCeremonyBlob({
        myAddress: params.myAddress,
        ceremonyId: contentCeremonyId(params.orderId),
        senderPubKeyHex: params.senderPubKeyHex,
        blobB64: params.blobB64,
    });
    if (plain === null) return null;
    const envelope = tryDecodeContentEnvelope(plain);
    if (envelope === null) return null;
    const bytes = fromHex(envelope.bytesHex, "bytes");
    return {
        name: envelope.name,
        mediaType: envelope.mediaType,
        bytes,
        contentHash: contentHashOfBytes(bytes),
    };
}

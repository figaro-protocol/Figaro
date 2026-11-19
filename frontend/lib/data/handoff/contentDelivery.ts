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
 * Where the stage-1 set is private, its content carries a blinding value the
 * sender draws (`prepareCompletionEvidence`). The value travels inside the
 * sealed envelope, so the receiver encodes the same content and recomputes
 * the anchor (`completionEvidenceAnchor`). A public set carries none, and
 * its envelope holds no `blinding` key.
 *
 * Channel-sized by design: the ceremony is an AFFORDANCE for artifacts that
 * fit a message (a design file, a credential, a dataset slice); larger
 * deliverables use the clause's `repository-grant` / `public-release`
 * modes, where the stage-1 witness form is the whole path.
 */
import { fromHex, keccak256, toHex, type Hex } from "viem";
import type { HandoffChannel } from "@figaro-protocol/sdk/handoff";
import { contentFieldsFor, encodeContentFromSpec, type ClauseSpec } from "@figaro-protocol/sdk/clauses";
import { prepareAttestationContent } from "@figaro-protocol/sdk/agent";
import { isBytes32Hex } from "@/lib/shared/evm";
import {
    openCeremonyBlob,
    requestCeremonyKey,
    sendCeremonyBlob,
    type SignChannelAuth,
} from "./ceremony";

/** The stage the declaring clause's completion evidence files at. */
export const COMPLETION_STAGE = 1;

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
    /** The blinding value the sender drew for a private stage-1 set; absent
     *  for a public set. */
    blinding?: Hex;
}

/** The spec's completion evidence: keccak256 over the artifact's bytes. */
export function contentHashOfBytes(bytes: Uint8Array): `0x${string}` {
    return keccak256(bytes);
}

/** The blinding field of the stage-1 set, where the set declares one. */
function completionBlindingField(spec: ClauseSpec): string | undefined {
    return contentFieldsFor(spec, { stage: COMPLETION_STAGE }).find((f) => f.blinding === true)?.name;
}

/**
 * The sender's stage-1 completion evidence for an artifact: its keccak256,
 * encoded over the set stage 1 selects and validated, with a private set's
 * blinding value drawn (`prepareAttestationContent`). `content` is what the
 * sender attests; `blinding` is the value the envelope carries to the
 * receiver, absent for a public set. The URI field stays omitted:
 * counterparty-private transfers have no locator.
 */
export function prepareCompletionEvidence(spec: ClauseSpec, contentHash: Hex): { content: Hex; blinding?: Hex } {
    const prepared = prepareAttestationContent(spec, { contentHash }, { stage: COMPLETION_STAGE });
    const field = completionBlindingField(spec);
    return field === undefined
        ? { content: prepared.content }
        : { content: prepared.content, blinding: prepared.values[field] as Hex };
}

/**
 * The anchor the receiver expects for what it decrypted: the content
 * reference of the stage-1 content the sender encoded, rebuilt from the
 * rehash and, for a private set, the blinding value the envelope carried.
 * Null where a private set's value did not arrive: no verdict is given.
 */
export function completionEvidenceAnchor(spec: ClauseSpec, delivered: Pick<DeliveredContent, "contentHash" | "blinding">): Hex | null {
    const field = completionBlindingField(spec);
    if (field !== undefined && delivered.blinding === undefined) return null;
    const values: Record<string, unknown> = field === undefined
        ? { contentHash: delivered.contentHash }
        : { contentHash: delivered.contentHash, [field]: delivered.blinding };
    return keccak256(encodeContentFromSpec(spec, values, { stage: COMPLETION_STAGE }));
}

interface ContentEnvelope {
    name: string;
    mediaType: string;
    bytesHex: `0x${string}`;
    blinding?: Hex;
}

function tryDecodeContentEnvelope(raw: string): ContentEnvelope | null {
    try {
        const parsed = JSON.parse(raw) as Partial<ContentEnvelope>;
        if (typeof parsed.name !== "string" || typeof parsed.mediaType !== "string") return null;
        if (typeof parsed.bytesHex !== "string" || !/^0x[0-9a-fA-F]*$/.test(parsed.bytesHex)) return null;
        if (parsed.blinding !== undefined && !isBytes32Hex(parsed.blinding)) return null;
        return {
            name: parsed.name,
            mediaType: parsed.mediaType,
            bytesHex: parsed.bytesHex as `0x${string}`,
            ...(parsed.blinding !== undefined && { blinding: parsed.blinding }),
        };
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
 *  completion hash the sender attests at stage 1. `blinding` is a private
 *  stage-1 set's blinding value (`prepareCompletionEvidence`), sealed in
 *  the envelope beside the artifact; for a public set it is undefined and
 *  the envelope carries no such key. Throws when the artifact exceeds the
 *  channel cap — larger deliverables belong to the clause's other modes. */
export async function sendContentDelivery(
    channel: HandoffChannel,
    params: {
        myAddress: string;
        recipientAddress: string;
        orderId: string;
        recipientPubKeyHex: string;
        artifact: { name: string; mediaType: string; bytes: Uint8Array };
        signAuth: SignChannelAuth;
        blinding?: Hex;
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
    const envelope: ContentEnvelope = {
        name,
        mediaType,
        bytesHex: toHex(bytes),
        ...(params.blinding !== undefined && { blinding: params.blinding }),
    };
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
    const envelope = await openCeremonyBlob(params, contentCeremonyId(params.orderId), tryDecodeContentEnvelope);
    if (envelope === null) return null;
    const bytes = fromHex(envelope.bytesHex, "bytes");
    return {
        name: envelope.name,
        mediaType: envelope.mediaType,
        bytes,
        contentHash: contentHashOfBytes(bytes),
        ...(envelope.blinding !== undefined && { blinding: envelope.blinding }),
    };
}

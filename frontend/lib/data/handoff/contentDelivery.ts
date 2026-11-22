/**
 * contentDelivery — the counterparty-private content ceremony on a clause
 * declaring the `ecdh-content` interaction (the digital hand-off's
 * `encrypted-transfer` mode: the artifact travels the per-order ECDH
 * channel; the chain never learns the bytes).
 *
 * The DELIVERABLE is wrapped in a small envelope (filename + media type +
 * the artifact bytes) so the receiver can save what it paid for. The
 * completion evidence is `keccak256` of the ARTIFACT BYTES ALONE — written
 * into the stage and the field the spec marks (`block.runtime.contentDigest`,
 * `contentDigestOf`), filed as a runtime attestation and verified by the
 * receiver rehashing what it decrypted. The envelope is transport dressing
 * and never hashes.
 *
 * Correlates on `<orderId>#content` — its own ceremony id (`./ceremony`
 * owns the isolation rule), so an address ceremony on the same order never
 * crosses keys or blobs with a content delivery.
 *
 * Where the marked stage's set is private, as `figaro-content-handoff`
 * declares it, its content carries a blinding value the sender draws
 * (`prepareCompletionEvidence`). The chain and every public place then carry
 * only the fingerprint of that content: one artifact delivered under two
 * orders gives two fingerprints, and an outsider who guesses the artifact
 * cannot confirm the guess. The value travels inside the sealed envelope,
 * so the receiver encodes the same content (`completionEvidenceContent`)
 * and recomputes the anchor (`completionEvidenceAnchor`). A public set
 * carries none, and its envelope holds no `blinding` key.
 *
 * Channel-sized by design: the ceremony is an AFFORDANCE for artifacts that
 * fit a message (a design file, a credential, a dataset slice); larger
 * deliverables use the clause's `repository-grant` / `public-release`
 * modes, where the witness form of the marked stage is the whole path.
 */
import { fromHex, keccak256, toHex, type Hex } from "viem";
import type { HandoffChannel } from "@figaro-protocol/sdk/handoff";
import { contentFieldsFor, encodeContentFromSpec, type ClauseSpec } from "@figaro-protocol/sdk/clauses";
import { prepareAttestationContent } from "@figaro-protocol/sdk/agent";
import { isBytes32Hex } from "@/lib/shared/evm";
import { keepReceivedWitnessContent, type WitnessHolder } from "@/lib/core/witnessContent";
import type { ClauseSpecWithBlock } from "@/lib/shared/clauseSpecSource";
import {
    openCeremonyBlob,
    requestCeremonyKey,
    sendCeremonyBlob,
    type SignChannelAuth,
} from "./ceremony";

/** The `block.runtime.contentDigest` mark, as the spec loader parses it
 *  (`ContentDigestMark`, `frontend/lib/shared/clauseBlockBinding.ts`). */
type ContentDigestMark = NonNullable<NonNullable<ClauseSpecWithBlock["block"]>["runtime"]["contentDigest"]>;

/** Where the declaring clause attests the digest of the delivered content,
 *  as its spec marks it (`block.runtime.contentDigest`): the stage, and the
 *  field of that stage's set that holds the keccak256 of the bytes. The
 *  set is the stage's `stages` entry, else the content fields
 *  (`contentFieldsFor`). A mark whose field that set does not declare as a
 *  `string` field marks nothing. Undefined for a clause with no mark: it
 *  carries no delivery evidence, whatever its fields are called. */
export function contentDigestOf(spec: ClauseSpecWithBlock): ContentDigestMark | undefined {
    const mark = spec.block?.runtime.contentDigest;
    if (!mark) return undefined;
    const field = contentFieldsFor(spec, { stage: mark.stage }).find((f) => f.name === mark.field);
    return field?.type === "string" ? mark : undefined;
}

/** The per-order content ceremony's correlation id — scoped so it never
 *  collides with the address ceremony's (the bare order hash). */
export function contentCeremonyId(orderId: string): string {
    return `${orderId}#content`;
}

/** Channel-sized cap on the artifact (bytes, pre-encryption). */
export const CONTENT_DELIVERY_MAX_BYTES = 128 * 1024;

/** What the receiver's check reads of a delivery: the rehash of the
 *  artifact and, for a private set, the blinding value the envelope carried. */
export interface DeliveredEvidence {
    contentHash: Hex;
    blinding?: Hex;
}

/** The delivered artifact, decoded: what the receiver saves. */
export interface DeliveredContent {
    name: string;
    mediaType: string;
    bytes: Uint8Array;
    /** keccak256 of `bytes` — the completion evidence the spec marks. */
    contentHash: `0x${string}`;
    /** The blinding value the sender drew for a private set of the marked stage; absent
     *  for a public set. */
    blinding?: Hex;
}

/** The spec's completion evidence: keccak256 over the artifact's bytes. */
export function contentHashOfBytes(bytes: Uint8Array): `0x${string}` {
    return keccak256(bytes);
}

/** The blinding field of the marked stage's set, where the set declares one. */
function completionBlindingField(spec: ClauseSpec, digest: ContentDigestMark): string | undefined {
    return contentFieldsFor(spec, { stage: digest.stage }).find((f) => f.blinding === true)?.name;
}

/**
 * The sender's completion evidence for an artifact: its keccak256 in the
 * field the spec marks (`contentDigestOf`), encoded over the set of the
 * marked stage and validated, with a private set's blinding value drawn
 * (`prepareAttestationContent`). `content` is what the sender attests at
 * `stage`; `blinding` is the value the envelope carries to the receiver,
 * absent for a public set. Every other field stays omitted:
 * counterparty-private transfers have no locator. Null for a clause whose
 * spec marks no delivery evidence.
 */
export function prepareCompletionEvidence(spec: ClauseSpecWithBlock, digest: Hex): { stage: number; content: Hex; blinding?: Hex } | null {
    const mark = contentDigestOf(spec);
    if (!mark) return null;
    const prepared = prepareAttestationContent(spec, { [mark.field]: digest }, { stage: mark.stage });
    const field = completionBlindingField(spec, mark);
    return field === undefined
        ? { stage: mark.stage, content: prepared.content }
        : { stage: mark.stage, content: prepared.content, blinding: prepared.values[field] as Hex };
}

/**
 * The marked stage's content the sender encoded, rebuilt by the receiver
 * from the rehash and, for a private set, the blinding value the envelope
 * carried. Null where a private set's value did not arrive, or the spec
 * marks no delivery evidence. The receiver keeps these bytes as its copy of
 * the sender's private filing once the chain holds their reference
 * (`keepReceivedWitnessContent`).
 */
function completionEvidenceContent(
    spec: ClauseSpecWithBlock,
    delivered: DeliveredEvidence,
): { content: Hex; mark: ContentDigestMark } | null {
    const mark = contentDigestOf(spec);
    if (!mark) return null;
    const field = completionBlindingField(spec, mark);
    if (field !== undefined && delivered.blinding === undefined) return null;
    const values: Record<string, unknown> = field === undefined
        ? { [mark.field]: delivered.contentHash }
        : { [mark.field]: delivered.contentHash, [field]: delivered.blinding };
    return { content: encodeContentFromSpec(spec, values, { stage: mark.stage }), mark };
}

/**
 * The anchor the receiver expects for what it decrypted: the content
 * reference of `completionEvidenceContent`. Null where a private set's
 * value did not arrive, or the spec marks no delivery evidence: no verdict
 * is given.
 */
export function completionEvidenceAnchor(spec: ClauseSpecWithBlock, delivered: DeliveredEvidence): Hex | null {
    const rebuilt = completionEvidenceContent(spec, delivered);
    return rebuilt === null ? null : keccak256(rebuilt.content);
}

/**
 * The receiver keeps the marked stage's content it rebuilt as its copy of
 * the sender's private filing, so its evidence file and audit page hold what
 * it verified. The caller passes it only once an `Attestation` by the sender
 * holds this order, clause, stage and reference (the ceremony's verdict
 * "verified"), as for every received filing. A public set's content is
 * published by its attester, so nothing is kept: `"public"`.
 */
export function keepVerifiedCompletionEvidence(
    holder: WitnessHolder | null | undefined,
    spec: ClauseSpecWithBlock,
    place: { orderHash: Hex | string; clauseId: Hex | string },
    delivered: DeliveredEvidence,
): "public" | "kept" | "refused" {
    const rebuilt = completionEvidenceContent(spec, delivered);
    if (rebuilt === null) return "refused";
    if (completionBlindingField(spec, rebuilt.mark) === undefined) return "public";
    return keepReceivedWitnessContent(holder, {
        orderHash: place.orderHash, clauseId: place.clauseId, stage: rebuilt.mark.stage, contentRef: keccak256(rebuilt.content), content: rebuilt.content,
    });
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
 *  completion hash the sender attests at the marked stage. `blinding` is a private
 *  set's blinding value (`prepareCompletionEvidence`), sealed in
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
 *  `contentHash` against the on-chain attestation at the marked stage. */
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

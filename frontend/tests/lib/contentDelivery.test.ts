/**
 * contentDelivery — the counterparty-private content ceremony, lib tier.
 *
 * Real crypto end to end (the shared ceremony core: ECDH + WebCrypto
 * AES-GCM + EIP-191 wallet auth; no mocks): the buyer requests, the seller
 * delivers an artifact, the buyer decrypts and REHASHES — the rehash IS the
 * spec's stage-1 completion evidence; the ceremony correlates on its own
 * scoped id so it never crosses an address ceremony on the same order; the
 * channel cap refuses oversized artifacts; a wrong key decrypts to absence.
 * The stage-1 evidence: a public set's envelope is unchanged and carries no
 * blinding value; a private set's blinding value travels sealed inside the
 * envelope, so the receiver recomputes the filed anchor.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { computeClauseKey } from "@figaro-protocol/sdk";
import { decodeContentFromSpec, parseClauseSpec, type SpecParseError } from "@figaro-protocol/sdk/clauses";
import { parseBlockBinding } from "@/lib/shared/clauseBlockBinding";
import type { ClauseSpecWithBlock } from "@/lib/shared/clauseSpecSource";
import {
    CONTENT_DELIVERY_MAX_BYTES,
    completionEvidenceAnchor,
    contentCeremonyId,
    contentDigestOf,
    contentHashOfBytes,
    decryptContentDelivery,
    prepareCompletionEvidence,
    requestContentDelivery,
    sendContentDelivery,
} from "@/lib/data/handoff/contentDelivery";
import { requestAddressDetail } from "@/lib/data/handoff/addressDetail";
import { decryptCeremonyBlob, sendCeremonyBlob } from "@/lib/data/handoff/ceremony";
import { recordingChannel } from "../support/recordingChannel";

const SELLER_ACCOUNT = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const BUYER_ACCOUNT = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const SELLER = SELLER_ACCOUNT.address;
const BUYER = BUYER_ACCOUNT.address;
const sellerSign = (message: string) => SELLER_ACCOUNT.signMessage({ message });
const buyerSign = (message: string) => BUYER_ACCOUNT.signMessage({ message });
const ORDER = "0x" + "cd".repeat(32);

const ARTIFACT = {
    name: "cut-final.svg",
    mediaType: "image/svg+xml",
    bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><title>the deliverable</title></svg>'),
};


beforeEach(() => {
    window.sessionStorage.clear();
});

describe("the content-delivery ceremony", () => {
    it("request → deliver → decrypt round-trips the artifact; the rehash IS the completion evidence", async () => {
        const { channel, sent } = recordingChannel();

        const buyerPub = await requestContentDelivery(channel, {
            myAddress: BUYER, recipientAddress: SELLER, orderId: ORDER, signAuth: buyerSign,
        });
        const { blobB64, contentHash } = await sendContentDelivery(channel, {
            myAddress: SELLER, recipientAddress: BUYER, orderId: ORDER,
            recipientPubKeyHex: buyerPub, artifact: ARTIFACT, signAuth: sellerSign,
        });
        const sellerPub = sent.find((m) => m.kind === "pubkey" && m.value !== buyerPub)!.value;

        // The sender's declared completion evidence is keccak of the bytes.
        expect(contentHash).toBe(keccak256(ARTIFACT.bytes));
        // The blob is ciphertext — the artifact never crosses in the clear.
        expect(blobB64).not.toContain("deliverable");

        const delivered = await decryptContentDelivery({
            myAddress: BUYER, orderId: ORDER, senderPubKeyHex: sellerPub, blobB64,
        });
        expect(delivered).not.toBeNull();
        expect(delivered!.name).toBe(ARTIFACT.name);
        expect(delivered!.mediaType).toBe(ARTIFACT.mediaType);
        expect(Array.from(delivered!.bytes)).toEqual(Array.from(ARTIFACT.bytes));
        // The receiver's REHASH equals the sender's declared hash — the
        // verify-by-rehashing loop the clause description promises.
        expect(delivered!.contentHash).toBe(contentHash);
    });

    it("the ceremony correlates on its OWN scoped id — an address ceremony on the same order never crosses it", async () => {
        const { channel, sent } = recordingChannel();
        await requestContentDelivery(channel, {
            myAddress: BUYER, recipientAddress: SELLER, orderId: ORDER, signAuth: buyerSign,
        });
        await requestAddressDetail(channel, {
            myAddress: BUYER, recipientAddress: SELLER, orderId: ORDER, signAuth: buyerSign,
        });
        const [contentMsg, addressMsg] = sent;
        expect(contentMsg.orderId).toBe(contentCeremonyId(ORDER));
        expect(addressMsg.orderId).toBe(ORDER);
        expect(contentMsg.orderId).not.toBe(addressMsg.orderId);
        // Distinct ceremonies, distinct ephemeral keypairs — a compromise of
        // one ceremony's key never opens the other.
        expect(contentMsg.value).not.toBe(addressMsg.value);
    });

    it("refuses artifacts over the channel cap — the other modes are the path for large deliverables", async () => {
        const { channel } = recordingChannel();
        const buyerPub = await requestContentDelivery(channel, {
            myAddress: BUYER, recipientAddress: SELLER, orderId: ORDER, signAuth: buyerSign,
        });
        await expect(sendContentDelivery(channel, {
            myAddress: SELLER, recipientAddress: BUYER, orderId: ORDER,
            recipientPubKeyHex: buyerPub,
            artifact: { name: "too-big.bin", mediaType: "application/octet-stream", bytes: new Uint8Array(CONTENT_DELIVERY_MAX_BYTES + 1) },
            signAuth: sellerSign,
        })).rejects.toThrow(/channel cap/);
        await expect(sendContentDelivery(channel, {
            myAddress: SELLER, recipientAddress: BUYER, orderId: ORDER,
            recipientPubKeyHex: buyerPub,
            artifact: { name: "empty.bin", mediaType: "application/octet-stream", bytes: new Uint8Array(0) },
            signAuth: sellerSign,
        })).rejects.toThrow(/empty/);
    });

    it("a wrong key or corrupted blob decrypts to absence, never an exception", async () => {
        const { channel, sent } = recordingChannel();
        const buyerPub = await requestContentDelivery(channel, {
            myAddress: BUYER, recipientAddress: SELLER, orderId: ORDER, signAuth: buyerSign,
        });
        const { blobB64 } = await sendContentDelivery(channel, {
            myAddress: SELLER, recipientAddress: BUYER, orderId: ORDER,
            recipientPubKeyHex: buyerPub, artifact: ARTIFACT, signAuth: sellerSign,
        });
        const sellerPub = sent.find((m) => m.kind === "pubkey" && m.value !== buyerPub)!.value;
        // An eavesdropper (fresh keypair, different address) gets nothing.
        const eavesdropper = await decryptContentDelivery({
            myAddress: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", orderId: ORDER,
            senderPubKeyHex: sellerPub, blobB64,
        });
        expect(eavesdropper).toBeNull();
        // A corrupted blob is absence too.
        const corrupted = await decryptContentDelivery({
            myAddress: BUYER, orderId: ORDER, senderPubKeyHex: sellerPub,
            blobB64: blobB64.slice(0, -4) + "AAAA",
        });
        expect(corrupted).toBeNull();
        // contentHashOfBytes is the keccak-256 of the bytes: the digest of the
        // artifact above, fixed here.
        expect(contentHashOfBytes(ARTIFACT.bytes)).toBe("0x443b39c1bf7f73a45b5e6a32b8cf4a803d0c658c9eea9cd86ea0146425a1f7ad");
        expect(contentHashOfBytes(new Uint8Array(ARTIFACT.bytes))).toBe("0x443b39c1bf7f73a45b5e6a32b8cf4a803d0c658c9eea9cd86ea0146425a1f7ad");
    });
});

// ── The stage-1 completion evidence, public and private ──────────────────

type RawSpec = {
    clauseId: string;
    fields: Array<Record<string, unknown>>;
    stages: Record<string, Array<Record<string, unknown>>>;
    block: Record<string, Record<string, unknown>>;
};

function readContentHandoffJson(): RawSpec {
    return JSON.parse(readFileSync(path.resolve(process.cwd(), "../clauses/figaro-content-handoff.json"), "utf8"));
}

/** A spec as the spec cache holds it: the content half and its parsed `block`. */
function parsed(raw: unknown): ClauseSpecWithBlock {
    const result = parseClauseSpec(raw);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const errors: SpecParseError[] = [];
    const block = parseBlockBinding((raw as { block: unknown }).block, "$.block", errors);
    if (block === null) throw new Error(JSON.stringify(errors));
    return { ...result.spec, clauseKey: computeClauseKey(raw), block };
}

/** The content hand-off clause in `clauses/`, whose stage 1 is private:
 *  the content hash, the locator and the one blinding field. */
function contentHandoffSpec(): ClauseSpecWithBlock {
    return parsed(readContentHandoffJson());
}

/** A stranger's delivery clause: its own id, its digest at stage 3 under a
 *  field name no reference spec declares, and the mark that says so. */
function strangerSpec(mark: unknown): ClauseSpecWithBlock {
    return parsed({
        clauseId: "stranger-file-drop",
        version: 1,
        title: "File drop",
        description: "A digest of the delivered file, under the clause's own names.",
        fields: [{ name: "dropMode", type: "string", required: true }],
        stages: { "3": [{ name: "fileDigest", type: "string", required: true, pattern: "^0x[0-9a-fA-F]{64}$" }] },
        block: { design: { article: "logistics" }, runtime: { interaction: { interface: "ecdh-content" }, contentDigest: mark } },
    });
}

/** The same clause with a public stage 1: no field private, no blinding
 *  field. Anyone may register such a clause; nothing in the ceremony reads
 *  its name. */
function publicStageSpec(): ClauseSpecWithBlock {
    const raw = readContentHandoffJson();
    raw.stages["1"] = raw.stages["1"]
        .filter((f) => f.blinding !== true)
        .map(({ disposition: _disposition, ...f }) => f);
    return parsed(raw);
}

/** One delivery end to end: the sender prepares the evidence, seals the
 *  envelope, and the receiver decrypts it. Returns the raw plaintext too. */
async function deliverWith(spec: ClauseSpecWithBlock) {
    const { channel, sent } = recordingChannel();
    const buyerPub = await requestContentDelivery(channel, {
        myAddress: BUYER, recipientAddress: SELLER, orderId: ORDER, signAuth: buyerSign,
    });
    const evidence = prepareCompletionEvidence(spec, contentHashOfBytes(ARTIFACT.bytes));
    if (!evidence) throw new Error("the spec marks no delivery evidence");
    const { blobB64 } = await sendContentDelivery(channel, {
        myAddress: SELLER, recipientAddress: BUYER, orderId: ORDER,
        recipientPubKeyHex: buyerPub, artifact: ARTIFACT, signAuth: sellerSign,
        blinding: evidence.blinding,
    });
    const sellerPub = sent.find((m) => m.kind === "pubkey" && m.value !== buyerPub)!.value;
    const plain = await decryptCeremonyBlob({
        myAddress: BUYER, ceremonyId: contentCeremonyId(ORDER), senderPubKeyHex: sellerPub, blobB64,
    });
    const delivered = await decryptContentDelivery({
        myAddress: BUYER, orderId: ORDER, senderPubKeyHex: sellerPub, blobB64,
    });
    if (!delivered) throw new Error("the delivery did not decrypt");
    return { evidence, plain, delivered };
}

describe("the completion evidence the receiver checks", () => {
    it("a public stage 1 (a stranger's clause): no blinding value; the plaintext is the envelope without one; the receiver's anchor is the filed one", async () => {
        const spec = publicStageSpec();
        const { evidence, plain, delivered } = await deliverWith(spec);
        expect(evidence.blinding).toBeUndefined();
        expect(plain).toBe(JSON.stringify({ name: ARTIFACT.name, mediaType: ARTIFACT.mediaType, bytesHex: toHex(ARTIFACT.bytes) }));
        expect(delivered.blinding).toBeUndefined();
        expect(completionEvidenceAnchor(spec, delivered)).toBe(keccak256(evidence.content));
    });

    it("a private stage 1 (figaro-content-handoff): the sender's blinding value travels inside the sealed envelope, and the receiver recomputes the filed anchor with it", async () => {
        const spec = contentHandoffSpec();
        const { evidence, plain, delivered } = await deliverWith(spec);
        expect(evidence.blinding).toMatch(/^0x[0-9a-f]{64}$/);
        expect(JSON.parse(plain!).blinding).toBe(evidence.blinding);
        expect(delivered.blinding).toBe(evidence.blinding);
        expect(completionEvidenceAnchor(spec, delivered)).toBe(keccak256(evidence.content));
        // Without the value the anchor cannot be recomputed: no verdict.
        expect(completionEvidenceAnchor(spec, { ...delivered, blinding: undefined })).toBeNull();
        // Another value gives an anchor the chain does not carry.
        expect(completionEvidenceAnchor(spec, { ...delivered, blinding: `0x${"11".repeat(32)}` })).not.toBe(keccak256(evidence.content));
    });

    it("an envelope whose blinding value is not 32 bytes of hex decrypts to absence", async () => {
        const { channel, sent } = recordingChannel();
        const buyerPub = await requestContentDelivery(channel, {
            myAddress: BUYER, recipientAddress: SELLER, orderId: ORDER, signAuth: buyerSign,
        });
        const { blobB64 } = await sendCeremonyBlob(channel, {
            myAddress: SELLER, recipientAddress: BUYER, ceremonyId: contentCeremonyId(ORDER),
            recipientPubKeyHex: buyerPub,
            plain: JSON.stringify({ name: "a", mediaType: "b", bytesHex: "0x01", blinding: "0x1234" }),
            signAuth: sellerSign,
        });
        const sellerPub = sent.find((m) => m.kind === "pubkey" && m.value !== buyerPub)!.value;
        expect(await decryptContentDelivery({ myAddress: BUYER, orderId: ORDER, senderPubKeyHex: sellerPub, blobB64 })).toBeNull();
    });
});

// ── Where the digest goes: the spec's mark, never a field's name ─────────────

describe("the completion evidence goes where the spec marks it (block.runtime.contentDigest)", () => {
    const DIGEST = contentHashOfBytes(ARTIFACT.bytes);

    it("a stranger's clause that marks its own stage and field gets the digest there, and the receiver's anchor is the filed one", async () => {
        const spec = strangerSpec({ stage: 3, field: "fileDigest" });
        expect(contentDigestOf(spec)).toEqual({ stage: 3, field: "fileDigest" });
        const { evidence, delivered } = await deliverWith(spec);
        expect(evidence.stage).toBe(3);
        expect(decodeContentFromSpec(spec, evidence.content, { stage: 3 })).toEqual({ fileDigest: DIGEST });
        expect(completionEvidenceAnchor(spec, delivered)).toBe(keccak256(evidence.content));
    });

    it("the reference clause, with its mark, files the digest at stage 1", () => {
        const spec = contentHandoffSpec();
        expect(contentDigestOf(spec)).toEqual({ stage: 1, field: "contentHash" });
        expect(prepareCompletionEvidence(spec, DIGEST)?.stage).toBe(1);
    });

    it("a clause with a stage-1 field of the reference's name and no mark carries no delivery evidence", () => {
        const raw = readContentHandoffJson();
        raw.block.runtime = { ...raw.block.runtime, contentDigest: null };
        const spec = parsed(raw);
        expect(contentDigestOf(spec)).toBeUndefined();
        expect(prepareCompletionEvidence(spec, DIGEST)).toBeNull();
        expect(completionEvidenceAnchor(spec, { contentHash: DIGEST })).toBeNull();
    });

    it("a mark the spec's own stages contradict marks nothing", () => {
        // The field is not in the marked stage's set.
        expect(contentDigestOf(strangerSpec({ stage: 3, field: "otherDigest" }))).toBeUndefined();
        // Stage 2 declares no set, so the content fields stand, and they hold no such field.
        expect(contentDigestOf(strangerSpec({ stage: 2, field: "fileDigest" }))).toBeUndefined();
    });
});

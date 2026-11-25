/**
 * privateFilings — the third use of the per-order sealed ceremony: the
 * counterparty asks for the private filings of one order, and their
 * attester sends every copy it kept, sealed to the asker's key.
 *
 * Real crypto end to end (the shared ceremony core: ECDH, AES-GCM, EIP-191
 * wallet auth). The receiver keeps an entry only when its bytes hash to the
 * content reference it names, it names this order, and an Attestation by the
 * sender holds that place on the chain; a tampered entry or one for another
 * order is dropped and the others are kept; a payload over the bound is
 * refused by the sender and by the receiver.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { keccak256, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { encodeContentFromSpec } from "@figaro-protocol/sdk/clauses";
import {
    PRIVATE_FILINGS_MAX_BLOB_CHARS,
    PRIVATE_FILINGS_MAX_BYTES,
    PRIVATE_FILINGS_MAX_COUNT,
    decryptPrivateFilings,
    filingsCeremonyId,
    heldOwnPrivateFilings,
    keepConfirmedPrivateFilings,
    privateFilingAnchors,
    privateFilingsInPlay,
    privateFilingsNotHeld,
    requestPrivateFilings,
    sendPrivateFilings,
    type PrivateFiling,
} from "@/lib/data/handoff/privateFilings";
import { contentCeremonyId } from "@/lib/data/handoff/contentDelivery";
import { sendCeremonyBlob } from "@/lib/data/handoff/ceremony";
import {
    KEPT_WITNESS_STORAGE_KEY,
    keepPrivateWitnessContent,
    keepReceivedWitnessContent,
    readHeldWitness,
    readKeptWitnessContent,
} from "@/lib/core/witnessContent";
import { getClauseSpec, loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { pinSpec } from "./primeClauseSpecs";
import { recordingChannel } from "../support/recordingChannel";

const SELLER_ACCOUNT = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const BUYER_ACCOUNT = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const SELLER = SELLER_ACCOUNT.address;
const BUYER = BUYER_ACCOUNT.address;
const sellerSign = (message: string) => SELLER_ACCOUNT.signMessage({ message });
const buyerSign = (message: string) => BUYER_ACCOUNT.signMessage({ message });
const ORDER = `0x${"cd".repeat(32)}` as Hex;
const OTHER_ORDER = `0x${"ce".repeat(32)}` as Hex;
/** The two wallets as holders of kept copies, on the devnet chain. */
const AS_SELLER = { address: SELLER, chainId: 31337 };
const AS_BUYER = { address: BUYER, chainId: 31337 };

/** A clause no file in `clauses/` holds: two private witness stages, each
 *  with its blinding field. */
const PRIVATE = pinSpec({
    clauseId: "test-private-filings",
    version: 1,
    title: "Private readings",
    description: "Two private witness stages.",
    fields: [{ name: "note", type: "string", required: true, disposition: "public" }],
    stages: {
        "1": [
            { name: "reading", type: "string", required: true, disposition: "private" },
            { name: "blinding", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true },
        ],
        "2": [
            { name: "reading", type: "string", required: true, disposition: "private" },
            { name: "blinding", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true },
        ],
    },
});

beforeAll(async () => {
    setClauseSpecFetcher(async () => PRIVATE.bytes);
    await loadClauseSpec(PRIVATE.clauseKey, "mem://test-private-filings");
});

function contentAt(stage: number, reading: string): Hex {
    return encodeContentFromSpec(getClauseSpec(PRIVATE.clauseKey)!, { reading, blinding: `0x${String(stage).repeat(64)}` }, { stage });
}

function filingAt(stage: number, reading: string, orderHash: Hex = ORDER): PrivateFiling {
    const content = contentAt(stage, reading);
    return { orderHash, clauseId: PRIVATE.clauseKey, stage, contentRef: keccak256(content), content };
}


/** The buyer asks; returns its key and the channel. */
async function buyerAsks() {
    const rec = recordingChannel();
    const buyerPub = await requestPrivateFilings(rec.channel, { myAddress: BUYER, recipientAddress: SELLER, orderId: ORDER, signAuth: buyerSign });
    return { ...rec, buyerPub };
}

/** Seal any plain text to the buyer under the filings ceremony, as a
 *  hostile or faulty sender could. */
async function sealRaw(plain: string) {
    const { channel, sent, buyerPub } = await buyerAsks();
    const { blobB64 } = await sendCeremonyBlob(channel, {
        myAddress: SELLER, recipientAddress: BUYER, ceremonyId: filingsCeremonyId(ORDER),
        recipientPubKeyHex: buyerPub, plain, signAuth: sellerSign,
    });
    const sellerPub = sent.find((m) => m.kind === "pubkey" && m.value !== buyerPub)!.value;
    return decryptPrivateFilings({ myAddress: BUYER, orderId: ORDER, senderPubKeyHex: sellerPub, blobB64 });
}

const clearKept = () => {
    for (const key of Object.keys(window.localStorage)) if (key.startsWith(KEPT_WITNESS_STORAGE_KEY)) window.localStorage.removeItem(key);
};

beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
});

describe("what the receiver's page counts as a private filing", () => {
    const PUBLIC = pinSpec({
        clauseId: "test-public-filings",
        version: 1,
        title: "Public readings",
        description: "A public witness stage.",
        fields: [{ name: "note", type: "string", required: true, disposition: "public" }],
        stages: { "1": [{ name: "reading", type: "string", required: true, disposition: "public" }] },
    });
    const UNREAD = `0x${"9a".repeat(32)}` as Hex;
    const FAILED = pinSpec({ ...JSON.parse(PUBLIC.bytes), clauseId: "test-failed-read" });
    const at = (clauseId: Hex) => [{ orderHash: ORDER, clauseId, stage: 1, contentRef: keccak256("0x01"), attester: SELLER }];

    beforeAll(async () => {
        setClauseSpecFetcher(async () => PUBLIC.bytes);
        await loadClauseSpec(PUBLIC.clauseKey, "mem://test-public-filings");
        setClauseSpecFetcher(async () => { throw new Error("gateway unreachable"); });
        await loadClauseSpec(FAILED.clauseKey, "mem://test-failed-read").catch(() => undefined);
        setClauseSpecFetcher(async () => PRIVATE.bytes);
    });

    it("a filing whose clause's spec declares the set private counts", () => {
        expect(privateFilingsNotHeld(ORDER, at(PRIVATE.clauseKey), SELLER, AS_BUYER)).toBe(1);
        expect(privateFilingsInPlay(ORDER, at(PRIVATE.clauseKey), AS_BUYER, SELLER)).toBe(true);
    });

    it("a public filing does not count", () => {
        expect(privateFilingsNotHeld(ORDER, at(PUBLIC.clauseKey), SELLER, AS_BUYER)).toBe(0);
        expect(privateFilingsInPlay(ORDER, at(PUBLIC.clauseKey), AS_BUYER, SELLER)).toBe(false);
    });

    it("a filing whose clause's spec is not loaded, or whose read failed, does not count", () => {
        expect(getClauseSpec(UNREAD)).toBeUndefined();
        expect(getClauseSpec(FAILED.clauseKey)).toBeUndefined();
        for (const key of [UNREAD, FAILED.clauseKey]) {
            expect(privateFilingsNotHeld(ORDER, at(key), SELLER, AS_BUYER)).toBe(0);
            expect(privateFilingsInPlay(ORDER, at(key), AS_BUYER, SELLER)).toBe(false);
        }
    });
});

describe("the private-filings ceremony", () => {
    it("runs under its own id, apart from the address and the content ceremonies on the same order", () => {
        expect(filingsCeremonyId(ORDER)).toBe(`${ORDER}#filings`);
        expect(filingsCeremonyId(ORDER)).not.toBe(ORDER);
        expect(filingsCeremonyId(ORDER)).not.toBe(contentCeremonyId(ORDER));
    });

    it("the attester lists the private filings it kept for this order alone, its own copies only", () => {
        const a = filingAt(1, "41.2");
        const b = filingAt(2, "39.8");
        const elsewhere = filingAt(1, "12.0", OTHER_ORDER);
        for (const f of [a, b, elsewhere]) keepPrivateWitnessContent(AS_SELLER, { orderHash: f.orderHash, clauseId: f.clauseId, stage: f.stage, content: f.content });
        const events = [a, b, elsewhere].map((f) => ({ orderHash: f.orderHash, clauseId: f.clauseId, stage: f.stage, contentRef: f.contentRef, attester: SELLER }));
        const own = heldOwnPrivateFilings(ORDER, events, AS_SELLER);
        expect(own.map((f) => f.contentRef).sort()).toEqual([a.contentRef, b.contentRef].sort());
        // Another wallet's filings are not this wallet's to send.
        expect(heldOwnPrivateFilings(ORDER, events, AS_BUYER)).toEqual([]);
    });

    it("request, send and unseal round-trip two filings; each is kept once its attestation by the sender is on the chain", async () => {
        const { channel, sent, buyerPub } = await buyerAsks();
        const filings = [filingAt(1, "41.2"), filingAt(2, "39.8")];
        const { blobB64, count } = await sendPrivateFilings(channel, {
            myAddress: SELLER, recipientAddress: BUYER, orderId: ORDER, recipientPubKeyHex: buyerPub, filings, signAuth: sellerSign,
        });
        expect(count).toBe(2);
        // Every message carries the filings ceremony's id; the blob is ciphertext.
        expect(new Set(sent.map((m) => m.orderId))).toEqual(new Set([filingsCeremonyId(ORDER)]));
        expect(blobB64).not.toContain(filings[0].content.slice(2, 40));

        const sellerPub = sent.find((m) => m.kind === "pubkey" && m.value !== buyerPub)!.value;
        const received = await decryptPrivateFilings({ myAddress: BUYER, orderId: ORDER, senderPubKeyHex: sellerPub, blobB64 });
        expect(received).not.toBeNull();
        expect(received!.refusal).toBeNull();
        expect(received!.dropped).toBe(0);
        expect(received!.filings).toEqual(filings);

        // The chain must hold each place, filed by the sender.
        expect(privateFilingAnchors(received!, SELLER)).toEqual(filings.map((f) => ({
            contentRef: f.contentRef, clauseId: f.clauseId, stage: f.stage, attester: SELLER,
        })));

        // The second attestation is not on the chain yet: only the first is kept.
        expect(keepConfirmedPrivateFilings(AS_BUYER, received!, [true, false])).toBe(1);
        expect(readKeptWitnessContent(AS_BUYER, filings[0])).toBe(filings[0].content);
        expect(readKeptWitnessContent(AS_BUYER, filings[1])).toBeNull();
        // Once it appears, the second is kept too.
        expect(keepConfirmedPrivateFilings(AS_BUYER, received!, [true, true])).toBe(2);
        for (const f of filings) {
            const held = readHeldWitness(AS_BUYER, f);
            expect(held?.content).toBe(f.content);
            // The copy says it was received from the counterparty.
            expect(held?.received).toBe(true);
            expect(held?.values).toMatchObject({ reading: f.stage === 1 ? "41.2" : "39.8" });
        }
    });

    it("a copy received never stands for the attester's own: the attester's own copy is not marked received", () => {
        const f = filingAt(1, "41.2");
        keepPrivateWitnessContent(AS_SELLER, { orderHash: f.orderHash, clauseId: f.clauseId, stage: f.stage, content: f.content });
        expect(readHeldWitness(AS_SELLER, f)?.received).toBe(false);
    });

    it("never sends an entry kept for another order", async () => {
        const { channel, sent, buyerPub } = await buyerAsks();
        const { count, blobB64 } = await sendPrivateFilings(channel, {
            myAddress: SELLER, recipientAddress: BUYER, orderId: ORDER, recipientPubKeyHex: buyerPub,
            filings: [filingAt(1, "41.2"), filingAt(1, "12.0", OTHER_ORDER)], signAuth: sellerSign,
        });
        expect(count).toBe(1);
        const sellerPub = sent.find((m) => m.kind === "pubkey" && m.value !== buyerPub)!.value;
        const received = await decryptPrivateFilings({ myAddress: BUYER, orderId: ORDER, senderPubKeyHex: sellerPub, blobB64 });
        expect(received!.filings.map((f) => f.orderHash)).toEqual([ORDER]);
    });

    it("a tampered entry is dropped and the other is kept", async () => {
        const good = filingAt(1, "41.2");
        const bad = filingAt(2, "39.8");
        const flipped = `${bad.content.slice(0, 70)}${bad.content[70] === "f" ? "0" : "f"}${bad.content.slice(71)}` as Hex;
        const received = await sealRaw(JSON.stringify({ filings: [good, { ...bad, content: flipped }] }));
        expect(received!.filings).toEqual([good]);
        expect(received!.dropped).toBe(1);
        expect(keepConfirmedPrivateFilings(AS_BUYER, received!, [true])).toBe(1);
        expect(readKeptWitnessContent(AS_BUYER, good)).toBe(good.content);
        expect(readKeptWitnessContent(AS_BUYER, bad)).toBeNull();
    });

    it("an entry that names another order is dropped and the other is kept", async () => {
        const good = filingAt(1, "41.2");
        const elsewhere = filingAt(1, "12.0", OTHER_ORDER);
        const received = await sealRaw(JSON.stringify({ filings: [elsewhere, good] }));
        expect(received!.filings).toEqual([good]);
        expect(received!.dropped).toBe(1);
    });

    it("an entry not yet attested on the chain is kept nowhere", async () => {
        const f = filingAt(1, "41.2");
        const received = await sealRaw(JSON.stringify({ filings: [f] }));
        expect(keepConfirmedPrivateFilings(AS_BUYER, received!, [false])).toBe(0);
        expect(Object.keys(window.localStorage).filter((k) => k.startsWith(KEPT_WITNESS_STORAGE_KEY))).toEqual([]);
    });

    it("refuses a payload over the bound, on the sender's side and on the receiver's", async () => {
        const { channel, buyerPub } = await buyerAsks();
        const many = Array.from({ length: PRIVATE_FILINGS_MAX_COUNT + 1 }, (_, i) => filingAt(1, `r${i}`));
        await expect(sendPrivateFilings(channel, {
            myAddress: SELLER, recipientAddress: BUYER, orderId: ORDER, recipientPubKeyHex: buyerPub, filings: many, signAuth: sellerSign,
        })).rejects.toThrow(/at most/);
        const big = filingAt(1, "x".repeat(PRIVATE_FILINGS_MAX_BYTES));
        await expect(sendPrivateFilings(channel, {
            myAddress: SELLER, recipientAddress: BUYER, orderId: ORDER, recipientPubKeyHex: buyerPub, filings: [big], signAuth: sellerSign,
        })).rejects.toThrow(/at most/);

        clearKept();
        const refusedCount = await sealRaw(JSON.stringify({ filings: many }));
        expect(refusedCount!.filings).toEqual([]);
        expect(refusedCount!.refusal).toMatch(/at most/);
        const refusedBytes = await sealRaw(JSON.stringify({ filings: [big] }));
        expect(refusedBytes!.filings).toEqual([]);
        expect(refusedBytes!.refusal).toMatch(/at most/);
    });

    it("a sealed message longer than any delivery within the bound is refused before it is opened", async () => {
        // Not even ciphertext: a blob that would not decrypt reads as absence
        // once opened, so a refusal here proves it was never opened.
        const oversized = "A".repeat(PRIVATE_FILINGS_MAX_BLOB_CHARS + 1);
        const { buyerPub } = await buyerAsks();
        const received = await decryptPrivateFilings({ myAddress: BUYER, orderId: ORDER, senderPubKeyHex: buyerPub, blobB64: oversized });
        expect(received).not.toBeNull();
        expect(received!.filings).toEqual([]);
        expect(received!.refusal).toMatch(/larger than any such delivery, so it was not opened/);
    });

    it("a delivery at the bound, the most filings and nearly the most content, seals under the length the receiver opens", async () => {
        const { channel, sent, buyerPub } = await buyerAsks();
        // 64 filings of 2016 encoded bytes each: 126 KiB of content in all.
        const full = Array.from({ length: PRIVATE_FILINGS_MAX_COUNT }, (_, i) => filingAt(1, `${i}`.padEnd(1920, "x")));
        expect(full.reduce((n, f) => n + (f.content.length - 2) / 2, 0)).toBeLessThanOrEqual(PRIVATE_FILINGS_MAX_BYTES);
        const { blobB64 } = await sendPrivateFilings(channel, {
            myAddress: SELLER, recipientAddress: BUYER, orderId: ORDER, recipientPubKeyHex: buyerPub, filings: full, signAuth: sellerSign,
        });
        expect(blobB64.length).toBeLessThanOrEqual(PRIVATE_FILINGS_MAX_BLOB_CHARS);
        const sellerPub = sent.find((m) => m.kind === "pubkey" && m.value !== buyerPub)!.value;
        const received = await decryptPrivateFilings({ myAddress: BUYER, orderId: ORDER, senderPubKeyHex: sellerPub, blobB64 });
        expect(received!.refusal).toBeNull();
        expect(received!.filings).toHaveLength(PRIVATE_FILINGS_MAX_COUNT);
    });

    it("a received copy is never forwarded: it is no wallet's own filing in the browser that received it", () => {
        const f = filingAt(1, "41.2");
        expect(keepReceivedWitnessContent(AS_BUYER, f)).toBe("kept");
        const events = [{ orderHash: ORDER, clauseId: f.clauseId, stage: f.stage, contentRef: f.contentRef, attester: SELLER }];
        // Not even with the attester's own wallet connected in the receiver's browser.
        expect(heldOwnPrivateFilings(ORDER, events, AS_SELLER)).toEqual([]);
        expect(heldOwnPrivateFilings(ORDER, events, AS_BUYER)).toEqual([]);
    });

    it("a received entry never overwrites the copy this browser kept when it filed", () => {
        const f = filingAt(1, "41.2");
        keepPrivateWitnessContent(AS_SELLER, { orderHash: f.orderHash, clauseId: f.clauseId, stage: f.stage, content: f.content });
        expect(keepReceivedWitnessContent(AS_SELLER, f)).toBe("kept");
        expect(readHeldWitness(AS_SELLER, f)?.received).toBe(false);
        expect(keepConfirmedPrivateFilings(AS_SELLER, { filings: [f], dropped: 0, refusal: null }, [true])).toBe(1);
        expect(readHeldWitness(AS_SELLER, f)?.received).toBe(false);
    });

    it("a payload that parses but holds no list of filings unseals to absence", async () => {
        expect(await sealRaw(JSON.stringify({ filings: { 0: filingAt(1, "41.2") } }))).toBeNull();
        expect(await sealRaw(JSON.stringify([filingAt(1, "41.2")]))).toBeNull();
        expect(await sealRaw(JSON.stringify("filings"))).toBeNull();
    });

    it("entries of the wrong types are dropped and the others kept", async () => {
        const good = filingAt(1, "41.2");
        const received = await sealRaw(JSON.stringify({ filings: [
            good,
            { ...good, stage: "1" },
            { ...good, stage: 1.5 },
            { ...good, stage: 256 },
            { ...good, clauseId: 7 },
            { ...good, contentRef: "0x12" },
            { ...good, content: "0xabc" },
            { ...good, orderHash: null },
            "an entry",
            null,
        ] }));
        expect(received!.filings).toEqual([good]);
        expect(received!.dropped).toBe(9);
    });

    it("a second entry at the same place is dropped, so the count of kept filings is not inflated", async () => {
        const a = filingAt(1, "41.2");
        const b = filingAt(2, "39.8");
        const received = await sealRaw(JSON.stringify({ filings: [a, a, b, { ...a, contentRef: a.contentRef.toUpperCase().replace("0X", "0x") }] }));
        expect(received!.filings).toEqual([a, b]);
        expect(received!.dropped).toBe(2);
        expect(keepConfirmedPrivateFilings(AS_BUYER, received!, [true, true])).toBe(2);
    });

    it("a wrong key or a payload that does not parse unseals to absence", async () => {
        expect(await sealRaw("not json")).toBeNull();
        const { channel, sent, buyerPub } = await buyerAsks();
        const { blobB64 } = await sendPrivateFilings(channel, {
            myAddress: SELLER, recipientAddress: BUYER, orderId: ORDER, recipientPubKeyHex: buyerPub, filings: [filingAt(1, "41.2")], signAuth: sellerSign,
        });
        const sellerPub = sent.find((m) => m.kind === "pubkey" && m.value !== buyerPub)!.value;
        const eavesdropper = await decryptPrivateFilings({
            myAddress: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", orderId: ORDER, senderPubKeyHex: sellerPub, blobB64,
        });
        expect(eavesdropper).toBeNull();
    });
});

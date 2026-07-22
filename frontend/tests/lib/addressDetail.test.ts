/**
 * addressDetail — the private-address ceremony, lib tier.
 *
 * Real crypto end to end (@figaro/sdk/handoff ECDH + WebCrypto AES-GCM +
 * EIP-191 wallet auth; no mocks): the seller requests (ephemeral pubkey out,
 * wallet-signed), the buyer answers (encrypted addressee block + own pubkey,
 * both wallet-signed), the seller decrypts; the anchored hash matches the
 * transported blob; every channel message's signature verifies and a forged
 * sender or tampered body fails; a wrong key or corrupted blob decrypts to
 * ABSENCE (null), never an exception.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    addressDetailAnchorRef,
    addressDetailBlobHash,
    decryptAddressDetail,
    requestAddressDetail,
    sendAddressDetail,
    tryDecodeAddresseeBlock,
    type AddresseeBlock,
} from "@/lib/handoff/addressDetail";
import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { verifyEcdhMessageAuth, type AuthenticatedEcdhMessage, type HandoffChannel } from "@figaro/sdk/handoff";

// Deterministic test wallets (anvil #1 / #2) — addresses DERIVED from the
// keys so the wallet auth in every message is real and verifiable.
const SELLER_ACCOUNT = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const BUYER_ACCOUNT = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const SELLER = SELLER_ACCOUNT.address;
const BUYER = BUYER_ACCOUNT.address;
const sellerSign = (message: string) => SELLER_ACCOUNT.signMessage({ message });
const buyerSign = (message: string) => BUYER_ACCOUNT.signMessage({ message });
const ORDER = "0x" + "ab".repeat(32);

const BLOCK: AddresseeBlock = {
    name: "Ada Liana",
    street: "12 Rue du Marché",
    unit: "3rd floor, door B",
    instructions: "Ring twice; dog is friendly.",
    notifyName: "Nonna Lucia",
    notifyContact: "+39 055 123 456",
    handling: "Fragile — keep level",
};

interface SentMessage {
    kind: "pubkey" | "blob";
    orderId: string;
    value: string;
    senderAddress: string;
    sig: string;
}

/** A channel stub that records sends — transport is not under test here
 *  (the mock channel is exercised e2e); the CRYPTO is, auth included. */
function recordingChannel() {
    const sent: SentMessage[] = [];
    const channel = {
        sendEcdhPubkey: vi.fn(async ({ orderId, pubKeyHex, senderAddress, sig }) => {
            sent.push({ kind: "pubkey", orderId, value: pubKeyHex, senderAddress, sig });
        }),
        sendWrappedKey: vi.fn(async ({ orderId, wrappedKeyB64, senderAddress, sig }) => {
            sent.push({ kind: "blob", orderId, value: wrappedKeyB64, senderAddress, sig });
        }),
    } as unknown as HandoffChannel;
    return { channel, sent };
}

/** Rebuild the wire message a recorded send represents (ts is unsigned
 *  metadata — any value verifies). */
function asWireMessage(m: SentMessage): AuthenticatedEcdhMessage {
    return m.kind === "pubkey"
        ? { type: "ECDH_PUBKEY", orderId: m.orderId, pubKeyHex: m.value, senderAddress: m.senderAddress, sig: m.sig, ts: 0 }
        : { type: "ECDH_WRAPPED_KEY", orderId: m.orderId, wrappedKeyB64: m.value, senderAddress: m.senderAddress, sig: m.sig, ts: 0 };
}

beforeEach(() => {
    window.sessionStorage.clear();
});

describe("the private-address ceremony", () => {
    it("request → answer → decrypt round-trips the addressee block", async () => {
        const { channel, sent } = recordingChannel();

        const sellerPub = await requestAddressDetail(channel, {
            myAddress: SELLER, recipientAddress: BUYER, orderId: ORDER, signAuth: sellerSign,
        });
        expect(sellerPub).toMatch(/^[0-9a-f]{66}$/i);

        const { blobB64 } = await sendAddressDetail(channel, {
            myAddress: BUYER, recipientAddress: SELLER, orderId: ORDER,
            recipientPubKeyHex: sellerPub, block: BLOCK, signAuth: buyerSign,
        });
        const buyerPub = sent.find((m) => m.kind === "pubkey" && m.value !== sellerPub)!.value;
        expect(sent.find((m) => m.kind === "blob")!.value).toBe(blobB64);
        // The blob is ciphertext — the plaintext never crosses the channel,
        // the notify party's PII included.
        expect(blobB64).not.toContain("Rue du Marché");
        expect(blobB64).not.toContain("Nonna Lucia");

        const decrypted = await decryptAddressDetail({
            myAddress: SELLER, orderId: ORDER, senderPubKeyHex: buyerPub, blobB64,
        });
        expect(decrypted).toEqual(BLOCK);
    });

    it("every channel message carries wallet auth that verifies; a forged sender or tampered body fails", async () => {
        const { channel, sent } = recordingChannel();
        const sellerPub = await requestAddressDetail(channel, {
            myAddress: SELLER, recipientAddress: BUYER, orderId: ORDER, signAuth: sellerSign,
        });
        await sendAddressDetail(channel, {
            myAddress: BUYER, recipientAddress: SELLER, orderId: ORDER,
            recipientPubKeyHex: sellerPub, block: BLOCK, signAuth: buyerSign,
        });
        expect(sent).toHaveLength(3); // seller pubkey, buyer pubkey, buyer blob
        for (const m of sent) {
            expect(await verifyEcdhMessageAuth(asWireMessage(m))).toBe(true);
        }
        // A MITM re-claiming the counterparty's identity over its OWN key
        // fails: the signature does not recover to the claimed sender.
        const sellerOffer = asWireMessage(sent.find((m) => m.value === sellerPub)!);
        expect(await verifyEcdhMessageAuth({ ...sellerOffer, senderAddress: BUYER })).toBe(false);
        // A tampered body (key substitution under a replayed signature) fails.
        // Guard the flip so the "tampered" byte always actually differs (the
        // ciphertext's last base64 char is uniform — an unguarded "A" is a
        // 1-in-64 no-op that makes the message identical and the test flake).
        const blobMsg = asWireMessage(sent.find((m) => m.kind === "blob")!);
        expect(blobMsg.type).toBe("ECDH_WRAPPED_KEY");
        if (blobMsg.type === "ECDH_WRAPPED_KEY") {
            const flipped = blobMsg.wrappedKeyB64.slice(0, -1) + (blobMsg.wrappedKeyB64.endsWith("A") ? "B" : "A");
            expect(await verifyEcdhMessageAuth({ ...blobMsg, wrappedKeyB64: flipped })).toBe(false);
        }
        // A cross-order replay of a valid message fails.
        expect(await verifyEcdhMessageAuth({ ...sellerOffer, orderId: "0x" + "cd".repeat(32) })).toBe(false);
    });

    it("the anchored hash binds exactly the transported blob", async () => {
        const { channel, sent } = recordingChannel();
        const sellerPub = await requestAddressDetail(channel, {
            myAddress: SELLER, recipientAddress: BUYER, orderId: ORDER, signAuth: sellerSign,
        });
        const { blobB64 } = await sendAddressDetail(channel, {
            myAddress: BUYER, recipientAddress: SELLER, orderId: ORDER,
            recipientPubKeyHex: sellerPub, block: BLOCK, signAuth: buyerSign,
        });
        const received = sent.find((m) => m.kind === "blob")!.value;
        expect(addressDetailBlobHash(received)).toBe(addressDetailBlobHash(blobB64));
        // The anchored CONTENT is the 32-byte hash — never the ciphertext —
        // and the event's contentRef is keccak of it (hash-only anchoring).
        expect(addressDetailBlobHash(received)).toHaveLength(66);
        expect(keccak256(addressDetailBlobHash(received))).toBe(addressDetailAnchorRef(blobB64));
        // One byte of tampering breaks the bind.
        const tampered = received.slice(0, -1) + (received.endsWith("A") ? "B" : "A");
        expect(addressDetailBlobHash(tampered)).not.toBe(addressDetailBlobHash(blobB64));
    });

    it("a wrong key or corrupted blob decrypts to absence, never an exception", async () => {
        const { channel } = recordingChannel();
        const sellerPub = await requestAddressDetail(channel, {
            myAddress: SELLER, recipientAddress: BUYER, orderId: ORDER, signAuth: sellerSign,
        });
        const { blobB64 } = await sendAddressDetail(channel, {
            myAddress: BUYER, recipientAddress: SELLER, orderId: ORDER,
            recipientPubKeyHex: sellerPub, block: BLOCK, signAuth: buyerSign,
        });
        // An eavesdropper (fresh keypair, different address) gets nothing.
        const eavesdropper = await decryptAddressDetail({
            myAddress: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", orderId: ORDER,
            senderPubKeyHex: sellerPub, blobB64,
        });
        expect(eavesdropper).toBeNull();
        // A corrupted blob is absence too.
        const corrupted = await decryptAddressDetail({
            myAddress: SELLER, orderId: ORDER, senderPubKeyHex: sellerPub,
            blobB64: blobB64.slice(0, -4) + "AAAA",
        });
        expect(corrupted).toBeNull();
    });

    it("the ceremony is SYMMETRIC — the seller answers the buyer with the same keypairs (private pickup point)", async () => {
        const { channel, sent } = recordingChannel();
        // Forward: seller requests, buyer answers (establishes both keypairs).
        const sellerPub = await requestAddressDetail(channel, {
            myAddress: SELLER, recipientAddress: BUYER, orderId: ORDER, signAuth: sellerSign,
        });
        await sendAddressDetail(channel, {
            myAddress: BUYER, recipientAddress: SELLER, orderId: ORDER,
            recipientPubKeyHex: sellerPub, block: BLOCK, signAuth: buyerSign,
        });
        const buyerPub = sent.find((m) => m.kind === "pubkey" && m.value !== sellerPub)!.value;
        // Reverse: the SELLER shares its precise pickup point with the buyer.
        const pickup: AddresseeBlock = { name: "Rosa's Kitchen", street: "4 Market Lane", unit: "rear door" };
        const { blobB64: pickupBlob } = await sendAddressDetail(channel, {
            myAddress: SELLER, recipientAddress: BUYER, orderId: ORDER,
            recipientPubKeyHex: buyerPub, block: pickup, signAuth: sellerSign,
        });
        const decrypted = await decryptAddressDetail({
            myAddress: BUYER, orderId: ORDER, senderPubKeyHex: sellerPub, blobB64: pickupBlob,
        });
        expect(decrypted).toEqual(pickup);
        // Directions do not cross: the buyer's inbound blob is not the seller's.
        expect(pickupBlob).not.toBe(sent.find((m) => m.kind === "blob")!.value);
    });

    it("tryDecodeAddresseeBlock rejects non-blocks", () => {
        expect(tryDecodeAddresseeBlock("not json")).toBeNull();
        expect(tryDecodeAddresseeBlock('{"name":"x"}')).toBeNull();
        expect(tryDecodeAddresseeBlock(toHex("junk"))).toBeNull();
    });

    it("notify-party + handling are optional: a block without them still decodes, non-string values are omitted", () => {
        const withoutThem = JSON.stringify({ name: "x", street: "y" });
        expect(tryDecodeAddresseeBlock(withoutThem)).toEqual({ name: "x", street: "y" });
        const mixed = JSON.stringify({
            name: "x", street: "y",
            notifyName: 7, notifyContact: null, handling: "Fragile — this way up",
        });
        expect(tryDecodeAddresseeBlock(mixed)).toEqual({ name: "x", street: "y", handling: "Fragile — this way up" });
    });
});

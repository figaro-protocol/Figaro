/**
 * addressDetail — the private-address ceremony, lib tier.
 *
 * Real crypto end to end (eciesjs ECDH + WebCrypto AES-GCM; no mocks): the
 * seller requests (ephemeral pubkey out), the buyer answers (encrypted
 * addressee block + own pubkey), the seller decrypts; the anchored hash
 * matches the transported blob; a wrong key or corrupted blob decrypts to
 * ABSENCE (null), never an exception.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    addressDetailBlobHash,
    addressDetailContentBytes,
    decryptAddressDetail,
    requestAddressDetail,
    sendAddressDetail,
    tryDecodeAddresseeBlock,
    type AddresseeBlock,
} from "@/lib/handoff/addressDetail";
import { keccak256, toHex } from "viem";
import type { CoordinationChannel } from "@/lib/handoff/channel";

const SELLER = "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f";
const BUYER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const ORDER = "0x" + "ab".repeat(32);

const BLOCK: AddresseeBlock = {
    name: "Ada Liana",
    street: "12 Rue du Marché",
    unit: "3rd floor, door B",
    instructions: "Ring twice; dog is friendly.",
};

/** A channel stub that records sends — transport is not under test here
 *  (the mock channel is exercised e2e); the CRYPTO is. */
function recordingChannel() {
    const sent: Array<{ kind: string; orderId: string; value: string }> = [];
    const channel = {
        sendEcdhPubkey: vi.fn(async ({ orderId, pubKeyHex }) => {
            sent.push({ kind: "pubkey", orderId, value: pubKeyHex });
        }),
        sendWrappedKey: vi.fn(async ({ orderId, wrappedKeyB64 }) => {
            sent.push({ kind: "blob", orderId, value: wrappedKeyB64 });
        }),
    } as unknown as CoordinationChannel;
    return { channel, sent };
}

beforeEach(() => {
    window.sessionStorage.clear();
});

describe("the private-address ceremony", () => {
    it("request → answer → decrypt round-trips the addressee block", async () => {
        const { channel, sent } = recordingChannel();

        const sellerPub = await requestAddressDetail(channel, {
            myAddress: SELLER, buyerAddress: BUYER, orderId: ORDER,
        });
        expect(sellerPub).toMatch(/^[0-9a-f]{66}$/i);

        const { blobB64 } = await sendAddressDetail(channel, {
            myAddress: BUYER, sellerAddress: SELLER, orderId: ORDER,
            sellerPubKeyHex: sellerPub, block: BLOCK,
        });
        const buyerPub = sent.find((m) => m.kind === "pubkey" && m.value !== sellerPub)!.value;
        expect(sent.find((m) => m.kind === "blob")!.value).toBe(blobB64);
        // The blob is ciphertext — the plaintext never crosses the channel.
        expect(blobB64).not.toContain("Rue du Marché");

        const decrypted = await decryptAddressDetail({
            myAddress: SELLER, orderId: ORDER, buyerPubKeyHex: buyerPub, blobB64,
        });
        expect(decrypted).toEqual(BLOCK);
    });

    it("the anchored hash binds exactly the transported blob", async () => {
        const { channel, sent } = recordingChannel();
        const sellerPub = await requestAddressDetail(channel, {
            myAddress: SELLER, buyerAddress: BUYER, orderId: ORDER,
        });
        const { blobB64 } = await sendAddressDetail(channel, {
            myAddress: BUYER, sellerAddress: SELLER, orderId: ORDER,
            sellerPubKeyHex: sellerPub, block: BLOCK,
        });
        const received = sent.find((m) => m.kind === "blob")!.value;
        expect(addressDetailBlobHash(received)).toBe(addressDetailBlobHash(blobB64));
        // content bytes → keccak equals the anchor (what the coordinator binds).
        expect(keccak256(addressDetailContentBytes(received))).toBe(addressDetailBlobHash(blobB64));
        // One byte of tampering breaks the bind.
        const tampered = received.slice(0, -1) + (received.endsWith("A") ? "B" : "A");
        expect(addressDetailBlobHash(tampered)).not.toBe(addressDetailBlobHash(blobB64));
    });

    it("a wrong key or corrupted blob decrypts to absence, never an exception", async () => {
        const { channel } = recordingChannel();
        const sellerPub = await requestAddressDetail(channel, {
            myAddress: SELLER, buyerAddress: BUYER, orderId: ORDER,
        });
        const { blobB64 } = await sendAddressDetail(channel, {
            myAddress: BUYER, sellerAddress: SELLER, orderId: ORDER,
            sellerPubKeyHex: sellerPub, block: BLOCK,
        });
        // An eavesdropper (fresh keypair, different address) gets nothing.
        const eavesdropper = await decryptAddressDetail({
            myAddress: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", orderId: ORDER,
            buyerPubKeyHex: sellerPub, blobB64,
        });
        expect(eavesdropper).toBeNull();
        // A corrupted blob is absence too.
        const corrupted = await decryptAddressDetail({
            myAddress: SELLER, orderId: ORDER, buyerPubKeyHex: sellerPub,
            blobB64: blobB64.slice(0, -4) + "AAAA",
        });
        expect(corrupted).toBeNull();
    });

    it("tryDecodeAddresseeBlock rejects non-blocks", () => {
        expect(tryDecodeAddresseeBlock("not json")).toBeNull();
        expect(tryDecodeAddresseeBlock('{"name":"x"}')).toBeNull();
        expect(tryDecodeAddresseeBlock(toHex("junk"))).toBeNull();
    });
});

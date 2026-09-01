/**
 * /handoff ECDH — byte-exactness against the promotion golden vectors.
 *
 * The fixture is derived from eciesjs@0.5's `encapsulate`/`decapsulate`
 * construction; this suite proves the noble reimplementation derives the
 * SAME secrets and unwraps the SAME frozen blob. The wrap draws a random IV,
 * so the frozen blob is proven through unwrap and a fresh wrap through a
 * round-trip.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    deriveSharedSecretAsReceiver,
    deriveSharedSecretAsSender,
    generateOrderKeypair,
    unwrapWithSharedSecret,
    wrapWithSharedSecret,
} from "../src/handoff/index.js";

const { ecdh } = JSON.parse(
    readFileSync(path.resolve(__dirname, "fixtures/promotion-golden-vectors.json"), "utf8"),
) as {
    ecdh: {
        privA: string;
        privB: string;
        pubA: string;
        pubB: string;
        sharedSecretAtoB: string;
        sharedSecretBtoA: string;
        plaintextKeyB64: string;
        wrappedBlobB64: string;
    };
};

describe("handoff ECDH — golden-vector byte-exactness vs the eciesjs original", () => {
    it("both halves reproduce the frozen A→B shared secret", () => {
        expect(deriveSharedSecretAsSender(ecdh.privA, ecdh.pubB)).toBe(ecdh.sharedSecretAtoB);
        expect(deriveSharedSecretAsReceiver(ecdh.pubA, ecdh.privB)).toBe(ecdh.sharedSecretAtoB);
    });

    it("the reverse pairing derives the frozen B→A secret — and it differs (direction pin)", () => {
        expect(deriveSharedSecretAsSender(ecdh.privB, ecdh.pubA)).toBe(ecdh.sharedSecretBtoA);
        expect(deriveSharedSecretAsReceiver(ecdh.pubB, ecdh.privA)).toBe(ecdh.sharedSecretBtoA);
        expect(ecdh.sharedSecretBtoA).not.toBe(ecdh.sharedSecretAtoB);
    });

    it("unwraps the frozen eciesjs-era blob, and a fresh wrap round-trips", async () => {
        expect(await unwrapWithSharedSecret(ecdh.wrappedBlobB64, ecdh.sharedSecretAtoB)).toBe(
            ecdh.plaintextKeyB64,
        );
        const fresh = await wrapWithSharedSecret(ecdh.plaintextKeyB64, ecdh.sharedSecretAtoB);
        expect(await unwrapWithSharedSecret(fresh, ecdh.sharedSecretAtoB)).toBe(
            ecdh.plaintextKeyB64,
        );
    });

    it("generated keypairs interoperate end-to-end (fresh keys, both directions)", async () => {
        const a = generateOrderKeypair();
        const b = generateOrderKeypair();
        expect(a.publicKeyHex).toMatch(/^[0-9a-f]{66}$/);
        const senderSide = deriveSharedSecretAsSender(a.privateKeyHex, b.publicKeyHex);
        const receiverSide = deriveSharedSecretAsReceiver(a.publicKeyHex, b.privateKeyHex);
        expect(receiverSide).toBe(senderSide);
        const blob = await wrapWithSharedSecret("c2VjcmV0LWtleQ", senderSide);
        expect(await unwrapWithSharedSecret(blob, receiverSide)).toBe("c2VjcmV0LWtleQ");
    });
});

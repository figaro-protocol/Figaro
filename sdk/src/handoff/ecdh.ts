/**
 * ECDH key agreement + AES-GCM wrapping for the handoff protocol.
 *
 * The 32-byte shared secret is `HKDF-SHA256(senderPubUncompressed ||
 * sharedPointUncompressed)` with no salt and no info — the exact
 * `encapsulate`/`decapsulate` construction of eciesjs@0.5, reproduced here
 * on `@noble/curves` + `@noble/hashes` so the bytes stay identical.
 * Golden-vector-proven:
 * `sdk/tests/fixtures/promotion-golden-vectors.json` was recorded from the
 * eciesjs implementation and this module must keep matching it.
 *
 * DIRECTION MATTERS: the SENDER's public key is folded into the HKDF input,
 * so the two sides call different halves of the pair:
 *   - the SENDER (who will encrypt) derives with own priv + receiver's pub,
 *   - the RECEIVER derives with sender's pub + own priv.
 * Both produce the same 32-byte hex string; the REVERSE pairing produces a
 * DIFFERENT secret. Never call the sender half from both sides expecting
 * symmetry — the two derivations are directional and their secrets will not
 * match; the round-trip test below is what catches exactly this mistake.
 *
 * Hex conventions match the wire protocol: inputs tolerate an optional `0x`
 * prefix; outputs are unprefixed lowercase (a compressed public key is 66
 * hex chars).
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, concatBytes, hexToBytes } from "@noble/hashes/utils";

function toBytes(hex: string): Uint8Array {
    return hexToBytes(hex.startsWith("0x") ? hex.slice(2) : hex);
}

/** `HKDF-SHA256(senderPub(65B, uncompressed) || sharedPoint(65B, uncompressed))`,
 *  32 bytes out — eciesjs's `getSharedKey`. */
function deriveSharedKey(senderPubUncompressed: Uint8Array, sharedPoint: Uint8Array): string {
    return bytesToHex(
        hkdf(sha256, concatBytes(senderPubUncompressed, sharedPoint), undefined, undefined, 32),
    );
}

function uncompressPublicKey(pubHex: string): Uint8Array {
    return secp256k1.ProjectivePoint.fromHex(toBytes(pubHex)).toRawBytes(false);
}

/** The SENDER half: own private key + the receiver's public key. */
export function deriveSharedSecretAsSender(
    myPrivateKeyHex: string,
    receiverPublicKeyHex: string,
): string {
    const priv = toBytes(myPrivateKeyHex);
    const senderPub = secp256k1.getPublicKey(priv, false);
    const sharedPoint = secp256k1.getSharedSecret(priv, toBytes(receiverPublicKeyHex), false);
    return deriveSharedKey(senderPub, sharedPoint);
}

/** The RECEIVER half: the sender's public key + own private key. */
export function deriveSharedSecretAsReceiver(
    senderPublicKeyHex: string,
    myPrivateKeyHex: string,
): string {
    const senderPub = uncompressPublicKey(senderPublicKeyHex);
    const sharedPoint = secp256k1.getSharedSecret(
        toBytes(myPrivateKeyHex),
        toBytes(senderPublicKeyHex),
        false,
    );
    return deriveSharedKey(senderPub, sharedPoint);
}

// ── Ephemeral keypairs ─────────────────────────────────────────

export interface EphemeralKeypair {
    /** Hex-encoded 32-byte private key (unprefixed). */
    privateKeyHex: string;
    /** Hex-encoded compressed (33-byte) public key (unprefixed). */
    publicKeyHex: string;
}

/** Generate a fresh ephemeral secp256k1 keypair for a single order. */
export function generateOrderKeypair(): EphemeralKeypair {
    const sk = secp256k1.utils.randomPrivateKey();
    return {
        privateKeyHex: bytesToHex(sk),
        publicKeyHex: bytesToHex(secp256k1.getPublicKey(sk, true)),
    };
}

// ── AES-GCM wrapping under the shared secret ───────────────────

function b64UrlEncode(bytes: Uint8Array): string {
    if (typeof window === "undefined") {
        return Buffer.from(bytes).toString("base64url");
    }
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function b64UrlDecode(b64: string): Uint8Array {
    if (typeof window === "undefined") {
        return Uint8Array.from(Buffer.from(b64, "base64url"));
    }
    const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? 0 : 4 - (padded.length % 4);
    const binary = atob(padded + "=".repeat(pad));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Encrypt any string payload (an AES key, an addressee block, …) with the
 * ECDH-derived shared secret.
 *
 * Produces a base64url blob: 12-byte IV || AES-256-GCM ciphertext.
 * Safe to transmit over any public channel.
 */
export async function wrapWithSharedSecret(
    keyB64: string,
    sharedSecretHex: string,
): Promise<string> {
    const rawKey = toBytes(sharedSecretHex);
    const aesKey = await crypto.subtle.importKey(
        "raw",
        rawKey.buffer as ArrayBuffer,
        { name: "AES-GCM" },
        false,
        ["encrypt"],
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        aesKey,
        new TextEncoder().encode(keyB64),
    );
    const combined = new Uint8Array(iv.byteLength + ct.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ct), 12);
    return b64UrlEncode(combined);
}

/**
 * Decrypt a payload produced by `wrapWithSharedSecret`.
 *
 * Input is the base64url blob produced by `wrapWithSharedSecret`.
 * Returns the original string payload.
 */
export async function unwrapWithSharedSecret(
    wrappedB64: string,
    sharedSecretHex: string,
): Promise<string> {
    const rawKey = toBytes(sharedSecretHex);
    const aesKey = await crypto.subtle.importKey(
        "raw",
        rawKey.buffer as ArrayBuffer,
        { name: "AES-GCM" },
        false,
        ["decrypt"],
    );
    const combined = b64UrlDecode(wrappedB64);
    const iv = combined.slice(0, 12);
    const ct = combined.slice(12);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ct);
    return new TextDecoder().decode(plain);
}

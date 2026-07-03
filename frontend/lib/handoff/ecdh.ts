/**
 * ECDH key agreement for handoff key exchange.
 *
 * Replaces direct AES-key transport (XMTP) with a 2-message ECDH protocol:
 *
 *   1. Fulfiller generates per-order ephemeral keypair, sends pubkey to buyer
 *   2. Both sides independently derive the same ECDH shared secret
 *   3. Buyer wraps the AES handoff key with the ECDH secret → sends publicly
 *   4. Fulfiller unwraps → has AES key → opens payload
 *
 * Channel data is safe to expose publicly. No reliance on transport-layer
 * confidentiality (XMTP becomes optional).
 *
 * Uses eciesjs for secp256k1 ECDH:
 *   PrivateKey.encapsulate(PublicKey) → 32-byte HKDF-SHA256-derived secret
 *   PublicKey.decapsulate(PrivateKey) → same 32-byte secret
 */

import { PrivateKey, PublicKey } from "eciesjs";
import { generateOrderKeypair, type EphemeralKeypair } from "./ephemeralKeys";
import { readSessionStorage, writeSessionStorage } from "@/lib/shared/storage";
import { bytesToHex, hexToBytes } from "@/lib/shared/evm";

// ---------------------------------------------------------------------------
// ECDH shared secret derivation
// ---------------------------------------------------------------------------


/**
 * Derive a 32-byte shared secret via secp256k1 ECDH — DIRECTION MATTERS.
 *
 * eciesjs folds the SENDER's public key into the HKDF-SHA256 input, so the
 * two sides call different halves of the pair (the file header's protocol):
 *   - the SENDER (who will encrypt) encapsulates: own priv + receiver's pub
 *   - the RECEIVER decapsulates: sender's pub + own priv
 * Both produce the same 32-byte hex string. (A prior revision called
 * `encapsulate` from both sides and claimed symmetry — the secrets never
 * matched; caught by the first round-trip test when the lib gained its
 * first consumer.)
 */
export function deriveSharedSecretAsSender(
    myPrivateKeyHex: string,
    receiverPublicKeyHex: string,
): string {
    const priv = new PrivateKey(hexToBytes(myPrivateKeyHex));
    const pub = new PublicKey(hexToBytes(receiverPublicKeyHex));
    const secret = priv.encapsulate(pub);
    return bytesToHex(new Uint8Array(secret));
}

export function deriveSharedSecretAsReceiver(
    senderPublicKeyHex: string,
    myPrivateKeyHex: string,
): string {
    const priv = new PrivateKey(hexToBytes(myPrivateKeyHex));
    const pub = new PublicKey(hexToBytes(senderPublicKeyHex));
    const secret = pub.decapsulate(priv);
    return bytesToHex(new Uint8Array(secret));
}

// ---------------------------------------------------------------------------
// AES-GCM key wrapping using ECDH-derived secret
// ---------------------------------------------------------------------------

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
    const rawKey = hexToBytes(sharedSecretHex);
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
 * Returns the original base64url AES key.
 */
export async function unwrapWithSharedSecret(
    wrappedB64: string,
    sharedSecretHex: string,
): Promise<string> {
    const rawKey = hexToBytes(sharedSecretHex);
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
    const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        aesKey,
        ct,
    );
    return new TextDecoder().decode(plain);
}

// ---------------------------------------------------------------------------
// Fulfiller ephemeral keypair persistence
//
// The fulfiller generates a per-order ephemeral keypair for ECDH.
// Stored in sessionStorage so the shared secret can be re-derived across
// page reloads within the same tab (until the handoff completes).
// Session storage is cleared when the tab closes, limiting exposure of
// ephemeral private keys.
// ---------------------------------------------------------------------------

const ECDH_KEYS_STORAGE_KEY = "figaro-ecdh-keys";

interface EcdhKeyStore {
    [addressOrderKey: string]: EphemeralKeypair;
}

function ecdhStoreKey(address: string, orderId: string): string {
    return `${address.toLowerCase()}:${orderId}`;
}

/**
 * Get or create a per-order ephemeral keypair for the fulfiller's ECDH side.
 *
 * Idempotent: if a keypair already exists for this address+order, it is
 * returned. Otherwise a fresh keypair is generated and persisted.
 */
export function getOrCreateOrderEcdhKeypair(
    address: string,
    orderId: string,
): EphemeralKeypair {
    const store = readSessionStorage<EcdhKeyStore>(ECDH_KEYS_STORAGE_KEY, {});
    const key = ecdhStoreKey(address, orderId);
    if (store[key]) return store[key];

    const kp = generateOrderKeypair();
    store[key] = kp;
    writeSessionStorage(ECDH_KEYS_STORAGE_KEY, store);
    return kp;
}

/** Retrieve a previously stored fulfiller ECDH keypair (null if missing). */
export function getOrderEcdhKeypair(
    address: string,
    orderId: string,
): EphemeralKeypair | null {
    const store = readSessionStorage<EcdhKeyStore>(ECDH_KEYS_STORAGE_KEY, {});
    return store[ecdhStoreKey(address, orderId)] ?? null;
}

/** Remove a fulfiller ECDH keypair (after handoff is complete). */
export function removeOrderEcdhKeypair(
    address: string,
    orderId: string,
): void {
    const store = readSessionStorage<EcdhKeyStore>(ECDH_KEYS_STORAGE_KEY, {});
    delete store[ecdhStoreKey(address, orderId)];
    writeSessionStorage(ECDH_KEYS_STORAGE_KEY, store);
}

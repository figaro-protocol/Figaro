/**
 * Per-order ECDH keypair persistence — the device-local half of the handoff
 * key exchange. The key agreement itself (derivation, AES-GCM wrapping) is
 * the wire protocol and lives in `@figaro/sdk/handoff`; this module only
 * keeps the receiving side's ephemeral keypair across page reloads.
 *
 * Stored in sessionStorage so the shared secret can be re-derived across
 * reloads within the same tab (until the handoff completes). Session storage
 * is cleared when the tab closes, limiting exposure of ephemeral private
 * keys.
 */

import { generateOrderKeypair, type EphemeralKeypair } from "@figaro/sdk/handoff";
import { readSessionStorage, writeSessionStorage } from "@/lib/shared/storage";

const ECDH_KEYS_STORAGE_KEY = "figaro-ecdh-keys";

interface EcdhKeyStore {
    [addressOrderKey: string]: EphemeralKeypair;
}

function ecdhStoreKey(address: string, orderId: string): string {
    return `${address.toLowerCase()}:${orderId}`;
}

/**
 * Get or create a per-order ephemeral keypair for the receiving side of the
 * handoff ECDH exchange.
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

/** Retrieve a previously stored ECDH keypair (null if missing). */
export function getOrderEcdhKeypair(
    address: string,
    orderId: string,
): EphemeralKeypair | null {
    const store = readSessionStorage<EcdhKeyStore>(ECDH_KEYS_STORAGE_KEY, {});
    return store[ecdhStoreKey(address, orderId)] ?? null;
}

/** Remove an ECDH keypair (after handoff is complete). */
export function removeOrderEcdhKeypair(
    address: string,
    orderId: string,
): void {
    const store = readSessionStorage<EcdhKeyStore>(ECDH_KEYS_STORAGE_KEY, {});
    delete store[ecdhStoreKey(address, orderId)];
    writeSessionStorage(ECDH_KEYS_STORAGE_KEY, store);
}

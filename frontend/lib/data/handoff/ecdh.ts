/**
 * Per-order ECDH keypair persistence — the device-local half of the handoff
 * key exchange. The key agreement itself (derivation, AES-GCM wrapping) is
 * the wire protocol and lives in `@figaro-protocol/sdk/handoff`; this module only
 * keeps the receiving side's ephemeral keypair across page reloads.
 *
 * Stored in sessionStorage so the shared secret can be re-derived across
 * reloads within the same tab (until the handoff completes). Session storage
 * is cleared when the tab closes, limiting exposure of ephemeral private
 * keys.
 */

import { generateOrderKeypair, type EphemeralKeypair } from "@figaro-protocol/sdk/handoff";
import { readJsonStorage, writeJsonStorage } from "@/lib/shared/storage";

const ECDH_KEYS_STORAGE_KEY = "figaro-ecdh-keys";

/** A stored keypair carries a creation stamp so an ABANDONED ceremony's key
 *  material can be swept by age (an order that never resolves has no terminal
 *  event to trigger the resolution-path purge; sessionStorage still bounds it
 *  to the tab, this bounds it within the tab). Entries written before this
 *  field existed have no `createdAt` and are left to tab-close, never swept. */
interface StoredEcdhKeypair extends EphemeralKeypair {
    createdAt?: number;
}

interface EcdhKeyStore {
    [addressOrderKey: string]: StoredEcdhKeypair;
}

function ecdhStoreKey(address: string, orderId: string): string {
    return `${address.toLowerCase()}:${orderId}`;
}

/**
 * Get or create a per-order ephemeral keypair for the receiving side of the
 * handoff ECDH exchange.
 *
 * Idempotent: if a keypair already exists for this address+order, it is
 * returned. Otherwise a fresh keypair is generated and persisted with a
 * creation stamp (for the age sweep).
 */
export function getOrCreateOrderEcdhKeypair(
    address: string,
    orderId: string,
): EphemeralKeypair {
    const store = readJsonStorage<EcdhKeyStore>(ECDH_KEYS_STORAGE_KEY, {}, "session");
    const key = ecdhStoreKey(address, orderId);
    if (store[key]) return store[key];

    const kp = generateOrderKeypair();
    store[key] = { ...kp, createdAt: Date.now() };
    // The key must outlive this call: the counterparty wraps a secret for the
    // public half, and the private half is read back to unwrap it. A write the
    // browser refuses (quota, a blocked store) fails the ceremony here, before
    // any public key is sent, never later as a silent null.
    if (!writeJsonStorage(ECDH_KEYS_STORAGE_KEY, store, "session")) {
        throw new Error("The hand-off key could not be kept in this browser's session storage.");
    }
    return kp;
}

/**
 * Purge ephemeral keypairs older than `maxAgeMs` — the abandoned-ceremony
 * sweep. An order that never reaches OrderResolved/ProcessResolved never
 * triggers the resolution-path purge, so without this its keypair lingers for
 * the life of the tab; this bounds that to `maxAgeMs`. Entries without a
 * `createdAt` (pre-upgrade) are NOT swept — only definitely-stale keys go.
 */
export function sweepStaleEcdhKeypairs(now: number, maxAgeMs: number): void {
    const store = readJsonStorage<EcdhKeyStore>(ECDH_KEYS_STORAGE_KEY, {}, "session");
    let changed = false;
    for (const [key, kp] of Object.entries(store)) {
        if (typeof kp.createdAt === "number" && now - kp.createdAt > maxAgeMs) {
            delete store[key];
            changed = true;
        }
    }
    if (changed) writeJsonStorage(ECDH_KEYS_STORAGE_KEY, store, "session");
}

/** Retrieve a previously stored ECDH keypair (null if missing). */
export function getOrderEcdhKeypair(
    address: string,
    orderId: string,
): EphemeralKeypair | null {
    const store = readJsonStorage<EcdhKeyStore>(ECDH_KEYS_STORAGE_KEY, {}, "session");
    return store[ecdhStoreKey(address, orderId)] ?? null;
}

/** Remove an ECDH keypair (after handoff is complete). */
export function removeOrderEcdhKeypair(
    address: string,
    orderId: string,
): void {
    const store = readJsonStorage<EcdhKeyStore>(ECDH_KEYS_STORAGE_KEY, {}, "session");
    delete store[ecdhStoreKey(address, orderId)];
    writeJsonStorage(ECDH_KEYS_STORAGE_KEY, store, "session");
}

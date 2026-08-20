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
import { readSessionStorage, writeSessionStorage } from "@/lib/shared/storage";

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
    const store = readSessionStorage<EcdhKeyStore>(ECDH_KEYS_STORAGE_KEY, {});
    const key = ecdhStoreKey(address, orderId);
    if (store[key]) return store[key];

    const kp = generateOrderKeypair();
    store[key] = { ...kp, createdAt: Date.now() };
    writeSessionStorage(ECDH_KEYS_STORAGE_KEY, store);
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
    const store = readSessionStorage<EcdhKeyStore>(ECDH_KEYS_STORAGE_KEY, {});
    let changed = false;
    for (const [key, kp] of Object.entries(store)) {
        if (typeof kp.createdAt === "number" && now - kp.createdAt > maxAgeMs) {
            delete store[key];
            changed = true;
        }
    }
    if (changed) writeSessionStorage(ECDH_KEYS_STORAGE_KEY, store);
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

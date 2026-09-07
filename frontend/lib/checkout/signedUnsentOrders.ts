/**
 * signedUnsentOrders — the buyer's signed order between SIGN and SEND.
 *
 * A buyer signature makes an order final, but until the payload is relayed
 * to the seller the coordination channel holds nothing, so the order lived
 * only in the share panel's React state and a navigation lost it (beta r4:
 * "/orders is empty until Send via XMTP"). This store keeps the signed
 * payload for the length of the TAB — sessionStorage, the posture the
 * per-order ceremony keys already take (`lib/handoff/ecdh.ts`): a signed
 * payload carries the agreement's private plaintext and is never durable at
 * rest; it survives navigation, not the tab. /orders lists it under "Signed,
 * not yet sent" with Send and Discard; a successful relay forgets it, and
 * from then on the channel is the source, as before.
 *
 * Keyed by wallet and chain, then by the on-chain order hash, so two wallets
 * on one browser never see each other's drafts and a devnet payload never
 * surfaces under a public chain.
 */
import { useSyncExternalStore } from "react";
import {
    deserializeCommitmentPayload,
    serializeCommitmentPayload,
    type CommitmentPayload,
} from "@figaro-protocol/sdk/agent";
import { commitmentOrderHash } from "@/lib/kernel/signedCommitment";
import { readSessionStorage, writeSessionStorage } from "@/lib/shared/storage";

export const SIGNED_UNSENT_STORAGE_KEY = "figaro-signed-unsent-orders";

/** orderId → serialized payload, under a wallet+chain scope key. */
type Store = Record<string, Record<string, string>>;

export interface SignedUnsentOrder {
    orderId: string;
    payload: CommitmentPayload;
}

function scopeKey(address: string, chainId: number): string {
    return `${chainId}:${address.toLowerCase()}`;
}

const listeners = new Set<() => void>();
function notify() {
    for (const l of listeners) l();
}

function readStore(): Store {
    return readSessionStorage<Store>(SIGNED_UNSENT_STORAGE_KEY, {});
}

/** Keep a signed, not-yet-relayed payload for this tab. Idempotent per order. */
export function rememberSignedUnsent(params: { address: string; chainId: number; payload: CommitmentPayload }): string {
    const { address, chainId, payload } = params;
    const orderId = commitmentOrderHash(payload.commitment, chainId);
    const store = readStore();
    const scope = scopeKey(address, chainId);
    store[scope] = { ...(store[scope] ?? {}), [orderId]: serializeCommitmentPayload(payload) };
    writeSessionStorage(SIGNED_UNSENT_STORAGE_KEY, store);
    notify();
    return orderId;
}

/** Drop a payload — after a successful relay, or on the buyer's discard. */
export function forgetSignedUnsent(params: { address: string; chainId: number; orderId: string }): void {
    const { address, chainId, orderId } = params;
    const store = readStore();
    const scope = scopeKey(address, chainId);
    if (!store[scope]?.[orderId]) return;
    const { [orderId]: _dropped, ...rest } = store[scope];
    if (Object.keys(rest).length > 0) store[scope] = rest;
    else delete store[scope];
    writeSessionStorage(SIGNED_UNSENT_STORAGE_KEY, store);
    notify();
}

/** Every signed, not-yet-relayed payload this wallet holds on this chain, in
 *  storage order. An entry that fails to deserialize is skipped, never thrown. */
export function listSignedUnsent(params: { address: string; chainId: number }): SignedUnsentOrder[] {
    const scope = readStore()[scopeKey(params.address, params.chainId)] ?? {};
    const out: SignedUnsentOrder[] = [];
    for (const [orderId, serialized] of Object.entries(scope)) {
        try {
            out.push({ orderId, payload: deserializeCommitmentPayload(serialized) });
        } catch {
            // an unreadable entry is absence
        }
    }
    return out;
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => { if (e.key === SIGNED_UNSENT_STORAGE_KEY) listener(); };
    if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
    return () => {
        listeners.delete(listener);
        if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
    };
}

/** The wallet's signed, not-yet-relayed orders on this chain — reactive to
 *  remember/forget in this tab. Empty when no wallet is connected. */
export function useSignedUnsentOrders(address: string | undefined, chainId: number | undefined): SignedUnsentOrder[] {
    const snapshot = useSyncExternalStore(
        subscribe,
        () => (address && chainId ? JSON.stringify(readStore()[scopeKey(address, chainId)] ?? {}) : "{}"),
        () => "{}",
    );
    const entries = Object.entries(JSON.parse(snapshot) as Record<string, string>);
    const out: SignedUnsentOrder[] = [];
    for (const [orderId, serialized] of entries) {
        try {
            out.push({ orderId, payload: deserializeCommitmentPayload(serialized) });
        } catch {
            // an unreadable entry is absence
        }
    }
    return out;
}

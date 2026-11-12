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
import { commitmentOrderHash } from "@/lib/core/signedCommitment";
import { readJsonStorage, writeJsonStorage } from "@/lib/shared/storage";
import { createVersionStore } from "@/lib/shared/versionStore";

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

const changes = createVersionStore();

function readStore(): Store {
    return readJsonStorage<Store>(SIGNED_UNSENT_STORAGE_KEY, {}, "session");
}

/** Keep a signed, not-yet-relayed payload for this tab. Idempotent per order. */
export function rememberSignedUnsent(params: { address: string; chainId: number; payload: CommitmentPayload }): string {
    const { address, chainId, payload } = params;
    const orderId = commitmentOrderHash(payload.commitment, chainId);
    const store = readStore();
    const scope = scopeKey(address, chainId);
    store[scope] = { ...(store[scope] ?? {}), [orderId]: serializeCommitmentPayload(payload) };
    writeJsonStorage(SIGNED_UNSENT_STORAGE_KEY, store, "session");
    changes.bump();
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
    writeJsonStorage(SIGNED_UNSENT_STORAGE_KEY, store, "session");
    changes.bump();
}

function subscribe(listener: () => void): () => void {
    const unsubscribe = changes.subscribe(listener);
    const onStorage = (e: StorageEvent) => { if (e.key === SIGNED_UNSENT_STORAGE_KEY) listener(); };
    if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
    return () => {
        unsubscribe();
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

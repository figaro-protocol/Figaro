"use client";

/**
 * useProcessAgreements — IPFS-backed agreement hydration owner.
 *
 * Returns a Map<agreementHash, Agreement> populated as hydration completes.
 * Downstream consumers (the semantic process model, the order page) read
 * from this Map; `loadAgreement` is a synchronous localStorage cache that
 * is fine as a cache but wrong as a primary source — a wallet that lands
 * on an order page after navigation has no guarantee the cache is warm.
 *
 * The cache is module-level + singleton: every call to `useProcessAgreements`
 * shares the same Map. Each render subscribes to mutations; when any
 * instance finishes hydration, every consumer re-renders. This eliminates
 * the multi-instance race — `OrderTimelineView` and a nested `GHGWorkflowPanel`
 * (both call `useSemanticProcessWorkspace`) used to each maintain their own
 * `useState<Map>`, hydrating independently, with the panel often rendering
 * empty because its own Map hadn't populated yet even though the workspace
 * above it had.
 */

import { useEffect, useMemo, useState } from "react";
import { hydrateAgreement } from "@/lib/core/agreementStore";
import { ZERO_BYTES32 } from "@/lib/shared/evm";
import type { Agreement } from "@/lib/core/agreementManifest";

// Singleton cache shared by every consumer. localStorage is the cache's
// own write surface (via hydrateAgreement); this Map gives React a reactive
// in-memory view of it. Anchored on `window` to survive Next.js dev-mode
// HMR module duplication — without that, parallel module copies would each
// keep their own Map, defeating the singleton.
type CacheStore = {
    cache: Map<string, Agreement>;
    inflight: Set<string>;
    subscribers: Set<() => void>;
};
function getStore(): CacheStore {
    if (typeof window === "undefined") {
        return { cache: new Map(), inflight: new Set(), subscribers: new Set() };
    }
    const w = window as unknown as { __FIGARO_AGREEMENT_STORE__?: CacheStore };
    if (!w.__FIGARO_AGREEMENT_STORE__) {
        w.__FIGARO_AGREEMENT_STORE__ = { cache: new Map(), inflight: new Set(), subscribers: new Set() };
    }
    return w.__FIGARO_AGREEMENT_STORE__;
}

export function useProcessAgreements(agreementHashes: string[]): Map<string, Agreement> {
    const [, setVersion] = useState(0);
    const store = getStore();

    // Subscribe to cache mutations — any consumer's hydration completing
    // triggers a re-render here too.
    useEffect(() => {
        const sub = () => setVersion((v) => v + 1);
        store.subscribers.add(sub);
        return () => {
            store.subscribers.delete(sub);
        };
    }, [store]);

    // Stabilise the hydration dep: drive the effect by the set of distinct
    // non-zero hashes, not by the parent's array identity.
    const stableKey = useMemo(
        () => [...new Set(agreementHashes.filter((h) => Boolean(h) && h !== ZERO_BYTES32))]
            .sort()
            .join(","),
        [agreementHashes],
    );

    useEffect(() => {
        if (!stableKey) return;
        const hashes = stableKey.split(",");
        const missing = hashes.filter((h) => !store.cache.has(h) && !store.inflight.has(h));
        if (missing.length === 0) return;

        let cancelled = false;
        for (const h of missing) store.inflight.add(h);

        void Promise.all(
            missing.map(async (hash) => [hash, await hydrateAgreement(hash)] as const),
        ).then((results) => {
            for (const [hash] of results) store.inflight.delete(hash);
            if (cancelled) return;
            let changed = false;
            for (const [hash, agreement] of results) {
                if (agreement && !store.cache.has(hash)) {
                    store.cache.set(hash, agreement);
                    changed = true;
                }
            }
            if (changed) {
                for (const sub of store.subscribers) sub();
            }
        });

        return () => {
            cancelled = true;
        };
    }, [stableKey, store]);

    return store.cache;
}

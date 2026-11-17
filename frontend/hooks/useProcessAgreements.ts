"use client";

/**
 * useProcessAgreements — IPFS-backed agreement hydration owner.
 *
 * Returns a Map<checkoutHash, Agreement> populated as hydration completes.
 * Downstream consumers (the semantic process model, the order page) read
 * from this Map; `loadAgreement` is a synchronous localStorage cache that
 * is fine as a cache but wrong as a primary source — a wallet that lands
 * on an order page after navigation has no guarantee the cache is warm.
 * `useProcessAgreementReads` gives the same hydration as one network read
 * per checkoutHash, for a surface that tells a load in flight from a failed
 * one.
 *
 * The cache is module-level + singleton: every call shares the same Map.
 * Each render subscribes to mutations; when any instance finishes hydration,
 * every consumer re-renders, so two surfaces on one page (`OrderTimelineView`
 * and a nested workflow panel, both through `useSemanticProcessWorkspace`)
 * never hold different views of the same agreements.
 */

import { useEffect, useMemo, useState } from "react";
import { fetchAgreement } from "@/lib/core/agreementFetch";
import { ZERO_BYTES32 } from "@/lib/shared/evm";
import { ABSENT, PENDING, present, type NetworkRead } from "@/lib/shared/networkRead";
import type { Agreement } from "@figaro-protocol/sdk";

// Singleton cache shared by every consumer. localStorage is the cache's
// own write surface (via hydrateAgreement); this Map gives React a reactive
// in-memory view of it. Anchored on `window` to survive Next.js dev-mode
// HMR module duplication — without that, parallel module copies would each
// keep their own Map, defeating the singleton. `failed` holds each hash whose
// last fetch answered absent, so a reader tells a failed load from one in
// flight.
type CacheStore = {
    cache: Map<string, Agreement>;
    inflight: Set<string>;
    failed: Set<string>;
    subscribers: Set<() => void>;
};
function newStore(): CacheStore {
    return { cache: new Map(), inflight: new Set(), failed: new Set(), subscribers: new Set() };
}
function getStore(): CacheStore {
    if (typeof window === "undefined") return newStore();
    const w = window as unknown as { __FIGARO_AGREEMENT_STORE__?: CacheStore };
    if (!w.__FIGARO_AGREEMENT_STORE__) w.__FIGARO_AGREEMENT_STORE__ = newStore();
    return w.__FIGARO_AGREEMENT_STORE__;
}

/** A checkoutHash that names an agreement: neither empty nor zero. */
function namesAnAgreement(hash: string): boolean {
    return Boolean(hash) && hash !== ZERO_BYTES32;
}

/** Fetch every named, not yet loaded agreement into the shared store, and
 *  re-render on any change to it. Returns the store, its change count, and
 *  whether this consumer has asked for its current hashes yet: until it has,
 *  a hash that failed before is about to be fetched again. */
function useAgreementHydration(checkoutHashes: string[]): { store: CacheStore; version: number; asked: boolean } {
    const [version, setVersion] = useState(0);
    const [askedKey, setAskedKey] = useState<string | null>(null);
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

    // Stabilize the hydration dep: drive the effect by the set of distinct
    // named hashes, not by the parent's array identity.
    const stableKey = useMemo(
        () => [...new Set(checkoutHashes.filter(namesAnAgreement))].sort().join(","),
        [checkoutHashes],
    );

    useEffect(() => {
        setAskedKey(stableKey);
        if (!stableKey) return;
        const hashes = stableKey.split(",");
        const missing = hashes.filter((h) => !store.cache.has(h) && !store.inflight.has(h));
        if (missing.length === 0) return;

        // A hash fetched again is in flight, not failed; every consumer is
        // told, so none reads it as failed while its retry runs.
        for (const h of missing) {
            store.inflight.add(h);
            store.failed.delete(h);
        }
        for (const sub of store.subscribers) sub();

        // Each answer lands on its own, so one slow fetch holds back no other.
        // The store is shared by every consumer, so an answer lands in it
        // whether or not the component that asked is still mounted: a hash
        // left in flight would read as pending to every other consumer.
        for (const hash of missing) {
            void fetchAgreement(hash).then((read) => {
                store.inflight.delete(hash);
                if (read.status === "present") store.cache.set(hash, read.value);
                else store.failed.add(hash);
                for (const sub of store.subscribers) sub();
            });
        }
    }, [stableKey, store]);

    return { store, version, asked: askedKey === stableKey };
}

/**
 * The read of each agreement `checkoutHashes` names: `pending` while its
 * fetch is in flight, `absent` once the fetch failed or found no agreement
 * that hashes to the checkoutHash (and for an empty or zero checkoutHash,
 * which names none), `present` once it loaded. The audit page reads it to
 * list a failed load as lacking and to show a loading line for one in flight.
 */
export function useProcessAgreementReads(checkoutHashes: string[]): Map<string, NetworkRead<Agreement>> {
    const { store, version, asked } = useAgreementHydration(checkoutHashes);
    return useMemo(() => {
        const reads = new Map<string, NetworkRead<Agreement>>();
        for (const hash of checkoutHashes) {
            const agreement = store.cache.get(hash);
            // In flight is read before failed: a retry is pending, never
            // failed. A failed hash this consumer has not asked for yet is
            // about to be fetched again, so it is pending too.
            reads.set(
                hash,
                !namesAnAgreement(hash) ? ABSENT
                    : agreement !== undefined ? present(agreement)
                    : store.inflight.has(hash) ? PENDING
                    : store.failed.has(hash) && asked ? ABSENT
                    : PENDING,
            );
        }
        return reads;
        // `version` bumps on every change to the shared store.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store, version, asked, checkoutHashes]);
}

export function useProcessAgreements(checkoutHashes: string[]): Map<string, Agreement> {
    const { store, version } = useAgreementHydration(checkoutHashes);

    // A fresh Map snapshot keyed on the bump-version, so consumers'
    // useMemo([..., agreements]) sees a ref change when the shared cache
    // mutates: the singleton `store.cache` keeps one identity, and a memo
    // keyed on it would skip the recompute after hydration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useMemo(() => new Map(store.cache), [store, version]);
}

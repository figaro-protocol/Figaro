"use client";

/**
 * useWalletProcessIds — returns a list of processes the connected wallet
 * has participated in (as buyer or seller).
 *
 * Live FigaroCore: orders are Active at commit time (no Pending state).
 * History comes from the indexer's one reader (`getCoreEvents`) and live
 * updates from `useWatchOrderEvents`, both over every order emitter. The
 * fold is the SDK's (`walletOrders`); this hook keeps only its own view
 * mapping, the per-process rollup `summarize` builds.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { usePublicClient } from "wagmi";
import type { CoreEvents } from "@figaro-protocol/sdk";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { Order, OrderState, orderFromSdk, useOrderStore } from "@/lib/kernel/store";
import { getCoreEvents, useWatchOrderEvents, walletOrders } from "@/lib/kernel/indexer";
import type { ProcessSummary } from "@/lib/kernel/walletProcessQueries";

function summarize(orders: Order[]): ProcessSummary[] {
    const map = new Map<string, Order[]>();
    for (const o of orders) {
        const arr = map.get(o.processId) ?? [];
        arr.push(o);
        map.set(o.processId, arr);
    }
    const summaries: ProcessSummary[] = [];
    map.forEach((ords, processId) => {
        const sorted = ords.slice().sort((a, b) => (a.orderHash < b.orderHash ? -1 : a.orderHash > b.orderHash ? 1 : 0));
        summaries.push({
            processId,
            orderCount: ords.length,
            hasActive: ords.some((o) => o.state === OrderState.Active),
            createdAt: Math.min(...ords.map((o) => o.blockNumber ?? Number.MAX_SAFE_INTEGER)),
            orders: sorted.map((o) => ({ id: o.orderHash, state: o.state })),
        });
    });
    return summaries.sort((a, b) => b.createdAt - a.createdAt);
}

export function useWalletProcessIds(address: string | undefined): ProcessSummary[] {
    const [summaries, setSummaries] = useState<ProcessSummary[]>([]);
    const publicClient = usePublicClient();
    const contractAddr = CONTRACTS.core || undefined;
    const processReloadKey = useOrderStore((s) => s.processReloadKey);
    // The parsed event corpus the SDK fold runs over — history replaces it,
    // live watcher batches append to it (the fold dedupes by orderHash, so an
    // overlapping batch is idempotent).
    const eventsRef = useRef<CoreEvents>({ orderCommitted: [], orderResolved: [], processResolved: [] });

    const rebuild = useCallback((wallet: string) => {
        setSummaries(summarize(walletOrders(eventsRef.current, wallet).map(orderFromSdk)));
    }, []);

    useEffect(() => {
        const chainId = publicClient?.chain?.id;
        if (!address || !publicClient || !chainId || !contractAddr) return;

        const client = publicClient;
        let canceled = false;

        async function load() {
            try {
                const { events } = await getCoreEvents(client, chainId!);
                if (canceled) return;
                eventsRef.current = events;
                rebuild(address!);
            } catch (e) {
                console.warn("[useWalletProcessIds] indexer error:", e);
            }
        }

        void load();
        return () => { canceled = true; };
    }, [address, publicClient, contractAddr, processReloadKey, rebuild]);

    const normalizedAddress = address?.toLowerCase();

    // Live batches append to the corpus; the fold dedupes by orderHash.
    const onEvents = useCallback(
        (events: CoreEvents) => {
            if (!normalizedAddress) return;
            eventsRef.current.orderCommitted.push(...events.orderCommitted);
            eventsRef.current.orderResolved.push(...events.orderResolved);
            eventsRef.current.processResolved.push(...events.processResolved);
            rebuild(normalizedAddress);
        },
        [normalizedAddress, rebuild],
    );
    useWatchOrderEvents(onEvents, !!contractAddr && !!normalizedAddress);

    return summaries;
}

"use client";

/**
 * useWalletProcessIds — returns a list of processes the connected wallet
 * has participated in (as buyer or seller).
 *
 * Live kernel: orders are Active at commit time (no Pending state).
 * Only two events: OrderCommitted and OrderResolved. The fold is the SDK's
 * (`projectProcessGraph` + `walletRecord` — the same one `/data/explore`
 * answers wallet history with); this hook keeps only its own view mapping,
 * the per-process rollup `summarise` builds.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { usePublicClient, useWatchContractEvent } from "wagmi";
import type { WatchContractEventOnLogsParameter } from "viem";
import {
    parseOrderCommittedLogs,
    parseOrderResolvedLogs,
    type Address,
    type CoreEvents,
} from "@figaro-protocol/sdk";
import { projectProcessGraph, walletRecord } from "@figaro-protocol/sdk/derive";
import { CONTRACTS, CORE_ABI } from "@/lib/kernel/contracts";
import { Order, OrderState, orderFromSdk, useOrderStore } from "@/lib/kernel/store";
import {
    getAllOrderCommitted,
    getAllOrderResolved,
} from "@/lib/kernel/indexer";
import type { ProcessSummary } from "@/lib/kernel/walletProcessQueries";

/** The raw-log shape the SDK parsers take — cached rows and watcher logs both
 *  carry data/topics, so the one decoder runs over either. */
type SdkLogs = Parameters<typeof parseOrderCommittedLogs>[0];

function summarise(orders: Order[]): ProcessSummary[] {
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
        const graph = projectProcessGraph(eventsRef.current);
        const record = walletRecord(graph, wallet as Address);
        const seen = new Set<string>();
        const combined: Order[] = [];
        for (const o of [...record.ordersAsBuyer, ...record.ordersAsSeller]) {
            if (seen.has(o.orderHash)) continue;
            seen.add(o.orderHash);
            combined.push(orderFromSdk(o));
        }
        setSummaries(summarise(combined));
    }, []);

    useEffect(() => {
        if (!address || !publicClient || !contractAddr) return;

        const client = publicClient;
        let cancelled = false;
        const chainId = client.chain?.id ?? 31337;

        async function load() {
            try {
                const [committed, resolved] = await Promise.all([
                    getAllOrderCommitted(client, chainId),
                    getAllOrderResolved(client, chainId),
                ]);
                if (cancelled) return;
                eventsRef.current = {
                    orderCommitted: parseOrderCommittedLogs(committed as unknown as SdkLogs),
                    orderResolved: parseOrderResolvedLogs(resolved as unknown as SdkLogs),
                    processResolved: [],
                };
                rebuild(address!);
            } catch (e) {
                console.warn("[useWalletProcessIds] indexer error:", e);
            }
        }

        void load();
        return () => { cancelled = true; };
    }, [address, publicClient, contractAddr, processReloadKey, rebuild]);

    const realEnabled = !!contractAddr;
    const realAddr = realEnabled ? (contractAddr as `0x${string}`) : undefined;
    const normalizedAddress = address?.toLowerCase();

    // Reference-stable onLogs: wagmi keys its watcher effect on the callback,
    // so an inline arrow recreates the event filter every render and drops
    // events that land between recreations (see walletProcessQueries.ts).
    const onCommittedLogs = useCallback(
        (logs: WatchContractEventOnLogsParameter<typeof CORE_ABI, "OrderCommitted">) => {
            if (!normalizedAddress) return;
            eventsRef.current.orderCommitted.push(...parseOrderCommittedLogs(logs as unknown as SdkLogs));
            rebuild(normalizedAddress);
        },
        [normalizedAddress, rebuild],
    );
    useWatchContractEvent({
        address: realAddr,
        abi: CORE_ABI,
        eventName: "OrderCommitted",
        onLogs: onCommittedLogs,
        enabled: realEnabled && !!normalizedAddress,
    });

    const onResolvedLogs = useCallback(
        (logs: WatchContractEventOnLogsParameter<typeof CORE_ABI, "OrderResolved">) => {
            if (!normalizedAddress) return;
            eventsRef.current.orderResolved.push(...parseOrderResolvedLogs(logs as unknown as SdkLogs));
            rebuild(normalizedAddress);
        },
        [normalizedAddress, rebuild],
    );
    useWatchContractEvent({
        address: realAddr,
        abi: CORE_ABI,
        eventName: "OrderResolved",
        onLogs: onResolvedLogs,
        enabled: realEnabled,
    });

    return summaries;
}

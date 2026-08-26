"use client";

/**
 * useProcessOrders — central event-based order hook.
 *
 * Returns the live Order[] for a given processId. A null processId loads
 * NOTHING (the hook is per-process) — for every order the connected wallet
 * is a party to, use `useWalletOrders` below.
 *
 * Loads history via getLogs on mount, then streams live updates via
 * watchContractEvent — reads come from the indexer only, no mock source.
 * The OrderCommitted→Order fold is the SDK's (`Topology`, the one owner of
 * that projection); this hook fetches cached logs, parses them with the SDK
 * parsers, and projects the folded process into the UI `Order` shape.
 * Agreement bodies are NOT hydrated here; useProcessAgreements owns that.
 *
 * The kernel uses a unified `commit()` (no separate offer/accept), and
 * OrderCommitted events carry salt + deadline rather than bond + timestamp;
 * bonds are derived from payment and cumulativeValue at read time.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount, usePublicClient, useWatchContractEvent } from "wagmi";
import type { WatchContractEventOnLogsParameter } from "viem";
import { CORE_ABI, CONTRACTS } from "@/lib/kernel/contracts";
import { Order, orderFromSdk, useOrderStore } from "@/lib/kernel/store";
import {
    getAllOrderCommitted,
    getAllOrderResolved,
} from "@/lib/kernel/indexer";
import {
    parseOrderCommittedLogs,
    parseOrderResolvedLogs,
    Topology,
    type Hex,
    type Address,
} from "@figaro-protocol/sdk";
import { projectProcessGraph, walletRecord } from "@figaro-protocol/sdk/derive";

/** The raw-log shape the SDK parsers take — cached rows and watcher logs both
 *  carry data/topics, so the one decoder runs over either. */
type SdkLogs = Parameters<typeof parseOrderCommittedLogs>[0];

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useProcessOrders(processId: string | null): Order[] {
    const [orders, setOrders] = useState<Order[]>([]);
    const publicClient = usePublicClient();
    const contractAddr = CONTRACTS.core || undefined;
    const processReloadKey = useOrderStore((s) => s.processReloadKey);
    // Which processId the current `orders` belong to — so a same-process
    // REFRESH (processReloadKey bump after an action lands) keeps the last
    // result rendered until the new one swaps in atomically. Clearing on
    // every reload emptied the list for the fetch window, which flipped the
    // derived role to "spectator", unmounted the capability rail, and wiped
    // values a user was mid-typing in a second form (the punch-listed
    // bumpProcessReload remount). Only a process-identity CHANGE clears —
    // another process's orders must never linger under the new id.
    const ordersForProcessRef = useRef<string | null>(null);
    // The SDK fold this hook projects from — fresh per history load; live
    // watcher batches apply into the same instance (idempotent by orderHash),
    // so an event landing mid-fetch unions with the history instead of racing
    // it.
    const topologyRef = useRef<Topology | null>(null);

    const shouldLoad = !!processId;

    const projectOrders = useCallback((pid: string | null) => {
        const process = pid ? topologyRef.current?.getProcess(pid as Hex) : undefined;
        setOrders(process ? [...process.orders.values()].map(orderFromSdk) : []);
    }, []);

    // ------------------------------------------------------------------
    // Load historical logs on mount / when processId changes
    // ------------------------------------------------------------------
    useEffect(() => {
        if (ordersForProcessRef.current !== processId) {
            ordersForProcessRef.current = processId;
            setOrders([]);
        }
        topologyRef.current = new Topology();
        if (!publicClient || !contractAddr || !shouldLoad) return;

        let cancelled = false;
        const chainId = publicClient.chain?.id ?? 31337;
        const topology = topologyRef.current;

        (async () => {
            try {
                const [committed, resolved] = await Promise.all([
                    getAllOrderCommitted(publicClient, chainId),
                    getAllOrderResolved(publicClient, chainId),
                ]);
                if (cancelled) return;

                topology.applyEvents({
                    orderCommitted: parseOrderCommittedLogs(committed as unknown as SdkLogs),
                    orderResolved: parseOrderResolvedLogs(resolved as unknown as SdkLogs),
                    processResolved: [],
                });
                projectOrders(processId);
            } catch (err) {
                if (!cancelled) console.error("useProcessOrders indexer error:", err);
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [publicClient, contractAddr, processId, processReloadKey]);

    // ------------------------------------------------------------------
    // Live event watchers
    // ------------------------------------------------------------------
    const realEnabled = !!contractAddr && !!processId;
    const realAddr = realEnabled ? (contractAddr as `0x${string}`) : undefined;

    // Reference-stable onLogs: wagmi keys its watcher effect on the callback,
    // so an inline arrow recreates the event filter every render and drops
    // events that land between recreations (see walletProcessQueries.ts).
    const onCommittedLogs = useCallback(
        (logs: WatchContractEventOnLogsParameter<typeof CORE_ABI, "OrderCommitted">) => {
            topologyRef.current?.applyEvents({
                orderCommitted: parseOrderCommittedLogs(logs as unknown as SdkLogs),
                orderResolved: [],
                processResolved: [],
            });
            projectOrders(processId);
        },
        [projectOrders, processId],
    );
    const onResolvedLogs = useCallback(
        (logs: WatchContractEventOnLogsParameter<typeof CORE_ABI, "OrderResolved">) => {
            topologyRef.current?.applyEvents({
                orderCommitted: [],
                orderResolved: parseOrderResolvedLogs(logs as unknown as SdkLogs),
                processResolved: [],
            });
            projectOrders(processId);
        },
        [projectOrders, processId],
    );
    useWatchContractEvent({
        address: realAddr,
        abi: CORE_ABI,
        eventName: "OrderCommitted",
        onLogs: onCommittedLogs,
        enabled: realEnabled,
    });
    useWatchContractEvent({
        address: realAddr,
        abi: CORE_ABI,
        eventName: "OrderResolved",
        onLogs: onResolvedLogs,
        enabled: realEnabled,
    });

    return orders;
}

/**
 * useWalletOrders — every full Order the connected wallet is a party to
 * (buyer OR seller), across ALL its processes, loaded from the indexer.
 *
 * `useProcessOrders(null)` looks like it would do this — its doc even said
 * "all orders when null" — but it hard-gates loading on a truthy processId
 * and returns [] for null, so the hash-search verifier that relied on it
 * had nothing to search. This hook is that missing wallet-wide loader:
 * bounded (the SDK's `walletRecord` filter, never the whole chain), full
 * Orders (agreementHash + parties), reload-key aware — the SAME fold and
 * wallet query `/data/explore` answers wallet history with.
 */
export function useWalletOrders(): Order[] {
    const [orders, setOrders] = useState<Order[]>([]);
    const publicClient = usePublicClient();
    const { address } = useAccount();
    const contractAddr = CONTRACTS.core || undefined;
    const processReloadKey = useOrderStore((s) => s.processReloadKey);

    useEffect(() => {
        if (!publicClient || !contractAddr || !address) {
            setOrders([]);
            return;
        }
        let cancelled = false;
        const chainId = publicClient.chain?.id ?? 31337;

        (async () => {
            try {
                const [committed, resolved] = await Promise.all([
                    getAllOrderCommitted(publicClient, chainId),
                    getAllOrderResolved(publicClient, chainId),
                ]);
                if (cancelled) return;

                const graph = projectProcessGraph({
                    orderCommitted: parseOrderCommittedLogs(committed as unknown as SdkLogs),
                    orderResolved: parseOrderResolvedLogs(resolved as unknown as SdkLogs),
                    processResolved: [],
                });
                const record = walletRecord(graph, address as Address);
                // An order where the wallet is BOTH parties appears once here
                // (this is a loader, not the two-sided record table).
                const seen = new Set<string>();
                const result: Order[] = [];
                for (const o of [...record.ordersAsBuyer, ...record.ordersAsSeller]) {
                    if (seen.has(o.orderHash)) continue;
                    seen.add(o.orderHash);
                    result.push(orderFromSdk(o));
                }
                result.sort((a, b) => (a.blockNumber ?? 0) - (b.blockNumber ?? 0));
                if (!cancelled) setOrders(result);
            } catch (err) {
                if (!cancelled) console.error("useWalletOrders indexer error:", err);
            }
        })();

        return () => { cancelled = true; };
    }, [publicClient, contractAddr, address, processReloadKey]);

    return orders;
}

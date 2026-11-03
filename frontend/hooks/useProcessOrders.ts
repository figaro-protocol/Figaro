"use client";

/**
 * useProcessOrders — central event-based order hook.
 *
 * Returns the live Order[] for a given processId. A null processId loads
 * NOTHING (the hook is per-process) — for every order the connected wallet
 * is a party to, use `useWalletOrders` below.
 *
 * Loads history through the indexer's one reader (`getCoreEvents`) on mount,
 * then applies live updates from `useWatchOrderEvents` — both over every
 * order emitter, no mock source. The OrderCommitted→Order fold is the SDK's
 * (`Topology`, the one owner of that projection); this hook projects the
 * folded process into the UI `Order` shape.
 * Agreement bodies are NOT hydrated here; useProcessAgreements owns that.
 *
 * FigaroCore uses a unified `commit()` (no separate offer/accept), and
 * OrderCommitted events carry salt + deadline rather than bond + timestamp;
 * bonds are derived from payment and cumulativeValue at read time.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { Order, orderFromSdk, useOrderStore } from "@/lib/kernel/store";
import { getCoreEvents, useWatchOrderEvents, walletOrders } from "@/lib/kernel/indexer";
import { Topology, type CoreEvents, type Hex } from "@figaro-protocol/sdk";

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
        const chainId = publicClient?.chain?.id;
        if (!publicClient || !chainId || !contractAddr || !shouldLoad) return;

        let canceled = false;
        const topology = topologyRef.current;

        (async () => {
            try {
                const { events } = await getCoreEvents(publicClient, chainId);
                if (canceled) return;

                topology.applyEvents(events);
                projectOrders(processId);
            } catch (err) {
                if (!canceled) console.error("useProcessOrders indexer error:", err);
            }
        })();

        return () => {
            canceled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [publicClient, contractAddr, processId, processReloadKey]);

    // ------------------------------------------------------------------
    // Live order events, from every emitter
    // ------------------------------------------------------------------
    const onEvents = useCallback(
        (events: CoreEvents) => {
            topologyRef.current?.applyEvents(events);
            projectOrders(processId);
        },
        [projectOrders, processId],
    );
    useWatchOrderEvents(onEvents, !!contractAddr && !!processId);

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
 * bounded (`walletOrders`, the SDK's `walletRecord` filter, never the whole
 * chain), full Orders (checkoutHash + parties), reload-key aware.
 */
export function useWalletOrders(): Order[] {
    const [orders, setOrders] = useState<Order[]>([]);
    const publicClient = usePublicClient();
    const { address } = useAccount();
    const contractAddr = CONTRACTS.core || undefined;
    const processReloadKey = useOrderStore((s) => s.processReloadKey);

    useEffect(() => {
        const chainId = publicClient?.chain?.id;
        if (!publicClient || !chainId || !contractAddr || !address) {
            setOrders([]);
            return;
        }
        let canceled = false;

        (async () => {
            try {
                const { events } = await getCoreEvents(publicClient, chainId);
                if (canceled) return;
                // An order where the wallet is BOTH parties appears once here
                // (this is a loader, not the two-sided order table).
                setOrders(walletOrders(events, address).map(orderFromSdk));
            } catch (err) {
                if (!canceled) console.error("useWalletOrders indexer error:", err);
            }
        })();

        return () => { canceled = true; };
    }, [publicClient, contractAddr, address, processReloadKey]);

    return orders;
}

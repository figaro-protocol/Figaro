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
import { Order, OrderState, useOrderStore } from "@/lib/kernel/store";
import {
    getAllOrderCommitted,
    getAllOrderResolved,
} from "@/lib/kernel/indexer";
import { calculateBonds } from "@figaro-protocol/sdk";

// ---------------------------------------------------------------------------
// Event arg types (match CORE_ABI event signatures)
// ---------------------------------------------------------------------------

interface OrderCommittedArgs {
    orderHash: string;
    processId: string;
    buyer: string;
    seller: string;
    currency: string;
    payment: bigint;
    cumulativeValue: bigint;
    agreementHash: string;
    salt: bigint;
    deadline: bigint;
}

interface OrderResolvedArgs {
    orderHash: string;
    processId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function orderFromCommittedArgs(args: OrderCommittedArgs, blockNumber?: number): Order {
    const payment = BigInt(args.payment ?? 0);
    const cumulativeValue = BigInt(args.cumulativeValue ?? 0);
    const bonds = calculateBonds(cumulativeValue, payment);
    return {
        orderHash: args.orderHash as string,
        processId: args.processId as string,
        buyer: args.buyer ?? "",
        seller: args.seller ?? "",
        currency: args.currency ?? "",
        agreementHash: args.agreementHash ?? "",
        payment,
        cumulativeValue,
        state: OrderState.Active,
        buyerBond: bonds.buyerBond,
        sellerBond: bonds.sellerBond,
        salt: BigInt(args.salt ?? 0),
        deadline: BigInt(args.deadline ?? 0),
        blockNumber: blockNumber ?? 0,
    };
}

function applyLogToOrders(
    prev: Order[],
    eventName: string,
    args: OrderCommittedArgs | OrderResolvedArgs,
    processIdFilter: string | null,
    blockNumber?: number
): Order[] {
    if (eventName === "OrderCommitted") {
        const order = orderFromCommittedArgs(args as OrderCommittedArgs, blockNumber);
        if (processIdFilter && order.processId !== processIdFilter) return prev;
        if (prev.some((o) => o.orderHash === order.orderHash)) return prev; // idempotent
        return [...prev, order];
    }

    const orderHash = args.orderHash as string;
    return prev.map((o) => {
        if (o.orderHash !== orderHash) return o;
        if (eventName === "OrderResolved") return { ...o, state: OrderState.Resolved };
        return o;
    });
}

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

    const shouldLoad = !!processId;

    // ------------------------------------------------------------------
    // Real mode: apply a single event to the running order list
    // ------------------------------------------------------------------
    const applyEvent = useCallback(
        (eventName: string, args: OrderCommittedArgs | OrderResolvedArgs, blockNumber?: number) => {
            setOrders((prev) => applyLogToOrders(prev, eventName, args, processId, blockNumber));
        },
        [processId]
    );

    // ------------------------------------------------------------------
    // Real mode: load historical logs on mount / when processId changes
    // ------------------------------------------------------------------
    useEffect(() => {
        if (ordersForProcessRef.current !== processId) {
            ordersForProcessRef.current = processId;
            setOrders([]);
        }
        if (!publicClient || !contractAddr || !shouldLoad) return;

        let cancelled = false;
        const chainId = publicClient.chain?.id ?? 31337;

        (async () => {
            try {
                const allCommitted = await getAllOrderCommitted(publicClient, chainId);
                const committedLogs = allCommitted.filter(
                    (l: any) => l.args?.processId === processId,
                );
                if (cancelled) return;

                let result: Order[] = [];
                for (const log of committedLogs) {
                    if (!log.args) continue;
                    result = applyLogToOrders(
                        result, "OrderCommitted", log.args as unknown as OrderCommittedArgs, processId,
                        typeof log.blockNumber === "bigint" ? Number(log.blockNumber) : undefined
                    );
                }

                if (result.length === 0) { setOrders([]); return; }

                const allResolved = await getAllOrderResolved(publicClient, chainId);
                if (cancelled) return;

                const resolvedLogs = allResolved.filter((l: any) => l.args?.processId === processId);
                for (const log of resolvedLogs) {
                    if (!log.args) continue;
                    result = applyLogToOrders(result, "OrderResolved", log.args as unknown as OrderResolvedArgs, processId);
                }

                setOrders(result);
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
        (logs: WatchContractEventOnLogsParameter<typeof CORE_ABI, "OrderCommitted">) => logs.forEach((l) =>
            applyEvent("OrderCommitted", l.args as unknown as OrderCommittedArgs, typeof l.blockNumber === "bigint" ? Number(l.blockNumber) : undefined)
        ),
        [applyEvent],
    );
    const onResolvedLogs = useCallback(
        (logs: WatchContractEventOnLogsParameter<typeof CORE_ABI, "OrderResolved">) => logs
            .filter((l) => 'processId' in l.args && l.args.processId === processId)
            .forEach((l) => applyEvent("OrderResolved", l.args as unknown as OrderResolvedArgs)),
        [applyEvent, processId],
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
 * bounded (party-filtered, never the whole chain), full Orders (agreementHash
 * + parties), reload-key aware.
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
        const mine = (a?: string) => !!a && a.toLowerCase() === address.toLowerCase();

        (async () => {
            try {
                const committed = await getAllOrderCommitted(publicClient, chainId);
                if (cancelled) return;
                // Party-filter to what THIS wallet can see — buyer or seller.
                let result: Order[] = [];
                for (const log of committed) {
                    const args = log.args as unknown as OrderCommittedArgs | undefined;
                    if (!args || !(mine(args.buyer) || mine(args.seller))) continue;
                    result = applyLogToOrders(
                        result, "OrderCommitted", args, null,
                        typeof log.blockNumber === "bigint" ? Number(log.blockNumber) : undefined,
                    );
                }
                if (result.length === 0) { if (!cancelled) setOrders([]); return; }

                const resolved = await getAllOrderResolved(publicClient, chainId);
                if (cancelled) return;
                const mineHashes = new Set(result.map((o) => o.orderHash.toLowerCase()));
                for (const log of resolved) {
                    const args = log.args as unknown as OrderResolvedArgs | undefined;
                    if (!args || !mineHashes.has(String(args.orderHash).toLowerCase())) continue;
                    result = applyLogToOrders(result, "OrderResolved", args, null);
                }
                if (!cancelled) setOrders(result);
            } catch (err) {
                if (!cancelled) console.error("useWalletOrders indexer error:", err);
            }
        })();

        return () => { cancelled = true; };
    }, [publicClient, contractAddr, address, processReloadKey]);

    return orders;
}

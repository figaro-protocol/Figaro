"use client";

/**
 * useProcessOrders — central event-based order hook.
 *
 * Returns the live Order[] for a given processId (or all orders when null).
 *
 * Loads history via getLogs on mount, then streams live updates via
 * watchContractEvent — reads come from the indexer only, no mock source.
 * Agreement bodies are NOT hydrated here; useProcessAgreements owns that.
 *
 * The kernel uses a unified `commit()` (no separate offer/accept), and
 * OrderCommitted events carry salt + deadline rather than bond + timestamp;
 * bonds are derived from payment and cumulativeValue at read time.
 */

import { useState, useEffect, useCallback } from "react";
import { usePublicClient, useWatchContractEvent } from "wagmi";
import type { WatchContractEventOnLogsParameter } from "viem";
import { CORE_ABI, CONTRACTS } from "@/lib/kernel/contracts";
import { Order, OrderState, useOrderStore } from "@/lib/kernel/store";
import {
    getAllOrderCommitted,
    getAllOrderResolved,
} from "@/lib/kernel/indexer";
import { calculateBonds } from "@figaro/sdk";

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
            setOrders([]);
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

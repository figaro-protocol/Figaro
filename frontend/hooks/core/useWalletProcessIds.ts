"use client";

/**
 * useWalletProcessIds — returns a list of processes the connected wallet
 * has participated in (as buyer or seller).
 *
 * Live kernel: orders are Active at commit time (no Pending state).
 * Only two events: OrderCommitted and OrderResolved.
 */

import { useState, useEffect, useCallback } from "react";
import { usePublicClient, useWatchContractEvent } from "wagmi";
import { CONTRACTS, CORE_ABI } from "@/lib/core/contracts";
import { Order, OrderState, useOrderStore } from "@/lib/core/store";
import { mockSubscribe } from "@/lib/core/mockEventStore";
import {
    getAllOrderCommitted,
    getAllOrderResolved,
} from "@/lib/core/indexer";

export interface OrderStub {
    id: string;
    state: OrderState;
}

export interface ProcessSummary {
    processId: string;
    orderCount: number;
    hasActive: boolean;
    createdAt: number;
    orders: OrderStub[];
}

type IndexedOrderLog = Awaited<ReturnType<typeof getAllOrderCommitted>>[number];

function getLogArgs(log: IndexedOrderLog): Record<string, unknown> {
    return log.args ?? {};
}

function getStringArg(log: IndexedOrderLog, key: string): string {
    const value = getLogArgs(log)[key];
    return typeof value === "string" ? value : "";
}

function getBigIntArg(log: IndexedOrderLog, key: string): bigint {
    const value = getLogArgs(log)[key];
    if (typeof value === "bigint") return value;
    if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
        return BigInt(value);
    }
    return 0n;
}

function toOrder(log: IndexedOrderLog): Order {
    const bn = typeof log.blockNumber === "bigint" ? Number(log.blockNumber) : 0;
    const timestamp = getLogArgs(log).timestamp;
    const ts = typeof timestamp === "bigint" ? Number(timestamp) : bn;
    return {
        id: getStringArg(log, "orderHash"),
        processId: getStringArg(log, "processId"),
        buyer: getStringArg(log, "buyer"),
        seller: getStringArg(log, "seller"),
        currency: getStringArg(log, "currency"),
        agreementHash: getStringArg(log, "agreementHash"),
        payment: getBigIntArg(log, "payment"),
        cumulativeValue: getBigIntArg(log, "cumulativeValue"),
        state: OrderState.Active,
        sellerBond: getBigIntArg(log, "sellerBond"),
        buyerBond: getBigIntArg(log, "buyerBond"),
        salt: getBigIntArg(log, "salt"),
        deadline: getBigIntArg(log, "deadline"),
        blockNumber: bn,
        timestamp: ts,
    };
}

function summarise(orders: Order[]): ProcessSummary[] {
    const map = new Map<string, Order[]>();
    for (const o of orders) {
        const arr = map.get(o.processId) ?? [];
        arr.push(o);
        map.set(o.processId, arr);
    }
    const summaries: ProcessSummary[] = [];
    map.forEach((ords, processId) => {
        const sorted = ords.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        summaries.push({
            processId,
            orderCount: ords.length,
            hasActive: ords.some((o) => o.state === OrderState.Active),
            createdAt: Math.min(...ords.map((o) => o.blockNumber ?? o.timestamp ?? Number.MAX_SAFE_INTEGER)),
            orders: sorted.map((o) => ({ id: o.id, state: o.state })),
        });
    });
    return summaries.sort((a, b) => b.createdAt - a.createdAt);
}

function insertOrderIntoSummaries(prev: ProcessSummary[], order: Order): ProcessSummary[] {
    let found = false;
    const next = prev.map((summary) => {
        if (summary.processId !== order.processId) return summary;
        found = true;
        if (summary.orders.some((stub) => stub.id === order.id)) return summary;

        const orders = [...summary.orders, { id: order.id, state: order.state }]
            .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

        return {
            ...summary,
            orderCount: orders.length,
            hasActive: summary.hasActive || order.state === OrderState.Active,
            createdAt: Math.min(summary.createdAt, order.blockNumber ?? order.timestamp ?? summary.createdAt),
            orders,
        };
    });

    if (!found) {
        next.push({
            processId: order.processId,
            orderCount: 1,
            hasActive: order.state === OrderState.Active,
            createdAt: order.blockNumber ?? order.timestamp ?? Date.now(),
            orders: [{ id: order.id, state: order.state }],
        });
    }

    return next.sort((a, b) => b.createdAt - a.createdAt);
}

export function useWalletProcessIds(address: string | undefined): ProcessSummary[] {
    const isE2EMock =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("e2e") === "mock";

    const [summaries, setSummaries] = useState<ProcessSummary[]>([]);
    const publicClient = usePublicClient();
    const contractAddr = CONTRACTS.core || undefined;
    const processReloadKey = useOrderStore((s) => s.processReloadKey);

    useEffect(() => {
        if (!isE2EMock) return;

        const unsub = mockSubscribe((allOrders: Order[]) => {
            if (!address) {
                setSummaries(summarise(allOrders));
                return;
            }
            const lc = address.toLowerCase();
            const relevant = allOrders.filter(
                (o) =>
                    o.buyer?.toLowerCase() === lc ||
                    o.seller?.toLowerCase() === lc
            );
            setSummaries(summarise(relevant));
        });
        return unsub;
    }, [isE2EMock, address]);

    useEffect(() => {
        if (isE2EMock || !address || !publicClient || !contractAddr) return;

        const client = publicClient;
        let cancelled = false;
        const lc = address.toLowerCase();
        const chainId = client.chain?.id ?? 31337;

        async function load() {
            try {
                const allCommitted = await getAllOrderCommitted(client, chainId);
                if (cancelled) return;

                const buyerOrders: Order[] = allCommitted
                    .filter((log) => getStringArg(log, "buyer").toLowerCase() === lc)
                    .map(toOrder);
                const sellerOrders: Order[] = allCommitted
                    .filter((log) => getStringArg(log, "seller").toLowerCase() === lc)
                    .map(toOrder);

                const seen = new Set<string>();
                const combined: Order[] = [];
                for (const o of [...buyerOrders, ...sellerOrders]) {
                    if (!seen.has(o.id)) {
                        seen.add(o.id);
                        combined.push(o);
                    }
                }

                if (combined.length === 0) { setSummaries([]); return; }

                const processIds = [...new Set(combined.map((o) => o.processId))];
                const pidSet = new Set(processIds);

                const allResolved = await getAllOrderResolved(client, chainId);
                if (cancelled) return;

                const stateMap = new Map<string, OrderState>();
                for (const log of allResolved) {
                    const processId = getStringArg(log, "processId");
                    const orderHash = getStringArg(log, "orderHash");
                    if (processId && orderHash && pidSet.has(processId)) {
                        stateMap.set(orderHash, OrderState.Resolved);
                    }
                }

                const withState = combined.map((o) => {
                    const s = stateMap.get(o.id);
                    return s !== undefined ? { ...o, state: s } : o;
                });

                setSummaries(summarise(withState));
            } catch (e) {
                console.warn("[useWalletProcessIds] indexer error:", e);
            }
        }

        void load();
        return () => { cancelled = true; };
    }, [isE2EMock, address, publicClient, contractAddr, processReloadKey]);

    const realEnabled = !isE2EMock && !!contractAddr;
    const realAddr = realEnabled ? (contractAddr as `0x${string}`) : undefined;
    const normalizedAddress = address?.toLowerCase();

    useWatchContractEvent({
        address: realAddr,
        abi: CORE_ABI,
        eventName: "OrderCommitted",
        onLogs: (logs) => {
            if (!normalizedAddress) return;
            logs.forEach((l) => {
                const buyer = ((l.args.buyer as string) ?? "").toLowerCase();
                const seller = ((l.args.seller as string) ?? "").toLowerCase();
                if (buyer !== normalizedAddress && seller !== normalizedAddress) return;
                setSummaries((prev) => insertOrderIntoSummaries(prev, toOrder(l)));
            });
        },
        enabled: realEnabled && !!normalizedAddress,
    });

    const applyStateChange = useCallback(
        (orderHash: string, newState: OrderState) => {
            setSummaries((prev) =>
                prev.map((s) => {
                    const updatedOrders = s.orders.map((o) =>
                        o.id === orderHash ? { ...o, state: newState } : o
                    );
                    return {
                        ...s,
                        orders: updatedOrders,
                        hasActive: updatedOrders.some((o) => o.state === OrderState.Active),
                    };
                })
            );
        },
        []
    );

    useWatchContractEvent({
        address: realAddr,
        abi: CORE_ABI,
        eventName: "OrderResolved",
        onLogs: (logs) =>
            logs.forEach((l) => applyStateChange(l.args.orderHash as string, OrderState.Resolved)),
        enabled: realEnabled,
    });

    return summaries;
}
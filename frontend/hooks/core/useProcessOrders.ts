"use client";

/**
 * useProcessOrders — central event-based order hook.
 *
 * Returns the live Order[] for a given processId (or all orders when null).
 *
 * • Mock mode (?e2e=mock): subscribes to the module-level mockEventStore.
 * • Real mode: loads history via getLogs on mount, then streams live updates
 *   via watchContractEvent.
 *
 * The kernel uses a unified `commit()` (no separate offer/accept), and
 * OrderCommitted events carry salt + deadline rather than bond + timestamp;
 * bonds are derived from payment and cumulativeValue at read time.
 */

import { useState, useEffect, useCallback } from "react";
import { usePublicClient, useWatchContractEvent } from "wagmi";
import { CORE_ABI, CONTRACTS } from "@/lib/core/contracts";
import { Order, OrderState, useOrderStore } from "@/lib/core/store";
import { mockSubscribe, mockGetOrders } from "@/lib/core/mockEventStore";
import { hydrateAgreement, loadAgreement } from "@/lib/core/agreementStore";
import {
    getAllOrderCommitted,
    getAllOrderResolved,
} from "@/lib/core/indexer";
import { ZERO_BYTES32 } from "@/lib/shared/evm";
import { calculateBonds } from "@figaro/core";

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
        id: args.orderHash as string,
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
        if (prev.some((o) => o.id === order.id)) return prev; // idempotent
        return [...prev, order];
    }

    const orderHash = args.orderHash as string;
    return prev.map((o) => {
        if (o.id !== orderHash) return o;
        if (eventName === "OrderResolved") return { ...o, state: OrderState.Resolved };
        return o;
    });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useProcessOrders(processId: string | null): Order[] {
    const isE2EMock =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("e2e") === "mock";

    const [orders, setOrders] = useState<Order[]>([]);
    const [, setAgreementRefresh] = useState(0);
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
        if (isE2EMock || !publicClient || !contractAddr || !shouldLoad) return;

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
    }, [publicClient, contractAddr, processId, isE2EMock, processReloadKey]);

    // ------------------------------------------------------------------
    // Real mode: live event watchers
    // ------------------------------------------------------------------
    const realEnabled = !isE2EMock && !!contractAddr && !!processId;
    const realAddr = realEnabled ? (contractAddr as `0x${string}`) : undefined;

    useWatchContractEvent({
        address: realAddr,
        abi: CORE_ABI,
        eventName: "OrderCommitted",
        onLogs: (logs) => logs.forEach((l) =>
            applyEvent("OrderCommitted", l.args as unknown as OrderCommittedArgs, typeof l.blockNumber === "bigint" ? Number(l.blockNumber) : undefined)
        ),
        enabled: realEnabled,
    });
    useWatchContractEvent({
        address: realAddr,
        abi: CORE_ABI,
        eventName: "OrderResolved",
        onLogs: (logs) => logs
            .filter((l) => 'processId' in l.args && l.args.processId === processId)
            .forEach((l) => applyEvent("OrderResolved", l.args as unknown as OrderResolvedArgs)),
        enabled: realEnabled,
    });

    // ------------------------------------------------------------------
    // Mock mode: subscribe to mockEventStore
    // ------------------------------------------------------------------
    useEffect(() => {
        if (!isE2EMock) return;

        setOrders(
            processId
                ? mockGetOrders().filter((o) => o.processId === processId)
                : mockGetOrders()
        );

        return mockSubscribe((all) => {
            setOrders(processId ? all.filter((o) => o.processId === processId) : all);
        });
    }, [isE2EMock, processId]);

    useEffect(() => {
        if (!publicClient || orders.length === 0) {
            return;
        }

        const missingAgreementHashes = [...new Set(
            orders
                .map((order) => order.agreementHash)
                .filter((agreementHash): agreementHash is string => (
                    Boolean(agreementHash)
                    && agreementHash !== ZERO_BYTES32
                    && !loadAgreement(agreementHash)
                )),
        )];

        if (missingAgreementHashes.length === 0) {
            return;
        }

        let cancelled = false;

        void Promise.all(
            missingAgreementHashes.map(async (agreementHash) => {
                const agreement = await hydrateAgreement(agreementHash);
                return Boolean(agreement);
            }),
        ).then((results) => {
            if (!cancelled && results.some(Boolean)) {
                setAgreementRefresh((version) => version + 1);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [orders, publicClient]);

    return orders;
}

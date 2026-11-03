"use client";

/**
 * Role-aware process queries. The `/orders` page calls this for BOTH roles
 * (buyer and seller) and merges the rows into one actor-neutral list — every
 * order the wallet is on. One row per commitment the wallet holds in a given
 * role, plus that order's metadata (counterparty, payment, currency, status).
 *
 * Role asymmetry, straight from FigaroCore's star shape:
 *  - BUYER: the buyer is the buyer on EVERY order in its process
 *    (buyer == rootBuyer, FigaroCore commit invariant), so buyer rows
 *    dedupe to the ROOT commit — one row per process.
 *  - SELLER: a seller holds only its OWN order(s); nodes are co-equal,
 *    so a seller of a sub-order in someone else's process still sees its
 *    order — one row per committed order, no root filter.
 *
 * Diverges from `useWalletProcessIds` by carrying order metadata so the
 * row can render counterparty + payment without a second indexer call.
 */

import { useCallback, useEffect, useState } from "react";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { OrderState, type Address, type Order } from "@figaro-protocol/sdk";
import { projectProcessGraph, walletRecord } from "@figaro-protocol/sdk/derive";
import { getCoreEvents, useWatchOrderEvents } from "@/lib/kernel/indexer";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { PENDING, readNetwork, type NetworkRead } from "@/lib/shared/networkRead";

/** The two roles in a Figaro order commitment. */
export type PartyRole = "buyer" | "seller";

/** One order's id + state inside a wallet-scoped process summary. */
interface OrderStub {
    id: string;
    state: OrderState;
}

/** A wallet-scoped process rollup derived from OrderCommitted/OrderResolved
 *  events — produced by `useWalletProcessIds`, consumed by the semantic model. */
export interface ProcessSummary {
    processId: string;
    orderCount: number;
    hasActive: boolean;
    createdAt: number;
    orders: OrderStub[];
}

export interface ProcessRow {
    processId: string;
    rootOrderHash: string;
    counterparty: string;
    payment: bigint;
    currency: string;
    blockNumber: number;
    isResolved: boolean;
}

/**
 * Reads the connected wallet's commitments filtered by role. For
 * `role: "buyer"` returns one row per process where the wallet is the
 * rootBuyer (the root commit). For `role: "seller"` returns one row per
 * committed order the wallet sells — root or sub-order alike. The rows are a
 * `NetworkRead`: `absent` when the order read failed, never `[]`.
 */
export function useWalletProcessRows(role: PartyRole, subject?: `0x${string}`): {
    read: NetworkRead<ProcessRow[]>;
} {
    // The rows of an address. The connected wallet's by default; any address
    // when a reader names one — every order is public, and reading needs no wallet.
    const { address: connected } = useAccount();
    const address = subject ?? connected;
    const publicClient = usePublicClient();
    const chainId = useChainId();
    const [read, setRead] = useState<NetworkRead<ProcessRow[]>>(PENDING);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (!address || !publicClient || !chainId) {
            setRead(PENDING);
            return;
        }
        let canceled = false;

        void readNetwork("useWalletProcessRows", async () => {
            // The SDK fold — the same one `/data/explore` answers wallet
            // history with — fed from the cached logs; only the row
            // mapping below is this hook's own.
            const { events } = await getCoreEvents(publicClient, chainId);
            const graph = projectProcessGraph(events);
            const record = walletRecord(graph, address as Address);

            const toRow = (order: Order, counterpartyOf: (o: Order) => string): ProcessRow => ({
                processId: order.processId,
                rootOrderHash: order.orderHash,
                counterparty: counterpartyOf(order),
                payment: order.payment,
                currency: order.currency,
                blockNumber: order.blockNumber,
                isResolved: order.state === OrderState.Resolved,
            });

            // BUYER rows dedupe to the root commit — the buyer is buyer
            // on every order in its process (star shape), so the
            // fold's per-root-buyer processes give one row each. Root
            // detection within the process: cumulativeValue == payment
            // iff this is the root commit (FigaroCore.sol:177; every
            // sub-order accumulates parent + payment > payment).
            // SELLER rows are per-order: a seller holds only its own
            // order(s), and a sub-order seller in someone else's process
            // must still see what it is fulfilling — no root filter.
            const built: ProcessRow[] = role === "buyer"
                ? record.processesAsRootBuyer.flatMap((process) => {
                    const root = [...process.orders.values()].find(
                        (o) => o.cumulativeValue === o.payment,
                    );
                    return root ? [toRow(root, (o) => o.seller)] : [];
                })
                : record.ordersAsSeller.map((o) => toRow(o, (order) => order.buyer));
            built.sort((a, b) => b.blockNumber - a.blockNumber);
            return built;
        }).then((next) => {
            if (!canceled) setRead(next);
        });

        return () => { canceled = true; };
    }, [address, publicClient, chainId, role, tick]);

    // Re-fetch on new commits / resolutions, from every order emitter.
    // `onEvents` is reference-stable so the watcher is created once: a
    // filter created after the block that carried the event never reports
    // it — exactly a commit performed on this page (accept on /orders).
    const bump = useCallback(() => setTick((t) => t + 1), []);
    useWatchOrderEvents(bump, !!address && !!CONTRACTS.core);

    return { read };
}

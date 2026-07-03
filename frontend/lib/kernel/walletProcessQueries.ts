"use client";

/**
 * Role-aware process queries. The `/orders` page calls this for BOTH roles
 * (buyer and seller) and merges the rows into one actor-neutral list — every
 * order the wallet is on. One row per commitment the wallet holds in a given
 * role, plus that order's metadata (counterparty, payment, currency, status).
 *
 * Role asymmetry, straight from the kernel's star shape:
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
import { useAccount, useChainId, usePublicClient, useWatchContractEvent } from "wagmi";
import {
    getAllOrderCommitted,
    getAllOrderResolved,
    getOrderCommittedByBuyer,
    getOrderCommittedBySeller,
} from "@/lib/kernel/indexer";
import { CONTRACTS, CORE_ABI } from "@/lib/kernel/contracts";
import type { OrderState } from "@/lib/kernel/store";

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

type CommittedLog = Awaited<ReturnType<typeof getAllOrderCommitted>>[number];

function arg(log: CommittedLog, key: string): string {
    const value = (log.args ?? {} as Record<string, unknown>)[key];
    return typeof value === "string" ? value : "";
}

function bigintArg(log: CommittedLog, key: string): bigint {
    const value = (log.args ?? {} as Record<string, unknown>)[key];
    if (typeof value === "bigint") return value;
    if (typeof value === "number" || typeof value === "string") return BigInt(value);
    return 0n;
}

/**
 * Reads the connected wallet's commitments filtered by role. For
 * `role: "buyer"` returns one row per process where the wallet is the
 * rootBuyer (the root commit). For `role: "seller"` returns one row per
 * committed order the wallet sells — root or sub-order alike.
 */
export function useWalletProcessRows(role: PartyRole): {
    rows: ProcessRow[];
    isLoading: boolean;
} {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const chainId = useChainId();
    const [rows, setRows] = useState<ProcessRow[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (!address || !publicClient || !chainId) {
            setRows([]);
            return;
        }
        let cancelled = false;
        setIsLoading(true);

        (async () => {
            try {
                const fetcher = role === "buyer"
                    ? getOrderCommittedByBuyer
                    : getOrderCommittedBySeller;
                const allRoleLogs = await fetcher(publicClient, chainId, address);
                if (cancelled) return;

                // BUYER rows dedupe to the root commit — the buyer is buyer
                // on every order in its process (kernel star shape), so
                // without this filter each sub-order would add a duplicate
                // row for the same process. Root detection: cumulativeValue
                // == payment iff this is the root commit (FigaroCore.sol:177;
                // every sub-order accumulates parent + payment > payment).
                // SELLER rows are per-order: a seller holds only its own
                // order(s), and a sub-order seller in someone else's process
                // must still see what it is fulfilling — no root filter.
                const roleLogs = role === "buyer"
                    ? allRoleLogs.filter(
                        (log) => bigintArg(log, "cumulativeValue") === bigintArg(log, "payment"),
                    )
                    : allRoleLogs;
                if (roleLogs.length === 0) {
                    if (!cancelled) setRows([]);
                    return;
                }

                // Resolved-state map covers each order we care about.
                const allResolved = await getAllOrderResolved(publicClient, chainId);
                if (cancelled) return;
                const resolvedSet = new Set(
                    allResolved.map((log) => arg(log, "orderHash")).filter(Boolean),
                );

                const built: ProcessRow[] = roleLogs.map((log) => ({
                    processId: arg(log, "processId"),
                    rootOrderHash: arg(log, "orderHash"),
                    counterparty: arg(log, role === "buyer" ? "seller" : "buyer"),
                    payment: bigintArg(log, "payment"),
                    currency: arg(log, "currency"),
                    blockNumber: Number(log.blockNumber ?? 0),
                    isResolved: resolvedSet.has(arg(log, "orderHash")),
                }));
                built.sort((a, b) => b.blockNumber - a.blockNumber);
                if (!cancelled) setRows(built);
            } catch (cause) {
                console.warn("[useWalletProcessRows] fetch failed", cause);
                if (!cancelled) setRows([]);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [address, publicClient, chainId, role, tick]);

    // Re-fetch on new commits / resolutions for the connected wallet.
    // `onLogs` MUST be reference-stable: wagmi's useWatchContractEvent keys its
    // effect on it, so an inline arrow tears down and recreates the event
    // filter on every render — a filter created after the block that carried
    // the event never reports it, and an instance torn down before its first
    // poll reports nothing. That gap is exactly a commit performed on this
    // page (accept on /orders): the row never appeared without a reload.
    const bump = useCallback(() => setTick((t) => t + 1), []);
    const realEnabled = !!address && !!CONTRACTS.core;
    useWatchContractEvent({
        address: (CONTRACTS.core as `0x${string}` | undefined),
        abi: CORE_ABI,
        eventName: "OrderCommitted",
        onLogs: bump,
        enabled: realEnabled,
    });
    useWatchContractEvent({
        address: (CONTRACTS.core as `0x${string}` | undefined),
        abi: CORE_ABI,
        eventName: "OrderResolved",
        onLogs: bump,
        enabled: realEnabled,
    });

    return { rows, isLoading };
}

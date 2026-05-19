"use client";

/**
 * Role-aware process queries used by `/orders` (buyer surface) and
 * `/inbox` (merchant surface). Both pages need the same shape: one row
 * per process the connected wallet initiated in a given role, plus the
 * root order's metadata (counterparty, payment, currency, status).
 *
 * Diverges from `useWalletProcessIds` in two ways:
 *  1. Strict role filter (this wallet is the *root* buyer or seller, not
 *     a participant in a sub-order under someone else's process).
 *  2. Carries root-order metadata so the row can render counterparty +
 *     payment without a second indexer call.
 *
 * Root-order detection: in FigaroCore the root commit's `processId`
 * equals its own `orderHash`. Sub-orders inherit the root's processId.
 */

import { useEffect, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWatchContractEvent } from "wagmi";
import {
    getAllOrderCommitted,
    getAllOrderResolved,
    getOrderCommittedByBuyer,
    getOrderCommittedBySeller,
} from "@/lib/core/indexer";
import { CONTRACTS, CORE_ABI } from "@/lib/core/contracts";

/** The two roles in a Figaro order commitment. */
export type PartyRole = "buyer" | "seller";

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
 * Reads the connected wallet's processes filtered by role. For
 * `role: "buyer"` returns processes where the wallet is the rootBuyer.
 * For `role: "seller"` returns processes where the wallet is the
 * seller-of-record on the root commit.
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

                // Root-order filter: cumulativeValue == payment iff this is
                // the root commit. Per FigaroCore.sol's commit() path, a
                // root passes `expectedCumulativeValue == payment` (line 177)
                // while every sub-order has `cumulativeValue = parent +
                // payment > payment` (line 191). A pre-V5 version of this
                // filter compared processId === orderHash; that was correct
                // when orderHash was the EIP-712 digest, but V5 derives
                // orderHash = keccak256(processId || structHash) so the
                // two are never equal — that filter returned an empty list
                // for every wallet.
                const rootLogs = allRoleLogs.filter(
                    (log) => bigintArg(log, "cumulativeValue") === bigintArg(log, "payment"),
                );
                if (rootLogs.length === 0) {
                    if (!cancelled) setRows([]);
                    return;
                }

                // Resolved-state map covers each root we care about.
                const allResolved = await getAllOrderResolved(publicClient, chainId);
                if (cancelled) return;
                const resolvedSet = new Set(
                    allResolved.map((log) => arg(log, "orderHash")).filter(Boolean),
                );

                const built: ProcessRow[] = rootLogs.map((log) => ({
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
    const realEnabled = !!address && !!CONTRACTS.core;
    useWatchContractEvent({
        address: (CONTRACTS.core as `0x${string}` | undefined),
        abi: CORE_ABI,
        eventName: "OrderCommitted",
        onLogs: () => setTick((t) => t + 1),
        enabled: realEnabled,
    });
    useWatchContractEvent({
        address: (CONTRACTS.core as `0x${string}` | undefined),
        abi: CORE_ABI,
        eventName: "OrderResolved",
        onLogs: () => setTick((t) => t + 1),
        enabled: realEnabled,
    });

    return { rows, isLoading };
}

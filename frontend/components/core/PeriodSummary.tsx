"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { formatUnits } from "viem";
import {
    getAllOrderResolved,
    getOrderCommittedByBuyer,
    getOrderCommittedBySeller,
} from "@/lib/core/indexer";
import { calculateBonds } from "@figaro/core";

interface OrderEvent {
    orderHash: string;
    buyer: string;
    seller: string;
    currency: string;
    payment: bigint;
    cumulativeValue: bigint;
    timestamp: number;
    role: "buyer" | "seller";
}

interface ResolvedEvent {
    orderHash: string;
    sellerPayout: bigint;
    buyerPayout: bigint;
    timestamp: number;
}

interface CurrencySummary {
    currency: string;
    asBuyer: {
        created: number;
        resolved: number;
        active: number;
        totalPaymentCommitted: bigint;
        totalBuyerPayout: bigint;
        totalLockedBond: bigint;
    };
    asSeller: {
        created: number;
        resolved: number;
        active: number;
        totalIncomeEarned: bigint;
        totalSellerPayout: bigint;
        totalLockedBond: bigint;
    };
}

interface OrderDetail {
    orderHash: string;
    role: "buyer" | "seller";
    currency: string;
    payment: bigint;
    state: "Resolved" | "Active";
    payout: bigint;
    timestamp: number;
    resolvedTimestamp: number;
}

function startOfDay(dateStr: string): number {
    return Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000);
}

function endOfDay(dateStr: string): number {
    return Math.floor(new Date(`${dateStr}T23:59:59Z`).getTime() / 1000);
}

function fmt(value: bigint, decimals = 18): string {
    return Number(formatUnits(value, decimals)).toFixed(6);
}

function shortAddr(addr: string): string {
    return addr.length >= 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

async function getBlockTimestamp(
    client: NonNullable<ReturnType<typeof usePublicClient>>,
    blockNumber: bigint,
    cache: Map<string, number>,
): Promise<number> {
    const key = blockNumber.toString();
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const block = await client.getBlock({ blockNumber });
    const timestamp = Number(block.timestamp);
    cache.set(key, timestamp);
    return timestamp;
}

export function PeriodSummary() {
    const { address } = useAccount();
    const publicClient = usePublicClient();

    const today = new Date().toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000)
        .toISOString()
        .slice(0, 10);

    const [fromDate, setFromDate] = useState(thirtyDaysAgo);
    const [toDate, setToDate] = useState(today);
    const [loading, setLoading] = useState(false);
    const [summaries, setSummaries] = useState<CurrencySummary[]>([]);
    const [orderDetails, setOrderDetails] = useState<OrderDetail[]>([]);
    const [totalOrders, setTotalOrders] = useState(0);

    const loadData = useCallback(async () => {
        if (!publicClient || !address) return;

        setLoading(true);
        try {
            const chainId = publicClient.chain?.id ?? 31337;
            const fromTs = startOfDay(fromDate);
            const toTs = endOfDay(toDate);

            const [buyerLogs, sellerLogs, resolvedLogs] = await Promise.all([
                getOrderCommittedByBuyer(publicClient, chainId, address),
                getOrderCommittedBySeller(publicClient, chainId, address),
                getAllOrderResolved(publicClient, chainId),
            ]);

            const timestampCache = new Map<string, number>();
            await Promise.all(
                [...buyerLogs, ...sellerLogs, ...resolvedLogs]
                    .map((log) => log.blockNumber)
                    .filter((blockNumber): blockNumber is bigint => typeof blockNumber === "bigint")
                    .map((blockNumber) => getBlockTimestamp(publicClient, blockNumber, timestampCache)),
            );

            const resolvedMap = new Map<string, ResolvedEvent>();
            for (const log of resolvedLogs) {
                const args = log.args as Partial<{
                    orderHash: string;
                    sellerPayout: bigint;
                    buyerPayout: bigint;
                }>;
                const orderHash = args.orderHash as string | undefined;
                if (!orderHash) continue;

                resolvedMap.set(orderHash, {
                    orderHash,
                    sellerPayout: BigInt(args.sellerPayout ?? 0),
                    buyerPayout: BigInt(args.buyerPayout ?? 0),
                    timestamp:
                        typeof log.blockNumber === "bigint"
                            ? timestampCache.get(log.blockNumber.toString()) ?? 0
                            : 0,
                });
            }

            const ordersMap = new Map<string, OrderEvent>();
            const ingest = (
                logs: Awaited<ReturnType<typeof getOrderCommittedByBuyer>>,
                role: "buyer" | "seller",
            ) => {
                for (const log of logs) {
                    const args = log.args as Partial<{
                        orderHash: string;
                        payment: bigint;
                        cumulativeValue: bigint;
                        buyer: string;
                        seller: string;
                        currency: string;
                        processId: string;
                    }>;
                    const orderHash = args.orderHash as string | undefined;
                    if (!orderHash || ordersMap.has(orderHash)) continue;

                    const timestamp =
                        typeof log.blockNumber === "bigint"
                            ? timestampCache.get(log.blockNumber.toString()) ?? 0
                            : 0;
                    if (timestamp < fromTs || timestamp > toTs) continue;

                    ordersMap.set(orderHash, {
                        orderHash,
                        buyer: args.buyer ?? "",
                        seller: args.seller ?? "",
                        currency: args.currency ?? "",
                        payment: BigInt(args.payment ?? 0),
                        cumulativeValue: BigInt(args.cumulativeValue ?? 0),
                        timestamp,
                        role,
                    });
                }
            };

            ingest(buyerLogs, "buyer");
            ingest(sellerLogs, "seller");

            const currencyMap = new Map<string, CurrencySummary>();
            const details: OrderDetail[] = [];

            for (const order of ordersMap.values()) {
                const settlement = resolvedMap.get(order.orderHash);
                const bonds = calculateBonds(order.cumulativeValue, order.payment);
                const summary = currencyMap.get(order.currency) ?? {
                    currency: order.currency,
                    asBuyer: {
                        created: 0,
                        resolved: 0,
                        active: 0,
                        totalPaymentCommitted: 0n,
                        totalBuyerPayout: 0n,
                        totalLockedBond: 0n,
                    },
                    asSeller: {
                        created: 0,
                        resolved: 0,
                        active: 0,
                        totalIncomeEarned: 0n,
                        totalSellerPayout: 0n,
                        totalLockedBond: 0n,
                    },
                };

                if (order.role === "buyer") {
                    summary.asBuyer.created += 1;
                    summary.asBuyer.totalPaymentCommitted += order.payment;
                    if (settlement) {
                        summary.asBuyer.resolved += 1;
                        summary.asBuyer.totalBuyerPayout += settlement.buyerPayout;
                    } else {
                        summary.asBuyer.active += 1;
                        summary.asBuyer.totalLockedBond += bonds.buyerBond;
                    }
                } else {
                    summary.asSeller.created += 1;
                    if (settlement) {
                        summary.asSeller.resolved += 1;
                        summary.asSeller.totalIncomeEarned += order.payment;
                        summary.asSeller.totalSellerPayout += settlement.sellerPayout;
                    } else {
                        summary.asSeller.active += 1;
                        summary.asSeller.totalLockedBond += bonds.sellerBond;
                    }
                }

                currencyMap.set(order.currency, summary);
                details.push({
                    orderHash: order.orderHash,
                    role: order.role,
                    currency: order.currency,
                    payment: order.payment,
                    state: settlement ? "Resolved" : "Active",
                    payout:
                        settlement
                            ? order.role === "seller"
                                ? settlement.sellerPayout
                                : settlement.buyerPayout
                            : 0n,
                    timestamp: order.timestamp,
                    resolvedTimestamp: settlement?.timestamp ?? 0,
                });
            }

            setSummaries(Array.from(currencyMap.values()));
            setOrderDetails(details.sort((left, right) => right.timestamp - left.timestamp));
            setTotalOrders(ordersMap.size);
        } catch (cause) {
            console.error("PeriodSummary: failed to load", cause);
        } finally {
            setLoading(false);
        }
    }, [address, fromDate, publicClient, toDate]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const exportCSV = () => {
        const header = [
            "Order Hash",
            "Role",
            "Currency",
            "Payment",
            "State",
            "Payout",
            "Created",
            "Resolved",
        ].join(",");
        const rows = orderDetails.map((detail) => [
            detail.orderHash,
            detail.role,
            detail.currency,
            fmt(detail.payment),
            detail.state,
            detail.payout > 0n ? fmt(detail.payout) : "",
            detail.timestamp > 0 ? new Date(detail.timestamp * 1000).toISOString() : "",
            detail.resolvedTimestamp > 0 ? new Date(detail.resolvedTimestamp * 1000).toISOString() : "",
        ].join(","));

        const blob = new Blob([[header, ...rows].join("\n")], {
            type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `figaro-settlement-${fromDate}-to-${toDate}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    if (!address) {
        return (
            <div className="py-12 text-center text-neutral-500">
                Connect your wallet to view your settlement history.
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end gap-4">
                <div>
                    <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">From</label>
                    <input
                        type="date"
                        value={fromDate}
                        onChange={(event) => setFromDate(event.target.value)}
                        className="rounded border border-neutral-300 px-3 py-2 text-sm text-black"
                    />
                </div>
                <div>
                    <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">To</label>
                    <input
                        type="date"
                        value={toDate}
                        onChange={(event) => setToDate(event.target.value)}
                        className="rounded border border-neutral-300 px-3 py-2 text-sm text-black"
                    />
                </div>
                <button
                    onClick={() => void loadData()}
                    disabled={loading}
                    className="rounded bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                    {loading ? "Loading…" : "Refresh"}
                </button>
                {orderDetails.length > 0 && (
                    <button
                        onClick={exportCSV}
                        className="rounded border border-neutral-300 px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-50"
                    >
                        Export CSV
                    </button>
                )}
            </div>

            <p className="font-mono text-xs text-neutral-500">{address}</p>

            {loading && <div className="py-8 text-center text-neutral-500">Loading settlement data…</div>}

            {!loading && totalOrders === 0 && (
                <div className="py-8 text-center text-neutral-500">
                    No orders found for this wallet in the selected period.
                </div>
            )}

            {!loading && summaries.map((summary) => (
                <div
                    key={summary.currency}
                    className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5"
                >
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
                            Currency: {shortAddr(summary.currency)}
                        </h3>
                        <span className="font-mono text-xs text-neutral-500">{summary.currency}</span>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2 rounded border border-blue-200 bg-blue-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">As Buyer</p>
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <StatBox label="Created" value={summary.asBuyer.created.toString()} />
                                <StatBox label="Resolved" value={summary.asBuyer.resolved.toString()} />
                                <StatBox label="Active" value={summary.asBuyer.active.toString()} />
                            </div>
                            <div className="space-y-1 text-sm">
                                <Row label="Payment committed" value={`${fmt(summary.asBuyer.totalPaymentCommitted)} tokens`} />
                                <Row label="Bond returned" value={`${fmt(summary.asBuyer.totalBuyerPayout)} tokens`} />
                                <Row label="Bond still locked" value={`${fmt(summary.asBuyer.totalLockedBond)} tokens`} />
                                <Row label="Final spend" value={`${fmt(summary.asBuyer.totalPaymentCommitted)} tokens`} bold />
                            </div>
                        </div>

                        <div className="space-y-2 rounded border border-green-200 bg-green-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-green-700">As Seller</p>
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <StatBox label="Created" value={summary.asSeller.created.toString()} />
                                <StatBox label="Resolved" value={summary.asSeller.resolved.toString()} />
                                <StatBox label="Active" value={summary.asSeller.active.toString()} />
                            </div>
                            <div className="space-y-1 text-sm">
                                <Row label="Income earned" value={`${fmt(summary.asSeller.totalIncomeEarned)} tokens`} />
                                <Row label="Payout received" value={`${fmt(summary.asSeller.totalSellerPayout)} tokens`} />
                                <Row label="Bond still locked" value={`${fmt(summary.asSeller.totalLockedBond)} tokens`} />
                                <Row label="Net income" value={`${fmt(summary.asSeller.totalIncomeEarned)} tokens`} bold />
                            </div>
                        </div>
                    </div>
                </div>
            ))}

            {!loading && orderDetails.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-neutral-200">
                    <table className="w-full text-sm">
                        <thead className="border-b border-neutral-200 bg-neutral-50">
                            <tr className="text-xs uppercase tracking-wide text-neutral-500">
                                <th scope="col" className="px-4 py-2 text-left">Order</th>
                                <th scope="col" className="px-4 py-2 text-left">Role</th>
                                <th scope="col" className="px-4 py-2 text-left">State</th>
                                <th scope="col" className="px-4 py-2 text-right">Payment</th>
                                <th scope="col" className="px-4 py-2 text-right">Payout</th>
                                <th scope="col" className="px-4 py-2 text-left">Created</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {orderDetails.map((detail) => (
                                <tr key={`${detail.orderHash}-${detail.role}`} className="hover:bg-neutral-50">
                                    <td className="px-4 py-2 font-mono text-xs">{shortAddr(detail.orderHash)}</td>
                                    <td className="px-4 py-2">
                                        <span
                                            className={`rounded px-1.5 py-0.5 text-xs font-semibold ${detail.role === "buyer"
                                                ? "bg-blue-100 text-blue-700"
                                                : "bg-green-100 text-green-700"
                                                }`}
                                        >
                                            {detail.role}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2">
                                        <span
                                            className={`rounded px-1.5 py-0.5 text-xs ${detail.state === "Resolved"
                                                ? "bg-green-100 text-green-700"
                                                : "bg-amber-100 text-amber-700"
                                                }`}
                                        >
                                            {detail.state}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 text-right font-mono">{fmt(detail.payment)}</td>
                                    <td className="px-4 py-2 text-right font-mono">
                                        {detail.payout > 0n ? fmt(detail.payout) : "—"}
                                    </td>
                                    <td className="px-4 py-2 text-xs text-neutral-500">
                                        {detail.timestamp > 0
                                            ? new Date(detail.timestamp * 1000).toLocaleDateString()
                                            : "—"}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function StatBox({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-lg font-bold text-black">{value}</p>
            <p className="text-xs text-neutral-500">{label}</p>
        </div>
    );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
    return (
        <div className="flex justify-between">
            <span className={`text-neutral-600 ${bold ? "font-semibold" : ""}`}>{label}</span>
            <span className={`text-neutral-900 ${bold ? "font-bold" : ""}`}>{value}</span>
        </div>
    );
}

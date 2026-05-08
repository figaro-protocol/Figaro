"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { formatUnits } from "viem";
import {
    getAllOrderCommitted,
    getAllOrderResolved,
} from "@/lib/core/indexer";
import { calculateBonds } from "@figaro/core";
import { truncateHex } from "@/lib/shared/formatHex";

interface OrderRow {
    orderHash: string;
    buyer: string;
    seller: string;
    currency: string;
    payment: bigint;
    cumulativeValue: bigint;
    state: "Active" | "Resolved";
    sellerPayout: bigint;
    buyerPayout: bigint;
    createdTimestamp: number;
    resolvedTimestamp: number;
    isRoot: boolean;
}

interface ProcessReport {
    processId: string;
    rootOrderHash: string;
    currency: string;
    orders: OrderRow[];
    totalPayment: bigint;
    totalSellerPayout: bigint;
    totalBuyerPayout: bigint;
    totalBondsLocked: bigint;
    resolvedCount: number;
    activeCount: number;
    subOrderCount: number;
}

interface Props {
    processId?: string;
}

function fmt(value: bigint, decimals = 18): string {
    return Number(formatUnits(value, decimals)).toFixed(6);
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

export function ProcessSettlementReport({ processId: initialProcessId }: Props) {
    const { address } = useAccount();
    const publicClient = usePublicClient();

    const [processId, setProcessId] = useState(initialProcessId ?? "");
    const [report, setReport] = useState<ProcessReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadReport = useCallback(async () => {
        if (!publicClient || !processId.trim()) return;

        setLoading(true);
        setError(null);

        try {
            const chainId = publicClient.chain?.id ?? 31337;
            const pid = processId.trim();

            const [createdAll, resolvedAll] = await Promise.all([
                getAllOrderCommitted(publicClient, chainId),
                getAllOrderResolved(publicClient, chainId),
            ]);

            const created = createdAll.filter(
                (log) => (log.args as Partial<{ processId: string }>).processId === pid,
            );
            if (created.length === 0) {
                setReport(null);
                setError("No orders found for this process ID.");
                return;
            }

            const resolved = resolvedAll.filter(
                (log) => (log.args as Partial<{ processId: string }>).processId === pid,
            );
            const timestampCache = new Map<string, number>();

            await Promise.all(
                [...created, ...resolved]
                    .map((log) => log.blockNumber)
                    .filter((blockNumber): blockNumber is bigint => typeof blockNumber === "bigint")
                    .map((blockNumber) => getBlockTimestamp(publicClient, blockNumber, timestampCache)),
            );

            const resolvedMap = new Map<string, { sellerPayout: bigint; buyerPayout: bigint; timestamp: number }>();
            for (const log of resolved) {
                const args = log.args as Partial<{
                    orderHash: string;
                    sellerPayout: bigint;
                    buyerPayout: bigint;
                }>;
                const orderHash = args.orderHash as string | undefined;
                if (!orderHash) continue;

                resolvedMap.set(orderHash, {
                    sellerPayout: BigInt(args.sellerPayout ?? 0),
                    buyerPayout: BigInt(args.buyerPayout ?? 0),
                    timestamp:
                        typeof log.blockNumber === "bigint"
                            ? timestampCache.get(log.blockNumber.toString()) ?? 0
                            : 0,
                });
            }

            const orders: OrderRow[] = created
                .map((log) => {
                    const args = log.args as Partial<{
                        orderHash: string;
                        payment: bigint;
                        cumulativeValue: bigint;
                        buyer: string;
                        seller: string;
                        currency: string;
                    }>;
                    const orderHash = args.orderHash as string | undefined;
                    if (!orderHash) return null;

                    const payment = BigInt(args.payment ?? 0);
                    const cumulativeValue = BigInt(args.cumulativeValue ?? 0);
                    const settlement = resolvedMap.get(orderHash);

                    return {
                        orderHash,
                        buyer: args.buyer ?? "",
                        seller: args.seller ?? "",
                        currency: args.currency ?? "",
                        payment,
                        cumulativeValue,
                        state: settlement ? "Resolved" : "Active",
                        sellerPayout: settlement?.sellerPayout ?? 0n,
                        buyerPayout: settlement?.buyerPayout ?? 0n,
                        createdTimestamp:
                            typeof log.blockNumber === "bigint"
                                ? timestampCache.get(log.blockNumber.toString()) ?? 0
                                : 0,
                        resolvedTimestamp: settlement?.timestamp ?? 0,
                        isRoot: cumulativeValue === payment,
                    } satisfies OrderRow;
                })
                .filter((order): order is OrderRow => order !== null)
                .sort((left, right) => left.createdTimestamp - right.createdTimestamp);

            const rootOrder = orders.find((order) => order.isRoot) ?? orders[0];

            let totalPayment = 0n;
            let totalSellerPayout = 0n;
            let totalBuyerPayout = 0n;
            let totalBondsLocked = 0n;
            let resolvedCount = 0;
            let activeCount = 0;

            for (const order of orders) {
                totalPayment += order.payment;
                totalSellerPayout += order.sellerPayout;
                totalBuyerPayout += order.buyerPayout;
                const bonds = calculateBonds(order.cumulativeValue, order.payment);
                totalBondsLocked += bonds.buyerBond + bonds.sellerBond;
                if (order.state === "Resolved") resolvedCount += 1;
                else activeCount += 1;
            }

            setReport({
                processId: pid,
                rootOrderHash: rootOrder?.orderHash ?? "",
                currency: rootOrder?.currency ?? orders[0]?.currency ?? "",
                orders,
                totalPayment,
                totalSellerPayout,
                totalBuyerPayout,
                totalBondsLocked,
                resolvedCount,
                activeCount,
                subOrderCount: Math.max(orders.length - 1, 0),
            });
        } catch (cause) {
            console.error("ProcessSettlementReport: failed", cause);
            setReport(null);
            setError("Failed to load process data.");
        } finally {
            setLoading(false);
        }
    }, [publicClient, processId]);

    useEffect(() => {
        if (initialProcessId) {
            void loadReport();
        }
    }, [initialProcessId, loadReport]);

    const exportCSV = () => {
        if (!report) return;

        const header = [
            "Order Hash",
            "Kind",
            "State",
            "Buyer",
            "Seller",
            "Payment",
            "Cumulative Value",
            "Seller Payout",
            "Buyer Payout",
            "Created",
            "Resolved",
        ].join(",");

        const rows = report.orders.map((order) => [
            order.orderHash,
            order.isRoot ? "Root" : "Sub-order",
            order.state,
            order.buyer,
            order.seller,
            fmt(order.payment),
            fmt(order.cumulativeValue),
            order.sellerPayout > 0n ? fmt(order.sellerPayout) : "",
            order.buyerPayout > 0n ? fmt(order.buyerPayout) : "",
            order.createdTimestamp > 0 ? new Date(order.createdTimestamp * 1000).toISOString() : "",
            order.resolvedTimestamp > 0 ? new Date(order.resolvedTimestamp * 1000).toISOString() : "",
        ].join(","));

        const blob = new Blob([[header, ...rows].join("\n")], {
            type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `figaro-process-${report.processId.slice(0, 10)}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6">
            {!initialProcessId && (
                <div className="flex items-end gap-3">
                    <div className="flex-1">
                        <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">
                            Process ID (bytes32)
                        </label>
                        <input
                            type="text"
                            value={processId}
                            onChange={(event) => setProcessId(event.target.value)}
                            placeholder="0x..."
                            className="w-full rounded border border-neutral-300 px-3 py-2 font-mono text-sm text-black"
                        />
                    </div>
                    <button
                        onClick={() => void loadReport()}
                        disabled={loading || !processId.trim()}
                        className="rounded bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    >
                        {loading ? "Loading…" : "Load Process"}
                    </button>
                </div>
            )}

            {loading && <div className="py-8 text-center text-neutral-500">Loading process data…</div>}
            {error && <div className="py-8 text-center text-red-600">{error}</div>}

            {report && !loading && (
                <>
                    <div className="rounded-lg border border-neutral-200 bg-white p-5">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-bold text-black">Process Settlement Report</h3>
                                <p className="mt-1 break-all font-mono text-xs text-neutral-500">
                                    {report.processId}
                                </p>
                            </div>
                            <button
                                onClick={exportCSV}
                                className="rounded border border-neutral-300 px-3 py-1.5 text-sm font-semibold text-black hover:bg-neutral-50"
                            >
                                Export CSV
                            </button>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <MetricCard label="Total Orders" value={report.orders.length.toString()} />
                            <MetricCard label="Sub-orders" value={report.subOrderCount.toString()} />
                            <MetricCard label="Resolved" value={report.resolvedCount.toString()} />
                            <MetricCard label="Active" value={report.activeCount.toString()} />
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <MetricCard label="Root Order" value={truncateHex(report.rootOrderHash)} />
                            <MetricCard label="Currency" value={truncateHex(report.currency)} />
                            <MetricCard label="Gross Payment" value={fmt(report.totalPayment)} sub="tokens" />
                            <MetricCard label="Locked Bonds" value={fmt(report.totalBondsLocked)} sub="tokens" />
                        </div>
                    </div>

                    <div className="rounded-lg border border-neutral-200 bg-white p-5">
                        <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-700">
                            Settlement Summary
                        </h4>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <MetricCard label="Seller Payout" value={fmt(report.totalSellerPayout)} sub="bond return + income" />
                            <MetricCard label="Buyer Payout" value={fmt(report.totalBuyerPayout)} sub="bond return" />
                            <MetricCard label="Seller Income" value={fmt(report.totalPayment)} sub="net value transfer" />
                            <MetricCard label="Buyer Spend" value={fmt(report.totalPayment)} sub="final economic spend" />
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-neutral-200">
                        <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3">
                            <h4 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
                                Orders ({report.orders.length})
                            </h4>
                        </div>
                        <table className="w-full text-sm">
                            <thead className="border-b border-neutral-200 bg-neutral-50">
                                <tr className="text-xs uppercase tracking-wide text-neutral-500">
                                    <th scope="col" className="px-4 py-2 text-left">Order</th>
                                    <th scope="col" className="px-4 py-2 text-left">Kind</th>
                                    <th scope="col" className="px-4 py-2 text-left">State</th>
                                    <th scope="col" className="px-4 py-2 text-left">Seller</th>
                                    <th scope="col" className="px-4 py-2 text-right">Payment</th>
                                    <th scope="col" className="px-4 py-2 text-right">Cumulative</th>
                                    <th scope="col" className="px-4 py-2 text-right">Seller Payout</th>
                                    <th scope="col" className="px-4 py-2 text-right">Buyer Payout</th>
                                    <th scope="col" className="px-4 py-2 text-left">Created</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {report.orders.map((order) => {
                                    const isWalletBuyer = address?.toLowerCase() === order.buyer.toLowerCase();
                                    const isWalletSeller = address?.toLowerCase() === order.seller.toLowerCase();
                                    const highlight = isWalletBuyer || isWalletSeller;

                                    return (
                                        <tr
                                            key={order.orderHash}
                                            className={highlight ? "bg-blue-50/50" : "hover:bg-neutral-50"}
                                        >
                                            <td className="px-4 py-2 font-mono text-xs">
                                                {truncateHex(order.orderHash)}
                                            </td>
                                            <td className="px-4 py-2">
                                                <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
                                                    {order.isRoot ? "Root" : "Sub-order"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2">
                                                <span
                                                    className={`rounded px-2 py-0.5 text-xs ${order.state === "Resolved"
                                                        ? "bg-green-100 text-green-700"
                                                        : "bg-amber-100 text-amber-700"
                                                        }`}
                                                >
                                                    {order.state}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2 font-mono text-xs">
                                                {truncateHex(order.seller)}
                                                {isWalletSeller && (
                                                    <span className="ml-1 text-xs text-green-600">(you)</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono">{fmt(order.payment)}</td>
                                            <td className="px-4 py-2 text-right font-mono">{fmt(order.cumulativeValue)}</td>
                                            <td className="px-4 py-2 text-right font-mono">
                                                {order.sellerPayout > 0n ? fmt(order.sellerPayout) : "—"}
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono">
                                                {order.buyerPayout > 0n ? fmt(order.buyerPayout) : "—"}
                                            </td>
                                            <td className="px-4 py-2 text-xs text-neutral-500">
                                                {order.createdTimestamp > 0
                                                    ? new Date(order.createdTimestamp * 1000).toLocaleString()
                                                    : "—"}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="py-2 text-center text-xs text-neutral-500">
                        Process settlement data derived from on-chain events. Chain {publicClient?.chain?.id ?? "—"}.
                    </div>
                </>
            )}
        </div>
    );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="rounded border border-neutral-200 bg-neutral-50 p-3 text-center">
            <p className="mb-1 text-xs text-neutral-500">{label}</p>
            <p className="text-lg font-bold text-black">{value}</p>
            {sub && <p className="text-xs text-neutral-500">{sub}</p>}
        </div>
    );
}

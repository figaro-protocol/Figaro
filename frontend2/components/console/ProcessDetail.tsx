"use client";

/**
 * ProcessDetail — Inspects the selected process.
 * Shows orders, bond accounting, and settlement breakdown.
 */

import { useFigaro } from "@/lib/console/provider";
import { calculateBonds, calculateSettlement, OrderState } from "@figaro/core";
import type { Order } from "@figaro/core";

function shortenHex(hex: string, chars = 6): string {
    if (hex.length <= chars * 2 + 2) return hex;
    return `${hex.slice(0, chars + 2)}…${hex.slice(-chars)}`;
}

function formatWei(value: bigint): string {
    const eth = Number(value) / 1e18;
    if (eth === 0) return "0";
    if (eth < 0.001) return "<0.001";
    return eth.toFixed(4);
}

function OrderRow({ order }: { order: Order }) {
    const bonds = calculateBonds(order.cumulativeValue, order.payment);
    const isActive = order.state === OrderState.Active;

    return (
        <div className={`rounded border p-3 ${isActive ? "border-zinc-700 bg-zinc-800/50" : "border-zinc-800 bg-zinc-900/50 opacity-70"
            }`}>
            <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-zinc-300">
                    {shortenHex(order.orderHash)}
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${isActive
                    ? "bg-emerald-900/50 text-emerald-400"
                    : "bg-zinc-700 text-zinc-400"
                    }`}>
                    {isActive ? "active" : "resolved"}
                </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-400">
                <div>buyer: <span className="text-zinc-300">{shortenHex(order.buyer)}</span></div>
                <div>seller: <span className="text-zinc-300">{shortenHex(order.seller)}</span></div>
                <div>payment: <span className="text-zinc-300">{formatWei(order.payment)}</span></div>
                <div>cumulative: <span className="text-zinc-300">{formatWei(order.cumulativeValue)}</span></div>
                <div>buyer bond: <span className="text-zinc-300">{formatWei(bonds.buyerBond)}</span></div>
                <div>seller bond: <span className="text-zinc-300">{formatWei(bonds.sellerBond)}</span></div>
            </div>
            {order.sellerPayout !== undefined && order.buyerPayout !== undefined && (
                <div className="mt-2 flex gap-4 text-xs text-zinc-500">
                    <span>seller payout: {formatWei(order.sellerPayout)}</span>
                    <span>buyer payout: {formatWei(order.buyerPayout)}</span>
                </div>
            )}
        </div>
    );
}

export function ProcessDetail() {
    const { selectedProcess } = useFigaro();

    if (!selectedProcess) {
        return (
            <div className="flex h-full items-center justify-center p-8 text-sm text-zinc-500">
                Select a process to inspect.
            </div>
        );
    }

    const orders = [...selectedProcess.orders.values()].sort(
        (a, b) => a.blockNumber - b.blockNumber,
    );

    const totalPayment = orders.reduce((s, o) => s + o.payment, 0n);
    const totalBuyerBond = orders.reduce((s, o) => s + calculateBonds(o.cumulativeValue, o.payment).buyerBond, 0n);
    const totalSellerBond = orders.reduce((s, o) => s + calculateBonds(o.cumulativeValue, o.payment).sellerBond, 0n);

    return (
        <div className="flex flex-col gap-4 p-2">
            <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-4">
                <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                    Process
                </h3>
                <p className="mt-1 font-mono text-sm text-zinc-200">
                    {shortenHex(selectedProcess.processId, 10)}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-4 text-xs">
                    <div>
                        <span className="text-zinc-500">Status</span>
                        <p className={`mt-0.5 font-medium ${selectedProcess.resolved ? "text-zinc-400" : "text-emerald-400"
                            }`}>
                            {selectedProcess.resolved ? "Resolved" : "Active"}
                        </p>
                    </div>
                    <div>
                        <span className="text-zinc-500">Orders</span>
                        <p className="mt-0.5 text-zinc-200">{orders.length}</p>
                    </div>
                    <div>
                        <span className="text-zinc-500">Cumulative Value</span>
                        <p className="mt-0.5 text-zinc-200">{formatWei(selectedProcess.cumulativeValue)}</p>
                    </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-4 text-xs">
                    <div>
                        <span className="text-zinc-500">Total Payment</span>
                        <p className="mt-0.5 text-zinc-200">{formatWei(totalPayment)}</p>
                    </div>
                    <div>
                        <span className="text-zinc-500">Total Buyer Bond</span>
                        <p className="mt-0.5 text-zinc-200">{formatWei(totalBuyerBond)}</p>
                    </div>
                    <div>
                        <span className="text-zinc-500">Total Seller Bond</span>
                        <p className="mt-0.5 text-zinc-200">{formatWei(totalSellerBond)}</p>
                    </div>
                </div>
                <div className="mt-3 text-xs text-zinc-500">
                    Buyer: <span className="text-zinc-300">{shortenHex(selectedProcess.rootBuyer)}</span>
                    {" · "}
                    Currency: <span className="text-zinc-300">{shortenHex(selectedProcess.currency)}</span>
                </div>
            </div>

            <div className="flex flex-col gap-2">
                <h3 className="px-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
                    Orders ({orders.length})
                </h3>
                {orders.map((order) => (
                    <OrderRow key={order.orderHash} order={order} />
                ))}
            </div>
        </div>
    );
}

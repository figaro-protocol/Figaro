"use client";

import { ModuleProps } from "@/lib/shared/moduleRegistry";
import { deriveModuleChrome } from "@/lib/shared/moduleChrome";
import { ModuleEmptyStateCard } from "@/components/shared/ModuleEmptyStateCard";
import { calculateBonds } from "@figaro/core";

function formatAmount(amount: bigint): string {
    const whole = amount / 10n ** 18n;
    const frac = amount % 10n ** 18n;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "").slice(0, 4);
    return `${whole}.${fracStr}`;
}

interface CapitalRow {
    label: string;
    amount: bigint;
    pct: number;
}

export function ProcessCapitalSummaryModule({ context }: ModuleProps) {
    const processModel = context.processModel;
    const { accentTone, cardStyle, labelStyle } = deriveModuleChrome(context);

    if (!processModel || processModel.orders.length === 0) {
        return (
            <ModuleEmptyStateCard
                testId="process-capital-module"
                skinId={context.skinBundle?.skinId}
                cardStyle={cardStyle}
                labelStyle={labelStyle}
                title="Capital Summary"
                message="Select a process from the sidebar to view capital flows."
            />
        );
    }

    const orders = processModel.orders;

    // Aggregate across all orders in the tree
    const totalPayment = orders.reduce((acc, o) => acc + o.payment, 0n);
    const totalBuyerBond = orders.reduce((acc, o) => {
        const breakdown = o.settlementBreakdown;
        if (!breakdown) return acc + calculateBonds(o.payment, o.payment).buyerBond;
        return acc + (breakdown.lockedBond?.amount ?? 0n);
    }, 0n);

    // Count sub-orders (those with parent references)
    const subOrders = orders.filter((o) => o.parentOrderIds.length > 0);
    const downstreamValue = subOrders.reduce((acc, o) => acc + o.payment, 0n);

    // Total capital at risk = all bonds across all orders
    // Each order has buyer bond (2x payment) + seller bond (2x cumulative value)
    // We derive from the settlement breakdown when available, or use the 2x rule
    const totalCapitalLocked = orders.reduce((acc, o) => {
        const breakdown = o.settlementBreakdown;
        if (breakdown?.lockedBond) return acc + breakdown.lockedBond.amount;
        // fallback: buyer bond rule = 2x payment
        return acc + calculateBonds(o.payment, o.payment).buyerBond;
    }, 0n);

    const totalSettled = orders.reduce((acc, o) => {
        const breakdown = o.settlementBreakdown;
        if (breakdown?.settledAvailable) return acc + breakdown.settledAvailable.amount;
        return acc;
    }, 0n);

    // State distribution
    const stateCounts: Record<string, number> = {};
    for (const o of orders) {
        stateCounts[o.state] = (stateCounts[o.state] ?? 0) + 1;
    }

    const totalForPct = totalCapitalLocked > 0n ? totalCapitalLocked : 1n;

    const rows: CapitalRow[] = [
        {
            label: "Total payment value",
            amount: totalPayment,
            pct: Number((totalPayment * 100n) / totalForPct),
        },
        {
            label: "Capital locked (bonds)",
            amount: totalCapitalLocked,
            pct: 100,
        },
    ];

    if (totalSettled > 0n) {
        rows.push({
            label: "Settled / withdrawable",
            amount: totalSettled,
            pct: Number((totalSettled * 100n) / totalForPct),
        });
    }

    if (downstreamValue > 0n) {
        rows.push({
            label: "Downstream (sub-order) value",
            amount: downstreamValue,
            pct: Number((downstreamValue * 100n) / totalForPct),
        });
    }

    const netExposure = totalCapitalLocked - totalSettled;

    return (
        <div
            data-testid="process-capital-module"
            data-skin={context.skinBundle?.skinId}
            className="rounded-lg border border-neutral-200 bg-white p-6"
            style={cardStyle}
        >
            <p className="text-xs font-semibold text-neutral-500 mb-1" style={labelStyle}>
                Process Capital Summary
            </p>
            <p className="text-xs text-neutral-500 mb-4">
                {orders.length} order{orders.length !== 1 ? "s" : ""} across tree
            </p>

            {/* Capital flow rows */}
            <div className="space-y-3" data-testid="capital-rows">
                {rows.map((row) => (
                    <div key={row.label}>
                        <div className="flex justify-between text-sm text-black mb-1">
                            <span className="text-neutral-600">{row.label}</span>
                            <span className="font-mono">{formatAmount(row.amount)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                            <div
                                className="h-full rounded-full bg-neutral-400"
                                style={{
                                    width: `${Math.min(row.pct, 100)}%`,
                                    backgroundColor: accentTone ?? undefined,
                                }}
                            />
                        </div>
                    </div>
                ))}
            </div>

            {/* Net exposure highlight */}
            <div
                className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-3"
                data-testid="capital-net-exposure"
                style={accentTone ? { borderColor: accentTone } : undefined}
            >
                <div className="flex justify-between text-sm">
                    <span className="text-neutral-600 font-medium">Net exposure</span>
                    <span className="font-mono font-semibold text-black">{formatAmount(netExposure)}</span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                    Capital locked minus settled. Returns to zero when all orders resolve.
                </p>
            </div>

            {/* State distribution */}
            <div className="mt-4 pt-3 border-t border-neutral-200" data-testid="capital-state-distribution">
                <p className="text-xs text-neutral-500 mb-2">Order state distribution</p>
                <div className="flex flex-wrap gap-2">
                    {Object.entries(stateCounts).map(([state, count]) => (
                        <span
                            key={state}
                            className="inline-flex items-center rounded-full border border-neutral-200 bg-white px-2.5 py-0.5 text-xs text-neutral-600"
                            data-testid={`capital-state-${state.toLowerCase()}`}
                        >
                            {state}
                            <span className="ml-1 font-mono text-neutral-500">{count}</span>
                        </span>
                    ))}
                </div>
            </div>

            {/* Composition depth */}
            {subOrders.length > 0 && (
                <div className="mt-3 text-xs text-neutral-500" data-testid="capital-composition">
                    {subOrders.length} sub-order{subOrders.length !== 1 ? "s" : ""} reference{" "}
                    {formatAmount(downstreamValue)} in downstream value
                </div>
            )}
        </div>
    );
}

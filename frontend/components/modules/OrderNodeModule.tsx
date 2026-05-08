"use client";

import { ModuleProps } from "@/lib/shared/moduleRegistry";
import { deriveModuleChrome } from "@/lib/shared/moduleChrome";
import { ModuleEmptyStateCard } from "@/components/shared/ModuleEmptyStateCard";
import { formatToken } from "@/lib/shared/utils";
import { truncateHex } from "@/lib/shared/formatHex";

export function OrderNodeModule({ context }: ModuleProps) {
    const order = context.selectedOrder;
    const { accentTone, cardStyle, labelStyle } = deriveModuleChrome(context);

    if (!order) {
        return (
            <ModuleEmptyStateCard
                testId="order-node-module"
                skinId={context.skinBundle?.skinId}
                cardStyle={cardStyle}
                message="Select an order from the process graph to view its details."
            />
        );
    }

    const stateColors: Record<string, string> = {
        Active: "border-green-600 text-green-700 bg-green-50",
        Pending: "border-amber-500 text-amber-700 bg-amber-50",
        Resolved: "border-neutral-400 text-neutral-600 bg-neutral-50",
        Cancelled: "border-red-500 text-red-700 bg-red-50",
    };
    const stateClass = stateColors[order.state] ?? "border-neutral-300 text-neutral-600 bg-neutral-50";

    return (
        <div
            data-testid="order-node-module"
            data-skin={context.skinBundle?.skinId}
            className="rounded-lg border border-neutral-200 bg-white p-6"
            style={cardStyle}
        >
            <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500" style={labelStyle}>
                    Order #{order.orderId}
                </p>
                <span className={`rounded border px-2 py-1 text-xs font-semibold ${stateClass}`}>
                    {order.state}
                </span>
            </div>

            <div className="space-y-3 text-sm text-black">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-xs text-neutral-500">Buyer</p>
                        <p className="font-mono text-xs">{truncateHex(order.buyer)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-neutral-500">Seller</p>
                        <p className="font-mono text-xs">{truncateHex(order.seller)}</p>
                    </div>
                </div>

                <div>
                    <p className="text-xs text-neutral-500">Payment</p>
                    <p className="font-semibold">{formatToken(order.payment, context.tokenDecimals ?? 18)} tokens</p>
                </div>

                {order.parentOrderIds.length > 0 && (
                    <div>
                        <p className="text-xs text-neutral-500">Parent Orders</p>
                        <p className="font-mono text-xs">{order.parentOrderIds.join(", ")}</p>
                    </div>
                )}

                {order.capabilities.length > 0 && (
                    <div>
                        <p className="text-xs text-neutral-500 mb-1">Available Actions</p>
                        <div className="flex flex-wrap gap-2">
                            {order.capabilities.map((cap) => (
                                <button
                                    key={cap.id}
                                    type="button"
                                    disabled={
                                        !context.executableCapabilityIds.has(cap.id) ||
                                        !!context.executingCapabilityId
                                    }
                                    onClick={() => context.onExecuteCapability(cap)}
                                    className="rounded border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-black hover:bg-neutral-100 disabled:opacity-50"
                                    style={context.executableCapabilityIds.has(cap.id) && !context.executingCapabilityId && accentTone
                                        ? {
                                            backgroundColor: accentTone,
                                            borderColor: accentTone,
                                            color: "#ffffff",
                                        }
                                        : undefined}
                                >
                                    {context.executingCapabilityId === cap.id
                                        ? "Processing..."
                                        : cap.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

"use client";

import { ModuleProps } from "@/lib/shared/moduleRegistry";
import { deriveModuleChrome } from "@/lib/shared/moduleChrome";
import { ModuleEmptyStateCard } from "@/components/shared/ModuleEmptyStateCard";

export function OrderActionModule({ context }: ModuleProps) {
    const order = context.selectedOrder;
    const caps = order?.capabilities ?? [];
    const { accentTone, cardStyle, labelStyle } = deriveModuleChrome(context);

    if (caps.length === 0) {
        return (
            <ModuleEmptyStateCard
                testId="order-action-empty"
                cardStyle={cardStyle}
                labelStyle={labelStyle}
                title="Order Actions"
                message="No actions available. Select an order to see available capabilities."
            />
        );
    }

    return (
        <div
            data-testid="order-action-module"
            className="rounded-lg border border-neutral-200 bg-white p-6"
            style={cardStyle}
        >
            <p className="text-xs font-semibold text-neutral-500 mb-3" style={labelStyle}>
                Order Actions
            </p>
            <div className="space-y-2">
                {caps.map((cap) => {
                    const isExecutable = context.executableCapabilityIds.has(cap.id);
                    const isExecuting = context.executingCapabilityId === cap.id;

                    return (
                        <div key={cap.id} className="flex items-center justify-between gap-3 rounded border border-neutral-200 p-3">
                            <div>
                                <p className="text-sm font-semibold text-black">{cap.label}</p>
                                <p className="text-xs text-neutral-500">
                                    {cap.mechanismId} · {cap.source.truthClass} · {cap.action.executionType}
                                </p>
                                {cap.preconditions.length > 0 && (
                                    <p className="text-[11px] text-neutral-500 mt-1">{cap.preconditions.join(", ")}</p>
                                )}
                            </div>
                            <button
                                type="button"
                                disabled={!isExecutable || !!context.executingCapabilityId}
                                onClick={() => context.onExecuteCapability(cap)}
                                className="rounded border border-black px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                style={isExecutable && !context.executingCapabilityId && accentTone
                                    ? {
                                        backgroundColor: accentTone,
                                        borderColor: accentTone,
                                        color: "#ffffff",
                                    }
                                    : undefined}
                            >
                                {isExecuting ? "Processing..." : cap.label}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

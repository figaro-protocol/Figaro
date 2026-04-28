"use client";

import { CapabilityModel, isDeliveryLifecycleSignalCapability } from "@/lib/semantic/models";
import { ModuleProps } from "@/lib/shared/moduleRegistry";
import { deriveModuleChrome } from "@/lib/shared/moduleChrome";

const DRIVER_SIGNAL_ORDER = ["declareEnRoute", "declarePickedUp", "declareDelivered"] as const;
const RESTAURANT_SIGNAL_ORDER = ["declarePreparationStarted", "declareReadyForPickup"] as const;

function LifecycleSignalPanel({ context, orderHash }: { context: ModuleProps["context"]; orderHash: string }) {
    const accentTone = context.skinBundle?.branding.branding.accentColor;
    const roleKind = context.selectedRoleKind;
    const signalOrder = roleKind === "merchant" ? RESTAURANT_SIGNAL_ORDER : DRIVER_SIGNAL_ORDER;

    const signalCapabilities = signalOrder.flatMap((signal) => {
        const capability = context.selectedOrder?.capabilities.find((candidate) =>
            isDeliveryLifecycleSignalCapability(candidate)
            && candidate.action.signal === signal
            && candidate.action.orderHash === orderHash,
        );

        return capability ? [{ capability, signal }] : [];
    });

    if (signalCapabilities.length === 0) {
        return <p className="text-sm text-neutral-500">No coordinator signal actions are available for the selected order in this role context.</p>;
    }

    return (
        <div className="space-y-2" data-testid={`lifecycle-signal-panel-${orderHash}`}>
            {signalCapabilities.map(({ capability, signal }) => {
                const isExecutable = context.executableCapabilityIds.has(capability.id);
                const isExecuting = context.executingCapabilityId === capability.id;

                return (
                    <button
                        key={capability.id}
                        type="button"
                        data-testid={`btn-signal-${signal}-${orderHash}`}
                        disabled={!isExecutable || !!context.executingCapabilityId}
                        onClick={() => void context.onExecuteCapability(capability as CapabilityModel)}
                        className="w-full rounded border border-black px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed text-left"
                        style={isExecutable && !context.executingCapabilityId && accentTone
                            ? {
                                backgroundColor: accentTone,
                                borderColor: accentTone,
                                color: "#ffffff",
                            }
                            : undefined}
                    >
                        {isExecuting ? "Sending..." : capability.label}
                    </button>
                );
            })}
        </div>
    );
}

export function CoordinatorActionModule({ context }: ModuleProps) {
    const coordinatorMechanism = context.mechanisms.find((m) => m.kind === "coordinator");
    const { accentTone, cardStyle, labelStyle } = deriveModuleChrome(context);

    if (!coordinatorMechanism) {
        return null;
    }

    const selectedOrderHash = context.selectedOrder?.orderId ?? null;

    return (
        <div
            className="rounded-lg border border-neutral-200 bg-white p-6"
            data-testid="coordinator-action-module"
            data-skin={context.skinBundle?.skinId}
            style={cardStyle}
        >
            <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500" style={labelStyle}>
                    {coordinatorMechanism.name}
                </p>
                <span
                    className="rounded border border-neutral-300 px-2 py-1 text-[11px] font-semibold text-neutral-600"
                    style={accentTone ? { borderColor: accentTone, color: accentTone } : undefined}
                >
                    {coordinatorMechanism.riskClass}
                </span>
            </div>

            {selectedOrderHash !== null ? (
                <LifecycleSignalPanel context={context} orderHash={selectedOrderHash} />
            ) : (
                <p className="text-sm text-neutral-500">
                    Select a delivery order to send lifecycle signals.
                </p>
            )}
        </div>
    );
}

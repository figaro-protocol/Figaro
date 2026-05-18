"use client";

/**
 * MerchantFulfilmentModule — merchant-side post-acceptance event log surface.
 *
 * The merchant attests sovereign lifecycle events under
 * `figaro-merchant-process-v1` after counter-signing the order. This module
 * surfaces the event log as a row of action buttons against the selected
 * order. Class B (discretionary) per Paper E — the kernel does not gate
 * settlement on these events; they are evidence the merchant has done what
 * they said they would.
 *
 * Gating: only renders for the merchant role (matching IncomingOrdersModule)
 * and only when the connected wallet equals the selected order's seller.
 *
 * Co-located with the existing handoff modules. The two operator-process
 * hooks partition by operator: `useMerchantProcess.ts` fires merchant
 * events (this module), `useCourierProcess.ts` fires courier events.
 * Each off-chain operator has its own sovereign log per CLAUDE.md
 * "When to add a per-role process
 * schema".
 */

import { useCallback, useState } from "react";
import { useAccount } from "wagmi";
import type { ModuleProps } from "@/lib/shared/moduleRegistry";
import { deriveModuleChrome } from "@/lib/shared/moduleChrome";
import { ModuleEmptyStateCard } from "@/components/shared/ModuleEmptyStateCard";
import { useMerchantProcessActions } from "@/lib/mechanisms/useMerchantProcess";
import type { MerchantEvent } from "@figaro/core/schemas";
import { extractErrorMessage } from "@/lib/shared/errors";
import { hexEqual } from "@/lib/shared/evm";

interface MerchantEventDefinition {
    eventType: MerchantEvent;
    label: string;
    description: string;
}

/** Happy-path merchant events, in fulfillment order. `order-received` fires
 *  implicitly at counter-sign time; `cancelled` is a destructive branch
 *  surfaced separately when supported. */
const MERCHANT_EVENTS: readonly MerchantEventDefinition[] = [
    {
        eventType: "accepted",
        label: "Mark as accepted",
        description: "Acknowledge receipt and acceptance of the order.",
    },
    {
        eventType: "prep-started",
        label: "Mark prep started",
        description: "Preparation has begun.",
    },
    {
        eventType: "ready-for-pickup",
        label: "Mark ready for pickup",
        description: "Order is ready for the buyer or courier to take custody.",
    },
    {
        eventType: "handed-off",
        label: "Mark as handed off",
        description: "Custody has changed — the order has left your hands.",
    },
];

export function MerchantFulfilmentModule({ moduleId, context }: ModuleProps) {
    const { selectedOrder } = context;
    const { accentTone, cardStyle, labelStyle, shellLabel } = deriveModuleChrome(context);
    const { address } = useAccount();
    const { signal, isPending, isConfirming, error, isAvailable } = useMerchantProcessActions();
    const [pendingEventType, setPendingEventType] = useState<MerchantEvent | null>(null);
    const [lastFired, setLastFired] = useState<MerchantEvent | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);

    const handleSignal = useCallback(async (eventType: MerchantEvent) => {
        if (!selectedOrder) return;
        setPendingEventType(eventType);
        setLastError(null);
        try {
            await signal({
                orderHash: selectedOrder.orderId,
                eventType,
            });
            setLastFired(eventType);
        } catch (cause: unknown) {
            setLastError(extractErrorMessage(cause, "Attestation failed"));
        } finally {
            setPendingEventType(null);
        }
    }, [signal, selectedOrder]);

    if (!selectedOrder) {
        return (
            <ModuleEmptyStateCard
                testId="merchant-fulfilment-empty"
                cardStyle={cardStyle}
                labelStyle={labelStyle}
                title="Merchant fulfilment"
                message="Select an order to record fulfilment events."
            />
        );
    }

    const isOrderSeller = hexEqual(address, selectedOrder.seller);
    if (!isOrderSeller) {
        return (
            <ModuleEmptyStateCard
                testId="merchant-fulfilment-not-seller"
                cardStyle={cardStyle}
                labelStyle={labelStyle}
                title="Merchant fulfilment"
                message="Connect the seller's wallet to record fulfilment events for this order."
            />
        );
    }

    if (!isAvailable) {
        return (
            <ModuleEmptyStateCard
                testId="merchant-fulfilment-unavailable"
                cardStyle={cardStyle}
                labelStyle={labelStyle}
                title="Merchant fulfilment"
                message="Attestation coordinator unavailable on this network."
            />
        );
    }

    const busy = isPending || isConfirming;
    const errorText = lastError ?? error;

    return (
        <div
            data-testid="merchant-fulfilment-module"
            data-module-id={moduleId}
            className="rounded-lg border border-neutral-200 bg-white p-6 space-y-4"
            style={cardStyle}
            role="region"
            aria-label="Merchant fulfilment events"
        >
            <div>
                <p className="text-xs font-semibold text-neutral-500" style={labelStyle}>
                    {shellLabel}
                </p>
                <h2 className="text-lg font-bold text-black mt-1">Merchant fulfilment</h2>
                <p className="mt-1 text-sm text-neutral-600">
                    Record sovereign fulfilment events for this order. Each event is an
                    independent on-chain attestation under{" "}
                    <code className="text-xs">figaro-merchant-process-v1</code>.
                </p>
            </div>

            <div className="space-y-2">
                {MERCHANT_EVENTS.map((event) => {
                    const isThisPending = pendingEventType === event.eventType;
                    const wasFired = lastFired === event.eventType;
                    return (
                        <div
                            key={event.eventType}
                            className="flex items-center justify-between gap-3 rounded border border-neutral-200 p-3"
                            data-testid={`merchant-event-row-${event.eventType}`}
                        >
                            <div>
                                <p className="text-sm font-semibold text-black">{event.label}</p>
                                <p className="text-xs text-neutral-500">{event.description}</p>
                            </div>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleSignal(event.eventType)}
                                data-testid={`btn-merchant-event-${event.eventType}`}
                                className="rounded border border-black px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                                style={!busy && accentTone
                                    ? { backgroundColor: accentTone, borderColor: accentTone, color: "#ffffff" }
                                    : undefined}
                            >
                                {isThisPending ? "Signing…" : wasFired ? "Sent" : event.label}
                            </button>
                        </div>
                    );
                })}
            </div>

            {errorText && (
                <p className="text-sm text-red-600" data-testid="merchant-fulfilment-error">
                    {errorText}
                </p>
            )}

            <p className="text-xs text-neutral-500">
                Buyers see these events on the audit surface. They do not
                affect bond release — the buyer&apos;s `resolveProcess` is the
                kernel-level receipt.
            </p>
        </div>
    );
}

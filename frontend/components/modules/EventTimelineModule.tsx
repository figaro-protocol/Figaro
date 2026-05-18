"use client";

import { ModuleProps } from "@/lib/shared/moduleRegistry";
import { OrderNodeModel } from "@/lib/semantic/models";
import { deriveModuleChrome } from "@/lib/shared/moduleChrome";
import { ModuleEmptyStateCard } from "@/components/shared/ModuleEmptyStateCard";
import { vocab } from "@/lib/shared/vocab";
import { truncateHex } from "@/lib/shared/formatHex";

interface TimelineEvent {
    orderId: string;
    label: string;
    state: string;
    buyer: string;
    seller: string;
    payment: bigint;
    parentCount: number;
    capabilityCount: number;
    kind: "active" | "resolved";
}

const STATE_LABELS: Record<string, { label: string; kind: TimelineEvent["kind"]; tone: string }> = {
    Active: { label: vocab.status.active, kind: "active", tone: "bg-green-50 text-green-700 border-green-200" },
    Resolved: { label: vocab.status.completed, kind: "resolved", tone: "bg-neutral-100 text-neutral-600 border-neutral-200" },
};

function deriveTimeline(orders: OrderNodeModel[]): TimelineEvent[] {
    return orders.map((order) => {
        const stateInfo = STATE_LABELS[order.state] ?? STATE_LABELS.Active;
        return {
            orderId: order.orderId,
            label: stateInfo.label,
            state: order.state,
            buyer: order.buyer,
            seller: order.seller,
            payment: order.payment,
            parentCount: order.parentOrderIds.length,
            capabilityCount: order.capabilities.length,
            kind: stateInfo.kind,
        };
    });
}

function formatAmount(amount: bigint): string {
    const whole = amount / 10n ** 18n;
    const frac = amount % 10n ** 18n;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "").slice(0, 4);
    return `${whole}.${fracStr}`;
}

type FilterKind = "all" | "active" | "resolved";

export function EventTimelineModule({ context }: ModuleProps) {
    const processModel = context.processModel;
    const { accentTone, cardStyle, labelStyle } = deriveModuleChrome(context);

    if (!processModel || processModel.orders.length === 0) {
        return (
            <ModuleEmptyStateCard
                testId="event-timeline-module"
                skinId={context.skinBundle?.skinId}
                cardStyle={cardStyle}
                labelStyle={labelStyle}
                title={vocab.headings.orderTimeline}
                message="Select an order group from the sidebar to view its timeline."
            />
        );
    }

    const timeline = deriveTimeline(processModel.orders);

    // Group by state for filter counts
    const counts: Record<FilterKind, number> = {
        all: timeline.length,
        active: timeline.filter((e) => e.kind === "active").length,
        resolved: timeline.filter((e) => e.kind === "resolved").length,
    };

    return (
        <div
            data-testid="event-timeline-module"
            data-skin={context.skinBundle?.skinId}
            className="rounded-lg border border-neutral-200 bg-white p-6"
            style={cardStyle}
        >
            <p className="text-xs font-semibold text-neutral-500 mb-1" style={labelStyle}>
                {vocab.headings.orderTimeline}
            </p>
            <p className="text-xs text-neutral-500 mb-4">
                {truncateHex(processModel.processId, { head: 10, tail: 0 })} · {processModel.orders.length} order{processModel.orders.length !== 1 ? "s" : ""}
            </p>

            {/* Filter pills */}
            <div className="flex flex-wrap gap-1.5 mb-4" data-testid="timeline-filters">
                {(["all", "active", "resolved"] as FilterKind[]).map((kind) => (
                    counts[kind] > 0 && (
                        <span
                            key={kind}
                            className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 text-xs text-neutral-600"
                            style={accentTone ? { borderColor: accentTone, color: accentTone } : undefined}
                            data-testid={`timeline-filter-${kind}`}
                        >
                            {kind === "all" ? "All" : kind.charAt(0).toUpperCase() + kind.slice(1)}
                            <span className="ml-1 text-neutral-500">{counts[kind]}</span>
                        </span>
                    )
                ))}
            </div>

            {/* Timeline entries */}
            <div className="space-y-3" data-testid="timeline-entries">
                {timeline.map((event) => {
                    const tone = STATE_LABELS[event.state]?.tone ?? STATE_LABELS.Active.tone;
                    return (
                        <div
                            key={event.orderId}
                            className={`rounded-md border p-3 ${tone}`}
                            data-testid={`timeline-entry-${event.orderId}`}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium">
                                    Order #{event.orderId}
                                </span>
                                <span className="text-xs font-semibold uppercase">
                                    {event.label}
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-80">
                                <span>Buyer {truncateHex(event.buyer)}</span>
                                <span>Seller {truncateHex(event.seller)}</span>
                                <span>{formatAmount(event.payment)} payment</span>
                                {event.parentCount > 0 && (
                                    <span>{event.parentCount} parent{event.parentCount !== 1 ? "s" : ""}</span>
                                )}
                                {event.capabilityCount > 0 && (
                                    <span>{event.capabilityCount} action{event.capabilityCount !== 1 ? "s" : ""}</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Summary footer */}
            <div className="mt-4 pt-3 border-t border-neutral-200 text-xs text-neutral-500" data-testid="timeline-summary">
                {processModel.stateSummary} · {processModel.upstreamLinks.length > 0
                    ? `${processModel.upstreamLinks.length} upstream link${processModel.upstreamLinks.length !== 1 ? "s" : ""}`
                    : "root process"}
                {processModel.downstreamLinks.length > 0 &&
                    ` · ${processModel.downstreamLinks.length} downstream link${processModel.downstreamLinks.length !== 1 ? "s" : ""}`}
            </div>
        </div>
    );
}

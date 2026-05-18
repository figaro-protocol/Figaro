"use client";

import type { ModuleProps } from "@/lib/shared/moduleRegistry";
import { ZERO_ADDRESS } from "@/lib/shared/evm";
import { deriveModuleChrome } from "@/lib/shared/moduleChrome";
import { truncateHex } from "@/lib/shared/formatHex";
import type { SemanticTone } from "@/lib/shared/tones";

/**
 * HandoffTrackerModule — visual progress tracker for any physical-handoff
 * lifecycle (delivery, courier, logistics, etc.).
 *
 * Maps lifecycle stage + auction state into a milestone progress bar.
 * Pure presentation — reads mechanism state from ModuleRenderContext,
 * never imports contract addresses directly.
 */

/** Tracker has no error state — exclude "red" from the canonical palette. */
type TrackerTone = Exclude<SemanticTone, "red">;

function toneClasses(tone: TrackerTone): string {
    switch (tone) {
        case "amber":
            return "border-amber-200 bg-amber-50 text-amber-700";
        case "blue":
            return "border-blue-200 bg-blue-50 text-blue-700";
        case "green":
            return "border-green-200 bg-green-50 text-green-700";
        default:
            return "border-neutral-200 bg-neutral-50 text-neutral-700";
    }
}

function toneBarColor(tone: TrackerTone): string {
    switch (tone) {
        case "green":
            return "bg-green-500";
        case "blue":
            return "bg-blue-500";
        case "amber":
            return "bg-amber-500";
        default:
            return "bg-neutral-400";
    }
}

interface TrackerState {
    label: string;
    detail: string;
    progress: number;
    tone: TrackerTone;
}

function deriveTrackerState(
    lifecycleStage: number,
    auctionStarted: boolean,
    hasFulfiller: boolean,
): TrackerState {
    if (lifecycleStage >= 5)
        return { label: "Delivered", detail: "The fulfiller marked this handoff complete.", progress: 100, tone: "green" };
    if (lifecycleStage === 4)
        return { label: "Picked up", detail: "The fulfiller has the order and is heading toward dropoff.", progress: 82, tone: "blue" };
    if (lifecycleStage === 3)
        return { label: "Fulfiller heading to pickup", detail: "A fulfiller has claimed the job and is traveling to pickup.", progress: 58, tone: "blue" };
    if (lifecycleStage === 2)
        return { label: "Ready for pickup", detail: "The seller marked the order ready for handoff.", progress: 68, tone: "amber" };
    if (lifecycleStage === 1) {
        const detail = hasFulfiller
            ? "The seller is preparing the order while the fulfiller gets into position."
            : auctionStarted
                ? "The seller is preparing while fulfiller matching is live."
                : "The seller has the order and dispatch has not opened yet.";
        return { label: "Preparing", detail, progress: hasFulfiller ? 42 : auctionStarted ? 30 : 18, tone: "amber" };
    }
    if (hasFulfiller)
        return { label: "Fulfiller assigned", detail: "A fulfiller has claimed the job and is waiting for the seller workflow to advance.", progress: 32, tone: "blue" };
    if (auctionStarted)
        return { label: "Finding fulfiller", detail: "The handoff job is live and waiting for a fulfiller to claim it.", progress: 20, tone: "blue" };
    return { label: "Dispatch requested", detail: "The handoff sub-order exists and is waiting for the seller to open dispatch.", progress: 10, tone: "neutral" };
}

export function HandoffTrackerModule({ moduleId, context }: ModuleProps) {
    const coordinatorMech = context.mechanisms.find((m) => m.kind === "coordinator");
    const { shellLabel, cardStyle, labelStyle } = deriveModuleChrome(context);

    if (!coordinatorMech) return null;

    // Extract state from mechanism metadata.  These are populated by the
    // mechanism adapter that reads on-chain state and injects it here.
    const meta = coordinatorMech as unknown as Record<string, unknown>;
    const originOrderId = context.selectedOrder?.orderId ?? "?";
    const handoffOrderId = (meta.deliveryOrderId as string) ?? (meta.handoffOrderId as string) ?? "?";
    const lifecycleStage = Number(meta.deliveryStage ?? meta.lifecycleStage ?? 0);
    const auctionStarted = !!(meta.auctionStarted);
    const assignedFulfiller = (meta.assignedDriver as string) ?? (meta.assignedFulfiller as string);
    const pickupGeohash = meta.pickupGeohash as string | undefined;
    const dropoffGeohash = meta.dropoffGeohash as string | undefined;

    const hasFulfiller = !!assignedFulfiller && assignedFulfiller !== ZERO_ADDRESS;
    const tracker = deriveTrackerState(lifecycleStage, auctionStarted, hasFulfiller);

    const milestones = [
        { label: "Dispatch requested", complete: true, active: !auctionStarted && !hasFulfiller && lifecycleStage === 0 },
        { label: "Fulfiller assigned", complete: hasFulfiller, active: auctionStarted && !hasFulfiller },
        { label: "Ready for pickup", complete: lifecycleStage >= 2, active: lifecycleStage === 2 },
        { label: "Picked up", complete: lifecycleStage >= 4, active: lifecycleStage === 3 || lifecycleStage === 4 },
        { label: "Delivered", complete: lifecycleStage >= 5, active: lifecycleStage >= 5 },
    ];

    return (
        <div
            data-testid="handoff-tracker-module"
            data-module-id={moduleId}
            className="rounded-lg border border-neutral-200 bg-white p-4"
            style={cardStyle}
            role="region"
            aria-label="Handoff tracking"
        >
            <p className="mb-3 text-xs font-semibold text-neutral-500" style={labelStyle}>
                {shellLabel}
            </p>
            {/* Header */}
            <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <div className={`rounded-full border p-2 ${toneClasses(tracker.tone)}`} aria-hidden="true">
                        <span className="text-sm">
                            {tracker.tone === "green" ? "✓" : tracker.tone === "blue" ? "→" : "●"}
                        </span>
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-neutral-900">{tracker.label}</p>
                        <p className="mt-1 text-xs text-neutral-600">{tracker.detail}</p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-xs font-medium text-neutral-500">Handoff</p>
                    <p className="text-sm font-semibold text-neutral-900">#{handoffOrderId}</p>
                </div>
            </div>

            {/* Progress bar */}
            <div className="mb-4">
                <div
                    className="h-2 overflow-hidden rounded-full bg-neutral-100"
                    role="progressbar"
                    aria-valuenow={tracker.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Handoff progress"
                >
                    <div
                        className={`h-full transition-all duration-300 ${toneBarColor(tracker.tone)}`}
                        style={{ width: `${tracker.progress}%` }}
                    />
                </div>
                <p className="mt-1 text-right text-xs text-neutral-500">{tracker.progress}% complete</p>
            </div>

            {/* Route visualization (when fulfiller is en route) */}
            {pickupGeohash && dropoffGeohash && lifecycleStage >= 3 && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
                    <span className="text-xs font-mono text-neutral-700">{pickupGeohash}</span>
                    <div className="flex-1 relative h-1 bg-neutral-200 rounded-full mx-1">
                        <div
                            className="absolute top-0 left-0 h-full bg-blue-500 rounded-full transition-all duration-500"
                            style={{ width: lifecycleStage >= 5 ? "100%" : lifecycleStage >= 4 ? "60%" : "20%" }}
                        />
                    </div>
                    <span className="text-xs font-mono text-neutral-700">{dropoffGeohash}</span>
                    <span className={`text-sm ${lifecycleStage >= 5 ? "text-green-500" : "text-neutral-300"}`}>✓</span>
                </div>
            )}

            {/* Summary grid */}
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs">
                <div>
                    <p className="text-neutral-500">Origin order</p>
                    <p className="font-semibold text-neutral-900">#{originOrderId}</p>
                </div>
                <div>
                    <p className="text-neutral-500">Fulfiller</p>
                    <p className="font-mono text-neutral-900">{hasFulfiller ? truncateHex(assignedFulfiller) : "Not assigned yet"}</p>
                </div>
                <div>
                    <p className="text-neutral-500">Dispatch</p>
                    <p className="text-neutral-900">{auctionStarted ? "Open" : "Waiting on seller"}</p>
                </div>
                <div>
                    <p className="text-neutral-500">Lifecycle stage</p>
                    <p className="text-neutral-900">{lifecycleStage}</p>
                </div>
            </div>

            {/* Milestones */}
            <div className="mt-4 space-y-2">
                {milestones.map((m) => {
                    const dotCls = m.complete
                        ? "border-green-500 bg-green-500"
                        : m.active
                            ? "border-blue-500 bg-blue-500"
                            : "border-neutral-300 bg-white";
                    const textCls = m.complete || m.active ? "text-neutral-900" : "text-neutral-500";
                    return (
                        <div key={m.label} className="flex items-center gap-3">
                            <div className={`h-3 w-3 rounded-full border ${dotCls}`} />
                            <span className={`text-sm ${textCls}`}>{m.label}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

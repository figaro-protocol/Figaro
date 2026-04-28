"use client";

/**
 * ActionQueuePanel — Unified approval queue.
 * Operating and building actions sit in the same queue.
 * Human reviews, approves/rejects, then executes.
 */

import { useState } from "react";
import { useFigaro } from "@/lib/console/provider";
import type { ConsoleQueueItem, ConsoleItemStatus } from "@/lib/console/consoleQueue";
import { describeQueueItem, describeQueueRuntimeContext } from "@/lib/console/actionPresentation";

const STATUS_STYLE: Record<ConsoleItemStatus, string> = {
    pending: "bg-yellow-900/40 text-yellow-300 border-yellow-700/50",
    approved: "bg-emerald-900/40 text-emerald-300 border-emerald-700/50",
    rejected: "bg-red-900/40 text-red-300 border-red-700/50",
    forwarded: "bg-blue-900/30 text-blue-300 border-blue-700/40",
    executed: "bg-zinc-800 text-zinc-400 border-zinc-700",
};

const STATUS_LABEL: Record<ConsoleItemStatus, string> = {
    pending: "Awaiting Review",
    approved: "Approved",
    rejected: "Rejected",
    forwarded: "Forwarded",
    executed: "Executed",
};

const KIND_BADGE: Record<"operating" | "building", { label: string; style: string }> = {
    operating: { label: "OP", style: "bg-blue-900/60 text-blue-300" },
    building: { label: "BUILD", style: "bg-purple-900/60 text-purple-300" },
};

function shortenHex(hex: string, chars = 6): string {
    if (hex.length <= chars * 2 + 2) return hex;
    return `${hex.slice(0, chars + 2)}…${hex.slice(-chars)}`;
}

function QueueItemCard({
    item,
    onApprove,
    onReject,
    onExecute,
    executing,
}: {
    item: ConsoleQueueItem;
    onApprove: () => void;
    onReject: () => void;
    onExecute: () => void;
    executing: boolean;
}) {
    const statusStyle = STATUS_STYLE[item.status];
    const badge = KIND_BADGE[item.entry.kind];
    const presentation = describeQueueItem(item);
    const runtimeContext = describeQueueRuntimeContext(item);
    const forwardedProcessId = item.status === "forwarded"
        && item.result
        && typeof item.result === "object"
        && "processId" in item.result
        && typeof item.result.processId === "string"
            ? item.result.processId
            : null;
    const publishedMode = item.status === "executed"
        && item.result
        && typeof item.result === "object"
        && "published" in item.result
        && item.result.published === true
        && "mode" in item.result
        && typeof item.result.mode === "string"
            ? item.result.mode
            : null;
    const publishedPrototypePath = item.status === "executed"
        && item.result
        && typeof item.result === "object"
        && "prototypePath" in item.result
        && typeof item.result.prototypePath === "string"
            ? item.result.prototypePath
            : null;
    const schemaKey = item.status === "executed"
        && item.result
        && typeof item.result === "object"
        && "schemaKey" in item.result
        && typeof item.result.schemaKey === "string"
            ? item.result.schemaKey
            : null;

    return (
        <div className={`rounded-lg border p-3 ${statusStyle}`}>
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${badge.style}`}>
                            {badge.label}
                        </span>
                        <span className="text-xs font-medium uppercase tracking-wide">
                            #{item.id} · {presentation.label}
                        </span>
                        <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px]">
                            {STATUS_LABEL[item.status]}
                        </span>
                    </div>
                    <p className="mt-1 text-sm opacity-80">
                        {presentation.description}
                    </p>
                    {runtimeContext && (
                        <>
                            <p className="mt-1 text-xs opacity-70">
                                {runtimeContext.summary}
                            </p>
                            <p className="mt-1 text-xs opacity-60">
                                {runtimeContext.providers}
                            </p>
                        </>
                    )}
                    {item.rejectionReason && (
                        <p className="mt-1 text-xs italic opacity-60">
                            Reason: {item.rejectionReason}
                        </p>
                    )}
                    {forwardedProcessId && (
                        <p className="mt-1 text-xs opacity-70">
                            Opened the Create Order form for process {shortenHex(forwardedProcessId)}.
                        </p>
                    )}
                    {publishedMode && (
                        <p className="mt-1 text-xs opacity-70">
                            Published via {publishedMode === "workspace" ? "workspace registry" : "local console registry"}.
                            {publishedPrototypePath ? ` Prototype: ${publishedPrototypePath}` : ""}
                        </p>
                    )}
                    {schemaKey && (
                        <p className="mt-1 text-xs opacity-70">
                            Registered schema {schemaKey}.
                        </p>
                    )}
                    {item.txHash && (
                        <p className="mt-1 font-mono text-xs opacity-60">
                            tx: {shortenHex(item.txHash)}
                        </p>
                    )}
                </div>
                <div className="flex shrink-0 gap-1">
                    {item.status === "pending" && (
                        <>
                            <button
                                onClick={onApprove}
                                className="rounded bg-emerald-600/80 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-600 transition-colors"
                            >
                                Approve
                            </button>
                            <button
                                onClick={onReject}
                                className="rounded bg-red-600/80 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-600 transition-colors"
                            >
                                Reject
                            </button>
                        </>
                    )}
                    {item.status === "approved" && (
                        <button
                            onClick={onExecute}
                            disabled={executing}
                            className="rounded bg-blue-600/80 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
                        >
                            {executing ? "Sending…" : presentation.executeLabel}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export function ActionQueuePanel() {
    const { queueItems, approveAction, rejectAction, executeApproved } = useFigaro();
    const [executingId, setExecutingId] = useState<number | null>(null);

    const pending = queueItems.filter((i) => i.status === "pending");
    const approved = queueItems.filter((i) => i.status === "approved");
    const decided = queueItems.filter((i) => i.status === "executed" || i.status === "rejected" || i.status === "forwarded");

    const handleExecute = async (id: number) => {
        setExecutingId(id);
        await executeApproved(id);
        setExecutingId(null);
    };

    if (queueItems.length === 0) {
        return (
            <div className="p-4 text-sm text-zinc-500">
                Action queue is empty. Propose actions from a process to get started.
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3 p-2">
            <h3 className="px-2 pb-1 text-xs font-medium uppercase tracking-wider text-zinc-400">
                Action Queue ({pending.length} pending, {approved.length} ready)
            </h3>
            {[...pending, ...approved, ...decided].map((item) => (
                <QueueItemCard
                    key={item.id}
                    item={item}
                    onApprove={() => approveAction(item.id)}
                    onReject={() => rejectAction(item.id)}
                    onExecute={() => handleExecute(item.id)}
                    executing={executingId === item.id}
                />
            ))}
        </div>
    );
}

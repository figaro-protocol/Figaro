"use client";

import { useFigaro } from "@/lib/console/provider";
import { OrderState } from "@figaro/core";
import type { Process } from "@figaro/core";
import type { AttestationEvent } from "@figaro/core";

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

type EntryType = "committed" | "resolved" | "attested";

interface TimelineEntry {
    type: EntryType;
    blockNumber: number;
    orderHash: string;
    processId: string;
    detail: string;
}

function buildTimeline(
    processes: Process[],
    attestations: AttestationEvent[],
): TimelineEntry[] {
    const entries: TimelineEntry[] = [];
    const myProcessIds = new Set(processes.map((p) => p.processId));

    for (const process of processes) {
        for (const order of process.orders.values()) {
            entries.push({
                type: "committed",
                blockNumber: order.blockNumber,
                orderHash: order.orderHash,
                processId: order.processId,
                detail: `${shortenHex(order.buyer)} → ${shortenHex(order.seller)} · ${formatWei(order.payment)}`,
            });

            if (order.state === OrderState.Resolved && order.sellerPayout !== undefined) {
                entries.push({
                    type: "resolved",
                    blockNumber: order.blockNumber + 1,
                    orderHash: order.orderHash,
                    processId: order.processId,
                    detail: `seller: ${formatWei(order.sellerPayout)} · buyer: ${formatWei(order.buyerPayout ?? 0n)}`,
                });
            }
        }
    }

    for (const att of attestations) {
        if (!myProcessIds.has(att.processId)) continue;
        entries.push({
            type: "attested",
            blockNumber: att.blockNumber,
            orderHash: att.orderHash,
            processId: att.processId,
            detail: `${shortenHex(att.attester)} · schema ${shortenHex(att.schemaId, 4)} · stage ${att.stage}`,
        });
    }

    return entries.sort((a, b) => b.blockNumber - a.blockNumber);
}

const EVENT_STYLE: Record<EntryType, { dot: string; label: string; text: string }> = {
    committed: {
        dot: "bg-emerald-500",
        label: "Committed",
        text: "text-emerald-400",
    },
    resolved: {
        dot: "bg-blue-500",
        label: "Resolved",
        text: "text-blue-400",
    },
    attested: {
        dot: "bg-amber-500",
        label: "Attested",
        text: "text-amber-400",
    },
};

export function EventTimeline() {
    const { myProcesses, attestationEvents } = useFigaro();
    const entries = buildTimeline(myProcesses, attestationEvents);

    if (entries.length === 0) {
        return (
            <div className="p-4 text-sm text-zinc-500">
                No events yet.
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-0 p-2">
            <h3 className="px-2 pb-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
                Events ({entries.length})
            </h3>
            <div className="relative ml-4 border-l border-zinc-700 pl-4">
                {entries.slice(0, 50).map((entry, i) => {
                    const style = EVENT_STYLE[entry.type];
                    return (
                        <div key={`${entry.orderHash}-${entry.type}-${entry.blockNumber}-${i}`} className="relative mb-3 pb-1">
                            <div className={`absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full ${style.dot}`} />
                            <div className="flex items-baseline gap-2">
                                <span className={`text-xs font-medium ${style.text}`}>
                                    {style.label}
                                </span>
                                <span className="font-mono text-[10px] text-zinc-600">
                                    block {entry.blockNumber}
                                </span>
                            </div>
                            <div className="mt-0.5 text-xs text-zinc-400">
                                {entry.detail}
                            </div>
                            <div className="mt-0.5 font-mono text-[10px] text-zinc-600">
                                {shortenHex(entry.orderHash)} in {shortenHex(entry.processId)}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

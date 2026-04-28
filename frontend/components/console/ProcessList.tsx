"use client";

/**
 * ProcessList — Sidebar listing processes for the connected wallet.
 * Reads directly from FigaroContext via useFigaro().
 */

import { useFigaro } from "@/lib/console/provider";
import type { Process, Hex } from "@figaro/core";
import { OrderState } from "@figaro/core";

function shortenHex(hex: string, chars = 6): string {
    if (hex.length <= chars * 2 + 2) return hex;
    return `${hex.slice(0, chars + 2)}…${hex.slice(-chars)}`;
}

function activeOrderCount(process: Process): number {
    let count = 0;
    for (const o of process.orders.values()) {
        if (o.state === OrderState.Active) count++;
    }
    return count;
}

export function ProcessList() {
    const { myProcesses, selectedProcess, selectProcess, syncing } = useFigaro();

    if (syncing && myProcesses.length === 0) {
        return (
            <div className="p-4 text-sm text-zinc-500">
                Syncing…
            </div>
        );
    }

    if (myProcesses.length === 0) {
        return (
            <div data-testid="process-list-empty" className="p-4 text-sm text-zinc-500">
                No processes found for this wallet.
            </div>
        );
    }

    return (
        <div data-testid="process-list" className="flex flex-col gap-1 p-2">
            <h3 className="px-2 pb-1 text-xs font-medium uppercase tracking-wider text-zinc-400">
                Processes ({myProcesses.length})
            </h3>
            {myProcesses.map((p) => {
                const isSelected = selectedProcess?.processId === p.processId;
                const active = activeOrderCount(p);
                return (
                    <button
                        key={p.processId}
                        onClick={() => selectProcess(p.processId)}
                        className={`flex items-center justify-between rounded px-3 py-2 text-left text-sm transition-colors ${isSelected
                            ? "bg-zinc-800 text-white"
                            : "text-zinc-300 hover:bg-zinc-800/50"
                            }`}
                    >
                        <span className="font-mono text-xs">
                            {shortenHex(p.processId)}
                        </span>
                        <span className="flex items-center gap-2">
                            <span className="text-xs text-zinc-500">
                                {p.orders.size} order{p.orders.size !== 1 ? "s" : ""}
                            </span>
                            {p.resolved ? (
                                <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">
                                    done
                                </span>
                            ) : (
                                <span className="rounded bg-emerald-900/50 px-1.5 py-0.5 text-[10px] text-emerald-400">
                                    {active} active
                                </span>
                            )}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

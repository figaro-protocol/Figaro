"use client";

/**
 * SyncStatus — Shows FigaroContext sync state and batch sequencer availability.
 */

import { useFigaro } from "@/lib/console/provider";

export function SyncStatus() {
    const { ctx, syncing, lastSync, syncVersion, sequencerAvailable, sequencerStatus } = useFigaro();

    return (
        <div className="flex flex-col gap-1 px-3 py-1.5 text-[11px] text-zinc-500">
            <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${syncing ? "animate-pulse bg-yellow-500" : ctx ? "bg-emerald-500" : "bg-zinc-600"
                        }`} />
                    {syncing ? "Syncing" : ctx ? "Connected" : "Disconnected"}
                </span>
                {lastSync && (
                    <>
                        <span>Block {lastSync.syncedToBlock.toString()}</span>
                        <span>v{syncVersion}</span>
                    </>
                )}
            </div>
            <div className="flex items-center gap-1.5">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${sequencerAvailable ? "bg-emerald-500" : "bg-zinc-600"}`} />
                <span>
                    {sequencerAvailable ? "Batch" : "Direct"}
                </span>
                {sequencerAvailable && sequencerStatus && (
                    <span className="text-zinc-600">
                        · {sequencerStatus.pending_ops} pending
                        {sequencerStatus.batches_settled > 0 && ` · ${sequencerStatus.batches_settled} batches`}
                    </span>
                )}
                {!sequencerAvailable && (
                    <span className="text-zinc-600">· on-chain only</span>
                )}
            </div>
        </div>
    );
}

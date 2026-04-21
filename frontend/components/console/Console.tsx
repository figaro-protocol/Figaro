"use client";

/**
 * Console — Unified supervision surface.
 *
 * Two modes sharing one layout:
 * - Operating: process inspection, proposed actions, event timeline
 * - Building: assembly drafts, section editor, validation
 *
 * Both modes share the right-hand action queue.
 */

import { useEffect, useState } from "react";
import { ProcessList } from "./ProcessList";
import { ProposedActions } from "./ProposedActions";
import { ActionQueuePanel } from "./ActionQueuePanel";
import { ProcessDetail } from "./ProcessDetail";
import { EventTimeline } from "./EventTimeline";
import { SyncStatus } from "./SyncStatus";
import { CreateOrderPanel } from "./CreateOrderPanel";
import { AssemblyList } from "./AssemblyList";
import { AssemblyEditor } from "./AssemblyEditor";
import { useFigaro } from "@/lib/console/provider";
import { BuildProvider } from "@/lib/console/buildProvider";

type Mode = "operating" | "building";
type OperatingTab = "inspect" | "actions" | "create" | "timeline";

export function Console() {
    const { address, createOrderPrefill, queueItems } = useFigaro();
    const [mode, setMode] = useState<Mode>("operating");
    const [operatingTab, setOperatingTab] = useState<OperatingTab>("inspect");

    useEffect(() => {
        if (!createOrderPrefill) return;
        setMode("operating");
        setOperatingTab("create");
    }, [createOrderPrefill]);

    if (!address) {
        return (
            <div className="flex h-[80vh] items-center justify-center text-zinc-500">
                Connect a wallet to use the console.
            </div>
        );
    }

    return (
        <BuildProvider queueItems={queueItems}>
            <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-zinc-950 text-zinc-100">
                {/* ── Sidebar ──────────────────────────────────────────── */}
                <aside className="flex w-72 shrink-0 flex-col border-r border-zinc-800">
                    {/* Mode toggle */}
                    <div className="flex border-b border-zinc-800">
                        {(["operating", "building"] as const).map((m) => (
                            <button
                                key={m}
                                onClick={() => setMode(m)}
                                className={`flex-1 px-3 py-2 text-xs font-medium uppercase tracking-wider transition-colors ${mode === m
                                    ? "bg-zinc-800/50 text-zinc-100"
                                    : "text-zinc-500 hover:text-zinc-300"
                                    }`}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                    {mode === "operating" && <SyncStatus />}
                    <div className="flex-1 overflow-y-auto">
                        {mode === "operating" ? <ProcessList /> : <AssemblyList />}
                    </div>
                </aside>

                {/* ── Main panel ───────────────────────────────────────── */}
                <main className="flex flex-1 flex-col overflow-hidden">
                    {mode === "operating" ? (
                        <>
                            {/* Operating tab bar */}
                            <div className="flex border-b border-zinc-800">
                                {(["inspect", "actions", "create", "timeline"] as const).map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setOperatingTab(tab)}
                                        className={`px-4 py-2 text-xs font-medium uppercase tracking-wider transition-colors ${operatingTab === tab
                                            ? "border-b-2 border-zinc-300 text-zinc-100"
                                            : "text-zinc-500 hover:text-zinc-300"
                                            }`}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                {operatingTab === "inspect" && <ProcessDetail />}
                                {operatingTab === "actions" && <ProposedActions />}
                                {operatingTab === "create" && <CreateOrderPanel />}
                                {operatingTab === "timeline" && <EventTimeline />}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 overflow-y-auto">
                            <AssemblyEditor />
                        </div>
                    )}
                </main>

                {/* ── Queue sidebar ─────────────────────────────────────── */}
                <aside className="w-80 shrink-0 overflow-y-auto border-l border-zinc-800">
                    <ActionQueuePanel />
                </aside>
            </div>
        </BuildProvider>
    );
}

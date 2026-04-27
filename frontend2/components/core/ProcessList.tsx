"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useOrderStore, OrderState } from "@/lib/core/store";
import { useWalletProcessIds, ProcessSummary } from "@/hooks/core/useWalletProcessIds";
import { isE2EMockSession } from "@/lib/shared/e2e";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

type SortKey = "newest" | "oldest" | "count";
type FilterKey = "all" | "active" | "done";

/**
 * ProcessList — shows the connected wallet's processes in a compact sidebar
 * panel.  Clicking a row sets `viewedProcessId` so the OrderGraph navigates
 * to that process.  Completely independent of the create-order form.
 */
export function ProcessList() {
    const { address } = useAccount();
    const isE2EMock = isE2EMockSession();
    const viewedProcessId = useOrderStore((s) => s.viewedProcessId);
    const setViewedProcessId = useOrderStore((s) => s.setViewedProcessId);
    const summaries = useWalletProcessIds(address);
    const [sortKey, setSortKey] = useState<SortKey>("newest");
    const [filterKey, setFilterKey] = useState<FilterKey>("all");
    const previousAddressRef = useRef<string | undefined>(undefined);
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const urlInitRef = useRef(false);

    // Hydrate viewedProcessId from URL on first mount
    useEffect(() => {
        if (urlInitRef.current) return;
        const urlProcessId = searchParams.get("processId");
        if (urlProcessId && urlProcessId !== viewedProcessId) {
            setViewedProcessId(urlProcessId);
        }
        urlInitRef.current = true;
    }, [searchParams, viewedProcessId, setViewedProcessId]);

    // Push viewedProcessId changes to URL (shallow)
    const handleSelectProcess = (id: string | null) => {
        setViewedProcessId(id);
        const params = new URLSearchParams(searchParams.toString());
        if (id) {
            params.set("processId", id);
        } else {
            params.delete("processId");
        }
        const qs = params.toString();
        router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    };

    // Keep the graph scoped to a process that actually belongs to the connected wallet.
    useEffect(() => {
        const selectionContext = isE2EMock ? "__mock__" : address?.toLowerCase();
        const contextChanged = previousAddressRef.current !== selectionContext;
        previousAddressRef.current = selectionContext;

        if (!isE2EMock && !address) return;
        if (summaries.length === 0) {
            if (contextChanged && viewedProcessId) setViewedProcessId(null);
            return;
        }

        const stillVisible = viewedProcessId
            ? summaries.some((summary) => summary.processId === viewedProcessId)
            : false;

        if (viewedProcessId && !contextChanged) {
            // Preserve an explicit selection while live wallet summaries catch up.
            // This is especially important in devnet flows where tests or receipt
            // handlers set a process ID before the sidebar history has reloaded.
            if (stillVisible) return;
            return;
        }

        const active = summaries.find((summary) => summary.hasActive);
        const nextViewedProcessId = (active ?? summaries[0]).processId;
        if (nextViewedProcessId !== viewedProcessId) {
            setViewedProcessId(nextViewedProcessId);
        }
    }, [address, isE2EMock, viewedProcessId, summaries, setViewedProcessId]);

    const filtered = useMemo<ProcessSummary[]>(() => {
        switch (filterKey) {
            case "active": return summaries.filter(s => s.hasActive);
            case "done": return summaries.filter(s => !s.hasActive);
            default: return summaries;
        }
    }, [summaries, filterKey]);

    const sorted = useMemo<ProcessSummary[]>(() => {
        const copy = [...filtered];
        switch (sortKey) {
            case "oldest": return copy.sort((a, b) => a.createdAt - b.createdAt);
            case "count": return copy.sort((a, b) => b.orderCount - a.orderCount);
            default: return copy.sort((a, b) => b.createdAt - a.createdAt); // newest
        }
    }, [filtered, sortKey]);

    if (!address && !isE2EMock) {
        return (
            <div data-testid="process-list-empty" className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-black mb-2">My Processes</h3>
                <p className="text-xs text-gray-500">Connect a wallet to load your process history.</p>
            </div>
        );
    }

    if (summaries.length === 0) {
        return (
            <div data-testid="process-list-empty" className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-black mb-2">My Processes</h3>
                <p className="text-xs text-gray-500">No processes yet. Commit an order to start your first process graph.</p>
            </div>
        );
    }

    // Badge helpers
    const getBadge = (s: ProcessSummary) => {
        if (s.hasActive) return { label: "Active", color: "bg-green-100 text-green-700" };
        return { label: "Done", color: "bg-gray-100 text-gray-500" };
    };

    // Counts for filter button labels
    const counts: Record<FilterKey, number> = {
        all: summaries.length,
        active: summaries.filter(s => s.hasActive).length,
        done: summaries.filter(s => !s.hasActive).length,
    };

    return (
        <div
            data-testid="process-list"
            className="bg-white border border-gray-200 rounded-lg p-4"
        >
            <h3 className="text-sm font-semibold text-black mb-2">My Processes</h3>

            {/* Filter controls */}
            <div className="flex items-center gap-1 mb-2 flex-wrap">
                <span className="text-xs text-gray-500 mr-0.5">Filter:</span>
                {(["all", "active", "done"] as FilterKey[]).map(k => (
                    <button
                        key={k}
                        data-testid={`process-filter-${k}`}
                        onClick={() => setFilterKey(k)}
                        className={`text-xs px-2 py-1.5 min-h-[44px] rounded transition-colors capitalize ${filterKey === k
                            ? "bg-black text-white"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                            }`}
                    >
                        {k}{counts[k] > 0 && k !== "all" ? ` (${counts[k]})` : k === "all" ? ` (${counts[k]})` : ""}
                    </button>
                ))}
            </div>

            {/* Sort controls */}
            <div className="flex items-center gap-1 mb-3">
                <span className="text-xs text-gray-500 mr-0.5">Sort:</span>
                {(["newest", "oldest", "count"] as SortKey[]).map(k => (
                    <button
                        key={k}
                        onClick={() => setSortKey(k)}
                        className={`text-xs px-2 py-1.5 min-h-[44px] rounded transition-colors ${sortKey === k
                            ? "bg-black text-white"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                            }`}
                    >
                        {k === "newest" ? "New" : k === "oldest" ? "Old" : "↕N"}
                    </button>
                ))}
            </div>

            {sorted.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No {filterKey === "all" ? "" : filterKey} processes.</p>
            ) : (
                <ul className="space-y-2">
                    {sorted.map((s, idx) => {
                        const isViewed = s.processId === viewedProcessId;
                        const { label: badge, color: badgeColor } = getBadge(s);

                        return (
                            <li key={s.processId}>
                                {/* Process header row */}
                                <button
                                    data-testid={`process-item-${s.processId.slice(0, 10)}`}
                                    onClick={() => handleSelectProcess(s.processId)}
                                    className={`w-full flex items-center gap-2 px-3 py-2 rounded text-left text-xs transition-colors ${isViewed
                                        ? "bg-black text-white"
                                        : "bg-gray-50 hover:bg-gray-100 text-black"
                                        }`}
                                >
                                    <span className={`shrink-0 font-mono text-xs opacity-50 w-5 text-right ${isViewed ? "text-white" : "text-gray-500"}`}>
                                        {idx + 1}
                                    </span>
                                    {/* "Process ID" chip */}
                                    <span className={`shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded ${isViewed ? "bg-white/20 text-white" : "bg-gray-200 text-gray-500"}`}>
                                        Process
                                    </span>
                                    <span className="font-mono truncate flex-1">
                                        {s.processId.slice(0, 10)}…
                                    </span>
                                    {badge && (
                                        <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${isViewed ? "bg-white/20 text-white" : badgeColor}`}>
                                            {badge}
                                        </span>
                                    )}
                                </button>

                                {/* Financials link — process consolidated view */}
                                <div className="ml-4 mt-1">
                                    <Link
                                        href={`/financials/${s.processId}`}
                                        data-testid={`process-financials-link-${s.processId.slice(0, 10)}`}
                                        className="text-[10px] font-mono text-neutral-500 hover:text-black hover:underline"
                                    >
                                        Financials →
                                    </Link>
                                </div>

                                {/* Order sub-list — always visible beneath the process row */}
                                {s.orders.length > 0 && (
                                    <ul className="ml-4 mt-1 space-y-0.5 border-l-2 border-gray-100 pl-2">
                                        {s.orders.map(o => {
                                            const stateLabel =
                                                o.state === OrderState.Active ? "Active" : "Resolved";
                                            const stateColor =
                                                o.state === OrderState.Active ? "text-green-700" : "text-gray-500";
                                            return (
                                                <li
                                                    key={o.id.toString()}
                                                    data-testid={`process-order-item-${o.id.toString()}`}
                                                    className="flex items-center gap-2 text-xs py-0.5 text-gray-600"
                                                >
                                                    <span className="font-mono">Order #{o.id.toString()}</span>
                                                    <span className={`text-xs font-medium ${stateColor}`}>{stateLabel}</span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

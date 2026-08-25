"use client";

/**
 * Process evidence display.
 *
 * A forum-agnostic, embeddable reader of a Figaro process's on-chain evidence
 * timeline. Any arbitration forum (e.g. Kleros's Dispute Resolver) can iframe
 * this page so a reviewer sees every lifecycle event without leaving the forum
 * UI; it is equally a standalone public reader by URL. Figaro renders the
 * evidence — it does not run the forum.
 *
 * Query params:
 *   - processId:            The Figaro process ID (bytes32-hex)   [required]
 *   - coreAddress:          FigaroCore contract address (the core the process settled on)
 *   - chainID:              Chain ID (e.g. 31337, 1, 100)
 *   - arbitrableJsonRpcUrl: (optional) RPC URL to read events from
 *   - disputeID:            (optional) a forum-side dispute reference, shown for context
 */

import { Suspense, useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createPublicClient, isAddress } from "viem";
import { mockAwareHttp } from "@/lib/shared/mockTransport";
import { buildProcessTimeline, type ProcessTimeline, type TimelineEvent } from "@/lib/audit/processTimeline";
import { truncateHex } from "@/lib/shared/formatHex";
import { extractErrorMessage } from "@/lib/shared/errors";
import { formatBlockTimestamp } from "@/lib/shared/formatTimestamp";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Timeline entries carry block time as ISO — render via the one shared
 *  chain-time formatter, seconds precision. */
function formatTimestamp(iso: string): string {
    return formatBlockTimestamp(Date.parse(iso) / 1000, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
}

/** Color map for the event names `buildProcessTimeline` emits.
 *
 *  Deliberately OUTSIDE the status-token system (DESIGN_TOKENS §1): these are
 *  a CATEGORICAL encoding — one hue per event kind, needing mutual
 *  distinguishability, not a good/bad reading. Mapping them onto
 *  success/warning/error would assert a valence the timeline does not have. */
const EVENT_COLORS: Record<string, string> = {
    OrderCommitted: "bg-blue-500",
    Attestation: "bg-green-500",
    OrderResolved: "bg-emerald-600",
};

/** Validate an RPC URL to prevent SSRF via attacker-controlled endpoints. */
function isAllowedRpcUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        // Allow only http/https schemes (no file://, ftp://, etc.)
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
        // Allow localhost/127.0.0.1 for dev, and any https endpoint for prod
        if (parsed.protocol === "https:") return true;
        if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") return true;
        return false;
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Timeline Event Card
// ---------------------------------------------------------------------------

function TimelineEventCard({ event, index }: { event: TimelineEvent; index: number }) {
    const dotColor = EVENT_COLORS[event.eventName] ?? "bg-gray-400";
    const detailEntries = Object.entries(event.details).filter(([, v]) => v !== "");

    return (
        <div className="relative pl-8 pb-6 last:pb-0">
            {/* Vertical connector line */}
            <div className="absolute left-[11px] top-6 bottom-0 w-px bg-default last:hidden" />

            {/* Dot */}
            <div className={`absolute left-1 top-1.5 w-[14px] h-[14px] rounded-full border-2 border-paper ${dotColor} shadow-sm`} />

            {/* Content */}
            <div className="bg-paper border border-default rounded-lg p-3 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-ink-primary">
                        {event.label}
                    </span>
                    <span className="text-xs text-ink-muted font-mono">
                        #{index + 1}
                    </span>
                </div>

                <div className="text-xs text-ink-muted mb-2">
                    {formatTimestamp(event.iso)} · Block {event.blockNumber.toString()}
                </div>

                {/* Event details */}
                {detailEntries.length > 0 && (
                    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                        {detailEntries.map(([key, val]) => (
                            <div key={key} className="contents">
                                <span className="text-ink-muted font-mono">{key}</span>
                                <span className="text-ink-body font-mono truncate" title={val}>
                                    {key.toLowerCase().includes("address") || key === "buyer" || key === "seller"
                                        ? truncateHex(val)
                                        : val}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Tx hash link */}
                <div className="mt-2 text-xs text-ink-muted font-mono truncate" title={event.txHash}>
                    tx: {event.txHash}
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Summary Bar
// ---------------------------------------------------------------------------

function SummaryBar({ timeline }: { timeline: ProcessTimeline }) {
    const s = timeline.summary;
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
            {[
                { label: "Orders", value: s.orderCount },
                { label: "Resolved", value: s.resolvedCount },
                { label: "Cancelled", value: s.cancelledCount },
                { label: "Total Payment", value: s.totalPayment },
            ].map(({ label, value }) => (
                <div key={label} className="bg-subtle rounded-lg p-2 text-center">
                    <div className="text-xs text-ink-muted">{label}</div>
                    <div className="text-sm font-semibold text-ink-body">{String(value)}</div>
                </div>
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

function EvidenceDisplayContent() {
    const searchParams = useSearchParams();

    const processId = searchParams.get("processId") as `0x${string}` | null;
    const chainIdRaw = searchParams.get("chainID");
    const coreAddressParam = searchParams.get("coreAddress") as `0x${string}` | null;
    const rpcUrl = searchParams.get("arbitrableJsonRpcUrl");
    const disputeIdRaw = searchParams.get("disputeID");

    // RA-3: Validate chainID and disputeID as positive integers
    const chainIdParam = chainIdRaw && /^\d{1,10}$/.test(chainIdRaw) ? chainIdRaw : null;
    const disputeID = disputeIdRaw && /^\d{1,20}$/.test(disputeIdRaw) ? disputeIdRaw : null;

    const [timeline, setTimeline] = useState<ProcessTimeline | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const clientError = useMemo(() => {
        if (!rpcUrl) return null;
        return isAllowedRpcUrl(rpcUrl)
            ? null
            : "Untrusted RPC URL — only HTTPS or localhost endpoints are allowed.";
    }, [rpcUrl]);

    // Build a viem client from query params (may run inside a forum's iframe
    // where we cannot rely on the wagmi provider).
    const client = useMemo(() => {
        if (!rpcUrl || clientError) return null;
        return createPublicClient({ transport: mockAwareHttp(rpcUrl) });
    }, [rpcUrl, clientError]);

    const fetchTimeline = useCallback(async () => {
        if (!processId) {
            setError("Missing processId query parameter.");
            setLoading(false);
            return;
        }
        if (clientError) {
            setError(clientError);
            setLoading(false);
            return;
        }
        if (!client) {
            setError("Missing arbitrableJsonRpcUrl query parameter — cannot connect to chain.");
            setLoading(false);
            return;
        }
        if (coreAddressParam && !isAddress(coreAddressParam)) {
            setError("Invalid coreAddress — must be a valid Ethereum address.");
            setLoading(false);
            return;
        }

        try {
            const tl = await buildProcessTimeline(client, processId, coreAddressParam ?? undefined);
            setTimeline(tl);
        } catch (cause: unknown) {
            setError(extractErrorMessage(cause, "Failed to fetch process timeline."));
        } finally {
            setLoading(false);
        }
    }, [client, clientError, processId, coreAddressParam]);

    useEffect(() => {
        fetchTimeline();
    }, [fetchTimeline]);

    // ── Loading state ───────────────────────────────────────────────
    if (loading) {
        return (
            <div className="min-h-screen bg-canvas flex items-center justify-center">
                <div className="text-sm text-ink-muted animate-pulse">
                    Loading process timeline…
                </div>
            </div>
        );
    }

    // ── Error state ─────────────────────────────────────────────────
    if (error) {
        return (
            <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
                <div className="bg-paper rounded-lg border border-error/30 p-6 max-w-md text-center">
                    <h2 className="text-sm font-semibold text-error-fg mb-2">Error</h2>
                    <p className="text-xs text-ink-body">{error}</p>
                </div>
            </div>
        );
    }

    if (!timeline) return null;

    // ── Success ─────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-canvas p-4 sm:p-6">
            <article className="max-w-2xl mx-auto">
                {/* Header */}
                <header className="mb-6">
                    <h1 className="text-lg font-bold text-ink-primary">
                        Figaro Process Timeline
                    </h1>
                    <p className="text-xs text-ink-muted mt-1">
                        On-chain lifecycle evidence for dispute{disputeID ? ` #${disputeID}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted font-mono">
                        <span>process: {timeline.processId}</span>
                        <span>chain: {chainIdParam ?? timeline.chainId}</span>
                        <span>core: {truncateHex(coreAddressParam ?? timeline.coreAddress)}</span>
                        <span>generated: {formatTimestamp(timeline.generatedAt)}</span>
                    </div>
                </header>
                {timeline.participants.length > 0 && (
                    <div className="mb-4">
                        <h2 className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1">
                            Participants
                        </h2>
                        <div className="flex flex-wrap gap-1">
                            {timeline.participants.map((addr) => (
                                <span
                                    key={addr}
                                    className="inline-block bg-subtle text-ink-body rounded px-2 py-0.5 text-xs font-mono"
                                    title={addr}
                                >
                                    {truncateHex(addr)}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Summary */}
                <SummaryBar timeline={timeline} />

                {/* Timeline */}
                <div className="relative">
                    {timeline.events.length === 0 ? (
                        <p className="text-xs text-ink-muted text-center py-8">
                            No lifecycle events found for this process.
                        </p>
                    ) : (
                        timeline.events.map((ev, i) => (
                            <TimelineEventCard key={`${ev.txHash}-${ev.orderHash}-${i}`} event={ev} index={i} />
                        ))
                    )}
                </div>

                {/* Footer */}
                <footer className="mt-8 pt-4 border-t border-default text-center">
                    <p className="text-xs text-ink-muted">
                        All data sourced from on-chain events emitted by FigaroCore at{" "}
                        <span className="font-mono">{truncateHex(timeline.coreAddress)}</span>
                        {" "}on chain {timeline.chainId}. Events are immutable and block-timestamped.
                    </p>
                </footer>
            </article>
        </div>
    );
}

export default function EvidenceDisplayPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen flex items-center justify-center">
                    <p className="text-sm text-ink-muted">Loading evidence…</p>
                </div>
            }
        >
            <EvidenceDisplayContent />
        </Suspense>
    );
}

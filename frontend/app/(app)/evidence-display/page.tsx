"use client";

/**
 * Kleros Evidence Display Interface
 *
 * This page is designed to be iframed by the Kleros court. When jurors view
 * a Figaro process dispute, Kleros loads this page with query parameters
 * identifying the dispute. The page renders the full on-chain timeline so
 * jurors can review all lifecycle events without leaving the court UI.
 *
 * Expected query params (from Kleros MetaEvidence evidenceDisplayInterfaceURI):
 *   - disputeID:               Dispute ID on the Arbitrator
 *   - chainID:                 Chain ID (e.g. 31337, 1, 100)
 *   - arbitrableContractAddress: ArbitrableProxy address
 *   - arbitrableJsonRpcUrl:    (optional) RPC URL to use for reading events
 *
 * Figaro-specific params (appended by our MetaEvidence or evidence JSON):
 *   - processId:               The Figaro process ID (bytes32-hex)
 *   - coreAddress:             FigaroCore contract address
 */

import { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createPublicClient, isAddress } from "viem";
import { mockAwareHttp } from "@/lib/shared/mockTransport";
import { buildProcessTimeline, type ProcessTimeline, type TimelineEvent } from "@/lib/dispute";
import { resolveContentURI } from "@/lib/shared/sellerBranding";
import { safeJsonFromResponse } from "@/lib/shared/safeJson";
import { truncateHex } from "@/lib/shared/formatHex";
import { extractErrorMessage } from "@/lib/shared/errors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
}

/** Color map for event types */
const EVENT_COLORS: Record<string, string> = {
    OrderCreated: "bg-blue-500",
    OrderAccepted: "bg-green-500",
    OrderResolved: "bg-emerald-600",
    OrderCancelled: "bg-red-500",
};

// ---------------------------------------------------------------------------
// IPFS Artifact Viewer — renders attestation photos from IPFS CIDs
// ---------------------------------------------------------------------------

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

/** Validate an IPFS CID (base58 Qm... or base32 bafy...). */
function isValidCID(cid: string): boolean {
    return /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{55})$/.test(cid);
}

function IpfsPhotoViewer({ cid, caption }: { cid: string; caption: string }) {
    if (!isValidCID(cid)) return null;
    const url = resolveContentURI(`ipfs://${cid}`);
    return (
        <div className="mt-2 border border-gray-200 rounded overflow-hidden" data-testid="ipfs-photo">
            {/* eslint-disable-next-line @next/next/no-img-element -- Evidence media comes from dynamic IPFS gateways and uses runtime load-failure hiding. */}
            <img
                src={url}
                alt={caption}
                className="w-full max-h-48 object-contain bg-gray-50"
                loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <p className="text-xs text-gray-500 px-2 py-1 font-mono truncate">{cid}</p>
        </div>
    );
}

// ---------------------------------------------------------------------------
// IPFS Attestation Renderer — fetches and displays attestation JSON from IPFS
// ---------------------------------------------------------------------------

function AttestationViewer({ cid }: { cid: string }) {
    const [attestation, setAttestation] = useState<Record<string, unknown> | null>(null);

    useEffect(() => {
        if (!isValidCID(cid)) return;
        const url = resolveContentURI(`ipfs://${cid}`);
        fetch(url)
            .then((r) => safeJsonFromResponse<Record<string, unknown>>(r))
            .then((data) => setAttestation(data))
            .catch(() => setAttestation(null));
    }, [cid]);

    if (!attestation) return null;

    const mode = attestation.mode as string | undefined;
    const photoCID = attestation.photoCID as string | undefined;

    return (
        <div className="mt-2 bg-gray-50 border border-gray-200 rounded p-2 text-xs space-y-1" data-testid="attestation-viewer">
            <div className="font-semibold text-gray-600">
                {mode === "photo-gps" ? "📸 Photo + GPS Attestation" :
                    mode === "geohash-match" ? "📍 Geohash Match Attestation" :
                        "📋 Attestation Evidence"}
            </div>
            {attestation.latitude !== undefined && (
                <p className="text-gray-500">
                    Location: {Number(attestation.latitude).toFixed(6)}, {Number(attestation.longitude).toFixed(6)}
                    {attestation.accuracyMeters ? ` (±${Number(attestation.accuracyMeters).toFixed(0)}m)` : ""}
                </p>
            )}
            {!!attestation.geohash && (
                <p className="text-gray-500 font-mono">Geohash: {String(attestation.geohash)}</p>
            )}
            {!!attestation.fulfillerGeohash && (
                <p className="text-gray-500 font-mono">
                    Fulfiller: {String(attestation.fulfillerGeohash)} vs Order: {String(attestation.orderDropoffGeohash)}
                    {" — "}{attestation.matches ? "✅ Match" : "❌ No match"}
                </p>
            )}
            {!!attestation.notes && (
                <p className="text-gray-500 italic">&ldquo;{String(attestation.notes)}&rdquo;</p>
            )}
            {photoCID && <IpfsPhotoViewer cid={photoCID} caption="Delivery photo evidence" />}
        </div>
    );
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
            <div className="absolute left-[11px] top-6 bottom-0 w-px bg-gray-200 last:hidden" />

            {/* Dot */}
            <div className={`absolute left-1 top-1.5 w-[14px] h-[14px] rounded-full border-2 border-white ${dotColor} shadow-sm`} />

            {/* Content */}
            <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-gray-800">
                        {event.label}
                    </span>
                    <span className="text-xs text-gray-500 font-mono">
                        #{index + 1}
                    </span>
                </div>

                <div className="text-xs text-gray-500 mb-2">
                    {formatTimestamp(event.iso)} · Block {event.blockNumber.toString()}
                </div>

                {/* Event details */}
                {detailEntries.length > 0 && (
                    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                        {detailEntries.map(([key, val]) => (
                            <div key={key} className="contents">
                                <span className="text-gray-500 font-mono">{key}</span>
                                <span className="text-gray-600 font-mono truncate" title={val}>
                                    {key.toLowerCase().includes("address") || key === "buyer" || key === "seller"
                                        ? truncateHex(val)
                                        : val}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Attestation artifacts (evidence submissions carry attestationCID) */}
                {event.details.attestationCID && (
                    <AttestationViewer cid={event.details.attestationCID} />
                )}

                {/* Photo evidence (some events carry photoCID directly) */}
                {event.details.photoCID && !event.details.attestationCID && (
                    <IpfsPhotoViewer cid={event.details.photoCID} caption="Photo evidence" />
                )}

                {/* Tx hash link */}
                <div className="mt-2 text-xs text-gray-500 font-mono truncate" title={event.txHash}>
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
                <div key={label} className="bg-gray-50 rounded-lg p-2 text-center">
                    <div className="text-xs text-gray-500">{label}</div>
                    <div className="text-sm font-semibold text-gray-700">{String(value)}</div>
                </div>
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function EvidenceDisplayPage() {
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

    // Build a viem client from query params (runs inside Kleros iframe
    // so we cannot rely on wagmi provider).
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
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-sm text-gray-500 animate-pulse">
                    Loading process timeline…
                </div>
            </div>
        );
    }

    // ── Error state ─────────────────────────────────────────────────
    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-lg border border-red-200 p-6 max-w-md text-center">
                    <h2 className="text-sm font-semibold text-red-600 mb-2">Error</h2>
                    <p className="text-xs text-gray-600">{error}</p>
                </div>
            </div>
        );
    }

    if (!timeline) return null;

    // ── Success ─────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
            <article className="max-w-2xl mx-auto">
                {/* Header */}
                <header className="mb-6">
                    <h1 className="text-lg font-bold text-gray-800">
                        Figaro Process Timeline
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">
                        On-chain lifecycle evidence for dispute{disputeID ? ` #${disputeID}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 font-mono">
                        <span>process: {timeline.processId}</span>
                        <span>chain: {chainIdParam ?? timeline.chainId}</span>
                        <span>core: {truncateHex(coreAddressParam ?? timeline.coreAddress)}</span>
                        <span>generated: {formatTimestamp(timeline.generatedAt)}</span>
                    </div>
                </header>
                {timeline.participants.length > 0 && (
                    <div className="mb-4">
                        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                            Participants
                        </h2>
                        <div className="flex flex-wrap gap-1">
                            {timeline.participants.map((addr) => (
                                <span
                                    key={addr}
                                    className="inline-block bg-gray-100 text-gray-600 rounded px-2 py-0.5 text-xs font-mono"
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
                        <p className="text-xs text-gray-500 text-center py-8">
                            No lifecycle events found for this process.
                        </p>
                    ) : (
                        timeline.events.map((ev, i) => (
                            <TimelineEventCard key={`${ev.txHash}-${ev.orderHash}-${i}`} event={ev} index={i} />
                        ))
                    )}
                </div>

                {/* Footer */}
                <footer className="mt-8 pt-4 border-t border-gray-200 text-center">
                    <p className="text-xs text-gray-500">
                        All data sourced from on-chain events emitted by FigaroCore at{" "}
                        <span className="font-mono">{truncateHex(timeline.coreAddress)}</span>
                        {" "}on chain {timeline.chainId}. Events are immutable and block-timestamped.
                    </p>
                </footer>
            </article>
        </div>
    );
}

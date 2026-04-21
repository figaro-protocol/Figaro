"use client";

/**
 * Dispute status display for a Figaro process.
 *
 * Shows:
 *   - Whether a Kleros dispute has been raised
 *   - Current ruling status (pending / ruled)
 *   - Link to the case on resolve.kleros.io
 *   - Button to raise a dispute (if none exists)
 *   - Button to submit additional evidence
 *
 * This component is process-scoped. Mount it in any process detail view.
 */

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { Card } from "@/components/ui/Card";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";
import {
    buildProcessTimeline,
    buildExtendedTimeline,
    buildTimelineEvidence,
    buildFigaroMetaEvidence,
    fetchRuling,
    createDispute,
    submitEvidence,
    getArbitrationCost,
    type KlerosConfig,
    type DisputeStatus,
    type ProcessTimeline,
    type CoordinatorEventSource,
} from "@/lib/dispute";

// ---------------------------------------------------------------------------
// Config — populated from env or props
// ---------------------------------------------------------------------------

const KLEROS_RESOLVER_BASE = "https://resolve.kleros.io";

/** Ruling labels matching our MetaEvidence rulingOptions.titles order. */
const RULING_LABELS: Record<number, string> = {
    0: "No ruling / Refused to arbitrate",
    1: "Obligations fulfilled",
    2: "Obligations not fulfilled",
};

// ---------------------------------------------------------------------------
// Dispute ID persistence (localStorage)
// ---------------------------------------------------------------------------

const DISPUTE_STORAGE_PREFIX = "figaro:dispute:";

function loadDisputeId(processId: string): bigint | null {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem(`${DISPUTE_STORAGE_PREFIX}${processId}`);
    return stored !== null ? BigInt(stored) : null;
}

function saveDisputeId(processId: string, id: bigint): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(`${DISPUTE_STORAGE_PREFIX}${processId}`, id.toString());
}

// ---------------------------------------------------------------------------
// Evidence display URI builder
// ---------------------------------------------------------------------------

function buildEvidenceDisplayURI(processId: string, chainId: number): string {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const params = new URLSearchParams({ processId, chainID: String(chainId) });
    return `${base}/evidence-display?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DisputeStatusPanelProps {
    processId: `0x${string}`;
    /** Kleros configuration. If omitted, the panel shows as "not configured". */
    klerosConfig?: KlerosConfig;
    /** If known, the local dispute ID on the ArbitrableProxy. */
    localDisputeId?: bigint;
    /** Role of the current user — determines evidence framing. */
    role?: "buyer" | "seller";
    /**
     * Optional coordinator event sources for extended timelines.
     * When provided, evidence submissions include coordinator-specific events
     * (lifecycle signals, proximity proofs, etc.) alongside FigaroCore events.
     */
    coordinatorSources?: CoordinatorEventSource[];
    /** Callback when a dispute is created (returns localDisputeId). */
    onDisputeCreated?: (localDisputeId: bigint) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DisputeStatusPanel({
    processId,
    klerosConfig,
    localDisputeId: externalDisputeId,
    role = "buyer",
    coordinatorSources,
    onDisputeCreated,
}: DisputeStatusPanelProps) {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();
    const { evidenceTransport } = useRuntimeServices();

    const [disputeId, setDisputeId] = useState<bigint | null>(
        externalDisputeId ?? loadDisputeId(processId),
    );
    const [status, setStatus] = useState<DisputeStatus | null>(null);
    const [timeline, setTimeline] = useState<ProcessTimeline | null>(null);
    const [arbCost, setArbCost] = useState<bigint | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastEvidenceTxHash, setLastEvidenceTxHash] = useState<`0x${string}` | null>(null);

    // Sync external disputeId prop
    useEffect(() => {
        if (externalDisputeId !== undefined) setDisputeId(externalDisputeId);
    }, [externalDisputeId]);

    // ── Fetch ruling status ─────────────────────────────────────────
    useEffect(() => {
        if (!publicClient || !klerosConfig || disputeId === null) return;
        let cancelled = false;

        fetchRuling(publicClient, klerosConfig, disputeId)
            .then((s) => { if (!cancelled) setStatus(s); })
            .catch(() => { /* dispute may not exist yet */ });

        return () => { cancelled = true; };
    }, [publicClient, klerosConfig, disputeId]);

    // ── Fetch arbitration cost ──────────────────────────────────────
    useEffect(() => {
        if (!publicClient || !klerosConfig) return;
        let cancelled = false;

        getArbitrationCost(publicClient, klerosConfig)
            .then((c) => { if (!cancelled) setArbCost(c); })
            .catch(() => { });

        return () => { cancelled = true; };
    }, [publicClient, klerosConfig]);

    // ── Build timeline on demand ────────────────────────────────────
    const loadTimeline = useCallback(async () => {
        if (!publicClient) return null;
        if (timeline) return timeline;
        const tl = coordinatorSources?.length
            ? await buildExtendedTimeline(publicClient, processId, coordinatorSources)
            : await buildProcessTimeline(publicClient, processId);
        setTimeline(tl);
        return tl;
    }, [publicClient, processId, timeline, coordinatorSources]);

    // ── Raise dispute ───────────────────────────────────────────────
    const handleRaiseDispute = useCallback(async () => {
        if (!walletClient || !publicClient || !klerosConfig) return;
        setLoading(true);
        setError(null);

        try {
            const chainId = await publicClient.getChainId();
            const evidenceDisplayURI = buildEvidenceDisplayURI(processId, chainId);

            const metaEvidence = buildFigaroMetaEvidence(undefined, evidenceDisplayURI);
            const metaEvidenceCID = await evidenceTransport.pinJSON(metaEvidence);
            const metaEvidenceURI = evidenceTransport.buildPath(metaEvidenceCID);

            const newId = await createDispute(
                walletClient,
                publicClient,
                klerosConfig,
                metaEvidenceURI,
                2, // two ruling options
            );

            saveDisputeId(processId, newId);
            setDisputeId(newId);
            onDisputeCreated?.(newId);
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            setError(message || "Failed to create dispute");
        } finally {
            setLoading(false);
        }
    }, [walletClient, publicClient, klerosConfig, processId, onDisputeCreated, evidenceTransport]);

    // ── Submit evidence ─────────────────────────────────────────────
    const handleSubmitEvidence = useCallback(async () => {
        if (!walletClient || !klerosConfig || disputeId === null) return;
        setLoading(true);
        setError(null);

        try {
            const tl = await loadTimeline();
            if (!tl) throw new Error("Could not build process timeline");

            // Pin timeline JSON to IPFS, then wrap in Evidence envelope.
            const timelineCID = await evidenceTransport.pinJSON(tl);
            const evidence = buildTimelineEvidence(tl, timelineCID, role);
            const evidenceCID = await evidenceTransport.pinJSON(evidence);
            const evidenceURI = evidenceTransport.buildPath(evidenceCID);

            const txHash = await submitEvidence(walletClient, klerosConfig, disputeId, evidenceURI);
            setLastEvidenceTxHash(txHash);
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            setError(message || "Failed to submit evidence");
        } finally {
            setLoading(false);
        }
    }, [walletClient, klerosConfig, disputeId, loadTimeline, role, evidenceTransport]);

    // ── Render ──────────────────────────────────────────────────────

    if (!klerosConfig) {
        return (
            <Card className="p-4 opacity-60">
                <h3 className="text-sm font-semibold text-gray-500">Dispute Resolution</h3>
                <p className="text-xs text-gray-500 mt-1">Kleros integration not configured.</p>
            </Card>
        );
    }

    const hasDispute = disputeId !== null;
    const isRuled = status?.isRuled ?? false;
    const rulingLabel = status ? (RULING_LABELS[status.ruling] ?? `Ruling #${status.ruling}`) : null;

    return (
        <Card className="p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Dispute Resolution
            </h3>

            {/* ── No dispute yet ──────────────────────────────── */}
            {!hasDispute && (
                <div className="space-y-2">
                    <p className="text-xs text-gray-500">
                        No dispute has been raised for this process.
                        If the parties cannot resolve the issue directly, a dispute
                        can be submitted to Kleros for an independent ruling.
                    </p>
                    {arbCost !== null && (
                        <div className="bg-amber-50 border border-amber-200 rounded p-2">
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-xs font-medium text-amber-800">Arbitration fee</span>
                                <span className="font-mono text-sm font-semibold text-amber-900">
                                    {(Number(arbCost) / 1e18).toFixed(4)} ETH
                                </span>
                                <span className="text-xs text-amber-600">(flat fee)</span>
                            </div>
                            <p className="text-xs text-amber-700 mt-1">
                                Paid by the party initiating the dispute. Fixed regardless of order size.
                            </p>
                        </div>
                    )}
                    <button
                        onClick={handleRaiseDispute}
                        disabled={loading || !address}
                        className="px-3 py-1.5 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {loading ? "Submitting…" : "Raise Dispute on Kleros"}
                    </button>
                </div>
            )}

            {/* ── Dispute exists ──────────────────────────────── */}
            {hasDispute && (
                <div className="space-y-2">
                    {/* Status badge */}
                    <div className="flex items-center gap-2">
                        <span
                            className={`inline-block w-2 h-2 rounded-full ${isRuled ? "bg-green-500" : "bg-yellow-500 animate-pulse"
                                }`}
                            role="img"
                            aria-label={isRuled ? "Ruling issued" : "Pending ruling"}
                        />
                        <span className="text-xs font-medium text-gray-600">
                            {isRuled ? "Ruling issued" : "Pending ruling"}
                        </span>
                    </div>

                    {/* Ruling result */}
                    {isRuled && rulingLabel && (
                        <p className="text-sm font-semibold text-gray-800">
                            {rulingLabel}
                        </p>
                    )}

                    {/* Kleros case link */}
                    {status?.disputeIDOnArbitratorSide !== undefined && (
                        <a
                            href={`${KLEROS_RESOLVER_BASE}/cases/${status.disputeIDOnArbitratorSide.toString()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block text-xs text-blue-600 hover:text-blue-800 underline"
                        >
                            View case on Kleros →
                        </a>
                    )}

                    {/* Last evidence submission receipt */}
                    {lastEvidenceTxHash && (
                        <p className="text-xs font-mono text-gray-500 break-all">
                            Last submission tx: {lastEvidenceTxHash}
                        </p>
                    )}

                    {/* Submit evidence button */}
                    {!isRuled && (
                        <button
                            onClick={handleSubmitEvidence}
                            disabled={loading || !address}
                            className="px-3 py-1.5 text-xs font-medium rounded bg-gray-700 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {loading ? "Submitting…" : "Submit Process Evidence"}
                        </button>
                    )}
                </div>
            )}

            {/* Error display */}
            {error && (
                <p className="mt-2 text-xs text-red-600">{error}</p>
            )}
        </Card>
    );
}

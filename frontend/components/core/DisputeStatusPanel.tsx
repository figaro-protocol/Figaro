"use client";

/**
 * Dispute status display for a Figaro process.
 *
 * Shows:
 *   - Whether a Kleros dispute has been raised
 *   - Current ruling status (pending / ruled)
 *   - Link to the case on resolve.kleros.io
 *   - Button to raise a dispute (if none exists)
 *   - Button to submit the audit-bundle PDF as evidence (with redact toggle)
 *
 * The audit-bundle PDF is the canonical evidence artifact: it carries the
 * FigaroCore lifecycle timeline, per-order Contract / Invoice / BoL clauses,
 * runtime attestations, consolidated financials, and the hash appendix all
 * in one cryptographically-verifiable document. Per-order timeline JSON is
 * no longer submitted separately — the bundle subsumes it.
 *
 * This component is process-scoped. Mount it in any process detail view.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import { Card } from "@/components/ui/Card";
import { useMounted } from "@/lib/shared/useMounted";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";
import { extractErrorMessage } from "@/lib/shared/errors";
import type { Order } from "@/lib/core/store";
import { CONTRACTS } from "@/lib/core/contracts";
import type { PartyRole } from "@/lib/core/walletProcessQueries";
import { buildAuditBundlePdfBlob } from "@/lib/audit/auditBundlePdf";
import { useProcessAgreements } from "@/hooks/core/useProcessAgreements";
import {
    buildAuditBundleEvidence,
    buildFigaroMetaEvidence,
    fetchRuling,
    createDispute,
    submitEvidence,
    getArbitrationCost,
    type KlerosConfig,
    type DisputeStatus,
    type CoordinatorEventSource,
    type JurisdictionRecourse,
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

function buildEvidenceDisplayURI(processId: string, chainId: number, coreAddress: string): string {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const params = new URLSearchParams({ processId, chainID: String(chainId) });
    // The juror-facing /evidence-display route rebuilds the process timeline
    // against `coreAddress`; without it the timeline binds to the env-default
    // FigaroCore, which may not be the core the disputed process settled on.
    if (coreAddress) params.set("coreAddress", coreAddress);
    return `${base}/evidence-display?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DisputeStatusPanelProps {
    processId: `0x${string}`;
    /** Kleros configuration. If omitted, the panel shows as "not configured".
     *  The caller derives it from the assembly's `figaro-arbitration-kleros-v1`
     *  clause — the court is the clause's; the arbitrableProxy address is
     *  deployment config. */
    klerosConfig?: KlerosConfig;
    /** Recourse forum(s) the assembly's dispute-resolution clauses authored
     *  (`figaro-arbitration-kleros-v1` and/or `figaro-applicable-law-v1`) —
     *  surfaced so the disputing party sees the forum the designer named.
     *  Display-only; the Kleros flow runs on klerosConfig. */
    recourses?: readonly JurisdictionRecourse[];
    /** If known, the local dispute ID on the ArbitrableProxy. */
    localDisputeId?: bigint;
    /** Role of the current user — determines evidence framing. */
    role?: PartyRole;
    /**
     * Optional coordinator event sources for the timeline page in the
     * audit-bundle PDF. When provided, the timeline includes
     * coordinator-specific events (lifecycle signals, proximity proofs,
     * etc.) alongside FigaroCore events.
     */
    coordinatorSources?: CoordinatorEventSource[];
    /**
     * All orders in the process. Required for the Submit Evidence flow
     * (the audit-bundle PDF aggregates per-order extracts). When omitted
     * or empty, the Submit Evidence button is hidden.
     */
    orders?: readonly Order[];
    /** Callback when a dispute is created (returns localDisputeId). */
    onDisputeCreated?: (localDisputeId: bigint) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DisputeStatusPanel({
    processId,
    klerosConfig,
    recourses,
    localDisputeId: externalDisputeId,
    role = "buyer",
    coordinatorSources,
    orders,
    onDisputeCreated,
}: DisputeStatusPanelProps) {
    const mounted = useMounted();
    const { address } = useAccount();
    const agreementHashes = useMemo(
        () => (orders ?? []).map((o) => o.agreementHash).filter((h): h is string => Boolean(h)),
        [orders],
    );
    const agreements = useProcessAgreements(agreementHashes);
    const publicClient = usePublicClient();
    const chainId = useChainId();
    const { data: walletClient } = useWalletClient();
    const { evidenceTransport } = useRuntimeServices();

    const [disputeId, setDisputeId] = useState<bigint | null>(
        externalDisputeId ?? loadDisputeId(processId),
    );
    const [status, setStatus] = useState<DisputeStatus | null>(null);
    const [arbCost, setArbCost] = useState<bigint | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastEvidenceTxHash, setLastEvidenceTxHash] = useState<`0x${string}` | null>(null);
    const [bundleRedact, setBundleRedact] = useState(false);

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

    // ── Raise dispute ───────────────────────────────────────────────
    const handleRaiseDispute = useCallback(async () => {
        if (!walletClient || !publicClient || !klerosConfig) return;
        setLoading(true);
        setError(null);

        try {
            const chainId = await publicClient.getChainId();
            const evidenceDisplayURI = buildEvidenceDisplayURI(processId, chainId, CONTRACTS.core);

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
            const message = extractErrorMessage(e, String(e));
            setError(message || "Failed to create dispute");
        } finally {
            setLoading(false);
        }
    }, [walletClient, publicClient, klerosConfig, processId, onDisputeCreated, evidenceTransport]);

    // ── Submit evidence (audit-bundle PDF, includes timeline) ───────
    const handleSubmitEvidence = useCallback(async () => {
        if (!walletClient || !klerosConfig || disputeId === null) return;
        if (!orders || orders.length === 0) return;
        setLoading(true);
        setError(null);

        try {
            // Build the process-scoped PDF in-browser. The bundle helper
            // applies the redaction flag at the source so every extractor
            // sees the redacted form (Option B: hash-then-encrypt; merkle
            // root preserved, only cleartext omitted). The timeline page
            // is rendered into the same PDF when a publicClient is
            // available.
            const pdfBlob = await buildAuditBundlePdfBlob(
                processId,
                orders,
                publicClient ?? undefined,
                chainId,
                agreements,
                {
                    redactLineItems: bundleRedact,
                    coordinatorSources,
                },
            );

            // Pin the PDF blob to IPFS, then build the Evidence envelope
            // pointing at it. The envelope itself is a JSON pin.
            const bundleCID = await evidenceTransport.pinBlob(pdfBlob);
            const evidence = buildAuditBundleEvidence(processId, bundleCID, role, {
                redacted: bundleRedact,
            });
            const evidenceCID = await evidenceTransport.pinJSON(evidence);
            const evidenceURI = evidenceTransport.buildPath(evidenceCID);

            const txHash = await submitEvidence(walletClient, klerosConfig, disputeId, evidenceURI);
            setLastEvidenceTxHash(txHash);
        } catch (e: unknown) {
            const message = extractErrorMessage(e, String(e));
            setError(message || "Failed to submit evidence");
        } finally {
            setLoading(false);
        }
    }, [walletClient, publicClient, chainId, klerosConfig, disputeId, orders, processId, role, bundleRedact, coordinatorSources, evidenceTransport]);

    // ── Render ──────────────────────────────────────────────────────

    // SSR-safe: this panel's output is wallet- and async-dependent
    // (`useAccount`, arbitration-cost + ruling fetches). Server-rendering
    // it produces a DOM the near-instant client wallet connection
    // immediately contradicts — a hydration mismatch that leaves the
    // subtree dead (the Raise Dispute button stuck at its server-disabled
    // value). Deferring all output to the client makes server and first
    // client render agree (both render nothing).
    if (!mounted) return null;

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

            {/* ── Recourse forum(s) the assembly authored ─────── */}
            {recourses && recourses.length > 0 && (
                <div
                    className="mb-3 rounded border border-neutral-200 bg-neutral-50 p-2 space-y-1"
                    data-testid="dispute-recourse-list"
                >
                    <p className="text-[11px] font-semibold text-neutral-500">
                        Recourse forum — from the assembly&apos;s dispute-resolution clauses
                    </p>
                    {recourses.map((r) =>
                        r.kind === "kleros" ? (
                            <p
                                key={`k-${r.court.key}`}
                                className="text-xs text-neutral-700"
                                data-testid="dispute-recourse-kleros"
                            >
                                Kleros — {r.court.name} · minimum {r.minJurors} jurors
                            </p>
                        ) : (
                            <p
                                key={`t-${r.applicableLaw}-${r.forum ?? ""}`}
                                className="text-xs text-neutral-700"
                                data-testid="dispute-recourse-traditional"
                            >
                                {r.forum ?? "Courts of competent jurisdiction"} · {r.applicableLaw}
                                {r.language ? ` · ${r.language}` : ""}
                            </p>
                        ),
                    )}
                </div>
            )}

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

                    {/* Submit evidence */}
                    {!isRuled && orders && orders.length > 0 && (
                        <div
                            className="flex flex-col gap-1.5 rounded border border-neutral-200 bg-neutral-50 p-2 mt-1"
                            data-testid="dispute-submit-evidence"
                        >
                            <label className="flex items-center gap-2 text-[11px] text-neutral-700 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={bundleRedact}
                                    onChange={(e) => setBundleRedact(e.target.checked)}
                                    disabled={loading}
                                    data-testid="dispute-submit-evidence-redact"
                                    className="h-3 w-3"
                                />
                                <span>
                                    Seal commerce line items
                                    {bundleRedact && (
                                        <span className="ml-1 text-amber-700 font-semibold">— 🔒 sealed</span>
                                    )}
                                </span>
                            </label>
                            <button
                                onClick={handleSubmitEvidence}
                                disabled={loading || !address}
                                data-testid="dispute-submit-evidence-button"
                                className="self-start px-3 py-1.5 text-xs font-medium rounded bg-black text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {loading
                                    ? "Submitting…"
                                    : bundleRedact
                                        ? "Submit Evidence (sealed)"
                                        : "Submit Evidence"}
                            </button>
                            <p className="text-[10px] text-neutral-600 leading-tight">
                                Builds the process-scoped audit bundle (process timeline,
                                contracts, invoices, BoL, attestations, financials) in your
                                browser, pins the PDF to IPFS, and submits the URI as
                                Kleros evidence.
                            </p>
                        </div>
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

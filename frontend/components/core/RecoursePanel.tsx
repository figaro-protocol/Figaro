"use client";

/**
 * Process recourse + evidence hand-off panel.
 *
 * Figaro does NOT run arbitration — the forum the assembly's dispute-resolution
 * clause names does. This panel does the one thing Figaro owns:
 *   - shows the dispute-resolution clause(s) the assembly authored, resolved
 *     GENERICALLY by article and rendered from each clause's own spec — the
 *     panel knows no clause, so any ADR / applicable-law clause (present or
 *     future) surfaces here unchanged;
 *   - assembles the timestamped evidence bundle (the audit-bundle PDF:
 *     lifecycle timeline, per-order clauses, runtime attestations,
 *     consolidated financials, hash appendix), pins it to IPFS, and offers it
 *     for download — the audit documentation IS the evidence;
 *   - for a forum that integrates its own dispute UI (e.g. Kleros's
 *     resolve.kleros.io — named only in the composition layer), deep-links a
 *     party into it with that evidence.
 *
 * Process-scoped. Mount it in any process detail view.
 */

import { useCallback, useMemo, useState } from "react";
import { usePublicClient, useChainId } from "wagmi";
import { Card } from "@/components/ui/Card";
import { useMounted } from "@/hooks/useMounted";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";
import { extractErrorMessage } from "@/lib/shared/errors";
import type { Order } from "@/lib/kernel/store";
import { buildAuditBundlePdfBlob } from "@/lib/audit/auditBundlePdf";
import { useProcessAgreements } from "@/hooks/core/useProcessAgreements";
import { describeClause, composesForumUrl } from "@/lib/shared/clauseSpecSource";
import type { RecourseClause } from "@/lib/semantic/processRecourse";

interface RecoursePanelProps {
    processId: `0x${string}`;
    /** The dispute-resolution clause(s) the assembly authored, resolved
     *  generically by article (any ADR/applicable-law clause, present or
     *  future). Rendered from each clause's own spec; a forum that integrates
     *  its own dispute UI gets a deep-link via the composition layer. */
    recourses?: readonly RecourseClause[];
    /** All orders in the process — the audit-bundle PDF aggregates per-order
     *  extracts. When omitted/empty, the evidence-bundle action is hidden. */
    orders?: readonly Order[];
}

export function RecoursePanel({
    processId,
    recourses,
    orders,
}: RecoursePanelProps) {
    const mounted = useMounted();
    const publicClient = usePublicClient();
    const chainId = useChainId();
    const { evidenceTransport } = useRuntimeServices();

    const agreementHashes = useMemo(
        () => (orders ?? []).map((o) => o.agreementHash).filter((h): h is string => Boolean(h)),
        [orders],
    );
    const agreements = useProcessAgreements(agreementHashes);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [bundleCID, setBundleCID] = useState<string | null>(null);
    const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);

    // Build the process-scoped audit bundle in-browser, pin it to IPFS.
    // Agreements are cleartext — no redacted distribution form. The pinned
    // CID is the evidence a party attaches on the forum's own UI.
    const handlePrepareBundle = useCallback(async () => {
        if (!orders || orders.length === 0) return;
        setLoading(true);
        setError(null);
        try {
            const blob = await buildAuditBundlePdfBlob(
                processId,
                orders,
                publicClient ?? undefined,
                chainId,
                agreements,
            );
            const cid = await evidenceTransport.pinBlob(blob);
            setPdfBlob(blob);
            setBundleCID(cid);
        } catch (e: unknown) {
            setError(extractErrorMessage(e, "Failed to build the evidence bundle"));
        } finally {
            setLoading(false);
        }
    }, [orders, processId, publicClient, chainId, agreements, evidenceTransport]);

    const handleDownload = useCallback(() => {
        if (!pdfBlob) return;
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `figaro-evidence-${processId.slice(0, 10)}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [pdfBlob, processId]);

    // SSR-safe: async/wallet-dependent output. Server render disagrees with
    // the near-instant client state — defer all output to the client so both
    // first renders agree (render nothing).
    if (!mounted) return null;

    const canBundle = orders !== undefined && orders.length > 0;

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
                    {recourses.map((r) => {
                        // Render generically from the clause's OWN spec — the panel
                        // knows no clause. A forum that integrates its own dispute UI
                        // gets a deep-link (composition); an un-integrated clause still
                        // surfaces, just without one.
                        const desc = describeClause(r.clauseId, r.data);
                        const forumUrl = composesForumUrl(r.clauseId);
                        return (
                            <div
                                key={r.clauseId}
                                className="text-xs text-neutral-700"
                                data-testid={`dispute-recourse-${r.clauseId}`}
                            >
                                <span className="font-medium">{desc.title}</span>
                                {desc.fields.length > 0 && (
                                    <span className="text-neutral-500">
                                        {" — "}
                                        {desc.fields.map((f) => `${f.label}: ${f.values.join(", ")}`).join(" · ")}
                                    </span>
                                )}
                                {forumUrl && (
                                    <a
                                        href={forumUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        data-testid="dispute-open-forum"
                                        className="ml-2 whitespace-nowrap text-blue-600 hover:text-blue-800 underline"
                                    >
                                        Open a dispute →
                                    </a>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <p className="text-xs text-gray-500">
                Figaro does not arbitrate. If the parties cannot resolve the issue
                directly, take the timestamped evidence bundle to the recourse forum
                and open the dispute in its own interface.
            </p>

            {/* ── Prepare + pin the evidence bundle ───────────── */}
            {canBundle && (
                <div
                    className="mt-2 flex flex-col gap-1.5 rounded border border-neutral-200 bg-neutral-50 p-2"
                    data-testid="dispute-evidence-bundle"
                >
                    <button
                        onClick={handlePrepareBundle}
                        disabled={loading}
                        data-testid="dispute-evidence-prepare"
                        className="self-start px-3 py-1.5 text-xs font-medium rounded bg-black text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {loading ? "Building…" : bundleCID ? "Rebuild evidence bundle" : "Prepare evidence bundle"}
                    </button>
                    <p className="text-[10px] text-neutral-600 leading-tight">
                        Builds the process-scoped audit bundle (timeline, contracts,
                        clause data, attestations, financials) in your browser and pins
                        the PDF to IPFS. Attach the pinned URI as evidence on the forum.
                    </p>

                    {bundleCID && (
                        <div className="mt-1 space-y-1" data-testid="dispute-evidence-result">
                            <p className="text-[10px] font-mono text-neutral-500 break-all">
                                ipfs://{bundleCID}
                            </p>
                            <button
                                onClick={handleDownload}
                                data-testid="dispute-evidence-download"
                                className="text-xs text-blue-600 hover:text-blue-800 underline"
                            >
                                Download evidence bundle (PDF)
                            </button>
                        </div>
                    )}
                </div>
            )}

            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </Card>
    );
}

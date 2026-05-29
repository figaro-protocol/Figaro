/**
 * GHGWorkflowPanel — GHG disclosure submission workflow for a process.
 * V5: event-sourced reads from AttestationCoordinator, writes via attestAsSeller/attestAsBuyer.
 *
 * Simplified from the V3 800+ line panel: V3 used nested contract storage reads
 * (boundaries → requirements → submissions). The live runtime uses flat attestation events filtered
 * by clauseId, with stage encoding the disclosure kind (0=Commitment, 1=Actual, etc.).
 */
"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { useSemanticProcessWorkspace } from "@/hooks/core/useSemanticProcessWorkspace";
import {
    useProcessDisclosureSummary,
    useOrderDisclosureTasks,
    formatActualGrams,
} from "@/lib/mechanisms/useGHGDisclosure";
import { CapabilityModel } from "@/lib/semantic/models";
import { DISCLOSURE_KIND, DISCLOSURE_KIND_LABELS, DISCLOSURE_KIND_DESCRIPTIONS } from "@/lib/mechanisms/contracts";
import { GHG_CLAUSE_KEY } from "@/lib/core/agreement";
import { truncateHex } from "@/lib/shared/formatHex";
import type { Hex } from "viem";
import { extractErrorMessage } from "@/lib/shared/errors";

// ── Order-level attestation panel ────────────────────────────────────────────

function findDisclosureCapability(orderCapabilities: CapabilityModel[] | undefined, kind: "submit-disclosure-commitment" | "submit-disclosure-inventory") {
    return (orderCapabilities ?? []).find(
        (capability) => capability.action.executionType === "transaction" && capability.action.kind === kind,
    );
}

function hasDisclosureCapability(orderCapabilities: CapabilityModel[] | undefined) {
    return !!findDisclosureCapability(orderCapabilities, "submit-disclosure-commitment")
        || !!findDisclosureCapability(orderCapabilities, "submit-disclosure-inventory");
}

function OrderAttestationDetail({
    orderHash,
    orderCapabilities,
    onExecuteCapability,
    executableCapabilityIds,
}: {
    orderHash: string;
    orderCapabilities: CapabilityModel[] | undefined;
    onExecuteCapability: (capability: CapabilityModel, input?: { kind: "submit-disclosure-inventory"; grams: bigint }) => Promise<void>;
    executableCapabilityIds: Set<string>;
}) {
    const { tasks, loading, refresh } = useOrderDisclosureTasks(orderHash);
    const [actualInput, setActualInput] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState("");
    const commitmentCapability = findDisclosureCapability(orderCapabilities, "submit-disclosure-commitment");
    const actualCapability = findDisclosureCapability(orderCapabilities, "submit-disclosure-inventory");
    const canSubmitCommitment = !!commitmentCapability && executableCapabilityIds.has(commitmentCapability.id);
    const canSubmitActual = !!actualCapability && executableCapabilityIds.has(actualCapability.id);

    const commitments = tasks.filter((t) => t.stage === DISCLOSURE_KIND.commitment);
    const actuals = tasks.filter((t) => t.stage === DISCLOSURE_KIND.inventory);
    const latestActual = actuals.length > 0 ? actuals[actuals.length - 1] : null;

    const handleSubmitCommitment = async () => {
        setError("");
        setIsSubmitting(true);
        try {
            if (!commitmentCapability) {
                setError("Disclosure commitment is not executable for the connected seller on this order.");
                return;
            }
            await onExecuteCapability(commitmentCapability);
            await refresh();
        } catch (cause: unknown) {
            setError(extractErrorMessage(cause, "Commitment attestation failed"));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmitActual = async (e: React.FormEvent) => {
        e.preventDefault();
        const grams = BigInt(Math.max(0, parseInt(actualInput || "0", 10) || 0));
        if (grams <= 0n) {
            setError("Enter a non-zero emissions value in grams CO2e.");
            return;
        }
        setError("");
        setIsSubmitting(true);
        try {
            if (!actualCapability) {
                setError("Selected order disclosure writes are only available to the seller on this order.");
                return;
            }
            await onExecuteCapability(actualCapability, { kind: "submit-disclosure-inventory", grams });
            setActualInput("");
            await refresh();
        } catch (cause: unknown) {
            setError(extractErrorMessage(cause, "Actual attestation failed"));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return <p className="text-xs text-gray-500">Loading attestations…</p>;
    }

    return (
        <div className="space-y-3" data-testid={`ghg-order-detail-${orderHash.slice(0, 10)}`}>
            <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-gray-500">{truncateHex(orderHash, { head: 14, tail: 0 })}</span>
                <span className="text-xs text-gray-500">{tasks.length} attestation{tasks.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Commitment status — ISO 14064-1 §5.1 */}
            <div className={`rounded border px-3 py-2 ${commitments.length > 0 ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
                <div className="flex items-center justify-between">
                    <span className="font-medium text-black text-sm">Commitment</span>
                    {commitments.length > 0
                        ? <span className="text-xs text-green-700 font-medium">Attested</span>
                        : <button
                            onClick={handleSubmitCommitment}
                            disabled={isSubmitting || !canSubmitCommitment}
                            className="text-xs px-2 py-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded"
                        >
                            {isSubmitting ? "…" : "Submit commitment"}
                        </button>
                    }
                </div>
                <p className="mt-1 text-[11px] text-gray-500">
                    {DISCLOSURE_KIND_DESCRIPTIONS[DISCLOSURE_KIND.commitment]}
                </p>
            </div>

            {/* Emissions inventory — ISO 14064-1 §5.2–5.4 */}
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-black text-sm">Emissions Inventory</span>
                    {latestActual?.actualGrams != null && (
                        <span className="text-xs text-green-700 font-medium">
                            Current: {formatActualGrams(latestActual.actualGrams)}
                        </span>
                    )}
                </div>
                <p className="mt-1 text-xs text-gray-600">
                    Quantified GHG statement in grams CO₂e (ISO 14064-1). A later attestation supersedes the current one.
                </p>
                <form onSubmit={handleSubmitActual} className="mt-3 flex gap-2">
                    <input
                        data-testid="ghg-actual-input"
                        type="number"
                        min={0}
                        step={1}
                        value={actualInput}
                        onChange={(e) => setActualInput(e.target.value)}
                        placeholder="e.g. 1250"
                        className="flex-1 border border-gray-300 rounded px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-black"
                    />
                    <button
                        data-testid="ghg-submit-actual"
                        type="submit"
                        disabled={isSubmitting || !canSubmitActual}
                        className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold rounded transition-colors"
                    >
                        {isSubmitting ? "Submitting..." : latestActual ? "Update inventory" : "Submit inventory"}
                    </button>
                </form>
                {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
            </div>

            {!canSubmitCommitment && !canSubmitActual && (
                <p className="text-xs text-gray-500">
                    Disclosure writes are available only to the connected seller on eligible orders.
                </p>
            )}

            {/* Attestation timeline */}
            {tasks.length > 0 && (
                <div className="border-t border-gray-100 pt-2 space-y-1">
                    {tasks.map((t, i) => (
                        <div
                            key={`${t.orderHash}-${t.stage}-${t.blockNumber}-${i}`}
                            className="flex items-center justify-between text-[11px] text-gray-600"
                        >
                            <span>{DISCLOSURE_KIND_LABELS[t.stage] ?? `Stage ${t.stage}`}</span>
                            <span className="font-mono text-gray-500">
                                block {t.blockNumber}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export function GHGWorkflowPanel({ processId }: { processId: string }) {
    const { summary, loading } = useProcessDisclosureSummary(processId as Hex | undefined);
    const {
        processModel,
        executableCapabilityIds,
        executeCapability,
    } = useSemanticProcessWorkspace({ processId });
    const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

    if (!processId) {
        return (
            <Card className="bg-white text-black border border-gray-200 shadow-sm" data-testid="ghg-workflow-panel">
                <div className="p-6 space-y-3">
                    <h3 className="text-sm font-semibold text-black">GHG Disclosure Workflow</h3>
                    <p className="text-xs text-gray-500">Select a process to manage GHG disclosures.</p>
                </div>
            </Card>
        );
    }

    // Group attestations by order
    const orderMap = new Map<string, typeof summary extends null ? never : NonNullable<typeof summary>["attestations"]>();
    if (summary) {
        for (const a of summary.attestations) {
            const existing = orderMap.get(a.orderHash) ?? [];
            existing.push(a);
            orderMap.set(a.orderHash, existing);
        }
    }
    const disclosedOrEligibleOrderIds = new Set<string>(orderMap.keys());
    for (const order of processModel?.orders ?? []) {
        if (hasDisclosureCapability(order.capabilities)) {
            disclosedOrEligibleOrderIds.add(order.orderId);
        }
    }
    const orderHashes = Array.from(disclosedOrEligibleOrderIds);

    return (
        <Card className="bg-white text-black border border-gray-200 shadow-sm" data-testid="ghg-workflow-panel">
            <div className="p-6 space-y-4">
                <h3 className="text-sm font-semibold text-black">GHG Disclosure Workflow</h3>

                {loading && (
                    <p className="text-xs text-gray-500">Loading disclosure workflow…</p>
                )}

                {!loading && !summary && (
                    <p className="text-xs text-gray-500">
                        No GHG attestations found. Submit a commitment or actual disclosure to begin.
                    </p>
                )}

                {!loading && summary && (
                    <>
                        {/* Process summary bar */}
                        <div className="flex justify-between items-baseline text-sm">
                            <span className="text-gray-500">Total emissions inventory</span>
                            <span className="font-bold text-black">
                                {summary.totalActualGrams > 0n
                                    ? formatActualGrams(summary.totalActualGrams)
                                    : "—"}
                            </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                            <div className="bg-white rounded border border-gray-200 py-2">
                                <div className="font-bold text-black text-lg">{summary.attestationCount}</div>
                                <div className="text-gray-500">total</div>
                            </div>
                            <div className="bg-white rounded border border-gray-200 py-2">
                                <div className="font-bold text-black text-lg">{summary.commitmentCount}</div>
                                <div className="text-gray-500">commitments</div>
                            </div>
                            <div className="bg-white rounded border border-gray-200 py-2">
                                <div className="font-bold text-black text-lg">{summary.actualCount}</div>
                                <div className="text-gray-500">inventories</div>
                            </div>
                        </div>

                        {/* Per-order drill-down */}
                        {orderHashes.length > 0 && (
                            <div className="border-t border-gray-100 pt-3 space-y-2">
                                <p className="text-[11px] font-semibold text-gray-500">
                                    Orders with Attestations
                                </p>
                                {orderHashes.map((oh) => (
                                    <div key={oh} className="border border-gray-200 rounded">
                                        <button
                                            onClick={() => setExpandedOrder(expandedOrder === oh ? null : oh)}
                                            className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-gray-50"
                                        >
                                            <span className="font-mono text-gray-700">{truncateHex(oh, { head: 14, tail: 0 })}</span>
                                            <span className="text-gray-500">
                                                {orderMap.get(oh)?.length ?? 0} attestation{(orderMap.get(oh)?.length ?? 0) !== 1 ? "s" : ""}
                                            </span>
                                        </button>
                                        {expandedOrder === oh && (
                                            <div className="border-t border-gray-100 px-3 py-3">
                                                <OrderAttestationDetail
                                                    orderHash={oh}
                                                    orderCapabilities={processModel?.orders.find((order) => order.orderId === oh)?.capabilities}
                                                    onExecuteCapability={executeCapability}
                                                    executableCapabilityIds={executableCapabilityIds}
                                                />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* New order attestation — when no attestations exist yet, still allow submission */}
                        {orderHashes.length === 0 && (
                            <p className="text-xs text-gray-500">
                                Select an order from the process graph to submit GHG attestations.
                            </p>
                        )}
                    </>
                )}
            </div>
        </Card>
    );
}

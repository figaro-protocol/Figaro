"use client";

import { useEffect, useState } from "react";
import { ModuleProps } from "@/lib/shared/moduleRegistry";
import { deriveModuleChrome } from "@/lib/shared/moduleChrome";
import {
    formatActualGrams,
    useOrderDisclosureTasks,
    useProcessDisclosureSummary,
} from "@/lib/mechanisms/useGHGDisclosure";
import { DISCLOSURE_KIND, DISCLOSURE_KIND_LABELS, DISCLOSURE_KIND_DESCRIPTIONS } from "@/lib/mechanisms/contracts";
import { isDisclosureCommitmentCapability, isDisclosureInventoryCapability } from "@/lib/semantic/models";
import { extractErrorMessage } from "@/lib/shared/errors";

// ── Order-level disclosure panel ─────────────────────────────────────────────

function OrderDisclosurePanel({ context, orderHash }: { context: ModuleProps["context"]; orderHash: string }) {
    const accentTone = context.skinBundle?.branding.branding.accentColor;
    const { tasks, loading, refresh } = useOrderDisclosureTasks(orderHash);
    const [actualInput, setActualInput] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmittingCommitment, setIsSubmittingCommitment] = useState(false);
    const [error, setError] = useState("");

    const commitmentTasks = tasks.filter((t) => t.stage === DISCLOSURE_KIND.commitment);
    const actualTasks = tasks.filter((t) => t.stage === DISCLOSURE_KIND.inventory);
    const hasCommitment = commitmentTasks.length > 0;
    const latestActual = actualTasks.length > 0 ? actualTasks[actualTasks.length - 1] : null;
    const orderCapabilities = context.selectedOrder?.capabilities ?? [];
    const commitmentCapability = orderCapabilities.find(isDisclosureCommitmentCapability);
    const actualCapability = orderCapabilities.find(isDisclosureInventoryCapability);
    const canSubmitCommitment = !!commitmentCapability && context.executableCapabilityIds.has(commitmentCapability.id);
    const canSubmitActual = !!actualCapability && context.executableCapabilityIds.has(actualCapability.id);

    // Auto-submit missing commitment
    useEffect(() => {
        if (loading || isSubmittingCommitment || hasCommitment || !commitmentCapability || !canSubmitCommitment) return;

        async function submitMissing() {
            const capability = commitmentCapability;
            if (!capability) {
                return;
            }
            setIsSubmittingCommitment(true);
            try {
                await context.onExecuteCapability(capability, {
                    kind: "submit-disclosure-commitment",
                });
                await refresh();
            } catch {
                // will retry on next mount or dep change
            } finally {
                setIsSubmittingCommitment(false);
            }
        }

        void submitMissing();
    }, [canSubmitCommitment, commitmentCapability, context, hasCommitment, isSubmittingCommitment, loading, refresh]);

    const handleSubmitActual = async (event: React.FormEvent) => {
        event.preventDefault();
        const grams = BigInt(Math.max(0, parseInt(actualInput || "0", 10) || 0));
        if (grams <= 0n) {
            setError("Enter a non-zero emissions value in grams CO2e.");
            return;
        }
        if (!actualCapability) {
            setError("Selected order disclosure writes are only available to the seller on this order.");
            return;
        }
        setError("");
        setIsSubmitting(true);
        try {
            await context.onExecuteCapability(actualCapability, {
                kind: "submit-disclosure-inventory",
                grams,
            });
            setActualInput("");
            await refresh();
        } catch (cause: unknown) {
            setError(extractErrorMessage(cause, "Actual attestation failed"));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return <p className="text-xs text-neutral-500">Loading disclosure attestations…</p>;
    }

    return (
        <div data-testid={`ghg-disclosure-panel-${orderHash.slice(0, 10)}`} className="space-y-3">
            {/* Commitment status — ISO 14064-1 §5.1 */}
            <div
                data-testid="ghg-commitment-status"
                className={`rounded border px-3 py-2 ${hasCommitment ? "border-green-200 bg-green-50" : "border-amber-300 bg-amber-50"}`}
            >
                <span className="font-medium text-black text-sm">Commitment</span>
                <p className="mt-1 text-xs text-neutral-600">
                    {hasCommitment
                        ? "Recorded on-chain."
                        : "Recorded when the seller submits the disclosure commitment for this order."}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">
                    {DISCLOSURE_KIND_DESCRIPTIONS[DISCLOSURE_KIND.commitment]}
                </p>
            </div>

            {!canSubmitCommitment && !canSubmitActual && (
                <p className="text-xs text-neutral-500">
                    Disclosure writes are available only to the seller role on the selected order.
                </p>
            )}

            {/* Emissions inventory — ISO 14064-1 §5.2–5.4 */}
            <div data-testid="ghg-actual-form" className="rounded border border-neutral-200 bg-neutral-50 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-black text-sm">Emissions Inventory</span>
                    {latestActual?.actualGrams != null && (
                        <span className="text-xs text-green-700 font-medium">
                            Current: {formatActualGrams(latestActual.actualGrams)}
                        </span>
                    )}
                </div>
                <p className="mt-1 text-xs text-neutral-600">
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
                        className="flex-1 border border-neutral-300 rounded px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-black"
                    />
                    <button
                        data-testid="ghg-submit-actual"
                        type="submit"
                        disabled={isSubmitting || !canSubmitActual}
                        className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold rounded transition-colors"
                        style={accentTone && canSubmitActual ? { backgroundColor: accentTone } : undefined}
                    >
                        {isSubmitting ? "Submitting…" : latestActual ? "Update" : "Submit"}
                    </button>
                </form>
                {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
            </div>
        </div>
    );
}

// ── Process-level summary ────────────────────────────────────────────────────

function ProcessDisclosureSummary({ processId }: { processId: `0x${string}` }) {
    const { summary, loading } = useProcessDisclosureSummary(processId);

    if (loading) {
        return <p className="text-xs text-neutral-500">Loading GHG summary…</p>;
    }
    if (!summary) return null;

    return (
        <div data-testid="ghg-summary-card" className="space-y-2">
            <div className="flex justify-between items-baseline text-sm">
                <span className="text-neutral-500">Total emissions inventory</span>
                <span className="font-bold text-black">
                    {summary.totalActualGrams > 0n
                        ? formatActualGrams(summary.totalActualGrams)
                        : "—"}
                </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-white rounded border border-neutral-200 py-2">
                    <div className="font-bold text-black text-lg">{summary.attestationCount}</div>
                    <div className="text-neutral-500">total</div>
                </div>
                <div className="bg-white rounded border border-neutral-200 py-2">
                    <div className="font-bold text-lg text-black">
                        {summary.commitmentCount}
                    </div>
                    <div className="text-neutral-500">commitments</div>
                </div>
                <div className="bg-white rounded border border-neutral-200 py-2">
                    <div className="font-bold text-lg text-black">
                        {summary.actualCount}
                    </div>
                    <div className="text-neutral-500">inventories</div>
                </div>
            </div>
        </div>
    );
}

// ── Module entry point ───────────────────────────────────────────────────────

export function DisclosureModule({ context }: ModuleProps) {
    const ghgMechanism = context.mechanisms.find((m) => m.kind === "disclosure" || m.kind === "ghg");
    const { accentTone, cardStyle, labelStyle } = deriveModuleChrome(context);

    if (!ghgMechanism) return null;

    const selectedOrderHash = context.selectedOrder?.orderId ?? null;
    const processId = context.processModel?.processId as `0x${string}` | undefined;

    return (
        <div
            className="rounded-lg border border-neutral-200 bg-white p-6"
            data-testid="disclosure-module"
            data-skin={context.skinBundle?.skinId}
            style={cardStyle}
        >
            <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-neutral-500" style={labelStyle}>
                    {ghgMechanism.name}
                </p>
                <span
                    className="rounded border border-neutral-300 px-2 py-1 text-[11px] font-semibold text-neutral-600"
                    style={accentTone ? { borderColor: accentTone, color: accentTone } : undefined}
                >
                    {ghgMechanism.riskClass}
                </span>
            </div>

            {/* Process-level summary when available */}
            {processId && <ProcessDisclosureSummary processId={processId} />}

            {/* Order-level disclosure when an order is selected */}
            {selectedOrderHash !== null ? (
                <div className={processId ? "mt-4 pt-4 border-t border-neutral-200" : ""}>
                    <OrderDisclosurePanel context={context} orderHash={selectedOrderHash} />
                </div>
            ) : (
                <p className="text-sm text-neutral-500 mt-2">
                    Select an order to view or submit GHG disclosures.
                </p>
            )}
        </div>
    );
}

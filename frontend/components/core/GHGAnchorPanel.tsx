/**
 * GHGAnchorPanel — displays GHG schema-typed attestation anchors for a process.
 * V5: event-sourced from AttestationCoordinator Attestation events filtered by GHG schemaId.
 */
"use client";

import { Card } from "@/components/ui/Card";
import { useOrderStore } from "@/lib/core/store";
import {
    useProcessDisclosureSummary,
    formatActualGrams,
} from "@/lib/mechanisms/useGHGDisclosure";
import {
    DISCLOSURE_KIND_LABELS,
    GHG_SCHEMA_KEY,
    GHG_NORM_REFERENCES,
} from "@/lib/mechanisms/contracts";
import type { Hex } from "viem";

export function GHGAnchorPanel() {
    const viewedProcessId = useOrderStore((state) => state.viewedProcessId);
    const { summary, loading } = useProcessDisclosureSummary(viewedProcessId as Hex | undefined);

    if (!viewedProcessId) {
        return (
            <Card className="bg-white text-black border border-gray-200 shadow-sm" data-testid="ghg-anchor-panel">
                <div className="p-6 space-y-3">
                    <h3 className="text-sm font-semibold text-black">GHG Schema Anchors</h3>
                    <p className="text-xs text-gray-500">Select a process to inspect its schema anchors.</p>
                </div>
            </Card>
        );
    }

    return (
        <Card className="bg-white text-black border border-gray-200 shadow-sm" data-testid="ghg-anchor-panel">
            <div className="p-6 space-y-4">
                <h3 className="text-sm font-semibold text-black">GHG Schema Anchors</h3>
                <p className="text-xs text-gray-500 font-mono">{GHG_SCHEMA_KEY}</p>

                {/* Applicable standards */}
                <div className="flex flex-wrap gap-1">
                    {GHG_NORM_REFERENCES.map((ref) => (
                        <span
                            key={ref.id}
                            title={ref.scope}
                            className="inline-block rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-xs font-medium text-teal-700"
                        >
                            {ref.label}
                        </span>
                    ))}
                </div>

                {loading && (
                    <p className="text-xs text-gray-500">Loading attestation events…</p>
                )}

                {!loading && !summary && (
                    <p className="text-xs text-gray-500">
                        No GHG attestations found for this process.
                    </p>
                )}

                {!loading && summary && (
                    <>
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                            <div className="bg-gray-50 rounded border border-gray-200 py-2">
                                <div className="font-bold text-black text-lg">{summary.attestationCount}</div>
                                <div className="text-gray-500">attestations</div>
                            </div>
                            <div className="bg-gray-50 rounded border border-gray-200 py-2">
                                <div className="font-bold text-black text-lg">{summary.commitmentCount}</div>
                                <div className="text-gray-500">commitments</div>
                            </div>
                            <div className="bg-gray-50 rounded border border-gray-200 py-2">
                                <div className="font-bold text-black text-lg">{summary.actualCount}</div>
                                <div className="text-gray-500">inventories</div>
                            </div>
                        </div>

                        {summary.totalActualGrams > 0n && (
                            <div className="flex justify-between items-baseline text-sm border-t border-gray-100 pt-3">
                                <span className="text-gray-500">Total actual emissions</span>
                                <span className="font-bold text-black">
                                    {formatActualGrams(summary.totalActualGrams)}
                                </span>
                            </div>
                        )}

                        {summary.attestations.length > 0 && (
                            <div className="border-t border-gray-100 pt-3 space-y-2">
                                <p className="text-[11px] font-semibold text-gray-500">
                                    Recent Attestations
                                </p>
                                {summary.attestations.slice(-5).reverse().map((a, i) => (
                                    <div
                                        key={`${a.orderHash}-${a.stage}-${a.blockNumber}-${i}`}
                                        className="flex items-center justify-between text-xs bg-gray-50 rounded px-3 py-2"
                                    >
                                        <span className="font-medium text-black">
                                            {DISCLOSURE_KIND_LABELS[a.stage] ?? `Stage ${a.stage}`}
                                        </span>
                                        <span className="text-gray-500 font-mono text-xs">
                                            {a.orderHash.slice(0, 10)}…
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </Card>
    );
}

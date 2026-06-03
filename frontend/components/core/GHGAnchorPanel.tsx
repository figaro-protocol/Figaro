/**
 * GHGAnchorPanel — displays GHG clause-typed attestation anchors for a process.
 * V5: event-sourced from AttestationCoordinator Attestation events filtered by GHG clauseId.
 */
"use client";

import { useMemo } from "react";
import { keccak256, toBytes, type Hex } from "viem";
import { Card } from "@/components/ui/Card";
import {
    useProcessDisclosureSummary,
    formatActualGrams,
} from "@/lib/mechanisms/useGHGDisclosure";
import { DISCLOSURE_KIND_LABELS } from "@/lib/mechanisms/contracts";
import { GHG_CLAUSE_KEY } from "@/lib/core/agreement";
import { useAllRegisteredClauses } from "@/lib/mechanisms/useClauseRegistry";
import { CLAUSES_BY_ARTICLE, clauseTier } from "@/lib/shared/clauseSpecSource";
import { truncateHex } from "@/lib/shared/formatHex";

export function GHGAnchorPanel({ processId }: { processId: string }) {
    const { summary, loading } = useProcessDisclosureSummary(processId as Hex | undefined);
    const { data: registered } = useAllRegisteredClauses();

    // Live set of registered GHG disclosure clauses — intersection of the
    // on-chain ClauseRegistry events with the emissions article (designer-time
    // tier excludes figaro-ghg-measurement-v1, which is runtime). Article +
    // tier both read from the spec. Mirrors ClauseInventory's read-live pattern.
    const applicableStandards = useMemo(() => {
        if (registered === null) return [];
        const onChain = new Set(registered.map((e) => e.clauseIdHash.toLowerCase()));
        const emissions = CLAUSES_BY_ARTICLE.find((g) => g.article === "emissions");
        if (!emissions) return [];
        return emissions.clauses.filter(
            (s) =>
                clauseTier(s.clauseId) === "designer-time" &&
                onChain.has(keccak256(toBytes(s.clauseId)).toLowerCase()),
        );
    }, [registered]);

    if (!processId) {
        return (
            <Card className="bg-white text-black border border-gray-200 shadow-sm" data-testid="ghg-anchor-panel">
                <div className="p-6 space-y-3">
                    <h3 className="text-sm font-semibold text-black">GHG Clause Anchors</h3>
                    <p className="text-xs text-gray-500">Select a process to inspect its clause anchors.</p>
                </div>
            </Card>
        );
    }

    return (
        <Card className="bg-white text-black border border-gray-200 shadow-sm" data-testid="ghg-anchor-panel">
            <div className="p-6 space-y-4">
                <h3 className="text-sm font-semibold text-black">GHG Clause Anchors</h3>
                <p className="text-xs text-gray-500 font-mono">{GHG_CLAUSE_KEY}</p>

                {/* Applicable standards — live from ClauseRegistry */}
                <div className="flex flex-wrap gap-1">
                    {applicableStandards.map((s) => (
                        <span
                            key={s.clauseId}
                            title={s.description}
                            className="inline-block rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-xs font-medium text-teal-700"
                        >
                            {s.title}
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
                                            {truncateHex(a.orderHash, { head: 10, tail: 0 })}
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

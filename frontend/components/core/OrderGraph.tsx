"use client";

/**
 * OrderGraph — live-state wrapper around ProcessGraphCanvas.
 *
 * Reads viewedProcessId + orders from the order store, the connected wallet
 * from wagmi, and a process-level GHG summary, then hands them to the
 * presentational ProcessGraphCanvas. The canvas owns all rendering; this
 * file owns the bridges to live state.
 */

import { useAccount } from "wagmi";
import { useOrderStore } from "@/lib/core/store";
import { useProcessOrders } from "@/hooks/core/useProcessOrders";
import { useProcessDisclosureSummary, formatActualGrams } from "@/lib/mechanisms/useGHGDisclosure";
import { GHG_NORM_REFERENCES } from "@/lib/mechanisms/contracts";
import { ProcessGraphCanvas, type GraphLens } from "@/components/core/ProcessGraphCanvas";
import type { Hex } from "viem";

function GHGProcessSummary({ processId, activeLens }: { processId: string | null; activeLens: GraphLens }) {
    const { summary, loading } = useProcessDisclosureSummary(processId as Hex | undefined);
    if (activeLens !== "ghg") return null;

    if (loading) {
        return (
            <div className="mt-2 text-xs text-gray-500 italic" data-testid="ghg-process-summary">
                Loading GHG disclosure data…
            </div>
        );
    }

    if (!summary || summary.attestationCount === 0) {
        return (
            <div className="mt-2 text-xs text-gray-500 italic" data-testid="ghg-process-summary">
                No GHG disclosures filed for this process.
            </div>
        );
    }

    return (
        <div className="mt-2 space-y-2" data-testid="ghg-process-summary">
            <div className="flex items-baseline justify-between text-xs">
                <span className="font-semibold text-teal-700">Process GHG Summary</span>
                <span className="text-gray-500 text-xs">
                    {GHG_NORM_REFERENCES.map((r) => r.label).join(" · ")}
                </span>
            </div>
            <div className="grid grid-cols-3 gap-1 text-center text-[11px]">
                <div className="bg-teal-50 rounded border border-teal-100 py-1">
                    <div className="font-bold text-teal-800">{summary.commitmentCount}</div>
                    <div className="text-teal-600">commitments</div>
                </div>
                <div className="bg-teal-50 rounded border border-teal-100 py-1">
                    <div className="font-bold text-teal-800">{summary.actualCount}</div>
                    <div className="text-teal-600">inventories</div>
                </div>
                <div className="bg-teal-50 rounded border border-teal-100 py-1">
                    <div className="font-bold text-teal-800">
                        {summary.totalActualGrams > 0n ? formatActualGrams(summary.totalActualGrams) : "—"}
                    </div>
                    <div className="text-teal-600">total CO₂e</div>
                </div>
            </div>
        </div>
    );
}

export function OrderGraph() {
    const viewedProcessId = useOrderStore((state) => state.viewedProcessId);
    const orderArray = useProcessOrders(viewedProcessId);
    const { address } = useAccount();

    return (
        <ProcessGraphCanvas
            orders={orderArray}
            viewedProcessId={viewedProcessId}
            walletAddress={address}
            headerExtras={(activeLens) => (
                <GHGProcessSummary processId={viewedProcessId} activeLens={activeLens} />
            )}
        />
    );
}

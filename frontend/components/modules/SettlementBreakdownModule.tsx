"use client";

import { ModuleProps } from "@/lib/shared/moduleRegistry";
import { deriveModuleChrome } from "@/lib/shared/moduleChrome";
import { ModuleEmptyStateCard } from "@/components/shared/ModuleEmptyStateCard";
import { formatToken } from "@/lib/shared/utils";

export function SettlementBreakdownModule({ context }: ModuleProps) {
    const breakdown = context.selectedOrder?.settlementBreakdown ?? context.processModel?.economicSummary;
    const { cardStyle, labelStyle } = deriveModuleChrome(context);
    const decimals = context.tokenDecimals ?? 18;

    if (!breakdown) {
        return (
            <ModuleEmptyStateCard
                testId="settlement-breakdown-module-empty"
                cardStyle={cardStyle}
                labelStyle={labelStyle}
                title="Settlement Breakdown"
                message="No settlement data available yet."
            />
        );
    }

    return (
        <div
            data-testid="settlement-breakdown-module"
            className="rounded-lg border border-neutral-200 bg-white p-6"
            style={cardStyle}
        >
            <p className="text-xs font-semibold text-neutral-500 mb-3" style={labelStyle}>
                Settlement Breakdown
            </p>
            <div className="space-y-3 text-sm text-black">
                {breakdown.lockedBond && (
                    <div className="flex justify-between">
                        <span className="text-neutral-600">{breakdown.lockedBond.label}</span>
                        <span className="font-mono">{formatToken(breakdown.lockedBond.amount, decimals)}</span>
                    </div>
                )}
                {breakdown.settledAvailable && (
                    <div className="flex justify-between">
                        <span className="text-neutral-600">{breakdown.settledAvailable.label}</span>
                        <span className="font-mono">{formatToken(breakdown.settledAvailable.amount, decimals)}</span>
                    </div>
                )}
                {breakdown.typedOutputs.map((output, i) => (
                    <div key={`${output.label}-${i}`} className="flex justify-between">
                        <span className="text-neutral-600">{output.label}</span>
                        <span className="font-mono">{formatToken(output.amount, decimals)}</span>
                    </div>
                ))}
                {breakdown.downstreamReferencedAmount && (
                    <div className="flex justify-between border-t border-neutral-200 pt-2">
                        <span className="text-neutral-600">{breakdown.downstreamReferencedAmount.label}</span>
                        <span className="font-mono">{formatToken(breakdown.downstreamReferencedAmount.amount, decimals)}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

"use client";

import { Card } from "@/components/ui/Card";
import useTokenDecimals from "@/hooks/core/useTokenDecimals";
import { EconomicBreakdownModel, EconomicBreakdownValue } from "@/lib/semantic/models";
import { formatUnits } from "viem";

interface Props {
    title: string;
    breakdown: EconomicBreakdownModel;
    currencyAddress?: `0x${string}`;
}

function BreakdownValueRow({ value, currencyAddress }: { value: EconomicBreakdownValue; currencyAddress?: `0x${string}` }) {
    const { decimals } = useTokenDecimals(currencyAddress);

    return (
        <div className="rounded border border-neutral-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-semibold text-black">{value.label}</p>
                    <p className="text-xs text-neutral-500">{value.source.sourceLabel}</p>
                </div>
                <div className="text-right">
                    <p className="text-sm font-mono text-black">{formatUnits(value.amount, decimals)}</p>
                    {currencyAddress && <p className="text-[11px] text-neutral-500 font-mono">{currencyAddress.slice(0, 8)}...</p>}
                </div>
            </div>
        </div>
    );
}

export function EconomicBreakdownPanel({ title, breakdown, currencyAddress }: Props) {
    return (
        <Card className="p-4">
            <div className="mb-4">
                <p className="text-sm font-semibold text-black">{title}</p>
                <p className="text-xs text-neutral-500">Typed accounting derived from protocol state rather than UI-local bookkeeping.</p>
            </div>

            <div className="space-y-3">
                {breakdown.lockedBond && (
                    <BreakdownValueRow value={breakdown.lockedBond} currencyAddress={currencyAddress} />
                )}
                {breakdown.settledAvailable && (
                    <BreakdownValueRow value={breakdown.settledAvailable} currencyAddress={currencyAddress} />
                )}
                {breakdown.typedOutputs.map((value) => (
                    <BreakdownValueRow key={`${breakdown.scopeId}-${value.label}`} value={value} currencyAddress={currencyAddress} />
                ))}
                {breakdown.downstreamReferencedAmount && (
                    <BreakdownValueRow value={breakdown.downstreamReferencedAmount} currencyAddress={currencyAddress} />
                )}
            </div>
        </Card>
    );
}
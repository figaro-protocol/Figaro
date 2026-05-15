"use client";

/**
 * PreResolveOffsetPanel — Path A bridge UI.
 *
 * Mounted on the process detail page above the resolve button. Hidden when
 * the process has no GHG measurement attestations. When measurements exist,
 * surfaces the four-step buyer flow:
 *
 *   1. Approve USDC → aggregator (for the quoted amount + slippage cap)
 *   2. Retire at the aggregator (Klima KlimaInfinity / Toucan OffsetHelper)
 *   3. Anchor the receipt on-chain via ProcessOffsetReceipt.record(...)
 *   4. (caller continues to) FigaroCore.resolveProcess(...)
 *
 * The panel is opt-in — buyers can skip and resolve without offsetting.
 */

import type { Hex } from "viem";
import { Card } from "@/components/ui/Card";
import { type OffsetProvider } from "@/lib/mechanisms/offsetAggregators";
import { useOffsetRetirement } from "@/lib/mechanisms/useOffsetRetirement";

interface Props {
    processId: Hex | undefined;
}

const PROVIDER_LABELS: Record<OffsetProvider, string> = {
    klima: "Klima DAO (KlimaInfinity)",
    toucan: "Toucan Protocol (OffsetHelper)",
    custom: "Custom aggregator",
};

function formatGrams(grams: bigint): string {
    if (grams < 1000n) return `${grams} g CO₂e`;
    if (grams < 1_000_000n) return `${(Number(grams) / 1000).toFixed(2)} kg CO₂e`;
    return `${(Number(grams) / 1_000_000).toFixed(3)} t CO₂e`;
}

function formatTons1e18(tons1e18: bigint): string {
    const ONE_TONNE = 10n ** 18n;
    const whole = tons1e18 / ONE_TONNE;
    const fractionalMicro = (tons1e18 % ONE_TONNE) / 10n ** 12n; // 6 decimals
    if (fractionalMicro === 0n) return `${whole} t`;
    const fracStr = fractionalMicro.toString().padStart(6, "0").replace(/0+$/, "");
    return `${whole}.${fracStr} t`;
}

function formatUsdc(amountIn: bigint): string {
    // USDC.e + MockToken both 6 decimals on devnet/Polygon. (MockToken is
    // 18 decimals on devnet — display still works approximately for hand-tracing.)
    const ONE_USDC = 1_000_000n;
    const whole = amountIn / ONE_USDC;
    const fractional = amountIn % ONE_USDC;
    const fracStr = fractional.toString().padStart(6, "0").replace(/0+$/, "") || "0";
    return `${whole}.${fracStr} USDC`;
}

export function PreResolveOffsetPanel({ processId }: Props) {
    const r = useOffsetRetirement(processId);

    // Hidden — no measurements means there's nothing to offset
    if (r.status === "no-measurements") return null;

    return (
        <Card className="p-5 space-y-4 border-emerald-200 bg-emerald-50" data-testid="pre-resolve-offset-panel">
            <div>
                <h3 className="text-sm font-semibold text-emerald-900">Carbon offset (optional)</h3>
                <p className="text-xs text-emerald-800 mt-1 leading-relaxed">
                    This process has emitted{" "}
                    <span className="font-mono font-semibold">{formatGrams(r.totalGrams)}</span>{" "}
                    across {r.tonsToRetire > 0n ? "all measurement attestations" : "—"}. You can retire{" "}
                    <span className="font-mono font-semibold">{formatTons1e18(r.tonsToRetire)}</span>{" "}
                    of carbon credits at an external aggregator before resolving — the receipt anchors
                    on-chain via ProcessOffsetReceipt and joins the process audit bundle. Off-protocol:
                    no Figaro commitment, no bonded sub-order.
                </p>
            </div>

            {r.status === "wrong-chain" && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2" data-testid="offset-wrong-chain">
                    Switch to Polygon (chainId 137) to retire offsets. Klima and Toucan aggregators are
                    Polygon-only in v1; mainnet support waits on the providers deploying there.
                </p>
            )}

            {r.status === "no-receipts-anchor" && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2" data-testid="offset-no-anchor">
                    ProcessOffsetReceipt isn&apos;t deployed on this network. Set
                    {" "}<code>NEXT_PUBLIC_PROCESS_OFFSET_RECEIPT</code> in your env.
                </p>
            )}

            {r.availableProviders.length > 0 && r.status !== "wrong-chain" && r.status !== "no-receipts-anchor" && (
                <div className="space-y-2">
                    <p className="text-[11px] font-semibold text-emerald-900 uppercase tracking-wide">Aggregator</p>
                    <div className="flex flex-col gap-1.5">
                        {r.availableProviders.map((p) => (
                            <label key={p} className="flex items-center gap-2 text-xs text-emerald-900 cursor-pointer">
                                <input
                                    type="radio"
                                    name="offset-provider"
                                    value={p}
                                    checked={r.selectedProvider === p}
                                    onChange={() => r.setProvider(p)}
                                    data-testid={`offset-provider-${p}`}
                                    className="accent-emerald-700"
                                />
                                <span>{PROVIDER_LABELS[p]}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {r.quote && (
                <div className="text-xs text-emerald-900 space-y-1" data-testid="offset-quote">
                    <p>Cost: <span className="font-mono font-semibold">{formatUsdc(r.quote.amountIn)}</span> ({r.quote.source})</p>
                    <p className="text-emerald-700">Approve cap (with 1% slippage): <span className="font-mono">{formatUsdc(r.maxAmountIn)}</span></p>
                </div>
            )}

            {r.status === "ready" && r.requiresApproval && (
                <button
                    type="button"
                    onClick={() => void r.approve()}
                    className="w-full text-sm px-4 py-2 rounded border border-emerald-700 bg-white hover:bg-emerald-100 text-emerald-900 font-semibold"
                    data-testid="offset-step-approve"
                >
                    Step 1 of 3 — Approve USDC
                </button>
            )}

            {r.status === "approving" && (
                <p className="text-xs text-emerald-800 italic" data-testid="offset-approving">
                    Approving USDC…
                </p>
            )}

            {(r.status === "approved" || (r.status === "ready" && !r.requiresApproval)) && (
                <button
                    type="button"
                    onClick={() => void r.retire()}
                    className="w-full text-sm px-4 py-2 rounded border border-emerald-700 bg-white hover:bg-emerald-100 text-emerald-900 font-semibold"
                    data-testid="offset-step-retire"
                >
                    Step 2 of 3 — Retire at aggregator
                </button>
            )}

            {r.status === "retiring" && (
                <p className="text-xs text-emerald-800 italic" data-testid="offset-retiring">
                    Retiring at aggregator…
                </p>
            )}

            {r.status === "retired" && (
                <button
                    type="button"
                    onClick={() => void r.recordReceipt()}
                    className="w-full text-sm px-4 py-2 rounded border border-emerald-700 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
                    data-testid="offset-step-record"
                >
                    Step 3 of 3 — Anchor receipt on-chain
                </button>
            )}

            {r.status === "recording" && (
                <p className="text-xs text-emerald-800 italic" data-testid="offset-recording">
                    Anchoring receipt on-chain…
                </p>
            )}

            {r.status === "done" && (
                <div className="space-y-1 text-xs" data-testid="offset-done">
                    <p className="font-semibold text-emerald-900">Offset retired and anchored.</p>
                    <p className="text-emerald-800">You can resolve this process now.</p>
                    {r.recordTxHash && (
                        <p className="font-mono text-[11px] text-emerald-700 break-all">
                            ReceiptRecorded tx: {r.recordTxHash}
                        </p>
                    )}
                </div>
            )}

            {r.status === "error" && r.error && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2" role="alert" data-testid="offset-error">
                    {r.error}
                </p>
            )}
        </Card>
    );
}

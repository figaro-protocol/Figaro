"use client";

import { useState } from "react";
import Link from "next/link";
import { parseUnits, type Hex } from "viem";
import { Button } from "@/components/ui/Button";
import useTokenDecimals from "@/hooks/useTokenDecimals";
import { useTokenSymbol } from "@/hooks/useTokenSymbol";
import { usePayoutRoutingActions } from "@/lib/composition/usePayoutRoutingActions";
import { validatePayoutLegs, type PayoutLeg } from "@/lib/composition/payoutRouting";
import { extractErrorMessage } from "@/lib/shared/errors";

interface LegDraft {
    recipient: string;
    amount: string;
}

interface Props {
    /** The settled order's ERC-20 currency — what the receipts arrived in and
     *  what routes onward. */
    currency: `0x${string}`;
}

/**
 * PayoutRoutingPanel — the settled seller splits its own receipts onward:
 * earmarked (recipient, amount) legs through the composed public multisender,
 * one atomic transaction (`lib/composition/payoutRouting`).
 *
 * Wallet-side, post-settlement: the kernel has already paid; this is the
 * wallet spending its own balance, so the panel mounts beside the settlement
 * proceeds (kernel-core surface, no clause to key on — the same reasoning as
 * SettlementProceedsPanel) and renders only when a multisender is configured.
 * Amounts are typed in token units; the wallet and the token contract stay
 * the enforcement — an over-balance batch reverts atomically.
 */
export function PayoutRoutingPanel({ currency }: Props) {
    const { routeTokenPayout, isRouting, isAvailable } = usePayoutRoutingActions();
    const { decimals } = useTokenDecimals(currency);
    const { data: symbol } = useTokenSymbol(currency);
    const [legs, setLegs] = useState<LegDraft[]>([{ recipient: "", amount: "" }]);
    const [error, setError] = useState<string | null>(null);
    const [routedTx, setRoutedTx] = useState<Hex | null>(null);

    if (!isAvailable) return null;

    const parsedLegs = (): PayoutLeg[] => legs.map((leg) => ({
        recipient: leg.recipient.trim() as `0x${string}`,
        amount: leg.amount.trim() === "" ? 0n : parseUnits(leg.amount.trim(), decimals ?? 18),
    }));

    const setLeg = (i: number, patch: Partial<LegDraft>) =>
        setLegs((prev) => prev.map((leg, j) => (j === i ? { ...leg, ...patch } : leg)));

    const route = async () => {
        setError(null);
        try {
            const routed = parsedLegs();
            setRoutedTx(await routeTokenPayout(currency, routed));
        } catch (cause) {
            setError(extractErrorMessage(cause, "Payout routing failed."));
        }
    };

    let incomplete = true;
    try {
        incomplete = validatePayoutLegs(parsedLegs()) !== null;
    } catch {
        // An unparseable amount string counts as incomplete, not a crash.
    }

    return (
        <div className="rounded-lg border border-neutral-200 bg-white p-4" data-testid="payout-routing">
            <p className="text-xs font-semibold text-neutral-500 mb-1">Route your receipts</p>
            <p className="text-sm text-neutral-600 mb-3">
                Split what you were paid to earmarked addresses in one transaction,
                through the public multisender this deployment composes with. Your
                wallet, your receipts — the batch is atomic and the split becomes
                part of your own on-chain record.{" "}
                <Link href="/composition#multisender" className="underline">What is this for?</Link>
            </p>
            <div className="space-y-2">
                {legs.map((leg, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <input
                            type="text"
                            value={leg.recipient}
                            onChange={(e) => setLeg(i, { recipient: e.target.value })}
                            placeholder="0x recipient"
                            data-testid={`payout-routing-recipient-${i}`}
                            className="flex-1 rounded border border-neutral-300 bg-white px-2 py-1 text-xs font-mono text-black focus:outline-none focus:ring-1 focus:ring-accent"
                        />
                        <input
                            type="text"
                            inputMode="decimal"
                            value={leg.amount}
                            onChange={(e) => setLeg(i, { amount: e.target.value })}
                            placeholder={`amount${symbol ? ` (${symbol})` : ""}`}
                            data-testid={`payout-routing-amount-${i}`}
                            className="w-36 rounded border border-neutral-300 bg-white px-2 py-1 text-xs font-mono text-black focus:outline-none focus:ring-1 focus:ring-accent"
                        />
                        {legs.length > 1 && (
                            <button
                                type="button"
                                onClick={() => setLegs((prev) => prev.filter((_, j) => j !== i))}
                                data-testid={`payout-routing-remove-${i}`}
                                className="text-xs text-neutral-500 hover:text-neutral-700"
                                title="Remove this leg"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={() => setLegs((prev) => [...prev, { recipient: "", amount: "" }])}
                    data-testid="payout-routing-add-leg"
                    className="text-xs text-neutral-500 hover:text-neutral-700 underline"
                >
                    Add a recipient
                </button>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    data-testid="payout-routing-execute"
                    disabled={isRouting || incomplete}
                    onClick={() => void route()}
                >
                    {isRouting ? "Routing…" : "Route payout"}
                </Button>
            </div>
            {error && (
                <p className="mt-2 text-sm text-red-600" data-testid="payout-routing-error">{error}</p>
            )}
            {routedTx && !error && (
                <p className="mt-2 text-xs text-green-700" data-testid="payout-routing-success">
                    Routed — tx <span className="font-mono break-all">{routedTx}</span>
                </p>
            )}
        </div>
    );
}

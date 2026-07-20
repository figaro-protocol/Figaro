"use client";

/**
 * DispatchRacePanel — the race alternative beside the manual counterparty
 * picker at checkout.
 *
 * The same derived absence the picker resolves (an unbound sub-order), filled
 * by racing the market instead: unsigned drafts go to every candidate whose
 * catalogue can price the node, each countersignature is an "available at my
 * posted price" answer, and the cheapest valid countersigner wins at window
 * close. The buyer may close the race early or pick any reply instead —
 * selection authority stays with the buyer (buyer dominance); the mechanism
 * only supplies the default. Presentational: the race state machine lives in
 * `useDispatchRace`, threaded in whole from the checkout surface.
 */

import type { useDispatchRace } from "@/lib/checkout/dispatchRace";
import { Button } from "@/components/ui/Button";
import { formatToken } from "@/lib/shared/utils";
import { truncateHex } from "@/lib/shared/formatHex";

interface Props {
    race: ReturnType<typeof useDispatchRace>;
    onStart: () => void;
    tokenSymbol: string;
    decimals: number;
}

export function DispatchRacePanel({ race, onStart, tokenSymbol, decimals }: Props) {
    const { step, error, candidates, repliedCount, result } = race;

    if (step === "idle") {
        return (
            <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-2" data-testid="race-panel">
                <p className="text-xs text-neutral-600">
                    Or race the market: every registered seller whose catalogue can
                    price this order receives your draft; whoever counter-signs is
                    available at their posted price, and the cheapest wins unless
                    you pick otherwise.
                </p>
                <Button type="button" onClick={onStart} className="w-full" data-testid="race-start">
                    Race the market
                </Button>
            </div>
        );
    }

    if (step === "drafting") {
        return (
            <div className="rounded-lg border border-neutral-200 bg-white p-4" data-testid="race-panel">
                <p className="text-sm text-neutral-600">Drafting offers…</p>
            </div>
        );
    }

    if (step === "racing") {
        return (
            <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-3" data-testid="race-panel">
                <p className="text-xs font-semibold text-neutral-500">
                    Racing {candidates.length} candidate{candidates.length === 1 ? "" : "s"} — {repliedCount} available
                </p>
                <ul className="space-y-2">
                    {candidates.map((c) => (
                        <li
                            key={c.address}
                            className="flex items-center justify-between gap-3 rounded border border-neutral-200 p-2"
                            data-testid={`race-candidate-${c.address.toLowerCase()}`}
                            data-payment={c.payment.toString()}
                            data-replied={c.replied ? "true" : "false"}
                        >
                            <div className="min-w-0">
                                <p className="text-xs font-mono text-neutral-700 truncate">{truncateHex(c.address)}</p>
                                <p className="text-xs text-neutral-500 truncate">{c.itemName}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs font-semibold text-black">
                                    {formatToken(c.payment, decimals)} {tokenSymbol}
                                </span>
                                {c.replied ? (
                                    <button
                                        type="button"
                                        onClick={() => race.pick(c.address)}
                                        className="rounded border border-neutral-300 px-2 py-1 text-xs text-black hover:bg-neutral-50"
                                        data-testid={`race-pick-${c.address.toLowerCase()}`}
                                    >
                                        Choose
                                    </button>
                                ) : (
                                    <span className="text-xs text-neutral-400">waiting…</span>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
                <Button
                    type="button"
                    onClick={race.selectNow}
                    disabled={repliedCount === 0}
                    className="w-full"
                    data-testid="race-select-now"
                >
                    Take the best offer now
                </Button>
            </div>
        );
    }

    if (step === "done" && result) {
        return (
            <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-2" data-testid="race-panel">
                <p className="text-xs font-semibold text-neutral-500">Race winner</p>
                <p className="text-sm font-mono text-neutral-700" data-testid="race-winner" data-seller={result.selection.seller.toLowerCase()}>
                    {truncateHex(result.selection.seller)} — {result.selection.price} {tokenSymbol}
                </p>
                <p className="text-xs text-neutral-500">
                    Their counter-signature rides your order: placing it delivers a
                    commit-ready order to them.
                </p>
                <button
                    type="button"
                    onClick={race.reset}
                    className="text-xs text-neutral-500 hover:text-neutral-700 underline"
                    data-testid="race-reset"
                >
                    Race again
                </button>
            </div>
        );
    }

    return (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-2" data-testid="race-panel">
            <p className="text-sm text-red-600" data-testid="race-error">{error ?? "The race failed."}</p>
            <button
                type="button"
                onClick={race.reset}
                className="text-xs text-neutral-500 hover:text-neutral-700 underline"
                data-testid="race-reset"
            >
                Try again
            </button>
        </div>
    );
}

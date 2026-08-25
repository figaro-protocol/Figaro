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

import { useState } from "react";
import type { useDispatchRace } from "@/lib/checkout/dispatchRace";
import { Button } from "@/components/ui/Button";
import { formatToken } from "@/lib/shared/utils";
import { truncateHex } from "@/lib/shared/formatHex";

/** The buyer's checkout-time policy for this run — window, candidate count,
 *  and (on the quotes leg) the ceiling. Never stored anywhere. */
export interface RaceStartPolicy {
    windowMs: number;
    maxCandidates?: number;
    /** Decimal string in display units; present = the RFQ leg (candidates
     *  author the price under this ceiling). */
    ceiling?: string;
}

const FIELD = "w-full rounded border border-default bg-surface px-2 py-1.5 text-sm text-ink-primary focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent";

interface Props {
    race: ReturnType<typeof useDispatchRace>;
    onStart: (policy: RaceStartPolicy) => void;
    tokenSymbol: string;
    decimals: number;
}

export function DispatchRacePanel({ race, onStart, tokenSymbol, decimals }: Props) {
    const { step, error, candidates, repliedCount, result, quoting } = race;
    const [windowSeconds, setWindowSeconds] = useState("120");
    const [maxCandidates, setMaxCandidates] = useState("");
    const [ceiling, setCeiling] = useState("");

    if (step === "idle") {
        const windowMs = Math.max(1, Number(windowSeconds) || 120) * 1000;
        const k = Number(maxCandidates);
        const policy: Omit<RaceStartPolicy, "ceiling"> = {
            windowMs,
            ...(Number.isInteger(k) && k > 0 ? { maxCandidates: k } : {}),
        };
        const ceilingValid = /^\d+(\.\d+)?$/.test(ceiling.trim()) && Number(ceiling) > 0;
        return (
            <div className="rounded-lg border border-default bg-paper p-4 space-y-3" data-testid="race-panel">
                <p className="text-xs text-ink-body">
                    Or form the market: every registered seller whose catalogue can
                    serve this order receives your draft; whoever counter-signs is
                    in, and the cheapest wins unless you pick otherwise.
                </p>
                <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-ink-body">
                        Window (seconds)
                        <input
                            type="number" min="1" value={windowSeconds}
                            onChange={(e) => setWindowSeconds(e.target.value)}
                            className={FIELD} data-testid="race-window-input"
                        />
                    </label>
                    <label className="text-xs text-ink-body">
                        Candidates (blank = all)
                        <input
                            type="number" min="1" value={maxCandidates}
                            onChange={(e) => setMaxCandidates(e.target.value)}
                            className={FIELD} data-testid="race-k-input"
                        />
                    </label>
                </div>
                <Button type="button" onClick={() => onStart(policy)} className="w-full" data-testid="race-start">
                    Race at posted prices
                </Button>
                <div className="space-y-2 border-t border-default pt-3">
                    <p className="text-xs text-ink-body">
                        Or request quotes: candidates name their own price under your
                        ceiling — for work no posted price fits.
                    </p>
                    <label className="text-xs text-ink-body">
                        Your ceiling ({tokenSymbol})
                        <input
                            type="text" inputMode="decimal" value={ceiling} placeholder="0.00"
                            onChange={(e) => setCeiling(e.target.value)}
                            className={FIELD} data-testid="quote-ceiling-input"
                        />
                    </label>
                    <Button
                        type="button"
                        onClick={() => onStart({ ...policy, ceiling: ceiling.trim() })}
                        disabled={!ceilingValid}
                        className="w-full"
                        data-testid="quote-start"
                    >
                        Request quotes
                    </Button>
                </div>
            </div>
        );
    }

    if (step === "drafting") {
        return (
            <div className="rounded-lg border border-default bg-paper p-4" data-testid="race-panel">
                <p className="text-sm text-ink-body">Drafting offers…</p>
            </div>
        );
    }

    if (step === "racing") {
        return (
            <div className="rounded-lg border border-default bg-paper p-4 space-y-3" data-testid="race-panel">
                <p className="text-xs font-semibold text-ink-muted">
                    {quoting ? "Requesting quotes from" : "Racing"} {candidates.length} candidate{candidates.length === 1 ? "" : "s"} — {repliedCount} {quoting ? "quoted" : "available"}
                </p>
                <ul className="space-y-2">
                    {candidates.map((c) => (
                        <li
                            key={c.address}
                            className="flex items-center justify-between gap-3 rounded border border-default p-2"
                            data-testid={`race-candidate-${c.address.toLowerCase()}`}
                            data-payment={c.payment.toString()}
                            data-replied={c.replied ? "true" : "false"}
                        >
                            <div className="min-w-0">
                                <p className="text-xs font-mono text-ink-body truncate">{truncateHex(c.address)}</p>
                                <p className="text-xs text-ink-muted truncate">{c.itemName}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {/* On the quotes leg an unreplied row has no price
                                    yet — the payment field still holds the ceiling
                                    the draft went out at, which is not a quote. */}
                                {(!quoting || c.replied) && (
                                    <span className="text-xs font-semibold text-ink-primary">
                                        {formatToken(c.payment, decimals)} {tokenSymbol}
                                    </span>
                                )}
                                {c.replied ? (
                                    <button
                                        type="button"
                                        onClick={() => race.pick(c.address)}
                                        className="rounded border border-default px-2 py-1 text-xs text-ink-primary hover:bg-subtle"
                                        data-testid={`race-pick-${c.address.toLowerCase()}`}
                                    >
                                        Choose
                                    </button>
                                ) : (
                                    <span className="text-xs text-ink-faint">{quoting ? "awaiting quote…" : "waiting…"}</span>
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
                    {quoting ? "Take the best quote now" : "Take the best offer now"}
                </Button>
            </div>
        );
    }

    if (step === "done" && result) {
        return (
            <div className="rounded-lg border border-default bg-paper p-4 space-y-2" data-testid="race-panel">
                <p className="text-xs font-semibold text-ink-muted">Race winner</p>
                <p className="text-sm font-mono text-ink-body" data-testid="race-winner" data-seller={result.selection.seller.toLowerCase()}>
                    {truncateHex(result.selection.seller)} — {result.selection.price} {tokenSymbol}
                </p>
                <p className="text-xs text-ink-muted">
                    Their counter-signature rides your order: placing it delivers a
                    commit-ready order to them.
                </p>
                <button
                    type="button"
                    onClick={race.reset}
                    className="text-xs text-ink-muted hover:text-ink-body underline"
                    data-testid="race-reset"
                >
                    Race again
                </button>
            </div>
        );
    }

    return (
        <div className="rounded-lg border border-default bg-paper p-4 space-y-2" data-testid="race-panel">
            <p className="text-sm text-red-600" data-testid="race-error">{error ?? "The race failed."}</p>
            <button
                type="button"
                onClick={race.reset}
                className="text-xs text-ink-muted hover:text-ink-body underline"
                data-testid="race-reset"
            >
                Try again
            </button>
        </div>
    );
}

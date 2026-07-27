"use client";

/**
 * MatchRoundView — one crowd-steered match round's runtime surface at
 * `/rounds?pool=…`. Every act is PERMISSIONLESS network participation, not an
 * admin panel: anyone donates (the pool IS the rail — the donation passes
 * straight through to the recipient and the quadratic-funding weight is
 * recorded as it lands), anyone finalizes once the donation window has ended,
 * and anyone claims a recipient's match on their behalf. There is no root to
 * post, no bond, no challenge window and no referee — the match is arithmetic
 * over numbers the chain already holds.
 */

import { useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { Button } from "@/components/ui/Button";
import { WalletGate } from "@/components/runtime/WalletGate";
import { useMounted } from "@/hooks/useMounted";
import { useMatchRound, type MatchRoundState } from "@/lib/composition/useMatchRound";
import { extractErrorMessage } from "@/lib/shared/errors";
import { isValidAddress } from "@/lib/shared/evm";
import { truncateHex } from "@/lib/shared/formatHex";

/** The round's phase, DERIVED from the pool's immutables + the clock. */
function roundStatus(s: MatchRoundState, nowSeconds: number): string {
    if (s.finalized) return "finalized";
    const now = BigInt(nowSeconds);
    if (now < s.donationStart) return "not yet open";
    if (now < s.donationEnd) return "donations open";
    return "awaiting finalize";
}

export function MatchRoundView({ pool }: { pool: `0x${string}` }) {
    const mounted = useMounted();
    const round = useMatchRound(pool);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [donateRecipient, setDonateRecipient] = useState("");
    const [donateAmount, setDonateAmount] = useState("");

    if (!mounted) return null;

    const act = async (label: string, run: () => Promise<unknown>) => {
        setBusy(label);
        setError("");
        try {
            await run();
        } catch (e) {
            setError(extractErrorMessage(e, "The transaction failed."));
        } finally {
            setBusy(null);
        }
    };

    const nowSeconds = Math.floor(Date.now() / 1000);
    const s = round.state;

    return (
        <section className="container mx-auto px-6 pt-24 pb-16 max-w-3xl" data-testid="round-page">
            <h1 className="text-heading-h1 text-ink-heading mb-3">Match round</h1>
            <p className="text-base text-ink-body leading-relaxed mb-8">
                A crowd-steered match. Donations pass straight through to their recipients — the
                round never holds them — and double as the steering signal: each one adds to the
                recipient&apos;s coordination surplus as it lands, so many small independent donors
                outweigh one large cheque. When the window ends the round is finalized, the funded
                pool becomes the budget, and every recipient claims{" "}
                <span className="font-mono">budget × weight / total weight</span>, capped
                {s ? ` at ${s.capPercent}%` : ""}. No committee, no application, no recipient
                registry.
            </p>

            {!s && (
                <p className="text-base text-ink-muted" data-testid="round-unavailable">
                    Loading round state from the chain… (an unreachable or non-round address
                    stays in this state)
                </p>
            )}

            {s && (
                <div className="border border-edge-muted rounded-lg p-5 mb-8" data-testid="round-card">
                    <div className="flex items-baseline justify-between mb-2">
                        <h2 className="text-base font-semibold text-ink-heading">
                            Round at <span className="font-mono">{truncateHex(pool)}</span>
                        </h2>
                        <span className="text-sm text-ink-muted" data-testid="round-status">
                            {roundStatus(s, nowSeconds)}
                        </span>
                    </div>
                    <p className="text-sm text-ink-muted mb-1" data-testid="round-funded">
                        match funded:{" "}
                        <span className="font-mono">
                            {formatUnits(s.finalized ? s.budget : s.funded, s.matchDecimals)} {s.matchSymbol}
                        </span>
                        {s.finalized && <> (finalized budget · {formatUnits(s.paid, s.matchDecimals)} claimed)</>}
                    </p>
                    <p className="text-sm text-ink-muted mb-1">
                        donations in <span className="font-mono">{s.donationSymbol}</span> (floor{" "}
                        <span className="font-mono">{formatUnits(s.donationFloor, s.donationDecimals)}</span>) ·{" "}
                        {new Date(Number(s.donationStart) * 1000).toLocaleString()} →{" "}
                        {new Date(Number(s.donationEnd) * 1000).toLocaleString()}
                    </p>
                    <p className="text-sm text-ink-muted mb-1" data-testid="round-donations">
                        {s.donations.length} donation{s.donations.length === 1 ? "" : "s"} ·{" "}
                        <span className="font-mono">
                            {formatUnits(
                                s.donations.reduce((sum, d) => sum + d.amount, 0n),
                                s.donationDecimals,
                            )}{" "}
                            {s.donationSymbol}
                        </span>{" "}
                        steering the match
                    </p>
                    <p className="text-sm text-ink-muted mb-1" data-testid="round-total-weight">
                        total weight: <span className="font-mono">{s.totalWeight.toString()}</span>
                    </p>
                </div>
            )}

            {s && s.recipients.length > 0 && (
                <div className="mb-8" data-testid="round-recipients">
                    <h2 className="text-base font-semibold text-ink-heading mb-2">Recipients</h2>
                    <p className="text-sm text-ink-muted mb-4">
                        Emergent from the donation stream — the round holds no recipient list.
                    </p>
                    <div className="space-y-4">
                        {s.recipients.map((r) => (
                            <div
                                key={r.address}
                                className="border border-edge-muted rounded-lg p-5"
                                data-testid={`recipient-${r.address.toLowerCase()}`}
                            >
                                <div className="flex items-baseline justify-between mb-2">
                                    <h3 className="text-sm font-semibold text-ink-heading font-mono">
                                        {truncateHex(r.address)}
                                    </h3>
                                    <span className="text-sm text-ink-muted">
                                        weight <span className="font-mono">{r.weight.toString()}</span>
                                    </span>
                                </div>
                                <p className="text-sm text-ink-muted mb-3">
                                    {r.donors.toString()} donor{r.donors === 1n ? "" : "s"} ·{" "}
                                    <span className="font-mono">
                                        {formatUnits(r.received, s.donationDecimals)} {s.donationSymbol}
                                    </span>{" "}
                                    received
                                    {s.finalized && !r.claimed && (
                                        <>
                                            {" "}
                                            · match{" "}
                                            <span className="font-mono">
                                                {formatUnits(r.match, s.matchDecimals)} {s.matchSymbol}
                                            </span>
                                        </>
                                    )}
                                    {r.claimed && <> · match claimed</>}
                                </p>
                                {s.finalized && !r.claimed && r.match > 0n && (
                                    <Button
                                        data-testid={`claim-${r.address.toLowerCase()}`}
                                        disabled={busy !== null}
                                        onClick={() => act("claim", () => round.claim(r.address))}
                                    >
                                        {busy === "claim" ? "Claiming…" : "Pay this recipient"}
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <WalletGate hint="Connect a wallet to donate, finalize, or pay out a recipient.">
                {s && roundStatus(s, nowSeconds) === "donations open" && (
                    <div className="border border-edge-muted rounded-lg p-5 mb-8" data-testid="donate-card">
                        <h2 className="text-base font-semibold text-ink-heading mb-2">Donate</h2>
                        <p className="text-sm text-ink-muted mb-4">
                            Straight through to the recipient — any address (the recipient set is
                            emergent from donations). Your donation is also your steering signal in
                            the match. Minimum{" "}
                            <span className="font-mono">
                                {formatUnits(s.donationFloor, s.donationDecimals)} {s.donationSymbol}
                            </span>
                            ; donating to yourself is refused.
                        </p>
                        <div className="flex flex-wrap gap-3 items-end">
                            <label className="flex flex-col gap-1 text-sm text-ink-body grow">
                                Recipient
                                <input
                                    data-testid="donate-recipient"
                                    className="border border-edge-muted rounded px-3 py-2 font-mono text-sm bg-transparent"
                                    placeholder="0x…"
                                    value={donateRecipient}
                                    onChange={(e) => setDonateRecipient(e.target.value)}
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-sm text-ink-body">
                                Amount ({s.donationSymbol})
                                <input
                                    data-testid="donate-amount"
                                    className="border border-edge-muted rounded px-3 py-2 font-mono text-sm bg-transparent w-36"
                                    placeholder="0.0"
                                    value={donateAmount}
                                    onChange={(e) => setDonateAmount(e.target.value)}
                                />
                            </label>
                            <Button
                                data-testid="donate-submit"
                                disabled={busy !== null || !isValidAddress(donateRecipient) || !donateAmount}
                                onClick={() =>
                                    act("donate", () =>
                                        round.donate(
                                            donateRecipient as `0x${string}`,
                                            parseUnits(donateAmount, s.donationDecimals),
                                        ),
                                    )
                                }
                            >
                                {busy === "donate" ? "Donating…" : "Donate"}
                            </Button>
                        </div>
                    </div>
                )}

                {s && roundStatus(s, nowSeconds) === "awaiting finalize" && (
                    <div className="flex flex-wrap gap-3 mb-8">
                        <Button
                            data-testid="finalize"
                            disabled={busy !== null}
                            onClick={() => act("finalize", () => round.finalize())}
                        >
                            {busy === "finalize" ? "Finalizing…" : "Finalize the round"}
                        </Button>
                    </div>
                )}

                {error && (
                    <p className="text-sm text-red-600 mt-6 break-all" data-testid="round-error">
                        {error}
                    </p>
                )}
            </WalletGate>
        </section>
    );
}

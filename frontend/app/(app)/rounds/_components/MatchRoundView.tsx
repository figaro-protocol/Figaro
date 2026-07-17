"use client";

/**
 * MatchRoundView — one crowd-steered match round's runtime surface at
 * `/rounds?pool=…`. Every act is PERMISSIONLESS network participation, not an
 * admin panel: anyone donates through the no-custody rail (the donation IS
 * the steering signal — quadratic funding reads it), anyone recomputes the
 * match from the rail's public events (the SDK's reference implementation of
 * the round's anchored formula), posts the root under a bond, challenges a
 * wrong one (a challenge always voids — the payout stays purely mechanical),
 * finalizes an unchallenged one, and claims a finalized allocation.
 */

import { useState } from "react";
import { formatEther, formatUnits, parseUnits } from "viem";
import { Button } from "@/components/ui/Button";
import { WalletGate } from "@/components/runtime/WalletGate";
import { useMounted } from "@/hooks/useMounted";
import { useMatchRound, type MatchRoundState } from "@/lib/composition/useMatchRound";
import { bondCaseRulingLabel, deriveBondCasePhase } from "@/lib/composition/bondCases";
import { extractErrorMessage } from "@/lib/shared/errors";
import { hexEqual, isValidAddress } from "@/lib/shared/evm";
import { truncateHex } from "@/lib/shared/formatHex";

function roundStatus(s: MatchRoundState, nowSeconds: number): string {
    if (s.finalized) return "finalized";
    if (s.posting) return "posted";
    const now = BigInt(nowSeconds);
    if (now < s.round.donationStart) return "not yet open";
    if (now <= s.round.donationEnd) return "donations open";
    return "awaiting root";
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
                A crowd-steered match: donations through the no-custody rail go straight to
                their recipients and double as the steering signal — the funded match splits
                by surplus-form quadratic funding over them. The formula is anchored
                on-chain and fixed; anyone recomputes the payout from public events, posts
                it under a bond, and a challenge voids a wrong posting. No committee, no
                application, no recipient registry.
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
                        {s.finalized && <> (finalized budget)</>}
                    </p>
                    <p className="text-sm text-ink-muted mb-1">
                        donations in <span className="font-mono">{s.donationSymbol}</span> ·{" "}
                        {new Date(Number(s.round.donationStart) * 1000).toLocaleString()} →{" "}
                        {new Date(Number(s.round.donationEnd) * 1000).toLocaleString()}
                    </p>
                    <p className="text-sm text-ink-muted mb-1 font-mono break-all">
                        formula {s.formulaHash}
                    </p>
                    {s.posting && (
                        <p className="text-sm text-ink-muted mb-1 font-mono break-all" data-testid="round-posted-root">
                            posted root {s.posting.root} (window → block {s.posting.toBlock.toString()})
                        </p>
                    )}
                    {s.finalized && (
                        <p className="text-sm text-ink-muted mb-1 font-mono break-all" data-testid="round-final-root">
                            finalized root {s.finalRoot} · claimed{" "}
                            {formatUnits(s.claimedTotal, s.matchDecimals)} {s.matchSymbol}
                        </p>
                    )}
                </div>
            )}

            <WalletGate hint="Connect a wallet to donate, recompute, post, challenge, finalize, or claim.">
                {s && roundStatus(s, nowSeconds) === "donations open" && (
                    <div className="border border-edge-muted rounded-lg p-5 mb-8" data-testid="donate-card">
                        <h2 className="text-base font-semibold text-ink-heading mb-2">Donate</h2>
                        <p className="text-sm text-ink-muted mb-4">
                            Straight through to the recipient — any address (the recipient set
                            is emergent from donations). Your donation is also your steering
                            signal in the match.
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

                {s && (
                    <div className="flex flex-wrap gap-3 mb-8">
                        {roundStatus(s, nowSeconds) === "awaiting root" && (
                            <Button
                                data-testid="post-root"
                                disabled={busy !== null}
                                onClick={() => act("post", () => round.postRoot())}
                            >
                                {busy === "post"
                                    ? "Computing + posting…"
                                    : `Compute + post root (${formatEther(s.bondWei)} ETH bond)`}
                            </Button>
                        )}
                        {roundStatus(s, nowSeconds) === "posted" && (
                            <>
                                <Button
                                    data-testid="challenge"
                                    variant="secondary"
                                    disabled={busy !== null}
                                    onClick={() => act("challenge", () => round.challenge())}
                                >
                                    {busy === "challenge"
                                        ? "Challenging…"
                                        : `Challenge (${formatEther(s.bondWei)} ETH bond)`}
                                </Button>
                                <Button
                                    data-testid="finalize"
                                    disabled={busy !== null}
                                    onClick={() => act("finalize", () => round.finalize())}
                                >
                                    {busy === "finalize" ? "Finalizing…" : "Finalize"}
                                </Button>
                            </>
                        )}
                        {s.finalized && !round.hasClaimed && (
                            <Button
                                data-testid="claim"
                                disabled={busy !== null}
                                onClick={() => act("claim", () => round.claim())}
                            >
                                {busy === "claim" ? "Claiming…" : "Claim my allocation"}
                            </Button>
                        )}
                    </div>
                )}

                {round.bondCases.length > 0 && (
                    <div className="mt-2" data-testid="bond-cases">
                        <h2 className="text-base font-semibold text-ink-heading mb-2">Bond cases</h2>
                        <p className="text-sm text-ink-muted mb-4">
                            A challenge always voids its posting — the payout is never at stake
                            here. Each case settles only the two bonds: the poster may escalate
                            to the composed forum inside the dispute window; an unescalated case
                            closes as a concession, the challenger taking both bonds.
                        </p>
                        <div className="space-y-4">
                            {round.bondCases.map((c) => {
                                const phase = deriveBondCasePhase(
                                    c,
                                    BigInt(nowSeconds),
                                    s?.disputeWindowSeconds ?? 0n,
                                );
                                const viewerIsPoster = !!round.account && hexEqual(round.account, c.poster);
                                const id = c.caseId.toString();
                                return (
                                    <div
                                        key={id}
                                        className="border border-edge-muted rounded-lg p-5"
                                        data-testid={`bond-case-${id}`}
                                    >
                                        <div className="flex items-baseline justify-between mb-2">
                                            <h3 className="text-sm font-semibold text-ink-heading">Case {id}</h3>
                                            <span className="text-sm text-ink-muted" data-testid={`bond-case-status-${id}`}>
                                                {phase}
                                            </span>
                                        </div>
                                        <p className="text-sm text-ink-muted mb-1 font-mono break-all">
                                            voided root {c.root}
                                        </p>
                                        <p className="text-sm text-ink-muted mb-3">
                                            poster <span className="font-mono">{truncateHex(c.poster)}</span> ·
                                            challenger <span className="font-mono">{truncateHex(c.challenger)}</span>
                                        </p>
                                        {phase === "escalatable" && viewerIsPoster && (
                                            <Button
                                                data-testid={`dispute-${id}`}
                                                disabled={busy !== null}
                                                onClick={() => act("dispute", () => round.disputeChallenge(c.caseId))}
                                            >
                                                {busy === "dispute" ? "Escalating…" : "Escalate to the forum"}
                                            </Button>
                                        )}
                                        {phase === "escalatable" && !viewerIsPoster && (
                                            <p className="text-sm text-ink-muted">
                                                Awaiting the poster: escalate or concede by silence.
                                            </p>
                                        )}
                                        {phase === "concedable" && (
                                            <Button
                                                data-testid={`concede-${id}`}
                                                variant="secondary"
                                                disabled={busy !== null}
                                                onClick={() => act("concede", () => round.concede(c.caseId))}
                                            >
                                                {busy === "concede" ? "Closing…" : "Close conceded case"}
                                            </Button>
                                        )}
                                        {phase === "disputed" && (
                                            <p className="text-sm text-ink-muted" data-testid={`bond-case-forum-${id}`}>
                                                Escalated to the composed forum
                                                {s ? (
                                                    <> at <span className="font-mono">{truncateHex(s.arbitrator)}</span></>
                                                ) : null}{" "}
                                                — awaiting its ruling.
                                            </p>
                                        )}
                                        {phase === "closed" && (
                                            <p className="text-sm text-ink-body" data-testid={`bond-case-ruling-${id}`}>
                                                {bondCaseRulingLabel(c)}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {round.withdrawableWei > 0n && (
                    <div className="mt-8">
                        <Button
                            data-testid="withdraw-bonds"
                            variant="secondary"
                            disabled={busy !== null}
                            onClick={() => act("withdraw", () => round.withdrawBonds())}
                        >
                            {busy === "withdraw"
                                ? "Withdrawing…"
                                : `Withdraw bonds (${formatEther(round.withdrawableWei)} ETH)`}
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

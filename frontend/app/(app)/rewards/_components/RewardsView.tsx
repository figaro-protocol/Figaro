"use client";

/**
 * RewardsView — the RPGF minter's runtime surface at `/rewards`. Not an admin
 * panel and not an application form: usage is COUNTED ON CHAIN as it happens
 * (a settled order, the clause or assembly proven present in the agreement both parties
 * signed), a period's counts stop moving the moment it ends, and the wallet
 * then claims its clauses' and assemblies' UNIFORM pro-rata share of that period's budget —
 * no cap. There is nothing to post, bond, challenge or adjudicate. The
 * marketing telling lives at /rpgf; this page is the doing surface.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { formatUnits } from "viem";
import { FLORIN_TOKEN_ABI } from "@figaro/sdk";
import { Button } from "@/components/ui/Button";
import { WalletGate } from "@/components/runtime/WalletGate";
import { useMounted } from "@/hooks/useMounted";
import { useRpgfRewards, type RpgfPeriodState } from "@/lib/composition/useRpgfRewards";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { extractErrorMessage } from "@/lib/shared/errors";

/** The period's phase, DERIVED from chain state — never stored. */
function periodStatus(t: RpgfPeriodState): string {
    if (t.claimed) return "claimed";
    if (!t.periodClosed) return "accruing";
    return "claimable";
}

export function RewardsView() {
    const mounted = useMounted();
    const rewards = useRpgfRewards();
    const { address: account } = useAccount();
    const publicClient = usePublicClient();
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [florinBalance, setFlorinBalance] = useState<bigint | null>(null);

    useEffect(() => {
        if (!publicClient || !account || !CONTRACTS.florinToken) return;
        let cancelled = false;
        publicClient
            .readContract({
                address: CONTRACTS.florinToken,
                abi: FLORIN_TOKEN_ABI,
                functionName: "balanceOf",
                args: [account],
            })
            .then((v) => {
                if (!cancelled) setFlorinBalance(v as bigint);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [publicClient, account, rewards.periods]);

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

    return (
        <section className="container mx-auto px-6 pt-24 pb-16 max-w-3xl" data-testid="rewards-page">
            <h1 className="text-heading-h1 text-ink-heading mb-3">Claim RPGF rewards</h1>
            <p className="text-base text-ink-body leading-relaxed mb-8">
                The 600M florins reserved for clause authors and assembly designers of record.
                Usage is counted on chain as it happens — a settled process, the clause or assembly proven
                present in the agreement both parties signed — and buckets into fixed periods.
                Once a period ends its counts are final, and each author claims their clauses&apos; and assemblies&apos;
                share of that period&apos;s budget: their score over the period&apos;s total, uniform
                pro rata with no cap. Eligibility is a live ETH stake — you earn only while your
                clause&apos;s or assembly&apos;s stake stays live. Nothing is
                posted, bonded, or disputed; there is no committee and no application.
            </p>
            <p className="text-sm text-ink-muted mb-8">
                <Link href="/rpgf" className="hover:underline text-ink-heading">
                    How the reward works &rarr;
                </Link>
            </p>

            {!rewards.available && (
                <p className="text-base text-ink-muted" data-testid="rewards-unavailable">
                    The rewards minter is not configured on this network.
                </p>
            )}

            <WalletGate hint="Connect a wallet to read your accrual and claim a closed period.">
                {account && florinBalance !== null && (
                    <p className="text-sm text-ink-muted mb-6" data-testid="florin-balance">
                        Your florin balance: <span className="font-mono">{formatUnits(florinBalance, 18)}</span>
                    </p>
                )}

                <div className="space-y-6">
                    {rewards.periods.map((t) => {
                        const status = periodStatus(t);
                        return (
                            <div
                                key={t.periodId}
                                className="border border-edge-muted rounded-lg p-5"
                                data-testid={`period-card-${t.periodId}`}
                            >
                                <div className="flex items-baseline justify-between mb-2">
                                    <h2 className="text-base font-semibold text-ink-heading">
                                        Period {t.periodId + 1} — {formatUnits(t.amount, 18)} FLORIN
                                    </h2>
                                    <span className="text-sm text-ink-muted" data-testid={`period-status-${t.periodId}`}>
                                        {status}
                                    </span>
                                </div>
                                <p className="text-sm text-ink-muted mb-1" data-testid={`period-total-score-${t.periodId}`}>
                                    period score across all clauses and assemblies:{" "}
                                    <span className="font-mono">{t.totalScore.toString()}</span> · minted so far{" "}
                                    {formatUnits(t.minted, 18)} FLORIN
                                </p>
                                {t.accruals.length > 0 && (
                                    <div className="mt-3 mb-3" data-testid={`period-accruals-${t.periodId}`}>
                                        <p className="text-sm text-ink-body mb-1">
                                            Your clauses and assemblies in this period (score{" "}
                                            <span className="font-mono">{t.myScore.toString()}</span>):
                                        </p>
                                        <ul className="text-sm text-ink-muted space-y-1">
                                            {t.accruals.map((a) => (
                                                <li key={a.clauseOrAssembly} className="font-mono break-all">
                                                    {a.label} — {(a.c + a.batchC).toString()} settled process
                                                    {a.c + a.batchC === 1n ? "" : "es"},{" "}
                                                    {(a.d + a.batchD).toString()} distinct pair
                                                    {a.d + a.batchD === 1n ? "" : "s"}, score{" "}
                                                    {a.score.toString()}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {account && t.accruals.length === 0 && (
                                    <p className="text-sm text-ink-muted mb-3" data-testid={`period-no-accrual-${t.periodId}`}>
                                        Nothing you authored has carried trade in this period yet.
                                    </p>
                                )}
                                {t.periodClosed && !t.claimed && t.claimable > 0n && (
                                    <p className="text-sm text-ink-body mb-3" data-testid={`period-claimable-${t.periodId}`}>
                                        Claimable: <span className="font-mono">{formatUnits(t.claimable, 18)}</span> FLORIN
                                    </p>
                                )}
                                <div className="flex flex-wrap gap-3">
                                    {!t.periodClosed && (
                                        <p className="text-sm text-ink-muted" data-testid={`period-accruing-${t.periodId}`}>
                                            Still accruing — this period opens for claims when it ends.
                                        </p>
                                    )}
                                    {t.periodClosed && !t.claimed && (
                                        <Button
                                            data-testid={`claim-${t.periodId}`}
                                            disabled={busy !== null || t.claimable === 0n}
                                            onClick={() => act("claim", () => rewards.claim(t.periodId))}
                                        >
                                            {busy === "claim" ? "Claiming…" : "Claim my share"}
                                        </Button>
                                    )}
                                    {t.claimed && (
                                        <p className="text-sm text-ink-muted" data-testid={`period-claimed-${t.periodId}`}>
                                            Claimed — one claim per wallet per period.
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {error && (
                    <p className="text-sm text-red-600 mt-6 break-all" data-testid="rewards-error">
                        {error}
                    </p>
                )}
            </WalletGate>
        </section>
    );
}

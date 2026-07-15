"use client";

/**
 * RewardsView — the optimistic RPGF minter's runtime surface at `/rewards`.
 * Every act is PERMISSIONLESS network participation, not an admin panel:
 * anyone recomputes a tranche's payout from public chain events (the SDK's
 * reference implementation of the anchored formula), posts the root under a
 * bond, challenges a wrong one (a challenge always voids — minting stays
 * purely mechanical), finalizes an unchallenged one, and claims a finalized
 * allocation. The marketing telling lives at /clause-rewards; this page is
 * the doing surface.
 */

import { useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { formatEther, formatUnits } from "viem";
import { FIG_TOKEN_ABI } from "@figaro/sdk";
import { Button } from "@/components/ui/Button";
import { WalletGate } from "@/components/runtime/WalletGate";
import { useMounted } from "@/hooks/useMounted";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";
import { useRpgfRewards, type RpgfTrancheState } from "@/lib/composition/useRpgfRewards";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { extractErrorMessage } from "@/lib/shared/errors";
import { useEffect } from "react";

function trancheStatus(t: RpgfTrancheState, nowSeconds: number): string {
    if (t.finalized) return "finalized";
    if (t.posting) return "posted";
    if (BigInt(nowSeconds) < t.earliestPost) return "not yet open";
    return "open";
}

export function RewardsView() {
    const mounted = useMounted();
    // Warm the spec cache: the recompute classifies clauses by their
    // contentHash-verified specs (chain → IPFS), never a bundled list.
    useClauseSpecs();
    const rewards = useRpgfRewards();
    const { address: account } = useAccount();
    const publicClient = usePublicClient();
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [figBalance, setFigBalance] = useState<bigint | null>(null);

    useEffect(() => {
        if (!publicClient || !account || !CONTRACTS.figToken) return;
        let cancelled = false;
        publicClient
            .readContract({
                address: CONTRACTS.figToken,
                abi: FIG_TOKEN_ABI,
                functionName: "balanceOf",
                args: [account],
            })
            .then((v) => {
                if (!cancelled) setFigBalance(v as bigint);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [publicClient, account, rewards.tranches]);

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

    return (
        <section className="container mx-auto px-6 pt-24 pb-16 max-w-3xl" data-testid="rewards-page">
            <h1 className="text-heading-h1 text-ink-heading mb-3">Rewards</h1>
            <p className="text-base text-ink-body leading-relaxed mb-8">
                The 600M FIG reserved for clause authors and assembly designers of record,
                distributed optimistically: anyone recomputes a tranche&apos;s payout from public
                chain events and posts it under a bond; a challenge voids the posting; only a
                root that survives its full challenge window unchallenged mints. The formula is
                anchored on-chain and fixed — no committee, no application.
            </p>

            {!rewards.available && (
                <p className="text-base text-ink-muted" data-testid="rewards-unavailable">
                    The rewards minter is not configured on this network.
                </p>
            )}

            <WalletGate hint="Connect a wallet to recompute, post, challenge, finalize, or claim.">
                {account && figBalance !== null && (
                    <p className="text-sm text-ink-muted mb-6" data-testid="fig-balance">
                        Your FIG balance: <span className="font-mono">{formatUnits(figBalance, 18)}</span>
                    </p>
                )}

                <div className="space-y-6">
                    {rewards.tranches.map((t) => {
                        const status = trancheStatus(t, nowSeconds);
                        return (
                            <div
                                key={t.trancheId}
                                className="border border-edge-muted rounded-lg p-5"
                                data-testid={`tranche-card-${t.trancheId}`}
                            >
                                <div className="flex items-baseline justify-between mb-2">
                                    <h2 className="text-base font-semibold text-ink-heading">
                                        Tranche {t.trancheId + 1} — {formatUnits(t.amount, 18)} FIG
                                    </h2>
                                    <span className="text-sm text-ink-muted" data-testid={`tranche-status-${t.trancheId}`}>
                                        {status}
                                    </span>
                                </div>
                                {t.posting && (
                                    <p className="text-sm text-ink-muted mb-3 font-mono break-all" data-testid={`tranche-posted-root-${t.trancheId}`}>
                                        posted root {t.posting.root} (window → block {t.posting.toBlock.toString()})
                                    </p>
                                )}
                                {t.finalized && (
                                    <p className="text-sm text-ink-muted mb-3 font-mono break-all">
                                        finalized root {t.root} · minted {formatUnits(t.minted, 18)} FIG
                                    </p>
                                )}
                                <div className="flex flex-wrap gap-3">
                                    {status === "open" && (
                                        <Button
                                            data-testid={`post-root-${t.trancheId}`}
                                            disabled={busy !== null}
                                            onClick={() => act("post", () => rewards.postRoot(t))}
                                        >
                                            {busy === "post" ? "Computing + posting…" : `Compute + post root (${formatEther(rewards.bondWei)} ETH bond)`}
                                        </Button>
                                    )}
                                    {status === "posted" && (
                                        <>
                                            <Button
                                                data-testid={`challenge-${t.trancheId}`}
                                                variant="secondary"
                                                disabled={busy !== null}
                                                onClick={() => act("challenge", () => rewards.challenge(t.trancheId))}
                                            >
                                                {busy === "challenge" ? "Challenging…" : `Challenge (${formatEther(rewards.bondWei)} ETH bond)`}
                                            </Button>
                                            <Button
                                                data-testid={`finalize-${t.trancheId}`}
                                                disabled={busy !== null}
                                                onClick={() => act("finalize", () => rewards.finalize(t.trancheId))}
                                            >
                                                {busy === "finalize" ? "Finalizing…" : "Finalize"}
                                            </Button>
                                        </>
                                    )}
                                    {t.finalized && (
                                        <Button
                                            data-testid={`claim-${t.trancheId}`}
                                            disabled={busy !== null}
                                            onClick={() => act("claim", () => rewards.claim(t))}
                                        >
                                            {busy === "claim" ? "Claiming…" : "Claim my allocation"}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {rewards.withdrawableWei > 0n && (
                    <div className="mt-8">
                        <Button
                            data-testid="withdraw-bonds"
                            variant="secondary"
                            disabled={busy !== null}
                            onClick={() => act("withdraw", () => rewards.withdrawBonds())}
                        >
                            {busy === "withdraw"
                                ? "Withdrawing…"
                                : `Withdraw bonds (${formatEther(rewards.withdrawableWei)} ETH)`}
                        </Button>
                    </div>
                )}

                {error && (
                    <p className="text-sm text-red-600 mt-6 break-all" data-testid="rewards-error">
                        {error}
                    </p>
                )}
            </WalletGate>
        </section>
    );
}

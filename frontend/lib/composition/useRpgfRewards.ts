"use client";

/**
 * useRpgfRewards — read + act on the RPGF minter (the 600M distribution).
 * Composition layer: the minter and the counter are contracts the frontend
 * composes with, never core.
 *
 * THERE IS NOTHING TO POST AND NOTHING TO DISPUTE. `UsageCounter` records
 * verified usage as it happens — a settled order plus merkle inclusion of the
 * artifact in the agreement both parties signed — so a tranche is arithmetic
 * over numbers that are already final. A period's counts stop moving the
 * moment it ends; the minter pays a wallet its artifacts' score over the
 * period's total, UNIFORM pro rata (no cap), to live-staked authors of record.
 * The one act is `claim`.
 *
 * The wallet's artifacts are DISCOVERED from the two registries' own event
 * streams (clauses by registrar, assemblies by author) — the same open-world
 * read the minter's `_isAuthor` performs on chain, never a bundled list.
 */

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { computeClauseKey, RPGF_MINTER_ABI, USAGE_COUNTER_ABI } from "@figaro/sdk";
import { CONTRACTS, ASSEMBLY_REGISTRY_ABI, CLAUSE_REGISTRY_ABI } from "@/lib/kernel/contracts";
import { getRpgfMinter, getUsageCounter } from "@/lib/composition/contracts";

/** One artifact the connected wallet is author of record for, with the
 *  accrual it carried in a given period. `c` = distinct settled processes,
 *  `d` = distinct (buyer, seller) pairs, `score` = the uniform breadth
 *  measure (`icbrt(c·d²·1e18)`) the payout divides by. */
export interface RpgfArtifactAccrual {
    /** Clause idHash or assembly compositionHash — the artifact key. */
    artifact: `0x${string}`;
    /** Human label: the clause id, or the truncated hash for an assembly. */
    label: string;
    family: "clause" | "assembly";
    c: bigint;
    d: bigint;
    score: bigint;
}

export interface RpgfTrancheState {
    trancheId: number;
    /** The tranche's florin budget. */
    amount: bigint;
    /** Florins already minted from it. */
    minted: bigint;
    /** True once the matching accrual period has ended: counts are final and
     *  the tranche is claimable. */
    periodClosed: boolean;
    /** Every artifact's score in this period — the payout denominator. */
    totalScore: bigint;
    /** The connected wallet's artifacts and their accrual in this period. */
    accruals: RpgfArtifactAccrual[];
    /** Summed score of those artifacts. */
    myScore: bigint;
    /** What the minter says the wallet can take right now (0 once claimed,
     *  or while the period is still accruing). */
    claimable: bigint;
    /** True once the wallet has claimed this tranche. */
    claimed: boolean;
}

export function useRpgfRewards() {
    const minter = getRpgfMinter();
    const counter = getUsageCounter();
    const publicClient = usePublicClient();
    const { address: account } = useAccount();
    const { writeContractAsync } = useWriteContract();

    const [tranches, setTranches] = useState<RpgfTrancheState[]>([]);
    const [refreshNonce, setRefreshNonce] = useState(0);

    const refresh = useCallback(() => setRefreshNonce((n) => n + 1), []);

    /** Every artifact the wallet is author of record for, from the registries'
     *  event streams. Empty (not an error) when the wallet authored nothing —
     *  resolved-empty is absence. */
    const discoverArtifacts = useCallback(async (): Promise<
        Array<Pick<RpgfArtifactAccrual, "artifact" | "label" | "family">>
    > => {
        if (!publicClient || !account) return [];
        const [clauseEvents, assemblyEvents] = await Promise.all([
            publicClient.getContractEvents({
                address: CONTRACTS.clauseRegistry,
                abi: CLAUSE_REGISTRY_ABI,
                eventName: "ClauseRegistered",
                args: { registrar: account },
                fromBlock: 0n,
            }),
            publicClient.getContractEvents({
                address: CONTRACTS.assemblyRegistry,
                abi: ASSEMBLY_REGISTRY_ABI,
                eventName: "AssemblyRegistered",
                args: { author: account },
                fromBlock: 0n,
            }),
        ]);
        const out = new Map<string, Pick<RpgfArtifactAccrual, "artifact" | "label" | "family">>();
        for (const ev of clauseEvents) {
            const clauseId = ev.args.clauseId;
            const version = ev.args.version;
            if (!clauseId || version === undefined) continue;
            const artifact = computeClauseKey(clauseId, version);
            out.set(artifact.toLowerCase(), { artifact, label: clauseId, family: "clause" });
        }
        for (const ev of assemblyEvents) {
            const artifact = ev.args.compositionHash;
            if (!artifact) continue;
            out.set(artifact.toLowerCase(), {
                artifact,
                label: `${artifact.slice(0, 10)}…`,
                family: "assembly",
            });
        }
        return [...out.values()];
    }, [publicClient, account]);

    useEffect(() => {
        if (!minter || !counter || !publicClient) return;
        let cancelled = false;
        (async () => {
            const minterBase = { address: minter, abi: RPGF_MINTER_ABI } as const;
            const counterBase = { address: counter, abi: USAGE_COUNTER_ABI } as const;
            const [trancheCount, mine] = await Promise.all([
                publicClient.readContract({ ...minterBase, functionName: "TRANCHE_COUNT" }),
                discoverArtifacts(),
            ]);
            const artifacts = mine.map((m) => m.artifact);
            const ids = Array.from({ length: Number(trancheCount) }, (_, i) => i);
            const rows = await Promise.all(
                ids.map(async (trancheId) => {
                    const period = trancheId;
                    const [amount, minted, periodClosed, totalScore, claimed, claimable, accrualRows] =
                        await Promise.all([
                            publicClient.readContract({
                                ...minterBase,
                                functionName: "trancheAmount",
                                args: [BigInt(trancheId)],
                            }),
                            publicClient.readContract({
                                ...minterBase,
                                functionName: "minted",
                                args: [trancheId],
                            }),
                            publicClient.readContract({
                                ...counterBase,
                                functionName: "periodClosed",
                                args: [period],
                            }),
                            publicClient.readContract({
                                ...counterBase,
                                functionName: "totalScoreIn",
                                args: [period],
                            }),
                            account
                                ? publicClient.readContract({
                                      ...minterBase,
                                      functionName: "claimed",
                                      args: [trancheId, account],
                                  })
                                : Promise.resolve(false),
                            account && artifacts.length > 0
                                ? publicClient.readContract({
                                      ...minterBase,
                                      functionName: "claimable",
                                      args: [trancheId, account, artifacts],
                                  })
                                : Promise.resolve(0n),
                            Promise.all(
                                mine.map(async (m) => {
                                    const [c, d, score] = await publicClient.readContract({
                                        ...counterBase,
                                        functionName: "accrualOf",
                                        args: [m.artifact, period],
                                    });
                                    return { ...m, c, d, score };
                                }),
                            ),
                        ]);
                    const accruals = accrualRows.filter((a) => a.score > 0n);
                    return {
                        trancheId,
                        amount,
                        minted,
                        periodClosed,
                        totalScore,
                        accruals,
                        myScore: accruals.reduce((sum, a) => sum + a.score, 0n),
                        claimable,
                        claimed,
                    } satisfies RpgfTrancheState;
                }),
            );
            if (cancelled) return;
            setTranches(rows);
        })().catch(() => {
            /* resolved-empty: the page renders the unavailable state */
        });
        return () => {
            cancelled = true;
        };
    }, [minter, counter, publicClient, account, discoverArtifacts, refreshNonce]);

    /** Claim a closed tranche: one call per wallet per tranche, carrying every
     *  artifact the wallet authored. simulate → write → receipt → refresh, per
     *  the publish-flow pattern — any minter revert (still accruing, already
     *  claimed, not author of record) surfaces BEFORE the wallet prompt. */
    const claim = useCallback(
        async (trancheId: number) => {
            if (!minter) throw new Error("RPGF minter unconfigured.");
            if (!account) throw new Error("Connect a wallet to claim.");
            const tranche = tranches.find((t) => t.trancheId === trancheId);
            const artifacts = tranche?.accruals.map((a) => a.artifact) ?? [];
            if (artifacts.length === 0) throw new Error("This wallet authored nothing that accrued in this period.");
            const call = {
                address: minter,
                abi: RPGF_MINTER_ABI,
                functionName: "claim" as const,
                args: [trancheId, artifacts] as const,
            };
            if (publicClient) await publicClient.simulateContract({ ...call, account });
            const hash = await writeContractAsync(call);
            if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
            refresh();
            return hash;
        },
        [minter, account, tranches, publicClient, writeContractAsync, refresh],
    );

    return {
        available: !!minter && !!counter,
        account,
        tranches,
        claim,
        refresh,
    };
}

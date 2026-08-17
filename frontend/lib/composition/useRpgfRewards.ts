"use client";

/**
 * useRpgfRewards — read + act on the RPGF minter (the 600M distribution).
 * Composition layer: the minter and the counter are contracts the frontend
 * composes with, never core.
 *
 * THERE IS NOTHING TO POST AND NOTHING TO DISPUTE. `UsageCounter` records
 * verified usage as it happens — a settled order plus merkle inclusion of the
 * clause or assembly in the agreement both parties signed — so a period's payout is arithmetic
 * over numbers that are already final. A period's counts stop moving the
 * moment it ends; the minter pays a wallet its clauses' and assemblies' score over the
 * period's total, UNIFORM pro rata (no cap), to live-staked authors of record.
 * The one act is `claim`.
 *
 * The wallet's clauses and assemblies are DISCOVERED from the two registries' own event
 * streams (clauses by registrar, assemblies by author) — the same open-world
 * read the minter's `_isAuthor` performs on chain, never a bundled list.
 */

import { useCallback, useEffect, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { cachedGetContractEvents } from "@/lib/kernel/eventCache";
import { hexEqual } from "@/lib/shared/evm";
import { computeClauseKey, RPGF_MINTER_ABI, USAGE_COUNTER_ABI } from "@figaro/sdk";
import { CONTRACTS, ASSEMBLY_REGISTRY_ABI, CLAUSE_REGISTRY_ABI } from "@/lib/kernel/contracts";
import { getRpgfMinter, getUsageCounter } from "@/lib/composition/contracts";
import { verifyTxSuccess } from "@/lib/shared/verifyTxSuccess";
import { truncateHex } from "@/lib/shared/formatHex";

/** One clause or assembly the connected wallet is author of record for, with
 *  the accrual it carried in a given period. `c` = distinct settled processes,
 *  `d` = distinct staked sellers, `score` = the uniform breadth
 *  measure (`icbrt(c·d²·1e18)`) the payout divides by. */
export interface RpgfClauseOrAssemblyAccrual {
    /** Clause idHash or assembly compositionHash — the clause-or-assembly key. */
    clauseOrAssembly: `0x${string}`;
    /** Human label: the clause id, or the truncated hash for an assembly. */
    label: string;
    family: "clause" | "assembly";
    /** Distinct settled processes, DIRECT path (`accrualOf`). */
    c: bigint;
    /** Distinct staked sellers in this period, DIRECT path. */
    d: bigint;
    /** Distinct settled processes, BATCH path (`batchAccrualOf`). */
    batchC: bigint;
    /** Distinct staked sellers in this period, BATCH path. */
    batchD: bigint;
    /** `scoreOf` — the two paths' scores SUMMED, and the figure the payout
     *  divides by. Reading `accrualOf.score` alone would show the wallet a
     *  smaller number than the minter actually pays it. */
    score: bigint;
}

export interface RpgfPeriodState {
    periodId: number;
    /** The period's florin budget. */
    amount: bigint;
    /** Florins already minted from it. */
    minted: bigint;
    /** True once the matching accrual period has ended: counts are final and
     *  the period is claimable. */
    periodClosed: boolean;
    /** Every clause's and assembly's score in this period — the payout denominator. */
    totalScore: bigint;
    /** The connected wallet's clauses and assemblies and their accrual in this period. */
    accruals: RpgfClauseOrAssemblyAccrual[];
    /** Summed score of those clauses and assemblies. */
    myScore: bigint;
    /** What the minter says the wallet can take right now (0 once claimed,
     *  or while the period is still accruing). */
    claimable: bigint;
    /** True once the wallet has claimed this period. */
    claimed: boolean;
}

export function useRpgfRewards() {
    const minter = getRpgfMinter();
    const counter = getUsageCounter();
    const publicClient = usePublicClient();
    const chainId = useChainId();
    const { address: account } = useAccount();
    const { writeContractAsync } = useWriteContract();

    const [periods, setPeriods] = useState<RpgfPeriodState[]>([]);
    const [readState, setReadState] = useState<"loading" | "ready" | "error">("loading");
    const [readError, setReadError] = useState("");
    const [refreshNonce, setRefreshNonce] = useState(0);

    const refresh = useCallback(() => setRefreshNonce((n) => n + 1), []);

    /** Every clause and assembly the wallet is author of record for, from the
     *  registries' event streams. Empty (not an error) when the wallet
     *  authored nothing — resolved-empty is absence. */
    const discoverClausesAndAssemblies = useCallback(async (): Promise<
        Array<Pick<RpgfClauseOrAssemblyAccrual, "clauseOrAssembly" | "label" | "family">>
    > => {
        if (!publicClient || !account) return [];
        // Through the event cache (deployment block, adaptive chunks); the
        // wallet narrowing is client-side over the one cached scan per event.
        const [allClauseEvents, allAssemblyEvents] = await Promise.all([
            cachedGetContractEvents(publicClient, chainId, {
                address: CONTRACTS.clauseRegistry,
                abi: CLAUSE_REGISTRY_ABI,
                eventName: "ClauseRegistered",
            }),
            cachedGetContractEvents(publicClient, chainId, {
                address: CONTRACTS.assemblyRegistry,
                abi: ASSEMBLY_REGISTRY_ABI,
                eventName: "AssemblyRegistered",
            }),
        ]);
        type ClauseArgs = { registrar?: string; clauseId?: string; version?: bigint };
        type AssemblyArgs = { author?: string; compositionHash?: `0x${string}` };
        const clauseEvents = allClauseEvents.filter((l) => hexEqual(String((l.args as ClauseArgs | undefined)?.registrar ?? ""), account));
        const assemblyEvents = allAssemblyEvents.filter((l) => hexEqual(String((l.args as AssemblyArgs | undefined)?.author ?? ""), account));
        const out = new Map<string, Pick<RpgfClauseOrAssemblyAccrual, "clauseOrAssembly" | "label" | "family">>();
        for (const ev of clauseEvents) {
            const clauseId = (ev.args as ClauseArgs | undefined)?.clauseId;
            const version = (ev.args as ClauseArgs | undefined)?.version;
            if (!clauseId || version === undefined) continue;
            const clauseOrAssembly = computeClauseKey(clauseId, version);
            out.set(clauseOrAssembly.toLowerCase(), { clauseOrAssembly, label: clauseId, family: "clause" });
        }
        for (const ev of assemblyEvents) {
            const clauseOrAssembly = (ev.args as AssemblyArgs | undefined)?.compositionHash;
            if (!clauseOrAssembly) continue;
            out.set(clauseOrAssembly.toLowerCase(), {
                clauseOrAssembly,
                label: truncateHex(clauseOrAssembly, { head: 10, tail: 0 }),
                family: "assembly",
            });
        }
        return [...out.values()];
    }, [publicClient, chainId, account]);

    useEffect(() => {
        if (!minter || !counter || !publicClient) return;
        let cancelled = false;
        setReadState("loading");
        (async () => {
            const minterBase = { address: minter, abi: RPGF_MINTER_ABI } as const;
            const counterBase = { address: counter, abi: USAGE_COUNTER_ABI } as const;
            const [periodCount, mine] = await Promise.all([
                publicClient.readContract({ ...minterBase, functionName: "periodCount" }),
                discoverClausesAndAssemblies(),
            ]);
            const clausesOrAssemblies = mine.map((m) => m.clauseOrAssembly);
            const ids = Array.from({ length: Number(periodCount) }, (_, i) => i);
            const rows = await Promise.all(
                ids.map(async (periodId) => {
                    const period = periodId;
                    const [amount, minted, periodClosed, totalScore, claimed, claimable, accrualRows] =
                        await Promise.all([
                            publicClient.readContract({
                                ...minterBase,
                                functionName: "periodAmount",
                                args: [BigInt(periodId)],
                            }),
                            publicClient.readContract({
                                ...minterBase,
                                functionName: "minted",
                                args: [periodId],
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
                                      args: [periodId, account],
                                  })
                                : Promise.resolve(false),
                            account && clausesOrAssemblies.length > 0
                                ? publicClient.readContract({
                                      ...minterBase,
                                      functionName: "claimable",
                                      args: [periodId, account, clausesOrAssemblies],
                                  })
                                : Promise.resolve(0n),
                            Promise.all(
                                mine.map(async (m) => {
                                    // BOTH settlement paths. `scoreOf` is the
                                    // merged figure the minter pays on; the
                                    // components stay separate because they
                                    // measure different universes and must
                                    // never be added together.
                                    const [[c, d], [batchC, batchD], score] = await Promise.all([
                                        publicClient.readContract({
                                            ...counterBase,
                                            functionName: "accrualOf",
                                            args: [m.clauseOrAssembly, period],
                                        }),
                                        publicClient.readContract({
                                            ...counterBase,
                                            functionName: "batchAccrualOf",
                                            args: [m.clauseOrAssembly, period],
                                        }),
                                        publicClient.readContract({
                                            ...counterBase,
                                            functionName: "scoreOf",
                                            args: [m.clauseOrAssembly, period],
                                        }),
                                    ]);
                                    return { ...m, c, d, batchC, batchD, score };
                                }),
                            ),
                        ]);
                    const accruals = accrualRows.filter((a) => a.score > 0n);
                    return {
                        periodId,
                        amount,
                        minted,
                        periodClosed,
                        totalScore,
                        accruals,
                        myScore: accruals.reduce((sum, a) => sum + a.score, 0n),
                        claimable,
                        claimed,
                    } satisfies RpgfPeriodState;
                }),
            );
            if (cancelled) return;
            setPeriods(rows);
            setReadState("ready");
        })().catch((e) => {
            if (cancelled) return;
            // A failed READ is never resolved-empty: silence here left a
            // connected wallet staring at a blank page. Say what broke.
            setPeriods([]);
            setReadState("error");
            setReadError(e instanceof Error ? e.message : String(e));
        });
        return () => {
            cancelled = true;
        };
    }, [minter, counter, publicClient, account, discoverClausesAndAssemblies, refreshNonce]);

    /** Claim a closed period: one call per wallet per period, carrying every
     *  clause or assembly the wallet authored. simulate → write → receipt → refresh, per
     *  the publish-flow pattern — any minter revert (still accruing, already
     *  claimed, not author of record) surfaces BEFORE the wallet prompt. */
    const claim = useCallback(
        async (periodId: number) => {
            if (!minter) throw new Error("RPGF minter unconfigured.");
            if (!account) throw new Error("Connect a wallet to claim.");
            const row = periods.find((t) => t.periodId === periodId);
            const clausesOrAssemblies = row?.accruals.map((a) => a.clauseOrAssembly) ?? [];
            if (clausesOrAssemblies.length === 0) throw new Error("This wallet authored nothing that accrued in this period.");
            const call = {
                address: minter,
                abi: RPGF_MINTER_ABI,
                functionName: "claim" as const,
                args: [periodId, clausesOrAssemblies] as const,
            };
            if (publicClient) await publicClient.simulateContract({ ...call, account });
            const hash = await writeContractAsync(call);
            if (publicClient) await verifyTxSuccess(publicClient, hash, "The reward was not claimed.");
            refresh();
            return hash;
        },
        [minter, account, periods, publicClient, writeContractAsync, refresh],
    );

    return {
        available: !!minter && !!counter,
        account,
        readState,
        readError,
        periods,
        claim,
        refresh,
    };
}

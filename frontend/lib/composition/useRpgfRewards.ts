"use client";

/**
 * useRpgfRewards — read + act on `RpgfMinter` (the designer rewards, the 600M).
 * Composition layer: the minter and the counter are contracts the frontend
 * composes with, never core.
 *
 * THERE IS NOTHING TO POST AND NOTHING TO DISPUTE. `UsageCounter` counts
 * verified usage as it happens — a resolved order plus merkle inclusion of the
 * clause, or of the provenance leaf naming the registered agreement and the
 * assembly, in the agreement both parties signed — so a period's payout is
 * arithmetic over numbers that are already final. A period's counts stop
 * moving the moment it ends; the minter rewards a wallet its clauses',
 * agreements' and assemblies' score over the period's total, UNIFORM pro rata
 * (no cap), to live-staked designers of record. The one act is `claim`.
 *
 * The wallet's clauses, agreements and assemblies are DISCOVERED from the
 * three registries' own event streams (each keyed by registeredBy) — the same
 * open-world read the minter's `_isAuthor` performs on chain, never a bundled
 * list. Every read and the claim name a `(kind, key)` pair: a registry accepts
 * any bytes32, so the kind — which registry the key was found in — is what
 * keeps a clause key, an agreement key and an assembly composition hash of
 * the same bytes apart.
 */

import { useCallback, useEffect, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { cachedGetContractEvents } from "@/lib/kernel/eventCache";
import { hexEqual } from "@/lib/shared/evm";
import {
    AGREEMENT_REGISTRY_ABI,
    RPGF_MINTER_ABI,
    USAGE_COUNTER_ABI,
    USAGE_KIND_AGREEMENT,
    USAGE_KIND_ASSEMBLY,
    USAGE_KIND_CLAUSE,
    usageKeyId,
    type UsageKey,
    type UsageKind,
} from "@figaro-protocol/sdk";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { CONTRACTS, ASSEMBLY_REGISTRY_ABI, CLAUSE_REGISTRY_ABI } from "@/lib/kernel/contracts";
import { getRpgfMinter, getUsageCounter } from "@/lib/composition/contracts";
import { verifyTxSuccess } from "@/lib/shared/verifyTxSuccess";
import { truncateHex } from "@/lib/shared/formatHex";

/** One clause, agreement or assembly the connected wallet is designer of record for, with
 *  the accrual it carried in a given period. `c` = distinct resolved processes,
 *  `d` = distinct staked sellers, `score` = the uniform breadth
 *  measure (`icbrt(c·d²·1e18)`) the payout divides by. */
export interface RpgfClauseOrAssemblyAccrual {
    /** Clause key, agreement key or assembly compositionHash. */
    clauseOrAssembly: `0x${string}`;
    /** The registry the key was found in — `USAGE_KIND_CLAUSE`,
     *  `USAGE_KIND_AGREEMENT` or `USAGE_KIND_ASSEMBLY`; every read and the
     *  claim name it. */
    kind: UsageKind;
    /** Human label: the clause spec's own name and version when it is loaded,
     *  else the truncated key. */
    label: string;
    family: "clause" | "agreement" | "assembly";
    /** Distinct resolved processes, DIRECT path (`accrualOf`). */
    c: bigint;
    /** Distinct staked sellers in this period, DIRECT path. */
    d: bigint;
    /** Distinct resolved processes, BATCH path (`batchAccrualOf`). */
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
    /** Every clause's, agreement's and assembly's score in this period — the payout denominator. */
    totalScore: bigint;
    /** The connected wallet's clauses, agreements and assemblies and their accrual in this period. */
    accruals: RpgfClauseOrAssemblyAccrual[];
    /** Summed score of those clauses, agreements and assemblies. */
    myScore: bigint;
    /** What the minter says the wallet can take right now (0 once claimed,
     *  or while the period is still accruing). */
    claimable: bigint;
    /** True once the wallet has claimed this period. */
    claimed: boolean;
}

export function useRpgfRewards(subject?: `0x${string}`) {
    const minter = getRpgfMinter();
    const counter = getUsageCounter();
    const publicClient = usePublicClient();
    const chainId = useChainId();
    const { address: connected } = useAccount();
    // The accrual of an address: the connected wallet's, or any address a
    // reader names — accrual is public; only the claim needs the wallet.
    const account = subject ?? connected;
    const { writeContractAsync } = useWriteContract();

    const [periods, setPeriods] = useState<RpgfPeriodState[]>([]);
    const [readState, setReadState] = useState<"loading" | "ready" | "error">("loading");
    const [readError, setReadError] = useState("");
    const [refreshNonce, setRefreshNonce] = useState(0);

    const refresh = useCallback(() => setRefreshNonce((n) => n + 1), []);

    /** Every clause, agreement and assembly the wallet is designer of record
     *  for, from the registries' event streams. Empty (not an error) when the wallet
     *  designed nothing — resolved-empty is absence. */
    const discoverClausesAndAssemblies = useCallback(async (): Promise<
        Array<Pick<RpgfClauseOrAssemblyAccrual, "clauseOrAssembly" | "kind" | "label" | "family">>
    > => {
        if (!publicClient || !account) return [];
        // Through the event cache (deployment block, adaptive chunks); the
        // wallet narrowing is client-side over the one cached scan per event.
        const [allClauseEvents, allAgreementEvents, allAssemblyEvents] = await Promise.all([
            cachedGetContractEvents(publicClient, chainId, {
                address: CONTRACTS.clauseRegistry,
                abi: CLAUSE_REGISTRY_ABI,
                eventName: "ClauseRegistered",
            }),
            CONTRACTS.agreementRegistry
                ? cachedGetContractEvents(publicClient, chainId, {
                    address: CONTRACTS.agreementRegistry,
                    abi: AGREEMENT_REGISTRY_ABI,
                    eventName: "AgreementRegistered",
                })
                : Promise.resolve([]),
            cachedGetContractEvents(publicClient, chainId, {
                address: CONTRACTS.assemblyRegistry,
                abi: ASSEMBLY_REGISTRY_ABI,
                eventName: "AssemblyRegistered",
            }),
        ]);
        type ClauseArgs = { registeredBy?: string; clauseKey?: `0x${string}` };
        type AgreementArgs = { registeredBy?: string; agreementKey?: `0x${string}` };
        type AssemblyArgs = { registeredBy?: string; compositionHash?: `0x${string}` };
        const clauseEvents = allClauseEvents.filter((l) => hexEqual(String((l.args as ClauseArgs | undefined)?.registeredBy ?? ""), account));
        const agreementEvents = allAgreementEvents.filter((l) => hexEqual(String((l.args as AgreementArgs | undefined)?.registeredBy ?? ""), account));
        const assemblyEvents = allAssemblyEvents.filter((l) => hexEqual(String((l.args as AssemblyArgs | undefined)?.registeredBy ?? ""), account));
        const out = new Map<string, Pick<RpgfClauseOrAssemblyAccrual, "clauseOrAssembly" | "kind" | "label" | "family">>();
        for (const ev of clauseEvents) {
            const clauseOrAssembly = (ev.args as ClauseArgs | undefined)?.clauseKey;
            if (!clauseOrAssembly) continue;
            const spec = getClauseSpec(clauseOrAssembly);
            out.set(usageKeyId(USAGE_KIND_CLAUSE, clauseOrAssembly), {
                clauseOrAssembly,
                kind: USAGE_KIND_CLAUSE,
                label: spec ? `${spec.clauseId} v${spec.version}` : truncateHex(clauseOrAssembly, { head: 10, tail: 0 }),
                family: "clause",
            });
        }
        for (const ev of agreementEvents) {
            const clauseOrAssembly = (ev.args as AgreementArgs | undefined)?.agreementKey;
            if (!clauseOrAssembly) continue;
            out.set(usageKeyId(USAGE_KIND_AGREEMENT, clauseOrAssembly), {
                clauseOrAssembly,
                kind: USAGE_KIND_AGREEMENT,
                label: truncateHex(clauseOrAssembly, { head: 10, tail: 0 }),
                family: "agreement",
            });
        }
        for (const ev of assemblyEvents) {
            const clauseOrAssembly = (ev.args as AssemblyArgs | undefined)?.compositionHash;
            if (!clauseOrAssembly) continue;
            out.set(usageKeyId(USAGE_KIND_ASSEMBLY, clauseOrAssembly), {
                clauseOrAssembly,
                kind: USAGE_KIND_ASSEMBLY,
                label: truncateHex(clauseOrAssembly, { head: 10, tail: 0 }),
                family: "assembly",
            });
        }
        return [...out.values()];
    }, [publicClient, chainId, account]);

    useEffect(() => {
        if (!minter || !counter || !publicClient) return;
        let canceled = false;
        setReadState("loading");
        (async () => {
            const minterBase = { address: minter, abi: RPGF_MINTER_ABI } as const;
            const counterBase = { address: counter, abi: USAGE_COUNTER_ABI } as const;
            const [periodCount, mine] = await Promise.all([
                publicClient.readContract({ ...minterBase, functionName: "periodCount" }),
                discoverClausesAndAssemblies(),
            ]);
            const clausesOrAssemblies: UsageKey[] = mine.map((m) => ({ kind: m.kind, key: m.clauseOrAssembly }));
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
                                    // BOTH resolution paths. `scoreOf` is the
                                    // merged figure the minter rewards on; the
                                    // components stay separate because they
                                    // measure different universes and must
                                    // never be added together.
                                    const [[c, d], [batchC, batchD], score] = await Promise.all([
                                        publicClient.readContract({
                                            ...counterBase,
                                            functionName: "accrualOf",
                                            args: [m.kind, m.clauseOrAssembly, period],
                                        }),
                                        publicClient.readContract({
                                            ...counterBase,
                                            functionName: "batchAccrualOf",
                                            args: [m.kind, m.clauseOrAssembly, period],
                                        }),
                                        publicClient.readContract({
                                            ...counterBase,
                                            functionName: "scoreOf",
                                            args: [m.kind, m.clauseOrAssembly, period],
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
            if (canceled) return;
            setPeriods(rows);
            setReadState("ready");
        })().catch((e) => {
            if (canceled) return;
            // A failed READ is never resolved-empty: silence here left a
            // connected wallet staring at a blank page. Say what broke.
            setPeriods([]);
            setReadState("error");
            setReadError(e instanceof Error ? e.message : String(e));
        });
        return () => {
            canceled = true;
        };
    }, [minter, counter, publicClient, account, discoverClausesAndAssemblies, refreshNonce]);

    /** Claim a closed period: one call per wallet per period, carrying every
     *  clause, agreement or assembly the wallet designed. simulate → write → receipt → refresh, per
     *  the publish-flow pattern — any minter revert (still accruing, already
     *  claimed, not designer of record) surfaces BEFORE the wallet prompt. */
    const claim = useCallback(
        async (periodId: number) => {
            if (!minter) throw new Error("Designer-rewards minter unconfigured.");
            if (!account) throw new Error("Connect a wallet to claim.");
            const row = periods.find((t) => t.periodId === periodId);
            const clausesOrAssemblies: UsageKey[] = row?.accruals.map((a) => ({ kind: a.kind, key: a.clauseOrAssembly })) ?? [];
            if (clausesOrAssemblies.length === 0) throw new Error("This wallet designed nothing that accrued in this period.");
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

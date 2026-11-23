"use client";

/**
 * useRpgfRewards — read + act on `RpgfMinter` (the designer rewards, the 600M).
 * The designer rewards: the minter and the counter read the Core and the
 * registries; no Core contract names them.
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
 * keeps a clause key, an agreement hash and an assembly assembly hash of
 * the same bytes apart.
 */

import { useCallback, useEffect, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import type { Abi } from "viem";
import { cachedGetContractEvents } from "@/lib/core/eventCache";
import { hexEqual } from "@/lib/shared/evm";
import {
    AGREEMENT_REGISTRY_ABI,
    MEMBERS_REGISTRY_ABI,
    RPGF_MINTER_ABI,
    USAGE_COUNTER_ABI,
    USAGE_KIND_AGREEMENT,
    USAGE_KIND_PROCESS,
    USAGE_KIND_CLAUSE,
    usageKeyId,
    type UsageKey,
    type UsageKind,
} from "@figaro-protocol/sdk";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { PROCESS_REGISTRY_ABI, CLAUSE_REGISTRY_ABI, REGISTRY_CONTRACTS } from "@/lib/registries/contracts";
import { getRpgfMinter, getUsageCounter } from "@/lib/rewards/contracts";
import { simulateWriteVerify } from "@/lib/shared/contractWrite";
import { truncateHex } from "@/lib/shared/formatHex";
import { PENDING, readNetwork, applyUntilCleanup, type NetworkRead } from "@/lib/shared/networkRead";
import { useDepsChanged } from "@/lib/shared/useDepsChanged";

/** One clause, agreement or assembly the connected wallet is designer of record for, with
 *  the accrual it carried in a given period. `c` = the uses, one for each
 *  seller of each resolved process that carried the key, `d` = distinct
 *  staked sellers (`d <= c`), `score` = the uniform breadth
 *  measure (`icbrt(c·d²·1e18)`) the payout divides by. */
export interface RpgfClauseOrAssemblyAccrual {
    /** Clause key, agreement hash or assembly processDesignHash. */
    clauseOrProcess: `0x${string}`;
    /** The registry the key was found in — `USAGE_KIND_CLAUSE`,
     *  `USAGE_KIND_AGREEMENT` or `USAGE_KIND_PROCESS`; every read and the
     *  claim name it. */
    kind: UsageKind;
    /** Human label: the clause spec's own name and version when it is loaded,
     *  else the truncated key. */
    label: string;
    family: "clause" | "agreement" | "assembly";
    /** The uses (`accrualOf`): one for each seller of each resolved process
     *  that carried the key, whichever way each process reached the chain. */
    c: bigint;
    /** Distinct staked sellers in this period. */
    d: bigint;
    /** `scoreOf` — the one tally's score, and the figure the payout divides by. */
    score: bigint;
    /** `claimed(period, kind, key)` — true once this key has been claimed for
     *  the period. The minter rewards each key once per period, whichever call
     *  names it. */
    claimed: boolean;
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
    /** `UsageCounter.periodEnd(period)`: the chain time, in unix seconds, at
     *  which the period ends. Its own read, so a failed one leaves only this
     *  place empty. */
    periodEnd: NetworkRead<bigint>;
    /** Every clause's, agreement's and assembly's score in this period — the payout denominator. */
    totalScore: bigint;
    /** The connected wallet's clauses, agreements and assemblies and their accrual in this period. */
    accruals: RpgfClauseOrAssemblyAccrual[];
    /** Summed score of those clauses, agreements and assemblies. */
    myScore: bigint;
    /** What the minter says the wallet can take right now: the share of its
     *  keys not yet claimed, and 0 for a wallet that holds no live member
     *  stake (`claimable` reads the same gates `claim` reads; it does not read
     *  whether the period closed). */
    claimable: bigint;
    /** True once every key that accrued for the wallet in this period has
     *  been claimed. */
    claimed: boolean;
}

/** What one read of the minter and the counter says for a wallet. */
export interface RpgfRewardsState {
    periods: RpgfPeriodState[];
    /** Whether the wallet holds a live member stake — the designer-side
     *  membership gate the minter reads at the claim; `null` with no wallet
     *  named or no members registry configured. */
    memberLive: boolean | null;
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

    /** The periods and the member gate, read together: pending in flight,
     *  absent when any of the reads failed, present with what the chain said. */
    const [read, setRead] = useState<NetworkRead<RpgfRewardsState>>(PENDING);
    const [refreshNonce, setRefreshNonce] = useState(0);

    const refresh = useCallback(() => setRefreshNonce((n) => n + 1), []);

    /** Every clause, agreement and assembly the wallet is designer of record
     *  for, from the registries' event streams. Empty (not an error) when the wallet
     *  designed nothing — resolved-empty is absence. */
    const discoverClausesAndAssemblies = useCallback(async (): Promise<
        Array<Pick<RpgfClauseOrAssemblyAccrual, "clauseOrProcess" | "kind" | "label" | "family">>
    > => {
        if (!publicClient || !account) return [];
        // Through the event cache (deployment block, adaptive chunks); the
        // wallet narrowing is client-side over the one cached scan per event.
        const [allClauseEvents, allAgreementEvents, allAssemblyEvents] = await Promise.all([
            cachedGetContractEvents(publicClient, chainId, {
                address: REGISTRY_CONTRACTS.clauseRegistry,
                abi: CLAUSE_REGISTRY_ABI,
                eventName: "ClauseRegistered",
            }),
            REGISTRY_CONTRACTS.agreementRegistry
                ? cachedGetContractEvents(publicClient, chainId, {
                    address: REGISTRY_CONTRACTS.agreementRegistry,
                    abi: AGREEMENT_REGISTRY_ABI,
                    eventName: "AgreementRegistered",
                })
                : Promise.resolve([]),
            cachedGetContractEvents(publicClient, chainId, {
                address: REGISTRY_CONTRACTS.processRegistry,
                abi: PROCESS_REGISTRY_ABI,
                eventName: "ProcessRegistered",
            }),
        ]);
        type ClauseArgs = { registeredBy?: string; clauseKey?: `0x${string}` };
        type AgreementArgs = { registeredBy?: string; agreementHash?: `0x${string}` };
        type AssemblyArgs = { registeredBy?: string; processDesignHash?: `0x${string}` };
        const clauseEvents = allClauseEvents.filter((l) => hexEqual(String((l.args as ClauseArgs | undefined)?.registeredBy ?? ""), account));
        const agreementEvents = allAgreementEvents.filter((l) => hexEqual(String((l.args as AgreementArgs | undefined)?.registeredBy ?? ""), account));
        const assemblyEvents = allAssemblyEvents.filter((l) => hexEqual(String((l.args as AssemblyArgs | undefined)?.registeredBy ?? ""), account));
        const out = new Map<string, Pick<RpgfClauseOrAssemblyAccrual, "clauseOrProcess" | "kind" | "label" | "family">>();
        for (const ev of clauseEvents) {
            const clauseOrProcess = (ev.args as ClauseArgs | undefined)?.clauseKey;
            if (!clauseOrProcess) continue;
            const spec = getClauseSpec(clauseOrProcess);
            out.set(usageKeyId(USAGE_KIND_CLAUSE, clauseOrProcess), {
                clauseOrProcess,
                kind: USAGE_KIND_CLAUSE,
                label: spec ? `${spec.clauseId} v${spec.version}` : truncateHex(clauseOrProcess, { head: 10, tail: 0 }),
                family: "clause",
            });
        }
        for (const ev of agreementEvents) {
            const clauseOrProcess = (ev.args as AgreementArgs | undefined)?.agreementHash;
            if (!clauseOrProcess) continue;
            out.set(usageKeyId(USAGE_KIND_AGREEMENT, clauseOrProcess), {
                clauseOrProcess,
                kind: USAGE_KIND_AGREEMENT,
                label: truncateHex(clauseOrProcess, { head: 10, tail: 0 }),
                family: "agreement",
            });
        }
        for (const ev of assemblyEvents) {
            const clauseOrProcess = (ev.args as AssemblyArgs | undefined)?.processDesignHash;
            if (!clauseOrProcess) continue;
            out.set(usageKeyId(USAGE_KIND_PROCESS, clauseOrProcess), {
                clauseOrProcess,
                kind: USAGE_KIND_PROCESS,
                label: truncateHex(clauseOrProcess, { head: 10, tail: 0 }),
                family: "assembly",
            });
        }
        return [...out.values()];
    }, [publicClient, chainId, account]);

    // A read the inputs changed under is pending from that render
    // (`useDepsChanged`); the effect reads the chain only.
    // Keyed on whether a client is there, with the chain: the wallet library
    // keeps one client per chain, and a render may be handed a fresh object
    // for the same client (the export's prerender is), which as a key would
    // never end.
    const inputsChanged = useDepsChanged([minter, counter, !!publicClient, chainId, account, refreshNonce]);
    if (inputsChanged && minter && counter && publicClient) setRead(PENDING);

    useEffect(() => {
        if (!minter || !counter || !publicClient) return;
        return applyUntilCleanup(readNetwork("useRpgfRewards", async (): Promise<RpgfRewardsState> => {
            const minterBase = { address: minter, abi: RPGF_MINTER_ABI } as const;
            const counterBase = { address: counter, abi: USAGE_COUNTER_ABI } as const;
            // Which of the wallet's clauses, agreements and assemblies carried
            // usage in which period, from the counter's UsageRecorded stream
            // (a direct call and a proved batch emit the same event): every
            // use the counter counts emits one, so a key with no
            // event in a period has no accrual there — resolved-empty is
            // absence. The per-period reads below cover those keys alone, so
            // the page's cost scales with the wallet's USE, never with the size
            // of its catalog (a wallet that designed hundreds of clauses, read
            // in every period, was thousands of calls and a page that never
            // rendered).
            const [periodCount, mine, usageEvents, live] = await Promise.all([
                publicClient.readContract({ ...minterBase, functionName: "periodCount" }),
                discoverClausesAndAssemblies(),
                cachedGetContractEvents(publicClient, chainId, {
                    address: counter, abi: USAGE_COUNTER_ABI, eventName: "UsageRecorded",
                }),
                // The designer-side membership gate, read where the minter reads it:
                // the wallet's live member stake. A page says what a claim needs.
                account && REGISTRY_CONTRACTS.membersRegistry
                    ? (publicClient.readContract({
                        address: REGISTRY_CONTRACTS.membersRegistry, abi: MEMBERS_REGISTRY_ABI, functionName: "registered", args: [account],
                    }) as Promise<boolean>)
                    : Promise.resolve(null),
            ]);
            type UsageArgs = { kind?: number; clauseOrProcess?: `0x${string}`; period?: number };
            const usedIn = new Map<number, Set<string>>();
            for (const ev of usageEvents) {
                const a = ev.args as UsageArgs | undefined;
                if (a?.kind === undefined || !a.clauseOrProcess || a.period === undefined) continue;
                let set = usedIn.get(Number(a.period));
                if (!set) { set = new Set(); usedIn.set(Number(a.period), set); }
                set.add(usageKeyId(a.kind as UsageKind, a.clauseOrProcess));
            }
            const clausesOrProcesses: UsageKey[] = mine.map((m) => ({ kind: m.kind, key: m.clauseOrProcess }));
            const ids = Array.from({ length: Number(periodCount) }, (_, i) => i);
            const rows = await Promise.all(
                ids.map(async (periodId) => {
                    const period = periodId;
                    const [amount, minted, periodClosed, periodEnd, totalScore, claimable, accrualRows] =
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
                            readNetwork("useRpgfRewards.periodEnd", () =>
                                publicClient.readContract({
                                    ...counterBase,
                                    functionName: "periodEnd",
                                    args: [BigInt(period)],
                                }),
                            ),
                            publicClient.readContract({
                                ...counterBase,
                                functionName: "totalScoreIn",
                                args: [period],
                            }),
                            account && clausesOrProcesses.length > 0
                                ? publicClient.readContract({
                                      ...minterBase,
                                      functionName: "claimable",
                                      args: [periodId, account, clausesOrProcesses],
                                  })
                                : Promise.resolve(0n),
                            Promise.all(
                                mine.filter((m) => usedIn.get(period)?.has(usageKeyId(m.kind, m.clauseOrProcess))).map(async (m) => {
                                    // The one tally, route-blind; `scoreOf` is
                                    // the figure the minter rewards on.
                                    const [[c, d], score, claimed] = await Promise.all([
                                        publicClient.readContract({
                                            ...counterBase,
                                            functionName: "accrualOf",
                                            args: [m.kind, m.clauseOrProcess, period],
                                        }),
                                        publicClient.readContract({
                                            ...counterBase,
                                            functionName: "scoreOf",
                                            args: [m.kind, m.clauseOrProcess, period],
                                        }),
                                        // The minter rewards each key once per period.
                                        publicClient.readContract({
                                            ...minterBase,
                                            functionName: "claimed",
                                            args: [periodId, m.kind, m.clauseOrProcess],
                                        }),
                                    ]);
                                    return { ...m, c, d, score, claimed };
                                }),
                            ),
                        ]);
                    const accruals = accrualRows.filter((a) => a.score > 0n);
                    return {
                        periodId,
                        amount,
                        minted,
                        periodClosed,
                        periodEnd,
                        totalScore,
                        accruals,
                        myScore: accruals.reduce((sum, a) => sum + a.score, 0n),
                        claimable,
                        claimed: accruals.length > 0 && accruals.every((a) => a.claimed),
                    } satisfies RpgfPeriodState;
                }),
            );
            return { periods: rows, memberLive: live };
        }), setRead);
    }, [minter, counter, publicClient, chainId, account, discoverClausesAndAssemblies, refreshNonce]);

    /** The earliest end, in the read in hand, of a period the chain has not
     *  closed; undefined when every period read is closed or no end was read. */
    const nextEnd = read.status === "present"
        ? read.value.periods.reduce<bigint | undefined>((earliest, p) =>
            !p.periodClosed && p.periodEnd.status === "present" && (earliest === undefined || p.periodEnd.value < earliest)
                ? p.periodEnd.value
                : earliest, undefined)
        : undefined;

    // A page left open across a period's end reads again once the chain's
    // clock passes it: the latest block's timestamp, the clock
    // `UsageCounter.periodClosed` reads, never the device's. One read per
    // end; the new read says whether the period closed.
    useEffect(() => {
        if (nextEnd === undefined || !publicClient) return;
        let passed = false;
        return publicClient.watchBlocks({
            emitOnBegin: true,
            onBlock: (block) => {
                if (passed || block.timestamp < nextEnd) return;
                passed = true;
                refresh();
            },
        });
    }, [nextEnd, publicClient, refresh]);

    /** Claim a closed period: one call carrying every clause, agreement or
     *  assembly that accrued for the wallet in it. The minter rewards each key
     *  once per period and counts a key already claimed as zero, so the call
     *  mints for the keys not yet claimed. The shared simulate →
     *  send → verify (`simulateWriteVerify`), then refresh — any minter revert (still accruing, already
     *  claimed, not designer of record) surfaces BEFORE the wallet prompt. */
    const claim = useCallback(
        async (periodId: number) => {
            if (!minter) throw new Error("Designer-rewards minter unconfigured.");
            if (!account) throw new Error("Connect a wallet to claim.");
            const row = read.status === "present" ? read.value.periods.find((t) => t.periodId === periodId) : undefined;
            const clausesOrProcesses: UsageKey[] = row?.accruals.map((a) => ({ kind: a.kind, key: a.clauseOrProcess })) ?? [];
            if (clausesOrProcesses.length === 0) throw new Error("This wallet designed nothing that accrued in this period.");
            if (!publicClient) throw new Error("No public client available to send the claim.");
            const hash = await simulateWriteVerify({
                client: publicClient,
                writeContractAsync,
                address: minter,
                abi: RPGF_MINTER_ABI as Abi,
                functionName: "claim",
                args: [periodId, clausesOrProcesses],
                account,
                failureMessage: "The reward was not claimed.",
            });
            refresh();
            return hash;
        },
        [minter, account, read, publicClient, writeContractAsync, refresh],
    );

    return {
        available: !!minter && !!counter,
        account,
        read,
        claim,
        refresh,
    };
}

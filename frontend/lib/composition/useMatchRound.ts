"use client";

/**
 * useMatchRound — read + act on one crowd-steered match round (a
 * DonationRail + OptimisticMatchPool pair). Composition layer: a round is a
 * contract the frontend composes with, never core.
 *
 * A round is ONE pool instance, addressed directly — there is no round
 * registry anywhere (recipients are EMERGENT from donation events, and
 * rounds are emergent from deployments; the address arrives out-of-band,
 * like a forum link). Every act is permissionless: anyone donates through
 * the rail, recomputes the match from the rail's public events (the SDK's
 * `computeMatchAllocations` — the reference implementation of the round's
 * anchored formula spec), posts the root under a bond, challenges a wrong
 * one (a challenge always voids), finalizes, and claims.
 */

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import type { Abi } from "viem";
import {
    buildMatchTree,
    computeMatchAllocations,
    fetchMatchDonationEvents,
    matchLeaf,
    DONATION_RAIL_ABI,
    ERC20_ABI,
    OPTIMISTIC_MATCH_POOL_ABI,
    type MatchAllocation,
    type MatchDonationEvent,
    type MatchRoundConfig,
} from "@figaro/sdk";
import { type MatchBondCase } from "@/lib/composition/bondCases";

export interface MatchRoundState {
    /** The round constants — the pool's immutables. */
    round: MatchRoundConfig;
    arbitrator: `0x${string}`;
    formulaHash: `0x${string}`;
    bondWei: bigint;
    challengeWindowSeconds: bigint;
    disputeWindowSeconds: bigint;
    /** Display metadata read from the two tokens themselves. */
    donationSymbol: string;
    donationDecimals: number;
    matchSymbol: string;
    matchDecimals: number;
    /** The pool's current match-token balance — the funded amount. */
    funded: bigint;
    /** Finalized budget (0 until finalize snapshots it). */
    budget: bigint;
    finalized: boolean;
    finalRoot: `0x${string}`;
    finalToBlock: bigint;
    claimedTotal: bigint;
    /** Active posting, when one is live. */
    posting: {
        poster: `0x${string}`;
        root: `0x${string}`;
        toBlock: bigint;
        postedAt: bigint;
    } | null;
    /** In-scope donations (the round's token; window filtering is the
     *  formula's job at recompute — this list is the raw rail stream for
     *  display). */
    donations: MatchDonationEvent[];
}

export interface MatchRecompute {
    root: `0x${string}`;
    toBlock: bigint;
    budget: bigint;
    allocations: MatchAllocation[];
}

export function useMatchRound(pool: `0x${string}` | null) {
    const publicClient = usePublicClient();
    const { address: account } = useAccount();
    const { writeContractAsync } = useWriteContract();

    const [state, setState] = useState<MatchRoundState | null>(null);
    const [bondCases, setBondCases] = useState<MatchBondCase[]>([]);
    const [withdrawableWei, setWithdrawableWei] = useState<bigint>(0n);
    const [hasClaimed, setHasClaimed] = useState(false);
    const [refreshNonce, setRefreshNonce] = useState(0);

    const refresh = useCallback(() => setRefreshNonce((n) => n + 1), []);

    useEffect(() => {
        if (!pool || !publicClient) return;
        let cancelled = false;
        (async () => {
            const base = { address: pool, abi: OPTIMISTIC_MATCH_POOL_ABI } as const;
            const read = <T,>(functionName: string, args?: readonly unknown[]) =>
                publicClient.readContract({ ...base, functionName, args } as never) as Promise<T>;
            const [
                matchToken,
                donationToken,
                donationRail,
                donationStart,
                donationEnd,
                arbitrator,
                formulaHash,
                bond,
                challengeWindow,
                disputeWindow,
                budget,
                finalized,
                finalRoot,
                finalToBlock,
                claimedTotal,
                posting,
                withdrawable,
                claimed,
                challengedEvents,
                concededEvents,
                ruledEvents,
            ] = await Promise.all([
                read<`0x${string}`>("matchToken"),
                read<`0x${string}`>("donationToken"),
                read<`0x${string}`>("donationRail"),
                read<bigint>("donationStart"),
                read<bigint>("donationEnd"),
                read<`0x${string}`>("arbitrator"),
                read<`0x${string}`>("formulaHash"),
                read<bigint>("bond"),
                read<bigint>("challengeWindow"),
                read<bigint>("disputeWindow"),
                read<bigint>("budget"),
                read<boolean>("finalized"),
                read<`0x${string}`>("finalRoot"),
                read<bigint>("finalToBlock"),
                read<bigint>("claimedTotal"),
                read<readonly [`0x${string}`, `0x${string}`, bigint, bigint, bigint]>("posting"),
                account ? read<bigint>("withdrawable", [account]) : Promise.resolve(0n),
                account ? read<boolean>("claimed", [account]) : Promise.resolve(false),
                publicClient.getContractEvents({ ...base, eventName: "RootChallenged", fromBlock: 0n }),
                publicClient.getContractEvents({ ...base, eventName: "ChallengeConceded", fromBlock: 0n }),
                publicClient.getContractEvents({ ...base, eventName: "CaseRuled", fromBlock: 0n }),
            ]);
            const erc20 = (address: `0x${string}`, functionName: string, args?: readonly unknown[]) =>
                publicClient.readContract({ address, abi: ERC20_ABI, functionName, args } as never);
            const [funded, donationSymbol, donationDecimals, matchSymbol, matchDecimals, donations] =
                await Promise.all([
                    erc20(matchToken, "balanceOf", [pool]) as Promise<bigint>,
                    erc20(donationToken, "symbol") as Promise<string>,
                    erc20(donationToken, "decimals") as Promise<number>,
                    erc20(matchToken, "symbol") as Promise<string>,
                    erc20(matchToken, "decimals") as Promise<number>,
                    // cacheTime: 0 — a refresh fires immediately after a donate's
                    // receipt, and viem caches getBlockNumber (~pollingInterval),
                    // so a stale number would set toBlock BEFORE the donation's
                    // block and drop it (the count stuck at 0 after a UI donation).
                    fetchMatchDonationEvents(publicClient, donationRail, await publicClient.getBlockNumber({ cacheTime: 0 })),
                ]);
            // The case track, event-sourced: RootChallenged births a case; its
            // live status comes from the bondCases(caseId) read; concession
            // and ruling attach from their own events.
            const cases = await Promise.all(
                challengedEvents.map(async (ev) => {
                    const caseId = ev.args.caseId as bigint;
                    const onChain = (await publicClient.readContract({
                        ...base,
                        functionName: "bondCases",
                        args: [caseId],
                    })) as readonly [`0x${string}`, `0x${string}`, bigint, number];
                    const ruled = ruledEvents.find((r) => (r.args.caseId as bigint) === caseId);
                    return {
                        caseId,
                        root: ev.args.root as `0x${string}`,
                        poster: onChain[0],
                        challenger: onChain[1],
                        challengedAt: onChain[2],
                        status: Number(onChain[3]),
                        ruling: ruled ? Number(ruled.args.ruling) : null,
                        conceded: concededEvents.some((c) => (c.args.caseId as bigint) === caseId),
                    } satisfies MatchBondCase;
                }),
            );
            if (cancelled) return;
            setBondCases(cases);
            setWithdrawableWei(withdrawable);
            setHasClaimed(claimed);
            setState({
                round: {
                    donationRail,
                    matchPool: pool,
                    donationToken,
                    matchToken,
                    donationStart,
                    donationEnd,
                },
                arbitrator,
                formulaHash,
                bondWei: bond,
                challengeWindowSeconds: challengeWindow,
                disputeWindowSeconds: disputeWindow,
                donationSymbol,
                donationDecimals: Number(donationDecimals),
                matchSymbol,
                matchDecimals: Number(matchDecimals),
                funded,
                budget,
                finalized,
                finalRoot,
                finalToBlock,
                claimedTotal,
                posting: posting[4] > 0n ? { poster: posting[0], root: posting[1], toBlock: posting[3], postedAt: posting[4] } : null,
                donations: donations.filter((d) => d.token.toLowerCase() === donationToken.toLowerCase()),
            });
        })().catch(() => {
            /* resolved-empty: the page renders the unavailable state */
        });
        return () => {
            cancelled = true;
        };
    }, [pool, publicClient, account, refreshNonce]);

    /** simulate → write → receipt → refresh, per the publish-flow pattern. */
    const sendCall = useCallback(
        async (call: { address: `0x${string}`; abi: Abi; functionName: string; args?: readonly unknown[]; value?: bigint }) => {
            if (publicClient) {
                // Pre-flight dry-run: any revert (window, bond, proof, amount)
                // surfaces BEFORE the wallet prompt opens.
                await publicClient.simulateContract({ ...call, account } as never);
            }
            const hash = await writeContractAsync(call as never);
            if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
            refresh();
            return hash;
        },
        [publicClient, account, writeContractAsync, refresh],
    );

    /** Donate through the rail: straight donor → recipient, the event is the
     *  formula's input. Approves the rail for exactly the shortfall first. */
    const donate = useCallback(
        async (recipient: `0x${string}`, amount: bigint) => {
            if (!state || !publicClient || !account) throw new Error("Connect a wallet to donate.");
            const { donationToken, donationRail } = state.round;
            const allowance = (await publicClient.readContract({
                address: donationToken,
                abi: ERC20_ABI,
                functionName: "allowance",
                args: [account, donationRail],
            })) as bigint;
            if (allowance < amount) {
                await sendCall({
                    address: donationToken,
                    abi: ERC20_ABI as Abi,
                    functionName: "approve",
                    args: [donationRail, amount],
                });
            }
            return sendCall({
                address: donationRail,
                abi: DONATION_RAIL_ABI as Abi,
                functionName: "donate",
                args: [donationToken, recipient, amount],
            });
        },
        [state, publicClient, account, sendCall],
    );

    /** Run the formula over the round — the same recompute any observer
     *  runs: donations from the rail's events, budget = the pool's match-token
     *  balance at `toBlock` (deterministic chain state, per the spec). */
    const recompute = useCallback(
        async (toBlock?: bigint): Promise<MatchRecompute> => {
            if (!state || !publicClient || !pool) throw new Error("No chain connection.");
            const window = toBlock ?? (await publicClient.getBlockNumber());
            const [donations, budget] = await Promise.all([
                fetchMatchDonationEvents(publicClient, state.round.donationRail, window),
                publicClient.readContract({
                    address: state.round.matchToken,
                    abi: ERC20_ABI,
                    functionName: "balanceOf",
                    args: [pool],
                    blockNumber: window,
                }) as Promise<bigint>,
            ]);
            const allocations = computeMatchAllocations(donations, state.round, budget);
            const tree = buildMatchTree(allocations.map((a) => matchLeaf(a.account, a.amount)));
            return { root: tree.root, toBlock: window, budget, allocations };
        },
        [state, publicClient, pool],
    );

    const poolCall = useCallback(
        (functionName: string, args?: readonly unknown[], value?: bigint) => {
            if (!pool) throw new Error("No round address.");
            return sendCall({ address: pool, abi: OPTIMISTIC_MATCH_POOL_ABI as Abi, functionName, args, value });
        },
        [pool, sendCall],
    );

    /** Recompute and post the round's root, staking the bond. */
    const postRoot = useCallback(async () => {
        if (!state) throw new Error("Round not loaded.");
        const { root, toBlock } = await recompute();
        return poolCall("postRoot", [root, 0n, toBlock], state.bondWei);
    }, [state, recompute, poolCall]);

    /** Void the active posting, staking an equal bond (the bond case settles
     *  on its own track — the payout stays purely mechanical). */
    const challenge = useCallback(() => {
        if (!state) throw new Error("Round not loaded.");
        return poolCall("challenge", [], state.bondWei);
    }, [state, poolCall]);

    /** Escalate a challenge to the composed forum (poster-only, inside the
     *  dispute window). `feeWei` is the forum's fee, forwarded verbatim. */
    const disputeChallenge = useCallback(
        (caseId: bigint, feeWei: bigint = 0n) => poolCall("disputeChallenge", [caseId], feeWei),
        [poolCall],
    );

    /** Close an unescalated challenge after the dispute window: the poster
     *  conceded by silence, the challenger takes both bonds. Anyone may call. */
    const concede = useCallback((caseId: bigint) => poolCall("concede", [caseId]), [poolCall]);

    const finalize = useCallback(() => poolCall("finalize"), [poolCall]);

    /** Claim the connected wallet's allocation from the finalized round: the
     *  proof rebuilds from the finalized window's recompute. */
    const claim = useCallback(async () => {
        if (!account) throw new Error("Connect a wallet to claim.");
        if (!state?.finalized) throw new Error("Round not finalized.");
        const { allocations } = await recompute(state.finalToBlock);
        const mine = allocations.find((a) => a.account.toLowerCase() === account.toLowerCase());
        if (!mine) throw new Error("No allocation for this wallet in the finalized window.");
        const tree = buildMatchTree(allocations.map((a) => matchLeaf(a.account, a.amount)));
        const proof = tree.proofOf(matchLeaf(mine.account, mine.amount));
        return poolCall("claim", [account, mine.amount, proof]);
    }, [account, state, recompute, poolCall]);

    const withdrawBonds = useCallback(() => poolCall("withdrawBonds"), [poolCall]);

    return {
        available: !!pool,
        account,
        state,
        bondCases,
        withdrawableWei,
        hasClaimed,
        donate,
        recompute,
        postRoot,
        challenge,
        disputeChallenge,
        concede,
        finalize,
        claim,
        withdrawBonds,
        refresh,
    };
}

"use client";

/**
 * useRpgfRewards — read + act on the optimistic RPGF minter (the 600M
 * distribution). Composition layer: the minter is a contract the frontend
 * composes with, never core.
 *
 * The distribution is OPTIMISTIC and every act here is permissionless: anyone
 * recomputes a tranche's payout from public chain events (the SDK's
 * `computeRpgfAllocations` — the reference implementation of the anchored
 * formula spec) and can post the root, challenge a wrong one, finalize an
 * unchallenged one, and claim any finalized allocation. The clause
 * classification the formula needs (`block.article`) comes from the warmed
 * spec cache — chain → IPFS, contentHash-verified — never a bundled list.
 */

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import {
    buildRpgfTree,
    computeRpgfAllocations,
    fetchRpgfEventStream,
    rpgfLeaf,
    RPGF_MINTER_ABI,
    type RpgfAllocation,
    type RpgfSpecClassification,
} from "@figaro/sdk";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { getAttestationCoordinator, getRpgfMinter } from "@/lib/composition/contracts";
import { getClauseSpec, listKnownClauses } from "@/lib/shared/clauseSpecSource";
import { type RpgfBondCase } from "@/lib/composition/bondCases";

export interface RpgfTrancheState {
    trancheId: number;
    amount: bigint;
    earliestPost: bigint;
    root: `0x${string}`;
    finalized: boolean;
    minted: bigint;
    /** Active posting, when one is live. */
    posting: {
        poster: `0x${string}`;
        root: `0x${string}`;
        toBlock: bigint;
        postedAt: bigint;
    } | null;
}

export interface RpgfRecompute {
    root: `0x${string}`;
    toBlock: bigint;
    allocations: RpgfAllocation[];
}

/** The formula's classification input, derived from the warmed spec cache —
 *  every known clause's `block.article`. A clause whose spec failed to load
 *  is absent (→ scores zero), exactly the formula's unavailable-spec rule. */
function classificationFromSpecCache(): Map<string, RpgfSpecClassification> {
    const out = new Map<string, RpgfSpecClassification>();
    for (const { clauseId } of listKnownClauses()) {
        const article = getClauseSpec(clauseId)?.block?.article;
        out.set(clauseId, article ? { article } : null);
    }
    return out;
}

export function useRpgfRewards() {
    const minter = getRpgfMinter();
    const publicClient = usePublicClient();
    const { address: account } = useAccount();
    const { writeContractAsync } = useWriteContract();

    const [tranches, setTranches] = useState<RpgfTrancheState[]>([]);
    const [bondCases, setBondCases] = useState<RpgfBondCase[]>([]);
    const [bondWei, setBondWei] = useState<bigint>(0n);
    const [disputeWindowSeconds, setDisputeWindowSeconds] = useState<bigint>(0n);
    const [withdrawableWei, setWithdrawableWei] = useState<bigint>(0n);
    const [refreshNonce, setRefreshNonce] = useState(0);

    const refresh = useCallback(() => setRefreshNonce((n) => n + 1), []);

    useEffect(() => {
        if (!minter || !publicClient) return;
        let cancelled = false;
        (async () => {
            const base = { address: minter, abi: RPGF_MINTER_ABI } as const;
            const [bond, disputeWindow, withdrawable, challengedEvents, concededEvents, ruledEvents, ...rest] =
                await Promise.all([
                    publicClient.readContract({ ...base, functionName: "bond" }),
                    publicClient.readContract({ ...base, functionName: "disputeWindow" }),
                    account
                        ? publicClient.readContract({ ...base, functionName: "withdrawable", args: [account] })
                        : Promise.resolve(0n),
                    publicClient.getContractEvents({ ...base, eventName: "RootChallenged", fromBlock: 0n }),
                    publicClient.getContractEvents({ ...base, eventName: "ChallengeConceded", fromBlock: 0n }),
                    publicClient.getContractEvents({ ...base, eventName: "CaseRuled", fromBlock: 0n }),
                    ...[0, 1, 2].map((t) =>
                        Promise.all([
                            publicClient.readContract({ ...base, functionName: "tranches", args: [BigInt(t)] }),
                            publicClient.readContract({ ...base, functionName: "postings", args: [BigInt(t)] }),
                        ]),
                    ),
                ]);
            // The case track, event-sourced: RootChallenged births a case; its
            // live status comes from the bondCases(caseId) read; concession and
            // ruling attach from their own events.
            const cases = await Promise.all(
                challengedEvents.map(async (ev) => {
                    const caseId = ev.args.caseId as bigint;
                    const onChain = await publicClient.readContract({
                        ...base,
                        functionName: "bondCases",
                        args: [caseId],
                    });
                    const ruled = ruledEvents.find((r) => (r.args.caseId as bigint) === caseId);
                    return {
                        caseId,
                        trancheId: Number(ev.args.trancheId),
                        root: ev.args.root as `0x${string}`,
                        poster: onChain[0],
                        challenger: onChain[1],
                        challengedAt: onChain[2] as bigint,
                        status: Number(onChain[3]),
                        ruling: ruled ? Number(ruled.args.ruling) : null,
                        conceded: concededEvents.some((c) => (c.args.caseId as bigint) === caseId),
                    } satisfies RpgfBondCase;
                }),
            );
            if (cancelled) return;
            setBondWei(bond);
            setDisputeWindowSeconds(disputeWindow as bigint);
            setBondCases(cases);
            setWithdrawableWei(withdrawable);
            setTranches(
                (rest as Array<[
                    readonly [bigint, bigint, `0x${string}`, bigint, bigint, boolean, bigint],
                    readonly [`0x${string}`, `0x${string}`, bigint, bigint, bigint],
                ]>).map(([tr, p], t) => ({
                    trancheId: t,
                    amount: tr[0],
                    earliestPost: tr[1],
                    root: tr[2],
                    finalized: tr[5],
                    minted: tr[6],
                    posting:
                        p[4] > 0n
                            ? { poster: p[0], root: p[1], toBlock: p[3], postedAt: p[4] }
                            : null,
                })),
            );
        })().catch(() => {
            /* resolved-empty: the page renders the unavailable state */
        });
        return () => {
            cancelled = true;
        };
    }, [minter, publicClient, account, refreshNonce]);

    /** Run the formula over `[0, toBlock]` (defaults to the latest block) —
     *  the same recompute any observer runs. */
    const recompute = useCallback(
        async (trancheAmount: bigint, toBlock?: bigint): Promise<RpgfRecompute> => {
            if (!publicClient) throw new Error("No chain connection.");
            const attestationCoordinator = getAttestationCoordinator();
            if (!attestationCoordinator) throw new Error("Attestation coordinator unconfigured.");
            const window = toBlock ?? (await publicClient.getBlockNumber());
            const stream = await fetchRpgfEventStream(
                publicClient,
                {
                    figaroCore: CONTRACTS.core,
                    attestationCoordinator,
                    clauseRegistry: CONTRACTS.clauseRegistry,
                    assemblyRegistry: CONTRACTS.assemblyRegistry,
                    sellerRegistry: CONTRACTS.sellerRegistry,
                },
                window,
            );
            const allocations = computeRpgfAllocations(stream, classificationFromSpecCache(), trancheAmount);
            const tree = buildRpgfTree(allocations.map((a) => rpgfLeaf(a.account, a.amount)));
            return { root: tree.root, toBlock: window, allocations };
        },
        [publicClient],
    );

    /** simulate → write → receipt → refresh, per the publish-flow pattern.
     *  `request` is a fully-typed contract call (viem narrows per function). */
    const send = useCallback(
        async (request: {
            functionName:
                | "postRoot"
                | "challenge"
                | "disputeChallenge"
                | "concede"
                | "finalize"
                | "claim"
                | "withdrawBonds";
            args?: readonly unknown[];
            value?: bigint;
        }) => {
            if (!minter) throw new Error("RPGF minter unconfigured.");
            const call = {
                address: minter,
                abi: RPGF_MINTER_ABI,
                functionName: request.functionName,
                args: request.args,
                value: request.value,
            };
            if (publicClient) {
                // Pre-flight dry-run: any minter revert (window, bond, proof)
                // surfaces BEFORE the wallet prompt opens.
                await publicClient.simulateContract({ ...call, account } as never);
            }
            const hash = await writeContractAsync(call as never);
            if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
            refresh();
            return hash;
        },
        [minter, publicClient, account, writeContractAsync, refresh],
    );

    /** Recompute and post a tranche's root, staking the bond. */
    const postRoot = useCallback(
        async (tranche: RpgfTrancheState) => {
            const { root, toBlock } = await recompute(tranche.amount);
            return send({
                functionName: "postRoot",
                args: [tranche.trancheId, root, 0n, toBlock],
                value: bondWei,
            });
        },
        [recompute, send, bondWei],
    );

    /** Void the active posting, staking an equal bond (the bond case settles
     *  on its own track — minting stays purely mechanical). */
    const challenge = useCallback(
        (trancheId: number) => send({ functionName: "challenge", args: [trancheId], value: bondWei }),
        [send, bondWei],
    );

    /** Escalate a challenge to the composed forum (poster-only, inside the
     *  dispute window). `feeWei` is the forum's fee, forwarded verbatim —
     *  provider-defined; the devnet mock accepts zero. */
    const disputeChallenge = useCallback(
        (caseId: bigint, feeWei: bigint = 0n) =>
            send({ functionName: "disputeChallenge", args: [caseId], value: feeWei }),
        [send],
    );

    /** Close an unescalated challenge after the dispute window: the poster
     *  conceded by silence, the challenger takes both bonds. Anyone may call. */
    const concede = useCallback(
        (caseId: bigint) => send({ functionName: "concede", args: [caseId] }),
        [send],
    );

    const finalize = useCallback(
        (trancheId: number) => send({ functionName: "finalize", args: [trancheId] }),
        [send],
    );

    /** Claim the connected wallet's allocation from a finalized tranche: the
     *  proof rebuilds from the finalized window's recompute. */
    const claim = useCallback(
        async (tranche: RpgfTrancheState) => {
            if (!account) throw new Error("Connect a wallet to claim.");
            if (!publicClient || !minter) throw new Error("No chain connection.");
            const onChain = await publicClient.readContract({
                address: minter,
                abi: RPGF_MINTER_ABI,
                functionName: "tranches",
                args: [BigInt(tranche.trancheId)],
            });
            if (!onChain[5]) throw new Error("Tranche not finalized.");
            const { allocations } = await recompute(tranche.amount, onChain[4]);
            const mine = allocations.find((a) => a.account.toLowerCase() === account.toLowerCase());
            if (!mine) throw new Error("No allocation for this wallet in the finalized window.");
            const tree = buildRpgfTree(allocations.map((a) => rpgfLeaf(a.account, a.amount)));
            const proof = tree.proofOf(rpgfLeaf(mine.account, mine.amount));
            return send({
                functionName: "claim",
                args: [tranche.trancheId, account, mine.amount, proof],
            });
        },
        [account, publicClient, minter, recompute, send],
    );

    const withdrawBonds = useCallback(() => send({ functionName: "withdrawBonds" }), [send]);

    return {
        available: !!minter,
        account,
        tranches,
        bondCases,
        bondWei,
        disputeWindowSeconds,
        withdrawableWei,
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

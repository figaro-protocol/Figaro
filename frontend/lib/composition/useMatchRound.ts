"use client";

/**
 * useMatchRound — read + act on one crowd-steered match round (a `MatchPool`
 * instance). Composition layer: a round is a contract the frontend composes
 * with, never core.
 *
 * A round is ONE pool instance, addressed directly — there is no round
 * registry anywhere (recipients are EMERGENT from donations, and rounds are
 * emergent from deployments; the address arrives out-of-band, like a forum
 * link). THE POOL IS ITS OWN DONATION RAIL: a donation passes straight
 * through to its recipient — the round never holds it — while the
 * quadratic-funding weight accumulates AS THE DONATION LANDS. The match is
 * then arithmetic over numbers the chain already has, so there is no root to
 * post, no bond, no challenge window and no referee. Every act is
 * permissionless: anyone donates, anyone finalizes once the window has ended,
 * and anyone may claim on a recipient's behalf (the tokens always go to the
 * recipient).
 */

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import type { Abi } from "viem";
import { ERC20_ABI, MATCH_POOL_ABI } from "@figaro/sdk";

/** One donation the round counted — its own `Donation` event. */
interface MatchDonation {
    donor: `0x${string}`;
    recipient: `0x${string}`;
    amount: bigint;
    /** The recipient's matched weight immediately after this donation. */
    weightAfter: bigint;
}

/** A recipient the round discovered from its own donation stream. */
interface MatchRecipient {
    address: `0x${string}`;
    /** Distinct donating wallets — breadth is what the surplus form rewards. */
    donors: bigint;
    /** Summed donations received through this round. */
    received: bigint;
    /** The coordination surplus `sumSqrt² − sumOf`. */
    weight: bigint;
    /** `budget × weight / totalWeight`, capped — zero until finalized. */
    match: bigint;
    claimed: boolean;
}

export interface MatchRoundState {
    /** The round constants — the pool's immutables. */
    matchToken: `0x${string}`;
    donationToken: `0x${string}`;
    donationStart: bigint;
    donationEnd: bigint;
    /** Minimum donation that counts — the sybil floor. */
    donationFloor: bigint;
    /** Per-recipient ceiling as a percentage of the budget (15). */
    capPercent: number;
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
    /** Match already paid out. */
    paid: bigint;
    /** Summed matched weight — the claim divisor. */
    totalWeight: bigint;
    /** Every counted donation, in event order. */
    donations: MatchDonation[];
    /** Every recipient the donations named, richest weight first. */
    recipients: MatchRecipient[];
}

export function useMatchRound(pool: `0x${string}` | null) {
    const publicClient = usePublicClient();
    const { address: account } = useAccount();
    const { writeContractAsync } = useWriteContract();

    const [state, setState] = useState<MatchRoundState | null>(null);
    const [refreshNonce, setRefreshNonce] = useState(0);

    const refresh = useCallback(() => setRefreshNonce((n) => n + 1), []);

    useEffect(() => {
        if (!pool || !publicClient) return;
        let cancelled = false;
        (async () => {
            const base = { address: pool, abi: MATCH_POOL_ABI } as const;
            const [
                matchToken,
                donationToken,
                donationStart,
                donationEnd,
                donationFloor,
                capNumerator,
                capDenominator,
                budget,
                finalized,
                paid,
                totalWeight,
                donationEvents,
            ] = await Promise.all([
                publicClient.readContract({ ...base, functionName: "matchToken" }),
                publicClient.readContract({ ...base, functionName: "donationToken" }),
                publicClient.readContract({ ...base, functionName: "donationStart" }),
                publicClient.readContract({ ...base, functionName: "donationEnd" }),
                publicClient.readContract({ ...base, functionName: "donationFloor" }),
                publicClient.readContract({ ...base, functionName: "CAP_NUMERATOR" }),
                publicClient.readContract({ ...base, functionName: "CAP_DENOMINATOR" }),
                publicClient.readContract({ ...base, functionName: "budget" }),
                publicClient.readContract({ ...base, functionName: "finalized" }),
                publicClient.readContract({ ...base, functionName: "paid" }),
                publicClient.readContract({ ...base, functionName: "totalWeight" }),
                // cacheTime: 0 — a refresh fires immediately after a donate's
                // receipt, and viem caches getBlockNumber (~pollingInterval), so
                // a stale toBlock would drop the donation just landed.
                publicClient.getBlockNumber({ cacheTime: 0 }).then((toBlock) =>
                    publicClient.getContractEvents({
                        ...base,
                        eventName: "Donation",
                        fromBlock: 0n,
                        toBlock,
                    }),
                ),
            ]);

            const donations: MatchDonation[] = donationEvents.flatMap((ev) =>
                ev.args.donor && ev.args.recipient && ev.args.amount !== undefined
                    ? [
                          {
                              donor: ev.args.donor,
                              recipient: ev.args.recipient,
                              amount: ev.args.amount,
                              weightAfter: ev.args.weightAfter ?? 0n,
                          },
                      ]
                    : [],
            );

            const erc20 = (address: `0x${string}`, functionName: string, args?: readonly unknown[]) =>
                publicClient.readContract({ address, abi: ERC20_ABI, functionName, args } as never);
            const [funded, donationSymbol, donationDecimals, matchSymbol, matchDecimals] = await Promise.all([
                erc20(matchToken, "balanceOf", [pool]) as Promise<bigint>,
                erc20(donationToken, "symbol") as Promise<string>,
                erc20(donationToken, "decimals") as Promise<number>,
                erc20(matchToken, "symbol") as Promise<string>,
                erc20(matchToken, "decimals") as Promise<number>,
            ]);

            // Recipients are EMERGENT — the donation stream names them; the
            // round holds no recipient list and there is no registry to read.
            const addresses = [...new Set(donations.map((d) => d.recipient.toLowerCase()))].map(
                (lower) => donations.find((d) => d.recipient.toLowerCase() === lower)!.recipient,
            );
            const recipients = await Promise.all(
                addresses.map(async (address) => {
                    const [row, weight, match] = await Promise.all([
                        publicClient.readContract({ ...base, functionName: "recipientOf", args: [address] }),
                        publicClient.readContract({ ...base, functionName: "weightOf", args: [address] }),
                        publicClient.readContract({ ...base, functionName: "matchOf", args: [address] }),
                    ]);
                    return {
                        address,
                        donors: BigInt(row[2]),
                        received: row[1],
                        weight,
                        match,
                        claimed: row[3],
                    } satisfies MatchRecipient;
                }),
            );
            recipients.sort((a, b) => (b.weight === a.weight ? 0 : b.weight > a.weight ? 1 : -1));

            if (cancelled) return;
            setState({
                matchToken,
                donationToken,
                donationStart,
                donationEnd,
                donationFloor,
                capPercent: Number((capNumerator * 100n) / capDenominator),
                donationSymbol,
                donationDecimals: Number(donationDecimals),
                matchSymbol,
                matchDecimals: Number(matchDecimals),
                funded,
                budget,
                finalized,
                paid,
                totalWeight,
                donations,
                recipients,
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
        async (call: { address: `0x${string}`; abi: Abi; functionName: string; args?: readonly unknown[] }) => {
            if (publicClient) {
                // Pre-flight dry-run: any revert (window closed, below floor,
                // self-donation, not finalized) surfaces BEFORE the wallet prompt.
                await publicClient.simulateContract({ ...call, account } as never);
            }
            const hash = await writeContractAsync(call as never);
            if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
            refresh();
            return hash;
        },
        [publicClient, account, writeContractAsync, refresh],
    );

    /** Donate through the round: straight donor → recipient, with the weight
     *  recorded as it lands. Approves the POOL (it is the rail) for exactly
     *  the shortfall first. */
    const donate = useCallback(
        async (recipient: `0x${string}`, amount: bigint) => {
            if (!state || !pool || !publicClient || !account) throw new Error("Connect a wallet to donate.");
            const allowance = (await publicClient.readContract({
                address: state.donationToken,
                abi: ERC20_ABI,
                functionName: "allowance",
                args: [account, pool],
            })) as bigint;
            if (allowance < amount) {
                await sendCall({
                    address: state.donationToken,
                    abi: ERC20_ABI as Abi,
                    functionName: "approve",
                    args: [pool, amount],
                });
            }
            return sendCall({
                address: pool,
                abi: MATCH_POOL_ABI as Abi,
                functionName: "donate",
                args: [recipient, amount],
            });
        },
        [state, pool, publicClient, account, sendCall],
    );

    /** Close the round once the donation window has ended, snapshotting
     *  whatever has been contributed as the match budget. No privileged
     *  closer — anyone may call. */
    const finalize = useCallback(() => {
        if (!pool) throw new Error("No round address.");
        return sendCall({ address: pool, abi: MATCH_POOL_ABI as Abi, functionName: "finalize" });
    }, [pool, sendCall]);

    /** Pay a recipient its match. Anyone may call on their behalf; the tokens
     *  always go to the recipient. */
    const claim = useCallback(
        (recipient: `0x${string}`) => {
            if (!pool) throw new Error("No round address.");
            return sendCall({
                address: pool,
                abi: MATCH_POOL_ABI as Abi,
                functionName: "claim",
                args: [recipient],
            });
        },
        [pool, sendCall],
    );

    return {
        available: !!pool,
        account,
        state,
        donate,
        finalize,
        claim,
        refresh,
    };
}

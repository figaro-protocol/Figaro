/**
 * Match mirror — the off-chain reference implementation of
 * `sdk/src/match/formula.json`.
 *
 * There is NOTHING TO POST here. A `MatchPool` instance IS its own donation
 * rail: it accumulates the quadratic-funding sums as each donation lands, so
 * the match is arithmetic over numbers the chain already holds. This module
 * MIRRORS that arithmetic — to display a round, to verify a recipient's weight,
 * or to predict what a planned donation would do — never to assert an answer to
 * the chain. Deterministic integer arithmetic (no floats anywhere); `isqrt`
 * matches `MatchPool.sqrt` value for value.
 *
 * Pipeline: `fetchMatchDonationEvents` (the pool's Donation logs + block
 * timestamps) → `computeMatchAllocations` (pure: window/floor/self-donation
 * gates, surplus-form weights, pro-rata split, 15% cap).
 */

import type { Address, PublicClient } from "viem";
import { decodeEventLog } from "viem";
import { MATCH_POOL_ABI } from "../abis.js";
import formula from "./formula.json" with { type: "json" };

// ── Formula constants — derived from the canonical artifact, never
//    restated in code. The only formula-wide constants are the pool's
//    cap constants; every other round parameter is an immutable of the
//    round instance and lives in `MatchRoundConfig`. ────────────────────

export const MATCH_FORMULA = formula;
export const MATCH_CAP_NUMERATOR = BigInt(formula.parameters.capNumerator);
export const MATCH_CAP_DENOMINATOR = BigInt(formula.parameters.capDenominator);

// ── Round + event types ──────────────────────────────────────────────

/** The round constants — the MatchPool instance's immutables, read from it.
 *  Nothing round-specific lives anywhere else (formula.json § round). */
export interface MatchRoundConfig {
    pool: Address;
    donationToken: Address;
    matchToken: Address;
    /** Unix seconds. Start INCLUSIVE, end EXCLUSIVE — the contract's gate. */
    donationStart: bigint;
    donationEnd: bigint;
    /** Minimum donation that counts, in the donation token's smallest units. */
    donationFloor: bigint;
}

/** One `MatchPool.Donation` log. `weightAfter` is the recipient's running weight
 *  AFTER the donation — the mirror recomputes it independently, so a divergence
 *  is visible without a second data source. */
export interface MatchDonationEvent {
    blockNumber: bigint;
    logIndex: number;
    /** The containing block's timestamp — the window filter's input. */
    timestamp: bigint;
    donor: Address;
    recipient: Address;
    amount: bigint;
    weightAfter: bigint;
}

/** A recipient's accrual — `MatchPool.recipientOf` plus the derived weight. */
export interface MatchRecipientAccrual {
    sumSqrt: bigint;
    sumOf: bigint;
    donors: bigint;
    weight: bigint;
}

/** What one recipient can claim — mirrors `matchOf` and the `MatchClaimed` event. */
export interface MatchAllocation {
    account: Address;
    amount: bigint;
    weight: bigint;
    /** True when the 15% ceiling bound (the excess stays in the pool). */
    capped: boolean;
}

/** The formula-wide parameters. A caller inspecting the raw pro-rata split can
 *  disable the ceiling by passing `capNumerator === capDenominator`. */
export interface MatchFormulaParameters {
    capNumerator: bigint;
    capDenominator: bigint;
}

const CANONICAL_PARAMETERS: MatchFormulaParameters = {
    capNumerator: MATCH_CAP_NUMERATOR,
    capDenominator: MATCH_CAP_DENOMINATOR,
};

// ── Integer math ─────────────────────────────────────────────────────

/** Floor square root over non-negative bigints. Babylonian, iterated exactly as
 *  `MatchPool.sqrt` does, so the mirror's weights equal the chain's. */
export function isqrt(n: bigint): bigint {
    if (n < 0n) throw new Error("isqrt: negative input");
    if (n === 0n) return 0n;
    let x = n;
    let y = (x + 1n) >> 1n;
    while (y < x) {
        x = y;
        y = (x + n / x) >> 1n;
    }
    return x;
}

// ── The mechanism (pure) ─────────────────────────────────────────────

/** Replay the pool's accrual over a donation stream: the window, floor and
 *  self-donation gates the contract enforces at `donate` time, then the
 *  surplus-form sums.
 *
 *  Accumulation is PER DONATION CALL, not per (donor, recipient) pair — a donor
 *  who donates twice contributes two sqrt terms, exactly as on chain. There is
 *  no per-donor cap and no fixed-point scale: the sqrt is taken on raw units. */
export function computeMatchAccruals(
    donations: readonly MatchDonationEvent[],
    round: MatchRoundConfig,
): Map<Address, MatchRecipientAccrual> {
    const byRecipient = new Map<Address, MatchRecipientAccrual>();
    // recipient -> donor -> that donor's running total. Mirrors the contract's
    // `donatedBy`: roots are taken PER DONOR, so `sumSqrt` swaps a donor's old
    // root for their new one on each donation. Rooting per CALL instead would
    // let one wallet split a cheque and manufacture surplus from nothing.
    const donorTotals = new Map<Address, Map<string, bigint>>();

    for (const d of donations) {
        if (d.timestamp < round.donationStart || d.timestamp >= round.donationEnd) continue;
        if (d.amount < round.donationFloor) continue;
        if (d.donor.toLowerCase() === d.recipient.toLowerCase()) continue;

        const key = d.recipient.toLowerCase() as Address;
        const accrual = byRecipient.get(key) ?? { sumSqrt: 0n, sumOf: 0n, donors: 0n, weight: 0n };

        const totals = donorTotals.get(key) ?? new Map<string, bigint>();
        const donor = d.donor.toLowerCase();
        const was = totals.get(donor) ?? 0n;
        const now = was + d.amount;
        totals.set(donor, now);
        donorTotals.set(key, totals);

        accrual.sumSqrt = accrual.sumSqrt - isqrt(was) + isqrt(now);
        accrual.sumOf += d.amount;
        if (was === 0n) accrual.donors += 1n;

        const squared = accrual.sumSqrt * accrual.sumSqrt;
        accrual.weight = squared > accrual.sumOf ? squared - accrual.sumOf : 0n;
        byRecipient.set(key, accrual);
    }
    return byRecipient;
}

/** The payout: a round's donations plus its finalized budget give every
 *  recipient's match — `floor(budget * weight / totalWeight)`, clamped to
 *  `floor(budget * 15 / 100)`.
 *
 *  THE CAP IS NOT WATER-FILLED. `MatchPool` applies it at claim time and the
 *  overflow stays in the pool, so a capped recipient takes nothing from anyone
 *  else's share — the mirror must not redistribute it either. */
export function computeMatchAllocations(
    donations: readonly MatchDonationEvent[],
    round: MatchRoundConfig,
    budget: bigint,
    parameters: MatchFormulaParameters = CANONICAL_PARAMETERS,
): MatchAllocation[] {
    const accruals = computeMatchAccruals(donations, round);
    let totalWeight = 0n;
    for (const accrual of accruals.values()) totalWeight += accrual.weight;
    if (totalWeight === 0n) return [];

    const ceiling = (budget * parameters.capNumerator) / parameters.capDenominator;
    const allocations: MatchAllocation[] = [];
    for (const [account, accrual] of accruals) {
        if (accrual.weight === 0n) continue;
        const share = (budget * accrual.weight) / totalWeight;
        const amount = share > ceiling ? ceiling : share;
        if (amount === 0n) continue;
        allocations.push({ account, amount, weight: accrual.weight, capped: amount === ceiling });
    }
    return allocations.sort((a, b) => (a.account < b.account ? -1 : 1));
}

// ── Chain fetcher ────────────────────────────────────────────────────

/** Fetch the round's donation stream from the pool's own logs over
 *  `[0, toBlock]`, resolving each containing block's timestamp (the window
 *  filter's input — filtering itself happens in the compute step). */
export async function fetchMatchDonationEvents(
    client: PublicClient,
    pool: Address,
    toBlock: bigint,
): Promise<MatchDonationEvent[]> {
    const logs = await client.getLogs({ address: pool, fromBlock: 0n, toBlock });
    const raw: Array<Omit<MatchDonationEvent, "timestamp">> = [];
    for (const log of logs) {
        try {
            const decoded = decodeEventLog({ abi: MATCH_POOL_ABI, data: log.data, topics: log.topics });
            if (decoded.eventName !== "Donation") continue;
            const a = decoded.args as Record<string, unknown>;
            raw.push({
                blockNumber: log.blockNumber ?? 0n,
                logIndex: log.logIndex ?? 0,
                donor: a.donor as Address,
                recipient: a.recipient as Address,
                amount: a.amount as bigint,
                weightAfter: a.weightAfter as bigint,
            });
        } catch {
            /* the round's other events are not accrual inputs */
        }
    }
    const timestamps = new Map<bigint, bigint>();
    for (const blockNumber of new Set(raw.map((e) => e.blockNumber))) {
        const block = await client.getBlock({ blockNumber });
        timestamps.set(blockNumber, block.timestamp);
    }
    return raw
        .map((e) => ({ ...e, timestamp: timestamps.get(e.blockNumber) ?? 0n }))
        .sort((a, b) =>
            a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
        );
}

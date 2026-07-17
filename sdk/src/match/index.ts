/**
 * Match recompute — the reference implementation of `sdk/src/match/formula.json`.
 *
 * A match round's distribution is OPTIMISTIC (the OptimisticMatchPool):
 * anyone posts the round's payout Merkle root, anyone recomputes it from the
 * public DonationRail event stream and challenges a mismatch. This module IS
 * that recompute: deterministic integer arithmetic (no floats anywhere), one
 * canonical answer for any round. The formula-spec file's exact bytes are
 * anchored on-chain as `OptimisticMatchPool.formulaHash`; this implementation
 * mirrors it and the two must move in lockstep.
 *
 * Pipeline: `fetchMatchDonationEvents` (rail logs + block timestamps) →
 * `computeMatchAllocations` (pure: scope filter, floor/cap, surplus-form QF,
 * water-filled recipient cap) → `buildMatchTree` (leaves, root, claim proofs).
 *
 * The tree/leaf shape is shared with the RPGF formula (OZ standard tree —
 * both contracts verify the same leaf); the empty-root preimage is the one
 * formula-specific constant.
 */

import type { Address, Hex, PublicClient } from "viem";
import { decodeEventLog, keccak256, stringToHex } from "viem";
import { DONATION_RAIL_ABI } from "../abis.js";
import { buildRpgfTree, rpgfLeaf, waterFill, type RpgfTree } from "../rpgf/index.js";
import formula from "./formula.json" with { type: "json" };

// ── Formula constants — derived from the canonical artifact, never
//    restated in code. Floor, caps, and scale live in formula.json; this
//    module only executes what the anchored spec declares. ────────────

export const MATCH_FORMULA = formula;
export const MATCH_DONATION_FLOOR = BigInt(formula.parameters.donationFloor);
export const MATCH_DONOR_RECIPIENT_CAP = BigInt(formula.parameters.donorRecipientCap);
export const MATCH_CAP_NUMERATOR = BigInt(formula.parameters.capNumerator);
export const MATCH_CAP_DENOMINATOR = BigInt(formula.parameters.capDenominator);
export const MATCH_SQRT_SCALE = BigInt(formula.parameters.sqrtScale);

/** Canonical root for a round with no positive allocations. */
export const MATCH_EMPTY_ROOT: Hex = keccak256(stringToHex(formula.parameters.emptyRootPreimage));

// ── Round + event types ──────────────────────────────────────────────

/** The round constants — the OptimisticMatchPool instance's immutables.
 *  Nothing round-specific lives anywhere else (formula.json § round). */
export interface MatchRoundConfig {
    donationRail: Address;
    matchPool: Address;
    donationToken: Address;
    matchToken: Address;
    /** Unix seconds, inclusive bounds — the pool's donationStart/donationEnd. */
    donationStart: bigint;
    donationEnd: bigint;
}

export interface MatchDonationEvent {
    blockNumber: bigint;
    logIndex: number;
    /** The containing block's timestamp — the window filter's input. */
    timestamp: bigint;
    token: Address;
    donor: Address;
    recipient: Address;
    amount: bigint;
}

export interface MatchAllocation {
    account: Address;
    amount: bigint;
}

/** The per-round parameter set, defaulting to the canonical v1 instance. A
 *  round anchoring a sibling formula file passes its own values here. */
export interface MatchFormulaParameters {
    donationFloor: bigint;
    donorRecipientCap: bigint;
    capNumerator: bigint;
    capDenominator: bigint;
    sqrtScale: bigint;
}

const CANONICAL_PARAMETERS: MatchFormulaParameters = {
    donationFloor: MATCH_DONATION_FLOOR,
    donorRecipientCap: MATCH_DONOR_RECIPIENT_CAP,
    capNumerator: MATCH_CAP_NUMERATOR,
    capDenominator: MATCH_CAP_DENOMINATOR,
    sqrtScale: MATCH_SQRT_SCALE,
};

// ── Integer math ─────────────────────────────────────────────────────

/** Floor square root over non-negative bigints (binary search). */
export function isqrt(n: bigint): bigint {
    if (n < 0n) throw new Error("isqrt: negative input");
    if (n < 2n) return n;
    let lo = 1n;
    let hi = 1n << (BigInt(n.toString(2).length) / 2n + 1n);
    while (lo < hi) {
        const mid = (lo + hi + 1n) >> 1n;
        if (mid * mid <= n) lo = mid;
        else hi = mid - 1n;
    }
    return lo;
}

// ── Merkle (the shared OZ standard-tree shape, match empty root) ─────

export const matchLeaf = rpgfLeaf;

/** Sorted-leaf, sorted-pair tree per the formula spec; empty leaf set → the
 *  canonical match empty root (unclaimable). */
export function buildMatchTree(leaves: readonly Hex[]): RpgfTree {
    return buildRpgfTree(leaves, MATCH_EMPTY_ROOT);
}

// ── The formula (pure) ───────────────────────────────────────────────

/** The formula: turn a round's donation events into per-wallet match
 *  allocations of `budget` (the pool's finalized budget, or the funded
 *  balance when recomputing ahead of finalization). Scope filtering
 *  (token, window, machinery recipients) happens here so the input can be
 *  the raw fetched stream. */
export function computeMatchAllocations(
    donations: readonly MatchDonationEvent[],
    round: MatchRoundConfig,
    budget: bigint,
    parameters: MatchFormulaParameters = CANONICAL_PARAMETERS,
): MatchAllocation[] {
    const machinery = new Set(
        [round.donationRail, round.matchPool, round.donationToken, round.matchToken].map((a) => a.toLowerCase()),
    );
    const donationToken = round.donationToken.toLowerCase();

    // Pair totals over in-scope donations: c_dr summed before floor and cap.
    const pairTotals = new Map<string, { donor: Address; recipient: Address; total: bigint }>();
    for (const d of donations) {
        if (d.token.toLowerCase() !== donationToken) continue;
        if (d.timestamp < round.donationStart || d.timestamp > round.donationEnd) continue;
        if (machinery.has(d.recipient.toLowerCase())) continue;
        const key = `${d.donor.toLowerCase()}|${d.recipient.toLowerCase()}`;
        const entry = pairTotals.get(key) ?? { donor: d.donor, recipient: d.recipient, total: 0n };
        entry.total += d.amount;
        pairTotals.set(key, entry);
    }

    // Surplus-form QF per recipient: S_r = Σ isqrt(counted·scale);
    // rawMatch_r = max(0, S_r² − T_r·scale) — single-donor recipients zero.
    const perRecipient = new Map<Address, { sqrtSum: bigint; countedSum: bigint }>();
    for (const { recipient, total } of pairTotals.values()) {
        if (total < parameters.donationFloor) continue;
        const counted = total > parameters.donorRecipientCap ? parameters.donorRecipientCap : total;
        const key = recipient.toLowerCase() as Address;
        const acc = perRecipient.get(key) ?? { sqrtSum: 0n, countedSum: 0n };
        acc.sqrtSum += isqrt(counted * parameters.sqrtScale);
        acc.countedSum += counted;
        perRecipient.set(key, acc);
    }
    const scores = new Map<Address, bigint>();
    for (const [recipient, acc] of perRecipient) {
        const surplus = acc.sqrtSum * acc.sqrtSum - acc.countedSum * parameters.sqrtScale;
        if (surplus > 0n) scores.set(recipient, surplus);
    }

    const allocations = waterFill(scores, budget, parameters.capNumerator, parameters.capDenominator);
    return [...allocations.entries()]
        .filter(([, amount]) => amount > 0n)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([account, amount]) => ({ account, amount }));
}

// ── Chain fetcher ────────────────────────────────────────────────────

/** Fetch the round's full formula input from the rail's logs over
 *  `[0, toBlock]`, resolving each containing block's timestamp (the window
 *  filter's input — filtering itself happens in the compute step). */
export async function fetchMatchDonationEvents(
    client: PublicClient,
    donationRail: Address,
    toBlock: bigint,
): Promise<MatchDonationEvent[]> {
    const logs = await client.getLogs({ address: donationRail, fromBlock: 0n, toBlock });
    const raw: Array<Omit<MatchDonationEvent, "timestamp">> = [];
    for (const log of logs) {
        try {
            const d = decodeEventLog({ abi: DONATION_RAIL_ABI, data: log.data, topics: log.topics });
            if (d.eventName !== "Donation") continue;
            const a = d.args as Record<string, unknown>;
            raw.push({
                blockNumber: log.blockNumber ?? 0n,
                logIndex: log.logIndex ?? 0,
                token: a.token as Address,
                donor: a.donor as Address,
                recipient: a.recipient as Address,
                amount: a.amount as bigint,
            });
        } catch {
            /* the rail emits nothing else */
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

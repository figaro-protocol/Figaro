/**
 * RPGF mirror — the off-chain reference implementation of
 * `sdk/src/rpgf/formula.json`.
 *
 * There is NOTHING TO POST here. `UsageCounter` counts verified artifact usage
 * on chain at the moment it happens, and `RpgfMinter` pays a tranche from those
 * already-final numbers. This module MIRRORS that arithmetic so a reader can
 * display it, predict a claim, or verify that a recorded accrual is exactly what
 * the counting rules produce — never so that an answer can be asserted to the
 * chain. Deterministic integer arithmetic (no floats anywhere); `icbrt` matches
 * `UsageCounter.icbrt` value for value.
 *
 * Pipeline: `fetchUsageRecords` (UsageRecorded logs) → `computeUsageAccruals`
 * (pure: idempotence, pair cap, uniform score) → `computeRpgfAllocations`
 * (pure: author-of-record aggregation, uniform pro-rata share — no cap).
 * The seller-side live-stake gate is applied ON CHAIN before a UsageRecorded
 * log exists, so replaying the emitted stream needs no stake check here.
 */

import type { Address, Hex, PublicClient } from "viem";
import { decodeEventLog } from "viem";
import { USAGE_COUNTER_ABI } from "../abis.js";
import formula from "./formula.json" with { type: "json" };

// ── Formula constants — derived from the canonical artifact, never
//    restated in code. Every cap, weight and scale lives in formula.json;
//    this module only executes what the spec declares. ─────────────────

export const RPGF_FORMULA = formula;
/** `UsageCounter.PAIR_CAP` — processes one (buyer, seller) pair contributes. */
export const RPGF_PAIR_CAP: number = formula.parameters.pairCap;
/** The fixed-point scale inside the cube root (10^18). */
export const RPGF_SCORE_SCALE = BigInt(formula.parameters.scoreScale);
/** `RpgfMinter.TRANCHE_COUNT` — tranche `i` pays for accrual period `i`. */
export const RPGF_TRANCHE_COUNT: number = formula.parameters.trancheCount;

// ── Integer math ─────────────────────────────────────────────────────

/** Floor cube root over non-negative bigints (binary search). Mirrors
 *  `UsageCounter.icbrt` exactly. The Solidity side clamps its search ceiling to
 *  floor(cbrt(2^256 - 1)) so its cube cannot overflow; bigints have no such
 *  limit, so the two agree for every input the chain can represent. (Until
 *  2026-07-30 the Solidity ceiling was floor(cbrt(2^64 - 1)) and the two
 *  DISAGREED for every score above `c * d^2 >= 19` — the on-chain value
 *  saturated. If you are changing either side, the invariant is that both are
 *  the true floor cube root; test the property, never a bounded domain.) */
export function icbrt(n: bigint): bigint {
    if (n < 0n) throw new Error("icbrt: negative input");
    if (n < 8n) return n > 0n ? 1n : 0n;
    let lo = 1n;
    let hi = 1n << (BigInt(n.toString(2).length) / 3n + 1n);
    while (lo < hi) {
        const mid = (lo + hi + 1n) >> 1n;
        if (mid * mid * mid <= n) lo = mid;
        else hi = mid - 1n;
    }
    return lo;
}

/** `icbrt(c * d^2 * 10^18)` — `UsageCounter._score`. Breadth (distinct
 *  counterparty pairs) weighs twice as heavily as volume. UNIFORM: no weight
 *  multiplier — every artifact's score is its real usage alone. */
export function usageScore(c: bigint, d: bigint): bigint {
    if (c === 0n || d === 0n) return 0n;
    return icbrt(c * d * d * RPGF_SCORE_SCALE);
}

// ── Usage records (the counter's event stream) ───────────────────────

/** One `UsageCounter.UsageRecorded` log. `c`, `d` and `score` are the artifact's
 *  running values AFTER the record — the mirror recomputes them independently,
 *  so a divergence is visible without a second data source. */
export interface UsageRecord {
    blockNumber: bigint;
    logIndex: number;
    /** Clause idHash or assembly compositionHash. */
    artifact: Hex;
    period: number;
    processId: Hex;
    /** keccak256(buyer, seller) of the recorded order. */
    pairKey: Hex;
    c: bigint;
    d: bigint;
    score: bigint;
}

/** An artifact's accrual in one period — `UsageCounter.accrualOf`. */
export interface UsageAccrual {
    c: bigint;
    d: bigint;
    score: bigint;
}

/** One period's accrual state — `accrualOf` per artifact plus `totalScoreIn`. */
export interface UsagePeriodAccrual {
    byArtifact: Map<Hex, UsageAccrual>;
    totalScore: bigint;
}

/** Replay the counter's counting rules over a record stream: idempotence per
 *  (artifact, process) — GLOBAL, so a process counts once ever and a later
 *  period is never paid for an earlier period's trade — the pair cap PER PERIOD
 *  (a capped process is dropped entirely: it feeds neither `c` nor `d`), then
 *  the uniform score. Records are replayed in (blockNumber, logIndex) order,
 *  which is the order the chain applied them in. */
export function computeUsageAccruals(
    records: readonly UsageRecord[],
): Map<number, UsagePeriodAccrual> {
    const sorted = [...records].sort((a, b) =>
        a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
    );

    const periods = new Map<number, UsagePeriodAccrual>();
    const countedProcesses = new Map<Hex, Set<string>>(); // artifact → processIds (GLOBAL)
    const pairCounts = new Map<string, Map<string, number>>(); // artifact|period → pairKey → n

    for (const record of sorted) {
        const artifact = record.artifact.toLowerCase() as Hex;
        const scopeKey = `${artifact}|${record.period}`;

        const seenProcesses = countedProcesses.get(artifact) ?? new Set<string>();
        if (seenProcesses.has(record.processId.toLowerCase())) continue; // AlreadyCounted
        const pairs = pairCounts.get(scopeKey) ?? new Map<string, number>();
        const pairKey = record.pairKey.toLowerCase();
        const seen = pairs.get(pairKey) ?? 0;
        if (seen >= RPGF_PAIR_CAP) continue; // PairCapReached — dropped entirely

        seenProcesses.add(record.processId.toLowerCase());
        countedProcesses.set(artifact, seenProcesses);
        pairs.set(pairKey, seen + 1);
        pairCounts.set(scopeKey, pairs);

        const period = periods.get(record.period) ?? { byArtifact: new Map<Hex, UsageAccrual>(), totalScore: 0n };
        const accrual = period.byArtifact.get(artifact) ?? { c: 0n, d: 0n, score: 0n };
        accrual.c += 1n;
        if (seen === 0) accrual.d += 1n; // first process from this pair
        const updated = usageScore(accrual.c, accrual.d);
        period.totalScore = period.totalScore + updated - accrual.score;
        accrual.score = updated;
        period.byArtifact.set(artifact, accrual);
        periods.set(record.period, period);
    }
    return periods;
}

// ── Payout (RpgfMinter.claim, mirrored) ──────────────────────────────

/** What one wallet can claim from a tranche — mirrors the `Claimed` event. */
export interface RpgfAllocation {
    account: Address;
    amount: bigint;
    /** The wallet's summed artifact score for the period. */
    score: bigint;
}

/** The payout: a period's accrual plus each artifact's author of record gives
 *  every wallet's tranche entitlement — UNIFORM pro rata,
 *  `floor(trancheAmount * score / total)`, with no cap.
 *
 *  `authorOf` maps artifact key → author of record (clause registrar or
 *  assembly author); an artifact with no author is unclaimable and its score
 *  still counts toward the denominator, exactly as on chain. Author-of-record
 *  eligibility is gated on a LIVE stake ON CHAIN (`RpgfMinter._isAuthor`); pass
 *  only live authors here to mirror it. */
export function computeRpgfAllocations(
    period: UsagePeriodAccrual,
    authorOf: ReadonlyMap<Hex, Address>,
    trancheAmount: bigint,
): RpgfAllocation[] {
    if (period.totalScore === 0n) return [];

    const walletScores = new Map<Address, bigint>();
    for (const [artifact, accrual] of period.byArtifact) {
        const author = authorOf.get(artifact.toLowerCase() as Hex);
        if (!author || accrual.score === 0n) continue;
        const key = author.toLowerCase() as Address;
        walletScores.set(key, (walletScores.get(key) ?? 0n) + accrual.score);
    }

    // No clamp to `totalScore`: scores are summed per author over DISTINCT
    // artifacts (`byArtifact` is keyed by artifact), so `score <= totalScore`
    // holds structurally. The chain dropped its equivalent clamp on 2026-07-30 —
    // there it was reachable via a duplicate-stuffed artifact list, and clamping
    // silently rounded such a claim UP to the entire tranche instead of
    // rejecting it. Mirror the contract: nothing to clamp, and a violation
    // should surface, not be smoothed over.
    const allocations: RpgfAllocation[] = [];
    for (const [account, score] of walletScores) {
        const amount = (trancheAmount * score) / period.totalScore;
        if (amount === 0n) continue;
        allocations.push({ account, amount, score });
    }
    return allocations.sort((a, b) => (a.account < b.account ? -1 : 1));
}

// ── Chain fetcher ────────────────────────────────────────────────────

/** Fetch the counter's full record stream over `[0, toBlock]`, in
 *  (blockNumber, logIndex) order. */
export async function fetchUsageRecords(
    client: PublicClient,
    usageCounter: Address,
    toBlock: bigint,
): Promise<UsageRecord[]> {
    const logs = await client.getLogs({ address: usageCounter, fromBlock: 0n, toBlock });
    const records: UsageRecord[] = [];
    for (const log of logs) {
        try {
            const decoded = decodeEventLog({ abi: USAGE_COUNTER_ABI, data: log.data, topics: log.topics });
            if (decoded.eventName !== "UsageRecorded") continue;
            const a = decoded.args as Record<string, unknown>;
            records.push({
                blockNumber: log.blockNumber ?? 0n,
                logIndex: log.logIndex ?? 0,
                artifact: a.artifact as Hex,
                period: Number(a.period),
                processId: a.processId as Hex,
                pairKey: a.pairKey as Hex,
                c: a.c as bigint,
                d: a.d as bigint,
                score: a.score as bigint,
            });
        } catch {
            /* the counter emits nothing else */
        }
    }
    return records.sort((a, b) =>
        a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
    );
}

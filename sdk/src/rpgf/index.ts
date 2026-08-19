/**
 * RPGF mirror — the off-chain reference implementation of
 * `sdk/src/rpgf/formula.json`.
 *
 * There is NOTHING TO POST here. `UsageCounter` counts verified clause-or-assembly usage
 * on chain at the moment it happens, and `RpgfMinter` pays each closed period from
 * those already-final numbers. This module MIRRORS that arithmetic so a reader can
 * display it, predict a claim, or verify that a recorded accrual is exactly what
 * the counting rules produce — never so that an answer can be asserted to the
 * chain. Deterministic integer arithmetic (no floats anywhere); `icbrt` matches
 * `UsageCounter.icbrt` value for value.
 *
 * Pipeline: `fetchUsageRecords` (UsageRecorded logs) → `computeUsageAccruals`
 * (pure: idempotence, uniform score) → `computeRpgfAllocations`
 * (pure: author-of-record aggregation, uniform pro-rata share — no cap).
 * The seller-side live-stake gate is applied ON CHAIN before a UsageRecorded
 * log exists, so replaying the emitted stream needs no stake check here.
 */

import type { Address, Hex, PublicClient } from "viem";
import { decodeEventLog } from "viem";
import { USAGE_COUNTER_ABI } from "../abis.js";
import type { Agreement } from "../agreement.js";
import { buildSectionInclusionProof, sectionDataHash } from "../agreement.js";
import { computeClauseKey } from "../discovery.js";
import { fetchLogsChunked } from "../events.js";
import type { SequencerUsageClaim } from "../agent/sequencer.js";
import { toSequencerCommitment } from "../agent/sequencer.js";
import type { Commitment } from "../types.js";
import formula from "./formula.json" with { type: "json" };

// ── Formula constants — derived from the canonical spec, never
//    restated in code. Every cap, weight and scale lives in formula.json;
//    this module only executes what the spec declares. ─────────────────

export const RPGF_FORMULA = formula;
/** The fixed-point scale inside the cube root (10^18). */
export const RPGF_SCORE_SCALE = BigInt(formula.parameters.scoreScale);
/** The reference schedule's period count — nine annual accrual periods,
 *  budgets grouped 15/30/55 into three rising tranches (ruled 2026-07-31).
 *  The live count is `UsageCounter.periodCount()`; read the chain when it
 *  matters, this constant is the reference shape. */
export const RPGF_PERIOD_COUNT: number = formula.parameters.periodCount;
/** `UsageCounter.minSellers` — the minimum-support floor (ruled 2026-07-31):
 *  a clause or assembly scores zero in a period until this many DISTINCT STAKED
 *  SELLERS carried it there. Reference value; the live one is on chain. */
export const RPGF_MIN_SELLERS = BigInt(formula.parameters.minSellers);

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

/** `icbrt(c * d^2 * 10^18)` above the minimum-support floor, else 0 —
 *  `UsageCounter._score`. Breadth (distinct STAKED SELLERS) weighs twice as
 *  heavily as volume; below `minSellers` distinct sellers nothing scores
 *  (counting still accrues — the score springs whole at the floor). UNIFORM:
 *  no weight multiplier — every clause or assembly's score is its real usage alone.
 *  `minSellers` defaults to the formula reference; pass the chain's
 *  `UsageCounter.minSellers()` to mirror a specific deployment. */
export function usageScore(c: bigint, d: bigint, minSellers: bigint = RPGF_MIN_SELLERS): bigint {
    if (c === 0n || d < minSellers || d === 0n) return 0n;
    return icbrt(c * d * d * RPGF_SCORE_SCALE);
}

// ── Usage records (the counter's event stream) ───────────────────────

/** One `UsageCounter.UsageRecorded` log. `c`, `d` and `score` are the clause-or-assembly's
 *  running values AFTER the record — the mirror recomputes them independently,
 *  so a divergence is visible without a second data source. */
export interface UsageRecord {
    blockNumber: bigint;
    logIndex: number;
    /** Clause idHash or assembly compositionHash. */
    clauseOrAssembly: Hex;
    period: number;
    processId: Hex;
    /** The recorded order's seller of record (live-staked at record time). */
    seller: Address;
    c: bigint;
    d: bigint;
    score: bigint;
}

/** One SETTLEMENT PATH's accrual for a clause or assembly in one period —
 *  `UsageCounter.accrualOf` or `batchAccrualOf`. */
export interface UsageAccrual {
    c: bigint;
    d: bigint;
    score: bigint;
}

/** One batch's `BatchUsageRecorded` log. Unlike `UsageRecord` these are
 *  CUMULATIVE for the clause-or-assembly-period, not per-process increments: the guest
 *  proves the running totals off-chain and the verifier writes them whole, so
 *  a later record REPLACES an earlier one rather than adding to it. */
export interface BatchUsageRecord {
    blockNumber: bigint;
    logIndex: number;
    clauseOrAssembly: Hex;
    period: number;
    c: bigint;
    d: bigint;
    score: bigint;
}

/** A clause or assembly's accrual across BOTH settlement paths.
 *
 *  The two are kept apart on purpose. A batch-settled process never acquires
 *  kernel status and a kernel-settled one is never in a batch, so no PROCESS
 *  is ever counted twice — but the same SELLER may trade on both sides, and
 *  neither the chain nor this mirror holds the seller SETS needed to union
 *  them. Adding `d` to `d` would therefore pay for breadth nobody had.
 *  Scores are summed; components never are — and the minimum-support floor
 *  applies per path, for the same reason. */
export interface ClauseOrAssemblyAccrual {
    direct: UsageAccrual;
    batch: UsageAccrual;
    /** `direct.score + batch.score` — mirrors `UsageCounter.scoreOf`, and the
     *  only figure a reward calculation may divide by. */
    score: bigint;
}

/** One period's accrual state — every clause or assembly's merged accrual plus the
 *  period total, mirroring `totalScoreIn` (which counts both paths). */
export interface UsagePeriodAccrual {
    byClauseOrAssembly: Map<Hex, ClauseOrAssemblyAccrual>;
    totalScore: bigint;
}

function emptyAccrual(): UsageAccrual {
    return { c: 0n, d: 0n, score: 0n };
}

/** Replay the counter's counting rules over a record stream: idempotence per
 *  (clause or assembly, process) — GLOBAL, so a process counts once ever and a later
 *  period is never paid for an earlier period's trade — then the
 *  distinct-STAKED-SELLER count PER PERIOD (ruled 2026-07-31: breadth counts
 *  only what a stake has priced; pairs were free to mint on the buyer side)
 *  and the uniform floored score. Records are replayed in (blockNumber,
 *  logIndex) order, the order the chain applied them in. `minSellers`
 *  defaults to the formula reference; pass the chain's value to mirror a
 *  specific deployment. */
export function computeUsageAccruals(
    records: readonly UsageRecord[],
    batchRecords: readonly BatchUsageRecord[] = [],
    minSellers: bigint = RPGF_MIN_SELLERS,
): Map<number, UsagePeriodAccrual> {
    const sorted = [...records].sort((a, b) =>
        a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
    );

    const periods = new Map<number, UsagePeriodAccrual>();
    const countedProcesses = new Map<Hex, Set<string>>(); // clauseOrAssembly → processIds (GLOBAL)
    const sellersSeen = new Map<string, Set<string>>(); // clauseOrAssembly|period → sellers

    for (const record of sorted) {
        const clauseOrAssembly = record.clauseOrAssembly.toLowerCase() as Hex;
        const scopeKey = `${clauseOrAssembly}|${record.period}`;

        const seenProcesses = countedProcesses.get(clauseOrAssembly) ?? new Set<string>();
        if (seenProcesses.has(record.processId.toLowerCase())) continue; // AlreadyCounted
        const sellers = sellersSeen.get(scopeKey) ?? new Set<string>();
        const seller = record.seller.toLowerCase();
        const firstSeller = !sellers.has(seller);

        seenProcesses.add(record.processId.toLowerCase());
        countedProcesses.set(clauseOrAssembly, seenProcesses);
        sellers.add(seller);
        sellersSeen.set(scopeKey, sellers);

        const period = periods.get(record.period) ?? { byClauseOrAssembly: new Map<Hex, ClauseOrAssemblyAccrual>(), totalScore: 0n };
        const entry = period.byClauseOrAssembly.get(clauseOrAssembly) ?? { direct: emptyAccrual(), batch: emptyAccrual(), score: 0n };
        const accrual = entry.direct;
        accrual.c += 1n;
        if (firstSeller) accrual.d += 1n;
        const updated = usageScore(accrual.c, accrual.d, minSellers);
        period.totalScore = period.totalScore + updated - accrual.score;
        accrual.score = updated;
        entry.score = accrual.score + entry.batch.score;
        period.byClauseOrAssembly.set(clauseOrAssembly, entry);
        periods.set(record.period, period);
    }

    // The batch leg. Each record carries the clause-or-assembly-period's CUMULATIVE
    // (c, d), so the last one in log order wins outright — replay order only
    // decides which record is last, never how much accumulates.
    const batchSorted = [...batchRecords].sort((a, b) =>
        a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
    );
    for (const record of batchSorted) {
        const clauseOrAssembly = record.clauseOrAssembly.toLowerCase() as Hex;
        const period = periods.get(record.period) ?? { byClauseOrAssembly: new Map<Hex, ClauseOrAssemblyAccrual>(), totalScore: 0n };
        const entry = period.byClauseOrAssembly.get(clauseOrAssembly) ?? { direct: emptyAccrual(), batch: emptyAccrual(), score: 0n };
        const updated = usageScore(record.c, record.d, minSellers);
        period.totalScore = period.totalScore + updated - entry.batch.score;
        entry.batch = { c: record.c, d: record.d, score: updated };
        entry.score = entry.direct.score + entry.batch.score;
        period.byClauseOrAssembly.set(clauseOrAssembly, entry);
        periods.set(record.period, period);
    }
    return periods;
}

// ── Payout (RpgfMinter.claim, mirrored) ──────────────────────────────

/** What one wallet can claim from a period — mirrors the `Claimed` event. */
export interface RpgfAllocation {
    account: Address;
    amount: bigint;
    /** The wallet's summed clause-or-assembly score for the period. */
    score: bigint;
}

/** The payout: a period's accrual plus each clause or assembly's author of record gives
 *  every wallet's period entitlement — UNIFORM pro rata,
 *  `floor(periodAmount * score / total)`, with no cap.
 *
 *  `authorOf` maps clause-or-assembly key → author of record (each registry's `registeredBy` — clause or
 *  assembly author); a clause or assembly with no author is unclaimable and its score
 *  still counts toward the denominator, exactly as on chain. Author-of-record
 *  eligibility is gated on a LIVE stake ON CHAIN (`RpgfMinter._isAuthor`); pass
 *  only live authors here to mirror it. */
export function computeRpgfAllocations(
    period: UsagePeriodAccrual,
    authorOf: ReadonlyMap<Hex, Address>,
    periodAmount: bigint,
): RpgfAllocation[] {
    if (period.totalScore === 0n) return [];

    const walletScores = new Map<Address, bigint>();
    for (const [clauseOrAssembly, accrual] of period.byClauseOrAssembly) {
        const author = authorOf.get(clauseOrAssembly.toLowerCase() as Hex);
        if (!author || accrual.score === 0n) continue;
        const key = author.toLowerCase() as Address;
        walletScores.set(key, (walletScores.get(key) ?? 0n) + accrual.score);
    }

    // No clamp to `totalScore`: scores are summed per author over DISTINCT
    // clauses or assemblies (`byClauseOrAssembly` is keyed by clause or assembly), so `score <= totalScore`
    // holds structurally. The chain dropped its equivalent clamp on 2026-07-30 —
    // there it was reachable via a duplicate-stuffed clause-or-assembly list, and clamping
    // silently rounded such a claim UP to the entire period budget instead of
    // rejecting it. Mirror the contract: nothing to clamp, and a violation
    // should surface, not be smoothed over.
    const allocations: RpgfAllocation[] = [];
    for (const [account, score] of walletScores) {
        const amount = (periodAmount * score) / period.totalScore;
        if (amount === 0n) continue;
        allocations.push({ account, amount, score });
    }
    return allocations.sort((a, b) => (a.account < b.account ? -1 : 1));
}

// ── Chain fetcher ────────────────────────────────────────────────────

/** Fetch the counter's full record stream over `[0, toBlock]`, in
 *  (blockNumber, logIndex) order. `chunkSize` overrides
 *  `DEFAULT_LOG_CHUNK_SIZE` for providers with a different (or no)
 *  block-range cap — see `fetchLogsChunked` (../events.ts). */
export async function fetchUsageRecords(
    client: PublicClient,
    usageCounter: Address,
    toBlock: bigint,
    chunkSize?: bigint,
): Promise<UsageRecord[]> {
    const logs = await fetchLogsChunked(client, { address: usageCounter, fromBlock: 0n, toBlock, chunkSize });
    const records: UsageRecord[] = [];
    for (const log of logs) {
        try {
            const decoded = decodeEventLog({ abi: USAGE_COUNTER_ABI, data: log.data, topics: log.topics });
            if (decoded.eventName !== "UsageRecorded") continue;
            const a = decoded.args as Record<string, unknown>;
            records.push({
                blockNumber: log.blockNumber ?? 0n,
                logIndex: log.logIndex ?? 0,
                clauseOrAssembly: a.clauseOrAssembly as Hex,
                period: Number(a.period),
                processId: a.processId as Hex,
                seller: a.seller as Address,
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

/** Fetch the BATCH-path record stream over `[0, toBlock]`.
 *
 *  A reader that folds only `fetchUsageRecords` sees the direct path alone and
 *  silently under-reports every clause or assembly whose trade moved to batches — which
 *  is the whole failure the bridge exists to close. Pass both streams to
 *  `computeUsageAccruals`. `chunkSize` overrides `DEFAULT_LOG_CHUNK_SIZE` —
 *  see `fetchLogsChunked` (../events.ts). */
export async function fetchBatchUsageRecords(
    client: PublicClient,
    usageCounter: Address,
    toBlock: bigint,
    chunkSize?: bigint,
): Promise<BatchUsageRecord[]> {
    const logs = await fetchLogsChunked(client, { address: usageCounter, fromBlock: 0n, toBlock, chunkSize });
    const records: BatchUsageRecord[] = [];
    for (const log of logs) {
        try {
            const decoded = decodeEventLog({ abi: USAGE_COUNTER_ABI, data: log.data, topics: log.topics });
            if (decoded.eventName !== "BatchUsageRecorded") continue;
            const a = decoded.args as Record<string, unknown>;
            records.push({
                blockNumber: log.blockNumber ?? 0n,
                logIndex: log.logIndex ?? 0,
                clauseOrAssembly: a.clauseOrAssembly as Hex,
                period: Number(a.period),
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

// ── Usage claims (the batch path's input) ────────────────────────────

/** What the pure builder needs from chain. Fetch with `fetchUsageClaimContext`. */
export interface UsageClaimContext {
    /** `UsageCounter.provenanceClause()` — the leaf key an assembly claim
     *  proves against. Read from chain, never hardcoded: it is a deploy-time
     *  choice of the counter, not a constant of the protocol. */
    provenanceClause: Hex;
    /** Clause-or-assembly keys the counter refuses (`excludedClauseOrAssembly`). */
    excludedClausesOrAssemblies: readonly Hex[];
}

/**
 * Build every usage claim a settled batch order supports.
 *
 * PURE — takes the chain facts as input so it can be tested and reasoned about
 * without a client. `fetchUsageClaimContext` gets them.
 *
 * TWO INDEPENDENT LEGS, and the independence is the whole point:
 *
 *  - the CLAUSE leg emits one claim per agreement section, minus the excluded
 *    ones. Dropping them is mandatory, not an optimisation: an excluded
 *    clause or assembly reverts `applyBatchAccrual` and takes the ENTIRE BATCH with it,
 *    including every other party's settlement.
 *  - the ASSEMBLY leg credits the assembly's DESIGNER, and it must survive the
 *    clause leg dropping things. `figaro-assembly-provenance` is itself
 *    excluded — it rides every assembly-composed process, so scoring it would
 *    pay its author for the protocol's floor — which means the section that
 *    carries the compositionHash is exactly the one the clause leg discards.
 *    Sequencing the assembly credit behind the clause credit is how the
 *    designer half of the 600M recorded nothing on the direct path for months
 *    (fixed 2026-07-30). Here the two legs never touch.
 */
export function buildUsageClaims(
    order: Commitment,
    agreement: Agreement,
    context: UsageClaimContext,
): SequencerUsageClaim[] {
    const excluded = new Set(context.excludedClausesOrAssemblies.map((a) => a.toLowerCase()));
    const wireOrder = toSequencerCommitment(order);
    const claims: SequencerUsageClaim[] = [];

    // ── Clause leg ──
    for (const section of agreement.sections) {
        const clauseOrAssembly = computeClauseKey(section.clause, section.version);
        if (excluded.has(clauseOrAssembly.toLowerCase())) continue;
        claims.push({
            order: wireOrder,
            clause_or_assembly: clauseOrAssembly,
            kind: { Clause: { section_hash: sectionDataHash(section) } },
            inclusion_proof: buildSectionInclusionProof(agreement, section.clause).proof,
        });
    }

    // ── Assembly leg — INDEPENDENT of the loop above ──
    const provenance = agreement.sections.find(
        (s) => computeClauseKey(s.clause, s.version).toLowerCase() === context.provenanceClause.toLowerCase(),
    );
    if (provenance) {
        const compositionHash = provenance.data?.compositionHash;
        if (typeof compositionHash === "string" && compositionHash.startsWith("0x")) {
            claims.push({
                order: wireOrder,
                clause_or_assembly: compositionHash as Hex,
                kind: "Assembly",
                inclusion_proof: buildSectionInclusionProof(agreement, provenance.clause).proof,
            });
        }
        // A content-WITHHELD provenance section carries only `dataHash`, so the
        // compositionHash cannot be recovered and the designer cannot be
        // credited from this agreement alone. Silently skipped rather than
        // thrown: the clause claims are still valid and the batch should still
        // settle. (Provenance is public by construction today, so this is a
        // guard against a future disposition change, not a live case.)
    }

    return claims;
}

/**
 * Read the two chain facts `buildUsageClaims` needs.
 *
 * `excludedClauseOrAssembly` is a mapping with no enumeration, so exclusion can only be
 * TESTED per candidate — this asks about exactly the clauses or assemblies the agreement
 * could claim, which is the complete set that matters.
 */
export async function fetchUsageClaimContext(
    client: PublicClient,
    usageCounter: Address,
    agreement: Agreement,
): Promise<UsageClaimContext> {
    const candidates = agreement.sections.map((s) => computeClauseKey(s.clause, s.version));

    const [provenanceClause, ...flags] = await Promise.all([
        client.readContract({
            address: usageCounter,
            abi: USAGE_COUNTER_ABI,
            functionName: "provenanceClause",
        }) as Promise<Hex>,
        ...candidates.map(
            (clauseOrAssembly) =>
                client.readContract({
                    address: usageCounter,
                    abi: USAGE_COUNTER_ABI,
                    functionName: "excludedClauseOrAssembly",
                    args: [clauseOrAssembly],
                }) as Promise<boolean>,
        ),
    ]);

    return {
        provenanceClause,
        excludedClausesOrAssemblies: candidates.filter((_, i) => flags[i]),
    };
}

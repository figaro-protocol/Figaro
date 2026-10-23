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
import { PROVENANCE_LEAF_KEY, buildProvenanceInclusionProof, buildSignedClauseInclusionProof, hashClauseData } from "../agreement.js";
import {
    ASSEMBLY_LEAF_DOMAIN,
    ASSEMBLY_TERMS_LEAF_KEY,
    assertNotReservedKey,
    buildAgreementInclusionProof,
    assemblyHashOf,
    type Assembly,
} from "../assembly.js";
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
 *  budgets grouped 15/30/55 into three rising tranches.
 *  The live count is `UsageCounter.periodCount()`; read the chain when it
 *  matters, this constant is the reference shape. */
export const RPGF_PERIOD_COUNT: number = formula.parameters.periodCount;
/** `UsageCounter.minSellers` — the minimum-support floor:
 *  a clause or assembly scores zero in a period until this many DISTINCT STAKED
 *  SELLERS carried it there. Reference value; the live one is on chain. */
export const RPGF_MIN_SELLERS = BigInt(formula.parameters.minSellers);

// ── Integer math ─────────────────────────────────────────────────────

/** Floor cube root over non-negative bigints (binary search). Mirrors
 *  `UsageCounter.icbrt` exactly. The Solidity side clamps its search ceiling to
 *  floor(cbrt(2^256 - 1)) so its cube cannot overflow; bigints have no such
 *  limit, so the two agree for every input the chain can represent. (The
 *  Solidity ceiling was once floor(cbrt(2^64 - 1)) and the two
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

// ── The two families (kind, key) ─────────────────────────────────────

/** The family a usage key belongs to — the reward's own accounting keeps the
 *  families apart. A registry accepts any bytes32, so nothing in a key's
 *  bytes says whether it names a clause, an assembly or a registered
 *  agreement; every accrual, count and claim is keyed by `(kind, key)`, and
 *  the minter reads only the registry the kind names. Mirrors the counter's
 *  `uint8 kind`. */
export const USAGE_KIND_CLAUSE = 0 as const;
export const USAGE_KIND_ASSEMBLY = 1 as const;
export const USAGE_KIND_AGREEMENT = 2 as const;
export type UsageKind = typeof USAGE_KIND_CLAUSE | typeof USAGE_KIND_ASSEMBLY | typeof USAGE_KIND_AGREEMENT;

/** One `(kind, key)` pair — the unit the counter accrues and the minter's
 *  claim names; the shape of `RpgfMinter.ClauseOrAssemblyKey`, so a list of
 *  these is `claim`'s argument as it stands. */
export interface UsageKey {
    kind: UsageKind;
    /** A clause key (`kind` = clause), an assembly assembly hash
     *  (`kind` = assembly) or a registered agreement hash (`kind` =
     *  agreement). */
    key: Hex;
}

/** The map key this mirror files a `(kind, key)` pair under —
 *  `"<kind>:<lowercased key>"`. */
export function usageKeyId(kind: UsageKind, clauseOrAssembly: Hex): string {
    return `${kind}:${clauseOrAssembly.toLowerCase()}`;
}

function asUsageKind(value: unknown): UsageKind {
    const kind = Number(value);
    if (kind !== USAGE_KIND_CLAUSE && kind !== USAGE_KIND_ASSEMBLY && kind !== USAGE_KIND_AGREEMENT) {
        throw new Error(`usage kind ${String(value)} is none of clause (0), assembly (1), agreement (2)`);
    }
    return kind;
}

// ── Usage records (the counter's event stream) ───────────────────────

/** One `UsageCounter.UsageRecorded` log. `c`, `d` and `score` are the clause-or-assembly's
 *  running values AFTER the record — the mirror recomputes them independently,
 *  so a divergence is visible without a second data source. */
export interface UsageRecord {
    blockNumber: bigint;
    logIndex: number;
    kind: UsageKind;
    /** Clause key, assembly assemblyHash or agreement hash, by `kind`. */
    clauseOrAssembly: Hex;
    period: number;
    processId: Hex;
    /** The recorded order's seller of record (live-staked at record time). */
    seller: Address;
    c: bigint;
    d: bigint;
    score: bigint;
}

/** One RESOLUTION PATH's accrual for a clause or assembly in one period —
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
    kind: UsageKind;
    clauseOrAssembly: Hex;
    period: number;
    c: bigint;
    d: bigint;
    score: bigint;
}

/** A clause or assembly's accrual across BOTH resolution paths.
 *
 *  The two are kept apart on purpose. A batch-resolved process never acquires
 *  FigaroCore status and a FigaroCore-resolved one is never in a batch, so no PROCESS
 *  is ever counted twice — but the same SELLER may trade on both sides, and
 *  neither the chain nor this mirror holds the seller SETS needed to union
 *  them. Adding `d` to `d` would therefore pay for breadth nobody had.
 *  Scores are summed; components never are — and the minimum-support floor
 *  applies per path, for the same reason. */
export interface ClauseOrAssemblyAccrual {
    kind: UsageKind;
    clauseOrAssembly: Hex;
    direct: UsageAccrual;
    batch: UsageAccrual;
    /** `direct.score + batch.score` — mirrors `UsageCounter.scoreOf`, and the
     *  only figure a reward calculation may divide by. */
    score: bigint;
}

/** One period's accrual state — every `(kind, key)`'s merged accrual (filed
 *  under `usageKeyId`) plus the period total, mirroring `totalScoreIn` (which
 *  counts both paths). */
export interface UsagePeriodAccrual {
    byClauseOrAssembly: Map<string, ClauseOrAssemblyAccrual>;
    totalScore: bigint;
}

function emptyAccrual(): UsageAccrual {
    return { c: 0n, d: 0n, score: 0n };
}

function emptyEntry(kind: UsageKind, clauseOrAssembly: Hex): ClauseOrAssemblyAccrual {
    return { kind, clauseOrAssembly, direct: emptyAccrual(), batch: emptyAccrual(), score: 0n };
}

/** Replay the counter's counting rules over a record stream: idempotence per
 *  ((kind, key), process) — GLOBAL, so a process counts once ever and a later
 *  period is never paid for an earlier period's trade — then the
 *  distinct-STAKED-SELLER count PER PERIOD (breadth counts
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
    const countedProcesses = new Map<string, Set<string>>(); // (kind, key) → processIds (GLOBAL)
    const sellersSeen = new Map<string, Set<string>>(); // (kind, key)|period → sellers

    for (const record of sorted) {
        const clauseOrAssembly = record.clauseOrAssembly.toLowerCase() as Hex;
        const id = usageKeyId(record.kind, clauseOrAssembly);
        const scopeKey = `${id}|${record.period}`;

        const seenProcesses = countedProcesses.get(id) ?? new Set<string>();
        if (seenProcesses.has(record.processId.toLowerCase())) continue; // AlreadyCounted
        const sellers = sellersSeen.get(scopeKey) ?? new Set<string>();
        const seller = record.seller.toLowerCase();
        const firstSeller = !sellers.has(seller);

        seenProcesses.add(record.processId.toLowerCase());
        countedProcesses.set(id, seenProcesses);
        sellers.add(seller);
        sellersSeen.set(scopeKey, sellers);

        const period = periods.get(record.period) ?? { byClauseOrAssembly: new Map<string, ClauseOrAssemblyAccrual>(), totalScore: 0n };
        const entry = period.byClauseOrAssembly.get(id) ?? emptyEntry(record.kind, clauseOrAssembly);
        const accrual = entry.direct;
        accrual.c += 1n;
        if (firstSeller) accrual.d += 1n;
        const updated = usageScore(accrual.c, accrual.d, minSellers);
        period.totalScore = period.totalScore + updated - accrual.score;
        accrual.score = updated;
        entry.score = accrual.score + entry.batch.score;
        period.byClauseOrAssembly.set(id, entry);
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
        const id = usageKeyId(record.kind, clauseOrAssembly);
        const period = periods.get(record.period) ?? { byClauseOrAssembly: new Map<string, ClauseOrAssemblyAccrual>(), totalScore: 0n };
        const entry = period.byClauseOrAssembly.get(id) ?? emptyEntry(record.kind, clauseOrAssembly);
        const updated = usageScore(record.c, record.d, minSellers);
        period.totalScore = period.totalScore + updated - entry.batch.score;
        entry.batch = { c: record.c, d: record.d, score: updated };
        entry.score = entry.direct.score + entry.batch.score;
        period.byClauseOrAssembly.set(id, entry);
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
    /** The `(kind, key)` pairs the score sums — the list the wallet's
     *  `RpgfMinter.claim` names, duplicate-free. */
    claims: UsageKey[];
}

/** The payout: a period's accrual plus each clause or assembly's author of record gives
 *  every wallet's period entitlement — UNIFORM pro rata,
 *  `floor(periodAmount * score / total)`, with no cap.
 *
 *  `authorOf` maps `usageKeyId(kind, key)` → author of record (the `registeredBy` of
 *  the one registry the kind names — clause or assembly author); a pair with no author
 *  is unclaimable and its score
 *  still counts toward the denominator, exactly as on chain. Author-of-record
 *  eligibility is gated on a LIVE stake ON CHAIN (`RpgfMinter._isAuthor`); pass
 *  only live authors here to mirror it. */
export function computeRpgfAllocations(
    period: UsagePeriodAccrual,
    authorOf: ReadonlyMap<string, Address>,
    periodAmount: bigint,
): RpgfAllocation[] {
    if (period.totalScore === 0n) return [];

    const walletScores = new Map<Address, { score: bigint; claims: UsageKey[] }>();
    for (const [id, accrual] of period.byClauseOrAssembly) {
        const author = authorOf.get(id);
        if (!author || accrual.score === 0n) continue;
        const key = author.toLowerCase() as Address;
        const wallet = walletScores.get(key) ?? { score: 0n, claims: [] };
        wallet.score += accrual.score;
        wallet.claims.push({ kind: accrual.kind, key: accrual.clauseOrAssembly });
        walletScores.set(key, wallet);
    }

    // No clamp to `totalScore`: scores are summed per author over DISTINCT
    // (kind, key) pairs (`byClauseOrAssembly` is keyed by the pair), so `score <= totalScore`
    // holds structurally. The chain dropped its equivalent clamp —
    // there it was reachable via a duplicate-stuffed clause-or-assembly list, and clamping
    // silently rounded such a claim UP to the entire period budget instead of
    // rejecting it. Mirror the contract: nothing to clamp, and a violation
    // should surface, not be smoothed over.
    const allocations: RpgfAllocation[] = [];
    for (const [account, { score, claims }] of walletScores) {
        const amount = (periodAmount * score) / period.totalScore;
        if (amount === 0n) continue;
        allocations.push({ account, amount, score, claims });
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
                kind: asUsageKind(a.kind),
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
                kind: asUsageKind(a.kind),
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
    /** `UsageCounter.provenanceLeaf()` — the reserved leaf key the counter
     *  reproduces an agreement or assembly claim under. The agreement format
     *  fixes it (`PROVENANCE_LEAF_KEY`); it is read from the deployment being
     *  called so a counter that disagrees is refused before anything is
     *  sent. */
    provenanceLeaf: Hex;
    /** `UsageCounter.assemblyTermsLeaf()` — the composition tree's reserved
     *  terms key (`ASSEMBLY_TERMS_LEAF_KEY`), checked the same way. */
    assemblyTermsLeaf: Hex;
    /** `UsageCounter.assemblyLeafDomain()` — the assembly tree's leaf domain
     *  (`ASSEMBLY_LEAF_DOMAIN`), checked the same way: a counter in the old leaf
     *  shape would refuse every assembly claim's membership proof. */
    assemblyLeafDomain: Hex;
}

/**
 * Build every usage claim a resolved order supports.
 *
 * PURE — takes the chain facts as input so it can be tested and reasoned about
 * without a client. `fetchUsageClaimContext` gets them.
 *
 * THREE INDEPENDENT LEGS:
 *
 *  - the CLAUSE leg emits one claim per agreement clause — every committed
 *    clause earns, the mandatory ones included.
 *  - the AGREEMENT leg credits the registered agreement's designer from the
 *    agreement's provenance leaf (`Agreement.provenance`), proved with
 *    `buildProvenanceInclusionProof`: kind `{ Agreement: { assembly_hash } }`
 *    keyed by the agreement hash.
 *  - the ASSEMBLY leg credits the assembly's designer from the same leaf
 *    plus the agreement's membership proof under the assembly hash
 *    (`buildAgreementInclusionProof` over `assembly`, the instantiated assembly):
 *    kind `{ Assembly: { agreement_hash, slot_content_hash, membership_proof } }`
 *    keyed by the assembly hash. The agreement proved is the first whose
 *    `agreementHash` is the provenance's (every such agreement proves the
 *    same membership).
 *
 * The provenance leaf is the agreement format's, not a clause, so the
 * clause leg never sees it. An agreement naming no provenance has neither
 * of the last two legs.
 *
 * Throws when the counter's reserved keys are not the format's (every
 * agreement and assembly claim against it would revert); when the agreement
 * names a provenance but no `assembly` is given, the assembly does not hash
 * to the provenance's assembly hash, or no agreement binds its agreement
 * hash; when the provenance's agreement hash is a reserved key; and when the
 * agreement's leaves do not build — no leg of such an agreement can be
 * proved.
 */
export function buildUsageClaims(
    order: Commitment,
    agreement: Agreement,
    context: UsageClaimContext,
    assembly?: Assembly,
): SequencerUsageClaim[] {
    if (context.provenanceLeaf.toLowerCase() !== PROVENANCE_LEAF_KEY.toLowerCase()) {
        throw new Error(
            `the counter's provenance leaf ${context.provenanceLeaf} is not the agreement format's ` +
            `${PROVENANCE_LEAF_KEY}: every agreement and assembly claim against it would revert`,
        );
    }
    if (context.assemblyTermsLeaf.toLowerCase() !== ASSEMBLY_TERMS_LEAF_KEY.toLowerCase()) {
        throw new Error(
            `the counter's assembly-terms leaf ${context.assemblyTermsLeaf} is not the composition format's ` +
            `${ASSEMBLY_TERMS_LEAF_KEY}: every assembly claim against it would revert`,
        );
    }
    if (context.assemblyLeafDomain.toLowerCase() !== ASSEMBLY_LEAF_DOMAIN.toLowerCase()) {
        throw new Error(
            `the counter's assembly leaf domain ${context.assemblyLeafDomain} is not the assembly tree's ` +
            `${ASSEMBLY_LEAF_DOMAIN}: every assembly claim against it would revert`,
        );
    }
    const wireOrder = toSequencerCommitment(order);
    const claims: SequencerUsageClaim[] = [];

    // ── Clause leg ──
    for (const clauseEntry of agreement.clauses) {
        claims.push({
            order: wireOrder,
            clause_or_assembly: clauseEntry.clause,
            kind: { Clause: { clause_data_hash: hashClauseData(clauseEntry) } },
            inclusion_proof: buildSignedClauseInclusionProof(agreement, clauseEntry.clause).proof,
        });
    }

    // ── Agreement and assembly legs — the agreement's provenance leaf ──
    if (agreement.provenance !== undefined) {
        const { agreementHash, assemblyHash } = agreement.provenance;
        assertNotReservedKey(agreementHash, "provenance agreementHash");
        if (!assembly) {
            throw new Error("the agreement names a provenance: its instantiated assembly is needed for the assembly leg's membership proof");
        }
        if (assemblyHashOf(assembly).toLowerCase() !== assemblyHash.toLowerCase()) {
            throw new Error(`the assembly given does not hash to the provenance's assembly hash ${assemblyHash}`);
        }
        const agreementIndex = assembly.agreements.findIndex((entry) => entry.agreementHash.toLowerCase() === agreementHash.toLowerCase());
        if (agreementIndex < 0) {
            throw new Error(`no agreement of ${assemblyHash} binds the provenance's agreement ${agreementHash}`);
        }
        const leafProof = buildProvenanceInclusionProof(agreement).proof;
        claims.push({
            order: wireOrder,
            clause_or_assembly: agreementHash,
            kind: { Agreement: { assembly_hash: assemblyHash } },
            inclusion_proof: leafProof,
        });
        const membership = buildAgreementInclusionProof(assembly, agreementIndex);
        claims.push({
            order: wireOrder,
            clause_or_assembly: assemblyHash,
            kind: {
                Assembly: {
                    agreement_hash: agreementHash,
                    slot_content_hash: membership.slotContentHash,
                    membership_proof: membership.proof,
                },
            },
            inclusion_proof: leafProof,
        });
    }

    return claims;
}

/** The family a wire claim credits — `USAGE_KIND_CLAUSE`,
 *  `USAGE_KIND_ASSEMBLY` or `USAGE_KIND_AGREEMENT` — mirroring the guest's
 *  `UsageClaimKind::code()`. */
export function usageClaimKindCode(claim: Pick<SequencerUsageClaim, "kind">): UsageKind {
    if ("Clause" in claim.kind) return USAGE_KIND_CLAUSE;
    if ("Agreement" in claim.kind) return USAGE_KIND_AGREEMENT;
    return USAGE_KIND_ASSEMBLY;
}

/**
 * Read the chain facts `buildUsageClaims` needs: the counter's two reserved
 * keys. One read per counter serves every order resolved against it.
 */
export async function fetchUsageClaimContext(
    client: PublicClient,
    usageCounter: Address,
): Promise<UsageClaimContext> {
    const [provenanceLeaf, assemblyTermsLeaf, assemblyLeafDomain] = await Promise.all([
        client.readContract({ address: usageCounter, abi: USAGE_COUNTER_ABI, functionName: "provenanceLeaf" }) as Promise<Hex>,
        client.readContract({ address: usageCounter, abi: USAGE_COUNTER_ABI, functionName: "assemblyTermsLeaf" }) as Promise<Hex>,
        client.readContract({ address: usageCounter, abi: USAGE_COUNTER_ABI, functionName: "assemblyLeafDomain" }) as Promise<Hex>,
    ]);
    return { provenanceLeaf, assemblyTermsLeaf, assemblyLeafDomain };
}

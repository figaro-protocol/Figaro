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
import { BATCH_VERIFIER_ABI, USAGE_COUNTER_ABI } from "../abis.js";
import type { Agreement } from "../agreement.js";
import { PROVENANCE_LEAF_KEY, buildProvenanceInclusionProof, buildSignedClauseInclusionProof, hashClauseData } from "../agreement.js";
import {
    PROCESS_LEAF_DOMAIN,
    PROCESS_TERMS_LEAF_KEY,
    assertNotReservedKey,
    buildAgreementInclusionProof,
    processDesignHashOf,
    type ProcessDesign,
} from "../assembly.js";
import { decodeLogs, fetchLogsChunked } from "../events.js";
import { computeCommitmentProcessId } from "../commitments.js";
import { usageClaimsOfOperationStream } from "../operationStream.js";
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
 *  `minSellers` is the deployment's floor, `UsageCounter.minSellers()` read
 *  from the chain: an immutable each deployment sets, so no default stands
 *  in for it. */
export function usageScore(c: bigint, d: bigint, minSellers: bigint): bigint {
    if (typeof minSellers !== "bigint") {
        throw new Error("usageScore: minSellers is required; read UsageCounter.minSellers() from the chain");
    }
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
export const USAGE_KIND_PROCESS = 1 as const;
export const USAGE_KIND_AGREEMENT = 2 as const;
export type UsageKind = typeof USAGE_KIND_CLAUSE | typeof USAGE_KIND_PROCESS | typeof USAGE_KIND_AGREEMENT;

/** One `(kind, key)` pair — the unit the counter accrues and the minter's
 *  claim names; the shape of `RpgfMinter.ClauseOrProcessKey`, so a list of
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
export function usageKeyId(kind: UsageKind, clauseOrProcess: Hex): string {
    return `${kind}:${clauseOrProcess.toLowerCase()}`;
}

function asUsageKind(value: unknown): UsageKind {
    const kind = Number(value);
    if (kind !== USAGE_KIND_CLAUSE && kind !== USAGE_KIND_PROCESS && kind !== USAGE_KIND_AGREEMENT) {
        throw new Error(`usage kind ${String(value)} is none of clause (0), assembly (1), agreement (2)`);
    }
    return kind;
}

// ── Usage records (the counter's event stream) ───────────────────────

/** One `UsageCounter.UsageRecorded` log, from either route — a direct call
 *  or a proved batch emits the same event. `c`, `d` and `score` are the
 *  clause-or-assembly's running values AFTER the use is counted — the mirror
 *  recomputes them independently, so a divergence is visible without a second
 *  data source. */
export interface UsageRecord {
    blockNumber: bigint;
    logIndex: number;
    kind: UsageKind;
    /** Clause key, assembly processDesignHash or agreement hash, by `kind`. */
    clauseOrProcess: Hex;
    period: number;
    processId: Hex;
    /** The seller of the order the use was proved through (live-staked when counted). */
    seller: Address;
    c: bigint;
    d: bigint;
    score: bigint;
}

/** A clause's, agreement's or assembly's tally in one period —
 *  `UsageCounter.accrualOf`. */
export interface UsageAccrual {
    c: bigint;
    d: bigint;
    score: bigint;
}

/** A clause's, agreement's or assembly's ONE tally, route-blind: a use
 *  counts the same whether its process resolved through `FigaroCore` or in a
 *  proved batch, and both routes emit `UsageRecorded`, so one replay of one
 *  stream gives the tally `UsageCounter.accrualOf` holds. `score` is what
 *  `UsageCounter.scoreOf` returns — the only figure a reward calculation may
 *  divide by. */
export interface ClauseOrProcessAccrual extends UsageAccrual {
    kind: UsageKind;
    clauseOrProcess: Hex;
}

/** One period's accrual state — every `(kind, key)`'s tally (filed under
 *  `usageKeyId`) plus the period total, mirroring `totalScoreIn`. */
export interface UsagePeriodAccrual {
    byClauseOrProcess: Map<string, ClauseOrProcessAccrual>;
    totalScore: bigint;
}

function emptyEntry(kind: UsageKind, clauseOrProcess: Hex): ClauseOrProcessAccrual {
    return { kind, clauseOrProcess, c: 0n, d: 0n, score: 0n };
}

/** Replay the counter's counting rules over a record stream: idempotence per
 *  ((kind, key), process, seller) — GLOBAL, so each seller of a process is
 *  one use, counted once ever, and a later period is never paid for an
 *  earlier period's trade — then the
 *  distinct-STAKED-SELLER count PER PERIOD (breadth counts
 *  only what a stake has priced; pairs were free to mint on the buyer side)
 *  and the uniform floored score. Records are replayed in (blockNumber,
 *  logIndex) order, the order the chain applied them in. `minSellers` is
 *  the deployment's `UsageCounter.minSellers()`, read from the chain. */
export function computeUsageAccruals(
    records: readonly UsageRecord[],
    minSellers: bigint,
):Map<number, UsagePeriodAccrual> {
    const sorted = [...records].sort((a, b) =>
        a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
    );

    const periods = new Map<number, UsagePeriodAccrual>();
    const countedUses = new Map<string, Set<string>>(); // (kind, key) → processId|seller (GLOBAL)
    const sellersSeen = new Map<string, Set<string>>(); // (kind, key)|period → sellers

    for (const record of sorted) {
        const clauseOrProcess = record.clauseOrProcess.toLowerCase() as Hex;
        const id = usageKeyId(record.kind, clauseOrProcess);
        const scopeKey = `${id}|${record.period}`;
        const seller = record.seller.toLowerCase();
        const use = `${record.processId.toLowerCase()}|${seller}`;

        const seenUses = countedUses.get(id) ?? new Set<string>();
        if (seenUses.has(use)) continue; // AlreadyCounted
        const sellers = sellersSeen.get(scopeKey) ?? new Set<string>();
        const firstSeller = !sellers.has(seller);

        seenUses.add(use);
        countedUses.set(id, seenUses);
        sellers.add(seller);
        sellersSeen.set(scopeKey, sellers);

        const period = periods.get(record.period) ?? { byClauseOrProcess: new Map<string, ClauseOrProcessAccrual>(), totalScore: 0n };
        const entry = period.byClauseOrProcess.get(id) ?? emptyEntry(record.kind, clauseOrProcess);
        entry.c += 1n;
        if (firstSeller) entry.d += 1n;
        const updated = usageScore(entry.c, entry.d, minSellers);
        period.totalScore = period.totalScore + updated - entry.score;
        entry.score = updated;
        period.byClauseOrProcess.set(id, entry);
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
    for (const [id, accrual] of period.byClauseOrProcess) {
        const author = authorOf.get(id);
        if (!author || accrual.score === 0n) continue;
        const key = author.toLowerCase() as Address;
        const wallet = walletScores.get(key) ?? { score: 0n, claims: [] };
        wallet.score += accrual.score;
        wallet.claims.push({ kind: accrual.kind, key: accrual.clauseOrProcess });
        walletScores.set(key, wallet);
    }

    // No clamp to `totalScore`: scores are summed per author over DISTINCT
    // (kind, key) pairs (`byClauseOrProcess` is keyed by the pair), so `score <= totalScore`
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
    const records: UsageRecord[] = decodeLogs(logs, USAGE_COUNTER_ABI)
        .filter((d) => d.eventName === "UsageRecorded")
        .map(({ args: a, log, at }) => ({
            blockNumber: log.blockNumber ?? 0n,
            logIndex: at.logIndex,
            kind: asUsageKind(a.kind),
            clauseOrProcess: a.clauseOrProcess as Hex,
            period: Number(a.period),
            processId: a.processId as Hex,
            seller: a.seller as Address,
            c: a.c as bigint,
            d: a.d as bigint,
            score: a.score as bigint,
        }));
    return records.sort((a, b) =>
        a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
    );
}

// ── Uses a batch carried and the counter counted none of ─────────────

/** One use a batch handed to the counter: the verifier's `settleBatch`
 *  argument `usage.uses[i]`, as `UsageCounter.BatchUse` holds it. */
export interface BatchUse {
    clauseOrProcess: Hex;
    kind: UsageKind;
    processId: Hex;
    seller: Address;
}

/** A batch whose whole call to the counter reverted (`BatchAccrualSkipped`). */
export interface SkippedBatch {
    batchId: bigint;
    /** The `settleBatch` transaction, and the block it landed in. */
    transactionHash: Hex;
    blockNumber: bigint;
    /** The counter's revert data, as the verifier caught it. */
    reason: Hex;
    /** What the batch carried, read from the `BatchOperations` log of the
     *  same transaction and batch id: the period and provenance leaf the
     *  claims were applied under, every usage claim whole, in the wire form
     *  `SequencerClient.submitUsageClaim` sends, and the uses the guest
     *  derived from them. Always present: a batch with no claim carries
     *  empty lists. */
    carried: { period: number; provenanceLeaf: Hex; claims: SequencerUsageClaim[]; uses: BatchUse[] };
}

const BATCH_ACCRUAL_SKIPPED_EVENT = BATCH_VERIFIER_ABI.find(
    (i): i is Extract<(typeof BATCH_VERIFIER_ABI)[number], { type: "event"; name: "BatchAccrualSkipped" }> =>
        i.type === "event" && i.name === "BatchAccrualSkipped",
)!;
const BATCH_OPERATIONS_EVENT = BATCH_VERIFIER_ABI.find(
    (i): i is Extract<(typeof BATCH_VERIFIER_ABI)[number], { type: "event"; name: "BatchOperations" }> =>
        i.type === "event" && i.name === "BatchOperations",
)!;

/**
 * Find every batch the verifier landed with no use counted, and the claims
 * and uses it carried. The verifier resolves a batch whose call to
 * `UsageCounter` reverts whole (a period boundary crossed in flight, the last
 * period closed (`AccrualClosed`), a provenance mismatch) and emits
 * `BatchAccrualSkipped(batchId, reason)` (`docs/DESIGN_DECISIONS.md` § 19).
 * A call its submitter starved of gas is never among them: the verifier
 * reverts that batch whole (`AccrualStarvedOfGas`), so it lands nothing and
 * no log of it exists. In the same transaction it logs the
 * batch's operation stream in `BatchOperations(batchId, …)`, however the call
 * reached it, and the stream carries each usage claim whole
 * (`usageClaimsOfOperationStream`). So the answer is read from the
 * verifier's logs alone: no transaction is read, and a `settleBatch` call
 * made through another contract is read as a direct one is.
 *
 * Each use stays uncounted and a later batch may prove it again while a
 * period is open; `reason` tells the caller whether sending again can work
 * (`AccrualClosed` is final). Anyone can send each claim in `carried.claims`
 * again with `SequencerClient.submitUsageClaim`, without the agreement.
 * `carried.uses` are the uses the guest derives from those claims
 * (`apply_usage_claims`, prover/lib/src/kernel.rs): one per
 * (kind, key, process, seller), in claim order, a root order's
 * process id derived under the verifier's EIP-712 domain (the client's chain
 * id and `batchVerifier`); the proof binds them to the `settleBatch`
 * argument. A use the counter skips one by one inside a call that does not
 * revert (an unstaked seller, a key without a live registration, a seller of
 * a process already counted) emits no event, and this reader does not see it;
 * `UsageCounter.sellerCounted` answers for it.
 *
 * `fromBlock` is required: a scan of a deployment starts at its
 * `FigaroDeploymentRecord.deploymentBlock`. The node is asked for the two
 * events only. A failed read throws, as every bulk reader of this SDK does
 * (`fetchLogsChunked`): a partial scan would answer "nothing skipped" for
 * the blocks it lost. A skipped batch whose `BatchOperations` log is absent
 * from the node's answer, or whose stream does not decode, also throws: the
 * verifier emits both in one transaction, so either is the node's error or a
 * stream layout this SDK does not read, never a batch that carried nothing.
 */
export async function fetchSkippedBatchUses(
    client: PublicClient,
    batchVerifier: Address,
    params: { fromBlock: bigint; toBlock: bigint | "latest"; chunkSize?: bigint },
): Promise<SkippedBatch[]> {
    if (typeof params.fromBlock !== "bigint") {
        throw new Error("fetchSkippedBatchUses: fromBlock is required; start at the deployment's deploymentBlock");
    }
    const logs = await fetchLogsChunked(client, {
        address: batchVerifier,
        events: [BATCH_ACCRUAL_SKIPPED_EVENT, BATCH_OPERATIONS_EVENT],
        fromBlock: params.fromBlock,
        toBlock: params.toBlock,
        chunkSize: params.chunkSize,
    });
    const skips: Omit<SkippedBatch, "carried">[] = [];
    const operations = new Map<string, { period: number; provenanceLeaf: Hex; operations: Hex }>();
    const pairKey = (tx: Hex, batchId: bigint) => `${tx.toLowerCase()}:${batchId}`;
    for (const { eventName, args: a, log } of decodeLogs(logs, BATCH_VERIFIER_ABI)) {
        if (!log.transactionHash) continue;
        if (eventName === "BatchAccrualSkipped") {
            skips.push({ batchId: a.batchId as bigint, transactionHash: log.transactionHash, blockNumber: log.blockNumber ?? 0n, reason: a.reason as Hex });
        } else if (eventName === "BatchOperations") {
            operations.set(pairKey(log.transactionHash, a.batchId as bigint), {
                period: a.usagePeriod as number,
                provenanceLeaf: a.provenanceLeaf as Hex,
                operations: a.operations as Hex,
            });
        }
    }
    if (skips.length === 0) return [];
    const chainId = await client.getChainId();
    return skips.map((skip) => {
        const ops = operations.get(pairKey(skip.transactionHash, skip.batchId));
        if (!ops) {
            throw new Error(
                `batch ${skip.batchId} skipped its accrual in ${skip.transactionHash}, and the node returned no BatchOperations log ` +
                    "of that batch in that transaction",
            );
        }
        const claims = usageClaimsOfOperationStream(ops.operations);
        return {
            ...skip,
            carried: { period: ops.period, provenanceLeaf: ops.provenanceLeaf, claims, uses: batchUsesOf(claims, chainId, batchVerifier) },
        };
    });
}

/** The uses the guest derives from `claims` (prover/lib/src/kernel.rs
 *  `apply_usage_claims`): one per (kind, key, process, seller) in claim order,
 *  so each seller of a process is one use and a second claim through the same
 *  seller's order gives none; a root order's process id is its EIP-712 digest
 *  under the verifier's domain (kernel.rs:312-322). */
function batchUsesOf(claims: SequencerUsageClaim[], chainId: number, batchVerifier: Address): BatchUse[] {
    const seen = new Set<string>();
    const uses: BatchUse[] = [];
    for (const claim of claims) {
        const o = claim.order;
        const processId = computeCommitmentProcessId(
            {
                processId: o.process_id,
                buyer: o.buyer,
                seller: o.seller,
                token: o.token,
                payment: BigInt(o.payment),
                runningTotal: BigInt(o.running_total),
                checkoutHash: o.checkout_hash,
                salt: BigInt(o.salt),
                commitDeadline: BigInt(o.commit_deadline),
            },
            chainId,
            batchVerifier,
        );
        const kind = usageClaimKindCode(claim);
        const id = `${usageKeyId(kind, claim.clause_or_process)}|${processId.toLowerCase()}|${o.seller.toLowerCase()}`;
        if (seen.has(id)) continue;
        seen.add(id);
        uses.push({ clauseOrProcess: claim.clause_or_process, kind, processId, seller: o.seller });
    }
    return uses;
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
    /** `UsageCounter.processTermsLeaf()` — the composition tree's reserved
     *  terms key (`PROCESS_TERMS_LEAF_KEY`), checked the same way. */
    processTermsLeaf: Hex;
    /** `UsageCounter.processLeafDomain()` — the assembly tree's leaf domain
     *  (`PROCESS_LEAF_DOMAIN`), checked the same way: a counter in the old leaf
     *  shape would refuse every assembly claim's membership proof. */
    processLeafDomain: Hex;
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
 *    clause earns.
 *  - the AGREEMENT leg credits the registered agreement's designer from the
 *    agreement's provenance leaf (`Agreement.provenance`), proved with
 *    `buildProvenanceInclusionProof`: kind `{ Agreement: { process_design_hash } }`
 *    keyed by the agreement hash.
 *  - the ASSEMBLY leg credits the assembly's designer from the same leaf
 *    plus the agreement's membership proof under the assembly hash
 *    (`buildAgreementInclusionProof` over `assembly`, the instantiated assembly):
 *    kind `{ Process: { agreement_hash, agreement_content_hash, membership_proof } }`
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
    assembly?: ProcessDesign,
): SequencerUsageClaim[] {
    if (context.provenanceLeaf.toLowerCase() !== PROVENANCE_LEAF_KEY.toLowerCase()) {
        throw new Error(
            `the counter's provenance leaf ${context.provenanceLeaf} is not the agreement format's ` +
            `${PROVENANCE_LEAF_KEY}: every agreement and assembly claim against it would revert`,
        );
    }
    if (context.processTermsLeaf.toLowerCase() !== PROCESS_TERMS_LEAF_KEY.toLowerCase()) {
        throw new Error(
            `the counter's assembly-terms leaf ${context.processTermsLeaf} is not the composition format's ` +
            `${PROCESS_TERMS_LEAF_KEY}: every assembly claim against it would revert`,
        );
    }
    if (context.processLeafDomain.toLowerCase() !== PROCESS_LEAF_DOMAIN.toLowerCase()) {
        throw new Error(
            `the counter's assembly leaf domain ${context.processLeafDomain} is not the assembly tree's ` +
            `${PROCESS_LEAF_DOMAIN}: every assembly claim against it would revert`,
        );
    }
    const wireOrder = toSequencerCommitment(order);
    const claims: SequencerUsageClaim[] = [];

    // ── Clause leg ──
    for (const clauseEntry of agreement.clauses) {
        claims.push({
            order: wireOrder,
            clause_or_process: clauseEntry.clause,
            kind: { Clause: { clause_data_hash: hashClauseData(clauseEntry) } },
            inclusion_proof: buildSignedClauseInclusionProof(agreement, clauseEntry.clause).proof,
        });
    }

    // ── Agreement and assembly legs — the agreement's provenance leaf ──
    if (agreement.provenance !== undefined) {
        const { agreementHash, processDesignHash } = agreement.provenance;
        assertNotReservedKey(agreementHash, "provenance agreementHash");
        if (!assembly) {
            throw new Error("the agreement names a provenance: its instantiated assembly is needed for the assembly leg's membership proof");
        }
        if (processDesignHashOf(assembly).toLowerCase() !== processDesignHash.toLowerCase()) {
            throw new Error(`the assembly given does not hash to the provenance's assembly hash ${processDesignHash}`);
        }
        const agreementIndex = assembly.agreements.findIndex((entry) => entry.agreementHash.toLowerCase() === agreementHash.toLowerCase());
        if (agreementIndex < 0) {
            throw new Error(`no agreement of ${processDesignHash} binds the provenance's agreement ${agreementHash}`);
        }
        const leafProof = buildProvenanceInclusionProof(agreement).proof;
        claims.push({
            order: wireOrder,
            clause_or_process: agreementHash,
            kind: { Agreement: { process_design_hash: processDesignHash } },
            inclusion_proof: leafProof,
        });
        const membership = buildAgreementInclusionProof(assembly, agreementIndex);
        claims.push({
            order: wireOrder,
            clause_or_process: processDesignHash,
            kind: {
                Process: {
                    agreement_hash: agreementHash,
                    agreement_content_hash: membership.agreementContentHash,
                    membership_proof: membership.proof,
                },
            },
            inclusion_proof: leafProof,
        });
    }

    return claims;
}

/** One order of a resolved process, as {@link buildUsageClaims} reads it. */
export interface UsageClaimOrder {
    commitment: Commitment;
    agreement: Agreement;
    context: UsageClaimContext;
    assembly?: ProcessDesign;
}

/**
 * The usage claims of a resolved process's orders ({@link buildUsageClaims}
 * on each, in order), each `(kind, key)` once for each seller: the counter
 * counts a use once per (kind, key, process, seller), so a key that orders of
 * two sellers carry is claimed once through each seller's first order that
 * carries it, and a key that two orders of one seller carry is claimed once.
 * An order whose claims do not build contributes none, and `refuse` is told
 * why; the other orders go on.
 */
export function buildProcessUsageClaims<O extends UsageClaimOrder>(
    orders: readonly O[],
    refuse: (order: O, reason: string) => void,
): { order: O; claim: SequencerUsageClaim }[] {
    const seen = new Set<string>();
    const out: { order: O; claim: SequencerUsageClaim }[] = [];
    for (const order of orders) {
        let claims: SequencerUsageClaim[];
        try {
            claims = buildUsageClaims(order.commitment, order.agreement, order.context, order.assembly);
        } catch (error) {
            refuse(order, error instanceof Error ? error.message : String(error));
            continue;
        }
        for (const claim of claims) {
            const key = `${usageKeyId(usageClaimKindCode(claim), claim.clause_or_process)}|${order.commitment.seller.toLowerCase()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ order, claim });
        }
    }
    return out;
}

/** The family a wire claim credits — `USAGE_KIND_CLAUSE`,
 *  `USAGE_KIND_PROCESS` or `USAGE_KIND_AGREEMENT` — mirroring the guest's
 *  `UsageClaimKind::code()`. */
export function usageClaimKindCode(claim: Pick<SequencerUsageClaim, "kind">): UsageKind {
    if ("Clause" in claim.kind) return USAGE_KIND_CLAUSE;
    if ("Agreement" in claim.kind) return USAGE_KIND_AGREEMENT;
    return USAGE_KIND_PROCESS;
}

/**
 * Read the chain facts `buildUsageClaims` needs: the counter's two reserved
 * keys. One read per counter serves every order resolved against it.
 */
export async function fetchUsageClaimContext(
    client: PublicClient,
    usageCounter: Address,
): Promise<UsageClaimContext> {
    const [provenanceLeaf, processTermsLeaf, processLeafDomain] = await Promise.all([
        client.readContract({ address: usageCounter, abi: USAGE_COUNTER_ABI, functionName: "provenanceLeaf" }) as Promise<Hex>,
        client.readContract({ address: usageCounter, abi: USAGE_COUNTER_ABI, functionName: "processTermsLeaf" }) as Promise<Hex>,
        client.readContract({ address: usageCounter, abi: USAGE_COUNTER_ABI, functionName: "processLeafDomain" }) as Promise<Hex>,
    ]);
    return { provenanceLeaf, processTermsLeaf, processLeafDomain };
}

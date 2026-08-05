import { describe, expect, it, vi } from "vitest";
import { encodePacked, keccak256, type Address, type Hex, type Log, type PublicClient } from "viem";
import {
    computeRpgfAllocations,
    computeUsageAccruals,
    icbrt,
    usageScore,
    RPGF_SCORE_SCALE,
    RPGF_MIN_SELLERS,
    type UsagePeriodAccrual,
    type ClauseOrAssemblyAccrual,
    type BatchUsageRecord,
    type UsageRecord,
    buildUsageClaims,
    fetchUsageRecords,
    fetchBatchUsageRecords,
} from "../src/rpgf/index.js";
import {
    computeAgreementHash,
    computeSectionLeaf,
    sectionDataHash,
    verifyInclusionProof,
    type Agreement,
} from "../src/agreement.js";
import { computeClauseKey } from "../src/discovery.js";
import type { Commitment } from "../src/types.js";

// ── Integer math ─────────────────────────────────────────────────────

describe("icbrt", () => {
    it("floors exactly around perfect cubes", () => {
        expect(icbrt(0n)).toBe(0n);
        expect(icbrt(1n)).toBe(1n);
        expect(icbrt(7n)).toBe(1n);
        expect(icbrt(8n)).toBe(2n);
        expect(icbrt(26n)).toBe(2n);
        expect(icbrt(27n)).toBe(3n);
        expect(icbrt(10n ** 18n)).toBe(10n ** 6n);
        const big = 123456789n;
        expect(icbrt(big * big * big)).toBe(big);
        expect(icbrt(big * big * big - 1n)).toBe(big - 1n);
    });

    it("agrees with UsageCounter.icbrt at its uint256 search ceiling", () => {
        // The Solidity side clamps its search ceiling at floor(cbrt(2^256-1)) —
        // the largest x whose cube fits a uint256. At and around that bound the
        // two must agree. (A prior revision clamped at floor(cbrt(2^64-1)) =
        // 2642245, which saturated every score above c * d^2 >= 19; these cases
        // are the regression.)
        const bound = 48740834812604276470692694n;
        expect(icbrt(bound * bound * bound)).toBe(bound);
        expect(icbrt(bound * bound * bound - 1n)).toBe(bound - 1n);
        const oldWrongBound = 2642245n;
        expect(icbrt(oldWrongBound ** 3n + 1n)).toBe(oldWrongBound);
        expect(icbrt(20n * RPGF_SCORE_SCALE)).toBe(2714417n); // c=5, d=2
        expect(icbrt(10000n * RPGF_SCORE_SCALE)).toBe(21544346n); // c=100, d=10
        // The counter's own inputs are c * d^2 * 1e18 — exact for a perfect cube.
        expect(icbrt(8n * RPGF_SCORE_SCALE)).toBe(2n * 10n ** 6n);
    });
});

describe("usageScore", () => {
    it("is zero without both a process and a seller", () => {
        expect(usageScore(0n, 3n)).toBe(0n);
        expect(usageScore(3n, 0n, 1n)).toBe(0n);
    });

    it("weights breadth twice as heavily as volume", () => {
        // c^(1/3) * d^(2/3): doubling d must beat doubling c.
        const moreProcesses = usageScore(6n, 3n);
        const moreSellers = usageScore(3n, 6n);
        expect(moreSellers).toBeGreaterThan(moreProcesses);
    });

    it("is uniform — equal (c, d) gives equal score for any clause or assembly (no weight)", () => {
        expect(usageScore(5n, 3n)).toBe(usageScore(5n, 3n));
        expect(usageScore(1n, 1n, 1n)).toBe(10n ** 6n); // icbrt(1e18), floor disabled
    });

    it("floors below minSellers — the minimum-support floor (ruled 2026-07-31)", () => {
        // Default is the formula reference (3): below it nothing scores,
        // at it the FULL score springs — deferred, never lost.
        expect(RPGF_MIN_SELLERS).toBe(3n);
        expect(usageScore(10n, 2n)).toBe(0n);
        expect(usageScore(10n, 3n)).toBe(icbrt(90n * RPGF_SCORE_SCALE));
        // A deployment with the floor disabled mirrors via the parameter.
        expect(usageScore(10n, 2n, 1n)).toBeGreaterThan(0n);
    });
});

// ── The counter's counting rules ─────────────────────────────────────

const CLAUSE_A = "0x00000000000000000000000000000000000000000000000000000000000000a1" as Hex;
const CLAUSE_B = "0x00000000000000000000000000000000000000000000000000000000000000b2" as Hex;
const ASSEMBLY = "0x00000000000000000000000000000000000000000000000000000000000000c3" as Hex;

const AUTHOR_A = "0x1000000000000000000000000000000000000001" as Address;
const AUTHOR_B = "0x2000000000000000000000000000000000000002" as Address;
const DESIGNER = "0x3000000000000000000000000000000000000003" as Address;

const seed = (s: string): Hex => `0x${Buffer.from(s).toString("hex").padEnd(64, "0").slice(0, 64)}` as Hex;
/** A deterministic seller address from a label — the priced identity breadth counts. */
const sellerOf = (s: string): Address => `0x${keccak256(encodePacked(["string"], [s])).slice(26)}` as Address;

let logCounter = 0;
function record(
    clauseOrAssembly: Hex,
    processId: string,
    seller: Address,
    overrides: Partial<UsageRecord> = {},
): UsageRecord {
    // c/d/score on the event are the chain's own running values; the mirror
    // recomputes them, so the fixtures leave them at zero unless a test cares.
    return {
        blockNumber: 100n,
        logIndex: logCounter++,
        clauseOrAssembly,
        period: 0,
        processId: seed(processId),
        seller,
        c: 0n,
        d: 0n,
        score: 0n,
        ...overrides,
    };
}

describe("computeUsageAccruals", () => {
    it("counts distinct processes and distinct staked sellers per clause or assembly, bucketed by period", () => {
        const s1 = sellerOf("seller1");
        const s2 = sellerOf("seller2");
        const accruals = computeUsageAccruals([
            record(CLAUSE_A, "p1", s1),
            record(CLAUSE_A, "p2", s2),
            record(CLAUSE_B, "p1", s1),
        ], [], 1n);
        const period = accruals.get(0)!;
        expect(period.byClauseOrAssembly.get(CLAUSE_A)!.direct).toMatchObject({ c: 2n, d: 2n });
        expect(period.byClauseOrAssembly.get(CLAUSE_B)!.direct).toMatchObject({ c: 1n, d: 1n });
        expect(period.totalScore).toBe(usageScore(2n, 2n, 1n) + usageScore(1n, 1n, 1n));
    });

    it("many buyers through one seller are volume, never breadth (ruled 2026-07-31)", () => {
        // The exact shape a farmer fabricates for free — buyer wallets cost
        // nothing. Breadth follows the priced identity: one seller, d = 1,
        // however many buyers arrive. (The old pair statistic gave d = N here.)
        const s1 = sellerOf("seller1");
        const accruals = computeUsageAccruals([
            record(CLAUSE_A, "q1", s1),
            record(CLAUSE_A, "q2", s1),
            record(CLAUSE_A, "q3", s1),
        ], [], 1n);
        expect(accruals.get(0)!.byClauseOrAssembly.get(CLAUSE_A)!.direct).toMatchObject({ c: 3n, d: 1n });
    });

    it("is idempotent per (clause or assembly, process) — a replay adds nothing", () => {
        const s1 = sellerOf("seller1");
        const once = computeUsageAccruals([record(CLAUSE_A, "p1", s1)], [], 1n);
        const twice = computeUsageAccruals([record(CLAUSE_A, "p1", s1), record(CLAUSE_A, "p1", s1)], [], 1n);
        expect(twice.get(0)!.byClauseOrAssembly.get(CLAUSE_A)).toEqual(once.get(0)!.byClauseOrAssembly.get(CLAUSE_A));
    });

    it("counts a process ONCE EVER — re-recording it in a later period adds nothing", () => {
        // Global idempotence (ruled 2026-07-30): a resolved order stays resolved
        // and its struct is public, so a per-period key would let the same trade
        // be re-presented every period — paying for recording gas, not adoption.
        const s1 = sellerOf("seller1");
        const accruals = computeUsageAccruals([
            record(CLAUSE_A, "px-0", s1, { period: 0 }),
            record(CLAUSE_A, "px-0", s1, { period: 1 }),
        ], [], 1n);
        expect(accruals.get(0)!.byClauseOrAssembly.get(CLAUSE_A)!.direct).toMatchObject({ c: 1n, d: 1n });
        expect(accruals.get(1)?.byClauseOrAssembly.get(CLAUSE_A)).toBeUndefined();
    });

    it("a later period counts only trade that is NEW to it", () => {
        const accruals = computeUsageAccruals([
            record(CLAUSE_A, "py-old", sellerOf("seller1"), { period: 0 }),
            record(CLAUSE_A, "py-old", sellerOf("seller1"), { period: 1 }),
            record(CLAUSE_A, "py-new", sellerOf("seller2"), { period: 1 }),
        ], [], 1n);
        expect(accruals.get(1)!.byClauseOrAssembly.get(CLAUSE_A)!.direct).toMatchObject({ c: 1n, d: 1n });
    });

    it("counts every repeat process into c, but a seller is one unit of d", () => {
        // Repetition is discounted by the exponent, never refused: one seller
        // carrying many trades adds volume under c^(1/3).
        const repeat = sellerOf("seller1");
        const accruals = computeUsageAccruals(
            Array.from({ length: 8 }, (_, i) => record(CLAUSE_A, `pc-${i}`, repeat)),
            [],
            1n,
        );
        expect(accruals.get(0)!.byClauseOrAssembly.get(CLAUSE_A)!.direct).toEqual({
            c: 8n,
            d: 1n,
            score: usageScore(8n, 1n, 1n),
        });
        // ...and eight trades through ONE seller must score below eight distinct sellers.
        expect(usageScore(8n, 1n, 1n)).toBeLessThan(usageScore(8n, 8n, 1n));
    });

    it("counts breadth per clause or assembly — a fresh staked seller adds a unit of d", () => {
        const repeat = sellerOf("seller1");
        const fresh = sellerOf("seller9");
        const accruals = computeUsageAccruals([
            ...Array.from({ length: 7 }, (_, i) => record(CLAUSE_A, `pe-${i}`, repeat)),
            record(CLAUSE_A, "pe-fresh", fresh),
        ], [], 1n);
        expect(accruals.get(0)!.byClauseOrAssembly.get(CLAUSE_A)!.direct).toMatchObject({
            c: 8n,
            d: 2n,
        });
    });

    it("buckets accrual by period — the same seller starts over in the next one", () => {
        const s1 = sellerOf("seller1");
        const accruals = computeUsageAccruals([
            record(CLAUSE_A, "pf-0", s1, { period: 0 }),
            record(CLAUSE_A, "pf-1", s1, { period: 1 }),
        ], [], 1n);
        expect(accruals.get(0)!.byClauseOrAssembly.get(CLAUSE_A)!.direct).toMatchObject({ c: 1n, d: 1n });
        expect(accruals.get(1)!.byClauseOrAssembly.get(CLAUSE_A)!.direct).toMatchObject({ c: 1n, d: 1n });
    });

    it("scores uniformly — equal usage gives equal score, clause or assembly", () => {
        const accruals = computeUsageAccruals(
            [record(CLAUSE_A, "pg-0", sellerOf("s")), record(CLAUSE_B, "pg-0", sellerOf("s"))],
            [],
            1n,
        );
        const period = accruals.get(0)!;
        expect(period.byClauseOrAssembly.get(CLAUSE_A)!.score).toBe(period.byClauseOrAssembly.get(CLAUSE_B)!.score);
    });

    it("reproduces the running score the chain emitted", () => {
        // The event carries the clause-or-assembly's score AFTER the record; the mirror
        // must land on the same number from the counting rules alone.
        const s1 = sellerOf("seller1");
        const s2 = sellerOf("seller2");
        const emitted = [
            record(CLAUSE_A, "ph-0", s1, { c: 1n, d: 1n, score: usageScore(1n, 1n, 1n) }),
            record(CLAUSE_A, "ph-1", s2, { c: 2n, d: 2n, score: usageScore(2n, 2n, 1n) }),
        ];
        const accrual = computeUsageAccruals(emitted, [], 1n).get(0)!.byClauseOrAssembly.get(CLAUSE_A)!.direct;
        const last = emitted[emitted.length - 1];
        expect(accrual).toEqual({ c: last.c, d: last.d, score: last.score });
    });

    // ── The batch leg ───────────────────────────────────────────────

    function batchRecord(
        clauseOrAssembly: Hex,
        c: bigint,
        d: bigint,
        over: Partial<BatchUsageRecord> = {},
    ): BatchUsageRecord {
        return {
            blockNumber: 200n,
            logIndex: 0,
            clauseOrAssembly,
            period: 0,
            c,
            d,
            score: usageScore(c, d, 1n),
            ...over,
        };
    }

    it("folds batch-settled usage into the same period", () => {
        const period = computeUsageAccruals([], [batchRecord(CLAUSE_A, 4n, 2n)], 1n).get(0)!;
        const entry = period.byClauseOrAssembly.get(CLAUSE_A)!;
        expect(entry.batch).toEqual({ c: 4n, d: 2n, score: usageScore(4n, 2n, 1n) });
        expect(entry.direct).toEqual({ c: 0n, d: 0n, score: 0n });
        expect(entry.score).toBe(usageScore(4n, 2n, 1n));
        expect(period.totalScore).toBe(usageScore(4n, 2n, 1n));
    });

    // A reader folding only the direct stream misses every batch-settled
    // trade, which is precisely the gap the bridge closes. The mirror must
    // report the SAME total the chain's `totalScoreIn` holds.
    it("sums the two paths as scores, never as components", () => {
        const period = computeUsageAccruals(
            [record(CLAUSE_A, "pj-0", sellerOf("s"))], // direct: c=1, d=1
            [batchRecord(CLAUSE_A, 1n, 1n)], // batch:  c=1, d=1
            1n,
        ).get(0)!;
        const entry = period.byClauseOrAssembly.get(CLAUSE_A)!;

        expect(entry.score).toBe(usageScore(1n, 1n, 1n) * 2n);
        expect(entry.score).toBeLessThanOrEqual(usageScore(2n, 2n, 1n));
        expect(period.totalScore).toBe(entry.score);
    });

    // Batch records carry CUMULATIVE values, so a later one replaces an
    // earlier one. Folding them as increments would double-count every batch
    // after the first.
    it("replaces rather than accumulates successive batch records", () => {
        const period = computeUsageAccruals(
            [],
            [
                batchRecord(CLAUSE_A, 2n, 1n, { blockNumber: 200n }),
                batchRecord(CLAUSE_A, 5n, 3n, { blockNumber: 201n }),
            ],
            1n,
        ).get(0)!;
        expect(period.byClauseOrAssembly.get(CLAUSE_A)!.batch).toEqual({ c: 5n, d: 3n, score: usageScore(5n, 3n, 1n) });
        expect(period.totalScore).toBe(usageScore(5n, 3n, 1n));
    });

    it("replays in (blockNumber, logIndex) order regardless of input order", () => {
        const repeat = sellerOf("seller1");
        const records = Array.from({ length: 7 }, (_, i) =>
            record(CLAUSE_A, `pi-${i}`, repeat, { blockNumber: BigInt(100 + i) }),
        );
        const forward = computeUsageAccruals(records, [], 1n).get(0)!;
        const reversed = computeUsageAccruals([...records].reverse(), [], 1n).get(0)!;
        expect(reversed.byClauseOrAssembly.get(CLAUSE_A)).toEqual(forward.byClauseOrAssembly.get(CLAUSE_A));
        expect(reversed.totalScore).toBe(forward.totalScore);
    });

    // ── The minimum-support floor (ruled 2026-07-31) ────────────────

    it("scores nothing below the floor, and the full score springs when it is crossed", () => {
        const below = computeUsageAccruals([
            record(CLAUSE_A, "pf-a", sellerOf("s1")),
            record(CLAUSE_A, "pf-b", sellerOf("s2")),
        ]); // default minSellers = 3 (the formula reference)
        expect(below.get(0)!.byClauseOrAssembly.get(CLAUSE_A)!.direct).toMatchObject({ c: 2n, d: 2n, score: 0n });
        expect(below.get(0)!.totalScore).toBe(0n);

        const crossed = computeUsageAccruals([
            record(CLAUSE_A, "pf-a", sellerOf("s1")),
            record(CLAUSE_A, "pf-b", sellerOf("s2")),
            record(CLAUSE_A, "pf-c", sellerOf("s3")),
        ]);
        expect(crossed.get(0)!.byClauseOrAssembly.get(CLAUSE_A)!.direct.score).toBe(usageScore(3n, 3n));
        expect(crossed.get(0)!.totalScore).toBe(usageScore(3n, 3n));
    });

    it("floors per settlement path — the universes never sum toward the floor", () => {
        // Two direct sellers + two batch sellers is four in total, but the
        // chain cannot union the sets, so neither path scores below 3 on its
        // own. Conservative by design, like the score merge itself.
        const period = computeUsageAccruals(
            [record(CLAUSE_A, "pp-a", sellerOf("s1")), record(CLAUSE_A, "pp-b", sellerOf("s2"))],
            [{ blockNumber: 200n, logIndex: 0, clauseOrAssembly: CLAUSE_A, period: 0, c: 2n, d: 2n, score: 0n }],
        ).get(0)!;
        expect(period.byClauseOrAssembly.get(CLAUSE_A)!.score).toBe(0n);
        expect(period.totalScore).toBe(0n);
    });
});

// ── The payout (RpgfMinter.claim, mirrored) ──────────────────────────

function periodOf(entries: Array<[Hex, bigint]>): UsagePeriodAccrual {
    const byClauseOrAssembly = new Map<Hex, ClauseOrAssemblyAccrual>();
    let totalScore = 0n;
    for (const [clauseOrAssembly, score] of entries) {
        byClauseOrAssembly.set(clauseOrAssembly, {
            direct: { c: 1n, d: 1n, score },
            batch: { c: 0n, d: 0n, score: 0n },
            score,
        });
        totalScore += score;
    }
    return { byClauseOrAssembly, totalScore };
}

describe("computeRpgfAllocations", () => {
    const authors = new Map<Hex, Address>([
        [CLAUSE_A, AUTHOR_A],
        [CLAUSE_B, AUTHOR_B],
        [ASSEMBLY, DESIGNER],
    ]);

    it("splits a period budget pro rata over the period's total score", () => {
        // Ten equal clauses or assemblies, ten authors: each takes 10%.
        const clausesOrAssemblies = Array.from(
            { length: 10 },
            (_, i) => `0x${(i + 1).toString(16).padStart(64, "0")}` as Hex,
        );
        const period = periodOf(clausesOrAssemblies.map((clauseOrAssembly) => [clauseOrAssembly, 100n] as [Hex, bigint]));
        const tenAuthors = new Map<Hex, Address>(
            clausesOrAssemblies.map((clauseOrAssembly, i) => [clauseOrAssembly, `0x${(i + 1).toString(16).padStart(40, "0")}` as Address]),
        );
        const out = computeRpgfAllocations(period, tenAuthors, 10_000n);
        expect(out.length).toBe(10);
        for (const allocation of out) {
            expect(allocation.amount).toBe(1_000n);
        }
    });

    it("sums a wallet's clauses and assemblies — clause and assembly families merge", () => {
        const period = periodOf([
            [CLAUSE_A, 50n],
            [ASSEMBLY, 50n],
            [CLAUSE_B, 900n],
        ]);
        const merged = new Map<Hex, Address>([
            [CLAUSE_A, AUTHOR_A],
            [ASSEMBLY, AUTHOR_A],
            [CLAUSE_B, AUTHOR_B],
        ]);
        const out = computeRpgfAllocations(period, merged, 1_000_000n);
        const a = out.find((x) => x.account === (AUTHOR_A.toLowerCase() as Address))!;
        // One wallet, two families — 100/1000 of the period budget.
        expect(a.score).toBe(100n);
        expect(a.amount).toBe(100_000n);
    });

    it("no cap — a dominant wallet takes its full pro-rata share", () => {
        // One dominant author takes 90% of the period budget; there is no ceiling.
        const period = periodOf([
            [CLAUSE_A, 900n],
            [CLAUSE_B, 100n],
        ]);
        const out = computeRpgfAllocations(period, authors, 1_000n);
        const byAccount = new Map(out.map((x) => [x.account, x]));
        expect(byAccount.get(AUTHOR_A.toLowerCase() as Address)!.amount).toBe(900n);
        expect(byAccount.get(AUTHOR_B.toLowerCase() as Address)!.amount).toBe(100n);
        const minted = out.reduce((sum, x) => sum + x.amount, 0n);
        expect(minted).toBe(1_000n); // the whole period budget is allocated
    });

    it("ignores clauses or assemblies with no author of record but keeps them in the denominator", () => {
        const period = periodOf([
            [CLAUSE_A, 100n],
            [CLAUSE_B, 900n],
        ]);
        const onlyA = new Map<Hex, Address>([[CLAUSE_A, AUTHOR_A]]);
        const out = computeRpgfAllocations(period, onlyA, 1_000_000n);
        // The unauthored clause or assembly's 900 stays in the denominator: A takes
        // 100/1000, not 100/100.
        expect(out).toEqual([
            { account: AUTHOR_A.toLowerCase() as Address, amount: 100_000n, score: 100n },
        ]);
    });

    it("returns nothing for a period with no score", () => {
        expect(computeRpgfAllocations({ byClauseOrAssembly: new Map(), totalScore: 0n }, authors, 1_000n)).toEqual([]);
    });

    it("floors dust rather than over-allocating", () => {
        const period = periodOf([
            [CLAUSE_A, 1n],
            [CLAUSE_B, 2n],
        ]);
        const out = computeRpgfAllocations(period, authors, 100n);
        const minted = out.reduce((sum, x) => sum + x.amount, 0n);
        expect(minted).toBeLessThanOrEqual(100n);
    });
});

// ── Usage claims (the batch path's input) ────────────────────────────

describe("buildUsageClaims", () => {
    const PROVENANCE = computeClauseKey("figaro-assembly-provenance", 1);
    const COMMERCE = computeClauseKey("figaro-commerce", 1);
    const COMPOSITION = keccak256(encodePacked(["string"], ["an-assembly"]));

    const order: Commitment = {
        processId: `0x${"0".repeat(64)}` as Hex,
        buyer: "0x0000000000000000000000000000000000000B0B" as Address,
        seller: "0x0000000000000000000000000000000000005E11" as Address,
        currency: "0x00000000000000000000000000000000000007ED" as Address,
        payment: 100n,
        expectedCumulativeValue: 100n,
        agreementHash: `0x${"a".repeat(64)}` as Hex,
        salt: 1n,
        deadline: 2n,
    };

    function agreementWith(sections: Agreement["sections"]): Agreement {
        return { version: "a1", buyer: order.buyer, seller: order.seller, sections };
    }

    const modalities = { clause: "figaro-modalities", version: 1, data: { modality: "pickup" } };
    const commerce = { clause: "figaro-commerce", version: 1, data: { payment: "100" } };
    const provenance = {
        clause: "figaro-assembly-provenance",
        version: 1,
        data: { compositionHash: COMPOSITION },
    };

    it("claims every section, and carries the section FINGERPRINT not the preimage", () => {
        const agreement = agreementWith([modalities, commerce]);
        const claims = buildUsageClaims(order, agreement, {
            provenanceClause: PROVENANCE,
            excludedClausesOrAssemblies: [],
        });

        expect(claims).toHaveLength(2);
        const modalityClaim = claims.find(
            (c) => c.clause_or_assembly === computeClauseKey("figaro-modalities", 1),
        )!;
        expect(modalityClaim.kind).toEqual({
            Clause: { section_hash: sectionDataHash(modalities) },
        });
        // Wire shape: snake_case, string-encoded bigints — what Rust deserializes.
        expect(modalityClaim.order.expected_cumulative_value).toBe("100");
        expect(modalityClaim.order.agreement_hash).toBe(order.agreementHash);
    });

    // Not an optimisation. `applyBatchAccrual` reverts `ClauseOrAssemblyExcluded` and
    // takes the ENTIRE batch with it — every other party's settlement included.
    it("drops excluded clauses or assemblies, because one would revert the whole batch", () => {
        const claims = buildUsageClaims(order, agreementWith([modalities, commerce]), {
            provenanceClause: PROVENANCE,
            excludedClausesOrAssemblies: [COMMERCE],
        });

        expect(claims.map((c) => c.clause_or_assembly)).toEqual([computeClauseKey("figaro-modalities", 1)]);
    });

    it("is case-insensitive about the excluded set", () => {
        const claims = buildUsageClaims(order, agreementWith([commerce]), {
            provenanceClause: PROVENANCE,
            excludedClausesOrAssemblies: [COMMERCE.toUpperCase() as Hex],
        });
        expect(claims).toHaveLength(0);
    });

    // THE REGRESSION THAT COST THE DESIGNER HALF OF THE 600M. The provenance
    // clause is itself excluded — it rides every assembly-composed process — so
    // the section carrying the compositionHash is exactly the one the clause leg
    // discards. The assembly claim must survive that.
    it("still credits the DESIGNER when the provenance clause is excluded", () => {
        const claims = buildUsageClaims(
            order,
            agreementWith([modalities, commerce, provenance]),
            { provenanceClause: PROVENANCE, excludedClausesOrAssemblies: [COMMERCE, PROVENANCE] },
        );

        const assembly = claims.find((c) => c.kind === "Assembly");
        expect(assembly, "the assembly leg must not be coupled to the clause leg").toBeDefined();
        expect(assembly!.clause_or_assembly).toBe(COMPOSITION);
        // And it credits the compositionHash — never the provenance clause key.
        expect(claims.map((c) => c.clause_or_assembly)).not.toContain(PROVENANCE);
    });

    it("emits no assembly claim when the process ran under no assembly", () => {
        const claims = buildUsageClaims(order, agreementWith([modalities]), {
            provenanceClause: PROVENANCE,
            excludedClausesOrAssemblies: [],
        });
        expect(claims.some((c) => c.kind === "Assembly")).toBe(false);
    });

    // A content-withheld provenance section carries only `dataHash`, so the
    // compositionHash cannot be recovered. Skip the designer credit; do NOT
    // throw — the clause claims are still valid and the batch must still settle.
    it("skips the assembly leg when provenance content is withheld, without failing the rest", () => {
        const withheld = {
            clause: "figaro-assembly-provenance",
            version: 1,
            dataHash: sectionDataHash(provenance),
        };
        const claims = buildUsageClaims(order, agreementWith([modalities, withheld]), {
            provenanceClause: PROVENANCE,
            excludedClausesOrAssemblies: [PROVENANCE],
        });

        expect(claims.some((c) => c.kind === "Assembly")).toBe(false);
        expect(claims).toHaveLength(1);
        expect(claims[0].clause_or_assembly).toBe(computeClauseKey("figaro-modalities", 1));
    });

    it("produces inclusion proofs that verify against the signed agreement hash", () => {
        const agreement = agreementWith([modalities, commerce, provenance]);
        const root = computeAgreementHash(agreement);
        const claims = buildUsageClaims(order, agreement, {
            provenanceClause: PROVENANCE,
            excludedClausesOrAssemblies: [],
        });

        for (const claim of claims) {
            const section =
                claim.kind === "Assembly"
                    ? provenance
                    : agreement.sections.find(
                          (s) => computeClauseKey(s.clause, s.version) === claim.clause_or_assembly,
                      )!;
            expect(
                verifyInclusionProof(root, computeSectionLeaf(section), claim.inclusion_proof),
                `proof for ${claim.clause_or_assembly}`,
            ).toBe(true);
        }
    });
});

describe("fetchUsageRecords / fetchBatchUsageRecords — chunked getLogs", () => {
    const USAGE_COUNTER = "0x000000000000000000000000000000000000f00d" as Address;

    /** A stub client whose `getLogs` always answers empty — only the chunking
     *  of the calls themselves is under test; decoding is covered elsewhere. */
    function mockClient(): PublicClient {
        const getLogs = vi.fn(async () => [] as Log[]);
        return { getLogs } as unknown as PublicClient;
    }

    it("fetchUsageRecords threads a custom chunkSize through to getLogs", async () => {
        const client = mockClient();
        await fetchUsageRecords(client, USAGE_COUNTER, 25n, 10n);
        expect(client.getLogs).toHaveBeenCalledTimes(3);
        expect(client.getLogs).toHaveBeenNthCalledWith(1, { address: USAGE_COUNTER, fromBlock: 0n, toBlock: 9n });
        expect(client.getLogs).toHaveBeenNthCalledWith(2, { address: USAGE_COUNTER, fromBlock: 10n, toBlock: 19n });
        expect(client.getLogs).toHaveBeenNthCalledWith(3, { address: USAGE_COUNTER, fromBlock: 20n, toBlock: 25n });
    });

    it("fetchUsageRecords defaults to DEFAULT_LOG_CHUNK_SIZE, issuing one call on a devnet-sized range", async () => {
        const client = mockClient();
        await fetchUsageRecords(client, USAGE_COUNTER, 100n);
        expect(client.getLogs).toHaveBeenCalledTimes(1);
        expect(client.getLogs).toHaveBeenCalledWith({ address: USAGE_COUNTER, fromBlock: 0n, toBlock: 100n });
    });

    it("fetchBatchUsageRecords threads a custom chunkSize through to getLogs", async () => {
        const client = mockClient();
        await fetchBatchUsageRecords(client, USAGE_COUNTER, 25n, 10n);
        expect(client.getLogs).toHaveBeenCalledTimes(3);
    });

    it("fetchBatchUsageRecords defaults to DEFAULT_LOG_CHUNK_SIZE, issuing one call on a devnet-sized range", async () => {
        const client = mockClient();
        await fetchBatchUsageRecords(client, USAGE_COUNTER, 100n);
        expect(client.getLogs).toHaveBeenCalledTimes(1);
    });
});

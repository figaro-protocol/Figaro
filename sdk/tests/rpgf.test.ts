import { describe, expect, it, vi } from "vitest";
import { concatHex, encodeAbiParameters, encodeEventTopics, encodePacked, getAddress, keccak256, type Address, type Hex, type Log, type PublicClient } from "viem";
import {
    computeRpgfAllocations,
    computeUsageAccruals,
    icbrt,
    usageScore,
    RPGF_SCORE_SCALE,
    RPGF_MIN_SELLERS,
    type UsagePeriodAccrual,
    type ClauseOrProcessAccrual,
    type UsageRecord,
    type UsageKind,
    USAGE_KIND_CLAUSE,
    USAGE_KIND_PROCESS,
    USAGE_KIND_AGREEMENT,
    usageKeyId,
    usageClaimKindCode,
    buildUsageClaims,
    fetchUsageRecords,
    fetchSkippedBatchUses,
} from "../src/rpgf/index.js";
import { BATCH_VERIFIER_ABI } from "../src/abis.js";
import {
    PROVENANCE_LEAF_KEY,
    computeCheckoutHash,
    computeProvenanceLeaf,
    computeClauseLeaf,
    hashClauseData,
    verifyInclusionProof,
    type Agreement,
} from "../src/agreement.js";
import type { Commitment } from "../src/types.js";
import type { SequencerUsageClaim } from "../src/agent/sequencer.js";
import { computeCommitmentProcessId } from "../src/commitments.js";
import { FIRST, PROCESS, SECOND, attestEntry, claimEntry, commitEntry, rep, resolveEntry } from "./operationStreamWriter.js";
import {
    PROCESS_LEAF_DOMAIN,
    computeProcessLeaf,
    PROCESS_TERMS_LEAF_KEY,
    buildAgreementInclusionProof,
    processDesignHashOf,
    type ProcessDesign,
} from "../src/assembly.js";
import { keyOf } from "./specFixtures.js";

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

// The floor a test passes as the deployment's UsageCounter.minSellers().
const FLOOR = 3n;

describe("usageScore", () => {
    it("is zero without both a process and a seller", () => {
        expect(usageScore(0n, 3n, FLOOR)).toBe(0n);
        expect(usageScore(3n, 0n, 1n)).toBe(0n);
    });

    it("weights breadth twice as heavily as volume", () => {
        // c^(1/3) * d^(2/3): doubling d must beat doubling c.
        const moreProcesses = usageScore(6n, 3n, FLOOR);
        const moreSellers = usageScore(3n, 6n, FLOOR);
        expect(moreSellers).toBeGreaterThan(moreProcesses);
    });

    it("is uniform — equal (c, d) gives equal score for any clause or assembly (no weight)", () => {
        expect(usageScore(5n, 3n, FLOOR)).toBe(usageScore(5n, 3n, FLOOR));
        expect(usageScore(1n, 1n, 1n)).toBe(10n ** 6n); // icbrt(1e18), floor disabled
    });

    it("takes the floor from the caller (the chain's UsageCounter.minSellers), never a bundled default", () => {
        const noFloor = undefined as unknown as bigint;
        expect(() => usageScore(10n, 2n, noFloor)).toThrow(/minSellers/);
        expect(() => computeUsageAccruals([record(CLAUSE_A, "p1", sellerOf("seller1"))], noFloor)).toThrow(/minSellers/);
    });

    it("floors below minSellers — the minimum-support floor", () => {
        // Below the floor nothing scores; at it the FULL score springs —
        // deferred, never lost. The formula's reference floor is 3.
        expect(RPGF_MIN_SELLERS).toBe(3n);
        expect(usageScore(10n, 2n, FLOOR)).toBe(0n);
        expect(usageScore(10n, 3n, FLOOR)).toBe(icbrt(90n * RPGF_SCORE_SCALE));
        // A deployment with the floor disabled mirrors via the parameter.
        expect(usageScore(10n, 2n, 1n)).toBeGreaterThan(0n);
    });
});

// ── The counter's counting rules ─────────────────────────────────────

const CLAUSE_A = "0x00000000000000000000000000000000000000000000000000000000000000a1" as Hex;
const CLAUSE_B = "0x00000000000000000000000000000000000000000000000000000000000000b2" as Hex;
const ASSEMBLY = "0x00000000000000000000000000000000000000000000000000000000000000c3" as Hex;
/** The fixtures' kind: ASSEMBLY is an assembly key, every other a clause key. */
const kindOf = (key: Hex): UsageKind => (key === ASSEMBLY ? USAGE_KIND_PROCESS : USAGE_KIND_CLAUSE);
/** The mirror's map key for a fixture key under its own kind. */
const id = (key: Hex): string => usageKeyId(kindOf(key), key);

const AUTHOR_A = "0x1000000000000000000000000000000000000001" as Address;
const AUTHOR_B = "0x2000000000000000000000000000000000000002" as Address;
const DESIGNER = "0x3000000000000000000000000000000000000003" as Address;

const seed = (s: string): Hex => `0x${Buffer.from(s).toString("hex").padEnd(64, "0").slice(0, 64)}` as Hex;
/** A deterministic seller address from a label — the priced identity breadth counts. */
const sellerOf = (s: string): Address => `0x${keccak256(encodePacked(["string"], [s])).slice(26)}` as Address;

let logCounter = 0;
function record(
    clauseOrProcess: Hex,
    processId: string,
    seller: Address,
    overrides: Partial<UsageRecord> = {},
): UsageRecord {
    // c/d/score on the event are the chain's own running values; the mirror
    // recomputes them, so the fixtures leave them at zero unless a test cares.
    return {
        blockNumber: 100n,
        logIndex: logCounter++,
        kind: kindOf(clauseOrProcess),
        clauseOrProcess,
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
        ], 1n);
        const period = accruals.get(0)!;
        expect(period.byClauseOrProcess.get(id(CLAUSE_A))!).toMatchObject({ c: 2n, d: 2n });
        expect(period.byClauseOrProcess.get(id(CLAUSE_B))!).toMatchObject({ c: 1n, d: 1n });
        expect(period.totalScore).toBe(usageScore(2n, 2n, 1n) + usageScore(1n, 1n, 1n));
    });

    it("many buyers through one seller are volume, never breadth", () => {
        // The exact shape a farmer fabricates for free — buyer wallets cost
        // nothing. Breadth follows the priced identity: one seller, d = 1,
        // however many buyers arrive. (The old pair statistic gave d = N here.)
        const s1 = sellerOf("seller1");
        const accruals = computeUsageAccruals([
            record(CLAUSE_A, "q1", s1),
            record(CLAUSE_A, "q2", s1),
            record(CLAUSE_A, "q3", s1),
        ], 1n);
        expect(accruals.get(0)!.byClauseOrProcess.get(id(CLAUSE_A))!).toMatchObject({ c: 3n, d: 1n });
    });

    it("is idempotent per (clause or assembly, process) — a replay adds nothing", () => {
        const s1 = sellerOf("seller1");
        const once = computeUsageAccruals([record(CLAUSE_A, "p1", s1)], 1n);
        const twice = computeUsageAccruals([record(CLAUSE_A, "p1", s1), record(CLAUSE_A, "p1", s1)], 1n);
        expect(twice.get(0)!.byClauseOrProcess.get(id(CLAUSE_A))).toEqual(once.get(0)!.byClauseOrProcess.get(id(CLAUSE_A)));
    });

    it("counts a process ONCE EVER — re-recording it in a later period adds nothing", () => {
        // Global idempotence: a resolved order stays resolved
        // and its struct is public, so a per-period key would let the same trade
        // be re-presented every period — paying for recording gas, not adoption.
        const s1 = sellerOf("seller1");
        const accruals = computeUsageAccruals([
            record(CLAUSE_A, "px-0", s1, { period: 0 }),
            record(CLAUSE_A, "px-0", s1, { period: 1 }),
        ], 1n);
        expect(accruals.get(0)!.byClauseOrProcess.get(id(CLAUSE_A))!).toMatchObject({ c: 1n, d: 1n });
        expect(accruals.get(1)?.byClauseOrProcess.get(id(CLAUSE_A))).toBeUndefined();
    });

    it("a later period counts only trade that is NEW to it", () => {
        const accruals = computeUsageAccruals([
            record(CLAUSE_A, "py-old", sellerOf("seller1"), { period: 0 }),
            record(CLAUSE_A, "py-old", sellerOf("seller1"), { period: 1 }),
            record(CLAUSE_A, "py-new", sellerOf("seller2"), { period: 1 }),
        ], 1n);
        expect(accruals.get(1)!.byClauseOrProcess.get(id(CLAUSE_A))!).toMatchObject({ c: 1n, d: 1n });
    });

    it("counts every repeat process into c, but a seller is one unit of d", () => {
        // Repetition is discounted by the exponent, never refused: one seller
        // carrying many trades adds volume under c^(1/3).
        const repeat = sellerOf("seller1");
        const accruals = computeUsageAccruals(
            Array.from({ length: 8 }, (_, i) => record(CLAUSE_A, `pc-${i}`, repeat)),
            1n,
        );
        expect(accruals.get(0)!.byClauseOrProcess.get(id(CLAUSE_A))!).toMatchObject({
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
        ], 1n);
        expect(accruals.get(0)!.byClauseOrProcess.get(id(CLAUSE_A))!).toMatchObject({
            c: 8n,
            d: 2n,
        });
    });

    it("buckets accrual by period — the same seller starts over in the next one", () => {
        const s1 = sellerOf("seller1");
        const accruals = computeUsageAccruals([
            record(CLAUSE_A, "pf-0", s1, { period: 0 }),
            record(CLAUSE_A, "pf-1", s1, { period: 1 }),
        ], 1n);
        expect(accruals.get(0)!.byClauseOrProcess.get(id(CLAUSE_A))!).toMatchObject({ c: 1n, d: 1n });
        expect(accruals.get(1)!.byClauseOrProcess.get(id(CLAUSE_A))!).toMatchObject({ c: 1n, d: 1n });
    });

    it("scores uniformly — equal usage gives equal score, clause or assembly", () => {
        const accruals = computeUsageAccruals(
            [record(CLAUSE_A, "pg-0", sellerOf("s")), record(CLAUSE_B, "pg-0", sellerOf("s"))],
            1n,
        );
        const period = accruals.get(0)!;
        expect(period.byClauseOrProcess.get(id(CLAUSE_A))!.score).toBe(period.byClauseOrProcess.get(id(CLAUSE_B))!.score);
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
        const accrual = computeUsageAccruals(emitted, 1n).get(0)!.byClauseOrProcess.get(id(CLAUSE_A))!;
        const last = emitted[emitted.length - 1];
        expect(accrual).toMatchObject({ c: last.c, d: last.d, score: last.score });
    });

    // ── One tally, route-blind ──────────────────────────────────────
    // A direct call and a proved batch both emit `UsageRecorded`; the mirror
    // folds one stream into one tally, as `accrualOf` holds it.

    it("folds a use from either route into one tally — one seller on both is one unit of d", () => {
        const s1 = sellerOf("seller1");
        const period = computeUsageAccruals(
            [
                record(CLAUSE_A, "pj-direct", s1, { blockNumber: 100n }),
                record(CLAUSE_A, "pj-batch", s1, { blockNumber: 200n }),
            ],
            1n,
        ).get(0)!;
        const entry = period.byClauseOrProcess.get(id(CLAUSE_A))!;
        expect(entry).toMatchObject({ c: 2n, d: 1n, score: usageScore(2n, 1n, 1n) });
        expect(period.totalScore).toBe(entry.score);
    });

    it("replays in (blockNumber, logIndex) order regardless of input order", () => {
        const repeat = sellerOf("seller1");
        const records = Array.from({ length: 7 }, (_, i) =>
            record(CLAUSE_A, `pi-${i}`, repeat, { blockNumber: BigInt(100 + i) }),
        );
        const forward = computeUsageAccruals(records, 1n).get(0)!;
        const reversed = computeUsageAccruals([...records].reverse(), 1n).get(0)!;
        expect(reversed.byClauseOrProcess.get(id(CLAUSE_A))).toEqual(forward.byClauseOrProcess.get(id(CLAUSE_A)));
        expect(reversed.totalScore).toBe(forward.totalScore);
    });

    // ── The minimum-support floor ───────────────────────────────────

    it("scores nothing below the floor, and the full score springs when it is crossed", () => {
        const below = computeUsageAccruals([
            record(CLAUSE_A, "pf-a", sellerOf("s1")),
            record(CLAUSE_A, "pf-b", sellerOf("s2")),
        ], FLOOR);
        expect(below.get(0)!.byClauseOrProcess.get(id(CLAUSE_A))!).toMatchObject({ c: 2n, d: 2n, score: 0n });
        expect(below.get(0)!.totalScore).toBe(0n);

        const crossed = computeUsageAccruals([
            record(CLAUSE_A, "pf-a", sellerOf("s1")),
            record(CLAUSE_A, "pf-b", sellerOf("s2")),
            record(CLAUSE_A, "pf-c", sellerOf("s3")),
        ], FLOOR);
        expect(crossed.get(0)!.byClauseOrProcess.get(id(CLAUSE_A))!.score).toBe(usageScore(3n, 3n, FLOOR));
        expect(crossed.get(0)!.totalScore).toBe(usageScore(3n, 3n, FLOOR));
    });

    it("meets the floor with sellers from either route — one tally, one seller set", () => {
        const period = computeUsageAccruals([
            record(CLAUSE_A, "pp-a", sellerOf("s1")),
            record(CLAUSE_A, "pp-b", sellerOf("s2")),
            record(CLAUSE_A, "pp-c", sellerOf("s3"), { blockNumber: 200n }),
        ], FLOOR).get(0)!;
        expect(period.byClauseOrProcess.get(id(CLAUSE_A))!.score).toBe(usageScore(3n, 3n, FLOOR));
        expect(period.totalScore).toBe(usageScore(3n, 3n, FLOOR));
    });
});

// ── The payout (RpgfMinter.claim, mirrored) ──────────────────────────

function periodOf(entries: Array<[Hex, bigint]>): UsagePeriodAccrual {
    const byClauseOrProcess = new Map<string, ClauseOrProcessAccrual>();
    let totalScore = 0n;
    for (const [clauseOrProcess, score] of entries) {
        byClauseOrProcess.set(id(clauseOrProcess), {
            kind: kindOf(clauseOrProcess),
            clauseOrProcess,
            c: 1n,
            d: 1n,
            score,
        });
        totalScore += score;
    }
    return { byClauseOrProcess, totalScore };
}

describe("computeRpgfAllocations", () => {
    const authors = new Map<string, Address>([
        [id(CLAUSE_A), AUTHOR_A],
        [id(CLAUSE_B), AUTHOR_B],
        [id(ASSEMBLY), DESIGNER],
    ]);

    it("splits a period budget pro rata over the period's total score", () => {
        // Ten equal clauses or assemblies, ten authors: each takes 10%.
        const clausesOrProcesses = Array.from(
            { length: 10 },
            (_, i) => `0x${(i + 1).toString(16).padStart(64, "0")}` as Hex,
        );
        const period = periodOf(clausesOrProcesses.map((clauseOrProcess) => [clauseOrProcess, 100n] as [Hex, bigint]));
        const tenAuthors = new Map<string, Address>(
            clausesOrProcesses.map((clauseOrProcess, i) => [id(clauseOrProcess), `0x${(i + 1).toString(16).padStart(40, "0")}` as Address]),
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
        const merged = new Map<string, Address>([
            [id(CLAUSE_A), AUTHOR_A],
            [id(ASSEMBLY), AUTHOR_A],
            [id(CLAUSE_B), AUTHOR_B],
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
        const onlyA = new Map<string, Address>([[id(CLAUSE_A), AUTHOR_A]]);
        const out = computeRpgfAllocations(period, onlyA, 1_000_000n);
        // The unauthored clause or assembly's 900 stays in the denominator: A takes
        // 100/1000, not 100/100.
        expect(out).toEqual([
            {
                account: AUTHOR_A.toLowerCase() as Address, amount: 100_000n, score: 100n,
                claims: [{ kind: USAGE_KIND_CLAUSE, key: CLAUSE_A }],
            },
        ]);
    });

    it("keeps the two families apart: the same bytes under each kind are two accruals, each paid to its own author", () => {
        // A registry accepts any bytes32, so a stranger can register an
        // assembly's assembly hash as a clause key. The accrual is keyed by
        // (kind, key), so the squatter's clause earns only what its own kind
        // accrued, and the assembly's designer keeps the assembly's score.
        const SQUATTER = "0x4000000000000000000000000000000000000004" as Address;
        const accruals = computeUsageAccruals([
            record(ASSEMBLY, "asm-1", sellerOf("s1")),
            record(ASSEMBLY, "asm-2", sellerOf("s2")),
            { ...record(ASSEMBLY, "clause-1", sellerOf("s1")), kind: USAGE_KIND_CLAUSE },
        ], 1n).get(0)!;
        const asAssembly = accruals.byClauseOrProcess.get(usageKeyId(USAGE_KIND_PROCESS, ASSEMBLY))!;
        const asClause = accruals.byClauseOrProcess.get(usageKeyId(USAGE_KIND_CLAUSE, ASSEMBLY))!;
        expect(asAssembly).toMatchObject({ c: 2n, d: 2n });
        expect(asClause).toMatchObject({ c: 1n, d: 1n });
        const out = computeRpgfAllocations(accruals, new Map([
            [usageKeyId(USAGE_KIND_PROCESS, ASSEMBLY), DESIGNER],
            [usageKeyId(USAGE_KIND_CLAUSE, ASSEMBLY), SQUATTER],
        ]), 1_000_000n);
        const byAccount = new Map(out.map((x) => [x.account, x]));
        expect(byAccount.get(DESIGNER.toLowerCase() as Address)!.score).toBe(asAssembly.score);
        expect(byAccount.get(DESIGNER.toLowerCase() as Address)!.claims).toEqual([{ kind: USAGE_KIND_PROCESS, key: ASSEMBLY }]);
        expect(byAccount.get(SQUATTER.toLowerCase() as Address)!.score).toBe(asClause.score);
        expect(asClause.score).toBeLessThan(asAssembly.score);
    });

    it("keeps the agreement family apart too: the same bytes under kind 2 are a third accrual", () => {
        const AGREEMENT_DESIGNER = "0x5000000000000000000000000000000000000005" as Address;
        const accruals = computeUsageAccruals([
            record(ASSEMBLY, "asm-1", sellerOf("s1")),
            { ...record(ASSEMBLY, "asm-1", sellerOf("s1")), kind: USAGE_KIND_AGREEMENT },
            { ...record(ASSEMBLY, "agr-2", sellerOf("s2")), kind: USAGE_KIND_AGREEMENT },
        ], 1n).get(0)!;
        const asAgreement = accruals.byClauseOrProcess.get(usageKeyId(USAGE_KIND_AGREEMENT, ASSEMBLY))!;
        const asAssembly = accruals.byClauseOrProcess.get(usageKeyId(USAGE_KIND_PROCESS, ASSEMBLY))!;
        // The same process counts once per (kind, key), so kind 2 counts it beside kind 1.
        expect(asAssembly).toMatchObject({ c: 1n, d: 1n });
        expect(asAgreement).toMatchObject({ c: 2n, d: 2n });
        const out = computeRpgfAllocations(accruals, new Map([
            [usageKeyId(USAGE_KIND_AGREEMENT, ASSEMBLY), AGREEMENT_DESIGNER],
        ]), 1_000_000n);
        expect(out.map((x) => x.claims)).toEqual([[{ kind: USAGE_KIND_AGREEMENT, key: ASSEMBLY }]]);
    });

    it("returns nothing for a period with no score", () => {
        expect(computeRpgfAllocations({ byClauseOrProcess: new Map(), totalScore: 0n }, authors, 1_000n)).toEqual([]);
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
    /** What `UsageCounter.provenanceLeaf()` / `processTermsLeaf()` answer: the formats' reserved keys. */
    const CONTEXT = { provenanceLeaf: PROVENANCE_LEAF_KEY, processTermsLeaf: PROCESS_TERMS_LEAF_KEY, processLeafDomain: PROCESS_LEAF_DOMAIN };
    const AGREEMENT_HASH = keccak256(encodePacked(["string"], ["an-agreement"]));
    const OTHER_KEY = keccak256(encodePacked(["string"], ["another-agreement"]));
    const ASSEMBLY: ProcessDesign = {
        agreements: [
            { id: "agreement-0", agreementHash: OTHER_KEY, clauses: {} },
            { id: "agreement-1", agreementHash: AGREEMENT_HASH, clauses: {} },
        ],
    };
    const COMPOSITION = processDesignHashOf(ASSEMBLY);
    const PROVENANCE = { agreementHash: AGREEMENT_HASH, processDesignHash: COMPOSITION };

    const order: Commitment = {
        processId: `0x${"0".repeat(64)}` as Hex,
        buyer: "0x0000000000000000000000000000000000000B0B" as Address,
        seller: "0x0000000000000000000000000000000000005E11" as Address,
        token: "0x00000000000000000000000000000000000007ED" as Address,
        payment: 100n,
        runningTotal: 100n,
        checkoutHash: `0x${"a".repeat(64)}` as Hex,
        salt: 1n,
        commitDeadline: 2n,
    };

    function agreementWith(clauseEntries: Agreement["clauses"], provenance?: Agreement["provenance"]): Agreement {
        return { version: "a1", buyer: order.buyer, seller: order.seller, clauses: clauseEntries, ...(provenance ? { provenance } : {}) };
    }

    const modalities = { clause: keyOf("figaro-modalities"), data: { modality: "pickup" } };
    const commerce = {
        clause: keyOf("figaro-commerce"),
        data: { payment: "100", currency: order.token, lineItems: [] },
    };

    it("claims every clauseEntry, and carries the clause FINGERPRINT not the preimage", () => {
        const agreement = agreementWith([modalities, commerce]);
        const claims = buildUsageClaims(order, agreement, CONTEXT);

        expect(claims).toHaveLength(2);
        const modalityClaim = claims.find(
            (c) => c.clause_or_process === keyOf("figaro-modalities"),
        )!;
        expect(modalityClaim.kind).toEqual({
            Clause: { clause_data_hash: hashClauseData(modalities) },
        });
        expect(usageClaimKindCode(modalityClaim)).toBe(USAGE_KIND_CLAUSE);
        // Wire shape: snake_case, string-encoded bigints — what Rust deserializes.
        expect(modalityClaim.order.running_total).toBe("100");
        expect(modalityClaim.order.checkout_hash).toBe(order.checkoutHash);
    });

    // The two designer credits ride the agreement format's provenance leaf,
    // not a clauseEntry: every clause still earns its clause leg, the agreement
    // leg credits the agreement hash, and the assembly leg credits the
    // processDesignHash with the agreement's membership proof — never the
    // reserved leaf key.
    it("credits the agreement's and the assembly's designers from agreement.provenance beside every clause leg", () => {
        const claims = buildUsageClaims(order, agreementWith([modalities, commerce], PROVENANCE), CONTEXT, ASSEMBLY);

        expect(claims.filter((c) => "Clause" in c.kind)).toHaveLength(2);
        const agreementClaim = claims.find((c) => "Agreement" in c.kind)!;
        expect(agreementClaim.clause_or_process).toBe(AGREEMENT_HASH);
        expect(agreementClaim.kind).toEqual({ Agreement: { process_design_hash: COMPOSITION } });
        expect(usageClaimKindCode(agreementClaim)).toBe(USAGE_KIND_AGREEMENT);
        const assemblyClaim = claims.find((c) => "Process" in c.kind)!;
        expect(assemblyClaim.clause_or_process).toBe(COMPOSITION);
        expect(usageClaimKindCode(assemblyClaim)).toBe(USAGE_KIND_PROCESS);
        const membership = buildAgreementInclusionProof(ASSEMBLY, 1);
        expect(assemblyClaim.kind).toEqual({
            Process: { agreement_hash: AGREEMENT_HASH, agreement_content_hash: membership.agreementContentHash, membership_proof: membership.proof },
        });
        expect(claims.map((c) => c.clause_or_process)).not.toContain(PROVENANCE_LEAF_KEY);
    });

    it("the assembly claim's membership proof verifies under its processDesignHash and under no other root", () => {
        const claims = buildUsageClaims(order, agreementWith([modalities], PROVENANCE), CONTEXT, ASSEMBLY);
        const assembly = claims.find((c) => "Process" in c.kind)!;
        const { agreement_hash, agreement_content_hash, membership_proof } = (assembly.kind as {
            Process: { agreement_hash: Hex; agreement_content_hash: Hex; membership_proof: Hex[] };
        }).Process;
        const leaf = computeProcessLeaf(agreement_hash, agreement_content_hash);
        expect(verifyInclusionProof(COMPOSITION, leaf, membership_proof)).toBe(true);
        const other = processDesignHashOf({ agreements: [...ASSEMBLY.agreements].reverse() });
        expect(verifyInclusionProof(other, leaf, membership_proof)).toBe(false);
    });

    it("emits no agreement or assembly claim when the agreement names no provenance", () => {
        const claims = buildUsageClaims(order, agreementWith([modalities]), CONTEXT);
        expect(claims.every((c) => "Clause" in c.kind)).toBe(true);
    });

    it("refuses a provenance it cannot prove: no assembly, another assembly, or no agreement binding the key", () => {
        const agreement = agreementWith([modalities], PROVENANCE);
        expect(() => buildUsageClaims(order, agreement, CONTEXT)).toThrow(/assembly is needed/);
        expect(() => buildUsageClaims(order, agreement, CONTEXT, { agreements: [ASSEMBLY.agreements[1]] }))
            .toThrow(/does not hash to the provenance/);
        const elsewhere = agreementWith([modalities], { agreementHash: keccak256(encodePacked(["string"], ["x"])), processDesignHash: COMPOSITION });
        expect(() => buildUsageClaims(order, elsewhere, CONTEXT, ASSEMBLY)).toThrow(/no agreement/);
    });

    it("refuses a reserved key as the provenance's agreement hash", () => {
        for (const reserved of [PROVENANCE_LEAF_KEY, PROCESS_TERMS_LEAF_KEY]) {
            const agreement = agreementWith([modalities], { agreementHash: reserved, processDesignHash: COMPOSITION });
            expect(() => buildUsageClaims(order, agreement, CONTEXT, ASSEMBLY)).toThrow(/reserved format key/);
        }
    });

    // A counter reproducing a different leaf would revert every agreement and
    // assembly claim and, on the batch path, the whole batch with it.
    it("refuses a counter whose reserved keys are not the formats'", () => {
        expect(() => buildUsageClaims(order, agreementWith([modalities], PROVENANCE), {
            ...CONTEXT, provenanceLeaf: keyOf("figaro-modalities"),
        }, ASSEMBLY)).toThrow(/provenance leaf/);
        expect(() => buildUsageClaims(order, agreementWith([modalities]), {
            ...CONTEXT, processTermsLeaf: keyOf("figaro-modalities"),
        })).toThrow(/assembly-terms leaf/);
        expect(() => buildUsageClaims(order, agreementWith([modalities]), {
            ...CONTEXT, processLeafDomain: keyOf("figaro-modalities"),
        })).toThrow(/assembly leaf domain/);
        // Case does not matter.
        expect(buildUsageClaims(order, agreementWith([modalities], PROVENANCE), {
            ...CONTEXT, provenanceLeaf: PROVENANCE_LEAF_KEY.toUpperCase().replace("0X", "0x") as Hex,
        }, ASSEMBLY).some((c) => "Process" in c.kind)).toBe(true);
    });

    it("produces inclusion proofs that verify against the signed checkout hash", () => {
        const agreement = agreementWith([modalities, commerce], PROVENANCE);
        const root = computeCheckoutHash(agreement);
        const claims = buildUsageClaims(order, agreement, CONTEXT, ASSEMBLY);

        expect(claims).toHaveLength(4);
        for (const claim of claims) {
            const leaf =
                "Clause" in claim.kind
                    ? computeClauseLeaf(agreement.clauses.find((s) => s.clause === claim.clause_or_process)!)
                    : computeProvenanceLeaf(AGREEMENT_HASH, COMPOSITION);
            expect(
                verifyInclusionProof(root, leaf, claim.inclusion_proof),
                `proof for ${claim.clause_or_process}`,
            ).toBe(true);
        }
    });
});

describe("fetchUsageRecords — chunked getLogs", () => {
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

});

describe("fetchSkippedBatchUses — the uses a batch carried and the counter counted none of", () => {
    const VERIFIER = getAddress("0x000000000000000000000000000000000000b47c");
    const CHAIN_ID = 11155111;
    const SKIP_TX = `0x${"11".repeat(32)}` as Hex;
    const ROUTED_TX = `0x${"22".repeat(32)}` as Hex;
    const LANDED_TX = `0x${"33".repeat(32)}` as Hex;
    /** Revert data as the verifier catches it; the reader passes it through unread. */
    const REASON = `0x5f5b1b0c${"00".repeat(31)}01${"00".repeat(32)}` as Hex;
    const CLAUSE_CLAIM: SequencerUsageClaim = {
        order: FIRST,
        clause_or_process: rep("80", 32),
        kind: { Clause: { clause_data_hash: rep("81", 32) } },
        inclusion_proof: [rep("82", 32)],
    };
    const ASSEMBLY_CLAIM: SequencerUsageClaim = {
        order: SECOND,
        clause_or_process: rep("90", 32),
        kind: { Process: { agreement_hash: rep("91", 32), agreement_content_hash: rep("92", 32), membership_proof: [rep("93", 32)] } },
        inclusion_proof: [],
    };
    /** Commits, a resolve, a wallet-code attestation, then the claims: the
     *  order the guest writes them in (operation_stream.rs:62). */
    const STREAM = concatHex([
        commitEntry(FIRST), commitEntry(SECOND), resolveEntry(PROCESS, [FIRST, SECOND]),
        attestEntry(0, FIRST, "0x"), claimEntry(CLAUSE_CLAIM), claimEntry(ASSEMBLY_CLAIM),
    ]);

    function skippedLog(batchId: bigint, tx: Hex, block: bigint, logIndex = 0): Log {
        return {
            address: VERIFIER,
            topics: encodeEventTopics({ abi: BATCH_VERIFIER_ABI, eventName: "BatchAccrualSkipped", args: { batchId } }),
            data: encodeAbiParameters([{ type: "bytes" }], [REASON]),
            blockNumber: block,
            transactionHash: tx,
            logIndex,
        } as unknown as Log;
    }
    function operationsLog(batchId: bigint, tx: Hex, block: bigint, operations: Hex, period = 3, logIndex = 1): Log {
        return {
            address: VERIFIER,
            topics: encodeEventTopics({ abi: BATCH_VERIFIER_ABI, eventName: "BatchOperations", args: { batchId } }),
            data: encodeAbiParameters(
                [{ type: "uint64" }, { type: "uint8" }, { type: "bytes32" }, { type: "bytes" }],
                [1_700_000_000n, period, PROVENANCE_LEAF_KEY, operations],
            ),
            blockNumber: block,
            transactionHash: tx,
            logIndex,
        } as unknown as Log;
    }
    /** A node that answers every log query with `logs`, and fails any
     *  transaction read: the reader needs none. */
    function stubClient(logs: Log[]): PublicClient {
        return {
            getLogs: vi.fn(async () => logs),
            getChainId: vi.fn(async () => CHAIN_ID),
            getTransaction: vi.fn(async () => { throw new Error("no transaction read is expected"); }),
        } as unknown as PublicClient;
    }
    const usesOf = (claims: SequencerUsageClaim[], processIds: Hex[]) =>
        claims.map((c, i) => ({ clauseOrProcess: c.clause_or_process, kind: usageClaimKindCode(c), processId: processIds[i], seller: c.order.seller }));

    it("a direct call: reads each skipped batch's period, claims and uses from the BatchOperations log of its transaction, and only the skipped batches", async () => {
        const client = stubClient([
            operationsLog(1n, LANDED_TX, 5n, STREAM, 2),
            skippedLog(2n, SKIP_TX, 7n, 0),
            operationsLog(2n, SKIP_TX, 7n, STREAM, 3, 1),
        ]);
        const skipped = await fetchSkippedBatchUses(client, VERIFIER, { fromBlock: 0n, toBlock: 10n });
        expect(skipped).toHaveLength(1);
        expect(skipped[0].batchId).toBe(2n);
        expect(skipped[0].transactionHash).toBe(SKIP_TX);
        expect(skipped[0].blockNumber).toBe(7n);
        expect(skipped[0].reason).toBe(REASON);
        expect(skipped[0].carried).toEqual({
            period: 3,
            provenanceLeaf: PROVENANCE_LEAF_KEY,
            claims: [CLAUSE_CLAIM, ASSEMBLY_CLAIM],
            uses: usesOf([CLAUSE_CLAIM, ASSEMBLY_CLAIM], [PROCESS, PROCESS]),
        });
        expect(client.getTransaction).not.toHaveBeenCalled();
    });

    it("a call through another contract: the batch's log is the verifier's on every route, so its uses are read the same way", async () => {
        // The transaction's `to` is a router; the reader never asks for it.
        const client = stubClient([skippedLog(3n, ROUTED_TX, 9n, 4), operationsLog(3n, ROUTED_TX, 9n, STREAM, 3, 6)]);
        const [skip] = await fetchSkippedBatchUses(client, VERIFIER, { fromBlock: 0n, toBlock: 10n });
        expect(skip.batchId).toBe(3n);
        expect(skip.carried.claims).toEqual([CLAUSE_CLAIM, ASSEMBLY_CLAIM]);
        expect(client.getTransaction).not.toHaveBeenCalled();
    });

    it("two batches landed in one transaction: each skipped batch is paired with the BatchOperations log of its own batch id", async () => {
        // A contract that calls `settleBatch` twice in one transaction: both
        // pairs of logs carry the same transaction hash, and the logs of the
        // second batch are interleaved with the first's.
        const AGREEMENT_CLAIM: SequencerUsageClaim = {
            order: SECOND,
            clause_or_process: rep("a1", 32),
            kind: { Agreement: { process_design_hash: rep("a2", 32) } },
            inclusion_proof: [rep("a3", 32), rep("a4", 32)],
        };
        const OTHER = concatHex([commitEntry(FIRST), claimEntry(AGREEMENT_CLAIM)]);
        const client = stubClient([
            skippedLog(8n, ROUTED_TX, 9n, 0),
            skippedLog(9n, ROUTED_TX, 9n, 2),
            operationsLog(9n, ROUTED_TX, 9n, OTHER, 4, 3),
            operationsLog(8n, ROUTED_TX, 9n, STREAM, 3, 1),
        ]);
        const skipped = await fetchSkippedBatchUses(client, VERIFIER, { fromBlock: 0n, toBlock: 10n });
        expect(skipped.map((s) => [s.batchId, s.transactionHash])).toEqual([[8n, ROUTED_TX], [9n, ROUTED_TX]]);
        expect(skipped[0].carried).toEqual({
            period: 3,
            provenanceLeaf: PROVENANCE_LEAF_KEY,
            claims: [CLAUSE_CLAIM, ASSEMBLY_CLAIM],
            uses: usesOf([CLAUSE_CLAIM, ASSEMBLY_CLAIM], [PROCESS, PROCESS]),
        });
        expect(skipped[1].carried).toEqual({
            period: 4,
            provenanceLeaf: PROVENANCE_LEAF_KEY,
            claims: [AGREEMENT_CLAIM],
            uses: usesOf([AGREEMENT_CLAIM], [PROCESS]),
        });
    });

    it("a skipped batch that carried no usage claim gives an empty list, never an absent one", async () => {
        const client = stubClient([skippedLog(4n, SKIP_TX, 7n), operationsLog(4n, SKIP_TX, 7n, concatHex([commitEntry(FIRST)]))]);
        const [skip] = await fetchSkippedBatchUses(client, VERIFIER, { fromBlock: 0n, toBlock: 10n });
        expect(skip.carried).toEqual({ period: 3, provenanceLeaf: PROVENANCE_LEAF_KEY, claims: [], uses: [] });
    });

    it("derives one use per (kind, key, process), the first claim naming the seller, a root order's process under the verifier's domain", async () => {
        const root = { ...FIRST, process_id: `0x${"00".repeat(32)}` as Hex };
        const onRoot: SequencerUsageClaim = { ...CLAUSE_CLAIM, order: root };
        const again: SequencerUsageClaim = { ...CLAUSE_CLAIM, order: SECOND };
        const client = stubClient([
            skippedLog(5n, SKIP_TX, 7n),
            operationsLog(5n, SKIP_TX, 7n, concatHex([claimEntry(onRoot), claimEntry(CLAUSE_CLAIM), claimEntry(again)])),
        ]);
        const [skip] = await fetchSkippedBatchUses(client, VERIFIER, { fromBlock: 0n, toBlock: 10n });
        const rootProcess = computeCommitmentProcessId(
            {
                processId: root.process_id, buyer: root.buyer, seller: root.seller, token: root.token,
                payment: BigInt(root.payment), runningTotal: BigInt(root.running_total),
                checkoutHash: root.checkout_hash, salt: BigInt(root.salt), commitDeadline: BigInt(root.commit_deadline),
            },
            CHAIN_ID,
            VERIFIER,
        );
        expect(skip.carried.claims).toHaveLength(3);
        expect(skip.carried.uses).toEqual(usesOf([onRoot, CLAUSE_CLAIM], [rootProcess, PROCESS]));
    });

    it("refuses a skipped batch whose stream does not decode, and one whose BatchOperations log the node did not return", async () => {
        await expect(
            fetchSkippedBatchUses(stubClient([skippedLog(6n, SKIP_TX, 7n), operationsLog(6n, SKIP_TX, 7n, "0x06")]), VERIFIER, { fromBlock: 0n, toBlock: 10n }),
        ).rejects.toThrow(/unknown stream tag 0x06/);
        await expect(
            fetchSkippedBatchUses(stubClient([skippedLog(7n, SKIP_TX, 7n), operationsLog(7n, LANDED_TX, 7n, STREAM)]), VERIFIER, { fromBlock: 0n, toBlock: 10n }),
        ).rejects.toThrow(/no BatchOperations log/);
    });

    it("asks the node for the two events only, from the block it is given, in chunks", async () => {
        const client = stubClient([]);
        await fetchSkippedBatchUses(client, VERIFIER, { fromBlock: 100n, toBlock: 125n, chunkSize: 10n });
        expect(client.getLogs).toHaveBeenCalledTimes(3);
        const first = (client.getLogs as ReturnType<typeof vi.fn>).mock.calls[0][0] as { address: Address; fromBlock: bigint; toBlock: bigint; events: { name: string }[] };
        expect(first.address).toBe(VERIFIER);
        expect([first.fromBlock, first.toBlock]).toEqual([100n, 109n]);
        expect(first.events.map((e) => e.name).sort()).toEqual(["BatchAccrualSkipped", "BatchOperations"]);
    });

    it("requires a start block", async () => {
        const params = { toBlock: 10n } as unknown as Parameters<typeof fetchSkippedBatchUses>[2];
        await expect(fetchSkippedBatchUses(stubClient([]), VERIFIER, params)).rejects.toThrow(/fromBlock/);
    });
});

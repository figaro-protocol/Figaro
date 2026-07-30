import { describe, expect, it } from "vitest";
import { encodePacked, keccak256, type Address, type Hex } from "viem";
import {
    computeRpgfAllocations,
    computeUsageAccruals,
    icbrt,
    usageScore,
    RPGF_PAIR_CAP,
    RPGF_SCORE_SCALE,
    type UsagePeriodAccrual,
    type UsageRecord,
} from "../src/rpgf/index.js";

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
    it("is zero without both a process and a pair", () => {
        expect(usageScore(0n, 3n)).toBe(0n);
        expect(usageScore(3n, 0n)).toBe(0n);
    });

    it("weights breadth twice as heavily as volume", () => {
        // c^(1/3) * d^(2/3): doubling d must beat doubling c.
        const moreProcesses = usageScore(4n, 2n);
        const morePairs = usageScore(2n, 4n);
        expect(morePairs).toBeGreaterThan(moreProcesses);
    });

    it("is uniform — equal (c, d) gives equal score for any artifact (no weight)", () => {
        expect(usageScore(5n, 3n)).toBe(usageScore(5n, 3n));
        expect(usageScore(1n, 1n)).toBe(10n ** 6n); // icbrt(1e18)
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
const pair = (buyer: string, seller: string): Hex => keccak256(encodePacked(["string", "string"], [buyer, seller]));

let logCounter = 0;
function record(
    artifact: Hex,
    processId: string,
    pairKey: Hex,
    overrides: Partial<UsageRecord> = {},
): UsageRecord {
    // c/d/score on the event are the chain's own running values; the mirror
    // recomputes them, so the fixtures leave them at zero unless a test cares.
    return {
        blockNumber: 100n,
        logIndex: logCounter++,
        artifact,
        period: 0,
        processId: seed(processId),
        pairKey,
        c: 0n,
        d: 0n,
        score: 0n,
        ...overrides,
    };
}

describe("computeUsageAccruals", () => {
    it("counts distinct processes and distinct pairs per artifact per period", () => {
        const p1 = pair("buyer1", "seller1");
        const p2 = pair("buyer2", "seller1");
        const accruals = computeUsageAccruals([
            record(CLAUSE_A, "p1", p1),
            record(CLAUSE_A, "p2", p2),
            record(CLAUSE_B, "p1", p1),
        ]);
        const period = accruals.get(0)!;
        expect(period.byArtifact.get(CLAUSE_A)).toMatchObject({ c: 2n, d: 2n });
        expect(period.byArtifact.get(CLAUSE_B)).toMatchObject({ c: 1n, d: 1n });
        expect(period.totalScore).toBe(usageScore(2n, 2n) + usageScore(1n, 1n));
    });

    it("is idempotent per (artifact, period, process) — a replay adds nothing", () => {
        const p1 = pair("buyer1", "seller1");
        const once = computeUsageAccruals([record(CLAUSE_A, "p1", p1)]);
        const twice = computeUsageAccruals([record(CLAUSE_A, "p1", p1), record(CLAUSE_A, "p1", p1)]);
        expect(twice.get(0)!.byArtifact.get(CLAUSE_A)).toEqual(once.get(0)!.byArtifact.get(CLAUSE_A));
    });

    it("drops a process entirely once its pair hits PAIR_CAP", () => {
        const repeat = pair("buyer1", "seller1");
        const capped = computeUsageAccruals(
            Array.from({ length: RPGF_PAIR_CAP + 3 }, (_, i) => record(CLAUSE_A, `pc-${i}`, repeat)),
        );
        const five = computeUsageAccruals(
            Array.from({ length: RPGF_PAIR_CAP }, (_, i) => record(CLAUSE_A, `pd-${i}`, repeat)),
        );
        // Beyond the cap the process feeds NEITHER c NOR d.
        expect(capped.get(0)!.byArtifact.get(CLAUSE_A)).toEqual({
            c: BigInt(RPGF_PAIR_CAP),
            d: 1n,
            score: usageScore(BigInt(RPGF_PAIR_CAP), 1n),
        });
        expect(capped.get(0)!.totalScore).toBe(five.get(0)!.totalScore);
    });

    it("caps per pair, not per artifact — a fresh pair keeps counting", () => {
        const repeat = pair("buyer1", "seller1");
        const fresh = pair("buyer9", "seller9");
        const accruals = computeUsageAccruals([
            ...Array.from({ length: RPGF_PAIR_CAP + 2 }, (_, i) => record(CLAUSE_A, `pe-${i}`, repeat)),
            record(CLAUSE_A, "pe-fresh", fresh),
        ]);
        expect(accruals.get(0)!.byArtifact.get(CLAUSE_A)).toMatchObject({
            c: BigInt(RPGF_PAIR_CAP + 1),
            d: 2n,
        });
    });

    it("buckets accrual by period — the same pair starts over in the next one", () => {
        const p1 = pair("buyer1", "seller1");
        const accruals = computeUsageAccruals([
            record(CLAUSE_A, "pf-0", p1, { period: 0 }),
            record(CLAUSE_A, "pf-1", p1, { period: 1 }),
        ]);
        expect(accruals.get(0)!.byArtifact.get(CLAUSE_A)).toMatchObject({ c: 1n, d: 1n });
        expect(accruals.get(1)!.byArtifact.get(CLAUSE_A)).toMatchObject({ c: 1n, d: 1n });
    });

    it("scores uniformly — equal usage gives equal score, clause or assembly", () => {
        const accruals = computeUsageAccruals(
            [record(CLAUSE_A, "pg-0", pair("b", "s")), record(CLAUSE_B, "pg-0", pair("b", "s"))],
        );
        const period = accruals.get(0)!;
        expect(period.byArtifact.get(CLAUSE_A)!.score).toBe(period.byArtifact.get(CLAUSE_B)!.score);
    });

    it("reproduces the running score the chain emitted", () => {
        // The event carries the artifact's score AFTER the record; the mirror
        // must land on the same number from the counting rules alone.
        const p1 = pair("buyer1", "seller1");
        const p2 = pair("buyer2", "seller2");
        const emitted = [
            record(CLAUSE_A, "ph-0", p1, { c: 1n, d: 1n, score: usageScore(1n, 1n) }),
            record(CLAUSE_A, "ph-1", p2, { c: 2n, d: 2n, score: usageScore(2n, 2n) }),
        ];
        const accrual = computeUsageAccruals(emitted).get(0)!.byArtifact.get(CLAUSE_A)!;
        const last = emitted[emitted.length - 1];
        expect(accrual).toEqual({ c: last.c, d: last.d, score: last.score });
    });

    it("replays in (blockNumber, logIndex) order regardless of input order", () => {
        const repeat = pair("buyer1", "seller1");
        const records = Array.from({ length: RPGF_PAIR_CAP + 2 }, (_, i) =>
            record(CLAUSE_A, `pi-${i}`, repeat, { blockNumber: BigInt(100 + i) }),
        );
        const forward = computeUsageAccruals(records).get(0)!;
        const reversed = computeUsageAccruals([...records].reverse()).get(0)!;
        expect(reversed.byArtifact.get(CLAUSE_A)).toEqual(forward.byArtifact.get(CLAUSE_A));
        expect(reversed.totalScore).toBe(forward.totalScore);
    });
});

// ── The payout (RpgfMinter.claim, mirrored) ──────────────────────────

function periodOf(entries: Array<[Hex, bigint]>): UsagePeriodAccrual {
    const byArtifact = new Map<Hex, { c: bigint; d: bigint; score: bigint }>();
    let totalScore = 0n;
    for (const [artifact, score] of entries) {
        byArtifact.set(artifact, { c: 1n, d: 1n, score });
        totalScore += score;
    }
    return { byArtifact, totalScore };
}

describe("computeRpgfAllocations", () => {
    const authors = new Map<Hex, Address>([
        [CLAUSE_A, AUTHOR_A],
        [CLAUSE_B, AUTHOR_B],
        [ASSEMBLY, DESIGNER],
    ]);

    it("splits a tranche pro rata over the period's total score", () => {
        // Ten equal artifacts, ten authors: each takes 10%.
        const artifacts = Array.from(
            { length: 10 },
            (_, i) => `0x${(i + 1).toString(16).padStart(64, "0")}` as Hex,
        );
        const period = periodOf(artifacts.map((artifact) => [artifact, 100n] as [Hex, bigint]));
        const tenAuthors = new Map<Hex, Address>(
            artifacts.map((artifact, i) => [artifact, `0x${(i + 1).toString(16).padStart(40, "0")}` as Address]),
        );
        const out = computeRpgfAllocations(period, tenAuthors, 10_000n);
        expect(out.length).toBe(10);
        for (const allocation of out) {
            expect(allocation.amount).toBe(1_000n);
        }
    });

    it("sums a wallet's artifacts — clause and assembly families merge", () => {
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
        // One wallet, two families — 100/1000 of the tranche.
        expect(a.score).toBe(100n);
        expect(a.amount).toBe(100_000n);
    });

    it("no cap — a dominant wallet takes its full pro-rata share", () => {
        // One dominant author takes 90% of the tranche; there is no ceiling.
        const period = periodOf([
            [CLAUSE_A, 900n],
            [CLAUSE_B, 100n],
        ]);
        const out = computeRpgfAllocations(period, authors, 1_000n);
        const byAccount = new Map(out.map((x) => [x.account, x]));
        expect(byAccount.get(AUTHOR_A.toLowerCase() as Address)!.amount).toBe(900n);
        expect(byAccount.get(AUTHOR_B.toLowerCase() as Address)!.amount).toBe(100n);
        const minted = out.reduce((sum, x) => sum + x.amount, 0n);
        expect(minted).toBe(1_000n); // the whole tranche is allocated
    });

    it("ignores artifacts with no author of record but keeps them in the denominator", () => {
        const period = periodOf([
            [CLAUSE_A, 100n],
            [CLAUSE_B, 900n],
        ]);
        const onlyA = new Map<Hex, Address>([[CLAUSE_A, AUTHOR_A]]);
        const out = computeRpgfAllocations(period, onlyA, 1_000_000n);
        // The unauthored artifact's 900 stays in the denominator: A takes
        // 100/1000, not 100/100.
        expect(out).toEqual([
            { account: AUTHOR_A.toLowerCase() as Address, amount: 100_000n, score: 100n },
        ]);
    });

    it("returns nothing for a period with no score", () => {
        expect(computeRpgfAllocations({ byArtifact: new Map(), totalScore: 0n }, authors, 1_000n)).toEqual([]);
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

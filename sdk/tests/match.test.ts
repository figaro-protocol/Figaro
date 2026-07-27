import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import {
    computeMatchAccruals,
    computeMatchAllocations,
    isqrt,
    MATCH_CAP_DENOMINATOR,
    MATCH_CAP_NUMERATOR,
    type MatchDonationEvent,
    type MatchFormulaParameters,
    type MatchRoundConfig,
} from "../src/match/index.js";

// ── Fixture round ────────────────────────────────────────────────────

const POOL = "0x000000000000000000000000000000000000bb22" as Address;
const USDC = "0x000000000000000000000000000000000000cc33" as Address;
const FLORIN = "0x000000000000000000000000000000000000dd44" as Address;

const donorA = "0x000000000000000000000000000000000000d0a1" as Address;
const donorB = "0x000000000000000000000000000000000000d0b2" as Address;
const donorC = "0x000000000000000000000000000000000000d0c3" as Address;
const donorD = "0x000000000000000000000000000000000000d0d4" as Address;
const recipientX = "0x000000000000000000000000000000000000ec01" as Address;
const recipientY = "0x000000000000000000000000000000000000ec02" as Address;

const ONE = 10n ** 18n;

const ROUND: MatchRoundConfig = {
    pool: POOL,
    donationToken: USDC,
    matchToken: FLORIN,
    donationStart: 1_000n,
    donationEnd: 2_000n,
    donationFloor: ONE,
};

/** Cap disabled, so the raw pro-rata split is observable. */
const NO_CAP: MatchFormulaParameters = { capNumerator: 1n, capDenominator: 1n };

let logCounter = 0;
function donation(
    donor: Address,
    recipient: Address,
    amount: bigint,
    overrides: Partial<MatchDonationEvent> = {},
): MatchDonationEvent {
    return {
        blockNumber: 100n,
        logIndex: logCounter++,
        timestamp: 1_500n,
        donor,
        recipient,
        amount,
        weightAfter: 0n,
        ...overrides,
    };
}

// ── Integer math ─────────────────────────────────────────────────────

describe("isqrt", () => {
    it("floors exactly around perfect squares", () => {
        expect(isqrt(0n)).toBe(0n);
        expect(isqrt(1n)).toBe(1n);
        expect(isqrt(3n)).toBe(1n);
        expect(isqrt(4n)).toBe(2n);
        expect(isqrt(8n)).toBe(2n);
        expect(isqrt(9n)).toBe(3n);
        expect(isqrt(10n ** 18n)).toBe(10n ** 9n);
        const big = 987654321987654321n;
        expect(isqrt(big * big)).toBe(big);
        expect(isqrt(big * big - 1n)).toBe(big - 1n);
        expect(isqrt(big * big + 1n)).toBe(big);
    });

    it("mirrors MatchPool.sqrt's Babylonian iteration at uint256 scale", () => {
        const max = (1n << 256n) - 1n;
        const root = isqrt(max);
        expect(root * root).toBeLessThanOrEqual(max);
        expect((root + 1n) * (root + 1n)).toBeGreaterThan(max);
    });
});

// ── The surplus form ─────────────────────────────────────────────────

describe("computeMatchAccruals — surplus form", () => {
    it("gives a single-donor recipient zero weight", () => {
        const accruals = computeMatchAccruals([donation(donorA, recipientX, 50n * ONE)], ROUND);
        // sqrt(a)^2 - a is zero up to integer truncation — the cheapest sybil
        // shape earns nothing.
        expect(accruals.get(recipientX)!.weight).toBe(0n);
    });

    it("accumulates per (donor, recipient) pair — splitting a cheque is neutral", () => {
        // The sybil floor depends on this. Roots are taken PER DONOR, so one
        // wallet splitting a cheque across n transactions scores exactly what it
        // would have scored paying once — zero. Rooting per CALL instead would
        // let a donor manufacture surplus from nothing.
        const split = computeMatchAccruals(
            [donation(donorA, recipientX, 25n * ONE), donation(donorA, recipientX, 25n * ONE)],
            ROUND,
        );
        const single = computeMatchAccruals([donation(donorA, recipientY, 50n * ONE)], ROUND);
        expect(split.get(recipientX)!.weight).toBe(single.get(recipientY)!.weight);
        expect(split.get(recipientX)!.weight).toBe(0n);
        expect(split.get(recipientX)!.sumOf).toBe(single.get(recipientY)!.sumOf);
        // One wallet, two transactions — one donor.
        expect(split.get(recipientX)!.donors).toBe(1n);
    });

    it("computes the coordination surplus sumSqrt^2 - sumOf", () => {
        const accruals = computeMatchAccruals(
            [donation(donorA, recipientX, 25n * ONE), donation(donorB, recipientX, 25n * ONE)],
            ROUND,
        );
        const each = isqrt(25n * ONE);
        const accrual = accruals.get(recipientX)!;
        expect(accrual.sumSqrt).toBe(2n * each);
        expect(accrual.sumOf).toBe(50n * ONE);
        expect(accrual.weight).toBe(2n * each * (2n * each) - 50n * ONE);
        expect(accrual.donors).toBe(2n);
    });

    it("rewards breadth: same total, more donors, more weight", () => {
        const four = computeMatchAccruals(
            [donorA, donorB, donorC, donorD].map((d) => donation(d, recipientX, 25n * ONE)),
            ROUND,
        );
        const two = computeMatchAccruals(
            [donorA, donorB].map((d) => donation(d, recipientY, 50n * ONE)),
            ROUND,
        );
        expect(four.get(recipientX)!.sumOf).toBe(two.get(recipientY)!.sumOf);
        expect(four.get(recipientX)!.weight).toBeGreaterThan(two.get(recipientY)!.weight);
        // 4x25 vs 2x50 is a 3:1 surplus ratio (300 vs 100 in whole-token terms).
        const ratio = (four.get(recipientX)!.weight * 100n) / two.get(recipientY)!.weight;
        expect(ratio).toBeGreaterThanOrEqual(299n);
        expect(ratio).toBeLessThanOrEqual(301n);
    });
});

// ── The contract's donate gates ──────────────────────────────────────

describe("computeMatchAccruals — the donate gates", () => {
    it("drops donations below the round's floor", () => {
        const accruals = computeMatchAccruals(
            [
                donation(donorA, recipientX, 50n * ONE),
                donation(donorB, recipientX, ROUND.donationFloor - 1n),
            ],
            ROUND,
        );
        // B's dust never lands on chain (BelowFloor), so X stays single-donor.
        expect(accruals.get(recipientX)!.donors).toBe(1n);
        expect(accruals.get(recipientX)!.weight).toBe(0n);
    });

    it("counts a donation at exactly the floor", () => {
        const accruals = computeMatchAccruals(
            [donation(donorA, recipientX, 50n * ONE), donation(donorB, recipientX, ROUND.donationFloor)],
            ROUND,
        );
        expect(accruals.get(recipientX)!.donors).toBe(2n);
        expect(accruals.get(recipientX)!.weight).toBeGreaterThan(0n);
    });

    it("gates the window with start inclusive and end EXCLUSIVE", () => {
        const events = [
            donation(donorA, recipientX, 50n * ONE, { timestamp: ROUND.donationStart }),
            donation(donorB, recipientX, 50n * ONE, { timestamp: ROUND.donationEnd - 1n }),
            donation(donorC, recipientX, 50n * ONE, { timestamp: ROUND.donationEnd }),
            donation(donorD, recipientY, 50n * ONE, { timestamp: ROUND.donationStart - 1n }),
        ];
        const accruals = computeMatchAccruals(events, ROUND);
        expect(accruals.get(recipientX)!.donors).toBe(2n);
        expect(accruals.has(recipientY)).toBe(false);
    });

    it("refuses self-donation", () => {
        const accruals = computeMatchAccruals([donation(recipientX, recipientX, 50n * ONE)], ROUND);
        expect(accruals.has(recipientX)).toBe(false);
    });
});

// ── The payout ───────────────────────────────────────────────────────

describe("computeMatchAllocations", () => {
    it("splits the budget by weight over totalWeight", () => {
        const events = [
            donation(donorA, recipientX, 25n * ONE),
            donation(donorB, recipientX, 25n * ONE),
            donation(donorC, recipientX, 25n * ONE),
            donation(donorD, recipientX, 25n * ONE),
            donation(donorA, recipientY, 50n * ONE),
            donation(donorB, recipientY, 50n * ONE),
        ];
        const out = computeMatchAllocations(events, ROUND, 400n, NO_CAP);
        const x = out.find((a) => a.account === recipientX)!;
        const y = out.find((a) => a.account === recipientY)!;
        // 3:1 on coordination at equal donated totals. X's surplus is exactly
        // 300e18 (√25 is integral); Y's is 100e18 minus the flooring of √50,
        // which is irrational — so Y's share floors to 99 and the dust stays in
        // the pool. The chain floors identically, using the same sqrt.
        expect(x.amount).toBe(300n);
        expect(y.amount).toBe(99n);
        expect(x.amount + y.amount).toBeLessThanOrEqual(400n);
    });

    it("caps a recipient at 15% and does NOT redistribute the overflow", () => {
        const events = [
            donation(donorA, recipientX, 100n * ONE),
            donation(donorB, recipientX, 100n * ONE),
            donation(donorC, recipientX, 100n * ONE),
            donation(donorA, recipientY, ROUND.donationFloor),
            donation(donorB, recipientY, ROUND.donationFloor),
        ];
        const out = computeMatchAllocations(events, ROUND, 1_000n);
        const x = out.find((a) => a.account === recipientX)!;
        const cap = (1_000n * MATCH_CAP_NUMERATOR) / MATCH_CAP_DENOMINATOR;
        expect(x.amount).toBe(cap);
        expect(x.capped).toBe(true);
        // Y's share is untouched by X's overflow, which stays in the pool.
        const paid = out.reduce((sum, a) => sum + a.amount, 0n);
        expect(paid).toBeLessThan(1_000n);
    });

    it("returns nothing when no recipient has positive weight", () => {
        expect(computeMatchAllocations([donation(donorA, recipientX, 50n * ONE)], ROUND, 1_000n)).toEqual([]);
    });

    it("is order-independent over the event stream", () => {
        const events = [
            donation(donorA, recipientX, 30n * ONE),
            donation(donorB, recipientX, 70n * ONE),
            donation(donorA, recipientY, 10n * ONE),
            donation(donorC, recipientY, 90n * ONE),
            donation(donorB, recipientY, 5n * ONE),
        ];
        const forward = computeMatchAllocations(events, ROUND, 123_456n);
        const reversed = computeMatchAllocations([...events].reverse(), ROUND, 123_456n);
        expect(reversed).toEqual(forward);
    });

    it("is independent of the donation token's decimals", () => {
        // weight is homogeneous of degree one, so a 6-decimals round with the
        // same shape splits the budget identically.
        const sixDecimals: MatchRoundConfig = { ...ROUND, donationFloor: 10n ** 6n };
        const scale = 10n ** 6n;
        const shape: Array<[Address, Address, bigint]> = [
            [donorA, recipientX, 25n],
            [donorB, recipientX, 25n],
            [donorC, recipientX, 25n],
            [donorD, recipientX, 25n],
            [donorA, recipientY, 50n],
            [donorB, recipientY, 50n],
        ];
        const big = computeMatchAllocations(
            shape.map(([d, r, a]) => donation(d, r, a * ONE)),
            ROUND,
            400n,
            NO_CAP,
        );
        const small = computeMatchAllocations(
            shape.map(([d, r, a]) => donation(d, r, a * scale)),
            sixDecimals,
            400n,
            NO_CAP,
        );
        // The weights carry the token's units; the SPLIT does not.
        const payouts = (out: typeof big) => out.map((a) => [a.account, a.amount]);
        expect(payouts(small)).toEqual(payouts(big));
    });
});

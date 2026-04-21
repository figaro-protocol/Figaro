import { describe, it, expect } from "vitest";
import {
    computeCurrentPrice,
    computeFloorPrice,
    timeToFloor,
    elapsed,
    isExpired,
    evaluateClaim,
    deriveAuctionStates,
} from "../src/extensions/auction.js";
import type { AuctionCreatedEvent, AuctionClaimedEvent, Hex, Address } from "../src/types.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

const MAX_PRICE = 1000n * 10n ** 18n; // 1000 tokens
const FLOOR_BPS = 2000; // 20% floor → floor = 200 tokens
const DURATION = 3600; // 1 hour
const START = 1_700_000_000;

const addr = (n: number): Address =>
    `0x${n.toString(16).padStart(40, "0")}` as Address;
const hex32 = (n: number): Hex =>
    `0x${n.toString(16).padStart(64, "0")}` as Hex;

// ── computeCurrentPrice ─────────────────────────────────────────────────────

describe("computeCurrentPrice", () => {
    it("returns maxPrice at start", () => {
        expect(computeCurrentPrice(MAX_PRICE, FLOOR_BPS, DURATION, START, START)).toBe(MAX_PRICE);
    });

    it("returns floor at or after expiry", () => {
        const floor = computeFloorPrice(MAX_PRICE, FLOOR_BPS);
        expect(computeCurrentPrice(MAX_PRICE, FLOOR_BPS, DURATION, START, START + DURATION)).toBe(floor);
        expect(computeCurrentPrice(MAX_PRICE, FLOOR_BPS, DURATION, START, START + DURATION + 100)).toBe(floor);
    });

    it("returns midpoint at halfway", () => {
        const floor = computeFloorPrice(MAX_PRICE, FLOOR_BPS);
        const mid = (MAX_PRICE + floor) / 2n;
        const price = computeCurrentPrice(MAX_PRICE, FLOOR_BPS, DURATION, START, START + DURATION / 2);
        expect(price).toBe(mid);
    });

    it("returns maxPrice before start (elapsed <= 0)", () => {
        expect(computeCurrentPrice(MAX_PRICE, FLOOR_BPS, DURATION, START, START - 10)).toBe(MAX_PRICE);
    });

    it("decays linearly at 25%", () => {
        const floor = computeFloorPrice(MAX_PRICE, FLOOR_BPS);
        const range = MAX_PRICE - floor;
        const expected = MAX_PRICE - (range * BigInt(DURATION / 4)) / BigInt(DURATION);
        expect(computeCurrentPrice(MAX_PRICE, FLOOR_BPS, DURATION, START, START + DURATION / 4)).toBe(expected);
    });
});

// ── computeFloorPrice ───────────────────────────────────────────────────────

describe("computeFloorPrice", () => {
    it("computes 20% floor", () => {
        expect(computeFloorPrice(MAX_PRICE, 2000)).toBe(MAX_PRICE * 2000n / 10000n);
    });

    it("floor is 0 when bps = 0", () => {
        expect(computeFloorPrice(MAX_PRICE, 0)).toBe(0n);
    });

    it("floor equals max when bps = 10000", () => {
        expect(computeFloorPrice(MAX_PRICE, 10000)).toBe(MAX_PRICE);
    });
});

// ── timeToFloor / elapsed / isExpired ───────────────────────────────────────

describe("timeToFloor", () => {
    it("returns full duration at start", () => {
        expect(timeToFloor(DURATION, START, START)).toBe(DURATION);
    });

    it("returns 0 after expiry", () => {
        expect(timeToFloor(DURATION, START, START + DURATION + 1)).toBe(0);
    });

    it("returns remaining time at midpoint", () => {
        expect(timeToFloor(DURATION, START, START + 1000)).toBe(DURATION - 1000);
    });
});

describe("elapsed", () => {
    it("returns 0 at start", () => {
        expect(elapsed(START, START)).toBe(0);
    });

    it("returns 0 before start", () => {
        expect(elapsed(START, START - 100)).toBe(0);
    });

    it("returns elapsed seconds", () => {
        expect(elapsed(START, START + 500)).toBe(500);
    });
});

describe("isExpired", () => {
    it("not expired before duration", () => {
        expect(isExpired(DURATION, START, START + DURATION - 1)).toBe(false);
    });

    it("expired at exactly duration", () => {
        expect(isExpired(DURATION, START, START + DURATION)).toBe(true);
    });
});

// ── evaluateClaim ───────────────────────────────────────────────────────────

describe("evaluateClaim", () => {
    it("claimable when active and not claimed", () => {
        const result = evaluateClaim(MAX_PRICE, FLOOR_BPS, DURATION, START, START + 100, false);
        expect(result.claimable).toBe(true);
        expect(result.currentPrice).toBeLessThan(MAX_PRICE);
        expect(result.savingsVsMax).toBeGreaterThan(0n);
        expect(result.discountPct).toBeGreaterThan(0);
    });

    it("not claimable when already claimed", () => {
        const result = evaluateClaim(MAX_PRICE, FLOOR_BPS, DURATION, START, START + 100, true);
        expect(result.claimable).toBe(false);
    });

    it("not claimable when expired", () => {
        const result = evaluateClaim(MAX_PRICE, FLOOR_BPS, DURATION, START, START + DURATION + 1, false);
        expect(result.claimable).toBe(false);
    });

    it("discount is 0% at start", () => {
        const result = evaluateClaim(MAX_PRICE, FLOOR_BPS, DURATION, START, START, false);
        expect(result.discountPct).toBe(0);
        expect(result.savingsVsMax).toBe(0n);
    });
});

// ── deriveAuctionStates ─────────────────────────────────────────────────────

describe("deriveAuctionStates", () => {
    it("builds state from created events", () => {
        const created: AuctionCreatedEvent[] = [{
            auctionId: hex32(1),
            creator: addr(1),
            maxPrice: 500n,
            processId: hex32(100),
            currency: addr(99),
            blockNumber: 10,
        }];

        const map = deriveAuctionStates(created, []);
        const s = map.get(hex32(1));
        expect(s).toBeDefined();
        expect(s!.claimed).toBe(false);
        expect(s!.maxPrice).toBe(500n);
    });

    it("marks claimed with driver and clearing price", () => {
        const created: AuctionCreatedEvent[] = [{
            auctionId: hex32(2),
            creator: addr(1),
            maxPrice: 500n,
            processId: hex32(100),
            currency: addr(99),
            blockNumber: 10,
        }];

        const claimed: AuctionClaimedEvent[] = [{
            auctionId: hex32(2),
            driver: addr(5),
            clearingPrice: 300n,
            blockNumber: 20,
        }];

        const map = deriveAuctionStates(created, claimed);
        const s = map.get(hex32(2));
        expect(s!.claimed).toBe(true);
        expect(s!.driver).toBe(addr(5));
        expect(s!.clearingPrice).toBe(300n);
    });
});

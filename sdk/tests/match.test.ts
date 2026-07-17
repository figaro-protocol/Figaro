import { describe, expect, it } from "vitest";
import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";
import {
    buildMatchTree,
    computeMatchAllocations,
    isqrt,
    matchLeaf,
    MATCH_DONATION_FLOOR,
    MATCH_DONOR_RECIPIENT_CAP,
    MATCH_EMPTY_ROOT,
    MATCH_SQRT_SCALE,
    type MatchDonationEvent,
    type MatchRoundConfig,
} from "../src/match/index.js";

// ── Fixture round ────────────────────────────────────────────────────

const RAIL = "0x000000000000000000000000000000000000aa11" as Address;
const POOL = "0x000000000000000000000000000000000000bb22" as Address;
const USDC = "0x000000000000000000000000000000000000cc33" as Address;
const FLORIN = "0x000000000000000000000000000000000000dd44" as Address;
const OTHER_TOKEN = "0x000000000000000000000000000000000000ee55" as Address;

const donorA = "0x000000000000000000000000000000000000d0a1" as Address;
const donorB = "0x000000000000000000000000000000000000d0b2" as Address;
const donorC = "0x000000000000000000000000000000000000d0c3" as Address;
const recipientX = "0x000000000000000000000000000000000000ec01" as Address;
const recipientY = "0x000000000000000000000000000000000000ec02" as Address;

const ROUND: MatchRoundConfig = {
    donationRail: RAIL,
    matchPool: POOL,
    donationToken: USDC,
    matchToken: FLORIN,
    donationStart: 1_000n,
    donationEnd: 2_000n,
};

const ONE = 10n ** 18n; // the v1 instance's floor unit (18-decimals token)
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
        token: USDC,
        donor,
        recipient,
        amount,
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
});

// ── The surplus form ─────────────────────────────────────────────────

describe("computeMatchAllocations — surplus-form QF", () => {
    it("gives a single-donor recipient exactly zero match", () => {
        const out = computeMatchAllocations([donation(donorA, recipientX, 50n * ONE)], ROUND, 1_000_000n);
        expect(out).toEqual([]);
    });

    it("matches coordination: same total, more donors, exact 3:1 surplus split", () => {
        // X: 4 donors × 25 → surplus (4·√25)²−100 = 300 exactly (√25 is
        // integral). Y: 2 donors × 50 → surplus (2·√50)²−100 ≈ 100, floored
        // to 99 by isqrt (√50 is irrational; flooring dust stays unclaimed).
        // Same donated total — the match splits ~3:1 on coordination. The cap
        // is disabled via parameters so the raw ratio is observable.
        const donors = [donorA, donorB, donorC, "0x000000000000000000000000000000000000d0d4" as Address];
        const events = [
            ...donors.map((d) => donation(d, recipientX, 25n * ONE)),
            donation(donorA, recipientY, 50n * ONE),
            donation(donorB, recipientY, 50n * ONE),
        ];
        const out = computeMatchAllocations(events, ROUND, 400n, {
            donationFloor: MATCH_DONATION_FLOOR,
            donorRecipientCap: MATCH_DONOR_RECIPIENT_CAP,
            capNumerator: 100n,
            capDenominator: 100n,
            sqrtScale: MATCH_SQRT_SCALE,
        });
        const x = out.find((a) => a.account.toLowerCase() === recipientX.toLowerCase())!;
        const y = out.find((a) => a.account.toLowerCase() === recipientY.toLowerCase())!;
        expect(x.amount).toBe(300n);
        expect(y.amount).toBe(99n);
    });

    it("sums a donor's repeat donations into one pair before the sqrt", () => {
        // A donating 25+25 to X is ONE pair of 50 — not two sqrt terms.
        const repeat = [
            donation(donorA, recipientX, 25n * ONE),
            donation(donorA, recipientX, 25n * ONE),
            donation(donorB, recipientX, 50n * ONE),
        ];
        const single = [donation(donorA, recipientY, 50n * ONE), donation(donorB, recipientY, 50n * ONE)];
        const out = computeMatchAllocations([...repeat, ...single], ROUND, 1_000n, {
            donationFloor: MATCH_DONATION_FLOOR,
            donorRecipientCap: MATCH_DONOR_RECIPIENT_CAP,
            capNumerator: 100n,
            capDenominator: 100n,
            sqrtScale: MATCH_SQRT_SCALE,
        });
        const x = out.find((a) => a.account.toLowerCase() === recipientX.toLowerCase())!;
        const y = out.find((a) => a.account.toLowerCase() === recipientY.toLowerCase())!;
        expect(x.amount).toBe(y.amount);
    });
});

// ── Floor, cap, scope ────────────────────────────────────────────────

describe("computeMatchAllocations — eligibility", () => {
    it("drops donor-recipient pairs below the donation floor", () => {
        // B's dust does not create a second donor for X — X stays single-donor
        // and scores zero.
        const events = [
            donation(donorA, recipientX, 50n * ONE),
            donation(donorB, recipientX, MATCH_DONATION_FLOOR - 1n),
        ];
        expect(computeMatchAllocations(events, ROUND, 1_000n)).toEqual([]);
    });

    it("counts a pair at exactly the floor", () => {
        const events = [
            donation(donorA, recipientX, 50n * ONE),
            donation(donorB, recipientX, MATCH_DONATION_FLOOR),
        ];
        const out = computeMatchAllocations(events, ROUND, 1_000n);
        expect(out.length).toBe(1);
    });

    it("saturates a pair at the donor-recipient cap", () => {
        // A whale's 10_000 counts as the cap (100) — X and Y end up identical.
        const events = [
            donation(donorA, recipientX, 10_000n * ONE),
            donation(donorB, recipientX, 100n * ONE),
            donation(donorA, recipientY, 100n * ONE),
            donation(donorB, recipientY, 100n * ONE),
        ];
        const out = computeMatchAllocations(events, ROUND, 1_000n, {
            donationFloor: MATCH_DONATION_FLOOR,
            donorRecipientCap: MATCH_DONOR_RECIPIENT_CAP,
            capNumerator: 100n,
            capDenominator: 100n,
            sqrtScale: MATCH_SQRT_SCALE,
        });
        const x = out.find((a) => a.account.toLowerCase() === recipientX.toLowerCase())!;
        const y = out.find((a) => a.account.toLowerCase() === recipientY.toLowerCase())!;
        expect(x.amount).toBe(y.amount);
    });

    it("ignores donations outside the timestamp window (inclusive bounds)", () => {
        const events = [
            donation(donorA, recipientX, 50n * ONE, { timestamp: ROUND.donationStart }),
            donation(donorB, recipientX, 50n * ONE, { timestamp: ROUND.donationEnd }),
            donation(donorC, recipientX, 50n * ONE, { timestamp: ROUND.donationEnd + 1n }),
            donation(donorC, recipientY, 50n * ONE, { timestamp: ROUND.donationStart - 1n }),
        ];
        const out = computeMatchAllocations(events, ROUND, 1_000n);
        // X keeps two in-window donors; Y's only donation is out of window.
        expect(out.length).toBe(1);
        expect(out[0].account.toLowerCase()).toBe(recipientX.toLowerCase());
    });

    it("ignores donations in a token other than the round's donation token", () => {
        const events = [
            donation(donorA, recipientX, 50n * ONE),
            donation(donorB, recipientX, 50n * ONE, { token: OTHER_TOKEN }),
        ];
        expect(computeMatchAllocations(events, ROUND, 1_000n)).toEqual([]);
    });

    it("drops the round's own machinery as recipients", () => {
        for (const machinery of [RAIL, POOL, USDC, FLORIN]) {
            const events = [donation(donorA, machinery, 50n * ONE), donation(donorB, machinery, 50n * ONE)];
            expect(computeMatchAllocations(events, ROUND, 1_000n)).toEqual([]);
        }
    });

    it("applies the 15% water-fill cap per recipient wallet", () => {
        // One dominant recipient caps at 150 of 1_000; the rest re-splits.
        const events = [
            donation(donorA, recipientX, 100n * ONE),
            donation(donorB, recipientX, 100n * ONE),
            donation(donorC, recipientX, 100n * ONE),
            donation(donorA, recipientY, MATCH_DONATION_FLOOR),
            donation(donorB, recipientY, MATCH_DONATION_FLOOR),
        ];
        const out = computeMatchAllocations(events, ROUND, 1_000n);
        const x = out.find((a) => a.account.toLowerCase() === recipientX.toLowerCase())!;
        expect(x.amount).toBe(150n);
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
});

// ── Merkle parity with OptimisticMatchPool.claim ─────────────────────

describe("buildMatchTree", () => {
    it("produces the pool's leaf shape and a verifying proof", () => {
        const leafX = matchLeaf(recipientX, 75_000n);
        // The contract side: keccak256(bytes.concat(keccak256(abi.encode(account, amount)))).
        const inner = keccak256(
            encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [recipientX, 75_000n]),
        );
        expect(leafX).toBe(keccak256(inner));

        const leafY = matchLeaf(recipientY, 25_000n);
        const tree = buildMatchTree([leafX, leafY]);
        const [lo, hi] = [leafX, leafY].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1));
        expect(tree.root).toBe(keccak256(`0x${lo.slice(2)}${hi.slice(2)}` as Hex));
        expect(tree.proofOf(leafX)).toEqual([leafY]);
    });

    it("returns the canonical match empty root for an empty allocation set", () => {
        const tree = buildMatchTree([]);
        expect(tree.root).toBe(MATCH_EMPTY_ROOT);
        expect(MATCH_EMPTY_ROOT).not.toBe(keccak256(new TextEncoder().encode("figaro-rpgf:empty"))); // distinct formulas, distinct roots
    });
});

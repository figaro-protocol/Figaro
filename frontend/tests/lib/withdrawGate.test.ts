/**
 * withdrawGate — the frontend-owned pure surface of the advisory
 * commits==resolves gate: the user-facing reason a stake can't be reclaimed,
 * and the informational caveat for unverifiable (party-private) deals.
 *
 * The join + count itself is the SDK's (`@figaro/sdk/derive`, tested there);
 * this asserts only the messages the affordance shows. Ruled semantics: only
 * VERIFIED in-flight deals block; unverified deals surface a caveat next to an
 * ENABLED affordance; a null gate (loading / chain-read failure) still reads
 * as not-safe (genuinely unknown chain state).
 */
import { describe, expect, it } from "vitest";
import { withdrawBlockedReason, withdrawUnverifiedCaveat } from "@/lib/protocol/withdrawGate";
import type { WithdrawGate } from "@figaro/sdk/derive";

describe("withdrawBlockedReason", () => {
    it("null gate (loading / chain-read failure) is treated as not-safe-to-reclaim", () => {
        expect(withdrawBlockedReason(null)).toMatch(/Checking for in-flight deals/i);
    });

    it("zero orders → no reason (withdraw allowed), no caveat", () => {
        const gate: WithdrawGate = { canWithdraw: true, inFlightCount: 0, unverifiedCount: 0 };
        expect(withdrawBlockedReason(gate)).toBeNull();
        expect(withdrawUnverifiedCaveat(gate)).toBeNull();
    });

    it("verified in-flight deals block, naming the count", () => {
        const gate: WithdrawGate = { canWithdraw: false, inFlightCount: 2, unverifiedCount: 0 };
        const reason = withdrawBlockedReason(gate);
        expect(reason).toMatch(/2 in-flight deals/);
        expect(reason).toMatch(/settled/);
    });

    it("unverified-only → withdraw allowed (no reason), caveat present", () => {
        const gate: WithdrawGate = { canWithdraw: true, inFlightCount: 0, unverifiedCount: 1 };
        expect(withdrawBlockedReason(gate)).toBeNull();
        expect(withdrawUnverifiedCaveat(gate)).toMatch(/party-private/i);
    });

    it("mixed → blocked on the verified count, caveat names the unverified count", () => {
        const gate: WithdrawGate = { canWithdraw: false, inFlightCount: 1, unverifiedCount: 3 };
        expect(withdrawBlockedReason(gate)).toMatch(/1 in-flight deal /);
        expect(withdrawUnverifiedCaveat(gate)).toMatch(/3 in-flight deals could not be checked/);
    });
});

describe("withdrawUnverifiedCaveat", () => {
    it("null gate → no caveat (the affordance is disabled anyway)", () => {
        expect(withdrawUnverifiedCaveat(null)).toBeNull();
    });

    it("names that unverified deals never block and that enforcement arrives with the prover", () => {
        const gate: WithdrawGate = { canWithdraw: true, inFlightCount: 0, unverifiedCount: 2 };
        const caveat = withdrawUnverifiedCaveat(gate);
        expect(caveat).toMatch(/do not block/i);
        expect(caveat).toMatch(/prover/i);
    });
});

/**
 * withdrawGate — the frontend-owned pure surface of the advisory
 * commits==resolves gate: the user-facing reason a stake can't be reclaimed,
 * and the informational caveat for unverifiable (party-private) trades.
 *
 * The join + count itself is the SDK's (`@figaro-protocol/sdk/derive`, tested there);
 * this asserts only the messages the affordance shows. Ruled semantics: only
 * VERIFIED in-flight trades block; unverified trades surface a caveat next to an
 * ENABLED affordance; a null gate (loading / chain-read failure) still reads
 * as not-safe (genuinely unknown chain state).
 */
import { describe, expect, it } from "vitest";
import { withdrawBlockedReason, withdrawUnverifiedCaveat } from "@/lib/protocol/withdrawGate";
import type { WithdrawGate } from "@figaro-protocol/sdk/derive";
import { ABSENT, PENDING, present } from "@/lib/shared/networkRead";

describe("withdrawBlockedReason", () => {
    it("a pending gate says it is checking; an absent gate says nothing (no affordance is offered for it)", () => {
        expect(withdrawBlockedReason(PENDING)).toMatch(/Checking for in-flight trades/i);
        expect(withdrawBlockedReason(ABSENT)).toBeNull();
    });

    it("zero orders → no reason (withdraw allowed), no caveat", () => {
        const gate: WithdrawGate = { canWithdraw: true, inFlightCount: 0, unverifiedCount: 0 };
        expect(withdrawBlockedReason(present(gate))).toBeNull();
        expect(withdrawUnverifiedCaveat(present(gate))).toBeNull();
    });

    it("verified in-flight trades block, naming the count", () => {
        const gate: WithdrawGate = { canWithdraw: false, inFlightCount: 2, unverifiedCount: 0 };
        const reason = withdrawBlockedReason(present(gate));
        expect(reason).toMatch(/2 in-flight trades/);
        expect(reason).toMatch(/resolved/);
    });

    it("unverified-only → withdraw allowed (no reason), caveat present", () => {
        const gate: WithdrawGate = { canWithdraw: true, inFlightCount: 0, unverifiedCount: 1 };
        expect(withdrawBlockedReason(present(gate))).toBeNull();
        expect(withdrawUnverifiedCaveat(present(gate))).toMatch(/party-private/i);
    });

    it("mixed → blocked on the verified count, caveat names the unverified count", () => {
        const gate: WithdrawGate = { canWithdraw: false, inFlightCount: 1, unverifiedCount: 3 };
        expect(withdrawBlockedReason(present(gate))).toMatch(/1 in-flight trade /);
        expect(withdrawUnverifiedCaveat(present(gate))).toMatch(/3 in-flight trades could not be checked/);
    });
});

describe("withdrawUnverifiedCaveat", () => {
    it("a pending or absent gate → no caveat", () => {
        expect(withdrawUnverifiedCaveat(PENDING)).toBeNull();
        expect(withdrawUnverifiedCaveat(ABSENT)).toBeNull();
    });

    it("names that unverified trades never block and that enforcement arrives with the prover", () => {
        const gate: WithdrawGate = { canWithdraw: true, inFlightCount: 0, unverifiedCount: 2 };
        const caveat = withdrawUnverifiedCaveat(present(gate));
        expect(caveat).toMatch(/do not block/i);
        expect(caveat).toMatch(/prover/i);
    });
});

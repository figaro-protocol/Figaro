/**
 * clauseRegistry — the pure revert-translation surface of the clause register /
 * reclaim write hooks. The viem extraction (`err.walk` → `errorName`) is thin
 * glue; these assert the human-readable messages the affordance shows for each
 * on-chain revert the `ClauseRegistry` can produce. Pure functions — no wagmi
 * mock, no contract-call mock (mock-contracts-not-React).
 */
import { describe, expect, it } from "vitest";
import {
    clauseRegisterRevertMessage,
    clauseWithdrawRevertMessage,
} from "@/lib/protocol/useClauseRegistry";

describe("clauseRegisterRevertMessage", () => {
    it("AlreadyRegistered names the clause id and the first-write-wins / version rule", () => {
        const msg = clauseRegisterRevertMessage("AlreadyRegistered", undefined, "figaro-my-clause");
        expect(msg).toMatch(/figaro-my-clause/);
        expect(msg).toMatch(/first-write-wins/i);
        expect(msg).toMatch(/version/i);
    });

    it("WrongDeposit names the provided and required wei from the decoded args", () => {
        const msg = clauseRegisterRevertMessage("WrongDeposit", [123n, 456n], "figaro-x");
        expect(msg).toMatch(/123 wei/);
        expect(msg).toMatch(/456 wei/);
    });

    it("WrongDeposit degrades to '?' when args are absent", () => {
        const msg = clauseRegisterRevertMessage("WrongDeposit", undefined, "figaro-x");
        expect(msg).toMatch(/provided \? wei/);
        expect(msg).toMatch(/required \? wei/);
    });

    it("maps the field-guard reverts", () => {
        expect(clauseRegisterRevertMessage("EmptyClauseId", undefined, "x")).toMatch(/empty clauseId/i);
        expect(clauseRegisterRevertMessage("EmptyContentURI", undefined, "x")).toMatch(/empty URI/i);
        expect(clauseRegisterRevertMessage("ZeroContentHash", undefined, "x")).toMatch(/empty content hash/i);
    });

    it("returns null for an unrecognized or absent error name (falls through to the raw error)", () => {
        expect(clauseRegisterRevertMessage("SomethingElse", undefined, "x")).toBeNull();
        expect(clauseRegisterRevertMessage(undefined, undefined, "x")).toBeNull();
    });
});

describe("clauseWithdrawRevertMessage", () => {
    it("AlreadyWithdrawn", () => {
        expect(clauseWithdrawRevertMessage("AlreadyWithdrawn")).toMatch(/already been reclaimed/i);
    });

    it("NotRegisteredBy names that only the registeredBy can reclaim", () => {
        expect(clauseWithdrawRevertMessage("NotRegisteredBy")).toMatch(/only the wallet that registered/i);
    });

    it("NotRegistered", () => {
        expect(clauseWithdrawRevertMessage("NotRegistered")).toMatch(/no registration binding/i);
    });

    it("TransferFailed names that no state changed", () => {
        const msg = clauseWithdrawRevertMessage("TransferFailed");
        expect(msg).toMatch(/transfer failed/i);
        expect(msg).toMatch(/no state changed/i);
    });

    it("returns null for an unrecognized or absent error name", () => {
        expect(clauseWithdrawRevertMessage("Nope")).toBeNull();
        expect(clauseWithdrawRevertMessage(undefined)).toBeNull();
    });
});

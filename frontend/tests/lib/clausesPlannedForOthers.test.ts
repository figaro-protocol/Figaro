import { describe, expect, it } from "vitest";
import { clausesPlannedForOthers } from "@/scripts/populate-clauses.mjs";

// A Ledger run of populate-clauses.mjs leaves out the clauses the chain's
// registration plan gives another wallet, and stops before any transaction
// when the chain has no plan: a first registration is permanent
// (src/registries/ClauseRegistry.sol, AlreadyRegistered).
const SPECS = [
    { clauseId: "figaro-commerce", clauseKey: "0x01", version: "1.0.0" },
    { clauseId: "figaro-schedule", clauseKey: "0x02", version: "1.0.0" },
];
const FILE = "deployments/11155111.expected.json";

describe("clausesPlannedForOthers", () => {
    it("stops when the chain has no expectations file", () => {
        expect(() => clausesPlannedForOthers(undefined, SPECS, FILE)).toThrow(/no registration plan/);
    });

    it("stops when the expectations file has no registrations", () => {
        expect(() => clausesPlannedForOthers({ chainId: 11155111 }, SPECS, FILE)).toThrow(/no registration plan/);
    });

    it("leaves out nothing when the plan names no clause", () => {
        expect(clausesPlannedForOthers({ registrations: { default: "founder" } }, SPECS, FILE)).toEqual([]);
        expect(clausesPlannedForOthers({ registrations: { default: "founder", byClause: {} } }, SPECS, FILE)).toEqual([]);
    });

    it("leaves out the clause the plan gives another wallet", () => {
        const plan = { registrations: { default: "founder", byClause: { "figaro-commerce": "daoVault" } } };
        expect(clausesPlannedForOthers(plan, SPECS, FILE).map((s: { clauseId: string }) => s.clauseId)).toEqual(["figaro-commerce"]);
    });

    it("keeps a clause the plan names for the default wallet", () => {
        const plan = { registrations: { default: "founder", byClause: { "figaro-commerce": "founder" } } };
        expect(clausesPlannedForOthers(plan, SPECS, FILE)).toEqual([]);
    });
});

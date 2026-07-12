/**
 * RegisterClauseForm.validate — the pure spec-validation discriminator behind
 * the clause register form. Asserts the well-formed / malformed / optional-field
 * paths the UI branches on. The heavy lifting is the SDK's `parseClauseSpec`
 * (tested in the SDK); this covers the JSON-parse + state discrimination glue
 * and that the RAW document (incl. optional `block`) survives to the pin.
 */
import { describe, expect, it } from "vitest";
import { validate } from "@/app/(builders)/builders/clauses/_components/RegisterClauseForm";

const WELL_FORMED = {
    clauseId: "figaro-my-clause",
    version: 1,
    title: "My clause",
    description: "A minimal clause.",
    fields: [{ name: "note", type: "string", required: true }],
};

describe("validate", () => {
    it("empty text → empty state", () => {
        expect(validate("").state).toBe("empty");
        expect(validate("   \n ").state).toBe("empty");
    });

    it("non-JSON text → syntax error with a message", () => {
        const v = validate("{ not json");
        expect(v.state).toBe("syntax");
        if (v.state === "syntax") expect(v.message.length).toBeGreaterThan(0);
    });

    it("well-formed spec → valid, and the RAW document is preserved for the pin", () => {
        const v = validate(JSON.stringify(WELL_FORMED));
        expect(v.state).toBe("valid");
        if (v.state === "valid") {
            expect(v.raw.clauseId).toBe("figaro-my-clause");
            expect(v.raw.version).toBe(1);
        }
    });

    it("optional-field handling: an optional `block` slice survives into raw (so the on-chain contentHash covers it)", () => {
        const withBlock = { ...WELL_FORMED, block: { article: "logistics" } };
        const v = validate(JSON.stringify(withBlock));
        expect(v.state).toBe("valid");
        if (v.state === "valid") {
            expect(v.raw.block).toEqual({ article: "logistics" });
        }
    });

    it("malformed spec (missing clauseId) → invalid, with a per-path error", () => {
        const { clauseId: _omit, ...missingId } = WELL_FORMED;
        const v = validate(JSON.stringify(missingId));
        expect(v.state).toBe("invalid");
        if (v.state === "invalid") {
            expect(v.errors.length).toBeGreaterThan(0);
            expect(v.errors.some((e) => e.path === "$.clauseId")).toBe(true);
        }
    });

    it("malformed spec (bad field) → invalid, path points at the offending field", () => {
        const badField = { ...WELL_FORMED, fields: [{ name: "note", type: "nonsense", required: true }] };
        const v = validate(JSON.stringify(badField));
        expect(v.state).toBe("invalid");
        if (v.state === "invalid") {
            expect(v.errors.some((e) => e.path.startsWith("$.fields[0]"))).toBe(true);
        }
    });
});

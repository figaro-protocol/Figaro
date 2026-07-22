import { describe, expect, it } from "vitest";
import { parseClauseSpec } from "../../src/clauses/spec.js";
import { validateContent } from "../../src/clauses/validate.js";

function specOf(fields: object[], stages?: Record<number, object[]>) {
    const result = parseClauseSpec({
        clauseId: "t", version: 1, title: "T", description: "D",
        fields,
        ...(stages !== undefined && { stages }),
    });
    if (!result.ok) throw new Error("test setup: spec failed to parse: " + JSON.stringify(result.errors));
    return result.spec;
}

describe("validateContent — happy paths", () => {
    it("accepts a valid object with all required fields", () => {
        const spec = specOf([
            { name: "name", type: "string", required: true, minLength: 1 },
            { name: "age", type: "integer", required: true, min: 0 },
        ]);
        expect(validateContent({ name: "Ada", age: 30 }, spec).ok).toBe(true);
    });

    it("permits optional fields to be missing", () => {
        const spec = specOf([
            { name: "x", type: "string", required: true },
            { name: "y", type: "boolean", required: false },
        ]);
        expect(validateContent({ x: "ok" }, spec).ok).toBe(true);
    });

    it("validates bytes32-hex format", () => {
        const spec = specOf([
            { name: "h", type: "string", required: true, format: "bytes32-hex" },
        ]);
        const valid = "0x" + "ab".repeat(32);
        expect(validateContent({ h: valid }, spec).ok).toBe(true);
    });

    it("validates address-hex format", () => {
        const spec = specOf([
            { name: "a", type: "string", required: true, format: "address-hex" },
        ]);
        expect(validateContent({ a: "0x" + "0".repeat(40) }, spec).ok).toBe(true);
        expect(validateContent({ a: "0x" + "0".repeat(39) }, spec).ok).toBe(false);
    });

    it("an unknown (permissionlessly-declared) format validates as a plain string — the open format axis", () => {
        const spec = specOf([
            { name: "loc", type: "string", required: true, format: "geohash" },
        ]);
        expect(validateContent({ loc: "9q8yyk8yu" }, spec).ok).toBe(true);
        // Non-strings still fail on TYPE, not format.
        expect(validateContent({ loc: 42 }, spec).ok).toBe(false);
    });

    it("validates bigint as decimal string", () => {
        const spec = specOf([
            { name: "amount", type: "bigint", required: true, min: "0", max: "1000000000000000000000" },
        ]);
        expect(validateContent({ amount: "500000000000000000000" }, spec).ok).toBe(true);
        expect(validateContent({ amount: "-1" }, spec).ok).toBe(false);
        expect(validateContent({ amount: "9999999999999999999999" }, spec).ok).toBe(false);
    });

    it("validates enum values", () => {
        const spec = specOf([
            { name: "color", type: "enum", required: true, values: ["red", "green", "blue"] },
        ]);
        expect(validateContent({ color: "red" }, spec).ok).toBe(true);
        expect(validateContent({ color: "yellow" }, spec).ok).toBe(false);
    });

    it("validates array items recursively", () => {
        const spec = specOf([
            {
                name: "tags", type: "array", required: true,
                items: { type: "string", name: "*", required: true, minLength: 1 },
                minItems: 1, maxItems: 5,
            },
        ]);
        expect(validateContent({ tags: ["a", "b"] }, spec).ok).toBe(true);
        expect(validateContent({ tags: [] }, spec).ok).toBe(false);
        expect(validateContent({ tags: ["a", "b", "c", "d", "e", "f"] }, spec).ok).toBe(false);
        expect(validateContent({ tags: ["a", ""] }, spec).ok).toBe(false);
    });

    it("enforces a safe pattern, but SKIPS a catastrophic one (ReDoS screen — Rust-mirror conformance)", () => {
        // A safe pattern is enforced.
        const safe = specOf([{ name: "s", type: "string", required: true, pattern: "^a+$" }]);
        expect(validateContent({ s: "aaa" }, safe).ok).toBe(true);
        expect(validateContent({ s: "aab" }, safe).ok).toBe(false);

        // A ReDoS-shaped pattern (nested quantifiers) is skipped → satisfied,
        // for both a would-match and a would-not-match input. The Rust prover
        // mirror (prover/clause conformance test) accepts the same cases, so
        // the batch-settlement path stays conformant.
        const evil = specOf([{ name: "s", type: "string", required: true, pattern: "(a+)+$" }]);
        expect(validateContent({ s: "aaaa" }, evil).ok).toBe(true);
        expect(validateContent({ s: "a".repeat(40) }, evil).ok).toBe(true);
    });

    it("validates nested objects", () => {
        const spec = specOf([
            {
                name: "loc", type: "object", required: true,
                fields: [
                    { name: "lat", type: "integer", required: true, min: -90, max: 90 },
                    { name: "lon", type: "integer", required: true, min: -180, max: 180 },
                ],
            },
        ]);
        expect(validateContent({ loc: { lat: 40, lon: -74 } }, spec).ok).toBe(true);
        expect(validateContent({ loc: { lat: 91, lon: 0 } }, spec).ok).toBe(false);
    });

    it("rejects missing required fields", () => {
        const spec = specOf([
            { name: "x", type: "string", required: true },
        ]);
        const result = validateContent({}, spec);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors[0].path).toBe("$.x");
    });

    it("rejects unknown fields not declared in clause", () => {
        const spec = specOf([
            { name: "x", type: "string", required: true },
        ]);
        const result = validateContent({ x: "ok", extra: "nope" }, spec);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors.some(e => e.message.includes("unknown field"))).toBe(true);
    });

    it("uses stage override when provided", () => {
        const spec = specOf(
            [{ name: "x", type: "string", required: true }],
            { 1: [{ name: "x", type: "string", required: true }, { name: "y", type: "boolean", required: true }] },
        );
        expect(validateContent({ x: "ok" }, spec).ok).toBe(true);
        expect(validateContent({ x: "ok" }, spec, { stage: 1 }).ok).toBe(false);
        expect(validateContent({ x: "ok", y: true }, spec, { stage: 1 }).ok).toBe(true);
    });

    it("falls back to default fields when stage has no override", () => {
        const spec = specOf(
            [{ name: "x", type: "string", required: true }],
            { 1: [{ name: "x", type: "string", required: true }, { name: "y", type: "boolean", required: true }] },
        );
        expect(validateContent({ x: "ok" }, spec, { stage: 5 }).ok).toBe(true);
    });
});

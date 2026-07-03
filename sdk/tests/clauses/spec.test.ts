import { describe, expect, it } from "vitest";
import { parseClauseSpec } from "../../src/clauses/spec.js";

describe("parseClauseSpec — meta-clause validation", () => {
    it("accepts a minimal valid spec", () => {
        const result = parseClauseSpec({
            clauseId: "test-v1",
            version: 1,
            title: "Test",
            description: "A minimal test spec.",
            fields: [
                { name: "x", type: "string", required: true },
            ],
        });
        expect(result.ok).toBe(true);
    });

    it("rejects a non-object input", () => {
        const result = parseClauseSpec("not an object");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors[0].path).toBe("$");
    });

    it("rejects missing clauseId", () => {
        const result = parseClauseSpec({
            version: 1, title: "T", description: "D", fields: [],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors.some(e => e.path === "$.clauseId")).toBe(true);
    });

    it("rejects unknown field type", () => {
        const result = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "wat", required: true }],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors[0].path).toBe("$.fields[0].type");
    });

    it("accepts any string as a format — the axis is OPEN (a closed set would make a third-party clause with a novel format unparseable)", () => {
        const known = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "addr", type: "string", required: true, format: "address-hex" }],
        });
        expect(known.ok).toBe(true);

        const novel = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "loc", type: "string", required: true, format: "geohash" }],
        });
        expect(novel.ok).toBe(true);

        // Only the SHAPE of the declaration is checked.
        const malformed = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "string", required: true, format: 7 }],
        });
        expect(malformed.ok).toBe(false);
        const empty = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "string", required: true, format: "" }],
        });
        expect(empty.ok).toBe(false);
    });

    it("recursively parses array.items", () => {
        const result = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{
                name: "tags", type: "array", required: true,
                items: { type: "string", name: "*", required: true },
            }],
        });
        expect(result.ok).toBe(true);
    });

    it("recursively parses object.fields", () => {
        const result = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{
                name: "loc", type: "object", required: true,
                fields: [
                    { name: "lat", type: "integer", required: true },
                    { name: "lon", type: "integer", required: true },
                ],
            }],
        });
        expect(result.ok).toBe(true);
    });

    it("validates enum requires non-empty values array", () => {
        const result = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "enum", required: true, values: [] }],
        });
        expect(result.ok).toBe(false);
    });

    it("parses stage overrides", () => {
        const result = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "string", required: true }],
            stages: {
                1: [{ name: "x", type: "string", required: true },
                    { name: "extra", type: "boolean", required: false }],
            },
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.spec.stages?.[1].length).toBe(2);
    });

    it("rejects bigint min/max as a number (must be string)", () => {
        const result = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "amount", type: "bigint", required: true, min: 0 }],
        });
        expect(result.ok).toBe(false);
    });

    it("rejects invalid regex pattern", () => {
        const result = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "string", required: true, pattern: "(unclosed" }],
        });
        expect(result.ok).toBe(false);
    });

    // NOTE: the `block` slice (designer/runtime composition metadata) is no longer
    // parsed by the SDK — it's frontend-owned presentation. parseClauseSpec ignores
    // it. Its parser (`parseBlockBinding`) and tests live in the frontend:
    // frontend/lib/shared/clauseBlockBinding.ts + frontend/tests/lib/clauseBlockBinding.test.ts.
    it("ignores the block slice (frontend-owned) without failing", () => {
        const result = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "string", required: true }],
            block: { tier: "runtime", mechanismKinds: [], moduleIds: [], attestation: "seller" },
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect("block" in result.spec).toBe(false);
    });

    // The generic build encoder fills absent optional input from FieldSpec
    // `default` — round-trip it and reject shape mismatches.
    it("preserves a type-matching field default through the parse", () => {
        const result = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [
                { name: "scope", type: "integer", min: 1, max: 3, required: false, default: 1 },
                { name: "coordination", type: "array", required: false, default: ["a"], items: { type: "enum", values: ["a", "b"] } },
            ],
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.spec.fields[0].default).toBe(1);
            expect(result.spec.fields[1].default).toEqual(["a"]);
        }
    });

    it("rejects a default that violates the field's type or constraints", () => {
        for (const field of [
            { name: "scope", type: "integer", min: 1, required: false, default: 0 },
            { name: "court", type: "enum", values: ["a", "b"], required: false, default: "c" },
            { name: "obj", type: "object", fields: [], required: false, default: "x" },
        ]) {
            const result = parseClauseSpec({
                clauseId: "t-v1", version: 1, title: "T", description: "D", fields: [field],
            });
            expect(result.ok, `default on ${field.name} must be rejected`).toBe(false);
        }
    });

    // Enum `sentinel` names the ABI position-as-index placeholder (e.g.
    // klerosCourt "none") — a member value that is never valid input.
    it("preserves an enum sentinel and rejects a non-member sentinel", () => {
        const ok = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "court", type: "enum", values: ["none", "a"], sentinel: "none", required: true }],
        });
        expect(ok.ok).toBe(true);
        if (ok.ok) {
            const f = ok.spec.fields[0];
            expect(f.type === "enum" && f.sentinel).toBe("none");
        }

        const bad = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "court", type: "enum", values: ["a"], sentinel: "zzz", required: true }],
        });
        expect(bad.ok).toBe(false);
    });

    it("rejects a default equal to the enum sentinel", () => {
        const result = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "court", type: "enum", values: ["none", "a"], sentinel: "none", default: "none", required: false }],
        });
        expect(result.ok).toBe(false);
    });
});

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

    it("validates string format values", () => {
        const ok = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "addr", type: "string", required: true, format: "address-hex" }],
        });
        expect(ok.ok).toBe(true);

        const bad = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "string", required: true, format: "ipv6" }],
        });
        expect(bad.ok).toBe(false);
    });

    it("accepts spec with categories array", () => {
        const result = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            categories: ["emissions", "lifecycle"],
            fields: [{ name: "x", type: "string", required: true }],
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.spec.categories).toEqual(["emissions", "lifecycle"]);
    });

    it("omits categories when absent", () => {
        const result = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "string", required: true }],
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.spec.categories).toBeUndefined();
    });

    it("rejects non-array categories", () => {
        const result = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            categories: "emissions",
            fields: [{ name: "x", type: "string", required: true }],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors[0].path).toBe("$.categories");
    });

    it("rejects empty-string category entries", () => {
        const result = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            categories: ["emissions", ""],
            fields: [{ name: "x", type: "string", required: true }],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors[0].path).toBe("$.categories[1]");
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

    // The drawer's cross-clause nesting (e.g. figaro-proximity-policy-v1 under the
    // hand-off clause's `handoff` field) is read from block.nestsUnder. The parser
    // MUST round-trip it — dropping it silently makes the nested clause invisible.
    it("preserves block.nestsUnder through the parse", () => {
        const result = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "bands", type: "string", required: true }],
            block: { tier: "category-2", drawerArticle: "fulfilment", mechanismKinds: [], moduleIds: [], nestsUnder: "handoff" },
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.spec.block?.nestsUnder).toBe("handoff");
    });

    it("rejects an empty-string block.nestsUnder", () => {
        const result = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "string", required: true }],
            block: { tier: "category-2", mechanismKinds: [], moduleIds: [], nestsUnder: "" },
        });
        expect(result.ok).toBe(false);
    });

    // Structural clauses (commerce, topology) are composed on every order by the
    // build, never offered as a designer choice. Generic surfaces read this flag
    // to exclude them — it MUST round-trip through the parse.
    it("preserves block.structural through the parse", () => {
        const result = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "string", required: true }],
            block: { tier: "category-2", mechanismKinds: [], moduleIds: [], structural: true },
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.spec.block?.structural).toBe(true);
    });

    it("rejects a non-boolean block.structural", () => {
        const result = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "string", required: true }],
            block: { tier: "category-2", mechanismKinds: [], moduleIds: [], structural: "yes" },
        });
        expect(result.ok).toBe(false);
    });

    // The generic runtime engine reads block.attestation to surface a clause's
    // attestation to the right party/parties (seller, or bilateral), no names.
    it("preserves block.attestation through the parse", () => {
        const result = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "band", type: "enum", values: ["zone-wifi"], required: true }],
            block: { tier: "category-1", mechanismKinds: [], moduleIds: [], attestation: "bilateral" },
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.spec.block?.attestation).toBe("bilateral");
    });

    it("rejects an invalid block.attestation", () => {
        const result = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "string", required: true }],
            block: { tier: "category-1", mechanismKinds: [], moduleIds: [], attestation: "buyer" },
        });
        expect(result.ok).toBe(false);
    });

    // The generic engine reads block.handoffStages to pair a proximity cross-witness
    // at the physical hand-off stages of a lifecycle clause — round-trip it.
    it("preserves block.handoffStages through the parse", () => {
        const result = parseClauseSpec({
            clauseId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "eventType", type: "enum", values: ["a", "handed-off"], required: true }],
            block: { tier: "category-1", mechanismKinds: [], moduleIds: [], handoffStages: ["handed-off"] },
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.spec.block?.handoffStages).toEqual(["handed-off"]);
    });
});

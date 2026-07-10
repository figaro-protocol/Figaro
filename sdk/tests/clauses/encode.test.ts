import { describe, expect, it } from "vitest";
import { decodeAbiParameters } from "viem";
import { decodeContentFromSpec, encodeContentFromSpec } from "../../src/clauses/encode.js";
import { parseClauseSpec } from "../../src/clauses/spec.js";
import { validateContent } from "../../src/clauses/validate.js";

// The encoder is clause-agnostic; these specs are synthetic. Stage selection
// must mirror validateContent's: a declared `stages[N]` override drives the
// encoding, an undeclared stage falls back to the default fields.
function specOf(fields: object[], stages?: Record<number, object[]>) {
    const result = parseClauseSpec({
        clauseId: "t-v1", version: 1, title: "T", description: "D",
        fields,
        ...(stages !== undefined && { stages }),
    });
    if (!result.ok) throw new Error("test setup: spec failed to parse: " + JSON.stringify(result.errors));
    return result.spec;
}

describe("encodeContentFromSpec — stage selection", () => {
    const spec = specOf(
        [{ name: "x", type: "string", required: true }],
        { 1: [
            { name: "grams", type: "integer", required: true, min: 0 },
            { name: "evidenceUri", type: "string", required: false },
        ] },
    );

    it("encodes against the declared stage override", () => {
        const bytes = encodeContentFromSpec(spec, { grams: 1200 }, { stage: 1 });
        const [grams, evidenceUri] = decodeAbiParameters(
            [{ type: "uint256" }, { type: "string" }],
            bytes,
        );
        expect(grams).toBe(1200n);
        expect(evidenceUri).toBe(""); // absent optional → ABI zero-value
    });

    it("falls back to default fields when the stage has no override", () => {
        const bytes = encodeContentFromSpec(spec, { x: "ok" }, { stage: 5 });
        const [x] = decodeAbiParameters([{ type: "string" }], bytes);
        expect(x).toBe("ok");
    });

    it("encodes default fields when no stage is passed", () => {
        const bytes = encodeContentFromSpec(spec, { x: "ok" });
        const [x] = decodeAbiParameters([{ type: "string" }], bytes);
        expect(x).toBe("ok");
    });

    it("throws on a required stage field absent from content", () => {
        expect(() => encodeContentFromSpec(spec, {}, { stage: 1 }))
            .toThrow(/grams: required field is absent/);
    });

    it("decodeContentFromSpec round-trips encoded stage content", () => {
        const bytes = encodeContentFromSpec(
            spec,
            { grams: 1200, evidenceUri: "ipfs://bafy" },
            { stage: 1 },
        );
        expect(decodeContentFromSpec(spec, bytes, { stage: 1 }))
            .toEqual({ grams: 1200, evidenceUri: "ipfs://bafy" });
        // Default-field content round-trips without a stage.
        const defaultBytes = encodeContentFromSpec(spec, { x: "ok" });
        expect(decodeContentFromSpec(spec, defaultBytes)).toEqual({ x: "ok" });
    });

    it("decodeContentFromSpec maps enum ordinals and nested shapes back to JSON", () => {
        const rich = specOf([
            { name: "band", type: "enum", required: true, values: ["zone-wifi", "nearby-ble"] },
            { name: "docs", type: "array", required: false, items: {
                type: "object", fields: [
                    { name: "title", type: "string", required: true },
                    { name: "pinned", type: "boolean", required: true },
                ],
            } },
        ]);
        const content = { band: "nearby-ble", docs: [{ title: "record", pinned: true }] };
        const bytes = encodeContentFromSpec(rich, content);
        expect(decodeContentFromSpec(rich, bytes)).toEqual(content);
    });

    it("agrees with validateContent on the same stage selection", () => {
        // Content valid at stage 1 but not at the default fields — both
        // layers must pick the same field set for the same stage input.
        const content = { grams: 42 };
        expect(validateContent(content, spec, { stage: 1 }).ok).toBe(true);
        expect(validateContent(content, spec).ok).toBe(false);
        expect(() => encodeContentFromSpec(spec, content, { stage: 1 })).not.toThrow();
        expect(() => encodeContentFromSpec(spec, content)).toThrow();
    });
});

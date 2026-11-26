import { describe, it, expect } from "vitest";
import { parseEachFieldSpec, type SpecParseError } from "../../src/clauses/index.js";

describe("parseEachFieldSpec — a list of field specs, element i at path[i]", () => {
    it("returns every well-formed field spec, in order", () => {
        const errors: SpecParseError[] = [];
        const fields = parseEachFieldSpec(
            [{ name: "a", type: "string", required: true }, { name: "b", type: "boolean", required: false }],
            "$.fields",
            errors,
        );
        expect(errors).toEqual([]);
        expect(fields.map((f) => f.name)).toEqual(["a", "b"]);
    });

    it("parses every element, reports each malformed one at its own index, and leaves it out", () => {
        const errors: SpecParseError[] = [];
        const fields = parseEachFieldSpec(
            [{ name: "a", type: "nope" }, { name: "b", type: "string", required: true }, 7],
            "$.x",
            errors,
        );
        expect(fields.map((f) => f.name)).toEqual(["b"]);
        expect(errors.some((e) => e.path.startsWith("$.x[0]"))).toBe(true);
        expect(errors.some((e) => e.path.startsWith("$.x[2]"))).toBe(true);
        expect(errors.some((e) => e.path.startsWith("$.x[1]"))).toBe(false);
    });
});

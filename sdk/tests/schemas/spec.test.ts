import { describe, expect, it } from "vitest";
import { parseSchemaSpec } from "../../src/schemas/spec.js";

describe("parseSchemaSpec — meta-schema validation", () => {
    it("accepts a minimal valid spec", () => {
        const result = parseSchemaSpec({
            schemaId: "test-v1",
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
        const result = parseSchemaSpec("not an object");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors[0].path).toBe("$");
    });

    it("rejects missing schemaId", () => {
        const result = parseSchemaSpec({
            version: 1, title: "T", description: "D", fields: [],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors.some(e => e.path === "$.schemaId")).toBe(true);
    });

    it("rejects unknown field type", () => {
        const result = parseSchemaSpec({
            schemaId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "wat", required: true }],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors[0].path).toBe("$.fields[0].type");
    });

    it("validates string format values", () => {
        const ok = parseSchemaSpec({
            schemaId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "addr", type: "string", required: true, format: "address-hex" }],
        });
        expect(ok.ok).toBe(true);

        const bad = parseSchemaSpec({
            schemaId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "string", required: true, format: "ipv6" }],
        });
        expect(bad.ok).toBe(false);
    });

    it("accepts spec with categories array", () => {
        const result = parseSchemaSpec({
            schemaId: "t-v1", version: 1, title: "T", description: "D",
            categories: ["emissions", "lifecycle"],
            fields: [{ name: "x", type: "string", required: true }],
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.spec.categories).toEqual(["emissions", "lifecycle"]);
    });

    it("omits categories when absent", () => {
        const result = parseSchemaSpec({
            schemaId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "string", required: true }],
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.spec.categories).toBeUndefined();
    });

    it("rejects non-array categories", () => {
        const result = parseSchemaSpec({
            schemaId: "t-v1", version: 1, title: "T", description: "D",
            categories: "emissions",
            fields: [{ name: "x", type: "string", required: true }],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors[0].path).toBe("$.categories");
    });

    it("rejects empty-string category entries", () => {
        const result = parseSchemaSpec({
            schemaId: "t-v1", version: 1, title: "T", description: "D",
            categories: ["emissions", ""],
            fields: [{ name: "x", type: "string", required: true }],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors[0].path).toBe("$.categories[1]");
    });

    it("recursively parses array.items", () => {
        const result = parseSchemaSpec({
            schemaId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{
                name: "tags", type: "array", required: true,
                items: { type: "string", name: "*", required: true },
            }],
        });
        expect(result.ok).toBe(true);
    });

    it("recursively parses object.fields", () => {
        const result = parseSchemaSpec({
            schemaId: "t-v1", version: 1, title: "T", description: "D",
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
        const result = parseSchemaSpec({
            schemaId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "enum", required: true, values: [] }],
        });
        expect(result.ok).toBe(false);
    });

    it("parses stage overrides", () => {
        const result = parseSchemaSpec({
            schemaId: "t-v1", version: 1, title: "T", description: "D",
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
        const result = parseSchemaSpec({
            schemaId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "amount", type: "bigint", required: true, min: 0 }],
        });
        expect(result.ok).toBe(false);
    });

    it("rejects invalid regex pattern", () => {
        const result = parseSchemaSpec({
            schemaId: "t-v1", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "string", required: true, pattern: "(unclosed" }],
        });
        expect(result.ok).toBe(false);
    });
});

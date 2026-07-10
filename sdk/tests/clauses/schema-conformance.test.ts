// Conformance corpus: the published clause-spec JSON Schema
// (`sdk/src/clauses/clause-spec.schema.json`) and the reference parser
// (`parseClauseSpec`) MUST agree. If they drift, a contributor who validates
// against the published schema could write a clause the parser rejects (or vice
// versa) — the exact "the schema is undefined" gap this artifact closes.
//
// Positive corpus: every shipped example spec must pass BOTH.
// Negative corpus: a malformed spec must fail BOTH.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { parseClauseSpec } from "../../src/clauses/spec";
import schema from "../../src/clauses/clause-spec.schema.json";

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateAgainstSchema = ajv.compile(schema);

const examplesDir = join(__dirname, "../../../clauses");
const exampleFiles = readdirSync(examplesDir).filter((f) => f.endsWith(".json"));

describe("clause-spec.schema.json <-> parseClauseSpec conformance", () => {
    it("the canonical clause set is present (floor guard, not a census — `ls clauses/` derives the count)", () => {
        expect(exampleFiles.length).toBeGreaterThanOrEqual(16);
    });

    it.each(exampleFiles)("%s validates against BOTH the published schema and the parser", (file) => {
        const spec = JSON.parse(readFileSync(join(examplesDir, file), "utf8"));
        const schemaOk = validateAgainstSchema(spec);
        expect(schemaOk, `schema rejected ${file}: ${JSON.stringify(validateAgainstSchema.errors)}`).toBe(true);
        expect(parseClauseSpec(spec).ok, `parser rejected ${file}`).toBe(true);
    });

    const negatives: ReadonlyArray<readonly [string, unknown]> = [
        ["missing clauseId", { version: 1, title: "T", description: "D", fields: [] }],
        ["enum field with no values", { clauseId: "x-v1", version: 1, title: "T", description: "D", fields: [{ name: "s", type: "enum", required: true }] }],
        ["array field with no items", { clauseId: "x-v1", version: 1, title: "T", description: "D", fields: [{ name: "a", type: "array", required: true }] }],
    ];
    it.each(negatives)("rejects (%s) in BOTH schema and parser", (_name, spec) => {
        expect(validateAgainstSchema(spec)).toBe(false);
        expect(parseClauseSpec(spec).ok).toBe(false);
    });

    // `block` is presentation metadata the SDK parser does NOT own (see spec.ts) —
    // it is validated by this schema and the frontend's clauseBlockBinding, never by
    // parseClauseSpec. So a malformed block (e.g. missing the required article) is a
    // SCHEMA-level rejection only; the parser is silent on block by design.
    it("rejects a block missing the required article at the schema (the parser does not own block)", () => {
        const spec = { clauseId: "x-v1", version: 1, title: "T", description: "D", fields: [], block: { mechanismKinds: [] } };
        expect(validateAgainstSchema(spec)).toBe(false);
    });
});

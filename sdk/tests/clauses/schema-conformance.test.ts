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
        ["enum field with no values", { clauseId: "x", version: 1, title: "T", description: "D", fields: [{ name: "s", type: "enum", required: true }] }],
        ["array field with no items", { clauseId: "x", version: 1, title: "T", description: "D", fields: [{ name: "a", type: "array", required: true }] }],
    ];
    it.each(negatives)("rejects (%s) in BOTH schema and parser", (_name, spec) => {
        expect(validateAgainstSchema(spec)).toBe(false);
        expect(parseClauseSpec(spec).ok).toBe(false);
    });

    // `block` is presentation metadata the SDK parser does NOT own (see spec.ts) —
    // it is validated by this schema and the frontend's clauseBlockBinding, never by
    // parseClauseSpec. So a malformed block (e.g. missing the required design
    // section, or a design without its article) is a SCHEMA-level rejection only;
    // the parser is silent on block by design.
    it("rejects a block missing the required design.article at the schema (the parser does not own block)", () => {
        const noDesign = { clauseId: "x", version: 1, title: "T", description: "D", fields: [], block: {} };
        expect(validateAgainstSchema(noDesign)).toBe(false);
        const noArticle = { clauseId: "x", version: 1, title: "T", description: "D", fields: [], block: { design: {} } };
        expect(validateAgainstSchema(noArticle)).toBe(false);
    });

    // THE STANDARD (operator ruling 2026-07-28): the repo's own clause corpus
    // expresses every standard attribute explicitly — zero, empty, or null,
    // never absent. Consumers still treat an absent attribute as its empty
    // value (resolved-empty = absence — a sparser third-party spec surfaces
    // fine); this bar binds OUR specs, so an author reading any of them sees
    // the full attribute set.
    it.each(exampleFiles)("%s expresses every standard attribute (zero/empty/null, never absent)", (file) => {
        const spec = JSON.parse(readFileSync(join(examplesDir, file), "utf8"));
        for (const key of ["clauseId", "version", "title", "description", "rpgfTag", "fields", "stages", "block"]) {
            expect(key in spec, `${file}: top-level ${key} must be expressed`).toBe(true);
        }
        for (const key of ["design", "checkout", "runtime"]) {
            expect(key in spec.block, `${file}: block.${key} must be expressed`).toBe(true);
        }
        for (const key of ["article", "nestsUnder", "fills", "composes"]) {
            expect(key in spec.block.design, `${file}: block.design.${key} must be expressed`).toBe(true);
        }
        for (const key of ["catalogueFills", "profileFills"]) {
            expect(key in spec.block.checkout, `${file}: block.checkout.${key} must be expressed`).toBe(true);
        }
        for (const key of ["interaction", "fields", "handoffStages"]) {
            expect(key in spec.block.runtime, `${file}: block.runtime.${key} must be expressed`).toBe(true);
        }
    });
});

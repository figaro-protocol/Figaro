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

    // The blinding field of a private set: one per private set, of one shape,
    // at the top level of its set, and only where the set holds another
    // private field. The schema and the parser state the same rules.
    const blinding = { name: "blinding", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true };
    const secret = { name: "secret", type: "string", required: true, disposition: "private" };
    const open = { name: "open", type: "string", required: true };
    const withFields = (fields: unknown[], stages?: Record<string, unknown[]>) => ({
        clauseId: "x", version: 1, title: "T", description: "D", fields, ...(stages !== undefined && { stages }),
    });
    const blindingPositives: ReadonlyArray<readonly [string, unknown]> = [
        ["a private set with its blinding field", withFields([secret, blinding])],
        ["a public set beside a private stage set with its blinding field", withFields([open], { "1": [secret, blinding] })],
        ["a private object holding a private field, with the set's blinding field", withFields([{ name: "o", type: "object", required: true, disposition: "private", fields: [secret] }, blinding])],
    ];
    it.each(blindingPositives)("accepts (%s) in BOTH schema and parser", (_name, spec) => {
        expect(validateAgainstSchema(spec), JSON.stringify(validateAgainstSchema.errors)).toBe(true);
        expect(parseClauseSpec(spec).ok).toBe(true);
    });
    const blindingNegatives: ReadonlyArray<readonly [string, unknown]> = [
        ["a private set with no blinding field", withFields([secret])],
        ["a private set with two blinding fields", withFields([secret, blinding, { ...blinding, name: "b2" }])],
        ["a blinding field with no other private field", withFields([blinding])],
        ["a set that mixes public and private fields", withFields([open, secret, blinding])],
        ["a blinding field with a default", withFields([secret, { ...blinding, default: `0x${"11".repeat(32)}` }])],
        ["a blinding field not required", withFields([secret, { ...blinding, required: false }])],
        ["a blinding field of another format", withFields([secret, { ...blinding, format: "bytes-hex" }])],
        ["a blinding field of another type", withFields([secret, { ...blinding, type: "bigint", format: undefined }])],
        ["a public blinding field", withFields([secret, { ...blinding, disposition: "public" }])],
        ["a blinding attribute that is false", withFields([secret, blinding, { ...secret, name: "s2", blinding: false }])],
        ["a nested blinding field", withFields([secret, blinding, { name: "o", type: "object", required: true, disposition: "private", fields: [blinding] }])],
        ["a private stage set with no blinding field", withFields([open], { "1": [secret] })],
        ["a stage set that mixes public and private fields", withFields([open], { "1": [open, secret, blinding] })],
        // A private field nested in a public one counts its top-level field as private.
        ["a private field nested in a public object, no blinding field", withFields([{ name: "o", type: "object", required: true, fields: [secret] }])],
        ["a private field nested in a public object, with a blinding field", withFields([{ name: "o", type: "object", required: true, fields: [secret] }, blinding])],
        ["a private array item in a public array, with a blinding field", withFields([{ name: "a", type: "array", required: true, items: { type: "string", disposition: "private" } }, blinding])],
        ["a private field two objects deep in a public object, with a blinding field", withFields([{ name: "o", type: "object", required: true, fields: [{ name: "p", type: "object", required: true, fields: [secret] }] }, blinding])],
    ];
    it.each(blindingNegatives)("rejects (%s) in BOTH schema and parser", (_name, spec) => {
        expect(validateAgainstSchema(JSON.parse(JSON.stringify(spec)))).toBe(false);
        expect(parseClauseSpec(JSON.parse(JSON.stringify(spec))).ok).toBe(false);
    });

    // An enum encodes as uint8, so it names at most 256 values; the schema
    // and the parser hold the same bound.
    const enumOf = (count: number) => withFields([
        { name: "e", type: "enum", required: true, values: Array.from({ length: count }, (_, i) => `v${i}`) },
    ]);
    it("accepts an enum of 256 values in BOTH schema and parser", () => {
        expect(validateAgainstSchema(enumOf(256)), JSON.stringify(validateAgainstSchema.errors)).toBe(true);
        expect(parseClauseSpec(enumOf(256)).ok).toBe(true);
    });
    it("rejects an enum of 257 values in BOTH schema and parser", () => {
        expect(validateAgainstSchema(enumOf(257))).toBe(false);
        expect(parseClauseSpec(enumOf(257)).ok).toBe(false);
    });

    // Every integer a spec declares is within ±(2^53 − 1), and a length or a
    // count is not negative; the schema and the parser hold the same bounds.
    const safe = Number.MAX_SAFE_INTEGER;
    const integerField = (attrs: Record<string, unknown>) => withFields([{ name: "n", type: "integer", required: true, ...attrs }]);
    const stringField = (attrs: Record<string, unknown>) => withFields([{ name: "s", type: "string", required: true, ...attrs }]);
    const arrayField = (attrs: Record<string, unknown>) => withFields([{ name: "a", type: "array", required: true, items: { type: "string" }, ...attrs }]);
    const integerCases: ReadonlyArray<readonly [string, unknown, boolean]> = [
        ["a version of 2^53 − 1", { ...withFields([open]), version: safe }, true],
        ["a version of 2^53", { ...withFields([open]), version: safe + 1 }, false],
        ["an integer field bounded at ±(2^53 − 1)", integerField({ min: -safe, max: safe }), true],
        ["an integer field whose min is −2^53", integerField({ min: -safe - 1 }), false],
        ["an integer field whose max is 2^53", integerField({ max: safe + 1 }), false],
        ["an integer field whose max is a string", integerField({ max: "10" }), false],
        ["an integer field whose default is 2^53 − 1", integerField({ default: safe }), true],
        ["an integer field whose default is 2^53", integerField({ default: safe + 1 }), false],
        ["an integer field whose default is a string", integerField({ default: "5" }), false],
        ["a string field whose maxLength is 2^53 − 1", stringField({ maxLength: safe }), true],
        ["a string field whose maxLength is 2^53", stringField({ maxLength: safe + 1 }), false],
        ["a string field whose minLength is negative", stringField({ minLength: -1 }), false],
        ["an array field whose maxItems is 2^53", arrayField({ maxItems: safe + 1 }), false],
        ["an array field whose minItems is negative", arrayField({ minItems: -1 }), false],
    ];
    it.each(integerCases)("%s: accepted %s in BOTH schema and parser", (_name, spec, accepted) => {
        expect(validateAgainstSchema(spec), JSON.stringify(validateAgainstSchema.errors)).toBe(accepted);
        expect(parseClauseSpec(spec).ok).toBe(accepted);
    });

    // The empty anchor (`emptyAnchor`): present only as true, and never
    // beside a top-level field's default. The schema and the parser accept
    // and refuse the same specs.
    const ladder = { name: "event", type: "enum", required: true, values: ["a", "b"] };
    const emptyAnchorCases: ReadonlyArray<readonly [string, unknown, boolean]> = [
        ["a ladder that signs the empty anchor", { ...withFields([ladder]), emptyAnchor: true }, true],
        ["the empty anchor beside a stage set", { ...withFields([ladder], { "1": [open] }), emptyAnchor: true }, true],
        ["the empty anchor beside a stage field's default", { ...withFields([ladder], { "1": [{ ...open, default: "x" }] }), emptyAnchor: true }, true],
        ["emptyAnchor false", { ...withFields([ladder]), emptyAnchor: false }, false],
        ["emptyAnchor as a string", { ...withFields([ladder]), emptyAnchor: "true" }, false],
        ["the empty anchor beside a top-level default", { ...withFields([{ ...ladder, default: "a" }]), emptyAnchor: true }, false],
    ];
    it.each(emptyAnchorCases)("%s: accepted %s in BOTH schema and parser", (_name, spec, accepted) => {
        expect(validateAgainstSchema(spec), JSON.stringify(validateAgainstSchema.errors)).toBe(accepted);
        const parsed = parseClauseSpec(spec);
        expect(parsed.ok).toBe(accepted);
        if (parsed.ok) expect(parsed.spec.emptyAnchor).toBe(true);
    });

    // A stage key has one spelling, the decimal of an integer 0..255; the
    // schema and the parser accept the same keys.
    const stageKeys: ReadonlyArray<readonly [string, boolean]> = [
        ...Array.from({ length: 256 }, (_, n) => [String(n), true] as const),
        ...["01", "00", "000", "+1", " 1", "1 ", "1\n", "1.0", "0x1", "-0", "-1", "", "256", "260", "999", "1000", "1e1", "١", "a"]
            .map((key) => [key, false] as const),
    ];
    it.each(stageKeys)("stage key %j: accepted %s in BOTH schema and parser", (key, accepted) => {
        const spec = withFields([open], { [key]: [open] });
        expect(validateAgainstSchema(spec), JSON.stringify(validateAgainstSchema.errors)).toBe(accepted);
        expect(parseClauseSpec(spec).ok).toBe(accepted);
    });

    // `block` is presentation metadata the SDK parser does NOT own (see spec.ts) —
    // it is validated by this schema and the frontend's clauseBlockBinding, never by
    // parseClauseSpec. So a malformed block (e.g. missing the required design
    // clause, or a design without its article) is a SCHEMA-level rejection only;
    // the parser is silent on block by design.
    it("rejects a block missing the required design.article at the schema (the parser does not own block)", () => {
        const noDesign = { clauseId: "x", version: 1, title: "T", description: "D", fields: [], block: {} };
        expect(validateAgainstSchema(noDesign)).toBe(false);
        const noArticle = { clauseId: "x", version: 1, title: "T", description: "D", fields: [], block: { design: {} } };
        expect(validateAgainstSchema(noArticle)).toBe(false);
    });

    it("rejects a catalogueMeasures entry with no source field or an unknown combinator at the schema", () => {
        const withMeasures = (entry: unknown) => ({
            clauseId: "x", version: 1, title: "T", description: "D", fields: [],
            block: { design: { article: "logistics" }, checkout: { catalogueMeasures: { weight: entry } } },
        });
        expect(validateAgainstSchema(withMeasures({ from: "massGrams", combine: "sum" }))).toBe(true);
        expect(validateAgainstSchema(withMeasures({ from: "massGrams", combine: "average" }))).toBe(false);
        expect(validateAgainstSchema(withMeasures({ combine: "sum" }))).toBe(false);
    });

    // THE STANDARD (maintainer ruling): the repo's own clause corpus
    // expresses every standard attribute explicitly — zero, empty, or null,
    // never absent. Consumers still treat an absent attribute as its empty
    // value (resolved-empty = absence — a sparser third-party spec surfaces
    // fine); this bar binds OUR specs, so an author reading any of them sees
    // the full attribute set.
    it.each(exampleFiles)("%s expresses every standard attribute (zero/empty/null, never absent)", (file) => {
        const spec = JSON.parse(readFileSync(join(examplesDir, file), "utf8"));
        for (const key of ["clauseId", "version", "title", "description", "fields", "stages", "block"]) {
            expect(key in spec, `${file}: top-level ${key} must be expressed`).toBe(true);
        }
        for (const key of ["design", "checkout", "runtime"]) {
            expect(key in spec.block, `${file}: block.${key} must be expressed`).toBe(true);
        }
        for (const key of ["article", "scope", "nestsUnder", "fills", "composes"]) {
            expect(key in spec.block.design, `${file}: block.design.${key} must be expressed`).toBe(true);
        }
        for (const key of ["catalogueFills", "profileFills", "catalogueMeasures", "pricedLines", "derives", "timeWindow", "endpoints", "registerLink", "dataSources", "heldValues", "compositionFields"]) {
            expect(key in spec.block.checkout, `${file}: block.checkout.${key} must be expressed`).toBe(true);
        }
        for (const key of ["interaction", "modality", "jurisdiction", "documentPart", "ladder", "contentDigest"]) {
            expect(key in spec.block.runtime, `${file}: block.runtime.${key} must be expressed`).toBe(true);
        }
    });

    // Each part of `block` declares, in the schema, the attributes the
    // reference parser (`ClauseBlockBinding`, frontend/lib/shared/clauseBlockBinding.ts)
    // reads under that part, and no other. The lists are the parser's.
    it.each([
        ["blockDesign", ["article", "scope", "nestsUnder", "fills", "composes"]],
        ["blockCheckout", ["catalogueFills", "profileFills", "catalogueMeasures", "pricedLines", "derives", "timeWindow", "endpoints", "registerLink", "dataSources", "heldValues", "compositionFields"]],
        ["blockRuntime", ["interaction", "modality", "jurisdiction", "documentPart", "ladder", "contentDigest"]],
    ] as const)("the schema's %s declares the parser's attributes for that part", (def, keys) => {
        const props = (schema.$defs as Record<string, { properties: Record<string, unknown> }>)[def].properties;
        expect(Object.keys(props).sort()).toEqual([...keys].sort());
    });

    const withCheckout = (checkout: unknown) => ({
        clauseId: "x", version: 1, title: "T", description: "D", fields: [],
        block: { design: { article: "terms" }, checkout },
    });
    const checkoutCases: ReadonlyArray<readonly [string, unknown, boolean]> = [
        ["a priced-lines mark with its three roles", { pricedLines: { field: "lines", quantity: "q", unitPrice: "p" } }, true],
        ["a null priced-lines mark", { pricedLines: null }, true],
        ["a priced-lines mark without its unit price", { pricedLines: { field: "lines", quantity: "q" } }, false],
        ["a derivation over a field and a catalog measure", { derives: { w: { rule: "r", inputs: { a: { field: "f" }, b: { from: "massGrams", combine: "sum" } } } } }, true],
        ["a derivation with no rule", { derives: { w: { inputs: {} } } }, false],
        ["a derivation input that is both a field and a measure", { derives: { w: { rule: "r", inputs: { a: { field: "f", from: "m", combine: "sum" } } } } }, false],
        ["a derivation input with an unknown combinator", { derives: { w: { rule: "r", inputs: { a: { from: "m", combine: "average" } } } } }, false],
        ["a time-window mark naming its start and end", { timeWindow: { start: "fromAt", end: "toAt" } }, true],
        ["a null time-window mark", { timeWindow: null }, true],
        ["a time-window mark without its end", { timeWindow: { start: "fromAt" } }, false],
        ["an endpoints mark naming its origin and destination", { endpoints: { from: "pickup", to: "dropoff" } }, true],
        ["a null endpoints mark", { endpoints: null }, true],
        ["an endpoints mark with an empty destination", { endpoints: { from: "pickup", to: "" } }, false],
        ["a register-link mark naming its URI and its id", { registerLink: { uri: "lookupUrl", id: "badgeNo" } }, true],
        ["a null register-link mark", { registerLink: null }, true],
        ["a register-link mark without its id", { registerLink: { uri: "lookupUrl" } }, false],
        ["a data-sources mark naming a field", { dataSources: "upstreamRuns" }, true],
        ["a null data-sources mark", { dataSources: null }, true],
        ["an empty data-sources mark", { dataSources: "" }, false],
        ["composition fields of the content-field shape", { compositionFields: [{ name: "claim", type: "string", required: true }] }, true],
        ["composition fields that are not an array", { compositionFields: {} }, false],
    ];
    it.each(checkoutCases)("block.checkout with %s: accepted %s at the schema", (_name, checkout, accepted) => {
        expect(validateAgainstSchema(withCheckout(checkout)), JSON.stringify(validateAgainstSchema.errors)).toBe(accepted);
    });

    const withRuntime = (runtime: unknown) => ({
        clauseId: "x", version: 1, title: "T", description: "D", fields: [],
        block: { design: { article: "terms" }, runtime },
    });
    const runtimeCases: ReadonlyArray<readonly [string, unknown, boolean]> = [
        ["a modality mark naming a field", { modality: "howServed" }, true],
        ["a null modality mark", { modality: null }, true],
        ["an empty modality mark", { modality: "" }, false],
        ["a ladder mark naming a field", { ladder: "milestone" }, true],
        ["a null ladder mark", { ladder: null }, true],
        ["an empty ladder mark", { ladder: "" }, false],
        ["a jurisdiction mark naming the law alone", { jurisdiction: { law: "governedBy" } }, true],
        ["a jurisdiction mark naming the law, the forum and the language", { jurisdiction: { law: "governedBy", forum: "seat", language: "tongue" } }, true],
        ["a jurisdiction mark without its law", { jurisdiction: { forum: "seat" } }, false],
        ["a document section", { documentPart: "cargo" }, true],
        ["a null document section", { documentPart: null }, true],
        ["a content-digest mark naming its stage and field", { contentDigest: { stage: 2, field: "digest" } }, true],
        ["a content-digest mark whose stage is no stage", { contentDigest: { stage: 256, field: "digest" } }, false],
        ["a content-digest mark without its field", { contentDigest: { stage: 1 } }, false],
    ];
    it.each(runtimeCases)("block.runtime with %s: accepted %s at the schema", (_name, runtime, accepted) => {
        expect(validateAgainstSchema(withRuntime(runtime)), JSON.stringify(validateAgainstSchema.errors)).toBe(accepted);
    });
});

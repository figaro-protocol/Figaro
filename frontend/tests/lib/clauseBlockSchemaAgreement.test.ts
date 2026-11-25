/**
 * The validity of a clause's `block` has two definitions: this frontend's
 * parser (`parseBlockBinding`, `lib/shared/clauseBlockBinding.ts`) and the
 * published schema's `$defs.block` (`sdk/src/clauses/clause-spec.schema.json`).
 * Another frontend validates against the schema; this one reads with the
 * parser. Both must give one verdict on one input: every clause document
 * under `clauses/`, and a set of malformed blocks, each run through both.
 * And every attribute the parser reads must be declared in the schema's part
 * for the phase the parser reads it in.
 *
 * The schema is draft 2020-12; the frontend's own `ajv` is version 6, so the
 * SDK's `ajv` (version 8, `Ajv2020`) is loaded from the SDK's package, as the
 * SDK's own conformance test loads it (`sdk/tests/clauses/schema-conformance.test.ts`).
 */
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseBlockBinding } from "@/lib/shared/clauseBlockBinding";

const SDK_DIR = path.resolve(process.cwd(), "../sdk");
const requireFromSdk = createRequire(path.join(SDK_DIR, "package.json"));
const { Ajv2020 } = requireFromSdk("ajv/dist/2020.js") as typeof import("ajv/dist/2020.js");
const schema = JSON.parse(readFileSync(path.join(SDK_DIR, "src/clauses/clause-spec.schema.json"), "utf8")) as {
    $id: string;
    $defs: Record<string, { properties?: Record<string, { $ref?: string }> }>;
};
const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addSchema(schema);
const validateBlock = ajv.compile({ $ref: `${schema.$id}#/$defs/block` });

const schemaSays = (block: unknown): boolean => validateBlock(block) === true;
const parserSays = (block: unknown): boolean => parseBlockBinding(block, "block", []) !== null;

const CLAUSES_DIR = path.resolve(process.cwd(), "../clauses");
const clauseFiles = readdirSync(CLAUSES_DIR).filter((f) => f.endsWith(".json")).sort();

/** A well-formed block with every attribute present, each malformed case
 *  changes one thing of it. */
const FULL = {
    design: { article: "terms", scope: "agreement", nestsUnder: null, fills: ["a"], composes: null },
    checkout: {
        catalogueFills: ["b"],
        profileFills: ["c"],
        catalogueMeasures: { m: { from: "weight", combine: "sum" } },
        heldValues: {},
        pricedLines: { field: "lines", quantity: "qty", unitPrice: "price" },
        derives: {},
        timeWindow: { start: "s", end: "e" },
        endpoints: { from: "o", to: "d" },
        registerLink: { uri: "u", id: "i" },
        dataSources: "processes",
        compositionFields: [{ name: "x", type: "string", required: true }],
    },
    runtime: {
        interaction: { interface: "qr" },
        modality: "modality",
        jurisdiction: { law: "law" },
        documentPart: "cargo",
        ladder: "status",
        contentDigest: { stage: 1, field: "doc" },
    },
};
const withPart = (part: "design" | "checkout" | "runtime", over: Record<string, unknown>) =>
    ({ ...FULL, [part]: { ...FULL[part], ...over } });

const MALFORMED: ReadonlyArray<readonly [string, unknown]> = [
    ["block is not an object", "terms"],
    ["block is an array", []],
    ["no design", { checkout: FULL.checkout }],
    ["design is not an object", { design: "terms" }],
    ["no article", { design: { scope: "agreement" } }],
    ["empty article", withPart("design", { article: "" })],
    ["article is a number", withPart("design", { article: 3 })],
    ["scope outside its two values", withPart("design", { scope: "process" })],
    ["nestsUnder is a number", withPart("design", { nestsUnder: 3 })],
    ["fills is not an array", withPart("design", { fills: "a" })],
    ["fills holds an empty name", withPart("design", { fills: [""] })],
    ["composes is a string", withPart("design", { composes: "x" })],
    ["checkout is not an object", { ...FULL, checkout: [] }],
    ["catalogueFills holds a number", withPart("checkout", { catalogueFills: [1] })],
    ["profileFills is an object", withPart("checkout", { profileFills: {} })],
    ["catalogueMeasures entry names no from", withPart("checkout", { catalogueMeasures: { m: { combine: "sum" } } })],
    ["catalogueMeasures combine outside its values", withPart("checkout", { catalogueMeasures: { m: { from: "w", combine: "max" } } })],
    ["heldValues entry names no reader", withPart("checkout", { heldValues: { f: { contracts: {}, values: {} } } })],
    ["pricedLines names no unitPrice", withPart("checkout", { pricedLines: { field: "lines", quantity: "qty" } })],
    ["pricedLines field is empty", withPart("checkout", { pricedLines: { field: "", quantity: "qty", unitPrice: "p" } })],
    ["derives entry names no rule", withPart("checkout", { derives: { f: { inputs: [] } } })],
    ["timeWindow names no end", withPart("checkout", { timeWindow: { start: "s" } })],
    ["endpoints names no to", withPart("checkout", { endpoints: { from: "o" } })],
    ["registerLink names no id", withPart("checkout", { registerLink: { uri: "u" } })],
    ["dataSources is empty", withPart("checkout", { dataSources: "" })],
    ["dataSources is a number", withPart("checkout", { dataSources: 3 })],
    ["compositionFields is not an array", withPart("checkout", { compositionFields: {} })],
    ["compositionFields holds a field with no type", withPart("checkout", { compositionFields: [{ name: "x", required: true }] })],
    ["runtime is not an object", { ...FULL, runtime: "x" }],
    ["interaction names no interface", withPart("runtime", { interaction: {} })],
    ["interaction is a string", withPart("runtime", { interaction: "qr" })],
    ["modality is empty", withPart("runtime", { modality: "" })],
    ["jurisdiction names no law", withPart("runtime", { jurisdiction: { forum: "f" } })],
    ["documentPart is a number", withPart("runtime", { documentPart: 2 })],
    ["ladder is empty", withPart("runtime", { ladder: "" })],
    ["contentDigest stage above 255", withPart("runtime", { contentDigest: { stage: 256, field: "doc" } })],
    ["contentDigest stage is not an integer", withPart("runtime", { contentDigest: { stage: 1.5, field: "doc" } })],
    ["contentDigest names no field", withPart("runtime", { contentDigest: { stage: 1 } })],
    ["contentDigest stage is negative", withPart("runtime", { contentDigest: { stage: -1, field: "doc" } })],
    ["contentDigest field is empty", withPart("runtime", { contentDigest: { stage: 1, field: "" } })],
    ["checkout is null", { ...FULL, checkout: null }],
    ["runtime is null", { ...FULL, runtime: null }],
    ["scope is null", withPart("design", { scope: null })],
    ["catalogueMeasures is an array", withPart("checkout", { catalogueMeasures: [] })],
    ["catalogueMeasures from is empty", withPart("checkout", { catalogueMeasures: { m: { from: "", combine: "sum" } } })],
    ["heldValues contract under chain id 0", withPart("checkout", { heldValues: { f: { reader: "r", contracts: { "0": { a: `0x${"11".repeat(20)}` } }, values: {} } } })],
    ["heldValues contract that is no address", withPart("checkout", { heldValues: { f: { reader: "r", contracts: { "1": { a: "0x12" } }, values: {} } } })],
    ["heldValues value list that is empty", withPart("checkout", { heldValues: { f: { reader: "r", contracts: {}, values: { v: [] } } } })],
    ["heldValues value list holding an empty name", withPart("checkout", { heldValues: { f: { reader: "r", contracts: {}, values: { v: [""] } } } })],
    ["derives entry with inputs that are a list, not a map", withPart("checkout", { derives: { f: { rule: "r", inputs: [] } } })],
    ["derives input naming nothing", withPart("checkout", { derives: { f: { rule: "r", inputs: { a: {} } } } })],
    ["derives input naming both a field and a measure", withPart("checkout", { derives: { f: { rule: "r", inputs: { a: { field: "x", from: "w", combine: "sum" } } } } })],
    ["derives is an array", withPart("checkout", { derives: [] })],
    ["pricedLines item is empty", withPart("checkout", { pricedLines: { field: "l", quantity: "q", unitPrice: "p", item: "" } })],
    ["timeWindow start is a number", withPart("checkout", { timeWindow: { start: 1, end: "e" } })],
    ["registerLink is a string", withPart("checkout", { registerLink: "u" })],
    ["interaction interface is empty", withPart("runtime", { interaction: { interface: "" } })],
    ["jurisdiction forum is empty", withPart("runtime", { jurisdiction: { law: "l", forum: "" } })],
    ["jurisdiction language is a number", withPart("runtime", { jurisdiction: { law: "l", language: 1 } })],
];

describe("a clause block: the frontend's parser and the published schema give one verdict", () => {
    it("reads the clause documents under clauses/", () => {
        expect(clauseFiles.length).toBeGreaterThan(0);
    });

    it("the full block is well formed for both", () => {
        expect(schemaSays(FULL)).toBe(true);
        expect(parserSays(FULL)).toBe(true);
    });

    it.each(clauseFiles)("%s: one verdict on its block", (file) => {
        const spec = JSON.parse(readFileSync(path.join(CLAUSES_DIR, file), "utf8")) as { block?: unknown };
        expect(spec.block, `${file} carries a block`).toBeDefined();
        expect({ file, parser: parserSays(spec.block) }).toEqual({ file, parser: schemaSays(spec.block) });
    });

    it.each(MALFORMED)("malformed (%s): both refuse it", (_name, block) => {
        expect({ schema: schemaSays(block), parser: parserSays(block) }).toEqual({ schema: false, parser: false });
    });
});

describe("every attribute the parser reads is declared in the schema's part for its phase", () => {
    const source = readFileSync(path.resolve(process.cwd(), "lib/shared/clauseBlockBinding.ts"), "utf8");
    const read = (pattern: RegExp) => [...new Set([...source.matchAll(pattern)].map((m) => m[1]!))].sort();
    const declared = (part: string): string[] => {
        const ref = schema.$defs.block!.properties![part]!.$ref!.replace("#/$defs/", "");
        return Object.keys(schema.$defs[ref]!.properties!).sort();
    };
    const PARTS = {
        design: read(/\brawDesign\.(\w+)/g),
        checkout: read(/\braw\.checkout\.(\w+)/g),
        runtime: read(/\braw\.runtime\.(\w+)/g),
    };

    it.each(Object.entries(PARTS))("the %s part", (part, attributes) => {
        expect(attributes.length, `the parser reads attributes of ${part}`).toBeGreaterThan(0);
        expect(attributes.filter((a) => !declared(part).includes(a))).toEqual([]);
    });
});

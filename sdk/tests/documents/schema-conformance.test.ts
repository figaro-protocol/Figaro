// Conformance corpus: the published agreement and assembly JSON Schemas
// (`sdk/src/agreement.schema.json`, `sdk/src/assembly.schema.json`) and the
// reference composer and builder (`composeAuthoredAgreement`, `composeAuthoredProcessDesign`)
// MUST agree, in both forms each document takes. If they drift, a designer who
// validates a written file against the published schema could write one the
// seeding refuses, or a reader could accept a pinned document the builder would
// never have produced.
//
// Positive corpus: every reference agreement (`agreements/*.json`) and every
// reference assembly (`assemblies/*.json`) passes the schema in its WRITTEN
// form, composes, and passes it again in its REGISTERED / PINNED form.
// Negative corpus: a malformed document fails BOTH the schema and the composer.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { composeAuthoredAgreement, composeAuthoredProcessDesign } from "../../src/projection.js";
import { agreementHashOf, processDesignHashOf, type RegisteredAgreement } from "../../src/assembly.js";
import { specSourceFromFixtures } from "../specFixtures.js";
import agreementSchema from "../../src/agreement.schema.json" with { type: "json" };
import assemblySchema from "../../src/assembly.schema.json" with { type: "json" };

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validAgreement = ajv.compile(agreementSchema);
const validAssembly = ajv.compile(assemblySchema);

const ROOT = join(__dirname, "../../..");
const clauseNames = readdirSync(join(ROOT, "clauses")).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
const specs = specSourceFromFixtures(clauseNames);

const agreementFiles = readdirSync(join(ROOT, "agreements")).filter((f) => f.endsWith(".json")).sort();
const assemblyFiles = readdirSync(join(ROOT, "assemblies")).filter((f) => f.endsWith(".json")).sort();
const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8")) as object;

const agreementsByName: Record<string, RegisteredAgreement> = {};
for (const file of agreementFiles) {
    agreementsByName[file.replace(/\.json$/, "")] = composeAuthoredAgreement(readJson(join(ROOT, "agreements", file)), specs).document;
}

const errorsOf = (v: { errors?: unknown }) => JSON.stringify(v.errors);

describe("agreement.schema.json <-> composeAuthoredAgreement conformance", () => {
    it("the reference agreements are present (floor guard, not a census)", () => {
        expect(agreementFiles.length).toBeGreaterThanOrEqual(4);
    });

    it.each(agreementFiles)("%s passes the schema written, composes, and passes it registered", (file) => {
        const written = readJson(join(ROOT, "agreements", file));
        expect(validAgreement(written), `schema rejected the written ${file}: ${errorsOf(validAgreement)}`).toBe(true);
        const { document, agreementHash } = composeAuthoredAgreement(written, specs);
        expect(validAgreement(document), `schema rejected the registered ${file}: ${errorsOf(validAgreement)}`).toBe(true);
        expect(agreementHashOf(document)).toBe(agreementHash);
        for (const key of Object.keys(document.clauses)) expect(key).toMatch(/^0x[0-9a-f]{64}$/);
    });

    const negatives: ReadonlyArray<readonly [string, object]> = [
        ["no clauses", { name: "N" }],
        ["clauses not an object", { clauses: ["figaro-commerce"] }],
        ["an empty clause map (its key would be bytes32(0), which the registry refuses)", { clauses: {} }],
        ["a fill that is not an object", { clauses: { "figaro-commerce": {}, "figaro-handoff": 1 } }],
    ];
    it.each(negatives)("rejects (%s) in BOTH schema and composer", (_name, doc) => {
        expect(validAgreement(doc)).toBe(false);
        expect(() => composeAuthoredAgreement(doc, specs)).toThrow();
    });
});

describe("assembly.schema.json <-> composeAuthoredProcessDesign conformance", () => {
    it("the reference assemblies are present (floor guard, not a census)", () => {
        expect(assemblyFiles.length).toBeGreaterThanOrEqual(4);
    });

    it.each(assemblyFiles)("%s passes the schema written, builds, and passes it pinned", (file) => {
        const written = readJson(join(ROOT, "assemblies", file));
        expect(validAssembly(written), `schema rejected the written ${file}: ${errorsOf(validAssembly)}`).toBe(true);
        const built = composeAuthoredProcessDesign(written, agreementsByName, specs);
        expect(validAssembly(built.assembly), `schema rejected the pinned ${file}: ${errorsOf(validAssembly)}`).toBe(true);
        expect(processDesignHashOf(built.assembly)).toMatch(/^0x[0-9a-f]{64}$/);
        for (const entry of built.assembly.agreements) {
            expect(entry.agreementHash).toMatch(/^0x[0-9a-f]{64}$/);
            expect(agreementsByName[Object.keys(agreementsByName).find((n) => agreementHashOf(agreementsByName[n]) === entry.agreementHash) ?? ""]).toBeDefined();
        }
    });

    const negatives: ReadonlyArray<readonly [string, object]> = [
        ["no agreements", { name: "N" }],
        ["an empty agreements list", { agreements: [] }],
        ["an entry naming no agreement", { agreements: [{ id: "agreement-0" }] }],
        ["an entry writing clauses inline", { agreements: [{ id: "agreement-0", agreement: "counter-sale", clauses: {} }] }],
    ];
    it.each(negatives)("rejects (%s) in BOTH schema and builder", (_name, doc) => {
        expect(validAssembly(doc)).toBe(false);
        expect(() => composeAuthoredProcessDesign(doc, agreementsByName, specs)).toThrow();
    });

    // The designer's answers are presentation the builder passes through unread,
    // so a malformed `faq` entry is a SCHEMA-level rejection only.
    it("rejects a faq entry without its answer at the schema (the builder does not own faq)", () => {
        const doc = { agreements: [{ id: "agreement-0", agreement: "counter-sale" }], faq: [{ question: "Q?" }] };
        expect(validAssembly(doc)).toBe(false);
        expect(() => composeAuthoredProcessDesign(doc, agreementsByName, specs)).not.toThrow();
    });
});

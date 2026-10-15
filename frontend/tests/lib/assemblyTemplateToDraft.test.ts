/**
 * assemblyTemplateToDraft.test.ts — the composition-assist import seam:
 * `parseAssemblyTemplateJson` (pasted-JSON soundness — a template names every
 * clause by its key) and the template→draft hydration, which carries each
 * agreement's clause keys exactly as the template states them.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { keyOf, primeClauseSpecs } from "./primeClauseSpecs";
import {
    assemblyTemplateToDraft,
    parseAssemblyTemplateJson,
} from "@/lib/designer/assemblyTemplateToDraft";
import type { AssemblyTemplate } from "@/lib/shared/assemblyTemplate";

/** A two-order template over the loaded commerce and topology keys. */
const templateOf = (): AssemblyTemplate => ({
    name: "Assist round-trip",
    agreements: [
        {
            id: "order-0",
            clauses: {
                [keyOf("figaro-commerce")]: {},
                [keyOf("figaro-topology")]: { parentOrderHashes: [] },
            },
        },
        {
            id: "order-1",
            clauses: {
                [keyOf("figaro-commerce")]: {},
                [keyOf("figaro-topology")]: { parentOrderHashes: ["order-0"] },
            },
        },
    ],
});

beforeAll(async () => {
    await primeClauseSpecs(["figaro-commerce", "figaro-topology"]);
});

describe("parseAssemblyTemplateJson", () => {
    it("rejects text that is not JSON", () => {
        const r = parseAssemblyTemplateJson("not json {");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toMatch(/valid JSON/);
    });

    it("rejects JSON that is not a template-shaped object", () => {
        for (const bad of ['[]', '"a string"', '{}', '{"agreements": []}']) {
            const r = parseAssemblyTemplateJson(bad);
            expect(r.ok, `accepted: ${bad}`).toBe(false);
        }
    });

    it("rejects an agreement missing its id or clauses map", () => {
        const r = parseAssemblyTemplateJson(JSON.stringify({ agreements: [{ id: "order-0" }] }));
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toMatch(/clauses/);
    });

    it("rejects a clause named by anything but its key — a name is no identity", () => {
        const r = parseAssemblyTemplateJson(JSON.stringify({ agreements: [{ id: "order-0", clauses: { "figaro-commerce": {} } }] }));
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toMatch(/clause key/);
        const terms = parseAssemblyTemplateJson(JSON.stringify({ ...templateOf(), assemblyClauses: { "some-term": {} } }));
        expect(terms.ok).toBe(false);
    });

    it("accepts a sound template and returns it parsed", () => {
        const r = parseAssemblyTemplateJson(JSON.stringify(templateOf()));
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.template.agreements).toHaveLength(2);
    });
});

describe("assemblyTemplateToDraft — the clause keys carry", () => {
    it("carries each agreement's clause keys into the draft", () => {
        const draft = assemblyTemplateToDraft(templateOf(), { slug: "assist-test" });
        expect(Object.keys(draft.clausesByOrderId?.["order-1"] ?? {}).sort())
            .toEqual([keyOf("figaro-commerce"), keyOf("figaro-topology")].sort());
        expect(draft.orders).toHaveLength(2);
        expect(draft).not.toHaveProperty("clauseVersionsByOrderId");
    });
});

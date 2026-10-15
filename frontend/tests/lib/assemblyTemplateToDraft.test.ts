/**
 * assemblyTemplateToDraft.test.ts — the composition-assist import seam:
 * `parseAssemblyTemplateJson` (pasted-JSON soundness — every order slot binds
 * an agreement by key, every clause is named by its key) and the
 * hydrated-assembly→draft walk: each order slot keeps binding its registered
 * agreement, or — when its key is among `composeKeys` — carries that
 * agreement's clause keys into the draft for the designer to compose anew.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { canonicalize } from "@figaro-protocol/sdk";
import { hydrateAuthored, keyOf, primeClauseSpecs } from "./primeClauseSpecs";
import {
    assemblyTemplateToDraft,
    parseAssemblyTemplateJson,
} from "@/lib/designer/assemblyTemplateToDraft";

/** A two-order assembly over the loaded commerce and topology keys. */
const authoredOf = () => ({
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

    it("rejects an order slot missing its id, agreement key or clauses map", () => {
        const r = parseAssemblyTemplateJson(JSON.stringify({ agreements: [{ id: "order-0" }] }));
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toMatch(/agreementKey/);
    });

    it("rejects a clause named by anything but its key — a name is no identity", () => {
        const { template } = hydrateAuthored(authoredOf());
        const slot = { ...template.agreements[0], clauses: { "figaro-commerce": {} } };
        const r = parseAssemblyTemplateJson(JSON.stringify({ agreements: [slot] }));
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toMatch(/clause key/);
        const terms = parseAssemblyTemplateJson(JSON.stringify({ ...template, assemblyClauses: { "some-term": {} } }));
        expect(terms.ok).toBe(false);
    });

    it("accepts a bare template, and the handoff bundle with its agreements", () => {
        const { template, agreements } = hydrateAuthored(authoredOf());
        const bare = parseAssemblyTemplateJson(JSON.stringify(template));
        expect(bare.ok).toBe(true);
        if (bare.ok) {
            expect(bare.template.agreements).toHaveLength(2);
            expect(bare.agreements).toEqual({});
        }
        const bundle = parseAssemblyTemplateJson(canonicalize({ template, agreements }));
        expect(bundle.ok).toBe(true);
        if (bundle.ok) expect(Object.keys(bundle.agreements)).toEqual(Object.keys(agreements));
    });
});

describe("assemblyTemplateToDraft — the order slots carry", () => {
    it("binds each order slot's registered agreement by default", () => {
        const hydrated = hydrateAuthored(authoredOf());
        const draft = assemblyTemplateToDraft(hydrated, { slug: "assist-test" });
        expect(draft.registeredByOrderId).toEqual({
            "order-0": hydrated.template.agreements[0].agreementKey,
            "order-1": hydrated.template.agreements[1].agreementKey,
        });
        expect(draft.clausesByOrderId).toEqual({});
        expect(draft.orders).toHaveLength(2);
    });

    it("carries a composed agreement's clause keys into the draft when its key is to be composed anew", () => {
        const hydrated = hydrateAuthored(authoredOf());
        const key = hydrated.template.agreements[1].agreementKey.toLowerCase();
        const draft = assemblyTemplateToDraft(hydrated, { slug: "assist-test", composeKeys: new Set([key]) });
        expect(Object.keys(draft.clausesByOrderId?.["order-1"] ?? {}).sort())
            .toEqual([keyOf("figaro-commerce"), keyOf("figaro-topology")].sort());
        expect(draft.registeredByOrderId).toBeUndefined();
        expect(draft).not.toHaveProperty("clauseVersionsByOrderId");
    });
});

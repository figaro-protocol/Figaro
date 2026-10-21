/**
 * assemblyToDraft.test.ts — the composition-assist import seam:
 * `parseAssemblyJson` (pasted-JSON soundness — every agreement binds
 * an agreement by key, every clause is named by its key) and the
 * hydrated-assembly→draft walk: each agreement keeps binding its registered
 * agreement, or — when its key is among `composeKeys` — carries that
 * agreement's clause keys into the draft for the designer to compose anew.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { canonicalize } from "@figaro-protocol/sdk";
import { hydrateAuthored, keyOf, primeClauseSpecs } from "./primeClauseSpecs";
import {
    assemblyToDraft,
    parseAssemblyJson,
} from "@/lib/designer/assemblyToDraft";

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

describe("parseAssemblyJson", () => {
    it("rejects text that is not JSON", () => {
        const r = parseAssemblyJson("not json {");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toMatch(/valid JSON/);
    });

    it("rejects JSON that is not a assembly-shaped object", () => {
        for (const bad of ['[]', '"a string"', '{}', '{"agreements": []}']) {
            const r = parseAssemblyJson(bad);
            expect(r.ok, `accepted: ${bad}`).toBe(false);
        }
    });

    it("rejects an agreement missing its id, agreement hash or clauses map", () => {
        const r = parseAssemblyJson(JSON.stringify({ agreements: [{ id: "order-0" }] }));
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toMatch(/agreementHash/);
    });

    it("rejects a clause named by anything but its key — a name is no identity", () => {
        const { assembly } = hydrateAuthored(authoredOf());
        const entry = { ...assembly.agreements[0], clauses: { "figaro-commerce": {} } };
        const r = parseAssemblyJson(JSON.stringify({ agreements: [entry] }));
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toMatch(/clause key/);
        const terms = parseAssemblyJson(JSON.stringify({ ...assembly, assemblyClauses: { "some-term": {} } }));
        expect(terms.ok).toBe(false);
    });

    it("accepts a bare assembly, and the handoff bundle with its agreements", () => {
        const { assembly, agreements } = hydrateAuthored(authoredOf());
        const bare = parseAssemblyJson(JSON.stringify(assembly));
        expect(bare.ok).toBe(true);
        if (bare.ok) {
            expect(bare.assembly.agreements).toHaveLength(2);
            expect(bare.agreements).toEqual({});
        }
        const bundle = parseAssemblyJson(canonicalize({ assembly, agreements }));
        expect(bundle.ok).toBe(true);
        if (bundle.ok) expect(Object.keys(bundle.agreements)).toEqual(Object.keys(agreements));
    });
});

describe("assemblyToDraft — the agreements carry", () => {
    it("binds each agreement's registered agreement by default", () => {
        const hydrated = hydrateAuthored(authoredOf());
        const draft = assemblyToDraft(hydrated, { slug: "assist-test" });
        expect(draft.registeredByOrderId).toEqual({
            "order-0": hydrated.assembly.agreements[0].agreementHash,
            "order-1": hydrated.assembly.agreements[1].agreementHash,
        });
        expect(draft.clausesByOrderId).toEqual({});
        expect(draft.orders).toHaveLength(2);
    });

    it("carries a agreement's clause keys into the draft when its key is to be composed anew", () => {
        const hydrated = hydrateAuthored(authoredOf());
        const key = hydrated.assembly.agreements[1].agreementHash.toLowerCase();
        const draft = assemblyToDraft(hydrated, { slug: "assist-test", composeKeys: new Set([key]) });
        expect(Object.keys(draft.clausesByOrderId?.["order-1"] ?? {}).sort())
            .toEqual([keyOf("figaro-commerce"), keyOf("figaro-topology")].sort());
        expect(draft.registeredByOrderId).toBeUndefined();
        expect(draft).not.toHaveProperty("clauseVersionsByOrderId");
    });
});

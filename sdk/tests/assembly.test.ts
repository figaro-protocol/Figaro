import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { resolveAuthoredClauseKeys, templateComposedClauseKeys, templateCompositionHash } from "../src/assembly.js";
import type { AssemblyTemplate } from "../src/assembly.js";
import { keyOf, rawSpecOf, specSourceOf, viewOf } from "./specFixtures.js";

describe("templateComposedClauseKeys", () => {
    it("unions the assembly-scoped sections with every agreement's clauses, sorted and de-duplicated", () => {
        const template: AssemblyTemplate = {
            assemblyClauses: { [keyOf("figaro-applicable-law")]: {} },
            agreements: [
                { id: "order-0", clauses: { [keyOf("figaro-topology")]: {}, [keyOf("figaro-commerce")]: {} } },
                { id: "order-1", clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-handoff")]: {} } },
            ],
        };
        expect(templateComposedClauseKeys(template)).toEqual(
            ["figaro-applicable-law", "figaro-commerce", "figaro-handoff", "figaro-topology"].map(keyOf).sort(),
        );
    });

    it("tolerates a template without assembly-scoped sections", () => {
        const template: AssemblyTemplate = {
            agreements: [{ id: "order-0", clauses: { [keyOf("figaro-commerce")]: {} } }],
        };
        expect(templateComposedClauseKeys(template)).toEqual([keyOf("figaro-commerce")]);
    });
});

describe("resolveAuthoredClauseKeys (seed-time authoring resolver)", () => {
    const specs = specSourceOf(["figaro-commerce", "figaro-topology", "figaro-applicable-law", "figaro-data-license"]
        .map((n) => viewOf(rawSpecOf(n))));

    it("rewrites a name-keyed template's agreements and assembly-scoped sections to keys", () => {
        const authored = {
            name: "editorial",
            assemblyClauses: { "figaro-applicable-law": { law: "x" } },
            agreements: [{ id: "order-0", clauses: { "figaro-commerce": {}, "figaro-topology": { parentOrderHashes: [] } } }],
        };
        const resolved = resolveAuthoredClauseKeys(authored, specs) as unknown as AssemblyTemplate;
        expect(resolved.name).toBe("editorial");
        expect(resolved.assemblyClauses).toEqual({ [keyOf("figaro-applicable-law")]: { law: "x" } });
        expect(resolved.agreements[0].clauses).toEqual({
            [keyOf("figaro-commerce")]: {},
            [keyOf("figaro-topology")]: { parentOrderHashes: [] },
        });
        // The input is not mutated.
        expect(Object.keys(authored.agreements[0].clauses)).toEqual(["figaro-commerce", "figaro-topology"]);
    });

    it("rewrites a member document's named clause references to clauseKey", () => {
        const profile = {
            name: "m",
            disclosurePolicy: [{ compositionHash: `0x${"1".repeat(64)}`, clauseId: "figaro-data-license", posture: "buyer", offered: true }],
            assemblyBindings: [{ bindingId: "b", counterpartyBindings: [{ clauseId: "figaro-commerce", addresses: [] }] }],
            profileClauseValues: { "figaro-commerce": { a: 1 } },
        };
        const resolved = resolveAuthoredClauseKeys(profile, specs) as unknown as Record<string, any>;
        expect(resolved.disclosurePolicy[0]).toEqual({
            compositionHash: `0x${"1".repeat(64)}`, clauseKey: keyOf("figaro-data-license"), posture: "buyer", offered: true,
        });
        expect(resolved.assemblyBindings[0].counterpartyBindings[0]).toEqual({ clauseKey: keyOf("figaro-commerce"), addresses: [] });
        expect(resolved.profileClauseValues).toEqual({ [keyOf("figaro-commerce")]: { a: 1 } });

        const catalog = { items: [{ id: "i", clauseValues: { "figaro-commerce": {} }, dataSold: { compositionHash: "0x", clauseId: "figaro-data-license", posture: "seller" } }] };
        const c = resolveAuthoredClauseKeys(catalog, specs) as unknown as Record<string, any>;
        expect(c.items[0].clauseValues).toEqual({ [keyOf("figaro-commerce")]: {} });
        expect(c.items[0].dataSold.clauseKey).toBe(keyOf("figaro-data-license"));
    });

    it("refuses a name two loaded specs share unless written name@version, and resolves the stated one", () => {
        const v1 = rawSpecOf("figaro-commerce");
        const v2 = { ...v1, version: (v1.version as number) + 1 };
        const twoCommerce = specSourceOf([viewOf(v1), viewOf(v2)]);
        const doc = { agreements: [{ id: "order-0", clauses: { "figaro-commerce": {} } }] };
        expect(() => resolveAuthoredClauseKeys(doc, twoCommerce)).toThrow(/names 2 loaded clause specs/);
        const pinned = { agreements: [{ id: "order-0", clauses: { [`figaro-commerce@${v2.version}`]: {} } }] };
        const resolved = resolveAuthoredClauseKeys(pinned, twoCommerce) as unknown as AssemblyTemplate;
        expect(Object.keys(resolved.agreements[0].clauses)).toEqual([viewOf(v2).clauseKey]);
    });

    it("refuses a name no loaded spec carries, and a version map", () => {
        expect(() => resolveAuthoredClauseKeys({ agreements: [{ id: "o", clauses: { "figaro-nope": {} } }] }, specs))
            .toThrow(/no loaded clause spec is named "figaro-nope"/);
        expect(() => resolveAuthoredClauseKeys({ agreements: [{ id: "o", clauses: {}, clauseVersions: {} }] }, specs))
            .toThrow(/version map/);
    });

    it("resolves every reference assembly in assemblies/ against clauses/ and re-hashes it", () => {
        const clausesDir = path.resolve(__dirname, "../../clauses");
        const all = specSourceOf(readdirSync(clausesDir).filter((f) => f.endsWith(".json"))
            .map((f) => viewOf(JSON.parse(readFileSync(path.join(clausesDir, f), "utf8")))));
        const dir = path.resolve(__dirname, "../../assemblies");
        for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
            const resolved = resolveAuthoredClauseKeys(JSON.parse(readFileSync(path.join(dir, file), "utf8")), all) as AssemblyTemplate;
            for (const key of templateComposedClauseKeys(resolved)) expect(all.get(key), `${file} ${key}`).toBeDefined();
            expect(templateCompositionHash(resolved)).toMatch(/^0x[0-9a-f]{64}$/);
        }
    });
});

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { keccak256, toHex, type Hex } from "viem";
import {
    ASSEMBLY_TERMS_LEAF_KEY,
    agreementKeyOf,
    assertNotReservedKey,
    buildSlotInclusionProof,
    resolveAuthoredClauseKeys,
    slotClauses,
    slotSectionBytes,
    templateComposedClauseKeys,
    templateCompositionHash,
    templateLeaves,
    templateParentOrderHashes,
    agreementClauseLeaves,
    buildClauseInclusionProof,
} from "../src/assembly.js";
import type { AssemblyTemplate, ComposedAgreement } from "../src/assembly.js";
import { PROVENANCE_LEAF_KEY, buildMerkleRoot, canonicalize, computeSectionLeaf, sortLeaves, verifyInclusionProof } from "../src/agreement.js";
import { assembleAuthored, composeAuthoredAgreement } from "../src/projection.js";
import { hydrateAuthored } from "./hydrate.js";
import { keyOf, rawSpecOf, specSourceOf, viewOf } from "./specFixtures.js";

describe("templateComposedClauseKeys", () => {
    it("unions the assembly-scoped sections with every order slot's clauses, sorted and de-duplicated", () => {
        const { template, agreements } = hydrateAuthored({
            assemblyClauses: { [keyOf("figaro-applicable-law")]: {} },
            agreements: [
                { id: "order-0", clauses: { [keyOf("figaro-topology")]: {}, [keyOf("figaro-commerce")]: {} } },
                { id: "order-1", clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-handoff")]: {} } },
            ],
        });
        expect(templateComposedClauseKeys(template, agreements)).toEqual(
            ["figaro-applicable-law", "figaro-commerce", "figaro-handoff", "figaro-topology"].map(keyOf).sort(),
        );
    });

    it("tolerates a template without assembly-scoped sections, and refuses an order slot it cannot read", () => {
        const { template, agreements } = hydrateAuthored({
            agreements: [{ id: "order-0", clauses: { [keyOf("figaro-commerce")]: {} } }],
        });
        expect(templateComposedClauseKeys(template, agreements)).toEqual([keyOf("figaro-commerce")]);
        expect(() => templateComposedClauseKeys(template, {})).toThrow(/not hydrated/);
    });
});

describe("the registered agreement key", () => {
    const composed = { clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-topology")]: {} } };

    it("is the merkle root over one leaf per composed clause, editorial prose excluded", () => {
        const leaves = Object.entries(composed.clauses).map(([clauseKey, fills]) =>
            computeSectionLeaf({ clause: clauseKey as Hex, data: fills }),
        );
        expect(agreementKeyOf(composed)).toBe(buildMerkleRoot(sortLeaves(leaves)));
        expect(agreementClauseLeaves(composed)).toEqual(sortLeaves(leaves));
        expect(agreementKeyOf({ ...composed, name: "A", summary: "B", description: "C" })).toBe(agreementKeyOf(composed));
    });

    it("a one-clause agreement's key is its clause's leaf", () => {
        const one = { clauses: { [keyOf("figaro-commerce")]: { x: 1 } } };
        expect(agreementKeyOf(one)).toBe(computeSectionLeaf({ clause: keyOf("figaro-commerce"), data: { x: 1 } }));
    });

    it("every composed clause opens under the key, and under no other agreement's key", () => {
        for (const clauseKey of Object.keys(composed.clauses) as Hex[]) {
            const { leaf, proof, fillsHash } = buildClauseInclusionProof(composed, clauseKey);
            expect(fillsHash).toBe(keccak256(toHex(canonicalize(composed.clauses[clauseKey]))));
            expect(leaf).toBe(computeSectionLeaf({ clause: clauseKey, dataHash: fillsHash }));
            expect(verifyInclusionProof(agreementKeyOf(composed), leaf, proof)).toBe(true);
            expect(verifyInclusionProof(agreementKeyOf({ clauses: { [clauseKey]: {} } }), leaf, proof)).toBe(false);
        }
        expect(() => buildClauseInclusionProof(composed, keyOf("figaro-handoff"))).toThrow(/not composed/);
    });

    it("refuses a duplicate clause key and a reserved format key", () => {
        const k = keyOf("figaro-commerce");
        expect(() => agreementKeyOf({ clauses: { [k]: {}, [k.toUpperCase().replace("0X", "0x") as Hex]: {} } })).toThrow(/Duplicate/);
        expect(() => agreementKeyOf({ clauses: { [ASSEMBLY_TERMS_LEAF_KEY]: {} } })).toThrow(/reserved/);
    });

    it("moves with any clause or value", () => {
        expect(agreementKeyOf({ clauses: { ...composed.clauses, [keyOf("figaro-handoff")]: {} } })).not.toBe(agreementKeyOf(composed));
        expect(agreementKeyOf({ clauses: { ...composed.clauses, [keyOf("figaro-commerce")]: { x: 1 } } })).not.toBe(agreementKeyOf(composed));
    });
});

describe("the composition tree", () => {
    const A = `0x${"aa".repeat(32)}` as Hex;
    const B = `0x${"bb".repeat(32)}` as Hex;
    const TOPO = keyOf("figaro-topology");

    it("an order slot's bytes are canonical {clauses, slot}", () => {
        const bytes = slotSectionBytes({ clauses: { [TOPO]: { parentOrderHashes: ["order-0"] } } }, 1);
        expect(Buffer.from(bytes.slice(2), "hex").toString("utf8"))
            .toBe(`{"clauses":{"${TOPO}":{"parentOrderHashes":["order-0"]}},"slot":1}`);
        expect(() => slotSectionBytes({ clauses: {} }, -1)).toThrow(/non-negative/);
    });

    it("a one-slot assembly's root is its order slot's leaf; terms add a leaf", () => {
        const one: AssemblyTemplate = { agreements: [{ id: "order-0", agreementKey: A, clauses: {} }] };
        const { leaf, proof, slotContentHash } = buildSlotInclusionProof(one, 0);
        expect(proof).toEqual([]);
        expect(templateCompositionHash(one)).toBe(leaf);
        expect(slotContentHash).toBe(keccak256(slotSectionBytes({ clauses: {} }, 0)));
        expect(leaf).toBe(computeSectionLeaf({ clause: A, dataHash: slotContentHash }));
        const termed = { ...one, assemblyClauses: { [keyOf("figaro-applicable-law")]: { law: "x" } } };
        expect(templateLeaves(termed)).toHaveLength(2);
        expect(templateLeaves(termed)).toContain(
            computeSectionLeaf({ clause: ASSEMBLY_TERMS_LEAF_KEY, data: termed.assemblyClauses }),
        );
        expect(templateCompositionHash(termed)).not.toBe(templateCompositionHash(one));
        // Empty terms are no leaf.
        expect(templateCompositionHash({ ...one, assemblyClauses: {} })).toBe(templateCompositionHash(one));
    });

    it("the same agreement in two order slots is two leaves; editorial prose never moves the root", () => {
        const two: AssemblyTemplate = {
            agreements: [
                { id: "order-0", agreementKey: A, clauses: { [TOPO]: { parentOrderHashes: [] } } },
                { id: "order-1", agreementKey: A, clauses: { [TOPO]: { parentOrderHashes: ["order-0"] } } },
            ],
        };
        expect(new Set(templateLeaves(two)).size).toBe(2);
        expect(templateCompositionHash({ ...two, name: "x", faq: [{ question: "q", answer: "a" }] })).toBe(templateCompositionHash(two));
        for (const i of [0, 1]) {
            const { leaf, proof } = buildSlotInclusionProof(two, i);
            expect(verifyInclusionProof(templateCompositionHash(two), leaf, proof)).toBe(true);
        }
        expect(() => buildSlotInclusionProof(two, 2)).toThrow(/not in the template/);
    });

    it("a membership proof under a different root does not verify", () => {
        const t1: AssemblyTemplate = { agreements: [{ id: "order-0", agreementKey: A, clauses: {} }, { id: "order-1", agreementKey: B, clauses: {} }] };
        const t2: AssemblyTemplate = { agreements: [{ id: "order-0", agreementKey: B, clauses: {} }, { id: "order-1", agreementKey: A, clauses: {} }] };
        const { leaf, proof } = buildSlotInclusionProof(t1, 0);
        expect(verifyInclusionProof(templateCompositionHash(t2), leaf, proof)).toBe(false);
    });

    it("refuses the two reserved format keys as an order slot's agreement key", () => {
        for (const reserved of [PROVENANCE_LEAF_KEY, ASSEMBLY_TERMS_LEAF_KEY]) {
            const t: AssemblyTemplate = { agreements: [{ id: "order-0", agreementKey: reserved, clauses: {} }] };
            expect(() => templateCompositionHash(t)).toThrow(/reserved format key/);
            expect(() => assertNotReservedKey(reserved)).toThrow(/reserved format key/);
        }
        expect(ASSEMBLY_TERMS_LEAF_KEY).toBe(keccak256(toHex("figaro-assembly-terms")));
    });
});

describe("an order slot's clauses at checkout", () => {
    const TOPO = keyOf("figaro-topology");
    const COMMERCE = keyOf("figaro-commerce");
    const hydrated = hydrateAuthored({
        agreements: [
            { id: "order-0", clauses: { [COMMERCE]: {}, [TOPO]: { parentOrderHashes: [] } } },
            { id: "order-1", clauses: { [COMMERCE]: {}, [TOPO]: { parentOrderHashes: ["order-0"] } } },
        ],
    });

    it("one registered agreement serves both order slots; each order slot's fill merges over it", () => {
        const [s0, s1] = hydrated.template.agreements;
        expect(s0.agreementKey).toBe(s1.agreementKey);
        expect(slotClauses(hydrated, s1)).toEqual({ [COMMERCE]: {}, [TOPO]: { parentOrderHashes: ["order-0"] } });
        expect(templateParentOrderHashes(s1)).toEqual(["order-0"]);
        expect(templateParentOrderHashes(s0)).toEqual([]);
    });

    it("refuses an order slot fill naming a clause its agreement does not compose", () => {
        const slot = { ...hydrated.template.agreements[0], clauses: { [keyOf("figaro-handoff")]: { x: 1 } } };
        expect(() => slotClauses(hydrated, slot)).toThrow(/does not compose/);
    });
});

describe("composeAuthoredAgreement + assembleAuthored (seed-time derivation)", () => {
    const names = ["figaro-commerce", "figaro-topology", "figaro-applicable-law", "figaro-handoff"];
    const specs = specSourceOf(names.map((n) => viewOf(rawSpecOf(n))));

    it("composes an authored agreement by name: the fold adds the mandatory clauses, the words ride beside the clauses, outside the key", () => {
        const { document, agreementKey } = composeAuthoredAgreement(
            { name: "A hand-off", summary: "one hand-off", clauses: { "figaro-handoff": {} } },
            specs,
        );
        expect(document.clauses).toEqual({ [keyOf("figaro-handoff")]: {}, [keyOf("figaro-commerce")]: {}, [keyOf("figaro-topology")]: {} });
        expect(document.name).toBe("A hand-off");
        expect(agreementKey).toBe(agreementKeyOf({ clauses: document.clauses }));
        expect(agreementKeyOf(document)).toBe(agreementKey);
        // Written with or without the mandatory clauses, the same agreement.
        expect(composeAuthoredAgreement({ clauses: { "figaro-handoff": {}, "figaro-commerce": {} } }, specs).agreementKey).toBe(agreementKey);
        expect(() => composeAuthoredAgreement({ name: "none" }, specs)).toThrow(/no clauses/);
    });

    it("assembles an authored assembly over named agreements: the slot binds the agreement's key and carries its own parents", () => {
        const handoff = composeAuthoredAgreement({ clauses: { "figaro-handoff": {} } }, specs).document;
        const bare = composeAuthoredAgreement({ clauses: {} }, specs).document;
        const { template, agreements } = assembleAuthored({
            name: "editorial",
            assemblyClauses: { "figaro-applicable-law": { applicableLaw: "ch" } },
            agreements: [
                { id: "order-0", agreement: "bare" },
                { id: "order-1", agreement: "bare", parentOrderHashes: ["order-0"] },
                { id: "order-2", agreement: "handoff", parentOrderHashes: ["order-0"] },
            ],
        }, { bare, handoff }, specs);
        expect(template.name).toBe("editorial");
        expect(template.assemblyClauses).toEqual({ [keyOf("figaro-applicable-law")]: { applicableLaw: "ch" } });
        // Two order slots bind one agreement; the set holds each distinct one once.
        expect(Object.keys(agreements)).toHaveLength(2);
        expect(template.agreements[0].agreementKey).toBe(template.agreements[1].agreementKey);
        expect(template.agreements[0].agreementKey).toBe(agreementKeyOf(bare));
        expect(template.agreements[2].agreementKey).toBe(agreementKeyOf(handoff));
        expect(template.agreements[0].clauses).toEqual({ [keyOf("figaro-topology")]: { parentOrderHashes: [] } });
        expect(template.agreements[1].clauses).toEqual({ [keyOf("figaro-topology")]: { parentOrderHashes: ["order-0"] } });
        for (const slot of template.agreements) expect(agreementKeyOf(agreements[slot.agreementKey])).toBe(slot.agreementKey);
    });

    it("refuses a slot that names no agreement, an unknown one, inline clauses, or an agreement short of a mandatory clause", () => {
        const bare = composeAuthoredAgreement({ clauses: {} }, specs).document;
        expect(() => assembleAuthored({ agreements: [{ id: "o" }] }, { bare }, specs)).toThrow(/names no agreement/);
        expect(() => assembleAuthored({ agreements: [{ id: "o", agreement: "nope" }] }, { bare }, specs)).toThrow(/not among the authored agreements/);
        expect(() => assembleAuthored({ agreements: [{ id: "o", agreement: "bare", clauses: {} }] }, { bare }, specs)).toThrow(/inline/);
        const short = { clauses: { [keyOf("figaro-handoff")]: {} } };
        expect(() => assembleAuthored({ agreements: [{ id: "o", agreement: "short" }] }, { short }, specs)).toThrow(/lacks the live mandatory/);
        expect(() => assembleAuthored({ agreements: [] }, { bare }, specs)).toThrow(/no order slots/);
    });

    it("derives every reference assembly in assemblies/ over agreements/ against clauses/, each agreement file used", () => {
        const clausesDir = path.resolve(__dirname, "../../clauses");
        const all = specSourceOf(readdirSync(clausesDir).filter((f) => f.endsWith(".json"))
            .map((f) => viewOf(JSON.parse(readFileSync(path.join(clausesDir, f), "utf8")))));
        const agreementsDir = path.resolve(__dirname, "../../agreements");
        const byName: Record<string, ComposedAgreement> = {};
        for (const file of readdirSync(agreementsDir).filter((f) => f.endsWith(".json"))) {
            const { document, agreementKey } = composeAuthoredAgreement(JSON.parse(readFileSync(path.join(agreementsDir, file), "utf8")), all);
            expect(document.name, `${file} carries its name`).toBeTruthy();
            expect(agreementKeyOf(document)).toBe(agreementKey);
            byName[file.replace(/\.json$/, "")] = document;
        }
        const used = new Set<string>();
        const dir = path.resolve(__dirname, "../../assemblies");
        for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
            const authored = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as { agreements: { agreement: string }[] };
            for (const slot of authored.agreements) used.add(slot.agreement);
            const { template, agreements } = assembleAuthored(authored, byName, all);
            for (const key of templateComposedClauseKeys(template, agreements)) expect(all.get(key), `${file} ${key}`).toBeDefined();
            expect(templateCompositionHash(template)).toMatch(/^0x[0-9a-f]{64}$/);
            for (const slot of template.agreements) expect(agreements[slot.agreementKey], `${file} ${slot.id}`).toBeDefined();
        }
        for (const name of Object.keys(byName)) expect(used.has(name), `agreements/${name}.json is bound by a reference assembly`).toBe(true);
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
        const resolved = resolveAuthoredClauseKeys(authored, specs) as unknown as {
            name: string; assemblyClauses: unknown; agreements: { clauses: Record<string, unknown> }[];
        };
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
        const resolved = resolveAuthoredClauseKeys(pinned, twoCommerce) as unknown as { agreements: { clauses: Record<string, unknown> }[] };
        expect(Object.keys(resolved.agreements[0].clauses)).toEqual([viewOf(v2).clauseKey]);
    });

    it("refuses a name no loaded spec carries, and a version map", () => {
        expect(() => resolveAuthoredClauseKeys({ agreements: [{ id: "o", clauses: { "figaro-nope": {} } }] }, specs))
            .toThrow(/no loaded clause spec is named "figaro-nope"/);
        expect(() => resolveAuthoredClauseKeys({ agreements: [{ id: "o", clauses: {}, clauseVersions: {} }] }, specs))
            .toThrow(/version map/);
    });

    it("resolves every authored agreement in agreements/ and every reference assembly's assembly-scoped clauses against clauses/", () => {
        const clausesDir = path.resolve(__dirname, "../../clauses");
        const all = specSourceOf(readdirSync(clausesDir).filter((f) => f.endsWith(".json"))
            .map((f) => viewOf(JSON.parse(readFileSync(path.join(clausesDir, f), "utf8")))));
        const agreementsDir = path.resolve(__dirname, "../../agreements");
        for (const file of readdirSync(agreementsDir).filter((f) => f.endsWith(".json"))) {
            const resolved = resolveAuthoredClauseKeys(JSON.parse(readFileSync(path.join(agreementsDir, file), "utf8")), all) as {
                clauses: Record<string, unknown>;
            };
            for (const key of Object.keys(resolved.clauses)) expect(all.get(key as Hex), `${file} ${key}`).toBeDefined();
        }
        const dir = path.resolve(__dirname, "../../assemblies");
        for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
            const resolved = resolveAuthoredClauseKeys(JSON.parse(readFileSync(path.join(dir, file), "utf8")), all) as {
                assemblyClauses?: Record<string, unknown>;
            };
            for (const key of Object.keys(resolved.assemblyClauses ?? {})) expect(all.get(key as Hex), `${file} ${key}`).toBeDefined();
        }
    });
});

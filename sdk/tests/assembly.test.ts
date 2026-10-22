import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { keccak256, toHex, type Hex } from "viem";
import {
    ASSEMBLY_TERMS_LEAF_KEY,
    agreementHashOf,
    assertNotReservedKey,
    buildAgreementInclusionProof,
    resolveAuthoredClauseKeys,
    agreementClauses,
    agreementLeafBytes,
    assemblyComposedClauseKeys,
    assemblyHashOf,
    assemblyLeaves,
    assemblyParentOrderHashes,
    agreementClauseLeaves,
    buildRegisteredClauseInclusionProof,
} from "../src/assembly.js";
import type { Assembly, RegisteredAgreement } from "../src/assembly.js";
import { PROVENANCE_LEAF_KEY, buildMerkleRoot, canonicalize, computeClauseLeaf, sortLeaves, verifyInclusionProof } from "../src/agreement.js";
import { assembleAuthored, composeAuthoredAgreement, composeAuthoredAgreements } from "../src/projection.js";
import { hydrateAuthored } from "./hydrate.js";
import { keyOf, rawSpecOf, specSourceOf, viewOf } from "./specFixtures.js";

describe("assemblyComposedClauseKeys", () => {
    it("unions the assembly-scoped clauses with every agreement's clauses, sorted and de-duplicated", () => {
        const { assembly, agreements } = hydrateAuthored({
            assemblyClauses: { [keyOf("figaro-applicable-law")]: {} },
            agreements: [
                { id: "order-0", clauses: { [keyOf("figaro-topology")]: {}, [keyOf("figaro-commerce")]: {} } },
                { id: "order-1", clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-handoff")]: {} } },
            ],
        });
        expect(assemblyComposedClauseKeys(assembly, agreements)).toEqual(
            ["figaro-applicable-law", "figaro-commerce", "figaro-handoff", "figaro-topology"].map(keyOf).sort(),
        );
    });

    it("tolerates a assembly without assembly-scoped clauseEntries, and refuses an agreement it cannot read", () => {
        const { assembly, agreements } = hydrateAuthored({
            agreements: [{ id: "order-0", clauses: { [keyOf("figaro-commerce")]: {} } }],
        });
        expect(assemblyComposedClauseKeys(assembly, agreements)).toEqual([keyOf("figaro-commerce")]);
        expect(() => assemblyComposedClauseKeys(assembly, {})).toThrow(/not hydrated/);
    });
});

describe("the registered agreement hash", () => {
    const composed = { clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-topology")]: {} } };

    it("is the merkle root over one leaf per composed clause, editorial prose excluded", () => {
        const leaves = Object.entries(composed.clauses).map(([clauseKey, fills]) =>
            computeClauseLeaf({ clause: clauseKey as Hex, data: fills }),
        );
        expect(agreementHashOf(composed)).toBe(buildMerkleRoot(sortLeaves(leaves)));
        expect(agreementClauseLeaves(composed)).toEqual(sortLeaves(leaves));
        expect(agreementHashOf({ ...composed, name: "A", summary: "B", description: "C" })).toBe(agreementHashOf(composed));
    });

    it("a one-clause agreement's hash is its clause's leaf", () => {
        const one = { clauses: { [keyOf("figaro-commerce")]: { x: 1 } } };
        expect(agreementHashOf(one)).toBe(computeClauseLeaf({ clause: keyOf("figaro-commerce"), data: { x: 1 } }));
    });

    it("every composed clause opens under the key, and under no other agreement's hash", () => {
        for (const clauseKey of Object.keys(composed.clauses) as Hex[]) {
            const { leaf, proof, fillsHash } = buildRegisteredClauseInclusionProof(composed, clauseKey);
            expect(fillsHash).toBe(keccak256(toHex(canonicalize(composed.clauses[clauseKey]))));
            expect(leaf).toBe(computeClauseLeaf({ clause: clauseKey, dataHash: fillsHash }));
            expect(verifyInclusionProof(agreementHashOf(composed), leaf, proof)).toBe(true);
            expect(verifyInclusionProof(agreementHashOf({ clauses: { [clauseKey]: {} } }), leaf, proof)).toBe(false);
        }
        expect(() => buildRegisteredClauseInclusionProof(composed, keyOf("figaro-handoff"))).toThrow(/not composed/);
    });

    it("refuses a duplicate clause key and a reserved format key", () => {
        const k = keyOf("figaro-commerce");
        expect(() => agreementHashOf({ clauses: { [k]: {}, [k.toUpperCase().replace("0X", "0x") as Hex]: {} } })).toThrow(/Duplicate/);
        expect(() => agreementHashOf({ clauses: { [ASSEMBLY_TERMS_LEAF_KEY]: {} } })).toThrow(/reserved/);
    });

    it("moves with any clause or value", () => {
        expect(agreementHashOf({ clauses: { ...composed.clauses, [keyOf("figaro-handoff")]: {} } })).not.toBe(agreementHashOf(composed));
        expect(agreementHashOf({ clauses: { ...composed.clauses, [keyOf("figaro-commerce")]: { x: 1 } } })).not.toBe(agreementHashOf(composed));
    });
});

describe("the composition tree", () => {
    const A = `0x${"aa".repeat(32)}` as Hex;
    const B = `0x${"bb".repeat(32)}` as Hex;
    const TOPO = keyOf("figaro-topology");

    it("an agreement's bytes are canonical {clauses, slot} — slot, the wire name for the agreement's index", () => {
        const bytes = agreementLeafBytes({ clauses: { [TOPO]: { parentOrderHashes: ["order-0"] } } }, 1);
        expect(Buffer.from(bytes.slice(2), "hex").toString("utf8"))
            .toBe(`{"clauses":{"${TOPO}":{"parentOrderHashes":["order-0"]}},"slot":1}`);
        expect(() => agreementLeafBytes({ clauses: {} }, -1)).toThrow(/non-negative/);
    });

    it("a one-entry assembly's root is its agreement's leaf; terms add a leaf", () => {
        const one: Assembly = { agreements: [{ id: "order-0", agreementHash: A, clauses: {} }] };
        const { leaf, proof, slotContentHash } = buildAgreementInclusionProof(one, 0);
        expect(proof).toEqual([]);
        expect(assemblyHashOf(one)).toBe(leaf);
        expect(slotContentHash).toBe(keccak256(agreementLeafBytes({ clauses: {} }, 0)));
        expect(leaf).toBe(computeClauseLeaf({ clause: A, dataHash: slotContentHash }));
        const termed = { ...one, assemblyClauses: { [keyOf("figaro-applicable-law")]: { law: "x" } } };
        expect(assemblyLeaves(termed)).toHaveLength(2);
        expect(assemblyLeaves(termed)).toContain(
            computeClauseLeaf({ clause: ASSEMBLY_TERMS_LEAF_KEY, data: termed.assemblyClauses }),
        );
        expect(assemblyHashOf(termed)).not.toBe(assemblyHashOf(one));
        // Empty terms are no leaf.
        expect(assemblyHashOf({ ...one, assemblyClauses: {} })).toBe(assemblyHashOf(one));
    });

    it("the same agreement in two agreements is two leaves; editorial prose never moves the root", () => {
        const two: Assembly = {
            agreements: [
                { id: "order-0", agreementHash: A, clauses: { [TOPO]: { parentOrderHashes: [] } } },
                { id: "order-1", agreementHash: A, clauses: { [TOPO]: { parentOrderHashes: ["order-0"] } } },
            ],
        };
        expect(new Set(assemblyLeaves(two)).size).toBe(2);
        expect(assemblyHashOf({ ...two, name: "x", faq: [{ question: "q", answer: "a" }] })).toBe(assemblyHashOf(two));
        for (const i of [0, 1]) {
            const { leaf, proof } = buildAgreementInclusionProof(two, i);
            expect(verifyInclusionProof(assemblyHashOf(two), leaf, proof)).toBe(true);
        }
        expect(() => buildAgreementInclusionProof(two, 2)).toThrow(/not in the assembly/);
    });

    it("a membership proof under a different root does not verify", () => {
        const t1: Assembly = { agreements: [{ id: "order-0", agreementHash: A, clauses: {} }, { id: "order-1", agreementHash: B, clauses: {} }] };
        const t2: Assembly = { agreements: [{ id: "order-0", agreementHash: B, clauses: {} }, { id: "order-1", agreementHash: A, clauses: {} }] };
        const { leaf, proof } = buildAgreementInclusionProof(t1, 0);
        expect(verifyInclusionProof(assemblyHashOf(t2), leaf, proof)).toBe(false);
    });

    it("refuses the two reserved format keys as an agreement's agreement hash", () => {
        for (const reserved of [PROVENANCE_LEAF_KEY, ASSEMBLY_TERMS_LEAF_KEY]) {
            const t: Assembly = { agreements: [{ id: "order-0", agreementHash: reserved, clauses: {} }] };
            expect(() => assemblyHashOf(t)).toThrow(/reserved format key/);
            expect(() => assertNotReservedKey(reserved)).toThrow(/reserved format key/);
        }
        expect(ASSEMBLY_TERMS_LEAF_KEY).toBe(keccak256(toHex("figaro-assembly-terms")));
    });
});

describe("an agreement's clauses at checkout", () => {
    const TOPO = keyOf("figaro-topology");
    const COMMERCE = keyOf("figaro-commerce");
    const hydrated = hydrateAuthored({
        agreements: [
            { id: "order-0", clauses: { [COMMERCE]: {}, [TOPO]: { parentOrderHashes: [] } } },
            { id: "order-1", clauses: { [COMMERCE]: {}, [TOPO]: { parentOrderHashes: ["order-0"] } } },
        ],
    });

    it("one registered agreement serves both agreements; each agreement's fill merges over it", () => {
        const [s0, s1] = hydrated.assembly.agreements;
        expect(s0.agreementHash).toBe(s1.agreementHash);
        expect(agreementClauses(hydrated, s1)).toEqual({ [COMMERCE]: {}, [TOPO]: { parentOrderHashes: ["order-0"] } });
        expect(assemblyParentOrderHashes(s1)).toEqual(["order-0"]);
        expect(assemblyParentOrderHashes(s0)).toEqual([]);
    });

    it("refuses an agreement fill naming a clause its agreement does not compose", () => {
        const entry = { ...hydrated.assembly.agreements[0], clauses: { [keyOf("figaro-handoff")]: { x: 1 } } };
        expect(() => agreementClauses(hydrated, entry)).toThrow(/does not compose/);
    });
});

describe("composeAuthoredAgreement + assembleAuthored (seed-time derivation)", () => {
    const names = ["figaro-commerce", "figaro-topology", "figaro-applicable-law", "figaro-handoff"];
    const specs = specSourceOf(names.map((n) => viewOf(rawSpecOf(n))));
    /** The mandatory clauses alone: the registered agreement an authored
     *  agreement names as its pick. Composed with no pick of its own. */
    const base = composeAuthoredAgreement({ name: "Mandatory clauses", clauses: { "figaro-commerce": {}, "figaro-topology": {} } }, specs).document;

    it("composes an authored agreement by name: its pick's clauses merge, the words ride beside the clauses, outside the key", () => {
        const { document, agreementHash } = composeAuthoredAgreement(
            { name: "A hand-off", summary: "one hand-off", clauses: { "figaro-handoff": {} }, mandatory: "base" },
            specs,
            { base },
        );
        expect(document.clauses).toEqual({ [keyOf("figaro-handoff")]: {}, [keyOf("figaro-commerce")]: {}, [keyOf("figaro-topology")]: {} });
        expect(document.name).toBe("A hand-off");
        expect(document).not.toHaveProperty("mandatory");
        expect(agreementHash).toBe(agreementHashOf({ clauses: document.clauses }));
        expect(agreementHashOf(document)).toBe(agreementHash);
        // Written with or without a clause of its pick, the same agreement.
        expect(composeAuthoredAgreement({ clauses: { "figaro-handoff": {}, "figaro-commerce": {} }, mandatory: "base" }, specs, { base }).agreementHash).toBe(agreementHash);
        expect(() => composeAuthoredAgreement({ name: "none" }, specs)).toThrow(/no clauses/);
        // An authored agreement naming no pick composes only mandatory-article clauses…
        expect(() => composeAuthoredAgreement({ clauses: { "figaro-handoff": {} } }, specs)).toThrow(/no registered agreement picked in the mandatory article/);
        // …and a pick it names must be among the picks supplied.
        expect(() => composeAuthoredAgreement({ clauses: { "figaro-handoff": {} }, mandatory: "nope" }, specs, { base }))
            .toThrow(/names "nope" as its mandatory pick/);
    });

    it("composes a set of authored agreements by name, each pick resolved within the set", () => {
        const composed = composeAuthoredAgreements({
            handoff: { clauses: { "figaro-handoff": {} }, mandatory: "base" },
            base: { name: "Mandatory clauses", clauses: { "figaro-commerce": {}, "figaro-topology": {} } },
        }, specs);
        expect(composed.base.agreementHash).toBe(agreementHashOf(base));
        expect(composed.handoff.document.clauses).toEqual({ [keyOf("figaro-handoff")]: {}, ...base.clauses });
        expect(() => composeAuthoredAgreements({ handoff: { clauses: { "figaro-handoff": {} }, mandatory: "handoff" } }, specs))
            .toThrow(/names "handoff" as its mandatory pick/);
    });

    it("assembles an authored assembly over named agreements: the entry binds the agreement's hash and carries its own parents", () => {
        const handoff = composeAuthoredAgreement({ clauses: { "figaro-handoff": {} }, mandatory: "base" }, specs, { base }).document;
        const bare = base;
        const { assembly, agreements } = assembleAuthored({
            name: "editorial",
            assemblyClauses: { "figaro-applicable-law": { applicableLaw: "ch" } },
            agreements: [
                { id: "order-0", agreement: "bare" },
                { id: "order-1", agreement: "bare", parentOrderHashes: ["order-0"] },
                { id: "order-2", agreement: "handoff", parentOrderHashes: ["order-0"] },
            ],
        }, { bare, handoff }, specs);
        expect(assembly.name).toBe("editorial");
        expect(assembly.assemblyClauses).toEqual({ [keyOf("figaro-applicable-law")]: { applicableLaw: "ch" } });
        // Two agreements bind one agreement; the set holds each distinct one once.
        expect(Object.keys(agreements)).toHaveLength(2);
        expect(assembly.agreements[0].agreementHash).toBe(assembly.agreements[1].agreementHash);
        expect(assembly.agreements[0].agreementHash).toBe(agreementHashOf(bare));
        expect(assembly.agreements[2].agreementHash).toBe(agreementHashOf(handoff));
        expect(assembly.agreements[0].clauses).toEqual({ [keyOf("figaro-topology")]: { parentOrderHashes: [] } });
        expect(assembly.agreements[1].clauses).toEqual({ [keyOf("figaro-topology")]: { parentOrderHashes: ["order-0"] } });
        for (const entry of assembly.agreements) expect(agreementHashOf(agreements[entry.agreementHash])).toBe(entry.agreementHash);
    });

    it("refuses a entry that names no agreement, an unknown one, inline clauses, or an agreement short of the mandatory clauses", () => {
        const bare = base;
        expect(() => assembleAuthored({ agreements: [{ id: "o" }] }, { bare }, specs)).toThrow(/names no agreement/);
        expect(() => assembleAuthored({ agreements: [{ id: "o", agreement: "nope" }] }, { bare }, specs)).toThrow(/not among the authored agreements/);
        expect(() => assembleAuthored({ agreements: [{ id: "o", agreement: "bare", clauses: {} }] }, { bare }, specs)).toThrow(/inline/);
        // A bound agreement carries every clause of one mandatory agreement
        // among the authored agreements (one whose clauses are all
        // mandatory-article), or is refused.
        const short = { clauses: { [keyOf("figaro-handoff")]: {}, [keyOf("figaro-commerce")]: {} } };
        expect(() => assembleAuthored({ agreements: [{ id: "o", agreement: "short" }] }, { short, bare }, specs))
            .toThrow(/o: agreement "short" carries the clauses of no agreement among the authored agreements whose clauses are all mandatory-article/);
        expect(() => assembleAuthored({ agreements: [] }, { bare }, specs)).toThrow(/no agreements/);
    });

    it("derives every reference assembly in assemblies/ over agreements/ against clauses/, each agreement file bound or picked", () => {
        const clausesDir = path.resolve(__dirname, "../../clauses");
        const all = specSourceOf(readdirSync(clausesDir).filter((f) => f.endsWith(".json"))
            .map((f) => viewOf(JSON.parse(readFileSync(path.join(clausesDir, f), "utf8")))));
        const agreementsDir = path.resolve(__dirname, "../../agreements");
        const authoredByName: Record<string, { mandatory?: string }> = {};
        for (const file of readdirSync(agreementsDir).filter((f) => f.endsWith(".json"))) {
            authoredByName[file.replace(/\.json$/, "")] = JSON.parse(readFileSync(path.join(agreementsDir, file), "utf8"));
        }
        const byName: Record<string, RegisteredAgreement> = {};
        for (const [name, { document, agreementHash }] of Object.entries(composeAuthoredAgreements(authoredByName, all))) {
            expect(document.name, `${name}.json carries its name`).toBeTruthy();
            expect(agreementHashOf(document)).toBe(agreementHash);
            byName[name] = document;
        }
        const used = new Set<string>(Object.values(authoredByName).flatMap((a) => (a.mandatory ? [a.mandatory] : [])));
        const dir = path.resolve(__dirname, "../../assemblies");
        for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
            const authored = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as { agreements: { agreement: string }[] };
            for (const entry of authored.agreements) used.add(entry.agreement);
            const { assembly, agreements } = assembleAuthored(authored, byName, all);
            for (const key of assemblyComposedClauseKeys(assembly, agreements)) expect(all.get(key), `${file} ${key}`).toBeDefined();
            expect(assemblyHashOf(assembly)).toMatch(/^0x[0-9a-f]{64}$/);
            for (const entry of assembly.agreements) expect(agreements[entry.agreementHash], `${file} ${entry.id}`).toBeDefined();
        }
        for (const name of Object.keys(byName)) expect(used.has(name), `agreements/${name}.json is bound by a reference assembly or picked`).toBe(true);
    });
});

describe("resolveAuthoredClauseKeys (seed-time authoring resolver)", () => {
    const specs = specSourceOf(["figaro-commerce", "figaro-topology", "figaro-applicable-law", "figaro-data-license"]
        .map((n) => viewOf(rawSpecOf(n))));

    it("rewrites a name-keyed assembly's agreements and assembly-scoped clauses to keys", () => {
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
            disclosurePolicy: [{ assemblyHash: `0x${"1".repeat(64)}`, clauseId: "figaro-data-license", posture: "buyer", offered: true }],
            assemblyBindings: [{ bindingId: "b", counterpartyBindings: [{ clauseId: "figaro-commerce", addresses: [] }] }],
            profileClauseValues: { "figaro-commerce": { a: 1 } },
        };
        const resolved = resolveAuthoredClauseKeys(profile, specs) as unknown as Record<string, any>;
        expect(resolved.disclosurePolicy[0]).toEqual({
            assemblyHash: `0x${"1".repeat(64)}`, clauseKey: keyOf("figaro-data-license"), posture: "buyer", offered: true,
        });
        expect(resolved.assemblyBindings[0].counterpartyBindings[0]).toEqual({ clauseKey: keyOf("figaro-commerce"), addresses: [] });
        expect(resolved.profileClauseValues).toEqual({ [keyOf("figaro-commerce")]: { a: 1 } });

        const catalog = { items: [{ id: "i", clauseValues: { "figaro-commerce": {} }, dataSold: { assemblyHash: "0x", clauseId: "figaro-data-license", posture: "seller" } }] };
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

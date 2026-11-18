import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { keccak256, toHex, concat, type Hex } from "viem";
import {
    computeProcessLeaf,
    PROCESS_LEAF_DOMAIN,
    PROCESS_LEAF_DOMAIN_LABEL,
    PROCESS_TERMS_LEAF_KEY,
    agreementHashOf,
    assertNotReservedKey,
    buildAgreementInclusionProof,
    resolveAuthoredClauseKeys,
    agreementClauses,
    agreementLeafBytes,
    processDesignComposedClauseKeys,
    processDesignHashOf,
    processDesignLeaves,
    processDesignFollows,
    agreementClauseLeaves,
    buildRegisteredClauseInclusionProof,
} from "../src/assembly.js";
import type { ProcessDesign, RegisteredAgreement } from "../src/assembly.js";
import { PROVENANCE_LEAF_KEY, buildMerkleRoot, canonicalize, computeClauseLeaf, hashClauseData, sortLeaves, verifyInclusionProof } from "../src/agreement.js";
import { composeAuthoredProcessDesign, composeAuthoredAgreement, composeAuthoredAgreements } from "../src/projection.js";
import { hydrateAuthored } from "./hydrate.js";
import { keyOf, rawSpecOf, specSourceOf, viewOf } from "./specFixtures.js";

describe("processDesignComposedClauseKeys", () => {
    it("unions the assembly-scoped clauses with every agreement's clauses, sorted and de-duplicated", () => {
        const { assembly, agreements } = hydrateAuthored({
            assemblyClauses: { [keyOf("figaro-applicable-law")]: {} },
            agreements: [
                { id: "agreement-0", clauses: { [keyOf("figaro-commerce")]: {} } },
                { id: "agreement-1", clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-handoff")]: {} } },
            ],
        });
        expect(processDesignComposedClauseKeys(assembly, agreements)).toEqual(
            ["figaro-applicable-law", "figaro-commerce", "figaro-handoff"].map(keyOf).sort(),
        );
    });

    it("tolerates a assembly without assembly-scoped clauseEntries, and refuses an agreement it cannot read", () => {
        const { assembly, agreements } = hydrateAuthored({
            agreements: [{ id: "agreement-0", clauses: { [keyOf("figaro-commerce")]: {} } }],
        });
        expect(processDesignComposedClauseKeys(assembly, agreements)).toEqual([keyOf("figaro-commerce")]);
        expect(() => processDesignComposedClauseKeys(assembly, {})).toThrow(/not hydrated/);
    });
});

describe("the registered agreement hash", () => {
    const composed = { clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-geolocation")]: {} } };

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
        expect(() => agreementHashOf({ clauses: { [PROCESS_TERMS_LEAF_KEY]: {} } })).toThrow(/reserved/);
    });

    it("moves with any clause or value", () => {
        expect(agreementHashOf({ clauses: { ...composed.clauses, [keyOf("figaro-handoff")]: {} } })).not.toBe(agreementHashOf(composed));
        expect(agreementHashOf({ clauses: { ...composed.clauses, [keyOf("figaro-commerce")]: { x: 1 } } })).not.toBe(agreementHashOf(composed));
    });
});

describe("the composition tree", () => {
    const A = `0x${"aa".repeat(32)}` as Hex;
    const B = `0x${"bb".repeat(32)}` as Hex;
    const COMMERCE = keyOf("figaro-commerce");

    it("an agreement's bytes are canonical {clauses, follows, slot} — slot, the wire name for the agreement's index", () => {
        const bytes = agreementLeafBytes({ clauses: { [COMMERCE]: { x: 1 } }, follows: ["agreement-0"] }, 1);
        expect(Buffer.from(bytes.slice(2), "hex").toString("utf8"))
            .toBe(`{"agreement":1,"clauses":{"${COMMERCE}":{"x":1}},"follows":["agreement-0"]}`);
        // An absent follows commits as the root's empty list.
        expect(agreementLeafBytes({ clauses: {} }, 0)).toBe(agreementLeafBytes({ clauses: {}, follows: [] }, 0));
        // The edges are part of the assembly's identity.
        const root: ProcessDesign = { agreements: [{ id: "agreement-0", agreementHash: A, clauses: {}, follows: [] }, { id: "agreement-1", agreementHash: B, clauses: {}, follows: ["agreement-0"] }] };
        const flat: ProcessDesign = { agreements: [{ id: "agreement-0", agreementHash: A, clauses: {}, follows: [] }, { id: "agreement-1", agreementHash: B, clauses: {}, follows: [] }] };
        expect(processDesignHashOf(root)).not.toBe(processDesignHashOf(flat));
        expect(() => agreementLeafBytes({ clauses: {} }, -1)).toThrow(/non-negative/);
        expect(() => agreementLeafBytes({ clauses: {}, follows: [1 as unknown as string] }, 0)).toThrow(/list of entry labels/);
        // One label named twice: the design could register but never check
        // out, since checkout's topology leaf refuses the repeated order hash.
        expect(() => agreementLeafBytes({ clauses: {}, follows: ["agreement-0", "agreement-0"] }, 1)).toThrow(/names entry agreement-0 twice/);
    });

    it("a one-entry assembly's root is its agreement's leaf; terms add a leaf", () => {
        const one: ProcessDesign = { agreements: [{ id: "agreement-0", agreementHash: A, clauses: {} }] };
        const { leaf, proof, agreementContentHash } = buildAgreementInclusionProof(one, 0);
        expect(proof).toEqual([]);
        expect(processDesignHashOf(one)).toBe(leaf);
        expect(agreementContentHash).toBe(keccak256(agreementLeafBytes({ clauses: {} }, 0)));
        expect(leaf).toBe(computeProcessLeaf(A, agreementContentHash));
        const termed = { ...one, assemblyClauses: { [keyOf("figaro-applicable-law")]: { law: "x" } } };
        expect(processDesignLeaves(termed)).toHaveLength(2);
        expect(processDesignLeaves(termed)).toContain(
            computeProcessLeaf(PROCESS_TERMS_LEAF_KEY, hashClauseData({ clause: PROCESS_TERMS_LEAF_KEY, data: termed.assemblyClauses })),
        );
        expect(processDesignHashOf(termed)).not.toBe(processDesignHashOf(one));
        // Empty terms are no leaf.
        expect(processDesignHashOf({ ...one, assemblyClauses: {} })).toBe(processDesignHashOf(one));
    });

    it("the same agreement in two agreements is two leaves; editorial prose never moves the root", () => {
        const two: ProcessDesign = {
            agreements: [
                { id: "agreement-0", agreementHash: A, clauses: {}, follows: [] },
                { id: "agreement-1", agreementHash: A, clauses: {}, follows: ["agreement-0"] },
            ],
        };
        expect(new Set(processDesignLeaves(two)).size).toBe(2);
        expect(processDesignHashOf({ ...two, name: "x", faq: [{ question: "q", answer: "a" }] })).toBe(processDesignHashOf(two));
        for (const i of [0, 1]) {
            const { leaf, proof } = buildAgreementInclusionProof(two, i);
            expect(verifyInclusionProof(processDesignHashOf(two), leaf, proof)).toBe(true);
        }
        expect(() => buildAgreementInclusionProof(two, 2)).toThrow(/not in the assembly/);
    });

    it("an assembly leaf carries the assembly tree's domain, so an assembly root never shares the agreement format's shape", () => {
        expect(PROCESS_LEAF_DOMAIN).toBe(keccak256(toHex(PROCESS_LEAF_DOMAIN_LABEL)));
        const dataHash = keccak256(agreementLeafBytes({ clauses: {} }, 0));
        const assemblyLeaf = computeProcessLeaf(A, dataHash);
        const agreementFormatLeaf = computeClauseLeaf({ clause: A, dataHash });
        expect(assemblyLeaf).not.toBe(agreementFormatLeaf);
        expect(assemblyLeaf).toBe(keccak256(keccak256(concat([PROCESS_LEAF_DOMAIN, A, dataHash]))));
        // a one-agreement assembly's root is its assembly leaf, never the clause-shaped leaf of the same key and bytes
        const one = { agreements: [{ id: "agreement-0", agreementHash: A, clauses: {} }] };
        expect(processDesignHashOf(one)).toBe(assemblyLeaf);
        expect(processDesignHashOf(one)).not.toBe(agreementHashOf({ clauses: { [A]: {} } }));
    });

    it("a membership proof under a different root does not verify", () => {
        const t1: ProcessDesign = { agreements: [{ id: "agreement-0", agreementHash: A, clauses: {} }, { id: "agreement-1", agreementHash: B, clauses: {} }] };
        const t2: ProcessDesign = { agreements: [{ id: "agreement-0", agreementHash: B, clauses: {} }, { id: "agreement-1", agreementHash: A, clauses: {} }] };
        const { leaf, proof } = buildAgreementInclusionProof(t1, 0);
        expect(verifyInclusionProof(processDesignHashOf(t2), leaf, proof)).toBe(false);
    });

    it("refuses the two reserved format keys as an agreement's agreement hash", () => {
        for (const reserved of [PROVENANCE_LEAF_KEY, PROCESS_TERMS_LEAF_KEY]) {
            const t: ProcessDesign = { agreements: [{ id: "agreement-0", agreementHash: reserved, clauses: {} }] };
            expect(() => processDesignHashOf(t)).toThrow(/reserved format key/);
            expect(() => assertNotReservedKey(reserved)).toThrow(/reserved format key/);
        }
        expect(PROCESS_TERMS_LEAF_KEY).toBe(keccak256(toHex("figaro-assembly-terms")));
    });
});

describe("an agreement's clauses at checkout", () => {
    const COMMERCE = keyOf("figaro-commerce");
    const hydrated = hydrateAuthored({
        agreements: [
            { id: "agreement-0", clauses: { [COMMERCE]: {} }, follows: [] },
            { id: "agreement-1", clauses: { [COMMERCE]: {} }, follows: ["agreement-0"] },
        ],
    });

    it("one registered agreement serves both agreements; each agreement's fill merges over it", () => {
        const [s0, s1] = hydrated.assembly.agreements;
        expect(s0.agreementHash).toBe(s1.agreementHash);
        expect(agreementClauses(hydrated, s1)).toEqual({ [COMMERCE]: {} });
        expect(agreementClauses(hydrated, { ...s1, clauses: { [COMMERCE]: { x: 1 } } })).toEqual({ [COMMERCE]: { x: 1 } });
        expect(processDesignFollows(s1)).toEqual(["agreement-0"]);
        expect(processDesignFollows(s0)).toEqual([]);
    });

    it("refuses an agreement fill naming a clause its agreement does not compose", () => {
        const entry = { ...hydrated.assembly.agreements[0], clauses: { [keyOf("figaro-handoff")]: { x: 1 } } };
        expect(() => agreementClauses(hydrated, entry)).toThrow(/does not compose/);
    });
});

describe("composeAuthoredAgreement + composeAuthoredProcessDesign (seed-time derivation)", () => {
    const names = ["figaro-commerce", "figaro-applicable-law", "figaro-handoff"];
    const specs = specSourceOf(names.map((n) => viewOf(rawSpecOf(n))));
    /** The commerce clause, named as a designer composes it. */
    const COMMERCE = { "figaro-commerce": {} };
    /** The commerce clause alone: a complete agreement with nothing else composed. */
    const base = composeAuthoredAgreement({ name: "Line items", clauses: { ...COMMERCE } }, specs).document;

    it("composes an authored agreement by name: the words ride beside the clauses, outside the key", () => {
        const { document, agreementHash } = composeAuthoredAgreement(
            { name: "A hand-off", summary: "one hand-off", clauses: { ...COMMERCE, "figaro-handoff": {} } },
            specs,
        );
        expect(document.clauses).toEqual({ [keyOf("figaro-commerce")]: {}, [keyOf("figaro-handoff")]: {} });
        expect(document.name).toBe("A hand-off");
        expect(agreementHash).toBe(agreementHashOf({ clauses: document.clauses }));
        expect(agreementHashOf(document)).toBe(agreementHash);
        expect(() => composeAuthoredAgreement({ name: "none" }, specs)).toThrow(/no clauses/);
        // No clause of any shape is required — commerce is the designer's
        // choice, since the commitment carries the payment — but an empty
        // composition hashes to bytes32(0), which the registry refuses.
        expect(composeAuthoredAgreement({ clauses: { "figaro-handoff": {} } }, specs).document.clauses)
            .toEqual({ [keyOf("figaro-handoff")]: {} });
        expect(() => composeAuthoredAgreement({ clauses: {} }, specs)).toThrow(/composes no clause/);
    });

    it("composes a set of authored agreements by name", () => {
        const composed = composeAuthoredAgreements({
            handoff: { clauses: { ...COMMERCE, "figaro-handoff": {} } },
            base: { name: "Line items", clauses: { ...COMMERCE } },
        }, specs);
        expect(composed.base.agreementHash).toBe(agreementHashOf(base));
        expect(composed.handoff.document.clauses).toEqual({ ...base.clauses, [keyOf("figaro-handoff")]: {} });
    });

    it("assembles an authored assembly over named agreements: the entry binds the agreement's hash and carries its own parents", () => {
        const handoff = composeAuthoredAgreement({ clauses: { ...COMMERCE, "figaro-handoff": {} } }, specs).document;
        const bare = base;
        const { assembly, agreements } = composeAuthoredProcessDesign({
            name: "editorial",
            assemblyClauses: { "figaro-applicable-law": { applicableLaw: "ch" } },
            agreements: [
                { id: "agreement-0", agreement: "bare" },
                { id: "agreement-1", agreement: "bare", follows: ["agreement-0"] },
                { id: "agreement-2", agreement: "handoff", follows: ["agreement-0"] },
            ],
        }, { bare, handoff }, specs);
        expect(assembly.name).toBe("editorial");
        expect(assembly.assemblyClauses).toEqual({ [keyOf("figaro-applicable-law")]: { applicableLaw: "ch" } });
        // Two agreements bind one agreement; the set holds each distinct one once.
        expect(Object.keys(agreements)).toHaveLength(2);
        expect(assembly.agreements[0].agreementHash).toBe(assembly.agreements[1].agreementHash);
        expect(assembly.agreements[0].agreementHash).toBe(agreementHashOf(bare));
        expect(assembly.agreements[2].agreementHash).toBe(agreementHashOf(handoff));
        expect(assembly.agreements[0]).toMatchObject({ clauses: {}, follows: [] });
        expect(assembly.agreements[1]).toMatchObject({ clauses: {}, follows: ["agreement-0"] });
        for (const entry of assembly.agreements) expect(agreementHashOf(agreements[entry.agreementHash])).toBe(entry.agreementHash);
    });

    it("refuses a entry that names no agreement, an unknown one, or inline clauses", () => {
        const bare = base;
        expect(() => composeAuthoredProcessDesign({ agreements: [{ id: "o" }] }, { bare }, specs)).toThrow(/names no agreement/);
        expect(() => composeAuthoredProcessDesign({ agreements: [{ id: "o", agreement: "nope" }] }, { bare }, specs)).toThrow(/not among the authored agreements/);
        expect(() => composeAuthoredProcessDesign({ agreements: [{ id: "o", agreement: "bare", clauses: {} }] }, { bare }, specs)).toThrow(/inline/);
        expect(() => composeAuthoredProcessDesign({ agreements: [] }, { bare }, specs)).toThrow(/no agreements/);
    });

    it("derives every reference assembly in assemblies/ over agreements/ against clauses/, each agreement file bound", () => {
        const clausesDir = path.resolve(__dirname, "../../clauses");
        const all = specSourceOf(readdirSync(clausesDir).filter((f) => f.endsWith(".json"))
            .map((f) => viewOf(JSON.parse(readFileSync(path.join(clausesDir, f), "utf8")))));
        const agreementsDir = path.resolve(__dirname, "../../agreements");
        const authoredByName: Record<string, object> = {};
        for (const file of readdirSync(agreementsDir).filter((f) => f.endsWith(".json"))) {
            authoredByName[file.replace(/\.json$/, "")] = JSON.parse(readFileSync(path.join(agreementsDir, file), "utf8"));
        }
        const byName: Record<string, RegisteredAgreement> = {};
        for (const [name, { document, agreementHash }] of Object.entries(composeAuthoredAgreements(authoredByName, all))) {
            expect(document.name, `${name}.json carries its name`).toBeTruthy();
            expect(agreementHashOf(document)).toBe(agreementHash);
            byName[name] = document;
        }
        const used = new Set<string>();
        const dir = path.resolve(__dirname, "../../assemblies");
        for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
            const authored = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as { agreements: { agreement: string }[] };
            for (const entry of authored.agreements) used.add(entry.agreement);
            const { assembly, agreements } = composeAuthoredProcessDesign(authored, byName, all);
            for (const key of processDesignComposedClauseKeys(assembly, agreements)) expect(all.get(key), `${file} ${key}`).toBeDefined();
            expect(processDesignHashOf(assembly)).toMatch(/^0x[0-9a-f]{64}$/);
            for (const entry of assembly.agreements) expect(agreements[entry.agreementHash], `${file} ${entry.id}`).toBeDefined();
        }
        for (const name of Object.keys(byName)) expect(used.has(name), `agreements/${name}.json is bound by a reference assembly`).toBe(true);
    });
});

describe("resolveAuthoredClauseKeys (seed-time authoring resolver)", () => {
    const specs = specSourceOf(["figaro-commerce", "figaro-applicable-law", "figaro-data-license"]
        .map((n) => viewOf(rawSpecOf(n))));

    it("rewrites a name-keyed assembly's agreements and assembly-scoped clauses to keys", () => {
        const authored = {
            name: "editorial",
            assemblyClauses: { "figaro-applicable-law": { law: "x" } },
            agreements: [{ id: "agreement-0", clauses: { "figaro-commerce": {}, "figaro-data-license": {} } }],
        };
        const resolved = resolveAuthoredClauseKeys(authored, specs) as unknown as {
            name: string; assemblyClauses: unknown; agreements: { clauses: Record<string, unknown> }[];
        };
        expect(resolved.name).toBe("editorial");
        expect(resolved.assemblyClauses).toEqual({ [keyOf("figaro-applicable-law")]: { law: "x" } });
        expect(resolved.agreements[0].clauses).toEqual({
            [keyOf("figaro-commerce")]: {},
            [keyOf("figaro-data-license")]: {},
        });
        // The input is not mutated.
        expect(Object.keys(authored.agreements[0].clauses)).toEqual(["figaro-commerce", "figaro-data-license"]);
    });

    it("rewrites a member document's named clause references to clauseKey", () => {
        const profile = {
            name: "m",
            processBindings: [{ bindingId: "b", coSellerBindings: [{ clauseId: "figaro-commerce", addresses: [] }] }],
            profileClauseValues: { "figaro-commerce": { a: 1 } },
        };
        const resolved = resolveAuthoredClauseKeys(profile, specs) as unknown as Record<string, any>;
        expect(resolved.processBindings[0].coSellerBindings[0]).toEqual({ clauseKey: keyOf("figaro-commerce"), addresses: [] });
        expect(resolved.profileClauseValues).toEqual({ [keyOf("figaro-commerce")]: { a: 1 } });

        const catalog = { items: [{ id: "i", clauseValues: { "figaro-commerce": {} } }] };
        const c = resolveAuthoredClauseKeys(catalog, specs) as unknown as Record<string, any>;
        expect(c.items[0].clauseValues).toEqual({ [keyOf("figaro-commerce")]: {} });
    });

    it("refuses a name two loaded specs share unless written name@version, and resolves the stated one", () => {
        const v1 = rawSpecOf("figaro-commerce");
        const v2 = { ...v1, version: (v1.version as number) + 1 };
        const twoCommerce = specSourceOf([viewOf(v1), viewOf(v2)]);
        const doc = { agreements: [{ id: "agreement-0", clauses: { "figaro-commerce": {} } }] };
        expect(() => resolveAuthoredClauseKeys(doc, twoCommerce)).toThrow(/names 2 loaded clause specs/);
        const pinned = { agreements: [{ id: "agreement-0", clauses: { [`figaro-commerce@${v2.version}`]: {} } }] };
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

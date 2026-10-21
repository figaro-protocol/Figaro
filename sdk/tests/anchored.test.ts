/**
 * The anchor functions — the only makers of `Anchored<T>`. Each returns the
 * document when its recomputed digest equals the chain's, and null when it
 * does not, when the document is malformed, or when it is the wrong kind.
 */

import { describe, it, expect } from "vitest";
import { keccak256, toBytes, toHex } from "viem";
import {
    anchorAgreement,
    anchorAttestationContent,
    anchorClauseSpec,
    anchorRegisteredAgreement,
    anchorAssembly,
    deriveAnchored,
    hydrateAssembly,
} from "../src/anchored.js";
import { PROVENANCE_LEAF_KEY, canonicalContentHash, canonicalize, computeCheckoutHash, type Agreement } from "../src/agreement.js";
import { computeClauseKey } from "../src/discovery.js";
import { ASSEMBLY_TERMS_LEAF_KEY, agreementHashOf, assemblyCompositionHash, type Assembly } from "../src/assembly.js";
import { keyOf } from "./specFixtures.js";

const OTHER = `0x${"11".repeat(32)}` as const;

const spec = { clauseId: "test-anchor", version: 1, title: "T", description: "D", fields: [] };

const composed = { name: "Editorial", clauses: { [keyOf("figaro-commerce")]: {}, [keyOf("figaro-topology")]: {} } };

const assembly: Assembly = {
    name: "Editorial",
    agreements: [{ id: "order-0", agreementHash: agreementHashOf(composed), clauses: { [keyOf("figaro-topology")]: { parentOrderHashes: [] } } }],
};

const agreement: Agreement = {
    version: "a1",
    buyer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    seller: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    clauses: [{ clause: keyOf("figaro-modalities"), data: { modality: "pickup" } }],
};

describe("anchorClauseSpec", () => {
    // The key is keccak256 of the PINNED BYTES, so the reader hashes the bytes
    // it fetched — never a re-canonicalization of what it parsed.
    const pinned = canonicalize(spec);
    const key = keccak256(toBytes(pinned));

    it("returns the spec parsed from the bytes its key names (text or bytes)", () => {
        expect(anchorClauseSpec(pinned, key)).toEqual(spec);
        expect(anchorClauseSpec(toBytes(pinned), key)).toEqual(spec);
        expect(key).toBe(computeClauseKey(spec)); // the reference tooling pins canonical bytes
    });
    it("matches the key in any letter case", () => {
        expect(anchorClauseSpec(pinned, key.toUpperCase().replace("0X", "0x"))).toEqual(spec);
    });
    it("hashes the bytes as fetched: the same document in another byte form is another key", () => {
        const pretty = JSON.stringify(spec, null, 2);
        expect(anchorClauseSpec(pretty, key)).toBeNull();
        expect(anchorClauseSpec(pretty, keccak256(toBytes(pretty)))).toEqual(spec);
    });
    it("refuses other bytes under the key, and bytes that are not JSON", () => {
        expect(anchorClauseSpec(canonicalize({ ...spec, title: "Changed" }), key)).toBeNull();
        expect(anchorClauseSpec(pinned, OTHER)).toBeNull();
        expect(anchorClauseSpec("not json", keccak256(toBytes("not json")))).toBeNull();
    });
    it("strips prototype-pollution keys from what it parses", () => {
        const hostile = '{"__proto__":{"polluted":true},"clauseId":"x"}';
        const parsed = anchorClauseSpec(hostile, keccak256(toBytes(hostile))) as Record<string, unknown>;
        expect(parsed).toEqual({ clauseId: "x" });
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
});

describe("anchorAssembly", () => {
    it("returns the assembly its composition hash names, editorial prose aside", () => {
        const hash = assemblyCompositionHash(assembly);
        expect(anchorAssembly(assembly, hash)).toBe(assembly);
        const renamed = { ...assembly, name: "Renamed" };
        expect(anchorAssembly(renamed, hash)).toBe(renamed);
    });
    it("refuses a changed composition", () => {
        const changed = { ...assembly, agreements: [{ ...assembly.agreements[0], clauses: {} }] };
        expect(anchorAssembly(changed, assemblyCompositionHash(assembly))).toBeNull();
    });
    it("refuses an agreement whose key is malformed or reserved", () => {
        for (const agreementHash of ["0x1234", PROVENANCE_LEAF_KEY, ASSEMBLY_TERMS_LEAF_KEY]) {
            expect(anchorAssembly({ agreements: [{ id: "order-0", agreementHash, clauses: {} }] }, OTHER)).toBeNull();
        }
    });
    it("refuses a document that is not a assembly", () => {
        expect(anchorAssembly({ name: "no agreements" }, OTHER)).toBeNull();
        expect(anchorAssembly("text", OTHER)).toBeNull();
        expect(anchorAssembly(null, OTHER)).toBeNull();
    });
});

describe("anchorRegisteredAgreement", () => {
    const key = agreementHashOf(composed);

    it("returns the document whose { clauses } subset hashes to the key — parsed, bytes, or text", () => {
        expect(anchorRegisteredAgreement(composed, key)).toBe(composed);
        expect(anchorRegisteredAgreement(JSON.stringify(composed), key)).toEqual(composed);
        expect(anchorRegisteredAgreement(toBytes(JSON.stringify(composed, null, 2)), key)).toEqual(composed);
        // Editorial prose is outside the key.
        expect(anchorRegisteredAgreement({ ...composed, name: "Renamed" }, key)).toEqual({ ...composed, name: "Renamed" });
    });
    it("refuses a document whose bytes do not hash to its key", () => {
        const changed = { clauses: { ...composed.clauses, [keyOf("figaro-handoff")]: {} } };
        expect(anchorRegisteredAgreement(changed, key)).toBeNull();
        expect(anchorRegisteredAgreement(JSON.stringify(changed), key)).toBeNull();
        expect(anchorRegisteredAgreement(composed, OTHER)).toBeNull();
    });
    it("refuses what is not a agreement, and a reserved key", () => {
        for (const bad of [null, "not json", { name: "no clauses" }, { clauses: [] }, [composed]]) {
            expect(anchorRegisteredAgreement(bad, key)).toBeNull();
        }
        expect(anchorRegisteredAgreement(composed, "0x1234")).toBeNull();
        expect(anchorRegisteredAgreement(composed, PROVENANCE_LEAF_KEY)).toBeNull();
        expect(anchorRegisteredAgreement(composed, ASSEMBLY_TERMS_LEAF_KEY)).toBeNull();
    });
    it("strips prototype-pollution keys from what it parses", () => {
        const hostile = `{"__proto__":{"polluted":true},"clauses":${JSON.stringify(composed.clauses)}}`;
        expect(anchorRegisteredAgreement(hostile, key)).toEqual({ clauses: composed.clauses });
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
});

describe("hydrateAssembly", () => {
    const key = agreementHashOf(composed);
    const two: Assembly = {
        agreements: [
            assembly.agreements[0],
            { id: "order-1", agreementHash: key, clauses: { [keyOf("figaro-topology")]: { parentOrderHashes: ["order-0"] } } },
        ],
    };

    it("reads each distinct agreement's agreement once and verifies it against its key", async () => {
        const reads: string[] = [];
        const hydrated = await hydrateAssembly(two, async (k) => { reads.push(k); return JSON.stringify(composed); });
        expect(reads).toEqual([key]);
        expect(hydrated?.assembly).toBe(two);
        expect(hydrated?.agreements[key.toLowerCase() as `0x${string}`]).toEqual(composed);
    });

    it("is absence when any agreement's document is unread, throws, or does not hash to its key", async () => {
        expect(await hydrateAssembly(two, async () => null)).toBeNull();
        expect(await hydrateAssembly(two, async () => { throw new Error("gateway down"); })).toBeNull();
        expect(await hydrateAssembly(two, async () => ({ clauses: { [keyOf("figaro-handoff")]: {} } }))).toBeNull();
    });
});

describe("anchorAgreement", () => {
    it("returns the agreement its hash names", () => {
        expect(anchorAgreement(agreement, computeCheckoutHash(agreement))).toBe(agreement);
    });
    it("refuses a changed clause", () => {
        const changed = { ...agreement, clauses: [{ ...agreement.clauses[0]!, data: { modality: "delivery" } }] };
        expect(anchorAgreement(changed, computeCheckoutHash(agreement))).toBeNull();
    });
    it("refuses an agreement whose clauses do not hash", () => {
        const duplicated = { ...agreement, clauses: [agreement.clauses[0]!, agreement.clauses[0]!] };
        expect(anchorAgreement(duplicated, OTHER)).toBeNull();
        expect(anchorAgreement({ clauses: "none" }, OTHER)).toBeNull();
        expect(anchorAgreement(null, OTHER)).toBeNull();
    });
    it("accepts the provenance leaf as two 32-byte keys under the hash, and refuses anything else there", () => {
        const P = { agreementHash: `0x${"33".repeat(32)}`, compositionHash: `0x${"22".repeat(32)}` } as const;
        const named = { ...agreement, provenance: P };
        const root = computeCheckoutHash(named);
        expect(anchorAgreement(named, root)).toBe(named);
        // Dropping or changing either key changes the root.
        expect(anchorAgreement(agreement, root)).toBeNull();
        expect(anchorAgreement({ ...named, provenance: { ...P, compositionHash: OTHER } }, root)).toBeNull();
        expect(anchorAgreement({ ...named, provenance: { ...P, agreementHash: OTHER } }, root)).toBeNull();
        // A provenance that is not two 32-byte hex keys is not the agreement format.
        for (const bad of [P.compositionHash, "0x1234", 7, null, { compositionHash: P.compositionHash }, { ...P, agreementHash: "0x12" }]) {
            expect(anchorAgreement({ ...named, provenance: bad }, root)).toBeNull();
        }
    });
});

describe("anchorAttestationContent", () => {
    it("returns the bytes their contentRef names", () => {
        const content = toHex("a temperature record");
        expect(anchorAttestationContent(content, keccak256(content))).toBe(content);
    });
    it("refuses other bytes", () => {
        expect(anchorAttestationContent(toHex("other"), keccak256(toHex("a temperature record")))).toBeNull();
    });
});

describe("deriveAnchored", () => {
    it("carries what is read out of an anchored document", () => {
        const anchored = anchorClauseSpec(canonicalize(spec), canonicalContentHash(spec))!;
        expect(deriveAnchored(anchored, (d) => (d as typeof spec).title)).toBe("T");
    });
    it("lets a rejecting parse throw", () => {
        const anchored = anchorClauseSpec(canonicalize(spec), canonicalContentHash(spec))!;
        expect(() => deriveAnchored(anchored, () => { throw new Error("not a clause"); })).toThrow("not a clause");
    });
});

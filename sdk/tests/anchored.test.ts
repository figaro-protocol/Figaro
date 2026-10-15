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
    anchorTemplate,
    deriveAnchored,
} from "../src/anchored.js";
import { canonicalContentHash, canonicalize, computeAgreementHash, type Agreement } from "../src/agreement.js";
import { computeClauseKey } from "../src/discovery.js";
import { templateCompositionHash, type AssemblyTemplate } from "../src/assembly.js";
import { keyOf } from "./specFixtures.js";

const OTHER = `0x${"11".repeat(32)}` as const;

const spec = { clauseId: "test-anchor", version: 1, title: "T", description: "D", fields: [] };

const template = {
    name: "Editorial",
    agreements: [{ id: "root", clauses: { [keyOf("figaro-commerce")]: {} } }],
} as unknown as AssemblyTemplate;

const agreement: Agreement = {
    version: "a1",
    buyer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    seller: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    sections: [{ clause: keyOf("figaro-modalities"), data: { modality: "pickup" } }],
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

describe("anchorTemplate", () => {
    it("returns the template its composition hash names, editorial prose aside", () => {
        const hash = templateCompositionHash(template);
        expect(anchorTemplate(template, hash)).toBe(template);
        const renamed = { ...template, name: "Renamed" };
        expect(anchorTemplate(renamed, hash)).toBe(renamed);
    });
    it("refuses a changed composition", () => {
        const changed = { ...template, agreements: [{ id: "root", clauses: {} }] };
        expect(anchorTemplate(changed, templateCompositionHash(template))).toBeNull();
    });
    it("refuses a document that is not a template", () => {
        expect(anchorTemplate({ name: "no agreements" }, OTHER)).toBeNull();
        expect(anchorTemplate("text", OTHER)).toBeNull();
        expect(anchorTemplate(null, OTHER)).toBeNull();
    });
});

describe("anchorAgreement", () => {
    it("returns the agreement its hash names", () => {
        expect(anchorAgreement(agreement, computeAgreementHash(agreement))).toBe(agreement);
    });
    it("refuses a changed section", () => {
        const changed = { ...agreement, sections: [{ ...agreement.sections[0]!, data: { modality: "delivery" } }] };
        expect(anchorAgreement(changed, computeAgreementHash(agreement))).toBeNull();
    });
    it("refuses an agreement whose sections do not hash", () => {
        const duplicated = { ...agreement, sections: [agreement.sections[0]!, agreement.sections[0]!] };
        expect(anchorAgreement(duplicated, OTHER)).toBeNull();
        expect(anchorAgreement({ sections: "none" }, OTHER)).toBeNull();
        expect(anchorAgreement(null, OTHER)).toBeNull();
    });
    it("accepts the provenance leaf as a 32-byte hash under the hash, and refuses anything else there", () => {
        const named = { ...agreement, provenance: `0x${"22".repeat(32)}` as const };
        const root = computeAgreementHash(named);
        expect(anchorAgreement(named, root)).toBe(named);
        // Dropping or changing the provenance changes the root.
        expect(anchorAgreement(agreement, root)).toBeNull();
        expect(anchorAgreement({ ...named, provenance: OTHER }, root)).toBeNull();
        // A provenance that is not a 32-byte hex string is not the agreement format.
        for (const bad of ["0x1234", "22".repeat(32), 7, null, { compositionHash: named.provenance }]) {
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

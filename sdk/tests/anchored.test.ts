/**
 * The anchor functions — the only makers of `Anchored<T>`. Each returns the
 * document when its recomputed digest equals the chain's, and null when it
 * does not, when the document is malformed, or when it is the wrong kind.
 */

import { describe, it, expect } from "vitest";
import { keccak256, toHex } from "viem";
import {
    anchorAgreement,
    anchorAttestationContent,
    anchorClauseSpec,
    anchorTemplate,
    deriveAnchored,
} from "../src/anchored.js";
import { canonicalContentHash, computeAgreementHash, type Agreement } from "../src/agreement.js";
import { templateCompositionHash, type AssemblyTemplate } from "../src/assembly.js";

const OTHER = `0x${"11".repeat(32)}` as const;

const spec = { clauseId: "test-anchor", version: 1, title: "T", description: "D", fields: [] };

const template = {
    name: "Editorial",
    agreements: [{ id: "root", clauses: { "figaro-commerce": {} } }],
} as unknown as AssemblyTemplate;

const agreement: Agreement = {
    version: "a1",
    buyer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    seller: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    sections: [{ clause: "figaro-modalities", version: 1, data: { modality: "pickup" } }],
};

describe("anchorClauseSpec", () => {
    it("returns the spec its content hash names", () => {
        expect(anchorClauseSpec(spec, canonicalContentHash(spec))).toBe(spec);
    });
    it("matches the hash in any letter case", () => {
        expect(anchorClauseSpec(spec, canonicalContentHash(spec).toUpperCase().replace("0X", "0x"))).toBe(spec);
    });
    it("refuses another document under the hash", () => {
        expect(anchorClauseSpec({ ...spec, title: "Changed" }, canonicalContentHash(spec))).toBeNull();
        expect(anchorClauseSpec(spec, OTHER)).toBeNull();
    });
    it("refuses nothing fetched", () => {
        expect(anchorClauseSpec(null, canonicalContentHash(null))).toBeNull();
        expect(anchorClauseSpec(undefined, OTHER)).toBeNull();
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
        const anchored = anchorClauseSpec(spec, canonicalContentHash(spec))!;
        expect(deriveAnchored(anchored, (d) => (d as typeof spec).title)).toBe("T");
    });
    it("lets a rejecting parse throw", () => {
        const anchored = anchorClauseSpec(spec, canonicalContentHash(spec))!;
        expect(() => deriveAnchored(anchored, () => { throw new Error("not a clause"); })).toThrow("not a clause");
    });
});

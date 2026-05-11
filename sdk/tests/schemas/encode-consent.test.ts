import { describe, expect, it } from "vitest";
import { decodeAbiParameters, type Hex } from "viem";
import { encodeConsentContent, type ConsentContent } from "../../src/schemas/encode.js";
import { parseSchemaSpec } from "../../src/schemas/spec.js";
import { validateContent } from "../../src/schemas/validate.js";
import consentSpecRaw from "../../src/schemas/examples/figaro-consent-v1.json" with { type: "json" };

const SAMPLE_HASH: Hex = `0x${"ab".repeat(32)}`;
const ALT_HASH: Hex = `0x${"cd".repeat(32)}`;

function decodeConsent(bytes: Hex): readonly [readonly Hex[], readonly string[], readonly string[]] {
    return decodeAbiParameters(
        [{ type: "bytes32[]" }, { type: "string[]" }, { type: "string[]" }],
        bytes,
    ) as readonly [readonly Hex[], readonly string[], readonly string[]];
}

describe("figaro-consent-v1 — spec", () => {
    it("spec parses cleanly", () => {
        const result = parseSchemaSpec(consentSpecRaw);
        expect(result.ok).toBe(true);
    });

    it("accepts a single-document payload", () => {
        const parsed = parseSchemaSpec(consentSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const content = {
            documents: [
                {
                    documentHash: SAMPLE_HASH,
                    documentVersion: "1.0.0",
                    documentTitle: "Privacy Policy",
                },
            ],
        };
        expect(validateContent(content, parsed.spec).ok).toBe(true);
    });

    it("accepts a multi-document payload", () => {
        const parsed = parseSchemaSpec(consentSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const content = {
            documents: [
                { documentHash: SAMPLE_HASH, documentVersion: "1.0.0", documentTitle: "Terms of Service" },
                { documentHash: ALT_HASH, documentVersion: "2025-04-29", documentTitle: "Privacy Policy" },
            ],
        };
        expect(validateContent(content, parsed.spec).ok).toBe(true);
    });

    it("rejects empty documents array (minItems 1)", () => {
        const parsed = parseSchemaSpec(consentSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({ documents: [] }, parsed.spec).ok).toBe(false);
    });

    it("rejects missing documents (required)", () => {
        const parsed = parseSchemaSpec(consentSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        expect(validateContent({}, parsed.spec).ok).toBe(false);
    });

    it("rejects non-bytes32 documentHash", () => {
        const parsed = parseSchemaSpec(consentSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const content = {
            documents: [{ documentHash: "0xdeadbeef", documentVersion: "1.0.0", documentTitle: "Privacy Policy" }],
        };
        expect(validateContent(content, parsed.spec).ok).toBe(false);
    });

    it("rejects empty documentVersion (minLength 1)", () => {
        const parsed = parseSchemaSpec(consentSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const content = {
            documents: [{ documentHash: SAMPLE_HASH, documentVersion: "", documentTitle: "Privacy Policy" }],
        };
        expect(validateContent(content, parsed.spec).ok).toBe(false);
    });

    it("rejects documentVersion longer than 32 chars", () => {
        const parsed = parseSchemaSpec(consentSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const content = {
            documents: [{ documentHash: SAMPLE_HASH, documentVersion: "a".repeat(33), documentTitle: "Privacy Policy" }],
        };
        expect(validateContent(content, parsed.spec).ok).toBe(false);
    });

    it("rejects documentTitle longer than 200 chars", () => {
        const parsed = parseSchemaSpec(consentSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const content = {
            documents: [{ documentHash: SAMPLE_HASH, documentVersion: "1.0.0", documentTitle: "a".repeat(201) }],
        };
        expect(validateContent(content, parsed.spec).ok).toBe(false);
    });
});

describe("figaro-consent-v1 — encode/decode round-trip", () => {
    it("encodes and decodes a single document exactly", () => {
        const content: ConsentContent = {
            documents: [
                { documentHash: SAMPLE_HASH, documentVersion: "1.0.0", documentTitle: "Privacy Policy" },
            ],
        };
        const bytes = encodeConsentContent(content);
        const [hashes, versions, titles] = decodeConsent(bytes);
        expect(hashes.length).toBe(1);
        expect(hashes[0].toLowerCase()).toBe(SAMPLE_HASH.toLowerCase());
        expect(versions[0]).toBe("1.0.0");
        expect(titles[0]).toBe("Privacy Policy");
    });

    it("encodes and decodes multiple documents exactly", () => {
        const content: ConsentContent = {
            documents: [
                { documentHash: SAMPLE_HASH, documentVersion: "1.0.0", documentTitle: "Terms of Service" },
                { documentHash: ALT_HASH, documentVersion: "2025-04-29", documentTitle: "Privacy Policy" },
            ],
        };
        const bytes = encodeConsentContent(content);
        const [hashes, versions, titles] = decodeConsent(bytes);
        expect(hashes.length).toBe(2);
        expect(versions[1]).toBe("2025-04-29");
        expect(titles[0]).toBe("Terms of Service");
    });

    it("preserves a Unicode title through round-trip", () => {
        const content: ConsentContent = {
            documents: [
                { documentHash: SAMPLE_HASH, documentVersion: "2025-04-29", documentTitle: "プライバシーポリシー" },
            ],
        };
        const bytes = encodeConsentContent(content);
        const [, , titles] = decodeConsent(bytes);
        expect(titles[0]).toBe("プライバシーポリシー");
    });

    it("encodes deterministically", () => {
        const content: ConsentContent = {
            documents: [
                { documentHash: SAMPLE_HASH, documentVersion: "1.0.0", documentTitle: "Privacy Policy" },
            ],
        };
        expect(encodeConsentContent(content)).toBe(encodeConsentContent(content));
    });
});

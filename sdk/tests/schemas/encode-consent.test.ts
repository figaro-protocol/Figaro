import { describe, expect, it } from "vitest";
import { decodeAbiParameters, type Hex } from "viem";
import { embeddedSpec } from "../../src/schemas/embedded.js";
import { encodeContentFromSpec, type ConsentContent } from "../../src/schemas/encode.js";
import { parseSchemaSpec } from "../../src/schemas/spec.js";
import { validateContent } from "../../src/schemas/validate.js";
import consentSpecRaw from "../../src/schemas/examples/figaro-consent-v1.json" with { type: "json" };

const SAMPLE_HASH: Hex = `0x${"ab".repeat(32)}`;
const ALT_HASH: Hex = `0x${"cd".repeat(32)}`;

const CONSENT_SPEC = embeddedSpec("figaro-consent-v1")!;
function encodeConsent(content: ConsentContent): Hex {
    return encodeContentFromSpec(CONSENT_SPEC, content as unknown as Record<string, unknown>);
}

/**
 * Post-Keystone consent encodes as `documents: tuple[]` per the
 * canonical object-array rule (struct-of-arrays was the pre-Keystone
 * per-schema shape). Each document tuple is
 * `(bytes32 documentHash, string documentVersion, string documentTitle)`.
 */
function decodeConsent(
    bytes: Hex,
): readonly [readonly { documentHash: Hex; documentVersion: string; documentTitle: string }[]] {
    return decodeAbiParameters(
        [
            {
                type: "tuple[]",
                components: [
                    { type: "bytes32", name: "documentHash" },
                    { type: "string", name: "documentVersion" },
                    { type: "string", name: "documentTitle" },
                ],
            },
        ],
        bytes,
    ) as readonly [readonly { documentHash: Hex; documentVersion: string; documentTitle: string }[]];
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
        const [docs] = decodeConsent(encodeConsent(content));
        expect(docs.length).toBe(1);
        expect(docs[0].documentHash.toLowerCase()).toBe(SAMPLE_HASH.toLowerCase());
        expect(docs[0].documentVersion).toBe("1.0.0");
        expect(docs[0].documentTitle).toBe("Privacy Policy");
    });

    it("encodes and decodes multiple documents exactly", () => {
        const content: ConsentContent = {
            documents: [
                { documentHash: SAMPLE_HASH, documentVersion: "1.0.0", documentTitle: "Terms of Service" },
                { documentHash: ALT_HASH, documentVersion: "2025-04-29", documentTitle: "Privacy Policy" },
            ],
        };
        const [docs] = decodeConsent(encodeConsent(content));
        expect(docs.length).toBe(2);
        expect(docs[1].documentVersion).toBe("2025-04-29");
        expect(docs[0].documentTitle).toBe("Terms of Service");
    });

    it("preserves a Unicode title through round-trip", () => {
        const content: ConsentContent = {
            documents: [
                { documentHash: SAMPLE_HASH, documentVersion: "2025-04-29", documentTitle: "プライバシーポリシー" },
            ],
        };
        const [docs] = decodeConsent(encodeConsent(content));
        expect(docs[0].documentTitle).toBe("プライバシーポリシー");
    });

    it("encodes deterministically", () => {
        const content: ConsentContent = {
            documents: [
                { documentHash: SAMPLE_HASH, documentVersion: "1.0.0", documentTitle: "Privacy Policy" },
            ],
        };
        expect(encodeConsent(content)).toBe(encodeConsent(content));
    });
});

import { describe, expect, it } from "vitest";
import { decodeAbiParameters, type Hex } from "viem";
import { encodeConsentContent, type ConsentContent } from "../../src/schemas/encode.js";
import { parseSchemaSpec } from "../../src/schemas/spec.js";
import { validateContent } from "../../src/schemas/validate.js";
import consentSpecRaw from "../../src/schemas/examples/figaro-consent-v1.json" with { type: "json" };

const SAMPLE_HASH: Hex = `0x${"ab".repeat(32)}`;

function decodeConsent(bytes: Hex): readonly [Hex, string, string] {
    return decodeAbiParameters(
        [{ type: "bytes32" }, { type: "string" }, { type: "string" }],
        bytes,
    ) as readonly [Hex, string, string];
}

describe("figaro-consent-v1 — spec", () => {
    it("spec parses cleanly", () => {
        const result = parseSchemaSpec(consentSpecRaw);
        expect(result.ok).toBe(true);
    });

    it("accepts a well-formed consent payload", () => {
        const parsed = parseSchemaSpec(consentSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const content = {
            documentHash: SAMPLE_HASH,
            documentVersion: "1.0.0",
            documentTitle: "Figaro Beta Informed Consent Agreement",
        };
        expect(validateContent(content, parsed.spec).ok).toBe(true);
    });

    it("rejects a non-bytes32 documentHash", () => {
        const parsed = parseSchemaSpec(consentSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const content = {
            documentHash: "0xdeadbeef",
            documentVersion: "1.0.0",
            documentTitle: "Figaro Beta Informed Consent Agreement",
        };
        expect(validateContent(content, parsed.spec).ok).toBe(false);
    });

    it("rejects missing documentHash (required)", () => {
        const parsed = parseSchemaSpec(consentSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const content = {
            documentVersion: "1.0.0",
            documentTitle: "Figaro Beta Informed Consent Agreement",
        };
        expect(validateContent(content, parsed.spec).ok).toBe(false);
    });

    it("rejects missing documentVersion (required)", () => {
        const parsed = parseSchemaSpec(consentSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const content = {
            documentHash: SAMPLE_HASH,
            documentTitle: "Figaro Beta Informed Consent Agreement",
        };
        expect(validateContent(content, parsed.spec).ok).toBe(false);
    });

    it("rejects missing documentTitle (required)", () => {
        const parsed = parseSchemaSpec(consentSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const content = {
            documentHash: SAMPLE_HASH,
            documentVersion: "1.0.0",
        };
        expect(validateContent(content, parsed.spec).ok).toBe(false);
    });

    it("rejects empty documentVersion (minLength 1)", () => {
        const parsed = parseSchemaSpec(consentSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const content = {
            documentHash: SAMPLE_HASH,
            documentVersion: "",
            documentTitle: "Figaro Beta Informed Consent Agreement",
        };
        expect(validateContent(content, parsed.spec).ok).toBe(false);
    });

    it("rejects documentVersion longer than 32 chars", () => {
        const parsed = parseSchemaSpec(consentSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const content = {
            documentHash: SAMPLE_HASH,
            documentVersion: "a".repeat(33),
            documentTitle: "Figaro Beta Informed Consent Agreement",
        };
        expect(validateContent(content, parsed.spec).ok).toBe(false);
    });

    it("accepts documentVersion at exactly 32 chars (boundary)", () => {
        const parsed = parseSchemaSpec(consentSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const content = {
            documentHash: SAMPLE_HASH,
            documentVersion: "a".repeat(32),
            documentTitle: "Figaro Beta Informed Consent Agreement",
        };
        expect(validateContent(content, parsed.spec).ok).toBe(true);
    });

    it("rejects documentTitle longer than 200 chars", () => {
        const parsed = parseSchemaSpec(consentSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const content = {
            documentHash: SAMPLE_HASH,
            documentVersion: "1.0.0",
            documentTitle: "a".repeat(201),
        };
        expect(validateContent(content, parsed.spec).ok).toBe(false);
    });

    it("accepts documentTitle at exactly 200 chars (boundary)", () => {
        const parsed = parseSchemaSpec(consentSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const content = {
            documentHash: SAMPLE_HASH,
            documentVersion: "1.0.0",
            documentTitle: "a".repeat(200),
        };
        expect(validateContent(content, parsed.spec).ok).toBe(true);
    });

    it("rejects unknown fields (closed schema)", () => {
        const parsed = parseSchemaSpec(consentSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const content = {
            documentHash: SAMPLE_HASH,
            documentVersion: "1.0.0",
            documentTitle: "Figaro Beta Informed Consent Agreement",
            consenterAddress: "0xabc", // forbidden — recoverable from signature
        };
        expect(validateContent(content, parsed.spec).ok).toBe(false);
    });

    it("rejects revocation flag (closed schema, append-only by design)", () => {
        const parsed = parseSchemaSpec(consentSpecRaw);
        if (!parsed.ok) throw new Error("spec failed to parse");
        const content = {
            documentHash: SAMPLE_HASH,
            documentVersion: "1.0.0",
            documentTitle: "Figaro Beta Informed Consent Agreement",
            consentRevoked: true,
        };
        expect(validateContent(content, parsed.spec).ok).toBe(false);
    });
});

describe("figaro-consent-v1 — encode/decode round-trip", () => {
    it("encodes and decodes a typical payload exactly", () => {
        const content: ConsentContent = {
            documentHash: SAMPLE_HASH,
            documentVersion: "1.0.0",
            documentTitle: "Figaro Beta Informed Consent Agreement",
        };
        const bytes = encodeConsentContent(content);
        const [hash, version, title] = decodeConsent(bytes);
        expect(hash.toLowerCase()).toBe(SAMPLE_HASH.toLowerCase());
        expect(version).toBe(content.documentVersion);
        expect(title).toBe(content.documentTitle);
    });

    it("preserves a Unicode title through round-trip", () => {
        const content: ConsentContent = {
            documentHash: SAMPLE_HASH,
            documentVersion: "2025-04-29",
            documentTitle: "プライバシーポリシー (Privacy Policy)",
        };
        const bytes = encodeConsentContent(content);
        const [, , title] = decodeConsent(bytes);
        expect(title).toBe(content.documentTitle);
    });

    it("preserves boundary-length strings (32 / 200)", () => {
        const content: ConsentContent = {
            documentHash: SAMPLE_HASH,
            documentVersion: "v".padEnd(32, "0"),
            documentTitle: "T".padEnd(200, "x"),
        };
        const bytes = encodeConsentContent(content);
        const [, version, title] = decodeConsent(bytes);
        expect(version).toBe(content.documentVersion);
        expect(version.length).toBe(32);
        expect(title).toBe(content.documentTitle);
        expect(title.length).toBe(200);
    });

    it("encodes deterministically (same inputs → same bytes)", () => {
        const content: ConsentContent = {
            documentHash: SAMPLE_HASH,
            documentVersion: "1.0.0",
            documentTitle: "Figaro Beta Informed Consent Agreement",
        };
        const a = encodeConsentContent(content);
        const b = encodeConsentContent(content);
        expect(a).toBe(b);
    });

    it("produces different bytes for different documentHashes (binding integrity)", () => {
        const a = encodeConsentContent({
            documentHash: `0x${"ab".repeat(32)}` as Hex,
            documentVersion: "1.0.0",
            documentTitle: "Same Title",
        });
        const b = encodeConsentContent({
            documentHash: `0x${"cd".repeat(32)}` as Hex,
            documentVersion: "1.0.0",
            documentTitle: "Same Title",
        });
        expect(a).not.toBe(b);
    });
});

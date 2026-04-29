import { describe, expect, it } from "vitest";
import { keccak256, toBytes } from "viem";
import {
    CONSENT_DOCUMENT_HASH,
    CONSENT_DOCUMENT_TEXT,
    CONSENT_DOCUMENT_TITLE,
    CONSENT_DOCUMENT_VERSION,
} from "@/lib/shared/consentDocument";

describe("consentDocument module", () => {
    it("CONSENT_DOCUMENT_HASH matches keccak256(toBytes(CONSENT_DOCUMENT_TEXT))", () => {
        const recomputed = keccak256(toBytes(CONSENT_DOCUMENT_TEXT));
        expect(CONSENT_DOCUMENT_HASH).toBe(recomputed);
    });

    it("CONSENT_DOCUMENT_HASH is a 32-byte hex string", () => {
        expect(CONSENT_DOCUMENT_HASH).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it("CONSENT_DOCUMENT_VERSION is non-empty and ≤ 32 chars (Layer A bound)", () => {
        expect(CONSENT_DOCUMENT_VERSION.length).toBeGreaterThan(0);
        expect(CONSENT_DOCUMENT_VERSION.length).toBeLessThanOrEqual(32);
    });

    it("CONSENT_DOCUMENT_TITLE is non-empty and ≤ 200 chars (Layer A bound)", () => {
        expect(CONSENT_DOCUMENT_TITLE.length).toBeGreaterThan(0);
        expect(CONSENT_DOCUMENT_TITLE.length).toBeLessThanOrEqual(200);
    });

    it("CONSENT_DOCUMENT_TEXT is non-empty and contains expected structural markers", () => {
        expect(CONSENT_DOCUMENT_TEXT.length).toBeGreaterThan(100);
        // Spot-check load-bearing clauses so a future edit can't accidentally
        // drop them. Markers chosen to fail loudly if any is dropped:
        //  - title (always identifies the document)
        //  - contracting party (legal personhood — fixed)
        //  - top-level term/withdrawal section
        //  - Kleros dispute clause (the protocol's chosen jurisdiction)
        expect(CONSENT_DOCUMENT_TEXT).toContain("FIGARO BETA INFORMED CONSENT AGREEMENT");
        expect(CONSENT_DOCUMENT_TEXT).toContain("Alessandro Daliana");
        expect(CONSENT_DOCUMENT_TEXT).toContain("TERM AND WITHDRAWAL");
        expect(CONSENT_DOCUMENT_TEXT).toContain("Kleros");
    });
});

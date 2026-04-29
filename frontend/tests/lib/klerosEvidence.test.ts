import { describe, expect, it } from "vitest";
import {
    buildAuditBundleEvidence,
    buildFigaroMetaEvidence,
    buildStatementEvidence,
} from "@/lib/dispute";

describe("klerosEvidence", () => {
    describe("buildFigaroMetaEvidence", () => {
        it("returns category Escrow + 2 ruling options", () => {
            const meta = buildFigaroMetaEvidence();
            expect(meta.category).toBe("Escrow");
            expect(meta.rulingOptions.titles).toHaveLength(2);
            expect(meta.fileURI).toBeUndefined();
        });

        it("attaches policy + display URIs when provided", () => {
            const meta = buildFigaroMetaEvidence(
                "/ipfs/QmPolicy",
                "https://example.com/display",
            );
            expect(meta.fileURI).toBe("/ipfs/QmPolicy");
            expect(meta.evidenceDisplayInterfaceURI).toBe("https://example.com/display");
        });
    });

    describe("buildAuditBundleEvidence", () => {
        const PROCESS_ID = "0xdeadbeefcafebabe1234567890abcdef1234567890abcdef1234567890abcdef";
        const CID = "QmAuditBundle123";

        it("points fileURI at the IPFS-pinned PDF", () => {
            const ev = buildAuditBundleEvidence(PROCESS_ID, CID, "buyer", { redacted: false });
            expect(ev.fileURI).toBe(`/ipfs/${CID}`);
            expect(ev.fileHash).toBe(CID);
            expect(ev.fileTypeExtension).toBe("pdf");
        });

        it("frames the description by submitting party", () => {
            const buyerEv = buildAuditBundleEvidence(PROCESS_ID, CID, "buyer", { redacted: false });
            const sellerEv = buildAuditBundleEvidence(PROCESS_ID, CID, "seller", { redacted: false });
            expect(buyerEv.description).toContain("buyer");
            expect(sellerEv.description).toContain("seller");
        });

        it("flags sealed line items in name + description when redacted", () => {
            const cleartext = buildAuditBundleEvidence(PROCESS_ID, CID, "buyer", { redacted: false });
            const sealed = buildAuditBundleEvidence(PROCESS_ID, CID, "buyer", { redacted: true });

            expect(cleartext.name).not.toContain("sealed");
            expect(sealed.name).toContain("sealed");
            expect(sealed.description).toContain("sealed");
            // Both still point at the same fileURI / fileHash; redaction is
            // a content concern, not an envelope concern.
            expect(sealed.fileURI).toBe(cleartext.fileURI);
            expect(sealed.fileTypeExtension).toBe("pdf");
        });

        it("includes a truncated processId prefix in the name", () => {
            const ev = buildAuditBundleEvidence(PROCESS_ID, CID, "buyer", { redacted: false });
            expect(ev.name).toContain(PROCESS_ID.slice(0, 10));
        });
    });

    describe("buildStatementEvidence", () => {
        it("rejects an invalid CID and omits fileURI", () => {
            const ev = buildStatementEvidence("Title", "Body", "not-a-cid", "txt");
            expect(ev.fileURI).toBeUndefined();
            expect(ev.fileHash).toBeUndefined();
        });

        it("accepts a v0 CID and emits IPFS path", () => {
            const validV0 = "Qm" + "1".repeat(44);
            const ev = buildStatementEvidence("Title", "Body", validV0, "pdf");
            expect(ev.fileURI).toBe(`/ipfs/${validV0}`);
            expect(ev.fileTypeExtension).toBe("pdf");
        });
    });
});

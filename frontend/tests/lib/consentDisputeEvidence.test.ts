import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import {
    buildConsentDisputeMetaEvidence,
    buildConsentDisputeEvidence,
    type ConsentDisputeEvidenceInput,
} from "@/lib/dispute";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_HASH = ("0x" + "a".repeat(64)) as Hex;
const VALID_SIG = ("0x" + "b".repeat(130)) as Hex;
const VALID_SIG_2 = ("0x" + "c".repeat(130)) as Hex;
const VALID_ADDR = ("0x" + "1".repeat(40)) as Address;
const VALID_ADDR_2 = ("0x" + "2".repeat(40)) as Address;
const VALID_CID_V0 = "Qm" + "1".repeat(44);
const VALID_CID_V0_DOC = "Qm" + "2".repeat(44);

const VALID_CLAIM = (
    "The Project Operator distributed an audit-bundle PDF carrying my " +
    "watermarked access code to a third party outside the beta cohort, " +
    "in breach of §3.6 (artifact custody) and §3.4 (confidentiality of " +
    "access materials). On 2026-04-15 a screenshot of my financials " +
    "page surfaced in a public Discord channel, with the QR-code " +
    "watermark intact and matching the access code I received in my " +
    "beta invitation. The Operator has acknowledged the disclosure but " +
    "has not provided a remediation plan; I am escalating to Kleros " +
    "per §10. Evidence: receipt CID, document CID, and the screenshot " +
    "URL are pinned alongside this claim."
);

function buildInput(
    overrides: Partial<ConsentDisputeEvidenceInput> = {},
): ConsentDisputeEvidenceInput {
    return {
        attestation: {
            documentHash: VALID_HASH,
            documentVersion: "1.0.0",
            documentTitle: "Figaro Beta Informed Consent Agreement",
            signature: VALID_SIG,
            signer: VALID_ADDR,
            signedAt: "2026-04-01T12:00:00Z",
        },
        documentCid: VALID_CID_V0_DOC,
        receiptCid: VALID_CID_V0,
        claimText: VALID_CLAIM,
        citedSection: "§3.6 (artifact custody)",
        submittingParty: "participant",
        claimSignature: {
            submittedAt: "2026-04-29T10:00:00Z",
            signature: VALID_SIG_2,
            submitter: VALID_ADDR_2,
        },
        chainId: 1,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("consentDisputeEvidence", () => {
    describe("buildConsentDisputeMetaEvidence", () => {
        it("returns category Other + 2 ruling options", () => {
            const meta = buildConsentDisputeMetaEvidence();
            expect(meta.category).toBe("Other");
            expect(meta.title).toBe("Figaro Consent Agreement Dispute");
            expect(meta.rulingOptions.titles).toHaveLength(2);
            expect(meta.rulingOptions.titles).toEqual([
                "Breach upheld",
                "No breach found",
            ]);
            expect(meta.fileURI).toBeUndefined();
            expect(meta.evidenceDisplayInterfaceURI).toBeUndefined();
        });

        it("attaches policy + display URIs when provided", () => {
            const meta = buildConsentDisputeMetaEvidence(
                "/ipfs/QmPolicyXYZ",
                "https://example.com/consent-display",
            );
            expect(meta.fileURI).toBe("/ipfs/QmPolicyXYZ");
            expect(meta.evidenceDisplayInterfaceURI).toBe(
                "https://example.com/consent-display",
            );
        });

        it("frames the question around consent-agreement breach", () => {
            const meta = buildConsentDisputeMetaEvidence();
            expect(meta.question).toContain("Figaro Consent Agreement");
            expect(meta.description).toContain("Informed Consent Agreement");
            expect(meta.description).toContain("§10");
        });
    });

    describe("buildConsentDisputeEvidence — well-formed", () => {
        it("points fileURI at the receipt PDF CID", () => {
            const ev = buildConsentDisputeEvidence(buildInput());
            expect(ev.fileURI).toBe(`/ipfs/${VALID_CID_V0}`);
            expect(ev.fileHash).toBe(VALID_CID_V0);
            expect(ev.fileTypeExtension).toBe("pdf");
        });

        it("includes the cited section + truncated signer in the name", () => {
            const ev = buildConsentDisputeEvidence(buildInput());
            expect(ev.name).toContain("§3.6");
            expect(ev.name).toContain(VALID_ADDR.slice(0, 6));
        });

        it("frames description by submitting party (participant)", () => {
            const ev = buildConsentDisputeEvidence(
                buildInput({ submittingParty: "participant" }),
            );
            expect(ev.description).toContain("Participant");
            expect(ev.description).not.toContain("Project Operator (");
        });

        it("frames description by submitting party (operator)", () => {
            const ev = buildConsentDisputeEvidence(
                buildInput({ submittingParty: "operator" }),
            );
            expect(ev.description).toContain("Project Operator");
        });

        it("carries documentHash, document CID, receipt CID, and both signers", () => {
            const ev = buildConsentDisputeEvidence(buildInput());
            expect(ev.description).toContain(VALID_HASH);
            expect(ev.description).toContain(`/ipfs/${VALID_CID_V0_DOC}`);
            expect(ev.description).toContain(`/ipfs/${VALID_CID_V0}`);
            expect(ev.description).toContain(VALID_ADDR);
            expect(ev.description).toContain(VALID_ADDR_2);
        });

        it("carries the full claim text into description (round-trip)", () => {
            const ev = buildConsentDisputeEvidence(buildInput());
            expect(ev.description).toContain(VALID_CLAIM);
        });

        it("carries the cited section into description", () => {
            const ev = buildConsentDisputeEvidence(
                buildInput({ citedSection: "§3.4 (confidentiality)" }),
            );
            expect(ev.description).toContain("§3.4 (confidentiality)");
        });

        it("carries chainId and submission timestamp", () => {
            const ev = buildConsentDisputeEvidence(
                buildInput({ chainId: 100 }),
            );
            expect(ev.description).toContain("Chain ID: 100");
            expect(ev.description).toContain("2026-04-29T10:00:00Z");
        });

        it("accepts a CIDv1 (bafy...) for receipt and document CIDs", () => {
            const cidV1 = "bafy" + "a".repeat(55);
            const ev = buildConsentDisputeEvidence(
                buildInput({ documentCid: cidV1, receiptCid: cidV1 }),
            );
            expect(ev.fileURI).toBe(`/ipfs/${cidV1}`);
        });
    });

    describe("buildConsentDisputeEvidence — malformed inputs", () => {
        it("rejects an invalid document hash", () => {
            expect(() =>
                buildConsentDisputeEvidence(
                    buildInput({
                        attestation: {
                            ...buildInput().attestation,
                            documentHash: "0xnothex" as `0x${string}`,
                        },
                    }),
                ),
            ).toThrow(/documentHash/);
        });

        it("rejects an invalid attestation signature", () => {
            expect(() =>
                buildConsentDisputeEvidence(
                    buildInput({
                        attestation: {
                            ...buildInput().attestation,
                            signature: "0x12" as `0x${string}`,
                        },
                    }),
                ),
            ).toThrow(/attestation\.signature/);
        });

        it("rejects an invalid signer address", () => {
            expect(() =>
                buildConsentDisputeEvidence(
                    buildInput({
                        attestation: {
                            ...buildInput().attestation,
                            signer: "0xshort" as `0x${string}`,
                        },
                    }),
                ),
            ).toThrow(/signer/);
        });

        it("rejects an invalid receipt CID", () => {
            expect(() =>
                buildConsentDisputeEvidence(
                    buildInput({ receiptCid: "not-a-cid" }),
                ),
            ).toThrow(/receiptCid/);
        });

        it("rejects an invalid document CID", () => {
            expect(() =>
                buildConsentDisputeEvidence(
                    buildInput({ documentCid: "Qm-too-short" }),
                ),
            ).toThrow(/documentCid/);
        });

        it("rejects claim text that is too short", () => {
            expect(() =>
                buildConsentDisputeEvidence(
                    buildInput({ claimText: "way too short" }),
                ),
            ).toThrow(/claimText/);
        });

        it("rejects claim text that is too long", () => {
            expect(() =>
                buildConsentDisputeEvidence(
                    buildInput({ claimText: "a".repeat(5000) }),
                ),
            ).toThrow(/claimText/);
        });

        it("rejects an empty cited section", () => {
            expect(() =>
                buildConsentDisputeEvidence(
                    buildInput({ citedSection: "" }),
                ),
            ).toThrow(/citedSection/);
        });

        it("rejects an empty document version", () => {
            expect(() =>
                buildConsentDisputeEvidence(
                    buildInput({
                        attestation: {
                            ...buildInput().attestation,
                            documentVersion: "",
                        },
                    }),
                ),
            ).toThrow(/documentVersion/);
        });

        it("rejects an empty document title", () => {
            expect(() =>
                buildConsentDisputeEvidence(
                    buildInput({
                        attestation: {
                            ...buildInput().attestation,
                            documentTitle: "",
                        },
                    }),
                ),
            ).toThrow(/documentTitle/);
        });

        it("rejects an empty signedAt", () => {
            expect(() =>
                buildConsentDisputeEvidence(
                    buildInput({
                        attestation: {
                            ...buildInput().attestation,
                            signedAt: "",
                        },
                    }),
                ),
            ).toThrow(/signedAt/);
        });

        it("rejects an invalid claim signature", () => {
            expect(() =>
                buildConsentDisputeEvidence(
                    buildInput({
                        claimSignature: {
                            ...buildInput().claimSignature,
                            signature: "0xshort" as `0x${string}`,
                        },
                    }),
                ),
            ).toThrow(/claimSignature\.signature/);
        });

        it("rejects an invalid submitter address", () => {
            expect(() =>
                buildConsentDisputeEvidence(
                    buildInput({
                        claimSignature: {
                            ...buildInput().claimSignature,
                            submitter: "0xnotanaddr" as `0x${string}`,
                        },
                    }),
                ),
            ).toThrow(/claimSignature\.submitter/);
        });

        it("rejects an empty submittedAt", () => {
            expect(() =>
                buildConsentDisputeEvidence(
                    buildInput({
                        claimSignature: {
                            ...buildInput().claimSignature,
                            submittedAt: "",
                        },
                    }),
                ),
            ).toThrow(/submittedAt/);
        });

        it("rejects a non-positive chainId", () => {
            expect(() =>
                buildConsentDisputeEvidence(buildInput({ chainId: 0 })),
            ).toThrow(/chainId/);
            expect(() =>
                buildConsentDisputeEvidence(buildInput({ chainId: -1 })),
            ).toThrow(/chainId/);
            expect(() =>
                buildConsentDisputeEvidence(buildInput({ chainId: 1.5 })),
            ).toThrow(/chainId/);
        });
    });

    describe("buildConsentDisputeEvidence — round-trip integrity", () => {
        it("produces JSON-serializable output", () => {
            const ev = buildConsentDisputeEvidence(buildInput());
            // Round-trip through JSON to confirm no non-serializable
            // values (Date, BigInt, etc.) leaked into the envelope.
            const json = JSON.stringify(ev);
            const parsed = JSON.parse(json);
            expect(parsed.name).toBe(ev.name);
            expect(parsed.description).toBe(ev.description);
            expect(parsed.fileURI).toBe(ev.fileURI);
            expect(parsed.fileHash).toBe(ev.fileHash);
            expect(parsed.fileTypeExtension).toBe(ev.fileTypeExtension);
        });

        it("matches the KlerosEvidence shape (same fields as buildAuditBundleEvidence)", () => {
            const ev = buildConsentDisputeEvidence(buildInput());
            // Same five fields as the commerce-process audit-bundle Evidence:
            // name, description, fileURI, fileHash, fileTypeExtension.
            expect(Object.keys(ev).sort()).toEqual([
                "description",
                "fileHash",
                "fileTypeExtension",
                "fileURI",
                "name",
            ]);
        });
    });
});

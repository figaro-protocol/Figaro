/**
 * Kleros ERC-1497 evidence formatting.
 *
 * Transforms a ProcessTimeline into the JSON structures that Kleros
 * expects: MetaEvidence (dispute context) and Evidence (party submissions).
 *
 * MetaEvidence is created once per dispute type (can be reused across
 * all Figaro disputes). Evidence is created per-dispute from the
 * on-chain event timeline.
 *
 * These are plain data transformations — no chain interaction here.
 * Upload to IPFS is the caller's responsibility.
 */

// ---------------------------------------------------------------------------
// ERC-1497 MetaEvidence
// ---------------------------------------------------------------------------

export interface KlerosMetaEvidence {
    category: string;
    title: string;
    description: string;
    question: string;
    rulingOptions: {
        type: "single-select";
        titles: string[];
        descriptions: string[];
    };
    fileURI?: string;
    evidenceDisplayInterfaceURI?: string;
    dynamicScriptURI?: string;
}

/**
 * Build the static MetaEvidence JSON for Figaro process disputes.
 *
 * This is the same for every Figaro dispute — it describes what the
 * protocol is, what the dispute is about, and what the ruling options are.
 *
 * @param policyFileURI  IPFS URI to the Figaro dispute resolution policy
 *                       document (e.g. "/ipfs/Qm.../figaro-dispute-policy.pdf").
 *                       Pass undefined if not yet published.
 * @param evidenceDisplayURI  Optional URI to a hosted evidence display
 *                            interface that renders Figaro timelines in
 *                            the Kleros court iframe.
 */
export function buildFigaroMetaEvidence(
    policyFileURI?: string,
    evidenceDisplayURI?: string,
): KlerosMetaEvidence {
    return {
        category: "Escrow",
        title: "Figaro Protocol Process Dispute",
        description:
            "A dispute has been raised regarding a bonded process on the Figaro Protocol. " +
            "Both buyer and seller locked asymmetric bonds (buyer: 2× payment, seller: 2× cumulative value). " +
            "The process timeline below shows all on-chain lifecycle events: order creation, acceptance, " +
            "coordinator attestations, and resolution status. Review the evidence to determine whether " +
            "the obligations were fulfilled.",
        question: "Did the seller(s) fulfill their obligations under this process?",
        rulingOptions: {
            type: "single-select",
            titles: [
                "Obligations fulfilled",
                "Obligations not fulfilled",
            ],
            descriptions: [
                "The on-chain evidence shows that the seller(s) completed their obligations. " +
                "The buyer should proceed with normal resolution.",
                "The on-chain evidence shows that the seller(s) did not complete their obligations. " +
                "The buyer's position is justified.",
            ],
        },
        ...(policyFileURI ? { fileURI: policyFileURI } : {}),
        ...(evidenceDisplayURI ? { evidenceDisplayInterfaceURI: evidenceDisplayURI } : {}),
    };
}

// ---------------------------------------------------------------------------
// ERC-1497 Evidence
// ---------------------------------------------------------------------------

export interface KlerosEvidence {
    name: string;
    description: string;
    fileURI?: string;
    fileHash?: string;
    fileTypeExtension?: string;
}

/**
 * Format an audit-bundle PDF as Kleros Evidence.
 *
 * The PDF is the canonical synthesized record (contract clauses, invoice
 * line items, BoL clauses, hash appendix) that the audit pipeline emits
 * — pinned to IPFS as a binary blob. This wrapper points the arbitrator
 * at it. When `redacted` is true, commerce line items are sealed (the
 * merkle root still verifies; individual sections can be revealed via
 * Mode B on /verify if the arbitrator requests them).
 */
export function buildAuditBundleEvidence(
    processId: string,
    auditBundleCID: string,
    party: "buyer" | "seller",
    options: { redacted: boolean },
): KlerosEvidence {
    const sealed = options.redacted ? " (line items sealed)" : "";
    return {
        name: `Figaro Audit Bundle — ${processId.slice(0, 10)}…${sealed}`,
        description:
            `Synthesized audit record submitted by the ${party}. ` +
            `Includes the FigaroCore lifecycle timeline, signed agreement ` +
            `clauses, invoice line items, Bill of Lading clauses (where ` +
            `applicable), runtime attestations, consolidated financial ` +
            `statements, and the hash appendix that binds every section ` +
            `to the on-chain agreement merkle root.` +
            (options.redacted
                ? " Line-item detail has been sealed for distribution; " +
                  "the merkle root remains verifiable and individual " +
                  "sections can be selectively revealed on request."
                : ""),
        fileURI: `/ipfs/${auditBundleCID}`,
        fileHash: auditBundleCID,
        fileTypeExtension: "pdf",
    };
}

/**
 * Format a free-text party statement as Kleros Evidence.
 * For attaching additional context (screenshots, PDFs, etc.) beyond
 * the automatic timeline.
 */
export function buildStatementEvidence(
    title: string,
    description: string,
    attachmentCID?: string,
    fileExtension?: string,
): KlerosEvidence {
    // Validate CID format if provided (base58 Qm... or base32 bafy...)
    const validCID = attachmentCID && /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{55})$/.test(attachmentCID)
        ? attachmentCID
        : undefined;
    return {
        name: title,
        description,
        ...(validCID ? { fileURI: `/ipfs/${validCID}`, fileHash: validCID } : {}),
        ...(fileExtension ? { fileTypeExtension: fileExtension } : {}),
    };
}

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

import type { ProcessTimeline } from "./evidenceTimeline";

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
 * Format a ProcessTimeline as a Kleros Evidence JSON.
 *
 * The timeline JSON itself should be uploaded to IPFS first; pass the
 * resulting CID as `timelineCID`. This function produces the Evidence
 * wrapper that points to it.
 */
export function buildTimelineEvidence(
    timeline: ProcessTimeline,
    timelineCID: string,
    party: "buyer" | "seller",
): KlerosEvidence {
    const { processId, summary } = timeline;
    const eventCount = timeline.events.length;
    const first = timeline.events[0];
    const last = timeline.events[timeline.events.length - 1];
    const span = first && last
        ? `${first.iso} → ${last.iso}`
        : "no events";

    return {
        name: `Figaro Process Timeline — ${processId.slice(0, 10)}…`,
        description:
            `On-chain evidence submitted by the ${party}. ` +
            `Process ${processId} contains ${summary.orderCount} order(s), ` +
            `${summary.resolvedCount} resolved, ${summary.cancelledCount} cancelled. ` +
            `Total payment: ${summary.totalPayment} tokens. ` +
            `${eventCount} lifecycle events spanning ${span}. ` +
            `Full timeline at the attached IPFS link.`,
        fileURI: `/ipfs/${timelineCID}`,
        fileHash: timelineCID,
        fileTypeExtension: "json",
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

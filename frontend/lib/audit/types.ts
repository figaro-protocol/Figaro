/**
 * Shared types for the audit-bundle pipeline.
 *
 * The bundle composes open-world, clause-agnostic documents into one
 * cryptographically-verifiable set:
 *
 *   - Contract     — agreement document referenced by `checkoutHash`
 *   - Clause data  — every committed clause's fields, rendered generically
 *                    from its registered spec (names no clause, assumes no field)
 *   - Process logs — the attestation timeline by tier + ladder
 *   - Hash appendix — every hash in the bundle, anchored to its on-chain source
 *
 * Every extractor is a PURE function: it takes already-loaded chain data and
 * returns a structured per-section document. Callers (PDF renderer, the
 * `/audit` verify surface) fetch `Agreement`, `Order`, and the attestation
 * entries from chain.
 */

export interface ExtractedDocument {
    /** Display title at the top of the rendered clause. */
    title: string;
    /** orderHash this document corresponds to. */
    orderHash: string;
    /** processId this document's order belongs to. */
    processId: string;
    /** checkoutHash anchoring the document's content to chain. */
    checkoutHash: string;
    /** Buyer address from the order — load-bearing identifier; auditor
     *  landing on any document page needs the parties without
     *  cross-referencing. */
    buyer: string;
    /** Seller address from the order — same load-bearing rationale. */
    seller: string;
}

/**
 * A part the evidence file does not contain, and why. The evidence file is a
 * document for a forum: a part that could not be read is named here, never
 * left out without a word, and never replaced by content the evidence file does not
 * hold. An entry states what is missing and the reason the reader gave. It
 * says nothing about why a party holds anything back.
 */
export interface MissingPart {
    /** What is missing, in the evidence file's own nouns. */
    part: string;
    /** The order the part belongs to, when it belongs to one. */
    orderHash?: string;
    /** Why the evidence file lacks it. */
    reason: string;
}

/**
 * Shared types for the audit-bundle pipeline.
 *
 * The bundle composes open-world, clause-agnostic documents into one
 * cryptographically-verifiable set:
 *
 *   - Contract     — agreement document referenced by `agreementHash`
 *   - Clause data  — every committed clause's fields, rendered generically
 *                    from its registered spec (names no clause, assumes no field)
 *   - Process logs — the attestation timeline by tier + ladder
 *   - Hash appendix — every hash in the bundle, anchored to its on-chain source
 *
 * Every extractor is a PURE function: it takes already-loaded chain data and
 * returns a structured per-section document. Callers (PDF renderer, the
 * `/audit` verify surface) fetch `Agreement`, `Order`, and the attestation
 * records from chain.
 */

export interface ExtractedDocument {
    /** Display title at the top of the rendered section. */
    title: string;
    /** orderHash this document corresponds to. */
    orderHash: string;
    /** processId this document's order belongs to. */
    processId: string;
    /** agreementHash anchoring the document's content to chain. */
    agreementHash: string;
    /** Buyer address from the order — load-bearing identifier; auditor
     *  landing on any document page needs the parties without
     *  cross-referencing. */
    buyer: string;
    /** Seller address from the order — same load-bearing rationale. */
    seller: string;
}

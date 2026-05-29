/**
 * Shared types for the audit-bundle pipeline (Phases C-E of the
 * financial-statements deliverable).
 *
 * The audit bundle assembles 5 protocol artifacts into one
 * cryptographically-verifiable document set:
 *
 *   1. Contract     — agreement document referenced by `agreementHash`
 *   2. Financials   — balance sheet + income statement + cash flow
 *                     (delivered separately by `lib/semantic/financialsProjection.ts`)
 *   3. Invoice      — line items extracted from `figaro-commerce-v1` clause
 *   4. Bill of Lading — handoff + geo + per-role process attestations
 *   5. Hash appendix — every hash in the bundle, anchored to its on-chain source
 *
 * All four extractors here are PURE functions. Each takes already-loaded
 * chain data as input and returns a structured per-section document.
 * Callers (Phase D PDF renderer, Phase E verify page) are responsible
 * for fetching `Agreement`, `Order`, and `AttestationRecord[]` from chain.
 */

/**
 * Per-attestation receipt — what landed on chain for one AttestationRecorded
 * event. Shape is uniform across attestation families (GHG measurement,
 * proximity proof, etc.); the original content payload lives in the
 * transaction calldata and is decoded by the clause-specific extractor.
 */
export interface AttestationReceipt {
    /** keccak256 of the attestation content bytes. */
    contentRef: string;
    attester: string;
    /** Lifecycle stage the attestation was recorded at (uint8 0-4). */
    stage: number;
    blockNumber: number;
    transactionHash?: string;
}

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

/**
 * Canonical 5-stage BoL progression labels. The BoL extractor maps each
 * stage to a per-role event in figaro-merchant-process-v1 (stages 0-1) or
 * figaro-courier-process-v1 (stages 2-4) — see STAGE_SOURCE in
 * billOfLadingExtract.ts. Names are documentation conventions, not
 * on-chain enforced — declared here so the BoL renderer + auditor see
 * consistent labels.
 */
export const DELIVERY_LIFECYCLE_STAGES: readonly { id: number; name: string }[] = [
    { id: 0, name: "PreparationStarted" },
    { id: 1, name: "ReadyForPickup" },
    { id: 2, name: "CourierEnRoute" },
    { id: 3, name: "PickedUp" },
    { id: 4, name: "Delivered" },
] as const;

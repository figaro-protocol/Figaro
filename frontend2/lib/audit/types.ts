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
 *   4. Bill of Lading — handoff + geo + delivery-lifecycle attestations
 *   5. Hash appendix — every hash in the bundle, anchored to its on-chain source
 *
 * All four extractors here are PURE functions. Each takes already-loaded
 * chain data as input and returns a structured per-section document.
 * Callers (Phase D PDF renderer, Phase E verify page) are responsible
 * for fetching `Agreement`, `Order`, and `AttestationRecord[]` from chain.
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
}

/**
 * Canonical lifecycle-stage label table. Stages are encoded as `uint8` on
 * chain (per the `figaro-delivery-lifecycle-v1` validator's `stage`
 * argument). Names are documentation conventions, not on-chain enforced —
 * we name them here so the BoL renderer + auditor see consistent labels.
 */
export const DELIVERY_LIFECYCLE_STAGES: readonly { id: number; name: string }[] = [
    { id: 0, name: "PreparationStarted" },
    { id: 1, name: "ReadyForPickup" },
    { id: 2, name: "CourierEnRoute" },
    { id: 3, name: "PickedUp" },
    { id: 4, name: "Delivered" },
] as const;

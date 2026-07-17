/**
 * Bond-case phase derivation for the optimistic RPGF minter's case track.
 *
 * A challenge always voids the posting; the bonds settle here, on a separate
 * track. The phase is DERIVED from chain state + the clock, never stored:
 *   Open  + inside the dispute window  → "escalatable"  (poster may dispute)
 *   Open  + window elapsed             → "concedable"   (anyone closes it;
 *                                        the challenger takes both bonds)
 *   Disputed                           → "disputed"     (composed forum holds it)
 *   Closed                             → "closed"       (ruling on record)
 *
 * The forum settles BONDS ONLY — no phase here ever gates a mint.
 */

/** Mirrors RpgfMinter.CaseStatus. */
export const CASE_STATUS_OPEN = 0;
export const CASE_STATUS_DISPUTED = 1;
export const CASE_STATUS_CLOSED = 2;

/** Mirrors RpgfMinter's ruling codes (RULING_REFUSED/POSTER/CHALLENGER). */
export const RULING_REFUSED = 0;
export const RULING_POSTER = 1;
export const RULING_CHALLENGER = 2;

export interface RpgfBondCase {
    caseId: bigint;
    /** The tranche whose posting the challenge voided. */
    trancheId: number;
    /** The voided root (from the RootChallenged event). */
    root: `0x${string}`;
    poster: `0x${string}`;
    challenger: `0x${string}`;
    challengedAt: bigint;
    /** Live CaseStatus from the bondCases(caseId) read. */
    status: number;
    /** Set once a CaseRuled event exists for this case. */
    ruling: number | null;
    /** True once a ChallengeConceded event exists for this case. */
    conceded: boolean;
}

export type BondCasePhase = "escalatable" | "concedable" | "disputed" | "closed";

export function deriveBondCasePhase(
    bondCase: Pick<RpgfBondCase, "status" | "challengedAt">,
    nowSeconds: bigint,
    disputeWindowSeconds: bigint,
): BondCasePhase {
    if (bondCase.status === CASE_STATUS_DISPUTED) return "disputed";
    if (bondCase.status === CASE_STATUS_CLOSED) return "closed";
    return nowSeconds < bondCase.challengedAt + disputeWindowSeconds ? "escalatable" : "concedable";
}

/** Human ruling line for a closed case. Concession is the challenger winning
 *  by the poster's silence — same money, different record. */
export function bondCaseRulingLabel(bondCase: Pick<RpgfBondCase, "ruling" | "conceded">): string {
    if (bondCase.conceded) return "conceded — challenger took both bonds";
    if (bondCase.ruling === RULING_POSTER) return "ruled for the poster — poster took both bonds";
    if (bondCase.ruling === RULING_CHALLENGER) return "ruled for the challenger — challenger took both bonds";
    if (bondCase.ruling === RULING_REFUSED) return "ruling refused — each side's bond returned";
    return "closed";
}

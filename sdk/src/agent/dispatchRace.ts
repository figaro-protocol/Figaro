/**
 * @figaro/sdk/agent — The dispatch race: market formation with zero contracts.
 *
 * Countersign-first choreography (operator-ruled 2026-07-20). An unbound
 * sub-order position is filled by racing the market instead of a manual pick:
 * the buyer sends the SAME unsigned draft shape to k candidate sellers — each
 * draft naming that candidate as `seller` at the candidate's own posted
 * catalogue price — candidates countersign to signal availability, and the
 * buyer signs EXACTLY ONE winner. The buyer's single signature is
 * simultaneously the selection event and the seller-address answer; losing
 * countersignatures expire inert at the struct `deadline`, and an unfunded
 * winner reverts at `commit` (the kernel pulls the seller bond), so the
 * remaining countersignatures form a free fallback ladder.
 *
 * This is the SELLER-SIGNS-FIRST leg — deliberately the inverse of the
 * origination handshake (`buildBuyerOffer` → `counterSignOffer`), whose
 * validators require a buyer signature to exist. A draft carries NO signatures:
 * nothing about it binds anyone, and it cannot be broadcast (the kernel needs
 * both signatures), so a candidate's countersignature exposes them to exactly
 * the deal they quoted, bounded by `deadline`.
 *
 * The race window (how long the buyer waits) and k (how many candidates) are
 * caller policy — checkout-time buyer behavior, never a stored field on the
 * payload, the template, or any profile.
 */

import type { WalletClient } from "viem";
import { verifyTypedData } from "viem";
import { buildDomain, hashCommitmentStruct, COMMITMENT_TYPES } from "../commitments.js";
import { computeAgreementHash } from "../agreement.js";
import type { Hex, Address } from "../types.js";
import type { CommitmentPayload } from "./coordination.js";
import { checkOfferPolicy, type OfferCheck, type OfferPolicy } from "./originate.js";

/**
 * Structural validation a candidate MUST run before countersigning a race
 * draft — the draft-shaped sibling of `validateOffer`. A draft is UNSIGNED by
 * definition: a payload already carrying a buyer signature is an offer and
 * belongs to the origination handshake, so it is rejected here to keep the two
 * legs distinct (one referent per word: draft = no signatures yet).
 *
 * Checks: no signatures present, the draft names me as seller, the agreement
 * hashes to the committed `agreementHash` (the sender cannot pin one agreement
 * and commit another), and the agreement's parties match the commitment. With
 * a `policy`, ALSO applies the operator's economic floor (root-shape, currency
 * allowlist, magnitude cap) — the same floor `validateOffer` applies, reached
 * here through it.
 */
export function validateDraft(
    draft: CommitmentPayload,
    expectedSeller: Address,
    policy?: OfferPolicy,
): OfferCheck {
    if (draft.buyerSig) return { ok: false, reason: "payload carries a buyer signature — an offer, not a race draft" };
    if (draft.sellerSig) return { ok: false, reason: "payload already carries a seller signature" };
    const c = draft.commitment;
    if (c.seller.toLowerCase() !== expectedSeller.toLowerCase()) {
        return { ok: false, reason: "draft names a different seller" };
    }
    if (c.agreementHash.toLowerCase() !== computeAgreementHash(draft.agreement).toLowerCase()) {
        return { ok: false, reason: "agreement does not hash to the committed agreementHash" };
    }
    if (draft.agreement.buyer.toLowerCase() !== c.buyer.toLowerCase()
        || draft.agreement.seller.toLowerCase() !== c.seller.toLowerCase()) {
        return { ok: false, reason: "agreement parties do not match the commitment" };
    }
    if (policy) {
        const economic = checkOfferPolicy(c, policy);
        if (!economic.ok) return economic;
    }
    return { ok: true };
}

/**
 * Candidate validates an inbound race draft and countersigns, or declines.
 * `wallet` is the candidate. Mirrors `counterSignOffer`'s two operator-supplied
 * opt-IN floors — autonomy is never the default:
 *   - ECONOMIC FLOOR: countersigning exposes the candidate to being committed
 *     at the draft's `payment`/`expectedCumulativeValue` in its `currency`
 *     until `deadline`, so with NO `policy` the draft is declined.
 *   - REFUSE-ALL FLOOR: a clean draft countersigns ONLY when an explicit
 *     `accept` returns true.
 * A malformed/tampered draft THROWS — the candidate must never countersign a
 * bogus commitment. There is no buyer signature to verify; that is the point.
 */
export async function counterSignDraft(
    wallet: WalletClient,
    draft: CommitmentPayload,
    ctx: { chainId: number; core: Address },
    accept?: (draft: CommitmentPayload) => boolean,
    policy?: OfferPolicy,
): Promise<CommitmentPayload | null> {
    const account = wallet.account;
    if (!account) throw new Error("counterSignDraft: wallet has no account");
    const seller = account.address;

    const check = validateDraft(draft, seller);
    if (!check.ok) throw new Error(`counterSignDraft: refusing malformed draft — ${check.reason}`);

    if (!policy) return null;
    const economic = validateDraft(draft, seller, policy);
    if (!economic.ok) return null;

    if (!accept || !accept(draft)) return null;

    const domain = buildDomain(ctx.chainId, ctx.core);
    const sellerSig = await wallet.signTypedData({
        account, domain, types: COMMITMENT_TYPES, primaryType: "Commitment", message: draft.commitment,
    });
    return { ...draft, sellerSig };
}

/**
 * Buyer-side verification of a candidate's countersigned reply. The reply's
 * commitment must be EXACTLY the struct the buyer drafted for that candidate
 * (struct-hash equality — a candidate cannot return a doctored payment or
 * terms; the signature would still recover, so equality is checked first), and
 * the seller signature must recover to the drafted candidate.
 */
export async function verifyRaceReply(
    reply: CommitmentPayload,
    draft: CommitmentPayload,
    ctx: { chainId: number; core: Address },
): Promise<OfferCheck> {
    if (!reply.sellerSig) return { ok: false, reason: "reply carries no seller signature" };
    if (hashCommitmentStruct(reply.commitment) !== hashCommitmentStruct(draft.commitment)) {
        return { ok: false, reason: "reply commitment does not match the drafted struct" };
    }
    const domain = buildDomain(ctx.chainId, ctx.core);
    const valid = await verifyTypedData({
        address: draft.commitment.seller,
        domain, types: COMMITMENT_TYPES, primaryType: "Commitment", message: draft.commitment,
        signature: reply.sellerSig as Hex,
    });
    if (!valid) return { ok: false, reason: "seller signature does not recover to the drafted candidate" };
    return { ok: true };
}

/** A verified countersigned reply, paired with the draft it answers. */
export interface RaceReply {
    draft: CommitmentPayload;
    reply: CommitmentPayload;
}

/**
 * Cheapest countersigner wins — the default selection rule (buyer override is
 * a surface concern, not this function's). Ties break by arrival order (array
 * order), keeping selection deterministic for a given collection sequence.
 * Returns null when no replies arrived. Callers pass only VERIFIED replies
 * (`verifyRaceReply`); this function ranks, it does not re-verify.
 */
export function selectRaceWinner(replies: readonly RaceReply[]): RaceReply | null {
    let winner: RaceReply | null = null;
    for (const r of replies) {
        if (winner === null || r.reply.commitment.payment < winner.reply.commitment.payment) {
            winner = r;
        }
    }
    return winner;
}

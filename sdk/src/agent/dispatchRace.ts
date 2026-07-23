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
import { buildCommitment, buildDomain, hashCommitmentStruct, verifyCommitmentSignature, COMMITMENT_TYPES } from "../commitments.js";
import { computeAgreementHash, type Agreement } from "../agreement.js";
import type { Hex, Address } from "../types.js";
import type { CommitmentPayload, CoordinationChannel, PricedField, QuoteRequestTerms } from "./coordination.js";
import { checkOfferPolicy, instantiateRootAgreement, type OfferCheck, type OfferPolicy } from "./originate.js";
import type { AssemblyTemplate } from "../assembly.js";

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
    if (draft.quoteRequest) {
        throw new Error("counterSignDraft: payload is a quote request — the candidate prices it via quoteDraft, never countersigns the ceiling");
    }

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
    // Verify against the buyer's OWN drafted struct (never the reply's echoed
    // fields), recovering to the drafted candidate seller.
    const valid = await verifyCommitmentSignature(
        draft.commitment, reply.sellerSig as Hex, draft.commitment.seller, ctx,
    );
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
 * (`verifyRaceReply` / `verifyQuoteReply`); this function ranks, it does not
 * re-verify.
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

// ── RFQ — the quote leg: the CANDIDATE authors the price ─────────────────────
//
// The race asks "available at your posted price?"; RFQ asks "at what price are
// you available?" — bespoke jobs and thin markets, where no posted catalogue
// figure fits. Same choreography, one inversion: the request draft goes out at
// the buyer's CEILING (their reservation price), the candidate returns a
// COUNTER-DRAFT re-priced at their quote, and the buyer verifies it by
// RECONSTRUCTION — applying the same mechanical substitution to their own
// draft and requiring hash-for-hash equality — so a quote can change the
// price and NOTHING else. Cheapest verified quote wins (`selectRaceWinner`),
// the buyer signs exactly one, and the winner's countersignature is already on
// the struct. No contract, no clause, agent-mediated.

/**
 * Apply the quote to the agreement — the ONE mechanical substitution both
 * sides share (the candidate builds the counter-draft with it; the buyer
 * rebuilds the expectation with it). Each priced field — named by the BUYER
 * in the request; the SDK names no clause — is set to the quote's decimal
 * string in raw token units. Throws on a missing section or path: a request
 * pricing a field the agreement doesn't carry is malformed.
 */
export function substitutePricedValue(
    agreement: Agreement,
    pricedFields: readonly PricedField[],
    value: bigint,
): Agreement {
    if (pricedFields.length === 0) throw new Error("substitutePricedValue: the request names no priced fields");
    let sections = agreement.sections;
    for (const field of pricedFields) {
        const index = sections.findIndex((s) => s.clause === field.clause);
        if (index === -1) throw new Error(`substitutePricedValue: agreement has no "${field.clause}" section`);
        // A section's data root is an object by type, so the immutable set
        // returns an object here — the array branch only occurs mid-path.
        const data = setAtPath(sections[index].data, field.path.split("."), value.toString()) as Record<string, unknown>;
        sections = sections.map((s, i) => (i === index ? { ...s, data } : s));
    }
    return { ...agreement, sections };
}

/** Immutable set at a dotted path (numeric segments index arrays). Throws if
 *  any intermediate is missing — substitution never invents structure. */
function setAtPath(node: unknown, path: readonly string[], value: string): Record<string, unknown> | unknown[] {
    if (path.length === 0) throw new Error("setAtPath: empty path");
    const [head, ...rest] = path;
    if (Array.isArray(node)) {
        const i = Number(head);
        if (!Number.isInteger(i) || i < 0 || i >= node.length) {
            throw new Error(`substitutePricedValue: no array element "${head}" at the priced path`);
        }
        const next = rest.length === 0 ? value : setAtPath(node[i], rest, value);
        return node.map((v, j) => (j === i ? next : v));
    }
    if (typeof node === "object" && node !== null) {
        const record = node as Record<string, unknown>;
        if (!(head in record)) throw new Error(`substitutePricedValue: no field "${head}" at the priced path`);
        const next = rest.length === 0 ? value : setAtPath(record[head], rest, value);
        return { ...record, [head]: next };
    }
    throw new Error(`substitutePricedValue: the priced path dead-ends at "${head}"`);
}

export interface BuildQuoteRequestParams {
    template: AssemblyTemplate;
    buyer: Address;
    /** The candidate this request drafts against — one request per candidate,
     *  each naming its exact counterparty (no counterparty deferral). */
    seller: Address;
    currency: Address;
    /** The buyer's CEILING — their reservation price. The draft is built at
     *  it, and a valid quote is ≤ it (the cap rule is enforceable because the
     *  ceiling is inside the drafted struct). */
    ceiling: bigint;
    chainId: number;
    core: Address;
    /** Where the figure lives in the agreement — the buyer names their own
     *  clause(s); the ceiling is substituted here at build time so draft and
     *  quote differ ONLY through the same substitution. */
    pricedFields: readonly PricedField[];
    /** Per-clause overrides merged onto the template's root clause bag (the
     *  non-price terms of the job). */
    overrides?: Record<string, Record<string, unknown>>;
    salt?: bigint;
    deadline?: bigint;
}

/**
 * Build an RFQ quote-request draft — UNSIGNED (a draft binds nobody), priced
 * at the buyer's ceiling through the SAME substitution the quote will use.
 * Root-order scope, like the origination handshake; a chain-position request
 * is the same payload shape built from the chain walk.
 */
export function buildQuoteRequest(params: BuildQuoteRequestParams): CommitmentPayload {
    const instantiated = instantiateRootAgreement(params.template, {
        buyer: params.buyer, seller: params.seller, overrides: params.overrides,
    });
    const agreement = substitutePricedValue(instantiated, params.pricedFields, params.ceiling);
    const domain = buildDomain(params.chainId, params.core);
    const { commitment } = buildCommitment({
        processId: `0x${"0".repeat(64)}` as Hex,
        buyer: params.buyer,
        seller: params.seller,
        currency: params.currency,
        payment: params.ceiling,
        expectedCumulativeValue: params.ceiling,
        agreementHash: computeAgreementHash(agreement),
        salt: params.salt,
        deadline: params.deadline,
    }, domain);
    return { commitment, agreement, quoteRequest: { pricedFields: params.pricedFields } };
}

/**
 * Candidate prices an inbound quote request and countersigns the counter-draft,
 * or declines. Mirrors `counterSignDraft`'s opt-IN floors, with a PRICING
 * callback in place of the boolean accept:
 *   - ECONOMIC FLOOR: `policy` bounds the CEILING (the candidate's worst-case
 *     exposure — any valid quote is below it). No policy → decline.
 *   - PRICING FLOOR: `quote` is the operator's pricing function — `null`
 *     declines; a figure above the ceiling or below the payment floor (≥ 1)
 *     declines. No pricing function → decline. Autonomy is never the default.
 * A malformed/tampered request THROWS. The counter-draft is built through the
 * same substitution the buyer will reconstruct with — the quote changes the
 * price and nothing else, by construction.
 */
export async function quoteDraft(
    wallet: WalletClient,
    draft: CommitmentPayload,
    ctx: { chainId: number; core: Address },
    quote?: (draft: CommitmentPayload) => bigint | null,
    policy?: OfferPolicy,
): Promise<CommitmentPayload | null> {
    const account = wallet.account;
    if (!account) throw new Error("quoteDraft: wallet has no account");
    const seller = account.address;

    const check = validateDraft(draft, seller);
    if (!check.ok) throw new Error(`quoteDraft: refusing malformed quote request — ${check.reason}`);
    const terms = draft.quoteRequest;
    if (!terms || terms.pricedFields.length === 0) {
        throw new Error("quoteDraft: payload carries no quote request — a race draft countersigns via counterSignDraft");
    }

    if (!policy) return null;
    const economic = checkOfferPolicy(draft.commitment, policy);
    if (!economic.ok) return null;

    if (!quote) return null;
    const q = quote(draft);
    if (q === null || q < 1n || q > draft.commitment.payment) return null;

    const { commitment: quoted, agreement } = buildCounterDraft(draft, terms, q);
    const domain = buildDomain(ctx.chainId, ctx.core);
    const sellerSig = await wallet.signTypedData({
        account, domain, types: COMMITMENT_TYPES, primaryType: "Commitment", message: quoted,
    });
    return { commitment: quoted, agreement, sellerSig };
}

/** The counter-draft at price `q` — the ONE build shared by the candidate's
 *  quote and the buyer's reconstruction, so the two are equal by construction
 *  or the quote is dishonest. Only the priced fields, `payment`, the
 *  re-derived `expectedCumulativeValue` (same upstream base), and
 *  `agreementHash` move; salt, deadline, parties, currency, processId are the
 *  draft's. Exported for human-driven quote surfaces (a person entering the
 *  figure IS the pricing function; the confirm gate replaces the autonomous
 *  floors, exactly as accept does). */
export function buildCounterDraft(
    draft: CommitmentPayload,
    terms: QuoteRequestTerms,
    q: bigint,
): { commitment: CommitmentPayload["commitment"]; agreement: Agreement } {
    const agreement = substitutePricedValue(draft.agreement, terms.pricedFields, q);
    const base = draft.commitment.expectedCumulativeValue - draft.commitment.payment;
    return {
        commitment: {
            ...draft.commitment,
            payment: q,
            expectedCumulativeValue: base + q,
            agreementHash: computeAgreementHash(agreement),
        },
        agreement,
    };
}

/**
 * Buyer-side verification of a quote — by RECONSTRUCTION, never diffing: the
 * buyer applies the same substitution to their OWN draft at the quoted figure
 * and requires the reply to match hash-for-hash (struct hash pins the
 * agreement hash, and the inline agreement must hash to it). The cap rule and
 * payment floor are checked against the BUYER's copy of the request — the
 * reply's echo of anything is never trusted. Then signature recovery to the
 * drafted candidate.
 */
export async function verifyQuoteReply(
    reply: CommitmentPayload,
    draft: CommitmentPayload,
    ctx: { chainId: number; core: Address },
): Promise<OfferCheck> {
    if (!reply.sellerSig) return { ok: false, reason: "quote carries no seller signature" };
    const terms = draft.quoteRequest;
    if (!terms || terms.pricedFields.length === 0) return { ok: false, reason: "the draft carries no quote request" };
    const q = reply.commitment.payment;
    if (q < 1n) return { ok: false, reason: "quote is below the payment floor" };
    if (q > draft.commitment.payment) return { ok: false, reason: "quote exceeds the request's ceiling" };
    const expected = buildCounterDraft(draft, terms, q);
    if (hashCommitmentStruct(reply.commitment) !== hashCommitmentStruct(expected.commitment)) {
        return { ok: false, reason: "quote does not match the reconstruction — something beyond the price moved" };
    }
    if (computeAgreementHash(reply.agreement).toLowerCase() !== expected.commitment.agreementHash.toLowerCase()) {
        return { ok: false, reason: "quote's inline agreement does not hash to its committed agreementHash" };
    }
    // Recover against the buyer's OWN reconstruction of the quoted struct.
    const valid = await verifyCommitmentSignature(
        expected.commitment, reply.sellerSig as Hex, draft.commitment.seller, ctx,
    );
    if (!valid) return { ok: false, reason: "seller signature does not recover to the drafted candidate" };
    return { ok: true };
}

/**
 * Send one quote request per candidate over the coordination channel, verify
 * every reply by reconstruction, and rank — cheapest verified quote first
 * (`selectRaceWinner`; the buyer may still pick any reply). Unreachable or
 * declining candidates simply drop out; an unverifiable quote is discarded,
 * never surfaced. Losing quotes need no cancellation — countersignatures
 * expire inert at the struct deadline.
 */
export async function requestQuotes(
    channel: CoordinationChannel,
    drafts: readonly CommitmentPayload[],
    ctx: { chainId: number; core: Address },
): Promise<{ replies: RaceReply[]; winner: RaceReply | null }> {
    const settled = await Promise.all(drafts.map(async (draft) => {
        try {
            const reply = await channel.sendOffer(draft.commitment.seller, draft);
            if (!reply) return null;
            const check = await verifyQuoteReply(reply, draft, ctx);
            return check.ok ? { draft, reply } : null;
        } catch {
            return null;
        }
    }));
    const replies = settled.filter((r): r is RaceReply => r !== null);
    return { replies, winner: selectRaceWinner(replies) };
}

/**
 * Send one race draft per candidate over the coordination channel, verify
 * every countersigned reply by EXACT MATCH against its sent draft, and rank —
 * cheapest posted-price countersigner first (`selectRaceWinner`). The RACE
 * sibling of `requestQuotes`: same fan-out, exact-match verification instead
 * of reconstruction (the draft already carries the candidate's price).
 * Unreachable, declining, or unverifiable candidates drop out silently.
 */
export async function requestCounterSignatures(
    channel: CoordinationChannel,
    drafts: readonly CommitmentPayload[],
    ctx: { chainId: number; core: Address },
): Promise<{ replies: RaceReply[]; winner: RaceReply | null }> {
    const settled = await Promise.all(drafts.map(async (draft) => {
        try {
            const reply = await channel.sendOffer(draft.commitment.seller, draft);
            if (!reply) return null;
            const check = await verifyRaceReply(reply, draft, ctx);
            return check.ok ? { draft, reply } : null;
        } catch {
            return null;
        }
    }));
    const replies = settled.filter((r): r is RaceReply => r !== null);
    return { replies, winner: selectRaceWinner(replies) };
}

/**
 * A mountable candidate-side responder for the RACE leg — wraps
 * `counterSignDraft` with the two operator floors (economic policy +
 * refuse-all accept). Register it on a coordination channel to answer inbound
 * race drafts. NOTE: like every leg-specific responder it THROWS on a payload
 * that is not its leg's (tamper protection — a quote request or a buyer-signed
 * offer is refused, never silently mis-handled); a wallet serving several legs
 * on one address composes a dispatcher on payload shape — `buyerSig` present →
 * `makeSellerOfferHandler`, `quoteRequest` present → `makeSellerQuoteHandler`,
 * else this.
 */
export function makeSellerRaceHandler(
    wallet: WalletClient,
    ctx: { chainId: number; core: Address },
    opts: {
        accept: (draft: CommitmentPayload) => boolean;
        policy: OfferPolicy;
    },
): (offer: CommitmentPayload) => Promise<CommitmentPayload | null> {
    return (offer) => counterSignDraft(wallet, offer, ctx, opts.accept, opts.policy);
}

/**
 * A mountable seller-side responder for the quote leg — the sibling of
 * `makeSellerOfferHandler`, wrapping `quoteDraft` with the operator's pricing
 * function + economic floor. Register it on a coordination channel to answer
 * inbound quote requests; both floors stay opt-in.
 */
export function makeSellerQuoteHandler(
    wallet: WalletClient,
    ctx: { chainId: number; core: Address },
    opts: {
        quote: (draft: CommitmentPayload) => bigint | null;
        policy: OfferPolicy;
    },
): (offer: CommitmentPayload) => Promise<CommitmentPayload | null> {
    return (offer) => quoteDraft(wallet, offer, ctx, opts.quote, opts.policy);
}

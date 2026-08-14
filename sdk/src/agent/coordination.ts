/**
 * @figaro/sdk/agent — Coordination channel + offer envelope
 *
 * Originating a bonded process is a TWO-PARTY commit: the buyer builds a
 * commitment and signs it, and the seller must counter-sign the SAME struct
 * before it can land. Between two autonomous agents that step is a message
 * exchange — an OFFER (buyer's signed commitment + the agreement it hashes)
 * travels to the seller, who validates the terms, signs, and returns the
 * counter-signed envelope. This module is the transport-agnostic seam for that
 * exchange; the SDK never fabricates the counterparty signature, it carries it.
 *
 * `CommitmentPayload` is the envelope (canonical home — the frontend's identical
 * shape should import from here). `CoordinationChannel` is the transport
 * abstraction; `InProcessChannel` (below) is a test transport that both agents
 * share in one process, and `HttpChannel` (`./httpChannel.ts`) is the shipped
 * real, off-process transport. Any other medium (XMTP, an A2A/MCP endpoint a
 * seller publishes via did:web) implements the same interface — provider-agnostic
 * by doctrine, like dispute resolution is not Kleros.
 */

import type { Hex, Commitment } from "../types.js";
import type { Agreement } from "../agreement.js";
import { strippingReviver } from "../safeJson.js";
import { SWAP_FUNDING_BIGINT_FIELDS, type SwapFundingLeg } from "../swapFunding.js";

// ── Offer envelope ────────────────────────────────────────────────────────────

/** A commitment in flight between the two parties, pinned with the agreement it
 *  hashes so the recipient hydrates everything from one message. Signatures fill
 *  in as each party signs. `buyerFunding` is the buyer's OPTIONAL swap-funded
 *  bond leg (witness-signed at checkout): when present, whoever broadcasts
 *  routes through `WitnessSwapAndCommitCoordinator.swapAndCommit` instead of
 *  the kernel's `commit` — relayer-agnostic by construction, because the swap
 *  route is bound into the buyer's Permit2 witness signature.
 *
 *  PRIVACY POSTURE: the envelope carries the FULL plaintext `agreement` — the
 *  counterparty must read the terms to sign them, so this is by design — but
 *  the shipped transports give it point-to-point TLS to the counterparty's
 *  own endpoint, NOT the end-to-end property the frontend's XMTP relay has.
 *  Route the envelope only to the counterparty; a third-party relay or queue
 *  in between needs its own E2E layer, or it reads every term. */
export interface CommitmentPayload {
    commitment: Commitment;
    agreement: Agreement;
    buyerSig?: Hex;
    sellerSig?: Hex;
    buyerFunding?: SwapFundingLeg;
    /** Present on an RFQ quote-request draft: the candidate authors the price.
     *  `commitment.payment` is the buyer's CEILING (their reservation price —
     *  a quote above it is invalid), and `pricedFields` names where the figure
     *  lives in the agreement — the BUYER names their own clause (the SDK
     *  names none); both sides apply the same mechanical substitution, so the
     *  buyer verifies a quote by RECONSTRUCTION, never by diffing. Absent on
     *  every other payload (a race draft prices at the candidate's posted
     *  figure; an offer is already priced). */
    quoteRequest?: QuoteRequestTerms;
}

/** A field of the agreement that carries the transaction figure — named by
 *  the BUYER in their quote request. `path` is dotted into the section's
 *  `data` (numeric segments index arrays, e.g. `lineItems.0.unitPrice`); the
 *  substituted value is the quote's decimal string in raw token units. */
export interface PricedField {
    clause: string;
    path: string;
}

export interface QuoteRequestTerms {
    pricedFields: readonly PricedField[];
}

/** Serialize a payload to compact JSON (bigints → hex strings). */
/**
 * THE serialized-`CommitmentPayload` byte ceiling — one constant for one
 * concern, wherever the payload travels (offer-endpoint responses on the
 * HTTP and A2A channels, inline relay delivery in the frontend race). A real
 * payload is KB-scale; this generous bound is only ever crossed by a
 * pathological order carrying megabytes of inline field content, which
 * belongs behind a content-handoff clause (already encrypted), not inline in
 * the signed agreement. Two divergent caps (8 MiB response read vs 256 KiB
 * inline) previously guarded different legs of the same race — the
 * channel-seam audit's finding 3; this is the consolidation.
 */
export const MAX_COMMITMENT_PAYLOAD_BYTES = 256 * 1024;

export function serializeCommitmentPayload(p: CommitmentPayload): string {
    return JSON.stringify(p, (_k, v) => (typeof v === "bigint" ? `0x${v.toString(16)}` : v));
}

/** Deserialize a payload back to typed form (hex strings → bigints on the
 *  commitment's numeric fields). The stripping reviver drops
 *  `__proto__`/`constructor`/`prototype` at parse time so a malicious relayed
 *  envelope can't pollute the prototype chain downstream. */
export function deserializeCommitmentPayload(json: string): CommitmentPayload {
    const raw = JSON.parse(json, strippingReviver);
    const c = raw.commitment;
    for (const f of ["payment", "salt", "deadline", "expectedCumulativeValue"]) {
        if (typeof c[f] === "string" && c[f].startsWith("0x")) c[f] = BigInt(c[f]);
    }
    const funding = raw.buyerFunding;
    if (funding) {
        for (const f of SWAP_FUNDING_BIGINT_FIELDS) {
            if (typeof funding[f] === "string" && funding[f].startsWith("0x")) funding[f] = BigInt(funding[f]);
        }
    }
    return raw as CommitmentPayload;
}

// ── Transport abstraction ─────────────────────────────────────────────────────

/**
 * A transport over which a buyer-agent sends an offer to a seller-agent and
 * receives the counter-signed (or declined) result. Implementations: an
 * in-process test channel (below), or a real network transport keyed by the
 * seller's published endpoint.
 */
export interface CoordinationChannel {
    /**
     * Send a buyer-signed offer to `seller` and await the outcome: the same
     * envelope with `sellerSig` filled (accepted), or `null` (declined / no
     * counterparty). The buyer then submits it via `executeAction`.
     */
    sendOffer(seller: Hex, offer: CommitmentPayload): Promise<CommitmentPayload | null>;
}

/** A seller-agent's decision on an inbound offer: sign it, or decline. */
export type OfferHandler = (offer: CommitmentPayload) => Promise<CommitmentPayload | null>;

/**
 * In-process test channel: seller-agents register an `OfferHandler` by address,
 * and `sendOffer` routes to it directly (no network). This is the transport the
 * two-operator autonomous-origination test runs on; it is NOT a mock of the
 * handshake — both parties run their real sign/validate logic, only the wire is
 * elided. An offer to an unregistered seller resolves to `null` (absence).
 */
export class InProcessChannel implements CoordinationChannel {
    private readonly handlers = new Map<string, OfferHandler>();

    /** Register a seller-agent's inbound-offer handler. */
    register(seller: Hex, handler: OfferHandler): void {
        this.handlers.set(seller.toLowerCase(), handler);
    }

    async sendOffer(seller: Hex, offer: CommitmentPayload): Promise<CommitmentPayload | null> {
        const handler = this.handlers.get(seller.toLowerCase());
        if (!handler) return null;
        return handler(offer);
    }
}

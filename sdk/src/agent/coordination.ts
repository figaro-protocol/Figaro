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

// ── Offer envelope ────────────────────────────────────────────────────────────

/** A commitment in flight between the two parties, pinned with the agreement it
 *  hashes so the recipient hydrates everything from one message. Signatures fill
 *  in as each party signs. */
export interface CommitmentPayload {
    commitment: Commitment;
    agreement: Agreement;
    buyerSig?: Hex;
    sellerSig?: Hex;
}

/** Serialize a payload to compact JSON (bigints → hex strings). */
export function serializeCommitmentPayload(p: CommitmentPayload): string {
    return JSON.stringify(p, (_k, v) => (typeof v === "bigint" ? `0x${v.toString(16)}` : v));
}

/** Deserialize a payload back to typed form (hex strings → bigints on the
 *  commitment's numeric fields). */
export function deserializeCommitmentPayload(json: string): CommitmentPayload {
    const raw = JSON.parse(json);
    const c = raw.commitment;
    for (const f of ["payment", "salt", "deadline", "expectedCumulativeValue"]) {
        if (typeof c[f] === "string" && c[f].startsWith("0x")) c[f] = BigInt(c[f]);
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

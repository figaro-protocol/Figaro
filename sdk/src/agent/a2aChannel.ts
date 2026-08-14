/**
 * @figaro/sdk/agent — A2A coordination transport
 *
 * The Agent2Agent-shaped `CoordinationChannel`: the SAME one-method seam as
 * `HttpChannel` (transport is provider-agnostic by doctrine), speaking the
 * A2A wire instead of a bare POST. The origination offer envelope
 * (`CommitmentPayload`) rides as the `data` part of an A2A message; the
 * JSON-RPC `message/send` request/response IS the handshake's
 * request/response, so a third-party A2A agent interoperates without
 * importing this SDK — it sees an ordinary A2A message whose data part
 * carries the envelope, counter-signs, and replies in kind.
 *
 * The handshake's three outcomes map onto A2A responses, mirroring
 * `HttpChannel`'s status contract:
 *   - counter-signed  → a result message whose data part carries the signed
 *                       envelope;
 *   - policy DECLINED → a result message with NO data part (a text part
 *                       explains; absence of the envelope IS the decline);
 *   - tampered/forged → a JSON-RPC ERROR (the anti-tamper gate throws —
 *                       a rejection is never a silent decline).
 *
 * Hermetic by construction, like the HTTP triple: the responder is a pure
 * request→response function any server drives, and the channel takes an
 * injectable fetch.
 */

import type { Hex } from "../types.js";
import type { CommitmentPayload, CoordinationChannel, OfferHandler } from "./coordination.js";
import { serializeCommitmentPayload, deserializeCommitmentPayload, MAX_COMMITMENT_PAYLOAD_BYTES } from "./coordination.js";
import type { EndpointResolver } from "./httpChannel.js";
import { readCappedResponseText } from "./httpChannel.js";

// ── The A2A envelope shapes (the subset this transport speaks) ───────────────

/** One part of an A2A message: the offer envelope rides in a `data` part;
 *  human-readable notes ride in `text` parts. */
export type A2aPart =
    | { kind: "data"; data: Record<string, unknown> }
    | { kind: "text"; text: string };

/** An A2A message — the unit `message/send` carries each way. */
export interface A2aMessage {
    role: "user" | "agent";
    parts: A2aPart[];
    messageId: string;
    kind: "message";
}

interface A2aRequest {
    jsonrpc: "2.0";
    id: string | number;
    method: "message/send";
    params: { message: A2aMessage };
}

interface A2aResponse {
    jsonrpc: "2.0";
    id: string | number | null;
    result?: A2aMessage;
    error?: { code: number; message: string };
}

/** JSON-RPC error codes this transport emits (standard + A2A ranges). */
const PARSE_ERROR = -32700;
const INVALID_PARAMS = -32602;
/** The anti-tamper gate rejected the offer — A2A's task-not-completable
 *  range; distinct from a decline, which is a RESULT without an envelope. */
const OFFER_REJECTED = -32002;

// ── Envelope codec: offer ⇄ A2A message ──────────────────────────────────────

/** Wrap an offer envelope as the data part of an A2A message. `messageId` is
 *  correlation metadata, not identity — the envelope's own signatures are
 *  what authenticate (the transport is untrusted either way). */
export function a2aMessageFromOffer(
    offer: CommitmentPayload,
    role: A2aMessage["role"],
    messageId: string,
): A2aMessage {
    return {
        role,
        parts: [{ kind: "data", data: JSON.parse(serializeCommitmentPayload(offer)) as Record<string, unknown> }],
        messageId,
        kind: "message",
    };
}

/** The offer envelope carried by an A2A message's first data part, or null
 *  when the message carries none (a decline, or an unrelated message). A
 *  data part that does not deserialize as an envelope THROWS — malformed is
 *  not absence. */
export function offerFromA2aMessage(message: A2aMessage): CommitmentPayload | null {
    const dataPart = message.parts.find((p): p is Extract<A2aPart, { kind: "data" }> => p.kind === "data");
    if (!dataPart) return null;
    return deserializeCommitmentPayload(JSON.stringify(dataPart.data));
}

// ── Buyer side: the channel ──────────────────────────────────────────────────

export interface A2aChannelOptions {
    /** Resolve a seller address to its A2A endpoint — compose
     *  `didWebEndpointResolver(..., { serviceType: "A2AEndpoint" })`, a
     *  static map, or a registry read. */
    resolveEndpoint: EndpointResolver;
    /** Injectable fetch (testing / non-global-fetch environments). */
    fetchFn?: typeof fetch;
    /** Correlation-id source — injectable so runs are reproducible. */
    nextId?: () => string;
}

/**
 * A network `CoordinationChannel` over the A2A wire. `sendOffer` resolves
 * the seller's A2A endpoint, sends `message/send` with the offer as the data
 * part, and reads the counter-signed envelope out of the result message.
 *   - result with a data part → counter-signed (deserialize and return);
 *   - result with no data part → the seller DECLINED (return null);
 *   - unresolvable endpoint → null (absence, no counterparty);
 *   - JSON-RPC error or non-2xx → THROW (a rejection is not a decline).
 */
export class A2aChannel implements CoordinationChannel {
    private readonly resolveEndpoint: EndpointResolver;
    private readonly fetchFn: typeof fetch;
    private readonly nextId: () => string;
    private counter = 0;

    constructor(opts: A2aChannelOptions) {
        this.resolveEndpoint = opts.resolveEndpoint;
        this.fetchFn = opts.fetchFn ?? globalThis.fetch;
        this.nextId = opts.nextId ?? (() => `figaro-offer-${++this.counter}`);
    }

    async sendOffer(seller: Hex, offer: CommitmentPayload): Promise<CommitmentPayload | null> {
        const url = await this.resolveEndpoint(seller);
        if (!url) return null;
        const id = this.nextId();
        const request: A2aRequest = {
            jsonrpc: "2.0",
            id,
            method: "message/send",
            params: { message: a2aMessageFromOffer(offer, "user", id) },
        };
        const res = await this.fetchFn(url, {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(request),
        });
        if (!res.ok) throw new Error(`A2aChannel: offer to ${url} failed — HTTP ${res.status}`);
        // The endpoint is an attacker-authorable advertised URL: cap the body
        // read exactly as the HTTP sibling does (same threat, same mitigation —
        // frontend security audit 2026-07-22 finding 6). The cap is the ONE
        // payload ceiling; the JSON-RPC wrapper is bytes of overhead, not scale.
        const reply = JSON.parse(await readCappedResponseText(res, MAX_COMMITMENT_PAYLOAD_BYTES)) as A2aResponse;
        if (reply.error) {
            throw new Error(`A2aChannel: offer rejected — ${reply.error.message} (code ${reply.error.code})`);
        }
        if (!reply.result) throw new Error("A2aChannel: response carries neither result nor error");
        return offerFromA2aMessage(reply.result);
    }
}

// ── Seller side: the responder ───────────────────────────────────────────────

/** A status + body for the seller's server to write back (A2A errors still
 *  ride HTTP 200 — JSON-RPC carries the failure). */
export interface A2aOfferResponse {
    status: number;
    body: string;
}

function errorResponse(id: string | number | null, code: number, message: string): A2aOfferResponse {
    const body: A2aResponse = { jsonrpc: "2.0", id, error: { code, message } };
    return { status: 200, body: JSON.stringify(body) };
}

/**
 * Turn a seller's {@link OfferHandler} into a framework-agnostic A2A
 * responder — the sibling of `makeHttpOfferResponder`, mapping the same
 * handler outcomes onto the A2A wire:
 *   - unparsable / non-`message/send` / no envelope part → JSON-RPC error;
 *   - handler THREW (the anti-tamper gate)  → JSON-RPC error `-32002`;
 *   - handler returned null (policy decline) → result message, no data part;
 *   - handler returned a signed envelope     → result message carrying it.
 */
export function makeA2aOfferResponder(handler: OfferHandler): (requestBody: string) => Promise<A2aOfferResponse> {
    return async (requestBody) => {
        let request: A2aRequest;
        try {
            request = JSON.parse(requestBody) as A2aRequest;
        } catch {
            return errorResponse(null, PARSE_ERROR, "request is not JSON");
        }
        if (request.method !== "message/send" || !request.params?.message) {
            return errorResponse(request.id ?? null, INVALID_PARAMS, "expected message/send with a message param");
        }
        let offer: CommitmentPayload | null;
        try {
            offer = offerFromA2aMessage(request.params.message);
        } catch {
            return errorResponse(request.id, INVALID_PARAMS, "malformed offer envelope in data part");
        }
        if (!offer) {
            return errorResponse(request.id, INVALID_PARAMS, "message carries no offer envelope");
        }
        let signed: CommitmentPayload | null;
        try {
            signed = await handler(offer);
        } catch (e) {
            return errorResponse(request.id, OFFER_REJECTED, e instanceof Error ? e.message : "offer rejected");
        }
        const result: A2aMessage = signed
            ? a2aMessageFromOffer(signed, "agent", `${request.params.message.messageId}-reply`)
            : {
                role: "agent",
                parts: [{ kind: "text", text: "offer declined" }],
                messageId: `${request.params.message.messageId}-reply`,
                kind: "message",
            };
        const body: A2aResponse = { jsonrpc: "2.0", id: request.id, result };
        return { status: 200, body: JSON.stringify(body) };
    };
}

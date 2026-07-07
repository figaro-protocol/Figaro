/**
 * @figaro/core/agent — HTTP coordination transport
 *
 * The first REAL `CoordinationChannel` (the sibling of the in-process test
 * transport): it carries the origination offer envelope over an actual socket.
 * `sendOffer` is request/response — the buyer POSTs the serialized envelope to
 * the seller's published endpoint and awaits the counter-signed envelope — so
 * plain HTTP fits it exactly, and the endpoint is the very `service` URL a seller
 * advertises in its DID Document (see `extractServiceEndpoints`). Unlike
 * `InProcessChannel`, this crosses process boundaries and actually exercises
 * `serialize`/`deserializeCommitmentPayload` — the wire the interface promises.
 *
 * The SDK ships no server: `makeHttpOfferResponder` is a framework-agnostic
 * request handler that any HTTP server (node:http, express, a serverless
 * function) drives. Transport is provider-agnostic by doctrine — HTTP here, XMTP
 * or A2A elsewhere; all implement the same one-method interface.
 */

import type { Hex } from "../types.js";
import type { CommitmentPayload, CoordinationChannel, OfferHandler } from "./coordination.js";
import { serializeCommitmentPayload, deserializeCommitmentPayload } from "./coordination.js";
import { resolveDidWeb, didDocumentMatchesAddress, extractServiceEndpoints } from "./did.js";

// ── Endpoint resolution ───────────────────────────────────────────────────────

/**
 * Resolve a seller ADDRESS to the URL where it accepts offers. Kept separate from
 * the channel so resolution is pluggable: compose one from did:web
 * ({@link didWebEndpointResolver}), back it with a static map, or read it from a
 * registry. Returning `null` means "no reachable endpoint" — the buyer treats it
 * as absence (no counterparty), exactly like an unregistered seller on the
 * in-process channel.
 */
export type EndpointResolver = (seller: Hex) => Promise<string | null>;

export interface DidWebResolverOptions {
    /** The `service.type` to route to (the transport the caller speaks). The doc
     *  convention uses `MCPEndpoint` / `A2AEndpoint` / `RESTEndpoint`. */
    serviceType?: string;
    /** Require the DID's wallet binding to match on this chain (recommended). */
    chainId?: number;
    /** Injectable fetch (testing / non-global-fetch environments). */
    fetchFn?: typeof fetch;
}

/**
 * An {@link EndpointResolver} backed by did:web — the loop-closer over the
 * discovery half. Given a way to look up a seller's DID (from its
 * `SellerRegistry` metadata, an ENS record, or a static map), it resolves the DID
 * Document, VERIFIES the document binds this seller address (never route an offer
 * to an endpoint from a DID that does not bind the seller), and returns the
 * coordination `service` endpoint of the requested type.
 */
export function didWebEndpointResolver(
    sellerToDid: (seller: Hex) => string | null | Promise<string | null>,
    opts: DidWebResolverOptions = {},
): EndpointResolver {
    const serviceType = opts.serviceType ?? "MCPEndpoint";
    return async (seller) => {
        const did = await sellerToDid(seller);
        if (!did) return null;
        const { document } = await resolveDidWeb(did, opts.fetchFn);
        if (!document) return null;
        if (!didDocumentMatchesAddress(document, seller, opts.chainId)) return null;
        const [endpoint] = extractServiceEndpoints(document, serviceType);
        return typeof endpoint?.serviceEndpoint === "string" ? endpoint.serviceEndpoint : null;
    };
}

// ── Buyer side: the channel ───────────────────────────────────────────────────

export interface HttpChannelOptions {
    resolveEndpoint: EndpointResolver;
    /** Injectable fetch (testing / non-global-fetch environments). */
    fetchFn?: typeof fetch;
}

/**
 * A network `CoordinationChannel` over HTTP. `sendOffer` resolves the seller's
 * endpoint, POSTs the serialized offer, and returns the counter-signed envelope.
 * Status contract mirrors the handshake's own semantics:
 *   - `200` + body → the seller counter-signed (return the deserialized envelope);
 *   - `204`        → the seller DECLINED a clean offer (return `null`);
 *   - unreachable endpoint → `null` (absence, no counterparty);
 *   - any other non-2xx → THROW (a transport/protocol error is not a decline).
 */
export class HttpChannel implements CoordinationChannel {
    private readonly resolveEndpoint: EndpointResolver;
    private readonly fetchFn: typeof fetch;

    constructor(opts: HttpChannelOptions) {
        this.resolveEndpoint = opts.resolveEndpoint;
        this.fetchFn = opts.fetchFn ?? globalThis.fetch;
    }

    async sendOffer(seller: Hex, offer: CommitmentPayload): Promise<CommitmentPayload | null> {
        const url = await this.resolveEndpoint(seller);
        if (!url) return null;
        const res = await this.fetchFn(url, {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: serializeCommitmentPayload(offer),
        });
        if (res.status === 204) return null;
        if (!res.ok) throw new Error(`HttpChannel: offer to ${url} failed — HTTP ${res.status}`);
        return deserializeCommitmentPayload(await res.text());
    }
}

// ── Seller side: the responder ────────────────────────────────────────────────

/** A status + body for the seller's HTTP server to write back. */
export interface HttpOfferResponse {
    status: number;
    body: string;
}

/**
 * Turn a seller's {@link OfferHandler} into a framework-agnostic HTTP responder.
 * Any server passes the raw request body; this deserializes, runs the handler,
 * and maps the result to the status contract `HttpChannel` expects:
 *   - malformed envelope        → `400`;
 *   - handler THREW (tampered/forged offer — the anti-tamper gate) → `422`;
 *   - handler returned `null` (policy declined a clean offer)      → `204`;
 *   - handler returned a signed envelope                           → `200`.
 * A tampered offer is a `422`, never a silent `204` — the buyer must see the
 * difference between "declined" and "rejected as forged".
 */
export function makeHttpOfferResponder(handler: OfferHandler): (requestBody: string) => Promise<HttpOfferResponse> {
    return async (requestBody) => {
        let offer: CommitmentPayload;
        try {
            offer = deserializeCommitmentPayload(requestBody);
        } catch {
            return { status: 400, body: "malformed offer envelope" };
        }
        let signed: CommitmentPayload | null;
        try {
            signed = await handler(offer);
        } catch (e) {
            return { status: 422, body: e instanceof Error ? e.message : "offer rejected" };
        }
        if (!signed) return { status: 204, body: "" };
        return { status: 200, body: serializeCommitmentPayload(signed) };
    };
}

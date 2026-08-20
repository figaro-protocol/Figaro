/**
 * @figaro-protocol/sdk/agent — HTTP coordination transport
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
import { serializeCommitmentPayload, deserializeCommitmentPayload, MAX_COMMITMENT_PAYLOAD_BYTES } from "./coordination.js";
import { resolveDidWeb, didDocumentMatchesAddress, extractServiceEndpoints } from "./did.js";

/**
 * Byte ceiling on an offer-endpoint response. The endpoint is a counterparty's
 * ADVERTISED `service` URL — attacker-controllable by any registered
 * participant. Buffering its response whole (`res.text()`) before the
 * content-verification that would reject it lets a hostile candidate stream an
 * unbounded body and OOM the buyer's tab / an agent process (frontend security
 * audit 2026-07-22, finding 6). An offer envelope is KB-scale; 8 MB clears every
 * real reply with margin. Mirrors the IPFS document cap.
 */
export const MAX_OFFER_RESPONSE_BYTES = 8 * 1024 * 1024;

/**
 * Read a fetch `Response` body as text with a hard byte ceiling, streaming and
 * aborting mid-download once the cap is exceeded, and rejecting an over-declared
 * `Content-Length` up front. Falls back to a capped `res.text()` when the body
 * is not a readable stream (injected test doubles / non-stream environments).
 */
export async function readCappedResponseText(
    res: Response,
    maxBytes: number = MAX_OFFER_RESPONSE_BYTES,
): Promise<string> {
    const declared = res.headers?.get?.("content-length");
    if (declared && Number(declared) > maxBytes) {
        throw new Error(`offer response exceeds ${maxBytes}-byte cap (declared ${declared})`);
    }
    const body = res.body as ReadableStream<Uint8Array> | null | undefined;
    if (!body || typeof body.getReader !== "function") {
        const text = await res.text();
        if (text.length > maxBytes) {
            throw new Error(`offer response exceeds ${maxBytes}-byte cap`);
        }
        return text;
    }
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel();
            throw new Error(`offer response exceeds ${maxBytes}-byte cap`);
        }
        chunks.push(value);
    }
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        joined.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(joined);
}

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
 * `MembersRegistry` metadata, an ENS record, or a static map), it resolves the DID
 * Document, CHECKS the document names this seller address — a consistency check,
 * not proof of control, since a DID document is self-published (never route an
 * offer to an endpoint from a DID that does not name the seller) — and returns the
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
        return postOffer(url, offer, { fetchFn: this.fetchFn });
    }
}

/**
 * THE offer wire, as a free function: POST the serialized envelope to an
 * endpoint URL — 200-with-body = the counter-signed reply, 204 (or an empty
 * body) = a clean decline, any other non-2xx = a thrown transport/protocol
 * error. `HttpChannel.sendOffer` is this plus the `EndpointResolver` seam;
 * the frontend race's agent leg is this plus its browser-edge https guard
 * (endpoint POLICY lives at each caller's edge — a browser guards in code,
 * an autonomous agent's egress is its sandbox's job; the WIRE lives once —
 * the channel-seam audit's finding 1, consolidated).
 */
export async function postOffer(
    url: string,
    offer: CommitmentPayload,
    opts: { fetchFn?: typeof fetch } = {},
): Promise<CommitmentPayload | null> {
    const fetchFn = opts.fetchFn ?? globalThis.fetch;
    const res = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: serializeCommitmentPayload(offer),
    });
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`offer to ${url} failed — HTTP ${res.status}`);
    const text = await readCappedResponseText(res, MAX_COMMITMENT_PAYLOAD_BYTES);
    return text ? deserializeCommitmentPayload(text) : null;
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

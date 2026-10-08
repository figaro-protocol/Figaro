/**
 * userEndpoints — per-user runtime endpoint overrides.
 *
 * The build-baked NEXT_PUBLIC_* endpoints are only DEFAULTS: on a hosted
 * deploy they would otherwise seize every visitor onto the operator's RPC
 * provider key and IPFS node — the only traffic-scaling cost, and the
 * wrong holder (wallet pins → wallet pays → wallet erases; readers read
 * through their own provider). These overrides are the user's, stored in
 * localStorage, consulted at call time by the IpfsService seam and at
 * config creation by wagmi (an RPC change applies on reload).
 */
import { readJsonStorage, writeJsonStorage } from "@/lib/shared/storage";

const STORAGE_KEY = "figaro.user-endpoints";

export interface UserEndpointOverrides {
    /** JSON-RPC endpoint for chain reads (the user's own provider key). */
    rpcUrl?: string;
    /** Kubo API endpoint pins land on (the user's own node — they pay, they erase). */
    ipfsApiUrl?: string;
    /** IPFS gateway content is read through. */
    ipfsGatewayUrl?: string;
    /** Nominatim-compatible search endpoint typed addresses resolve
     *  through — called directly from the browser (no operator server in
     *  between); OpenStreetMap's public instance by default, the user's
     *  own instance if set. */
    geocodeUrl?: string;
    /** A batch-resolution RELAY to read batched trade through. Multiple relays
     *  are legal by construction — resolution is permissionless, so anyone can
     *  run one — and nothing published by a relay is trusted: `/audit`
     *  re-derives every struct, signature and payout and anchors the batch on
     *  chain before showing it. So pointing this at any relay, or at your own,
     *  is safe by construction rather than by reputation. */
    batchRelayUrl?: string;
    /** An ANALYST to ask free-form questions of on `/data/explore`. An analyst
     *  is an agent anyone runs over the public event log — operator-hosted
     *  for a site's public analyses, user-run for analyses that also read the
     *  private substance that user OWNS or BOUGHT (the first-class case, which
     *  is why this is a per-reader endpoint and not a site service). Unset =
     *  no prompt box; the page's deterministic views are read by this browser
     *  either way. */
    analystUrl?: string;
    /** The bearer token the analyst at `analystUrl` wrote at its start (its
     *  `/prompt` route asks for it). A per-reader convenience stored beside the
     *  URL it belongs to: sent only to the reader's own `analystUrl`, never to
     *  a deployment default, never pinned or published. */
    analystToken?: string;
}

/** An endpoint is an http(s) base URL — anything else is refused outright
 *  rather than handed to `fetch`. The one sanitizer every endpoint resolver
 *  shares (relay, analyst, and the overrides below). */
export function sanitizeEndpointUrl(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    // Endpoints are http(s) base URLs — refuse anything else outright.
    if (!/^https?:\/\//.test(trimmed)) return undefined;
    return trimmed.replace(/\/$/, "");
}

/** A bearer token is one run of printable ASCII — anything else is dropped
 *  rather than placed in a request header. */
function sanitizeBearerToken(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return /^[\x21-\x7e]+$/.test(trimmed) ? trimmed : undefined;
}

export function readUserEndpoints(): UserEndpointOverrides {
    const raw = readJsonStorage<UserEndpointOverrides>(STORAGE_KEY, {});
    return {
        rpcUrl: sanitizeEndpointUrl(raw.rpcUrl),
        ipfsApiUrl: sanitizeEndpointUrl(raw.ipfsApiUrl),
        ipfsGatewayUrl: sanitizeEndpointUrl(raw.ipfsGatewayUrl),
        geocodeUrl: sanitizeEndpointUrl(raw.geocodeUrl),
        batchRelayUrl: sanitizeEndpointUrl(raw.batchRelayUrl),
        analystUrl: sanitizeEndpointUrl(raw.analystUrl),
        analystToken: sanitizeBearerToken(raw.analystToken),
    };
}

export function writeUserEndpoints(next: UserEndpointOverrides): void {
    writeJsonStorage(STORAGE_KEY, {
        rpcUrl: sanitizeEndpointUrl(next.rpcUrl),
        ipfsApiUrl: sanitizeEndpointUrl(next.ipfsApiUrl),
        ipfsGatewayUrl: sanitizeEndpointUrl(next.ipfsGatewayUrl),
        geocodeUrl: sanitizeEndpointUrl(next.geocodeUrl),
        batchRelayUrl: sanitizeEndpointUrl(next.batchRelayUrl),
        analystUrl: sanitizeEndpointUrl(next.analystUrl),
        analystToken: sanitizeBearerToken(next.analystToken),
    });
}

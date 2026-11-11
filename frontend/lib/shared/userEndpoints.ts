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
import { activeChain } from "@/lib/shared/chains";

const STORAGE_KEY = "figaro.user-endpoints";

export interface UserEndpointOverrides {
    /** JSON-RPC endpoint for chain reads (the user's own provider key), on
     *  ONE chain: an endpoint serves the chain it is on and no other, so it
     *  is stored under its chain id and read for the page's chain. */
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

/** What the browser stores: the reader's endpoints, the RPC ones by chain id. */
type StoredEndpoints = Omit<UserEndpointOverrides, "rpcUrl"> & { rpcUrls?: Record<string, unknown> };

function readStored(): StoredEndpoints {
    return readJsonStorage<StoredEndpoints>(STORAGE_KEY, {});
}

/** The reader's endpoints, the RPC one being `chainId`'s (the page's chain by default). */
export function readUserEndpoints(chainId: number = activeChain.id): UserEndpointOverrides {
    const raw = readStored();
    return {
        rpcUrl: sanitizeEndpointUrl(raw.rpcUrls?.[String(chainId)]),
        ipfsApiUrl: sanitizeEndpointUrl(raw.ipfsApiUrl),
        ipfsGatewayUrl: sanitizeEndpointUrl(raw.ipfsGatewayUrl),
        geocodeUrl: sanitizeEndpointUrl(raw.geocodeUrl),
        analystUrl: sanitizeEndpointUrl(raw.analystUrl),
        analystToken: sanitizeBearerToken(raw.analystToken),
    };
}

/** Store the reader's endpoints; `next.rpcUrl` is `chainId`'s (the page's chain
 *  by default), and every other chain's RPC endpoint is kept as it was. */
export function writeUserEndpoints(next: UserEndpointOverrides, chainId: number = activeChain.id): void {
    const rpcUrls: Record<string, string> = {};
    for (const [id, url] of Object.entries(readStored().rpcUrls ?? {})) {
        const kept = sanitizeEndpointUrl(url);
        if (kept && id !== String(chainId)) rpcUrls[id] = kept;
    }
    const rpcUrl = sanitizeEndpointUrl(next.rpcUrl);
    if (rpcUrl) rpcUrls[String(chainId)] = rpcUrl;
    writeJsonStorage(STORAGE_KEY, {
        rpcUrls,
        ipfsApiUrl: sanitizeEndpointUrl(next.ipfsApiUrl),
        ipfsGatewayUrl: sanitizeEndpointUrl(next.ipfsGatewayUrl),
        geocodeUrl: sanitizeEndpointUrl(next.geocodeUrl),
        analystUrl: sanitizeEndpointUrl(next.analystUrl),
        analystToken: sanitizeBearerToken(next.analystToken),
    });
}

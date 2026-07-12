/**
 * W3C did:web resolution and DID Document types.
 *
 * Implements the did:web Method Specification (W3C CCG):
 * https://w3c-ccg.github.io/did-method-web/
 *
 * Resolution algorithm (§2.5.2):
 *   1. Replace ":" with "/" in the method-specific identifier.
 *   2. Percent-decode any port colons.
 *   3. Prepend "https://".
 *   4. If no path, append "/.well-known".
 *   5. Append "/did.json".
 *   6. Fetch via HTTPS — hardened against SSRF (https-only, blocked internal
 *      hosts, no redirects, size-capped body; see `assertSafeResolutionUrl`).
 *   7. Check the document's `id` matches the DID.
 */

// ── W3C DID Document Types ──────────────────────────────────────────────────

/** A single verification method within a DID Document. */
export interface VerificationMethod {
    id: string;
    type: string;
    controller: string;
    /** JSON Web Key (JsonWebKey2020). */
    publicKeyJwk?: Record<string, unknown>;
    /** Multibase-encoded public key (Ed25519VerificationKey2020, etc.). */
    publicKeyMultibase?: string;
    /** CAIP-10 blockchain account ID (EcdsaSecp256k1RecoveryMethod2020). */
    blockchainAccountId?: string;
}

/** A service endpoint declared in a DID Document. */
export interface DIDService {
    id: string;
    type: string;
    serviceEndpoint: string | string[] | Record<string, unknown>;
}

/** W3C DID Document (subset relevant to did:web + Ethereum identity). */
export interface DIDDocument {
    "@context":
    | string
    | string[]
    | Array<string | Record<string, unknown>>;
    id: string;
    controller?: string | string[];
    alsoKnownAs?: string[];
    verificationMethod?: VerificationMethod[];
    authentication?: Array<string | VerificationMethod>;
    assertionMethod?: Array<string | VerificationMethod>;
    keyAgreement?: Array<string | VerificationMethod>;
    capabilityInvocation?: Array<string | VerificationMethod>;
    capabilityDelegation?: Array<string | VerificationMethod>;
    service?: DIDService[];
}

/** Result of resolving a did:web identifier. */
export interface DIDResolutionResult {
    document: DIDDocument | null;
    error: string | null;
}

// ── did:web URL Derivation ──────────────────────────────────────────────────

const DID_WEB_PREFIX = "did:web:";

/**
 * Validate that a string is a well-formed did:web identifier.
 * Does NOT resolve — just checks syntax.
 */
export function isDidWeb(did: string): boolean {
    if (!did.startsWith(DID_WEB_PREFIX)) return false;
    const identifier = did.slice(DID_WEB_PREFIX.length);
    // Must have at least a domain component
    return identifier.length > 0 && !identifier.startsWith(":");
}

/**
 * Convert a did:web identifier to its HTTPS resolution URL.
 *
 * Examples:
 *   did:web:example.com             → https://example.com/.well-known/did.json
 *   did:web:example.com:user:alice  → https://example.com/user/alice/did.json
 *   did:web:example.com%3A3000      → https://example.com:3000/.well-known/did.json
 */
export function didWebToUrl(did: string): string {
    if (!did.startsWith(DID_WEB_PREFIX)) {
        throw new Error(`Not a did:web identifier: ${did}`);
    }

    const identifier = did.slice(DID_WEB_PREFIX.length);
    if (!identifier) {
        throw new Error("Empty did:web identifier");
    }

    // Step 1: Split on ":" to get domain + optional path segments
    const parts = identifier.split(":");

    // Step 2: Percent-decode the domain (handles %3A → ":" for ports)
    const domain = decodeURIComponent(parts[0]);
    const pathSegments = parts.slice(1);

    // Step 3–5: Build the URL
    if (pathSegments.length === 0) {
        return `https://${domain}/.well-known/did.json`;
    }
    const path = pathSegments.map(decodeURIComponent).join("/");
    return `https://${domain}/${path}/did.json`;
}

// ── DID Document Validation ─────────────────────────────────────────────────

/**
 * Basic structural validation of a DID Document.
 * Returns null if valid, or an error string describing the problem.
 */
export function validateDidDocument(
    doc: unknown,
    expectedDid?: string,
): string | null {
    if (!doc || typeof doc !== "object") {
        return "DID Document must be a non-null object";
    }

    const d = doc as Record<string, unknown>;

    // id is required
    if (typeof d.id !== "string" || !d.id) {
        return "DID Document missing required 'id' field";
    }

    // If expected DID is provided, check match (spec §2.5.2 step 7)
    if (expectedDid && d.id !== expectedDid) {
        return `DID Document id '${d.id}' does not match expected '${expectedDid}'`;
    }

    // @context must be present
    if (!d["@context"]) {
        return "DID Document missing required '@context' field";
    }

    // verificationMethod entries must have id, type, controller
    if (d.verificationMethod) {
        if (!Array.isArray(d.verificationMethod)) {
            return "'verificationMethod' must be an array";
        }
        for (const vm of d.verificationMethod as unknown[]) {
            if (!vm || typeof vm !== "object") {
                return "Each verificationMethod must be an object";
            }
            const v = vm as Record<string, unknown>;
            if (!v.id || !v.type || !v.controller) {
                return "Each verificationMethod must have id, type, and controller";
            }
        }
    }

    // service entries must have id, type, serviceEndpoint (so a resolver can
    // route to the endpoint an agent publishes — see extractServiceEndpoints)
    if (d.service) {
        if (!Array.isArray(d.service)) {
            return "'service' must be an array";
        }
        for (const svc of d.service as unknown[]) {
            if (!svc || typeof svc !== "object") {
                return "Each service must be an object";
            }
            const s = svc as Record<string, unknown>;
            if (!s.id || !s.type || !s.serviceEndpoint) {
                return "Each service must have id, type, and serviceEndpoint";
            }
        }
    }

    return null;
}

// ── SSRF Hardening ───────────────────────────────────────────────────────────
//
// A did:web identifier is attacker-controlled: `did:web:127.0.0.1`,
// `did:web:169.254.169.254`, `did:web:foo.internal`, etc. resolve to internal
// infrastructure. Resolution is a server-reachable network fetch, so the
// resolver MUST refuse hosts that point inward before making the request.
//
// LIMIT (cannot be closed here): these are HOSTNAME-LITERAL checks. They run
// before DNS, so a public name that RESOLVES to an internal address (DNS
// rebinding) still passes. Closing that requires resolving the name and
// pinning the connection to the checked IP — not expressible with the fetch
// API. Deployments that need it must front resolution with an egress proxy.

/** A DID Document is a few KB; cap the body so a hostile host can't stream an
 *  unbounded response into the resolver. */
const MAX_DID_DOC_BYTES = 1 << 20; // 1 MiB

/** Parse a dotted-quad IPv4 literal into its four octets, or null. */
function parseIPv4(host: string): [number, number, number, number] | null {
    const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return null;
    const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    if (octets.some((o) => o > 255)) return null;
    return octets as [number, number, number, number];
}

/** Loopback, RFC1918, link-local (incl. cloud metadata 169.254.169.254),
 *  and the unspecified address. */
function isBlockedIPv4(host: string): boolean {
    const octets = parseIPv4(host);
    if (!octets) return false;
    const [a, b] = octets;
    if (a === 0) return true; // 0.0.0.0/8 (unspecified)
    if (a === 127) return true; // 127.0.0.0/8 (loopback)
    if (a === 10) return true; // 10.0.0.0/8 (RFC1918)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (RFC1918)
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 (RFC1918)
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local + metadata)
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT — hosts e.g. Alibaba metadata 100.100.100.200)
    return false;
}

/** Expand an IPv6 literal (incl. `::` compression and trailing IPv4) to 8
 *  16-bit groups, or null if malformed. */
function expandIPv6(addr: string): number[] | null {
    let s = addr;
    // Fold a trailing embedded IPv4 (e.g. `::ffff:127.0.0.1`) into two hextets.
    const v4 = s.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (v4) {
        const octets = parseIPv4(v4[2]);
        if (!octets) return null;
        const hi = (octets[0] << 8) | octets[1];
        const lo = (octets[2] << 8) | octets[3];
        s = `${v4[1]}${hi.toString(16)}:${lo.toString(16)}`;
    }
    const halves = s.split("::");
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(":") : [];
    const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
    if (halves.length === 1) {
        if (head.length !== 8) return null;
        return head.map((g) => parseInt(g, 16));
    }
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    const groups = [...head, ...Array(fill).fill("0"), ...tail];
    if (groups.length !== 8) return null;
    return groups.map((g) => parseInt(g || "0", 16));
}

/** Loopback (::1), unspecified (::), link-local (fe80::/10), unique-local
 *  (fc00::/7), and any IPv4-mapped form of a blocked IPv4. */
function isBlockedIPv6(raw: string): boolean {
    const host = raw.replace(/%.*$/, ""); // strip zone id
    if (host === "::1" || host === "::") return true;
    // IPv4-mapped / -embedded (::ffff:a.b.c.d, ::a.b.c.d).
    const embeddedV4 = host.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (embeddedV4 && isBlockedIPv4(embeddedV4[1])) return true;
    const groups = expandIPv6(host);
    if (!groups) return false;
    const first = groups[0];
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 (link-local)
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 (unique-local)
    if (groups.every((g, i) => (i === 7 ? g === 1 : g === 0))) return true; // ::1
    // IPv4-mapped (::ffff:a.b.c.d) / -compatible (::a.b.c.d): URL normalization
    // rewrites the dotted quad to hex, so reconstruct and re-check it.
    if (groups.slice(0, 5).every((g) => g === 0) && (groups[5] === 0xffff || groups[5] === 0)) {
        const embedded = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
        if (isBlockedIPv4(embedded)) return true;
    }
    return false;
}

/** True if `hostname` (as parsed from a URL — IPv6 may carry brackets) points
 *  at loopback, private, link-local, metadata, or `.internal`/`.local` space. */
function isBlockedHost(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets
    if (host === "localhost" || host.endsWith(".localhost")) return true;
    if (host === "metadata.google.internal") return true;
    if (host.endsWith(".internal") || host.endsWith(".local")) return true;
    if (parseIPv4(host)) return isBlockedIPv4(host);
    if (host.includes(":")) return isBlockedIPv6(host);
    return false;
}

/**
 * Validate that a resolution URL is safe to fetch: https-only and not pointed at
 * internal/loopback/link-local/metadata space. Throws a descriptive Error on
 * violation so `resolveDidWeb` can surface it as a resolution error. Exported so
 * any resolver reusing an injected fetch can re-run the same host checks.
 */
export function assertSafeResolutionUrl(url: string): URL {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error(`Malformed resolution URL: ${url}`);
    }
    if (parsed.protocol !== "https:") {
        throw new Error(`did:web resolution is https-only (got ${parsed.protocol})`);
    }
    if (isBlockedHost(parsed.hostname)) {
        throw new Error(`Refusing to resolve DID against internal host: ${parsed.hostname}`);
    }
    return parsed;
}

/** Read a response body as text, fast-rejecting on a declared oversize
 *  Content-Length and aborting a stream that exceeds the cap mid-read. Falls
 *  back to `text()`/`json()` for injected fetches with no streaming body. */
async function readCappedText(response: Response): Promise<string> {
    const declared = response.headers?.get?.("content-length");
    if (declared && Number(declared) > MAX_DID_DOC_BYTES) {
        throw new Error("DID Document exceeds size cap");
    }
    const body = response.body;
    if (!body || typeof body.getReader !== "function") {
        // Injected/mock fetch with no ReadableStream body.
        if (typeof response.text === "function") return response.text();
        return JSON.stringify(await response.json());
    }
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
                total += value.byteLength;
                if (total > MAX_DID_DOC_BYTES) {
                    await reader.cancel();
                    throw new Error("DID Document exceeds size cap");
                }
                chunks.push(value);
            }
        }
    } finally {
        reader.releaseLock?.();
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
        merged.set(c, offset);
        offset += c.byteLength;
    }
    return new TextDecoder().decode(merged);
}

// ── did:web Resolution ──────────────────────────────────────────────────────

/**
 * Resolve a did:web identifier to its DID Document.
 *
 * Uses the standard did:web resolution algorithm (§2.5.2), hardened against
 * SSRF: https-only, internal/loopback/link-local/metadata hosts refused,
 * redirects refused (`redirect: "error"`), and the response body size-capped.
 * Accepts an optional custom fetch function for testing or environments
 * where globalThis.fetch may not be available.
 */
export async function resolveDidWeb(
    did: string,
    fetchFn: typeof fetch = globalThis.fetch,
): Promise<DIDResolutionResult> {
    if (!isDidWeb(did)) {
        return { document: null, error: `Not a did:web identifier: ${did}` };
    }

    let url: string;
    try {
        url = didWebToUrl(did);
        assertSafeResolutionUrl(url);
    } catch (e) {
        return {
            document: null,
            error: e instanceof Error ? e.message : String(e),
        };
    }

    let response: Response;
    try {
        response = await fetchFn(url, {
            headers: { Accept: "application/json" },
            // A redirect can send an https/public first hop to an internal
            // second hop that never passes assertSafeResolutionUrl. Refuse
            // redirects outright rather than re-checking each hop.
            redirect: "error",
        });
    } catch (e) {
        return {
            document: null,
            error: `Failed to fetch DID Document: ${e instanceof Error ? e.message : String(e)}`,
        };
    }

    if (!response.ok) {
        return {
            document: null,
            error: `HTTP ${response.status} fetching ${url}`,
        };
    }

    let body: unknown;
    try {
        body = JSON.parse(await readCappedText(response));
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("size cap")) {
            return { document: null, error: msg };
        }
        return { document: null, error: "DID Document is not valid JSON" };
    }

    const validationError = validateDidDocument(body, did);
    if (validationError) {
        return { document: null, error: validationError };
    }

    return { document: body as DIDDocument, error: null };
}

// ── Ethereum Address Extraction ─────────────────────────────────────────────

/**
 * Extract Ethereum addresses from a DID Document's verification methods.
 *
 * Looks for `EcdsaSecp256k1RecoveryMethod2020` verification methods
 * with `blockchainAccountId` in CAIP-10 format: `eip155:<chainId>:<address>`.
 *
 * Returns an array of { address, chainId } tuples.
 */
export function extractEthereumAddresses(
    doc: DIDDocument,
): Array<{ address: string; chainId: number }> {
    if (!doc.verificationMethod) return [];

    const results: Array<{ address: string; chainId: number }> = [];

    for (const vm of doc.verificationMethod) {
        if (
            vm.type === "EcdsaSecp256k1RecoveryMethod2020" &&
            vm.blockchainAccountId
        ) {
            const match = vm.blockchainAccountId.match(
                /^eip155:(\d+):(0x[0-9a-fA-F]{40})$/,
            );
            if (match) {
                results.push({
                    address: match[2].toLowerCase(),
                    chainId: parseInt(match[1], 10),
                });
            }
        }
    }

    return results;
}

/**
 * Check whether a DID Document contains a verification method
 * that matches a given Ethereum address (case-insensitive).
 * Optionally filter by chain ID.
 */
export function didDocumentMatchesAddress(
    doc: DIDDocument,
    address: string,
    chainId?: number,
): boolean {
    const entries = extractEthereumAddresses(doc);
    const normalizedAddress = address.toLowerCase();
    return entries.some(
        (e) =>
            e.address === normalizedAddress &&
            (chainId === undefined || e.chainId === chainId),
    );
}

// ── Service Endpoint Extraction ─────────────────────────────────────────────

/**
 * Extract service endpoints from a DID Document, optionally filtered by `type`.
 *
 * The counterpart to {@link extractEthereumAddresses}: that reads the wallet a
 * DID binds; this reads WHERE to reach the agent behind it. A seller/agent
 * publishes a coordination endpoint as a `service` entry (e.g.
 * `type: "MCPEndpoint" | "A2AEndpoint"`, see AI_AGENT_COORDINATION.md); a buyer
 * resolves the DID, checks the wallet binding is consistent with
 * {@link didDocumentMatchesAddress}, then routes an offer to the endpoint this
 * returns. No Figaro-specific `type` is minted — the caller picks whichever
 * transport it speaks by passing that endpoint `type`.
 *
 * @example
 * ```ts
 * const { document } = await resolveDidWeb("did:web:agent-42.example.com");
 * const [mcp] = document ? extractServiceEndpoints(document, "MCPEndpoint") : [];
 * // → { id, type: "MCPEndpoint", serviceEndpoint: "https://agent-42.example.com/mcp" }
 * ```
 */
export function extractServiceEndpoints(
    doc: DIDDocument,
    type?: string,
): DIDService[] {
    if (!doc.service) return [];
    return type ? doc.service.filter((s) => s.type === type) : doc.service;
}

// ── DID Document Builder ────────────────────────────────────────────────────

/**
 * Build a minimal DID Document for a Figaro seller.
 *
 * This is a convenience function for sellers who want to self-host
 * their DID Document. The document uses `EcdsaSecp256k1RecoveryMethod2020`
 * with the seller's Ethereum address as the verification method.
 */
export function buildSellerDidDocument(
    did: string,
    ethereumAddress: string,
    chainId: number,
    services?: Array<{ id: string; type: string; serviceEndpoint: string }>,
): DIDDocument {
    const doc: DIDDocument = {
        "@context": [
            "https://www.w3.org/ns/did/v1",
            "https://w3id.org/security/suites/secp256k1recovery-2020/v2",
        ],
        id: did,
        verificationMethod: [
            {
                id: `${did}#controller`,
                type: "EcdsaSecp256k1RecoveryMethod2020",
                controller: did,
                blockchainAccountId: `eip155:${chainId}:${ethereumAddress}`,
            },
        ],
        authentication: [`${did}#controller`],
        assertionMethod: [`${did}#controller`],
    };

    if (services && services.length > 0) {
        doc.service = services;
    }

    return doc;
}

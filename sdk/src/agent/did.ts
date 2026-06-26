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
 *   6. Fetch via HTTPS.
 *   7. Verify the document's `id` matches the DID.
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

    // If expected DID is provided, verify match (spec §2.5.2 step 7)
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

    return null;
}

// ── did:web Resolution ──────────────────────────────────────────────────────

/**
 * Resolve a did:web identifier to its DID Document.
 *
 * Uses the standard did:web resolution algorithm (§2.5.2).
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
        body = await response.json();
    } catch {
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

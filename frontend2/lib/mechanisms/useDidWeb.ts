/**
 * lib/mechanisms/useDidWeb.ts
 *
 * React hooks for W3C did:web resolution and verification.
 * Wraps the SDK's did:web extension for frontend consumption.
 */
import { useState, useEffect } from "react";
import { useChainId } from "wagmi";
import { safeJsonFromResponse } from "@/lib/shared/safeJson";

// ── SDK Types (inline to avoid ESM/CJS import issues with SDK) ──────────────

/** A single verification method within a DID Document. */
export interface VerificationMethod {
    id: string;
    type: string;
    controller: string;
    publicKeyJwk?: Record<string, unknown>;
    publicKeyMultibase?: string;
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
    "@context": string | string[] | Array<string | Record<string, unknown>>;
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

// ── did:web Resolution Logic ────────────────────────────────────────────────

const DID_WEB_PREFIX = "did:web:";

/** Validate that a string is a well-formed did:web identifier. */
export function isDidWeb(did: string): boolean {
    if (!did.startsWith(DID_WEB_PREFIX)) return false;
    const identifier = did.slice(DID_WEB_PREFIX.length);
    return identifier.length > 0 && !identifier.startsWith(":");
}

/**
 * Convert a did:web identifier to its HTTPS resolution URL.
 *
 * did:web:example.com             → https://example.com/.well-known/did.json
 * did:web:example.com:user:alice  → https://example.com/user/alice/did.json
 * did:web:example.com%3A3000      → https://example.com:3000/.well-known/did.json
 */
export function didWebToUrl(did: string): string {
    if (!did.startsWith(DID_WEB_PREFIX)) {
        throw new Error(`Not a did:web identifier: ${did}`);
    }
    const identifier = did.slice(DID_WEB_PREFIX.length);
    if (!identifier) throw new Error("Empty did:web identifier");

    const parts = identifier.split(":");
    const domain = decodeURIComponent(parts[0]);
    const pathSegments = parts.slice(1);

    if (pathSegments.length === 0) {
        return `https://${domain}/.well-known/did.json`;
    }
    const path = pathSegments.map(decodeURIComponent).join("/");
    return `https://${domain}/${path}/did.json`;
}

/** Basic structural validation of a DID Document. */
function validateDidDocument(doc: unknown, expectedDid?: string): string | null {
    if (!doc || typeof doc !== "object") return "DID Document must be a non-null object";
    const d = doc as Record<string, unknown>;
    if (typeof d.id !== "string" || !d.id) return "DID Document missing required 'id' field";
    if (expectedDid && d.id !== expectedDid) return `DID Document id '${d.id}' does not match expected '${expectedDid}'`;
    if (!d["@context"]) return "DID Document missing required '@context' field";
    return null;
}

/** Resolve a did:web identifier to its DID Document. */
async function resolveDidWeb(did: string): Promise<DIDResolutionResult> {
    if (!isDidWeb(did)) return { document: null, error: `Not a did:web identifier: ${did}` };

    let url: string;
    try { url = didWebToUrl(did); } catch (e) {
        return { document: null, error: e instanceof Error ? e.message : String(e) };
    }

    let response: Response;
    try {
        response = await fetch(url, { headers: { Accept: "application/json" } });
    } catch (e) {
        return { document: null, error: `Failed to fetch DID Document: ${e instanceof Error ? e.message : String(e)}` };
    }

    if (!response.ok) return { document: null, error: `HTTP ${response.status} fetching ${url}` };

    const body = await safeJsonFromResponse<unknown>(response);
    if (body === null) {
        return { document: null, error: "DID Document is not valid JSON" };
    }

    const validationError = validateDidDocument(body, did);
    if (validationError) return { document: null, error: validationError };

    return { document: body as DIDDocument, error: null };
}

/**
 * Extract Ethereum addresses from a DID Document's verification methods.
 * Looks for EcdsaSecp256k1RecoveryMethod2020 with CAIP-10 blockchainAccountId.
 */
export function extractEthereumAddresses(
    doc: DIDDocument,
): Array<{ address: string; chainId: number }> {
    if (!doc.verificationMethod) return [];
    const results: Array<{ address: string; chainId: number }> = [];
    for (const vm of doc.verificationMethod) {
        if (vm.type === "EcdsaSecp256k1RecoveryMethod2020" && vm.blockchainAccountId) {
            const match = vm.blockchainAccountId.match(/^eip155:(\d+):(0x[0-9a-fA-F]{40})$/);
            if (match) results.push({ address: match[2].toLowerCase(), chainId: parseInt(match[1], 10) });
        }
    }
    return results;
}

// ── React Hooks ─────────────────────────────────────────────────────────────

/**
 * Resolve a did:web identifier to its DID Document.
 * Returns { document, error, isLoading }.
 */
export function useDidDocument(did: string | undefined) {
    const [document, setDocument] = useState<DIDDocument | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!did || !isDidWeb(did)) {
            setDocument(null);
            setError(did ? `Not a did:web identifier: ${did}` : null);
            return;
        }

        let cancelled = false;
        setIsLoading(true);
        setError(null);

        resolveDidWeb(did).then((result) => {
            if (cancelled) return;
            setDocument(result.document);
            setError(result.error);
            setIsLoading(false);
        }).catch((e) => {
            if (cancelled) return;
            setError(e instanceof Error ? e.message : String(e));
            setIsLoading(false);
        });

        return () => { cancelled = true; };
    }, [did]);

    return { document, error, isLoading };
}

/**
 * Resolve a did:web identifier and verify it contains a verification method
 * matching the given Ethereum address on the current chain.
 *
 * Returns { document, verified, error, isLoading }.
 */
export function useDidVerification(
    did: string | undefined,
    address: string | undefined,
) {
    const chainId = useChainId();
    const { document, error, isLoading } = useDidDocument(did);
    const [verified, setVerified] = useState(false);

    useEffect(() => {
        if (!document || !address) {
            setVerified(false);
            return;
        }

        const entries = extractEthereumAddresses(document);
        const normalizedAddress = address.toLowerCase();
        const match = entries.some(
            (e) => e.address === normalizedAddress && e.chainId === chainId,
        );
        setVerified(match);
    }, [document, address, chainId]);

    return { document, verified, error, isLoading };
}

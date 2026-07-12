import { describe, it, expect, vi } from "vitest";
import {
    isDidWeb,
    didWebToUrl,
    validateDidDocument,
    resolveDidWeb,
    assertSafeResolutionUrl,
    extractEthereumAddresses,
    extractServiceEndpoints,
    didDocumentMatchesAddress,
    buildSellerDidDocument,
} from "../src/agent/did.js";
import type { DIDDocument } from "../src/agent/did.js";

// ── isDidWeb ────────────────────────────────────────────────────────────────

describe("isDidWeb", () => {
    it("accepts valid did:web identifiers", () => {
        expect(isDidWeb("did:web:example.com")).toBe(true);
        expect(isDidWeb("did:web:example.com:user:alice")).toBe(true);
        expect(isDidWeb("did:web:example.com%3A3000")).toBe(true);
        expect(isDidWeb("did:web:w3c-ccg.github.io")).toBe(true);
    });

    it("rejects non-did:web strings", () => {
        expect(isDidWeb("did:ethr:0x1234")).toBe(false);
        expect(isDidWeb("did:key:z6Mk...")).toBe(false);
        expect(isDidWeb("not-a-did")).toBe(false);
        expect(isDidWeb("")).toBe(false);
        expect(isDidWeb("did:web:")).toBe(false);
    });

    it("rejects identifier starting with colon", () => {
        expect(isDidWeb("did:web::foo")).toBe(false);
    });
});

// ── didWebToUrl ─────────────────────────────────────────────────────────────

describe("didWebToUrl", () => {
    it("resolves domain-only to /.well-known/did.json", () => {
        expect(didWebToUrl("did:web:example.com")).toBe(
            "https://example.com/.well-known/did.json",
        );
    });

    it("resolves domain with path segments", () => {
        expect(didWebToUrl("did:web:example.com:user:alice")).toBe(
            "https://example.com/user/alice/did.json",
        );
    });

    it("resolves domain with single path segment", () => {
        expect(didWebToUrl("did:web:example.com:dids")).toBe(
            "https://example.com/dids/did.json",
        );
    });

    it("decodes percent-encoded port", () => {
        expect(didWebToUrl("did:web:example.com%3A3000")).toBe(
            "https://example.com:3000/.well-known/did.json",
        );
    });

    it("decodes port with path", () => {
        expect(didWebToUrl("did:web:example.com%3A3000:user:alice")).toBe(
            "https://example.com:3000/user/alice/did.json",
        );
    });

    it("handles github.io domain", () => {
        expect(didWebToUrl("did:web:w3c-ccg.github.io")).toBe(
            "https://w3c-ccg.github.io/.well-known/did.json",
        );
    });

    it("throws for non-did:web identifier", () => {
        expect(() => didWebToUrl("did:ethr:0x1234")).toThrow(
            "Not a did:web identifier",
        );
    });

    it("throws for empty identifier", () => {
        expect(() => didWebToUrl("did:web:")).toThrow(
            "Empty did:web identifier",
        );
    });
});

// ── validateDidDocument ─────────────────────────────────────────────────────

describe("validateDidDocument", () => {
    const validDoc: DIDDocument = {
        "@context": "https://www.w3.org/ns/did/v1",
        id: "did:web:example.com",
        verificationMethod: [
            {
                id: "did:web:example.com#key-0",
                type: "EcdsaSecp256k1RecoveryMethod2020",
                controller: "did:web:example.com",
                blockchainAccountId:
                    "eip155:1:0x89a932207c485f85226d86f7cd486a89a24fcc12",
            },
        ],
    };

    it("accepts a valid DID Document", () => {
        expect(validateDidDocument(validDoc)).toBeNull();
    });

    it("accepts with matching expected DID", () => {
        expect(
            validateDidDocument(validDoc, "did:web:example.com"),
        ).toBeNull();
    });

    it("rejects null", () => {
        expect(validateDidDocument(null)).toBe(
            "DID Document must be a non-null object",
        );
    });

    it("rejects non-object", () => {
        expect(validateDidDocument("string")).toBe(
            "DID Document must be a non-null object",
        );
    });

    it("rejects missing id", () => {
        expect(
            validateDidDocument({ "@context": "https://www.w3.org/ns/did/v1" }),
        ).toBe("DID Document missing required 'id' field");
    });

    it("rejects missing @context", () => {
        expect(validateDidDocument({ id: "did:web:example.com" })).toBe(
            "DID Document missing required '@context' field",
        );
    });

    it("rejects id mismatch", () => {
        const result = validateDidDocument(validDoc, "did:web:other.com");
        expect(result).toContain("does not match expected");
    });

    it("rejects non-array verificationMethod", () => {
        expect(
            validateDidDocument({
                ...validDoc,
                verificationMethod: "not-an-array",
            }),
        ).toBe("'verificationMethod' must be an array");
    });

    it("rejects verificationMethod entry missing required fields", () => {
        expect(
            validateDidDocument({
                ...validDoc,
                verificationMethod: [{ id: "x" }],
            }),
        ).toBe(
            "Each verificationMethod must have id, type, and controller",
        );
    });

    it("accepts a well-formed service entry", () => {
        expect(
            validateDidDocument({
                ...validDoc,
                service: [{
                    id: "did:web:example.com#mcp",
                    type: "MCPEndpoint",
                    serviceEndpoint: "https://example.com/mcp",
                }],
            }),
        ).toBeNull();
    });

    it("rejects non-array service", () => {
        expect(
            validateDidDocument({ ...validDoc, service: "not-an-array" }),
        ).toBe("'service' must be an array");
    });

    it("rejects service entry missing required fields", () => {
        expect(
            validateDidDocument({
                ...validDoc,
                service: [{ id: "did:web:example.com#mcp", type: "MCPEndpoint" }],
            }),
        ).toBe("Each service must have id, type, and serviceEndpoint");
    });
});

// ── extractServiceEndpoints ─────────────────────────────────────────────────

describe("extractServiceEndpoints", () => {
    const doc: DIDDocument = {
        "@context": "https://www.w3.org/ns/did/v1",
        id: "did:web:agent-42.example.com",
        service: [
            { id: "#mcp", type: "MCPEndpoint", serviceEndpoint: "https://agent-42.example.com/mcp" },
            { id: "#a2a", type: "A2AEndpoint", serviceEndpoint: "https://agent-42.example.com/a2a" },
        ],
    };

    it("returns all service endpoints when no type filter is given", () => {
        expect(extractServiceEndpoints(doc)).toHaveLength(2);
    });

    it("filters by endpoint type", () => {
        const mcp = extractServiceEndpoints(doc, "MCPEndpoint");
        expect(mcp).toHaveLength(1);
        expect(mcp[0].serviceEndpoint).toBe("https://agent-42.example.com/mcp");
    });

    it("returns empty for an unknown type", () => {
        expect(extractServiceEndpoints(doc, "RESTEndpoint")).toHaveLength(0);
    });

    it("returns empty when the document has no service array", () => {
        expect(extractServiceEndpoints({ ...doc, service: undefined })).toHaveLength(0);
    });

    it("round-trips a coordination endpoint built by buildSellerDidDocument", () => {
        const built = buildSellerDidDocument(
            "did:web:agent-42.example.com",
            "0x89a932207c485f85226d86f7cd486a89a24fcc12",
            1,
            [{ id: "did:web:agent-42.example.com#mcp", type: "MCPEndpoint", serviceEndpoint: "https://agent-42.example.com/mcp" }],
        );
        const [ep] = extractServiceEndpoints(built, "MCPEndpoint");
        expect(ep.serviceEndpoint).toBe("https://agent-42.example.com/mcp");
    });
});

// ── extractEthereumAddresses ────────────────────────────────────────────────

describe("extractEthereumAddresses", () => {
    it("extracts CAIP-10 Ethereum address", () => {
        const doc: DIDDocument = {
            "@context": "https://www.w3.org/ns/did/v1",
            id: "did:web:example.com",
            verificationMethod: [
                {
                    id: "did:web:example.com#key-0",
                    type: "EcdsaSecp256k1RecoveryMethod2020",
                    controller: "did:web:example.com",
                    blockchainAccountId:
                        "eip155:1:0x89a932207c485f85226d86f7cd486a89a24fcc12",
                },
            ],
        };

        const result = extractEthereumAddresses(doc);
        expect(result).toHaveLength(1);
        expect(result[0].address).toBe(
            "0x89a932207c485f85226d86f7cd486a89a24fcc12",
        );
        expect(result[0].chainId).toBe(1);
    });

    it("extracts multiple addresses", () => {
        const doc: DIDDocument = {
            "@context": "https://www.w3.org/ns/did/v1",
            id: "did:web:example.com",
            verificationMethod: [
                {
                    id: "did:web:example.com#mainnet",
                    type: "EcdsaSecp256k1RecoveryMethod2020",
                    controller: "did:web:example.com",
                    blockchainAccountId:
                        "eip155:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                },
                {
                    id: "did:web:example.com#local",
                    type: "EcdsaSecp256k1RecoveryMethod2020",
                    controller: "did:web:example.com",
                    blockchainAccountId:
                        "eip155:31337:0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                },
            ],
        };

        const result = extractEthereumAddresses(doc);
        expect(result).toHaveLength(2);
        expect(result[0].chainId).toBe(1);
        expect(result[1].chainId).toBe(31337);
    });

    it("ignores non-secp256k1 verification methods", () => {
        const doc: DIDDocument = {
            "@context": "https://www.w3.org/ns/did/v1",
            id: "did:web:example.com",
            verificationMethod: [
                {
                    id: "did:web:example.com#key-0",
                    type: "JsonWebKey2020",
                    controller: "did:web:example.com",
                    publicKeyJwk: { kty: "OKP", crv: "Ed25519", x: "abc" },
                },
            ],
        };

        expect(extractEthereumAddresses(doc)).toHaveLength(0);
    });

    it("returns empty array when no verificationMethod", () => {
        const doc: DIDDocument = {
            "@context": "https://www.w3.org/ns/did/v1",
            id: "did:web:example.com",
        };

        expect(extractEthereumAddresses(doc)).toHaveLength(0);
    });

    it("ignores malformed blockchainAccountId", () => {
        const doc: DIDDocument = {
            "@context": "https://www.w3.org/ns/did/v1",
            id: "did:web:example.com",
            verificationMethod: [
                {
                    id: "did:web:example.com#key-0",
                    type: "EcdsaSecp256k1RecoveryMethod2020",
                    controller: "did:web:example.com",
                    blockchainAccountId: "not-a-caip10-id",
                },
            ],
        };

        expect(extractEthereumAddresses(doc)).toHaveLength(0);
    });
});

// ── didDocumentMatchesAddress ────────────────────────────────────────────────

describe("didDocumentMatchesAddress", () => {
    const doc: DIDDocument = {
        "@context": "https://www.w3.org/ns/did/v1",
        id: "did:web:example.com",
        verificationMethod: [
            {
                id: "did:web:example.com#controller",
                type: "EcdsaSecp256k1RecoveryMethod2020",
                controller: "did:web:example.com",
                blockchainAccountId:
                    "eip155:31337:0x89a932207c485f85226d86f7cd486a89a24fcc12",
            },
        ],
    };

    it("matches case-insensitively", () => {
        expect(
            didDocumentMatchesAddress(
                doc,
                "0x89A932207C485F85226D86F7CD486A89A24FCC12",
            ),
        ).toBe(true);
    });

    it("matches with correct chain ID", () => {
        expect(
            didDocumentMatchesAddress(
                doc,
                "0x89a932207c485f85226d86f7cd486a89a24fcc12",
                31337,
            ),
        ).toBe(true);
    });

    it("rejects wrong chain ID", () => {
        expect(
            didDocumentMatchesAddress(
                doc,
                "0x89a932207c485f85226d86f7cd486a89a24fcc12",
                1,
            ),
        ).toBe(false);
    });

    it("rejects wrong address", () => {
        expect(
            didDocumentMatchesAddress(
                doc,
                "0x0000000000000000000000000000000000000000",
            ),
        ).toBe(false);
    });
});

// ── resolveDidWeb ───────────────────────────────────────────────────────────

describe("resolveDidWeb", () => {
    const validDoc: DIDDocument = {
        "@context": "https://www.w3.org/ns/did/v1",
        id: "did:web:example.com",
        verificationMethod: [
            {
                id: "did:web:example.com#controller",
                type: "EcdsaSecp256k1RecoveryMethod2020",
                controller: "did:web:example.com",
                blockchainAccountId:
                    "eip155:1:0x89a932207c485f85226d86f7cd486a89a24fcc12",
            },
        ],
    };

    it("resolves a valid DID Document", async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(validDoc),
        });

        const result = await resolveDidWeb("did:web:example.com", mockFetch);
        expect(result.error).toBeNull();
        expect(result.document).toEqual(validDoc);
        expect(mockFetch).toHaveBeenCalledWith(
            "https://example.com/.well-known/did.json",
            { headers: { Accept: "application/json" }, redirect: "error" },
        );
    });

    it("resolves DID with path", async () => {
        const pathDoc = { ...validDoc, id: "did:web:example.com:sellers:alice" };
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(pathDoc),
        });

        const result = await resolveDidWeb(
            "did:web:example.com:sellers:alice",
            mockFetch,
        );
        expect(result.error).toBeNull();
        expect(mockFetch).toHaveBeenCalledWith(
            "https://example.com/sellers/alice/did.json",
            expect.anything(),
        );
    });

    it("returns error for non-did:web", async () => {
        const result = await resolveDidWeb("did:ethr:0x1234");
        expect(result.document).toBeNull();
        expect(result.error).toContain("Not a did:web");
    });

    it("returns error on network failure", async () => {
        const mockFetch = vi
            .fn()
            .mockRejectedValue(new Error("Network unreachable"));

        const result = await resolveDidWeb("did:web:example.com", mockFetch);
        expect(result.document).toBeNull();
        expect(result.error).toContain("Failed to fetch");
    });

    it("returns error on HTTP 404", async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
        });

        const result = await resolveDidWeb("did:web:example.com", mockFetch);
        expect(result.document).toBeNull();
        expect(result.error).toContain("HTTP 404");
    });

    it("returns error on invalid JSON", async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.reject(new Error("Unexpected token")),
        });

        const result = await resolveDidWeb("did:web:example.com", mockFetch);
        expect(result.document).toBeNull();
        expect(result.error).toContain("not valid JSON");
    });

    it("returns error when document id does not match DID", async () => {
        const wrongIdDoc = { ...validDoc, id: "did:web:other.com" };
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(wrongIdDoc),
        });

        const result = await resolveDidWeb("did:web:example.com", mockFetch);
        expect(result.document).toBeNull();
        expect(result.error).toContain("does not match");
    });
});

// ── buildSellerDidDocument ────────────────────────────────────────────────

describe("buildSellerDidDocument", () => {
    it("builds a minimal DID Document", () => {
        const doc = buildSellerDidDocument(
            "did:web:seller.example.com",
            "0x89a932207c485f85226d86f7cd486a89a24fcc12",
            31337,
        );

        expect(doc.id).toBe("did:web:seller.example.com");
        expect(doc["@context"]).toContain("https://www.w3.org/ns/did/v1");
        expect(doc.verificationMethod).toHaveLength(1);
        expect(doc.verificationMethod![0].blockchainAccountId).toBe(
            "eip155:31337:0x89a932207c485f85226d86f7cd486a89a24fcc12",
        );
        expect(doc.authentication).toEqual([
            "did:web:seller.example.com#controller",
        ]);
    });

    it("includes service endpoints when provided", () => {
        const doc = buildSellerDidDocument(
            "did:web:seller.example.com",
            "0x89a932207c485f85226d86f7cd486a89a24fcc12",
            1,
            [
                {
                    id: "did:web:seller.example.com#mcp",
                    type: "MCPEndpoint",
                    serviceEndpoint: "https://seller.example.com/mcp",
                },
            ],
        );

        expect(doc.service).toHaveLength(1);
        expect(doc.service![0].type).toBe("MCPEndpoint");
    });

    it("omits service array when no services provided", () => {
        const doc = buildSellerDidDocument(
            "did:web:example.com",
            "0x0000000000000000000000000000000000000001",
            1,
        );

        expect(doc.service).toBeUndefined();
    });

    it("produces a document that passes validation", () => {
        const doc = buildSellerDidDocument(
            "did:web:example.com",
            "0x0000000000000000000000000000000000000001",
            1,
        );

        expect(validateDidDocument(doc, "did:web:example.com")).toBeNull();
    });
});

// ── assertSafeResolutionUrl (SSRF guard) ─────────────────────────────────────

describe("assertSafeResolutionUrl", () => {
    it("accepts a public https host", () => {
        expect(() =>
            assertSafeResolutionUrl("https://example.com/.well-known/did.json"),
        ).not.toThrow();
        // A public IP literal is fine too.
        expect(() => assertSafeResolutionUrl("https://93.184.216.34/x")).not.toThrow();
    });

    it("rejects non-https schemes", () => {
        expect(() => assertSafeResolutionUrl("http://example.com/x")).toThrow(
            /https-only/,
        );
        expect(() => assertSafeResolutionUrl("ftp://example.com/x")).toThrow(
            /https-only/,
        );
    });

    it("rejects loopback (localhost + 127.0.0.0/8 + ::1)", () => {
        for (const url of [
            "https://localhost/x",
            "https://sub.localhost/x",
            "https://127.0.0.1/x",
            "https://127.9.9.9/x",
            "https://[::1]/x",
        ]) {
            expect(() => assertSafeResolutionUrl(url), url).toThrow(/internal host/);
        }
    });

    it("rejects RFC1918 private ranges", () => {
        for (const url of [
            "https://10.0.0.1/x",
            "https://172.16.5.5/x",
            "https://172.31.0.1/x",
            "https://192.168.1.1/x",
        ]) {
            expect(() => assertSafeResolutionUrl(url), url).toThrow(/internal host/);
        }
    });

    it("allows the 172.16/12 boundaries that are NOT private", () => {
        expect(() => assertSafeResolutionUrl("https://172.15.0.1/x")).not.toThrow();
        expect(() => assertSafeResolutionUrl("https://172.32.0.1/x")).not.toThrow();
    });

    it("rejects CGNAT 100.64/10 (hosts e.g. Alibaba metadata) but allows its boundaries", () => {
        for (const url of ["https://100.100.100.200/x", "https://100.64.0.1/x", "https://100.127.255.254/x"]) {
            expect(() => assertSafeResolutionUrl(url), url).toThrow(/internal host/);
        }
        expect(() => assertSafeResolutionUrl("https://100.63.255.254/x")).not.toThrow();
        expect(() => assertSafeResolutionUrl("https://100.128.0.1/x")).not.toThrow();
    });

    it("rejects link-local (169.254/16 + fe80::/10)", () => {
        for (const url of ["https://169.254.1.1/x", "https://[fe80::1]/x"]) {
            expect(() => assertSafeResolutionUrl(url), url).toThrow(/internal host/);
        }
    });

    it("rejects cloud metadata endpoints", () => {
        expect(() => assertSafeResolutionUrl("https://169.254.169.254/x")).toThrow(
            /internal host/,
        );
        expect(() =>
            assertSafeResolutionUrl("https://metadata.google.internal/x"),
        ).toThrow(/internal host/);
    });

    it("rejects .internal and .local suffixes", () => {
        expect(() => assertSafeResolutionUrl("https://foo.internal/x")).toThrow(
            /internal host/,
        );
        expect(() => assertSafeResolutionUrl("https://printer.local/x")).toThrow(
            /internal host/,
        );
    });

    it("rejects IPv4-mapped / unique-local IPv6 forms of blocked hosts", () => {
        for (const url of [
            "https://[::ffff:127.0.0.1]/x", // mapped loopback
            "https://[::ffff:169.254.169.254]/x", // mapped metadata
            "https://[::ffff:10.0.0.1]/x", // mapped RFC1918
            "https://[fc00::1]/x", // unique-local
        ]) {
            expect(() => assertSafeResolutionUrl(url), url).toThrow(/internal host/);
        }
    });
});

// ── resolveDidWeb — SSRF hardening ───────────────────────────────────────────

describe("resolveDidWeb — SSRF hardening", () => {
    const validDoc: DIDDocument = {
        "@context": "https://www.w3.org/ns/did/v1",
        id: "did:web:example.com",
        verificationMethod: [
            {
                id: "did:web:example.com#controller",
                type: "EcdsaSecp256k1RecoveryMethod2020",
                controller: "did:web:example.com",
                blockchainAccountId:
                    "eip155:1:0x89a932207c485f85226d86f7cd486a89a24fcc12",
            },
        ],
    };

    it("refuses internal hosts WITHOUT making a request", async () => {
        for (const did of [
            "did:web:localhost",
            "did:web:127.0.0.1",
            "did:web:10.0.0.5",
            "did:web:192.168.1.1",
            "did:web:169.254.169.254",
            "did:web:metadata.google.internal",
            "did:web:vault.internal",
            // percent-encoded IPv6 loopback (did:web encodes ":" as %3A)
            "did:web:%5B%3A%3A1%5D",
        ]) {
            const mockFetch = vi.fn();
            const result = await resolveDidWeb(did, mockFetch);
            expect(result.document, did).toBeNull();
            expect(result.error, did).toMatch(/internal host|https-only|Malformed/);
            expect(mockFetch, did).not.toHaveBeenCalled();
        }
    });

    it("passes redirect: \"error\" so redirects are refused by fetch", async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            headers: new Headers(),
            json: () => Promise.resolve(validDoc),
        });
        await resolveDidWeb("did:web:example.com", mockFetch);
        expect(mockFetch).toHaveBeenCalledWith(
            "https://example.com/.well-known/did.json",
            expect.objectContaining({ redirect: "error" }),
        );
    });

    it("surfaces a redirect rejection as a fetch failure", async () => {
        // fetch({ redirect: "error" }) rejects the promise on any 3xx.
        const mockFetch = vi
            .fn()
            .mockRejectedValue(new Error("unexpected redirect"));
        const result = await resolveDidWeb("did:web:example.com", mockFetch);
        expect(result.document).toBeNull();
        expect(result.error).toContain("Failed to fetch");
    });

    it("fast-rejects an oversize Content-Length", async () => {
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: new Headers({ "content-length": String((1 << 20) + 1) }),
            json: () => Promise.resolve(validDoc),
        });
        const result = await resolveDidWeb("did:web:example.com", mockFetch);
        expect(result.document).toBeNull();
        expect(result.error).toContain("size cap");
    });

    it("aborts a streamed body that exceeds the size cap", async () => {
        const cancel = vi.fn().mockResolvedValue(undefined);
        // Two 700 KiB chunks — the second pushes the total past 1 MiB.
        const sizes = [700 * 1024, 700 * 1024];
        let i = 0;
        const reader = {
            read: async () =>
                i < sizes.length
                    ? { done: false, value: new Uint8Array(sizes[i++]) }
                    : { done: true, value: undefined },
            cancel,
            releaseLock: () => {},
        };
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: new Headers(), // no Content-Length ⇒ must be caught mid-stream
            body: { getReader: () => reader },
        });
        const result = await resolveDidWeb("did:web:example.com", mockFetch);
        expect(result.document).toBeNull();
        expect(result.error).toContain("size cap");
        expect(cancel).toHaveBeenCalled();
    });

    it("parses a valid DID Document delivered as a streamed body", async () => {
        const bytes = new TextEncoder().encode(JSON.stringify(validDoc));
        const mid = Math.floor(bytes.length / 2);
        const chunks = [bytes.slice(0, mid), bytes.slice(mid)];
        let i = 0;
        const reader = {
            read: async () =>
                i < chunks.length
                    ? { done: false, value: chunks[i++] }
                    : { done: true, value: undefined },
            cancel: async () => {},
            releaseLock: () => {},
        };
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: new Headers(),
            body: { getReader: () => reader },
        });
        const result = await resolveDidWeb("did:web:example.com", mockFetch);
        expect(result.error).toBeNull();
        expect(result.document).toEqual(validDoc);
    });
});

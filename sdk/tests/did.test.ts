import { describe, it, expect, vi } from "vitest";
import {
    isDidWeb,
    didWebToUrl,
    validateDidDocument,
    resolveDidWeb,
    extractEthereumAddresses,
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
            { headers: { Accept: "application/json" } },
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

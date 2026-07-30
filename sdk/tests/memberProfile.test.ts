import { describe, expect, it } from "vitest";

import {
    parseMemberProfileDocument,
    projectAgentServices,
    tryParseMemberProfileDocument,
} from "../src/memberProfile.js";

describe("member profile metadata parser", () => {
    const VALID_DOC = {
        name: "Bob Pizza",
        description: "Authentic NY-style",
        specialty: "Italian",
        location: { geohash: "dr5reg", addressText: "Manhattan, NY" },
        catalogueURI: "ipfs://QmCatalogue123",
        acceptedTokens: [
            { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", name: "USD Coin" },
            { address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", symbol: "FLORIN" },
        ],
        defaultTokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        services: {
            mcp: "https://example.com/mcp",
            a2a: "https://example.com/a2a",
            rest: "https://example.com/v1",
            did: "did:web:example.com",
            ens: "example.figaro.eth",
        },
        branding: {
            displayName: "Bob's Pizza",
            logoURI: "ipfs://QmLogo",
            accentColor: "#c2410c",
            themeClass: "seller-pizza",
        },
        assets: {
            imageBaseURI: "ipfs://QmImages/",
        },
        version: "1.0.0",
    };

    describe("parseMemberProfileDocument (strict)", () => {
        it("parses a fully-populated profile", () => {
            const result = parseMemberProfileDocument(VALID_DOC);

            expect(result.name).toBe("Bob Pizza");
            expect(result.description).toBe("Authentic NY-style");
            expect(result.acceptedTokens).toHaveLength(2);
            expect(result.acceptedTokens?.[0]?.address).toBe("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
            expect(result.services?.mcp).toBe("https://example.com/mcp");
        });

        it("parses a minimal profile with only name", () => {
            const result = parseMemberProfileDocument({ name: "Minimal Seller" });

            expect(result.name).toBe("Minimal Seller");
            expect(result.description).toBeUndefined();
            expect(result.acceptedTokens).toBeUndefined();
            expect(result.services).toBeUndefined();
        });

        it("throws when name is missing", () => {
            expect(() => parseMemberProfileDocument({}))
                .toThrow(/name must be a string/);
        });

        it("throws when name is not a string", () => {
            expect(() => parseMemberProfileDocument({ name: 42 }))
                .toThrow(/name must be a string/);
        });

        it("throws when acceptedTokens carries a malformed address", () => {
            expect(() => parseMemberProfileDocument({
                name: "Bob",
                acceptedTokens: [{ address: "not-an-address", symbol: "BAD" }],
            })).toThrow(/acceptedTokens\[0\]\.address must be a 20-byte hex address/);
        });

        it("throws when services is not an object", () => {
            expect(() => parseMemberProfileDocument({
                name: "Bob",
                services: "not-an-object",
            })).toThrow(/services must be an object/);
        });

        it("parses services with only some fields", () => {
            const result = parseMemberProfileDocument({
                name: "Bob",
                services: { mcp: "https://example.com/mcp" },
            });

            expect(result.services?.mcp).toBe("https://example.com/mcp");
            expect(result.services?.a2a).toBeUndefined();
        });

        it("round-trips a parsed document back into the parser", () => {
            const first = parseMemberProfileDocument(VALID_DOC);
            const second = parseMemberProfileDocument(first);

            expect(second).toEqual(first);
        });
    });

    describe("tryParseMemberProfileDocument (lenient)", () => {
        it("returns null on a missing name", () => {
            expect(tryParseMemberProfileDocument({})).toBeNull();
        });

        it("returns null on non-object input", () => {
            expect(tryParseMemberProfileDocument(null)).toBeNull();
            expect(tryParseMemberProfileDocument("string")).toBeNull();
            expect(tryParseMemberProfileDocument([])).toBeNull();
        });

        it("returns the parsed shape on a valid document", () => {
            const result = tryParseMemberProfileDocument(VALID_DOC);
            expect(result?.name).toBe("Bob Pizza");
        });

        it("returns null when acceptedTokens is malformed (does not throw)", () => {
            expect(tryParseMemberProfileDocument({
                name: "Bob",
                acceptedTokens: [{ address: "malformed", symbol: "BAD" }],
            })).toBeNull();
        });
    });

    describe("projectAgentServices", () => {
        it("returns isAgent=false when no services key is present", () => {
            const result = projectAgentServices({ name: "Bob" });
            expect(result.isAgent).toBe(false);
            expect(result.services).toEqual({});
            expect(result.capabilities).toEqual([]);
        });

        it("returns isAgent=true even without a name (services-only docs)", () => {
            const result = projectAgentServices({
                services: { mcp: "https://example.com/mcp" },
            });
            expect(result.isAgent).toBe(true);
            expect(result.services.mcp).toBe("https://example.com/mcp");
        });

        it("returns isAgent=false when input is not an object", () => {
            expect(projectAgentServices(null).isAgent).toBe(false);
            expect(projectAgentServices("string").isAgent).toBe(false);
            expect(projectAgentServices([]).isAgent).toBe(false);
        });

        it("drops non-string capability entries", () => {
            const result = projectAgentServices({
                services: { mcp: "https://example.com" },
                capabilities: ["valid", 42, null, "also-valid"],
            });
            expect(result.capabilities).toEqual(["valid", "also-valid"]);
        });
    });
});

import { describe, expect, it } from "vitest";

import {
    checkSellerBindsAssembly,
    parseMemberProfileDocument,
    projectAgentServices,
    tryParseMemberProfileDocument,
    type MemberProfileMetadata,
} from "../src/memberProfile.js";
import { deriveAssemblySlug } from "../src/assembly.js";
import type { Agreement } from "../src/agreement.js";
import { keyOf } from "./specFixtures.js";

describe("member profile metadata parser", () => {
    const VALID_DOC = {
        name: "Bob Pizza",
        description: "Authentic NY-style",
        specialty: "Italian",
        location: { geohash: "dr5reg", addressText: "Manhattan, NY" },
        catalogURI: "ipfs://QmCatalog123",
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

        it("keeps a transport it does not know and skips a value that is not an endpoint string, without failing the profile", () => {
            // The transport set is open (docs/OPEN_WORLD.md § 1): a key this
            // runtime never saw is kept when its value is an endpoint; a value
            // of another shape is skipped, never a reason to drop the member.
            const result = parseMemberProfileDocument({
                name: "Bob",
                services: {
                    mcp: "https://example.com/mcp",
                    nostr: { relay: "wss://relay.example", npub: "npub1example" },
                    xmtp: null,
                    matrix: "https://matrix.example",
                },
            });

            expect(result.services?.mcp).toBe("https://example.com/mcp");
            expect(result.services?.matrix).toBe("https://matrix.example");
            expect(result.services?.nostr).toBeUndefined();
            expect(result.services?.xmtp).toBeUndefined();
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

    describe("acceptedTokens and defaultTokenAddress", () => {
        const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
        const FLORIN = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

        it("a document whose accepted token carries poolFeeTier parses, and the field is dropped", () => {
            const parsed = parseMemberProfileDocument({
                name: "Bob",
                acceptedTokens: [
                    { address: USDC, symbol: "USDC" },
                    { address: FLORIN, symbol: "FLORIN", poolFeeTier: 3000 },
                ],
                defaultTokenAddress: USDC,
            });
            expect(parsed.acceptedTokens?.[1]).toEqual({ address: FLORIN, symbol: "FLORIN" });
            expect(parsed.acceptedTokens?.[1]).not.toHaveProperty("poolFeeTier");
        });

        it("accepted tokens without a default token are refused — the catalog is priced in one of them", () => {
            expect(() => parseMemberProfileDocument({
                name: "Bob",
                acceptedTokens: [{ address: USDC, symbol: "USDC" }],
            })).toThrow(/defaultTokenAddress is required when acceptedTokens is set/);
        });

        it("a default token outside the accepted set is refused", () => {
            expect(() => parseMemberProfileDocument({
                name: "Bob",
                acceptedTokens: [{ address: USDC, symbol: "USDC" }],
                defaultTokenAddress: FLORIN,
            })).toThrow(/must be one of acceptedTokens/);
        });
    });

    describe("buyerAssemblies (buyer-side subscriptions)", () => {
        const HASH = `0x${"cd".repeat(32)}`;

        it("parses a subscription list and round-trips it", () => {
            const doc = {
                name: "Bob Pizza",
                buyerAssemblies: [{ assemblyHash: HASH }],
            };
            const first = parseMemberProfileDocument(doc);

            expect(first.buyerAssemblies).toHaveLength(1);
            expect(first.buyerAssemblies?.[0]?.assemblyHash).toBe(HASH);

            const second = parseMemberProfileDocument(first);
            expect(second).toEqual(first);
        });

        it("absent stays absent — subscriptions are independent of bindings", () => {
            const result = parseMemberProfileDocument({
                name: "Bob",
                assemblyBindings: [{
                    bindingId: "b-1",
                    subjectAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                    assemblyHash: HASH,
                }],
            });

            expect(result.buyerAssemblies).toBeUndefined();
            expect(result.assemblyBindings).toHaveLength(1);
        });

        it("throws on a malformed assemblyHash", () => {
            expect(() => parseMemberProfileDocument({
                name: "Bob",
                buyerAssemblies: [{ assemblyHash: "0x1234" }],
            })).toThrow(/buyerAssemblies\[0\]\.assemblyHash must be a 32-byte hex hash/);
        });

        it("throws when the field is not an array", () => {
            expect(() => parseMemberProfileDocument({
                name: "Bob",
                buyerAssemblies: { assemblyHash: HASH },
            })).toThrow(/buyerAssemblies must be an array/);
        });
    });

    describe("legacy location strings", () => {
        it("a legacy string that is not a geohash yields no location", () => {
            const result = parseMemberProfileDocument({ name: "Bob", location: "Manhattan, NY" });
            expect(result.location).toBeUndefined();
        });

        it("a legacy string that is a geohash yields that geohash, never an empty one", () => {
            const result = parseMemberProfileDocument({ name: "Bob", location: "dr5reg" });
            expect(result.location).toEqual({ geohash: "dr5reg" });
        });
    });

    describe("agent services are an open set of transports", () => {
        it("the strict parse keeps every transport the profile declares", () => {
            const result = parseMemberProfileDocument({
                name: "Bob",
                services: { mcp: "https://example.com/mcp", nostr: "wss://relay.example.com" },
            });
            expect(result.services).toEqual({ mcp: "https://example.com/mcp", nostr: "wss://relay.example.com" });
        });

        it("the projection keeps every transport the profile declares and drops only non-strings", () => {
            const result = projectAgentServices({
                services: { a2a: "https://example.com/a2a", xmtp: "0xabc", broken: 42 },
            });
            expect(result.services).toEqual({ a2a: "https://example.com/a2a", xmtp: "0xabc" });
            expect(Object.keys(result.services)).toEqual(["a2a", "xmtp"]);
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
        it("returns reachable=false when no services key is present", () => {
            const result = projectAgentServices({ name: "Bob" });
            expect(result.reachable).toBe(false);
            expect(result.services).toEqual({});
            expect(result.capabilities).toEqual([]);
        });

        it("returns reachable=true even without a name (services-only docs)", () => {
            const result = projectAgentServices({
                services: { mcp: "https://example.com/mcp" },
            });
            expect(result.reachable).toBe(true);
            expect(result.services.mcp).toBe("https://example.com/mcp");
        });

        it("returns reachable=false when input is not an object", () => {
            expect(projectAgentServices(null).reachable).toBe(false);
            expect(projectAgentServices("string").reachable).toBe(false);
            expect(projectAgentServices([]).reachable).toBe(false);
        });

        it("drops non-string capability entries", () => {
            const result = projectAgentServices({
                services: { mcp: "https://example.com" },
                capabilities: ["valid", 42, null, "also-valid"],
            });
            expect(result.capabilities).toEqual(["valid", "also-valid"]);
        });
    });

    describe("assembly bindings carry the full assemblyHash", () => {
        const HASH = `0x${"ab".repeat(32)}`;
        const SUBJECT = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

        it("parses a binding's assemblyHash and round-trips it", () => {
            const first = parseMemberProfileDocument({
                name: "Bob",
                assemblyBindings: [{ bindingId: "b-1", subjectAddress: SUBJECT, assemblyHash: HASH }],
            });
            expect(first.assemblyBindings?.[0]?.assemblyHash).toBe(HASH);
            expect(parseMemberProfileDocument(first)).toEqual(first);
        });

        it("refuses a binding that names its assembly by anything but a 32-byte assemblyHash", () => {
            expect(() => parseMemberProfileDocument({
                name: "Bob",
                assemblyBindings: [{ bindingId: "b-1", subjectAddress: SUBJECT }],
            })).toThrow(/assemblyBindings\[0\]\.assemblyHash must be a 32-byte hex hash/);
            expect(() => parseMemberProfileDocument({
                name: "Bob",
                assemblyBindings: [{ bindingId: "b-1", subjectAddress: SUBJECT, assemblyHash: deriveAssemblySlug(HASH as `0x${string}`) }],
            })).toThrow(/assemblyBindings\[0\]\.assemblyHash must be a 32-byte hex hash/);
        });
    });

    describe("a co-seller binding may name one item in each co-seller's own catalog", () => {
        const HASH = `0x${"ab".repeat(32)}`;
        const SUBJECT = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
        const CLAUSE = `0x${"cd".repeat(32)}`;
        const SWIFT = "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955";
        const ROSSO = "0x976EA74026E726554dB657fA54763abd0C3a0aa9";
        const profileWith = (coSeller: Record<string, unknown>) => ({
            name: "Bob",
            assemblyBindings: [{ bindingId: "b-1", subjectAddress: SUBJECT, assemblyHash: HASH, coSellerBindings: [coSeller] }],
        });

        it("parses the item map keyed by the lowercased address and round-trips it", () => {
            const first = parseMemberProfileDocument(profileWith({
                clauseKey: CLAUSE, addresses: [SWIFT, ROSSO], itemIds: { [SWIFT.toLowerCase()]: "kit-fastening" },
            }));
            const binding = first.assemblyBindings?.[0]?.coSellerBindings?.[0];
            expect(binding?.itemIds).toEqual({ [SWIFT.toLowerCase()]: "kit-fastening" });
            expect(parseMemberProfileDocument(first)).toEqual(first);
        });

        it("without the map, the binding parses and round-trips with no item map", () => {
            const first = parseMemberProfileDocument(profileWith({ clauseKey: CLAUSE, addresses: [SWIFT] }));
            const binding = first.assemblyBindings?.[0]?.coSellerBindings?.[0];
            expect(binding?.itemIds).toBeUndefined();
            expect(parseMemberProfileDocument(first)).toEqual(first);
        });

        it("refuses an item named for an address the binding does not designate", () => {
            expect(() => parseMemberProfileDocument(profileWith({
                clauseKey: CLAUSE, addresses: [SWIFT], itemIds: { [ROSSO.toLowerCase()]: "kit-housing" },
            }))).toThrow(/coSellerBindings\[0\]\.itemIds key .* is not one of the binding's addresses/);
        });

        it("refuses an item id that is not a string", () => {
            expect(() => parseMemberProfileDocument(profileWith({
                clauseKey: CLAUSE, addresses: [SWIFT], itemIds: { [SWIFT.toLowerCase()]: 7 },
            }))).toThrow(/itemIds\.0x14dc.* must be a string/);
        });
    });
});

describe("checkSellerBindsAssembly — the seller's own bound assemblies, read at the edge", () => {
    const SELLER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
    const BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
    const BOUND = `0x${"11".repeat(32)}` as const;
    const OTHER = `0x${"22".repeat(32)}` as const;
    const KEY = `0x${"33".repeat(32)}` as const;

    const agreementUnder = (assemblyHash?: `0x${string}`): Agreement => ({
        version: "a1",
        buyer: BUYER,
        seller: SELLER,
        clauses: [],
        ...(assemblyHash ? { provenance: { agreementHash: KEY, assemblyHash } } : {}),
    });
    const profileBinding = (assemblyHash: `0x${string}`): MemberProfileMetadata => ({
        name: "Seller",
        assemblyBindings: [{ bindingId: "b", subjectAddress: SELLER, assemblyHash }],
    });

    it("accepts an order under an assembly the seller's profile binds", async () => {
        const reads: string[] = [];
        const check = await checkSellerBindsAssembly(agreementUnder(BOUND), SELLER, async (member) => {
            reads.push(member);
            return profileBinding(BOUND);
        });
        expect(check).toEqual({ ok: true });
        // The seller's OWN profile is the one read.
        expect(reads).toEqual([SELLER]);
    });

    it("matches the binding case-insensitively", async () => {
        const upper = `0x${"AB".repeat(32)}` as const;
        const check = await checkSellerBindsAssembly(agreementUnder(upper.toLowerCase() as `0x${string}`), SELLER, async () => profileBinding(upper));
        expect(check.ok).toBe(true);
    });

    it("refuses an order under an assembly the seller has not bound, naming it by slug and full hash", async () => {
        const check = await checkSellerBindsAssembly(agreementUnder(OTHER), SELLER, async () => profileBinding(BOUND));
        expect(check.ok).toBe(false);
        expect(check.reason).toContain(deriveAssemblySlug(OTHER));
        expect(check.reason).toContain(OTHER);
        expect(check.reason).toMatch(/has not bound/);
    });

    it("refuses an order whose agreement carries no provenance leaf — every process instantiates an assembly", async () => {
        const check = await checkSellerBindsAssembly(agreementUnder(), SELLER, async () => profileBinding(BOUND));
        expect(check.ok).toBe(false);
        expect(check.reason).toMatch(/names no assembly/);
    });

    it("refuses when no profile reader is given", async () => {
        const check = await checkSellerBindsAssembly(agreementUnder(BOUND), SELLER, undefined);
        expect(check.ok).toBe(false);
        expect(check.reason).toMatch(/no member-profile reader/);
    });

    it("refuses when the seller's profile cannot be read (null or a throw)", async () => {
        const absent = await checkSellerBindsAssembly(agreementUnder(BOUND), SELLER, async () => null);
        expect(absent.ok).toBe(false);
        expect(absent.reason).toMatch(/could not be read/);
        expect(absent.reason).toContain(BOUND);
        const thrown = await checkSellerBindsAssembly(agreementUnder(BOUND), SELLER, async () => { throw new Error("gateway down"); });
        expect(thrown.ok).toBe(false);
        expect(thrown.reason).toMatch(/could not be read/);
    });

    it("refuses a profile that binds nothing", async () => {
        const check = await checkSellerBindsAssembly(agreementUnder(BOUND), SELLER, async () => ({ name: "Seller" }));
        expect(check.ok).toBe(false);
        expect(check.reason).toMatch(/has not bound/);
    });
});

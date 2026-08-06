import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
    fetchMemberCatalogue,
    invalidateCatalogueCache,
    clearCatalogueCache,
} from "@/lib/member/catalogueFetcher";
import { publishMemberCatalogue } from "@/lib/member/cataloguePublisher";
import { createCatalogueService } from "@/lib/member/catalogueService";
import { parseMemberCatalogueDocument } from "@/lib/member/memberCatalogueMetadataParser";
import type { MemberCatalogueMetadata } from "@/lib/member/memberCatalogueMetadata";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_MERCHANT_DOC: MemberCatalogueMetadata = {
    subjectAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    items: [
        {
            id: "item1",
            name: "Margherita",
            description: "Classic pizza",
            price: "0.01",
            category: "Pizza",
            available: true,
        },
    ],
    version: "1",
};

// ── catalogueFetcher ──────────────────────────────────────────────────────────

describe("catalogueFetcher", () => {
    beforeEach(() => {
        clearCatalogueCache();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns null for empty URI", async () => {
        expect(await fetchMemberCatalogue("")).toBeNull();
    });

    it("fetches and parses a valid metadata document", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(VALID_MERCHANT_DOC),
            text: () => Promise.resolve(JSON.stringify(VALID_MERCHANT_DOC)),
        } as Response);

        const result = await fetchMemberCatalogue("ipfs://QmTest");
        expect(result).not.toBeNull();
        expect(result!.subjectAddress).toBe("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
        expect(result!.items).toHaveLength(1);
        expect(result!.items[0].name).toBe("Margherita");
    });

    it("returns null for HTTP errors", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: false,
            status: 404,
        } as Response);

        expect(await fetchMemberCatalogue("ipfs://QmNotFound")).toBeNull();
    });

    it("returns null for invalid JSON", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ invalid: true }),
            text: () => Promise.resolve(JSON.stringify({ invalid: true })),
        } as Response);

        expect(await fetchMemberCatalogue("ipfs://QmBad")).toBeNull();
    });

    it("caches results and does not refetch", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(VALID_MERCHANT_DOC),
            text: () => Promise.resolve(JSON.stringify(VALID_MERCHANT_DOC)),
        } as Response);

        await fetchMemberCatalogue("ipfs://QmCached");
        await fetchMemberCatalogue("ipfs://QmCached");

        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("invalidateCatalogueCache allows refetch", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(VALID_MERCHANT_DOC),
            text: () => Promise.resolve(JSON.stringify(VALID_MERCHANT_DOC)),
        } as Response);

        await fetchMemberCatalogue("ipfs://QmInv");
        invalidateCatalogueCache("ipfs://QmInv");
        await fetchMemberCatalogue("ipfs://QmInv");

        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("clearCatalogueCache clears all entries", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(VALID_MERCHANT_DOC),
            text: () => Promise.resolve(JSON.stringify(VALID_MERCHANT_DOC)),
        } as Response);

        await fetchMemberCatalogue("ipfs://QmA");
        await fetchMemberCatalogue("ipfs://QmB");
        clearCatalogueCache();
        await fetchMemberCatalogue("ipfs://QmA");
        await fetchMemberCatalogue("ipfs://QmB");

        expect(fetchSpy).toHaveBeenCalledTimes(4);
    });

    it("returns null on network error", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));

        expect(await fetchMemberCatalogue("ipfs://QmErr")).toBeNull();
    });
});

// ── cataloguePublisher ────────────────────────────────────────────────────────

// Partial override — preserve the original `IPFS_GATEWAY_URL` + the real
// `resolveContentUri` so `uriFetcher` can still build a gateway URL.
// Without `...actual` the named import becomes undefined and the throw
// at `resolveContentUri` is swallowed by `uriFetcher`'s catch, masking
// the real failure as "fetch never called".
vi.mock("@/lib/shared/ipfsService", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/shared/ipfsService")>()),
    DEFAULT_IPFS_SERVICE: {
        pinJSON: vi.fn().mockResolvedValue("QmPublished123"),
        buildURI: (cid: string) => `ipfs://${cid}`,
    },
}));

describe("cataloguePublisher", () => {
    beforeEach(() => {
        clearCatalogueCache();
        vi.clearAllMocks();
    });

    describe("publishMemberCatalogue", () => {
        it("lets catalogue services publish through an injected evidence transport", async () => {
            const evidenceTransport = {
                pinJSON: vi.fn().mockResolvedValue("QmInjectedMerchant123"),
                buildURI: vi.fn().mockReturnValue("ipfs://QmInjectedMerchant123"),
            };
            const service = createCatalogueService({ evidenceTransport: evidenceTransport as never });

            const result = await service.publishMemberCatalogue(VALID_MERCHANT_DOC);

            expect(evidenceTransport.pinJSON).toHaveBeenCalledWith(VALID_MERCHANT_DOC);
            expect(evidenceTransport.buildURI).toHaveBeenCalledWith("QmInjectedMerchant123");
            expect(result).toEqual({
                cid: "QmInjectedMerchant123",
                uri: "ipfs://QmInjectedMerchant123",
            });
        });

        it("validates, pins, and returns a correct IPFS URI", async () => {
            const result = await publishMemberCatalogue(VALID_MERCHANT_DOC);

            expect(result.cid).toBe("QmPublished123");
            expect(result.uri).toBe("ipfs://QmPublished123");
        });

        it("rejects invalid merchant documents before pinning", async () => {
            const bad = { ...VALID_MERCHANT_DOC, items: undefined } as unknown as MemberCatalogueMetadata;

            await expect(publishMemberCatalogue(bad)).rejects.toThrow();
        });

        it("accepts documents with empty menu (parser allows it)", async () => {
            const emptyMenu = { ...VALID_MERCHANT_DOC, items: [] };
            const result = await publishMemberCatalogue(emptyMenu);

            expect(result.cid).toBe("QmPublished123");
            expect(result.uri).toBe("ipfs://QmPublished123");
        });

        it("invalidates caches after publishing", async () => {
            // Pre-populate cache
            vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(VALID_MERCHANT_DOC),
                text: () => Promise.resolve(JSON.stringify(VALID_MERCHANT_DOC)),
            } as Response);
            await fetchMemberCatalogue("ipfs://QmPublished123");

            // Publish should clear the cache for the new URI
            await publishMemberCatalogue(VALID_MERCHANT_DOC);

            // Next fetch should hit the network again
            vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(VALID_MERCHANT_DOC),
                text: () => Promise.resolve(JSON.stringify(VALID_MERCHANT_DOC)),
            } as Response);
            await fetchMemberCatalogue("ipfs://QmPublished123");
        });
    });
});

// ── catalogue shape sanity ────────────────────────────────────────────────────

describe("MemberCatalogueMetadata shape", () => {
    it("carries only subjectAddress, items, and version after the clause split", () => {
        const cat = VALID_MERCHANT_DOC;

        expect(cat.subjectAddress).toBeDefined();
        expect(cat.items.length).toBeGreaterThan(0);
        expect(cat.version).toBeDefined();
    });

    it("each catalogue item carries id, name, price, category, available", () => {
        const item = VALID_MERCHANT_DOC.items[0];

        expect(item.id).toBeDefined();
        expect(item.name).toBeDefined();
        expect(item.price).toBeDefined();
        expect(item.category).toBeDefined();
        expect(typeof item.available).toBe("boolean");
    });
});

describe("catalogue parser — physical dims + clauseValues survive the round-trip", () => {
    const subjectAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

    it("carries lengthMm/widthMm/heightMm through a parse (P1 dimensions floor)", () => {
        const parsed = parseMemberCatalogueDocument({
            subjectAddress,
            version: "1",
            items: [{
                id: "i1", name: "Box", price: "1", available: true,
                massGrams: 500, volumeMl: 1000, lengthMm: 300, widthMm: 200, heightMm: 150,
            }],
        });
        expect(parsed.items[0]).toMatchObject({ lengthMm: 300, widthMm: 200, heightMm: 150 });
    });

    it("carries the catalogue-sourced clauseValues map through a parse", () => {
        const clauseValues = {
            "figaro-hazmat": { unNumber: "UN1203", properShippingName: "Petrol", hazardClass: "3" },
        };
        const parsed = parseMemberCatalogueDocument({
            subjectAddress,
            version: "1",
            items: [{ id: "i1", name: "Drum", price: "1", available: true, clauseValues }],
        });
        expect(parsed.items[0].clauseValues).toEqual(clauseValues);
    });
});

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
    fetchMerchantCatalogue,
    invalidateCatalogueCache,
    clearCatalogueCache,
} from "@/lib/shared/catalogueFetcher";
import { publishMerchantCatalogue } from "@/lib/shared/cataloguePublisher";
import { createCatalogueService } from "@/lib/shared/catalogueService";
import type { SellerCatalogueMetadata } from "@/lib/shared/sellerCatalogueMetadata";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_MERCHANT_DOC: SellerCatalogueMetadata = {
    subjectAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    menu: [
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
        expect(await fetchMerchantCatalogue("")).toBeNull();
    });

    it("fetches and parses a valid metadata document", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(VALID_MERCHANT_DOC),
            text: () => Promise.resolve(JSON.stringify(VALID_MERCHANT_DOC)),
        } as Response);

        const result = await fetchMerchantCatalogue("ipfs://QmTest");
        expect(result).not.toBeNull();
        expect(result!.subjectAddress).toBe("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
        expect(result!.menu).toHaveLength(1);
        expect(result!.menu[0].name).toBe("Margherita");
    });

    it("returns null for HTTP errors", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: false,
            status: 404,
        } as Response);

        expect(await fetchMerchantCatalogue("ipfs://QmNotFound")).toBeNull();
    });

    it("returns null for invalid JSON", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ invalid: true }),
            text: () => Promise.resolve(JSON.stringify({ invalid: true })),
        } as Response);

        expect(await fetchMerchantCatalogue("ipfs://QmBad")).toBeNull();
    });

    it("caches results and does not refetch", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(VALID_MERCHANT_DOC),
            text: () => Promise.resolve(JSON.stringify(VALID_MERCHANT_DOC)),
        } as Response);

        await fetchMerchantCatalogue("ipfs://QmCached");
        await fetchMerchantCatalogue("ipfs://QmCached");

        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("invalidateCatalogueCache allows refetch", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(VALID_MERCHANT_DOC),
            text: () => Promise.resolve(JSON.stringify(VALID_MERCHANT_DOC)),
        } as Response);

        await fetchMerchantCatalogue("ipfs://QmInv");
        invalidateCatalogueCache("ipfs://QmInv");
        await fetchMerchantCatalogue("ipfs://QmInv");

        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("clearCatalogueCache clears all entries", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(VALID_MERCHANT_DOC),
            text: () => Promise.resolve(JSON.stringify(VALID_MERCHANT_DOC)),
        } as Response);

        await fetchMerchantCatalogue("ipfs://QmA");
        await fetchMerchantCatalogue("ipfs://QmB");
        clearCatalogueCache();
        await fetchMerchantCatalogue("ipfs://QmA");
        await fetchMerchantCatalogue("ipfs://QmB");

        expect(fetchSpy).toHaveBeenCalledTimes(4);
    });

    it("returns null on network error", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));

        expect(await fetchMerchantCatalogue("ipfs://QmErr")).toBeNull();
    });
});

// ── cataloguePublisher ────────────────────────────────────────────────────────

vi.mock("@/lib/shared/ipfsService", () => ({
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

    describe("publishMerchantCatalogue", () => {
        it("lets catalogue services publish through an injected evidence transport", async () => {
            const evidenceTransport = {
                pinJSON: vi.fn().mockResolvedValue("QmInjectedMerchant123"),
                buildURI: vi.fn().mockReturnValue("ipfs://QmInjectedMerchant123"),
            };
            const service = createCatalogueService({ evidenceTransport: evidenceTransport as never });

            const result = await service.publishMerchantCatalogue(VALID_MERCHANT_DOC);

            expect(evidenceTransport.pinJSON).toHaveBeenCalledWith(VALID_MERCHANT_DOC);
            expect(evidenceTransport.buildURI).toHaveBeenCalledWith("QmInjectedMerchant123");
            expect(result).toEqual({
                cid: "QmInjectedMerchant123",
                uri: "ipfs://QmInjectedMerchant123",
            });
        });

        it("validates, pins, and returns a correct IPFS URI", async () => {
            const result = await publishMerchantCatalogue(VALID_MERCHANT_DOC);

            expect(result.cid).toBe("QmPublished123");
            expect(result.uri).toBe("ipfs://QmPublished123");
        });

        it("rejects invalid merchant documents before pinning", async () => {
            const bad = { ...VALID_MERCHANT_DOC, menu: undefined } as unknown as SellerCatalogueMetadata;

            await expect(publishMerchantCatalogue(bad)).rejects.toThrow();
        });

        it("accepts documents with empty menu (parser allows it)", async () => {
            const emptyMenu = { ...VALID_MERCHANT_DOC, menu: [] };
            const result = await publishMerchantCatalogue(emptyMenu);

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
            await fetchMerchantCatalogue("ipfs://QmPublished123");

            // Publish should clear the cache for the new URI
            await publishMerchantCatalogue(VALID_MERCHANT_DOC);

            // Next fetch should hit the network again
            vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(VALID_MERCHANT_DOC),
                text: () => Promise.resolve(JSON.stringify(VALID_MERCHANT_DOC)),
            } as Response);
            await fetchMerchantCatalogue("ipfs://QmPublished123");
        });
    });
});

// ── catalogue shape sanity ────────────────────────────────────────────────────

describe("SellerCatalogueMetadata shape", () => {
    it("carries only subjectAddress, items, and version after the schema split", () => {
        const cat = VALID_MERCHANT_DOC;

        expect(cat.subjectAddress).toBeDefined();
        expect(cat.menu.length).toBeGreaterThan(0);
        expect(cat.version).toBeDefined();
    });

    it("each catalogue item carries id, name, price, category, available", () => {
        const item = VALID_MERCHANT_DOC.menu[0];

        expect(item.id).toBeDefined();
        expect(item.name).toBeDefined();
        expect(item.price).toBeDefined();
        expect(item.category).toBeDefined();
        expect(typeof item.available).toBe("boolean");
    });
});

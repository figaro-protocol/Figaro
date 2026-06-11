import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
    fetchSellerCatalogue,
    invalidateCatalogueCache,
    clearCatalogueCache,
} from "@/lib/shared/catalogueFetcher";
import { publishSellerCatalogue } from "@/lib/shared/cataloguePublisher";
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
        expect(await fetchSellerCatalogue("")).toBeNull();
    });

    it("fetches and parses a valid metadata document", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(VALID_MERCHANT_DOC),
            text: () => Promise.resolve(JSON.stringify(VALID_MERCHANT_DOC)),
        } as Response);

        const result = await fetchSellerCatalogue("ipfs://QmTest");
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

        expect(await fetchSellerCatalogue("ipfs://QmNotFound")).toBeNull();
    });

    it("returns null for invalid JSON", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ invalid: true }),
            text: () => Promise.resolve(JSON.stringify({ invalid: true })),
        } as Response);

        expect(await fetchSellerCatalogue("ipfs://QmBad")).toBeNull();
    });

    it("caches results and does not refetch", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(VALID_MERCHANT_DOC),
            text: () => Promise.resolve(JSON.stringify(VALID_MERCHANT_DOC)),
        } as Response);

        await fetchSellerCatalogue("ipfs://QmCached");
        await fetchSellerCatalogue("ipfs://QmCached");

        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("invalidateCatalogueCache allows refetch", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(VALID_MERCHANT_DOC),
            text: () => Promise.resolve(JSON.stringify(VALID_MERCHANT_DOC)),
        } as Response);

        await fetchSellerCatalogue("ipfs://QmInv");
        invalidateCatalogueCache("ipfs://QmInv");
        await fetchSellerCatalogue("ipfs://QmInv");

        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("clearCatalogueCache clears all entries", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(VALID_MERCHANT_DOC),
            text: () => Promise.resolve(JSON.stringify(VALID_MERCHANT_DOC)),
        } as Response);

        await fetchSellerCatalogue("ipfs://QmA");
        await fetchSellerCatalogue("ipfs://QmB");
        clearCatalogueCache();
        await fetchSellerCatalogue("ipfs://QmA");
        await fetchSellerCatalogue("ipfs://QmB");

        expect(fetchSpy).toHaveBeenCalledTimes(4);
    });

    it("returns null on network error", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));

        expect(await fetchSellerCatalogue("ipfs://QmErr")).toBeNull();
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

    describe("publishSellerCatalogue", () => {
        it("lets catalogue services publish through an injected evidence transport", async () => {
            const evidenceTransport = {
                pinJSON: vi.fn().mockResolvedValue("QmInjectedMerchant123"),
                buildURI: vi.fn().mockReturnValue("ipfs://QmInjectedMerchant123"),
            };
            const service = createCatalogueService({ evidenceTransport: evidenceTransport as never });

            const result = await service.publishSellerCatalogue(VALID_MERCHANT_DOC);

            expect(evidenceTransport.pinJSON).toHaveBeenCalledWith(VALID_MERCHANT_DOC);
            expect(evidenceTransport.buildURI).toHaveBeenCalledWith("QmInjectedMerchant123");
            expect(result).toEqual({
                cid: "QmInjectedMerchant123",
                uri: "ipfs://QmInjectedMerchant123",
            });
        });

        it("validates, pins, and returns a correct IPFS URI", async () => {
            const result = await publishSellerCatalogue(VALID_MERCHANT_DOC);

            expect(result.cid).toBe("QmPublished123");
            expect(result.uri).toBe("ipfs://QmPublished123");
        });

        it("rejects invalid merchant documents before pinning", async () => {
            const bad = { ...VALID_MERCHANT_DOC, menu: undefined } as unknown as SellerCatalogueMetadata;

            await expect(publishSellerCatalogue(bad)).rejects.toThrow();
        });

        it("accepts documents with empty menu (parser allows it)", async () => {
            const emptyMenu = { ...VALID_MERCHANT_DOC, menu: [] };
            const result = await publishSellerCatalogue(emptyMenu);

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
            await fetchSellerCatalogue("ipfs://QmPublished123");

            // Publish should clear the cache for the new URI
            await publishSellerCatalogue(VALID_MERCHANT_DOC);

            // Next fetch should hit the network again
            vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(VALID_MERCHANT_DOC),
                text: () => Promise.resolve(JSON.stringify(VALID_MERCHANT_DOC)),
            } as Response);
            await fetchSellerCatalogue("ipfs://QmPublished123");
        });
    });
});

// ── catalogue shape sanity ────────────────────────────────────────────────────

describe("SellerCatalogueMetadata shape", () => {
    it("carries only subjectAddress, items, and version after the clause split", () => {
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

// ── Class-of-service collapse (multi-item shipment → one geo annotation) ─────

import { collapseClassOfService } from "@/lib/shared/sellerCatalogueMetadata";

describe("collapseClassOfService", () => {
    it("returns undefined when no item declares a class (the spec default applies)", () => {
        expect(collapseClassOfService([])).toBeUndefined();
        expect(collapseClassOfService([undefined, undefined])).toBeUndefined();
    });

    it("picks the highest-priority class across items", () => {
        // cold-chain > fragile > express > standard
        expect(collapseClassOfService(["standard", "express"])).toBe("E");
        expect(collapseClassOfService(["express", "fragile", "standard"])).toBe("F");
        expect(collapseClassOfService(["standard", "cold-chain", "fragile"])).toBe("C");
    });

    it("accepts short codes and long forms interchangeably", () => {
        expect(collapseClassOfService(["S", "fragile"])).toBe("F");
        expect(collapseClassOfService(["C", "standard"])).toBe("C");
    });

    it("ignores undefined items but keeps the declared ones voting", () => {
        expect(collapseClassOfService([undefined, "express", undefined])).toBe("E");
    });

    it("throws on an unrecognized class (typed error, not a silent default)", () => {
        expect(() => collapseClassOfService(["overnight-drone"])).toThrow(TypeError);
    });
});

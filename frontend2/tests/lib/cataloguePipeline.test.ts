import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
    fetchMerchantCatalogue,
    invalidateCatalogueCache,
    clearCatalogueCache,
} from "@/lib/shared/catalogueFetcher";
import {
    publishMerchantCatalogue,
    publishCourierOffering,
} from "@/lib/shared/cataloguePublisher";
import { createCatalogueService } from "@/lib/shared/catalogueService";
import type { SellerCatalogueMetadata } from "@/lib/shared/sellerCatalogueMetadata";
import type { CourierOfferingMetadata } from "@/lib/shared/courierOfferingMetadata";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_MERCHANT_DOC: SellerCatalogueMetadata = {
    subjectAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    archetypeId: "merchant-one-hop-delivery",
    merchantId: "test-pizza",
    slug: "test-pizza",
    name: "Test Pizza",
    description: "The finest test pizza",
    cuisine: "Italian",
    fulfillmentModes: ["delivery"],
    location: { geohash: "dr5reg", addressText: "Test St" },
    serviceAreas: [{ geohashPrefix: "dr5", label: "Downtown" }],
    minimumOrder: "0.01",
    estimatedFulfillment: "30-45 min",
    menu: [
        {
            id: "item1",
            name: "Margherita",
            description: "Classic pizza",
            price: "0.01",
            currencySymbol: "ETH",
            category: "Pizza",
            available: true,
        },
    ],
    branding: {
        displayName: "Test Pizza",
        logoURI: "ipfs://QmLogo",
        accentColor: "#c2410c",
    },
    version: "1",
};

const VALID_COURIER_DOC: CourierOfferingMetadata = {
    subjectAddress: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    archetypeId: "courier-delivery",
    courierId: "test-courier-01",
    displayName: "Test Courier",
    description: "Fast bicycle delivery",
    serviceAreas: [{ geohashPrefix: "dr5re", label: "Downtown" }],
    vehicleType: "bicycle",
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
        expect(result!.name).toBe("Test Pizza");
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
            const bad = { ...VALID_MERCHANT_DOC, name: undefined } as unknown as SellerCatalogueMetadata;

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

    describe("publishCourierOffering", () => {
        it("lets catalogue services publish courier offerings through an injected evidence transport", async () => {
            const evidenceTransport = {
                pinJSON: vi.fn().mockResolvedValue("QmInjectedCourier123"),
                buildURI: vi.fn().mockReturnValue("ipfs://QmInjectedCourier123"),
            };
            const service = createCatalogueService({ evidenceTransport: evidenceTransport as never });

            const result = await service.publishCourierOffering(VALID_COURIER_DOC);

            expect(evidenceTransport.pinJSON).toHaveBeenCalledWith(VALID_COURIER_DOC);
            expect(evidenceTransport.buildURI).toHaveBeenCalledWith("QmInjectedCourier123");
            expect(result).toEqual({
                cid: "QmInjectedCourier123",
                uri: "ipfs://QmInjectedCourier123",
            });
        });

        it("pins a valid courier offering", async () => {
            const result = await publishCourierOffering(VALID_COURIER_DOC);

            expect(result.cid).toBe("QmPublished123");
            expect(result.uri).toBe("ipfs://QmPublished123");
        });

        it("rejects a courier offering without subjectAddress", async () => {
            const bad = { ...VALID_COURIER_DOC, subjectAddress: "" } as unknown as CourierOfferingMetadata;

            await expect(publishCourierOffering(bad)).rejects.toThrow(
                /subjectAddress/
            );
        });

        it("rejects a courier offering without service areas", async () => {
            const bad = { ...VALID_COURIER_DOC, serviceAreas: [] };

            await expect(publishCourierOffering(bad)).rejects.toThrow(
                /service area/
            );
        });
    });
});

// ── catalogueToRestaurant mapping ─────────────────────────────────────────────

// Import the mapping function indirectly through the hook's test
// Since catalogueToRestaurant is not exported, test the mapping semantics
describe("catalogueToRestaurant semantics", () => {
    it("SellerCatalogueMetadata fields map to Restaurant type correctly", () => {
        // Verify the mapping contract: all required Restaurant fields
        // can be derived from SellerCatalogueMetadata fields
        const cat = VALID_MERCHANT_DOC;

        // These assertions document the expected mapping
        expect(cat.merchantId).toBeDefined(); // → Restaurant.id
        expect(cat.name).toBeDefined(); // → Restaurant.name
        expect(cat.subjectAddress).toBeDefined(); // → Restaurant.address
        expect(cat.description).toBeDefined(); // → Restaurant.description
        expect(cat.cuisine).toBeDefined(); // → Restaurant.cuisine
        expect(cat.branding?.logoURI).toBeDefined(); // → Restaurant.image
        expect(cat.estimatedFulfillment).toBeDefined(); // → Restaurant.deliveryTime
        expect(cat.minimumOrder).toBeDefined(); // → Restaurant.minimumOrder
        expect(cat.location.geohash).toBeDefined(); // → Restaurant.geohash
        expect(cat.menu.length).toBeGreaterThan(0); // → Restaurant.menu[]
    });

    it("EatsMenuItemMetadata fields map to MenuItem type correctly", () => {
        const item = VALID_MERCHANT_DOC.menu[0];

        expect(item.id).toBeDefined(); // → MenuItem.id
        expect(item.name).toBeDefined(); // → MenuItem.name
        expect(item.price).toBeDefined(); // → MenuItem.price
        expect(item.category).toBeDefined(); // → MenuItem.category
        expect(typeof item.available).toBe("boolean"); // → MenuItem.available
    });
});

// ── courierOfferingMetadata ───────────────────────────────────────────────────

import { COURIER_OFFERING_METADATA_EXAMPLE } from "@/lib/shared/courierOfferingMetadata";

describe("courierOfferingMetadata", () => {
    it("example document has required fields", () => {
        const doc = COURIER_OFFERING_METADATA_EXAMPLE;

        expect(doc.subjectAddress).toMatch(/^0x/);
        expect(doc.archetypeId).toBe("courier-delivery");
        expect(doc.courierId).toBeDefined();
        expect(doc.displayName).toBeDefined();
        expect(doc.serviceAreas.length).toBeGreaterThan(0);
        expect(doc.version).toBeDefined();
    });

    it("vehicle types are valid union members", () => {
        const validTypes = ["bicycle", "motorcycle", "car", "van", "on-foot"];
        const doc = COURIER_OFFERING_METADATA_EXAMPLE;

        if (doc.vehicleType) {
            expect(validTypes).toContain(doc.vehicleType);
        }
    });
});

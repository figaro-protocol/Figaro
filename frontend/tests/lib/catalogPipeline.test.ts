import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
    fetchMemberCatalog,
    invalidateCatalogCache,
    clearCatalogCache,
} from "@/lib/member/catalogFetcher";
import { publishMemberCatalog } from "@/lib/member/catalogPublisher";
import { createCatalogService } from "@/lib/member/catalogService";
import { parseMemberCatalogDocument } from "@/lib/member/memberCatalogMetadataParser";
import type { MemberCatalogMetadata } from "@/lib/member/memberCatalogMetadata";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_MERCHANT_DOC: MemberCatalogMetadata = {
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

// ── catalogFetcher ──────────────────────────────────────────────────────────

describe("catalogFetcher", () => {
    beforeEach(() => {
        clearCatalogCache();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns null for empty URI", async () => {
        expect(await fetchMemberCatalog("")).toBeNull();
    });

    it("fetches and parses a valid metadata document", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(VALID_MERCHANT_DOC),
            text: () => Promise.resolve(JSON.stringify(VALID_MERCHANT_DOC)),
        } as Response);

        const result = await fetchMemberCatalog("ipfs://QmTest1111111111111111111111111111111111111111");
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

        expect(await fetchMemberCatalog("ipfs://QmNotFound111111111111111111111111111111111111")).toBeNull();
    });

    it("returns null for invalid JSON", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ invalid: true }),
            text: () => Promise.resolve(JSON.stringify({ invalid: true })),
        } as Response);

        expect(await fetchMemberCatalog("ipfs://QmBad11111111111111111111111111111111111111111")).toBeNull();
    });

    it("caches results and does not refetch", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(VALID_MERCHANT_DOC),
            text: () => Promise.resolve(JSON.stringify(VALID_MERCHANT_DOC)),
        } as Response);

        await fetchMemberCatalog("ipfs://QmCached11111111111111111111111111111111111111");
        await fetchMemberCatalog("ipfs://QmCached11111111111111111111111111111111111111");

        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("invalidateCatalogCache allows refetch", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(VALID_MERCHANT_DOC),
            text: () => Promise.resolve(JSON.stringify(VALID_MERCHANT_DOC)),
        } as Response);

        await fetchMemberCatalog("ipfs://QmJnv11111111111111111111111111111111111111111");
        invalidateCatalogCache("ipfs://QmJnv11111111111111111111111111111111111111111");
        await fetchMemberCatalog("ipfs://QmJnv11111111111111111111111111111111111111111");

        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("clearCatalogCache clears all entries", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(VALID_MERCHANT_DOC),
            text: () => Promise.resolve(JSON.stringify(VALID_MERCHANT_DOC)),
        } as Response);

        await fetchMemberCatalog("ipfs://QmA1111111111111111111111111111111111111111111");
        await fetchMemberCatalog("ipfs://QmB1111111111111111111111111111111111111111111");
        clearCatalogCache();
        await fetchMemberCatalog("ipfs://QmA1111111111111111111111111111111111111111111");
        await fetchMemberCatalog("ipfs://QmB1111111111111111111111111111111111111111111");

        expect(fetchSpy).toHaveBeenCalledTimes(4);
    });

    it("returns null on network error", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));

        expect(await fetchMemberCatalog("ipfs://QmErr11111111111111111111111111111111111111111")).toBeNull();
    });
});

// ── catalogPublisher ────────────────────────────────────────────────────────

// Partial override — preserve the original `IPFS_GATEWAY_URL` + the real
// `resolveMemberDocumentUri` so `uriFetcher` can still build a gateway URL.
// Without `...actual` the named import becomes undefined and the throw
// at `resolveMemberDocumentUri` is swallowed by `uriFetcher`'s catch, masking
// the real failure as "fetch never called".
vi.mock("@/lib/shared/ipfsService", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/shared/ipfsService")>()),
    DEFAULT_IPFS_SERVICE: {
        pinJSON: vi.fn().mockResolvedValue("QmPubkished12311111111111111111111111111111111"),
        buildURI: (cid: string) => `ipfs://${cid}`,
    },
}));

describe("catalogPublisher", () => {
    beforeEach(() => {
        clearCatalogCache();
        vi.clearAllMocks();
    });

    describe("publishMemberCatalog", () => {
        it("lets catalog services publish through an injected evidence transport", async () => {
            const evidenceTransport = {
                pinJSON: vi.fn().mockResolvedValue("QmJnjectedMerchant1231111111111111111111111111"),
                buildURI: vi.fn().mockReturnValue("ipfs://QmJnjectedMerchant1231111111111111111111111111"),
            };
            const service = createCatalogService({ evidenceTransport: evidenceTransport as never });

            const result = await service.publishMemberCatalog(VALID_MERCHANT_DOC);

            expect(evidenceTransport.pinJSON).toHaveBeenCalledWith(VALID_MERCHANT_DOC);
            expect(evidenceTransport.buildURI).toHaveBeenCalledWith("QmJnjectedMerchant1231111111111111111111111111");
            expect(result).toEqual({
                cid: "QmJnjectedMerchant1231111111111111111111111111",
                uri: "ipfs://QmJnjectedMerchant1231111111111111111111111111",
            });
        });

        it("validates, pins, and returns a correct IPFS URI", async () => {
            const result = await publishMemberCatalog(VALID_MERCHANT_DOC);

            expect(result.cid).toBe("QmPubkished12311111111111111111111111111111111");
            expect(result.uri).toBe("ipfs://QmPubkished12311111111111111111111111111111111");
        });

        it("rejects invalid merchant documents before pinning", async () => {
            const bad = { ...VALID_MERCHANT_DOC, items: undefined } as unknown as MemberCatalogMetadata;

            await expect(publishMemberCatalog(bad)).rejects.toThrow();
        });

        it("accepts documents with empty menu (parser allows it)", async () => {
            const emptyMenu = { ...VALID_MERCHANT_DOC, items: [] };
            const result = await publishMemberCatalog(emptyMenu);

            expect(result.cid).toBe("QmPubkished12311111111111111111111111111111111");
            expect(result.uri).toBe("ipfs://QmPubkished12311111111111111111111111111111111");
        });

        it("invalidates caches after publishing", async () => {
            // Pre-populate cache
            vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(VALID_MERCHANT_DOC),
                text: () => Promise.resolve(JSON.stringify(VALID_MERCHANT_DOC)),
            } as Response);
            await fetchMemberCatalog("ipfs://QmPubkished12311111111111111111111111111111111");

            // Publish should clear the cache for the new URI
            await publishMemberCatalog(VALID_MERCHANT_DOC);

            // Next fetch should hit the network again
            vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(VALID_MERCHANT_DOC),
                text: () => Promise.resolve(JSON.stringify(VALID_MERCHANT_DOC)),
            } as Response);
            await fetchMemberCatalog("ipfs://QmPubkished12311111111111111111111111111111111");
        });
    });
});

// ── catalog shape sanity ────────────────────────────────────────────────────

describe("MemberCatalogMetadata shape", () => {
    it("carries only subjectAddress, items, and version after the clause split", () => {
        const cat = VALID_MERCHANT_DOC;

        expect(cat.subjectAddress).toBeDefined();
        expect(cat.items.length).toBeGreaterThan(0);
        expect(cat.version).toBeDefined();
    });

    it("each catalog item carries id, name, price, category, available", () => {
        const item = VALID_MERCHANT_DOC.items[0];

        expect(item.id).toBeDefined();
        expect(item.name).toBeDefined();
        expect(item.price).toBeDefined();
        expect(item.category).toBeDefined();
        expect(typeof item.available).toBe("boolean");
    });
});

describe("catalog parser — physical dims + clauseValues survive the round-trip", () => {
    const subjectAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

    it("carries lengthMm/widthMm/heightMm through a parse (P1 dimensions floor)", () => {
        const parsed = parseMemberCatalogDocument({
            subjectAddress,
            version: "1",
            items: [{
                id: "i1", name: "Box", price: "1", available: true,
                massGrams: 500, volumeMl: 1000, lengthMm: 300, widthMm: 200, heightMm: 150,
            }],
        });
        expect(parsed.items[0]).toMatchObject({ lengthMm: 300, widthMm: 200, heightMm: 150 });
    });

    it("carries the catalog-sourced clauseValues map through a parse", () => {
        const clauseValues = {
            "figaro-hazmat": { unNumber: "UN1203", properShippingName: "Petrol", hazardClass: "3" },
        };
        const parsed = parseMemberCatalogDocument({
            subjectAddress,
            version: "1",
            items: [{ id: "i1", name: "Drum", price: "1", available: true, clauseValues }],
        });
        expect(parsed.items[0].clauseValues).toEqual(clauseValues);
    });
});

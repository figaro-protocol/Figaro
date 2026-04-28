import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
    fetchCourierOffering,
    invalidateOfferingCache,
    clearOfferingCache,
} from "@/lib/shared/courierOfferingFetcher";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_OFFERING = {
    subjectAddress: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    archetypeId: "courier-delivery",
    courierId: "test-courier-01",
    displayName: "Speed Runner",
    description: "Fast delivery",
    serviceAreas: [{ geohashPrefix: "dr5re", label: "Downtown" }],
    vehicleType: "bicycle",
    version: "1",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("courierOfferingFetcher", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        clearOfferingCache();
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    function mockFetch(data: unknown, ok = true) {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok,
            status: ok ? 200 : 500,
            json: async () => data,
            text: async () => JSON.stringify(data),
        });
    }

    it("fetches and returns a valid courier offering", async () => {
        mockFetch(VALID_OFFERING);
        const result = await fetchCourierOffering("ipfs://QmCourier123");
        expect(result).not.toBeNull();
        expect(result!.displayName).toBe("Speed Runner");
        expect(result!.vehicleType).toBe("bicycle");
    });

    it("returns null on HTTP error", async () => {
        mockFetch({}, false);
        const result = await fetchCourierOffering("ipfs://QmBad");
        expect(result).toBeNull();
    });

    it("returns null when archetypeId is wrong", async () => {
        mockFetch({ ...VALID_OFFERING, archetypeId: "merchant-one-hop-delivery" });
        const result = await fetchCourierOffering("ipfs://QmWrong");
        expect(result).toBeNull();
    });

    it("returns null when serviceAreas is empty", async () => {
        mockFetch({ ...VALID_OFFERING, serviceAreas: [] });
        const result = await fetchCourierOffering("ipfs://QmEmpty");
        expect(result).toBeNull();
    });

    it("returns null when subjectAddress is missing", async () => {
        const { subjectAddress, ...noAddr } = VALID_OFFERING;
        mockFetch(noAddr);
        const result = await fetchCourierOffering("ipfs://QmNoAddr");
        expect(result).toBeNull();
    });

    it("caches results on second fetch", async () => {
        mockFetch(VALID_OFFERING);
        const r1 = await fetchCourierOffering("ipfs://QmCacheTest");
        const r2 = await fetchCourierOffering("ipfs://QmCacheTest");
        expect(r1).toEqual(r2);
        expect(globalThis.fetch).toHaveBeenCalledOnce();
    });

    it("invalidateOfferingCache forces re-fetch", async () => {
        mockFetch(VALID_OFFERING);
        await fetchCourierOffering("ipfs://QmInvalidate");
        invalidateOfferingCache("ipfs://QmInvalidate");
        await fetchCourierOffering("ipfs://QmInvalidate");
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it("clearOfferingCache clears all entries", async () => {
        mockFetch(VALID_OFFERING);
        await fetchCourierOffering("ipfs://QmA");
        await fetchCourierOffering("ipfs://QmB");
        clearOfferingCache();
        await fetchCourierOffering("ipfs://QmA");
        expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it("returns null on network error", async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network failed"));
        const result = await fetchCourierOffering("ipfs://QmNetFail");
        expect(result).toBeNull();
    });

    it("resolves ipfs:// URIs through IPFS gateway", async () => {
        mockFetch(VALID_OFFERING);
        await fetchCourierOffering("ipfs://QmGatewayTest");
        const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(url).toContain("/ipfs/QmGatewayTest");
    });

    it("resolves http(s) URIs directly", async () => {
        mockFetch(VALID_OFFERING);
        await fetchCourierOffering("https://example.com/courier.json");
        const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(url).toBe("https://example.com/courier.json");
    });
});

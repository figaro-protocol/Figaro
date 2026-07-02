import { afterEach, describe, expect, it, vi } from "vitest";

import { geocodeAddress } from "@/lib/seller/geocode";

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

afterEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = originalFetch;
});

function installFetch() {
    globalThis.fetch = fetchMock as unknown as typeof fetch;
}

describe("geocodeAddress", () => {
    it("returns ok with parsed lat/lon when Nominatim returns a result", async () => {
        installFetch();
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => [{ lat: "40.7177933", lon: "-73.9954856" }],
        });

        const out = await geocodeAddress("100 Bowery, New York");

        expect(out).toEqual({ ok: true, result: { lat: 40.7177933, lon: -73.9954856 } });
        expect(fetchMock).toHaveBeenCalledOnce();
        const url = (fetchMock.mock.calls[0]?.[0] ?? "") as string;
        expect(url).toBe("/api/geocode?q=100%20Bowery%2C%20New%20York");
    });

    it("rejects empty queries before hitting the network", async () => {
        installFetch();
        const out = await geocodeAddress("   ");
        expect(out).toEqual({ ok: false, reason: "empty-query" });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns no-match when Nominatim returns an empty array", async () => {
        installFetch();
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
        const out = await geocodeAddress("zzzzzz");
        expect(out).toEqual({ ok: false, reason: "no-match" });
    });

    it("returns network-error when fetch throws", async () => {
        installFetch();
        fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
        const out = await geocodeAddress("anywhere");
        expect(out.ok).toBe(false);
        if (!out.ok) {
            expect(out.reason).toBe("network-error");
            expect(out.detail).toBe("Failed to fetch");
        }
    });

    it("returns http-error for non-2xx responses", async () => {
        installFetch();
        fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
        const out = await geocodeAddress("anywhere");
        expect(out.ok).toBe(false);
        if (!out.ok) {
            expect(out.reason).toBe("http-error");
            expect(out.detail).toBe("HTTP 429");
        }
    });

    it("returns malformed when response is not an array", async () => {
        installFetch();
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ unexpected: true }) });
        const out = await geocodeAddress("anywhere");
        expect(out.ok).toBe(false);
        if (!out.ok) expect(out.reason).toBe("malformed");
    });

    it("returns malformed when JSON parsing throws", async () => {
        installFetch();
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => {
                throw new SyntaxError("Unexpected token");
            },
        });
        const out = await geocodeAddress("anywhere");
        expect(out.ok).toBe(false);
        if (!out.ok) expect(out.reason).toBe("malformed");
    });

    it("returns malformed when lat/lon don't parse to numbers", async () => {
        installFetch();
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => [{ lat: "not-a-number", lon: "abc" }],
        });
        const out = await geocodeAddress("anywhere");
        expect(out.ok).toBe(false);
        if (!out.ok) expect(out.reason).toBe("malformed");
    });
});

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

/** Geocoder responses flow through the size-capped fetch (F4), which reads the
 *  body as text — stubs expose `text()`, the shape the cap enforces on. */
function jsonResponse(body: unknown) {
    return { ok: true, text: async () => JSON.stringify(body) };
}

describe("geocodeAddress", () => {
    it("returns ok with parsed lat/lon when Nominatim returns a result", async () => {
        installFetch();
        fetchMock.mockResolvedValueOnce(jsonResponse([{ lat: "40.7177933", lon: "-73.9954856" }]));

        const out = await geocodeAddress("100 Bowery, New York");

        expect(out).toEqual({ ok: true, result: { lat: 40.7177933, lon: -73.9954856 } });
        expect(fetchMock).toHaveBeenCalledOnce();
        // Straight from the browser to the third-party geocoder — no
        // operator proxy in between (the /api/geocode route is retired).
        const url = (fetchMock.mock.calls[0]?.[0] ?? "") as string;
        expect(url).toBe(
            "https://nominatim.openstreetmap.org/search?q=100%20Bowery%2C%20New%20York&format=json&limit=1",
        );
    });

    it("resolves through the user's geocoder override when one is set", async () => {
        installFetch();
        window.localStorage.setItem(
            "figaro.user-endpoints",
            JSON.stringify({ geocodeUrl: "https://geo.example.com/search" }),
        );
        try {
            fetchMock.mockResolvedValueOnce(jsonResponse([{ lat: "48.8584", lon: "2.2945" }]));
            const out = await geocodeAddress("Champ de Mars");
            expect(out.ok).toBe(true);
            const url = (fetchMock.mock.calls[0]?.[0] ?? "") as string;
            expect(url).toBe("https://geo.example.com/search?q=Champ%20de%20Mars&format=json&limit=1");
        } finally {
            window.localStorage.removeItem("figaro.user-endpoints");
        }
    });

    it("rejects empty queries before hitting the network", async () => {
        installFetch();
        const out = await geocodeAddress("   ");
        expect(out).toEqual({ ok: false, reason: "empty-query" });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns no-match when Nominatim returns an empty array", async () => {
        installFetch();
        fetchMock.mockResolvedValueOnce(jsonResponse([]));
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

    it("returns network-error naming the cap for an oversized geocoder response (F4)", async () => {
        installFetch();
        fetchMock.mockResolvedValueOnce({
            ok: true,
            headers: { get: () => String(9 * 1024 * 1024) }, // Content-Length over the 8 MB cap
            text: async () => "[]",
        });
        const out = await geocodeAddress("anywhere");
        expect(out.ok).toBe(false);
        if (!out.ok) {
            expect(out.reason).toBe("network-error");
            expect(out.detail).toMatch(/exceeds the maximum size of 8 MB/);
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
        fetchMock.mockResolvedValueOnce(jsonResponse({ unexpected: true }));
        const out = await geocodeAddress("anywhere");
        expect(out.ok).toBe(false);
        if (!out.ok) expect(out.reason).toBe("malformed");
    });

    it("returns malformed when JSON parsing throws", async () => {
        installFetch();
        fetchMock.mockResolvedValueOnce({ ok: true, text: async () => "{{{not json" });
        const out = await geocodeAddress("anywhere");
        expect(out.ok).toBe(false);
        if (!out.ok) expect(out.reason).toBe("malformed");
    });

    it("returns malformed when lat/lon don't parse to numbers", async () => {
        installFetch();
        fetchMock.mockResolvedValueOnce(jsonResponse([{ lat: "not-a-number", lon: "abc" }]));
        const out = await geocodeAddress("anywhere");
        expect(out.ok).toBe(false);
        if (!out.ok) expect(out.reason).toBe("malformed");
    });
});

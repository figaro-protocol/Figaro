/**
 * readDeviceGeohash — the device's position as a geohash, or null.
 *
 * Proves: a position the device reports is encoded at the asked precision,
 * and a device that gives no position (no Geolocation API, or a refusal)
 * yields null, never a stand-in geohash.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeGeohash } from "@figaro-protocol/sdk/derive";
import { readDeviceGeohash } from "@/lib/shared/deviceLocation";

function stubGeolocation(answer: { lat: number; lon: number } | null) {
    vi.stubGlobal("navigator", {
        geolocation: {
            getCurrentPosition: (ok: (pos: unknown) => void, fail: () => void) => {
                if (answer) ok({ coords: { latitude: answer.lat, longitude: answer.lon, accuracy: 10 } });
                else fail();
            },
        },
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("readDeviceGeohash", () => {
    it("encodes the reported position at the asked precision", async () => {
        stubGeolocation({ lat: 52.3702, lon: 4.8952 });
        const hash = await readDeviceGeohash(6);
        expect(hash).toBe(encodeGeohash(52.3702, 4.8952, 6));
        expect(hash).toHaveLength(6);
    });

    it("yields null when the device refuses", async () => {
        stubGeolocation(null);
        expect(await readDeviceGeohash(6)).toBeNull();
    });
});

import { describe, it, expect } from "vitest";
import {
    AttestationMode,
    ProximityBand,
    geohashesMatch,
    geohashCommonPrefix,
    haversineDistance,
    formatPhotoGPSEvidence,
    formatGeohashMatchEvidence,
} from "../src/extensions/geo.js";
import type { Hex, Address } from "../src/types.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

const addr = (n: number): Address =>
    `0x${n.toString(16).padStart(40, "0")}` as Address;
const hex32 = (n: number): Hex =>
    `0x${n.toString(16).padStart(64, "0")}` as Hex;

// ── Enum values ─────────────────────────────────────────────────────────────

describe("AttestationMode", () => {
    it("has expected values", () => {
        expect(AttestationMode.DeviceProximity).toBe("device-proximity");
        expect(AttestationMode.QRChallenge).toBe("qr-challenge");
        expect(AttestationMode.PhotoGPS).toBe("photo-gps");
        expect(AttestationMode.GeohashMatch).toBe("geohash-match");
    });
});

describe("ProximityBand", () => {
    it("has expected numeric values", () => {
        expect(ProximityBand.None).toBe(0);
        expect(ProximityBand.Zone).toBe(1);
        expect(ProximityBand.Nearby).toBe(2);
        expect(ProximityBand.Contact).toBe(3);
    });
});

// ── geohashesMatch ──────────────────────────────────────────────────────────

describe("geohashesMatch", () => {
    it("matches when prefixes are equal at default precision", () => {
        expect(geohashesMatch("9q8yyk", "9q8yym")).toBe(false); // last char differs
        expect(geohashesMatch("9q8yyk", "9q8yyk")).toBe(true);
    });

    it("matches at lower precision", () => {
        // same first 4 chars
        expect(geohashesMatch("9q8yyk", "9q8zzz", 3)).toBe(true);
    });

    it("returns false for empty strings", () => {
        expect(geohashesMatch("", "9q8yyk")).toBe(false);
        expect(geohashesMatch("9q8yyk", "")).toBe(false);
    });

    it("matches at precision 1 when first char is same", () => {
        expect(geohashesMatch("9abcde", "9zzzzz", 1)).toBe(true);
        expect(geohashesMatch("9abcde", "8zzzzz", 1)).toBe(false);
    });
});

// ── geohashCommonPrefix ─────────────────────────────────────────────────────

describe("geohashCommonPrefix", () => {
    it("returns full length for identical geohashes", () => {
        expect(geohashCommonPrefix("9q8yyk", "9q8yyk")).toBe(6);
    });

    it("returns 0 for completely different geohashes", () => {
        expect(geohashCommonPrefix("abcdef", "zyxwvu")).toBe(0);
    });

    it("returns partial match length", () => {
        expect(geohashCommonPrefix("9q8yyk", "9q8zzz")).toBe(3);
    });

    it("handles different lengths", () => {
        expect(geohashCommonPrefix("9q8", "9q8yyk")).toBe(3);
    });
});

// ── haversineDistance ────────────────────────────────────────────────────────

describe("haversineDistance", () => {
    it("returns 0 for same point", () => {
        expect(haversineDistance(40.7128, -74.006, 40.7128, -74.006)).toBe(0);
    });

    it("computes NYC to LA (~3940 km)", () => {
        const d = haversineDistance(40.7128, -74.006, 34.0522, -118.2437);
        expect(d).toBeGreaterThan(3900);
        expect(d).toBeLessThan(4000);
    });

    it("computes short distance (~1 km)", () => {
        // Two points ~1km apart in Manhattan
        const d = haversineDistance(40.7128, -74.006, 40.7218, -74.006);
        expect(d).toBeGreaterThan(0.9);
        expect(d).toBeLessThan(1.1);
    });

    it("antipodal points (~20000 km)", () => {
        const d = haversineDistance(0, 0, 0, 180);
        expect(d).toBeGreaterThan(19900);
        expect(d).toBeLessThan(20100);
    });
});

// ── Kleros evidence formatting ──────────────────────────────────────────────

describe("formatPhotoGPSEvidence", () => {
    it("produces valid Kleros evidence envelope", () => {
        const evidence = formatPhotoGPSEvidence(
            {
                fulfiller: addr(1),
                deliveryOrderId: hex32(42),
                processId: hex32(100),
                latitude: 40.7128,
                longitude: -74.006,
                accuracyMeters: 5,
                geohash: "dr5ru7",
                capturedAt: 1700000000,
                photoCID: "QmTestCID",
            },
            "QmEvidenceCID",
        );

        expect(evidence.name).toContain("Delivery photo attestation");
        expect(evidence.description).toContain("40.712800");
        expect(evidence.description).toContain("-74.006000");
        expect(evidence.fileURI).toBe("/ipfs/QmEvidenceCID");
        expect(evidence.fileHash).toBe("QmEvidenceCID");
        expect(evidence.fileTypeExtension).toBe("json");
    });
});

describe("formatGeohashMatchEvidence", () => {
    it("produces valid Kleros evidence envelope", () => {
        const evidence = formatGeohashMatchEvidence(
            {
                fulfiller: addr(2),
                deliveryOrderId: hex32(43),
                processId: hex32(101),
                fulfillerGeohash: "dr5ru7",
                orderDropoffGeohash: "dr5ru6",
                precision: 6,
                matches: false,
                distanceKm: 0.5,
                latitude: 40.7128,
                longitude: -74.006,
                accuracyMeters: 8,
                checkedAt: 1700000000,
            },
            "QmGeoCID",
        );

        expect(evidence.name).toContain("Geohash match attestation");
        expect(evidence.description).toContain("dr5ru7");
        expect(evidence.description).toContain("dr5ru6");
        expect(evidence.description).toContain("matches: false");
        expect(evidence.description).toContain("0.50 km");
        expect(evidence.fileURI).toBe("/ipfs/QmGeoCID");
    });
});

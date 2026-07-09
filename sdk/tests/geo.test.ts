import { describe, it, expect } from "vitest";
import {
    geohashesMatch,
    geohashCommonPrefix,
    haversineDistance,
    encodeGeohash,
    decodeGeohash,
    geohashCentroidDistanceKm,
} from "../src/extensions/geo.js";

// ── encodeGeohash ───────────────────────────────────────────────────────────

describe("encodeGeohash", () => {
    it("encodes a known point to its canonical hash", () => {
        // San Francisco — the reference cell the matching tests use.
        expect(encodeGeohash(37.7749, -122.4194, 6)).toBe("9q8yyk");
    });

    it("round-trips through decodeGeohash within the cell error", () => {
        const lat = 48.8584, lng = 2.2945;
        const hash = encodeGeohash(lat, lng, 9);
        const { lat: dLat, lng: dLng } = decodeGeohash(hash);
        expect(Math.abs(dLat - lat)).toBeLessThan(0.0001);
        expect(Math.abs(dLng - lng)).toBeLessThan(0.0001);
    });

    it("a shorter precision is a prefix of the longer encoding", () => {
        const full = encodeGeohash(37.7749, -122.4194, 12);
        expect(full.startsWith(encodeGeohash(37.7749, -122.4194, 6))).toBe(true);
        expect(full).toHaveLength(12);
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

// ── decodeGeohash ───────────────────────────────────────────────────────────

describe("decodeGeohash", () => {
    it("decodes the canonical example to its centroid (u4pruydqqvj ≈ 57.64911, 10.40744)", () => {
        const { lat, lng } = decodeGeohash("u4pruydqqvj");
        expect(lat).toBeCloseTo(57.64911, 4);
        expect(lng).toBeCloseTo(10.40744, 4);
    });

    it("decodes short hashes to coarser centroids (9q8yy ≈ San Francisco)", () => {
        const { lat, lng } = decodeGeohash("9q8yy");
        expect(lat).toBeGreaterThan(37.7);
        expect(lat).toBeLessThan(37.8);
        expect(lng).toBeGreaterThan(-122.5);
        expect(lng).toBeLessThan(-122.3);
    });

    it("is case-insensitive", () => {
        const a = decodeGeohash("U4PRUYDQQVJ");
        const b = decodeGeohash("u4pruydqqvj");
        expect(a.lat).toBe(b.lat);
        expect(a.lng).toBe(b.lng);
    });

    it("throws on an empty hash", () => {
        expect(() => decodeGeohash("")).toThrow(/empty/);
    });

    it("throws on characters outside the geohash alphabet (a, i, l, o)", () => {
        expect(() => decodeGeohash("9q8ya")).toThrow(/invalid/);
        expect(() => decodeGeohash("9q8yi")).toThrow(/invalid/);
    });
});

// ── geohashCentroidDistanceKm ───────────────────────────────────────────────

describe("geohashCentroidDistanceKm", () => {
    it("zero for the same cell", () => {
        expect(geohashCentroidDistanceKm("9q8yyk", "9q8yyk")).toBe(0);
    });

    it("SF to LA (~560 km) from precision-5 hashes", () => {
        // 9q8yy ≈ San Francisco, 9q5ct ≈ Los Angeles
        const d = geohashCentroidDistanceKm("9q8yy", "9q5ct");
        expect(d).toBeGreaterThan(500);
        expect(d).toBeLessThan(620);
    });

    it("adjacent precision-6 cells are sub-kilometre apart", () => {
        const d = geohashCentroidDistanceKm("9q8yyk", "9q8yym");
        expect(d).toBeGreaterThan(0);
        expect(d).toBeLessThan(1.5);
    });
});

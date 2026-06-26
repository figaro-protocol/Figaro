import { describe, it, expect } from "vitest";
import {
    geohashesMatch,
    geohashCommonPrefix,
    haversineDistance,
} from "../src/extensions/geo.js";

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

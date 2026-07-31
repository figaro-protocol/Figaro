/**
 * Public-disposition geohash precision cap — the geohash arm of the data
 * seam's grain cap. Locks the load-bearing property the clause spec states
 * ("the reader caps a public geohash to neighborhood (geohash ≤6 chars)"):
 * a PUBLIC geohash never lands door-grade on a plaintext/pinned artifact,
 * while a PRIVATE one (encrypted / content-withheld) keeps fine grain up to
 * the useful geohash ceiling. The cap is a pure prefix truncation — a
 * geohash prefix IS the containing cell — never a round-trip through
 * coordinates, and never a format gate: callers (OnboardingProfileForm on
 * every keystroke, GeohashFieldInput on raw typed input) rely on
 * truncate-don't-reject, with shape validation living elsewhere.
 */
import { describe, expect, it } from "vitest";

import {
    capGeohashGrain,
    clampPublicGeohash,
    geohashCapturePrecision,
    PRIVATE_GEOHASH_MAX_PRECISION,
    PUBLIC_GEOHASH_MAX_PRECISION,
} from "@/lib/shared/geohash";

describe("the precision constants (the clause spec's own numbers)", () => {
    it("public cap is 6 — the neighborhood cell the spec's '≤6 chars' names", () => {
        expect(PUBLIC_GEOHASH_MAX_PRECISION).toBe(6);
    });

    it("private ceiling is 12 — the fine-grain factory/machine bound", () => {
        expect(PRIVATE_GEOHASH_MAX_PRECISION).toBe(12);
    });
});

describe("clampPublicGeohash", () => {
    it("cuts a door-grade 9-char geohash to the 6-char neighborhood prefix", () => {
        expect(clampPublicGeohash("dr5regw3p")).toBe("dr5reg");
    });

    it("cuts a door-grade 8-char geohash to the 6-char neighborhood prefix", () => {
        expect(clampPublicGeohash("dr5regw3")).toBe("dr5reg");
    });

    it("truncates by prefix, never round-trips through coordinates — the output is a leading substring of the input", () => {
        const input = "u4pruydqqvj8";
        const out = clampPublicGeohash(input);
        expect(input.startsWith(out)).toBe(true);
        expect(out).toBe("u4pruy");
    });

    it("passes a 6-char geohash through unchanged (at-cap is not over-cap)", () => {
        expect(clampPublicGeohash("dr5reg")).toBe("dr5reg");
    });

    it.each(["d", "dr", "dr5", "dr5r", "dr5re"])(
        "passes the coarser-than-cap geohash %j through unchanged",
        (coarse) => {
            expect(clampPublicGeohash(coarse)).toBe(coarse);
        },
    );

    it("passes the empty string through as the empty string (no throw, no padding)", () => {
        expect(clampPublicGeohash("")).toBe("");
    });

    it("is length-only, not a format gate — a raw keystroke string is capped, not rejected (callers clamp on every onChange)", () => {
        // Non-base32 junk still comes back length-capped; shape validation
        // is the caller's pattern check, not this function's job.
        expect(clampPublicGeohash("not-a-geohash")).toBe("not-a-");
        // A jurisdiction-style coarse code is below the cap and untouched.
        expect(clampPublicGeohash("US-NY")).toBe("US-NY");
    });
});

describe("capGeohashGrain (cap by disposition)", () => {
    it("caps a PUBLIC door-grade geohash to the 6-char neighborhood prefix", () => {
        expect(capGeohashGrain("public", "dr5regw3p")).toBe("dr5reg");
    });

    it("treats an ABSENT disposition as public — the default is the coarse commons, never fine grain", () => {
        expect(capGeohashGrain(undefined, "dr5regw3p")).toBe("dr5reg");
    });

    it("leaves a PRIVATE fine-grain geohash intact up to the 12-char ceiling", () => {
        expect(capGeohashGrain("private", "u4pruydqqvj8")).toBe("u4pruydqqvj8");
    });

    it("bounds even a PRIVATE geohash at the 12-char useful ceiling", () => {
        expect(capGeohashGrain("private", "u4pruydqqvj8xyz")).toBe("u4pruydqqvj8");
    });

    it("passes shorter-than-cap inputs through unchanged for both dispositions", () => {
        expect(capGeohashGrain("public", "dr5")).toBe("dr5");
        expect(capGeohashGrain("private", "dr5")).toBe("dr5");
        expect(capGeohashGrain(undefined, "")).toBe("");
    });
});

describe("geohashCapturePrecision (device-capture mirror of the cap)", () => {
    it("captures at neighborhood grain for public and absent dispositions — a public device capture can never overshoot the cap", () => {
        expect(geohashCapturePrecision("public")).toBe(PUBLIC_GEOHASH_MAX_PRECISION);
        expect(geohashCapturePrecision(undefined)).toBe(PUBLIC_GEOHASH_MAX_PRECISION);
    });

    it("captures at fine grain for private disposition", () => {
        expect(geohashCapturePrecision("private")).toBe(PRIVATE_GEOHASH_MAX_PRECISION);
    });
});

/**
 * The geohash grain cap's truncation functions (`sdk/src/clauses/grain.ts`).
 * A PUBLIC geohash never lands door-grade on a plaintext or pinned artifact,
 * while a PRIVATE one keeps fine grain up to the useful geohash ceiling. The
 * truncation is a pure prefix cut, since a geohash prefix is its containing
 * cell, never a round-trip through coordinates. The frontend's form inputs
 * (OnboardingProfileForm on every keystroke, GeohashFieldInput on raw typed
 * input) truncate with these; `validateContent` refuses a value past the same
 * cap (`validate.test.ts`, `examples.test.ts`).
 */
import { describe, expect, it } from "vitest";

import {
    capGeohashGrain,
    clampPublicGeohash,
    GEOHASH_FORMAT,
    geohashCapturePrecision,
    grainCapOf,
    grainOf,
    H3_FORMAT,
    OLC_FORMAT,
    S2_FORMAT,
    PRIVATE_GEOHASH_MAX_PRECISION,
    PUBLIC_GEOHASH_MAX_PRECISION,
} from "../../src/clauses/index.js";

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

describe("grainOf and grainCapOf (the grade each capped standard writes in its code)", () => {
    it("reads an H3 cell index's resolution from bits 52 to 55, as the H3 documentation's examples carry it", () => {
        expect(grainOf(H3_FORMAT, "85283473fffffff")).toBe(5);
        expect(grainOf(H3_FORMAT, "8828308281fffff")).toBe(8);
        expect(grainOf(H3_FORMAT, "8928308280fffff")).toBe(9);
        expect(grainOf(H3_FORMAT, "8f28308280db6db")).toBe(15);
    });

    it("refuses an H3 value that is no cell index: another mode, a digit past the resolution that is not 7, no hex", () => {
        for (const v of ["9828308281fffff", "8828308281ffffe", "g828308281fffff", "", "8f28308280db6db0"]) {
            expect(grainOf(H3_FORMAT, v), v).toBeNull();
        }
    });

    it("reads an S2 token's level from its lowest set bit", () => {
        expect(grainOf(S2_FORMAT, "9")).toBe(0);
        expect(grainOf(S2_FORMAT, "89c25")).toBe(8);
        expect(grainOf(S2_FORMAT, "89c259b4")).toBe(13);
        expect(grainOf(S2_FORMAT, "89c259b1")).toBe(14);
        expect(grainOf(S2_FORMAT, "89c259b1e3d47a4b")).toBe(30);
    });

    it("refuses an S2 value that is no cell token: an odd lowest bit, a lowest bit above bit 60, face 6, the none token", () => {
        for (const v of ["89c259b2", "4", "40", "c", "X", "", "89c259b1e3d47a4b0"]) expect(grainOf(S2_FORMAT, v), v).toBeNull();
    });

    it("reads an Open Location Code's length: padded, full and short codes", () => {
        expect(grainOf(OLC_FORMAT, "8F000000+")).toBe(2);
        expect(grainOf(OLC_FORMAT, "8FVC9G00+")).toBe(6);
        expect(grainOf(OLC_FORMAT, "8fvc9g00+")).toBe(6);
        expect(grainOf(OLC_FORMAT, "8FVC9G8F+")).toBe(8);
        expect(grainOf(OLC_FORMAT, "8FVC9G8F+6X")).toBe(10);
        // A short code keeps the precision of the full code it came from.
        expect(grainOf(OLC_FORMAT, "9G8F+6X")).toBe(10);
        expect(grainOf(OLC_FORMAT, "8FVC9G8F+6X23456")).toBe(15);
    });

    it("refuses an Open Location Code value that is no code", () => {
        for (const v of ["8FVC9G80+", "8FVC9G8F+6", "8FVC9G8F", "8FVC9G00+6X", "FFVC9G00+", "8FVC9G8F+6X234567", "8FVC+9G8F+", ""]) {
            expect(grainOf(OLC_FORMAT, v), v).toBeNull();
        }
    });

    it("carries the public and private cap of each standard, and none of a standard it does not know", () => {
        expect(grainCapOf(GEOHASH_FORMAT)).toMatchObject({ public: 6, private: 12 });
        expect(grainCapOf(H3_FORMAT)).toMatchObject({ public: 8, private: 15 });
        expect(grainCapOf(S2_FORMAT)).toMatchObject({ public: 13, private: 30 });
        expect(grainCapOf(OLC_FORMAT)).toMatchObject({ public: 6, private: 15 });
        expect(grainCapOf("maidenhead")).toBeUndefined();
        expect(grainCapOf("toString")).toBeUndefined();
        expect(grainOf("maidenhead", "JN47uv")).toBeUndefined();
    });
});

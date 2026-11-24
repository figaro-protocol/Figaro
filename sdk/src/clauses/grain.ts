/**
 * The grain cap: cap(disposition, geocodeStandard) for each standard whose
 * grain this reader knows: geohash, H3, S2 and Open Location Code.
 *
 * A clause spec carries the structural ceiling (`maxLength`) and the
 * attributes the cap reads: a field's `disposition` and its resolved format,
 * static or named by a sibling (`format`, or the sibling value
 * `formatFromField` names). An array item's format is its static `format`,
 * and the array field's disposition governs it. A PUBLIC location code is
 * neighborhood grade, never door grade, because its plaintext lands on a
 * public artifact (a pinned profile, a plaintext agreement field). A PRIVATE
 * one keeps fine grain, because its plaintext never lands on a public
 * artifact. Door-level detail on a public field travels only inside the
 * per-order addressee envelope. A standard this reader carries no grain
 * knowledge of is bounded by the field's `maxLength` only.
 *
 * Each standard writes its grain in the code in its own way, and this module
 * reads it there:
 *
 * - `geohash`: the code's length in characters (UTF-16 units).
 * - `h3`: the resolution, bits 52 to 55 of the 64-bit cell index written in
 *   hex.
 * - `s2`: the cell level, read from the lowest set bit of the 64-bit cell id
 *   its token writes in hex with the trailing zeros dropped.
 * - `olc` (Open Location Code): the code length, its count of significant
 *   digits.
 *
 * The public cap of each is the finest grade whose cells are, on average, no
 * smaller than a six-character geohash cell at 45 degrees of latitude (about
 * 1.2 km by 0.43 km, 0.53 km²): H3 resolution 8 (0.74 km² on average;
 * resolution 9 is 0.11 km²), S2 level 13 (1.27 km²; level 14 is 0.32 km²),
 * an Open Location Code of length 6 (0.05 degrees a side; length 8 is 0.0025
 * degrees a side, about 0.05 km²). The private cap is the standard's own
 * finest grade, except geohash's, which stops at 12 characters, where its
 * precision saturates.
 *
 * A value whose grain cannot be read, because it is not a code of the named
 * standard, is refused under a capped standard: its grain is unknown, so no
 * cap can be shown to hold.
 *
 * `validateContent` refuses a value finer than the cap; a form input
 * truncates to it. Both read these functions, so the rule has one home.
 */

import type { FieldDisposition } from "./spec.js";

/** The format keys whose grain this module caps. */
export const GEOHASH_FORMAT = "geohash";
export const H3_FORMAT = "h3";
export const S2_FORMAT = "s2";
export const OLC_FORMAT = "olc";

/** 6 characters, about 1.2 km by 0.6 km: the neighborhood cell, the PUBLIC cap. */
export const PUBLIC_GEOHASH_MAX_PRECISION = 6;

/** 12 characters, about 3.7 cm: the finest grain a PRIVATE geohash carries
 *  (the factory or machine case). Geohash precision saturates around here. */
export const PRIVATE_GEOHASH_MAX_PRECISION = 12;

/** A standard's grain cap: its public grade, its private grade, and the name
 *  a message gives the grade. */
export interface GrainCap {
    readonly public: number;
    readonly private: number;
    readonly grade: string;
}

const GRAIN_CAPS: ReadonlyMap<string, GrainCap> = new Map([
    [GEOHASH_FORMAT, { public: PUBLIC_GEOHASH_MAX_PRECISION, private: PRIVATE_GEOHASH_MAX_PRECISION, grade: "characters" }],
    [H3_FORMAT, { public: 8, private: 15, grade: "resolution" }],
    [S2_FORMAT, { public: 13, private: 30, grade: "level" }],
    [OLC_FORMAT, { public: 6, private: 15, grade: "code length" }],
]);

/** The cap of a format, or `undefined` when this reader carries no grain
 *  knowledge of it. */
export function grainCapOf(format: string | undefined): GrainCap | undefined {
    return format === undefined ? undefined : GRAIN_CAPS.get(format);
}

/** The grade a cap allows a value of this disposition. Absent reads as
 *  public, the default. */
export function capOfDisposition(cap: GrainCap, disposition: FieldDisposition | undefined): number {
    return disposition === "private" ? cap.private : cap.public;
}

/** The precision cap for a geohash of this disposition: coarse when public,
 *  fine when private. Disposition absent reads as public, the default. A
 *  device capture encodes at this precision. */
export function geohashCapturePrecision(disposition: FieldDisposition | undefined): number {
    return disposition === "private" ? PRIVATE_GEOHASH_MAX_PRECISION : PUBLIC_GEOHASH_MAX_PRECISION;
}

/** Truncate a geohash to the public cap. A geohash prefix is its containing
 *  cell, so the truncation never round-trips through coordinates. */
export function clampPublicGeohash(geohash: string): string {
    return geohash.slice(0, PUBLIC_GEOHASH_MAX_PRECISION);
}

/** Truncate a geohash to the cap of its disposition. */
export function capGeohashGrain(disposition: FieldDisposition | undefined, geohash: string): string {
    return geohash.slice(0, geohashCapturePrecision(disposition));
}

/**
 * The grade a value carries under a format this module caps: a geohash's
 * length, an H3 index's resolution, an S2 token's level, an Open Location
 * Code's length. `null` when the value is not a code of that format, and
 * `undefined` when the format is not one this module caps.
 */
export function grainOf(format: string, value: string): number | null | undefined {
    switch (format) {
        case GEOHASH_FORMAT: return value.length;
        case H3_FORMAT: return h3Resolution(value);
        case S2_FORMAT: return s2Level(value);
        case OLC_FORMAT: return olcCodeLength(value);
        default: return undefined;
    }
}

/** 1 to 16 ASCII hex digits: a 64-bit word written in hex. */
const HEX_WORD = /^[0-9a-fA-F]{1,16}$/;

/**
 * An H3 cell index's resolution. The H3 index representation: bit 63 is 0,
 * bits 59 to 62 hold mode 1 (a cell), bits 56 to 58 are 0, bits 52 to 55
 * hold the resolution, bits 45 to 51 the base cell (under 122), then fifteen
 * 3-bit digits, each 0 to 6 up to the resolution and 7 past it. The index is
 * written in hex, 1 to 16 digits. `null` when the value is no cell index.
 */
function h3Resolution(value: string): number | null {
    if (!HEX_WORD.test(value)) return null;
    const index = BigInt(`0x${value}`);
    const bits = (shift: number, mask: number): number => Number((index >> BigInt(shift)) & BigInt(mask));
    if (bits(63, 0x1) !== 0 || bits(59, 0xf) !== 1 || bits(56, 0x7) !== 0) return null;
    if (bits(45, 0x7f) >= 122) return null;
    const resolution = bits(52, 0xf);
    for (let r = 1; r <= 15; r++) {
        const digit = bits(3 * (15 - r), 0x7);
        if (r <= resolution ? digit === 7 : digit !== 7) return null;
    }
    return resolution;
}

/**
 * An S2 cell token's level. An S2 cell id is 3 face bits (a face under 6),
 * then 2 bits a level, then a 1 bit and zeros; its token is the id in hex
 * with the trailing zeros dropped, 1 to 16 digits. The level is 30 less half
 * the count of trailing zero bits, so the lowest set bit is at most bit 60,
 * the level-0 cell's: an id whose lowest set bit is higher (the token `4`)
 * is no cell id. `null` when the value is no cell token.
 */
function s2Level(value: string): number | null {
    if (!HEX_WORD.test(value)) return null;
    const id = BigInt(`0x${value.padEnd(16, "0")}`);
    if (id === 0n || id >> 61n > 5n) return null;
    let zeros = 0;
    while (((id >> BigInt(zeros)) & 1n) === 0n) zeros++;
    if (zeros % 2 !== 0 || zeros > 60) return null;
    return 30 - zeros / 2;
}

/** The Open Location Code's twenty digits, upper case. */
const OLC_DIGITS = "23456789CFGHJMPQRVWX";
/** The characters an Open Location Code is written in: its digits in either
 *  case, the padding `0` and the separator `+`. */
const OLC_CHARACTERS = /^[23456789CFGHJMPQRVWXcfghjmpqrvwx0+]+$/;
/** Where a full code puts its separator. */
const OLC_SEPARATOR_POSITION = 8;
/** The longest code length the specification allows. */
const OLC_MAX_LENGTH = 15;

/**
 * An Open Location Code's length, the count of its significant digits, read
 * as the Open Location Code specification writes it. A full code puts the
 * `+` separator after 8 characters. A padded code ends at the separator, and
 * its padding is an even run of `0` that closes the part before it. A short
 * code drops leading pairs and puts the separator earlier, and keeps the
 * precision of the full code it came from: 8 plus the digits after the
 * separator. The digits after the separator are never one alone. `null` when
 * the value is no code, or is longer than 15 digits.
 */
function olcCodeLength(value: string): number | null {
    if (!OLC_CHARACTERS.test(value)) return null;
    const code = value.toUpperCase();
    const separator = code.indexOf("+");
    if (separator < 2 || separator > OLC_SEPARATOR_POSITION || separator % 2 !== 0) return null;
    if (code.indexOf("+", separator + 1) !== -1) return null;
    const before = code.slice(0, separator);
    const after = code.slice(separator + 1);
    if (after.includes("0") || after.length === 1) return null;
    const padding = before.indexOf("0");
    if (padding !== -1) {
        if (separator !== OLC_SEPARATOR_POSITION || padding === 0 || padding % 2 !== 0 || after.length !== 0) return null;
        if (!/^0+$/.test(before.slice(padding))) return null;
    }
    if (separator === OLC_SEPARATOR_POSITION) {
        if (OLC_DIGITS.indexOf(code[0]) >= 9 || OLC_DIGITS.indexOf(code[1]) >= 18) return null;
    }
    const length = padding !== -1 ? padding : OLC_SEPARATOR_POSITION + after.length;
    return length > OLC_MAX_LENGTH ? null : length;
}

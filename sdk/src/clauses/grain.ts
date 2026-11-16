/**
 * The geohash grain cap: cap(disposition, geocodeStandard) when the standard
 * is geohash.
 *
 * A clause spec carries the structural ceiling (`maxLength`) and the
 * attributes the cap reads: a field's `disposition` and its resolved format
 * (`format`, or the sibling value `formatFromField` names). A PUBLIC geohash
 * is neighborhood grade, never door grade, because its plaintext lands on a
 * public artifact (a pinned profile, a plaintext agreement field). A PRIVATE
 * one keeps fine grain, because its plaintext never lands on a public
 * artifact. Door-level detail on a public field travels only inside the
 * per-order addressee envelope. A standard this reader carries no grain
 * knowledge of is bounded by the field's `maxLength` only.
 *
 * `validateContent` refuses a value finer than the cap; a form input
 * truncates to it. Both read these functions, so the rule has one home.
 */

import type { FieldDisposition } from "./spec.js";

/** The format key whose grain this module caps. */
export const GEOHASH_FORMAT = "geohash";

/** 6 characters, about 1.2 km by 0.6 km: the neighborhood cell, the PUBLIC cap. */
export const PUBLIC_GEOHASH_MAX_PRECISION = 6;

/** 12 characters, about 3.7 cm: the finest grain a PRIVATE geohash carries
 *  (the factory or machine case). Geohash precision saturates around here. */
export const PRIVATE_GEOHASH_MAX_PRECISION = 12;

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

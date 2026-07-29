/**
 * Public-surface geohash policy — the geohash arm of the data seam's grain cap.
 *
 * Geohash encode/decode is generic geo math and lives in the SDK
 * (`@figaro/sdk/derive`). This module owns the frontend's precision cap by
 * DISPOSITION: a PUBLIC geohash (the coordination commons — a pinned seller
 * profile, a plaintext agreement field) is neighborhood-grade, never
 * door-grade; a PRIVATE one (encrypted / content-withheld — the factory /
 * machine scenario) keeps fine grain, because its plaintext never lands on a
 * public artifact. Door-level detail on a public field travels only inside the
 * per-order ECDH addressee envelope (`lib/handoff/addressDetail.ts`), where it
 * stays deletable (EDPB 02/2025: minimise location data on pinned / immutable
 * media). This is the geohash-standard case of `cap(disposition,
 * geocodeStandard)`; unknown standards carry no reader grain knowledge and are
 * bounded only by the field's `maxLength`.
 */

import type { FieldDisposition } from "@figaro/sdk/clauses";

/** 6 chars ≈ 1.2 km × 0.6 km — the neighborhood cell (the PUBLIC grain cap). */
export const PUBLIC_GEOHASH_MAX_PRECISION = 6;

/** 12 chars ≈ 3.7 cm — the finest grain a PRIVATE geohash carries (the
 *  factory / machine case). Bounded well within the geolocation field's
 *  maxLength; geohash precision saturates around here. */
export const PRIVATE_GEOHASH_MAX_PRECISION = 12;

/** Clamp a geohash to the public-surface precision cap. Applied wherever a
 *  geohash enters a public artifact; a finer hash a party typed or a device
 *  produced is truncated, never round-tripped through coordinates. */
export function clampPublicGeohash(geohash: string): string {
    return geohash.slice(0, PUBLIC_GEOHASH_MAX_PRECISION);
}

/** cap(disposition, geohash) — coarsen a PUBLIC geohash to neighborhood grain
 *  (GDPR: no door-grade location on a public/pinned artifact); leave a PRIVATE
 *  one at fine grain (bounded to the useful geohash ceiling), since it lives
 *  encrypted / content-withheld, off the public commons. Disposition absent ⇒
 *  public (the default). */
export function capGeohashGrain(disposition: FieldDisposition | undefined, geohash: string): string {
    return disposition === "private"
        ? geohash.slice(0, PRIVATE_GEOHASH_MAX_PRECISION)
        : clampPublicGeohash(geohash);
}

/** The device-capture precision for a geohash field of this disposition —
 *  coarse for public, fine for private. Mirrors `capGeohashGrain`. */
export function geohashCapturePrecision(disposition: FieldDisposition | undefined): number {
    return disposition === "private" ? PRIVATE_GEOHASH_MAX_PRECISION : PUBLIC_GEOHASH_MAX_PRECISION;
}

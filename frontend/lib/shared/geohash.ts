/**
 * Public-surface geohash policy.
 *
 * Geohash encode/decode is generic geo math and lives in the SDK
 * (`@figaro/core/extensions`). This module owns the frontend's PUBLIC
 * precision cap: a geohash that lands on a public artifact — a pinned
 * seller profile, an agreement clause field — is neighborhood-grade,
 * never door-grade. Door-level detail travels only inside the per-order
 * ECDH addressee envelope (`lib/handoff/addressDetail.ts`), where it
 * stays deletable (EDPB 02/2025: minimise location data on pinned /
 * immutable media).
 */

/** 6 chars ≈ 1.2 km × 0.6 km — the neighborhood cell. */
export const PUBLIC_GEOHASH_MAX_PRECISION = 6;

/** Clamp a geohash to the public-surface precision cap. Applied wherever a
 *  geohash enters a public artifact; a finer hash a party typed or a device
 *  produced is truncated, never round-tripped through coordinates. */
export function clampPublicGeohash(geohash: string): string {
    return geohash.slice(0, PUBLIC_GEOHASH_MAX_PRECISION);
}

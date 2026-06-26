/**
 * @figaro/core/extensions — Geo math
 *
 * Geohash prefix matching and Haversine distance. Pure, standard geo
 * primitives with no knowledge of any clause, attestation mode, or
 * arbitration provider — callers compose them into whatever proximity or
 * handoff logic their clause spec defines.
 */

// ── Geohash matching ────────────────────────────────────────────────────────

/**
 * Compare two geohashes at a given precision.
 * Returns true if the prefixes match at the specified length.
 *
 * Default precision: 6 characters (~1.2km × 0.6km).
 */
export function geohashesMatch(
    geohash1: string,
    geohash2: string,
    precision: number = 6,
): boolean {
    if (!geohash1 || !geohash2) return false;
    return geohash1.substring(0, precision) === geohash2.substring(0, precision);
}

/**
 * Get the common prefix length of two geohashes.
 * Longer prefix = closer locations.
 */
export function geohashCommonPrefix(geohash1: string, geohash2: string): number {
    const len = Math.min(geohash1.length, geohash2.length);
    for (let i = 0; i < len; i++) {
        if (geohash1[i] !== geohash2[i]) return i;
    }
    return len;
}

// ── Haversine distance ──────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;

/**
 * Compute Haversine distance between two lat/lng points in kilometers.
 */
export function haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

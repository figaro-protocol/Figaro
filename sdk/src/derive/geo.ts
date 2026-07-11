/**
 * @figaro/sdk/derive — Geo math
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

// ── Geohash encoding / decoding ─────────────────────────────────────────────

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/**
 * Encode a lat/lng to a geohash of the given precision — the standard base32
 * interleaved encoding (the inverse of `decodeGeohash`).
 *
 * Default precision: 6 characters (~1.2km × 0.6km).
 */
export function encodeGeohash(lat: number, lng: number, precision: number = 6): string {
    let idx = 0;
    let bit = 0;
    let evenBit = true;
    let hash = "";
    let minLat = -90,
        maxLat = 90,
        minLng = -180,
        maxLng = 180;

    while (hash.length < precision) {
        if (evenBit) {
            const midLng = (minLng + maxLng) / 2;
            if (lng >= midLng) {
                idx = (idx << 1) | 1;
                minLng = midLng;
            } else {
                idx = idx << 1;
                maxLng = midLng;
            }
        } else {
            const midLat = (minLat + maxLat) / 2;
            if (lat >= midLat) {
                idx = (idx << 1) | 1;
                minLat = midLat;
            } else {
                idx = idx << 1;
                maxLat = midLat;
            }
        }
        evenBit = !evenBit;
        if (++bit === 5) {
            hash += BASE32[idx];
            bit = 0;
            idx = 0;
        }
    }
    return hash;
}

/**
 * Decode a geohash to its cell's centroid lat/lng.
 *
 * The inverse of the standard base32 interleaved encoding: walks the hash
 * narrowing the lat/lng bounds, then returns the cell's midpoint. Centroid
 * error is bounded by the cell size (precision 6 ≈ 1.2km × 0.6km), so the
 * caller chooses precision by authoring longer or shorter hashes.
 *
 * Throws on an empty hash or a character outside the geohash base32
 * alphabet — a malformed committed value must surface, never decode to junk.
 */
export function decodeGeohash(geohash: string): { lat: number; lng: number } {
    if (!geohash) throw new Error("decodeGeohash: empty geohash");
    let evenBit = true;
    let minLat = -90,
        maxLat = 90,
        minLng = -180,
        maxLng = 180;
    for (const char of geohash.toLowerCase()) {
        const idx = BASE32.indexOf(char);
        if (idx === -1) throw new Error(`decodeGeohash: invalid geohash character "${char}"`);
        for (let bit = 4; bit >= 0; bit--) {
            const set = (idx >> bit) & 1;
            if (evenBit) {
                const midLng = (minLng + maxLng) / 2;
                if (set) minLng = midLng;
                else maxLng = midLng;
            } else {
                const midLat = (minLat + maxLat) / 2;
                if (set) minLat = midLat;
                else maxLat = midLat;
            }
            evenBit = !evenBit;
        }
    }
    return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
}

/**
 * Great-circle (Haversine) distance between two geohash cell centroids, in
 * kilometers. Crow-flies over centroids — the only distance derivable from
 * two committed geohashes alone (routed road distance needs an external
 * source, which is a composition concern, not geo math).
 */
export function geohashCentroidDistanceKm(geohash1: string, geohash2: string): number {
    const a = decodeGeohash(geohash1);
    const b = decodeGeohash(geohash2);
    return haversineDistance(a.lat, a.lng, b.lat, b.lng);
}

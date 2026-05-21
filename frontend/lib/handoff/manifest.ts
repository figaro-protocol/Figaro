/**
 * Figaro handoff geohash + logistics utilities.
 *
 * Self-contained geohash encode / bounds / distance, class-of-service
 * labels, and the well-known manifest schema-id constants. Used by the
 * physical-handoff surfaces (delivery-location capture, courier proximity,
 * operator service areas).
 *
 * The legacy on-chain manifest codec — encode/decode/seal of a v1–v7
 * pipe-separated manifest blob — was removed. The kernel Commitment carries
 * no manifest field; an order's content is its agreementHash (the merkle
 * root over agreement sections), and order logistics travel as the
 * figaro-geo-v2 agreement section. The codec targeted an on-chain `bytes
 * manifest` parameter that the V5 kernel does not have.
 */

// ---------------------------------------------------------------------------
// Geohash encoding (self-contained, no external dependency)
// ---------------------------------------------------------------------------
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function encodeGeohash(lat: number, lon: number, precision = 6): string {
    let idx = 0;
    let bit = 0;
    let evenBit = true;
    let hash = "";
    let minLat = -90,
        maxLat = 90,
        minLon = -180,
        maxLon = 180;

    while (hash.length < precision) {
        if (evenBit) {
            const midLon = (minLon + maxLon) / 2;
            if (lon >= midLon) {
                idx = (idx << 1) | 1;
                minLon = midLon;
            } else {
                idx = idx << 1;
                maxLon = midLon;
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

/** Returns [minLat, maxLat, minLon, maxLon] bounding box for a geohash. */
export function geohashBounds(hash: string): [number, number, number, number] {
    let evenBit = true;
    let minLat = -90,
        maxLat = 90,
        minLon = -180,
        maxLon = 180;
    for (const c of hash) {
        const chr = BASE32.indexOf(c);
        if (chr < 0) break;
        for (let i = 4; i >= 0; i--) {
            const bit = (chr >> i) & 1;
            if (evenBit) {
                const midLon = (minLon + maxLon) / 2;
                if (bit) minLon = midLon;
                else maxLon = midLon;
            } else {
                const midLat = (minLat + maxLat) / 2;
                if (bit) minLat = midLat;
                else maxLat = midLat;
            }
            evenBit = !evenBit;
        }
    }
    return [minLat, maxLat, minLon, maxLon];
}

/** Centre point of a geohash cell. */
export function geohashCenter(hash: string): { lat: number; lon: number } {
    const [minLat, maxLat, minLon, maxLon] = geohashBounds(hash);
    return { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
}

// ---------------------------------------------------------------------------
// Approximate distance (km) between two geohash centres (Haversine)
// ---------------------------------------------------------------------------
export function geohashDistance(a: string, b: string): number {
    const ca = geohashCenter(a);
    const cb = geohashCenter(b);
    const R = 6371;
    const φ1 = (ca.lat * Math.PI) / 180;
    const φ2 = (cb.lat * Math.PI) / 180;
    const dφ = ((cb.lat - ca.lat) * Math.PI) / 180;
    const dλ = ((cb.lon - ca.lon) * Math.PI) / 180;
    const x =
        Math.sin(dφ / 2) * Math.sin(dφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) * Math.sin(dλ / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// ---------------------------------------------------------------------------
// Class of service
// ---------------------------------------------------------------------------
export const COS_OPTIONS = [
    { value: "S", label: "Standard", description: "Room temperature, not fragile" },
    { value: "E", label: "Express", description: "Priority – 30 min window" },
    { value: "F", label: "Fragile", description: "Handle with care" },
    { value: "C", label: "Cold Chain", description: "Refrigerated transport required" },
] as const;
export type CoS = "S" | "E" | "F" | "C";

export function cosLabel(cos: string): string {
    return COS_OPTIONS.find((o) => o.value === cos)?.label ?? cos;
}

// ---------------------------------------------------------------------------
// Manifest schema IDs
// ---------------------------------------------------------------------------

/**
 * Well-known schema IDs. These are keccak256 of the schema key string,
 * matching what ManifestSchemaRegistry stores on-chain.
 *
 * The schema ID identifies the manifest encoding format. The protocol core
 * treats manifest bytes as opaque — the schema tells the UI how to decode.
 */
export const MANIFEST_SCHEMAS = {
    /** Fulfilment-composition: modality + coordination + handoff point. */
    FULFILMENT_V2: "figaro-fulfilment-v2",
    /** Commerce manifest: handoff fields + itemized line items. */
    COMMERCE_V1: "figaro-commerce-v1",
} as const;

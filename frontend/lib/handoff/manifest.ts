/**
 * Figaro handoff geohash utility.
 *
 * Self-contained geohash encode. Used by the physical-handoff surfaces
 * (delivery-location capture, courier proximity, seller service areas).
 *
 * The legacy on-chain manifest codec — encode/decode/seal of a v1–v7
 * pipe-separated manifest blob — was removed. The kernel Commitment carries
 * no manifest field; an order's content is its agreementHash (the merkle
 * root over agreement sections), and order logistics travel as the
 * geo agreement section. The codec targeted an on-chain `bytes
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

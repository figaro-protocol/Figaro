/**
 * @figaro/sdk/derive — Clause-agnostic SDK utilities
 *
 * Generic helpers layered on top of the core SDK, carrying no knowledge of any
 * specific clause, mechanism, or provider.
 * Import via: `import { ... } from "@figaro/sdk/derive"`
 *
 * Modules:
 * - Attestation: clause-agnostic event filtering (clause-key derivation is
 *   `computeClauseKey`, a root export)
 * - Geo math: geohash encode/decode, prefix matching, Haversine distance
 */

// ── Attestation filtering ───────────────────────────────────────────────────

export {
    filterByClause,
    filterByProcess,
    filterByOrder,
    filterByStage,
} from "./attestation.js";

// ── Geo math ────────────────────────────────────────────────────────────────

export {
    geohashesMatch,
    geohashCommonPrefix,
    haversineDistance,
    encodeGeohash,
    decodeGeohash,
    geohashCentroidDistanceKm,
} from "./geo.js";

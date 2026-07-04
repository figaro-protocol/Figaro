/**
 * @figaro/core/extensions — Clause-agnostic SDK utilities
 *
 * Generic helpers layered on top of the core SDK, carrying no knowledge of any
 * specific clause, mechanism, or provider.
 * Import via: `import { ... } from "@figaro/core/extensions"`
 *
 * Modules:
 * - Attestation: clause-ID derivation, clause-agnostic event filtering
 * - Geo math: geohash prefix matching, Haversine distance
 */

// ── Clause ID & Attestation filtering ──────────────────────────────────────

export {
    computeClauseId,
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
    decodeGeohash,
    geohashCentroidDistanceKm,
} from "./geo.js";

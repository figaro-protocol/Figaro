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
 * - Withdraw gate: the commits==resolves stake-reclaim gate — in-flight deals
 *   composed from a clause or assembly, derived from chain + IPFS
 */

// ── Attestation filtering ───────────────────────────────────────────────────

export {
    filterByClause,
    filterByProcess,
    filterByOrder,
    filterByStage,
} from "./attestation.js";

// ── Withdraw gate (commits==resolves) ─────────────────────────────────────────

export {
    deriveInFlightOrders,
    deriveClauseWithdrawGate,
    deriveAssemblyWithdrawGate,
} from "./withdraw.js";
export type {
    InFlightOrderRef,
    InFlightAgreement,
    WithdrawGate,
} from "./withdraw.js";

// ── Geo math ────────────────────────────────────────────────────────────────

export {
    geohashesMatch,
    geohashCommonPrefix,
    haversineDistance,
    encodeGeohash,
    decodeGeohash,
    geohashCentroidDistanceKm,
} from "./geo.js";

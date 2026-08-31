/**
 * @figaro-protocol/sdk/derive — Clause-agnostic SDK utilities
 *
 * Generic helpers layered on top of the core SDK, carrying no knowledge of any
 * specific clause, mechanism, or provider.
 * Import via: `import { ... } from "@figaro-protocol/sdk/derive"`
 *
 * Modules:
 * - Attestation: clause-agnostic event filtering (clause-key derivation is
 *   `computeClauseKey`, a root export)
 * - Witness content addressing: the fingerprint→content-address derivation —
 *   an Attestation event's `contentRef` IS the keccak-CID digest of the
 *   published preimage; pure, all IPFS I/O stays with the caller
 * - Geo math: geohash encode/decode, prefix matching, Haversine distance
 * - Withdraw gate: the commits==resolves stake-reclaim gate — in-flight deals
 *   composed from a clause or assembly, derived from chain + IPFS
 * - Truth boundaries: the trust labels of docs/DATA_LAYER.md — every
 *   graph projection names the guarantee behind its rows
 * - Base graphs: Process + Settlement projections (protocol-enforced), pure
 *   folds over already-fetched core events
 * - Overlays: per-clause-family attestation streams (the open graph class),
 *   spec-decoded via the caller's SpecSource, fingerprint-only on absence
 * - Composition: venue-parameterized fifth-noun projections — the value-flow
 *   graph over settlement denominations + caller-parsed swap legs
 * - Queries: market-shape and wallet-record, thin folds over the graphs
 */

// ── Attestation filtering ───────────────────────────────────────────────────

export {
    filterByClause,
    filterByProcess,
    filterByOrder,
    filterByStage,
} from "./attestation.js";

// ── Witness content addressing ──────────────────────────────────────────────

export { witnessContentCid, witnessContentCidBase32 } from "./witnessContent.js";

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

// ── Truth boundaries ────────────────────────────────────────────────────────

export { TRUTH_BOUNDARY_GLOSS } from "./truth.js";
export type { TruthBoundary } from "./truth.js";

// ── Base-graph projections (Process + Settlement) ───────────────────────────

export { projectProcessGraph, projectSettlementGraph } from "./graphs.js";
export type {
    ProcessGraph,
    SettlementGraph,
    SettlementChain,
    SettlementEntry,
} from "./graphs.js";

// ── Overlay extraction (the open graph class) ───────────────────────────────

export { extractOverlays } from "./overlay.js";
export type {
    RecoveredAttestation,
    OverlayEntry,
    OverlayGraph,
} from "./overlay.js";

// ── Composition projections (venue-parameterized) ───────────────────────────

export { projectValueFlow } from "./composition.js";
export type {
    VenueEvent,
    SwapLeg,
    ValueFlowNode,
    ValueFlowEdge,
    ValueFlowGraph,
} from "./composition.js";

// ── Canonical graph queries ─────────────────────────────────────────────────

export { marketShape, walletRecord } from "./queries.js";
export type {
    ChainShape,
    DenominationVolume,
    MarketShapeGroup,
    MarketShape,
    WalletRecord,
} from "./queries.js";

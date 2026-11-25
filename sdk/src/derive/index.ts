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
 * - Withdraw gate: the commits==resolves stake-reclaim gate — in-flight trades
 *   composed from a clause or assembly, derived from chain + IPFS
 * - Truth boundaries: the trust labels of docs/DATA_LAYER.md — every
 *   graph projection names the guarantee behind its rows
 * - Base graphs: Process + Resolution projections (protocol-enforced), pure
 *   folds over already-fetched core events
 * - Overlays: per-clause-family attestation streams (the open graph class),
 *   spec-decoded via the caller's SpecSource, fingerprint-only on absence
 * - Composition: venue-parameterized fifth-noun projections — the value-flow
 *   graph over resolution denominations + swap legs
 * - Funding legs: the swap legs one commit transaction carries, read from its
 *   receipt's ERC-20 transfers (the coordinator emits nothing of its own)
 * - Queries: market-shape, a process's edges (its commits in order, and the
 *   edges its parties signed where the caller holds the agreement) and
 *   wallet-record, thin folds over the graphs
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
    deriveProcessWithdrawGate,
    deriveAgreementWithdrawGate,
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

// ── Base-graph projections (Process + Resolution) ───────────────────────────

export { commitOrder, projectProcessGraph, projectResolutionGraph } from "./graphs.js";
export type {
    ProcessGraph,
    ResolutionGraph,
    ResolutionChain,
    ResolutionEntry,
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

// ── Funding legs (a commit receipt's swap legs) ─────────────────────────────

export { readFundingLegs, readCommitFundingLegs } from "./fundingLegs.js";
export type { FundingLeg, ReceiptLogInput, ReceiptReader } from "./fundingLegs.js";
export { attributeProcessDesigns } from "./attribution.js";
export type { AttributionInput, ProcessDesignAttribution, ProcessDesignAttributions } from "./attribution.js";

// ── Canonical graph queries ─────────────────────────────────────────────────

export { followsOfEdges, marketShape, processEdges, walletRecord } from "./queries.js";
export type {
    ChainShape,
    DenominationVolume,
    ProcessEdges,
    MarketShapeGroup,
    MarketShape,
    WalletRecord,
} from "./queries.js";

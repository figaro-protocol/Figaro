/**
 * @figaro/core/extensions — Protocol Extension Modules
 *
 * Mechanism-specific utilities layered on top of the core SDK.
 * Import via: `import { ... } from "@figaro/core/extensions"`
 *
 * Modules:
 * - Dutch auction: price curves, claim evaluation, state derivation
 * - Attestation & GHG: schema IDs, event filtering, disclosure summaries
 * - Geo & handoff: geohash matching, Haversine distance, evidence envelopes
 */

// ── Dutch Auction ───────────────────────────────────────────────────────────

export {
    computeCurrentPrice,
    computeFloorPrice,
    timeToFloor,
    elapsed,
    isExpired,
    evaluateClaim,
    fetchAuctionConfig,
    fetchAuctionState,
    deriveAuctionStates,
} from "./auction.js";
export type {
    AuctionStatus,
    AuctionState,
    AuctionConfig,
    ClaimEvaluation,
} from "./auction.js";

// ── Attestation & GHG ──────────────────────────────────────────────────────

export {
    computeSchemaId,
    GHG_DISCLOSURE_SCHEMA_KEYS,
    DisclosureKind,
    DISCLOSURE_KIND_LABELS,
    GHG_NORM_REFERENCES,
    encodeCommitmentRef,
    encodeGramsRef,
    decodeGramsRef,
    formatGrams,
    filterLogsBySource,
    filterBySchema,
    filterByProcess,
    filterByOrder,
    filterByStage,
    buildProcessDisclosureSummary,
} from "./attestation.js";
export type { ProcessDisclosureSummary } from "./attestation.js";

// ── Geo & Handoff ───────────────────────────────────────────────────────────

export {
    AttestationMode,
    ProximityBand,
    geohashesMatch,
    geohashCommonPrefix,
    haversineDistance,
    formatPhotoGPSEvidence,
    formatGeohashMatchEvidence,
} from "./geo.js";
export type {
    HandoffStep,
    PhotoGPSAttestation,
    GeohashMatchAttestation,
    KlerosEvidence,
} from "./geo.js";

// ── DID (did:web) ───────────────────────────────────────────────────────────

export {
    isDidWeb,
    didWebToUrl,
    validateDidDocument,
    resolveDidWeb,
    extractEthereumAddresses,
    didDocumentMatchesAddress,
    buildSellerDidDocument,
} from "./did.js";
export type {
    VerificationMethod,
    DIDService,
    DIDDocument,
    DIDResolutionResult,
} from "./did.js";

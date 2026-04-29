/**
 * Dispute resolution module.
 *
 * Three pieces:
 *   1. Evidence timeline — reads FigaroCore events, builds chronological record
 *   2. Kleros evidence formatting — transforms timeline to ERC-1497 JSON
 *   3. Kleros proxy — interacts with ArbitrableProxy contract
 *
 * Nothing here stores data on-chain. The evidence already exists as
 * side-effects of token-moving operations. This module reads, formats,
 * and routes.
 */

// Timeline
export {
    buildProcessTimeline,
    buildExtendedTimeline,
} from "./evidenceTimeline";
export type {
    TimelineEvent,
    ProcessTimeline,
    CoordinatorEventSource,
} from "./evidenceTimeline";

// Kleros ERC-1497 formatting
export {
    buildFigaroMetaEvidence,
    buildAuditBundleEvidence,
    buildStatementEvidence,
} from "./klerosEvidence";
export type {
    KlerosMetaEvidence,
    KlerosEvidence,
} from "./klerosEvidence";

// Kleros ArbitrableProxy interaction
export {
    getArbitrationCost,
    fetchRuling,
    createDispute,
    submitEvidence,
    ARBITRABLE_PROXY_ABI,
    ARBITRATOR_ABI,
} from "./klerosProxy";
export type {
    DisputeStatus,
    KlerosConfig,
} from "./klerosProxy";

// IPFS pinning
export { pinJSON, ipfsURI, ipfsGatewayURL } from "./ipfsPin";

// Delivery attestations
export {
    AttestationMode,
    pinAttestation,
} from "./deliveryAttestation";
export type {
    HandoffStep,
    PhotoGPSAttestation,
    GeohashMatchAttestation,
    DeliveryAttestation,
    AttestationEvidence,
} from "./deliveryAttestation";

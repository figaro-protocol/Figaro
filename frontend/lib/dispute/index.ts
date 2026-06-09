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
;

// Consent-dispute evidence formatting (sibling of klerosEvidence)
export {
    buildConsentDisputeMetaEvidence,
    buildConsentDisputeEvidence,
} from "./consentDisputeEvidence";
export type {
    ConsentDisputeParty,
    DisputedConsentAttestation,
    
    ConsentDisputeEvidenceInput,
} from "./consentDisputeEvidence";

// Kleros subcourt catalog + arbitratorExtraData encoder
export {
    KLEROS_COURTS,
    
    
    encodeArbitratorExtraData,
    getKlerosCourt,
} from "./klerosCourts";
export type {  KlerosCourtKey } from "./klerosCourts";

// Kleros ArbitrableProxy interaction. The raw createDispute/submitEvidence
// primitives are composed by ./disputeSubmission — surfaces use those
// pin-then-act sequences, not the primitives directly.
export {
    getArbitrationCost,
    fetchRuling,
} from "./klerosProxy";
export type {
    DisputeStatus,
    KlerosConfig,
} from "./klerosProxy";

// Process-jurisdiction recourse — reads the jurisdiction clause
// the assembly authored and resolves the Layer-3 recourse forum(s).
export {
    resolveProcessRecourse,
    klerosConfigForRecourse,
} from "./processJurisdiction";
export type {
    JurisdictionRecourse,
    KlerosRecourse,
    
} from "./processJurisdiction";

// Delivery attestations
;
;

export {
    createDisputeWithMetaEvidence,
    submitDisputeEvidence,
} from "./disputeSubmission";

export { signConsentDisputeClaim } from "./consentDisputeEvidence";

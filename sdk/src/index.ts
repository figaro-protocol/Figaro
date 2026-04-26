/**
 * @figaro/core — Agent SDK for Figaro Protocol
 *
 * Standalone TypeScript SDK for reading, analyzing, and proposing
 * Figaro transactions. Works with any signing method — human wallets,
 * Safe multi-sigs, or autonomous agent keys.
 *
 * @example
 * ```ts
 * import { fetchCoreEvents, reconstruct, buildCommitment, calculateBonds } from "@figaro/core";
 *
 * // 1. Fetch events
 * const events = await fetchCoreEvents(client, addresses, 0n);
 *
 * // 2. Reconstruct state
 * const processes = reconstruct(events);
 *
 * // 3. Calculate bonds
 * const bonds = calculateBonds(cumulativeValue, payment);
 *
 * // 4. Build commitment
 * const { typedData } = buildCommitment({ ... }, domain);
 * ```
 */

// ABIs
export {
    CORE_ABI, ATTESTATION_COORDINATOR_ABI, DUTCH_AUCTION_ABI, SCHEMA_REGISTRY_ABI,
    SCHEMA_REGISTRATION_HELPER_ABI,
    BATCH_VERIFIER_ABI, ERC20_ABI, OPERATOR_REGISTRY_ABI,
    FIG_TOKEN_ABI, STAGED_MERKLE_AIRDROP_ABI,
} from "./abis.js";
export {
    EV_ORDER_COMMITTED,
    EV_ORDER_SELLER,
    EV_ORDER_CURRENCY,
    EV_ORDER_RESOLVED,
    EV_PROCESS_RESOLVED,
    EV_ATTESTATION,
    EV_AUCTION_CREATED,
    EV_AUCTION_CLAIMED,
    EV_BATCH_SETTLED,
} from "./abis.js";

// Types
export type {
    Hex,
    Address,
    Order,
    Process,
    OrderCommittedEvent,
    OrderResolvedEvent,
    ProcessResolvedEvent,
    AttestationEvent,
    AuctionCreatedEvent,
    AuctionClaimedEvent,
    BatchSettledEvent,
    Commitment,
    EIP712Domain,
    FigaroAddresses,
    BondBreakdown,
    SettlementBreakdown,
    AgentProcessContext,
    AgentOrderContext,
} from "./types.js";
export { OrderState } from "./types.js";

// Event parsers
export {
    parseOrderCommittedLogs,
    parseOrderResolvedLogs,
    parseProcessResolvedLogs,
    parseAttestationLogs,
    parseAuctionCreatedLogs,
    parseAuctionClaimedLogs,
    fetchCoreEvents,
} from "./events.js";

// State reconstruction
export { reconstruct, ProcessGraph } from "./state.js";
export type { CoreEvents } from "./state.js";

// Commitment builder
export {
    COMMITMENT_TYPES,
    buildDomain,
    generateSalt,
    computeDeadline,
    fetchCumulativeValue,
    buildCommitment,
    buildCommitmentSafe,
} from "./commitments.js";
export type { CommitmentParams } from "./commitments.js";

// Bond calculator
export {
    calculateBonds,
    calculateSettlement,
    calculateRootApproval,
    calculateSubOrderSellerApproval,
    validateBonds,
} from "./bonds.js";

// Merkle airdrop builder
export {
    buildMerkleAirdrop,
    computeAirdropLeaf,
} from "./merkleAirdrop.js";
export type { AirdropEntry, MerkleAirdropTree } from "./merkleAirdrop.js";

// Agreement manifest + merkle root + inclusion proofs
export {
    canonicalizeSectionData,
    computeSectionLeaf,
    computeAgreementHash,
    buildSectionInclusionProof,
    verifyInclusionProof,
    getSectionDataBytes,
} from "./agreement.js";
export type { Agreement, AgreementSection } from "./agreement.js";

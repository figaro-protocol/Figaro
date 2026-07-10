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
    CORE_ABI, ATTESTATION_COORDINATOR_ABI, CLAUSE_REGISTRY_ABI,
    ERC20_ABI, SELLER_REGISTRY_ABI, ASSEMBLY_REGISTRY_ABI,
    FIG_TOKEN_ABI,
    // Kernel Commitment struct tuple — a core primitive, used by composition-layer
    // contract ABIs that take a Commitment as a calldata arg.
    COMMITMENT_TUPLE,
} from "./abis.js";
export {
    EV_ORDER_COMMITTED,
    EV_ORDER_SELLER,
    EV_ORDER_CURRENCY,
    EV_ORDER_RESOLVED,
    EV_PROCESS_RESOLVED,
    EV_ATTESTATION,
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
    Commitment,
    EIP712Domain,
    FigaroAddresses,
    BondBreakdown,
    SettlementBreakdown,
    AgentProcessContext,
    AgentOrderContext,
    ClauseRegisteredEvent,
    ClauseWithdrawnEvent,
    SellerRegisteredEvent,
    SellerWithdrawnEvent,
    AssemblyRegisteredEvent,
    AssemblyWithdrawnEvent,
    RegisteredClause,
    RegisteredSeller,
    RegisteredAssembly,
} from "./types.js";
export { OrderState } from "./types.js";

// Event parsers
export {
    parseOrderCommittedLogs,
    parseOrderResolvedLogs,
    parseProcessResolvedLogs,
    parseAttestationLogs,
    fetchCoreEvents,
} from "./events.js";

// State reconstruction
export { reconstruct, ProcessGraph } from "./state.js";
export type { CoreEvents } from "./state.js";

// Discovery — the cold-start catalogue (clauses, sellers, assemblies)
export {
    computeClauseKey,
    parseClauseRegistryLogs,
    parseSellerRegistryLogs,
    parseAssemblyRegistryLogs,
    fetchDiscoveryEvents,
    reconstructDiscovery,
    DiscoveryGraph,
} from "./discovery.js";
export type {
    DiscoveryEvents,
    ClauseRegistryEvents,
    SellerRegistryEvents,
    AssemblyRegistryEvents,
} from "./discovery.js";

// Commitment builder
export {
    COMMITMENT_TYPES,
    COMMITMENT_TYPEHASH,
    buildDomain,
    generateSalt,
    computeDeadline,
    fetchCumulativeValue,
    buildCommitment,
    buildCommitmentSafe,
    hashCommitmentStruct,
    computeCommitmentProcessId,
    computeOrderHash,
    orderToCommitment,
    restoreSignedProcessId,
    ZERO_PROCESS_ID,
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

// Chain gas ceilings — per-process resolve cap + per-block commit landing rate.
// A process grown past the resolve cap can never settle; every commit path
// checks this client-side because the kernel cannot (the composed agreements are off-chain).
export {
    maxOrdersResolvableForGasLimit,
    maxCommitsLandableForGasLimit,
    maxOrdersResolvablePerProcess,
    maxCommitsLandableInOneBlock,
    readProcessResolveCapacity,
    assertOrderFitsResolveCap,
} from "./gasCeilings.js";
export type { ProcessResolveCapacity } from "./gasCeilings.js";

// Agreement + merkle root + inclusion proofs + the canonical-JSON convention
export {
    canonicalize,
    canonicalContentHash,
    canonicalizeSectionData,
    computeSectionLeaf,
    computeAgreementHash,
    buildSectionInclusionProof,
    verifyInclusionProof,
    getSectionDataBytes,
} from "./agreement.js";
export type { Agreement, AgreementSection } from "./agreement.js";

// Assembly identity (the AssemblyRegistry key + derived slug) + the template
// shape and its accessors (topology parents, composed clause versions)
export {
    templateCompositionHash,
    deriveAssemblySlug,
    templateParentOrderHashes,
    templateClauseVersion,
    templateClauseVersionMap,
} from "./assembly.js";
export type { AssemblyTemplate, TemplateAgreement } from "./assembly.js";

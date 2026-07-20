/**
 * @figaro/sdk — Agent SDK for Figaro Protocol
 *
 * Standalone TypeScript SDK for reading, analyzing, and proposing
 * Figaro transactions. Works with any ECDSA signing key — human wallets
 * or autonomous agent keys. The kernel verifies parties by ECDSA recovery
 * alone, so buyer and seller are always externally-owned accounts;
 * contract wallets (Safe, ERC-1271) cannot hold the role directly.
 *
 * @example
 * ```ts
 * import { fetchCoreEvents, reconstruct, buildCommitment, calculateBonds } from "@figaro/sdk";
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
    FLORIN_TOKEN_ABI,
    WITNESS_SWAP_AND_COMMIT_COORDINATOR_ABI, SWAP_FUNDING_TUPLE,
    RPGF_MINTER_ABI,
    DONATION_RAIL_ABI, OPTIMISTIC_MATCH_POOL_ABI,
    BATCH_VERIFIER_ABI,
    // Kernel Commitment struct tuple — a core primitive, used by composition-layer
    // contract ABIs that take a Commitment as a calldata arg.
    COMMITMENT_TUPLE,
} from "./abis.js";

// Swap-funded bond legs (WitnessSwapAndCommitCoordinator's off-chain half)
export {
    DISABLED_SWAP_FUNDING_LEG,
    SWAP_FUNDING_BIGINT_FIELDS,
    SWAP_WITNESS_PERMIT_TYPES,
    buildSwapWitnessTypedData,
    type SwapFundingLeg,
    type SwapWitnessTypedDataArgs,
} from "./swapFunding.js";
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
export { reconstruct, Topology } from "./state.js";
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

// Prototype-pollution defense for parsed envelopes
export { strippingReviver } from "./safeJson.js";

// Agreement + template projection (the deterministic, hash-load-bearing rules)
export {
    assertAgreementSignable,
    buildAssemblyTemplate,
    buildOrderAgreement,
    parseProjectionHints,
    sectionByField,
    sectionsByField,
    serializeAssemblyTemplate,
    specDeclaresField,
    specIsCatalogueSourced,
    specIsProfileSourced,
    profileSourcedFieldNames,
    specIsProcessLog,
    specIsMandatory,
    specIsSpecificTerms,
    validateCommitmentAgreement,
} from "./projection.js";
export type {
    CommitmentAgreementIssue,
    OrderAgreement,
    ProjectionHints,
    ProjectionSpecView,
    SpecSource,
    TemplateOrderNode,
} from "./projection.js";

// The ONE template → orders walk (+ the generic topology math under it)
export {
    planTemplateOrders,
    reconstructOrdersFromTemplate,
    templateAgreementFromClauses,
} from "./reconstructOrders.js";
export type {
    PlannedTemplateOrder,
    ReconstructNodeSpec,
    ReconstructParams,
    ReconstructedOrder,
} from "./reconstructOrders.js";
export { topologicalOrder } from "./topology.js";

// Checkout planning — fill-where-composed section writers, the sub-order
// seller plan, live contributor pricing, the rate-quantity-source registry
export {
    profileValuesFor,
    fillCargoSection,
    derivePricedFields,
    fillClassSections,
    fillProfileSections,
    fillCommerceSection,
    fillProvenanceSection,
    readDenominationPin,
    fillDerivedSections,
    fillDimweightSection,
    getRateQuantityResolver,
    planSubOrderSellers,
    registerRateQuantitySource,
    resolveSubOrderPricing,
    writeTopologySection,
} from "./checkoutPlan.js";
export type {
    AssemblyCheckoutLineItem,
    BoundAssemblyPlanInput,
    PricingCatalogue,
    RateQuantityContext,
    RateQuantityResolver,
    SubOrderPricing,
} from "./checkoutPlan.js";

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

// Seller profile document — the identity envelope pinned to
// SellerRegistry.metadataURI (discovery hands you the URI; this is the
// natural next call). Types + strict/lenient parsers + the agent-service
// projection.
export {
    parseSellerProfileDocument,
    tryParseSellerProfileDocument,
    projectAgentServices,
} from "./sellerProfile.js";
export type {
    SellerProfileMetadata,
    AcceptedTokenMetadata,
    SellerBrandingMetadata,
    SellerAgentServices,
    SellerAssetReferences,
    CounterpartyBinding,
    AssemblyBindingRecord,
    AgentServiceInfo,
} from "./sellerProfile.js";

// Seller catalogue document — the volatile item list pinned to
// SellerProfileMetadata.catalogueURI. Types + strict parser.
export { parseSellerCatalogueDocument } from "./sellerCatalogue.js";
export type {
    UnitSystem,
    CatalogueItemMetadata,
    SellerCatalogueMetadata,
} from "./sellerCatalogue.js";

// RPGF recompute — the reference implementation of sdk/src/rpgf/formula.json.
// Deterministic over public chain events: anyone reproduces a posted
// tranche root exactly, which is what makes the optimistic challenge work.
export {
    computeRpgfAllocations,
    fetchRpgfEventStream,
    buildRpgfTree,
    provenanceContentRef,
    rpgfLeaf,
    icbrt,
    waterFill,
    RPGF_PAIR_CAP,
    RPGF_TIER1_ARTICLES,
    RPGF_EXCLUDED_ARTICLES,
    RPGF_CAP_NUMERATOR,
    RPGF_CAP_DENOMINATOR,
    RPGF_PROVENANCE_CLAUSE,
    RPGF_EMPTY_ROOT,
} from "./rpgf/index.js";
export type {
    RpgfEventStream,
    RpgfAllocation,
    RpgfSpecClassification,
    RpgfContractAddresses,
    RpgfTree,
    RpgfOrderEvent,
    RpgfResolvedEvent,
    RpgfAttestationEvent,
    RpgfClauseRegisteredEvent,
    RpgfAssemblyRegisteredEvent,
    RpgfWithdrawalEvent,
    RpgfSellerStakeEvent,
} from "./rpgf/index.js";

// Match recompute — the reference implementation of sdk/src/match/formula.json.
// A match round (DonationRail + OptimisticMatchPool) distributes a funded
// budget by surplus-form quadratic funding over the rail's donation events;
// this recompute reproduces a posted match root exactly, which is what makes
// the optimistic challenge work.
export {
    computeMatchAllocations,
    fetchMatchDonationEvents,
    buildMatchTree,
    matchLeaf,
    isqrt,
    MATCH_FORMULA,
    MATCH_DONATION_FLOOR,
    MATCH_DONOR_RECIPIENT_CAP,
    MATCH_CAP_NUMERATOR,
    MATCH_CAP_DENOMINATOR,
    MATCH_SQRT_SCALE,
    MATCH_EMPTY_ROOT,
} from "./match/index.js";
export type {
    MatchRoundConfig,
    MatchDonationEvent,
    MatchAllocation,
    MatchFormulaParameters,
} from "./match/index.js";

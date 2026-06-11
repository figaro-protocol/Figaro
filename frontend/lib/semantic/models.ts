/** Semantic-model union types — the runtime semantic layer's canonical
 *  taxonomy for truth class, mechanism risk, scope, and roles. */

type TruthClass =
    | "protocol-enforced"
    | "protocol-derived"
    | "assembly-declared"
    | "indexer-derived"
    | "ui-local";

type MechanismRiskClass =
    | "read-only-inherited"
    | "low-risk-coordinator"
    | "medium-risk-extension"
    | "high-risk-economic";

type ScopeType = "assembly" | "process" | "order" | "mechanism";

interface SemanticSource {
    truthClass: TruthClass;
    sourceLabel: string;
    referenceId?: string;
}

interface GuaranteeModel {
    id: string;
    mechanismId: string;
    label: string;
    description: string;
    guaranteeClass: string;
    source: SemanticSource;
}

interface RiskBoundaryModel {
    id: string;
    mechanismId: string;
    riskClass: MechanismRiskClass;
    touchesAssets: boolean;
    canCustody: boolean;
    canReprice: boolean;
    canOnlySignal: boolean;
    dependsOn: string[];
    failureModes: string[];
}

interface ResolveProcessCapabilityAction {
    executionType: "transaction";
    kind: "resolve-process";
    processId: string;
}

interface OpenSubOrderComposerCapabilityAction {
    executionType: "runtime";
    kind: "open-sub-order-composer";
    parentOrderIds: string[];
    currency?: `0x${string}`;
}

interface RegisterSellerCapabilityAction {
    executionType: "transaction";
    kind: "register-seller";
}

interface UpdateSellerProfileCapabilityAction {
    executionType: "transaction";
    kind: "update-seller-profile";
}

interface WithdrawSellerDepositCapabilityAction {
    executionType: "transaction";
    kind: "withdraw-seller-deposit";
}

interface SubmitDisclosureCommitmentCapabilityAction {
    executionType: "transaction";
    kind: "submit-disclosure-commitment";
    orderHash: string;
    /** The order's committed DISCLOSURE clause (readable registry id) — put
     *  there by the deriver from the agreement's sections, never named. */
    clauseId: string;
}

interface SubmitDisclosureInventoryCapabilityAction {
    executionType: "transaction";
    kind: "submit-disclosure-inventory";
    orderHash: string;
    /** The order's committed MEASUREMENT clause (the disclosure's Category-1
     *  sister; readable registry id) — put there by the deriver. */
    clauseId: string;
}

/** Generic runtime attestation — the SELLER of an order advances ANY
 *  category-1 clause's enum ladder. One descriptor for every runtime-attestable
 *  clause; the engine names no clause. The executor builds the on-chain content
 *  from the clause spec as `{ [ladderField]: eventCode }`. Replaces the former
 *  per-clause merchant-process / courier-process descriptors. */
export interface SubmitClauseAttestationCapabilityAction {
    executionType: "transaction";
    kind: "submit-clause-attestation";
    orderHash: string;
    /** Human clauseId (the readable registry id, not its keccak hash). */
    clauseId: string;
    /** Enum ordinal of the stage being attested (the on-chain stage). */
    stage: number;
    /** The enum stage CODE — content = `{ [ladderField]: eventCode }`. */
    eventCode: string;
    /** The spec field holding the enum (the ladder, or the proof's band). */
    ladderField: string;
    /** WHICH party attests — from the clause spec's `attestation` field. "seller"
     *  for lifecycle clauses; "buyer" surfaces only for a `bilateral` clause. */
    party: "seller" | "buyer";
    /** True when the clause is a runtime PROOF (a companion of a committed clause,
     *  e.g. proximity-proof) — the executor supplies the per-attestation device
     *  witness (nonce + signature) on top of the spec fields. */
    isProof?: boolean;
    roleOrderHash?: string;
}

interface ClaimAuctionCapabilityAction {
    executionType: "transaction";
    kind: "claim-auction";
    auctionId: string;
}


interface ClaimAirdropCapabilityAction {
    executionType: "transaction";
    kind: "claim-airdrop";
    amount: bigint;
    proof: `0x${string}`[];
}

/** FIG-token vesting tranches with separate claim curves. */
export type VestingVariant = "founder" | "ecosystem";

interface ClaimVestingCapabilityAction {
    executionType: "transaction";
    kind: "claim-vesting";
    variant: VestingVariant;
}

interface PrototypeCapabilityAction {
    executionType: "prototype";
    kind: string;
}

export type CapabilityActionDescriptor =
    | ResolveProcessCapabilityAction
    | OpenSubOrderComposerCapabilityAction
    | RegisterSellerCapabilityAction
    | UpdateSellerProfileCapabilityAction
    | WithdrawSellerDepositCapabilityAction
    | SubmitDisclosureCommitmentCapabilityAction
    | SubmitDisclosureInventoryCapabilityAction
    | SubmitClauseAttestationCapabilityAction
    | ClaimAuctionCapabilityAction
    | ClaimAirdropCapabilityAction
    | ClaimVestingCapabilityAction
    | PrototypeCapabilityAction;

type CapabilityModelWithAction<T extends CapabilityActionDescriptor> = CapabilityModel & {
    action: T;
};

function isClaimAuctionCapability(
    capability: CapabilityModel,
): capability is CapabilityModelWithAction<ClaimAuctionCapabilityAction> {
    return capability.action.executionType === "transaction" && capability.action.kind === "claim-auction";
}

function isDisclosureCommitmentCapability(
    capability: CapabilityModel,
): capability is CapabilityModelWithAction<SubmitDisclosureCommitmentCapabilityAction> {
    return capability.action.executionType === "transaction"
        && capability.action.kind === "submit-disclosure-commitment";
}

function isDisclosureInventoryCapability(
    capability: CapabilityModel,
): capability is CapabilityModelWithAction<SubmitDisclosureInventoryCapabilityAction> {
    return capability.action.executionType === "transaction"
        && capability.action.kind === "submit-disclosure-inventory";
}

interface RegisterSellerCapabilityInput {
    kind: "register-seller";
    metadataURI?: string;
}

interface UpdateSellerProfileCapabilityInput {
    kind: "update-seller-profile";
    metadataURI?: string;
}

interface WithdrawSellerDepositCapabilityInput {
    kind: "withdraw-seller-deposit";
}

interface SubmitDisclosureCommitmentCapabilityInput {
    kind: "submit-disclosure-commitment";
}

interface SubmitDisclosureInventoryCapabilityInput {
    kind: "submit-disclosure-inventory";
    grams: bigint;
}

export type CapabilityExecutionInput =
    | RegisterSellerCapabilityInput
    | UpdateSellerProfileCapabilityInput
    | WithdrawSellerDepositCapabilityInput
    | SubmitDisclosureCommitmentCapabilityInput
    | SubmitDisclosureInventoryCapabilityInput;

export interface CapabilityModel {
    id: string;
    label: string;
    actionKind: string;
    action: CapabilityActionDescriptor;
    mechanismId: string;
    scopeType: ScopeType;
    scopeId: string;
    preconditions: string[];
    riskLabel?: string;
    writeTarget?: string;
    uiPriority?: number;
    prototype?: boolean;
    source: SemanticSource;
}

export interface AttachmentModel {
    id: string;
    mechanismId: string;
    targetType: ScopeType;
    targetId: string;
    label: string;
    description?: string;
    attachmentKind: string;
    state: string;
    visibleByDefault: boolean;
    source: SemanticSource;
}

export interface EconomicBreakdownValue {
    label: string;
    amount: bigint;
    source: SemanticSource;
}

export interface EconomicBreakdownModel {
    scopeType: ScopeType;
    scopeId: string;
    lockedBond?: EconomicBreakdownValue;
    settledAvailable?: EconomicBreakdownValue;
    typedOutputs: EconomicBreakdownValue[];
    downstreamReferencedAmount?: EconomicBreakdownValue;
}

interface MechanismModel {
    id: string;
    kind: string;
    name: string;
    description: string;
    riskClass: MechanismRiskClass;
    moduleBindings: string[];
    contracts: string[];
    touchesAssets: boolean;
    guarantees: GuaranteeModel[];
    attachments: AttachmentModel[];
}

export interface OrderNodeModel {
    orderId: string;
    processId: string;
    buyer: `0x${string}`;
    seller: `0x${string}`;
    currency?: `0x${string}`;
    payment: bigint;
    state: string;
    parentOrderIds: string[]; // bytes32 order hashes
    /** The order's committed agreement hash — lets consumers load the
     *  agreement and read its clauses (e.g. a courier handoff's
     *  proximity-policy band). */
    agreementHash: `0x${string}`;
    attachments: AttachmentModel[];
    capabilities: CapabilityModel[];
    settlementBreakdown?: EconomicBreakdownModel;
}

export interface ProcessRelationModel {
    id: string;
    processId: string;
    parentOrderId: string;
    childOrderId: string;
    relationKind: string;
    labels: string[];
    referencedValue: EconomicBreakdownValue;
    allocatedReferenceValue?: EconomicBreakdownValue;
    source: SemanticSource;
}

export interface ProcessModel {
    processId: string;
    rootOrderId: string;
    currency?: `0x${string}`;
    /** The root order's committed modality code (the modality
     *  clause's `modalities[0]`), surfaced by the builder so the order page can show it
     *  without reading a clause section itself. Null when uncommitted. */
    rootModality?: string | null;
    orders: OrderNodeModel[];
    relations: ProcessRelationModel[];
    stateSummary: string;
    capabilities: CapabilityModel[];
    economicSummary?: EconomicBreakdownModel;
    attachments: AttachmentModel[];
    upstreamLinks: string[];
    downstreamLinks: string[];
}

interface AssemblyModel {
    id: string;
    name: string;
    slug: string;
    description?: string;
    network: string;
    availableNetworks: string[];
    mechanisms: MechanismModel[];
    processes: ProcessModel[];
    riskProfile: MechanismRiskClass[];
    source: SemanticSource;
}
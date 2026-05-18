/** Semantic-model union types. Previously re-imported from `lib/shared/assembly`,
 *  inlined here as part of the reference-assembly cleanup — the runtime
 *  semantic layer is the only consumer, and decoupling it from the legacy
 *  Assembly file unblocks deletion of that file's downstream surface. */
export type TruthClass =
    | "protocol-enforced"
    | "protocol-derived"
    | "assembly-declared"
    | "indexer-derived"
    | "ui-local";

export type MechanismRiskClass =
    | "read-only-inherited"
    | "low-risk-coordinator"
    | "medium-risk-extension"
    | "high-risk-economic";

export type ScopeType = "assembly" | "process" | "order" | "mechanism";

export interface SemanticSource {
    truthClass: TruthClass;
    sourceLabel: string;
    referenceId?: string;
}

export interface GuaranteeModel {
    id: string;
    mechanismId: string;
    label: string;
    description: string;
    guaranteeClass: string;
    source: SemanticSource;
}

export interface RiskBoundaryModel {
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

export interface ResolveProcessCapabilityAction {
    executionType: "transaction";
    kind: "resolve-process";
    processId: string;
}

export interface OpenSubOrderComposerCapabilityAction {
    executionType: "runtime";
    kind: "open-sub-order-composer";
    parentOrderIds: string[];
    currency?: `0x${string}`;
}

export interface RegisterOperatorCapabilityAction {
    executionType: "transaction";
    kind: "register-operator";
}

export interface UpdateOperatorProfileCapabilityAction {
    executionType: "transaction";
    kind: "update-operator-profile";
}

export interface WithdrawOperatorDepositCapabilityAction {
    executionType: "transaction";
    kind: "withdraw-operator-deposit";
}

export interface SubmitDisclosureCommitmentCapabilityAction {
    executionType: "transaction";
    kind: "submit-disclosure-commitment";
    orderHash: string;
}

export interface SubmitDisclosureInventoryCapabilityAction {
    executionType: "transaction";
    kind: "submit-disclosure-inventory";
    orderHash: string;
}

/** Merchant-process event types — re-exported from the SDK schema enum to
 *  keep the capability descriptor and the on-chain validator's enum in
 *  lockstep. */
export type MerchantProcessEventKind =
    | "order-received"
    | "accepted"
    | "prep-started"
    | "ready-for-pickup"
    | "handed-off"
    | "cancelled";

/** Courier-process event types — re-exported from the SDK schema enum. */
export type CourierProcessEventKind =
    | "available"
    | "accepted"
    | "en-route-pickup"
    | "arrived-pickup"
    | "in-transit"
    | "arrived-dropoff"
    | "completed"
    | "cancelled";

/** Subset of courier-process events that require on-chain proximity proof —
 *  the two handoff edges (pickup, dropoff). */
export type CourierProximityProofEventKind = Extract<
    CourierProcessEventKind,
    "arrived-pickup" | "completed"
>;

export interface SubmitMerchantProcessSignalCapabilityAction {
    executionType: "transaction";
    kind: "submit-merchant-process-signal";
    orderHash: string;
    eventType: MerchantProcessEventKind;
    roleOrderHash?: string;
}

export interface SubmitCourierProcessSignalCapabilityAction {
    executionType: "transaction";
    kind: "submit-courier-process-signal";
    orderHash: string;
    eventType: CourierProcessEventKind;
    roleOrderHash?: string;
}

/** Courier-process attestation paired with a proximity-proof attestation —
 *  used at the two handoff edges where on-chain proximity evidence
 *  accompanies the role-event log entry. */
export interface SubmitCourierProcessSignalWithProofCapabilityAction {
    executionType: "transaction";
    kind: "submit-courier-process-signal-with-proof";
    orderHash: string;
    eventType: CourierProximityProofEventKind;
    roleOrderHash?: string;
}

export interface ClaimAuctionCapabilityAction {
    executionType: "transaction";
    kind: "claim-auction";
    auctionId: string;
}


export interface ClaimAirdropCapabilityAction {
    executionType: "transaction";
    kind: "claim-airdrop";
    amount: bigint;
    proof: `0x${string}`[];
}

/** FIG-token vesting tranches with separate claim curves. */
export type VestingVariant = "founder" | "ecosystem";

export interface ClaimVestingCapabilityAction {
    executionType: "transaction";
    kind: "claim-vesting";
    variant: VestingVariant;
}

export interface PrototypeCapabilityAction {
    executionType: "prototype";
    kind: string;
}

export type CapabilityActionDescriptor =
    | ResolveProcessCapabilityAction
    | OpenSubOrderComposerCapabilityAction
    | RegisterOperatorCapabilityAction
    | UpdateOperatorProfileCapabilityAction
    | WithdrawOperatorDepositCapabilityAction
    | SubmitDisclosureCommitmentCapabilityAction
    | SubmitDisclosureInventoryCapabilityAction
    | SubmitMerchantProcessSignalCapabilityAction
    | SubmitCourierProcessSignalCapabilityAction
    | SubmitCourierProcessSignalWithProofCapabilityAction
    | ClaimAuctionCapabilityAction
    | ClaimAirdropCapabilityAction
    | ClaimVestingCapabilityAction
    | PrototypeCapabilityAction;

export type CapabilityModelWithAction<T extends CapabilityActionDescriptor> = CapabilityModel & {
    action: T;
};

export function isClaimAuctionCapability(
    capability: CapabilityModel,
): capability is CapabilityModelWithAction<ClaimAuctionCapabilityAction> {
    return capability.action.executionType === "transaction" && capability.action.kind === "claim-auction";
}

export function isMerchantProcessSignalCapability(
    capability: CapabilityModel,
): capability is CapabilityModelWithAction<SubmitMerchantProcessSignalCapabilityAction> {
    return capability.action.executionType === "transaction"
        && capability.action.kind === "submit-merchant-process-signal";
}

export function isCourierProcessSignalCapability(
    capability: CapabilityModel,
): capability is CapabilityModelWithAction<SubmitCourierProcessSignalCapabilityAction> {
    return capability.action.executionType === "transaction"
        && capability.action.kind === "submit-courier-process-signal";
}

export function isDisclosureCommitmentCapability(
    capability: CapabilityModel,
): capability is CapabilityModelWithAction<SubmitDisclosureCommitmentCapabilityAction> {
    return capability.action.executionType === "transaction"
        && capability.action.kind === "submit-disclosure-commitment";
}

export function isDisclosureInventoryCapability(
    capability: CapabilityModel,
): capability is CapabilityModelWithAction<SubmitDisclosureInventoryCapabilityAction> {
    return capability.action.executionType === "transaction"
        && capability.action.kind === "submit-disclosure-inventory";
}

export interface RegisterOperatorCapabilityInput {
    kind: "register-operator";
    metadataURI?: string;
}

export interface UpdateOperatorProfileCapabilityInput {
    kind: "update-operator-profile";
    metadataURI?: string;
}

export interface WithdrawOperatorDepositCapabilityInput {
    kind: "withdraw-operator-deposit";
}

export interface SubmitDisclosureCommitmentCapabilityInput {
    kind: "submit-disclosure-commitment";
}

export interface SubmitDisclosureInventoryCapabilityInput {
    kind: "submit-disclosure-inventory";
    grams: bigint;
}

export interface SubmitCourierProcessSignalWithProofCapabilityInput {
    kind: "submit-courier-process-signal-with-proof";
    proof: {
        band: number;
        nonce: `0x${string}`;
        deviceSig: `0x${string}`;
    };
}

export type CapabilityExecutionInput =
    | RegisterOperatorCapabilityInput
    | UpdateOperatorProfileCapabilityInput
    | WithdrawOperatorDepositCapabilityInput
    | SubmitDisclosureCommitmentCapabilityInput
    | SubmitDisclosureInventoryCapabilityInput
    | SubmitCourierProcessSignalWithProofCapabilityInput;

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

export interface MechanismModel {
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
    orders: OrderNodeModel[];
    relations: ProcessRelationModel[];
    stateSummary: string;
    capabilities: CapabilityModel[];
    economicSummary?: EconomicBreakdownModel;
    attachments: AttachmentModel[];
    upstreamLinks: string[];
    downstreamLinks: string[];
}

export interface AssemblyModel {
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
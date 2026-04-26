import { MechanismRiskClass, ScopeType, TruthClass } from "@/lib/shared/assembly";

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
    operatorRole: number;
}

/**
 * Replaces the prior UpdateOperatorProfileCapabilityAction (web2-strip
 * 2026-04-26). To switch role or metadata an operator now withdraws and
 * re-registers; the dedup guard is cleared on withdraw.
 */
export interface WithdrawOperatorDepositCapabilityAction {
    executionType: "transaction";
    kind: "withdraw-operator-deposit";
    operatorRole: number;
}

export interface SubmitDisclosureCommitmentCapabilityAction {
    executionType: "transaction";
    kind: "submit-disclosure-commitment";
    orderHash: string;
    disclosureRole: "restaurant" | "driver";
}

export interface SubmitDisclosureInventoryCapabilityAction {
    executionType: "transaction";
    kind: "submit-disclosure-inventory";
    orderHash: string;
}

export type DeliveryLifecycleSignalActionKind =
    | "declarePreparationStarted"
    | "declareReadyForPickup"
    | "declareEnRoute"
    | "declarePickedUp"
    | "declareDelivered";

export interface SubmitDeliveryLifecycleSignalCapabilityAction {
    executionType: "transaction";
    kind: "submit-delivery-lifecycle-signal";
    orderHash: string;
    signal: DeliveryLifecycleSignalActionKind;
    roleOrderHash?: string;
}

export interface SubmitDeliveryLifecycleProofCapabilityAction {
    executionType: "transaction";
    kind: "submit-delivery-lifecycle-proof";
    orderHash: string;
    signal: "declarePickedUp" | "declareDelivered";
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

export interface ClaimVestingCapabilityAction {
    executionType: "transaction";
    kind: "claim-vesting";
    variant: "founder" | "ecosystem";
}

export interface PrototypeCapabilityAction {
    executionType: "prototype";
    kind: string;
}

export type CapabilityActionDescriptor =
    | ResolveProcessCapabilityAction
    | OpenSubOrderComposerCapabilityAction
    | RegisterOperatorCapabilityAction
    | WithdrawOperatorDepositCapabilityAction
    | SubmitDisclosureCommitmentCapabilityAction
    | SubmitDisclosureInventoryCapabilityAction
    | SubmitDeliveryLifecycleSignalCapabilityAction
    | SubmitDeliveryLifecycleProofCapabilityAction
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

export function isDeliveryLifecycleSignalCapability(
    capability: CapabilityModel,
): capability is CapabilityModelWithAction<SubmitDeliveryLifecycleSignalCapabilityAction> {
    return capability.action.executionType === "transaction"
        && capability.action.kind === "submit-delivery-lifecycle-signal";
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

export interface WithdrawOperatorDepositCapabilityInput {
    kind: "withdraw-operator-deposit";
}

export interface SubmitDisclosureCommitmentCapabilityInput {
    kind: "submit-disclosure-commitment";
    disclosureRole: "restaurant" | "driver";
}

export interface SubmitDisclosureInventoryCapabilityInput {
    kind: "submit-disclosure-inventory";
    grams: bigint;
}

export interface SubmitDeliveryLifecycleProofCapabilityInput {
    kind: "submit-delivery-lifecycle-proof";
    proof: {
        band: number;
        nonce: `0x${string}`;
        deviceSig: `0x${string}`;
    };
}

export type CapabilityExecutionInput =
    | RegisterOperatorCapabilityInput
    | WithdrawOperatorDepositCapabilityInput
    | SubmitDisclosureCommitmentCapabilityInput
    | SubmitDisclosureInventoryCapabilityInput
    | SubmitDeliveryLifecycleProofCapabilityInput;

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

export interface RoleContext {
    id: string;
    actor?: `0x${string}`;
    roleKind: string;
    displayName: string;
    description?: string;
    visibility: "primary" | "secondary" | "advanced" | "hidden";
    defaultLandingView?: string;
    scopeType: ScopeType;
    scopeId: string;
    mechanismId?: string;
    mechanismIds: string[];
    prototype: boolean;
    authoritySource: SemanticSource;
    activeCapabilities: CapabilityModel[];
    activeObligations: string[];
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
    recognizedRoles: string[];
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
    roles: RoleContext[];
    processes: ProcessModel[];
    riskProfile: MechanismRiskClass[];
    source: SemanticSource;
}
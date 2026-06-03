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
}

interface SubmitDisclosureInventoryCapabilityAction {
    executionType: "transaction";
    kind: "submit-disclosure-inventory";
    orderHash: string;
}

/** Merchant-process event types — re-exported from the SDK clause enum to
 *  keep the capability descriptor and the on-chain validator's enum in
 *  lockstep. */
export type MerchantProcessEventKind =
    | "order-received"
    | "accepted"
    | "prep-started"
    | "ready-for-pickup"
    | "handed-off"
    | "cancelled";

/** Courier-process event types — re-exported from the SDK clause enum. */
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
    "arrived-pickup" | "arrived-dropoff"
>;

interface SubmitMerchantProcessSignalCapabilityAction {
    executionType: "transaction";
    kind: "submit-merchant-process-signal";
    orderHash: string;
    eventType: MerchantProcessEventKind;
    roleOrderHash?: string;
}

interface SubmitCourierProcessSignalCapabilityAction {
    executionType: "transaction";
    kind: "submit-courier-process-signal";
    orderHash: string;
    eventType: CourierProcessEventKind;
    roleOrderHash?: string;
}

/** Courier-process attestation paired with a proximity-proof attestation —
 *  used at the two handoff edges where on-chain proximity evidence
 *  accompanies the role-event log entry. The committed proximity band is
 *  carried on the descriptor (read from the agreement by the builder) so the
 *  generic renderer needs no per-action input; the executor mints the
 *  nonce + device-signature placeholder and assembles the proof. */
interface SubmitCourierProcessSignalWithProofCapabilityAction {
    executionType: "transaction";
    kind: "submit-courier-process-signal-with-proof";
    orderHash: string;
    eventType: CourierProximityProofEventKind;
    band: number;
    roleOrderHash?: string;
}

/** Merchant-process `handed-off` paired with a proximity-proof cross-witness
 *  against whichever order carries the proximity policy (the seller's own
 *  order on a pickup/on-site handoff, or a downstream sub-order the merchant
 *  cross-witnesses). Band carried on the descriptor, as above. */
interface SubmitMerchantProcessSignalWithProofCapabilityAction {
    executionType: "transaction";
    kind: "submit-merchant-process-signal-with-proof";
    orderHash: string;
    proximityTargetOrderHash: string;
    eventType: Extract<MerchantProcessEventKind, "handed-off">;
    band: number;
}

/** Buyer's symmetric proximity-proof witness at a buyer↔seller handoff (no
 *  intermediary). The buyer co-signs `figaro-proximity-proof-v1` against the
 *  root order; there is no buyer process clause per the kernel-participant
 *  principle, so this is the one runtime witness the buyer attests. */
interface SubmitBuyerProximityProofCapabilityAction {
    executionType: "transaction";
    kind: "submit-buyer-proximity-proof";
    orderHash: string;
    band: number;
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
    | SubmitMerchantProcessSignalCapabilityAction
    | SubmitMerchantProcessSignalWithProofCapabilityAction
    | SubmitCourierProcessSignalCapabilityAction
    | SubmitCourierProcessSignalWithProofCapabilityAction
    | SubmitBuyerProximityProofCapabilityAction
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

function isMerchantProcessSignalCapability(
    capability: CapabilityModel,
): capability is CapabilityModelWithAction<SubmitMerchantProcessSignalCapabilityAction> {
    return capability.action.executionType === "transaction"
        && capability.action.kind === "submit-merchant-process-signal";
}

function isCourierProcessSignalCapability(
    capability: CapabilityModel,
): capability is CapabilityModelWithAction<SubmitCourierProcessSignalCapabilityAction> {
    return capability.action.executionType === "transaction"
        && capability.action.kind === "submit-courier-process-signal";
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
    /** The root order's committed fulfilment modality code (figaro-fulfilment-v2
     *  `modalities[0]`), surfaced by the builder so the order page can show it
     *  without reading a clause section itself. Null when uncommitted. */
    rootFulfilmentModality?: string | null;
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
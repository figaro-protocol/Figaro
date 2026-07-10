/** Semantic-model union types — the runtime semantic layer's canonical
 *  taxonomy for truth class, mechanism risk, scope, and roles. */

import type { FieldSpec } from "@figaro/sdk/clauses";

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

/** Generic runtime attestation — one descriptor for every runtime-attestable
 *  clause; the engine names no clause. Two modes, told apart by the presence
 *  of `ladderField` + `eventCode`:
 *  - LADDER (process-log clause): the party advances the clause's enum ladder;
 *    the executor builds content = `{ [ladderField]: eventCode }`.
 *  - WITNESS (a clause declaring `spec.stages[stage]`): the party files a
 *    runtime witness (temperature record, measured grams, detected band);
 *    values arrive as `CapabilityExecutionInput` from the rail's generic form
 *    and encode against the declared stage's fields. Repeatable while the
 *    order is active. */
export interface SubmitClauseAttestationCapabilityAction {
    executionType: "transaction";
    kind: "submit-clause-attestation";
    orderHash: string;
    /** Human clauseId (the readable registry id, not its keccak hash). */
    clauseId: string;
    /** The on-chain uint8 stage — the enum ordinal for a ladder, the declared
     *  `spec.stages` key for a witness. */
    stage: number;
    /** LADDER mode only: the enum stage CODE — content = `{ [ladderField]: eventCode }`. */
    eventCode?: string;
    /** LADDER mode only: the spec field holding the enum ladder. */
    ladderField?: string;
    /** WHICH party attests. Ladders surface seller-side; witness stages
     *  surface to BOTH parties — who must witness is never engine policy
     *  (sufficiency is derived at read time against the committed policy). */
    party: "seller" | "buyer";
    roleOrderHash?: string;
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
    | RegisterSellerCapabilityAction
    | UpdateSellerProfileCapabilityAction
    | WithdrawSellerDepositCapabilityAction
    | SubmitClauseAttestationCapabilityAction
    | ClaimAirdropCapabilityAction
    | ClaimVestingCapabilityAction
    | PrototypeCapabilityAction;

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

/** Values a party filled into a witness capability's generic form — keyed by
 *  the declared stage's field names, validated Layer-A before encoding. */
interface SubmitClauseAttestationCapabilityInput {
    kind: "submit-clause-attestation";
    values: Record<string, unknown>;
}

export type CapabilityExecutionInput =
    | RegisterSellerCapabilityInput
    | UpdateSellerProfileCapabilityInput
    | WithdrawSellerDepositCapabilityInput
    | SubmitClauseAttestationCapabilityInput;

export interface CapabilityModel {
    id: string;
    label: string;
    /** The raw enum stage/band CODE for a clause-attestation capability (e.g.
     *  "prep-started", "zone-wifi"). Stable across label changes — surfaced as a
     *  `data-event-code` attribute so a test (or any consumer) can target a
     *  specific stage's button without depending on the humanized `label`. */
    eventCode?: string;
    actionKind: string;
    action: CapabilityActionDescriptor;
    /** Fields the party fills BEFORE executing (a witness stage's declared
     *  field set) — the rail renders them through the one generic FieldControl
     *  and passes the values as `CapabilityExecutionInput`. Absent for
     *  one-click capabilities (ladder stages, resolve). */
    inputFields?: readonly FieldSpec[];
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
    parentOrderHashes: string[]; // bytes32 order hashes
    /** The order's committed agreement hash — lets consumers load the
     *  agreement and read its clauses (e.g. a courier handoff's
     *  proximity-policy band). */
    agreementHash: `0x${string}`;
    attachments: AttachmentModel[];
    capabilities: CapabilityModel[];
    settlementBreakdown?: EconomicBreakdownModel;
}

export interface ProcessModel {
    processId: string;
    rootOrderId: string;
    currency?: `0x${string}`;
    /** The root order's committed modality code (the modality clause's
     *  single-select `modality` value), surfaced by the builder so the order
     *  page can show it without reading a clause section itself. Null when
     *  uncommitted. */
    rootModality?: string | null;
    orders: OrderNodeModel[];
    stateSummary: string;
    capabilities: CapabilityModel[];
    economicSummary?: EconomicBreakdownModel;
    attachments: AttachmentModel[];
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
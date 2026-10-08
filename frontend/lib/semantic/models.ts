/** Semantic-model union types — the runtime semantic layer's canonical
 *  taxonomy for truth class, scope, and roles. */

import type { FieldSpec } from "@figaro-protocol/sdk/clauses";
import type { PartyRole } from "@/lib/kernel/walletProcessQueries";

type TruthClass =
    | "protocol-enforced"
    | "protocol-derived"
    | "assembly-declared"
    | "indexer-derived"
    | "ui-local";

type ScopeType = "assembly" | "process" | "order" | "mechanism";

interface SemanticSource {
    truthClass: TruthClass;
    sourceLabel: string;
    referenceId?: string;
}

interface ResolveProcessCapabilityAction {
    executionType: "transaction";
    kind: "resolve-process";
    processId: string;
}

interface RegisterSellerCapabilityAction {
    executionType: "transaction";
    kind: "register-member";
}

interface UpdateMemberProfileCapabilityAction {
    executionType: "transaction";
    kind: "update-member-profile";
}

interface WithdrawSellerDepositCapabilityAction {
    executionType: "transaction";
    kind: "withdraw-member-deposit";
}

/** Generic runtime attestation — one descriptor for every runtime-attestable
 *  clause; the engine names no clause. Two modes, told apart by the presence
 *  of `ladderField` + `eventCode`:
 *  - LADDER (process-log clause): the party advances the clause's enum ladder;
 *    the executor builds content = `{ [ladderField]: eventCode }`.
 *  - WITNESS (a clause declaring `spec.stages[stage]`): the party files a
 *    runtime witness (temperature reading, measured grams, detected band);
 *    values arrive as `CapabilityExecutionInput` from the rail's generic form
 *    and encode against the declared stage's fields. Repeatable while the
 *    order is active. */
export interface SubmitClauseAttestationCapabilityAction {
    executionType: "transaction";
    kind: "submit-clause-attestation";
    orderHash: string;
    /** Human clauseId (the readable registry id, not its keccak hash). */
    clauseId: string;
    /** The committed section's version — with `clauseId`, the full identity
     *  the agreement committed; the executor encodes and keys the attestation
     *  from exactly that spec, never a later registered version. */
    version: number;
    /** The on-chain uint8 stage — the enum ordinal for a ladder, the declared
     *  `spec.stages` key for a witness. */
    stage: number;
    /** LADDER mode only: the enum stage CODE — content = `{ [ladderField]: eventCode }`. */
    eventCode?: string;
    /** LADDER mode only: the spec field holding the enum ladder. */
    ladderField?: string;
    /** RE-ASSERT mode: the attestation re-asserts the committed section —
     *  content is OMITTED on the wire so the coordinator's `content ??
     *  sectionData` default applies (the exact committed bytes; contentRef =
     *  keccak of them). No form, no ladder. */
    reasserts?: boolean;
    /** WHICH party attests. Ladders surface seller-side; witness stages
     *  surface to BOTH parties — who must witness is never engine policy
     *  (sufficiency is derived at read time against the committed policy). */
    party: PartyRole;
}


/** A capability that opens a chooser of complete capabilities, each executed
 *  on its own by its own submit — the card is never executed itself. One
 *  party's re-assert card on one order carries a choice per committed section
 *  that party has not yet re-asserted: the coordinator attests one section
 *  per call, so each choice is one deliberate transaction. */
interface ChooseCapabilityAction {
    executionType: "choice";
    kind: "choose-capability";
    choices: CapabilityModel[];
}

interface PrototypeCapabilityAction {
    executionType: "prototype";
    kind: string;
}

export type CapabilityActionDescriptor =
    | ResolveProcessCapabilityAction
    | RegisterSellerCapabilityAction
    | UpdateMemberProfileCapabilityAction
    | WithdrawSellerDepositCapabilityAction
    | SubmitClauseAttestationCapabilityAction
    | ChooseCapabilityAction
    | PrototypeCapabilityAction;

interface RegisterSellerCapabilityInput {
    kind: "register-member";
    metadataURI?: string;
}

interface UpdateMemberProfileCapabilityInput {
    kind: "update-member-profile";
    metadataURI?: string;
}

interface WithdrawSellerDepositCapabilityInput {
    kind: "withdraw-member-deposit";
}

/** Values a party filled into a witness capability's generic form — keyed by
 *  the declared stage's field names, validated off-chain before encoding. */
interface SubmitClauseAttestationCapabilityInput {
    kind: "submit-clause-attestation";
    values: Record<string, unknown>;
}

export type CapabilityExecutionInput =
    | RegisterSellerCapabilityInput
    | UpdateMemberProfileCapabilityInput
    | WithdrawSellerDepositCapabilityInput
    | SubmitClauseAttestationCapabilityInput;

export interface CapabilityModel {
    id: string;
    label: string;
    /** The order this capability acts on, named for its reader (position on
     *  the process chain and seller): the buyer holds a card per order of
     *  its process, and the rail renders this under the label. */
    orderLabel?: string;
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
    capabilities: CapabilityModel[];
    resolutionBreakdown?: EconomicBreakdownModel;
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
    capabilities: CapabilityModel[];
}

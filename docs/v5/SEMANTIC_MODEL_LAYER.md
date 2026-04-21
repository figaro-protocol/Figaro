# Semantic Model Layer

Status: implemented. `frontend/lib/semantic/` contains `models.ts`, `assemblyCapabilityBinding.ts`, `deriveInstitutionFromAssembly.ts`, `deriveProcessModelFromRuntime.ts`, and `deriveRoleContextsFromAssembly.ts`. The doctrine below describes the design rationale for that layer. Read it alongside [PUBLIC_GRAPH_MODEL.md](PUBLIC_GRAPH_MODEL.md) and [CURRENT_STATE.md](CURRENT_STATE.md).

## Purpose

The interface ontology defines what the frontend should understand.

This document defines the intermediate layer that makes that possible.

The semantic model layer sits between:

1. raw contract reads, writes, events, and indexer outputs
2. reusable mechanism-level UI modules and institution assemblies

Without this layer, the frontend collapses into:

1. ABI-driven forms
2. page-local conditionals
3. duplicated role logic
4. app-specific action wiring

The semantic layer exists to keep the UI institution-aware rather than contract-call-aware.

## Core Claim

The frontend should not render directly from raw on-chain data.

It should render from derived semantic objects that preserve:

1. institutional structure
2. mechanism boundaries
3. role context
4. guarantees and risks
5. capabilities and obligations
6. graph relationships

This layer is the bridge between protocol composition and UI composition.

## Inputs

The semantic layer may consume:

1. direct contract reads
2. contract events
3. local chain configuration
4. deployment metadata
5. off-chain institution metadata
6. indexer outputs
7. derived formulas from protocol state

It should not assume that all useful meaning is on-chain.

It should preserve a clear boundary between:

1. protocol truth
2. derived truth
3. institution metadata
4. presentation-only state

## Output Objects

The semantic layer should emit the objects defined by the interface ontology.

Minimum output families:

1. InstitutionModel
2. MechanismModel
3. RoleContext
4. ProcessModel
5. OrderNodeModel
6. AttachmentModel
7. CapabilityModel
8. GuaranteeModel
9. RiskBoundaryModel
10. EconomicBreakdownModel

## Required Properties Of The Layer

### 1. Deterministic Where Possible

If a semantic object can be derived deterministically from protocol state and public formulas, it should be.

Examples:

1. order lifecycle state
2. role membership at a specific order node
3. bond obligations
4. settled availability
5. some settlement breakdowns from protocol formulas

### 2. Explicit About Provenance

Every semantic field should be classifiable as one of:

1. on-chain enforced
2. derived from on-chain state
3. institution metadata
4. UI-local transient state

This prevents confusion between secured guarantees and helpful presentation.

### 3. Mechanism-Aware

The layer must understand that one institution may combine multiple mechanisms over the same process graph.

It should be able to answer:

1. what mechanisms are active here
2. what each mechanism adds
3. which role each mechanism assigns or recognizes
4. what actions each mechanism enables or forbids

### 4. Role-In-Context, Not Role-In-General

A wallet is not a sufficient semantic object.

The relevant object is a role in a particular institutional context.

Examples:

1. buyer of this order
2. seller of this order
3. assigned driver of this delivery suborder
4. eligible bidder in this auction
5. restaurant operator in this institution assembly

### 5. Graph-Aware

The layer must be able to model:

1. process topology
2. upstream and downstream order relations
3. cross-process provenance links
4. mechanism attachments
5. graph neighborhoods for focused inspection

## Canonical Models

The following are not final APIs. They are canonical shapes the frontend should be able to represent.

## InstitutionModel

Purpose: top-level semantic container for a composed institution.

Suggested fields:

1. `id`
2. `name`
3. `slug`
4. `network`
5. `availableNetworks`
6. `mechanisms`
7. `roles`
8. `processes`
9. `riskProfile`
10. `source`

Current implementation note:

1. the assembly-derived institution model now carries explicit provenance through `source`
2. role contexts are derived into the institution model rather than rebuilt ad hoc at each route
3. builder routes should consume a resolved institution artifact from the registry, not manually recompute validation and semantic projections
4. the prototype builder now resolves institutions by slug so multiple assemblies can share the same semantic projection and shell, even when they expose different module surfaces and non-coordinator extension mechanisms

Questions it should answer:

1. what institution is this
2. what contracts compose it
3. what roles exist here
4. what mechanisms are active
5. what process graphs belong to it

## MechanismModel

Purpose: semantic wrapper for one coordination mechanism.

Suggested fields:

1. `id`
2. `kind`
3. `name`
4. `description`
5. `riskClass`
6. `securityInheritance`
7. `contracts`
8. `touchesAssets`
9. `recognizedRoles`
10. `guarantees`
11. `attachments`
12. `capabilityFactories`

Questions it should answer:

1. what does this mechanism do
2. what does it secure
3. what can it touch
4. who can act through it
5. where is it attached

## RoleContext

Purpose: a role held by a specific actor in a specific institution context.

Suggested fields:

1. `id`
2. `actor`
3. `roleKind`
4. `displayName`
5. `scopeType`
6. `scopeId`
7. `mechanismIds`
8. `authoritySource`
9. `activeCapabilities`
10. `activeObligations`
11. `prototype`

Questions it should answer:

1. what role does this actor hold here
2. where did that role come from
3. what can the actor do now
4. what does the actor owe now

## ProcessModel

Purpose: semantic representation of a FigaroCore process plus attached mechanisms.

Suggested fields:

1. `processId`
2. `rootOrderId`
3. `orders`
4. `topology`
5. `stateSummary`
6. `economicSummary`
7. `attachments`
8. `downstreamLinks`
9. `upstreamLinks`

Current implementation note:

1. runtime derivation now emits process attachments for root order, currency binding, state summary, composed descendants, and connected actor presence
2. order derivation now emits runtime attachments for topology role, actor participation, and manifest commitments
3. upstream and downstream links are derived from runtime parent-child relations so topology consumers do not have to rebuild them locally

Questions it should answer:

1. what is the current state of this process
2. which orders belong to it
3. what mechanisms are attached
4. how does it relate to other processes

## OrderNodeModel

Purpose: semantic representation of one operational commitment node.

Suggested fields:

1. `orderId`
2. `processId`
3. `buyer`
4. `seller`
5. `payment`
6. `bondSummary`
7. `state`
8. `counterpartyStatus`
9. `attachments`
10. `capabilities`
11. `settlementBreakdown`

Questions it should answer:

1. what is this node
2. who are the counterparties
3. what is locked or settled here
4. what actions are currently valid

## AttachmentModel

Purpose: semantic link between a mechanism and an institution object.

Suggested fields:

1. `id`
2. `mechanismId`
3. `targetType`
4. `targetId`
5. `attachmentKind`
6. `state`
7. `visibleByDefault`

Questions it should answer:

1. what is attached
2. where is it attached
3. how should it be rendered
4. who should care about it

## CapabilityModel

Purpose: one valid next action available to an actor.

Suggested fields:

1. `id`
2. `label`
3. `actionKind`
4. `mechanismId`
5. `scopeType`
6. `scopeId`
7. `preconditions`
8. `riskLabel`
9. `writeTarget`
10. `uiPriority`

Questions it should answer:

1. can the actor do this now
2. why is it valid
3. what mechanism owns it
4. how risky or important is it

## GuaranteeModel

Purpose: explicit semantic statement of what is secured.

Suggested fields:

1. `id`
2. `mechanismId`
3. `label`
4. `description`
5. `guaranteeClass`
6. `sourceType`
7. `sourceReference`

Questions it should answer:

1. what exactly is guaranteed
2. who guarantees it
3. is it enforced, derived, or declared

## RiskBoundaryModel

Purpose: explicit statement of what a mechanism can and cannot affect.

Suggested fields:

1. `id`
2. `mechanismId`
3. `touchesAssets`
4. `canCustody`
5. `canReprice`
6. `canOnlySignal`
7. `dependsOn`
8. `failureModes`

## EconomicBreakdownModel

Purpose: semantic representation of economically meaningful values for one object or context.

Suggested fields:

1. `scopeType`
2. `scopeId`
3. `lockedBond`
4. `settledAvailable`
5. `typedOutputs`
6. `downstreamReferencedAmount`
7. `sourceClass`

Important note:

This model may contain fields whose provenance differs.

For example:

1. `lockedBond` may be directly derivable from protocol state
2. `settledAvailable` may be directly derivable from protocol state
3. `typedOutputs` may be derived or institution-defined rather than directly stored on-chain

The layer must preserve that distinction.

## Semantic Pipelines

The layer should be built as a set of pipelines rather than one giant transformer.

Suggested stages:

### 1. Data Acquisition

Collect:

1. reads
2. events
3. registry/config metadata
4. indexer results

### 2. Normalization

Convert raw outputs into stable internal records.

Examples:

1. normalized order records
2. normalized process records
3. normalized mechanism records
4. normalized deployment records

### 3. Semantic Derivation

Compute:

1. role contexts
2. capabilities
3. attachments
4. guarantees
5. risk boundaries
6. economic breakdowns

### 4. Institution Assembly Binding

Apply institution-specific metadata such as:

1. names
2. mechanism labels
3. role labels
4. visibility defaults
5. module ordering
6. emphasis rules

### 5. UI Projection

Emit stable models for reusable UI modules.

## Separation Of Truth Classes

Every semantic field should carry or imply one of the following truth classes:

1. `protocol-enforced`
2. `protocol-derived`
3. `institution-declared`
4. `indexer-derived`
5. `ui-local`

This should be treated as a first-class design rule, especially for:

1. guarantees
2. settlement breakdowns
3. provenance/accounting distinctions
4. builder-authored templates

## Why This Layer Matters For Composable UI

If frontend composability is real, the reusable unit cannot just be a visual component.

It must be a component plus a semantic contract.

That means reusable modules should depend on stable semantic inputs such as:

1. `MechanismModel`
2. `RoleContext`
3. `CapabilityModel`
4. `OrderNodeModel`
5. `RiskBoundaryModel`

That is what lets one module work across many institution assemblies.

## Frontend Folder Implication

This document implies a future frontend structure more like:

1. `lib/semantic/normalizers/`
2. `lib/semantic/derivers/`
3. `lib/semantic/models/`
4. `lib/semantic/projections/`
5. `components/mechanisms/`
6. `components/institutions/`

rather than a purely app-folder-first architecture.

## Non-Goals

This document does not define:

1. final TypeScript interfaces
2. final API boundaries
3. one mandatory indexer architecture
4. one mandatory persistence scheme for institution metadata

It defines the semantic responsibilities the frontend must satisfy.

## Open Questions

1. Which semantic derivations should be shared across all institutions versus left assembly-specific?
2. Which institution metadata should be signed, anchored, or versioned?
3. How should future builder tools author visibility and emphasis rules for modules?
4. Which economic distinctions should remain derived and which, if any, should become protocol or extension state?
5. How much of the semantic layer can be made portable across repos and apps?

## Practical Summary

The semantic model layer is the missing middle between contracts and composable UI.

It must:

1. normalize protocol state
2. derive institutional meaning
3. compute roles, capabilities, guarantees, and graph relationships
4. preserve distinctions between enforced, derived, declared, and local truth
5. provide stable semantic inputs to reusable UI modules

If this layer is built well, new institutions can inherit both security and interface logic without forcing a frontend rewrite every time.
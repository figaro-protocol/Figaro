# Step 1 Anchored Artifact Plan

Status: concrete first-pass Solidity and API plan for anchored artifact families in Figaro.

This plan translates the protocol doctrine into an implementation sequence.

It is intentionally concrete.

It is also intentionally bounded.

The goal is to make GHG the first working anchored artifact family without prematurely extracting a fake universal registry framework.

## Implementation Posture

Step 1 should be implemented with conservative code scope and clear protocol naming.

That means:

1. preserve GHG as the first concrete family
2. harden the schema-anchor surface in the current GHG module
3. avoid extracting a cross-domain artifact registry contract in this first pass
4. document the reusable extension seam so later families can reuse the pattern

The doctrine is generic.

The first code pass should still be family-specific.

## Why Not Extract A Universal Registry Yet

The current repo does not yet have multiple live artifact families that need one shared on-chain registry contract.

Extracting one now would introduce abstraction pressure without enough real protocol demand.

That would create the exact failure mode we want to avoid:

1. generic infrastructure in search of a concrete problem

So Step 1 should generalize the design language and invariants while keeping the implementation anchored in the GHG path.

## Step 1 Contract Scope

The first Solidity pass should touch:

1. `src/ghg/GHGTypes.sol`
2. `src/ghg/GHGReportingModule.sol`
3. `test/GHGReportingModule.t.sol`

It should not require immediate changes to:

1. `src/FigaroCore.sol`
2. composability contracts
3. Local Commerce service contracts

## Step 1 Solidity Objectives

### 1. Preserve append-only schema identity

Keep the current schema registration model append-only.

Required effect:

1. once a schema anchor exists, its meaning is never overwritten in place
2. new meaning requires new registration or new version identity

Current status:

1. already mostly true because `registerSchema` rejects duplicates

### 2. Add explicit admission lifecycle operations

Add explicit owner-controlled lifecycle operations for the current GHG schema anchors.

Recommended new functions:

1. `activateSchema(bytes32 schemaId)`
2. `deactivateSchema(bytes32 schemaId)`

Recommended new events:

1. `SchemaActivated(bytes32 indexed schemaId)`
2. `SchemaDeactivated(bytes32 indexed schemaId)`

Required behavior:

1. unknown schema ids revert
2. inactive schemas cannot be used for new boundaries or new requirements
3. historical requirements and submissions remain readable after deactivation

### 3. Keep the minimal anchor record narrow

Do not expand the schema anchor into a giant semantics object.

Phase-1 schema record should remain effectively:

1. `schemaId`
2. `version`
3. `uriHash`
4. `active`

Possible later additions are allowed in doctrine, but not required for this first pass.

### 4. Harden requirement identity

Implement the intended uniqueness rule for requirements inside a boundary.

The intended uniqueness key is:

1. boundary
2. order
3. disclosure kind
4. due stage

Recommended implementation:

1. add a mapping keyed by `keccak256(boundaryId, orderId, disclosureKind, dueStage)`
2. reject duplicate requirement creation

Recommended new error:

1. `RequirementAlreadyExists(bytes32 requirementKey)`

This closes the gap between the spec and the current module behavior.

### 5. Preserve domain-specific obligation logic

Do not move GHG-specific semantics into a generic registry layer.

The following should remain GHG-only in this pass:

1. reporting boundaries
2. disclosure kinds
3. due stages
4. submission supersession
5. requirement satisfaction accounting

### 6. Keep the family seam visible in code comments and naming

Even though the contract remains GHG-specific, code comments and docstrings should make clear that the anchor pattern is reusable.

The message should be:

1. this is the GHG family implementation of the anchored artifact pattern
2. future families may follow the same pattern without sharing this exact contract

## Step 1 API Objectives

The external API should remain stable where possible.

Recommended API posture:

1. keep `registerSchema(...)` as the current creation entrypoint for the GHG family
2. add explicit read and lifecycle operations rather than redesigning the whole surface
3. avoid introducing a generic `registerArtifactFamily(...)` API in this first pass

Recommended read helpers if useful for frontend clarity:

1. `isSchemaActive(bytes32 schemaId)`
2. existing `getSchema(bytes32 schemaId)` remains the canonical structured read

## Step 1 Frontend and ABI Consequences

The core frontend should treat GHG as the first anchored artifact family.

That means the first frontend/API pass should:

1. display schema anchor facts distinctly from off-chain schema meaning
2. expose active versus inactive status
3. preserve current GHG-specific UI terms such as boundary, requirement, and submission
4. avoid claiming that the UI is already a generic artifact browser

No generic manifest-schema UI is required in Step 1.

## Step 1 Testing Plan

Add or update tests covering:

1. schema activation after registration
2. schema deactivation preventing new boundaries
3. optional schema reactivation if supported
4. historical reads remaining valid after deactivation
5. duplicate requirement creation reverting for the uniqueness key
6. existing submission supersession behavior still working

The purpose of Step 1 tests is to prove:

1. admission lifecycle is hardened
2. requirement identity is hardened
3. no over-broad abstraction work was introduced

## Explicit Non-Goals

Step 1 should not do any of the following:

1. extract a universal cross-domain artifact registry contract
2. redesign `FigaroCore` around generalized document semantics
3. implement manifest schema anchors
4. implement offset purchase flows
5. rewrite downstream Local Commerce logic to use a generic artifact framework

## Deliverable Definition

Step 1 is complete when all of the following are true:

1. the GHG module has explicit schema activation and deactivation
2. new GHG obligations cannot reference inactive anchors
3. duplicate requirement identity is prevented
4. docs clearly state that GHG is the first anchored artifact family
5. the code remains concrete and family-specific rather than prematurely universalized

## Short Version

Implement Step 1 like this:

1. generic in doctrine
2. GHG-specific in first-pass Solidity
3. strict about anchor integrity
4. strict about requirement uniqueness
5. conservative about new abstraction layers
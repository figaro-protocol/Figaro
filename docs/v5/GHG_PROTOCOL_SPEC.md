# Figaro GHG Protocol Specification

Status: active conceptual specification for the generic GHG model in Figaro. The current on-chain implementation is narrower than the full target model described below: today the live primitives are `ClauseRegistry` for clause anchoring and `AttestationCoordinator` for clause-typed attestations.

This document defines what the generic GHG feature is for, what objects exist in the protocol, what each object means, and which invariants downstream apps must preserve.

Related design notes:

1. [CLAUSES.md](CLAUSES.md) — the clause validation architecture and the anchoring doctrine (payload vs anchor, the decision rule)

## Purpose

Financial and sustainability reporting regimes increasingly require firms to disclose greenhouse gas emissions across their value chains. Existing collection methods are weak in three ways:

1. Data is often approximate rather than attributable.
2. Responsibility is fragmented across many counterparties.
3. Reporting systems are separate from the economic systems that generated the activity.
4. Value-chain reporting is hard to make attributable because processs are long, multi-hop, and operationally fragmented.

Figaro addresses this by attaching GHG disclosure duties to the same process graph that coordinates the underlying trade and value-added chain.

The protocol goal is not to create a separate ESG database. The goal is to make emissions disclosure a protocol-native accountability layer on top of economically secured process graphs.

## Accounting Scope Terminology

This specification uses standard GHG accounting terminology.

Under the common GHG Protocol and ESG reporting model:

1. scope 1 means direct emissions from sources owned or controlled by the reporting entity
2. scope 2 means indirect emissions from purchased electricity, steam, heat, or cooling
3. scope 3 means other indirect value-chain emissions

The phrase `scope 4` is not part of the canonical scope 1, 2, 3 taxonomy.

In practice, `scope 4` is often used as shorthand for avoided emissions or comparative product-impact claims. Those claims are real, but they should not be modeled in this protocol as if they were a fourth standard inventory scope.

If a clause needs to support avoided-emissions reporting, it should say so explicitly as comparative or avoided-emissions disclosure rather than relying on the label `scope 4`.

## Current Contract Posture

The current generic contract surface is intentionally narrow.

Today, the live implementation supports:

1. permissionless on-chain clause anchoring via `ClauseRegistry`
2. clause-typed, role-scoped attestations via `AttestationCoordinator`
3. content-addressed off-chain disclosure artifacts referenced from attestations

Today, the live implementation does not yet encode:

1. the fuller boundary / requirement / submission model described later in this document as first-class storage objects
2. on-chain clause update or deletion

Read the sections below as the target disclosure vocabulary and workflow semantics, not as a claim that every object already exists on-chain in the live V5 runtime.

## Doctrine

The generic GHG model in Figaro is a disclosure graph linked to a process graph.

The process graph answers:

1. Which orders belong to the process?
2. Which counterparties are economically responsible for each order node?
3. Which commitments and settlements are secured by the protocol?

The GHG disclosure graph answers:

1. Which disclosures are required for that process?
2. Which order node does each disclosure attach to?
3. Which party is responsible for making it?
4. Which clause governs the disclosure?
5. Which submission is currently active?

## Core Definitions

### Clause

A clause defines the disclosure format and interpretation rules.

In protocol terms, a clause is identified by:

1. `clauseId`
2. version
3. `uriHash`

The clause is the contract between reporting participants about what the submitted content reference means.

The important design split is:

1. clause meaning and field definitions are primarily off-chain artifacts
2. clause identity, admissibility, and protocol reference points may be anchored on-chain

That split is deliberate. The protocol should not try to reproduce the full reporting standard, field catalog, or legal guidance on-chain.

### Clause Location

The default recommendation is:

1. keep the clause document off-chain
2. make that document content-addressable or otherwise immutable-by-reference
3. anchor only the minimum shared protocol facts on-chain, such as clause identifier, version, and content hash

This avoids a common web2-web3 mixup.

The web2 mistake is to treat a mutable off-chain document as if the chain had fully secured its meaning.

The web3 mistake is to force the entire reporting specification and business semantics on-chain when the protocol only needs a stable, auditable reference point.

Figaro should choose the narrow middle path:

1. off-chain clause semantics
2. on-chain clause anchoring where interoperability and auditability require it

### Clause Governance

Clause governance should be treated as a separate concern from disclosure submission.

Clause governance itself has two layers:

1. governance of the off-chain clause document and its meaning
2. governance of whether a clause anchor is admitted as valid protocol reference material

In the current implementation, the on-chain layer is:

1. registered once by the module owner
2. identified by `clauseId`
3. versioned by the clause payload itself
4. soft-switchable only through the `active` flag already stored in the clause record

The current contract therefore does not provide full clause governance. What it provides today is a minimal anchor registry.

If we need production-grade governance, the next generic step should be:

1. preserve append-only clause identity
2. add explicit activate and deactivate operations
3. prefer new-version registration over in-place mutation
4. keep historical submissions bound to the clause version they were filed under
5. avoid putting mutable business semantics directly on-chain

That is the correct direction for governance. In-place overwriting of clause meaning would damage auditability.

### Reporting Boundary

A reporting boundary is a buyer-opened reporting envelope for one economically secured process under one clause.

It identifies:

1. the process being reported
2. the root order anchoring that process
3. the reporting entity who opened the boundary
4. the clause under which disclosure is required
5. the completion state of the required disclosures inside that envelope

In the current contract design, one boundary is unique per:

1. process
2. root order
3. reporting entity
4. clause

That uniqueness follows from the boundary identifier derivation.

Boundary should remain process-wide in the generic model.

The reason is structural:

1. the reporting obligation is for the economically linked process, not for an isolated order in a vacuum
2. requirements are already order-level, so order granularity exists inside the boundary
3. process-wide boundaries allow aggregation, completion, and later downstream actions over the whole chain
4. order-wide boundaries would duplicate envelope state and make cross-order accounting harder

An order-only boundary is acceptable only as a degenerate case where the process itself has one economically relevant order node.

### Requirement

A requirement is a protocol-level instruction that a responsible party must disclose a specific kind of GHG information for a specific order node.

A requirement is defined by:

1. boundary
2. process
3. order
4. responsible party
5. clause
6. disclosure kind
7. due stage
8. whether it is required or optional

### Submission

A submission is the current or historical fulfillment of a requirement.

A submission records:

1. requirement
2. order
3. submitter
4. clause
5. content reference
6. whether it supersedes a prior submission
7. status

The active submission is the current protocol truth for that requirement.

## Disclosure Kinds

The generic model supports these disclosure kinds:

1. Commitment
2. Actual
3. Correction
4. Assurance

Their intended meanings are:

1. Commitment: the responsible party accepts the buyer-defined GHG disclosure conditions for this order node.
2. Actual: the responsible party submits its settled or measured emissions value for this order node.
3. Correction: the responsible party replaces the current active actual with a corrected value.
4. Assurance: an assurance or verification artifact linked to the requirement or disclosure chain.

Apps may expose a subset of these kinds, but they must not redefine their meaning.

## Due Stages

The generic model supports stage labels that describe when a disclosure is due relative to the economic workflow:

1. Create
2. Accept
3. Active
4. Resolve
5. PostResolve

These are semantic timing labels, not autonomous execution triggers. The protocol records due stages, but application workflows determine when users are prompted or required to submit.

## Canonical Generic Lifecycle

The generic protocol lifecycle is:

1. A clause is registered.
2. The buyer opens a reporting boundary for a process.
3. The buyer creates order-level disclosure requirements inside that boundary.
4. The responsible counterparty submits a commitment disclosure when it economically accepts the relevant work, if the application uses commitments.
5. The responsible counterparty later submits an actual disclosure.
6. If needed, a later correction supersedes the prior active submission.
7. The reporting entity may close the boundary after the required disclosures have been collected.

The protocol source of truth is the set of active submissions, not an off-chain summary artifact.

## Offset Extension

Carbon offset retirement is implemented as a process extension, separate from
the disclosure graph itself: `ProcessOffsetReceipt.sol` anchors it on-chain, and
the `figaro-offset-policy-v1` clause carries the committed offset-provider set.

The shipped mechanism (Path A) is:

1. the process accumulates attributable actual emissions across its required order-level disclosures
2. the buyer performs the offset retirement off-protocol at an external aggregator (Klima, Toucan, etc.)
3. the buyer calls `ProcessOffsetReceipt.record(processId, retirementTxHash, ...)` to anchor the `processId ↔ retirementTxHash` binding on-chain; the contract verifies the caller is the process's root buyer
4. the receipt becomes part of the protocol-visible economic history (the `ReceiptRecorded` event)
5. the GHG layer may then attach a disclosure or assurance artifact referencing the offset evidence

Receipts are a separate artifact family from attestations — they carry no
agreement clause and no merkle inclusion proof, so they are anchored by
`ProcessOffsetReceipt`, not `AttestationCoordinator`.

This keeps two different things separate:

1. emissions disclosure, which states what happened
2. offset procurement, which states what the buyer chose to do in response

The first belongs in the disclosure graph. The second belongs in the process graph, anchored by its own receipt primitive, with optional disclosure artifacts attached.

## Invariants

The intended generic invariants are:

1. A boundary must reference a real process and its real root order.
2. Only the reporting entity that opened a boundary may create requirements inside it.
3. A requirement must attach to an order in the same process as the boundary.
4. Only the responsible party may satisfy a generic requirement.
5. A new submission supersedes the prior active submission for the same requirement.
6. Boundary completion means all required requirements in that boundary are satisfied by active submissions.
7. Requirement identity should be unique by:
   boundary
   order
   disclosure kind
   due stage

Invariant 7 is part of the intended model even where the current implementation still needs hardening.

## Non-Goals Of The Generic Layer

The generic GHG layer must not encode app-specific business semantics such as:

1. Dutch auction rules
2. driver assignment logic
3. restaurant-specific workflows
4. delivery lifecycle state machines
5. app-specific offset marketplace integrations

Those belong in downstream service-layer adapters such as Figaro Local Commerce.

## Role Of The Figaro Dapp

The Figaro dapp is the reference surface for the generic protocol model.

Its GHG responsibilities are:

1. expose the disclosure graph as a first-class protocol feature
2. let users inspect boundaries, requirements, and active submissions
3. support the generic workflow of opening boundaries, creating requirements, and submitting disclosures
4. avoid any local-commerce-specific lifecycle assumptions

## Relationship To The Core Primitive

This GHG work should be understood in terms of the actual protocol primitive.

`FigaroCore` is not just an app backend. It is a secure coordination substrate for permissionless process graphs with bonded economic obligations.

That means downstream features should be designed as protocol layers over the core process graph, not as isolated app-specific databases or form systems.

In practical terms, the core gives us:

1. a process graph
2. economically secured order relationships
3. role-bearing counterparties at each order node
4. protocol-visible lifecycle transitions and settlement history

Domain modules such as GHG then add:

1. referenced artifacts
2. role-bound duties over those artifacts
3. current active protocol truth about those duties

This is the right abstraction level for implementation work.

The protocol should not drift downward into a local-commerce-specific special case.

The protocol should also not drift upward into a fake universal ontology for every possible institution or document.

The correct middle layer is:

1. secure process graph at the core
2. anchored artifact families and role-bound obligations as reusable protocol extensions
3. domain-specific modules as concrete realizations of that pattern

GHG is the first concrete artifact family in this model, not the last.

Manifest clause, quality records, provenance documents, safety declarations, assurance artifacts, and other process-linked references may later fit the same pattern where shared reference integrity matters.

## Implementation Direction

The first implementation step should therefore be framed generically, but with a hard boundary.

Step 1 should implement a protocol concept for anchored artifact families tied to secure process graphs.

Step 1 should not attempt to implement a universal document system.

The intended scope for Step 1 is:

1. preserve GHG as the first concrete family
2. define the anchor layer so other artifact families can fit later
3. keep domain workflow semantics outside the generic anchor primitive
4. preserve the protocol distinction between per-instance payload data and shared reference semantics

That gives Figaro the right kind of generality:

1. broader than a GHG-only exception
2. narrower than an abstract everything-protocol

## Relationship To Downstream Apps

Downstream apps may specialize the generic model, but they must preserve these meanings:

1. boundary remains the reporting envelope for a process under a clause
2. requirement remains the accountable disclosure duty for an order node
3. active submission remains the current protocol truth for that requirement
4. supersession remains the mechanism for correction and replacement

Figaro Local Commerce is the first service-layer specialization of this model.
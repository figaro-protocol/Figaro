# Figaro Anchored Artifact Design

Status: implementation note for minimal on-chain anchor design for reusable artifact families.

This note defines the narrowest on-chain anchor surface that preserves auditability without pushing full reporting or business semantics on-chain.

The current concrete implementation family is GHG schema anchoring, but the pattern described here is broader than GHG.

## Goal

Figaro sometimes needs a stable on-chain reference for artifact families such as disclosure schemas.

It does not need the chain to store the full reporting handbook, field catalog, legal interpretation, or methodology prose.

The design goal is:

1. off-chain schema semantics
2. on-chain schema anchoring

## What The Chain Must Know

The chain only needs enough information to answer these questions:

1. which schema did this disclosure requirement refer to
2. which version of that schema was intended
3. whether the schema was admitted for use in the protocol at the time
4. whether later submissions still point to the same anchored schema identity

## Minimal Anchor Fields

The minimal anchor record should include:

1. `schemaId`
2. `version`
3. immutable content reference or content hash
4. active flag

Optional future fields may include:

1. schema family identifier
2. supersedes schema identifier
3. metadata URI pointer
4. admission timestamp
5. deactivation timestamp

## What Must Stay Off-Chain

The following should remain off-chain documents referenced by the anchor:

1. human-readable reporting instructions
2. full field definitions
3. methodological assumptions
4. legal or jurisdictional interpretation
5. baseline logic for avoided-emissions claims
6. assurance guidance and audit procedures

These can be content-addressed, versioned, and mirrored, but they should not be reimplemented as mutable contract logic.

## Identity Rules

Schema identity should be append-only.

That means:

1. no in-place rewriting of schema meaning
2. no silent mutation of the content reference behind an existing identity
3. new meaning requires a new version or new schema identity

Historical submissions must remain interpretable against the exact schema anchor they were filed under.

## Governance Rules

Schema-anchor governance should govern admission, not truth.

The protocol can govern:

1. whether an anchor is active
2. whether a new anchor may be registered
3. whether an anchor is deprecated

The protocol should not claim to govern:

1. the scientific truth of the schema
2. the legal sufficiency of a disclosure in every jurisdiction
3. the correctness of off-chain methodology prose

## Recommended Lifecycle

The intended lifecycle is:

1. publish schema document off-chain in immutable-by-reference form
2. register the schema anchor on-chain with id, version, and content hash
3. mark the anchor active
4. allow new requirements to reference only admitted anchors
5. when the schema changes materially, register a new version rather than mutating the old one
6. optionally deactivate the old anchor for future use while preserving its historical validity

## Minimal Solidity Implications

If we later change Solidity, the narrow requirements are:

1. preserve current schema identity semantics
2. add explicit activate and deactivate operations
3. reject new requirements that reference inactive or unknown anchors
4. keep historical submissions readable after deactivation
5. avoid adding mutable freeform text or business logic into the anchor registry

## UI Implications

The UI should display two separate layers:

1. on-chain anchor facts
2. off-chain schema document details

Users should be able to verify:

1. which schema anchor a disclosure used
2. which content hash that anchor pointed to
3. whether the rendered off-chain document matches the anchored reference

## Anti-Patterns

The design must avoid these failures:

1. mutable web docs presented as if they were on-chain truth
2. giant on-chain schema payloads that freeze reporting semantics into brittle contract state
3. in-place overwrites of version meaning
4. mixing app-specific workflow logic into the generic schema registry

## Decision Rule

When choosing whether a schema fact belongs on-chain, ask:

does the protocol need this fact to preserve shared reference integrity across counterparties and over time?

If yes, anchor it.

If no, keep it off-chain and reference it immutably.

## Reusable Pattern Beyond GHG

This design is broader than GHG.

The reusable protocol pattern is not "GHG registry everywhere." It is:

1. off-chain document semantics
2. on-chain anchor for shared reference integrity when needed

That pattern should be reused anywhere Figaro needs multiple parties, tools, or downstream contracts to agree on the meaning of a referenced document over time.

## Manifest Implications

The manifest should be split into two different concerns.

### Per-order manifest payload

The actual manifest payload for a specific order is transactional data.

Examples:

1. pickup location
2. dropoff zone
3. mass or volume
4. service class
5. sealed delivery address
6. buyer-provided notes

That payload does not usually need a schema registry entry of its own.

Why:

1. it is instance data, not a shared standard
2. it is often privacy-sensitive
3. it changes from order to order
4. counterparties usually only need the bytes payload and the app decoder for that specific flow

So the per-order manifest should remain an order payload, with selective sealing or encryption where required.

### Manifest format or schema

The manifest format is different.

If Figaro wants multiple apps, routers, templates, or verticals to interoperate around a stable manifest meaning, then the manifest format should follow the same anchor pattern as GHG:

1. define manifest semantics off-chain
2. anchor manifest schema identity/version/hash on-chain only if cross-party or cross-app interpretation needs to remain stable over time

In other words:

1. do not register every manifest instance
2. consider anchoring manifest schema families when they become shared protocol references

## Practical Recommendation

For the next implementation step, the abstraction should become slightly more generic.

Recommended shape:

1. keep the current GHG-specific workflow logic separate
2. make the anchor primitive conceptually generic enough to support other document families later
3. do not prematurely force manifests into the same module if the only current need is local-commerce-specific payload encoding

The right abstraction boundary is:

1. generic document-anchor pattern in protocol thinking
2. GHG-specific registry and workflow in the current implementation unless manifest interoperability becomes a first-class protocol requirement

## Step 1 Framing

Step 1 should be documented and implemented at the protocol level as follows.

`FigaroCore` is the secure base primitive.

The anchor work is not just a convenience layer for GHG screens. It is a reusable extension pattern for attaching stable reference semantics to bonded process graphs.

Step 1 should therefore define:

1. an anchored artifact-family concept
2. minimal on-chain anchor facts for shared reference integrity
3. the boundary between artifact anchors and domain-specific workflow logic

Step 1 should explicitly avoid two opposite errors.

The first error is being too narrow:

1. treating schema anchoring as a GHG-only exception

The second error is being too broad:

1. pretending the protocol needs a universal ontology for all possible documents, agents, or institutions

The correct level of abstraction is:

1. secure process graph at the base layer
2. anchored artifact families as reusable protocol extensions
3. concrete domain modules such as GHG built on top of that extension pattern

This is generic enough to support later families such as manifest schema anchors, provenance references, quality records, or assurance frameworks.

It is not so generic that the protocol loses contact with the concrete coordination problems it is solving.

## Step 1 Checklist

Step 1 should be implemented in this order.

### 1. Lock the protocol vocabulary

Define the generic vocabulary at the protocol level before changing Solidity names or data structures.

The vocabulary should distinguish:

1. process graph
2. artifact family
3. artifact anchor
4. per-instance payload
5. domain-specific obligation logic

The goal is to prevent the implementation from collapsing back into either:

1. a GHG-only special case
2. a vague everything-registry

### 2. Keep the generic anchor surface minimal

The generic anchor concept should only carry facts needed for shared reference integrity.

Phase-1 generic facts should remain limited to:

1. family or domain identifier
2. anchor identifier
3. version
4. immutable content reference or content hash
5. active or admitted status

Do not add freeform semantic payloads or business logic to the generic anchor layer.

### 3. Preserve the payload-versus-anchor distinction

The implementation must explicitly separate:

1. per-instance operational payloads, such as order manifests or sealed delivery data
2. shared reference semantics, such as schema identity and version meaning

If the protocol only needs instance payload delivery, do not create an anchor.

If multiple parties or tools must preserve stable interpretation over time, use an anchor.

### 4. Keep obligation logic domain-specific

The generic anchor layer should not own GHG workflow semantics.

GHG-specific concepts should remain in the GHG module, including:

1. reporting boundaries
2. order-level requirements
3. disclosure kinds
4. due stages
5. submission supersession rules

This allows future artifact families to reuse the anchor pattern without inheriting GHG-specific behavior.

### 5. Harden generic invariants at the admission boundary

The first generic implementation should enforce the minimum integrity rules:

1. unknown anchors cannot be referenced
2. inactive anchors cannot be used for new obligations
3. historical records remain readable after deactivation
4. version meaning is append-only

### 6. Treat GHG as the first concrete family

The first rollout should still ship through the GHG path.

That means:

1. the first family exercised by the design is GHG
2. the API and docs should remain concrete enough to support immediate GHG work
3. future families remain examples, not current scope commitments

### 7. Leave a clean extension seam

The implementation should make later support possible for families such as:

1. manifest schema anchors
2. provenance reference standards
3. quality and assurance records
4. certification or safety reference frameworks

But Step 1 should not implement those families yet.

### 8. Align docs and UI language

Once the protocol vocabulary is set, downstream docs and UI language should stop presenting the anchor concept as a GHG-only oddity.

The message should be:

1. FigaroCore secures process graphs
2. anchored artifact families add stable reference semantics where the protocol needs them
3. GHG is the first concrete realization of that pattern

## Current Codebase Read

Today the codebase already hints at this distinction.

1. FigaroCore treats `manifest` as per-order payload bytes emitted in `OrderCreated`, not as a first-class schema-governed object
2. Local Commerce uses sealed manifest payloads for delivery privacy
3. TemplateRegistry already includes an optional `schemaHash` for an off-chain manifest schema reference

That means the architecture is already moving toward the right pattern, but inconsistently.

The missing decision is not whether manifests should become GHG.

It is whether manifest format identity should become an explicit reusable anchor concept once multiple apps or protocol surfaces need to rely on the same manifest meaning.
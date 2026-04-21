# Figaro Protocol Extension Doctrine

Status: architectural doctrine for extending FigaroCore without collapsing into app-specific logic or abstract universality.

## Core Claim

`FigaroCore` should be understood as a secure coordination substrate.

It is not merely an app backend and not merely a contract for order storage.

Its role is to secure permissionless process graphs through economically bonded commitments and protocol-visible lifecycle transitions.

That makes it a base primitive for permissionless institution design.

## What The Core Secures

At the protocol level, the core secures:

1. process topology
2. economic obligations between counterparties
3. role-bearing order nodes
4. lifecycle and settlement history
5. atomic process resolution semantics

The core does not attempt to encode every domain-specific meaning directly.

## How Extensions Should Work

Extensions should attach new protocol meaning to the secured process graph.

The general extension pattern is:

1. the core secures the process graph
2. an extension defines a family of protocol-relevant artifacts or duties
3. the extension attaches those duties to roles, orders, or processes
4. the extension preserves current protocol truth without mutating the core into app logic

This lets multiple downstream applications share the same underlying trust and coordination guarantees.

## Bounded Generality

Figaro should be generic in a disciplined way.

Too little generality produces:

1. one-off app-specific modules that cannot become reusable protocol concepts

Too much generality produces:

1. a fake universal ontology
2. abstract registries disconnected from concrete coordination problems
3. protocol bloat that mistakes possibility for scope

The right level of generality is:

1. generic enough to support reusable extension patterns
2. concrete enough to stay grounded in process coordination, obligations, and verifiable reference integrity

## Artifact Families

One important extension pattern is the anchored artifact family.

An anchored artifact family exists when:

1. multiple parties or tools must share a stable interpretation of some referenced artifact
2. that interpretation must remain auditable over time
3. the protocol needs a minimal on-chain reference point for that artifact family

The generic pattern is:

1. off-chain semantics
2. on-chain anchor for shared reference integrity

This pattern should be reused selectively, not indiscriminately.

## Payloads Versus Anchors

The protocol must separate two different things.

### Per-instance payloads

These are operational data values attached to a particular order or process instance.

Examples:

1. a specific delivery manifest
2. sealed address data
3. notes for a particular fulfillment event

These are often private, mutable at the business level, or specific to one workflow instance.

They do not automatically deserve a protocol-level anchor.

### Shared reference semantics

These are definitions whose meaning must remain stable across parties, tools, or time.

Examples:

1. a disclosure schema
2. a manifest schema family
3. a certification framework reference
4. a quality-assurance reference standard

These may justify a protocol-level anchor.

## Current Consequence For GHG

GHG is the first concrete artifact family in the protocol.

It should be implemented as:

1. generic anchor logic for shared reference integrity
2. GHG-specific obligation and submission logic layered on top

The protocol should not mistake GHG for the whole extension doctrine.

## Current Consequence For Manifests

Manifest payloads remain per-instance order data.

Manifest schemas may later become a distinct anchored artifact family if multiple apps, templates, or routers need stable shared interpretation over time.

That is a separate decision from whether an order carries a manifest payload today.

## Decision Rule

When deciding whether a new domain feature belongs in the protocol, ask:

1. does it attach meaning to the secured process graph
2. does it require stable shared interpretation across counterparties or tools
3. does the protocol need to preserve that reference integrity over time

If the answer is yes, it may deserve a reusable extension pattern.

If the answer is no, it likely belongs in app logic, off-chain infrastructure, or per-instance payload handling.

## Design Guardrails

Every extension proposal should be checked against these guardrails.

1. Do not push app-specific workflow logic into the core.
2. Do not make the protocol so abstract that every document becomes a first-class ontology object.
3. Do preserve reusable patterns when multiple domains clearly need the same coordination primitive.
4. Do keep the protocol legible: process graph first, extension semantics second, app UX last.

## Practical Summary

The doctrine is:

1. `FigaroCore` secures permissionless process coordination
2. extensions add reusable protocol semantics over that secure base
3. anchored artifact families are one such extension pattern
4. GHG is the first concrete family, not the terminal abstraction
5. generality must remain bounded by real coordination needs
# Figaro Eats GHG Workflow Specification

Status: active workflow note for the Eats-specific GHG model. The current V5 runtime uses `SchemaRegistry` plus `AttestationCoordinator`; the boundary / requirement terminology below should be read as the intended workflow shape layered over those narrower primitives.

This document specializes the generic GHG protocol model defined in Figaro-Prototype2 for the food-delivery workflow in Figaro Eats.

## Purpose

Figaro Eats demonstrates how protocol-native GHG accounting works in a real multi-party service flow.
Under the runtime thesis, Eats should be treated as the first concrete archetype of merchant fulfillment plus one-hop delivery, not as the final architectural shape of the broader protocol frontend.

The Eats workflow has three relevant actors:

1. buyer
2. restaurant
3. driver

The buyer wants attributable emissions reporting for both food preparation and delivery service. The Eats GHG workflow binds those disclosures to the same economically secured process that coordinates the order and the delivery job.

The default accounting target in Eats is attributable process emissions, not avoided-emissions marketing claims.

In standard ESG and GHG reporting terms, the relevant corporate taxonomy is scope 1, scope 2, and scope 3. The phrase `scope 4` is commonly used as shorthand for avoided or comparative emissions, but it is not a canonical GHG Protocol inventory scope.

If Eats ever supports avoided-emissions claims, that should be done through an explicit comparative or avoided-emissions schema, not by treating `scope 4` as a built-in protocol field.

## Relationship To The Generic Protocol

The generic source of truth lives in Figaro-Prototype2.

Eats does not redefine the generic concepts of:

1. schema
2. reporting boundary
3. requirement
4. submission
5. supersession

Eats also inherits the generic design split between:

1. off-chain schema meaning
2. on-chain schema anchoring

Eats adds application-specific orchestration because the delivery order seller is the Dutch auction market contract, while the real delivery performer becomes the assigned driver after claim.

In practical terms, Eats should treat schemas as off-chain disclosure specifications referenced by stable on-chain identifiers and hashes. Eats should not try to hardcode a mutable reporting handbook into contract logic.

## Eats-Specific Objective

The Eats GHG workflow must let the buyer do two things:

1. define the GHG disclosure conditions for the restaurant portion of the process
2. define the GHG disclosure conditions for the delivery portion of the process

The workflow must then ensure:

1. the restaurant accepts those conditions when accepting the food order
2. the driver accepts those conditions when claiming the delivery job
3. both parties later submit their actual emissions values
4. later corrected values supersede earlier active values when needed

## Canonical Eats Model

For one Eats process, the canonical reporting shape is:

1. one buyer-opened reporting boundary for the Eats schema
2. restaurant commitment requirement on the food order
3. restaurant actual requirement on the food order
4. driver commitment requirement on the delivery order
5. driver actual requirement on the delivery order

Corrections may be supported later through superseding submissions, but the first-class workflow is commitment followed by actual.

## Role Mapping

### Buyer

The buyer is the reporting entity for the Eats process.

The buyer:

1. opens the reporting boundary
2. defines the disclosure requirements for restaurant and delivery order nodes
3. chooses the schema and associated GHG conditions, targets, or parameter set

### Restaurant

The restaurant is the responsible party for the food order disclosures.

The restaurant must:

1. submit a commitment disclosure when accepting the food order
2. later submit an actual emissions reading for the food order

### Driver

The driver is the responsible party for the delivery order disclosures.

Because the delivery order seller is initially the auction market contract, Eats must resolve responsibility dynamically:

1. before claim, the delivery requirement may be created without a concrete responsible driver address
2. after claim, the assigned driver becomes the only valid submitter for that delivery requirement

The driver must:

1. submit a commitment disclosure when claiming and accepting the delivery service
2. later submit an actual emissions reading for the delivery order

## Boundary Definition In Eats

In Eats, a reporting boundary means:

the buyer-opened GHG reporting envelope for one food-delivery process under the Eats schema.

It contains both:

1. food-order disclosure requirements
2. delivery-order disclosure requirements

The Eats UI should treat this as the single reporting scope for the process.

## Canonical Eats Journey

### 1. Buyer places the food order

The buyer creates the root order and process.

### 2. Buyer opens the GHG boundary

The buyer opens the reporting boundary for that process under the Eats schema.

### 3. Buyer defines restaurant requirements

The buyer creates:

1. a commitment requirement for the food order
2. an actual requirement for the food order

These requirements express the restaurant-side GHG conditions for the order.

### 4. Restaurant accepts the food order

At food-order acceptance, the restaurant must submit the commitment disclosure.

This commitment means:

I accept the buyer-defined GHG conditions for the food preparation node.

This is a workflow-triggered event, not a lazy UI convenience action.

### 5. Buyer posts the delivery job

The buyer creates the delivery sub-order through the Eats flow.

### 6. Buyer defines delivery requirements

The buyer creates:

1. a commitment requirement for the delivery order
2. an actual requirement for the delivery order

These requirements express the delivery-side GHG conditions for the service.

### 7. Driver claims the delivery job

At claim and service acceptance, the assigned driver must submit the commitment disclosure.

This commitment means:

I accept the buyer-defined GHG conditions for the delivery node.

### 8. Restaurant submits actual

After completing the food preparation work, the restaurant submits its actual reading for the food order.

### 9. Driver submits actual

After completing the delivery work, the driver submits its actual reading for the delivery order.

### 10. Corrections, if needed

If a party needs to amend its current value, the later submission supersedes the prior active submission.

## Semantic Meanings

The Eats workflow uses the generic disclosure kinds with these concrete meanings:

1. Commitment: acceptance of the buyer-defined GHG terms for that specific order node
2. Actual: the later emissions reading for that specific order node
3. Correction: a superseding replacement for the current active actual

## Required Invariants For Eats

The intended Eats invariants are:

1. The restaurant commitment is created before or by food-order acceptance and is submitted at acceptance time.
2. The driver commitment is created before or by delivery-claim time and is submitted at claim time.
3. The restaurant alone may satisfy restaurant-side requirements.
4. The assigned driver alone may satisfy delivery-side requirements.
5. No duplicate requirement should exist for the same:
   boundary
   order
   disclosure kind
   due stage
6. The Eats UI must not claim that a commitment is recorded at acceptance or claim unless that protocol-side write truly occurs in that workflow step.

## What Eats Must Not Do

The Eats app must not:

1. treat a panel mount as the authoritative moment of commitment submission
2. create duplicate requirements as a retry strategy
3. present delivery-market placeholder responsibility as if it were the final accountable driver
4. summarize process completion in a way that hides duplicate or missing requirements

## Role Of The Eats Dapp

The Eats dapp is responsible for:

1. collecting buyer-side GHG conditions during the commerce flow
2. binding restaurant commitment to order acceptance
3. binding driver commitment to delivery claim
4. exposing later actual submission and correction workflows
5. presenting process-level GHG status in language consistent with the protocol truth

## Relationship To Implementation Work

This spec implies the following implementation direction:

1. keep the generic disclosure graph in Prototype2
2. keep the Eats-specific coordinator wrapper
3. rewrite Eats workflow binding so commitments are submitted at the real acceptance steps
4. harden generic and app-level requirement uniqueness
5. update tests and copy to reflect this workflow exactly
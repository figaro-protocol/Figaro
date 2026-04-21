# Figaro Avoided Emissions Note

Status: design note for comparative and avoided-emissions support.

This note defines how Figaro should support avoided-emissions claims without confusing them with standard greenhouse gas inventory scopes.

## Terminology

Standard GHG inventory reporting uses:

1. scope 1
2. scope 2
3. scope 3

`Scope 4` is not part of the canonical GHG Protocol inventory taxonomy.

In practice, teams sometimes use `scope 4` as shorthand for avoided emissions, comparative emissions, or climate benefits relative to a baseline. Figaro should avoid that label in protocol design because it invites category confusion.

The preferred protocol language is:

1. attributable emissions for what actually happened in the process
2. comparative or avoided-emissions claims for counterfactual statements about what might have happened under a baseline scenario

## What Avoided Emissions Are

Avoided emissions are not the same thing as direct, purchased-energy, or value-chain inventory emissions.

An avoided-emissions claim says:

1. a product, service, routing choice, or intervention changed the expected emissions outcome relative to a defined baseline
2. the claim depends on a comparison method and baseline assumptions
3. the claim is therefore more contestable than ordinary attributable process reporting

That means avoided-emissions reporting should always be schema-explicit.

## Protocol Position

Figaro should support avoided-emissions disclosure only as an optional specialization layered on top of the base disclosure graph.

The base disclosure graph should continue to answer:

1. what process occurred
2. which order nodes are accountable
3. who was responsible for each disclosure
4. what attributable emissions were reported for those nodes

An avoided-emissions extension may answer:

1. what baseline was selected
2. what comparison method was used
3. what counterfactual or avoided-emissions estimate was claimed
4. who authored or assured the claim

## Why This Must Be Separate

Attributable reporting and avoided-emissions reporting behave differently.

Attributable reporting is:

1. process-bound
2. actor-bound
3. tied to actual economic execution

Avoided-emissions reporting is:

1. model-bound
2. baseline-dependent
3. partly counterfactual

If Figaro mixes these into one undifferentiated schema, the protocol will lose semantic clarity and downstream auditability.

## Recommended Schema Shape

If we support avoided-emissions reporting, we should do it through a distinct schema family.

That schema family should identify at minimum:

1. baseline definition reference
2. comparison method reference
3. system boundary reference
4. claimed avoided-emissions value reference
5. uncertainty or qualification reference
6. assurance artifact reference, when available

The key design rule is that Figaro should not hardcode baseline methodology in the core protocol.

## Relationship To The Process Graph

Avoided-emissions claims may attach to:

1. a whole process
2. a selected order node
3. a downstream settlement or offset action

But the claim should remain a disclosure artifact, not a substitute for the process facts themselves.

The process graph remains the source of truth for what economically happened.

## Relationship To Offset Procurement

Avoided emissions and carbon offsets are different things.

Avoided emissions claim that a process reduced or prevented emissions relative to a baseline.

Offset procurement means a party later bought credits, removals, or compensation instruments in response to emissions.

Figaro should keep these separate:

1. avoided-emissions claims belong in a comparative disclosure schema
2. offset procurement belongs in the process graph as an economic action

## Implementation Guidance

Before any Solidity work, the next design step should be:

1. define the minimal avoided-emissions schema anchor fields
2. define which actors may author or assure a comparative claim
3. define whether the claim attaches to a process boundary or a requirement lineage
4. define how the UI distinguishes attributable emissions from avoided-emissions claims

Until those rules are written, avoided-emissions should remain out of the base generic workflow.
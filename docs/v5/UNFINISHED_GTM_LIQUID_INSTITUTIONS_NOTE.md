# Unfinished GTM Note: Liquid Institutions

Status: unfinished framing note, not a final decision.

This note captures one possible GTM consequence of the Coasean argument already present in THEORY.md and VISION.md.

## Core Claim

Figaro should keep leading with its core property:

1. self-enforcing agreements between strangers

Then it should push that property to its organizational consequence:

1. when trust is priced directly with the bond, the firm stops being the default unit of coordination
2. the transaction assembles a temporary institution of directly bonded contributors
3. that institution lasts until the buyer resolves

The short public label for this consequence is:

1. liquid institutions

The more precise technical label is:

1. transaction-scoped institutions

## Vocabulary Guardrails

Do not say:

1. every RWA is a wallet address
2. every asset is automatically an actor
3. attestations define the agreement terms
4. organisms as if the protocol literally decomposes biology

Prefer:

1. wallet-addressed contributors
2. directly bonded participants
3. transaction-scoped institutions
4. liquid institutions

The protocol coordinates accountable parties, not abstract objects.

A human can be one.
A machine can be one if it is controlled by a wallet or agent key.
A treasury, cooperative, public service, or cause can shape denomination and institutional context.

But the kernel still settles between accountable addresses that can bond, receive tokens, and carry obligations.

Agreement terms live in the signed commitment and the schema-composed agreement hash.

Attestations are evidence about lifecycle, disclosure, and fulfillment around that agreement.

## Messaging Stack

### Layer 1: Property

Self-enforcing agreements between strangers.

### Layer 2: Consequence

If trust can be priced directly, the firm is no longer the default container of production.

### Layer 3: New Frame

Each transaction assembles a temporary institution of directly bonded contributors.

### Layer 4: Runtime Meaning

Prototype2 is the canonical runtime for rendering those institutions.
Local Commerce is the first archetype proving the model.

## Page Hierarchy

### Home

The homepage should stay property-first.

It should say:

1. what Figaro guarantees
2. why that ends the leap of faith
3. what follows from that guarantee: liquid institutions

It should not start with Coase, RWAs, or institutional theory.

### Why Figaro

This page should push the Coase argument to its full consequence.

It should say:

1. firms existed because coordination was expensive
2. Figaro prices coordination risk directly through the bond
3. the organization becomes transaction-scoped rather than permanently managerial
4. contributors price themselves directly or through explicit mechanisms like auctions
5. attestations prove fulfillment and disclosure facts around the deal

### Builders

The builders surface should translate the frame into runtime language.

It should say:

1. an institution assembly is how you render a transaction-scoped institution
2. Level 1 changes the shell, not the economic mechanism
3. Level 2 adds coordination semantics
4. Level 3 adds new economic mechanisms and therefore new risk

## Scaling Roadmap

The scaling question is not only how to make Figaro cheaper.

It is how to scale without weakening:

1. asymmetric bonding
2. buyer dominance
3. atomic resolution
4. immutable evidence
5. no escape hatches

### Level 1: Kernel-Preserving Scale

Goal: more throughput without changing the kernel or splitting one process across multiple domains.

Recommended path:

1. deploy on Ethereum mainnet first as the canonical settlement domain
2. keep every atomic process entirely on one domain
3. keep agreements and rich evidence off-chain, content-addressed
4. batch high-volume evidence behind Merkle roots where full on-chain leaf storage is unnecessary

Merkle proofs are useful for:

1. attestation batch inclusion
2. disclosure artifact inclusion
3. operator or registry snapshots
4. large capability or provider lists that do not need per-leaf writes on-chain

Merkle proofs are not a substitute for settlement truth.

They compress data availability and inclusion.

### Level 2: Coordinator And Evidence Scale

Goal: scale privacy-heavy and evidence-heavy workflows without changing the settlement primitive.

Recommended path:

1. use zk proofs for proximity or location-threshold claims without exposing raw coordinates
2. use zk proofs for disclosure or compliance predicates without exposing all underlying data
3. verify proof outputs through lightweight coordinator or attestation-layer contracts
4. combine zk outputs with Merkleized evidence bundles for selective reveal later

This is the right place for:

1. zk proximity proofs
2. zk compliance gates
3. privacy-preserving fulfillment evidence

This is not yet a new kernel.

It is a protocol-extension layer that preserves the original payoff matrix.

### Level 3: New Execution Domain

Goal: scale the kernel itself through validity-based batching.

Long-run path:

1. a zk-validity rollup or L3 specialized for Figaro state transitions
2. batched proofs for commit and resolve operations
3. proof-enforced invariants for bond formulas, conservation, authority, and active-order integrity
4. publication of validity proofs to a cheaper parent chain while keeping each process single-domain

This is where rollups and L3s make sense as true kernel scaling, rather than merely cheaper deployment.

## Rollup Guidance

Use rollups carefully.

1. optimistic systems are acceptable as an interim deployment surface
2. zk-validity systems are the cleaner long-run fit because they align better with the protocol's law-by-math posture
3. do not split one atomic process tree across multiple chains or layers if you want to preserve true atomic resolution

Cross-domain coordination should usually be modeled as:

1. linked processes

not:

1. one process stretched across multiple settlement domains

## What This Framing Adds

The current framing already says:

1. no firms required

This note pushes the implication one step further:

1. the replacement for the firm is not chaos
2. it is a temporary institution assembled directly from bonded contributors
3. the runtime is the environment that renders and operates those institutions

That is stronger than platform-displacement rhetoric and more technically faithful than generic RWA language.
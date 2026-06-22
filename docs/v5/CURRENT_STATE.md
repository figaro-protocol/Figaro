# Current State

Status: canonical orientation note for the repository as of 2026-04-10.

The active V5 documentation set now lives under `docs/v5/`.

Use this file when you need to know which docs are current, which ones are historical, and where the active contract and runtime surfaces actually live.

For the current public-release gate and validation commands, read `RELEASE_READINESS.md`.

## What Is Current

### Kernel

The live kernel is V5 and lives in `src/`.

Current contract inventory and test counts are maintained in:

1. `CONTRACTS.md` — contract inventory
2. `TESTING.md` / `VERIFICATION_MAP.md` — test counts and coverage
3. `CLAUDE.md` — the discipline + pointers that index the above

Do not reason from V3 contract names unless you are explicitly working in `archive-v3/` or reading historical verification material.

### Runtime

The runtime is the canonical center of gravity for this repo.

When reading the runtime docs, treat the concrete organizational unit as the
transaction-scoped institution: each process assembles a temporary institution
of directly bonded contributors and dissolves at settlement.

### Scaling And Cairo

Before reasoning about scaling, StarkNet, or Cairo execution, read
`SCALING_STRATEGY.md`.

The proof-based kernel scaling track (SP1/Rust) is the active scaling
architecture. It is implemented and tested:

- Rust kernel (`prover/lib/`): full protocol surface in Rust, unit-tested
- SP1 guest program (`prover/program/`): ~1.0M cycle execution verified (k256 precompile patched); real Core proof generated and verified locally
- On-chain verifier (`src/FigaroBatchVerifier.sol`): Foundry-tested
- Devnet batch sequencer (`prover/sequencer/`): Rust crate, tested (test counts in `TESTING.md`)

Read `SCALING_STRATEGY.md` §"Batch Sequencer Architecture" for the sequencer architecture.

If the task involves rewriting or deleting the old Cairo branch, also read
`CAIRO_REWRITE_PREREQUISITES.md`.

The current `cairo/` implementation and its companion docs describe a pre-V5
protocol shape and should be treated as exploratory or historical for protocol
structure until V5 parity is re-established.

Start with these docs, in this order:

1. `VISION.md`
2. `THEORY.md`
3. `OPEN_WORLD.md` (the open-world paradigm + runtime composition
   model + semantic-derivation layer)
4. `PUBLIC_GRAPH_MODEL.md`
5. `SCALING_STRATEGY.md`
6. `VERIFICATION_MAP.md`

### Frontend

The frontend is the shared runtime and builder surface.

Implementation-facing docs:

1. `frontend/README.md`
2. `frontend/ASSEMBLY_AUTHORING.md`
3. `frontend/SKINNING_HOOKS.md`
4. `frontend/FIGARO_EATS.md`

### Reference Assemblies

The reference assemblies are `direct-sale` (1-node consume-onsite),
`local-commerce` (2-node merchant + seller-assigned courier),
`local-commerce-buyer-assigned` (buyer chooses the courier),
`local-commerce-dutch` (Dutch-auction courier edge),
`local-commerce-offset` (emissions-aware variant with GHG disclosure +
proximity-policy clauses), and `local-commerce-pickup` (1-node pickup
with handoff certification — buyer + merchant both attest
`figaro-proximity-proof-v1` at the handoff edge).

Assembly authoring and parsing live in `frontend/lib/designer/`; published
assemblies are anchored on-chain via `src/AssemblyRegistry.sol` with their
manifests pinned off-chain. The slug → human-label table is
`frontend/lib/shared/assemblyLabels.ts`.

## What Is Historical

Historical material is preserved, but it should not drive present-tense reasoning.

### Archived folders

1. `docs/archive/` — historical plans, older design notes, archived runtime/frontend theory, and prior verification material
2. `archive-v3/` — archived V3 contracts, tests, and tooling
3. `archive-v4/` — pre-promotion V4 development snapshot; the live V5 code is in `src/`

### Root-level archive notes

Some root filenames remain as short redirect or archive notes so old references do not silently break.

If a root-level file clearly says it is archived or historical, do not treat it as live doctrine.

## Known Conceptual Boundaries

1. `PUBLIC_GRAPH_MODEL.md` is the protocol-level graph model.
2. `OPEN_WORLD.md` carries the open-world paradigm (§1), the extension
   model (§2), the bounded-mutation runtime composition model (§3), and
   the semantic-derivation layer (§4).
3. `CLAUSES.md` carries the clause validation architecture and the
   anchoring doctrine (payload vs anchor, the decision rule).

If two docs appear to overlap, prefer the one above that matches the layer you are reasoning about.

## GHG Note

The current live GHG-style disclosure surface is clause-typed attestation through `AttestationCoordinator` plus `ClauseRegistry`.

Some older GHG docs still preserve richer product vocabulary such as boundaries, requirements, and submissions. Treat those as conceptual workflow language, not as the current contract inventory.

## Practical Rule

When in doubt:

1. trust `CLAUDE.md` (and the `docs/v5/` files it indexes) for current
   code inventory, framing, and vocabulary
2. trust this file and `README.md` in `docs/v5/` for doc selection
3. prior versions of any contract live in git history — `git log --all`
   and `git show <commit>:<path>` reach the V3/V4 era when needed
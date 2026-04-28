# Current State

Status: canonical orientation note for the repository as of 2026-04-10.

The active V5 documentation set now lives under `docs/v5/`.

Use this file when you need to know which docs are current, which ones are historical, and where the active contract and runtime surfaces actually live.

For the current public-release gate and validation commands, read `RELEASE_READINESS.md`.

## What Is Current

### Kernel

The live kernel is V5 and lives in `src/`.

Current contract inventory and test counts are maintained in:

1. `CLAUDE.md`
2. `.github/copilot-instructions.md`
3. `README.md`

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

- Rust kernel (`prover/lib/`): 30 tests
- SP1 guest program (`prover/program/`): 19.8M cycle execution verified
- On-chain verifier (`src/FigaroBatchVerifier.sol`): 22 Foundry tests
- Devnet batch sequencer (`prover/sequencer/`): 22 tests

Read `SCALING_STRATEGY.md` §"Batch Sequencer Architecture" for the sequencer architecture.

If the task involves rewriting or deleting the old Cairo branch, also read
`CAIRO_REWRITE_PREREQUISITES.md`.

The current `cairo/` implementation and its companion docs describe a pre-V5
protocol shape and should be treated as exploratory or historical for protocol
structure until V5 parity is re-established.

Start with these docs, in this order:

1. `VISION.md`
2. `THEORY.md`
3. `RUNTIME_THESIS.md`
4. `FRONTEND_RUNTIME_MODEL.md`
5. `FRONTEND_RUNTIME_PLAN.md`
6. `PUBLIC_GRAPH_MODEL.md`
7. `SEMANTIC_MODEL_LAYER.md`
8. `SCALING_STRATEGY.md`
9. `VERIFICATION_MAP.md`

### Frontend

The frontend is the shared runtime and builder surface.

Implementation-facing docs:

1. `frontend/README.md`
2. `frontend/ASSEMBLY_AUTHORING.md`
3. `frontend/SKINNING_HOOKS.md`
4. `frontend/FIGARO_EATS.md`

### Reference Assemblies

The live reference assembly registry contains five assemblies:

1. eats
2. procurement
3. disclosure-review
4. equipment-rental
5. freelance

The source of truth is `frontend/lib/shared/institutionAssembly.ts`.

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
2. `SEMANTIC_MODEL_LAYER.md` is the runtime/frontend derivation model.
3. `FRONTEND_RUNTIME_MODEL.md` is the current bounded-mutation frontend model.
4. `PROTOCOL_EXTENSION_DOCTRINE.md` is the current extension doctrine.

If two docs appear to overlap, prefer the one above that matches the layer you are reasoning about.

## GHG Note

The current live GHG-style disclosure surface is schema-typed attestation through `AttestationCoordinator` plus `SchemaRegistry`.

Some older GHG docs still preserve richer product vocabulary such as boundaries, requirements, and submissions. Treat those as conceptual workflow language, not as the current contract inventory.

## Practical Rule

When in doubt:

1. trust `CLAUDE.md` (and `.github/copilot-instructions.md` for the
   Copilot-specific subset) for current code inventory, framing, and
   vocabulary
2. trust this file and `README.md` in `docs/v5/` for doc selection
3. prior versions of any contract live in git history — `git log --all`
   and `git show <commit>:<path>` reach the V3/V4 era when needed
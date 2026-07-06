# Figaro agent integration examples

Worked walkthroughs of how the contributor agents (`figaro-clause-author`, `figaro-kernel-reviewer`, `figaro-clause-lockstep`, plus the `factotum` participation reference) compose to build and operate a real assembly.

These are **doc-only**. Every prompt here is runnable verbatim against the current agent set; every factotum config snippet is plug-and-play. Nothing is implemented in code — the assemblies themselves haven't been built. The point is to surface what the agents *would do*, where the human-with-canvas takes over, and what tooling gaps the next round of agent work should close.

## Scenarios

### `tradelens-replacement/`

A multi-party container shipping assembly: shipper → forwarder → ocean carrier → port-of-loading → port-of-discharge → customs broker → consignee. Replaces the IBM/Maersk TradeLens platform that shut down in 2023. The structural fix isn't the clauses (most exist); it's that the assembly is ownerless and permissionless.

### `spirit-air-replacement/`

A passenger-airline assembly with the airline as seller-of-record buying from gate-ops, fuel, crew, catering, and maintenance as sub-sellers. Cascading delays repriced as a weakest-link bonded coordination problem (asymmetric bonding scales to N parties — each seller bonds against cumulative upstream value — per Paper A).

Each scenario has four files:

| File | What it covers |
|---|---|
| `README.md` | Scenario, what the existing thing got wrong, the Figaro structural fix |
| `clauses.md` | Which clauses exist; which to author; verbatim prompts for `figaro-clause-author` |
| `assembly.md` | DAG sketch, per-edge mechanism, per-node clauses, **the gap** |
| `roles.md` | `factotum` policy snippet per role |

## The gap both scenarios surface

Both walkthroughs hit the same structural limitation: **there is no `figaro-assembly-author` subagent**. The clause-author writes clauses; the kernel-reviewer reviews kernel diffs; the clause-lockstep verifier checks multi-surface consistency; the factotum executes role-bound actions on chain. None of them produces the assembly DAG itself.

For now, the assembly DAG is human work — drawn on the designer canvas at `/builders/designer/new`, producing a `DesignDraft` (DAG + per-edge mechanism + per-node clauses, persisted in `localStorage` per `project_designer_persistence.md`). These walkthroughs document where that boundary sits.

A future `figaro-assembly-author` agent would output `DesignDraft` JSON directly with the same security-first posture as the clause-author. Treat the `assembly.md` files in this directory as the spec for that future agent.

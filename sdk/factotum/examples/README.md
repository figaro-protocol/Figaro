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
| `assembly.md` | DAG sketch, per-edge mechanism, per-node clauses, authoring note |
| `roles.md` | `factotum` policy snippet per role |

## Authoring the assembly DAG

Composing the assembly DAG is the designer's act. Two ways to produce it: draw it on the designer canvas at `/builders/designer/new` (producing a `DesignDraft` — DAG + per-edge mechanism + per-node clauses, persisted in `localStorage` per `project_designer_persistence.md`), or have the **`figaro-assembly-author`** subagent scaffold the `DesignDraft` JSON directly, with the same security-first posture as the clause-author. The `assembly.md` files in this directory are its reference targets — the worked compositions it aims at and is checked against.

**Robustness caveat:** `figaro-assembly-author` is newer and less battle-tested than the clause-author, kernel-reviewer, and clause-lockstep verifier. Treat its output as a draft to review — against these `assembly.md` files and the validator / lockstep checks — not a finished artifact.

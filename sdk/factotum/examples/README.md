# Figaro agent integration examples

Worked walkthroughs of how the public **ecosystem** agents (`figaro-assembly-author` + `figaro-clause-author`, in `sdk/ecosystem-agents/`) and the `factotum` participation reference compose to let a **user** build and operate a real assembly — the user's own contribution, registered on the permissionless registries under their wallet, never in this repo.

These are **doc-only**. Every factotum config snippet is plug-and-play. Nothing is implemented in code — the assemblies themselves haven't been built. The point is to surface what the agents *would do* and where the user-with-canvas takes over.

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

Composing the assembly DAG is the designer's act. Two ways to produce it: draw it on the designer canvas at `/builders/designer/new` (producing a `DesignDraft` — DAG + per-edge mechanism + per-node clauses, persisted in `localStorage` per `project_designer_persistence.md`), or have the **`figaro-assembly-author`** ecosystem agent (`sdk/ecosystem-agents/`) scaffold the `DesignDraft` and register it under the user's wallet. The `assembly.md` files in this directory are its reference targets — the worked compositions it aims at and is checked against.

**Robustness caveat:** `figaro-assembly-author` is newer and less battle-tested than the participant tooling. Treat its output as a draft to review against these `assembly.md` files, not a finished artifact.

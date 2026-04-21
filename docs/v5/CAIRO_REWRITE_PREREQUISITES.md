# Cairo Rewrite Prerequisites

Status: canonical prerequisite note for any future Cairo rewrite of the live V5 kernel.

This document exists to stop the repo from drifting back into pre-V5 Cairo assumptions.

## Current Classification

The current `cairo/` tree is historical from the perspective of the live protocol shape.

It should be treated as a pre-V5 branch built around a divergent lifecycle:

1. `first_order`
2. `sub_order`
3. `accept_offer`
4. `cancel_offer`
5. fee-bearing settlement logic

That is not the live kernel. The live kernel is the V5 Solidity surface in `src/`.

## Rewrite Rule

Do not continue the old Cairo implementation forward as if it were already the scaled version of the live protocol.

The next Cairo phase must be a V5 rewrite or a salvage effort that is strict enough to amount to a rewrite in protocol terms.

## Frozen Source Of Truth

The only source of truth for the Cairo rewrite is the live V5 kernel and its verified behavior:

1. unified dual-signed `commit`
2. buyer-only `resolveProcess`
3. buyer bond = 2 × payment
4. seller bond = 2 × cumulative value
5. monotonic cumulative value per process
6. one currency per process
7. atomic process resolution
8. direct settlement transfer semantics
9. no protocol fee
10. no timeout path
11. no cancel path
12. no admin escape hatch

If the Cairo design changes any of those, it is not a scaling implementation of V5.

## Chain-Agnostic Parity Checklist

Before any new Cairo code is treated as viable, parity must be checked against the V5 Solidity kernel on these dimensions:

1. commitment hashing semantics
2. signature verification semantics
3. process ID derivation
4. cumulative-value updates across root and sub-orders
5. duplicate-commit rejection
6. buyer-only resolution
7. resolution payout math
8. process-active-count accounting
9. event semantics required for off-chain state reconstruction
10. rejection of unsupported token behaviors or equivalent explicit constraints
11. no additional governance, recovery, or discretionary exits

## Equivalence-Test Plan Requirement

Do not begin implementation-first Cairo work without an equivalence-test plan.

That plan must specify:

1. which Solidity tests define the intended behavior
2. which invariants are ported directly as parity checks
3. which Cairo-specific execution differences are allowed and which are not
4. how event outputs will be compared for SDK/frontend reconstruction needs
5. how the no-fee, no-cancel, no-escape-hatch posture is enforced in tests

## Porting Rule

Port test intent from the live Solidity suite. Do not port the old Cairo lifecycle forward.

The intended flow is:

1. identify the authoritative V5 Solidity tests and invariants
2. restate them as chain-agnostic behavior
3. implement Cairo code to satisfy that behavior
4. prove parity before describing the branch as scaling-ready

## Preservation Rule

Before deleting or aggressively pruning the old `cairo/` branch, decide explicitly what is worth preserving:

1. general StarkNet tooling or setup notes
2. reusable test harness patterns
3. documentation that is still useful as historical archaeology

Everything else should be assumed disposable if it encodes the wrong kernel shape.

## Sequencing

Use this order:

1. finish V5 hardening on the live EVM stack
2. keep the current Cairo branch classified as historical
3. freeze the V5 kernel invariants as the rewrite spec
4. write the equivalence-test plan
5. decide rewrite versus salvage
6. only then begin new Cairo implementation work
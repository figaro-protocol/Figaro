<!-- Keep this short. Explain the rationale and what you tested. -->

## What this changes

<!-- One or two sentences. -->

## Why

<!-- The rationale. Link an issue if there is one. -->

## Checklist

- [ ] Tests for the modified area pass — `forge test --via-ir`, `vitest`, `cargo test`, or Playwright, whichever applies (see `CONTRIBUTING.md`).
- [ ] Added or updated tests for any changed behavior.
- [ ] Docs updated in the same PR if public behavior, an API, or a `docs/v5/` statement changed.
- [ ] No change to the frozen kernel (`src/FigaroCore.sol`, `src/CommitmentTypes.sol`). If a kernel change is genuinely proposed, it is called out explicitly below and reviewed against the six protocol invariants.
- [ ] Commits are focused and atomic.

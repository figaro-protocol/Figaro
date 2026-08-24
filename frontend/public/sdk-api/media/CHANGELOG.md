# Changelog

All notable changes to Figaro are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/); versioning intent is
described in `sdk/README.md` § "Versioning & stability" (the SDK is pre-1.0 —
minor bumps may break).

The repository carries two tags: `v0.1.0` (the repository release) and
`sdk-v0.1.0` (the commit `@figaro-protocol/sdk@0.1.0` was built and published
to npm from). Everything since lives under **Unreleased**.

## [Unreleased]

Summary of the current state of the protocol and its verification surface:

### Protocol

- The Solidity kernel (`src/kernel/FigaroCore.sol`, `src/kernel/CommitmentTypes.sol`)
  is frozen for external audit, alongside the full protocol/registry/coordinator/
  RPGF/florin surface — see `docs/RELEASE_READINESS.md` § "Freeze Notice —
  Solidity Surface Frozen for External Audit" for the exact frozen scope.
- The batch settlement path (`FigaroBatchVerifier` + the Rust `prover/` SP1
  witness prover/sequencer) is live and included in the frozen scope.
- The 600M RPGF distribution (`UsageCounter` + `RpgfMinter`) pays every clause
  and assembly uniformly, pro rata on real usage, gated by a two-sided live ETH
  stake — no per-clause weight, no per-wallet cap, no quadratic funding.

### Verification

- **Foundry**: full contract test suite across the kernel, registries,
  coordinators, usage/RPGF, florin, and mocks (see `docs/TESTING.md` for the
  file-by-file inventory).
- **Halmos**: 32 symbolic properties across 4 harness files (7 FigaroCore + 7
  MembersRegistry + 6 UsageCounter + 12 ClauseRegistry/AssemblyRegistry).
- **Certora**: 6 specs / 37 rules (FigaroCore, AttestationCoordinator,
  TokenOpsVerification, FlorinToken, BatchVerifierTokenOps, RpgfMinter).
- **Echidna**: 2 harnesses / 15 properties (kernel + FlorinToken).
- **TLA+**: 4 models / 48 invariants (FigaroCore 9, FlorinToken 8,
  WitnessSwapAndCommitCoordinator 10, SettlementUniverses 21).
- **SDK (Vitest)** and **Frontend (Vitest + Playwright)**: component, unit,
  and end-to-end coverage — see `docs/TESTING.md` for the full harness
  inventory.

### SDK

- `@figaro-protocol/sdk` at `0.1.0`, pre-1.0: six subpath exports — root (protocol
  primitives + the RPGF distribution mirror), `/agent` (agent coordination),
  `/derive` (event derivation), `/clauses` (the Layer-A clause spec
  source-of-truth), `/handoff` (the runtime handoff wire protocol), and
  `/signer` (the policy signer daemon + socket-backed account).

### Infrastructure

- Eight GitHub Actions workflows: `foundry-ci`, `sdk-ci`, `frontend-ci`,
  `devnet-e2e-ci`, `prover-ci`, `guards-ci` (the whole-tree guard battery),
  `sdk-release`, and `sequencer-release` (publishes the prebuilt
  `figaro-sequencer` relay binary on tag push).

[Unreleased]: https://github.com/figaro-protocol/Figaro

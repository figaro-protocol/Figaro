# Changelog

All notable changes to Figaro are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/); versioning intent is
described in `sdk/README.md` § "Versioning & stability" (the SDK is pre-1.0 —
minor bumps may break).

The repository carries a `v0.1.0` tag (the repository release) and one
`sdk-v<version>` tag per npm publish of `@figaro-protocol/sdk` (the commit
that version was built and published from). Everything since the latest
release lives under **Unreleased**.

## [Unreleased]

### Changed

- **SDK 0.2.0 (breaking): the `Settlement*` export family is renamed to
  `Resolution*`** — `ResolutionGraph`, `ResolutionChain`, `ResolutionEntry`,
  `ResolutionBreakdown`, `ResolutionUniverse`, `calculateResolution`,
  `projectResolutionGraph` — finishing the settlement→resolution rename across
  every non-contract identifier. The deployed contracts' own names
  (`settleBatch`, `BatchSettled`, `settlements`) are unchanged. The formal
  model is now `formal/ResolutionUniverses.tla`; the analyst's route is
  `/queries/trade-story`; the paper moved to `/papers/verified-resolution-kernel`
  with a redirect stub at the old address.
- **SDK 0.2.0 (breaking): the policy signer counts a transaction's gas, reads
  every field, and keeps its files in one directory of its own.** Native risk
  is the `value` plus the most gas the transaction can cost (`gas ×` the
  highest price per gas it allows), so a policy with no `perActionNative` /
  `perPeriodNative` refuses every transaction that costs gas, and a granted
  ceiling must cover gas. A transaction must name the policy's `chainId` and
  carry a gas limit and a price per gas; a field the gate does not evaluate
  (a blob gas price, an authorization list) is refused. A Commitment where
  the wallet is buyer and seller counts both bonds. The socket, the audit log
  and the spend journal sit in one directory — `~/.figaro-signer/` unless
  `--dir` or a `--socket` path names another — as `signer.sock`,
  `audit.jsonl` and `window.jsonl`; `--audit` and `--journal` are gone. The
  daemon refuses a directory that group or others can write, and a journal
  entry that is not a time and two non-negative amounts refuses the start.
  A quantity the gate cannot read, a `null` field and a non-string `type`
  are refused. `socketSignerAccount` sends the transaction's own fields
  only. On macOS the sandbox launcher (`ecosystem-agents/runtime`) denies
  the agent every write in the signer's directory and every signal to an
  outside process, and refuses a signer directory that does not exist or
  sits inside, or contains, the workspace or a temp directory.
- **SDK 0.2.0: `fetchLogsChunked` refuses another contract's log.** Every
  SDK read of contract logs goes through it, and it asks the node for one
  address; a node that answers with a log from any other now throws, rather
  than handing the parsers an event they would decode by topic as this
  contract's.
- **SDK 0.2.0: the buyer's offer loops commit only the offer they sent.**
  `originateProcess` and `originateChain` committed whatever counter-signed
  commitment a seller's reply carried, so a seller could return an earlier
  commitment the buyer had signed and have the buyer bond its terms. Each
  reply is now checked with `verifyRaceReply` — the struct sent, counter-signed
  by the seller it went to — before any chain call, and a reply that fails
  throws. `verifyRaceReply` is exported from `/agent` as before.
- **SDK 0.2.0 (breaking): `SyncResult.newSellers` is renamed to `newMembers`.**
  The field counts member registrations and profile updates; a member may
  buy, sell, or both.
- **SDK 0.2.0: `recordProcessUsage` plans its legs before it sends any.** It
  reads the counter's excluded set off the deployment and never sends a record
  the counter is certain to refuse; a key two orders carry is sent once.
  `UsageRecordingReport` gains `excluded`, the keys left out, and `attempted`
  counts the clause legs actually sent.
- The analyst agent's tool `deal_story` is `trade_story`, matching its route
  `/queries/trade-story`.

### Added

- `/data/explore` — the graph-query surface over the public record: market shape
  per assembly, one attestation overlay per attestable clause family in use,
  value flow per denomination, and any wallet's public trading record; each
  layer prints its own truth boundary (`protocol-enforced` /
  `institution-declared` / `protocol-derived` / `composition-derived`).
- `figaro-analyst` — the fourth public ecosystem agent (operate, author,
  design, and now analyze): reads the public graphs through the SDK's
  `/derive` projections.
- `docs/AUDITOR_HANDOVER.md` — the external-audit handover in one place: the
  frozen-scope declaration and stamp, the freeze-verification commands, the
  post-stamp records, the Post-Audit Policy, accepted risks, and the
  validation-command gate.

### Changed

- `docs/RELEASE_READINESS.md` now carries the open release tasks only; the
  freeze/audit apparatus moved to `docs/AUDITOR_HANDOVER.md`, and closed work
  is deleted rather than recorded in place — git history is the record.
- A full documentation-drift audit (2026-08-27, fourteen read-only auditors)
  verified every documented surface against the tree; the ~60 verified
  findings were fixed, so the inventories, theory docs, READMEs, and site copy
  state current repo reality. Data fields no surface renders were deleted
  rather than documented.

### Verification

- The full formal suite re-ran 2026-08-27 covering the post-freeze amendments
  (the `registeredBy` rename and the swap coordinator's scope entry): Foundry
  299 passed / 0 failed, Halmos 32/32 proved, Certora 6/6 specs verified with
  `--wait_for_results all` — recorded as post-stamp record #3 in
  `docs/AUDITOR_HANDOVER.md`, with the run URLs recorded there too.

Summary of the current state of the protocol and its verification surface:

### Protocol

- `src/core/kernel/FigaroCore.sol` and `src/core/kernel/CommitmentTypes.sol`
  are frozen for external audit, alongside the full protocol/registry/coordinator/
  RPGF/florin surface — see `docs/AUDITOR_HANDOVER.md` § "Scope" for the exact frozen scope.
- The batch settlement path (`FigaroBatchVerifier` + the Rust `prover/` SP1
  witness prover/sequencer) is live and included in the frozen scope.
- The 600M RPGF distribution (`UsageCounter` + `RpgfMinter`) pays every clause
  and assembly uniformly, pro rata on real usage, gated by a two-sided live ETH
  stake — no per-clause weight, no per-wallet cap, no quadratic funding.

### Verification

- **Foundry**: full contract test suite across the Core, registries,
  coordinators, usage/RPGF, florin, and mocks (see `docs/TESTING.md` for the
  file-by-file inventory).
- **Halmos**: 32 symbolic properties across 4 harness files (7 FigaroCore + 7
  MembersRegistry + 6 UsageCounter + 12 ClauseRegistry/AssemblyRegistry).
- **Certora**: 6 specs / 37 rules (FigaroCore, AttestationCoordinator,
  TokenOpsVerification, FlorinToken, BatchVerifierTokenOps, RpgfMinter).
- **Echidna**: 2 harnesses / 15 properties (FigaroCore + FlorinToken).
- **TLA+**: 4 models / 48 invariants (FigaroCore 9, FlorinToken 8,
  WitnessSwapAndCommitCoordinator 10, ResolutionUniverses 21).
- **SDK (Vitest)** and **Frontend (Vitest + Playwright)**: component, unit,
  and end-to-end coverage — see `docs/TESTING.md` for the full harness
  inventory.

### SDK

- `@figaro-protocol/sdk` at `0.1.2`, pre-1.0: six subpath exports — root (protocol
  primitives + the RPGF distribution mirror), `/agent` (agent coordination),
  `/derive` (event derivation), `/clauses` (the clause spec
  source-of-truth), `/handoff` (the runtime handoff wire protocol), and
  `/signer` (the policy signer daemon + socket-backed account).

### Infrastructure

- Ten GitHub Actions workflows: `foundry-ci`, `sdk-ci`, `frontend-ci`,
  `devnet-e2e-ci`, `prover-ci`, `guards-ci` (the whole-tree guard battery),
  `estate-snapshot` (weekly perishable-observability capture),
  `on-demand-docker` (dispatch-only container proofs),
  `sdk-release`, and `sequencer-release` (publishes the prebuilt
  `figaro-sequencer` relay binary on tag push).

## [sdk-0.1.2] - 2026-09-08

`@figaro-protocol/sdk@0.1.2` — the tree as it stands at this tag.

### Added

- `equilibrium` — the one module holding the asymmetric-bonding figures the
  paper states and the theory doc binds to the Core's transfers; listed in the README's
  export table.
- `/signer`: a local-run signer policy derived from that run's deployment
  record, with its ceilings read from the environment.

### Changed

- The Core's act is resolution: the prose, comments, and error text say
  resolution where they said settlement; identifiers and cited systems' words
  are unchanged.
- Bond and stake mean what the lexicon says (a bond is locked at commit; a stake
  is a registry deposit); the Layer-A name is retired — the clause validator
  is the `/clauses` export's own.
- The catalogue folds only its declared fields, and the explorer's projections
  see withdrawn assemblies.

## [sdk-0.1.1] - 2026-08-25

`@figaro-protocol/sdk@0.1.1` — supersedes the stale `0.1.0` tarball, whose ABI
surface had drifted behind the repository.

### Fixed

- `CLAUSE_REGISTRY_ABI` now includes `contentHashOf(bytes32) view returns (bytes32)` —
  the function the README's own anchoring recipe calls; absent from the `0.1.0` ABI.
- The AttestationCoordinator ABI names the four remaining reachable reverts
  (`NotAuthorized`, `ProcessMismatch`, `UnknownOrder`, `OrderResolved`), so every
  coordinator revert decodes.
- `/agent`'s autonomous gateway checks each transaction receipt's `status`: a leg
  that reverts on-chain after gas estimation now throws instead of counting as
  recorded.

### Changed

- **Breaking:** `UNIVERSAL_ROUTER_ABI` is deleted — it described a contract the
  protocol never composes. Encode swap legs against the new `SWAP_ROUTER_02_ABI`
  (+ `QUOTER_V2_ABI` for read-side quoting), the venue
  `WitnessSwapAndCommitCoordinator` actually routes through; a golden-vector test
  pins the encodings.
- README: worked `exactOutputSingle` calldata in the swap recipe, expanded
  integration walkthrough and recipes.

[Unreleased]: https://github.com/figaro-protocol/Figaro
[sdk-0.1.1]: https://github.com/figaro-protocol/Figaro/releases/tag/sdk-v0.1.1

# V5 Release Readiness

Status: canonical release gate note for the live V5 kernel, protocol, and runtime.

Last updated: 2026-04-20 (AI audit pass — Claude Sonnet 4.6).

This note is the current answer to a simple question: what is ready now, what is still open, and what must happen before a public release is treated as complete.

## Current Verdict

The live V5 Solidity surface is internally consistent and the runtime hardening pass has closed the highest-value browser, build, and event-reconstruction risks.

Public release should still be treated as blocked on one explicit governance-free process decision:

1. freeze the Solidity surface
2. run a final external audit pass against that frozen surface

This is not because the current pass surfaced a new contract defect. It is because the kernel is the irreducible payoff matrix, so the prudent pre-release move is independent review after churn stops, not more architectural motion during the audit window.

## What Is Ready

- the live kernel and mechanism module inventory is stable enough to validate as one V5 surface
- the full Foundry suite passes on the active contracts
- the frontend type-check and production build have been brought green in this hardening pass
- focused Vitest and Playwright coverage has been used to validate the live runtime flows that matter most for release posture
- event-sourced state reconstruction assumptions used by the SDK and frontend were rechecked against the live kernel events
- fee-on-transfer rejection remains explicit in both the kernel and the active test suite

## Release Blockers

These are the remaining blockers for calling the live V5 system publicly release-ready:

1. external audit decision and scheduling
2. Solidity surface freeze before that audit

## Remaining Tasks

Two concrete tasks remain before the public-release gate is closed:

### Task 1: Freeze The Audited Solidity Surface

Scope to freeze:

1. `src/`
2. `src/fig/`
3. deploy and setup scripts that define the live Solidity surface

Required output:

1. a declared freeze point for the contracts and deployment path
2. no feature churn in the audited Solidity surface after that point
3. any later Solidity edit treated as a new review event, not as an invisible follow-up

### Task 2: Run The Final External Audit Pass

Required output:

1. choose the auditor or audit process
2. hand over the frozen Solidity surface and active docs
3. resolve findings or explicitly accept non-critical findings in writing
4. record the final audit outcome in the release docs

## Validation Commands

Use these commands as the release gate. Expected output means successful completion with exit code `0` and the stated pass criteria.

Observed results (re-run 2026-04-21 after the FIG allocation restructure + figToken removal):

- `forge test --via-ir`: 14 suites, 225 tests, 0 failed, 0 skipped
- `./test-halmos.sh`: 7/7 symbolic proofs passed (wrapper checks prerequisites and splits `check_resolutionPayouts` into its own invocation — raw 5-minute ceiling is unreliable)
- `./test-certora.sh`: **23/23 sub-rules verified across 3 specs** (FigaroCore 9, AttestationCoordinator 7, FigToken 7). Last full run 2026-04-21 against the then-frozen Solidity surface. The StagedMerkleAirdrop spec (4 rules) was retired 2026-05 alongside the contract; the replacement `RpgfMinter` does not yet carry a Certora spec.
- `cd frontend && npm run type-check`: passed
- `cd frontend && npm run build`: passed
- `cd frontend && npx vitest run`: 84 files, 560+ tests passed
- `cd frontend && npm run test:e2e:devnet`: 40 passed

### Contracts

```bash
forge test --via-ir
```

Expected output:

- 14 suites passed
- 225 tests passed
- 0 failed
- 0 skipped

### Halmos Symbolic Proofs

```bash
./test-halmos.sh
```

Prereqs (one-time): `brew install z3 && pipx install halmos`.

Expected output: `✅ All 7 Halmos properties proved.` (exit code 0)

### Frontend Type Check

```bash
cd frontend && npm run type-check
```

Expected output:

- TypeScript completes with no errors

### Frontend Production Build

```bash
cd frontend && npm run build
```

Expected output:

- Next.js production build completes successfully
- no hard build failures

### Frontend Unit And Integration Tests

```bash
cd frontend && npx vitest run
```

Expected output:

- Vitest exits cleanly with no failing suites
- observed pass: 84 files, 560+ tests passed

### Frontend Browser Validation

Devnet posture:

```bash
cd frontend && npm run test:e2e:devnet
```

Expected output:

- Anvil deployment verification passes first
- Playwright devnet project exits cleanly with no failing specs
- observed pass: 40 passed

High-value browser checks that must remain covered:

1. `/evidence-display` works under iframe-style embedding rules
2. handoff geolocation works under production-style headers
3. delivery-attestation geolocation works under production-style headers

## Accepted Risks

These are current design realities that are accepted by the protocol surface, not accidental defects introduced by this hardening pass:

1. buyer key loss is terminal for an active process because the kernel has no timeout or admin recovery path
2. very large processs are gas-bounded, so institution design should compose across processes instead of pushing single-process fanout toward the ceiling
3. fee-on-transfer tokens are unsupported by design and are rejected explicitly by the kernel

## Accepted Runtime Posture

These are current runtime posture decisions, not release blockers:

1. `/builders/prototype` remains an explicitly builder-scoped tooling surface rather than a consumer-facing institution route
2. `/builders/templates` is a routing surface into assembly-based template discovery, not a legacy on-chain registry UI
3. geolocation remains allowed for same-origin runtime surfaces instead of being narrowed to a brittle route allowlist, because handoff and delivery-attestation modules are runtime-composable across multiple live pages

## External Audit Decision

Decision: yes, a final external audit pass is required before public release.

Required posture for that audit:

1. freeze `src/`, `src/fig/`, and the deployment scripts that define the audited Solidity surface
2. avoid feature churn during the audit window
3. treat any post-audit Solidity edits as requiring either a narrow follow-up review or a repeat audit decision

## Pre-Release Hardening Pass — Completed 2026-04-26

A six-section hardening checklist was worked through to completion before
this readiness assessment was finalized. All items checked off; the full
checklist was archived after the work landed. Summary of what the pass
covered:

1. **Versioning cleanup** — drop residual V4-as-live language across
   docs and code, leaving V3/V4 references only in archive directories
   and external API names that genuinely use that literal (`_hashTypedDataV4`).
2. **Solidity hardening** — re-run Foundry, refresh NatSpec + audit
   docs, reconfirm fee-on-transfer rejection and event semantics, decide
   on the external-audit gate.
3. **React runtime hardening** — production-header policy verification,
   missing-hook-dependency cleanup in stateful flows, `any`-usage
   reduction in event/indexing/console plumbing, removal of disabled
   account-abstraction code.
4. **Documentation and release posture** — refresh AUDIT_REPORT to live
   contract names + test counts, record exact validation commands,
   document accepted risks explicitly.
5. **Cairo rewrite prerequisites** — freeze the V5 kernel invariants as
   the only source of truth for any future Cairo port, archive the old
   pre-V5 Cairo lifecycle.
6. **Exit criteria** — green Foundry + frontend type-check + frontend
   build + warning-debt resolution + verified header policy.

Earlier (V3-era) gas-consumption empirical numbers have been
superseded by the gas-ceiling figures recorded in the "Verification
Coverage" section of `AUDIT_REPORT.md` (≈2,145 orders within the 30M
Ethereum gas limit).

## Freeze Notice — Solidity Surface Frozen for External Audit

**Date**: 2026-04-20 (initial freeze declaration), amended 2026-04-21
to land a pre-audit batch of findings (FIG allocation restructured to
genesis-mint + staged airdrop contract, `MerkleAirdrop`/`TrancheVesting`
deleted, `figToken` dead-code field removed from `FigaroBatchVerifier`,
`DOMAIN_SEPARATOR()` getter added, `totalRegisteredCap` sum-enforcement
added to `FigToken`); amended 2026-05-06 to revise the
`OperatorRegistry` surface — the `role` parameter was dropped from
`register` and from the `OperatorRegistered` event; `updateProfile`
was added (caller-only metadata replacement, no deposit movement, emits
`OperatorProfileUpdated`); the `OperatorRole` enum and `InvalidRole`
error were removed. `FigaroBatchVerifier` was updated in lockstep:
`OperatorEventInput` drops the `role` field; the tagged-union encoding
shrinks to {1=Registered, 2=ProfileUpdated} with a 53-byte record;
the dead `OperatorUpdated` / `OperatorDeactivated` / `OperatorReactivated`
events were deleted.

The following Solidity surface is declared frozen for external audit.
No feature changes, refactors, or dependency upgrades will be made to
these directories during the audit window. Any edit requires either a
narrow follow-up review or a repeat audit decision.

### Frozen scope

| Directory / file | Contents |
|---|---|
| `src/` | `FigaroCore.sol`, `AttestationCoordinator.sol`, `CommitmentTypes.sol`, `IRoleResolver.sol`, `SchemaRegistry.sol`, `SchemaRegistrationHelper.sol`, `DutchAuction.sol`, `OperatorRegistry.sol`, `FigaroBatchVerifier.sol` |
| `src/fig/` | `FigToken.sol`, `RpgfMinter.sol`, `IFigMinter.sol` |
| `script/Deploy.s.sol` | Devnet deploy (defines the devnet surface) |
| `script/DeployMainnet.s.sol` | Mainnet deploy (defines the audited mainnet surface) |

### Explicitly out of scope (not frozen)

- `src/mocks/` — test helpers, never deployed to mainnet
- `src/echidna/` — fuzzing harnesses, never deployed to mainnet
- `test/`, `frontend/`, `sdk/`, `prover/` — non-Solidity surfaces

### Verifying a freeze

To verify a file is unchanged from the freeze commit:

```bash
git diff <FREEZE_COMMIT> -- src/ src/fig/ script/Deploy.s.sol script/DeployMainnet.s.sol
```

Expected output: empty.

### Handover Checklist for the Auditor

| Document | Purpose |
|---|---|
| `docs/v5/DESIGN_DECISIONS.md` | 14 intentional patterns that look like vulnerabilities (read first) |
| `docs/v5/AUDIT_REPORT.md` | Prior AI-audit history (4 passes), web2 + adversarial subsidiary audits, accepted risks |
| `docs/v5/VERIFICATION_MAP.md` | Every invariant → code → test → formal layer |
| `docs/v5/RELEASE_READINESS.md` (this file) | Gate criteria, frozen scope, hardening completion record |
| `docs/v5/SCALING_STRATEGY.md` | Proof-based scaling, batch sequencer architecture, and what the sequencer is trusted for (consolidated from former `BATCH_SEQUENCER.md` + `SEQUENCER_TRUST_MODEL.md`) |

The AI-audit history is provided for context only. The external auditor
should form their own independent findings.

### Post-Audit Policy

Any Solidity edit after the freeze commit must be:

1. Explicitly scoped to a specific finding or accepted-risk item
2. Reviewed by the original auditor or a qualified substitute
3. Recorded in `docs/v5/AUDIT_REPORT.md` with finding reference and outcome

Changes to `test/`, `frontend/`, `sdk/`, or `prover/` do not require
re-audit unless they expose a new on-chain attack surface.

## Documentation Posture

The canonical live release-readiness set is now:

1. `docs/v5/CURRENT_STATE.md`
2. `docs/v5/RELEASE_READINESS.md` (this file — also carries the freeze
   notice + hardening completion record)
3. `docs/v5/AUDIT_REPORT.md` (carries the AI-audit history + web2/UI
   subsidiary audits)
4. `docs/v5/VERIFICATION_MAP.md`
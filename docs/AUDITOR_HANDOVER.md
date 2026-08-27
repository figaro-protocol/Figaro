# External Audit Handover

Status: the handover package for the external audit of the frozen V5 Solidity
surface — the single open release gate (`RELEASE_READINESS.md` Task 2). What is
frozen, how to verify the freeze, what to read, which behaviors are intentional,
and the validation gate the audited tree must pass.

## Freeze Notice — Solidity Surface Frozen for External Audit

Initial freeze 2026-04-20; **stamped 2026-08-13: the freeze commit is `c7f85d0d`**
(`c7f85d0dd79298d1add2623993cc60b21321fed3`, 2026-08-12 — the last commit touching
the frozen scope; the stamp never moves). Pre-stamp amendment history is in
`git log`; post-stamp edits are classified in the records below.

No feature changes, refactors, or dependency upgrades are made to these directories
during the audit window. Any edit requires either a narrow follow-up review or a
repeat audit decision (the Post-Audit Policy below).

### Frozen scope

Paths follow the 2026-07-27 directory reorganisation (`CONTRACTS.md` § header — the
directory IS the tier map).

| Directory / file | Contents |
|---|---|
| `src/kernel/` | `FigaroCore.sol`, `CommitmentTypes.sol` |
| `src/protocol/registries/` | `ClauseRegistry.sol`, `MembersRegistry.sol`, `AssemblyRegistry.sol` |
| `src/protocol/coordinators/` | `AttestationCoordinator.sol`, `IRoleResolver.sol`, `WitnessSwapAndCommitCoordinator.sol` |
| `src/protocol/usage/` | `UsageCounter.sol` |
| `src/protocol/verifier/` | `FigaroBatchVerifier.sol`, `ISP1Verifier.sol` |
| `src/rpgf/` | `RpgfMinter.sol` |
| `src/florin/` | `FlorinToken.sol`, `IFlorinMinter.sol` |
| `script/Deploy.s.sol` | Devnet deploy (defines the devnet surface) |
| `script/DeployMainnet.s.sol` | Mainnet deploy (defines the audited mainnet surface; deploys the swap coordinator) |
| `script/DeploySwapCoordinator.s.sol` | The swap coordinator alone onto a LIVE stack |

### Explicitly out of scope (not frozen)

- `src/mocks/` — test helpers, never deployed to mainnet
- `src/echidna/` — fuzzing harnesses, never deployed to mainnet
- `test/`, `frontend/`, `sdk/` — non-Solidity surfaces (see the Frontend + SDK
  audit posture at the bottom)

### Verifying the freeze

The kernel has NO post-stamp edits — this diff is empty and must stay empty:

```bash
git diff c7f85d0d -- src/kernel/
```

For the rest of the frozen scope:

```bash
git diff c7f85d0d -- src/protocol/ src/rpgf/ src/florin/ script/Deploy.s.sol script/DeployMainnet.s.sol script/DeploySwapCoordinator.s.sol
```

Expected output: exactly the recorded post-stamp amendments and nothing more (the
records below). Any hunk not traceable to a recorded amendment is an unrecorded
frozen-scope edit — a Post-Audit Policy violation.

### Post-stamp records

1. **2026-08-13** — `script/Deploy.s.sol` received a `forge fmt` line-rewrapping in
   the first-CI alignment wave. Formatting only, no token-level change.
2. **2026-08-13 (config, maintainer-ruled)** — the RPGF exclusion list shrank to
   `figaro-assembly-provenance` alone: the mandatory pair now earns for its
   author-of-record. Scope: both deploy scripts' `excluded` arrays + comment-only
   NatSpec in `UsageCounter.sol`; no contract bytecode changed. Formal re-run all
   green (Foundry 301/301 fork suite included, Halmos 32/32, Certora 6/6).
3. **2026-08-27** — the Post-Audit-Policy formal re-run for the 08-18/19 amendment
   wave: the `registeredBy` rename (`78f96ae6`) and the swap coordinator's scope
   entry + SwapRouter02 rebinding (`57a93199`, `9d16301c`). All green: Foundry
   299 passed / 0 failed (3 skips = the `MAINNET_RPC_URL`-gated mainnet-fork suite,
   env unset on that run — the release gate runs it), Halmos 32/32, Certora 6/6
   specs with `--wait_for_results all` (run URLs in `VERIFICATION_MAP.md` §10).

### Post-Audit Policy

Any Solidity edit after the freeze commit must be:

1. Explicitly scoped to a specific finding or accepted-risk item
2. Reviewed by the original auditor or a qualified substitute
3. Recorded in the backlog with finding reference and outcome
4. Followed by a full formal-suite re-run (Certora + Halmos), not just Foundry —
   a signature change silently orphans any CVL spec that calls it, and the break
   is invisible until the gate actually runs

Changes to `test/`, `frontend/`, or `sdk/` do not require re-audit unless they
expose a new on-chain attack surface.

## Reading list

| Document | Purpose |
|---|---|
| `docs/DESIGN_DECISIONS.md` | The catalogued intentional patterns that look like vulnerabilities (read first; count them there, never quote a stored number) |
| `docs/VERIFICATION_MAP.md` | Every invariant → code → test → formal layer |
| `docs/RELEASE_READINESS.md` | The open release tasks (testnet + mainnet) |
| `docs/SCALING_STRATEGY.md` | Proof-based scaling, batch sequencer architecture, and what the sequencer is trusted for |

The AI-audit history is provided for context only. The external auditor should form
their own independent findings.

## Behaviors to surface

Correct by design, but non-obvious — flagged so a reviewer does not spend time
re-deriving they are intentional:

- `FlorinToken.renounceDeployerMint()` emits NO event (the state is readable via
  `deployerMintRenounced`; the renounce is a one-way latch, not an event source).
- `FlorinToken.registerMinter` treats `cap == 0` as the "not a minter" sentinel — a
  minter registered with a zero cap is indistinguishable from an unregistered one.
- The kernel has an unreachable `expectedCumulativeValue ∈ (max/3, max/2]` window (bond
  math would overflow above it; it cannot be reached because a prior order's bond would
  have reverted first).
- A blacklisted seller (a token that reverts transfers to that address) bricks
  `resolveProcess` for the whole process — `FigaroCore.sol:294`; accepted (the buyer
  chose the token and the seller), a token-choice concern, not a kernel escape hatch.
- The kernel recovers ECDSA signers (`ECDSA.recover` in `commit()`), so a
  smart-contract wallet (multisig) cannot be a kernel party directly; it transacts
  through an EOA it controls (the off-protocol auxiliary pattern). The buyer-key-loss
  comment at `FigaroCore.sol:238-240` recommends social recovery or multisig for the
  buyer role — upstream of the kernel, consistent with the same pattern.

## Accepted risks

Current design realities accepted by the protocol surface, not accidental defects:

1. buyer key loss is terminal for an active process because the kernel has no timeout or admin recovery path
2. very large processes are gas-bounded, so institution design should compose across processes instead of pushing single-process fanout toward the ceiling
3. fee-on-transfer tokens are unsupported by design and are rejected explicitly by the kernel

## Accepted runtime posture

Current runtime posture decisions, not release blockers:

1. geolocation remains allowed for same-origin runtime surfaces instead of being narrowed to a brittle route allowlist, because handoff and delivery-attestation modules are runtime-composable across multiple live pages

## Validation Commands — the verification gate

Use these commands as the release gate. Expected output means successful completion with exit code `0` and the stated pass criteria. This gate asserts pass/fail; the harness inventory (suite, file, property, and rule counts) is `TESTING.md`.

### Contracts

```bash
MAINNET_RPC_URL=<mainnet rpc> forge test --via-ir
```

Expected output:

- 0 failed
- 0 skipped — the release gate RUNS the `MAINNET_RPC_URL`-gated mainnet-fork
  suite (the Permit2 witness-digest parity proof); without the env var those
  tests skip, which is a dev convenience, not a release posture

### Halmos Symbolic Proofs

```bash
./scripts/test-halmos.sh
```

Prereqs (one-time): `brew install z3 && pipx install halmos`.

Expected output: `✅ All 32 Halmos properties proved (7 FigaroCore + 7 MembersRegistry + 6 UsageCounter + 6 ClauseRegistry + 6 AssemblyRegistry).` (exit code 0)

### Certora Formal Verification

```bash
export CERTORAKEY=<key>
./scripts/test-certora.sh
```

Expected output: all 6 specs green (FigaroCore, AttestationCoordinator,
TokenOpsVerification, FlorinToken, BatchVerifierTokenOps, RpgfMinter). `Failed on rule_not_vacuous` alone is the
vacuity heuristic, not a rule failure — the results table is the authority.

### Echidna Fuzzing

```bash
./scripts/test-echidna.sh
```

Prereqs: `brew install echidna`.

Expected output: all properties hold on both harnesses (kernel + FlorinToken), exit code 0.

### TLA+ Model Checking

```bash
./scripts/test-tla.sh
```

Prereqs: Java 11+, `tla2tools.jar` in `formal/` (script header has the `curl`).

Expected output: all four models verify every invariant, TLC exit code 0.
(`SettlementUniverses.cfg` ships both named assumptions TRUE; flipping either
to FALSE is a deliberate experiment that is EXPECTED to fail — not a gate
regression.)

### SDK Tests

```bash
cd sdk && npx vitest run
```

Expected output: Vitest exits cleanly with no failing suites (the live-chain
`integration.test.ts` requires a running devnet; it skips without one — run
the gate with the devnet up so it executes).

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

### Frontend Browser Validation

Devnet posture:

```bash
cd frontend && npm run test:e2e:devnet
```

Expected output:

- Anvil deployment verification passes first
- Playwright devnet project exits cleanly with no failing specs (the census is
  derived — `npx playwright test --list` — never a stored count)

High-value browser checks that must remain covered:

1. `/evidence-display` works under iframe-style embedding rules
2. handoff geolocation works under production-style headers
3. delivery-attestation geolocation works under production-style headers

## Frontend + SDK audit posture

The FE/SDK security audit — the Solidity audit's sibling: open-world places the
trust boundary in the client, a static export that renders permissionless,
attacker-authored network state and is the what-you-see-is-what-you-sign surface —
completed 2026-07-22 across eight domains: signing integrity, dispatch-race/RFQ
market formation, untrusted-content rendering, IPFS content-integrity, the
ECDH/XMTP coordination channel, client-side key material, app hardening + supply
chain, and the ecosystem-agent tier. All findings ruled and fixed with regressions.

Standing rule: a change that exposes a NEW client-side trust-boundary surface (a
new untrusted-content render path, a new signing path, a new coordination-channel
message type) warrants a scoped re-review against the eight domains — not a
re-freeze.

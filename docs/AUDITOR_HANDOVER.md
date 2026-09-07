# External Audit Handover

The handover package for the external audit of the frozen Solidity surface: what
is frozen, how to verify the freeze, what to read, which behaviors are
intentional, and the validation gate the audited tree must pass.

## Freeze Notice — Solidity Surface Frozen for External Audit

**The freeze commit is `c7f85d0d`**
(`c7f85d0dd79298d1add2623993cc60b21321fed3`) — the last commit touching the frozen
scope. The stamp never moves. Post-stamp edits are classified
below; everything before it is in `git log`.

No feature changes, refactors, or dependency upgrades are made to these directories
during the audit window. Any edit requires either a narrow follow-up review or a
repeat audit decision (the Post-Audit Policy below).

### Frozen scope

The directory IS the tier map (`CONTRACTS.md` § header).

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

Expected output: exactly the post-stamp amendments listed below and nothing more.
Any hunk not traceable to a listed amendment is an unlisted frozen-scope edit —
a Post-Audit Policy violation.

### Post-stamp amendments

1. **2026-08-13** — `script/Deploy.s.sol` received a `forge fmt` line-rewrapping in
   the first-CI alignment wave. Formatting only, no token-level change.
2. **2026-08-13 (config, maintainer-ruled)** — the RPGF exclusion list shrank to
   `figaro-assembly-provenance` alone: the mandatory pair earns for its
   designer of record. Scope: both deploy scripts' `excluded` arrays + comment-only
   NatSpec in `UsageCounter.sol`; no contract bytecode changed. Formal re-run all
   green (Foundry 301/301 fork suite included, Halmos 32/32, Certora 6/6).
3. **2026-08-27** — the Post-Audit-Policy formal re-run for the 08-18/19 amendment
   wave: the `registeredBy` rename (`78f96ae6`) and the swap coordinator's scope
   entry + SwapRouter02 rebinding (`57a93199`, `9d16301c`). All green: Foundry
   299 passed / 0 failed (3 skips = the `MAINNET_RPC_URL`-gated mainnet-fork suite,
   env unset on that run — the release gate runs it), Halmos 32/32, Certora 6/6
   specs with `--wait_for_results all` (report URLs below, § Formal run evidence).
4. **2026-08-27** — `script/Deploy.s.sol` comment-only: an anvil accounts count
   in a mint-block comment corrected 20 → 38 (the value the maintainers'
   pre-commit guard battery enforces). No bytecode change; recorded
   per the amendment-1 precedent, no re-run required.

### Formal run evidence

The proof layers are re-run at each stamp and after each amendment listed above.
Those runs are kept here because the evidence is owed to a reader outside the
project. Which invariant each layer carries is `VERIFICATION_MAP.md`.

- **2026-08-13, freeze commit `c7f85d0d`** — all four TLA+ models, every invariant,
  TLC exit 0 (`SettlementUniverses` explored 7.46M states, no error); both Echidna
  harnesses held every property across the configured 50,000-call budget, exit 0;
  Halmos 32/32; Certora 6/6.
- **2026-08-19** — `FigaroCore.tla` re-run after `A-8`/`A-9` were added: 9/9,
  8,380,329 states generated / 6,087,113 distinct, depth 9, TLC exit 0. The state
  space is unchanged — the two new invariants observe it, they do not extend it.
- **2026-08-27** (the 08-18/19 amendment wave) — Halmos 32/32 proved, exit 0; Certora 6/6 specs with `--wait_for_results all`, exit 0 (every
  `Violated` line in the stream was the `rule_not_vacuous` healthy polarity).

Certora report URLs, all from the 2026-08-27 re-run:

| Spec | Report URL |
|---|---|
| FigaroCore | https://prover.certora.com/output/9512759/f7d9478c70eb45b081750671c158d01e |
| AttestationCoordinator | https://prover.certora.com/output/9512759/ad0172900adf4b3f952c37f6ba02d2af |
| TokenOpsVerification | https://prover.certora.com/output/9512759/1abfe0ceb23e40b0ab8c3151039bb1da |
| FlorinToken | https://prover.certora.com/output/9512759/864adb11f68145a98f2de9b081f6181e |
| BatchVerifierTokenOps | https://prover.certora.com/output/9512759/d364d98732d04db2ae5a9c7e2a578d74 |
| RpgfMinter | https://prover.certora.com/output/9512759/7a68e4562d8e461ab93256dbac6740c4 |

### Test coverage

Measured 2026-09-07 over the eleven frozen contracts with
`forge coverage --ir-minimum --no-match-test "test_Gas_"` (the gas-anchor tests
are excluded because minimum optimisation inflates their measurements; the
`MAINNET_RPC_URL`-gated fork suite was skipped on that run):

| | Lines | Statements | Branches | Functions |
|---|---|---|---|---|
| Frozen scope | 94.33% (499/529) | 94.64% (671/709) | 90.30% (121/134) | 98.51% (66/67) |
| Lowest file: `FigaroBatchVerifier.sol` | 80.88% | 84.43% | 100% | 100% |

What the uncovered lines are: in `FigaroBatchVerifier` all 26 are the bodies of
the inline-assembly hashing helpers (`_hashPositions`, `_hashAttestations`,
`_hashSpecBindings`, `_hashUsage`), which the instrumentation cannot attribute
and which every `settleBatch` test executes — the functions themselves report
100%; in `FigaroCore` the one line is the `CumulativeValueOverflow` revert, the
unreachable window listed under § "Behaviors to surface"; in `RpgfMinter` the
two lines are the `periodCount()` view. The `--ir-minimum` mapping warning
Foundry prints applies: the per-line figures are approximate, the per-function
figures are not.

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

## Review goals

What the maintainer wants from the review, so hours go where the doubt is.

**Worst case.** Locked bonds lost or moved through a defect rather than through
the documented by-design cases: a resolution by anyone but the buyer, a bond
that leaves the kernel other than at resolution, or a batch resolution the
direct path would have refused.

**Areas of concern, in order.**

1. Any path by which the payoff table the equilibrium rests on can be altered:
   signature or domain-separator replay, accumulator manipulation, reentrancy
   through the token, an order that resolves a process it does not belong to.
   The kernel is ~200 SLOC and carries five verification layers; the doubt is in
   what composes with it, not in it.
2. The batch path (`FigaroBatchVerifier.settleBatch`, the largest function in
   scope): a forged or mis-bound proof accepted by the verifier, a clause-hash
   binding that diverges from the registry, and the one privileged writer (the
   verifier into `UsageCounter`) doing more than accrue.
3. The reward and stake economics: reward inflation or Sybil accrual through
   `UsageCounter` and `RpgfMinter`; stake accounting in the registries' withdrawal
   paths.
4. Token-boundary behaviour: the Permit2 witness digest and SwapRouter02 call in
   `WitnessSwapAndCommitCoordinator`, and non-standard ERC-20s beyond the
   fee-on-transfer rejection.

**Questions for the auditor.**

1. Is there any sequence of `commit` calls, on one process or across processes,
   that makes `resolveProcess` pay a seller more than `2·G_i + P_i` or refund the
   buyer other than `P_i` per order?
2. Can a valid SP1 proof over a stale or foreign state be replayed against the
   verifier, given the `prevRoot`, `chainId`, and `verifyingContract` checks?
3. Can the try/catch around `applyBatchAccrual` be made to swallow anything other
   than an accrual-gate revert?
4. Is the `icbrt(c·d²)` score manipulable at a cost below the registration stake
   plus the member stake it requires?
5. Does the Permit2 witness in `swapAndCommit` bind every field a signer would
   want bound, so a relayer cannot substitute a route?

## Static analysis

Slither 0.11.3 (100 detectors, `--exclude-dependencies`, mocks, echidna, tests,
and scripts filtered) and Semgrep with the `p/smart-contracts` ruleset, run
over the frozen scope. Semgrep returns only INFO gas-style rules — zero from its
security rules. Slither's 40 results, triaged:

| Severity | Detector | Where | Verdict |
|---|---|---|---|
| High | arbitrary-send-erc20 | `_pullExact` in `FigaroCore` and `FigaroBatchVerifier` | Designed. The `from` is a recovered EIP-712 signer (kernel) or a net position hashed into the proof's public values (verifier), never a caller-supplied address. |
| Medium | incorrect-equality | `MembersRegistry.withdraw` (`unlockAt == 0`) | Sentinel for "nothing pending"; `DESIGN_DECISIONS.md` #15. |
| Medium | reentrancy-no-eth | `settleBatch` writes `stateRoot` after calling `UsageCounter` | `nonReentrant`; the callee is an immutable address that accepts only this caller and calls nothing back; the call sits in a try/catch so its revert cannot unwind the token legs. |
| Medium | unused-return | tuple destructuring of `assemblies.bindings` | Reads the fields it needs. |
| Medium | missing zero-check | `WitnessSwapAndCommitCoordinator` constructor `router_` | A zero router yields a coordinator whose swap leg always reverts and holds nothing; the deploy scripts probe the router before construction. Left as is under the freeze. |
| Low | calls-loop | accrual, spec-binding, position, and entitlement loops | Designed; loops are over caller-sized calldata and gas-bounded (accepted risk 2). No loop body reverts on a third party's action. |
| Low | timestamp | `deadline` in `commit`; registry cooldowns; reward periods | `deadline` is the expiry of the unconsummated signature window (`DESIGN_DECISIONS.md` #13); the rest are day-scale comparisons. |
| Info | assembly, cyclomatic-complexity, low-level-calls, missing-inheritance, naming | verifier hashing helpers; `commit`; the swap call and the three ETH refunds; local interfaces; `DOMAIN_SEPARATOR` | Calldata hashing mirrored by the prover's parity tests; the kernel's one entry point; checks-effects-interactions on every refund; style. |

## Actors, privileges, and external dependencies

Every actor and what it alone can do. The kernel has no privileged role: `commit`
never reads `msg.sender`, and `resolveProcess` is gated by presence
(`msg.sender == rootBuyer`), not by a role.

| Actor | Can | Cannot |
|---|---|---|
| Buyer | sign an order; call `resolveProcess` on its own process; attest on its own orders | resolve a process it did not open; resolve one order of a process |
| Seller of record | sign an order; attest on its own orders, or delegate that to an `IRoleResolver` contract at the seller address | move any bond; resolve |
| Designer / registrant | register a clause or assembly under a stake; withdraw that stake (the binding stays); claim designer rewards on the keys it registered while its member stake is live | edit or remove a registration; earn on an unstaked key |
| Member | register, update, request withdrawal, withdraw after the cooldown | act for another wallet |
| Batch submitter (sequencer or anyone) | call `settleBatch` with a valid proof over the current root | fabricate an operation, move a token the proof does not commit to, replay a proof (`SCALING_STRATEGY.md` § Trust analysis) |
| `FigaroBatchVerifier` | write accrual into `UsageCounter` (sole caller, immutable) | mint, edit a score, block a resolution (`DESIGN_DECISIONS.md` #16, #20) |
| `RpgfMinter` | mint florins up to its 600M cap, pro rata to score | exceed the cap; mint outside a closed period |
| Florin deployer | register minters until `renounceDeployerMint`; the mainnet script renounces in the same broadcast | anything after the renounce |
| DAO treasury multisig | spend the 300M it holds | any protocol write; it is upstream of every contract |

| External dependency | Bound where | Trusted for |
|---|---|---|
| OpenZeppelin Contracts 5.5.0 (`lib/`, pinned submodule) | inheritance and SafeERC20 | library correctness |
| Permit2 (canonical, `0x000000000022D473030F116dDEE9F6B43aC78BA3`) | `WitnessSwapAndCommitCoordinator` constructor, probed for code at deploy | witness-transfer semantics on the swap leg only |
| Uniswap SwapRouter02 (per chain; `deployments/<chainId>.json`) | same constructor, probed for `factory()` and `WETH9()` at deploy | executing the swap the signer's witness commits to |
| SP1 verifier gateway + program vkey (`SP1_VERIFIER_GATEWAY`, `SP1_PROGRAM_VKEY`; the devnet script wires `MockSP1Verifier`) | `FigaroBatchVerifier` constructor, immutable | proof soundness on the batch path; a changed program is a new verifier at a new address |
| IPFS | content behind every on-chain hash | availability, never integrity (`DATA_LAYER.md`) |
| XMTP | the runtime's coordination channel | nothing on-chain |
| Arbitration forums | composed at the edge (`CONTRACTS.md` § coordinators) | nothing on-chain; a forum rules on open data and cannot call resolve |

No oracle, no bridge, no upgrade proxy, no pause anywhere.

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
- Token authority is a class, not one case. A token that reverts transfers to a
  party's address bricks `resolveProcess` for the whole process — the seller at
  `FigaroCore.sol:294`, the buyer at `:295`; a token that blocklists or freezes
  the kernel's own address, pauses, or is upgraded to do any of these has the same
  effect. Accepted (the buyer chose the token and the seller), a token-choice
  concern, not a kernel escape hatch. On the batch path the same class reverts one
  batch, not the protocol: a payout recipient the token refuses reverts
  `settleBatch` at `FigaroBatchVerifier.sol:531`, the mitigation is the
  sequencer-side check the NatSpec above `_executePositions` prescribes for
  approval revocation, and every process in the batch keeps its direct path.
- The kernel recovers ECDSA signers (`ECDSA.recover` in `commit()`), so a
  smart-contract wallet (multisig) cannot be a kernel party directly; it transacts
  through an EOA it controls (the off-protocol auxiliary pattern). The buyer-key-loss
  comment at `FigaroCore.sol:238-240` recommends social recovery or multisig for the
  buyer role — upstream of the kernel, consistent with the same pattern.

## Accepted risks

Current design realities accepted by the protocol surface, not accidental defects:

1. buyer key loss is terminal for an active process because the kernel has no timeout or admin recovery path
2. very large processes are gas-bounded, so institution design should compose across processes instead of pushing single-process fanout toward the ceiling
3. fee-on-transfer tokens are unsupported by design and are rejected explicitly by the kernel; rebasing tokens are unsupported and NOT detected (`_pullExact` sees only the delta inside its own transfer call — `DESIGN_DECISIONS.md` #10 states the consequence and corrects the kernel's NatSpec, which is frozen)

## Accepted runtime posture

Current runtime posture decisions, not release blockers:

1. geolocation remains allowed for same-origin runtime surfaces instead of being narrowed to a brittle route allowlist, because handoff and delivery-attestation modules are runtime-composable across multiple live pages

## External evaluation frameworks — where the surface stands

The two published checklists an auditor or a reviewer applies to a protocol of this
shape, answered from the tree. Each answer names its evidence.

### The Rekt Test (Trail of Bits)

| # | Question | Answer | Evidence |
|---|---|---|---|
| 1 | Actors, roles, and privileges documented | Yes | The kernel has no privileged role. The two that exist above it, the florin deployer until `renounceDeployerMint` and `FigaroBatchVerifier` as `UsageCounter`'s sole writer, are in `CONTRACTS.md`. |
| 2 | External services, contracts, and oracles documented | Yes | § "Actors, privileges, and external dependencies" above: one table, with where each is bound and what it is trusted for. There is no oracle. |
| 3 | Written and tested incident-response plan | No | `SECURITY.md` carries the disclosure contact. Nothing can be paused or upgraded, so the plan is disclosure and redeployment under a new identifier. |
| 4 | Best attack paths documented | Yes | `DESIGN_DECISIONS.md`, the `/pitfalls` page, § "Behaviors to surface" above. |
| 5 | Identity verification and background checks on employees | Not applicable | One maintainer. |
| 6 | A team member with security in their role | Yes | The maintainer. |
| 7 | Hardware security keys for production systems | Not in the tree | Operational, outside the repo. |
| 8 | Key management requiring multiple humans and physical steps | Largely dissolved | No admin key survives deployment. The one standing key is the DAO treasury multisig, upstream of the protocol. |
| 9 | Key invariants defined and tested on every commit | Yes | Foundry runs in pre-commit; Halmos, Certora, TLA+, Echidna, and the Lean 4 equilibrium proof run in the battery. `VERIFICATION_MAP.md` maps each invariant to its test. |
| 10 | Best automated tools for discovering security issues | Yes | Certora, Halmos, Echidna, Mythril (`scripts/mythril-docker.sh`), Slither and Semgrep (§ "Static analysis" above). |
| 11 | External audits and a vulnerability-disclosure or bug-bounty programme | Open | No external audit has been performed; this document is the handover for the first. Disclosure contact in `SECURITY.md`. No bounty programme. |
| 12 | Avenues for abusing users considered and mitigated | Yes | Buyer key loss, bad-faith withholding, and prompt injection against operator agents are documented; the policy signer (`@figaro-protocol/sdk/signer`) is the mitigation for the last. |

### The L2BEAT risk categories, applied to the batch path

| Risk | Posture | Evidence |
|---|---|---|
| State validation | Validity proof | `FigaroBatchVerifier.settleBatch` verifies an SP1 proof and checks every witness-spec binding against the live `ClauseRegistry`. |
| Data availability | Off-chain by design | The chain holds hashes; the parties hold the preimages. `DATA_LAYER.md` owns the seam. |
| Exit window | Immutable | No owner, no upgrade path, no pause, in every contract. A changed program is a new verifier under a new address. |
| Proposer failure | Direct path always open | The kernel needs no sequencer; every process can resolve through `FigaroCore` directly. |
| Sequencer failure | Same | A batch-resolved process never acquires kernel status (`FigaroBatchVerifier.sol` NatSpec on designer rewards); the two resolution paths are disjoint, and `UsageCounter` bridges only the accrual. |

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

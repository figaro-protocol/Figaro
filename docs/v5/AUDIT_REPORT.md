# V5 Security Audit Report

Status: comprehensive internal security audit for the live V5 kernel, mechanism
modules, FIG token contracts, and batch verification layer.

Last updated: 2026-04-26 (Web3 normal-pass + adversarial-pass AI audits on the Phase-4a/4b + StagedMerkleAirdrop + small-surface deltas; 1 new Medium from normal pass, 0 new actionable from adversarial pass; case strengthened for two queued items).

## Scope

Reviewed live Solidity surface (20 production contracts + 1 new validator interface):

**Core Protocol**
- `src/FigaroCore.sol` — kernel: 2 external functions, 3 mappings, no owner
- `src/CommitmentTypes.sol` — EIP-712 typed structs and hash functions

**Attestation & Schema**
- `src/AttestationCoordinator.sol` — unified zero-storage attestation (3 modes, agreement-binding)
- `src/SchemaRegistry.sol` — permissionless event-only schema anchoring
- `src/SchemaRegistrationHelper.sol` — stateless atomic-bind composer for non-bootstrap schemas (closes M-1; see DESIGN_DECISIONS.md #13)
- `src/IRoleResolver.sol` — role-authorization interface
- `src/ISchemaValidator.sol` — four-arg validator interface (schemaId, stage, sectionData, content)

**Mechanism Modules**
- `src/DutchAuction.sol` — descending-price coordination, no token handling
- `src/OperatorRegistry.sol` — self-declaration with reclaimable ETH deposit

**Schema Validators** (15 — one per registered runtime-attestable schema, set via first-write-wins `setValidator`)
- `src/schemaValidators/FigaroHandoffV1Validator.sol` — Category-2, enforces byte-equality
- `src/schemaValidators/FigaroGeoV2Validator.sol` — Category-2, enforces byte-equality
- `src/schemaValidators/FigaroFulfilmentV1Validator.sol` — Category-2, enforces byte-equality
- `src/schemaValidators/FigaroGHGProtocolV1Validator.sol` — Category-2, enforces byte-equality (GHG sister schema)
- `src/schemaValidators/FigaroGHGISO14064V1Validator.sol` — Category-2, enforces byte-equality (GHG sister schema)
- `src/schemaValidators/FigaroGHGPAS2050V1Validator.sol` — Category-2, enforces byte-equality (GHG sister schema)
- `src/schemaValidators/FigaroGHGEN16258V1Validator.sol` — Category-2, enforces byte-equality (GHG sister schema)
- `src/schemaValidators/FigaroGHGCustomV1Validator.sol` — Category-2, enforces byte-equality (GHG sister schema)
- `src/schemaValidators/FigaroCommerceV1Validator.sol` — Category-2, enforces byte-equality
- `src/schemaValidators/FigaroGHGMeasurementV1Validator.sol` — Category-1, runtime grams CO2e
- `src/schemaValidators/FigaroCourierProcessV1Validator.sol` — Category-1, runtime-only
- `src/schemaValidators/FigaroProximityPolicyV1Validator.sol` — Category-2, enforces byte-equality (committed band)
- `src/schemaValidators/FigaroProximityProofV1Validator.sol` — Category-1, runtime witness payload
- `src/schemaValidators/FigaroMerchantProcessV1Validator.sol` — Category-1, runtime-only
- `src/schemaValidators/FigaroCourierProcessV1Validator.sol` — Category-1, runtime-only
- `src/schemaValidators/FigaroJurisdictionV1Validator.sol` — Category-2, enforces byte-equality (off-chain dispute-resolution jurisdiction; baseline graph per Paper E)

The five `FigaroGHG<Standard>V1Validator` contracts are sister schemas — one
per accounting standard, replacing the prior single `FigaroGHGDisclosureV1Validator`
(2026-04-26 split). Standard identity lives in the schemaId; content shape
`(uint8 scope)` and validation logic are shared.

`FigaroProximityPolicyV1Validator` + `FigaroProximityProofV1Validator` are
sister schemas that replaced the prior single `FigaroProximityV1Validator`
(2026-04-26 split). Policy commits the required band at agreement signing
(Category-2, byte-equality enforced); proof carries the per-handoff nonce
+ signed witness at runtime (Category-1, fresh per attestation). Off-chain
consumers verify `proof.band == policy.band`. Same split rationale as
GHG-disclosure / GHG-measurement.

**FIG Token**
- `src/fig/FigToken.sol` — ERC-20 + EIP-2612 permit, 1B hard cap, minter registry
- `src/fig/RpgfMinter.sol` — three-stage SP1-gated retroactive public-goods funding minter (year 2 / year 5 / year 9), one-shot per (stage, address). Replaced `StagedMerkleAirdrop.sol` 2026-05.

**Batch Verification**
- `src/FigaroBatchVerifier.sol` — SP1-proved batch verification

Excluded from scope:
- `archive-v3/`, `archive-v4/`
- `src/mocks/`, `src/echidna/` (test infrastructure)
- `src/fig/IFigMinter.sol`, `src/interfaces/ISP1Verifier.sol` (upstream-style interfaces)
- `lib/` (upstream dependencies)

## Post-audit amendment (2026-04-23) — Phase-4a/4b agreement binding

The Phase-4a/4b refactor tightened the attestation path to bind every runtime
declaration to the contract parties signed at commit time:

- `ISchemaValidator` gained a `bytes sectionData` parameter; all ten validators
  updated in lockstep.
- `AttestationCoordinator.attestAsSeller/Buyer/ViaResolver` now take a full
  `Commitment(s)` plus `sectionData` and `bytes32[] proof` and verify the
  declared clause is a leaf of the target order's signed `agreementHash`
  via OpenZeppelin `MerkleProof.verify` (sorted-pair).
- Five Category-2 validators (handoff, geo, fulfilment, ghg-disclosure, commerce)
  additionally enforce `keccak256(content) == keccak256(sectionData)` — a seller
  who signed a clause at commit time cannot silently drift at runtime.
- `FigaroTopologyV1Validator.sol` deleted — topology is manifest-only with no
  runtime attestation.
- Certora AC spec re-verified (8/8 sub-rules) against the new dispatch shape.

## Verification Layers

The V5 kernel has been verified through six independent verification methods.
See `docs/v5/VERIFICATION_MAP.md` for the full cross-reference.

### 1. Foundry Tests (concrete)

```bash
forge test --via-ir
```

Result:

- 14 test suites
- 225 tests passed
- 0 failed, 0 skipped

Live test inventory:

- `FigaroCore` lifecycle, revert branches, event emission, parity vectors
- `AttestationCoordinator` (3 modes, cross-process rejection)
- `SchemaRegistry` (permissionless registration, duplicate rejection)
- `DutchAuction` (price curves, claim evaluation, edge cases)
- `OperatorRegistry` (registration, in-place profile updates, deposit lock + withdrawal — role + lifecycle flags do not exist on-chain; a seller's role is whatever their catalogue archetype declares)
- `FigaroBatchVerifier` (state root continuity, auxiliary data hash verification)
- `FigToken` (cap enforcement, permit, minter registry)
- `RpgfMinter` (per-stage claim, per-stage one-shot, per-stage unlock timing, merkle proof validation, submitter-gated root submission) + Rust ↔ Solidity conformance harness
- `GasCeilingTest` (~2,145 orders within 30M gas)
- Audit regression tests

### 2. Halmos Symbolic Proofs (z3 solver)

```bash
./test-halmos.sh
```

Wrapper at `test-halmos.sh` verifies that `halmos` and `z3` are installed
(prereqs: `pipx install halmos`, `brew install z3`) and runs the proof with a
10-minute per-assertion timeout. The originally documented 5-minute timeout
proved unreliable for `check_resolutionPayouts` (observed range 73s – >300s
across runs because Z3's search path is non-deterministic); 10 minutes is
the committed default.

**7/7 properties proved for ALL possible inputs:**

| Property | What it proves |
|---|---|
| `check_tokenConservation_afterCommit` | Total token supply constant after commit |
| `check_contractSolvency_afterCommit` | Contract holds exactly 4× payment after commit |
| `check_correctBondAmounts` | Buyer and seller each lose exactly 2× payment |
| `check_resolutionPayouts` | Seller gains +payment, buyer loses −payment, contract empty |
| `check_orderStatusTransition` | Status moves 0→1→2 only, never backwards |
| `check_buyerDominance_revert` | Non-buyer resolve always reverts |
| `check_cumulativeValueMonotonic` | Accumulator strictly increases with each sub-order |

Harness: `test/HalmosFigaroCore.t.sol`

### 3. Certora Formal Verification (cloud-based SMT)

```bash
certoraRun certora/FigaroCore.conf
```

**27/27 rules verified across 4 specs (2026-04-21 re-run, Certora CLI 8.8.1). FigaroCore details below:**

| Rule | What it verifies |
|---|---|
| `orderStatusNeverDecreases` | Status monotonicity |
| `orderStatusTransitionsAreValid` | Only 0→1 and 1→2 transitions |
| `commitIncreasesActiveCount` | Active count integrity |
| `onlyBuyerCanResolve` | Buyer dominance |
| `noDoubleCommit` | Duplicate commitment guard |
| `cumulativeValueMonotonic` | Accumulator monotonicity |
| `rootBuyerImmutable` | Process buyer never changes post-commit |
| `currencyImmutable` | Process currency never changes |

Spec: `certora/FigaroCore.spec`. Config: `certora/FigaroCore.conf`.

### 4. TLA+ Model Checking (exhaustive state exploration)

**7/7 invariants verified across 6M+ states:**

- `TokenConservation` — sum of wallets + contract = initial supply
- `ContractSolvency` — contract balance ≥ 0
- `WalletNonNegative` — no participant goes below zero
- `CumulativeIntegrity` — cumulativeValue = sum of order payments
- `ActiveCountCorrect` — activeCount = count of committed orders
- `ResolutionAlwaysPossible` — contract can always resolve any active process
- `TypeOK` — type well-formedness

Spec: `formal/FigaroCore.tla`. Model: `formal/MC.tla`.

### 5. Echidna Fuzzing (property-based)

```bash
echidna src/echidna/EchidnaFuzzer.sol --config echidna.yaml
```

7 property invariants verified across 43k+ calls. Corpus stored in
`corpus/` and `echidna/corpus/`.

### 6. Static Analysis (Slither)

```bash
slither . --config-file slither-fig.json
```

0 production findings on the live V5 surface.

## Audit History

### Prior AI Audit — 2026-04-16

Three-pass AI audit (vulnerability scan, economic invariants, integration).
22 total findings (2 critical, 2 high, 4 medium, 6 low, 8 informational).
All critical, high, and medium findings resolved. The complete finding record + remediation summary lived in
`SECURITY_AUDIT_AI.md`, which has been folded into this document and the
source archived locally — `git log` reaches the original.

Key remediations from that pass:
- Zero-address and contract-code checks added to FigaroBatchVerifier constructor
- MockSP1Verifier restricted to Anvil (chain guard added)
- All emission logic removed — FigEmission deleted; the 60% community allocation flows through a single retroactive public-goods funding minter (`StagedMerkleAirdrop` at first, replaced by `RpgfMinter` in 2026-05 after the schema-author RPGF design landed); founder + DAO receive their 10%/30% at genesis with no vesting
- Overflow check added to sellerPayout calculation in resolveProcess
- Batch settlement DoS risk documented in contract comments

### Current AI Audit — 2026-04-20

Full re-audit of the live 10-contract surface. Methodology: exhaustive
source-level review followed by design-philosophy challenge of every finding
(stateless/event-sourced architecture, no web2 lifecycle patterns).

**Net result: 0 new actionable findings.**

Initial findings that were raised and then withdrawn after design challenge (2026-04-20 pass):

| Initial Severity | Description | Withdrawal Reason |
|---|---|---|
| High | Process re-extension after resolution | Requires bilateral signatures — by design, not a vulnerability |
| High | Cross-order seller attestation | Attester is truthfully recorded in event; off-chain semantic concern |
| Medium | DutchAuction creator self-claim | No financial stake; web2 role-separation pattern |
| Low | StagedMerkleAirdrop single-hash leaves (inherited pattern) | Leaf preimages (52 bytes) and node preimages (64 bytes) differ — collision structurally impossible |
| Low | No-op batch accepted | ZK program is the authority on valid state transitions; on-chain check would duplicate program logic |
| Low | SchemaRegistry version 0 | Semantic validation belongs off-chain, consistent with event-sourced design |

Remaining informational notes (no code change required):

| Contract | Finding |
|---|---|
| FigToken | Minter cap at registration does not sum all registered caps; per-mint check is the real enforcement |
| FigaroBatchVerifier | `figToken` field (prior INFO-2) has been REMOVED. 3-argument constructor. |
| FigaroBatchVerifier | Batch DoS via pre-settlement approval revocation (already documented in contract) |
| FigaroCore | `_pullExact` emits arithmetic panic rather than `FeeOnTransferDetected` on downward rebase mid-transfer (extreme edge case; behavior is still revert) |
| OperatorRegistry | Error name `InsufficientDeposit` fires on excess as well as insufficient |
| FigToken | Deployer can register themselves as a minter before renouncing (trusted-setup assumption) |

Hash collision analysis: hash construction is sound at all three layers (structHash
via `abi.encode`, processId via EIP-712 domain-separated digest, orderHash via
`keccak256(bytes32 ++ bytes32)`). No prevrandao needed — the `salt` field in
Commitment is the correct bilateral nonce. Removal of prevrandao is an
improvement under PoS (validators know prevrandao up to one epoch ahead).

### AI Audit Pass — 2026-04-26 (Phase-4a/4b + StagedMerkleAirdrop + small-surface deltas)

Second AI audit pass against the post-amendment surface. Scope: 10 schema
validators + `ISchemaValidator` interface + AttestationCoordinator Phase-4a/4b
rewrite + `StagedMerkleAirdrop` + FigToken `totalRegisteredCap` sum-enforcement
+ FigaroBatchVerifier 3-arg constructor + FigaroCore `DOMAIN_SEPARATOR()` getter.

Methodology: five parallel surface-scoped sub-audits, each pre-loaded with
`DESIGN_DECISIONS.md` to skip the 12 false-positive patterns; design-challenge
reasoning recorded for every finding raised or withdrawn.

**Net result: 1 new Medium finding, 3 new Informational, 2 prior Info findings closed.**

| New finding | Severity | Surface |
|---|---|---|
| M-1 — `setValidator` front-running for non-bootstrap schemas | Medium | `AttestationCoordinator.setValidator` |
| INFO-7 — `ISchemaValidator` purity not compile-enforced (STATICCALL provides runtime protection) | Informational | `ISchemaValidator` |
| INFO-8 — GHG-Measurement validator accepts unbounded `uint256` grams (Category-1 syntactic gate, semantics off-chain) | Informational | `FigaroGHGMeasurementV1Validator` |
| INFO-9 — BatchVerifier constructor missing `_initialRoot != bytes32(0)` check (self-correcting via `StateRootMismatch`) | Informational | `FigaroBatchVerifier` constructor |

| Prior finding | Status |
|---|---|
| INFO-1 (FigToken cap registration not summed) | **CLOSED** by `totalRegisteredCap` sum-enforcement at `src/fig/FigToken.sol:51` |
| INFO-2 (BatchVerifier dead `figToken` field) | **CLOSED** by field removal; constructor now 3-arg |

M-1 mitigation in place for the 14 reference figaro-* schemas (atomic
deploy+bind in `script/Deploy.s.sol:_deployAndRegisterValidators`). For
post-deploy third-party schemas, both recommendations now landed:
recommendation (1) doc-only discipline (DESIGN_DECISIONS.md #13 + CLAUDE.md +
copilot-instructions.md), and recommendation (2) `SchemaRegistrationHelper.sol`
— a stateless no-admin composer that bundles `SchemaRegistry.registerSchema` +
`AttestationCoordinator.setValidator` atomically in one transaction. See
the prior `SECURITY_AUDIT_AI.md` "## 2026-04-26 Audit Pass" for full detail (archived locally; `git log` reaches it).

### AI Adversarial Audit Pass — 2026-04-26 (companion to the normal pass above)

Hostile-frame audit dispatched as 4 parallel attack-class probes (validator/AC
inputs + hash collision; bonding economics + multi-party process exploitation;
BatchVerifier + sequencer trust boundary; cross-contract composition chains).
Graded by **blast radius** rather than traditional severity.

Full deliverable lived in the prior `WEB3_ADVERSARIAL_AUDIT.md` (archived locally; summary captured below in "Web2 / UI / Specific-Feature Audits").

**Net result: 0 new actionable findings against the kernel.** All 28 examined
attack vectors either (a) failed against existing defenses, (b) reduced to
known design decisions, or (c) mapped to operational/deployment-discipline
boundaries already documented in `SCALING_STRATEGY.md` §"Sequencer Trust Model" and
`DESIGN_DECISIONS.md`.

**Two protocol-extension recommendations strengthened by adversarial reasoning:**

1. **Implement `registerSchemaAndValidator` convenience method** (currently
   queued in backlog) before the first high-stakes third-party schema is
   announced. The M-1 capture risk has Severe blast radius for compliance/
   regulatory schemas; doc-only mitigation is sufficient for the bootstrap
   surface and low-stakes schemas, but cannot fully close the window for
   schemas where capture has asymmetric impact.

2. **Tighten `ISchemaValidator` purity discipline** from "must be pure/view"
   to "must be pure (no external state reads)" — NatSpec + CLAUDE.md schema
   checklist. Optionally change the interface declaration from `view` to
   `pure`. Forecloses the latent non-determinism class for third-party
   validators (D-8).

**Operational documentation augmentation recommended:**
- `SCALING_STRATEGY.md` §"Sequencer Trust Model": add adversarial selective-approval-revocation scenario alongside the existing accidental-revocation note (C-2/D-2).
- `/help` schema interpretation: stage is attestation-time, not commitment-time (A-1); proximity is syntactic gate (A-6); GHG aggregates require client-side bounds (D-3).
- SDK/indexer boilerplate: explicit contract-address filtering for re-emitted events (C-6).

### Web2 / UI / Specific-Feature Audits — 2026-04-26

The following audits cover surfaces outside the kernel proper (Next.js
frontend, MetaMask interaction, registry-shaped contracts, the
agreement-binding migration). All findings shipped or accepted at the
date listed; full content of the source documents is preserved in
`docs/archive/v5/` for the maintainer's reference.

#### Web2 Security — Normal Pass (2026-04-26)
**Status: 🟢 ALL FIXED.** Scope: `frontend/` Next.js 14 app, API routes,
middleware, dependency manifest. Out of scope: UI ↔ MetaMask injection
(separate threat model, see below). **Result**: zero high-severity
findings; three low/medium gaps closed (CSP nonce on inline scripts,
`safeJson` reviver against prototype pollution, `window.ethereum`
defineProperty guard). Surveyed defenses still in force as of today.

#### Web2 Security — Adversarial Pass (2026-04-26)
**Status: 🟢 ALL REAL FINDINGS FIXED.** Methodology: hostile frame
against the same surface as the normal pass plus the defenses shipped
from it (CSP nonce, `safeJson`, `window.ethereum` guard,
AgreementPreviewModal, agreement-registry size cap, COOP/CORP, Origin
allowlist). Tried to chain low-severity findings, surface race
conditions, and find foot-guns in new defenses. **Result**: every real
finding either fixed or shown to require implausible attacker
preconditions.

#### UI ↔ MetaMask Injection Threat Model (2026-04-26)
**Status: 🟢 ALL FOUR PRIORITY FIXES SHIPPED.** Threat surface: the
pipeline between "user clicks Sign" and "wallet prompt appears", plus
IPFS-fetched content that flows into the UI and (via `agreementHash`)
into the signed message. **Defenses shipped**: CSP nonce on inline
scripts (kills run-time injection), `safeJson` against
prototype-pollution in IPFS-fetched JSON, `window.ethereum` immutable
binding via `defineProperty`, AgreementPreviewModal showing the exact
manifest before signing.

#### Agreement-Binding Migration Audit (2026-04-26)
**Status: 🟢 PASSED.** Scope: phases 1–6 of the agreement-binding rework
(2026-04-23). Verified that the migration from
`agreementHash = keccak256(canonicalJSON(Agreement))` to
`agreementHash = merkleRoot(sectionLeaves)` was implemented correctly
across all surfaces: Solidity, SDK, the active frontend, and Certora.
Inclusion-proof verification path matches the on-chain
`AttestationCoordinator` reconstruction byte-for-byte.

#### Registry & Schema Audit (2026-04-26)
**Status: 🟢 BOTTOM LINE — kernel surface is clean.** Concern raised:
"we moved off-chain all the web2 thinking for FigaroCore — has it crept
back in through registries and schemas?" Findings were
**convention-layer, not protocol-layer**: no admin can rug the
registries, no Nash equilibrium is broken, forks can replace any
convention. The risk is subtler: if downstream consumers treat the
frontend ship-list as the canonical "valid schemas" source, the
convention layer becomes a de facto gatekeeper. Mitigations: explicit
permissionless framing in CLAUDE.md and `/schemas` page; advisory-metadata
framing on `OperatorRegistry` (no kernel state-gating; role lives in the
catalogue archetype, not in the registry).

## Security Posture

The live kernel remains intentionally minimal:

- two external functions: `commit` and `resolveProcess`
- no owner
- no protocol fee
- no timeout path
- no admin escape hatch
- direct transfer settlement instead of an internal withdrawal ledger
- stateless attestation coordinator (zero storage)
- event-first schema registry (dedup guard only)

Mechanism modules remain outside the kernel payoff matrix:

- `AttestationCoordinator` is zero-storage and role-gated
- `SchemaRegistry` is permissionless and event-first
- `DutchAuction` is coordination-only and does not intermediate funds
- `OperatorRegistry` is event-sourced self-declaration with a dedup guard plus a deposit-lock-period timestamp; no role enum, no `_active` flag, and no lifecycle gates on settlement; profile updates happen in place via `updateProfile` without disturbing the deposit or lock
- `FigaroBatchVerifier` verifies SP1 proofs before executing state transitions

The verification suite explicitly covers the following enforcement edges:

- fee-on-transfer token rejection in the kernel
- duplicate commitment rejection
- buyer-only process resolution (symbolically proved for ALL inputs)
- cumulative-value monotonicity across sub-orders (proved symbolically and formally)
- cross-process attestation rejection
- token conservation across commit + resolve lifecycle (proved symbolically)
- contract solvency invariant (proved symbolically)
- state root continuity in batch verification
- FIG 1B hard cap enforcement on every mint path

## Accepted Operational Risks

These are current design realities, not defects:

1. **Buyer key loss is terminal** for an active process. The kernel intentionally
   has no timeout or admin recovery path. Use a multi-sig or social-recovery
   wallet for the buyer role in production.

2. **Large processs are gas-bounded.** The kernel supports ~2,145 orders
   within the 30M Ethereum gas limit. Institution design should keep per-process
   order counts well below the theoretical ceiling and use multi-process
   composition for larger trees.

3. **Fee-on-transfer tokens are unsupported** by design. The kernel rejects them
   explicitly via exact transfer delta checks in `_pullExact`.

## Total Verification Coverage

| Layer | Count | Method |
|---|---|---|
| Foundry | 225 | Concrete unit/integration tests (via `forge test --via-ir`) |
| Halmos | 7 | Symbolic proofs (ALL inputs, z3) — via `./test-halmos.sh` (FigaroCore). The StagedMerkleAirdrop 4-property pass was retired 2026-05; `RpgfMinter` does not yet carry a Halmos harness. |
| Certora | 23/23 sub-rules across 3 specs | SMT formal verification (cloud) — FigaroCore (9), AttestationCoordinator (7), FigToken (7). Via `./test-certora.sh`. The StagedMerkleAirdrop 4-rule spec was retired 2026-05; `RpgfMinter` does not yet carry a Certora spec. |
| TLA+ | 15 invariants across 2 models | FigaroCore 7 invariants / 6,087,113 distinct states; FigToken 8 invariants / 160,844 distinct states. Both via `./test-tla.sh`. |
| Echidna | 7 | Property-based fuzzing (committed harness; per-run call count varies by wall time) |
| Slither | — | Static analysis (0 findings) |
| Vitest (SDK) | 166 | TypeScript SDK tests |
| Vitest (frontend) | 560+ | Frontend unit tests |
| Rust | 55 | Kernel + sequencer tests |
| Playwright | 169 | E2E browser tests |
| **Total** | **1,230+** | |

## Pre-Mainnet Deployment Checklist

### Solidity Surface

- [ ] Freeze `src/`, `src/fig/`, and deployment scripts before external audit
- [ ] Confirm `FigaroBatchVerifier.verifier` is the real SP1 verifier gateway (not MockSP1Verifier)
- [ ] Confirm `MockSP1Verifier` is not deployed on target chain
- [ ] Confirm all settlement tokens are non-rebasing, non-fee-on-transfer

### FigToken Deployment

- [ ] `FigToken.deployer` == expected deployer EOA
- [ ] All registered minters are intended emission/vesting contracts
- [ ] `FigToken.deployerMintRenounced` == `true` after minter setup
- [ ] `FigToken.totalSupply()` == expected genesis allocation

### AttestationCoordinator

- [ ] `AttestationCoordinator.core` == deployed FigaroCore address

### FigaroBatchVerifier

- [ ] `FigaroBatchVerifier.verifier` == **real** SP1 verifier gateway
- [ ] `FigaroBatchVerifier.stateRoot` == expected genesis root
- [ ] `FigaroBatchVerifier.programVKey` == correct program verification key

### External Audit

- [ ] Engage external firm (Trail of Bits, OpenZeppelin, Spearbit, or equivalent)
- [ ] Hand over frozen Solidity surface and this doc set
- [ ] Resolve all findings or explicitly accept non-critical findings in writing
- [ ] Record final audit outcome in this file

## Release Recommendation

The V5 Solidity surface has been verified through six independent methods
covering concrete testing, symbolic execution, SMT formal verification, model
checking, fuzzing, and static analysis. Two AI audit passes (2026-04-16 and
2026-04-20) found all prior findings resolved and no new actionable findings.

Before mainnet deployment: freeze the Solidity surface and complete a final
external audit pass. For testnet (Sepolia) deployment, the current internal
verification posture is sufficient.

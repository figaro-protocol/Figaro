# Figaro Protocol — AI Security Audit Report

**Date**: 2026-04-20
**Auditor**: Claude Sonnet 4.6 (Anthropic), interactive audit with design-challenge verification
**Scope (at audit time)**: 10 production contracts in `src/`, Solidity 0.8.26, Foundry

> **Post-audit amendment (2026-04-21)**: This audit describes the pre-amendment
> Solidity surface. After this audit, the following changes were applied and
> are NOT reflected in the sections below:
> - FIG allocation restructured to 10% founder / 30% DAO / 60% staged airdrop (yr 2/5/9).
> - `MerkleAirdrop.sol` and `TrancheVesting.sol` deleted; `StagedMerkleAirdrop.sol` added.
> - `figToken` field (INFO-2 in this audit) removed from `FigaroBatchVerifier.sol`.
> - `DOMAIN_SEPARATOR()` getter added to `FigaroCore.sol`.
> - `totalRegisteredCap` sum-enforcement added to `FigToken.sol`.
> - Test suite: 14 suites / 225 tests (Foundry). Halmos: 7/7 via `./test-halmos.sh`.
>
> Current state is described in `AUDIT_REPORT.md`. References to `MerkleAirdrop`,
> `TrancheVesting`, `figToken`, or the prior 252-test count below are historical.

> **Post-audit amendment (2026-04-23) — Phase-4a/4b agreement binding**:
> Further changes landed since the prior amendment. They are NOT reflected below:
> - `ISchemaValidator` interface added; 10 schema validator contracts (handoff, geo,
>   fulfilment, ghg-disclosure, commerce, ghg-measurement, delivery-lifecycle,
>   proximity, merchant-process, courier-process) wired via first-write-wins
>   `setValidator`. GHG measurement carries runtime grams CO2e as
>   `abi.encode(uint256 grams)`; the other nine are pre-measurement schemas.
> - `AttestationCoordinator.attestAsSeller/Buyer/ViaResolver` rewritten to take
>   the full `Commitment(s)`, a `bytes sectionData`, and a `bytes32[] proof`;
>   each attestation carries a merkle inclusion proof verified against the target
>   order's signed `agreementHash` (OpenZeppelin sorted-pair).
> - Five Category-2 validators additionally enforce `keccak256(content) ==
>   keccak256(sectionData)` — byte-equality between committed clause and runtime
>   declaration, closing the drift where runtime attestations could contradict
>   the signed contract.
> - `FigaroTopologyV1Validator.sol` deleted — topology is manifest-only.
> - Production surface grew from 10 → 20 concrete contracts (10 original + 10
>   schema validators, including `figaro-ghg-measurement-v1` for runtime grams
>   CO2e) plus the new `ISchemaValidator` interface.
> - Certora AC spec re-verified 8/8 sub-rules against the new dispatch shape.

> **2026-04-26 audit pass — Phase-4a/4b surface + small-surface deltas**:
> A second AI audit pass was run against the post-amendment surface (10 schema
> validators + ISchemaValidator + AttestationCoordinator rewrite + StagedMerkleAirdrop
> + FigToken `totalRegisteredCap` sum-enforcement + FigaroBatchVerifier 3-arg
> constructor + FigaroCore `DOMAIN_SEPARATOR()` getter). See the
> "## 2026-04-26 Audit Pass" section appended at the end of this file.
> Net new findings: **1 Medium (M-1: `setValidator` front-running for
> non-bootstrap schemas), 3 Informational**. Prior INFO-1 and INFO-2 closed.

**Disclaimer**: This is an AI-generated audit. It complements but does not
replace a professional audit from a firm like Trail of Bits, OpenZeppelin, or
Spearbit. AI audits excel at systematic pattern matching and exhaustive
checklist coverage. Professional auditors bring adversarial creativity,
economic modeling, and legal accountability.

---

## Methodology

Two-phase approach:

| Phase | Focus |
|---|---|
| 1 | Full source read of all 10 production contracts. Traditional vulnerability classes (reentrancy, access control, integer overflow, signature handling, ERC-20 edge cases, assembly safety, hash collision). Economic invariants (bond math, token conservation, settlement completeness). Cross-contract trust boundaries. |
| 2 | Design-philosophy challenge of every finding. Each finding was re-examined against the protocol's stateless, event-sourced, no-escape-hatch architecture. Findings that imposed web2 lifecycle or role-separation patterns were withdrawn. |

The challenge phase is deliberate: this codebase has moved coordination and
semantic logic off-chain. Applying standard web2 access-control or
lifecycle-state patterns to a stateless, signature-enforced kernel produces
false positives. Each finding must survive the question: does the code need
to enforce this, or does the bilateral signature requirement already enforce it?

---

## Contract Inventory

| Contract | Lines | Purpose |
|---|---|---|
| `FigaroCore.sol` | 297 | Protocol kernel — commit and resolve |
| `CommitmentTypes.sol` | 55 | EIP-712 struct and hash library |
| `AttestationCoordinator.sol` | 204 | Zero-storage role-gated attestation |
| `SchemaRegistry.sol` | 87 | Permissionless event-only schema anchoring |
| `IRoleResolver.sol` | 18 | Role-authorization interface |
| `DutchAuction.sol` | 199 | Descending-price coordination primitive |
| `OperatorRegistry.sol` | 162 | Self-declaration with reclaimable deposit |
| `FigToken.sol` | 74 | ERC-20 + EIP-2612, 1B cap, minter registry |
| `MerkleAirdrop.sol` | 37 | Merkle-claim airdrop, one-shot per address |
| `TrancheVesting.sol` | 49 | Time-locked beneficiary vesting |
| `FigaroBatchVerifier.sol` | 533 | SP1-proved batch verification |

---

## Hash Collision Analysis

Examined all three hash layers in FigaroCore:

**Layer 1 — structHash**
`keccak256(abi.encode(COMMITMENT_TYPEHASH, all fields))` — uses `abi.encode`,
not `encodePacked`. Every field is padded to 32 bytes. No length ambiguity
between any field combination.

**Layer 2 — processId (root orders)**
`keccak256("\x19\x01" || domainSeparator || structHash)` where domainSeparator
includes `chainId` and `verifyingContract`. processId is chain-and-contract-bound.
Cross-chain and cross-deployment replay is structurally impossible.

**Layer 3 — orderHash**
`keccak256(abi.encodePacked(processId, structHash))` — both inputs are `bytes32`,
always exactly 64 bytes total. No length ambiguity. Collision requires a direct
keccak256 collision — computationally infeasible.

**prevrandao**: Confirmed absent from all source and test files. The `salt`
field in the `Commitment` struct is the correct replacement. This is an
improvement: under PoS, validators know prevrandao up to one epoch ahead,
making chain-sourced entropy subtly manipulable. A party-chosen salt with
bilateral EIP-712 signatures is cleaner and sufficient.

**Verdict**: No hash collision risk. All three layers are sound.

---

## Findings

### Initial Findings — Raised and Withdrawn After Design Challenge

**H-1 — Process re-extension after resolution (WITHDRAWN)**

Initial concern: after `resolveProcess()` sets `activeOrderCount = 0`, the
`ProcessState` is not deleted, so new sub-orders can be committed to the same
processId.

Withdrawn because: committing any sub-order requires valid EIP-712 signatures
from both buyer and seller. Neither party can unilaterally reopen a process.
If both parties sign a new sub-order for a resolved process, that is a
bilateral agreement — the intended design for multi-round processes. Adding a
`finalized` flag would impose a web2 lifecycle state machine on a
signature-enforced kernel.

**H-2 — Cross-order seller attestation (WITHDRAWN)**

Initial concern: `attestAsSeller` allows a seller of any order in a process to
attest against any other order in the same process, even if they are not the
seller of the target order.

Withdrawn because: the `Attestation` event records `attester = msg.sender`
truthfully. There is no identity forgery. Semantic interpretation — whether a
given attester has authority over a given order — belongs to off-chain indexers,
consistent with the event-sourced design. Enforcing the tighter restriction
on-chain would require per-order seller storage, re-introducing web2 state
that the design explicitly avoids.

**M-2 — DutchAuction creator self-claim (WITHDRAWN)**

Initial concern: `claim()` does not prevent the auction creator from claiming
their own auction.

Withdrawn because: DutchAuction holds no funds. The clearing price is a
coordination number, not a payment. Preventing self-claiming is a business
rule that belongs off-chain. No financial harm is possible.

**L-1 — MerkleAirdrop single-hash leaves (WITHDRAWN)**

Initial concern: single-hashed leaves are vulnerable to second-preimage attack.

Withdrawn because: leaf preimages are 52 bytes (20-byte address + 32-byte
amount), while OZ MerkleProof internal node preimages are 64 bytes (two
32-byte hashes). The different preimage lengths make leaf/node conflation
structurally impossible, not merely computationally hard.

**L-5 — No-op batch accepted by FigaroBatchVerifier (WITHDRAWN)**

Initial concern: a valid proof could advance state to the same root (no-op).

Withdrawn because: valid state transitions are defined by the ZK program, not
by on-chain checks. Adding `newRoot != prevRoot` on-chain duplicates a
constraint that belongs in the program. If the program never produces a
same-root transition, this cannot happen with a valid proof.

**L-6 — SchemaRegistry version 0 accepted (WITHDRAWN)**

Initial concern: `registerSchema(id, 0, uriHash)` succeeds.

Withdrawn because: whether version=0 is meaningful is a semantic concern for
off-chain indexers. The registry's only enforcement role is the dedup guard.
Adding a version-zero check is a business rule that belongs off-chain.

---

### Surviving Findings — Informational Only

No code changes required for any of the following. Noted for completeness.

**INFO-1 — FigToken: Minter cap registration does not sum all registered caps**

`registerMinter` checks `totalSupply() + cap > MAX_SUPPLY` at registration
time, not against the sum of all registered minter caps. Two minters could be
registered with combined caps exceeding MAX_SUPPLY if no minting has occurred.
The per-mint check `totalSupply() + amount > MAX_SUPPLY` is the real
enforcement and prevents actual over-minting. Cap semantics are advisory.

**INFO-2 — FigaroBatchVerifier: `figToken` field is dead (RESOLVED)**

The `address public immutable figToken` field was a remnant of the removed
emission logic. It has since been deleted from `FigaroBatchVerifier.sol`, the
constructor reduced to three arguments, and all call sites updated. No
security impact either before or after removal; this entry is retained as
audit history.

**INFO-3 — FigaroBatchVerifier: Batch DoS via approval revocation**

Any user who revokes token approval before `settleBatch` executes reverts the
entire batch. Already documented in the contract with a `@dev WARNING` comment.
Mitigation is operational: sequencer verifies approvals immediately before
proof submission. No on-chain fix is appropriate (would require state).

**INFO-4 — FigaroCore: `_pullExact` panic on extreme downward rebase**

If a rebasing token decreases the contract balance during `safeTransferFrom`
by more than the transferred amount (extremely unlikely in a single call),
Solidity 0.8 checked arithmetic reverts with a panic rather than the custom
`FeeOnTransferDetected` error. Behavior (revert) is correct; error signal
differs. Rebasing tokens are already documented as incompatible.

**INFO-5 — OperatorRegistry: `InsufficientDeposit` fires on excess**

The error name implies only insufficient deposit, but it fires for
`msg.value != registrationDeposit` (including excess). Naming inconsistency
only; NatSpec correctly documents the exact-match requirement.

**INFO-6 — FigToken: Deployer can self-register as minter**

Before calling `renounceDeployerMint()`, the deployer can call
`registerMinter(deployer, cap)` and mint freely. This is an explicit
trusted-setup assumption. No code change can protect against a malicious
deployer; it is a deployment governance concern.

---

## Trust Graph (current)

```
┌────────────────────────────────────────────────────────────────┐
│                    TRUST ROOT: FigaroCore                       │
│  No external project contract writes to it                      │
│  Entry: commit() + resolveProcess() via user signatures         │
└───────────────┬────────────────────────────────────────────────┘
                │ reads orderStatus, orderProcessId, processes
                ▼
 ┌─────────────────────────┐
 │  AttestationCoordinator  │
 │  reads: orderStatus,     │
 │   orderProcessId,        │
 │   processes              │
 │  calls: IRoleResolver    │
 │   (untrusted, view only) │
 └─────────────────────────┘

 ┌──────────────────────────┐        ┌──────────────┐
 │  FigaroBatchVerifier      │        │  FigToken     │
 │  reads: ISP1Verifier      │        │  minters:     │
 │  reads/writes: ERC-20     │        │   (registered │
 │  emits: protocol events   │        │    contracts) │
 └──────────┬────────────────┘        └──────┬────────┘
            │ verifies                        │ mint()
            ▼                                 ▼
 ┌──────────────────────┐        ┌─────────────────────────┐
 │  ISP1Verifier        │        │  MerkleAirdrop           │
 │  (real or mock)      │        │  TrancheVesting          │
 └──────────────────────┘        └─────────────────────────┘

 Standalone (no cross-contract reads):
   SchemaRegistry, DutchAuction, OperatorRegistry
```

---

## Assessment

**FigaroCore is exceptionally well-secured.** Six independent verification
methods (Foundry 252 tests, Echidna 7 properties, Halmos 7 symbolic proofs,
TLA+ 15 invariants across 2 models (FigaroCore 6M+ states, FigToken 160k states), Certora 27 CVL rules across 4 specs, Slither 0 findings).
Zero critical or high findings on the kernel. The six core protocol properties
(asymmetric bonding, progressive collateralization, buyer dominance, atomic
resolution, immutable evidence, no escape hatches) are verifiably enforced.

**Mechanism modules are clean.** DutchAuction, SchemaRegistry, and
OperatorRegistry have minimal attack surface, no financial intermediation
(DutchAuction), and correct CEI patterns where funds are held (OperatorRegistry
ETH deposits).

**FIG token layer is sound.** FigToken's 1B hard cap is enforced on every mint
path. MerkleAirdrop and TrancheVesting are simple, minimal contracts with
one-shot claim guards and no privileged roles.

**FigaroBatchVerifier inherits ZK trust assumptions.** Its security depends on
the correctness of the SP1 program and the integrity of the verifier gateway.
On-chain, it correctly validates state root continuity, chain ID, verifying
contract, and all auxiliary data hashes before executing any transfers.

**This AI audit found zero new actionable findings.** The protocol's
stateless, bilateral-signature-enforced design is internally consistent. The
patterns that initially appeared as vulnerabilities were confirmed to be
correct design decisions once evaluated against the protocol's architecture.

---

## 2026-04-26 Audit Pass — Phase-4a/4b Surface + Small-Surface Deltas

**Date**: 2026-04-26
**Auditor**: Claude Opus 4.7 (1M context), interactive audit dispatched as 5 parallel surface-scoped sub-audits, kernel-discipline framing maintained throughout.
**Scope**: Production contracts added or materially modified since the 2026-04-20 audit. Pre-amendment 10-contract surface findings are unchanged from above.

### Surfaces audited

| Surface | Files | What was new |
|---|---|---|
| Schema validator interface | `src/ISchemaValidator.sol` | New file — 4-arg `validate` signature with `bytes sectionData` + `bytes content` |
| Category-2 validators (byte-equality enforced) | `src/schemaValidators/FigaroHandoffV1Validator.sol`, `FigaroGeoV1Validator.sol`, `FigaroFulfilmentV1Validator.sol`, `FigaroGHGDisclosureV1Validator.sol`, `FigaroCommerceV1Validator.sol` | New per-schema validators; enforce `keccak256(content) == keccak256(sectionData)` before ABI decode |
| Category-1 validators (runtime-only) | `src/schemaValidators/FigaroGHGMeasurementV1Validator.sol`, `FigaroDeliveryLifecycleV1Validator.sol`, `FigaroProximityV1Validator.sol`, `FigaroMerchantProcessV1Validator.sol`, `FigaroCourierProcessV1Validator.sol` | New per-schema validators; runtime content fresh per attestation, no byte-equality |
| AttestationCoordinator rewrite | `src/AttestationCoordinator.sol` | Phase-4a/4b: `Commitment(s)` + `bytes sectionData` + `bytes32[] proof` + `bytes content`; mandatory validator gate; mandatory merkle inclusion proof against `target.agreementHash`; permissionless first-write-wins `setValidator` |
| StagedMerkleAirdrop | `src/fig/StagedMerkleAirdrop.sol` | Replaces deleted `MerkleAirdrop.sol` + `TrancheVesting.sol`; three immutable merkle roots + three immutable unlock timestamps; one-shot per (stage, address) |
| FigToken cap enforcement | `src/fig/FigToken.sol` | New `totalRegisteredCap` sum-enforcement at registration time (closes prior INFO-1) |
| BatchVerifier constructor | `src/FigaroBatchVerifier.sol` | `figToken` field removed; constructor now 3-arg (closes prior INFO-2) |
| FigaroCore EIP-712 getter | `src/FigaroCore.sol` | `DOMAIN_SEPARATOR()` getter added; consumed by AttestationCoordinator's `_computeDigest` for root-commitment processId derivation |

### Methodology

Five parallel surface-scoped sub-audits, each instructed to:
1. Read `docs/v5/DESIGN_DECISIONS.md` first and skip findings matching any of the 12 false-positive patterns
2. Apply the standard Web3 checklist (reentrancy, access control, integer overflow, signature handling, ERC20 edge cases, hash collision, EIP-712 binding, assembly safety, cross-contract trust)
3. Annotate every finding with the design-challenge check that justified raising or withdrawing it
4. Cite file:line for every piece of evidence

The synthesis pass reconfirmed the highest-impact findings against source (Deploy.s.sol bootstrap pattern at `script/Deploy.s.sol:181-219`; BatchVerifier constructor at `src/FigaroBatchVerifier.sol:148-154`) before promotion.

### Findings

#### M-1 — `setValidator` front-running risk for non-bootstrap schemas

**Severity**: Medium

**Location**: `src/AttestationCoordinator.sol:117-124`

**Evidence**:
```solidity
function setValidator(bytes32 schemaId, address validator) external {
    if (validator == address(0)) revert ZeroValidator();
    if (schemaValidator[schemaId] != address(0)) revert ValidatorAlreadySet(schemaId);
    bytes32 boundId = ISchemaValidator(validator).schemaId();
    if (boundId != schemaId) revert InvalidValidatorBinding(schemaId, boundId);
    schemaValidator[schemaId] = validator;
    emit ValidatorSet(schemaId, validator);
}
```

**Description**: `setValidator` is permissionless first-write-wins. Any address can bind a validator to any schemaId before the legitimate operator. Once bound, the binding is immutable (`ValidatorAlreadySet` blocks overwrite). The `InvalidValidatorBinding` check (validator's `schemaId()` self-attestation) prevents binding under a wrong schemaId — but a validator that returns the correct schemaId AND has malicious `validate()` logic CAN front-run a legitimate validator and capture the schemaId permanently.

For the 10 reference figaro-* schemas this is mitigated: `script/Deploy.s.sol:181-219` deploys all 10 validators and binds them in a single transaction (`_deployAndRegisterValidators` helper). At genesis, no front-running window exists.

For schemas registered post-deploy (e.g., third-party schemas via permissionless `SchemaRegistry.registerSchema`), the deployer of the validator must atomically register the schema and bind the validator in one transaction. A schema registered first, with its validator deployed in a separate tx, exposes the binding window.

**Recommendation**:
1. Document the atomic-binding pattern as required for any new schema (CLAUDE.md "Adding a new schema" checklist already exists at line 393; add an explicit step "register schema and bind validator atomically — never in separate transactions"). Optionally add as `DESIGN_DECISIONS.md` entry #13 to make the deployment-discipline rationale explicit for external auditors.
2. Optional code change — add a `registerSchemaAndValidator(schemaId, version, uriHash, validator)` convenience method that performs both writes in one external call. Non-load-bearing on protocol invariants; removes the foot-gun entirely.

**Design-decision check**: Considered #4 (no admin) and #8 (permissionless schema registry). Neither false-positive applies. The first-write-wins pattern IS the no-admin mechanism — adding a permissioned binding gate would be a regression. The risk is at the deployment-discipline layer, not the protocol layer.

**Status (2026-04-26)**: Both recommendations **LANDED**.
- Recommendation (1): documented in `docs/v5/DESIGN_DECISIONS.md` #13 (full rationale + rejection of admin-based mitigations), `CLAUDE.md` "Third-party schema deployment — atomic register+bind required" subsection (after the schema checklist), and `.github/copilot-instructions.md` "Schema Validation Architecture" section (mirror note).
- Recommendation (2): `src/SchemaRegistrationHelper.sol` shipped as a stateless, no-admin composer. Atomically calls `SchemaRegistry.registerSchema` + `AttestationCoordinator.setValidator` in one transaction. Helper-contract design (rather than AC method) preserves the kernel-discipline principle of keeping `SchemaRegistry` and `AttestationCoordinator` as independently-addressable primitives — the helper is opt-in syntactic sugar with no privilege over its targets. 16 Foundry tests cover happy path, every revert, atomicity, and registrar-identity behavior. Wired into both `script/Deploy.s.sol` and `script/DeployMainnet.s.sol`. SDK exports `SCHEMA_REGISTRATION_HELPER_ABI`. Closes M-1 entirely for any third-party schema author who uses the helper; the front-running window now exists only for authors who explicitly choose the two-call path (see DESIGN_DECISIONS.md #13 for the trade-off — registrar-identity vs. atomic-bind).

---

#### INFO-7 — `ISchemaValidator` interface does not enforce pure/view at compile time

**Location**: `src/ISchemaValidator.sol:18-19, 54`

**Description**: The interface declares `validate` as `external view` and documentation states validators MUST be pure/view. Solidity does not enforce interface mutability across the call boundary at compile time on the implementation side — a deployed validator could in principle be non-view if it implemented the function differently than the interface declared.

**Mitigation in place**: `AttestationCoordinator._validateContent` (`src/AttestationCoordinator.sol:229`) calls `ISchemaValidator(v).validate(...)`. Solidity's compile-time view-function dispatch generates a `STATICCALL` at the dispatch site; the EVM reverts on any state write attempted by the callee, regardless of the validator's source. State-modifying reentrancy is therefore impossible.

All 10 production validators are deployed with `external pure override` and contain no storage or external calls.

**Recommendation**: Accept as design. Optionally add a comment in `ISchemaValidator.sol` noting that the `view` declaration produces a `STATICCALL` at the dispatch site, providing runtime protection independent of the validator's source.

**Design-decision check**: Documentation/clarity note, not a vulnerability.

---

#### INFO-8 — `FigaroGHGMeasurementV1Validator` accepts unbounded `uint256` grams

**Location**: `src/schemaValidators/FigaroGHGMeasurementV1Validator.sol:42`

**Description**: The validator decodes `abi.decode(content, (uint256))` and accepts any value, including `type(uint256).max`. There is no upper bound check.

**Why this is correct**: Category-1 validators are syntactic gates. Semantic bounds (what constitutes a plausible grams CO2e value) are downstream concerns for indexers, UIs, and accounting consumers. The kernel-discipline rule "validators are syntactic, semantics are off-chain" applies. Imposing a ceiling on-chain would lock the protocol to a presumed-reasonable range that may not survive future use cases.

**Recommendation**: No on-chain change. Frontend / indexer code that surfaces grams should validate semantic plausibility against application-domain limits.

**Design-decision check**: Aligns with #8 (permissionless schema registry — validators are syntactic). Not a withdrawal — the unbounded acceptance is the intended Category-1 behavior.

---

#### INFO-9 — `FigaroBatchVerifier` constructor does not zero-check `_initialRoot`

**Location**: `src/FigaroBatchVerifier.sol:148-154`

**Description**: The constructor validates `_verifier != address(0)` and `_verifier.code.length > 0`, but does not check `_initialRoot != bytes32(0)`. A genesis root of zero is technically valid bytes but semantically meaningless.

**Why this is acceptable**: An incorrect genesis root is self-correcting at first batch settlement — `pv.prevRoot != stateRoot` triggers `StateRootMismatch` revert (`src/FigaroBatchVerifier.sol:188`). The contract cannot enter an exploitable state. Both `script/Deploy.s.sol:133` and `script/DeployMainnet.s.sol` provide non-zero genesis roots derived from the kernel state (`KernelState::new().compute_root()`).

**Recommendation**: Optional — add `if (_initialRoot == bytes32(0)) revert ZeroInitialRoot();` for fail-fast deployment hygiene. Not load-bearing.

**Design-decision check**: Deployment-script concern, not a kernel-pattern question.

---

### Withdrawn after design-challenge review (false-positive matches)

| Initial concern | Surface | DESIGN_DECISIONS match | Withdrawal reason |
|---|---|---|---|
| Cross-order seller attestation | `AttestationCoordinator.attestAsSeller` | #2 | Attester recorded truthfully; semantic concern is off-chain |
| Post-resolution attestations permitted | `AttestationCoordinator._requireKnownCommitment` | #7 | Lifecycle events post-settlement are intentional |
| No admin / no upgrade across all new contracts | All new contracts | #4 | No admin = no escape hatch, by design |
| Permissionless schema validator binding | `AttestationCoordinator.setValidator` | #4, #8 | First-write-wins is the no-admin mechanism. M-1 above is the deployment-discipline footnote, not a withdrawal of the principle |
| Single-hash leaves in StagedMerkleAirdrop | `StagedMerkleAirdrop.claim` | Prior L-1 reasoning | Leaf preimage 52B (address + uint256), node preimage 64B (two bytes32) — structurally distinct, conflation impossible |
| Empty proof on single-leaf agreement | `AttestationCoordinator._validateContent` | Standard OZ MerkleProof behavior | Correctly accepts `proof == []` when `root == leaf`; tested at `test/AttestationCoordinatorTest.t.sol:227-253` |

### Status of prior informational findings

| Prior finding | Status | Closed by |
|---|---|---|
| INFO-1 (FigToken: cap registration not summed) | **CLOSED** | `totalRegisteredCap` sum-enforcement at `src/fig/FigToken.sol:51`; Certora `totalRegisteredCapWithinMaxSupply` rule |
| INFO-2 (FigaroBatchVerifier: dead `figToken` field) | **CLOSED** | Field removed; constructor now 3-arg at `src/FigaroBatchVerifier.sol:148` |
| INFO-3 (BatchVerifier DoS via approval revocation) | **STILL APPLIES** | Operational mitigation only; documented in contract |
| INFO-4 (FigaroCore `_pullExact` panic on extreme rebase) | **STILL APPLIES** | Behavior (revert) is correct; error-signal naming differs |
| INFO-5 (OperatorRegistry `InsufficientDeposit` fires on excess) | **STILL APPLIES** | Naming inconsistency only |
| INFO-6 (FigToken: deployer can self-register before renounce) | **STILL APPLIES** | Trusted-setup assumption |

### Updated assessment

**The Phase-4a/4b surface is sound.** The validator + agreement-binding architecture introduces three hard gates (validator bound, inclusion proof, role authorization) that collectively prevent runtime attestations from contradicting the signed agreement. All schema validators are pure/view, ABI-decode safely, and bound first-write-wins under their hard-coded `schemaId()` constants. **(Note 2026-04-26 post-audit: the original `figaro-ghg-disclosure-v1` schema was split into 5 sister schemas — `figaro-ghg-protocol-v1`, `figaro-ghg-iso-14064-v1`, `figaro-ghg-pas-2050-v1`, `figaro-ghg-en-16258-v1`, `figaro-ghg-custom-v1` — one validator each, same audit profile applies. Validator count: 10 → 14 runtime + ISchemaValidator interface.)**

**StagedMerkleAirdrop is sound.** The single-contract replacement for MerkleAirdrop + TrancheVesting preserves all prior properties (one-shot guard, CEI mint pattern, OZ MerkleProof) and adds independent per-stage gating with three immutable roots + three immutable unlock timestamps. Four Halmos symbolic properties + three Certora CVL rules formalize the coverage.

**Net new actionable findings: 1 (M-1, Medium severity, deployment-discipline)**. M-1 should be addressed by either documenting the atomic-binding pattern in CLAUDE.md and DESIGN_DECISIONS.md, or by adding a `registerSchemaAndValidator` convenience method. Both options preserve protocol invariants; the latter eliminates the foot-gun entirely.

**No new critical or high-severity findings.** Two prior informational findings (INFO-1, INFO-2) are now closed.

# Figaro V5 — Verification Map (Theory → Code → Tests → TLA+ → UI)

Last updated: 2026-04-20

## 0) Purpose

This document ties every protocol property to its enforcement across five layers:

- **Theory** — the game-theoretic invariant (from THEORY.md / VISION.md)
- **Code** — what is actually enforced on-chain (Solidity)
- **Tests** — what is continuously regression-checked (Foundry, Echidna, SDK Vitest)
- **TLA+** — what is exhaustively model-checked (15 invariants across 2 models: FigaroCore 7 / 6M+ states, FigToken 8 / 160k states)
- **Halmos** — what is symbolically proved at the bytecode level (7 invariants, z3 solver)
- **Certora** — what is formally verified via SMT-based proving (state-machine rules)
- **UI** — where the feature is explained or rendered for users (pages, sections)

The V3 map (archived at `docs/archive/V3_VERIFICATION_MAP.md`) covered Theory → Code → Tests → TLA+ only. This V5 map adds the UI column to prevent feature presentation gaps — features that exist in code but are invisible to users.

---

## 1) Scope

### In-scope (this document)

- **Kernel**: `src/FigaroCore.sol` — 2 external functions, 3 mappings, no owner, no fee
- **Protocol extensions**: `AttestationCoordinator`, `SchemaRegistry`, `DutchAuction`, `OperatorRegistry`, `FigaroBatchVerifier`
- **FIG token ecosystem**: `FigToken`, `StagedMerkleAirdrop`
- **Formal model**: `formal/FigaroCore.tla`, `formal/MC.tla`, `formal/MC.cfg`
- **Tests**: 14 Foundry suites (225 tests), 7 Echidna properties (`EchidnaFuzzerV5.sol`), 12 SDK test files (166 tests)
- **Frontend**: All pages in `frontend/app/`, components, mechanism modules

### Explicitly out-of-scope

- Archived V3/V4 contracts (`archive-v3/`, `archive-v4/`)
- Frontend Vitest unit tests (84 files, 560 tests) — these test UI components, not protocol invariants
- Playwright E2E tests (38 specs) — these test UI rendering, not protocol properties
- Rust prover workspace (`prover/`) — 55 tests covering SP1 kernel parity and sequencer

---

## 2) Invariant IDs (stable references)

### Kernel invariants (V5)

- `K-1` **Asymmetric bonding**: buyer bond = $2 \times payment$; seller bond = $2 \times cumulativeValue$
- `K-2` **Buyer dominance**: only root buyer can trigger `resolveProcess`
- `K-3` **Atomic resolution**: must resolve all active orders (anti-cherry-picking)
- `K-4` **No escape hatches**: no timeout, no admin exit, no unilateral withdrawal from Active
- `K-5` **Progressive collateralization**: monotonic accumulator ($cumulativeValue$ only increases)
- `K-6` **Direct settlement**: no internal ledger, no withdrawal step — ERC-20 transfer at resolution
- `K-7` **Single currency binding**: per-process immutable token
- `K-8` **Dual-signed commitment**: EIP-712 typed data, both parties sign off-chain
- `K-9` **Content-addressed order IDs**: `orderHash = keccak256(EIP-712 digest)`, not auto-increment

### Accounting invariants (V5)

- `A-1` **Token conservation**: sum of all wallets + contract balance = initial total supply
- `A-2` **Contract solvency**: contract balance ≥ 0 (never promises more than held)
- `A-3` **Wallet non-negative**: no participant goes below zero
- `A-4` **Cumulative integrity**: per-process $cumulativeValue = \sum(order.payment)$
- `A-5` **Active count**: per-process $activeCount = count(committed\ orders)$
- `A-6` **Resolution always possible**: contract can always pay out every active process
- `A-7` **Fee-on-transfer rejection**: `_pullExact` reverts if received ≠ amount

### Extension invariants

- `E-1` **Attestation role gating**: only verified role-holder (buyer/seller/resolver) can attest
- `E-2` **Schema immutability**: registered schemas cannot be overwritten
- `E-3` **Auction price monotonicity**: Dutch auction price only decreases over time
- `E-4` **Operator deposit lock**: withdrawal only after deactivation + lock period
- `E-5` **Batch state root continuity**: each batch must chain from previous state root
- `E-6` **FIG supply cap**: total minted ≤ 1,000,000,000 FIG (enforced on every mint path)
- `E-7` **StagedMerkleAirdrop per-stage one-shot claim**: each address can claim at most once per stage (0/1/2)
- `E-8` **StagedMerkleAirdrop Merkle inclusion**: only addresses included in the stage's immutable merkle root can claim from that stage
- `E-9` **StagedMerkleAirdrop per-stage unlock timestamp**: a stage can only be claimed after its immutable `unlockTime` (yr 2 / yr 5 / yr 9)

---

## 3) Kernel invariants → enforcement map

| ID | Statement | Code enforcement | Tests | TLA+ | Echidna | UI presentation |
|---|---|---|---|---|---|---|
| K-1 | Buyer bond = $2 \times payment$; seller bond = $2 \times cumulativeValue$ | `_pullExact(token, buyer, payment * 2)` and `_pullExact(token, seller, cumVal * 2)` in `commit()` | `FigaroCoreTest`: 21 tests covering bond amounts; `ParityVectors`: EIP-712 ↔ Solidity parity | `BondFormulaCorrectV3` — verified across 6M+ states | `echidna_solvency` — core holds ≥ sum of active bonds | `/research` → Paper A (mechanism); `/local-commerce` → Why deposits work; `/sovereign-commerce` → The visibility move; `/builders` → Security boundary |
| K-2 | Only root buyer can call `resolveProcess` | `if (msg.sender != ps.rootBuyer) revert NotProcessBuyer()` in `resolveProcess()` | `FigaroCoreTest`: buyer-only paths; `FigaroCoreRevertBranchTest`: 16 revert tests | `ResolveProcess` constrains resolver to root buyer | `echidna_buyer_dominance` — non-buyer resolve always fails | `/research` → Paper A; `/sovereign-commerce`; `/builders` → Security boundary |
| K-3 | Must resolve all active orders (anti-cherry-picking) | `if (commitments.length != ps.activeOrderCount) revert IncompleteOrderList()` + per-order status check | `FigaroCoreTest`: multi-order arrays; `FigaroCoreRevertBranchTest`: incomplete list reverts | `ResolveProcess` uses `ActiveOrdersInProcess` + count check | `echidna_atomic_resolution` — incomplete lists always fail | `/research` → Paper A (atomic resolution); `/builders` → Enforcement, in three layers |
| K-4 | No timeout, no admin exit from Active state | No timeout action exists; only `resolveProcess` transitions Active→Resolved; no owner, no admin functions | `FigaroCoreRevertBranchTest`: no alternate exit paths | Model has no timeout action; only Committed→Resolved via buyer | `echidna_state_monotonicity` — status only moves forward (0→1→2) | `/research` → Paper A (escape-hatch impossibility); `/sovereign-commerce`; `/admin` → "no owner, no protocol fee" |
| K-5 | Monotonic accumulator ($cumulativeValue$ only increases) | `uint256 actualCumulative = ps.cumulativeValue + c.payment` + `CumulativeValueMismatch` revert | `FigaroCoreTest`: accumulator tests | `CumulativeIntegrity` — $cumulativeValue = \sum(payment)$ | `echidna_cumulative_accounting` — accumulator = sum(payment) | `/research` → Paper A (progressive collateralization); `/builders` → Three levels |
| K-6 | No internal ledger — direct ERC-20 transfer at resolution | `currency.safeTransfer(seller, 2*cumVal + payment)` + `currency.safeTransfer(buyer, payment)` | `FigaroCoreTest`: payout assertions; `FigaroCoreEventEmissionTest`: OrderResolved events | Not modeled (TLA+ abstracts transfer mechanics; wallets model is sufficient) | — | `/local-commerce` → Step 4: "Settlement returns your bond and pays you directly" |
| K-7 | Per-process immutable token binding | `if (c.currency != address(ps.currency)) revert CurrencyMismatch()` on sub-orders | `FigaroCoreRevertBranchTest`: currency mismatch revert | Implicitly via single-currency model | — | `/builders` → Composability → Single-Currency Binding |
| K-8 | Both parties sign off-chain via EIP-712 typed data | `ECDSA.recover(digest, buyerSig)` + `ECDSA.recover(digest, sellerSig)` checks in `commit()` | `FigaroCoreTest`: signature verification; `ParityVectors`: EIP-712 parity | Not modeled (TLA+ abstracts signature mechanics) | — | `/sign` → commitment signing UI; `/sovereign-commerce` → "Both parties agree on terms off-chain and sign EIP-712" |
| K-9 | `orderHash = keccak256(EIP-712 digest)`, content-addressed | `bytes32 orderHash = keccak256(abi.encode(digest))` + `if (orderStatus[orderHash] != 0) revert OrderAlreadyExists()` | `FigaroCoreTest`: duplicate guard; `ParityVectors`: hash parity | Not directly modeled (TLA+ uses sequential IDs) | — | `/builders` → Composability → Content-Addressed Order IDs |

---

## 4) Accounting invariants → enforcement map

| ID | Statement | Code enforcement | Tests | TLA+ | Echidna | UI presentation |
|---|---|---|---|---|---|---|
| A-1 | Sum of wallets + contract balance = initial total supply | Ledger is explicit in transfer flows (`_pullExact` in, `safeTransfer` out) | `FigaroCoreTest`: conservation assertions across lifecycle | `TokenConservation` — verified across 6M+ states | `echidna_token_conservation` — totalSupply constant | Not directly presented (infrastructure invariant) |
| A-2 | Contract balance ≥ 0 | Solidity `uint256` prevents negatives; explicit transfer-out bounded by holdings | `FigaroCoreTest`: solvency checked post-resolution | `ContractSolvency` — verified | `echidna_solvency` | Not directly presented |
| A-3 | No participant goes below zero | Solidity `uint256`; ERC-20 `safeTransfer` reverts on insufficient balance | `FigaroCoreRevertBranchTest`: insufficient balance reverts | `WalletNonNegative` — verified | — | Not directly presented |
| A-4 | Per-process $cumulativeValue = \sum(order.payment)$ | `actualCumulative = ps.cumulativeValue + c.payment` with mismatch revert | `FigaroCoreTest`: accumulator arithmetic | `CumulativeIntegrity` — verified | `echidna_cumulative_accounting` | `/builders` → Composability → Progressive Collateralization |
| A-5 | Per-process $activeCount = count(committed)$ | `ps.activeOrderCount++` on commit, `ps.activeOrderCount--` on resolve with count match | `FigaroCoreTest`: multi-order lifecycle | `ActiveCountCorrect` — verified | `echidna_active_count_consistent` | Not directly presented |
| A-6 | Contract can resolve any active process | Follows from A-1 + A-2 + bond calculation | `GasCeilingTest`: max orders under 30M gas | `ResolutionAlwaysPossible` — verified | — | Not directly presented |
| A-7 | Fee-on-transfer token rejection | `_pullExact`: `uint256 received = after - before; if (received != amount) revert ExactTransferFailed()` | `FigaroCoreRevertBranchTest`: fee-on-transfer token test (`MockERC20FeeOnTransfer`) | Not modeled (TLA+ abstracts ERC-20 mechanics) | — | `/builders` → Composability → Fee-on-Transfer Guard |

---

## 5) Extension invariants → enforcement map

| ID | Statement | Code enforcement | Tests | UI presentation |
|---|---|---|---|---|
| E-1 | Only verified role-holder can attest | `attestAsSeller`: verifies seller via commitment orderHash lookup; `attestAsBuyer`: verifies via ProcessState.rootBuyer; `attestViaResolver`: delegates to IRoleResolver | `AttestationCoordinatorTest`: 20 tests covering all 3 paths + cross-order same-process | `/legal` → Six evidentiary properties; `/local-commerce` → Attestation Coordinator; `/builders` → Schema validators in force |
| E-2 | Registered schemas cannot be overwritten | `registerSchema`: event-only anchoring (no storage to overwrite); dedup guard on re-registration | `SchemaRegistryTest`: 12 tests including dedup | `/builders` → Schema validators in force; `/local-commerce` → schema-typed events |
| E-3 | Dutch auction price only decreases over time | `getCurrentPrice`: linear decay from `maxPrice` to floor, time-based | `DutchAuctionTest`: 35 tests covering price decay, floor BPS, claim, cancel, expire | `/local-commerce` → Dutch auction description; `/verification` → Coordinator pattern (Dutch auction reference instance); `/builders` → Three levels |
| E-4 | Operator deposit lock — withdraw only after `registeredAt + lockPeriod` | `withdraw()`: requires `_registered[msg.sender]` + `block.timestamp >= registeredAt + lockPeriod`; clears the dedup guard so the same address can re-register with the lock restarting (web2-strip 2026-04-26 removed the deactivate gate) | `OperatorRegistryTest`: 15 tests covering register, deposit-bound match, dedup, withdraw flow, lock-period gate, re-registration restarts the lock | `/local-commerce` → Operator Registry; `/operators`; `/builders` → Operator identity |
| E-5 | Batch state root continuity | `settleBatch()`: `require(prevStateRoot == currentStateRoot)` + `currentStateRoot = newStateRoot` | `FigaroBatchVerifierTest`: 22 tests covering state root chain, re-emission | `/builders` → Batch verification (state root, SP1, net positions, event re-emission) |
| E-6 | FIG supply cap: $\leq$ 1B on every mint | `mint()`: `if (totalSupply() + amount > MAX_SUPPLY) revert SupplyCapExceeded()` + reentrancy guard | `FigToken.t.sol`: ~22 tests covering cap enforcement, multi-minter, renounce | `/fig` → FIG dashboard (supply display); `/fig/design` → Supply integrity (Paper D) |
| E-7 | StagedMerkleAirdrop: each address can claim at most once per stage | `claim(stageIndex, ...)`: reverts `AlreadyClaimed(stageIndex, msg.sender)` if `claimed[stageIndex][msg.sender]` is set; otherwise sets it before mint | `StagedMerkleAirdrop.t.sol`: `test_CannotClaimSameStageTwice`, `test_AliceCanClaimAllThreeStagesIndependently` | `/fig` → per-stage claim status |
| E-8 | StagedMerkleAirdrop: only stage-specific Merkle-root-included addresses can claim | `MerkleProof.verify(proof, stages[stageIndex].root, leaf)` enforced per-stage before any mint | `StagedMerkleAirdrop.t.sol`: `test_CannotClaimIfNotInTree`, `test_CannotClaimWithWrongProofForStage`, `test_CannotClaimWithAlteredAmount` | `/fig` → per-stage eligibility |
| E-9 | StagedMerkleAirdrop: per-stage unlock timestamp (immutable) | `claim(stageIndex, ...)`: reverts `NotUnlocked(stageIndex)` if `block.timestamp < stages[stageIndex].unlockTime` | `StagedMerkleAirdrop.t.sol`: `test_CannotClaimBeforeUnlock`, `test_CanClaimStage0AfterUnlock` | `/fig` → stage unlock dates |

---

## 6) Protocol features — UI presentation coverage

This section tracks features that are not protocol invariants but are significant protocol capabilities. The purpose is to ensure every implemented feature is visible to users somewhere.

| Feature | Code location | SDK coverage | UI explainer pages | UI functional surfaces | Gap? |
|---|---|---|---|---|---|
| **Handoff encryption (ECDH)** | `frontend/lib/handoff/` (13 files) | — | `/local-commerce` → Handoff Encryption | `HandoffKeyExchangeModule`, `HandoffTrackerModule`, `HandoffDetailsModule` | — |
| **Delivery attestation (4 modes)** | `frontend/lib/dispute/deliveryAttestation.ts` | `@figaro/core/extensions`: `geohashesMatch`, `haversineDistance` | `/local-commerce` → Proximity Proofs; `/builders` → attestation modes | `DeliveryAttestationPanel`, `/evidence-display` | — |
| **GHG disclosure** | `frontend/lib/mechanisms/useGHGDisclosure.ts` | `@figaro/core/extensions`: `encodeGramsRef`, `decodeGramsRef`, `buildProcessDisclosureSummary` | `/local-commerce` → GHG two-stage; `/builders` → Schema validators in force | `GHGAnchorPanel`, `GHGWorkflowPanel`, `DisclosureModule` | — |
| **DID:web identity** | `frontend/lib/mechanisms/useDidWeb.ts` | `@figaro/core/extensions`: `resolveDidWeb`, `didWebToUrl`, `didDocumentMatchesAddress`, `buildOperatorDidDocument` | `/builders` → Operator identity | `DidVerificationBadge` (component) | — |
| **Kleros dispute / evidence** | `frontend/lib/dispute/` (6 files) | `@figaro/core/extensions`: Kleros evidence envelope | `/builders` → Kleros integration | `/evidence-display` (full rendering for jurors) | — |
| **Agent SDK** | `sdk/` (3 subpath exports) | Self-referential (166 tests) | `/builders` → Agent SDK section | — | — |
| **Semantic derivation** | `frontend/lib/semantic/` (7 files) | — | `/builders` → How the runtime renders institutions | `/workbench` → SemanticProcessWorkspacePanel | — |
| **Institution assembly** | `frontend/lib/shared/institutionAssembly*.ts` (6 files) | — | `/builders` → Level 1 assembly config; `/local-commerce` → "Fork Local Commerce" | `/builders/assemblies`, `/builders/authoring`, `/builders/prototype` | — |
| **Agreement publication** | `frontend/lib/core/agreementStore.ts`, `agreementManifest.ts`, `agreementPublicationRegistry.server.ts` | — | `/builders` → Agreement publication | — | — |
| **Commerce checkout** | `frontend/lib/commerce/` (4 files) | — | — | `CartModule` (interactive) | — |
| **Batch sequencer** | `prover/` (Rust), `frontend` sequencer surface | SDK: `sequencer.test.ts`, `batch-e2e.test.ts` | `/builders` → Batch verification | `/console` → sequencer surface | — |
| **Process topology** | `frontend/lib/core/orderTopology.ts` | SDK: `reconstruct()`, `ProcessGraph` | `/workbench` → process graph | `OrderGraph`, `ProcessTopologyPanel`, `ProcessGraphModule` | — |
| **Bond calculator** | `frontend/components/core/BondCalculator.tsx` | SDK: `calculateBonds`, `calculateSettlement` | `/builders` → bond math formulas | `BondCalculator`, `BondApprovalPanel`, `OrderBondInfo` | — |
| **EIP-2612 permit** | `frontend/lib/core/permitExecution.ts` | — | `/builders` → Gasless token approvals | `PermitControl` component | — |
| **Single-currency binding** | `src/FigaroCore.sol` | — | `/builders` → Composability → Single-Currency Binding | — | — |
| **Fee-on-transfer rejection** | `src/FigaroCore.sol` `_pullExact()` | — | `/builders` → Composability → Fee-on-Transfer Guard | — | — |

---

## 7) TLA+ formal model — current posture

### Model file: `formal/FigaroCore.tla`

**Actions modeled (3):**
- `CommitRoot(buyer, seller, payment)` — create new process with root order
- `CommitSub(pid, seller, payment)` — extend existing process with sub-order
- `ResolveProcess(pid)` — atomically resolve all orders (buyer initiates)

**State variables (8):**
- `processes[pid]` → `{rootBuyer, cumulativeValue, activeCount}`
- `orderStatus[oid]` → `"Unknown"` | `"Committed"` | `"Resolved"`
- `orderRecords[oid]` → `{processId, buyer, seller, payment, cumulativeValue}`
- `processOrders[pid]` → sequence of order IDs
- `contractBalance`, `wallets[participant]`, `nextProcId`, `nextOrdId`

**Configuration (`MC.tla` + `MC.cfg`):**
- Buyers: 2, Sellers: 2–3, InitialBalance: 30, Payments: 1–3
- MaxProcesses: 2, MaxSubOrders: 2
- All 7 invariants enabled, deadlock checking disabled (bounded slots)

**Verification result (2026):**
- 7/7 invariants verified, exit code 0
- 6M+ states explored, all distinct states checked

### Invariants verified

| TLA+ invariant | Maps to | Status |
|---|---|---|
| `TypeOK` | A-3 (type well-formedness) | ✅ Verified |
| `TokenConservation` | A-1 (total supply constant) | ✅ Verified |
| `ContractSolvency` | A-2 (contract ≥ 0) | ✅ Verified |
| `WalletNonNegative` | A-3 (no negative accounts) | ✅ Verified |
| `CumulativeIntegrity` | A-4 ($cumVal = \sum payment$) | ✅ Verified |
| `ActiveCountCorrect` | A-5 ($activeCount = count(committed)$) | ✅ Verified |
| `ResolutionAlwaysPossible` | A-6 (solvency + atomic resolution guaranteed) | ✅ Verified |

---

## 8) Echidna fuzzing — current posture

### Harness: `src/echidna/EchidnaFuzzerV5.sol`

**Fuzzed actions:**
- `action_commitRoot`, `action_commitSub`, `action_commitRootAndSub`
- `action_resolve`, `action_resolve_wrong_sender`, `action_resolve_incomplete`
- `action_mint_buyer`, `action_mint_seller`

### Properties verified

| Echidna property | Maps to | What it catches |
|---|---|---|
| `echidna_solvency` | A-2, K-1 | Core holds ≥ sum of active bonds |
| `echidna_active_count_consistent` | A-5 | Stored count = actual committed count |
| `echidna_cumulative_accounting` | A-4, K-5 | Accumulator = sum(payment) |
| `echidna_state_monotonicity` | K-4 | Status only moves 0→1→2 |
| `echidna_token_conservation` | A-1 | wallets + contract = totalSupply |
| `echidna_buyer_dominance` | K-2 | Non-buyer resolve always fails |
| `echidna_atomic_resolution` | K-3 | Incomplete lists always fail |

---

## 9) Halmos symbolic testing — current posture

### Harness: `test/HalmosFigaroCore.t.sol`

Halmos performs symbolic execution of Solidity bytecode using SMT solvers
(z3/yices). Unlike Echidna (which searches for counterexamples via fuzzing),
Halmos proves properties hold for ALL possible inputs by constructing and
solving symbolic constraints.

This closes the verification gap between TLA+ (which verifies the abstract model)
and Foundry/Echidna (which test concrete/random scenarios). Halmos proves the
actual compiled bytecode satisfies the invariants.

### Properties proved (11/11)

**HalmosFigaroCore (7 properties)**

| Halmos check | Maps to | Solver | Paths |
|---|---|---|---|
| `check_tokenConservation_afterCommit` | A-1 | z3 | 20 |
| `check_contractSolvency_afterCommit` | A-2 | z3 | 18 |
| `check_correctBondAmounts` | K-1 | z3 | 19 |
| `check_resolutionPayouts` | K-6, A-1 | z3 | 25 |
| `check_orderStatusTransition` | K-4 | z3 | 19 |
| `check_buyerDominance_revert` | K-2 | z3 | 21 |
| `check_cumulativeValueMonotonic` | K-5, A-4 | z3 | 31 |

**HalmosStagedMerkleAirdrop (4 properties)**

| Halmos check | Maps to | Solver | Paths |
|---|---|---|---|
| `check_claimSetsFlag` | E-7 | z3 | 1 |
| `check_alreadyClaimedReverts` | E-7 | z3 | 1 |
| `check_notUnlockedReverts` | E-9 | z3 | 2 |
| `check_invalidStageReverts` | E-7 | z3 | 1 |

**Total: 11/11 proved, 0 failed. Typical wall time ~5 minutes.**

Per-property times vary significantly between runs (Z3's search path is
non-deterministic). `check_resolutionPayouts` — the only property that
exercises the full commit + resolve lifecycle symbolically (2 ECDSA recoveries,
multiple keccak256 instances, 4 ERC-20 transfers) — is especially sensitive
and will time out under the originally documented 5-minute per-assertion
ceiling when batched with the other 6 properties in one `halmos` process.
The committed wrapper splits it into its own invocation for reliability.

### How to run

```bash
./test-halmos.sh
```

Prerequisites (one-time):
```bash
brew install z3          # Z3 SMT solver (macOS)
pipx install halmos      # Halmos CLI (Python 3.12+)
```

The wrapper (`test-halmos.sh`) checks for both prerequisites, runs the 6
fast properties batched in one `halmos` process, then runs
`check_resolutionPayouts` in a second, fresh `halmos` process. Per-assertion
timeout defaults to 10 minutes; override with `HALMOS_SOLVER_TIMEOUT_MS`.

---

## 10) Certora formal verification — current posture

### Spec: `certora/FigaroCore.spec`

Certora uses cloud-based SMT proving to verify CVL (Certora Verification Language)
specifications against Solidity bytecode. The spec covers state-machine invariants
that complement the Halmos token-conservation proofs.

### Rules verified (27/27 across four specs — 2026-04-21)

**FigaroCore (9 sub-rules from 8 declared; Certora splits one parametric rule)**

| CVL rule | Maps to | Type |
|---|---|---|
| `orderStatusNeverDecreases` | K-4 | Parametric rule (all methods) |
| `orderStatusTransitionsAreValid` | K-4 | Parametric rule (0→1→2 only) |
| `commitIncreasesActiveCount` | A-5 | Parametric rule (count up or zero) |
| `onlyBuyerCanResolve` | K-2 | Parametric rule (non-buyer cannot zero count) |
| `noDoubleCommit` | K-9 | Parametric rule (status never regresses) |
| `cumulativeValueMonotonic` | K-5, A-4 | Parametric rule (all methods) |
| `rootBuyerImmutable` | K-2 | Parametric rule (all methods) |
| `currencyImmutable` | K-7 | Parametric rule (all methods) |

**AttestationCoordinator (7 declared rules — re-authored 2026-04-23 for the commitment-arg ABI + merkle-proof receipt binding; cloud re-dispatch pending)**

| CVL rule | Maps to | Type |
|---|---|---|
| `nonBuyerCannotAttestAsBuyer` | E-1 | Targeted revert rule — `msg.sender != c.buyer ⟹ revert` (c.buyer == rootBuyer by commit invariant) |
| `successfulBuyerAttestationImpliesBuyer` | E-1 | Contrapositive — successful call ⟹ `msg.sender == c.buyer` |
| `attestationCannotChangeOrderStatus` | K-4 | Parametric (`filtered { f -> f.contract == currentContract }`) |
| `attestationCannotChangeProcessState` | K-4, K-7 | Same filter |
| `noValidatorBlocksBuyerAttestation` | E-1 | Validator-mandatory: `schemaValidator[id] == 0` ⟹ `attestAsBuyer` reverts |
| `setValidatorIsFirstWriteWins` | E-1 | Storage-mapping immutability |
| `setValidatorPreservesOtherBindings` | E-1 | Storage isolation across schemas |

Dropped (subsumed by the new commitment-arg design): `unknownProcessRevertsAsBuyer` and `buyerAttestationEnforcesProcessBoundary` — the target commitment now carries its own processId and orderHash, so "wrong process" is no longer a distinct failure mode. `_requireKnownCommitment` reverts `UnknownOrder` if the caller's Commitment struct isn't backed by a committed order.

Foundry-covered companions (scene would need a mock-validator contract for universal CVL coverage):
- `testFuzz_setValidator_rejectsMismatchedBinding` — validator-binding-check under random (schemaId, boundId) pairs
- `testFuzz_contentRefIsKeccakOfContent` — emitted `contentRef` equals `keccak256(content)` for arbitrary bytes

**FigToken (7 sub-rules from 6 declared) — `rule_sanity: none` (vacuity heuristic not meaningful for these state-invariant claims)**

| CVL rule | Maps to | Type |
|---|---|---|
| `totalSupplyWithinMaxSupply` | E-6 | Inductive preservation rule |
| `totalRegisteredCapWithinMaxSupply` | E-6 | Inductive preservation rule |
| `totalRegisteredCapMonotonic` | E-6 | Parametric (never decreases) |
| `deployerMintRenouncedIsOneWayLatch` | — | One-way latch preservation |
| `minterCapImmutable` | E-6 | Per-minter immutability |
| `minterMintedWithinCap` | E-6 | Inductive (unconditional `minted <= cap`, strictly strong enough to exclude symbolic unreachable pre-states) |

**StagedMerkleAirdrop (4 rules)**

| CVL rule | Maps to | Type |
|---|---|---|
| `claimedIsMonotonic` | E-7 | Parametric (per-stage flag never resets) |
| `stageConfigImmutable` | E-8, E-9 | Per-stage root + unlockTime immutability (index typed `uint256` to match Solidity fixed-array ABI) |
| `minterImmutable` | — | `minter` address never changes |

### Status

35 declared rules across 6 specs. **All green**. AC re-dispatched 2026-04-23 after the agreement-receipt ABI change — 8/8 sub-rules verified.

| Spec | Report URL |
|---|---|
| FigaroCore | https://prover.certora.com/output/9512759/dc9fa6e2d9dd4361845214222bd70258 (2026-04-21) |
| AttestationCoordinator | https://prover.certora.com/output/9512759/dd5e5e4dde634419967d3be4958a0eae (2026-04-23, commitment-arg ABI + receipt binding, 8/8 green) |
| TokenOpsVerification | https://prover.certora.com/output/9512759/4768752379cc434aa53cc7b8894cdd25 (2026-04-23, 8/8 green — FigaroCore token-flow universal proof) |
| BatchVerifierTokenOps | https://prover.certora.com/output/9512759/a8a8878f373f4b5d940e47b81576b2dd (2026-04-23, 4/4 green — single-position batch token-flow) |
| FigToken | https://prover.certora.com/output/9512759/e48a5c0c4b94465ba93b44a716b31025 (2026-04-21) |
| StagedMerkleAirdrop | https://prover.certora.com/output/9512759/c48b77f25a734eab894102ee5706da7e (2026-04-21) |

```bash
# Install
pip install certora-cli       # or: pipx install certora-cli

# Run (requires CERTORAKEY env var)
export CERTORAKEY=<your-key>
./test-certora.sh             # wrapper: checks prereqs and runs all specs
```

---

## 11) SDK test coverage

| SDK test file | Coverage | Maps to |
|---|---|---|
| `integration.test.ts` | Full lifecycle: deploy → commit → reconstruct → resolve → verify | K-1, K-2, K-3, K-6 |
| `bonds.test.ts` | Bond calculations (2×), settlement payouts, approval amounts, validation | K-1, K-5 |
| `commitments.test.ts` | EIP-712 domain building, salt generation, deadline, commitment building | K-8, K-9 |
| `state.test.ts` | Event reconstruction, ProcessGraph (incremental), active/seller/buyer queries | A-4, A-5 |
| `proposer.test.ts` | Agent proposer: proposeActions, typed action generation | K-2 (buyer action routing) |
| `hitl.test.ts` | ActionQueue HITL — approve/reject/execute lifecycle | Agent coordination |
| `attestation.test.ts` | Schema IDs, GHG constants, grams encoding, event filtering, disclosure summaries | E-1, E-2 |
| `auction.test.ts` | Price curves, floor BPS, claim evaluation, auction state derivation | E-3 |
| `did.test.ts` | did:web validation, resolution, address extraction, operator DID docs | DID:web identity |
| `geo.test.ts` | Geohash matching, haversine distance, photo+GPS evidence | Delivery attestation |
| `batch-e2e.test.ts` | End-to-end batch settlement (SP1 mock) | E-5 |
| `sequencer.test.ts` | Batch sequencer API, mempool, state mirror, batch assembly | Batch sequencer |

---

## 12) Test inventory summary

| Layer | Files | Test count | What it covers |
|---|---|---|---|
| **TLA+ model checking** | 2 models | 15 invariants (FigaroCore: 7 across 6,087,113 states / 4m 8s; FigToken: 8 across 160,844 states / 9s — both via `./test-tla.sh`) | Kernel safety (conservation, solvency, bonding, atomicity, resolution) + FIG token registry (max supply, minter cap, non-negative, no-mint-to-zero, balance-sum-to-supply, renounce-monotonicity, deployer-cannot-mint-after-renounce) |
| **Halmos symbolic testing** | 2 files | 11 properties | FigaroCore: token conservation, contract solvency, bond amounts, resolution payouts, status transition, buyer dominance, cumulative monotonicity. StagedMerkleAirdrop: claim flag, double-claim rejection, unlock timing, invalid stage rejection. |
| **Certora formal verification** | 6 specs | 35 declared rules (8 + 7 + 7/8 + 4 + 6/7 + 3/4) — AC re-dispatch pending after 2026-04-23 ABI change for agreement-receipt binding | FigaroCore: state-machine invariants. AttestationCoordinator: role-gate correctness + Core immutability + validator-gate on the new commitment-arg ABI. TokenOpsVerification: universal balance-flow proofs for FigaroCore commit + single-order resolve. BatchVerifierTokenOps: single-position settleBatch balance-flow proofs. FigToken: supply cap + minter registry preservation. StagedMerkleAirdrop: claim monotonicity, stage config immutability, minter immutability. |
| **Echidna fuzzing** | 1 harness | 7 properties | Kernel fuzz: solvency, monotonicity, buyer dominance, atomicity |
| **Foundry unit tests** | 14 suites | 225 tests | Core lifecycle, revert branches, mechanisms, gas, FIG, staged airdrop, parity vectors |
| **SDK Vitest** | 12 files | 166 tests | Event parsing, state reconstruction, bond math, commitments, extensions |
| **Frontend Vitest** | 84 files | 560 tests | Components, hooks, semantic derivation, assembly, runtime identity |
| **Playwright** | 38 specs | 169 tests | UI rendering, content regression, devnet integration |
| **Rust (prover)** | 2 crates | 55 tests | SP1 kernel parity, batch execution, sequencer |

**Total**: 1,185+ tests across 157 files + formal verification (TLA+ + Halmos) + fuzzing

---

## 13) How to run verification (repeatable)

### Foundry (14 suites, 225 tests)

```bash
forge test --via-ir
```

### Halmos (7 symbolic proofs)

```bash
./test-halmos.sh
```

Prereqs (one-time): `brew install z3 && pipx install halmos`.

### Certora (27 sub-rules across 4 specs — requires API key)

```bash
export CERTORAKEY=<key from certora.com/signup>
certoraRun certora/FigaroCore.conf --disable_local_typechecking
```

### Echidna (7 properties)

```bash
./test-echidna.sh
```

Prereqs: `brew install echidna`.

### TLA+ model checking (15 invariants across 2 models)

```bash
./test-tla.sh
```

Prereqs: Java 11+, and `tla2tools.jar` downloaded once into `formal/`
(see the script header for the exact `curl` command).

### SDK tests (166 tests)

```bash
cd sdk && npm test
```

### Frontend Vitest (560 tests)

```bash
cd frontend && npx vitest run
```

### Frontend Playwright

```bash
cd frontend && npx playwright test --project=mock    # no chain
cd frontend && npx playwright test --project=devnet  # Anvil required
```

### Rust prover (55 tests)

```bash
cd prover && cargo test -p figaro-kernel
cd prover && cargo test -p figaro-sequencer
```

CI job: `.github/workflows/prover-ci.yml` runs both on every push/PR that
touches `prover/`.

---

## 14) Known gaps

All gaps from the initial map have been closed. The following items are infrastructure
details that are now explained on `/builders` but do not appear on marketing pages
(by conscious decision — they are developer-facing invariants, not user-facing narratives):

| Item | Code location | UI status |
|---|---|---|
| Single-currency binding (K-7) | `FigaroCore.sol` `CurrencyMismatch` revert | `/builders` → Composability → Single-Currency Binding |
| Fee-on-transfer rejection (A-7) | `FigaroCore.sol` `_pullExact()` | `/builders` → Composability → Fee-on-Transfer Guard |
| EIP-2612 permit pathway | `frontend/lib/core/permitExecution.ts` | `/builders` → Gasless token approvals |
| Content-addressed order IDs (K-9) | `FigaroCore.sol` commit hash | `/builders` → Composability → Content-Addressed Order IDs |
| Batch verification detail (E-5) | `FigaroBatchVerifier.sol` state root chain | `/builders` → Batch verification (4 cards: state root, SP1, net positions, event re-emission) |

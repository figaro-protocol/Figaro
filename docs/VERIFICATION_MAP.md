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

The V3 map (archived at `archive-v5/V3_VERIFICATION_MAP.md`) covered Theory → Code → Tests → TLA+ only. This V5 map adds the UI column to prevent feature presentation gaps — features that exist in code but are invisible to users.

---

## 1) Scope

### In-scope (this document)

- **Kernel**: `src/FigaroCore.sol` — 2 external functions, 3 mappings, no owner, no fee
- **Protocol compositions**: `AttestationCoordinator`, `ClauseRegistry`, `SellerRegistry`, `AssemblyRegistry`, `WitnessSwapAndCommitCoordinator`
- **FIG token ecosystem**: `FigToken` (`IFigMinter` interface; no implementation wired)
- **Formal model**: `formal/FigaroCore.tla`, `formal/MC.tla`, `formal/MC.cfg`
- **Tests**: the Foundry, Halmos, Certora, Echidna, and TLA+ harnesses, plus the SDK suite — suite, file, property, and rule counts are in `TESTING.md` (the single source)
- **Frontend**: All pages in `frontend/app/`, components, mechanism modules

### Explicitly out-of-scope

- Archived V3/V4 contracts (`archive-v3/`, `archive-v4/`)
- Frontend Vitest unit tests — these test UI components, not protocol invariants (inventory in `TESTING.md`)
- Playwright E2E tests — these test UI rendering, not protocol properties

---

## 2) Invariant IDs (stable references)

### Kernel invariants (V5)

- `K-1` **Asymmetric bonding**: buyer bond = $2 \times payment$; seller bond = $2 \times cumulativeValue$
- `K-2` **Buyer dominance**: only root buyer can trigger `resolveProcess`
- `K-3` **Atomic resolution**: must resolve all active orders (anti-cherry-picking)
- `K-4` **No escape hatches**: no timeout, no admin exit, no unilateral withdrawal from Active
- `K-5` **Cumulative upstream bonding**: monotonic accumulator ($cumulativeValue$ only increases)
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

### Composition invariants

- `E-1` **Attestation role gating**: only verified role-holder (buyer/seller/resolver) can attest
- `E-2` **Clause immutability**: registered clauses cannot be overwritten
- `E-4` **Seller deposit lock**: withdrawal only after deactivation + lock period
- `E-6` **FIG supply cap**: total minted ≤ 1,000,000,000 FIG (enforced on every mint path)

---

## 3) Kernel invariants → enforcement map

| ID | Statement | Code enforcement | Tests | TLA+ | Echidna | UI presentation |
|---|---|---|---|---|---|---|
| K-1 | Buyer bond = $2 \times payment$; seller bond = $2 \times cumulativeValue$ | `_pullExact(token, buyer, payment * 2)` and `_pullExact(token, seller, cumVal * 2)` in `commit()` | `FigaroCoreTest`: bond-amount coverage; `ParityVectors`: EIP-712 ↔ Solidity parity | `BondFormulaCorrectV3` — verified across 6M+ states | `echidna_solvency` — core holds ≥ sum of active bonds | `/cryptoeconomics` → /papers/asymmetric-bonding (mechanism); `/local-commerce` → Why deposits work; `/builders` → Security boundary |
| K-2 | Only root buyer can call `resolveProcess` | `if (msg.sender != ps.rootBuyer) revert NotProcessBuyer()` in `resolveProcess()` | `FigaroCoreTest`: buyer-only paths; `FigaroCoreRevertBranchTest`: 16 revert tests | `ResolveProcess` constrains resolver to root buyer | `echidna_buyer_dominance` — non-buyer resolve always fails | `/cryptoeconomics` → /papers/asymmetric-bonding; `/builders` → Security boundary |
| K-3 | Must resolve all active orders (anti-cherry-picking) | `if (commitments.length != ps.activeOrderCount) revert IncompleteOrderList()` + per-order status check | `FigaroCoreTest`: multi-order arrays; `FigaroCoreRevertBranchTest`: incomplete list reverts | `ResolveProcess` uses `ActiveOrdersInProcess` + count check | `echidna_atomic_resolution` — incomplete lists always fail | `/cryptoeconomics` → /papers/asymmetric-bonding (atomic resolution); `/builders` → Enforcement, in three layers |
| K-4 | No timeout, no admin exit from Active state | No timeout action exists; only `resolveProcess` transitions Active→Resolved; no owner, no admin functions | `FigaroCoreRevertBranchTest`: no alternate exit paths | Model has no timeout action; only Committed→Resolved via buyer | `echidna_state_monotonicity` — status only moves forward (0→1→2) | `/cryptoeconomics` → /papers/asymmetric-bonding (the Escape-Hatch Weakness theorem); `/security` → "no admin, no owner, no pause function" |
| K-5 | Monotonic accumulator ($cumulativeValue$ only increases) | `uint256 actualCumulative = ps.cumulativeValue + c.payment` + `CumulativeValueMismatch` revert | `FigaroCoreTest`: accumulator tests | `CumulativeIntegrity` — $cumulativeValue = \sum(payment)$ | `echidna_cumulative_accounting` — accumulator = sum(payment) | `/cryptoeconomics` → /papers/asymmetric-bonding (cumulative upstream bonding); `/builders` → Three levels |
| K-6 | No internal ledger — direct ERC-20 transfer at resolution | `currency.safeTransfer(seller, 2*cumVal + payment)` + `currency.safeTransfer(buyer, payment)` | `FigaroCoreTest`: payout assertions; `FigaroCoreEventEmissionTest`: OrderResolved events | Not modeled (TLA+ abstracts transfer mechanics; wallets model is sufficient) | — | `/local-commerce` → Step 4: "Settlement returns your bond and pays you directly" |
| K-7 | Per-process immutable token binding | `if (c.currency != address(ps.currency)) revert CurrencyMismatch()` on sub-orders | `FigaroCoreRevertBranchTest`: currency mismatch revert | Implicitly via single-currency model | — | `/builders` → Composability → Single-Currency Binding |
| K-8 | Both parties sign off-chain via EIP-712 typed data | `ECDSA.recover(digest, buyerSig)` + `ECDSA.recover(digest, sellerSig)` checks in `commit()` | `FigaroCoreTest`: signature verification; `ParityVectors`: EIP-712 parity | Not modeled (TLA+ abstracts signature mechanics) | — | `/sign` → commitment signing UI |
| K-9 | `orderHash = keccak256(EIP-712 digest)`, content-addressed | `bytes32 orderHash = keccak256(abi.encode(digest))` + `if (orderStatus[orderHash] != 0) revert OrderAlreadyExists()` | `FigaroCoreTest`: duplicate guard; `ParityVectors`: hash parity | Not directly modeled (TLA+ uses sequential IDs) | — | `/builders` → Composability → Content-Addressed Order IDs |

---

## 4) Accounting invariants → enforcement map

| ID | Statement | Code enforcement | Tests | TLA+ | Echidna | UI presentation |
|---|---|---|---|---|---|---|
| A-1 | Sum of wallets + contract balance = initial total supply | Ledger is explicit in transfer flows (`_pullExact` in, `safeTransfer` out) | `FigaroCoreTest`: conservation assertions across lifecycle | `TokenConservation` — verified across 6M+ states | `echidna_token_conservation` — totalSupply constant | Not directly presented (infrastructure invariant) |
| A-2 | Contract balance ≥ 0 | Solidity `uint256` prevents negatives; explicit transfer-out bounded by holdings | `FigaroCoreTest`: solvency checked post-resolution | `ContractSolvency` — verified | `echidna_solvency` | Not directly presented |
| A-3 | No participant goes below zero | Solidity `uint256`; ERC-20 `safeTransfer` reverts on insufficient balance | `FigaroCoreRevertBranchTest`: insufficient balance reverts | `WalletNonNegative` — verified | — | Not directly presented |
| A-4 | Per-process $cumulativeValue = \sum(order.payment)$ | `actualCumulative = ps.cumulativeValue + c.payment` with mismatch revert | `FigaroCoreTest`: accumulator arithmetic | `CumulativeIntegrity` — verified | `echidna_cumulative_accounting` | `/builders` → Composability → Cumulative upstream bonding |
| A-5 | Per-process $activeCount = count(committed)$ | `ps.activeOrderCount++` on commit, `ps.activeOrderCount--` on resolve with count match | `FigaroCoreTest`: multi-order lifecycle | `ActiveCountCorrect` — verified | `echidna_active_count_consistent` | Not directly presented |
| A-6 | Contract can resolve any active process | Follows from A-1 + A-2 + bond calculation | `GasCeilingTest`: max orders under 30M gas | `ResolutionAlwaysPossible` — verified | — | Not directly presented |
| A-7 | Fee-on-transfer token rejection | `_pullExact`: `uint256 received = after - before; if (received != amount) revert ExactTransferFailed()` | `FigaroCoreRevertBranchTest`: fee-on-transfer token test (`MockERC20FeeOnTransfer`) | Not modeled (TLA+ abstracts ERC-20 mechanics) | — | `/builders` → Composability → Fee-on-Transfer Guard |

---

## 5) Composition invariants → enforcement map

| ID | Statement | Code enforcement | Tests | UI presentation |
|---|---|---|---|---|
| E-1 | Only verified role-holder can attest | `attestAsSeller`: verifies seller via commitment orderHash lookup; `attestAsBuyer`: verifies via ProcessState.rootBuyer; `attestViaResolver`: delegates to IRoleResolver | `AttestationCoordinatorTest`: all 3 paths + cross-order same-process | `/papers/on-chain-evidence` → evidentiary properties; `/local-commerce` → Attestation Coordinator; `/builders` → Clause validation |
| E-2 | Registered clauses cannot be overwritten | `registerClause`: event-only anchoring (no storage to overwrite); dedup guard on re-registration | `ClauseRegistryTest`: registration, dedup, deposit + withdraw paths | `/builders` → Clause validation; `/local-commerce` → clause-typed events |
| E-4 | Seller deposit = staked intent (K4): withdraw allowed at ANY time (no lock), returns the deposit and clears the dedup guard — de-surfacing is the price; re-registration allowed after | `register()`: deposit-bound match + dedup guard; `withdraw()`: requires registered, pays back the deposit, clears the guard. `updateProfile()` is a separate caller-only path that emits `SellerProfileUpdated` without touching the deposit | `SellerRegistryTest`: register, deposit-bound match, dedup, withdraw-any-time, re-registration, updateProfile (only-self, no deposit movement); e2e `seller-withdraw` (UI round-trip + exact registry ETH delta) | `/local-commerce` → Seller Registry; `/sellers`; `/builders` → Seller identity |
| E-6 | FIG supply cap: $\leq$ 1B on every mint | `mint()`: `if (totalSupply() + amount > MAX_SUPPLY) revert SupplyCapExceeded()` + reentrancy guard | `FigToken.t.sol`: cap enforcement, multi-minter, renounce | `/papers/fig-schelling-point-token` → supply integrity |

---

## 6) Protocol features — UI presentation coverage

This section tracks features that are not protocol invariants but are significant protocol capabilities. The purpose is to ensure every implemented feature is visible to users somewhere.

| Feature | Code location | SDK coverage | UI explainer pages | UI functional surfaces | Gap? |
|---|---|---|---|---|---|
| **Handoff encryption (ECDH)** | `frontend/lib/handoff/` | — | `/local-commerce` → Handoff Encryption | `HandoffKeyExchangeModule`, `HandoffTrackerModule`, `HandoffDetailsModule` | — |
| **Delivery attestation (4 modes)** | removed (proximity proofs live in the handoff clause runtime, `frontend/lib/handoff/`) | `@figaro/sdk/derive`: `geohashesMatch`, `haversineDistance` | `/local-commerce` → Proximity Proofs; `/builders` → attestation modes | `DeliveryAttestationPanel`, `/evidence-display` | — |
| **DID:web identity** | `frontend/lib/agent/useDidWeb.ts` | `@figaro/sdk/agent`: `resolveDidWeb`, `didWebToUrl`, `didDocumentMatchesAddress`, `buildSellerDidDocument` | `/builders` → Seller identity | `DidVerificationBadge` (component) | — |
| **Kleros dispute / evidence** | `frontend/lib/audit/` + `frontend/lib/semantic/processRecourse.ts` | — (frontend-local; SDK carries no Kleros helpers) | `/builders` → Kleros integration | `/evidence-display` (full rendering for jurors) | — |
| **Agent SDK** | `sdk/` (root + `/agent`, `/derive`, `/clauses`) | Self-referential (`npx vitest run` in `sdk/` is the census) | `/builders` → Agent SDK section | — | — |
| **Semantic derivation** | `frontend/lib/semantic/` | — | `/builders` → How the runtime renders institutions | `TopologyCanvas` in the design canvas (`/builders/designer/*`); `CapabilityRail` + `RecoursePanel` at runtime | — |
| **Institution assembly** | `frontend/lib/designer/`; `src/AssemblyRegistry.sol` | — | `/builders` → Level 1 assembly config; `/local-commerce` → "Fork Local Commerce" | `/builders/designer/new`, `/builders/designer/edit?slug=<slug>`, `/builders/designer/view?slug=<slug>` | — |
| **Agreement publication** | `frontend/lib/kernel/agreementFetch.ts`, `@figaro/sdk` `projection.ts` | — | `/builders` → Agreement publication | — | — |
| **Commerce checkout** | `frontend/lib/checkout/` | — | — | `CartModule` (interactive) | — |
| **Process topology** | `frontend/lib/semantic/processTopology.ts` | SDK: `reconstruct()`, `Topology` | `/builders` → Composability (the graph above the kernel) | `TopologyCanvas` (`/builders/designer/new`, `/builders/designer/view?slug=<slug>`) | — |
| **Bond math** | `sdk/src/bonds.ts` | SDK: `calculateBonds`, `calculateSettlement` | `/builders` → bond math formulas | checkout/order surfaces render via the SDK (the dedicated `BondCalculator` component was deleted) | — |
| **EIP-2612 permit** | removed (permit path deleted 2026-07-02; approve-only) | — | `/builders` → Gasless token approvals | `PermitControl` component | — |
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

### Harness: `src/echidna/EchidnaFuzzer.sol`

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

### Properties proved (7/7)

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

**Total: 7/7 proved (FigaroCore 7), 0 failed. Typical wall time ~4 minutes.**

Per-property times vary significantly between runs (Z3's search path is
non-deterministic). `check_resolutionPayouts` — the only property that
exercises the full commit + resolve lifecycle symbolically (2 ECDSA recoveries,
multiple keccak256 instances, 4 ERC-20 transfers) — is especially sensitive
and will time out under the originally documented 5-minute per-assertion
ceiling when batched with the other 6 properties in one `halmos` process.
The committed wrapper splits it into its own invocation for reliability.

### How to run

```bash
./scripts/test-halmos.sh
```

Prerequisites (one-time):
```bash
brew install z3          # Z3 SMT solver (macOS)
pipx install halmos      # Halmos CLI (Python 3.12+)
```

The wrapper (`scripts/test-halmos.sh`) checks for both prerequisites, runs the 6
fast properties batched in one `halmos` process, then runs
`check_resolutionPayouts` in a second, fresh `halmos` process. Per-assertion
timeout defaults to 10 minutes; override with `HALMOS_SOLVER_TIMEOUT_MS`.

---

## 10) Certora formal verification — current posture

### Spec: `certora/FigaroCore.spec`

Certora uses cloud-based SMT proving to verify CVL (Certora Verification Language)
specifications against Solidity bytecode. The spec covers state-machine invariants
that complement the Halmos token-conservation proofs.

### Rules verified

(Current spec and rule totals: `TESTING.md`. The per-rule maps below cover the FigaroCore, AttestationCoordinator, and token-ops specs.)

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

**AttestationCoordinator (4 declared rules — re-authored 2026-04-23 for the commitment-arg ABI + merkle-proof receipt binding; cloud re-dispatch pending)**

| CVL rule | Maps to | Type |
|---|---|---|
| `nonBuyerCannotAttestAsBuyer` | E-1 | Targeted revert rule — `msg.sender != c.buyer ⟹ revert` (c.buyer == rootBuyer by commit invariant) |
| `successfulBuyerAttestationImpliesBuyer` | E-1 | Contrapositive — successful call ⟹ `msg.sender == c.buyer` |
| `attestationCannotChangeOrderStatus` | K-4 | Parametric (`filtered { f -> f.contract == currentContract }`) |
| `attestationCannotChangeProcessState` | K-4, K-7 | Same filter |

The coordinator is merkle-only: it merkle-binds each attestation to its signed agreement and content-hash-binds the evidence (`contentRef == keccak256(content)`), and validates no content shape.

Foundry-covered companion:
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

### Status

25 declared rules across 4 specs (FigaroCore 8 + FigToken 6 +
AttestationCoordinator 4 + TokenOpsVerification 7). **All green**. AC
re-dispatched 2026-04-23 after the agreement-receipt ABI change.

| Spec | Report URL |
|---|---|
| FigaroCore | https://prover.certora.com/output/9512759/dc9fa6e2d9dd4361845214222bd70258 (2026-04-21) |
| AttestationCoordinator | https://prover.certora.com/output/9512759/dd5e5e4dde634419967d3be4958a0eae (2026-04-23, commitment-arg ABI + receipt binding) |
| TokenOpsVerification | https://prover.certora.com/output/9512759/4768752379cc434aa53cc7b8894cdd25 (2026-04-23, FigaroCore token-flow universal proof) |
| FigToken | https://prover.certora.com/output/9512759/e48a5c0c4b94465ba93b44a716b31025 (2026-04-21) |

```bash
# Install
pip install certora-cli       # or: pipx install certora-cli

# Run (requires CERTORAKEY env var)
export CERTORAKEY=<your-key>
./scripts/test-certora.sh             # wrapper: checks prereqs and runs all specs
```

---

## 11) SDK test coverage

| SDK test file | Coverage | Maps to |
|---|---|---|
| `integration.test.ts` | SDK round-trip on a LIVE chain (the one sanctioned chain-touching Vitest file, skipIf-gated): built+signed commitment accepted by `commit`, events fetch + reconstruct, reconstruction resolves. Asserts no kernel math — amounts are Foundry/Certora-owned | K-8, K-9 (live-chain acceptance) |
| `bonds.test.ts` | Bond calculations (2×), settlement payouts, approval amounts, validation | K-1, K-5 |
| `commitments.test.ts` | EIP-712 domain building, salt generation, deadline, commitment building | K-8, K-9 |
| `state.test.ts` | Event reconstruction, Topology (incremental), active/seller/buyer queries | A-4, A-5 |
| `proposer.test.ts` | Agent proposer: proposeActions, typed action generation | K-2 (buyer action routing) |
| `hitl.test.ts` | ActionQueue HITL — approve/reject/execute lifecycle | Agent coordination |
| `attestation.test.ts` | Attestation event filtering (by clause / process / order / stage) | E-1, E-2 |
| `discovery.test.ts` | Clause-key hashing (`computeClauseKey`), registry-log parsers (decode round-trip), `DiscoveryGraph` liveness folds for the three families | Discovery reconstruction |
| `did.test.ts` | did:web validation, resolution, address extraction, seller DID docs | DID:web identity |
| `geo.test.ts` | Geohash matching, haversine distance, photo+GPS evidence | Delivery attestation |

---

## 12) Test inventory summary

Counts are point-in-time snapshots (last refreshed 2026-07-10) — derive the
current numbers, never trust these: `forge test` · `npx vitest run` (in `sdk/`
and `frontend/`) · `npx playwright test --list` · `./scripts/test-tla.sh` ·
`./scripts/test-echidna.sh`.

| Layer | Files | Test count | What it covers |
|---|---|---|---|
| **TLA+ model checking** | 2 models | 15 invariants (FigaroCore: 7 across 6,087,113 states / 4m 8s; FigToken: 8 across 160,844 states / 9s — all via `./scripts/test-tla.sh`) | Kernel safety (conservation, solvency, bonding, atomicity, resolution) + FIG token registry (max supply, minter cap, non-negative, no-mint-to-zero, balance-sum-to-supply, renounce-monotonicity, deployer-cannot-mint-after-renounce) |
| **Halmos symbolic testing** | 1 file | 7 properties | FigaroCore (7): token conservation, contract solvency, bond amounts, resolution payouts, status transition, buyer dominance, cumulative monotonicity. |
| **Certora formal verification** | 4 specs | 25 declared rules (8 + 4 + 7 + 6) | FigaroCore: state-machine invariants. AttestationCoordinator: role-gate correctness + Core immutability (merkle-only — no content-shape validation). TokenOpsVerification: universal balance-flow proofs for FigaroCore commit + single-order resolve. FigToken: supply cap + minter registry preservation. |
| **Echidna fuzzing** | 2 harnesses | 15 properties (kernel 7 + FigToken 8) | `EchidnaFuzzer` Kernel (7): solvency, monotonicity, buyer dominance, atomicity, cumulative accounting, conservation, active-count consistency. `EchidnaFigToken` (8): FigToken supply/minter fuzzing. (`EchidnaToken` is the kernel harness's support ERC-20, not a harness.) |
| **Foundry unit tests** | 10 suites | 166 tests | Core lifecycle, revert branches, mechanisms, gas, FIG, parity vectors |
| **SDK Vitest** | 22 files | 336 tests | Event parsing, state reconstruction, bond math, commitments, discovery, clauses, agent origination |
| **Frontend Vitest** | 52 files | 376 tests | Components, hooks, semantic derivation, assembly, runtime identity |
| **Playwright** | 26 spec files | 41 tests | Devnet e2e (UI action → UI reaction against the live chain) + the mobile viewport spec |

---

## 13) How to run verification (repeatable)

### Foundry (the suite/test census is `forge test`'s own summary line)

```bash
forge test --via-ir
```

### Halmos (7 symbolic proofs)

```bash
./scripts/test-halmos.sh
```

Prereqs (one-time): `brew install z3 && pipx install halmos`.

### Certora (25 declared rules across 4 specs: FigaroCore, AttestationCoordinator, TokenOpsVerification, FigToken — requires API key)

```bash
export CERTORAKEY=<key from certora.com/signup>
certoraRun certora/FigaroCore.conf --disable_local_typechecking
```

### Echidna (2 harnesses, 15 properties: kernel 7 + FigToken 8)

```bash
./scripts/test-echidna.sh
```

Prereqs: `brew install echidna`.

### TLA+ model checking (15 invariants across 2 models)

```bash
./scripts/test-tla.sh
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
cd frontend && npx playwright test --project=devnet  # Anvil required
```

---

## 14) Known gaps

All gaps from the initial map have been closed. The following items are infrastructure
details that are now explained on `/builders` but do not appear on marketing pages
(by conscious decision — they are developer-facing invariants, not user-facing narratives):

| Item | Code location | UI status |
|---|---|---|
| Single-currency binding (K-7) | `FigaroCore.sol` `CurrencyMismatch` revert | `/builders` → Composability → Single-Currency Binding |
| Fee-on-transfer rejection (A-7) | `FigaroCore.sol` `_pullExact()` | `/builders` → Composability → Fee-on-Transfer Guard |
| EIP-2612 permit pathway | removed (permit path deleted 2026-07-02; approve-only) | `/builders` → Gasless token approvals |
| Content-addressed order IDs (K-9) | `FigaroCore.sol` commit hash | `/builders` → Composability → Content-Addressed Order IDs |

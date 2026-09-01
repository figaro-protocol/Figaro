# Verification Map (Theory → Code → Tests → TLA+ → UI)

## 0) Purpose

This document ties every protocol property to its enforcement across five layers:

- **Theory** — the game-theoretic invariant (from THEORY.md / VISION.md)
- **Code** — what is actually enforced on-chain (Solidity)
- **Tests** — what is continuously regression-checked (Foundry, Echidna, SDK Vitest)
- **TLA+** — what is exhaustively model-checked (models and their counts: `TESTING.md` § TLA+)
- **Halmos** — what is symbolically proved at the bytecode level (z3 solver)
- **Certora** — what is formally verified via SMT-based proving (state-machine rules)
- **UI** — where the feature is explained or rendered for users (pages, sections)

The UI column exists to prevent presentation gaps — features enforced in code but invisible to the people using them.

Run evidence — when each layer last ran, at which commit, and the Certora report
URLs — is `AUDITOR_HANDOVER.md` § "Formal run evidence". This document maps; it
does not log.

---

## 1) Scope

### In-scope (this document)

- **Kernel**: `src/kernel/FigaroCore.sol` — 2 external functions, 3 mappings, no owner, nothing paid to the protocol
- **Protocol compositions**: `AttestationCoordinator`, `ClauseRegistry`, `MembersRegistry`, `AssemblyRegistry`, `WitnessSwapAndCommitCoordinator`
- **Florin ecosystem**: `FlorinToken` + `RpgfMinter` (implements `IFlorinMinter`; registered as a minter at genesis)
- **Formal model**: `formal/FigaroCore.tla`, `formal/MC.tla`, `formal/MC.cfg`
- **Tests**: the Foundry, Halmos, Certora, Echidna, and TLA+ harnesses, plus the SDK suite — suite, file, property, and rule counts are in `TESTING.md` (the single source)
- **Frontend**: All pages in `frontend/app/`, components, mechanism modules

### Explicitly out-of-scope

- Archived V3/V4 contracts (`archive-v3/`, `archive-v4/`)
- Frontend Vitest unit tests — these test UI components, not protocol invariants (inventory in `TESTING.md`)
- Playwright E2E tests — these test UI rendering, not protocol properties

---

## 2) Invariant IDs (stable references)

### Kernel invariants

- `K-1` **Asymmetric bonding**: buyer bond = $2 \times payment$; seller bond = $2 \times cumulativeValue$
- `K-2` **Buyer dominance**: only root buyer can trigger `resolveProcess`
- `K-3` **Atomic resolution**: must resolve all active orders (anti-cherry-picking)
- `K-4` **No escape hatches**: no timeout, no admin exit, no unilateral withdrawal from Active
- `K-5` **Cumulative bonding**: monotonic accumulator ($cumulativeValue$ only increases)
- `K-6` **Direct resolution**: no internal ledger, no withdrawal step — ERC-20 transfer at resolution
- `K-7` **Single currency binding**: per-process immutable token
- `K-8` **Dual-signed commitment**: EIP-712 typed data, both parties sign off-chain
- `K-9` **Content-addressed order IDs**: `orderHash = keccak256(processId ‖ structHash)`, not auto-increment

### Accounting invariants

- `A-1` **Token conservation**: sum of all wallets + contract balance = initial total supply
- `A-2` **Contract solvency**: contract balance ≥ 0 (never promises more than held)
- `A-3` **Wallet non-negative**: no participant goes below zero
- `A-4` **Cumulative integrity**: per-process $cumulativeValue = \sum(order.payment)$
- `A-5` **Active count**: per-process $activeCount = count(committed\ orders)$
- `A-6` **Resolution always possible**: contract can always pay out every active process
- `A-7` **Fee-on-transfer rejection**: `_pullExact` reverts if received ≠ amount
- `A-8` **Deterrent deposit magnitudes**: held deposits = 2×payment (buyer) + 2×cumulativeValue (seller) for every committed order — the bond is the *deterrent* the equilibrium argument reasons over, not merely enough to pay out
- `A-9` **Net positions at resolution**: resolution moves exactly `payment` from buyer to seller per order and returns both bonds whole
- `A-8`/`A-9` are the PAYOFF TABLE the equilibrium proof reasons over; the choosing itself — best responses and the N-party chain equilibrium — is machine-checked in Lean 4 over that table (`formal/lean/FigaroEquilibrium.lean`; `TESTING.md` § Lean 4)

### Composition invariants

- `E-1` **Attestation role gating**: only verified role-holder (buyer/seller/resolver) can attest
- `E-2` **Clause immutability**: registered clauses cannot be overwritten
- `E-3` — unassigned. Ids are stable references and are never renumbered.
- `E-4` **Member stake reclaim**: de-surfacing is immediate on request; the ETH releases only after the cooldown
- `E-5` **The stake mechanics the designer-reward Sybil bound assumes**: the registry is solvent, a stake cannot be recycled across identities, eligibility ends at request time, and the counter reads exactly that gate
- `E-6` **Florin supply cap**: total minted ≤ 1,000,000,000 florins (enforced on every mint path)
- `E-7` **Batch usage accrual is proof-gated and once-ever**: trade resolved on the batch path counts for designer rewards only via a proof, cannot be replayed across batches, and merges with the direct path as SCORES, never as components
- `E-8` **Private-section withholding**: a `private`-disposition section's plaintext never reaches a public surface (public pin, audit bundle); the chain sees only the section fingerprint, so `agreementHash` is unchanged

---

## 3) Kernel invariants → enforcement map

| ID | Statement | Code enforcement | Tests | TLA+ | Echidna | UI presentation |
|---|---|---|---|---|---|---|
| K-1 | Buyer bond = $2 \times payment$; seller bond = $2 \times cumulativeValue$ | `_pullExact(token, buyer, payment * 2)` and `_pullExact(token, seller, cumVal * 2)` in `commit()` | `FigaroCoreTest`: bond-amount coverage; SDK `bonds.test.ts`: the 2× math the frontend/agents derive from | `DeterrentEscrowMagnitudes` — the 2×payment + 2×cumulativeValue held-deposit magnitudes, a checked invariant (see A-8 and §7); bond correctness also carried by Halmos + Certora | `echidna_solvency` — core holds ≥ sum of active bonds | `/kernel` → /papers/asymmetric-bonding (mechanism); `/spec` → Kernel (`FigaroCore.sol`) |
| K-2 | Only root buyer can call `resolveProcess` | `if (msg.sender != ps.rootBuyer) revert NotProcessBuyer()` in `resolveProcess()` | `FigaroCoreTest`: buyer-only paths; `FigaroCoreRevertBranchTest`: the revert-branch suite (count derived from the file, never stored here) | `ResolveProcess` constrains resolver to root buyer | `echidna_buyer_dominance` — non-buyer resolve always fails | `/kernel` → /papers/asymmetric-bonding; `/spec` → Kernel (`FigaroCore.sol`) |
| K-3 | Must resolve all active orders (anti-cherry-picking) | `if (commitments.length != ps.activeOrderCount) revert IncompleteOrderList()` + per-order status check | `FigaroCoreTest`: multi-order arrays; `FigaroCoreRevertBranchTest`: incomplete list reverts | `ResolveProcess` uses `ActiveOrdersInProcess` + count check | `echidna_atomic_resolution` — incomplete lists always fail | `/kernel` → /papers/asymmetric-bonding (atomic resolution); `/spec` → Kernel (`FigaroCore.sol`) |
| K-4 | No timeout, no admin exit from Active state | No timeout action exists; only `resolveProcess` transitions Active→Resolved; no owner, no admin functions | `FigaroCoreRevertBranchTest`: no alternate exit paths | Model has no timeout action; only Committed→Resolved via buyer | `echidna_state_monotonicity` — status only moves forward (0→1→2) | `/kernel` → /papers/asymmetric-bonding (the Escape-Hatch Weakness theorem); `/faq` → "no admin, no owner, no pause function" |
| K-5 | Monotonic accumulator ($cumulativeValue$ only increases) | `uint256 actualCumulative = ps.cumulativeValue + c.payment` + `CumulativeValueMismatch` revert | `FigaroCoreTest`: accumulator tests | `CumulativeIntegrity` — $cumulativeValue = \sum(payment)$ | `echidna_cumulative_accounting` — accumulator = sum(payment) | `/kernel` → /papers/asymmetric-bonding (cumulative bonding); `/spec` → Kernel (`FigaroCore.sol`) |
| K-6 | No internal ledger — direct ERC-20 transfer at resolution | `currency.safeTransfer(seller, 2*cumVal + payment)` + `currency.safeTransfer(buyer, payment)` | `FigaroCoreTest`: payout assertions; `FigaroCoreEventEmissionTest`: OrderResolved events | Not modeled (TLA+ abstracts transfer mechanics; wallets model is sufficient) | — | `/kernel` → resolution pays out directly, no internal ledger; `/spec` → Kernel (`FigaroCore.sol`) |
| K-7 | Per-process immutable token binding | `if (c.currency != address(ps.currency)) revert CurrencyMismatch()` on sub-orders | `FigaroCoreRevertBranchTest`: currency mismatch revert | Implicitly via single-currency model | — | `/spec` → Kernel (`FigaroCore.sol`) |
| K-8 | Both parties sign off-chain via EIP-712 typed data | `ECDSA.recover(digest, buyerSig)` + `ECDSA.recover(digest, sellerSig)` checks in `commit()` | `FigaroCoreTest`: signature verification; SDK `commitments.test.ts`: EIP-712 domain/typed-data build. SDK↔Solidity parity is unconditional: `sdk/tests/eip712Parity.test.ts` freezes SDK-computed vectors, `test/kernel/Eip712ParityTest.t.sol` asserts the kernel reproduces every hash (domain separator both ways, `hashStruct`, digest, order hash) — runs in sdk-ci + foundry-ci with no chain; the skipIf-gated `integration.test.ts` round-trip is the redundant belt | Not modeled (TLA+ abstracts signature mechanics) | — | `/sign` → commitment signing UI |
| K-9 | `orderHash = keccak256(processId ‖ structHash)`, content-addressed | `bytes32 orderHash = keccak256(abi.encodePacked(processId, structHash))` + `if (orderStatus[orderHash] != 0) revert DuplicateCommitment()` — a defensive backstop: every identical-commitment replay is preempted earlier (`ProcessAlreadyExists` at the root; `CumulativeValueMismatch` on sub-orders, since the accumulator has strictly moved) | `FigaroCoreRevertBranchTest`: replay-preemption tests pin the preempting error on both paths; SDK `integration.test.ts`: live-chain acceptance of an SDK-built commitment (hash parity, skipIf-gated) | Not directly modeled (TLA+ uses sequential IDs) | — | `/spec` → Kernel (`FigaroCore.sol`) |

---

## 4) Accounting invariants → enforcement map

| ID | Statement | Code enforcement | Tests | TLA+ | Echidna | UI presentation |
|---|---|---|---|---|---|---|
| A-1 | Sum of wallets + contract balance = initial total supply | Ledger is explicit in transfer flows (`_pullExact` in, `safeTransfer` out) | `FigaroCoreTest`: conservation assertions across lifecycle | `TokenConservation` — verified across 6M+ states | `echidna_token_conservation` — totalSupply constant | Not directly presented (infrastructure invariant) |
| A-2 | Contract balance ≥ 0 | Solidity `uint256` prevents negatives; explicit transfer-out bounded by holdings | `FigaroCoreTest`: solvency checked post-resolution | `ContractSolvency` — verified | `echidna_solvency` | Not directly presented |
| A-3 | No participant goes below zero | Solidity `uint256`; ERC-20 `safeTransfer` reverts on insufficient balance | `FigaroCoreRevertBranchTest`: insufficient balance reverts | `WalletNonNegative` — verified | — | Not directly presented |
| A-4 | Per-process $cumulativeValue = \sum(order.payment)$ | `actualCumulative = ps.cumulativeValue + c.payment` with mismatch revert | `FigaroCoreTest`: accumulator arithmetic | `CumulativeIntegrity` — verified | `echidna_cumulative_accounting` | `/spec` → Kernel (`FigaroCore.sol`) |
| A-5 | Per-process $activeCount = count(committed)$ | `ps.activeOrderCount++` on commit, `ps.activeOrderCount--` on resolve with count match | `FigaroCoreTest`: multi-order lifecycle | `ActiveCountCorrect` — verified | `echidna_active_count_consistent` | Not directly presented |
| A-6 | Contract can resolve any active process | Follows from A-1 + A-2 + bond calculation | `GasCeilingTest`: the resolveProcess per-order gas regression guard (~23k warm marginal, mirrored in the frontend's gas ceilings) | `ResolutionAlwaysPossible` — verified | — | Not directly presented |
| A-7 | Fee-on-transfer token rejection | `_pullExact`: `uint256 received = after - before; if (received != amount) revert FeeOnTransferDetected()` | `FigaroCoreRevertBranchTest`: fee-on-transfer token test (`MockERC20FeeOnTransfer`) | Not modeled (TLA+ abstracts ERC-20 mechanics) | — | `/spec` → Kernel (`FigaroCore.sol`) |
| A-8 | Held deposits = 2×payment (buyer) + 2×cumulativeValue (seller) per committed order | `commit`: `_pullExact` pulls `c.payment * 2` from the buyer and `c.expectedCumulativeValue * 2` from the seller | `FigaroCoreTest`: `test_sellerBond_scalesWithCumulativeValue` | `DeterrentEscrowMagnitudes` — verified | — | `/invariants`, `/kernel` |
| A-9 | Resolution moves exactly `payment` buyer → seller; both bonds return whole | `resolveProcess`: seller receives `2*cumulativeValue + payment`, buyer receives `payment` | `FigaroCoreTest`: `test_resolution_payouts_progressiveCollateral`, `test_solvency_contractBalanceZeroAfterResolve` | `SettledNetPositions` — verified | — | `/invariants`, `/kernel` |

---

## 5) Composition invariants → enforcement map

| ID | Statement | Code enforcement | Tests | UI presentation |
|---|---|---|---|---|
| E-1 | Only verified role-holder can attest | `attestAsSeller`: verifies seller via commitment orderHash lookup; `attestAsBuyer`: verifies via ProcessState.rootBuyer; `attestViaResolver`: delegates to IRoleResolver | `AttestationCoordinatorTest`: all 3 paths + cross-order same-process | `/papers/on-chain-evidence` → evidentiary properties; `/spec` → Attestation & clause |
| E-2 | Registered clauses cannot be overwritten | `registerClause`: first-write-wins storage — three mappings, incl. `contentHashOf` (load-bearing for the batch path's content validation); dedup guard rejects re-registration | `ClauseRegistryTest`: registration, dedup, deposit + withdraw paths | `/clauses` → Writing a clause. |
| E-4 | Member stake = staked intent (K4), reclaimed in TWO steps: `requestWithdrawal()` de-surfaces IMMEDIATELY (guard cleared, re-registration allowed at once), `withdraw()` releases the ETH only after `withdrawalCooldown`. The cooldown is what makes the stake price identity rather than rent it — without it one stake serves N identities in sequence | `register()`: stake-bound match + dedup guard; `requestWithdrawal()`: requires registered, clears the guard, accrues `pendingDeposit` + sets `releaseAt`; `withdraw()`: requires something pending and `block.timestamp >= releaseAt`, else `NothingPending` / `CooldownActive`. `updateProfile()` is a separate caller-only path that emits `MemberProfileUpdated` without touching the stake | `MembersRegistryTest`: register, stake-bound match, dedup, de-surface-at-request, cooldown-gates-the-claim, immediate re-registration costs a SECOND stake, repeated requests accumulate + restart the clock, double-claim refused, zero-cooldown and zero-stake degenerate cases, fuzz `everyDepositIsEventuallyClaimable` (nothing strandable); e2e `member-withdraw.devnet.spec.ts` (UI drives BOTH steps + exact registry ETH delta, and asserts the ETH does NOT move at step 1) | `/members`; `/spec` → Optional protocol contracts (`MembersRegistry.sol`) |
| E-5 | The four stake properties the economic Sybil bound `deposit · N · T / P` rests on. Proving them does NOT prove the deposit is big ENOUGH — that is the Tullock rent-dissipation argument and stays paper work. It proves the machine that argument describes is the machine that shipped | `MembersRegistry`: exact-value `register` + dedup guard (solvency, and no path from locked ETH to a fresh registration); `requestWithdrawal` clears `_registered` and books `pendingDeposit` without touching it on re-register (no recycling ⇒ the `N` term survives); `withdraw` never re-registers (eligibility ends at REQUEST ⇒ the `T` term survives); `UsageCounter._accrue` / `applyBatchAccrual` gate on `members.registered` (the linkage) | **Halmos `HalmosMembersRegistry` — 7 symbolic properties, pass 3/6 of `scripts/test-halmos.sh`**: solvency under arbitrary two-member interleavings, pending-always-claimable-in-full, re-registration costs a SECOND deposit, locked ETH cannot fund a registration, de-surfacing at request + no self-heal on claim, the cooldown cannot be skipped for any instant before `releaseAt`, and the counter admits usage iff the stake is live. The two anti-recycling properties were MUTATION-CHECKED (a deliberate recycling bug produces counterexamples), so they are load-bearing rather than vacuous. Concrete companions in `MembersRegistryTest` + `UsageCounterTest.test_sellerLeavingTheRegistryStopsCounting` | `/members` leave/claim flow — the UI drives both steps and the ETH moves only at step 2 |
| E-6 | Florin supply cap: $\leq$ 1B on every mint | `mint()`: `if (totalSupply() + amount > MAX_SUPPLY) revert SupplyCapExceeded()` + reentrancy guard | `FlorinToken.t.sol`: cap enforcement, multi-minter, renounce | `/papers/florin-schelling-point-token` → supply integrity |
| E-7 | Batch-settled trade counts for the 600M, and counts ONCE. The two settlement universes are disjoint (a batch-settled process never acquires kernel status), so the accrual crosses as PROVED numbers: only `FigaroBatchVerifier` may write it, only with values an immutable vkey committed. Idempotence is guest-owned and holds ACROSS batches because the counted set rides the batch state root. The two paths merge as SCORES — never components, which would over-count breadth for a pair active on both | `applyBatchAccrual()` in `UsageCounter` — `msg.sender == batchVerifier`, `period == currentPeriod()`, provenance-key match, live `members.registered` per distinct seller (reverts — caught by the verifier), a live clause-or-assembly registration deposit AND `excludedClauseOrAssembly` SKIPPED per clause or assembly (never revert — audit Fix 1a/1c), non-decreasing counts, empty accrual = no-op (so settlement outlives the reward). `settleBatch()` in `FigaroBatchVerifier` — `_hashUsage` re-derives the 8th public value from calldata, BOTH array lengths length-prefixed so the split cannot be forged; the accrual call is wrapped in try/catch (`BatchAccrualSkipped`) so a reward-gate revert NEVER unwinds the token settlement, and the sequencer pre-filters poison usage claims (excluded/unregistered/unstaked) against chain state before proving so the catch fires only on the genuine stake-race. Guest (`prover/lib/src/kernel.rs::apply_usage_claims`): post-state `orderStatus == 2`, merkle inclusion against the signed `agreementHash`, `usage_counted` insert-or-reject | Rust `prover/lib/tests/usage.rs` (same-batch credit, unresolved reject, not-in-agreement reject, cross-batch replay reject, breadth vs depth, assembly-via-provenance, wrong-composition reject, hash covers period/provenance/sellers, length-prefix anti-collision, root advances, cross-language vector); Foundry `UsageCounterTest` (writer gate, period, member stake of the seller of record, exclusion, provenance, monotonicity, overwrite-not-accumulate, empty-after-close liveness, score-merge + superadditivity) and `FigaroBatchVerifierTest` (accrual reaches the counter — read back from counter storage, tampered accrual rejected, a counter-rejection is CAUGHT so the batch still settles its positions + advances state with the accrual dropped — `test_settleBatch_settlesEvenWhenTheCounterRejectsTheAccrual`, settles after accrual closes, Rust vector matches the contract's assembly); `UsageCounterTest` also covers the clause-or-assembly registration gate (direct-path `ClauseOrAssemblyNotRegistered`, batch-path skip of excluded + unregistered); SDK `rpgf.test.ts` (both-stream fold, replace-not-accumulate); `batch-e2e.test.ts` settles through a real sequencer + counter | `/rewards` shows both paths' components and the merged `scoreOf` — the figure the minter actually pays |
| E-8 | A `private`-disposition section's plaintext never reaches a PUBLIC surface — the standalone public IPFS pin or the shareable audit bundle. The chain sees only the section FINGERPRINT (the merkle leaf), so `agreementHash` is unchanged whether the section carries plaintext or is withheld | SDK `publicForm(agreement, specs)` (`projection.ts`) content-withholds every section whose spec is LOADED and declares a private field (identical merkle leaf → same root) — FAIL-CLOSED: a section with an UNKNOWN spec is ALSO withheld, because a permissionlessly-registered clause could be private and keeping it plaintext would leak on any cold-cache pin (notably the RECEIVER re-pin, which never loaded the clause). To avoid over-redacting known-public clauses, `publishAgreement` (`frontend/lib/kernel/agreementFetch.ts`) WARMS the agreement's clause specs (`warmAgreementSpecs` → `ClauseRegistered` log scan → `loadClauseSpec`, only for specs actually missing) before projecting, so with the cache warm the fail-closed form is EXACT; if warming fails it over-redacts rather than leaking. The audit bundle renders a withheld section's body as absent automatically; `parseClauseSpec` REJECTS a clause mixing public + private field dispositions (the leaf model withholds a whole section, never one field). The signed + counterparty-relayed forms keep plaintext (Arm 2 encrypts that relay leg) | SDK `projection.test.ts` (withholds private, keeps public plaintext, preserves `agreementHash`, withholds an unknown-spec section fail-closed, `specHasPrivateField`); `spec.test.ts` (mixed-disposition rejected, all-private accepted) | `/data` → the disposition seam ("public = coordination commons, private = paid edge behind the fingerprint") |

---

## 6) Protocol features — UI presentation coverage

This section tracks features that are not protocol invariants but are significant protocol capabilities. The purpose is to ensure every implemented feature is visible to users somewhere.

| Feature | Code location | SDK coverage | UI explainer pages | UI functional surfaces | Gap? |
|---|---|---|---|---|---|
| **Handoff encryption (ECDH)** | `frontend/lib/handoff/` | `@figaro-protocol/sdk/handoff` (ecdh, auth, messages) | — | `AddressDetailPanel` + `ContentDeliveryPanel` (`components/runtime/` — the `ecdh-address` / `ecdh-content` ceremony surfaces) | — |
| **Proximity evidence** | `frontend/lib/handoff/` — the handoff clause runtime | `@figaro-protocol/sdk/derive`: `geohashesMatch`, `haversineDistance` | `/spec` → Attestation & clause | `GeohashFieldInput` (`components/runtime/` — device-location geohash capture), `/evidence-display` | — |
| **DID:web identity** | `frontend/lib/agent/useDidWeb.ts` | `@figaro-protocol/sdk/agent`: `resolveDidWeb`, `didWebToUrl`, `didDocumentMatchesAddress`, `buildSellerDidDocument` | `/spec` → Optional protocol contracts (`MembersRegistry.sol`) | `MemberAgentIdentity` (`components/members/` — resolves the DID Document and checks it names the seller's address) | — |
| **Kleros dispute / evidence** | `frontend/lib/audit/` + `frontend/lib/semantic/processRecourse.ts` | — (frontend-local; SDK carries no Kleros helpers) | `/spec` → Composition | `/evidence-display` (full rendering for jurors) | — |
| **Agent SDK** | `sdk/` (root + `/agent`, `/derive`, `/clauses`, `/handoff`, `/signer`) | Self-referential (`npx vitest run` in `sdk/` is the census) | `/spec` → The sequencer (SDK README) | — | — |
| **Semantic derivation** | `frontend/lib/semantic/` | — | `/assemblies` → How one is composed. | `TopologyCanvas` in the design canvas (`/assemblies/designer/*`); `CapabilityRail` + `RecoursePanel` at runtime | — |
| **Institution assembly** | `frontend/lib/designer/`; `src/protocol/registries/AssemblyRegistry.sol` | — | `/assemblies` → Document-anchored, not catalogue-listed. | `/assemblies/designer/new`, `/assemblies/designer/edit?slug=<slug>`, `/assemblies/designer/view?slug=<slug>` | — |
| **Agreement publication** | `frontend/lib/kernel/agreementFetch.ts`, `@figaro-protocol/sdk` `projection.ts` | — | `/assemblies` → What the composition hash covers. | — | — |
| **Commerce checkout** | `frontend/lib/checkout/` | — | — | `/s/checkout` (`CheckoutView` + `CartLineList`); `YourTurnBadge` (header signal for orders awaiting this wallet's counter-signature) | — |
| **Process topology** | `frontend/lib/semantic/processTopology.ts` | SDK: `reconstruct()`, `Topology` | `/assemblies` → How one is composed. | `TopologyCanvas` (`/assemblies/designer/new`, `/assemblies/designer/view?slug=<slug>`) | — |
| **Bond math** | `sdk/src/bonds.ts` | SDK: `calculateBonds`, `calculateSettlement` | `/spec` → Kernel (`FigaroCore.sol`) | checkout/order surfaces render via the SDK | — |
| **Single-currency binding** | `src/kernel/FigaroCore.sol` | — | `/spec` → Kernel (`FigaroCore.sol`) | — | — |
| **Fee-on-transfer rejection** | `src/kernel/FigaroCore.sol` `_pullExact()` | — | `/spec` → Kernel (`FigaroCore.sol`) | — | — |

---

## 7) TLA+ formal models — current posture

Four models: `FigaroCore.tla` (detailed below), `FlorinToken.tla` (its 8
invariants are the E-6 rows), `WitnessSwapAndCommitCoordinator.tla` and
`SettlementUniverses.tla` (both detailed below; harness inventory + state counts:
`TESTING.md` § TLA+).

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
- Buyers: 2, Sellers: 2, InitialBalance: 30, Payments: 1–3
- MaxProcesses: 2, MaxSubOrders: 2
- All 9 invariants enabled, deadlock checking disabled (bounded slots)

**What this configuration is — the primitive framing:** the
small config is exhaustive STATE-MACHINE COVERAGE of the primitive's operations —
two buyers and two sellers exercise every transition and interference class the
kernel has — never bounded sampling of an N-body space. There is no N in the
primitive: the payoff comparison at any chain position depends only on that
position's (payment, cumulative) pair, the coupling between positions is the one
monotone accumulator scalar, and the arbitrary-N claim reduces definitionally to
the per-position two-party claim (the Lean `Chain` theorems are that reduction,
machine-checked). N lives in the graph tier above the primitive.

**Verification result:**
- 9/9 invariants verified, exit code 0
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
| `DeterrentEscrowMagnitudes` | A-8 (the deposits are 2× on both sides) | ✅ Verified |
| `SettledNetPositions` | A-9 (exactly `payment` moves; bonds return whole) | ✅ Verified |

### Model file: `formal/WitnessSwapAndCommitCoordinator.tla`

The swap-funded on-ramp at EVM-step granularity (explicit revert frames, so
"swap landed, commit didn't" states are reachable and proved never quiescent).
ECDSA/EIP-712/Permit2 digest validity abstracted; route substitution is NOT
assumed away — it is the modeled attack (`Inv_WitnessRouteBinding`).

| TLA+ invariant | Maps to |
|---|---|
| `Inv_Conservation`, `Inv_NonNegative`, `Inv_TypeOK` | A-1/A-2-class conservation across payer/venue/coordinator/Core |
| `Inv_ZeroRetention` | Coordinator holds 0 of every token at every quiescent state (full output forwarded, input residual refunded) |
| `Inv_AllowanceHygiene` | No standing coordinator→router allowance survives a call (`forceApprove(router, 0)`) |
| `Inv_Atomicity` | A swap moved value in a call **iff** the commit landed (incl. kernel-side `InvalidRootCumulativeValue` revert after the swap) |
| `Inv_BondFormula`, `Inv_CoreEscrowExact` | K-1 at the coordinator seam — Core ends holding exactly the doubled bonds of landed orders |
| `Inv_WitnessRouteBinding` | No route executes that the paying party did not sign (the predecessor bug the witness variant exists to close) |
| `Inv_CoordinatorNotCounterparty` | Kernel parties stay the EIP-712 signers; the coordinator supplies the tokens in place |

Mutation-checked: 6 deliberate Next-relation bugs, each caught by exactly its
target invariant.

### Model file: `formal/SettlementUniverses.tla`

The CROSS-CONTRACT model: FigaroCore + FigaroBatchVerifier + UsageCounter +
the off-chain guest kernel under arbitrary interleavings — the only harness that
can see where the two paths meet (every other layer is per-contract). 21 invariants (AccrualNeverOverPays is a defined alias of BatchWriteReplacesNeverAdds, not a separate check); the load-bearing rows:

| Property | Code | Formal |
|---|---|---|
| An order resolved on the batch path never acquires kernel status; `orderStatus` gates are blind to batched trade | `FigaroBatchVerifier.settleBatch` (no kernel write) | `KernelBlindToBatch`, `BatchInvisibleToKernelGates` |
| The same signed commitment cannot resolve on both paths | EIP-712 domain separation: `FigaroBatchVerifier.sol` `pv.verifyingContract == address(this)` vs the kernel's own domain; processId IS the typed-data digest | `NoDoublePayout`, `UniverseDisjointOrders` — carried by **`AssumeDomainSeparation`** (CONTRACT-ENFORCED; flipping it violates 4 invariants) |
| Token conservation + pool disjointness across kernel + verifier | per-order exact deposits both sides | `TokenConservation`, `CoreExactEscrow`, `VerifierExactEscrow`, `ResolutionAlwaysPossible` |
| `scoreOf == direct + batch`; the bridge write REPLACES the cumulative pair | `UsageCounter.applyBatchAccrual` | `ScoreComposition`, `ScoreCacheCorrect`, `TotalScoreIntegrity`, `BatchWriteReplacesNeverAdds` (unconditional) |
| A resolved process is counted toward a clause or assembly on exactly one path | `UsageCounter` direct-path gate + guest-owned idempotence | `ProcessCountedInOneUniverse` — carried by `AssumeDomainSeparation` |
| A dropped batch accrual under-pays, never over-pays; the loss is permanent at process granularity (recovered only at clause-or-assembly granularity) | `settleBatch`'s try/catch around `applyBatchAccrual` + the guest's global counted set | `AccrualNeverOverPays` (unconditional) vs `AccrualNotLost` — carried by **`AssumeAccrualGatesAligned`** (NOT contract-enforced — the documented conservative-under-pay posture, now pinned precisely) |

Both assumptions ship TRUE in the `.cfg`; flipping either to FALSE is the
model's experiment and is EXPECTED to fail. Mutation-checked: 5 mutations + 7
non-vacuity witnesses, each caught.

Known cost, accepted: `SettlementUniverses.cfg` ships `MinSellers=1`; the
minimum-support floor case runs as a second green pass at `MinSellers=2`
(both at once needs >31M states). `AssumeAccrualGatesAligned` is not
contract-enforced — a dropped batch's accrual is forgone at process granularity,
under-pay only.

---

## 8) Echidna fuzzing — current posture

### Harness: `src/echidna/EchidnaFuzzer.sol`

**Fuzzed actions:**
- `action_commitRoot`, `action_commitRoot_buyer2`, `action_commitSub`, `action_commitRootAndSub`
- `action_resolve`, `action_resolve_wrong_sender`, `action_resolve_incomplete`
- `action_mint_buyer`, `action_mint_buyer2`, `action_mint_seller`

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

### Harnesses: `test/kernel/HalmosFigaroCore.t.sol` + `test/protocol/registries/HalmosMembersRegistry.t.sol` + `test/protocol/usage/HalmosUsageCounter.t.sol` + `test/protocol/registries/HalmosClauseAndAssemblyRegistries.t.sol`

Halmos performs symbolic execution of Solidity bytecode using SMT solvers
(z3/yices). Unlike Echidna (which searches for counterexamples via fuzzing),
Halmos proves properties hold for ALL possible inputs by constructing and
solving symbolic constraints.

This closes the verification gap between TLA+ (which verifies the abstract model)
and Foundry/Echidna (which test concrete/random scenarios). Halmos proves the
actual compiled bytecode satisfies the invariants.

### Properties proved

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

**HalmosMembersRegistry (7 properties)** — the stake-machine proofs behind invariant E-5; the per-property map is the E-5 row in §5.

**HalmosUsageCounter (6 properties)** — the accrual arithmetic on top of
the E-5 stake gate (which is NOT re-proved here): direct-path accrual monotonicity;
the batch write REPLACES cumulative `(c,d)`, never adds; `scoreOf == accrualOf.score
+ batchAccrualOf.score` (the only meeting point of the two paths);
period bucketing (every timestamp lands in exactly its window; a wrong-period claim
is rejected and the other period's slot is untouched); isolation across clauses and assemblies.
Replace-not-add and score-composition are MUTATION-CHECKED. Enters via a test-only
`UsageCounterHarness` exposing `_accrue` (public entry points require ECDSA + merkle
proofs unreachable to the solver — the same doctrine as the ECDSA workaround in
HalmosMembersRegistry).

**HalmosClauseRegistry + HalmosAssemblyRegistry (6 properties each, one file:
`HalmosClauseAndAssemblyRegistries.t.sol`)** — the designer-side stake machines
`RpgfMinter._isAuthor` reads at claim: deposit solvency under arbitrary
interleavings by two registering wallets; live stakes withdrawable in full; first-write-wins
permanence (no second registration ever succeeds, for ANY caller); one-shot
withdrawal; eligibility ends at withdraw with nothing restoring it; cross-key
isolation. Solvency and first-write-wins MUTATION-CHECKED on both contracts
(4/4 mutations produced counterexamples).

**All proved, none failed. Typical wall time ~63s solver total across the six
passes.**

Per-property times vary significantly between runs (Z3's search path is
non-deterministic). `check_resolutionPayouts` — the only property that
exercises the full commit + resolve lifecycle symbolically (2 ECDSA recoveries,
multiple keccak256 instances, 4 ERC-20 transfers) — is especially sensitive
— batched with the other 6 properties in one `halmos` process it can exceed a
5-minute per-assertion ceiling.
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

The wrapper (`scripts/test-halmos.sh`) checks for both prerequisites, runs the suite
in six passes: the 6 fast FigaroCore properties batched in one `halmos` process,
`check_resolutionPayouts` in a second, fresh process, then the 7
`HalmosMembersRegistry`, 6 `HalmosUsageCounter`, 6 `ClauseRegistry`, and 6
`AssemblyRegistry` properties in their own passes. Per-assertion
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

**AttestationCoordinator (4 declared rules — the commitment-arg ABI + merkle-proof receipt binding)**

| CVL rule | Maps to | Type |
|---|---|---|
| `nonBuyerCannotAttestAsBuyer` | E-1 | Targeted revert rule — `msg.sender != c.buyer ⟹ revert` (c.buyer == rootBuyer by commit invariant) |
| `successfulBuyerAttestationImpliesBuyer` | E-1 | Contrapositive — successful call ⟹ `msg.sender == c.buyer` |
| `attestationCannotChangeOrderStatus` | K-4 | Parametric (`filtered { f -> f.contract == currentContract }`) |
| `attestationCannotChangeProcessState` | K-4, K-7 | Same filter |

The coordinator is merkle-only: it merkle-binds each attestation to its signed agreement and content-hash-binds the evidence (`contentRef == keccak256(content)`), and validates no content shape.

Foundry-covered companion:
- `testFuzz_contentRefIsKeccakOfContent` — emitted `contentRef` equals `keccak256(content)` for arbitrary bytes

**FlorinToken (7 sub-rules from 6 declared) — `rule_sanity: none` (vacuity heuristic not meaningful for these state-invariant claims)**

| CVL rule | Maps to | Type |
|---|---|---|
| `totalSupplyWithinMaxSupply` | E-6 | Inductive preservation rule |
| `totalRegisteredCapWithinMaxSupply` | E-6 | Inductive preservation rule |
| `totalRegisteredCapMonotonic` | E-6 | Parametric (never decreases) |
| `deployerMintRenouncedIsOneWayLatch` | — | One-way latch preservation |
| `minterCapImmutable` | E-6 | Per-minter immutability |
| `minterMintedWithinCap` | E-6 | Inductive (unconditional `minted <= cap`, strictly strong enough to exclude symbolic unreachable pre-states) |

**RpgfMinter (8 declared rules — deps summarized via ghosts/wildcard dispatch)**

| CVL rule | Maps to | Type |
|---|---|---|
| `mintedNeverExceedsPeriodBudget` | E-6 (600M budget) | Inductive conservation — the tranche-overdraw bug class |
| `noDoubleClaimPerWalletPerPeriod` | E-5/E-6 | State-machine guard |
| `cannotClaimWhilePeriodOpen` | E-6 | Period gating |
| `duplicateClauseOrAssemblyReverts` | E-6 | Input-hygiene guard (the historical exploit path) |
| `ineligibleClauseOrAssemblyCannotBePaid` | E-5 | The live-stake `_isAuthor` gate — a withdrawn stake pays nothing |
| `mintedMonotonic` | E-6 | Parametric (never decreases) |
| `claimableRejectsDuplicatesToo` | — | View/state parity |
| `claimableReturnsZeroForAlreadyClaimedWallet` | — | View/state parity |

Mutation-checked (conservation, double-claim, eligibility): each rule
FAILED against a deliberately broken contract, then passed clean after revert —
load-bearing, not vacuous.

### Status

**All green** — the full suite verifies with `--wait_for_results all`
(exit 0 = every rule verified; every `Violated` line in the stream is the
`rule_not_vacuous` healthy polarity). Which run, when, and the report URLs:
`AUDITOR_HANDOVER.md` § "Formal run evidence".

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
| `bonds.test.ts` | Bond calculations (2×), payouts at resolution, approval amounts, validation | K-1, K-5 |
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

`TESTING.md` owns the harness inventory and every count with it. The volatile
suites (Foundry / SDK / frontend / Playwright) store NO counts anywhere either —
the count is derived, never stored; run the command in the Census column. This
table maps each layer to what it covers.

| Layer | Census | What it covers |
|---|---|---|
| **TLA+ model checking** | `TESTING.md` § TLA+ — `./scripts/test-tla.sh` | Kernel safety (conservation, solvency, bonding, atomicity, resolution) + florin token registry (max supply, minter cap, non-negative, no-mint-to-zero, balance-sum-to-supply, cap-below-max-supply, supply-equals-sum-minted, deployer-cannot-mint-after-renounce) + the swap-funded on-ramp (zero retention, swap↔commit atomicity, allowance hygiene, witness route binding, exact kernel deposits) + the two paths composed (no cross-path double payout, per-pool deposits, score composition, kernel blindness) |
| **Halmos symbolic testing** | `TESTING.md` § Halmos — `./scripts/test-halmos.sh` | FigaroCore (7): token conservation, contract solvency, bond amounts, resolution payouts, status transition, buyer dominance, cumulative monotonicity. MembersRegistry (7): the stake-machine properties behind E-5. UsageCounter (6): the accrual arithmetic — batch-replace-not-add, score composition across the two paths, period bucketing, isolation. ClauseRegistry + AssemblyRegistry (6 each): the designer-side stake machines designer-reward eligibility reads. |
| **Certora formal verification** | `TESTING.md` § Certora — `./scripts/test-certora.sh` | FigaroCore: state-machine invariants. AttestationCoordinator: role-gate correctness + Core immutability (merkle-only — no content-shape validation). TokenOpsVerification: universal balance-flow proofs for FigaroCore commit + single-order resolve. FlorinToken: supply cap + minter registry preservation. BatchVerifierTokenOps: batch-path token-flow invariants. RpgfMinter: mint conservation, no-double-claim, duplicate rejection, live-stake eligibility. |
| **Echidna fuzzing** | `TESTING.md` § Echidna — `./scripts/test-echidna.sh` | `EchidnaFuzzer` Kernel (7): solvency, monotonicity, buyer dominance, atomicity, cumulative accounting, conservation, active-count consistency. `EchidnaFlorinToken` (8): FlorinToken supply/minter fuzzing. (`EchidnaToken` is the kernel harness's support ERC-20, not a harness.) |
| **Foundry unit tests** | derive: `forge test --via-ir` (the summary line is the census; the fork suite skips without `MAINNET_RPC_URL`) | Core lifecycle, revert branches, coordinators (incl. the Permit2 witness + its mainnet-fork parity suite), gas, florin |
| **SDK Vitest** | derive: `cd sdk && npx vitest run` | Event parsing, state reconstruction, bond math, commitments, discovery, clauses, swap-funding witness parity, agent origination |
| **Frontend Vitest** | derive: `cd frontend && npx vitest run` | Components, hooks, semantic derivation, assembly, runtime identity |
| **Playwright** | derive: `cd frontend && npx playwright test --list` | Devnet e2e (UI action → UI reaction against the live chain) + the mobile viewport spec |

---

## 13) How to run verification (repeatable)

### Foundry (the suite/test census is `forge test`'s own summary line)

```bash
forge test --via-ir
```

### Halmos

```bash
./scripts/test-halmos.sh
```

Prereqs (one-time): `brew install z3 && pipx install halmos`.

### Certora (requires API key)

```bash
export CERTORAKEY=<key from certora.com/signup>
./scripts/test-certora.sh        # wrapper: checks prereqs and runs all specs
```

### Echidna

```bash
./scripts/test-echidna.sh
```

Prereqs: `brew install echidna`.

### TLA+ model checking

```bash
./scripts/test-tla.sh
```

Prereqs: Java 11+, and `tla2tools.jar` downloaded once into `formal/`
(see the script header for the exact `curl` command).

### SDK tests

```bash
cd sdk && npm test
```

### Frontend Vitest

```bash
cd frontend && npx vitest run
```

### Frontend Playwright

```bash
cd frontend && npx playwright test --project=devnet  # Anvil required
```

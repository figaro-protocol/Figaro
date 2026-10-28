# Verification Map (Theory → Code → Tests → TLA+ → UI)

## 0) Purpose

This document ties every protocol property to its enforcement across five layers:

- **Theory** — the game-theoretic invariant (from THEORY.md)
- **Code** — what is actually enforced on-chain (Solidity)
- **Tests** — what is regression-checked (Foundry, Echidna, the Rust suites, SDK Vitest)
- **TLA+** — what is exhaustively model-checked (models and their counts: `TESTING.md` § TLA+)
- **Halmos** — what is symbolically proved at the bytecode level (z3 solver)
- **Certora** — what is formally verified via SMT-based proving (state-machine rules)
- **UI** — where the feature is explained or rendered for users (pages, sections)

The UI column exists to prevent presentation gaps — features enforced in code but invisible to the people using them.

Every check named in this document exists in the tree under the name given here (a
Foundry contract, a test function, an Echidna property, a TLA+ invariant, a CVL rule,
a test file). Where a check runs, and what shows it is load-bearing:

| Layer | Command | Runs | Fails under a mutation |
|---|---|---|---|
| Foundry | `forge test --via-ir` | the pre-commit hook; `foundry-ci` on every push, the fork tests included | `mewt` over every contract in scope: 912 mutants, 904 caught, 8 survivors each read as unreachable or equivalent (`AUDITOR_HANDOVER.md` § "Mutation testing, Solidity") |
| Halmos | `scripts/test-halmos.sh` | `foundry-ci` | the properties marked MUTATION-CHECKED in §9 (MembersRegistry 2, UsageCounter 2, the two designer registries 4); the seven `HalmosFigaroCore` properties are not mutation-checked |
| Certora | `scripts/test-certora.sh` | the maintainer's gate — needs `CERTORAKEY`, never CI | `RpgfMinter`'s conservation, double-claim and eligibility rules and all three `BatchVerifierStateRoot` rules (§10); the other five specs are not mutation-checked |
| Echidna | `scripts/test-echidna.sh` | the gate | not mutation-checked |
| TLA+ | `scripts/test-tla.sh` | the gate | `WitnessSwapAndCommitCoordinator` 6 mutations, `ResolutionUniverses` 4 mutations + 4 reachability witnesses (§7), `RelayState` 12 (§7: the design switch, five lifecycle switches, five deferral switches, the resolve authorization's switch); `FigaroCore.tla` and `FlorinToken.tla` are not mutation-checked |
| Lean 4 | `lake build` in `formal/lean/` | the gate | proof-checked; a mutation is a build failure |
| Rust | `cargo test` | `prover-ci`: the guest crates on every push, the relay and the batch end-to-end on main | `cargo-mutants` over the guest crates: 617 mutants, 12 survivors each read as equivalent (`AUDITOR_HANDOVER.md` § "Mutation testing, Rust"); the relay is not mutation-tested |
| SDK Vitest | `cd sdk && npm test` | `sdk-ci` | not mutation-checked; the encoders are held by the cross-language vectors and the differential fuzz (`prover-ci`) |
| Agent runtime | `cd ecosystem-agents/runtime && npm test` | `sdk-ci` (the sandbox tests skip off macOS) | not mutation-checked |
| Frontend Vitest | `cd frontend && npx vitest run` | `frontend-ci` | not mutation-checked |
| Playwright | `cd frontend && npx playwright test --project=devnet` | `devnet-e2e-ci` runs `orders-accept` on push and the whole `devnet` project nightly | not mutation-checked |

Run evidence — when each layer last ran, at which commit, and the Certora report
URLs — is `AUDITOR_HANDOVER.md` § "Verification evidence". This document maps;
it does not log.

---

## 1) Scope

### In-scope (this document)

- **`FigaroCore`**: `src/core/kernel/FigaroCore.sol` — 2 external functions, 3 mappings, decentralized and permissionless, nothing paid to the protocol
- **Protocol compositions**: `AttestationCoordinator`, `ClauseRegistry`, `MembersRegistry`, `AgreementRegistry`, `AssemblyRegistry`, `WitnessSwapAndCommitCoordinator`
- **Florin ecosystem**: `FlorinToken` + `RpgfMinter` (implements `IFlorinMinter`; registered as a minter at genesis)
- **Formal model**: `formal/FigaroCore.tla`, `formal/MC.tla`, `formal/MC.cfg`
- **Tests**: the Foundry, Halmos, Certora, Echidna, and TLA+ harnesses, plus the SDK suite — suite, file, property, and rule counts are in `TESTING.md` (the single source)
- **Frontend**: All pages in `frontend/app/`, components, mechanism modules

### Explicitly out-of-scope

- Frontend Vitest unit tests — these test UI components, not protocol invariants (inventory in `TESTING.md`)
- Playwright E2E tests — these test UI rendering, not protocol properties

---

## 2) Invariant IDs (stable references)

### FigaroCore invariants

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
- `A-8`/`A-9` are the PAYOFF TABLE the equilibrium proof reasons over; the choosing itself — the best-response inequalities at each position and their instantiation along the chain — is machine-checked in Lean 4 over that table; subgame perfection, the second equilibrium, and co-seller selection are argued in the paper, not machine-checked (`formal/lean/FigaroEquilibrium.lean`; `TESTING.md` § Lean 4)

### Composition invariants

- `E-1` **Attestation role gating**: only verified role-holder (buyer/seller) can attest
- `E-2` **Clause immutability**: registered clauses cannot be overwritten
- `E-3` — unassigned. Ids are stable references and are never renumbered.
- `E-4` **Member stake reclaim**: de-surfacing is immediate on request; the ETH releases only after the cooldown
- `E-5` **The stake mechanics the designer-reward Sybil bound assumes**: the registry is solvent, a stake cannot be recycled across identities, eligibility ends at request time, and the counter reads exactly that gate
- `E-6` **Florin supply cap**: total minted ≤ 1,000,000,000 florins (enforced on every mint path)
- `E-7` **Batch usage is proof-gated, once-ever and route-blind**: trade resolved on the batch path counts for designer rewards only via a proof, a process counts once ever whichever route brings it, and both routes feed one tally
- `E-8` **Private-clause withholding**: a `private`-disposition clause's plaintext never reaches a public surface (public pin, audit bundle); the chain sees only the clause's data hash, so `checkoutHash` is unchanged
- `E-9` **Public-values completeness**: every persistent effect of `settleBatch` is bound by a public value the proof committed — nothing the verifier, the token, or the counter writes is outside the ten words and the five calldata hashes
- `E-10` **Deploy wiring**: every immutable and genesis parameter the deploy scripts set reads back from the deployed contracts as what the script was given
- `E-13` **Batch equivalence**: a batched process is a process in every respect a reader or a party can test — the state behind any root the verifier holds is rebuilt from the chain alone, the commitments and resolutions of batched orders are on the chain in the Core's event shape, and the buyer resolves with no third party's data
- `E-16` **Batch and Core resolve alike**: whatever resolves a process on `FigaroCore` — the buyer's key, or code the buyer's wallet installed while it held the key — resolves it on the batch path, the second as bytes the buyer's account code validates (ERC-1271), checked by the verifier at resolution; nothing else does
- `E-15` **Batched attestation discloses what a direct one discloses**: a batched attestation in its default form carries the coordinator's arguments alone — `clauseDataHash`, inclusion proof, `contentRef` — binds what a direct one binds and re-emits the coordinator's event byte for byte; the plaintext form reaches the relay only at the attesting party's choice, and the relay writes no attestation content to its logs, state or routes

---

## 3) FigaroCore invariants → enforcement map

| ID | Statement | Code enforcement | Tests | TLA+ | Echidna | UI presentation |
|---|---|---|---|---|---|---|
| K-1 | Buyer bond = $2 \times payment$; seller bond = $2 \times cumulativeValue$ | `_pullExact(IERC20(c.currency), c.buyer, c.payment * 2)` and `_pullExact(IERC20(c.currency), c.seller, c.expectedCumulativeValue * 2)` in `commit()` | `FigaroCoreTest`: `test_sellerBond_scalesWithCumulativeValue`; Halmos `check_correctBondAmounts`; `KernelTransitionVectorsTest` harvests six scenarios from the live Core into `test/fixtures/kernel-transition-vectors.json` and `prover/lib/tests/transition_vectors.rs` replays them through the batch path's mirror — every bond pulled, every payout, every accumulator and active count asserted; SDK `bonds.test.ts`: the 2× math the frontend/agents derive from | `DeterrentEscrowMagnitudes` — the 2×payment + 2×cumulativeValue held-deposit magnitudes, a checked invariant (see A-8 and §7); bond correctness also carried by Halmos + Certora | `echidna_solvency` — core holds ≥ sum of active bonds | `/kernel` → /papers/asymmetric-bonding (mechanism); `/spec` → `FigaroCore.sol` |
| K-2 | Only root buyer can call `resolveProcess` | `if (msg.sender != ps.rootBuyer) revert NotProcessBuyer()` in `resolveProcess()` | `FigaroCoreTest`: buyer-only paths; `FigaroCore_RevertBranch`: the revert-branch suite (count derived from the file, never stored here) | — (the model's `ResolveProcess` has no caller; the buyer gate is the code's, checked by the tests and the fuzzer) | `echidna_buyer_dominance` — non-buyer resolve always fails | `/kernel` → /papers/asymmetric-bonding; `/spec` → `FigaroCore.sol` |
| K-3 | Must resolve all active orders (anti-cherry-picking) | `if (commitments.length != ps.activeOrderCount) revert IncompleteOrderList(ps.activeOrderCount, commitments.length)` + per-order status check | `FigaroCoreTest`: multi-order arrays; `FigaroCore_RevertBranch`: incomplete list reverts | `ResolveProcess` uses `ActiveOrdersInProcess` + count check | `echidna_atomic_resolution` — incomplete lists always fail | `/kernel` → /papers/asymmetric-bonding (atomic resolution); `/spec` → `FigaroCore.sol` |
| K-4 | No timeout, no admin exit from Active state | No timeout action exists; only `resolveProcess` transitions Active→Resolved; no admin functions | No named test: the absence of an exit is proved, not tested — Certora `orderStatusTransitionsAreValid`, Halmos `check_orderStatusTransition`, Echidna `echidna_state_monotonicity` | Model has no timeout action; only Committed→Resolved via buyer | `echidna_state_monotonicity` — status only moves forward (0→1→2) | `/kernel` → /papers/asymmetric-bonding (the Escape-Hatch Weakness theorem); `/faq` → "no admin, no pause function" |
| K-5 | Monotonic accumulator ($cumulativeValue$ only increases) | `uint256 actualCumulative = ps.cumulativeValue + c.payment` + `CumulativeValueMismatch` revert | `FigaroCoreTest`: `test_rootOrder_setsAccumulator`, `test_threeSubOrders_accumulatorAdvancesCorrectly` | `CumulativeIntegrity` — $cumulativeValue = \sum(payment)$ | `echidna_cumulative_accounting` — accumulator = sum(payment) | `/kernel` → /papers/asymmetric-bonding (cumulative bonding); `/spec` → `FigaroCore.sol` |
| K-6 | No internal ledger — direct ERC-20 transfer at resolution | `currency.safeTransfer(c.seller, sellerPayout)` + `currency.safeTransfer(buyer, buyerPayout)` in `resolveProcess()`, `sellerPayout = 2 × cumulativeValue + payment`, `buyerPayout = payment` | `FigaroCoreTest`: payout assertions; `FigaroCore_EventEmission`: OrderResolved events | Not modeled (TLA+ abstracts transfer mechanics; wallets model is sufficient) | — | `/kernel` → resolution pays out directly, no internal ledger; `/spec` → `FigaroCore.sol` |
| K-7 | Per-process immutable token binding | `if (c.currency != address(ps.currency)) revert CurrencyMismatch()` on sub-orders | `FigaroCore_RevertBranch`: currency mismatch revert | Implicitly via single-currency model | — | `/spec` → `FigaroCore.sol` |
| K-8 | Both parties sign off-chain via EIP-712 typed data | `ECDSA.recover(digest, buyerSig)` + `ECDSA.recover(digest, sellerSig)` checks in `commit()` | `FigaroCoreTest`: signature verification; `test_commit_signatureFromAnotherChain_reverts` — a commitment signed for this Core on another chain id is accepted there and refused here (the domain moves with `block.chainid`); SDK `commitments.test.ts`: EIP-712 domain/typed-data build. SDK↔Solidity parity is unconditional: `sdk/tests/eip712Parity.test.ts` freezes SDK-computed vectors, `test/core/kernel/Eip712ParityTest.t.sol` asserts `FigaroCore` reproduces every hash (domain separator both ways, `hashStruct`, digest, order hash) — runs in sdk-ci + foundry-ci with no chain; the skipIf-gated `integration.test.ts` round-trip is the redundant belt | Not modeled (TLA+ abstracts signature mechanics) | — | `/sign` → commitment signing UI |
| K-9 | `orderHash = keccak256(processId ‖ structHash)`, content-addressed | `bytes32 orderHash = keccak256(abi.encodePacked(processId, structHash))` + `if (orderStatus[orderHash] != 0) revert DuplicateCommitment()` — a defensive backstop: every identical-commitment replay is preempted earlier (`ProcessAlreadyExists` at the root; `CumulativeValueMismatch` on sub-orders, since the accumulator has strictly moved) | `FigaroCore_RevertBranch`: replay-preemption tests pin the preempting error on both paths; SDK `integration.test.ts`: live-chain acceptance of an SDK-built commitment (hash parity, skipIf-gated) | Not directly modeled (TLA+ uses sequential IDs) | — | `/spec` → `FigaroCore.sol` |

---

## 4) Accounting invariants → enforcement map

| ID | Statement | Code enforcement | Tests | TLA+ | Echidna | UI presentation |
|---|---|---|---|---|---|---|
| A-1 | Sum of wallets + contract balance = initial total supply | Ledger is explicit in transfer flows (`_pullExact` in, `safeTransfer` out) | `FigaroCoreTest`: conservation assertions across lifecycle | `TokenConservation` — verified across 6M+ states | `echidna_token_conservation` — totalSupply constant | Not directly presented (infrastructure invariant) |
| A-2 | Contract balance ≥ 0 | Solidity `uint256` prevents negatives; explicit transfer-out bounded by holdings | `FigaroCoreTest`: `test_solvency_contractBalanceZeroAfterResolve` | `ContractSolvency` — verified | `echidna_solvency` | Not directly presented |
| A-3 | No participant goes below zero | Solidity `uint256`; ERC-20 `safeTransfer` reverts on insufficient balance | `FigaroCore_RevertBranch`: insufficient balance reverts | `WalletNonNegative` — verified | — | Not directly presented |
| A-4 | Per-process $cumulativeValue = \sum(order.payment)$ | `actualCumulative = ps.cumulativeValue + c.payment` with mismatch revert | `FigaroCoreTest`: `test_threeSubOrders_accumulatorAdvancesCorrectly` | `CumulativeIntegrity` — verified | `echidna_cumulative_accounting` | `/spec` → `FigaroCore.sol` |
| A-5 | Per-process $activeCount = count(committed)$ | `ps.activeOrderCount++` on commit, `ps.activeOrderCount--` on resolve with count match | `FigaroCoreTest`: multi-order lifecycle | `ActiveCountCorrect` — verified | `echidna_active_count_consistent` | Not directly presented |
| A-6 | Contract can resolve any active process | Follows from A-1 + A-2 + bond calculation | No Foundry test of the invariant itself; `GasCeilingTest` guards the per-order gas of `resolveProcess` (~23k warm marginal, mirrored in the SDK's gas ceilings), which is what bounds a process the buyer can still resolve | `ResolutionAlwaysPossible` — verified | — | Not directly presented |
| A-7 | Fee-on-transfer token rejection | `_pullExact`: `uint256 received = after - before; if (received != amount) revert FeeOnTransferDetected()` | `FigaroCore_RevertBranch`: fee-on-transfer token test (`MockERC20FeeOnTransfer`) | Not modeled (TLA+ abstracts ERC-20 mechanics) | — | `/spec` → `FigaroCore.sol` |
| A-8 | Held deposits = 2×payment (buyer) + 2×cumulativeValue (seller) per committed order | `commit`: `_pullExact` pulls `c.payment * 2` from the buyer and `c.expectedCumulativeValue * 2` from the seller | `FigaroCoreTest`: `test_sellerBond_scalesWithCumulativeValue` | `DeterrentEscrowMagnitudes` — verified | — | `/invariants`, `/kernel` |
| A-9 | Resolution moves exactly `payment` buyer → seller; both bonds return whole | `resolveProcess`: seller receives `2*cumulativeValue + payment`, buyer receives `payment` | `FigaroCoreTest`: `test_resolution_payouts_progressiveCollateral`, `test_solvency_contractBalanceZeroAfterResolve` | `SettledNetPositions` — verified | — | `/invariants`, `/kernel` |
| A-10 | Every committed order is bound to its process: `orderProcessId[orderHash] == processId`, written once at commit, never changed | `commit`: `orderProcessId[orderHash] = processId` beside the status write | `FigaroCoreTest`: `test_orderProcessId_bindsEveryOrderToItsProcess` (root, sub, and an unknown order); `test_resolve_orderFromAnotherProcess_reverts` — another process's root and sub-order presented at resolve are `OrderNotCommitted` under this process id, no bond moves, the other process's bindings stand | Not modeled (the TLA+ state carries the binding as the order's identity, not a separate map) | — | `/kernel` |

---

## 5) Composition invariants → enforcement map

| ID | Statement | Code enforcement | Tests | UI presentation |
|---|---|---|---|---|
| E-1 | Only a party to the order (its seller, or the process's buyer) can attest, about a clause of the agreement it signed | `attestAsSeller`: verifies `msg.sender` is the target order's seller; `attestAsBuyer`: verifies `msg.sender` is the target order's buyer (the root buyer, by the commit rule); both look the order up by its recomputed orderHash; the batch path's `AttestAsSeller` / `AttestAsBuyer` check the recovered signer alike | `AttestationCoordinatorTest`: both paths + `test_sellerCannotAttestAgainstAnotherSellersOrder`; Rust `parity.rs` `attest_as_seller_against_another_sellers_order_fails`; the sequencer's admission, which refuses any signer but `target.seller` (`mempool_refuses_a_seller_attestation_not_signed_by_the_targets_seller`); the agreement tree's three-way lock — `sdk/tests/merkleParity.test.ts` freezes SDK-built leaves and proofs, `MerkleParityTest` verifies them with the OpenZeppelin library both on-chain consumers call, `prover/lib/tests/merkle_parity.rs` with the guest's verifier | `/papers/on-chain-evidence` → evidentiary properties; `/spec` → Attestation & clause |
| E-2 | Registered clauses cannot be overwritten. A clause key is `keccak256` of the spec's pinned canonical bytes (`computeClauseKey(spec)`), so a registered key names exactly one document; the spec's `clauseId` and `version` are presentation | `registerClause(clauseKey, contentURI)`: first-write-wins storage — `registered[clauseKey]` (never cleared; load-bearing for the batch path's content validation, which `FigaroBatchVerifier._checkSpecBindings` reads) and `depositOf[clauseKey]`; dedup guard rejects re-registration; `ZeroClauseKey`, `EmptyContentURI` | `ClauseRegistryTest`: registration, dedup, the stake and its withdrawal, zero key and empty URI, `test_twoSpecsWithOneNameAreTwoClauses`, `test_withdrawThenRegisterAnotherSpec`; SDK `clauseKeys.test.ts` and Rust `prover/script/tests/clause_keys.rs` pin every `clauses/*.json` key in `test/fixtures/clause-keys.json` to one canonicalization in both languages; `FigaroBatchVerifierTest` `test_settleBatch_revertsOnSpecBindingMismatch`, `test_settleBatch_revertsOnUnregisteredClauseBinding`; Rust `parity.rs` `attest_spec_identity_mismatch_fails`, `attest_lookalike_spec_under_the_same_name_fails` (Gate S: `keccak256(spec_json) == clause_id`) | `/clauses` → Writing a clause. |
| E-4 | Member stake = staked intent (K4), reclaimed in TWO steps: `requestWithdrawal()` de-surfaces IMMEDIATELY (guard cleared, re-registration allowed at once), `withdraw()` releases the ETH only after `withdrawalCooldown`. The cooldown is what makes the stake price identity rather than rent it — without it one stake serves N identities in sequence | `register()`: stake-bound match + dedup guard; `requestWithdrawal()`: requires registered, clears the guard, accrues `pendingDeposit` + sets `releaseAt`; `withdraw()`: requires something pending and `block.timestamp >= releaseAt`, else `NothingPending` / `CooldownActive`. `updateProfile()` is a separate caller-only path that emits `MemberProfileUpdated` without touching the stake | `MembersRegistryTest`: register, stake-bound match, dedup, de-surface-at-request, cooldown-gates-the-claim, immediate re-registration costs a SECOND stake, repeated requests accumulate + restart the clock, double-claim refused, zero-cooldown and zero-stake degenerate cases, fuzz `everyDepositIsEventuallyClaimable` (nothing strandable); e2e `member-withdraw.devnet.spec.ts` (UI drives BOTH steps + exact registry ETH delta, and asserts the ETH does NOT move at step 1) | `/members`; `/spec` → Optional protocol contracts (`MembersRegistry.sol`) |
| E-5 | The four stake properties the economic Sybil bound `deposit · N · T / P` rests on. Proving them does NOT prove the deposit is big ENOUGH — that is the Tullock rent-dissipation argument and stays paper work. It proves the machine that argument describes is the machine that shipped | `MembersRegistry`: exact-value `register` + dedup guard (solvency, and no path from locked ETH to a fresh registration); `requestWithdrawal` clears `_registered` and books `pendingDeposit` without touching it on re-register (no recycling ⇒ the `N` term survives); `withdraw` never re-registers (eligibility ends at REQUEST ⇒ the `T` term survives); `UsageCounter._accrue` / `applyBatchAccrual` gate on `members.registered` (the linkage) | **Halmos `HalmosMembersRegistry` — 7 symbolic properties, pass 3/6 of `scripts/test-halmos.sh`**: solvency under arbitrary two-member interleavings, pending-always-claimable-in-full, re-registration costs a SECOND deposit, locked ETH cannot fund a registration, de-surfacing at request + no self-heal on claim, the cooldown cannot be skipped for any instant before `releaseAt`, and the counter admits usage iff the stake is live. The two anti-recycling properties were MUTATION-CHECKED (a deliberate recycling bug produces counterexamples), so they are load-bearing rather than vacuous. Concrete companions in `MembersRegistryTest` + `UsageCounterTest.test_sellerLeavingTheRegistryStopsCounting` | `/members` leave/claim flow — the UI drives both steps and the ETH moves only at step 2 |
| E-6 | Florin supply cap: $\leq$ 1B on every mint | `mint()`: `if (totalSupply() + amount > MAX_SUPPLY) revert SupplyCapExceeded()` + reentrancy guard | `FlorinToken.t.sol`: cap enforcement, multi-minter, renounce | `/papers/florin-schelling-point-token` → § 5, the token |
| E-7 | Batch-resolved trade counts for the 600M, counts ONCE, and counts the same as direct trade. The two paths share no state (a batch-resolved process never acquires `FigaroCore` status), so the uses cross as PROVED entries: only `FigaroBatchVerifier` may hand them over, only with uses an immutable vkey committed. The counter counts each through `_count`, the path the direct calls take, into ONE tally per (kind, key, period) with ONE counted-process set and ONE per-period seller set, so `c` counts a process once and `d` a seller once across both routes and the score never depends on the route | `applyBatchAccrual()` in `UsageCounter` — `msg.sender == batchVerifier`, `period == currentPeriod()`, provenance-leaf match against the constant `provenanceLeaf` (`ProvenanceLeafMismatch`); then per use, SKIPPED (never reverted — audit Fix 1a/1c) when it names a reserved key (the provenance leaf, the assembly terms leaf), a key without a live registration in its own kind's registry, an unknown kind, a seller without a live `members.registered` stake, or a process already in `processCounted`; empty call = no-op (so trade outlives the reward). `settleBatch()` in `FigaroBatchVerifier` — `_hashUsage` re-derives the 8th public value from calldata; the counter call is wrapped in try/catch (`BatchAccrualSkipped`) so a whole-call revert (period, provenance) NEVER unwinds the token transfers; the sequencer pre-filters claims the counter would skip (unregistered key, unstaked seller, process already counted) against chain state before proving. Guest (`prover/lib/src/kernel.rs::apply_usage_claims`): post-state `orderStatus == 2`, merkle inclusion against the signed `checkoutHash`, one use per (kind, key, process) in the batch, the process id and the order's seller in each use; no usage state under the root | Rust `prover/lib/tests/usage.rs` (same-batch credit, unresolved reject, not-in-agreement reject, one use per (kind, key, process) in a batch, a later batch's re-presentation yields the same use, each use names its process and seller, agreement-via-provenance (`credits_an_agreement_through_the_provenance_leaf`), assembly-via-provenance plus the agreement's membership proof, wrong-agreement-hash / wrong-composition / foreign-root / wrong-agreement-content rejects, both reserved keys refused on every kind (`every_kind_keyed_on_a_reserved_key_is_refused`), hash covers period/provenance/kind/process/seller, claims move no state root, cross-language vectors, the provenance leaf attestable without a spec and refused on an uncommitted key, a foreign contentRef or non-canonical bytes, a clause and an assembly on the same key counted apart); Foundry `UsageCounterTest` (the one tally — `test_oneTally_sameSellerOnBothRoutesIsTwoUsesOneSeller`, `test_oneTally_twoSellersOnePerRouteIsTwoUsesTwoSellers`, `test_oneTally_aSellerCountedDirectThenInABatchIsCountedOnce`, `test_floor_isMetBySellersOnEitherRoute`; writer gate, period, an unstaked seller's use skipped and presentable again, a process already counted on either route skipped, the provenance leaf as a constant of the format and refused on both paths even with an assembly registered at its key, a foreign provenance leaf rejected on the batch path, a batch adds to the tally, empty-after-close liveness) and `FigaroBatchVerifierTest` (the uses reach the counter — read back from counter storage, a tampered use rejected, a whole-call refusal is CAUGHT so the batch still lands its positions + advances state — `test_settleBatch_settlesWhenItsPeriodHasPassed`, an unstaked seller's use skipped inside the call — `test_settleBatch_settlesEvenWhenTheCounterRejectsTheAccrual`, lands after accrual closes, Rust vectors match the contract's assembly — the usage packer's, and in `test_packerHashes_matchTheRustVectors` / `prover/lib/tests/packers.rs` the positions, attestations and spec-bindings packers); `UsageCounterTest` also covers the clause-or-assembly registration gate (direct-path `ClauseAgreementOrAssemblyNotRegistered`, batch-path skip of unregistered) and the family separation by kind (`test_assemblyUsageLandsUnderTheAssemblyKindOnly`, `test_batchAccrualGatesEachKindByItsOwnRegistry`, `test_batchAccrualGatesTheAgreementKindByTheAgreementRegistry`, `test_theThreeKindsNeverShareACount`, `test_revertsWhenAgreementNotRegistered`), with `RpgfMinterTest` `test_eachKindReadsOnlyItsOwnRegistry` / `test_revertsOnUnknownKind` / `test_agreementDesignerIsPaid` / `test_theThreeKindsPayOnlyTheirOwnDesignerOfRecord`, `RpgfIntegrationTest` `test_aStrangerWhoStakesAnAssemblysKeyAsAClauseTakesNothingOfIt` / `test_aStrangerWhoStakesAClausesKeyAsAnAssemblyTakesNothingOfIt` / `test_claimableQuotesNothingUnderACrossedKind` / `test_aRegisteredAgreementsDesignerIsPaidForItsUse`, `FigaroBatchVerifierTest` `test_settleBatch_anAssemblyAccrualPaysNoStrangerWhoStakedItsKeyAsAClause` (the batch path through `settleBatch`, the real counter and `claim`), Halmos `check_aUseCountsTheSameOnEitherRoute` / `check_scoreOfIsTheOneTally` / `check_theKindsNeverShareAKey` / `check_aKindNeverDisturbsAnotherKindsAccrual` / `check_anUnknownKindIsSkipped` and Certora `RpgfMinterAuthor.spec` (`DESIGN_DECISIONS.md` § 23); relay `submitter::tests::a_claim_the_counter_has_counted_is_dropped`; SDK `rpgf.test.ts` (one stream folded into one tally); `batch-e2e.test.ts` runs through a real sequencer + counter | `/rewards` shows the one tally and `scoreOf` — the figure the minter actually pays |
| E-8 | A `private`-disposition clause's plaintext never reaches a PUBLIC surface — the standalone public IPFS pin or the shareable audit bundle. The chain sees only the clause's data HASH (the merkle leaf), so `checkoutHash` is unchanged whether the clause carries plaintext or is withheld | SDK `publicForm(agreement, specs)` (`projection.ts`) content-withholds every clause whose spec is LOADED and declares a private field (identical merkle leaf → same root) — FAIL-CLOSED: a clause with an UNKNOWN spec is ALSO withheld, because a permissionlessly-registered clause could be private and keeping it plaintext would leak on any cold-cache pin (notably the RECEIVER re-pin, which never loaded the clause). To avoid over-redacting known-public clauses, `publishAgreement` (`frontend/lib/kernel/agreementFetch.ts`) WARMS the agreement's clause specs (`warmAgreementSpecs` → `ClauseRegistered` log scan → `loadClauseSpec`, only for specs actually missing) before projecting, so with the cache warm the fail-closed form is EXACT; if warming fails it over-redacts rather than leaking. The audit bundle renders a withheld clause's body as absent automatically; `parseClauseSpec` REJECTS a clause mixing public + private field dispositions (the leaf model withholds a whole clause, never one field). The signed + counterparty-relayed forms keep plaintext (Arm 2 encrypts that relay leg) | SDK `projection.test.ts` (withholds private, keeps public plaintext, preserves `checkoutHash`, withholds an unknown-spec clause fail-closed, `specHasPrivateField`); `sdk/tests/clauses/spec.test.ts` (mixed-disposition rejected, all-private accepted) | `/data` → the disposition seam ("public = coordination commons, private = paid edge behind the fingerprint") |
| E-9 | Every persistent effect of `settleBatch` is bound by a public value: positions → `tokenOpsHash`, attestations → `attEventsHash`, spec bindings → `specBindingsHash`, the uses → `usageAccrualHash`, the state advance → `newRoot`; nothing else is written | `settleBatch` in `FigaroBatchVerifier`: the four hash checks, `_checkSpecBindings`, `_executePositions`, `_emitAttestations`, the counter call, the root write — and no other write | `FigaroBatchVerifierTest`: the tampered-hash tests (each binding bites) and `test_settleBatch_writesNothingThePublicValuesDoNotBind` — the state diff of a settling batch is recorded and every storage write is accounted for: the verifier's state root and batch count (a storage slot that returns to rest within the call is no effect), the token's balances, the counter's tally; no other account written, no ether moved, nothing created; an effect added without a public value surfaces as an unaccounted write | — | — | `/spec` → Batch verifier |
| E-10 | The deploy scripts wire what they are given: the counter↔verifier pair binds mutually; the coordinator names `FigaroCore`, Permit2 and the router; the verifier names the gateway, vkey, registry, counter and the derived genesis root; the counter and the minter name all three hash-keyed registries (`AgreementRegistry` among them), the counter names its gates, floor and schedule, and reads back its constant `provenanceLeaf`; the registries carry their stake amounts and cooldown; the florin's genesis mints, minter cap and renounced deployer hold | `script/Deploy.s.sol`, `script/DeployMainnet.s.sol` (in-script requires, the verifier address prediction) | `test/script/DeployWiringTest.t.sol`: runs each script as it would broadcast and reads every binding back from the deployed contracts; `scripts/deploy-mainnet.sh` repeats the read-back with `cast` on the live chain before writing the deployment record | — | — | `/spec` → the per-chain deployments (docs-site) |
| E-11 | Membership of a registered agreement in an assembly is proved, never looked up: an assembly's `assemblyHash` is the merkle root over its agreements (leaf key the agreement's `agreementHash`, content `{"clauses":{…},"slot":i}`, every leaf in the assembly tree's own shape with `assemblyLeafDomain = keccak256("figaro-assembly-leaf")` mixed into the hash, so an agreement root never passes as an assembly root) and, when composed, the assembly terms leaf; the provenance leaf names `{agreementHash, assemblyHash}`; the assembly credit needs the agreement leaf proved under the root, and neither reserved key is ever an agreement (`DESIGN_DECISIONS.md` § 24, § 25) | `UsageCounter.recordAssemblyUsage` (provenance leaf under `checkoutHash`, then the agreement leaf under `assemblyHash` — `InvalidMembershipProof`; `ReservedKeyIsNotARegistration` on a reserved `agreementHash`); `UsageCounter.recordAgreementUsage` (the two-key provenance leaf); `AgreementRegistry.registerAgreement` refuses both reserved keys; guest `apply_usage_claims` (`UsageClaimKind::Agreement` / `Assembly`); no registry reads another | Foundry `UsageCounterTest` (`test_oneOrderCreditsItsAgreementAndItsAssembly`, `test_aProvenanceLeafNamingAnotherAgreementIsNotInTheTree`, `test_anAgreementLeafUnderADifferentAssemblyHashFails`, `test_anAgreementLeafWithAnotherAgreementsBytesFails`, `test_theTermsLeafIsALeafOfTheAssemblyTree`, `test_theTermsLeafNeverPassesAsAnAgreement`, `test_theReservedKeysAreRefusedUnderTheAgreementKind`) and `AgreementRegistryTest`; the three-way lock over `test/fixtures/assembly-vectors.json` — SDK `assemblyParity.test.ts`, Foundry `MerkleParityTest` (`test_everyAgreementHashIsTheRootOverItsClauseLeaves`, `test_everyAssemblyVectorOpensUnderItsRoot`), Rust `merkle_parity.rs` and `parity.rs`; Rust `usage.rs` (agreement and assembly legs, foreign root, wrong agreement content, reserved keys on every kind); SDK `assemblyInclusion.property.test.ts` | the designer's review shows each agreement's `agreementHash` and the assembly root |
| E-12 | Membership of a composed clause in a registered agreement is proved, never looked up: an `agreementHash` is the merkle root over one leaf per composed clause (leaf key the clause key, content the canonical bytes of the designer's fills), under the agreement format's leaf convention; a one-clause agreement's hash is its leaf; a reserved format key is never a composed clause (`docs/CLAUSES.md` § the registered agreement) | SDK `agreementHashOf`, `agreementClauseLeaves`, `buildRegisteredClauseInclusionProof` (`sdk/src/assembly.ts`); `anchorRegisteredAgreement` recomputes the root from a fetched document; nothing on chain derives the key — `AgreementRegistry` takes it | SDK `assembly.test.ts` (the root, the one-clause key, every clause opening under its key and under no other, duplicate and reserved keys refused), `assemblyInclusion.property.test.ts` (every clause proof under its own key, never under another's); the three-way lock over `test/fixtures/assembly-vectors.json` — SDK `assemblyParity.test.ts`, Foundry `MerkleParityTest` (`test_everyAgreementHashIsTheRootOverItsClauseLeaves`), Rust `merkle_parity.rs` (`every_agreement_hash_is_the_root_over_its_clause_leaves`) | the registries explorer verifies a fetched agreement document by recomputing its root |
| E-13 | Batch and Core are equivalent: with every relay stopped and every state file deleted, a stranger rebuilds the state behind `FigaroBatchVerifier.stateRoot` from the chain alone, the buyer (or anyone carrying the buyer's signed resolve) proves and submits the resolution, and the verifier's `OrderCommitted` / `OrderResolved` events name the batched order | HOLDS: `settleBatch` takes the batch's operation stream as its last calldata argument, refuses a batch whose bytes do not hash to public value 9 (`OperationsHashMismatch`), and emits the Core's `OrderCommitted` / `OrderSeller` / `OrderCurrency` / `OrderResolved` / `ProcessResolved` for every entry under its own domain (`OperationStreamVectorsTest`); the root starts at the contract's own `genesisRoot()`; the bound SP1 verifier is one routed contract, probed for `VERIFIER_HASH()`; it logs the stream (`BatchOperations`), and a relay started with nothing rebuilds the state from those logs alone (`REBUILD_FROM_CHAIN=1`); the frontend's order readers fold the verifier's events beside the Core's (`frontend/lib/kernel/indexer.ts`) | `sdk/tests/batch-e2e.test.ts`, the pass-test case, green; `frontend/tests/lib/orderEmitters.test.ts`; `frontend/tests/e2e/batch-events.devnet.spec.ts` (the app renders a batched order from chain events); `formal/RelayState.tla` `OpsOnChain` (the design) with `Recoverable` and `ChainCarriesEveryLandedBatch`, `OpsOnChain` FALSE failing `Recoverable` through `ForeignSettle` | `/audit/view` renders a batched order from the order readers, its signatures "Proved in a batch", bound to the batch the chain names |
| E-14 | The batch path's resolve authorization, in either of its forms (E-16), pays exactly the prefix of the process whose cumulative value the buyer signed, every order of which the buyer co-signed; a value the process has not yet reached pre-authorizes exactly the orders that bring it there. It signs the process id and a cumulative value and applies only while the process holds that value; the value rises strictly at every commit, so it names at most one prefix, and a commit past it refuses the authorization for good (the direct path's `resolveProcess` is the buyer's own call over the orders open at that call) | the guest's `apply_resolve` (`prover/lib/src/kernel.rs`): recovers the signer of `ResolveProcess(bytes32 processId,uint256 cumulativeValue)` (`resolve_struct_hash`, `prover/lib/src/eip712.rs`), requires the root buyer, refuses a resolved process (`NoActiveOrders`) before the value, refuses `StaleResolveAuthorization { signed, current }` unless the signed value is the process's `cumulative_value`; the relay dead-letters a signed value the process has passed and defers one it has not reached (`is_permanent_refusal`, `prover/sequencer/src/assembler.rs`); the operation stream's resolve entry derives the signed value from the listed payments (`resolved_cumulative_value`, `prover/lib/src/operation_stream.rs`), so a replayer recovers the same signer | `prover/lib/tests/parity.rs`: `a_resolve_signed_before_a_later_commit_is_refused`, `a_resolve_signed_over_the_current_cumulative_value_resolves`, `a_resolve_whose_signed_value_was_rewritten_is_refused`; `prover/sequencer/tests/sequencer.rs`: `a_refusal_is_classified_on_the_fields_it_carries`, `a_two_order_resolve_replays_from_its_stream_to_the_same_root`; the type string's hash held across viem and the guest by `test/fixtures/eip712-vectors.json` (`sdk/tests/eip712Parity.test.ts`, `prover/lib/tests/eip712_vectors.rs`); `formal/RelayState.tla` `ResolveSpec`: `ResolvePaysSignedPrefix`, `ResolveBoundToState` FALSE failing it | the policy signer names the process and the cumulative value a `ResolveProcess` accepts, at zero token risk as the direct path's `resolveProcess` (`sdk/src/signer/gate.ts`) |
| E-16 | Batch and Core resolve alike: whatever can resolve a process on `FigaroCore` can resolve it on the batch path, and nothing else can. On the Core, `resolveProcess` reads `msg.sender == rootBuyer`, so the buyer's key and code the buyer's wallet installed while it held the key (an EIP-7702 delegation carrying the wallet's own guardian authorization) both resolve; on the batch path a resolve carries the buyer's ECDSA signature or bytes the buyer's own account code validates for the same `ResolveProcess` digest (ERC-1271), the second checked against the buyer's code at resolution, so a lost key strands no batched bond the Core would not strand (`DESIGN_DECISIONS.md` § 4) | the guest's `KernelOp::ResolveByWalletCode` (`prover/lib/src/types.rs`) applied by `apply_resolve` with no signature recovered — the process, the value and the order list checked as for `Resolve` — and published whole in the operation stream's `0x04` entry (`prover/lib/src/operation_stream.rs`); `FigaroBatchVerifier._walkOperations` asks every `0x04` entry's buyer at step 4, before any token moves, and `_resolveByWalletCode` / `_checkWalletCode` derive the digest under the verifier's domain from the process and the listed payments, refuse a buyer with no code (`BuyerHasNoCode`) and any answer word but the magic value's (`WalletCodeAuthorizationRefused`), reverting the whole batch because the proven root already holds the resolve; the relay asks the same code at its door and at batch formation (`check_wallet_code_resolve`, `filter_wallet_code_resolves`, `prover/sequencer/src/submitter.rs`), and on a refused batch dead-letters the wallet-code resolves alone — whether or not the re-ask names one, since code can answer an `eth_call` otherwise than the transaction — counting each buyer in the adversarial signal and re-queuing the rest; only a batch with no wallet-code resolve dead-letters whole (`classify_deterministic_revert`); the resolve capacity plans the dearer form (`gas::max_orders_in_one_settle`) | `prover/lib/tests/parity.rs`: `a_wallet_code_resolve_is_accepted_and_published_in_the_operation_stream`, `a_wallet_code_resolve_for_a_passed_value_is_refused`; `prover/lib/tests/operation_stream.rs`: `a_wallet_code_resolve_round_trips_with_its_authorization`; `FigaroBatchVerifierTest`: `test_settleBatch_walletCodeResolve_paysOutWhenTheBuyersCodeValidates`, `test_settleBatch_walletCodeResolve_revertsTheBatchWhenTheCodeRefuses`, `test_settleBatch_walletCodeResolve_refusesABuyerWithNoCode`, `test_settleBatch_walletCodeResolve_revertsTheBatchWhenTheCodeReverts`, `test_settleBatch_walletCodeResolve_isAskedBeforeTheTokenTransfers` (`src/mocks/MockERC1271Wallet.sol` etched at the buyer, its answer bound to its own balance); `OperationStreamVectorsTest` over the harvested wallet-code streams (authorizations of 0, 17 and 300 bytes); `prover/sequencer/tests/sequencer.rs`: `a_wallet_code_resolve_is_admitted_from_the_wire_and_replays_to_the_same_root`, `the_relay_asks_the_buyers_code_the_verifiers_question`, `mempool_refuses_a_wallet_code_authorization_longer_than_the_relay_plans`, `an_unnamed_refusal_dead_letters_the_wallet_code_resolves_alone`; `BatchGasCeilingTest.test_Gas_settleStreamWalletCodeCheck`; SDK `eip712Parity.test.ts` (`hashResolveProcess`), `sequencer.test.ts` (the wire); `formal/RelayState.tla` `ResolveSpec`: `OnlyBuyerWalletResolves`, `VerifierChecksWalletCode` FALSE failing it | the SDK's `hashResolveProcess` gives the digest a wallet's code validates and `SequencerClient.submitResolveByWalletCode` submits the bytes; no frontend surface submits a batched resolve |
| E-15 | A batched attestation in its default hash-only form carries exactly what `AttestationCoordinator` takes — the `clauseDataHash`, the inclusion proof and the `contentRef` — and binds what a direct one binds: the signer is the party, the order is committed and open, the leaf opens against the signed `checkoutHash`; the event re-emitted is the coordinator's, topics and data, byte for byte, and no spec binding is committed. The plaintext form (spec, content, clauseData) is sent only at the attesting party's choice, and the relay writes no attestation content to its logs, its state file, its journal, `/state` or `/status` | the guest's `validate_attestation_witness` (`AttestationWitness::HashOnly` runs Gate I alone, `AttestationWitness::Plaintext` Gates S, C and I), `prover/lib/src/kernel.rs`; the SDK's `submitAttestAsSeller` / `submitAttestAsBuyer` send `HashOnly` unless `checkContentInProof` is set (`sdk/src/agent/sequencer.ts`); the relay logs a refused attestation without its reason (`submit_error`, `prover/sequencer/src/api.rs`); the verifier resolves a batch whose attestation carries an empty binding list | Rust `attestation_vectors.rs` against `test/fixtures/attestation-vectors.json`, harvested by `test/core/attestation/AttestationVectorsTest.t.sol`; the differential fuzz (`KernelDifferentialFuzzTest` + `fuzz_stream.rs`) replays every coordinator attestation as `HashOnly`; `parity.rs` (`a_hash_only_seller_attestation_is_accepted_and_commits_no_spec_binding`, `a_hash_only_attestation_with_a_wrong_clause_data_hash_is_refused`, `a_hash_only_attestation_with_a_wrong_inclusion_proof_is_refused`), `usage.rs` (the provenance leaf on inclusion alone); `test_settleBatch_settlesAnAttestationWithNoSpecBinding`; `sdk/tests/sequencer.test.ts` (the default submission carries no plaintext field); `the_relay_writes_no_attestation_content_to_its_logs_state_or_routes` | no frontend surface submits a batched attestation; the SDK's agent client does |

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
| **Registered agreement** | `frontend/lib/designer/`; `src/build/registries/AgreementRegistry.sol` | — | `/assemblies` → each order composed from a registered agreement. | `/assemblies/designer/new` (the drawer's registered-agreement offer, or a new agreement registered at publish) | — |
| **Institution assembly** | `frontend/lib/designer/`; `src/build/registries/AssemblyRegistry.sol` | — | `/assemblies` → Document-anchored, not catalog-listed. | `/assemblies/designer/new`, `/assemblies/designer/edit?slug=<slug>`, `/assemblies/designer/view?slug=<slug>` | — |
| **Agreement publication** | `frontend/lib/kernel/agreementFetch.ts`, `@figaro-protocol/sdk` `projection.ts` | — | `/assemblies` → What the assembly hash covers. | — | — |
| **Commerce checkout** | `frontend/lib/checkout/` | — | — | `/s/checkout` (`CheckoutView` + `CartLineList`); `YourTurnBadge` (header signal for orders awaiting this wallet's counter-signature) | — |
| **Process topology** | `frontend/lib/semantic/processTopology.ts` | SDK: `reconstruct()`, `Topology` | `/assemblies` → How one is composed. | `TopologyCanvas` (`/assemblies/designer/new`, `/assemblies/designer/view?slug=<slug>`) | — |
| **Bond math** | `sdk/src/bonds.ts` | SDK: `calculateBonds`, `calculateResolution` | `/spec` → `FigaroCore.sol` | checkout/order surfaces render via the SDK | — |
| **Single-currency binding** | `src/core/kernel/FigaroCore.sol` | — | `/spec` → `FigaroCore.sol` | — | — |
| **Fee-on-transfer rejection** | `src/core/kernel/FigaroCore.sol` `_pullExact()` | — | `/spec` → `FigaroCore.sol` | — | — |

---

## 7) TLA+ formal models — current posture

Five models: `FigaroCore.tla` (detailed below), `FlorinToken.tla` (its 8
invariants are the E-6 rows), `WitnessSwapAndCommitCoordinator.tla`,
`ResolutionUniverses.tla` and `RelayState.tla` (all three detailed below;
harness inventory + state counts: `TESTING.md` § TLA+).

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
two buyers and two sellers exercise every transition and interference class
`FigaroCore` has — never bounded sampling of an N-body space. There is no N in the
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
| `Inv_Atomicity` | A swap moved value in a call **iff** the commit landed (incl. `FigaroCore`-side `InvalidRootCumulativeValue` revert after the swap) |
| `Inv_BondFormula`, `Inv_CoreEscrowExact` | K-1 at the coordinator seam — Core ends holding exactly the doubled bonds of landed orders |
| `Inv_WitnessRouteBinding` | No route executes that the paying party did not sign (the predecessor bug the witness variant exists to close) |
| `Inv_CoordinatorNotCounterparty` | `FigaroCore`'s parties stay the EIP-712 signers; the coordinator supplies the tokens in place |

Mutation-checked: 6 deliberate Next-relation bugs, each caught by exactly its
target invariant.

### Model file: `formal/ResolutionUniverses.tla`

The CROSS-CONTRACT model: FigaroCore + FigaroBatchVerifier + UsageCounter +
the off-chain guest mirror under arbitrary interleavings — the only harness that
can see where the two paths meet (every other layer is per-contract). 21 invariants; the load-bearing rows:

| Property | Code | Formal |
|---|---|---|
| An order resolved on the batch path never acquires `FigaroCore` status; `orderStatus` gates are blind to batched trade | `FigaroBatchVerifier.settleBatch` (no `FigaroCore` write) | `KernelBlindToBatch`, `BatchInvisibleToKernelGates` |
| The same signed commitment cannot resolve on both paths | EIP-712 domain separation: `FigaroBatchVerifier.sol` reverts `VerifyingContractMismatch` unless `pv.verifyingContract == address(this)`, against `FigaroCore`'s own domain; processId IS the typed-data digest | `NoDoublePayout`, `UniverseDisjointOrders` — carried by **`AssumeDomainSeparation`** (CONTRACT-ENFORCED; flipping it violates 4 invariants) |
| Token conservation + pool disjointness across `FigaroCore` + verifier | per-order exact deposits both sides | `TokenConservation`, `CoreExactEscrow`, `VerifierExactEscrow`, `ResolutionAlwaysPossible` |
| One tally, route-blind: `scoreOf == accrualOf.score`; `c` is the size of the one counted-process set and `d` of the period's one seller set, whichever route brought each use | `UsageCounter._count`, reached by the direct calls and by `applyBatchAccrual` | `ScoreCacheCorrect`, `TotalScoreIntegrity`, `CountIsDistinctProcesses`, `SellersCountedOnce`, `FloorApplied` |
| A counted process id names one process — the one counted set counts a process once | `UsageCounter.processCounted`, both routes; the verifier's EIP-712 domain | `ProcessCountedInOneUniverse` — carried by `AssumeDomainSeparation` |
| Only resolved trade is counted; a batch refused for its period under-pays, never over-pays, and its uses may be proved again | `settleBatch`'s try/catch around `applyBatchAccrual`; the guest keeps no counted set | `AccrualNeverOverPays` (unconditional) vs `AccrualNotLost` — carried by **`AssumeAccrualGatesAligned`** (NOT contract-enforced — the documented conservative-under-pay posture) |

Both assumptions ship TRUE in the `.cfg`; flipping either to FALSE is the
model's experiment and is EXPECTED to fail. Mutation-checked: four mutated actions, each failing the invariant it targets — the batch counting a process already counted (`CountIsDistinctProcesses`), the batch adding a seller already in the period's set to `d` (`SellersCountedOnce`), a score that ignores the floor at `MinSellers = 2` (`FloorApplied`), a claim proved on a committed but unresolved order (`AccrualNeverOverPays`); and four reachability witnesses, each violated as expected — a key counted from both routes, one seller carrying uses on both routes as one unit of `d`, a sub-floor tally with uses, a batch-path process in the counted set. The `MinSellers = 2` pass of the shipped model: no error, 45,000,639 states generated, 12,828,199 distinct, depth 18.

Known cost, accepted: `ResolutionUniverses.cfg` ships `MinSellers=1`; the
minimum-support floor case runs as a second pass at `MinSellers=2` (no error,
45,000,639 states generated, 12,828,199 distinct).
`AssumeAccrualGatesAligned` is not contract-enforced — a batch whose period
passed in flight has its uses uncounted until a later batch proves them again,
under-pay only.

### Model file: `formal/RelayState.tla`

The off-chain relay's state lifecycle. The verifier holds a root and the state
behind it is off chain; a bond committed on the batch path is refunded only by
a batch built on that state, and `settleBatch` takes any caller, so a submitter that
is no relay can land a batch on a copy of the state and publish nothing. 8
invariants and 2 action properties:

| Property | Code | Formal |
|---|---|---|
| Whenever the verifier's root is past genesis, some relay has the state behind it on disk — through a crash at any step, a refused batch, a resend by anyone, a takeover — or the chain carries every batch that landed, so a stranger rebuilds it | `StateStore::hold_next` before the send; `StateStore::keep` writes the kept file, then retains the journal entries built on the new root; a refused batch's entry stays held. The chain half is the accepted batch design (`OpsOnChain`): the verifier admits a batch only with its signed operations in its own transaction, and a relay starting with nothing replays them (`StartFromChain`; `prover/sequencer/src/rebuild.rs`, `REBUILD_FROM_CHAIN=1`) | `Recoverable` |
| Under the design no landing path escapes the rule: every batch that moved the root, a relay's or a foreign submitter's, has its operations in its own transaction | the verifier's hash check of the operation stream against public value 9 (`OperationsHashMismatch`) | `ChainCarriesEveryLandedBatch` |
| A relay builds only on a root the verifier has held, and its mirror never goes back | `step_to` / `held_state_for` at start and before every batch; the start refusal | `BuiltOnVerifierRoot`, `MirrorOnVerifierRoot`, `KeptOnVerifierRoot`, `JournalBuiltOnVerifierRoot`, `MirrorNeverGoesBack` |
| A takeover overwrites a kept file only with the verifier's state | NOT relay-enforced: writing `GET /state` over a state file is safe only when its `x-figaro-state-root` header is the verifier's `stateRoot`; the relay refuses to start on a wrong state, but a file it overwrites is lost | carried by **`TakeoverChecksRoot`** — FALSE: a stale served state written over the only copy of the verifier's state |
| A relay never re-sends a batch a revocation refusal already showed it cannot pull — it drops the revoker and rebuilds with everyone else | the deterministic-revert arm re-reads funding, dead-letters only the named revoker's operations and re-queues the rest (`main.rs`, `submitter.rs`); a revoker who re-approves before the re-read is not named, and the whole batch dead-letters as before (the handover's limitation 3) | `SendsExcludeKnownRevoked` — the model assumes the refusal names the revoker and checks the relay's discipline given that knowledge, never the funding read itself; `sdk/tests/batch-revoke-e2e.test.ts` checks the funding read and the arm end to end on Anvil (the revoker named, its op dead-lettered alone, the rest landing next batch) |

Mutation-checked: `OpsOnChain` FALSE (today's verifier, with `ForeignSubmitters`
TRUE) fails `Recoverable` in 2 states — the defect the batch review found,
reachable in the model before the code that closes it; and, with `OpsOnChain`
and `ForeignSubmitters` FALSE, each of the four lifecycle switches FALSE
(`HoldBeforeSend`, `HoldThroughRevert`, `KeepRetainsBuiltOnRoot`,
`TakeoverChecksRoot`) fails `Recoverable`, and `RebatchDropsRevoker` FALSE fails
`SendsExcludeKnownRevoked`; the counterexamples are 6, 7, 13, 10 and 8
states long.

The same module's second spec, `DeferSpec` (`formal/RelayStateDeferral.cfg`),
models the deferral of an operation dropped at batch formation — 10
invariants, 445,431 states / 116,190 distinct, depth 19:

| Property | Code | Formal |
|---|---|---|
| An operation that applies against no order of its drain, or a commit whose funding could not be read, is deferred and dead-lettered once the window has passed since its first deferral — retried or not, never earlier | `mempool.rs`, `defer`, `expire_deferred` (at every tick's head), `DEFAULT_DEFER_WINDOW` / `DEFER_WINDOW_SECS`; `a_deferral_is_bounded_in_time_from_first_deferral_not_in_attempts` | `DeferralBoundedInTime` |
| A deferral spends nothing of the transient re-queue's count | `PendingOp::deferred_since`, apart from `requeues`; `a_deferral_spends_nothing_of_the_requeue_count` | `RequeueCapCountsTransients` |
| A deferred operation is drained only into the room the queue leaves, its group whole — one that never applies costs no drain anything | `drain_up_to`; `a_deferred_operation_is_drained_only_into_slots_the_queue_leaves_empty`, `a_deferred_group_is_retried_whole` | `NoExtraDraining` |
| What was filtered behind a deferred commit moves with it; only what was built on an operation dropped for good is dead-lettered | `assembler.rs`, `refilter_after_drops`; `what_was_built_on_a_deferred_operation_moves_with_it` | `BuiltOnOnlyBehindDead` |
| One copy of an operation waits at a time: a copy resubmitted while it was drained is dropped when it is deferred or re-queued | `defer`, `requeue`; `deferring_drops_a_copy_resubmitted_meanwhile_and_holds_the_key`, `requeue_drops_a_copy_resubmitted_meanwhile` | `NoTwoCopies` |
| Each operation touches one process, so a drain group is one process's operations of one tick | `touched_processes`, `group_by_process`; `deferred_operations_are_grouped_by_the_process_they_touch` | `DrainGroupIsAClass` |
| No honest operation is dead-lettered before its own window ends unless one it depends on was | `expire_deferred`; `an_operation_that_never_applies_does_not_cut_an_honest_window_short` | `HonestWindowKept` |
| No operation stays deferred after one it was filtered behind is dead-lettered | `expire_deferred`, `PendingOp::behind`; `a_dependent_deferred_with_its_parent_is_dead_lettered_with_it` | `DependentLeavesWithItsDependency` |
| Admission refuses a resolve listing one order twice | `pre_check`; `mempool_refuses_a_resolve_listing_an_order_twice` | `DoubleListingNeverAdmitted` |

Mutation-checked: each of the nine deferral switches FALSE fails the
property beside it — `DeferBoundedInTime` → `DeferralBoundedInTime`,
`DeferOwnCounter` → `RequeueCapCountsTransients`, `DeferDrainsOnlyFreeSlots` →
`NoExtraDraining`, `DeferMovesDependents` → `BuiltOnOnlyBehindDead`,
`DeferDropsCopy` → `NoTwoCopies`, `DeferGroupsByProcess` →
`DrainGroupIsAClass`, `DeferOwnWindow` → `HonestWindowKept` (checked with
`DHonest` held to the commit), `DeferDependentEdge` →
`DependentLeavesWithItsDependency`, `AdmitRefusesDoubleListing` →
`DoubleListingNeverAdmitted`; the counterexamples are 6, 6, 8, 5, 5, 5, 8,
8 and 2 states long.

The module's third spec, `ResolveSpec` (`formal/RelayStateResolve.cfg`),
models the buyer's resolve authorization on the batch path (E-14, E-16) —
three orders, payments 1–2, an authorization over the value the process
holds or any it has not reached, applied by anyone holding it under any later
state, in either form: the buyer's signature, made while the wallet holds its
key, or bytes the wallet's code validates, the code installed only with the
key and answering after its loss, anyone free to submit bytes in that form
for any value — 3 invariants, 3,293,884 states / 809,956 distinct, depth 19:

| Property | Code | Formal |
|---|---|---|
| Every applied resolve pays exactly the prefix of the process's commits whose cumulative value the buyer signed | `apply_resolve`'s `StaleResolveAuthorization` refusal over `resolve_struct_hash(process_id, cumulative_value)`; `a_resolve_signed_before_a_later_commit_is_refused`, `a_wallet_code_resolve_for_a_passed_value_is_refused` | `ResolvePaysSignedPrefix` |
| Every applied resolve was authorized by the buyer's key or by the code its wallet installed while it held the key | `FigaroBatchVerifier._checkWalletCode` (`BuyerHasNoCode`, `WalletCodeAuthorizationRefused`); `test_settleBatch_walletCodeResolve_revertsTheBatchWhenTheCodeRefuses` | `OnlyBuyerWalletResolves` |

Mutation-checked: `ResolveBoundToState` FALSE (the authorization signs the
process id alone) fails `ResolvePaysSignedPrefix` in 4 states: the root
order commits at 1, the buyer signs over 2, and the authorization applies at
once, paying the one order, a set no prefix of value 2 names.
`VerifierChecksWalletCode` FALSE (the verifier takes the wallet-code form on
the guest's word) fails `OnlyBuyerWalletResolves` in 3 states: the root
order commits, and a stranger's bytes in the second form resolve it. A
witness that the equivalence is live: an invariant that no resolve is
authorized by the wallet's code after the key is lost is violated, the code
installed, the key lost, the code authorizing and the resolve applying.

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

### Harnesses: `test/core/kernel/HalmosFigaroCore.t.sol` + `test/app/HalmosMembersRegistry.t.sol` + `test/build/rewards/HalmosUsageCounter.t.sol` + `test/build/registries/HalmosClauseAgreementAndAssemblyRegistries.t.sol`

Halmos performs symbolic execution of Solidity bytecode using SMT solvers
(z3/yices). Unlike Echidna (which searches for counterexamples via fuzzing),
Halmos proves each property for every input its bounded call trace admits, by constructing and
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

**HalmosUsageCounter (9 properties)** — the accrual arithmetic on top of
the E-5 stake gate (which is NOT re-proved here): direct-path accrual monotonicity;
two uses leave the same state whichever route brought each (the tally, the
counted processes, the seller set, the period total); `scoreOf == accrualOf.score`;
period bucketing (every timestamp lands in exactly its window; a wrong-period claim
is rejected and the other period's slot is untouched); isolation across keys;
the kinds never share an accrual (a use counted under any one of the three kinds, on either route,
leaves every other kind's accrual at the same key empty, and leaves an existing one exactly as it
was); a batch use of an unknown kind is skipped, writing nothing under any kind.
Mutation-checked against three counters: one whose batch path counts a process already counted fails `check_aUseCountsTheSameOnEitherRoute`; one whose batch path counts every use under the clause kind fails `check_aKindNeverDisturbsAnotherKindsAccrual`; one whose `scoreOf` reads more than the tally fails `check_scoreOfIsTheOneTally`. Enters via a test-only
`UsageCounterHarness` exposing `_accrue` (public entry points require ECDSA + merkle
proofs unreachable to the solver — the same doctrine as the ECDSA workaround in
HalmosMembersRegistry).

**HalmosClauseRegistry + HalmosAssemblyRegistry + HalmosAgreementRegistry (6 properties each,
one file: `HalmosClauseAgreementAndAssemblyRegistries.t.sol`)** — the designer-side stake machines
`RpgfMinter._isAuthor` reads at claim: deposit solvency under arbitrary
interleavings by two registering wallets; live stakes withdrawable in full; first-write-wins
permanence (no second registration ever succeeds, for ANY caller); one-shot
withdrawal; eligibility ends at withdraw with nothing restoring it; cross-key
isolation. Solvency and first-write-wins MUTATION-CHECKED on the clause and
assembly contracts (4/4 mutations produced counterexamples).

**All proved, none failed** across the seven passes.

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
in seven passes: the 6 fast FigaroCore properties batched in one `halmos` process,
`check_resolutionPayouts` in a second, fresh process, then the 7
`HalmosMembersRegistry`, 7 `HalmosUsageCounter`, 6 `ClauseRegistry`, 6
`AssemblyRegistry` and 6 `AgreementRegistry` properties in their own passes. Per-assertion
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
| `activeCountRisesOrDropsToZero` | A-5 | Parametric rule (count up or zero) |
| `onlyBuyerCanResolve` | K-2 | Parametric rule (non-buyer cannot zero count) |
| `noDoubleCommit` | K-9 | Targeted rule (a successful commit returns only an order hash whose status was 0) |
| `cumulativeValueMonotonic` | K-5, A-4 | Parametric rule (all methods) |
| `rootBuyerImmutable` | K-2 | Parametric rule (all methods) |
| `currencyImmutable` | K-7 | Parametric rule (all methods) |

**AttestationCoordinator (8 declared rules — the commitment-arg ABI + merkle-proof receipt binding)**

| CVL rule | Maps to | Type |
|---|---|---|
| `nonBuyerCannotAttestAsBuyer` | E-1 | Targeted revert rule — `msg.sender != c.buyer ⟹ revert` (c.buyer == rootBuyer by commit invariant) |
| `successfulBuyerAttestationImpliesBuyer` | E-1 | Contrapositive — successful call ⟹ `msg.sender == c.buyer` |
| `successfulBuyerAttestationIsReachable` | E-1 | `satisfy !lastReverted` — the rule above is not vacuous |
| `nonSellerCannotAttestAsSeller` | E-1 | Targeted revert rule — `msg.sender != c.seller ⟹ revert` |
| `successfulSellerAttestationImpliesSeller` | E-1 | Contrapositive — successful call ⟹ `msg.sender == c.seller` |
| `successfulSellerAttestationIsReachable` | E-1 | `satisfy !lastReverted` — the rule above is not vacuous |
| `attestationCannotChangeOrderStatus` | K-4 | Parametric (`filtered { f -> f.contract == currentContract }`) |
| `attestationCannotChangeProcessState` | K-4, K-7 | Same filter |

The coordinator is merkle-only: it merkle-binds each attestation to its signed agreement, emits the `contentRef` its caller supplies, and validates no content shape; the batch path's default hash-only form does the same (E-15). Whether the evidence's bytes hash to `contentRef` is checked when a reader fetches them (`anchorAttestationContent`, `sdk/src/anchored.ts`), never on chain, except inside the proof for a plaintext attestation (Gate C binds `contentRef` to the validated content).

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

**BatchVerifierStateRoot (3 declared rules — read through `certora/harness/FigaroBatchVerifierHarness.sol`)**

| CVL rule | Maps to | Type |
|---|---|---|
| `settleBatchChainsTheRoot` | E-9 (the state advance → `newRoot`) | A resolved batch's `prevRoot` == the held `stateRoot`; after it, `stateRoot` == its `newRoot` |
| `settleBatchCountsOneBatch` | E-9 | `batchCount` advances by exactly one per resolved batch |
| `onlySettleBatchMovesTheRoot` | E-9 | Parametric (all other methods): neither `stateRoot` nor `batchCount` moves |

Mutation-checked, all three: with the `StateRootMismatch` check blanked and `++batchCount` replaced by `batchCount + 1` in the verifier, and a root-setting function added to the harness, each rule FAILED on its own mutation and on nothing else; the files were restored byte-identical. Report: https://prover.certora.com/output/9512759/9fb2a938b04847b8b44c83fee498631a

**RpgfMinter (10 declared rules — deps summarized via ghosts/wildcard dispatch)**

| CVL rule | Maps to | Type |
|---|---|---|
| `mintedNeverExceedsPeriodBudget` | E-6 (600M budget) | Inductive conservation — the tranche-overdraw bug class |
| `nonMemberCannotBePaid` | the designer-side membership gate (`NotLiveMember`) | A claimant with no live member stake (`_.registered` summarized to a ghost) reverts whatever its keys say, and mints nothing |
| `nonMemberIsQuotedZero` | the same gate on the view path | `claimable` quotes a non-member zero in every known period |
| `noDoubleClaimPerWalletPerPeriod` | E-5/E-6 | State-machine guard |
| `cannotClaimWhilePeriodOpen` | E-6 | Period gating |
| `duplicateClauseOrAssemblyReverts` | E-6 | Input-hygiene guard |
| `ineligibleClauseOrAssemblyCannotBePaid` | E-5 | The live-stake `_isAuthor` gate — a withdrawn stake pays nothing |
| `mintedMonotonic` | E-6 | Parametric (never decreases) |
| `claimableRejectsDuplicatesToo` | — | View/state parity |
| `claimableReturnsZeroForAlreadyClaimedWallet` | — | View/state parity |

Mutation-checked (conservation, double-claim, eligibility): each rule
FAILED against a deliberately broken contract, then passed clean after revert —
load-bearing, not vacuous.

**RpgfMinterAuthor (2 declared rules — `_isAuthor` as written, against one getter contract per registry family)**

| CVL rule | Maps to | Type |
|---|---|---|
| `isAuthorReadsOnlyItsKindsRegistry` | E-5 | The kind selection: each kind's answer is the live designer of record in its own registry alone |
| `isAuthorRefusesAnUnknownKind` | E-5 | Targeted revert rule — a kind past the three reverts |

Verified, both rules, on the non-via-IR build (under via-IR the prover's call resolution fails on `_isAuthor`'s decoding of the dynamic `string` that `bindings` returns): https://prover.certora.com/output/9512759/f62a013cbdb44692b77bf04219670f75. The `FigaroCore` rules `noDoubleCommit` and `activeCountRisesOrDropsToZero` verified in the same sitting: https://prover.certora.com/output/9512759/024d183244654c348229ee01814292ca.

### Status

**All green** — the full suite verifies with `--wait_for_results all`
(exit 0 = every rule verified; every `Violated` line in the stream is the
`rule_not_vacuous` healthy polarity). Which run, when, and the report URLs:
`AUDITOR_HANDOVER.md` § "Verification evidence".

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
| `integration.test.ts` | SDK round-trip on a LIVE chain (the one sanctioned chain-touching Vitest file, skipIf-gated): built+signed commitment accepted by `commit`, events fetch + reconstruct, reconstruction resolves. Asserts no `FigaroCore` math — amounts are Foundry/Certora-owned | K-8, K-9 (live-chain acceptance) |
| `bonds.test.ts` | Bond calculations (2×), payouts at resolution, approval amounts, validation | K-1, K-5 |
| `assemblyParity.test.ts` | Freezes the composition tree into `test/fixtures/assembly-vectors.json` (agreement hashes and key bytes, agreement bytes and leaves, the terms leaf, the root, membership proofs, two-key provenance bytes and leaves) and rebuilds every value the way the counter and the guest do; a membership proof does not verify under another root | E-11 |
| `assemblyInclusion.property.test.ts` | Property: every agreement's membership proof verifies under its own root and no other; editorial prose moves neither the root nor the agreement hash; any clause value moves the key; the two-key provenance bytes decode back to their keys | E-11 |
| `bondsCoreParity.test.ts` | The SDK's bonds and payouts, summed per party, equal what `FigaroCore` pulled and paid in every scenario of `test/fixtures/kernel-transition-vectors.json` (harvested from the live contract), buyer == seller included | K-1, K-5 |
| `abiParity.test.ts` | Every function, event and error in the SDK's hand-written ABIs (`sdk/src/abis.ts`) exists in the compiled ABI (`abi/*.json`) with the same inputs, `indexed` flags and outputs; the Core's ERC-20 errors are checked against the repo's own OpenZeppelin ERC-20; and every error each contract compiles is in its SDK ABI | K-8, K-9 |
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
| **TLA+ model checking** | `TESTING.md` § TLA+ — `./scripts/test-tla.sh` | `FigaroCore` safety (conservation, solvency, bonding, atomicity, resolution) + florin token registry (max supply, minter cap, non-negative, no-mint-to-zero, balance-sum-to-supply, cap-below-max-supply, supply-equals-sum-minted, deployer-cannot-mint-after-renounce) + the swap-funded on-ramp (zero retention, swap↔commit atomicity, allowance hygiene, witness route binding, exact `FigaroCore` deposits) + the two paths composed (no cross-path double payout, per-pool deposits, score composition, `FigaroCore` blindness) |
| **Halmos symbolic testing** | `TESTING.md` § Halmos — `./scripts/test-halmos.sh` | FigaroCore (7): token conservation, contract solvency, bond amounts, resolution payouts, status transition, buyer dominance, cumulative monotonicity. MembersRegistry (7): the stake-machine properties behind E-5. UsageCounter (9): the accrual arithmetic — route-blind counting, one tally read by `scoreOf`, period bucketing, isolation, the three kinds never sharing or disturbing an accrual, the unknown kind skipped. ClauseRegistry + AssemblyRegistry + AgreementRegistry (6 each): the designer-side stake machines designer-reward eligibility reads. |
| **Certora formal verification** | `TESTING.md` § Certora — `./scripts/test-certora.sh` | FigaroCore: state-machine invariants. AttestationCoordinator: role-gate correctness + Core immutability (merkle-only — no content-shape validation). TokenOpsVerification: universal balance-flow proofs for FigaroCore commit + single-order resolve. FlorinToken: supply cap + minter registry preservation. BatchVerifierTokenOps: batch-path token-flow invariants. BatchVerifierStateRoot: the batch state root's unbroken, gap-free chain. RpgfMinter: mint conservation, no-double-claim, duplicate rejection, live-stake eligibility. RpgfMinterAuthor: `_isAuthor` reads the one registry its kind names and refuses an unknown kind. |
| **Echidna fuzzing** | `TESTING.md` § Echidna — `./scripts/test-echidna.sh` | `EchidnaFuzzer` (`FigaroCore`, 7): solvency, monotonicity, buyer dominance, atomicity, cumulative accounting, conservation, active-count consistency. `EchidnaFlorinToken` (8): FlorinToken supply/minter fuzzing. (`EchidnaToken` is the `FigaroCore` harness's support ERC-20, not a harness.) |
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

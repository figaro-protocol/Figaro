# Testing — Harness Inventory

`LOCAL_DEV.md` keeps the run commands; this file is the full inventory of test files, harnesses, and properties across all verification layers. Where each layer runs — CI or the maintainer's gate — and which checks were shown to fail under a mutation: `VERIFICATION_MAP.md` § 0. Every name in this file exists in the tree as written.

**What success looks like, per harness** (so a first run is judgeable without
digging): Foundry — `forge test --via-ir` exits 0 with every suite green and no
skipped test; Halmos — every listed property prints `[PASS]`, none `[TIMEOUT]`;
Certora — the cloud run reports all rules verified (no `violated`, no sanity
failures); Echidna — all properties hold across the run (`passing!`, no
counterexample); TLA+ — TLC finishes with "No error" and states-generated > 0
for each model; SDK/frontend Vitest — `vitest run` exits 0, all files passing;
Playwright — every project green, no test skipped by the devnet gate it expects
to run under. Any harness ending some other way is a failure to investigate,
never a variant of success.

## Foundry (`test/`)

The test tree mirrors `src/` (`test/core/{kernel,attestation,verifier}/`, `test/build/{registries,rewards,florin}/`, `test/app/`,
`test/mocks/`); audit by `find test -name '*.t.sol'`,
not by this paragraph. Current: `FigaroCoreTest`, `FigaroCore_RevertBranch`,
`FigaroCore_EventEmission`, `AttestationCoordinatorTest`, `ClauseRegistryTest`,
`AgreementRegistryTest`, `AssemblyRegistryTest`, `MembersRegistryTest`, `GasCeilingTest`,
`WitnessSwapAndCommitCoordinatorTest`, `WitnessSwapAndCommitCoordinatorForkTest`,
`FigaroBatchVerifierTest`, `UsageCounterTest`, `RpgfMinterTest`, `RpgfIntegrationTest`,
`TreasuryProcurementTest`, `MockDisperseTest`, `ReentrancyAdversarialTest`,
`Eip712ParityTest`, `MerkleParityTest`, `KernelTransitionVectorsTest`,
`KernelDifferentialFuzzTest`,
`WeirdTokenTest`, `DeployWiringTest`, `HalmosFigaroCore`, `FlorinToken.t.sol`.

`UsageCounterTest` covers the reward-accrual counter: the RESOLVED-order gate, merkle
inclusion against the signed `checkoutHash`, per-(clause-or-assembly, process) GLOBAL idempotence (a
process counts once ever — re-recording it in a later period reverts, and a later period
counts only trade new to it), the **member-stake gate on the seller of record** (`SellerNotStaked` when the seller-of-record is
not registered; a seller who leaves the registry stops counting), **uniform scoring across clauses, agreements and assemblies** (no
category, tag, or weight), the agreement and assembly legs from one provenance leaf
(`test_oneOrderCreditsItsAgreementAndItsAssembly`), the membership proof refused under
another `assemblyHash` or with another agreement's bytes, the agreement kind gated by
`AgreementRegistry` on both paths (`test_revertsWhenAgreementNotRegistered`,
`test_batchAccrualGatesTheAgreementKindByTheAgreementRegistry`), the three kinds never
sharing a count, both reserved keys refused under the agreement kind and the terms leaf
never passing as an agreement, period boundaries and `periodClosed`, `totalScoreIn` delta
maintenance, and a fuzzed floor-cube-root property on `icbrt` **over the whole `uint256`
domain** plus a no-saturation regression. Never bound a fuzz domain to less than the
function's own: on `icbrt` a `uint64`-only domain is the one place a wrong cube bound is
coincidentally exact, so saturation passes unseen.
`RpgfMinterTest` exercises
the payout maths against a counter stub — uniform pro-rata share (**no per-wallet cap**: a
dominant wallet takes its full pro-rata share), a withdrawn designer forfeiting the reward,
the designer-side membership gate (a non-member refused with `NotLiveMember` after the period
checks and before any key, quoted zero by `claimable`, refused after a withdrawal request and
paid again once registered again, the gate the claimant's alone),
the live-registration gate on all three registries (`test_agreementDesignerIsPaid`,
`test_theThreeKindsPayOnlyTheirOwnDesignerOfRecord`), the closed-period requirement, and the
per-tranche budget backstop. `RpgfIntegrationTest` (8) proves the two compose with NO stubs: a
real bonded process resolves, its usage is counted against the real counter, the period closes,
and the real minter mints real florins — a registered agreement's designer of record among
them (`test_aRegisteredAgreementsDesignerIsPaidForItsUse`).

`WeirdTokenTest` hands `FigaroCore` the ERC-20 shapes beyond fee-on-transfer —
no return value, six decimals, an issuer blocklist, a rebase — and
`FigaroBatchVerifierTest` the no-return and blocklist shapes on the batch
path (`DESIGN_DECISIONS.md` #9 owns what each shape means). `DeployWiringTest`
runs both deploy scripts as they would broadcast and reads every immutable
and genesis parameter back from the deployed contracts.
`ReentrancyAdversarialTest` hands the protocol a `MockReentrantToken` that
re-enters mid-transfer and asserts the `nonReentrant` guard fires (nested call
reverts) while the outer resolution completes exactly once — across
`FigaroCore.commit`, `FigaroCore.resolveProcess`, and
`FigaroBatchVerifier.settleBatch`.

`FigaroBatchVerifierTest` covers the batch verifier: the happy path
with value legs, the ClauseRegistry spec-binding anchor gate (permissive-spec
substitution + unregistered clause both revert; a never-seen registered clause
resolves with zero verifier changes), state-root continuity, calldata-tamper
reverts, and constructor guards.

`WitnessSwapAndCommitCoordinatorForkTest` is the mainnet-fork parity proof for the
Permit2 witness digest: gated on `MAINNET_RPC_URL` (each test SKIPS without it,
never silently passes), it proves the `swapWitness` convention is accepted by the
canonical Permit2 deployment and that a substituted swap route is rejected by real
Permit2's own signature check — the one claim the mocked suite proves only against
our own digest reconstruction (`MockWitnessPermit2`). Its sibling contract in the
same file, `WitnessSwapAndCommitCoordinatorSepoliaVenueForkTest` (gated on
`SEPOLIA_RPC_URL`, same skip discipline), is the real-VENUE proof: the coordinator
drives the deployed Sepolia SwapRouter02 (`deployments/11155111.json`
`swapRouter`) through the real WETH/USDC pool with `exactOutputSingle` calldata
built the documented way (the SDK's `SWAP_ROUTER_02_ABI` shape), proving the
allowance-pull composition end to end.

## Halmos (`test/`) — 4 harness files, 41 properties

| Harness | Properties | Key invariants |
|---|---|---|
| `HalmosFigaroCore.t.sol` | 7 | Token conservation, bond amounts, resolution payouts, status transitions, buyer dominance, monotonicity |
| `HalmosMembersRegistry.t.sol` | 7 | The stake mechanics the designer-reward Sybil bound assumes: solvency, no stake recycling, de-surfacing at request, the counter reads that gate |
| `HalmosUsageCounter.t.sol` | 9 | The accrual arithmetic on top of the (already proved) stake gate: direct-path monotonicity, batch write REPLACES cumulative (c,d) never adds, `scoreOf == accrualOf.score + batchAccrualOf.score` (the only meeting point of the two paths), period bucketing ×2, isolation across keys, `check_theKindsNeverShareAKey` — a use counted under any one of the three kinds, on either path, leaves every other kind's accrual at the same key empty — `check_aKindNeverDisturbsAnotherKindsAccrual` — it leaves another kind's existing accrual at the key exactly as it was — and `check_anUnknownKindIsSkipped` — a batch accrual whose kind names no registry writes nothing under any kind and leaves the period total where it was. Mutation-checked: replace-not-add, score composition, and `check_aKindNeverDisturbsAnotherKindsAccrual` (a counter writing every kind's accrual, direct and batch, to the clause kind fails it on every path combination). |
| `HalmosClauseAgreementAndAssemblyRegistries.t.sol` | 18 (6 per contract) | `HalmosClauseRegistry` + `HalmosAssemblyRegistry` + `HalmosAgreementRegistry` — the stake machines `RpgfMinter._isAuthor` reads, one per kind: solvency under arbitrary interleavings by two registering wallets, full withdrawal, first-write-wins permanence, one-shot withdrawal, eligibility ends permanently at withdraw, cross-key isolation. Mutation-checked: solvency + first-write-wins on the clause and assembly contracts, 4/4 counterexamples. |

Run with `scripts/test-halmos.sh` (seven passes). **Halmos does not model
`expectRevert`** — assert on a low-level call's own success flag instead. It
also needs the compiler AST, so a build made without it silently yields "no
tests found"; the runner's `forge build --ast` handles that, but a manual
`forge build` in between will overwrite the artifact and reproduce it. The
script fails any pass that prints "No tests", whatever halmos's exit code.

**A passing symbolic property can still be vacuous.** The two anti-recycling
properties are mutation-checked: a deliberate recycling bug in
`MembersRegistry.register` makes both produce counterexamples. Do the same for
any new property whose failure mode matters — "it proved" is not evidence that
it *could* fail.

## Certora (`certora/`) — 8 specs

| Spec | Rules | Covers |
|---|---|---|
| `FigaroCore.spec` | 10 | Status monotonicity, transitions, active count, buyer dominance, no double-commit, cumulative monotonicity, rootBuyer immutable, currency immutable, and the A-10 binding: a committed order has a process and its `orderProcessId` never changes. |
| `AttestationCoordinator.spec` | 8 | Role-gate on `attestAsBuyer` and `attestAsSeller` (non-party reverts; success ⟹ caller is the commitment's buyer or seller; a `satisfy` twin shows each success reachable) + parametric Core-immutability (AC cannot change orderStatus or processes[]). No on-chain clause-content validator — well-formedness is an off-chain concern. |
| `TokenOpsVerification.spec` | 7 | Universal FigaroCore token-flow: exact commit deltas (buyer/seller/Core), allowance-drain safety (∀ address), commit + single-order resolve conservation, single-order resolve exact payouts. Generalizes Halmos root-only coverage to arbitrary sub-orders. |
| `FlorinToken.spec` | 6 | Supply cap, registered-cap bound, registered-cap monotonicity, renounce one-way latch, minter cap immutability, minter within cap |
| `BatchVerifierTokenOps.spec` | 4 | FigaroBatchVerifier net positions: user delta = payout−deposit, contract delta = deposit−payout, allowance-drain safety, conservation (single-position; inductive generalization documented in-spec). Aligned to the witness model and the usage-bridge `settleBatch` signature (`BatchUsageData` threaded, usage loops bounded). |
| `BatchVerifierStateRoot.spec` | 3 | FigaroBatchVerifier's state root chains: a resolved batch's `prevRoot` is the root the verifier held and its `newRoot` the root it leaves; each resolved batch advances `batchCount` by one; no other function moves either. So the `BatchSettled` events form one unbroken, gap-free chain from the initial root. Read through `certora/harness/FigaroBatchVerifierHarness.sol` (the contract plus a pure `decodedRoots` view over its own `_decodePV`). Mutation-checked: all three. |
| `RpgfMinter.spec` | 10 | Per-period mint conservation (`minted ≤ periodAmount` under any claim sequence), no double-claim per wallet-period, no claim while the period is open, duplicate-clause-or-assembly rejection, live-stake eligibility (`_isAuthor`, the gate on a live registration), the designer-side membership gate (a claimant with no live member stake reverts and mints nothing; `claimable` quotes it zero), minted monotonicity — plus two supplementary rules proving `claimable`'s view quote matches `claim`'s behavior. Mutation-checked: conservation, double-claim, eligibility. |
| `RpgfMinterAuthor.spec` | 2 | `RpgfMinter._isAuthor` as written — the kind selection `RpgfMinter.spec` summarizes to a ghost: for each of the three kinds the answer is the live designer of record in the one registry that kind names, whatever the other two hold at the same key, and a kind past the three reverts. Read through `certora/harness/RpgfMinterAuthorHarness.sol` (the contract plus a view calling `_isAuthor`) against `certora/harness/AuthorRegistryMocks.sol` (one getter contract per registry family, linked to the minter's three registry addresses). Compiled without via-IR: under via-IR the prover's call resolution fails on `_isAuthor`'s decoding of the dynamic `string` that `bindings` returns. Verified, both rules: https://prover.certora.com/output/9512759/f62a013cbdb44692b77bf04219670f75 |

Companion: `certora/token-ops.inventory` — declarative inventory of every ERC20 transfer call site in `src/`; `scripts/lint-token-ops.sh` (lint-staged on any staged `.sol` or on the inventory, and the prelude of `./scripts/test-certora.sh`) fails a commit that adds a transfer call without an inventory entry.

## Echidna — 2 harnesses, 15 properties

| Harness | Properties | Path |
|---|---|---|
| `EchidnaFuzzer` | 7 | `src/echidna/EchidnaFuzzer.sol` — `FigaroCore`: solvency, active-count consistency, cumulative accounting, state monotonicity, token conservation, buyer dominance, atomic resolution |
| `EchidnaFlorinToken` | 8 | `src/echidna/EchidnaFlorinToken.sol` — FlorinToken: MAX_SUPPLY never exceeded, deployer can renounce, no deployer mint after renounce, minter cap enforced, no zero-address minter, no mint to zero address, total supply = sum of balances, transfer preserves supply |

`src/echidna/EchidnaToken.sol` is not a harness — it is the minimal ERC-20 the `FigaroCore`
harness fuzzes against (`EchidnaFuzzer.sol` imports it); it declares no `echidna_` properties.

## TLA+ (`formal/`) — 64 invariants across 5 models (FigaroCore 9 + FlorinToken 8 + WitnessSwapAndCommitCoordinator 10 + ResolutionUniverses 20 + RelayState 7 + its deferral 10)

FigaroCore (`MC.tla` + `MC.cfg`): `TokenConservation`, `ContractSolvency`,
`WalletNonNegative`, `CumulativeIntegrity`, `ActiveCountCorrect`,
`ResolutionAlwaysPossible`, `TypeOK`, and the two that tie the equilibrium
proof's payoff table to the machine — `DeterrentEscrowMagnitudes` (the held deposits
is exactly 2×payment from the buyer + 2×cumulativeValue from the seller of every
committed order) and `SettledNetPositions` (resolution moves exactly `payment`
buyer → seller and returns both bonds whole).

FlorinToken (`FlorinToken.tla` + `FlorinToken.cfg`): `Inv_MaxSupply`,
`Inv_DeployerCannotMintAfterRenounce`, `Inv_MinterCap`,
`Inv_CapBelowMaxSupply`, `Inv_SupplyEqualsSumMinted`, `Inv_NonNegative`,
`Inv_NoMintToZero`, `Inv_BalancesSumToSupply`.

WitnessSwapAndCommitCoordinator (`WitnessSwapAndCommitCoordinator.tla` + `.cfg`):
the swap-funded on-ramp at EVM-step granularity (revert frames
explicit, so "swap landed, commit didn't" states are reachable and proved never
quiescent): `Inv_TypeOK`, `Inv_Conservation`, `Inv_NonNegative`,
`Inv_ZeroRetention`, `Inv_AllowanceHygiene`, `Inv_Atomicity`,
`Inv_BondFormula`, `Inv_CoreEscrowExact`, `Inv_WitnessRouteBinding`,
`Inv_CoordinatorNotCounterparty` — 38,028,525 states / 1,979,101 distinct,
depth 17, ~3–4 min. Mutation-checked: 6 mutations, each caught.

ResolutionUniverses (`ResolutionUniverses.tla` + `.cfg`): the
CROSS-CONTRACT model — FigaroCore + FigaroBatchVerifier + UsageCounter + the
off-chain guest mirror under arbitrary interleavings; the only harness that can
see where the two paths meet (every other layer is per-contract).
20 invariants: no double payout across the universes, token conservation +
exact per-pool deposits, usage-score composition (`scoreOf == direct + batch`,
the bridge write REPLACES never adds), `FigaroCore` blindness (`settleBatch` writes
no `FigaroCore` `orderStatus`) — 10,030,087 states, ~9.5 min. Mutation-checked: 5 mutations + 7 non-vacuity witnesses, each caught.
The model's `Artifacts` are one abstract keyspace; it does not model the
reward's kind, so the separation of clause and assembly accruals by (kind,
key) is held by Foundry, Halmos (`check_theKindsNeverShareAKey`, `check_aKindNeverDisturbsAnotherKindsAccrual`, `check_anUnknownKindIsSkipped`), Certora (`RpgfMinterAuthor.spec`) and the
guest's `usage.rs`, never by TLC.
Two NAMED assumptions ride as `.cfg` constants: `AssumeDomainSeparation`
(contract-enforced — EIP-712 `verifyingContract` disjointness carries
no-double-payout) and `AssumeAccrualGatesAligned` (NOT contract-enforced — a
dropped batch's accrual is forgone at process granularity, under-pay only).
Flipping either to FALSE is the experiment, is EXPECTED to fail, and is not a
regression.

RelayState (`RelayState.tla` + `.cfg`): the relay's state lifecycle
(`prover/sequencer/src/state.rs`, `main.rs`) — 2 relays, 3 batches, a crash at
any step, a kept-file write that fails, a batch the chain refuses, anyone
resending a public proof, and a takeover from another relay's `GET /state`.
7 invariants — `Recoverable` (whenever the verifier's root is past genesis,
some relay has the state behind it on disk), `BuiltOnVerifierRoot`,
`MirrorOnVerifierRoot`, `KeptOnVerifierRoot`, `JournalBuiltOnVerifierRoot`,
`HistoryHasNoRepeat`, `TypeOK` — and two action properties:
`MirrorNeverGoesBack`, and `SendsExcludeKnownRevoked` (a relay never sends a
batch carrying a party whose revocation a refusal already showed it — the
re-batch drops the revoker and rebuilds with everyone else):
10,837,227 states / 1,959,944 distinct, depth 32, under two minutes.
Mutation-checked through five `.cfg` switches, each restoring one defect:
`HoldBeforeSend`, `HoldThroughRevert`, `KeepRetainsBuiltOnRoot`,
`TakeoverChecksRoot` — each FALSE fails `Recoverable` — and
`RebatchDropsRevoker` — FALSE fails `SendsExcludeKnownRevoked`.

RelayState's second spec, `DeferSpec` (`RelayState.tla` +
`RelayStateDeferral.cfg`, the sixth pass of `scripts/test-tla.sh`): the
deferral of an operation dropped at batch formation
(`prover/sequencer/src/main.rs`, `mempool.rs`) — five operations (a commit
and one built on its order, honest, of one process; two operations that
never apply, which anyone may submit free, each once at any tick, one
naming that process, the other naming a second; and a
resolve listing one order twice), a drain cap of 3, a window of 2 ticks in
4, a re-queue cap of 1, funding reads that fail or show a shortfall,
transient send failures, and a copy resubmitted while a tick runs.
Deferrals wait in drain groups — each operation touches one process, so a
group is one process's operations — which decide
what is drained together and nothing else; each operation expires on its
own window, and what was filtered behind it goes with it.
10 invariants — `DeferralBoundedInTime` (nothing deferred is held past its
own window, retried or not, and nothing is dead-lettered before it unless
with an operation it was filtered behind), `HonestWindowKept` (no honest
operation is dead-lettered before its own window ends unless an operation
it depends on was), `DependentLeavesWithItsDependency` (no operation stays
deferred after one it was filtered behind is dead-lettered),
`DrainGroupIsAClass` (every drain group is one class of the transitive
closure of touching a common process over its formation's deferrals),
`DoubleListingNeverAdmitted`, `RequeueCapCountsTransients`,
`NoExtraDraining` (a drain that retries a deferred operation leaves nothing
queued behind it), `BuiltOnOnlyBehindDead`, `NoTwoCopies`, `DTypeOK`:
445,431 states / 116,190 distinct, depth 19, about 21 minutes.
Mutation-checked through nine more `.cfg` switches, each FALSE failing the
invariant it names: `DeferBoundedInTime` → `DeferralBoundedInTime`,
`DeferOwnCounter` → `RequeueCapCountsTransients`,
`DeferDrainsOnlyFreeSlots` → `NoExtraDraining`, `DeferMovesDependents` →
`BuiltOnOnlyBehindDead`, `DeferDropsCopy` → `NoTwoCopies`,
`DeferGroupsByProcess` → `DrainGroupIsAClass`, `DeferOwnWindow` (whole-group expiry) →
`HonestWindowKept` (checked alone, with the honest side held to the commit
so the window is cut by an operation that never applies),
`DeferDependentEdge` (each operation on its own window alone) →
`DependentLeavesWithItsDependency`, `AdmitRefusesDoubleListing` →
`DoubleListingNeverAdmitted`; the counterexamples are 6, 6, 8, 5, 5, 5, 8,
8 and 2 states long. `Spec` holds the deferral's variables at their
initial values, so the lifecycle's figures above are unchanged by it.

## Lean 4 (`formal/lean/`) — the equilibrium, machine-checked

`FigaroEquilibrium.lean` closes the one step no model checker can express —
a rational agent CHOOSING. Over the exact payoff table the TLA⁺ invariants
pin to the shipped `FigaroCore` (`DeterrentEscrowMagnitudes` / `SettledNetPositions`),
it proves: `buyer_resolves` (post-performance, resolving strictly beats
withholding, unconditionally), `seller_performs` (performance is the strict
best response given resolution, at every feasible retention `r ≤ Gᵢ`),
`deterrent_gap` (`Δᵢ = Pᵢ + Gᵢ ≥ 2Pᵢ`), `holdout_when_dead` (the honest
conditionality — cooperation is a best response GIVEN the others perform,
never a dominant strategy), and `Chain.cooperation_is_equilibrium` (the
N-party chain: no unilateral deviation profits at any position, with the
inclusive accumulator `Gᵢ = ∑_{j≤i} Pⱼ` derived, not assumed). Dependency-free
by design: core Lean 4 + `omega`, no Mathlib — `lake build` from
`formal/lean/` needs no network beyond the pinned toolchain; `sorry`-free
(`#print axioms` shows `propext` and `Quot.sound`, and `Classical.choice` for the
margin result `deterrent_gap`). Optional
credibility asset, not release path.

## Rust — the proof apparatus (`prover/`)

`cargo test` from `prover/` — five crates, one suite. Prereq: three of the five
(`figaro-prover` — the SP1 guest at `prover/program` — plus `figaro-prove-test`
and `figaro-sequencer`) need the SP1 toolchain (`cargo prove`) to build; without
it, `cargo test -p figaro-clause -p figaro-kernel` runs the two host-only crates,
the subset `prover-ci` gates on every PR (its `sp1` job runs the other three on
main). The crates: `figaro-clause`
(off-chain conformance: every spec in `clauses/` parses — count derived from the
directory; the encode vectors in `prover/clause/tests/encode_conformance.rs`,
generated from the live TS encoder, lock byte parity — signed int256,
stage-scoped witnesses, tuple[] arrays, top-level bytes32 and address words, open formats), `figaro-kernel` (frozen Foundry parity vectors for commit/resolve;
the transition replay — `prover/lib/tests/transition_vectors.rs` replays
`test/fixtures/kernel-transition-vectors.json`, harvested from the live `FigaroCore`
by `KernelTransitionVectorsTest`, and asserts every id, bond, payout,
accumulator and active count; the three packer vectors (`packers.rs`) and the
Merkle leg of the agreement-tree lock (`merkle_parity.rs`), both asserted on
the Solidity side too +
the witness-gate suite: spec-identity substitution (Gate S,
`keccak256(spec_json) == clause_id`), a lookalike spec under the same name
refused, content-hash mismatch, inclusion failure, attest-after-resolve; the
usage bridge in
`prover/lib/tests/usage.rs` — same-batch credit against the post-state, cross-batch
replay rejection (the reason the counted set rides the state root), breadth
vs depth, the agreement leg via the two-key provenance reproduction
(`credits_an_agreement_through_the_provenance_leaf`, refused on a wrong
`agreementHash` or `assemblyHash`), the assembly leg via the same leaf plus
the agreement's membership proof (refused on another agreement's hash, a proof
under another root, or the wrong agreement content), one provenance leaf crediting
the agreement and the assembly apart, both reserved keys refused on every kind
(`every_kind_keyed_on_a_reserved_key_is_refused`) and the terms leaf never
passing as an agreement, the reserved provenance leaf attestable without a
spec (and refused on an uncommitted key, a foreign contentRef or non-canonical
bytes), a clause and an assembly on the same key accruing apart, and the usage-hash vector (each
accrual `key ‖ kind ‖ c ‖ d`) asserted verbatim on the Solidity side; bincode roundtrips
fence the SP1 stdin landmines), `figaro-prover` (the SP1 guest program itself,
exercised through the next crate), `figaro-prove-test` (SP1 mock-executor guest tests — the guest's committed
bytes must equal the host's `PublicValues.abi_encode` byte-for-byte — the exact
words the on-chain verifier hashes against the proof's digest — and decode back
field-for-field against host `apply_batch`; in-VM Gate-S
rejection; `SP1_REAL_PROOF=1` generates + verifies a real local Core proof;
`prover/script/tests/clause_keys.rs` canonicalizes every `clauses/*.json` and
asserts it hashes to the SDK's key in `test/fixtures/clause-keys.json`),
and `figaro-sequencer` (mempool runs the mirror's own witness gates at the
door; a dedup slot belongs to the submission that will be accepted — a
stranger's resolve, the buyer's signature over another order list, and an
attestation with other witness spec bytes each leave the real one queued; the state store — the kept state
survives a restart with its root, a batch's state is held across a crash
before its receipt and for as long as the batch can land, a held root is not
replaced, a damaged state file or journal is refused, a verifier root the
relay does not hold finds nothing, and `GET /state` serves a state another
relay opens with the same root; a batch takes at most `MAX_BATCH_OPS` and its
settle is planned to fit the block from the batch's own execution (`gas.rs`,
the newest operations given back when it would not); a
wallet's funds are allocated across a batch's commits; an attestation's
spec hash is the registry check's input; assembler fixpoint filtering incl. the resolve-closes-the-evidence-window
property and the three crafted streams — a bond committed twice, in one batch
and across two; a resolve that omits an order; a resolve replayed in its own
batch and in the next — each dead-lettered with the mirror's own reason while
the honest ops still form the batch; the submitter's signing key is required,
unset or blank refuses at startup; the funding gate — both balance and
allowance cover the bond, a commit the chain cannot be asked about is dropped
conservatively, no verifier means no reads; the re-queue cap dead-letters an
op after the third transient failure and a fresh admission starts it over;
HTTP API incl. the per-address submit rate limit (`429`, another address
still served) and arrival-order draining across clients; mempool→assemble→mirror→advance pipeline; and the
publication archive — retention survives the drain that clears the mempool,
the window is bounded and evicts cleanly, the journal survives a restart and
rotates instead of growing, and every read route republishes what `FigaroCore`
would have emitted, asserted VERIFIABLE: the published struct re-derives its
own order hash and both signatures recover to the parties named inside it).

`sdk/tests/batch-e2e.test.ts` is the cross-language lock: TS signs + builds
the witness payload, the Rust sequencer binary proves + submits, the Solidity
verifier checks the hashes and the registry anchor on a live Anvil — value
legs asserted from the chain. Between its two batches the test starts a relay
that holds no state, which must refuse to start; starts a second relay on the
first relay's `GET /state`, which must hold the verifier's root; and restarts
the relay that built the first batch, which must resume on its kept state and resolve the
second. The verifier is deployed with the fingerprint
the binary itself reports (`sequencer --vkey`), so the sequencer's startup
comparison against `programVKey()` runs for real. Anvil-gated (skips clean without it) locally;
`prover-ci`'s `sp1` job runs it on main with `REQUIRE_BATCH_E2E=1`, where a
skip is a failure.

`sdk/tests/batch-revoke-e2e.test.ts` drives the relay's deterministic-revert
arm on the same harness (`sdk/tests/batchHarness.ts`, which both files share):
two commits from one buyer with two sellers form one batch; one seller revokes
its allowance after the funding check and before the send; the batch is
refused, the revoker's op is dead-lettered alone and the other lands in the
next batch — the balances, the one `BatchSettled` and the per-order answers
read from the chain, the dead-letter count and its reason from `/status`.
Same gate as the batch test; `prover-ci` runs both.

`frontend/tests/e2e/audit-relay.devnet.spec.ts` is the audit page's end of the
same path: it starts the built sequencer against the DEVNET's own verifier (the
devnet pins that binary's guest, `scripts/deploy-local.sh`), commits one order
through the relay as an agent would (`SequencerClient`), waits for the batch,
reads the verifier's `stateRoot()` and the relay's `GET /state` out of band and
holds the recomputed root to the chain's, then opens `/audit/view` with the
relay as the browser's endpoint and asserts the order's verdict and its
`state-inclusion` check on screen. Skips when no binary is built.

## Frontend Vitest (`frontend/tests/`) — 2 tiers

`npx vitest run`. UI logic that needs neither a chain nor a real browser.
The census is the directory listing (`ls frontend/tests/{components,lib}` —
derived, never a stored count). Pre-commit runs the slice a staged file reaches:
`scripts/lint-vitest-related.sh` (lint-staged, `vitest related` over staged files
under `frontend/{app,components,lib,tests}`, never an e2e spec), so a source change
that empties a fixture fails before the push rather than in Frontend CI.

- **Component tier** (`tests/components/`) — React Testing Library:
  `Header`, `MobileNav`, `CapabilityRail`,
  `MemberTrackRecord`, `TokenAddressInput`, `TokenApprovalFlow`, …
- **Lib tier** (`tests/lib/`) — pure-client unit tests: commitment
  preparation + stores, clause-spec source, discovery +
  catalog pipeline, IPFS service, geocode, and the rest —
  the directory listing is the census, never this prose.

**The paper PDFs** (`frontend/scripts/build-paper-pdfs.mjs`, FRONTEND.md §
"Static export") have two checks. `frontend/tests/lib/paperLatex.test.tsx` (lib tier)
renders the real `PaperLayout` and `Math` to static markup and asserts the
HTML → LaTeX conversion of `frontend/scripts/paper-latex.mjs`: each formula's TeX taken
verbatim from KaTeX's annotation (inline `$…$`, display `\[…\]`), entities and
LaTeX specials, sections, run-in headings, lists, tables, figures, the
preprint header, and the references with their URLs. `npm run
check:paper-pdfs` (`frontend/scripts/check-paper-pdfs.mjs`, after a build) reads every
built PDF's text layer with pypdf (`python3 -I`) and fails unless every inline
formula sits in its sentence: the transaction-scoped-institutions §2 ("the
buyer bonds twice the payment") and §5 ("Market with a court") sentences
quoted in order, every inline `<Math>` of every paper found between the
page's own words before and after it (never side by side — a formula-shaped
hole — and never missing; a formula beside another formula or at a block
edge has no sentence text to anchor and is counted, not checked), and no
". :"-style punctuation gap the page does not itself write.

The hash- and wire-load-bearing choreography suites live with their code in
`sdk/tests/` (`npm --prefix sdk test`): agreement/assembly projection, the
assembly→orders walk, checkout planning + sub-order pricing, the handoff
ECDH, and the commitment envelope — several pinned byte-exact to
`sdk/tests/fixtures/promotion-golden-vectors.json` (`HARVEST_GOLDEN_VECTORS=1` in
`frontend/tests/lib/promotionGoldenVectors.test.ts` regenerates them, legitimate
only before a move).

**EIP-712 parity — the unconditional cross-language lock.**
`sdk/tests/eip712Parity.test.ts` freezes SDK-computed EIP-712 vectors (domain
separator, struct hash, root digest/processId, order hash) into
`test/fixtures/eip712-vectors.json` and self-checks the SDK still reproduces
them (`HARVEST_EIP712_VECTORS=1` regenerates them). `test/core/kernel/Eip712ParityTest.t.sol`
reads that same fixture and asserts the Solidity `FigaroCore` reproduces every hash —
`CommitmentTypes.hashStruct` directly, the order-hash derivation verbatim, and
the domain separator both ways (SDK vector == formula, and a live
`FigaroCore.DOMAIN_SEPARATOR()` == formula). Runs in BOTH the SDK and Foundry
CI jobs with no chain and no skipIf: a hard gate on SDK↔`FigaroCore` signature
agreement.

**Merkle parity — the three-way agreement-tree lock.**
`sdk/tests/merkleParity.test.ts` freezes SDK-built roots, leaves and inclusion
proofs (a three-clause agreement and a one-clause one) into
`test/fixtures/merkle-vectors.json` (`HARVEST_MERKLE_VECTORS=1` regenerates).
`test/core/attestation/MerkleParityTest.t.sol` rebuilds every leaf the way
`AttestationCoordinator` and `UsageCounter` do and verifies every proof with
the OpenZeppelin library they call; `prover/lib/tests/merkle_parity.rs` does
the same through the guest's verifier. Three implementations, one fixture.
Each clause in the fixture carries its `clauseKey`, the leaf's key, and its
provenance entries carry the two-key bytes
(`{"agreementHash":…,"assemblyHash":…}`).

**Assembly parity — the three-way composition-tree lock.**
`sdk/tests/assemblyParity.test.ts` freezes, for the three vector composed
agreements, each `agreementHash` with its key bytes, the agreement bytes and
leaves, the assembly terms leaf, the assembly root, every agreement's
membership proof, and the provenance bytes and leaf for each agreement's two keys
into `test/fixtures/assembly-vectors.json` (`HARVEST_ASSEMBLY_VECTORS=1`
regenerates); it also asserts a membership proof does not verify under
another assembly's root. `test/core/attestation/MerkleParityTest.t.sol`
(`test_everyAgreementHashIsTheRootOverItsClauseLeaves`,
`test_everyAssemblyVectorOpensUnderItsRoot`) rebuilds them the way
`UsageCounter` does; `prover/lib/tests/merkle_parity.rs`
(`every_agreement_opens_under_its_own_root_and_no_other`, the terms leaf on
its reserved key, a one-agreement root equal to its leaf) and
`prover/lib/tests/parity.rs` (`every_vector_agreement_credits_its_agreement_and_its_assembly`,
and the refusals of a foreign membership proof, a wrong `agreementHash` and the
terms leaf as an agreement) do the same through the guest. The properties
behind the fixture — every membership proof verifies under its own root and no
other, editorial prose never moves the root or the key, any clause value moves
the key, the two-key provenance bytes decode back to their keys — are
`sdk/tests/assemblyInclusion.property.test.ts`.

**Clause keys — the two-language canonicalization lock.** A clause key is
`keccak256` of the spec's canonical bytes, so the SDK and the guest must
canonicalize identically. `sdk/tests/clauseKeys.test.ts` derives every
`clauses/*.json` key with `computeClauseKey` and checks it against
`test/fixtures/clause-keys.json` (`{ name: key }`, one entry per spec;
`HARVEST_CLAUSE_KEYS=1` regenerates); `prover/script/tests/clause_keys.rs`
(`figaro-prove-test`) and `prover/lib/tests/parity.rs` read the same fixture
and assert the Rust canonicalization lands on every key. The resolver from
written clause names to keys — a local authoring read run before a document
is published — is covered by
`sdk/tests/assembly.test.ts` § `resolveAuthoredClauseKeys`: a name two loaded
specs share is refused unless written `name@version`, and every reference
assembly in `assemblies/` resolves against `clauses/` and re-hashes.

**`FigaroCore` transition vectors — the mirror replays `FigaroCore`.**
`test/core/kernel/KernelTransitionVectorsTest.t.sol` runs six scenarios on
`FigaroCore` (a root left open; root and sub resolved; three links; one
seller on two orders; a self-trade; two processes in one batch) and writes what
happened — every commitment with the ids `FigaroCore` returned, every party's
deposit and payout, `FigaroCore`'s balance delta, every process's accumulator
and active count — to `test/fixtures/kernel-transition-vectors.json`
(`HARVEST_KERNEL_VECTORS=true` regenerates; otherwise the run must reproduce
the frozen bytes). `prover/lib/tests/transition_vectors.rs` signs the same
commitments with the same keys, applies them through `apply_batch`, and asserts
every figure — the mirror's bond and payout arithmetic is locked to
`FigaroCore`'s, not to a comment.

**Clause-engine vectors — the engine's boundaries, one by one.**
`sdk/tests/clauses/engineVectors.test.ts` names each boundary of the clause
engine — every character position of the datetime format, every hex width,
every shape the regex screen reads, every construct on which the two regex
libraries part and every edge of the portable pattern core, every bound a
spec declares, the specs that parse and the ones that do not — and freezes Layer A's verdict on each
into `test/fixtures/clause-engine-vectors.json`
(`HARVEST_CLAUSE_ENGINE_VECTORS=1` regenerates);
`prover/clause/tests/engine_vectors.rs` asserts the guest's engine gives the
same verdicts and the same bytes. The EIP-712 fixture carries the batch
path's three authorizations — `ResolveProcess`, `AttestSeller`, `AttestBuyer`,
hashed by viem from the type strings — and
`prover/lib/tests/eip712_vectors.rs` asserts the guest's hashes and digests
against them and against the commitment vectors.

**The differential fuzz — the mirror answers a generated stream as `FigaroCore`
did, and both Merkle verifiers open generated agreements.**
`scripts/test-cross-impl-fuzz.sh` runs two streams under one seed. The
agreement stream: `sdk/tests/merkleParity.test.ts` under `AGREEMENT_FUZZ_SEED`
generates agreements of one to six clauses (`agreementArb`, the SDK's own
property generator) and writes each root, leaf and inclusion proof to
`test/fixtures/streams/agreements.json` in the Merkle fixture's format;
`MerkleParityTest` and `prover/lib/tests/merkle_parity.rs` read that file
through `MERKLE_VECTORS`, rebuild every leaf, open every proof, and refuse a
tampered leaf. The clause stream:
`sdk/tests/clauses/clauseFuzzVectors.test.ts` under `CLAUSE_FUZZ_SEED` draws
cases from every spec in `clauses/` and from generated specs nobody has seen
(some malformed) and from specs of one patterned field whose pattern is drawn
from the characters regexes are written in, with content drawn from each
spec's field shapes — half of
the draws inside every bound, half crossing them, strings leaving ASCII in
both — and writes Layer A's three answers to `test/fixtures/streams/clauses.jsonl`:
whether the spec parses, whether the content validates, and the canonical ABI
bytes; `prover/clause/tests/fuzz_vectors.rs` asks the guest's engine the same
three questions. Without the variable the SDK file asserts the generator is
deterministic. The `FigaroCore` stream has two halves.
`test/core/kernel/KernelDifferentialFuzzTest.t.sol` draws a stream of commits
and resolutions from the seed, over five wallets and two tokens: valid ones,
and malformed ones (an expired deadline, a zero payment, a wrong signer, a
cumulative value off by one, an unknown or resolved process, another wallet as
buyer, the other token, a replay, a payment in the overflow window, a high-s
signature, a recovery id written 0/1, a zeroed signature; a resolution by a
wallet that is not the buyer, one order short, holding a foreign order, of a
resolved process, of an unknown process). Each runs on `FigaroCore`; the ids
it returned, or the error it reverted with, go to
`test/fixtures/streams/kernel.jsonl`, one JSON object per line, followed by every
wallet's deposits and payouts and every process's final state. The generator
asserts nothing about which error a malformed operation earns: `FigaroCore`'s
answer is the oracle. `prover/lib/tests/fuzz_stream.rs` replays the stream
through `apply_batch_with_state`, one operation per batch over the state the
previous batch left, with the stream's own signature bytes, and asserts the
same acceptance, the same error, the same ids, deposits, payouts, accumulators
and active counts. The Rust half is `#[ignore]`d under a plain `cargo test`
(it needs the stream) and fails, never skips, when run without one.
`prover-ci`'s `cross-impl-fuzz` job runs four rounds on every push, seeded
from the run id; a divergence prints the seed and the step.

**Packer vectors — the batch verifier's four hand-packed hashes.** The usage
packer's Rust-generated vector is asserted against the contract's assembly
(`test_usageHash_matchesTheRustVector`); the positions, attestations and
spec-bindings packers have theirs in `prover/lib/tests/packers.rs`, asserted in
`test_packerHashes_matchTheRustVectors` through a `settleBatch` that passes all
three hash checks and stops at the spec-binding anchor.

## Playwright — the project model (`playwright.config.ts`)

`npm run test:e2e:devnet` (preflight → populate-test-data (clauses + two inline
test-scaffolding assemblies + every reference assembly from `assemblies/*.json` over `agreements/*.json` +
sellers; seeding is pre-population, never a test; the clauses and reference
assemblies are already the deploy's genesis, so it skips them) → run) and
`npm run test:e2e:mobile`.
Config: `playwright.config.ts`. Playwright is e2e-only.

The webServer is a **production build** by default (`next build` → static
export served by `serve` on :3100, ~90 s build — there is no `next start` under
`output: export`): the dev server degrades after ~25 min of compile-on-demand
(the seller-history tail-position flake), and devnet is a
mainnet rehearsal — participants hit the exported production artifact. The build
inlines `frontend/.env.local`, so kill :3100 after a `FORCE_REDEPLOY` or an
app-code edit — a reused server keeps serving the build it started with.
`PLAYWRIGHT_WEB_MODE=dev` restores the dev-server webServer for HMR-speed
iteration. In production builds, test-helper gating honors only the explicit
`NEXT_PUBLIC_ENABLE_TEST_HELPERS` build-time opt-in (`lib/shared/testHelpers.ts`,
`lib/shared/e2e.ts`); real deployments never set it, so their builds inline the
hard-off (RA-5 intent preserved).

The projects, as `playwright.config.ts` declares them (the config, not this
list, is the census):

- **`devnet-authoring`** — the `members-onboarding` wizard spec, a dependency
  project of `devnet`. Its real product: the wizard seller (anvil[13]),
  registered through the UI and bound to the seed assembly — consumed by
  `checkout-assembly-choice`, `sign-countersign`, `swap-funded-checkout`, and
  `verification-coverage`. Everything else (clauses, anchored assemblies,
  sellers anvil[5-12]) comes from `frontend/scripts/populate-test-data.mjs`, run before
  Playwright by `test:e2e:devnet` — seeding is never a test. A file-filtered
  run pulls the gate too; pass `--no-deps` when the chain is already anchored.
- **`devnet-standalone`** — self-contained acceptance specs that write + run +
  audit their OWN full cycle (`permissionless-clause`, `clause-coverage`,
  `assembly-withdraw`, `clause-authoring`); they share no seeded state, so they
  do not pull the authoring gate.
- **`devnet`** — every other `*.devnet.spec.ts`; depends on `devnet-authoring`.

The seed precondition is the config's `globalSetup`
(`frontend/tests/e2e/devnet-seed-check.ts`): when a run selects `devnet` or
`devnet-authoring` (by `--project`, narrowed by any file filter), it reads the
anchored assemblies out-of-band for the populate-test-data "Devnet seed" and
stops with one line when it is absent — `--no-deps` runs included. Runs that
select only the other projects, and `E2E_CHAIN=sepolia`, pass through silently.
- **`mobile`** — the lone non-e2e browser project: responsive/viewport chrome
  jsdom can't render.
- **`stranger`** — the blind visitor (`crawl.stranger.spec.ts`,
  `npm run test:e2e:stranger`): no test-signer flag, no injected provider, no
  `?e2e=` opt-in — the browser context a real stranger has, against the same
  prod-mode static export. It crawls every same-origin route transitively
  from `/` plus the one nav source (`navLinks.ts` — the mobile drawers mount
  on demand, so their anchors never sit in the desktop DOM) and fails on any
  console error, page error, or 404. The export's own `index.html` census is
  the completeness bar; every exported route is visited either way, and the
  reachability verdict follows the repo's seams, derived at test time: a
  page declaring a canonical elsewhere is an unlinked inbound-compat alias,
  an unreached `(app)`/`(tools)` route is annotated (wallet-scope — connected
  chrome and runtime state own those links), and an unreached marketing-tier
  route fails. External hrefs are never visited — asserted https and
  `rel="noopener noreferrer"` where `target="_blank"`; the `/sdk-api` typedoc
  bundle and linked files are status-checked, not crawled into. Plus one
  connect-after-first-paint case: the connect affordance renders and clicks
  with no provider, without a console error. It exists because the devnet
  suite is a producer's suite — every spec drives a flow the project itself built —
  so a defect only a consumer hits is invisible to it.
  Its second spec, `accessibility.stranger.spec.ts`, reads the same census
  (`exportCensus.ts`) and runs axe-core's WCAG 2.0 and 2.1 A and AA rules on
  every exported route; any violation fails it, named by route, rule and node.
  axe is evaluated through Playwright, never injected as a page script, so the
  pages' inline-script policy stands. The test build makes no paper PDFs, so
  the crawl reports each paper's PDF link as a 404 against it; the production
  build makes them.
- **`smoke`** — MAINTAINER-MANUAL smokes over real external transports the devnet
  suite deliberately mocks (the XMTP hosted `dev` network); never part of any
  suite run — explicitly `npx playwright test --project=smoke`; pass/fail is a
  maintainer observation, not a CI gate.
- **`sepolia`** — MAINTAINER-MANUAL: the PUBLIC rehearsal,
  `frontend/tests/e2e/live-order.sepolia.spec.ts` — one trade through
  the real UI against the live Sepolia deployment (wizard registration → discover →
  order → accept/commit → resolve → audit), every step asserted out-of-band from
  Sepolia; the resolved order's committed agreement, fetched from IPFS and verified
  against its `checkoutHash`, carries a provenance leaf that decodes to
  `{ agreementHash, assemblyHash }`, each bound on its own registry. `E2E_CHAIN=sepolia SMOKE_SELLER_KEY=… SMOKE_BUYER_KEY=… npx playwright
  test --project=sepolia` builds the site from the committed deployment record
  (`deployments/11155111.json`, publicnode RPC, test helpers on, dist
  `.next-e2e-sepolia`, port 3200) and drives it with the local-key signer bridge
  (`frontend/tests/e2e/local-signer.ts` — the injected wallet signs in Node with viem
  accounts; no unlocked accounts exist off Anvil). It costs real testnet ETH +
  USDC: the spec preflights both wallets and names what to fund. Without
  `E2E_CHAIN=sepolia` the SAME spec rehearses on the devnet with throwaway keys
  (self-funded) — the devnet rehearsal of the bridge. The project's second
  spec, `registries.sepolia.spec.ts`, is the WALLETLESS half — no key, no
  stake: it discovers every registered clause / registered agreement / anchored
  assembly / registered member from the chain and holds the `/registries`
  explorer to exactly that row set with every row's pinned content RESOLVED
  through the site's gateway chain; each agreement's pinned document re-keys to
  its registry key (`agreementHashOf`) and its row names that key and its
  designer of record (pass `NEXT_PUBLIC_IPFS_GATEWAY_URL` + `NEXT_PUBLIC_IPFS_FALLBACK_GATEWAY_URL`
  as the deploy bakes them). Free to run after every nudge. The `devnet-e2e-ci`
  lane runs this spec on every trigger against the bare devnet genesis
  (`deploy-local.sh`: clauses, the reference assemblies' agreements, the
  reference assemblies; no member) before any test population — the same
  assertions on both chains; members are held by the count line, which holds an
  empty set too. The project's third spec,
  `swap-funded-order.sepolia.spec.ts` — the on-ramp: a buyer holding none of the
  denomination pays for their bond from another token the seller accepts, through
  `WitnessSwapAndCommitCoordinator` and the chain's real venue (Sepolia: Uniswap
  SwapRouter02 + a real WETH/USDC pool; devnet: the mock venue); runs after the smoke
  on the same chain (same keys — `live-order-shared.ts`; the seller's profile is edited
  through `/members/edit/identity` to accept the funding token when it does not yet);
  chain facts: the commit went THROUGH the coordinator, funding token spent ≤ the signed
  cap, both bonds in `FigaroCore`, the coordinator empty. The fourth,
  `payout-routing.sepolia.spec.ts` — a resolved seller splits WHAT IT WAS PAID
  to its OWN earmarked accounts (a tax earmark and a savings earmark — sub-accounts
  derived from the seller's key; the amounts a share of the payment, never the returned
  bond) through the composed public multisender (the canonical public Disperse
  deployment — `CONTRACTS.md` owns the address; devnet: `MockDisperse`): one atomic
  `disperseToken`; chain facts: each earmark received its leg exactly, the seller paid
  exactly the total, the multisender retains nothing (its bytecode carries the selector
  the panel calls — behavior on the public chain, never the mirror alone).
  Live-run facts — tx hashes, blocks, addresses, times — live in `git log` (the
  commits that landed each run), never duplicated here.
  All four run after each other on one chain (the smoke first: it registers the seller
  and leaves the resolved process the others start from). Every
  spec's out-of-band scans go through `scanContractEvents` (`devnet-helpers.ts`) —
  chunked under the public gateways' ~50k-block `eth_getLogs` cap, from the deployment
  block.

**⚠ `test:e2e:devnet` runs `--project=devnet` ONLY.** The self-contained
acceptance specs (`clause-coverage`, `permissionless-clause`,
`assembly-withdraw`, `clause-authoring`) live in the separate
`devnet-standalone` project and must be run explicitly —
`npx playwright test --project=devnet-standalone --workers=1` — before any
"full e2e green" claim. A `devnet`-only run is NOT the whole suite.

**One smoke per event-driven inventory family** (`/registries` — clauses,
agreements, assemblies, members): navigate → assert the row set, the
resolved-state count line and every row's resolved content against the
chain's event streams. A marketing inventory has no user action — the
navigation IS the read — so a smoke, not a scenario; it catches the read path
breaking or silently reverting to bundled data. ONE set of those assertions:
the walletless `registries.sepolia.spec.ts`, run on both chains, holds the
row sets; `registries.devnet.spec.ts` holds only what sits on top of the rows
and needs the populated devnet — a clause's stored-document disclosure (bytes
as served, hash to anchor, permalink), an agreement row's stake label and
stored verdict, an assembly row's detail link, the "assemblies composing it"
facet and a deep-linked facet's trail.

**e2e means end-to-end: action → reaction, both in the UI** (the canonical
definition — owned here). A genuine e2e test performs an action
*through the UI*; the action travels the full real stack (UI → contract → chain
→ indexer); the reaction returns and is asserted *in the UI*. Driving a
participant via a viem helper breaks the action end; asserting only on-chain
events breaks the reaction end — either break and it is not e2e. A Playwright
spec that drives contracts via viem and never touches the UI is a contract test
misfiled; it belongs in Foundry. A mock-backed test cannot be e2e — the
reaction is fabricated.

### Assert CHAIN FACTS the UI is responsible for producing

The action→reaction rule above says where an e2e test *acts* and where it *reads*.
This says what it must **assert**: the state the UI was supposed to write to the
chain — read back **out-of-band**, from the chain, never from the screen that
claims to have written it.

**The failure class it exists for.** A contract can be provably correct and still
be fed nothing. Every layer below can be green — Foundry, Halmos, tsc, knip, unit
tests, review — while the product does nothing, because the fault is that a call
never happens, or happens and reverts, or happens and its result is never read.
None of that appears in a diff, and none of it errors. Three instances, all found
in a single day and *only* by chain-fact assertions (with the control that stayed
correct throughout):

| what was broken | what it looked like | the assertion that caught it |
|---|---|---|
| `recordAssemblyUsage` unreachable — sequenced after a call that always reverts, so the **assembly-designer half of the 600M counted nothing, on every deployment** | clause designers accrued normally; the reward looked fine | `assemblyHash` ∈ the `UsageRecorded` clauses and assemblies, read from chain |
| the audit's witness decode read calldata for a preimage WS2 had removed; the throw landed in a swallowed `catch` | the page rendered, just with zero evidence rows | witness receipts `toHaveCount(3)` |
| the claim button compared `Date.now()` to a **block** timestamp | button simply disabled; no error anywhere | drive the claim, assert the ETH moves |
| `UsageCounter` itself | — | *correct throughout; that is the point* |

**The recipe.** Act through the UI. Then read the fact back with your own client:
`publicClient.readContract` / `getContractEvents` / `getBalance` — the same way a
stranger auditing the chain would. Assert on that. The UI's own display is a
*separate* assertion, and a valuable one (see below), never the primary evidence.

**Anti-patterns, each one caught in the same day:**

- **Asserting your own setup.** A spec that seeds state and then asserts the seed
  proves nothing. Assert what the *product* wrote.
- **Absolute where the design accumulates.** `pendingDeposit == deposit` fails on a
  re-used chain because withdrawal requests accumulate BY DESIGN. Assert the
  **delta** across the action.
- **Totals that are only true in isolation.** `periodTotal == thisClauseOrAssembly.score`
  holds only on a chain where nothing else traded; inside a suite every prior
  spec has already accrued. Assert the real relationship (`>=`), not the
  isolated case.
- **Quoting a different set than the UI acts on.** The rewards page claims EVERY
  clause or assembly the wallet designed; quoting one and asserting equality is a category
  error. Prefer asserting **what the UI promised the user** — the rendered figure
  — against what the chain moved: the number on screen is the number that moves.
- **Running a consumer spec without its producer.** `tradelens-runtime` consumes
  the assembly `scenario-tradelens` anchors and says so in its own assertion
  message. A subset run that omits the producer fails for a reason that has
  nothing to do with the code under test — and the failure MOVING between runs
  (a different line) is the tell that the cause changed.
- **Reading a swallowed failure as absence.** A `catch` that logs nothing turns a
  broken read into an empty section. If a surface can render empty, assert the
  populated case explicitly — `toHaveCount(n)`, never `not.toHaveCount(0)`.

**Where it stops.** This does not replace Foundry: contract behavior belongs
there and is cheaper to prove there. Chain-fact e2e covers the seam Foundry
cannot see — *whether the product actually calls the contract, with the right
arguments, and reads the answer back*. The two are complements, and the seam
between them is where those three defects lived.

**devnet (`*.devnet.spec.ts`)** — **the directory listing is the census**
(`ls frontend/tests/e2e/*.devnet.spec.ts` — derived, never a stored count; the
listing, not this section, is the inventory — read each spec's own header for
its scenario). Every spec drives the real UI against Anvil + deployed
contracts (action in the UI, reaction in the UI, chain facts asserted
out-of-band). A handful of specs define the PATTERNS the rest follow:

- `orders-accept` — the bilateral full-cycle spine (also the CI e2e gate).
- `assembly-chain` — the multi-order chain: sellers bound +
  designated through the UI, walk-order accepts with exact per-party bond
  deltas, one atomic resolve paying every party, full audit.
- `agreement-compose` — composing from registered agreements: one agreement
  binds a registered agreement as is, another composes a new one, publish
  registers the new agreement before the assembly, checkout runs, and usage is
  recorded under all three kinds, each `UsageRecorded` read from the chain. Its Vitest
  twin is `frontend/tests/lib/agreementRegistryHydration.test.ts` (a composed
  agreement hydrates only when its recomputed key matches; anything else is
  absence).
- `dispatch-race` / `rfq-checkout` — market formation with zero contracts:
  the countersign-first race and the buyer-ceiling RFQ leg; the cheapest
  available candidate/quote commits, losers net zero, the resolution exact.
- `mixed-pairing` — HUMAN buyer × AGENT candidate in ONE race: a headless
  Node service on the HttpChannel wire counter-signs over HTTP and
  broadcasts its own commit — no browser ever acts for the agent wallet.
- `local-commerce` — the designer's own scenario run end to end, both
  process ladders attested stage by stage with labels DERIVED from the
  registered specs at run time, never a roster.
- `permissionless-clause` / `clause-coverage` — the open-world proof: a
  never-seen clause (incl. a witness clause) attestable with zero
  per-clause on-chain code; the same harness iterated, one rung per
  protocol clause no other e2e drives — the witness leg derived per rung
  from the registered spec's `stages`, so a declaring spec with no rung
  fills fails as a coverage gap, never a silent skip. Every spec in
  `clauses/` has a green rung.

**mobile (`*.mobile.spec.ts`, 1 spec)** — responsive/viewport chrome jsdom
can't render: `navigation.mobile.spec.ts` (Pixel 5 / Chromium).

## CI (`.github/workflows/`)

**The `.github/workflows/` listing is the inventory** (`ls .github/workflows/`
— derived, never a stored count; the same rule the spec census above follows).
Per workflow, what it runs and when:

- **`foundry-ci`** — push/PR, path-filtered. Five jobs: `forge
  build`/`test`/`fmt`, the fork tests (mainnet's Permit2, Sepolia's
  SwapRouter02 — a failure fails, a skip fails), Forge Coverage (lcov
  artifact), Halmos symbolic proofs (Certora is excluded by design — it needs the maintainer-held
  CERTORAKEY, never stored), and Static Analysis — Slither 0.11.3 over the
  audit scope, gated to exactly the High and Medium results
  `AUDITOR_HANDOVER.md` § "Static analysis" triages, and Semgrep's
  `p/smart-contracts` rules, failing on any WARNING or ERROR.
- **`prover-ci`** — path-filtered. Three jobs: `test` on every push/PR —
  `cargo test`, Clippy and Semgrep on the two host-only prover crates
  (`figaro-clause`, `figaro-kernel`); `cross-impl-fuzz` on every push — four
  rounds of the differential fuzz seeded from the run id; `sp1` on push to
  main and dispatch — installs the SP1
  toolchain the way `sequencer-release` does, builds the sequencer, runs
  `cargo test` on `figaro-sequencer` and `figaro-prove-test`, then runs
  `sdk/tests/batch-e2e.test.ts` and `sdk/tests/batch-revoke-e2e.test.ts` against a live Anvil with
  `REQUIRE_BATCH_E2E=1`, so a missing chain or binary fails instead of
  skipping.
- **`sdk-ci`** — push/PR, path-filtered (re-triggers on
  `frontend/public/sdk-api/**` and the encoder vectors too): tsc type-check,
  `npm test`, build, the typedoc freshness gate — the committed API reference
  (`frontend/public/sdk-api`) must equal what typedoc emits from source — and
  the encoder-vector freshness gate — the committed Rust conformance vectors
  (`prover/clause/tests/encode_conformance.rs`) must equal what the live TS
  encoder emits through `scripts/generate-encode-conformance-vectors.mjs`. A
  second job runs the agent runtime's `node --test` suite
  (`ecosystem-agents/runtime/tests/`) against the SDK's build, on every push
  that changes the SDK or the runtime; its macOS sandbox tests skip on the
  Linux runner.
- **`frontend-ci`** — push/PR, path-filtered: type-check, ESLint, Vitest
  (+coverage), the **mobile** Playwright project, production build (its
  postbuild typesets the paper PDFs; the job installs Tectonic, pinned by
  version and checksum).
- **`devnet-e2e-ci`** — push/PR, path-filtered: the **bilateral spine**
  (`orders-accept`) end to end in the runner — Kubo (IPFS, CORS-configured),
  Anvil (`--accounts` at the count `scripts/lint-anvil-accounts-lockstep.sh` holds), a full `deploy-local.sh` stack,
  the walletless `registries.sepolia.spec.ts` (the `sepolia` project without
  `E2E_CHAIN`) on that bare genesis — all four registry families, row set ==
  chain, every row resolved — then
  `populate-test-data`, the `orders-accept` devnet spec against the production
  static export — then the FOUR origination proofs on the same stack
  (`verify-origination{,-http,-a2a,-chain}.devnet.mjs`), and last the
  watcher's test (`scripts/test-monitor.mjs`). The highest-catch
  layer, run in CI. Nightly (03:37 UTC cron, started hours late like every
  scheduled run here) and on a dispatch with `suite=full`, the same job runs
  the whole `devnet` project through `npm run test:e2e:devnet` in place of
  the spine spec — every runtime devnet spec after the `devnet-authoring`
  wizard, under a 120-minute budget. The `devnet-standalone` and `stranger`
  projects run on a laptop.
- **`Dependency Audit CI`** — push/PR, NOT path-filtered: three npm-audit legs (root
  production deps at high+; frontend production deps at critical-only, through
  `scripts/audit-frontend.mjs`, which sets aside by id the advisories named in
  `frontend/.audit-ignore.json` — each with the reason it cannot reach a static
  export — and fails on every other critical one; docs-site production deps at
  critical-only, since `/docs` is served from the wallet app's origin), and a
  `cargo audit` leg over
  `prover/Cargo.lock` (fails on any vulnerability advisory; unmaintained and
  yanked notices are warnings; an advisory no release of the crate's dependents
  can take the fix for is set aside by id in `prover/.cargo/audit.toml`, each
  with its path and the reason). `scripts/frozen-scope.sh` names the audit
  scope for the guards that read it. The
  whole-tree guard battery and the Claude semantic open-world gate run
  maintainer-side, in pre-commit — they are private tooling and not part of
  the public CI tree.
- **`estate-snapshot`** — weekly (Mondays 00:23 UTC) + dispatch: captures the
  perishable estate signals (GitHub traffic, which the API retains only ~14
  days; the Cloudflare daily site-traffic series for figaroprotocol.com; the
  npm downloads trend) as a workflow artifact with 90-day retention, and
  commits the same files to the `estate-snapshots` branch as `<date>/`, which
  is what the weekly digest routine reads. The
  GitHub-traffic legs need the punch-listed `ESTATE_TRAFFIC_TOKEN`
  fine-grained PAT and the site-traffic leg the punch-listed
  `ESTATE_CF_ANALYTICS_TOKEN` zone-scoped Cloudflare token — without them
  they warn and the npm leg still lands.
- **`monitor`** — daily (01:17 UTC, which GitHub's late start lands before the incident-review routine; the event window reaches back to the last successful scheduled run) + dispatch: the public deployment's
  watcher (`scripts/monitor-sepolia.mjs`, SECURITY.md § "Monitoring") reads
  the contracts' events through a public node — a florin minted outside the
  reward path, a dropped batch accrual,
  a withdrawal burst, and `FigaroCore`'s held bonds against invariant A-8 —
  and raises each condition as an issue labeled `monitor`, assigned to the
  maintainer; a run that cannot read the node, or finds a record address
  with no code, fails, which is the heartbeat. `scripts/test-monitor.mjs`
  (the last step of `devnet-e2e-ci`) produces each alert with real contracts
  on the devnet and asserts the watcher raises it — all but the dropped batch
  accrual, which needs a batch the counter refuses between prove and submit.
  `SEPOLIA_RPC_URL` as a repository secret switches it to a keyed node; the
  dispatch input `rehearsal` raises one synthetic alert without reading the
  chain, to prove the issue and e-mail path. Every read waits its turn at one
  gate, `PACE_MS` apart (default 1000), because a keyed node throttles a burst
  of reads and the transport's own backoff does not save a whole run.
- **`notify`** — on an issue opened or labeled `monitor`, `ci`, `digest`, or
  `triage`: the Actions bot posts one comment mentioning the maintainer, so
  the issues the cloud routines write under the maintainer's own account
  still reach the maintainer's inbox (GitHub never e-mails an actor about
  their own actions; a mention from the bot always does). One comment per
  issue, guarded by a marker.
- **`on-demand-docker`** — `workflow_dispatch` ONLY, never push/schedule. Two
  independent jobs: the xmtpd stack proof (hermetic broker bring-up) and the
  Linux sandbox variant (the signer runtime's container deny cases and the
  launcher's RPC relay: a JSON-RPC POST through the proxy's relay path reaches
  the node behind it, and no answer names the endpoint's URL).
- **`sequencer-release`** — publishes the prebuilt `figaro-sequencer` relay
  binary as a GitHub Release artifact (pinned toolchains + the computed vkey
  printed into the release body for rebuild-and-compare, and a Sigstore
  build-provenance attestation per archive — `gh attestation verify`);
  build-and-publish only, gates no merge.
- **`sdk-release`** — on an `sdk-v<version>` tag (refused unless it equals
  `sdk/package.json`'s version): type-check, pure-surface tests (`SKIP_ANVIL=1`),
  build, `npm publish --provenance` (the Sigstore attestation binds the tarball
  to this repo + commit); auth is npm Trusted
  Publishing (OIDC — the package's npm settings name this workflow as the
  trusted publisher; no stored token). Gates no merge.

The EIP-712 parity harness (above) rides `foundry-ci` + `sdk-ci`; both run its
two halves unconditionally.

### Mutation runs and the test-first proof

Four maintainer-side scripts, none run by CI. `scripts/mewt-run.sh <target.sol>`
and `scripts/cargo-mutants-run.sh <crate>` launch one mutation run detached,
holding `.mewt.lock` (the two never overlap; `cargo-mutants-run.sh` runs
`--in-place` over `figaro-kernel` or `figaro-clause`, from a full checkout). Both
print `gate_layers` from `scripts/frozen-scope.sh` first: "full gate" when a
scope file's stripped code moved or a build configuration changed since the
handover's baseline commit, else "quick layers only" (the mutation and Certora
reports stand). `scripts/check-red-on-parent.sh [<commit>]` runs the `function
test*` names a change adds under `test/` against `src/` as it stood before, and
fails when every one passes there; a `Red-on-parent:` trailer in the commit
message runs it from `.husky/commit-msg`.

## Opportunistic — Mythril

Mythril runs out-of-loop via `scripts/mythril-docker.sh` (Docker image `mythril/myth`, 300s execution timeout, solc 0.8.26). Not wired into pre-commit or CI; invoked by hand on specific contracts when a deep symbolic-execution pass is wanted alongside Halmos / Certora / Echidna. See `docs/LOCAL_DEV.md` § "Docker-hosted services" for the Docker convention.

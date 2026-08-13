# Testing — Harness Inventory

`LOCAL_DEV.md` keeps the run commands; this file is the full inventory of test files, harnesses, and properties across all verification layers.

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

The test tree mirrors `src/` (`test/kernel/`, `test/protocol/{registries,coordinators,usage,verifier}/`,
`test/florin/`, `test/rpgf/`, `test/mocks/`); audit by `find test -name '*.t.sol'`,
not by this paragraph. Current: `FigaroCoreTest`, `FigaroCoreRevertBranchTest`,
`FigaroCoreEventEmissionTest`, `AttestationCoordinatorTest`, `ClauseRegistryTest`,
`AssemblyRegistryTest`, `MembersRegistryTest`, `GasCeilingTest`,
`WitnessSwapAndCommitCoordinatorTest`, `WitnessSwapAndCommitCoordinatorForkTest`,
`FigaroBatchVerifierTest`, `UsageCounterTest`, `RpgfMinterTest`, `RpgfIntegrationTest`,
`TreasuryProcurementTest`, `MockDisperseTest`, `ReentrancyAdversarialTest`,
`Eip712ParityTest`, `HalmosFigaroCore`, `FlorinToken.t.sol`.

`UsageCounterTest` covers the reward-accrual counter: the RESOLVED-order gate, merkle
inclusion against the signed `agreementHash`, per-(clause-or-assembly, process) GLOBAL idempotence (a
process counts once ever — re-recording it in a later period reverts, and a later period
counts only trade new to it), the **live-seller-stake gate** (`SellerNotStaked` when the seller-of-record is
not registered; a seller who leaves the registry stops counting), **uniform scoring across clauses and assemblies** (no
category, tag, or weight), period boundaries and `periodClosed`, `totalScoreIn` delta
maintenance, and a fuzzed floor-cube-root property on `icbrt` **over the whole `uint256`
domain** plus a no-saturation regression (the earlier version of that fuzz sampled `uint64`
only — the one domain where a wrong cube bound was coincidentally exact, which is how the
score-saturation bug survived; never bound a fuzz domain to less than the function's own).
`RpgfMinterTest` exercises
the payout maths against a counter stub — uniform pro-rata share (**no per-wallet cap**: a
dominant wallet takes its full pro-rata share), a withdrawn author forfeiting the reward,
author-of-record verification against both registries, the closed-period requirement, and the
per-tranche budget backstop. `RpgfIntegrationTest` (6) proves the two compose with NO stubs: a
real bonded process settles, its usage is recorded against the real counter, the period closes,
and the real minter pays real florins.

`ReentrancyAdversarialTest` hands the protocol a `MockReentrantToken` that
re-enters mid-transfer and asserts the `nonReentrant` guard fires (nested call
reverts) while the outer settlement completes exactly once — across
`FigaroCore.commit`, `FigaroCore.resolveProcess`, and
`FigaroBatchVerifier.settleBatch`.

`FigaroBatchVerifierTest` covers the batch-settlement verifier: the happy path
with value legs, the ClauseRegistry spec-binding anchor gate (permissive-spec
substitution + unregistered clause both revert; a never-seen registered clause
settles with zero verifier changes), state-root continuity, calldata-tamper
reverts, and constructor guards.

`WitnessSwapAndCommitCoordinatorForkTest` is the mainnet-fork parity proof for the
Permit2 witness digest: gated on `MAINNET_RPC_URL` (each test SKIPS without it,
never silently passes), it proves the `swapWitness` convention is accepted by the
canonical Permit2 deployment and that a substituted swap route is rejected by real
Permit2's own signature check — the one claim the mocked suite proves only against
our own digest reconstruction (`MockWitnessPermit2`).

## Halmos (`test/`) — 4 harness files, 32 properties

| Harness | Properties | Key invariants |
|---|---|---|
| `HalmosFigaroCore.t.sol` | 7 | Token conservation, bond amounts, resolution payouts, status transitions, buyer dominance, monotonicity |
| `HalmosMembersRegistry.t.sol` | 7 | The stake mechanics the RPGF Sybil bound assumes: solvency, no deposit recycling, de-surfacing at request, the counter reads that gate |
| `HalmosUsageCounter.t.sol` | 6 | The accrual arithmetic on top of the (already proved) stake gate: direct-path monotonicity, batch write REPLACES cumulative (c,d) never adds, `scoreOf == accrualOf.score + batchAccrualOf.score` (the only meeting point of the two settlement universes), period bucketing ×2, isolation across clauses and assemblies. Mutation-checked (replace-not-add, score composition) 2026-08-03. |
| `HalmosClauseAndAssemblyRegistries.t.sol` | 12 (6 per contract) | `HalmosClauseRegistry` + `HalmosAssemblyRegistry` — the stake machines `RpgfMinter._isAuthor` reads: solvency under arbitrary two-registrar interleavings, full withdrawal, first-write-wins permanence, one-shot withdrawal, eligibility ends permanently at withdraw, cross-key isolation. Mutation-checked (solvency + first-write-wins, both contracts, 4/4 counterexamples) 2026-08-03. |

Run with `scripts/test-halmos.sh` (six passes). **Halmos does not model
`expectRevert`** — assert on a low-level call's own success flag instead. It
also needs the compiler AST, so a build made without it silently yields "no
tests found"; the runner's `forge build --ast` handles that, but a manual
`forge build` in between will overwrite the artifact and reproduce it.

**A passing symbolic property can still be vacuous.** The two anti-recycling
properties are mutation-checked: a deliberate recycling bug in
`MembersRegistry.register` makes both produce counterexamples. Do the same for
any new property whose failure mode matters — "it proved" is not evidence that
it *could* fail.

## Certora (`certora/`) — 6 specs

| Spec | Rules | Covers |
|---|---|---|
| `FigaroCore.spec` | 8 | Status monotonicity, transitions, active count, buyer dominance, no double-commit, cumulative monotonicity, rootBuyer immutable, currency immutable |
| `AttestationCoordinator.spec` | 4 | Role-gate on `attestAsBuyer` (non-buyer reverts; success ⟹ caller is buyer) + parametric Core-immutability (AC cannot change orderStatus or processes[]). No on-chain clause-content validator — well-formedness is an off-chain concern. |
| `TokenOpsVerification.spec` | 7 | Universal FigaroCore token-flow: exact commit deltas (buyer/seller/Core), allowance-drain safety (∀ address), commit + single-order resolve conservation, single-order resolve exact payouts. Generalizes Halmos root-only coverage to arbitrary sub-orders. |
| `FlorinToken.spec` | 6 | Supply cap, registered-cap bound, registered-cap monotonicity, renounce one-way latch, minter cap immutability, minter within cap |
| `BatchVerifierTokenOps.spec` | 4 | FigaroBatchVerifier net-position settlement: user delta = payout−deposit, contract delta = deposit−payout, allowance-drain safety, conservation (single-position; inductive generalization documented in-spec). Realigned to the witness model 2026-07-16; realigned again 2026-08-03 to the usage-bridge `settleBatch` signature (`BatchUsageData` threaded, usage loops bounded). |
| `RpgfMinter.spec` | 8 | Per-period mint conservation (`minted ≤ periodAmount` under any claim sequence), no double-claim per wallet-period, no claim while the period is open, duplicate-clause-or-assembly rejection, live-stake eligibility (`_isAuthor` author-of-record gate), minted monotonicity — plus two supplementary rules proving `claimable`'s view quote matches `claim`'s behavior. Mutation-checked (conservation, double-claim, eligibility) 2026-08-03. |

Companion: `certora/token-ops.inventory` + `scripts/lint-token-ops.sh` — declarative inventory of every ERC20 transfer call site in `src/`; the linter (run as a `./scripts/test-certora.sh` prelude) fails if a new transfer call merges without an inventory entry.

## Echidna — 2 harnesses, 15 properties

| Harness | Properties | Path |
|---|---|---|
| `EchidnaFuzzer` | 7 | `src/echidna/EchidnaFuzzer.sol` — kernel: solvency, active-count consistency, cumulative accounting, state monotonicity, token conservation, buyer dominance, atomic resolution |
| `EchidnaFlorinToken` | 8 | `src/echidna/EchidnaFlorinToken.sol` — FlorinToken: MAX_SUPPLY never exceeded, deployer can renounce, no deployer mint after renounce, minter cap enforced, no zero-address minter, no mint to zero address, total supply = sum of balances, transfer preserves supply |

`src/echidna/EchidnaToken.sol` is not a harness — it is the minimal ERC-20 the kernel
harness fuzzes against (`EchidnaFuzzer.sol` imports it); it declares no `echidna_` properties.

## TLA+ (`formal/`) — 46 invariants across 4 models (FigaroCore 7 + FlorinToken 8 + WitnessSwapAndCommitCoordinator 10 + SettlementUniverses 21)

FigaroCore (`MC.tla` + `MC.cfg`): `TokenConservation`, `ContractSolvency`,
`WalletNonNegative`, `CumulativeIntegrity`, `ActiveCountCorrect`,
`ResolutionAlwaysPossible`, `TypeOK`.

FlorinToken (`FlorinToken.tla` + `FlorinToken.cfg`): `Inv_MaxSupply`,
`Inv_DeployerCannotMintAfterRenounce`, `Inv_MinterCap`,
`Inv_CapBelowMaxSupply`, `Inv_SupplyEqualsSumMinted`, `Inv_NonNegative`,
`Inv_NoMintToZero`, `Inv_BalancesSumToSupply`.

WitnessSwapAndCommitCoordinator (`WitnessSwapAndCommitCoordinator.tla` + `.cfg`,
2026-08-04): the swap-funded on-ramp at EVM-step granularity (revert frames
explicit, so "swap landed, commit didn't" states are reachable and proved never
quiescent): `Inv_TypeOK`, `Inv_Conservation`, `Inv_NonNegative`,
`Inv_ZeroRetention`, `Inv_AllowanceHygiene`, `Inv_Atomicity`,
`Inv_BondFormula`, `Inv_CoreEscrowExact`, `Inv_WitnessRouteBinding`,
`Inv_CoordinatorNotCounterparty` — 38,028,525 states / 1,979,101 distinct,
depth 17, ~3–4 min. Mutation-checked (6 mutations, each caught) 2026-08-04.

SettlementUniverses (`SettlementUniverses.tla` + `.cfg`, 2026-08-04): the
CROSS-CONTRACT model — FigaroCore + FigaroBatchVerifier + UsageCounter + the
off-chain guest kernel under arbitrary interleavings; the only harness that can
see the two-settlement-universes crease (every other layer is per-contract).
21 invariants: no double payout across the universes, token conservation +
exact per-pool escrow, usage-score composition (`scoreOf == direct + batch`,
the bridge write REPLACES never adds), kernel blindness (`settleBatch` writes
no kernel `orderStatus`) — 7,455,943 states / 2,632,247 distinct, depth 15,
~3 min. Mutation-checked (5 mutations + 7 non-vacuity witnesses) 2026-08-04.
Two NAMED assumptions ride as `.cfg` constants: `AssumeDomainSeparation`
(contract-enforced — EIP-712 `verifyingContract` disjointness carries
no-double-payout) and `AssumeAccrualGatesAligned` (NOT contract-enforced — a
dropped batch's accrual is forgone at process granularity, under-pay only).
Flipping either to FALSE is the experiment, is EXPECTED to fail, and is not a
regression.

## Rust — the proof apparatus (`prover/`)

`cargo test` from `prover/` — five crates, one suite. Prereq: three of the five
(`figaro-prover` — the SP1 guest at `prover/program` — plus `figaro-prove-test`
and `figaro-sequencer`) need the SP1 toolchain (`cargo prove`) to build; without
it, `cargo test -p figaro-clause -p figaro-kernel` runs the two host-only crates,
the same subset `prover-ci` gates. The crates: `figaro-clause`
(Layer-A conformance: every spec in `clauses/` parses — count derived from the
directory; 11 encode vectors generated from the live TS encoder lock byte
parity incl. signed int256, stage-scoped witnesses, tuple[] arrays, open
formats), `figaro-kernel` (frozen Foundry parity vectors for commit/resolve +
the witness-gate suite: spec-identity substitution, content-hash mismatch,
inclusion failure, attest-after-resolve; the RPGF usage bridge in
`prover/lib/tests/usage.rs` — same-batch credit against the post-state, cross-batch
replay rejection (the reason the counted set rides the state root), breadth
vs depth, the assembly leg via provenance reproduction, and the
usage-hash vector asserted verbatim on the Solidity side; bincode roundtrips
fence the SP1 stdin landmines), `figaro-prover` (the SP1 guest program itself,
exercised through the next crate), `figaro-prove-test` (SP1 mock-executor guest tests — guest
PublicValues must equal host `apply_batch` field-for-field; in-VM Gate-S
rejection; `SP1_REAL_PROOF=1` generates + verifies a real local Core proof),
and `figaro-sequencer` (mempool runs the kernel's own witness gates at the
door; assembler fixpoint filtering incl. the resolve-closes-the-evidence-window
property; HTTP API; mempool→assemble→kernel→advance pipeline; and the
publication archive — retention survives the drain that clears the mempool,
the window is bounded and evicts cleanly, the journal survives a restart and
rotates instead of growing, and every read route republishes what the kernel
would have emitted, asserted VERIFIABLE: the published struct re-derives its
own order hash and both signatures recover to the parties named inside it).

`sdk/tests/batch-e2e.test.ts` is the cross-language lock: TS signs + builds
the witness payload, the Rust sequencer binary proves + submits, the Solidity
verifier checks the hashes and the registry anchor on a live Anvil — value
legs asserted from the chain. Anvil-gated (skips clean without it).

## Frontend Vitest (`frontend/tests/`) — 2 tiers

`npx vitest run`. UI logic that needs neither a chain nor a real browser.
The census is the directory listing (`ls frontend/tests/{components,lib}` —
derived, never a stored count).

- **Component tier** (`tests/components/`) — React Testing Library:
  `Header`, `MobileNav`, `CapabilityRail`,
  `MemberTrackRecord`, `TokenAddressInput`, `TokenApprovalFlow`, …
- **Lib tier** (`tests/lib/`) — pure-client unit tests: commitment
  preparation + stores, clause-spec source, discovery +
  catalogue pipeline, emissions disclosure, delivery/handoff attestation, dispute
  evidence, IPFS service, token conversion, geocode, and per-hook tests
  (`useOrderCommitmentFlow`, `useTokenApproval`, …).

The hash- and wire-load-bearing choreography suites live with their code in
`sdk/tests/` (`npm --prefix sdk test`): agreement/template projection, the
template→orders walk, checkout planning + sub-order pricing, the handoff
ECDH, and the commitment envelope — several pinned byte-exact to
`sdk/tests/fixtures/promotion-golden-vectors.json` (recorded from the
pre-promotion frontend implementations; `HARVEST_GOLDEN_VECTORS=1` in
`frontend/tests/lib/promotionGoldenVectors.test.ts` re-records, legitimate
only before a move).

**EIP-712 parity — the unconditional cross-language lock.**
`sdk/tests/eip712Parity.test.ts` freezes SDK-computed EIP-712 vectors (domain
separator, struct hash, root digest/processId, order hash) into
`test/fixtures/eip712-vectors.json` and self-checks the SDK still reproduces
them (`HARVEST_EIP712_VECTORS=1` re-records). `test/kernel/Eip712ParityTest.t.sol`
reads that same fixture and asserts the Solidity kernel reproduces every hash —
`CommitmentTypes.hashStruct` directly, the order-hash derivation verbatim, and
the domain separator both ways (SDK vector == formula, and a live
`FigaroCore.DOMAIN_SEPARATOR()` == formula). Runs in BOTH the SDK and Foundry
CI jobs with no chain and no skipIf — the SDK↔kernel signature agreement that
was previously only in the skipIf-gated `integration.test.ts` round-trip is now
a hard gate.

## Playwright — the project model (`playwright.config.ts`)

`npm run test:e2e:devnet` (preflight → populate-test-data (clauses + ONE seed
assembly + sellers; seeding is pre-population, never a test) → run) and
`npm run test:e2e:mobile`.
Config: `playwright.config.ts`. The retired `mock` project is gone — Playwright
is e2e-only.

Five projects:

- **`devnet-authoring`** — the `members-onboarding` wizard spec, a dependency
  project of `devnet`. Its real product: the wizard seller (anvil[13]),
  registered through the UI and bound to the seed assembly — consumed by
  `checkout-assembly-choice`, `sign-countersign`, `swap-funded-checkout`, and
  `verification-coverage`. Everything else (clauses, anchored assemblies,
  sellers anvil[5-12]) comes from `frontend/scripts/populate-test-data.mjs`, run before
  Playwright by `test:e2e:devnet` — seeding is never a test. A file-filtered
  run pulls the gate too; pass `--no-deps` when the chain is already anchored.
- **`devnet-standalone`** — self-contained acceptance specs that author + run +
  audit their OWN full cycle (`permissionless-clause`, `clause-coverage`,
  `assembly-withdraw`, `clause-authoring`); they share no seeded state, so they
  do not pull the authoring gate.
- **`devnet`** — every other `*.devnet.spec.ts`; depends on `devnet-authoring`.
- **`mobile`** — the lone non-e2e browser project: responsive/viewport chrome
  jsdom can't render.
- **`smoke`** — MAINTAINER-MANUAL smokes over real external transports the devnet
  suite deliberately mocks (the XMTP hosted `dev` network); never part of any
  suite run — explicitly `npx playwright test --project=smoke`; pass/fail is a
  maintainer observation, not a CI gate.

**⚠ `test:e2e:devnet` runs `--project=devnet` ONLY.** The self-contained
acceptance specs (`clause-coverage`, `permissionless-clause`,
`assembly-withdraw`, `clause-authoring`) live in the separate
`devnet-standalone` project and must be run explicitly —
`npx playwright test --project=devnet-standalone --workers=1` — before any
"full e2e green" claim. A `devnet`-only run is NOT the whole suite.

**One smoke per event-driven inventory page** (`/clauses`, `/assemblies`, …):
navigate → assert the resolved-state count line + a few row ids. A marketing
inventory has no user action — the navigation IS the read — so a smoke, not a
scenario; it catches the read path breaking or silently reverting to bundled data.

**e2e means end-to-end: action → reaction, both in the UI** (the canonical
definition — CLAUDE.md points here). A genuine e2e test performs an action
*through the UI*; the action travels the full real stack (UI → contract → chain
→ indexer); the reaction returns and is asserted *in the UI*. Driving a
participant via a viem helper breaks the action end; asserting only on-chain
events breaks the reaction end — either break and it is not e2e. A Playwright
spec that drives contracts via viem and never touches the UI is a contract test
misfiled; it belongs in Foundry. A mock-backed test cannot be e2e — the
reaction is fabricated. The `mock` Playwright project was retired 2026-05-20;
do not recreate it.

### Assert CHAIN FACTS the UI is responsible for producing (doctrine, 2026-07-30)

The action→reaction rule above says where an e2e test *acts* and where it *reads*.
This says what it must **assert**: the state the UI was supposed to write to the
chain — read back **out-of-band**, from the chain, never from the screen that
claims to have written it.

**The failure class it exists for.** A contract can be provably correct and still
be fed nothing. Every layer below can be green — Foundry, Halmos, tsc, knip, unit
tests, review — while the product does nothing, because the fault is that a call
never happens, or happens and reverts, or happens and its result is never read.
None of that appears in a diff, and none of it errors. Four instances, all found
in one day (2026-07-30) and *only* by chain-fact assertions:

| what was broken | what it looked like | the assertion that caught it |
|---|---|---|
| `recordAssemblyUsage` unreachable — sequenced after a call that always reverts for excluded clauses or assemblies, so the **assembly-designer half of the 600M recorded nothing, on every deployment** | clause authors accrued normally; the reward looked fine | `compositionHash` ∈ the `UsageRecorded` clauses and assemblies, read from chain |
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
  holds only on a chain where nothing else traded; inside a suite ~28 specs have
  already accrued. Assert the real relationship (`>=`), not the isolated case.
- **Quoting a different set than the UI acts on.** The rewards page claims EVERY
  clause or assembly the wallet authored; quoting one and asserting equality is a category
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

**Where it stops.** This does not replace Foundry: contract behaviour belongs
there and is cheaper to prove there. Chain-fact e2e covers the seam Foundry
cannot see — *whether the product actually calls the contract, with the right
arguments, and reads the answer back*. The two are complements, and the seam
between them is where the 2026-07-30 defects lived.


The webServer is a **production build** by default (`next build` → static
export served by `serve` on :3100, ~90 s build — there is no `next start` under
`output: export`): the dev server degrades after ~25 min of compile-on-demand
(the seller-track-record tail-position flake, 2026-06-11), and devnet is a
mainnet rehearsal — participants hit the exported production artifact. The build
inlines `frontend/.env.local`, so kill :3100 after a `FORCE_REDEPLOY` or an
app-code edit — a reused server keeps serving the build it started with.
`PLAYWRIGHT_WEB_MODE=dev` restores the dev-server webServer for HMR-speed
iteration. In production builds, test-helper gating honors only the explicit
`NEXT_PUBLIC_ENABLE_TEST_HELPERS` build-time opt-in (`lib/shared/testHelpers.ts`,
`lib/shared/e2e.ts`); real deployments never set it, so their builds inline the
hard-off (RA-5 intent preserved).

**devnet (`*.devnet.spec.ts`)** — **the directory listing is the census**
(`ls frontend/tests/e2e/*.devnet.spec.ts` — derived, never a stored count; the
listing, not this section, is the inventory — read each spec's own header for
its scenario). Every spec drives the real UI against Anvil + deployed
contracts (action in the UI, reaction in the UI, chain facts asserted
out-of-band). A handful of specs define the PATTERNS the rest follow:

- `orders-accept` — the bilateral full-cycle spine (also the CI e2e gate).
- `assembly-chain` — the multi-order value-added chain: sellers bound +
  designated through the UI, walk-order accepts with exact per-party bond
  deltas, one atomic resolve paying every party, full audit.
- `dispatch-race` / `rfq-checkout` — market formation with zero contracts:
  the countersign-first race and the buyer-ceiling RFQ leg; the cheapest
  available candidate/quote commits, losers net zero, settlement exact.
- `mixed-pairing` — HUMAN buyer × AGENT candidate in ONE race: a headless
  Node service on the HttpChannel wire counter-signs over HTTP and
  broadcasts its own commit — no browser ever acts for the agent wallet.
- `local-commerce` — the designer-authored scenario run end to end, both
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

Seven workflows. Six gate `main`/`develop` on push + PR (the language-scoped
five path-filtered, the guard battery whole-tree); the seventh publishes:
- **`foundry-ci`** — `forge build`/`test`/`fmt` + Halmos symbolic proofs (Certora
  is excluded by design — it needs the maintainer-held CERTORAKEY, never stored).
- **`prover-ci`** — `cargo test` on the two host-only prover crates
  (`figaro-clause`, `figaro-kernel`); the SP1-dependent crates build only at
  release time (see `sequencer-release`).
- **`sdk-ci`** — tsc type-check, `npm test`, build.
- **`frontend-ci`** — type-check, ESLint, Vitest (+coverage), the **mobile**
  Playwright project, production build.
- **`devnet-e2e-ci`** — the **bilateral spine** (`orders-accept`) end to end in
  the runner: Kubo (IPFS, CORS-configured), Anvil (`--accounts 38`), a full
  `deploy-local.sh` stack, `populate-test-data`, then the `orders-accept` devnet
  spec against the production static export. The highest-catch layer, no longer
  maintainer-discipline-only. Broader devnet specs stay maintainer-run.
- **`guards-ci`** — the whole-tree guard battery, NOT path-filtered: the guards
  are repo-wide and lint-staged only ever sees a commit's touched files, so this
  job re-certifies the whole tree on every push/PR.
- **`sequencer-release`** — publishes the prebuilt `figaro-sequencer` relay
  binary as a GitHub Release artifact (pinned toolchains + the computed vkey
  printed into the release body for rebuild-and-compare); build-and-publish
  only, gates no merge.

The EIP-712 parity harness (above) rides `foundry-ci` + `sdk-ci`; both run its
two halves unconditionally.

## Opportunistic — Mythril

Mythril runs out-of-loop via `scripts/mythril-docker.sh` (Docker image `mythril/myth`, 300s execution timeout, solc 0.8.26). Not wired into pre-commit or CI; invoked by hand on specific contracts when a deep symbolic-execution pass is wanted alongside Halmos / Certora / Echidna. See CLAUDE.md "Docker-hosted services" for the Docker convention.

# Testing — Harness Inventory

CLAUDE.md keeps the run commands; this file is the full inventory of test files, harnesses, and properties across all verification layers.

## Foundry (`test/`)

`FigaroCoreTest`, `FigaroCoreRevertBranchTest`, `FigaroCoreEventEmissionTest`,
`AttestationCoordinatorTest`, `ClauseRegistryTest`, `AssemblyRegistryTest`,
`SellerRegistryTest`, `GasCeilingTest`, `WitnessSwapAndCommitCoordinatorTest`,
`WitnessSwapAndCommitCoordinatorForkTest`, `FigaroBatchVerifierTest`,
`ReentrancyAdversarialTest`, `Eip712ParityTest`, `HalmosFigaroCore`, `fig/FlorinToken.t.sol`.

`ReentrancyAdversarialTest` hands the protocol a `MockReentrantToken` that
re-enters mid-transfer and asserts the `nonReentrant` guard fires (nested call
reverts) while the outer settlement completes exactly once — across
`FigaroCore.commit`, `FigaroCore.resolveProcess`, and
`FigaroBatchVerifier.settleBatch`.

`FigaroBatchVerifierTest` covers the batch-settlement verifier: the happy path
with money legs, the ClauseRegistry spec-binding anchor gate (permissive-spec
substitution + unregistered clause both revert; a never-seen registered clause
settles with zero verifier changes), state-root continuity, calldata-tamper
reverts, and constructor guards.

`WitnessSwapAndCommitCoordinatorForkTest` is the mainnet-fork parity proof for the
Permit2 witness digest: gated on `MAINNET_RPC_URL` (each test SKIPS without it,
never silently passes), it proves the `swapWitness` convention is accepted by the
canonical Permit2 deployment and that a substituted swap route is rejected by real
Permit2's own signature check — the one claim the mocked suite proves only against
our own digest reconstruction (`MockWitnessPermit2`).

## Halmos (`test/`) — 1 harness, 7 properties

| Harness | Properties | Key invariants |
|---|---|---|
| `HalmosFigaroCore.t.sol` | 7 | Token conservation, bond amounts, resolution payouts, status transitions, buyer dominance, monotonicity |

## Certora (`certora/`) — 5 specs

| Spec | Rules | Covers |
|---|---|---|
| `FigaroCore.spec` | 8 | Status monotonicity, transitions, active count, buyer dominance, no double-commit, cumulative monotonicity, rootBuyer immutable, currency immutable |
| `AttestationCoordinator.spec` | 4 | Role-gate on `attestAsBuyer` (non-buyer reverts; success ⟹ caller is buyer) + parametric Core-immutability (AC cannot change orderStatus or processes[]). No on-chain clause-content validator — well-formedness is an off-chain concern. |
| `TokenOpsVerification.spec` | 7 | Universal FigaroCore token-flow: exact commit deltas (buyer/seller/Core), allowance-drain safety (∀ address), commit + single-order resolve conservation, single-order resolve exact payouts. Generalizes Halmos root-only coverage to arbitrary sub-orders. |
| `FlorinToken.spec` | 6 | Supply cap, registered-cap bound, registered-cap monotonicity, renounce one-way latch, minter cap immutability, minter within cap |
| `BatchVerifierTokenOps.spec` | 4 | FigaroBatchVerifier net-position settlement: user delta = payout−deposit, contract delta = deposit−payout, allowance-drain safety, conservation (single-position; inductive generalization documented in-spec). Realigned to the witness model; cloud run green 2026-07-16. |

Companion: `certora/token-ops.inventory` + `scripts/lint-token-ops.sh` — declarative inventory of every ERC20 transfer call site in `src/`; the linter (run as a `./scripts/test-certora.sh` prelude) fails if a new transfer call merges without an inventory entry.

## Echidna — 2 harnesses, 15 properties

| Harness | Properties | Path |
|---|---|---|
| `EchidnaFuzzer` | 7 | `src/echidna/EchidnaFuzzer.sol` — kernel: solvency, active-count consistency, cumulative accounting, state monotonicity, token conservation, buyer dominance, atomic resolution |
| `EchidnaFlorinToken` | 8 | `src/echidna/EchidnaFlorinToken.sol` — FlorinToken: MAX_SUPPLY never exceeded, deployer can renounce, no deployer mint after renounce, minter cap enforced, no zero-address minter, no mint to zero address, total supply = sum of balances, transfer preserves supply |

`src/echidna/EchidnaToken.sol` is not a harness — it is the minimal ERC-20 the kernel
harness fuzzes against (`EchidnaFuzzer.sol` imports it); it declares no `echidna_` properties.

## TLA+ (`formal/`) — 15 invariants across 2 models (FigaroCore 7 + FlorinToken 8)

FigaroCore (`MC.tla` + `MC.cfg`): `TokenConservation`, `ContractSolvency`,
`WalletNonNegative`, `CumulativeIntegrity`, `ActiveCountCorrect`,
`ResolutionAlwaysPossible`, `TypeOK`.

FlorinToken (`FlorinToken.tla` + `FlorinToken.cfg`): `Inv_MaxSupply`,
`Inv_DeployerCannotMintAfterRenounce`, `Inv_MinterCap`,
`Inv_CapBelowMaxSupply`, `Inv_SupplyEqualsSumMinted`, `Inv_NonNegative`,
`Inv_NoMintToZero`, `Inv_BalancesSumToSupply`.

## Rust — the proof apparatus (`prover/`)

`cargo test` from `prover/` — five crates, one suite: `figaro-clause`
(Layer-A conformance: every spec in `clauses/` parses — count derived from the
directory; 11 encode vectors generated from the live TS encoder lock byte
parity incl. signed int256, stage-scoped witnesses, tuple[] arrays, open
formats), `figaro-kernel` (frozen Foundry parity vectors for commit/resolve +
the witness-gate suite: spec-identity substitution, content-hash mismatch,
inclusion failure, attest-after-resolve; bincode roundtrips fence the SP1
stdin landmines), `figaro-prove-test` (SP1 mock-executor guest tests — guest
PublicValues must equal host `apply_batch` field-for-field; in-VM Gate-S
rejection; `SP1_REAL_PROOF=1` generates + verifies a real local Core proof),
and `figaro-sequencer` (mempool runs the kernel's own witness gates at the
door; assembler fixpoint filtering incl. the resolve-closes-the-evidence-window
property; HTTP API; mempool→assemble→kernel→advance pipeline).

`sdk/tests/batch-e2e.test.ts` is the cross-language lock: TS signs + builds
the witness payload, the Rust sequencer binary proves + submits, the Solidity
verifier checks the hashes and the registry anchor on a live Anvil — money
legs asserted from the chain. Anvil-gated (skips clean without it).

## Frontend Vitest (`frontend/tests/`) — 2 tiers

`npx vitest run`. UI logic that needs neither a chain nor a real browser.
The census is the directory listing (`ls frontend/tests/{components,lib}` —
derived, never a stored count).

- **Component tier** (`tests/components/`) — React Testing Library:
  `Header`, `MobileNav`, `CapabilityRail`, `OnboardingWelcome`,
  `SellerTrackRecord`, `TokenAddressInput`, `TokenApprovalFlow`,
  `TokenDecimalDisplayFlows`, …
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
them (`HARVEST_EIP712_VECTORS=1` re-records). `test/Eip712ParityTest.t.sol`
reads that same fixture and asserts the Solidity kernel reproduces every hash —
`CommitmentTypes.hashStruct` directly, the order-hash derivation verbatim, and
the domain separator both ways (SDK vector == formula, and a live
`FigaroCore.DOMAIN_SEPARATOR()` == formula). Runs in BOTH the SDK and Foundry
CI jobs with no chain and no skipIf — the SDK↔kernel signature agreement that
was previously only in the skipIf-gated `integration.test.ts` round-trip is now
a hard gate.

## Playwright — devnet (e2e) + mobile (viewport) projects

`npm run test:e2e:devnet` (preflight → populate-test-data (clauses + ONE seed
assembly + sellers; seeding is pre-population, never a test) → run) and
`npm run test:e2e:mobile`.
Config: `playwright.config.ts`. The retired `mock` project is gone — Playwright
is e2e-only.

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

**devnet (`*.devnet.spec.ts`)** — the census is the directory listing
(`ls frontend/tests/e2e/*.devnet.spec.ts` — derived, never a stored count).
Every spec drives the real UI against Anvil + deployed contracts
(action in the UI, reaction in the UI): commerce / checkout / order lifecycle
(`seller-page`, `orders-accept` — the bilateral full-cycle spine;
`sign-countersign` — the /sign counter-party leg: the relayed payload received
over the coordination channel, the shared agreement review rendered INLINE
with the Layer-A verified banner BEFORE any bond authorization, counter-sign
through the confirm gate, commit with exact bond deltas;
`checkout-assembly-choice` — a seller bound to TWO published assemblies forces
the buyer's pick: the method dropdown (never the static line), place-order
refusing until the choice, the picked assembly committing with exact bond
deltas — the mechanism derived from binding state, no taxonomy;
`assembly-chain` — the multi-order value-added chain: three sellers bound +
designated through the UI, walk-order accepts with exact per-party bond
deltas, runtime attestations, one atomic resolve paying every party, full
audit; `buyer-assigned` — the SAME delivery assembly adopted WITHOUT a
courier designation: the unbound node falls to the buyer's checkout choice
(the SellerCataloguePicker), the committed courier is the buyer's pick,
settlement exact — coordination as an ADOPTION property; `dispatch-race` —
the SAME unbound node resolved by the countersign-first race (market
formation with zero contracts): unsigned drafts to every priceable
discovered catalogue, two couriers counter-sign-and-return on their OWN
/sign tabs (concurrent contexts), the cheapest AVAILABLE candidate wins
(cheaper-posted candidates lose by silence), the winner submits the
commit-ready relay from /orders, settlement exact, the LOSER nets zero;
`rfq-checkout` — the RFQ leg at checkout: the buyer names a CEILING, each
courier authors their OWN price on /sign, the counter-draft verifies by
reconstruction and answers on the REQUEST's conversation id, the cheapest
QUOTE commits (not the ceiling, not the posted price), the losing quoter
nets zero, and the settled process renders full audit financials (one
statement per seller + consolidation — market-formed = ordinary to the
audit); `mixed-pairing` — HUMAN buyer × AGENT candidate in ONE race: the
agent is a headless Node service (real key, `services.rest` declared, the
HttpChannel wire) that counter-signs over HTTP while a human courier
counter-signs on /sign, wins on price, receives the commit-ready payload at
its endpoint, and BROADCASTS THE COMMIT ITSELF — no browser ever acts for
the agent wallet; the losing human nets zero; `kit-diamond` — the
multi-PARENT topology: the diamond drawn on the canvas (select-add-parent),
four orders, the leaf committing BOTH parents' real hashes in its topology
section and bonding 2× the entire upstream value, one atomic 4-order
resolve, 16 cash-flow rows; `rate-pricing` — a contributor prices per
started km: the wizard's pricing-policy fields, checkout deriving payment =
rate × ceil(geodistance) from the sub-order's committed endpoints, signed +
relayed; `catalogue-fold` — catalogue-authored clause values folding onto
the committed leaf; `clause-version` — the (clauseId, version) identity key;
`local-commerce` — the meal-delivery scenario authored on the designer
canvas, pinned by both its sellers, run buyer→merchant→courier with BOTH full
process ladders attested stage by stage — stage labels DERIVED from the
registered specs at run time, never a roster — the hand-off witness PAIRED at
each courier arrival stage (single committed proximity band), the buyer's
co-witness filed through the rail's form, and the post-resolve
evidence-window-closed assertion), designer + assembly registry (`designer-save-draft`, `designer-view`,
`designer-agreement-drawer`, `designer-drafts-delete`,
`published-list-ui`), sellers (`sellers-onboarding`, `seller-edit-ui`,
`seller-withdraw`), inventories (`assemblies-inventory`, `clauses-inventory`),
and the open-world proof (`permissionless-clause`
— a never-seen clause attestable with zero per-clause on-chain code, plus a
never-seen WITNESS clause whose declared `stages[1]` form/filing/decode all
derive from the declaration; `clause-coverage` — the same harness iterated,
one rung per protocol clause no other e2e drives: drawer → encode → commit →
witness → audit through the generic pipeline, values authored via the
checkout fill surface (general-clause transaction particulars — design time
is structural, ruled 2026-07-14), the wizard's catalogue clause-values
editor, the nested sub-clause tree, or the consent AFFIX (the one
specific-T&C designer fill) (file → IPFS pin → keccak anchor
through the array-of-object repeater; the rung asserts the preview modal's
consent-terms notice at the signing moment and the document's pin
out-of-band); the witness leg is DERIVED per rung from the registered
spec's `stages` — a declaring spec with no rung fills fails as a coverage
gap, never a silent skip). Every spec in `clauses/` now has a green rung —
the former figaro-consent exclusion closed 2026-07-10.

**mobile (`*.mobile.spec.ts`, 1 spec)** — responsive/viewport chrome jsdom
can't render: `navigation.mobile.spec.ts` (Pixel 5 / Chromium).

## CI (`.github/workflows/`)

Four workflows gate `main`/`develop` on push + PR, path-filtered:
- **`foundry-ci`** — `forge build`/`test`/`fmt` + Halmos symbolic proofs (Certora
  is excluded by design — it needs the operator-held CERTORAKEY, never stored).
- **`sdk-ci`** — tsc type-check, `npm test`, build.
- **`frontend-ci`** — type-check, ESLint, Vitest (+coverage), the **mobile**
  Playwright project, production build.
- **`devnet-e2e-ci`** — the **bilateral spine** (`orders-accept`) end to end in
  the runner: Kubo (IPFS, CORS-configured), Anvil (`--accounts 34`), a full
  `deploy-local.sh` stack, `populate-test-data`, then the `orders-accept` devnet
  spec against the production static export. The highest-catch layer, no longer
  operator-discipline-only. Broader devnet specs stay operator-run.

The EIP-712 parity harness (above) rides `foundry-ci` + `sdk-ci`; both run its
two halves unconditionally.

## Opportunistic — Mythril

Mythril runs out-of-loop via `scripts/mythril-docker.sh` (Docker image `mythril/myth`, 300s execution timeout, solc 0.8.26). Not wired into pre-commit or CI; invoked by hand on specific contracts when a deep symbolic-execution pass is wanted alongside Halmos / Certora / Echidna. See CLAUDE.md "Docker-hosted services" for the Docker convention.

# Testing — Harness Inventory

CLAUDE.md keeps the run commands; this file is the full inventory of test files, harnesses, and properties across all six verification layers.

## Foundry (`test/`)

`FigaroCoreTest`, `FigaroCoreRevertBranchTest`, `FigaroCoreEventEmissionTest`,
`AttestationCoordinatorTest`, `SchemaRegistryTest`, `SchemaRegistrationHelperTest`,
`AssemblyRegistryTest`, `DutchAuctionTest`, `OperatorRegistryTest`,
`ProcessOffsetReceiptTest`, `FigaroBatchVerifierTest`, `DeployScriptTest`,
`ParityVectors`, `fig/FigToken.t.sol`, `fig/RpgfMinter.t.sol`,
`fig/RpgfMinterConformance.t.sol`, `BatchGasCeilingTest`, `BatchGasBoundaryTest`,
`GasCeilingTest`.

`test/schemaValidators/` — one test file per `ISchemaValidator` implementation
(currently 16: commerce, consent, geo, fulfilment, the 5 GHG sister schemas
(protocol / iso-14064 / pas-2050 / en-16258 / custom), GHG measurement,
jurisdiction, merchant-process, courier-process, offset-policy,
proximity policy, proximity proof). Each suite covers happy paths + every
typed-error revert. (Topology has no validator — manifest-only clause.)

## Halmos (`test/`) — 2 harnesses, 15 properties

| Harness | Properties | Key invariants |
|---|---|---|
| `HalmosFigaroCore.t.sol` | 7 | Token conservation, bond amounts, resolution payouts, status transitions, buyer dominance, monotonicity |
| `HalmosRpgfMinter.t.sol` | 8 | Claim flag set, already-claimed revert, not-unlocked revert, invalid-stage revert, root-not-set revert, submitter auth, root one-shot, zero-root rejection |

## Certora (`certora/`) — 6 specs, 44 declared rules (46 sub-rules)

| Spec | Rules | Covers |
|---|---|---|
| `FigaroCore.spec` | 8 | Status monotonicity, transitions, active count, buyer dominance, no double-commit, cumulative monotonicity, rootBuyer immutable, currency immutable |
| `AttestationCoordinator.spec` | 7 → 8 sub-rules | Role-gate on `attestAsBuyer` (non-buyer reverts; success ⟹ caller is buyer) + parametric Core-immutability (AC cannot change orderStatus or processes[]) + validator-gate (schemaId with no registered validator reverts) + setValidator invariants (first-write-wins, per-schema storage isolation). Re-authored + cloud-verified 2026-04-23 for the new commitment-arg ABI — 8/8 green. |
| `TokenOpsVerification.spec` | 7 → 8 sub-rules | Universal FigaroCore token-flow: exact commit deltas (buyer/seller/Core), allowance-drain safety (∀ address), commit + single-order resolve conservation, single-order resolve exact payouts. Generalizes Halmos root-only coverage to arbitrary sub-orders. |
| `BatchVerifierTokenOps.spec` | 4 | Single-position `settleBatch`: user balance delta = payout − deposit, contract delta = deposit − payout, allowance-drain safety, conservation. |
| `FigToken.spec` | 6 | Supply cap, registered-cap bound, registered-cap monotonicity, renounce one-way latch, minter cap immutability, minter within cap |
| `RpgfMinter.spec` | 12 | submitter/minter/programVKey immutable, per-stage unlockTime immutable, root one-shot, totalAllocated locked-with-root, claim-flag monotonic, only-submitter sets root, claim preconditions (stage-bound, root-set, unlocked, not-already-claimed). |

Companion: `certora/token-ops.inventory` + `scripts/lint-token-ops.sh` — declarative inventory of every ERC20 transfer call site in `src/`; the linter (run as a `./scripts/test-certora.sh` prelude) fails if a new transfer call merges without an inventory entry.

## Echidna — 3 harnesses, 23 properties

| Harness | Properties | Path |
|---|---|---|
| `EchidnaFuzzer` | 7 | `src/echidna/EchidnaFuzzer.sol` — kernel: solvency, active-count consistency, cumulative accounting, state monotonicity, token conservation, buyer dominance, atomic resolution |
| `EchidnaRpgfMinter` | 8 | `src/echidna/EchidnaRpgfMinter.sol` — claim-flag monotonic, total-minted within cap, minter / submitter / programVKey / unlockTimes immutable, root one-shot, claim balance consistency |
| `EchidnaFigToken` | 8 | `src/echidna/EchidnaFigToken.sol` — FigToken: MAX_SUPPLY never exceeded, deployer can renounce, no deployer mint after renounce, minter cap enforced, no zero-address minter, no mint to zero address, total supply = sum of balances, transfer preserves supply |

## TLA+ (`formal/`) — 24 invariants across 3 models (FigaroCore 7 + FigToken 8 + RpgfMinter 9)

FigaroCore (`MC.tla` + `MC.cfg`): `TokenConservation`, `ContractSolvency`,
`WalletNonNegative`, `CumulativeIntegrity`, `ActiveCountCorrect`,
`ResolutionAlwaysPossible`, `TypeOK`.

FigToken (`FigToken.tla` + `FigToken.cfg`): `Inv_MaxSupply`,
`Inv_DeployerCannotMintAfterRenounce`, `Inv_MinterCap`,
`Inv_CapBelowMaxSupply`, `Inv_SupplyEqualsSumMinted`, `Inv_NonNegative`,
`Inv_NoMintToZero`, `Inv_BalancesSumToSupply`.

RpgfMinter (`RpgfMinter.tla` + `MC_RpgfMinter.tla` + `MC_RpgfMinter.cfg`):
`TypeOK`, `Inv_SubmitterImmutable`, `Inv_UnlockTimeImmutable`,
`Inv_RootInRange`, `Inv_ClaimedTyped`, `Inv_ClaimImpliesRootSet`,
`Inv_ClaimImpliesUnlocked`, `Inv_TotalAllocatedLockedWithRoot`,
`Inv_StageIndexBounded`.

## Frontend Vitest (`frontend/tests/`) — 2 tiers, 64 files

`npx vitest run`. UI logic that needs neither a chain nor a real browser.

- **Component tier** (`tests/components/`, 8 files) — React Testing Library:
  `Header`, `MobileNav`, `NotificationBell`, `GHGWorkflowPanel`,
  `OperatorTrackRecord`, `TokenAddressInput`, `TokenApprovalFlow`,
  `TokenDecimalDisplayFlows`.
- **Lib tier** (`tests/lib/`, 56 files) — pure-client unit tests: commitment
  preparation + stores, agreement manifest, schema-spec source, discovery +
  catalogue pipeline, GHG disclosure, delivery/handoff attestation, dispute
  evidence, IPFS service, token conversion, geocode, and per-hook tests
  (`useCommitmentFlow`, `useOffsetRetirement`, `useTokenApproval`, …).

## Playwright — devnet (e2e) + mobile (viewport) projects

`npm run test:e2e:devnet` (preflight → seed → run) and `npm run test:e2e:mobile`.
Config: `playwright.config.ts`. The retired `mock` project is gone — Playwright
is e2e-only.

**devnet (`*.devnet.spec.ts`, 47 specs)** — every spec drives the real UI
against Anvil + deployed contracts (action in the UI, reaction in the UI). By area:

- Commerce / checkout / order lifecycle: `merchant-page`, `merchant-place-order`,
  `onsite-purchase`, `inbox`, `inbox-accept`, `process-closure`.
- Designer + assembly registry: `designer-publish`, `designer-save-draft`,
  `designer-view`, `designer-agreement-drawer`, `designer-delivery-modality`,
  `designer-drafts-delete`, `scenario-direct-sale`, `scenario-local-commerce`,
  `scenario-local-commerce-offset`, `seeded-assembly-fork`, `published-list-ui`,
  `assembly-registry`.
- Operators: `operators-onboarding`, `operator-edit-ui`,
  `operator-update-profile`, `operator-withdraw`.
- Order / role surfaces: `seller-timeline`, `spectator-view`, `audit-page`,
  `audit-page-seller`, `local-commerce-offset-scenario` (full multi-role
  emissions-aware runtime: commit → coordinate → emissions → offset → resolve).
- Attestation + delivery: `buyer-attestation`, `proximity-proof`,
  `proximity-proof-ui`, `dutch-auction-lifecycle`.
- GHG / offsets: `offset-retirement`, `offset-retirement-ui`. (GHG
  panel-level coverage now lives end-to-end in
  `local-commerce-offset-scenario`.)
- Dispute: `dispute-ui`. FIG token: `fig-claim`, `fig-claim-ui`.

**mobile (`*.mobile.spec.ts`, 1 spec)** — responsive/viewport chrome jsdom
can't render: `navigation.mobile.spec.ts` (Pixel 5 / Chromium).

## Rust prover — figaro-kernel + figaro-sequencer + figaro-schema + figaro-rpgf

- `figaro-kernel` (`prover/lib/`): kernel logic mirror — types, EIP-712 hashing, apply_batch state machine.
- `figaro-sequencer` (`prover/sequencer/`): batch mempool, state mirror, assembler, submitter, API.
- `figaro-schema` (`prover/schema/`): Layer B schema validator. Conformance tests against the
  TypeScript Layer A reference (`sdk/tests/schemas/validate.test.ts`) — every shipped protocol
  schema's parse, per-schema content checks for `figaro-ghg-protocol-v1` and `figaro-geo-v2`, and
  a check that all 16 embedded canonical specs the content gate uses parse and resolve by schemaId.
- `figaro-rpgf` (`prover/rpgf/`): substrate-broadening aggregator + conformance to TypeScript simulator.

## Opportunistic — Mythril

Mythril runs out-of-loop via `scripts/mythril-docker.sh` (Docker image `mythril/myth`, 300s execution timeout, solc 0.8.26). Not wired into pre-commit or CI; invoked by hand on specific contracts when a deep symbolic-execution pass is wanted alongside Halmos / Certora / Echidna. See CLAUDE.md "Docker-hosted services" for the Docker convention.

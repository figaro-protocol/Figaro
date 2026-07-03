# Testing — Harness Inventory

CLAUDE.md keeps the run commands; this file is the full inventory of test files, harnesses, and properties across all verification layers.

## Foundry (`test/`)

`FigaroCoreTest`, `FigaroCoreRevertBranchTest`, `FigaroCoreEventEmissionTest`,
`AttestationCoordinatorTest`, `ClauseRegistryTest`, `AssemblyRegistryTest`,
`SellerRegistryTest`, `GasCeilingTest`, `SwapAndCommitCoordinatorTest`,
`MockKlerosArbitratorTest`, `HalmosFigaroCore`, `fig/FigToken.t.sol`.

## Halmos (`test/`) — 1 harness, 7 properties

| Harness | Properties | Key invariants |
|---|---|---|
| `HalmosFigaroCore.t.sol` | 7 | Token conservation, bond amounts, resolution payouts, status transitions, buyer dominance, monotonicity |

## Certora (`certora/`) — 4 specs

| Spec | Rules | Covers |
|---|---|---|
| `FigaroCore.spec` | 8 | Status monotonicity, transitions, active count, buyer dominance, no double-commit, cumulative monotonicity, rootBuyer immutable, currency immutable |
| `AttestationCoordinator.spec` | 4 | Role-gate on `attestAsBuyer` (non-buyer reverts; success ⟹ caller is buyer) + parametric Core-immutability (AC cannot change orderStatus or processes[]). No on-chain clause-content validator — well-formedness is an off-chain concern. |
| `TokenOpsVerification.spec` | 7 | Universal FigaroCore token-flow: exact commit deltas (buyer/seller/Core), allowance-drain safety (∀ address), commit + single-order resolve conservation, single-order resolve exact payouts. Generalizes Halmos root-only coverage to arbitrary sub-orders. |
| `FigToken.spec` | 6 | Supply cap, registered-cap bound, registered-cap monotonicity, renounce one-way latch, minter cap immutability, minter within cap |

Companion: `certora/token-ops.inventory` + `scripts/lint-token-ops.sh` — declarative inventory of every ERC20 transfer call site in `src/`; the linter (run as a `./scripts/test-certora.sh` prelude) fails if a new transfer call merges without an inventory entry.

## Echidna — 3 harnesses, 23 properties

| Harness | Properties | Path |
|---|---|---|
| `EchidnaFuzzer` | 7 | `src/echidna/EchidnaFuzzer.sol` — kernel: solvency, active-count consistency, cumulative accounting, state monotonicity, token conservation, buyer dominance, atomic resolution |
| `EchidnaFigToken` | 8 | `src/echidna/EchidnaFigToken.sol` — FigToken: MAX_SUPPLY never exceeded, deployer can renounce, no deployer mint after renounce, minter cap enforced, no zero-address minter, no mint to zero address, total supply = sum of balances, transfer preserves supply |
| `EchidnaToken` | 8 | `src/echidna/EchidnaToken.sol` — ERC20 token invariants |

## TLA+ (`formal/`) — 15 invariants across 2 models (FigaroCore 7 + FigToken 8)

FigaroCore (`MC.tla` + `MC.cfg`): `TokenConservation`, `ContractSolvency`,
`WalletNonNegative`, `CumulativeIntegrity`, `ActiveCountCorrect`,
`ResolutionAlwaysPossible`, `TypeOK`.

FigToken (`FigToken.tla` + `FigToken.cfg`): `Inv_MaxSupply`,
`Inv_DeployerCannotMintAfterRenounce`, `Inv_MinterCap`,
`Inv_CapBelowMaxSupply`, `Inv_SupplyEqualsSumMinted`, `Inv_NonNegative`,
`Inv_NoMintToZero`, `Inv_BalancesSumToSupply`.

## Frontend Vitest (`frontend/tests/`) — 2 tiers, 64 files

`npx vitest run`. UI logic that needs neither a chain nor a real browser.

- **Component tier** (`tests/components/`, 8 files) — React Testing Library:
  `Header`, `MobileNav`, `CapabilityRail`, `OnboardingWelcome`,
  `SellerTrackRecord`, `TokenAddressInput`, `TokenApprovalFlow`,
  `TokenDecimalDisplayFlows`.
- **Lib tier** (`tests/lib/`, 56 files) — pure-client unit tests: commitment
  preparation + stores, agreement, clause-spec source, discovery +
  catalogue pipeline, GHG disclosure, delivery/handoff attestation, dispute
  evidence, IPFS service, token conversion, geocode, and per-hook tests
  (`useOrderCommitmentFlow`, `useTokenApproval`, …).

## Playwright — devnet (e2e) + mobile (viewport) projects

`npm run test:e2e:devnet` (preflight → populate-test-data (clauses + ONE seed
assembly + sellers; seeding is pre-population, never a test) → run) and
`npm run test:e2e:mobile`.
Config: `playwright.config.ts`. The retired `mock` project is gone — Playwright
is e2e-only.

The webServer is a **production build** by default (`next build` + `next start`
on :3100, ~90 s build): the dev server degrades after ~25 min of
compile-on-demand (the seller-track-record tail-position flake, 2026-06-11),
and devnet is a mainnet rehearsal — participants hit a production build. The
build inlines `frontend/.env.local`, so kill :3100 after a `FORCE_REDEPLOY` or
an app-code edit — a reused server keeps serving the build it started with.
`PLAYWRIGHT_WEB_MODE=dev` restores the dev-server webServer for HMR-speed
iteration. In production builds, test-helper gating honors only the explicit
`NEXT_PUBLIC_ENABLE_TEST_HELPERS` build-time opt-in (`lib/shared/testHelpers.ts`,
`lib/shared/e2e.ts`); real deployments never set it, so their builds inline the
hard-off (RA-5 intent preserved).

**devnet (`*.devnet.spec.ts`)** — 15 specs on disk (`frontend/tests/e2e/`); see
the files. Every spec drives the real UI against Anvil + deployed contracts
(action in the UI, reaction in the UI): commerce / checkout / order lifecycle
(`seller-page`, `orders-accept` — the bilateral full-cycle spine;
`assembly-chain` — the multi-order value-added chain: three sellers bound +
designated through the UI, walk-order accepts with exact per-party bond
deltas, runtime attestations, one atomic resolve paying every party, full
audit; `local-commerce` — the meal-delivery scenario authored on the designer
canvas, pinned by both its sellers, run buyer→merchant→courier with BOTH full
process ladders attested stage by stage), designer + assembly registry (`designer-save-draft`, `designer-view`,
`designer-agreement-drawer`, `designer-drafts-delete`,
`published-list-ui`), sellers (`sellers-onboarding`, `seller-edit-ui`,
`seller-withdraw`), inventories (`assemblies-inventory`, `clauses-inventory`),
and the open-world proof (`permissionless-clause`
— a never-seen clause attestable with zero per-clause on-chain code).

**mobile (`*.mobile.spec.ts`, 1 spec)** — responsive/viewport chrome jsdom
can't render: `navigation.mobile.spec.ts` (Pixel 5 / Chromium).

## Opportunistic — Mythril

Mythril runs out-of-loop via `scripts/mythril-docker.sh` (Docker image `mythril/myth`, 300s execution timeout, solc 0.8.26). Not wired into pre-commit or CI; invoked by hand on specific contracts when a deep symbolic-execution pass is wanted alongside Halmos / Certora / Echidna. See CLAUDE.md "Docker-hosted services" for the Docker convention.

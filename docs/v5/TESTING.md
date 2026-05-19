# Testing — Harness Inventory

CLAUDE.md keeps the run commands; this file is the full inventory of test files, harnesses, and properties across all six verification layers.

## Foundry (`test/`)

`FigaroCoreTest`, `FigaroCoreRevertBranchTest`, `FigaroCoreEventEmissionTest`,
`AttestationCoordinatorTest`, `SchemaRegistryTest`, `DutchAuctionTest`,
`OperatorRegistryTest`, `FigaroBatchVerifierTest`, `ParityVectors`,
`fig/FigToken.t.sol`, `fig/RpgfMinter.t.sol`, `fig/RpgfMinterConformance.t.sol`,
`BatchGasCeilingTest`, `BatchGasBoundaryTest`, `GasCeilingTest`.

`test/schemaValidators/` — one test file per `ISchemaValidator` implementation
(currently 16: handoff, commerce, geo, fulfilment, the 5 GHG sister schemas
(protocol / iso-14064 / pas-2050 / en-16258 / custom), GHG measurement,
delivery lifecycle, proximity policy, proximity proof, merchant-process,
courier-process, jurisdiction). Each suite covers happy paths + every
typed-error revert. (Topology has no validator — manifest-only clause.)

## Halmos (`test/`) — 2 harnesses, 15 properties

| Harness | Properties | Key invariants |
|---|---|---|
| `HalmosFigaroCore.t.sol` | 7 | Token conservation, bond amounts, resolution payouts, status transitions, buyer dominance, monotonicity |
| `HalmosRpgfMinter.t.sol` | 8 | Claim flag set, already-claimed revert, not-unlocked revert, invalid-stage revert, root-not-set revert, submitter auth, root one-shot, zero-root rejection |

## Certora (`certora/`) — 6 specs, 43 declared rules

| Spec | Rules | Covers |
|---|---|---|
| `FigaroCore.spec` | 8 | Status monotonicity, transitions, active count, buyer dominance, no double-commit, cumulative monotonicity, rootBuyer immutable, currency immutable |
| `AttestationCoordinator.spec` | 7 → 8 sub-rules | Role-gate on `attestAsBuyer` (non-buyer reverts; success ⟹ caller is buyer) + parametric Core-immutability (AC cannot change orderStatus or processes[]) + validator-gate (schemaId with no registered validator reverts) + setValidator invariants (first-write-wins, per-schema storage isolation). Re-authored + cloud-verified 2026-04-23 for the new commitment-arg ABI — 8/8 green. |
| `TokenOpsVerification.spec` | 7 → 8 sub-rules | Universal FigaroCore token-flow: exact commit deltas (buyer/seller/Core), allowance-drain safety (∀ address), commit + single-order resolve conservation, single-order resolve exact payouts. Generalizes Halmos root-only coverage to arbitrary sub-orders. |
| `BatchVerifierTokenOps.spec` | 4 | Single-position `settleBatch`: user balance delta = payout − deposit, contract delta = deposit − payout, allowance-drain safety, conservation. |
| `FigToken.spec` | 6 | Supply cap, registered-cap bound, registered-cap monotonicity, renounce one-way latch, minter cap immutability, minter within cap |
| `RpgfMinter.spec` | 12 | submitter/minter/programVKey immutable, per-stage unlockTime immutable, root one-shot, totalAllocated locked-with-root, claim-flag monotonic, only-submitter sets root, claim preconditions (stage-bound, root-set, unlocked, not-already-claimed). |

Companion: `certora/token-ops.inventory` + `lint-token-ops.sh` — declarative inventory of every ERC20 transfer call site in `src/`; the linter (run as a `./test-certora.sh` prelude) fails if a new transfer call merges without an inventory entry.

## Echidna — 2 harnesses, 15 properties

| Harness | Properties | Path |
|---|---|---|
| `EchidnaFuzzer` | 7 | `src/echidna/EchidnaFuzzer.sol` — kernel: solvency, active-count consistency, cumulative accounting, state monotonicity, token conservation, buyer dominance, atomic resolution |
| `EchidnaRpgfMinter` | 8 | `echidna/EchidnaRpgfMinter.sol` — claim-flag monotonic, total-minted within cap, minter / submitter / programVKey / unlockTimes immutable, root one-shot, claim balance consistency |

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

## Frontend Vitest
## Playwright — mock, mock-mobile, and devnet projects
## Rust prover — figaro-kernel + figaro-sequencer

# Testing — Harness Inventory

CLAUDE.md keeps the run commands; this file is the full inventory of test files, harnesses, and properties across all six verification layers.

## Foundry (`test/`)

`FigaroCoreTest`, `FigaroCoreRevertBranchTest`, `FigaroCoreEventEmissionTest`,
`AttestationCoordinatorTest`, `SchemaRegistryTest`, `DutchAuctionTest`,
`OperatorRegistryTest`, `FigaroBatchVerifierTest`, `ParityVectors`,
`fig/FigToken.t.sol`, `fig/StagedMerkleAirdrop.t.sol`,
`BatchGasCeilingTest`, `BatchGasBoundaryTest`, `GasCeilingTest`.

`test/schemaValidators/` — one test file per `ISchemaValidator` implementation
(currently 16: handoff, commerce, geo, fulfilment, the 5 GHG sister schemas
(protocol / iso-14064 / pas-2050 / en-16258 / custom), GHG measurement,
delivery lifecycle, proximity policy, proximity proof, merchant-process,
courier-process, jurisdiction). Each suite covers happy paths + every
typed-error revert. (Topology has no validator — manifest-only clause.)

## Halmos (`test/`) — 2 harnesses

| Harness | Properties | Key invariants |
|---|---|---|
| `HalmosFigaroCore.t.sol` | 7 | Token conservation, bond amounts, resolution payouts, status transitions, buyer dominance, monotonicity |
| `HalmosStagedMerkleAirdrop.t.sol` | 4 | Claim flag set, one-shot per (stage, address), balance math, merkle leaf format |

## Certora (`certora/`) — 6 specs

| Spec | Rules | Covers |
|---|---|---|
| `FigaroCore.spec` | 8 | Status monotonicity, transitions, active count, buyer dominance, no double-commit, cumulative monotonicity, rootBuyer immutable, currency immutable |
| `AttestationCoordinator.spec` | 7 → 8 sub-rules | Role-gate on `attestAsBuyer` (non-buyer reverts; success ⟹ caller is buyer) + parametric Core-immutability (AC cannot change orderStatus or processes[]) + validator-gate (schemaId with no registered validator reverts) + setValidator invariants (first-write-wins, per-schema storage isolation). Re-authored + cloud-verified 2026-04-23 for the new commitment-arg ABI — 8/8 green. |
| `TokenOpsVerification.spec` | 7 → 8 sub-rules | Universal FigaroCore token-flow: exact commit deltas (buyer/seller/Core), allowance-drain safety (∀ address), commit + single-order resolve conservation, single-order resolve exact payouts. Generalizes Halmos root-only coverage to arbitrary sub-orders. |
| `BatchVerifierTokenOps.spec` | 4 | Single-position `settleBatch`: user balance delta = payout − deposit, contract delta = deposit − payout, allowance-drain safety, conservation. |
| `FigToken.spec` | 6 | Supply cap, registered-cap bound, registered-cap monotonicity, renounce one-way latch, minter cap immutability, minter within cap |
| `StagedMerkleAirdrop.spec` | 3 | Claim monotonicity, stage config immutability, minter immutability |

Companion: `certora/token-ops.inventory` + `lint-token-ops.sh` — declarative inventory of every ERC20 transfer call site in `src/`; the linter (run as a `./test-certora.sh` prelude) fails if a new transfer call merges without an inventory entry.

## Echidna — 7 properties

Harness: `src/echidna/EchidnaFuzzer.sol`.
`echidna_solvency`, `echidna_active_count_consistent`, `echidna_cumulative_accounting`,
`echidna_state_monotonicity`, `echidna_token_conservation`, `echidna_buyer_dominance`,
`echidna_atomic_resolution`

## TLA+ (`formal/`) — 15 invariants across 2 models (FigaroCore 7 + FigToken 8)

`TokenConservation`, `ContractSolvency`, `WalletNonNegative`, `CumulativeIntegrity`,
`ActiveCountCorrect`, `ResolutionAlwaysPossible`, `TypeOK`.
Also `formal/FigToken.tla` / `formal/FigToken.cfg` — 8 FigToken invariants.

## Frontend Vitest
## Playwright — mock, mock-mobile, and devnet projects
## Rust prover — figaro-kernel + figaro-sequencer

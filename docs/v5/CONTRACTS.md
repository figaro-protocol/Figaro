# Smart Contracts — What Actually Exists (V5)

All contracts in `src/`. Solidity 0.8.26, Foundry. V3 in `archive-v3/`.

No contract belongs to a dapp. Every contract is a permissionless primitive.

This file is the canonical inventory. CLAUDE.md indexes it; agents must not reference contracts not listed here.

## Core Protocol

**`src/FigaroCore.sol`** — The protocol kernel. No owner, no fee, no escape hatches.
- 2 external functions: `commit` (unified dual-signed), `resolveProcess`
- 3 mappings: `processes` (ProcessState), `orderStatus` (uint8), `orderProcessId` (bytes32)
- EIP-712 dual-signed commitments; asymmetric bonding; direct transfer at resolution
- Covered by Foundry unit tests, 7 Echidna properties (EchidnaFuzzer), 7 Halmos symbolic proofs (HalmosFigaroCore), and 6 Certora CVL specs across the protocol (FigaroCore, AttestationCoordinator, TokenOpsVerification, BatchVerifierTokenOps, FigToken, RpgfMinter — the StagedMerkleAirdrop Halmos pass + Certora spec were retired alongside the contract; see `docs/v5/VERIFICATION_MAP.md` for the current per-contract verification coverage)

**`src/CommitmentTypes.sol`** — EIP-712 typed structs and hash functions.
Single `Commitment` struct for both root and sub-orders; `processId` zero for root.

## Attestation & Schema

**`src/AttestationCoordinator.sol`** — Unified zero-storage attestation,
validator-gated, receipt-bound to the signed `agreementHash`. Three modes:
- `attestAsSeller(Commitment role, Commitment target, bytes32 schemaId, uint8 stage, bytes sectionData, bytes32[] proof, bytes content)` — role + target commitments; pass the same commitment twice for same-order attestation, or distinct commitments for cross-order within a process.
- `attestAsBuyer(Commitment target, bytes32 schemaId, uint8 stage, bytes sectionData, bytes32[] proof, bytes content)` — caller must equal `target.buyer` (which equals rootBuyer by commit invariant).
- `attestViaResolver(Commitment target, ...)` — caller authorized by `IRoleResolver(target.seller).isAuthorized`.

For every call, the coordinator verifies an OZ-style merkle inclusion proof of
`leaf = keccak256(schemaId || keccak256(sectionData))` against
`target.agreementHash` before invoking the registered validator, then emits
`Attestation(orderHash, processId, attester, schemaId, stage, contentRef)`
where `contentRef = keccak256(content)`. An attestation whose clause was not
committed at contract-signing time cannot land — the proof won't open
(`InvalidInclusionProof` revert).

No new kernel state: `agreementHash` is read from the caller-supplied
Commitment struct, which `_requireKnownCommitment` verifies matches a
committed orderHash via `core.orderStatus`.

7 Certora CVL rules in `certora/AttestationCoordinator.spec` (2 role-gate,
2 parametric Core-immutability, 1 validator-mandatory, 2 setValidator
invariants). Binding-integrity, `contentRef == keccak256(content)`, and the
inclusion-proof revert path are covered by Foundry tests.

`attestViaResolver` is a latent Level-3 path — no current production caller.
A mechanism contract adopting it must (a) have its seller address implement
`IRoleResolver.isAuthorized(orderHash, caller)` and (b) use a schemaId with
a registered validator. Validator gate and inclusion-proof gate both fire
before the resolver check.

**`src/SchemaRegistry.sol`** — Permissionless event-only schema anchoring.
`schemaId = keccak256(humanReadableName)`. `uriHash` points at off-chain JSON spec.

**`src/SchemaRegistrationHelper.sol`** — Stateless atomic-bind helper.
Composes `SchemaRegistry.registerSchema` + `AttestationCoordinator.setValidator`
in a single transaction. Closes the M-1 front-running window for non-bootstrap
schemas. No admin, no fee, no privilege over targets — just a permissionless
composer. Use for any post-deploy third-party schema registration.

**`src/ISchemaValidator.sol`** — Per-schema content validator interface.
`validate(bytes32 schemaId, uint8 stage, bytes calldata content) view` reverts on
invalid content; binds to one schemaId via `schemaId() view returns (bytes32)`.
Validators are pure / view, no admin, no mutable state.

**`src/schemaValidators/`** — 16 production validator contracts, one per
*runtime-attestable* schemaId (local-commerce use case + jurisdiction baseline + consent):
`FigaroCommerceV1Validator`, `FigaroGeoV2Validator`,
`FigaroFulfilmentV2Validator`, plus the 5 GHG sister schemas
`FigaroGHGProtocolV1Validator`, `FigaroGHGISO14064V1Validator`,
`FigaroGHGPAS2050V1Validator`, `FigaroGHGEN16258V1Validator`,
`FigaroGHGCustomV1Validator` (one per accounting standard),
`FigaroGHGMeasurementV1Validator`,
`FigaroProximityPolicyV1Validator` (Category-2, committed band) +
`FigaroProximityProofV1Validator` (Category-1, runtime witness),
`FigaroMerchantProcessV1Validator`,
`FigaroCourierProcessV1Validator`, `FigaroJurisdictionV1Validator`,
`FigaroConsentV1Validator`,
`FigaroOffsetPolicyV1Validator` (Category-2, committed providers).
Each ABI-decodes per-schema content (no on-chain JSON parsing) and reverts with
typed custom errors. Foundry tests in `test/schemaValidators/`.

Note: `figaro-topology-v1` is a **manifest-only clause** — parties commit to
it at contract-signing time inside the off-chain agreement manifest, and it's
never fired as a runtime attestation. It has no on-chain validator and no SP1
encoder. It is *not* off-chain-only, though: the topology section is a merkle
leaf under the on-chain `agreementHash`, inclusion-provable via OpenZeppelin
`MerkleProof` (`buildSectionInclusionProof` in `agreementManifest.ts`) — "no
runtime validator" is not "no on-chain verification". Its `SchemaRegistry`
entry anchors the schemaId as off-chain vocabulary; the DAG itself is
reconstructed by indexers/frontend reading topology sections from the signed
manifest.

**`src/IRoleResolver.sol`** — Role-authorization interface for mechanism-delegated attestation.

## Mechanism Modules

**`src/DutchAuction.sol`** — Descending-price coordination primitive. No token handling.

**`src/ProcessOffsetReceipt.sol`** — Permissionless on-chain anchor for Path A
carbon-offset receipts. The buyer performs the offset retirement off-protocol
at an external aggregator (Klima KlimaInfinity, Toucan OffsetHelper, etc.),
then calls `record(processId, retirementTxHash, aggregator, tonsRetired,
inputToken, inputAmount)` here to anchor the `processId ↔ retirementTxHash`
binding on-chain. The contract verifies `processes[processId].rootBuyer ==
msg.sender` via cross-call to `FigaroCore`, then emits `ReceiptRecorded` with
three indexed fields (processId, buyer, retirementTxHash) so audit-bundle
consumers can reconstruct receipts by any of the three. No state, no admin,
no storage beyond the event log. **Receipts are a separate artifact family
from attestations** per separation-of-concerns doctrine — they do not require
a committed agreement clause or a merkle inclusion proof, so they can't be
hosted under `AttestationCoordinator`.

**`src/OperatorRegistry.sol`** — Permissionless operator self-registration with
reclaimable ETH deposit. Three external functions: `register(metadataURI)` (sets
the dedup guard, consumes the deposit, emits `OperatorRegistered`),
`updateProfile(metadataURI)` (caller-only metadata replacement, no deposit
movement, emits `OperatorProfileUpdated`), and `withdraw()` (returns the deposit
and clears the dedup guard once the lock period has elapsed). Three events:
`OperatorRegistered`, `OperatorProfileUpdated`, `OperatorWithdrawn`. State is
dedup-only (`_registered: address → bool`) plus the registration timestamp that
backs the deposit-lock gate. **No `_active` flag, no role enum, no `deactivate`
/ `reactivate`**: operator availability is signal-by-availability off-chain, not
registry state, and a seller's role is whatever their catalogue (referenced by
`metadataURI`) declares through its archetype. The deposit and lock are
spam-protection knobs only; profile updates do not require withdrawing. The
kernel does not gate any operation on operator state — this registry is
advisory metadata for off-chain discovery surfaces.

**`src/AssemblyRegistry.sol`** — Permissionless assembly anchoring with a
reclaimable ETH deposit. An assembly is a composition template that USES
schemas; this registry is the assembly artifact family's anchor, parallel to
`SchemaRegistry` (schemas) and `OperatorRegistry` (operators) per the
separation-of-concerns doctrine. Two external functions: `registerAssembly(slug,
contentHash, metadataURI)` (first-write-wins, requires the immutable
`registrationDeposit`, emits `AssemblyRegistered`) and `withdrawDeposit(slug)`
(author-only, callable once after `depositLockPeriod` elapses, emits
`DepositWithdrawn`). State is one mapping `bindings: slugHash → AssemblyBinding`
{author, registeredAt, depositWithdrawn, contentHash, metadataURI}. The slug
binding is permanent — `withdrawDeposit` returns only the ETH and never clears
the binding, because buyers and operators that reference the slug rely on its
content staying stable; the deposit is an upfront Sybil-resistance tax with a
refund path, not a fee. No owner, no admin, no fee, no `transferAssembly`, no
`removeAssembly`. The contract does not validate manifest content — per-clause
validity is the per-schema validator's job at commit time. Foundry tests in
`test/AssemblyRegistryTest.t.sol`.

## FIG Token (`src/fig/`)

**`FigToken.sol`** — ERC-20 + EIP-2612 permit. 1B MAX_SUPPLY hard cap on every mint.
Reentrancy-guarded. Minter registry with `totalRegisteredCap` (sum of all registered
caps enforced not to exceed MAX_SUPPLY). Deployer registers capped minters, then renounces.

**`RpgfMinter.sol`** — Three-stage SP1-gated retroactive public-goods funding
minter. One contract with three immutable unlock timestamps (yr 2 / yr 5 / yr 9)
and three submitter-set Merkle roots (set once per tranche after an SP1 proof
verifies the aggregation). One-shot per (stage, address) on the claim side.
Calls `IFigMinter.mint`. Aggregation logic lives in `prover/rpgf/` (Rust);
host-side SP1 wrapper in `prover/rpgf-script/`; TypeScript sequencer
orchestrator in `sdk/scripts/rpgf-sequencer/`.

**`IFigMinter.sol`** — `mint(address, uint256)` interface implemented by FigToken.

**FIG allocation (canonical, 1B total):**
- **100M (10%) founders** — genesis mint, no vesting, no unlock
- **300M (30%) DAO**       — genesis mint, no vesting, no unlock
- **600M (60%) schema-author RPGF** — one `RpgfMinter` contract, staged:
  - stage 0 (year 2): up to 300M (30% of total)
  - stage 1 (year 5): up to 200M (20% of total)
  - stage 2 (year 9): up to 100M (10% of total)

  Per-tranche budgets are caps; actual allocation at each tranche is determined
  by the V5 substrate-broadening aggregation (run off-chain, verified on-chain
  via SP1 proof). When the per-author cap binds for every contributor at a
  tranche, the unallocated portion of the budget stays unminted by design.

Deploy flow: deployer registers itself as a one-shot genesis minter with cap 400M,
mints 100M+300M to founder/DAO wallets, registers the RPGF minter with cap 600M,
renounces. `totalRegisteredCap = 1B` exactly at the end of deploy. No further mints
are possible outside valid merkle claims on `RpgfMinter`.

No settlement-anchored emission. No batch-path minting. `FigaroBatchVerifier` is
NOT a FIG minter and will never be registered as one.

## Batch Verification

**`src/FigaroBatchVerifier.sol`** — On-chain verifier for SP1-proved batches.
Verifies state root continuity, chain binding, auxiliary data hashes. Executes net token transfers.
3-argument constructor (the legacy `figToken` dead-code field — flagged as INFO-2 in the
AI audit — has been removed).

**`src/interfaces/ISP1Verifier.sol`** — Succinct SP1 verifier gateway interface.
**`src/mocks/MockSP1Verifier.sol`** — Accepts any proof for devnet testing.

Deployment note: devnet wires `FigaroBatchVerifier` to `MockSP1Verifier` (the
`Deploy.s.sol` program vKey is a placeholder the mock ignores). Testnet and
mainnet MUST wire a real SP1 verifier and run the sequencer with `SP1_PROVER`
≠ `mock` so it self-proves Groth16 — a real verifier paired with the mock
prover would reject every batch.

## Test / Mock Contracts

- `src/mocks/MockERC20.sol`, `MockERC20FeeOnTransfer.sol`, `MockPermitToken.sol`
- `src/mocks/MockOffsetAggregator.sol` — devnet stand-in for Klima KlimaInfinity / Toucan OffsetHelper. Fixed `pricePerTon` constructor arg, pulls input token via `transferFrom`, emits `Retired`. Wired into `Deploy.s.sol` only — mainnet uses real aggregators.
- `src/mocks/MockKlerosArbitrableProxy.sol`, `src/mocks/MockKlerosArbitrator.sol` — devnet stand-ins for the Kleros dispute-resolution flow; deployed via `script/DeployMockKleros.s.sol` (run from `./deploy-mock-kleros.sh`) on top of `./deploy-local.sh`. Mainnet uses the real Kleros contracts.
- `src/echidna/EchidnaFuzzer.sol`, `EchidnaToken.sol`

## What Does NOT Exist

No `FigaroFactory.sol`, `FigaroRouter.sol`, `governance/`, `compliance/`,
`FigEmission.sol`, `FigTimeLock.sol`, `MerkleAirdrop.sol`, `StagedMerkleAirdrop.sol`
(this last replaced by `RpgfMinter.sol` in 2026-05),
`TrancheVesting.sol` (removed — founder and DAO receive tokens at genesis with no vesting),
`ProximityTypes.sol` (removed), `IRoleResolverV4.sol` (renamed to `IRoleResolver.sol`),
generic `JSONSchemaValidator.sol` (per-schema validators instead — see `docs/v5/SCHEMAS.md`),
upgradeable proxy, protocol fee, owner, or admin surface.
FIG is not a governance token. `FigTokenModule` (UI) does not exist —
`/fig` and `/fig/claim` use `useFigToken` hooks directly.

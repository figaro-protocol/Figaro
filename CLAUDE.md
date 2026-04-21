# Figaro Protocol — CLAUDE.md

This file is the authoritative reference for AI-assisted work in this repo.
**Do not reference any contract or file not listed here.**

---

## Working With This Codebase

### Before Raising Any Finding

Read `docs/v5/DESIGN_DECISIONS.md` before flagging anything as a vulnerability.
It documents 11 patterns that look like vulnerabilities but are correct by design.
Common false positives: missing lifecycle guards, resolved-process re-entry,
cross-order attestation, buyer==seller, no admin/owner, no stuck-fund recovery.

### The Core Question for Any Proposed Change

> Does the bilateral EIP-712 signature requirement already enforce this?

If yes, adding on-chain state, role checks, or lifecycle flags is a web2 pattern
being imposed on a stateless kernel. Do not propose it.

### What Figaro Is Not

**Figaro is a coordination protocol. Not DeFi. Not TradFi.**

It does not have liquidity pools, yield, lending, trading, or financial instruments.
It does not replicate or digitize traditional financial infrastructure.
It is a primitive for enforcing bilateral agreements — closer to TCP/IP than to a bank or a DEX.

### Common Misframings — Do Not Propose

These each break a specific protocol property:

- **Finalized flag on resolved process** → breaks multi-round composition
- **Timeout or recovery path for locked bonds** → breaks buyer dominance (MAD)
- **Admin, owner, or pause function** → breaks no-escape-hatch invariant
- **Yield on locked bonds / bond-lending pools** → breaks asymmetric bonding
- **Governance DAO for disputes** → reintroduces discretionary power
- **"Kill Uber" / platform-tax framing** → defines Figaro by elimination
- **Green-bond fee discounts** → breaks Nash equilibrium ($2x$ ratio)
- **Soulbound reputation score** → reifies platform credential

Verify 3× before suggesting any change to kernel invariants.
The MAD equilibrium is fragile — any single escape hatch degrades it.

### Documentation Discipline

When a code change makes a doc statement stale, fix the doc in the same session.
Authoritative docs that must stay in sync:

- `CLAUDE.md` — this file
- `.github/copilot-instructions.md` — same inventory, Copilot framing
- `sdk/README.md` — SDK entry points and test count
- `docs/v5/VERIFICATION_MAP.md` — invariant → test → formal layer map

### Test Commands

```bash
# Foundry — must use --via-ir (default profile fails on stack depth)
forge test --via-ir

# Halmos symbolic execution (z3 solver) — installer-checked wrapper
./test-halmos.sh
# Prereqs (one-time): brew install z3 && pipx install halmos

# Echidna property-based fuzzing
./test-echidna.sh
# Prereqs (one-time): brew install echidna

# TLA+ model checking (15 invariants across 2 models: FigaroCore + FigToken)
./test-tla.sh
# Prereqs (one-time): Java 11+ and curl tla2tools.jar into formal/ (see script header)

# Certora formal verification (paid cloud service)
./test-certora.sh
# Prereqs (one-time): pip install certora-cli ; export CERTORAKEY=...

# Frontend
cd frontend && npm run type-check
cd frontend && npx vitest run
cd frontend && npm run test:e2e:mock
```

---

## What Figaro Is

**Figaro is not an app, a firm, or an economic system. It is the TCP/IP of Trade.**

It is a stateless, ownerless protocol that defines the smallest possible unit of a
secure handshake: **The Bonded Commitment**. Two parties who have never met can
transact with mathematical certainty that cooperation is the dominant strategy —
no arbitrator, no timeout, no admin backdoor.

The mechanism: asymmetric bonding. Both parties lock collateral (2× payment each).
Only the buyer can trigger resolution. Cheating costs more than cooperating → Nash
equilibrium where cooperation is dominant.

Every participant is an independent value-adder. What traditional models call a
"restaurant" is a process tree of independent contributors — a cook, a kitchen
operator, an ingredient sourcer — each bonding and settling independently.
Each bonded process is a transaction-scoped institution that dissolves at settlement.

Read `docs/v5/VISION.md` for the full extrapolation.
Read `docs/v5/THEORY.md` for the game-theoretic derivation.

### Framing Discipline

Reason from the core property downward: self-enforcing agreements between strangers.
The six properties (asymmetric bonding, progressive collateralization, buyer dominance,
atomic resolution, immutable evidence, no escape hatches) describe how the mechanism
works. Contracts implement properties; UI renders contracts.

Never frame Figaro as "removing the middleman." Figaro is sovereign P2P commerce
infrastructure. The platform companies are not being replaced; the architecture makes
them structurally unnecessary.

Do not reify role labels into entities. "Restaurant", "merchant", "supplier" are
roles within an institution assembly, not firms.

### Three-Tier Naming

- **Kernel** = `FigaroCore`. The irreducible settlement primitive.
- **Protocol** = kernel + extension doctrine + public graphs.
- **Runtime** = protocol + semantic layer + builder surfaces + UI.

Use the correct tier. "Add yield to locked bonds" → kernel concern.
"Add a new attestation mode" → protocol extension.
"Change how roles display" → runtime concern.

### Dispute Resolution — Three Layers

1. **MAD via asymmetric bonding** — economic self-enforcement
2. **Buyer dominance → coordination pressure** — multi-party processes self-resolve
3. **Timestamped on-chain attestations** — tamper-proof evidence for off-chain forums

---

## Smart Contracts — What Actually Exists (V5)

All contracts in `src/`. Solidity 0.8.26, Foundry. V3 in `archive-v3/`.

No contract belongs to a dapp. Every contract is a permissionless primitive.

### Core Protocol

**`src/FigaroCore.sol`** — The protocol kernel. No owner, no fee, no escape hatches.
- 2 external functions: `commit` (unified dual-signed), `resolveProcess`
- 3 mappings: `processes` (ProcessState), `orderStatus` (uint8), `orderProcessId` (bytes32)
- EIP-712 dual-signed commitments; asymmetric bonding; direct transfer at resolution
- 14 Foundry test suites, 225 tests total; 7 Echidna properties; 11 Halmos symbolic proofs (7 FigaroCore + 4 StagedMerkleAirdrop); 27 Certora CVL rules across 4 specs

**`src/CommitmentTypes.sol`** — EIP-712 typed structs and hash functions.
Single `Commitment` struct for both root and sub-orders; `processId` zero for root.

### Attestation & Schema

**`src/AttestationCoordinator.sol`** — Unified zero-storage attestation.
Three modes: `attestAsSeller`, `attestAsBuyer`, `attestViaResolver`.
Schema-typed via `bytes32 schemaId` + `uint8 stage`. 20 Foundry tests.
6 Certora CVL rules in `certora/AttestationCoordinator.spec`.

**`src/SchemaRegistry.sol`** — Permissionless event-only schema anchoring. 13 tests.

**`src/IRoleResolver.sol`** — Role-authorization interface for mechanism-delegated attestation.

### Mechanism Modules

**`src/DutchAuction.sol`** — Descending-price coordination primitive. No token handling. 38 tests.

**`src/OperatorRegistry.sol`** — On-chain operator self-registration. Reclaimable ETH deposit.
Active/deactivated state. Deposit withdrawal after lock period re-enables registration. 25 tests.

### FIG Token (`src/fig/`)

**`FigToken.sol`** — ERC-20 + EIP-2612 permit. 1B MAX_SUPPLY hard cap on every mint.
Reentrancy-guarded. Minter registry with `totalRegisteredCap` (sum of all registered
caps enforced not to exceed MAX_SUPPLY). Deployer registers capped minters, then renounces.

**`StagedMerkleAirdrop.sol`** — Three-stage merkle-claim airdrop. One contract with
three immutable merkle roots and three immutable unlock timestamps (yr 2 / yr 5 / yr 9).
One-shot per (stage, address). Calls `IFigMinter.mint`.

**`IFigMinter.sol`** — `mint(address, uint256)` interface implemented by FigToken.

**FIG allocation (canonical, 1B total):**
- **100M (10%) founders** — genesis mint, no vesting, no unlock
- **300M (30%) DAO**       — genesis mint, no vesting, no unlock
- **600M (60%) community airdrops** — one `StagedMerkleAirdrop` contract, staged:
  - stage 0 (year 2): 300M (30% of total)
  - stage 1 (year 5): 200M (20% of total)
  - stage 2 (year 9): 100M (10% of total)

Deploy flow: deployer registers itself as a one-shot genesis minter with cap 400M,
mints 100M+300M to founder/DAO wallets, registers the staged airdrop with cap 600M,
renounces. `totalRegisteredCap = 1B` exactly at the end of deploy. No further mints
are possible outside valid merkle claims on the staged airdrop.

No settlement-anchored emission. No batch-path minting. `FigaroBatchVerifier` is
NOT a FIG minter and will never be registered as one.

### Batch Verification

**`src/FigaroBatchVerifier.sol`** — On-chain verifier for SP1-proved batches.
Verifies state root continuity, chain binding, auxiliary data hashes. Executes net token transfers.
3-argument constructor (the legacy `figToken` dead-code field — flagged as INFO-2 in the
AI audit — has been removed).

**`src/interfaces/ISP1Verifier.sol`** — Succinct SP1 verifier gateway interface.
**`src/mocks/MockSP1Verifier.sol`** — Accepts any proof for devnet testing.

### Test / Mock Contracts

- `src/mocks/MockERC20.sol`, `MockERC20FeeOnTransfer.sol`, `MockPermitToken.sol`
- `src/echidna/EchidnaFuzzerV5.sol`, `EchidnaToken.sol`

### What Does NOT Exist

No `FigaroFactory.sol`, `FigaroRouter.sol`, `governance/`, `compliance/`,
`FigEmission.sol`, `FigTimeLock.sol`, `MerkleAirdrop.sol` (replaced by `StagedMerkleAirdrop.sol`),
`TrancheVesting.sol` (removed — founder and DAO receive tokens at genesis with no vesting),
`ProximityTypes.sol` (removed), `IRoleResolverV4.sol` (renamed to `IRoleResolver.sol`),
upgradeable proxy, protocol fee, owner, or admin surface.
FIG is not a governance token.


---

## Agent SDK (`sdk/`)

`@figaro/core` — TypeScript SDK for reading, analyzing, and proposing Figaro transactions.
Single dependency: `viem ^2.0.0`. ESM, three subpath exports.

### `@figaro/core` (root)

- **ABIs**: `CORE_ABI`, `ATTESTATION_COORDINATOR_ABI`, `DUTCH_AUCTION_ABI`,
  `SCHEMA_REGISTRY_ABI`, `ERC20_ABI`, `OPERATOR_REGISTRY_ABI`, `FIG_TOKEN_ABI`,
  `STAGED_MERKLE_AIRDROP_ABI`
- **Events**: 7 typed event parsers + `fetchCoreEvents` bulk fetch
- **State**: `reconstruct()` one-shot, `ProcessGraph` class (incremental)
- **Commitments**: `buildCommitment`, `buildCommitmentSafe`, `buildDomain`
- **Bonds**: `calculateBonds`, `calculateSettlement`, `validateBonds`
- **Airdrop**: `buildMerkleAirdrop(entries)` → `{ root, getProof, getAmount }`;
  `computeAirdropLeaf(address, amount)` — both match `StagedMerkleAirdrop.sol`'s
  leaf format. Build one tree per stage (yr 2 / yr 5 / yr 9) and set the three
  roots at deploy time.

### `@figaro/core/agent`

`FigaroContext`, `proposeActions`, `ActionQueue` (HITL approve/reject/execute),
autonomous tx via WalletClient.

### `@figaro/core/extensions`

Dutch auction price, attestation/GHG encoding, geo/handoff utilities,
DID:web resolution.

### SDK Scripts

```bash
cd sdk && npm test        # 166 Vitest tests
cd sdk && npm run build   # tsc → dist/
cd sdk && npm run lint    # tsc --noEmit
```

---

## Frontend — Structure

Next.js 14 (App Router), TypeScript, Tailwind CSS. `frontend/`. Dev server port 3000.

### Routes (`frontend/app/`)

`/`, `/accounting`, `/admin`, `/builders`, `/builders/assemblies`,
`/builders/authoring`, `/builders/prototype`, `/builders/prototype/[slug]`,
`/builders/templates`, `/console`, `/evidence-display`, `/fig`,
`/figaro-eats`, `/gods-eye`, `/i/[slug]`, `/network-state`, `/sign`,
`/sovereign-commerce`, `/why-figaro`, `/workbench`,
`/api/semantic/agreements`, `/api/semantic/agreements/[agreementHash]`,
`/api/semantic/assemblies`, `/api/semantic/runtime`

### Key Library Areas (`frontend/lib/`)

- **`core/`** — FigaroCore hooks, commitment/agreement utilities (28 files)
- **`dispute/`** — Kleros evidence, delivery attestation 4 modes (6 files)
- **`handoff/`** — ECDH key exchange, per-order encryption (12 files)
- **`mechanisms/`** — Mechanism hooks, package registry (15 files)
- **`semantic/`** — Institution derivation from assembly definitions (7 files)
- **`shared/`** — Wagmi config, runtime identity, institution assembly, IPFS (59 files)
- **`commerce/`**, **`console/`**, **`marketplace/`**

### Components (`frontend/components/`)

- **`core/`** — 45 components: order flows, bond/token, builder/assembly, semantic
- **`modules/`** — 23 composable mechanism components + `registerAllModules.ts`
- **`shared/`** — 12 shell/utility; **`ui/`** — 4 design primitives; **`icons/`** — 13 SVGs

---

## Local Development

### Environment Variables (`.env.local` in `frontend/`)

```
NEXT_PUBLIC_FIGARO_CORE=0x...
NEXT_PUBLIC_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_ATTESTATION_COORDINATOR=0x...
NEXT_PUBLIC_SCHEMA_REGISTRY=0x...
NEXT_PUBLIC_OPERATOR_REGISTRY=0x...
NEXT_PUBLIC_DUTCH_AUCTION=0x...
NEXT_PUBLIC_FIG_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_STAGED_AIRDROP=0x...
NEXT_PUBLIC_BATCH_VERIFIER=0x...
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...
# Optional: Kleros, IPFS, sequencer
```

### Scripts

```bash
./deploy-local.sh                          # Deploy to local Anvil

cd frontend && npm run dev                 # Dev server (port 3000)

forge test --via-ir                        # 15 suites, 227 tests (--via-ir required)

FOUNDRY_PROFILE=halmos halmos \
  --contract HalmosFigaroCore \
  --solver-timeout-assertion 5m --solver z3

cd frontend && npx vitest run             # 84 files, 560+ tests
cd frontend && npx playwright test --project=mock    # 110 tests
cd frontend && npx playwright test --project=devnet  # 40 tests

cd sdk && npm test                        # 166 tests
cd prover && cargo test -p figaro-kernel  # 33 tests
cd prover && cargo test -p figaro-sequencer  # 22 tests
```

### Deployment Scripts

- `script/Deploy.s.sol` — devnet (Anvil), uses mock verifier and mock tokens
- `script/DeployMainnet.s.sol` — mainnet, no mocks; reads all sensitive params from env
- `script/MintTokens.s.sol` — utility: mint test tokens to existing devnet accounts

---

## Testing

### Foundry (`test/`) — 15 files, 227 tests

`FigaroCoreTest`, `FigaroCoreRevertBranchTest`, `FigaroCoreEventEmissionTest`,
`AttestationCoordinatorTest`, `SchemaRegistryTest`, `DutchAuctionTest`,
`OperatorRegistryTest`, `FigaroBatchVerifierTest`, `ParityVectors`,
`fig/FigToken.t.sol`, `fig/StagedMerkleAirdrop.t.sol`,
`BatchGasCeilingTest`, `BatchGasBoundaryTest`, `GasCeilingTest`

### Halmos (`test/`) — 3 harnesses

| Harness | Properties | Key invariants |
|---|---|---|
| `HalmosFigaroCore.t.sol` | 7 | Token conservation, bond amounts, resolution payouts, status transitions, buyer dominance, monotonicity |

### Certora (`certora/`) — 2 specs

| Spec | Rules | Covers |
|---|---|---|
| `FigaroCore.spec` | 8 | Status monotonicity, transitions, active count, buyer dominance, no double-commit, cumulative monotonicity, rootBuyer immutable, currency immutable |
| `AttestationCoordinator.spec` | 6 | Non-buyer reverts, unknown process reverts, buyer identity, process boundary, AC cannot change Core order status, AC cannot change Core process state |

### Echidna — 7 properties

Harness: `src/echidna/EchidnaFuzzerV5.sol`.
`echidna_solvency`, `echidna_active_count_consistent`, `echidna_cumulative_accounting`,
`echidna_state_monotonicity`, `echidna_token_conservation`, `echidna_buyer_dominance`,
`echidna_atomic_resolution`

### TLA+ (`formal/`) — 15 invariants across 2 models (FigaroCore 7 + FigToken 8)

`TokenConservation`, `ContractSolvency`, `WalletNonNegative`, `CumulativeIntegrity`,
`ActiveCountCorrect`, `ResolutionAlwaysPossible`, `TypeOK`.
Also `formal/FigToken.tla` / `formal/FigToken.cfg` — 8 FigToken invariants.

### Frontend Vitest — 84 files, 560+ tests
### Playwright — 38 specs (mock + devnet projects)
### Rust prover — 55 tests (figaro-kernel 33, figaro-sequencer 22)

---

## Design & Audit Docs (`docs/v5/`)

Core theory:
- `VISION.md` — Post-firm economy, Coasean collapse, token denomination
- `THEORY.md` — Game-theoretic derivation of the six protocol properties
- `CURRENT_STATE.md` — Active reading path and archive boundaries

Security & verification:
- `DESIGN_DECISIONS.md` — 11 intentional patterns that look like vulnerabilities **(read before auditing)**
- `SECURITY_AUDIT_AI.md` — AI audit report (2026-04-20): 0 actionable findings, 6 informational
- `AUDIT_REPORT.md` — Combined audit history and findings registry
- `VERIFICATION_MAP.md` — Every invariant → code → test → formal layer
- `RELEASE_READINESS.md` — Gate criteria and current pass status
- `FREEZE_NOTICE.md` — Frozen Solidity surface declaration for external audit
- `SEQUENCER_TRUST_MODEL.md` — Liveness vs safety trust assumptions for the batch sequencer
- `HARDENING_CHECKLIST.md` — Pre-release hardening checklist

Architecture:
- `RUNTIME_THESIS.md`, `FRONTEND_RUNTIME_MODEL.md`, `SEMANTIC_MODEL_LAYER.md`
- `INSTITUTION_ASSEMBLY_SCHEMA.md`, `PROTOCOL_EXTENSION_DOCTRINE.md`
- `SCALING_STRATEGY.md`, `BATCH_SEQUENCER.md`
- `PUBLIC_GRAPH_MODEL.md`, `AI_AGENT_COORDINATION.md`
- `FIG_TOKEN.md`, `XMTP_KEY_EXCHANGE.md`, `GEOHASH_PRECISION.md`
- `GHG_PROTOCOL_SPEC.md`, `ETHICS.md`

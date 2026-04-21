# Figaro Protocol — Copilot Instructions

This file is the authoritative reference for AI-assisted work in this repo.
**Do not reference any contract or file that is not listed here.**

---

dissolves at settlement.

## What Figaro Is

**Figaro is not an app, a firm, or an economic system. It is the TCP/IP of Trade.**

It is a stateless, ownerless protocol that defines the smallest possible unit of a secure handshake: **The Bonded Commitment**. Like the internet protocol, it is a fractal—you can use it to build a corporation, a marketplace, or a global treaty. Figaro doesn't care what you build; it only ensures the math of the handshake is unbreakable.

**A Bonded Commitment is a mathematically enforced agreement—cheating always costs more than cooperating.**

Figaro enables self-enforcing agreements between strangers. Two parties who have never met can transact with mathematical certainty that cooperation is the dominant strategy — no arbitrator, no timeout, no admin backdoor.

The mechanism that produces this property is asymmetric bonding: both parties lock collateral on-chain (2× payment each). Only the buyer can trigger resolution. This makes cheating strictly more expensive than cooperating, creating a Nash equilibrium where cooperation is dominant.

Every participant in a Figaro process is an independent value-adder. There are no firms, no employees, no "platforms that take a cut." What traditional models call a "restaurant" is actually a process tree of independent contributors — a cook, a kitchen operator, an ingredient sourcer — each bonding and settling independently. The protocol decomposes monolithic entities into their constituent value-added relationships.

Each bonded process is therefore a transaction-scoped institution: a temporary assembly of directly bonded contributors that forms around one process and dissolves at settlement.

Read `docs/v5/VISION.md` for the full extrapolation. Read `docs/v5/THEORY.md` for the
game-theoretic derivation.

## What This Repo Is

`Figaro-Prototype2` is the canonical runtime. It owns:
- The core protocol contracts (`FigaroCore`, interfaces, libraries)
- Mechanism-layer contracts (auction, attestation coordination, operator registry)
- Proof-based kernel scaling (`FigaroBatchVerifier`, SP1 verifier interface)
- Generic extensions (GHG disclosure, composability, manifest schemas)
- Rust SP1 prover workspace (`prover/`): kernel library, guest program,
  prove-test script, devnet batch sequencer
- Formal verification specs (TLA+) and fuzzing campaigns (Echidna)
- The runtime frontend: builder surfaces, institution assembly, semantic layer,
  mechanism modules, and marketing pages
- Five reference institution assemblies (eats, equipment-rental, procurement,
  disclosure-review, freelance) built from composable components

### Framing Discipline

When reasoning about Figaro, reason from the core property downward:
self-enforcing agreements between strangers. The six properties in THEORY.md
(asymmetric bonding, progressive collateralization, buyer dominance, atomic
resolution, immutable evidence, no escape hatches) describe how the mechanism
implements this property. Contracts implement properties; UI renders contracts.

The concrete organizational consequence is not a standing firm with internal
departments. It is a transaction-scoped institution assembled around a bonded
process tree.

Never frame Figaro as "removing the middleman" or "replacing platforms."
Figaro is not defined by what it eliminates. It is sovereign P2P commerce
infrastructure — d-commerce from the inside-out. The platform companies are
not being replaced; the architecture makes them structurally unnecessary.

Do not reify labels into entities. "Restaurant", "merchant", "supplier" are
role labels within a specific institution assembly, not firms or legal entities.
Every label decomposes into a process tree of independent value-adders.

### Three-Tier Naming

- **Kernel** = `FigaroCore`. The irreducible settlement primitive.
- **Protocol** = kernel + extension doctrine + public graphs.
- **Runtime** = protocol + semantic layer + builder surfaces + UI.

Use the correct tier. "Add yield to locked bonds" → "that modifies the
kernel's payoff matrix." "Add a new attestation mode" → "that's a protocol
extension." "Change how roles display" → "that's a runtime concern."

### What Figaro Is Not

**Figaro is a coordination protocol. Not DeFi. Not TradFi.**

It does not have liquidity pools, yield, lending, trading, or financial instruments.
It does not replicate or digitize traditional financial infrastructure.
It is a primitive for enforcing bilateral agreements — closer to TCP/IP than to a bank or a DEX.

### Common Misframings

Do not propose or frame Figaro using these patterns — each breaks a
specific protocol property:

- **Yield on locked bonds** → breaks asymmetric bonding (reduces cost of defection)
- **Bond-lending pools** → breaks skin in the game (bond isn't yours)
- **Governance DAO for disputes** → breaks no escape hatches (reintroduces discretionary power)
- **Soulbound reputation score** → breaks token denomination as identity (reifies platform credential)
- **"Kill Uber" / platform-tax framing** → breaks sovereignty framing (defines by elimination)
- **Green-bond fee discounts** → breaks Nash equilibrium (variable in $2x$ ratio)
- **Star ratings** → firm-era signal; token denomination replaces them
- **Finalized flag on resolved process** → breaks multi-round composition
- **Timeout or recovery path for locked bonds** → breaks buyer dominance (MAD)

### Dispute Resolution — Defense-in-Depth (3 Layers)

The protocol's enforcement model is three-layered. Do not flatten this into
"bonding solves everything" — each layer covers a different failure mode:

1. **MAD via asymmetric bonding** — economic self-enforcement. Both parties
   lose more by defecting than by cooperating.
2. **Buyer dominance → coordination pressure** — in multi-party processes,
   all sellers are incentivized to coordinate to satisfy the buyer, and the
   buyer does not want multiple sellers adversarial. Problems resolve among
   the parties before escalation.
3. **Timestamped on-chain attestations** — lifecycle events emitted by
   coordinators are immutable, role-gated, block-timestamped claims. If
   layers 1–2 fail, these events serve as tamper-proof evidence in whatever
   off-chain dispute forum the parties choose (arbitration, court). The
   deterrence loop: because evidence is already on-chain, bringing
   frivolous claims is self-defeating.

See `docs/v5/THEORY.md` for the full game-theoretic derivation.

### Documentation Discipline

When any code change makes a documentation statement stale, fix the doc in
the same session. Do not wait to be asked. The authoritative docs that must
stay in sync with the codebase:

- `CLAUDE.md` — primary AI reference (Claude Code)
- `.github/copilot-instructions.md` — this file (GitHub Copilot)
- `sdk/README.md` — entry points, examples, test count
- `docs/v5/VERIFICATION_MAP.md` — invariant → test → formal layer map

If you add a contract, SDK export, subpath, test file, or mechanism module,
update every doc that lists or counts those items.

---

## Smart Contracts — What Actually Exists (V5)

All contracts are in `src/`. Solidity 0.8.26, compiled with Foundry.
V3 contracts are archived in `archive-v3/`.

### Contract Identity Rule

No contract belongs to a dapp. Every contract is a permissionless primitive
available to any institution assembly. A Dutch auction is a Dutch auction. A
lifecycle coordinator is a lifecycle coordinator.

### Core Protocol

**`src/FigaroCore.sol`** — The protocol kernel. No owner, no fee, no escape hatches.
- 2 external functions: `commit` (unified dual-signed), `resolveProcess`
- 3 mappings: `processes` (ProcessState), `orderStatus` (uint8), `orderProcessId` (bytes32)
- EIP-712 dual-signed commitments (off-chain negotiation, on-chain atomic bond)
- Asymmetric bonding invariants:
  - Buyer bond = 2 × payment
  - Seller bond = 2 × cumulativeValue
- Direct transfer at resolution (no internal ledger, no withdrawal step)
- Content-addressed order IDs (bytes32 hashes, not auto-increment)
- No L1 timeouts, no position NFT, no upgradeable proxy, no owner
- 15 Foundry test files (227 tests), 7 Echidna property invariants (43k calls),
  11 Halmos symbolic proofs (z3), 27 Certora CVL rules across 4 specs

**`src/CommitmentTypes.sol`** — EIP-712 typed structs (`Commitment`)
and hash functions. Single struct used for both root and sub-orders;
`processId` field encodes topology (zero for root, inherited for sub).

### Attestation & Schema

**`src/AttestationCoordinator.sol`** — Unified zero-storage attestation.
Replaces all V3 per-domain contracts (GHG, lifecycle, coordinator).
Three modes: `attestAsSeller`, `attestAsBuyer`, `attestViaResolver`.
Schema-typed via `bytes32 schemaId` + `uint8 stage`. 20 tests.
6 Certora CVL rules in `certora/AttestationCoordinator.spec`.

**`src/SchemaRegistry.sol`** — Permissionless event-only schema anchoring.
13 tests. 6 reference schemas pre-registered at deploy.

**`src/IRoleResolver.sol`** — Role-authorization interface for mechanism-
delegated attestation.

### Mechanism Modules

**`src/DutchAuction.sol`** — Descending-price job allocation. Pure
coordination primitive, no token handling. 38 tests.

**`src/OperatorRegistry.sol`** — On-chain operator registration (role enum,
metadata URI). Event-first, minimal write-gating storage. Reclaimable ETH
registration deposit (immutable amount + immutable lock period) for Sybil
resistance. Active/deactivated state with idempotency guards. Deposit
withdrawal after lock period clears all state, enabling re-registration. 25 tests.

### FIG Token (`src/fig/`)

**`FigToken.sol`** — ERC-20 + EIP-2612 permit. Coordination Schelling point.
1B MAX_SUPPLY hard cap enforced on every mint path. Reentrancy-guarded mint.
Minter registry with `totalRegisteredCap` (sum of all registered minter caps
enforced ≤ MAX_SUPPLY). Deployer registers capped minter contracts, then
renounces (permanent).

**`StagedMerkleAirdrop.sol`** — Three-stage merkle-claim airdrop. One contract
with three immutable merkle roots and three immutable unlock timestamps
(year 2 / year 5 / year 9). Each address can claim at most once per stage.
Calls `IFigMinter.mint`.

**`IFigMinter.sol`** — `mint(address, uint256)` interface implemented by FigToken.

**FIG allocation (canonical, 1B total; defined in `script/DeployMainnet.s.sol`):**
- 100M (10%) founders — genesis mint, no vesting, no unlock
- 300M (30%) DAO      — genesis mint, no vesting, no unlock
- 600M (60%) community airdrops — `StagedMerkleAirdrop`, staged:
  - stage 0 (year 2): 300M (30% of total)
  - stage 1 (year 5): 200M (20% of total)
  - stage 2 (year 9): 100M (10% of total)

No settlement-anchored emission. No batch-path minting. `FigaroBatchVerifier` is
NOT a FIG minter and will never be registered as one.

### Batch Verification

**`src/FigaroBatchVerifier.sol`** — On-chain verifier for SP1-proved
batches of kernel transitions. Accepts validity proofs, verifies state
root continuity and chain binding, hash-verifies auxiliary data (token
positions, attestation events, schema events, operator events), executes
net token transfers. 3-argument constructor: verifier gateway, program
verification key, initial state root. The legacy `figToken` field
(INFO-2 in the AI audit, a remnant of the removed emission model) has
been deleted.

**`src/interfaces/ISP1Verifier.sol`** — Interface matching the Succinct
SP1 verifier gateway ABI.

**`src/mocks/MockSP1Verifier.sol`** — Accepts any proof for devnet/Anvil
testing. Drop-in replacement for the real SP1 gateway.

### Test / Mock Contracts

- `src/mocks/MockERC20.sol`, `MockERC20FeeOnTransfer.sol`, `MockPermitToken.sol`
- `src/echidna/EchidnaFuzzerV5.sol`, `EchidnaToken.sol`

### What Does NOT Exist

There is no `FigaroCoreV3.sol` (archived), `FigaroFactory.sol`,
`FigaroRouter.sol`, `governance/`, `compliance/`, `adapters/`, `examples/`,
`FigEmission.sol` (removed), `FigTimeLock.sol` (removed),
`ProximityTypes.sol` (removed), `IRoleResolverV4.sol` (renamed to `IRoleResolver.sol`),
or any upgradeable proxy. FIG is not a governance token. There is no
protocol fee, no owner, no admin surface. Do not reference these.

---

## Agent SDK (`sdk/`)

`@figaro/core` — standalone TypeScript SDK for reading, analyzing, and proposing
Figaro transactions. Single dependency: `viem ^2.0.0`. ESM package, three subpath exports.

### `@figaro/core` (root)

Event parsing, state reconstruction, EIP-712 commitment building, bond math.

- **ABIs**: `CORE_ABI`, `ATTESTATION_COORDINATOR_ABI`, `DUTCH_AUCTION_ABI`, `SCHEMA_REGISTRY_ABI`, `ERC20_ABI`, `OPERATOR_REGISTRY_ABI`, `FIG_TOKEN_ABI`, `STAGED_MERKLE_AIRDROP_ABI`
- **Events**: 7 typed event parsers + `fetchCoreEvents` bulk fetch
- **State**: `reconstruct()` one-shot, `ProcessGraph` class (incremental, query by process/buyer/seller)
- **Commitments**: `buildCommitment`, `buildCommitmentSafe`, `buildDomain` (safe path auto-fetches cumulativeValue)
- **Bonds**: `calculateBonds`, `calculateSettlement`, `validateBonds`

### `@figaro/core/agent`

Stateful agent coordination: sync → analyze → propose → (approve) → execute.

- **Context**: `FigaroContext` class — wraps ProcessGraph + PublicClient, polling watch
- **Proposer**: `proposeActions(process, myAddress)` → typed `ProposedAction[]`
- **HITL**: `ActionQueue` — enqueue/approve/reject/execute lifecycle with optional approval-context metadata per queued action
- **Autonomous**: Direct tx submission via WalletClient (`commit`, `resolveProcess`, `attestAsSeller`, etc.)

### `@figaro/core/extensions`

Protocol extension utilities for mechanism modules.

- **Dutch auction**: `computeCurrentPrice`, `evaluateClaim`, `fetchAuctionConfig`, `deriveAuctionStates`
- **Attestation & GHG**: `computeSchemaId`, `encodeGramsRef`/`decodeGramsRef`, `buildProcessDisclosureSummary`
- **Geo & handoff**: `geohashesMatch`, `haversineDistance`, Kleros evidence envelope formatting
- **DID (did:web)**: `resolveDidWeb`, `didWebToUrl`, `didDocumentMatchesAddress`, `extractEthereumAddresses`, `buildOperatorDidDocument`

### SDK Scripts

```bash
cd sdk && npm test          # 166 Vitest tests
cd sdk && npm run build     # tsc → dist/
cd sdk && npm run lint      # tsc --noEmit
```

---

## Frontend — Structure

Next.js 14 (App Router), TypeScript, Tailwind CSS.
Located in `frontend/`. Dev server on port 3000.
107 components, 141 lib files, 11 hooks, 24 route entries.

### Routes (`frontend/app/`)

- `/` — Landing page
- `/accounting` — Accounting and reporting surface
- `/admin` — Stubbed (V5 has no owner, no fee — infrastructure is free)
- `/builders` — Developer docs and templates
- `/builders/assemblies` — Browse published institution assemblies
- `/builders/authoring` — Author new institution assemblies
- `/builders/prototype` — Prototype institution from assembly
- `/builders/prototype/[slug]` — Individual prototype workspace
- `/builders/templates` — Template browsing surface
- `/console` — Console HITL surface for queued operating and build actions
- `/evidence-display` — Kleros evidence display interface (iframed by Kleros court)
- `/fig` — FIG token explainer and dashboard
- `/figaro-eats` — Eats archetype marketing/landing
- `/gods-eye` — Network and process observability surface
- `/i/[slug]` — Live institution rendering from assembly slug
- `/network-state` — Protocol theory, FIG as coordination Schelling point
- `/sign` — Signature and agreement tooling surface
- `/sovereign-commerce` — Sovereign commerce thesis
- `/why-figaro` — Philosophy
- `/workbench` — Direct access to FigaroCore: create orders, manage bonds, settle, inspect state
- `/api/semantic/agreements`, `/api/semantic/agreements/[agreementHash]`
- `/api/semantic/assemblies`, `/api/semantic/runtime`

### Components (`frontend/components/`)

**`core/`** — 45 components. Building blocks for order flows and institution rendering:
- Order flows: `OrderControls`, `OrderConfirmationModal`, `OrderGraph`,
  `OrderErrorMessage`, `OrderNodeSemanticCard`
- Bond/token: `BondApprovalPanel`, `PermitControl`, `TokenApprovalFlow`, `TokenBalances`
- Builder/assembly: `BuilderAuthoringStudio`, `BuilderPrototypeIndexShell`,
  `BuilderPrototypeShell`, `InstitutionAssemblyInspector`, `InstitutionShell`,
  `InstitutionWorkspace`, `InstitutionProcessWorkspace`, `InstitutionArtifactWorkspace`,
  `CapabilityRail`, `RoleSwitcher`
- Semantic/analytical: `SemanticProcessWorkspacePanel`, `ProcessSummaryCard`,
  `ProcessTopologyPanel`, `EconomicBreakdownPanel`, `SettlementProceedsPanel`,
  `RiskBoundaryPanel`, `GuaranteeBadge`, `MechanismInspectorCard`
- GHG: `GHGAnchorPanel`, `GHGWorkflowPanel`
- Infrastructure: `ChainGuard`, `ClientInit`, `HandoffCleanupProvider`,
  `DisputeStatusPanel`, `ManifestForm`, `ProcessList`, `ProtocolStats`,
  `RpcBanner`, `SubOrderModal`, `TransactionStatusBanner`

**`modules/`** — 23 composable mechanism components (+ `registerAllModules.ts`):
`AuctionActionModule`, `CapabilityRailModule`, `CartModule`,
`CatalogueEditorModule`, `CoordinatorActionModule`, `DeliveryAttestationPanel`,
`DisclosureModule`, `EventTimelineModule`, `FigTokenModule`,
`HandoffDetailsModule`, `HandoffKeyExchangeModule`,
`HandoffTrackerModule`, `JobMarketModule`, `MechanismInspectorModule`,
`MerchantBrandingModule`, `OperatorRegistrationModule`, `OrderActionModule`,
`OrderNodeModule`, `ProcessCapitalSummaryModule`, `ProcessGraphModule`,
`RoleSwitcherModule`, `SellerDiscoveryModule`, `SettlementBreakdownModule`

**`shared/`** — Shell and utility components (12):
`Header`, `Footer`, `MobileNav`, `NotificationBell`, `CodeBlock`,
`ContentImage`, `ErrorBoundary`, `QRChallengeDisplay`, `QRChallengeScanner`,
`ModuleEmptyStateCard`, `RoutePostureBanner`, `Term`

**`ui/`** — Design primitives (4): `Button`, `Card`, `FormField`, `Input`

**`icons/`** — 13 SVG icon components

### Library (`frontend/lib/`)

**`core/`** (28 files) — FigaroCore contract hooks and agreement/commitment utilities

**`dispute/`** (6 files) — Kleros dispute resolution integration (Layer 3 evidence):
`evidenceTimeline.ts`, `klerosEvidence.ts`, `klerosProxy.ts`, `ipfsPin.ts`,
`deliveryAttestation.ts` (four attestation modes), `index.ts`

**`handoff/`** (12 files) — Per-order encryption key exchange and lifecycle

**`mechanisms/`** (15 files) — Mechanism-layer contract hooks and package registry:
`contracts.ts`, `deliveryCoordinatorEvents.ts`, `useAttestationCoordinatorActions.ts`,
`useDeliveryLifecycle.ts`, `useDidWeb.ts`, `useDriverOffering.ts`, `useDutchAuction.ts`,
`useFigToken.ts`, `useGHGDisclosure.ts`,
`useMerchantBranding.ts`, `useMerchantCatalogue.ts`, `useOperatorRegistry.ts`,
`useRegisteredCatalogues.ts`, `packageDefaults.ts`, `packages.ts`

**`semantic/`** (7 files) — Institution derivation from assembly definitions

**`marketplace/`** (3 files), **`commerce/`** (4 files), **`console/`** (7 files)

**`shared/`** (59 files) — Wagmi config, runtime identity, institution assembly, IPFS,
module system, vocabulary (`vocab.ts`), reference assemblies (`assemblies/*.reference.json`),
runtime fixtures

### Hooks (`frontend/hooks/core/`) — 11 hooks

`useTokenApproval`, `useProcessOrders`, `useBondPreview`,
`useTokenDecimals`, `useWalletProcessIds`, `useArbitrationCost`,
`useDeliveryAttestation`, `useMockTokenMint`, `useMounted`, `useRuntimeIdentitySource`, `useSemanticProcessWorkspace`

---

## Local Development

### Chain

- Anvil at `http://127.0.0.1:8545`, chain ID **31337**
- MetaMask recognizes chain 31337 natively — no SNAP required
- `/rpc` URL in Next.js is proxied to Anvil (configured in `next.config.js`)

### Environment Variables (`.env.local` in `frontend/`)

```
NEXT_PUBLIC_FIGARO_CORE=0x...
NEXT_PUBLIC_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=...

# Mechanism modules
NEXT_PUBLIC_DUTCH_AUCTION=0x...
NEXT_PUBLIC_ATTESTATION_COORDINATOR=0x...
NEXT_PUBLIC_SCHEMA_REGISTRY=0x...
NEXT_PUBLIC_OPERATOR_REGISTRY=0x...

# FIG token + distribution
NEXT_PUBLIC_FIG_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_STAGED_AIRDROP=0x...
NEXT_PUBLIC_BATCH_VERIFIER=0x...

# Kleros dispute resolution (optional)
NEXT_PUBLIC_KLEROS_ARBITRABLE_PROXY=0x...
NEXT_PUBLIC_KLEROS_ARBITRATOR_EXTRA_DATA=0x...

# IPFS (optional)
NEXT_PUBLIC_IPFS_API_URL=http://127.0.0.1:5001
NEXT_PUBLIC_IPFS_GATEWAY_URL=http://127.0.0.1:8080

# Batch sequencer (optional)
NEXT_PUBLIC_SEQUENCER_URL=http://127.0.0.1:3001
```

### Scripts

```bash
# Deploy full stack to local Anvil
./deploy-local.sh

# Start Next.js dev server (port 3000)
cd frontend && npm run dev

# Run Foundry tests (15 test files, 227 tests) — --via-ir required
forge test --via-ir

# Run Halmos symbolic proofs (installer-checked wrapper)
./test-halmos.sh
# Prereqs (one-time): brew install z3 && pipx install halmos

# Echidna property-based fuzzing
./test-echidna.sh
# Prereqs (one-time): brew install echidna

# TLA+ model checking (15 invariants: FigaroCore 7 + FigToken 8)
./test-tla.sh
# Prereqs (one-time): Java 11+ and tla2tools.jar in formal/ (see script header)

# Certora formal verification (paid cloud)
./test-certora.sh
# Prereqs (one-time): pip install certora-cli ; export CERTORAKEY=...

# Run Vitest unit tests (84 test files)
cd frontend && npx vitest run

# Run Playwright mock tests (no chain needed)
cd frontend && npx playwright test --project=mock

# Run Playwright devnet tests (Anvil must be running)
cd frontend && npx playwright test --project=devnet

# Run Rust kernel tests (33 tests)
cd prover && cargo test -p figaro-kernel

# Run Rust sequencer tests (22 tests)
cd prover && cargo test -p figaro-sequencer

# Run SP1 prove-test (mock prover, ~20M cycles)
cd prover && cargo run --release -p figaro-prove-test
```

### Deployment Scripts

- `script/Deploy.s.sol` — devnet (Anvil), uses mock verifier and mock tokens
- `script/DeployMainnet.s.sol` — mainnet, no mocks; all sensitive params from env
- `script/MintTokens.s.sol` — utility: mint test tokens to existing devnet accounts

---

## Testing

### Vitest (`frontend/tests/`)

84 test files covering encoding, hooks, components, semantic derivation,
runtime identity, institution assembly, console queue/build execution,
console order creation flow, order commitment preparation, token approval,
merchant branding, catalogue pipeline, agreement publication and hydration,
delivery attestation (incl. QR challenge), GHG disclosure hook state,
transaction capability execution helpers, workbench mint-hook behavior,
discovery service behavior, coordination messaging service behavior,
handoff key-exchange module behavior, runtime skin execution, route posture chrome,
and more.

### Playwright (`frontend/tests/e2e/`)

38 spec files across two projects:
- `mock` — UI/logic tests, no wallet/chain required
- `devnet` — full on-chain tests against live Anvil

### Foundry (`test/`)

Foundry suite covers FigaroCore, attestation, schema registry, Dutch auction,
operator registry, batch verifier, parity vectors, FIG token, StagedMerkleAirdrop,
gas ceiling, and audit regressions. Run with `forge test --via-ir`.

### Rust (`prover/`)

55 tests across 2 crates:
- `figaro-kernel` (33 tests): EIP-712 parity with Solidity, batch execution,
  state transitions, ECDSA recovery, schema/operator/attestation operations,
  genesis root verification
- `figaro-sequencer` (22 tests): mempool pre-checks, state mirror, assembler,
  HTTP API, end-to-end batch chaining

### Echidna

Fuzzing config in `echidna-v5.yaml`. Corpus in `corpus/` and `echidna/corpus/`.
Core fuzzer: `src/echidna/EchidnaFuzzerV5.sol`.

### Halmos (symbolic testing)

**`test/HalmosFigaroCore.t.sol`** (7 properties, z3):
`check_tokenConservation_afterCommit`, `check_contractSolvency_afterCommit`,
`check_correctBondAmounts`, `check_resolutionPayouts`,
`check_orderStatusTransition`, `check_buyerDominance_revert`,
`check_cumulativeValueMonotonic`

The earlier `HalmosTrancheVesting.t.sol` and `HalmosMerkleAirdrop.t.sol` harnesses
were removed along with their target contracts. A new Halmos harness for
`StagedMerkleAirdrop` is a follow-up item.

### Certora (formal verification)

**`certora/FigaroCore.spec`** (8 rules):
`orderStatusNeverDecreases`, `orderStatusTransitionsAreValid`,
`commitIncreasesActiveCount`, `onlyBuyerCanResolve`, `noDoubleCommit`,
`cumulativeValueMonotonic`, `rootBuyerImmutable`, `currencyImmutable`

**`certora/AttestationCoordinator.spec`** (6 rules):
`nonBuyerCannotAttestAsBuyer`, `unknownProcessRevertsAsBuyer`,
`successfulBuyerAttestationImpliesBuyer`, `buyerAttestationEnforcesProcessBoundary`,
`attestationCannotChangeOrderStatus`, `attestationCannotChangeProcessState`

### Formal Verification (TLA+)

TLA+ model of FigaroCore in `formal/`. Verified with TLC model checker.
Also `formal/FigToken.tla` / `formal/FigToken.cfg` — 8 FigToken invariants.

**FigaroCore invariants verified (7/7, 6M+ states, exit code 0):**
`TokenConservation`, `ContractSolvency`, `WalletNonNegative`, `CumulativeIntegrity`,
`ActiveCountCorrect`, `ResolutionAlwaysPossible`, `TypeOK`

---

## Design Docs

Core theory:
- `docs/v5/VISION.md` — Full extrapolation: post-firm economy, Coasean collapse, token denomination
- `docs/v5/THEORY.md` — Game-theoretic derivation of the six protocol properties
- `docs/v5/CURRENT_STATE.md` — Current reading path, active docs, archive boundaries
- `docs/v5/ETHICS.md` — Ethical analysis, 200-year extrapolation, decision to release

Security & verification:
- `docs/v5/DESIGN_DECISIONS.md` — 11 intentional patterns that look like vulnerabilities
- `docs/v5/SECURITY_AUDIT_AI.md` — AI audit report (2026-04-20): 0 actionable findings
- `docs/v5/AUDIT_REPORT.md` — Combined audit history and findings registry
- `docs/v5/VERIFICATION_MAP.md` — Theory → Code → Tests → TLA+ → UI triangulation map
- `docs/v5/RELEASE_READINESS.md` — Gate criteria and current pass status
- `docs/v5/FREEZE_NOTICE.md` — Frozen Solidity surface declaration for external audit
- `docs/v5/SEQUENCER_TRUST_MODEL.md` — Sequencer liveness vs safety trust model
- `docs/v5/HARDENING_CHECKLIST.md` — Pre-release hardening checklist

Architecture:
- `docs/v5/RUNTIME_THESIS.md` — Why this repo is a runtime, not just contracts
- `docs/v5/FRONTEND_RUNTIME_MODEL.md` — Canonical frontend/runtime composition model
- `docs/v5/PROTOCOL_EXTENSION_DOCTRINE.md` — How extensions layer on top of settlement
- `docs/v5/SEMANTIC_MODEL_LAYER.md` — Semantic derivation from assembly definitions
- `docs/v5/INSTITUTION_ASSEMBLY_SCHEMA.md` — Assembly JSON schema and validation
- `docs/v5/FIG_TOKEN.md` — FIG token design: allocation, emission mechanism
- `docs/v5/PUBLIC_GRAPH_MODEL.md` — The five semantic graphs
- `docs/v5/AI_AGENT_COORDINATION.md` — How autonomous agents coordinate via public graph data
- `docs/v5/GEOHASH_PRECISION.md` — 6-char default precision rationale
- `docs/v5/XMTP_KEY_EXCHANGE.md` — Per-order ephemeral key architecture
- `docs/v5/GHG_PROTOCOL_SPEC.md` — GHG workflow semantics
- `docs/v5/SCALING_STRATEGY.md` — Kernel scaling architecture: SP1, sequencer
- `docs/v5/BATCH_SEQUENCER.md` — Batch sequencer architecture and implementation status

## Figaro Eats — First Archetype (Consolidated)

Figaro Eats was the first institution archetype. It has been consolidated into
this repo as composable components and templates. The separate Figaro-eats repo
has been retired and archived.

The eats assembly is one of five reference assemblies that demonstrate how the
runtime renders different institution types from the same shared components and
mechanism modules.

Do not reference, update, or create files in the retired Figaro-eats repo.

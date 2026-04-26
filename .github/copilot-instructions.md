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

## Why the Name

**Figaro** is the factotum of the city. In Rossini's *Il Barbiere di Siviglia* (1816, libretto by Sterbini, drawn from Beaumarchais's *Le Barbier de Séville*, 1775), the character declares himself the city's factotum in the famous "Largo al factotum" aria — running errands, brokering favors, mediating between parties of incommensurable standing, making commerce of the whole household work without owning any of it. The kernel is named for what it does: the factotum of the network, the coordinator of everything without being the owner of anything. FigaroCore holds collateral, executes commitments, and discharges resolution — exactly the coordination function the character performs, at protocol scale. The naming dates to Figaro-Original (Genovese & Daliana, March 2022); see `docs/v5/PROJECT_HISTORY.md` for the lineage. The metaphor is the thesis, not decoration.

**FIG** is a speech-act identifier, the way ETH, BTC, USDC, and USD are. It is not a consumer brand name that has to semantically signal infrastructure; it is the name by which the token gets invoked in transactions and conversations. "Send me 10 FIG" works in speech the way "send me 10 ETH" does. Evaluate FIG by whether it fits the speech register, not by Fortune-500 brand logic.

When writing naming discussion, proposing renames, or writing user-facing copy, apply these framings. Do not apply Web2 consumer-brand evaluation to Web3 protocol names or token tickers. Do not introduce alternative metaphors for the protocol's name (no "the Uber-killer", no "like Stripe but decentralized", no "Web3 e-commerce rails"). The factotum-of-the-network framing is canonical.

## What This Repo Is

`Figaro-Prototype2` is the canonical runtime. It owns:
- The core protocol contracts (`FigaroCore`, interfaces, libraries)
- Mechanism-layer contracts (auction, attestation coordination, operator registry)
- Proof-based kernel scaling (`FigaroBatchVerifier`, SP1 verifier interface)
- Generic extensions (GHG disclosure, composability, manifest schemas)
- Rust SP1 prover workspace (`prover/`): kernel library, guest program,
  prove-test script, devnet batch sequencer
- Formal verification specs (TLA+) and fuzzing campaigns (Echidna)
- The runtime frontend: builder surfaces, assembly, semantic layer,
  mechanism modules, and marketing pages
- Five reference assemblies (eats, equipment-rental, procurement,
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
role labels within a specific assembly, not firms or legal entities.
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
- **Multi-currency bonding within one process** → breaks same-unit comparability of bonds (the 2:1 ratio is Nash-stable only with one currency per process; multi-currency forces an oracle/DEX/pre-agreed FX rate, each reintroducing a trusted/discretionary actor). Multi-token vendor UX is a composition pattern: N independent monotoken processes, or wallet-side swap before commit.

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
available to any assembly. A Dutch auction is a Dutch auction. A
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
- Covered by Foundry unit tests, 7 Echidna property invariants (43k calls),
  11 Halmos symbolic proofs (z3), and 6 Certora specs (all green; AC re-verified 2026-04-23 for the agreement-receipt ABI change)

**`src/CommitmentTypes.sol`** — EIP-712 typed structs (`Commitment`)
and hash functions. Single struct used for both root and sub-orders;
`processId` field encodes topology (zero for root, inherited for sub).

### Attestation & Schema

**`src/AttestationCoordinator.sol`** — Unified zero-storage attestation,
validator-gated, receipt-bound. Three modes: `attestAsSeller(role, target, …)`,
`attestAsBuyer(target, …)`, `attestViaResolver(target, …)`. Each path takes
full Commitment structs so the coordinator recovers `agreementHash` without
new kernel state. Every call carries `bytes sectionData` + `bytes32[] proof`;
the coordinator verifies a merkle inclusion proof of
`keccak256(schemaId || keccak256(sectionData))` against `target.agreementHash`
via OZ `MerkleProof.verify` before invoking the registered validator. Without
the proof opening to a committed clause, the call reverts
`InvalidInclusionProof` — runtime declarations cannot deviate from the signed
contract. 7 Certora CVL rules (8/8 sub-rules green, cloud-verified 2026-04-23).
Binding-integrity and `contentRef == keccak256(content)` are covered by
Foundry tests.

**`src/SchemaRegistry.sol`** — Permissionless event-only schema anchoring.
Reference schemas pre-registered at deploy. `schemaId = keccak256(humanReadableName)`,
`uriHash` points at off-chain JSON spec.

**`src/ISchemaValidator.sol`** — Per-schema content validator interface.
`validate(bytes32 schemaId, uint8 stage, bytes calldata content) view` reverts
on invalid content; binds to one schemaId via `schemaId() view returns (bytes32)`.

**`src/schemaValidators/`** — 16 production validator contracts for the
*runtime-attestable* figaro-eats schemas + jurisdiction baseline (handoff,
commerce, geo, fulfilment, the 5 GHG sister schemas — protocol, iso-14064,
pas-2050, en-16258, custom — ghg-measurement, lifecycle, the proximity
policy/proof sister schemas, merchant-process, courier-process,
jurisdiction). Each ABI-decodes content (no on-chain JSON parser) and
reverts with typed custom errors. Topology is a manifest-only clause —
registered in SchemaRegistry for vocabulary anchoring but has no on-chain
validator.

**`src/IRoleResolver.sol`** — Role-authorization interface for mechanism-
delegated attestation.

### Mechanism Modules

**`src/DutchAuction.sol`** — Descending-price job allocation. Pure
coordination primitive, no token handling.

**`src/OperatorRegistry.sol`** — Permissionless operator self-registration.
Two external functions: `register(role, metadataURI)` + `withdraw()`. Two
events: `OperatorRegistered`, `OperatorWithdrawn`. State is dedup-only
(`_registered: address → bool`) plus the registration timestamp that backs
the immutable deposit-lock period. No `_active` flag, no `updateProfile`,
no `deactivate` / `reactivate` (web2-strip 2026-04-26): operator
availability is signal-by-availability off-chain. Role + metadata travel
only in the `OperatorRegistered` event; switching role or metadata happens
via withdraw + re-register (clears the dedup guard, restarts the lock).
The kernel does not gate any operation on operator state — this registry
is advisory metadata for off-chain discovery surfaces.

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
generic `JSONSchemaValidator.sol` (per-schema validators instead — see "Schema
validation architecture" below), or any upgradeable proxy. FIG is not a
governance token. `FigTokenModule` (UI) does not exist — `/fig` and `/fig/claim`
use `useFigToken` hooks directly. There is no protocol fee, no owner, no admin
surface. Do not reference these.

---

## Schema Validation Architecture

Figaro enforces schema-content correctness in three layers — Layer A (client TS),
Layer B (SP1 prover, pending), Layer C (on-chain Solidity). All three parse the
same canonical JSON spec format (closed subset of JSON Schema) and apply the
same rules. **A new schema is not "done" until all three layers ship in lockstep.**

- **Layer A** (TypeScript): `@figaro/core/schemas` subpath. `parseSchemaSpec`,
  `validateContent`, plus per-schema `encode<Schema>Content` helpers that produce
  the ABI bytes the on-chain validator expects.
- **Layer B** (SP1 prover, pending): Rust mirror of the TS validator. Not yet
  implemented; the TS test suite is the conformance spec.
- **Layer C** (Solidity): per-schema `ISchemaValidator` contracts in
  `src/schemaValidators/`. Registered via `AttestationCoordinator.setValidator`
  (permissionless, first-write-wins, immutable after first set). Every `attest*`
  call is gated through the registered validator. **Third-party schemas must
  perform `registerSchema` + `setValidator` atomically in a single transaction**
  to prevent malicious-validator front-running — see DESIGN_DECISIONS.md #13.
  Use `SchemaRegistrationHelper.registerSchemaAndValidator(...)` (stateless
  no-admin helper deployed alongside the protocol) for the recommended path.
  The 14 reference figaro-* schemas are atomically bound by
  `script/Deploy.s.sol:_deployAndRegisterValidators`; the same atomicity
  applies to any post-deploy schema via the helper.
  **Validator `validate` MUST be `external pure override`** — no external
  state reads, no `block.*`/`tx.*`, no external calls. Use
  `bytes32 public constant override schemaId = keccak256("...")` so the
  schemaId is a compile-time literal (not constructor-set immutable, which
  forces `view` and forfeits EVM-enforced determinism). See ISchemaValidator
  NatSpec for the rationale.

The 17 figaro-eats schemas: `figaro-topology-v1` (manifest-only — no
runtime validator), plus 16 runtime-attestable schemas with Layer A + C
coverage: `figaro-handoff-v1`, `figaro-commerce-v1`, `figaro-geo-v1`,
`figaro-fulfilment-v1`, plus the GHG sister schemas `figaro-ghg-protocol-v1`,
`figaro-ghg-iso-14064-v1`, `figaro-ghg-pas-2050-v1`, `figaro-ghg-en-16258-v1`,
`figaro-ghg-custom-v1` (all Category-2 — one per accounting standard),
`figaro-ghg-measurement-v1` (Category-1 runtime grams),
`figaro-delivery-lifecycle-v1`, the proximity sister schemas
`figaro-proximity-policy-v1` (Category-2 committed band) +
`figaro-proximity-proof-v1` (Category-1 runtime witness),
`figaro-merchant-process-v1`, `figaro-courier-process-v1`,
`figaro-jurisdiction-v1`.
Each runtime schema ships: JSON spec in `sdk/src/schemas/examples/` + mirror
in `frontend2/lib/shared/schemas/`, TS encoder in `sdk/src/schemas/encode.ts`,
Solidity validator + Foundry tests. Topology ships only the JSON spec — it
lives inside the signed agreement manifest at commit time.

User-facing copy lives at `/builders` "Schema validators in force" and
`/help` "Schema validation". Both must be updated when adding a new schema.

---

## Agent SDK (`sdk/`)

`@figaro/core` — standalone TypeScript SDK for reading, analyzing, and proposing
Figaro transactions. Single dependency: `viem ^2.0.0`. ESM package, four subpath exports.

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

### `@figaro/core/schemas`

Schema-spec format + content validator + per-schema content encoders. Single
source of truth that all three validation layers (client TS, SP1 prover,
on-chain Solidity) parse identically.

- `parseSchemaSpec(json)` — meta-schema validator (closed subset of JSON Schema)
- `validateContent(content, spec, options?)` — validates against parsed spec; rejects unknown fields
- `encode<Schema>Content(...)` — per-schema content encoders (handoff,
  commerce, geo, fulfilment, GHG scope + measurement, lifecycle, proximity
  policy + proof, merchant-process, courier-process, jurisdiction). Each
  one returns the ABI bytes the on-chain validator expects. Topology has
  no encoder — it's a manifest-only clause with no runtime attestation.

### SDK Scripts

```bash
cd sdk && npm test
cd sdk && npm run build     # tsc → dist/
cd sdk && npm run lint      # tsc --noEmit
```

---

## Frontend — Structure

Next.js 14 (App Router), TypeScript, Tailwind CSS. **`frontend2/` is the only
active frontend.** The prior `frontend/` directory was archived to
`archive-frontend/` on 2026-04-26 — do not edit it. Frontend changes ship in
`frontend2/` only.

### Routes (`frontend2/app/`)

- `/` — Landing page
- `/admin` — Stubbed (V5 has no owner, no fee — infrastructure is free)
- `/builders` — Builder landing
- `/builders/assemblies` — Browse published assemblies
- `/builders/authoring` — Author new assemblies
- `/builders/prototype` + `/builders/prototype/[slug]` — Prototype a live instance from an assembly
- `/builders/designer` — Three-column Designer tool: palette + canvas + inspector + publish drawer. See "Designer tool surface" below.
- `/console` — Console HITL surface for queued operating and build actions
- `/evidence-display` — Kleros evidence display interface (iframed by Kleros court)
- `/fig` + `/fig/claim` — FIG token explainer, dashboard, and merkle-claim surface
- `/figaro-eats` — Eats archetype marketing/landing
- `/help` — FAQ and guides
- `/i/[slug]` — Live assembly rendering from slug. Authored declaratively against `components/modules/` registry via `useAssemblyRuntime`.
- `/onboarding` — New-user onboarding
- `/operators` + `/operators/catalogue` — Operator self-registration and catalogue authoring
- `/sign` — Signature and agreement tooling surface
- `/terminal` — Direct kernel-level interaction: raw orders, processes, protocol stats, graph. (Replaces `/workbench`; `/workbench` issues a 308 permanent redirect via `next.config.mjs`.)
- `/api/semantic/agreements`, `/api/semantic/agreements/[agreementHash]`
- `/api/semantic/assemblies`, `/api/semantic/runtime`

### Components (`frontend2/components/`)

**`core/`** — Building blocks for order flows and assembly rendering:
- Order flows: `OrderControls`, `OrderConfirmationModal`, `OrderGraph`,
  `OrderErrorMessage`, `OrderNodeSemanticCard`
- Bond/token: `BondApprovalPanel`, `PermitControl`, `TokenApprovalFlow`, `TokenBalances`
- Builder/assembly: `BuilderAuthoringStudio`, `BuilderPrototypeIndexShell`,
  `BuilderPrototypeShell`, `AssemblyInspector`, `AssemblyShell`,
  `AssemblyWorkspace`, `AssemblyProcessWorkspace`, `RegisteredAssemblyWorkspace`,
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

**`icons/`** — SVG icon components

### Library (`frontend2/lib/`)

**`core/`** — FigaroCore contract hooks and agreement/commitment utilities

**`dispute/`** — Kleros dispute resolution integration (Layer 3 evidence):
`evidenceTimeline.ts`, `klerosEvidence.ts`, `klerosProxy.ts`, `ipfsPin.ts`,
`deliveryAttestation.ts` (four attestation modes), `index.ts`

**`handoff/`** — Per-order encryption key exchange and lifecycle

**`mechanisms/`** — Mechanism-layer contract hooks and package registry:
`contracts.ts`, `deliveryCoordinatorEvents.ts`, `useAttestationCoordinatorActions.ts`,
`useDeliveryLifecycle.ts`, `useDidWeb.ts`, `useDriverOffering.ts`, `useDutchAuction.ts`,
`useFigToken.ts`, `useGHGDisclosure.ts`,
`useMerchantBranding.ts`, `useMerchantCatalogue.ts`, `useOperatorRegistry.ts`,
`useRegisteredCatalogues.ts`, `packageDefaults.ts`, `packages.ts`

**`semantic/`** — Assembly derivation and capability models. Key entries: `deriveAssemblyModel.ts` (pure projection of a manifest into `AssemblyModel`), `deriveAssemblyCapabilities.ts` (runtime-aware capabilities), `models.ts` (`AssemblyModel`, `MechanismModel`, `ProcessModel`, `RoleContext`)

**`marketplace/`**, **`commerce/`**, **`console/`**

**`shared/`** — Wagmi config, runtime identity, assembly schema/parser/registry/validation, IPFS, module system, vocabulary (`vocab.ts`), reference assemblies (`assemblies/*.reference.json`), runtime fixtures. Key entries: `assembly.ts` (schema types `Assembly`, `MechanismAssembly`, `RoleAssembly`, `ModuleBinding`), `assemblyParser.ts` (`parseAssemblyDocument`), `assemblyRegistry.ts` (`getAssemblyBySlug`, `getRegisteredAssemblyBySlug`, `listAssemblies`, `listRegisteredAssemblies`), `assemblyValidation.ts`, `assemblyPublication.ts`, `runtimeResolution.ts` (`resolveAssemblyRuntimeContext`), `moduleRegistry.ts` (`ModuleRenderContext`, `getModule`, `registerModule`), `blockMetadata.ts` (designer block registry: `BlockMetadata`, `registerBlock`, `listBlockMetadata`, `listBlocksByCategory`, `getBlockForModule`), `designerOps.ts` (pure draft-mutation helpers: `addBlockToSlot`, `removeBindingFromSlot`, `updateBinding`)

### Designer tool surface (`frontend2/components/core/designer/`)

The `/builders/designer` route mounts a three-column editor:

- `DesignerPalette.tsx` — left rail. Renders blocks grouped by category with per-block Layer A schema-availability signal (✓ / ⚠).
- `DesignerCanvas.tsx` — middle. Identity / roles / mechanisms / views×slots×bindings. Read-only by default; becomes interactive when `onSelectSlot` / `onSelectBinding` / `onRemoveBinding` callbacks are passed.
- `DesignerInspector.tsx` — right rail. Edits the selected binding's `componentKind` / `semanticInput` / `priority`; surfaces the owning block.
- `DesignerPublishDrawer.tsx` — overlay. Runs `validateDraftPublicationReadiness` (collision checks suppressed for the demo), shows readiness badge + issue list + serialized assembly JSON with clipboard copy.

All four components are state-free; the host page (`app/builders/designer/page.tsx`) holds draft-by-slug state and routes selection across them. Pure draft mutations live in `lib/shared/designerOps.ts` (return same `Assembly` reference on no-op for cheap re-renders).

### Hooks (`frontend2/hooks/core/`)

`useTokenApproval`, `useProcessOrders`, `useBondPreview`,
`useTokenDecimals`, `useWalletProcessIds`, `useArbitrationCost`,
`useDeliveryAttestation`, `useMockTokenMint`, `useMounted`, `useRuntimeIdentitySource`, `useSemanticProcessWorkspace`

---

## Local Development

### Chain

- Anvil at `http://127.0.0.1:8545`, chain ID **31337**
- MetaMask recognizes chain 31337 natively — no SNAP required
- `/rpc` URL in Next.js is proxied to Anvil (configured in `next.config.js`)

### Environment Variables (`.env.local` in `frontend2/`)

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
cd frontend2 && npm run dev

# Run Foundry tests — --via-ir required
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

# Run Vitest unit tests
cd frontend2 && npx vitest run

# Run Playwright mock tests (no chain needed)
cd frontend2 && npx playwright test --project=mock

# Run Playwright devnet tests (Anvil must be running)
cd frontend2 && npx playwright test --project=devnet

# Run Rust kernel tests
cd prover && cargo test -p figaro-kernel

# Run Rust sequencer tests
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

### Vitest (`frontend2/tests/`)

Unit tests covering encoding, hooks, components, semantic derivation,
runtime identity, assembly, console queue/build execution,
console order creation flow, order commitment preparation, token approval,
merchant branding, catalogue pipeline, agreement publication and hydration,
delivery attestation (incl. QR challenge), GHG disclosure hook state,
transaction capability execution helpers, terminal mint-hook behavior,
discovery service behavior, coordination messaging service behavior,
handoff key-exchange module behavior, runtime skin execution, route posture chrome,
and more.

### Playwright (`frontend2/tests/e2e/`)

Three projects:
- `mock` — UI/logic tests, no wallet/chain required
- `mock-mobile` — responsive-layout tests (Pixel 5 via Chromium)
- `devnet` — full on-chain tests against live Anvil

### Foundry (`test/`)

Foundry suite covers FigaroCore, attestation, schema registry, Dutch auction,
operator registry, batch verifier, parity vectors, FIG token, StagedMerkleAirdrop,
gas ceiling, and audit regressions. Run with `forge test --via-ir`.

### Rust (`prover/`)

Two crates:
- `figaro-kernel`: EIP-712 parity with Solidity, batch execution,
  state transitions, ECDSA recovery, schema/operator/attestation operations,
  genesis root verification
- `figaro-sequencer`: mempool pre-checks, state mirror, assembler,
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

**`certora/AttestationCoordinator.spec`** (7 rules):
`nonBuyerCannotAttestAsBuyer`, `successfulBuyerAttestationImpliesBuyer`,
`attestationCannotChangeOrderStatus`, `attestationCannotChangeProcessState`,
`noValidatorBlocksBuyerAttestation`, `setValidatorIsFirstWriteWins`,
`setValidatorPreservesOtherBindings`. Re-authored 2026-04-23 for the new
commitment-arg ABI; old `unknownProcessRevertsAsBuyer` and
`buyerAttestationEnforcesProcessBoundary` rules subsumed because the target
commitment now carries its own processId + orderHash.

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

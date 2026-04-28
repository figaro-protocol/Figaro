# Figaro Protocol — CLAUDE.md

This file is the authoritative reference for AI-assisted work in this repo.
**Do not reference any contract or file not listed here.**

---

## Working With This Codebase

### Before Raising Any Finding

Read `docs/v5/DESIGN_DECISIONS.md` before flagging anything as a vulnerability.
It documents 14 patterns that look like vulnerabilities but are correct by design.
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
- **Multi-currency bonding within one process** → breaks the same-unit comparability that makes the 2:1 bond ratio Nash-stable from chain state alone (would need an oracle, DEX, or pre-agreed FX rate — each reintroduces a trusted/discretionary actor). Multi-token vendor UX is achievable through composition: N independent monotoken processes, or a wallet-side swap before commit. See `project_backlog_2026-04-22.md`.

Verify 3× before suggesting any change to kernel invariants.
The MAD equilibrium is fragile — any single escape hatch degrades it.

### Documentation Discipline

When a code change makes a doc statement stale, fix the doc in the same session.
Authoritative docs that must stay in sync:

- `CLAUDE.md` — this file
- `.github/copilot-instructions.md` — same inventory, Copilot framing
- `sdk/README.md` — SDK entry points
- `docs/v5/VERIFICATION_MAP.md` — invariant → test → formal layer map
- `app/builders/page.tsx` ("Schema validators in force") + `app/help/page.tsx` ("Schema validation") — user-facing list of validator contracts. Update when a new schema lands.

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
# Prelude: runs ./lint-token-ops.sh to gate on certora/token-ops.inventory
# being in sync with every ERC20 transfer call site in src/ — new transfer
# calls without a matching inventory entry fail before any cloud dispatch.

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

The kernel runs **two mechanisms** doing distinct work — they compose, they
don't substitute. Match Paper A §2 line 300–311 directly.

**Mechanism 1 — Asymmetric bonding** (buyer locks 2× payment, seller locks
2× cumulative value): produces the bilateral Nash equilibrium (cooperation
weakly dominates defection for both parties; unique profile surviving iterated
elimination of weakly dominated strategies; Paper A Theorem 4.3) AND scales
the bilateral primitive from 2-party to N-party trees via **progressive
collateralization** (each seller bonds against cumulative upstream value,
creating a mesh of independently secured edges, each edge carrying its own
equilibrium at every depth; Theorem 5.3). 2× is the minimum viable multiplier
(Theorem 4.6).

**Mechanism 2 — Buyer dominance** (only the buyer can trigger `resolveProcess`,
and resolution is **atomic** — all orders in the process settle together or
not at all): operates on the already-scaled mesh to enforce inter-seller
coordination, cooperation, and communication. The atomic-resolution rule is
buyer dominance's forcing function: it induces a weakest-link subgame among
sellers (Proposition 5.8) — endogenous peer pressure of magnitude Pᵢ + 2Gᵢ
on every co-seller, without explicit communication or governance. This
reproduces Grameen joint-liability microfinance's peer-enforcement outcome
under strictly weaker assumptions (no repeated interaction, no local
information, no exogenous punishment technology; Theorem 6.1).

The mechanisms are inseparable in practice. Bonding alone gives a mesh of
independently bonded edges — multi-party coordination would still require N
mutual agreements at resolution. Buyer-dominance alone gives a single party
who can resolve whatever they want — without bonding it's worthless. Together:
the bonding ratio creates the mesh; buyer dominance + atomic resolution make
the mesh resolvable from a single signature AND propagate cooperation pressure
through it.

Plus one security constraint:
- **No escape hatches** — any unilateral exit path weakens the Nash
  equilibrium (Theorem 4.7). Either α≥½ breaks weak dominance directly
  (timeout case), or the exit requires a third party J ∉ {B, S} whose
  incentives aren't bond-constrained (arbitrator / governance vote — unbonded
  actor). External legal forums adjudicating under duress / frustration /
  impossibility are NOT this kind of escape hatch (Remark 4.8): they're
  constrained by their own institutional bond structures and operate on the
  bonded commitment as evidentiary input.

Immutable evidence is produced by the on-chain composition layer, not the kernel.

**Common mistakes to avoid:**
1. Do not collapse the two mechanisms to "one mechanism plus rules." Buyer
   dominance with atomic resolution does mechanism-style work — it enforces
   inter-seller coordination via the weakest-link subgame, not just
   convenience-of-resolution. (Earlier framings called buyer dominance "just
   a rule that operates on the already-scaled mesh"; that under-states what
   it does.)
2. Do not say buyer dominance + atomic resolution "scale the mechanism from
   two parties to N." Scaling is asymmetric bonding's work via progressive
   collateralization. Buyer dominance enforces coordination on the
   already-scaled mesh.
3. Do not treat the no-escape-hatches property as a third mechanism. It's a
   security constraint protecting the equilibrium induced by the two
   mechanisms.

Every participant is an independent value-adder. What traditional models call a
"restaurant" is a process tree of independent contributors — a cook, a kitchen
operator, an ingredient sourcer — each bonding and settling independently.
Each bonded process is a transaction-scoped institution that dissolves at settlement.

Read `docs/v5/VISION.md` for the full extrapolation.
Read `docs/v5/THEORY.md` for the game-theoretic derivation.

### Why the Name

**Figaro** is the factotum of the city. In Rossini's *Il Barbiere di
Siviglia* (1816, libretto by Sterbini, drawn from Beaumarchais's *Le
Barbier de Séville*, 1775), the character declares himself the city's
factotum in the famous "Largo al factotum" aria — running errands,
brokering favors, mediating between parties of incommensurable standing,
making commerce of the whole household work without owning any of it. The
kernel is named for what it does: the factotum of the network, the
coordinator of everything without being the owner of anything. FigaroCore
holds collateral, executes commitments, and discharges resolution —
exactly the coordination function the character performs, at protocol
scale. The naming dates to Figaro-Original (Genovese & Daliana, March
2022); see `docs/v5/PROJECT_HISTORY.md` for the lineage. The metaphor
is the thesis, not decoration.

**FIG** is a speech-act identifier, the way ETH, BTC, USDC, and USD are. It
is not a consumer brand name that has to semantically signal infrastructure;
it is the name by which the token gets invoked in transactions and
conversations. "Send me 10 FIG" works in speech the way "send me 10 ETH"
does. Evaluate FIG by whether it fits the speech register, not by
Fortune-500 brand logic.

When an agent surfaces naming questions, proposes renames, or writes
user-facing copy about the protocol, apply these framings. Do not apply Web2
consumer-brand evaluation to Web3 protocol names or token tickers. Do not
introduce alternative metaphors for the protocol's name (no "the Uber-killer",
no "like Stripe but decentralized", no "Web3 e-commerce rails"). The
factotum-of-the-network framing is canonical.

### Framing Discipline

Reason from the core property downward: self-enforcing agreements between strangers.
The six properties (asymmetric bonding, progressive collateralization, buyer dominance,
atomic resolution, immutable evidence, no escape hatches) describe how the mechanism
works. Contracts implement properties; UI renders contracts.

Never frame Figaro as "removing the middleman." Figaro is sovereign P2P commerce
infrastructure. The platform companies are not being replaced; the architecture makes
them structurally unnecessary.

Do not reify role labels into entities. "Restaurant", "merchant", "supplier" are
roles within an assembly, not firms.

The kernel is ideologically agnostic; the graph is the politics. FigaroCore takes
no position on currency, jurisdiction, identity, arbitration, role structure,
price-discovery, or contribution metric. A market-liberal graph, a cooperative
graph, an Islamic-finance graph, and a mutual-aid graph all use the same kernel.
Never take positions on ideology at the kernel layer; never describe Figaro as
aligned with any political or economic tradition. Ideology lives at the assembly
tier where participants express it in the graph they compose.

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
- Covered by Foundry unit tests, 7 Echidna properties, 11 Halmos symbolic proofs (7 FigaroCore + 4 StagedMerkleAirdrop), and 6 Certora CVL specs (35 declared rules, all green; AC spec re-verified 2026-04-23 after ABI change to carry agreement-receipt proofs)

**`src/CommitmentTypes.sol`** — EIP-712 typed structs and hash functions.
Single `Commitment` struct for both root and sub-orders; `processId` zero for root.

### Attestation & Schema

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
*runtime-attestable* schemaId (local-commerce use case + jurisdiction baseline):
`FigaroHandoffV1Validator`,
`FigaroCommerceV1Validator`, `FigaroGeoV1Validator`,
`FigaroFulfilmentV1Validator`, plus the 5 GHG sister schemas
`FigaroGHGProtocolV1Validator`, `FigaroGHGISO14064V1Validator`,
`FigaroGHGPAS2050V1Validator`, `FigaroGHGEN16258V1Validator`,
`FigaroGHGCustomV1Validator` (one per accounting standard),
`FigaroGHGMeasurementV1Validator`, `FigaroDeliveryLifecycleV1Validator`,
`FigaroProximityPolicyV1Validator` (Category-2, committed band) +
`FigaroProximityProofV1Validator` (Category-1, runtime witness),
`FigaroMerchantProcessV1Validator`,
`FigaroCourierProcessV1Validator`, `FigaroJurisdictionV1Validator`.
Each ABI-decodes per-schema content (no on-chain JSON parsing) and reverts with
typed custom errors. Foundry tests in `test/schemaValidators/`.

Note: `figaro-topology-v1` is a **manifest-only clause** — parties commit to
it at contract-signing time inside the off-chain agreement manifest, and it's
never fired as a runtime attestation. It has no on-chain validator and is
registered in `SchemaRegistry` purely as off-chain-vocabulary anchoring. The
DAG is reconstructed by indexers/frontend reading topology sections from the
signed manifest.

**`src/IRoleResolver.sol`** — Role-authorization interface for mechanism-delegated attestation.

### Mechanism Modules

**`src/DutchAuction.sol`** — Descending-price coordination primitive. No token handling.

**`src/OperatorRegistry.sol`** — Permissionless operator self-registration with
reclaimable ETH deposit. Two external functions: `register(role, metadataURI)`
+ `withdraw()`. Two events: `OperatorRegistered`, `OperatorWithdrawn`. State
is dedup-only (`_registered: address → bool`) plus the registration timestamp
that backs the deposit-lock gate. **No `_active` flag, no `updateProfile`, no
`deactivate` / `reactivate`** (web2-strip 2026-04-26): operator availability
is signal-by-availability off-chain, not registry state. Role and metadata
travel only in the `OperatorRegistered` event; to switch role or metadata an
operator withdraws (after the lock period) and re-registers, which clears the
dedup guard and restarts the lock. The kernel does not gate any operation on
operator state — this registry is advisory metadata for off-chain discovery
surfaces.

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
- `src/echidna/EchidnaFuzzer.sol`, `EchidnaToken.sol`

### What Does NOT Exist

No `FigaroFactory.sol`, `FigaroRouter.sol`, `governance/`, `compliance/`,
`FigEmission.sol`, `FigTimeLock.sol`, `MerkleAirdrop.sol` (replaced by `StagedMerkleAirdrop.sol`),
`TrancheVesting.sol` (removed — founder and DAO receive tokens at genesis with no vesting),
`ProximityTypes.sol` (removed), `IRoleResolverV4.sol` (renamed to `IRoleResolver.sol`),
generic `JSONSchemaValidator.sol` (per-schema validators instead — see "Schema validation
architecture" below), upgradeable proxy, protocol fee, owner, or admin surface.
FIG is not a governance token. `FigTokenModule` (UI) does not exist —
`/fig` and `/fig/claim` use `useFigToken` hooks directly.


---

## Schema Validation Architecture

Figaro enforces schema-content correctness in three layers. All three layers
parse the same canonical JSON spec format and apply the same validation
rules. **A new schema is not "done" until all three layers ship in lockstep.**

### Layer A — Client-side (TypeScript)

`@figaro/core/schemas` subpath:
- `parseSchemaSpec(json)` — meta-schema validator (closed subset of JSON Schema:
  `string` with format `bytes32-hex`/`address-hex`/`bytes-hex`/`iso-datetime`,
  `integer`, `bigint` (decimal string), `boolean`, `enum`, `array`, `object`).
- `validateContent(content, spec, { stage? })` — validates a JS object against
  a parsed spec. Closed schemas: rejects unknown fields. Per-stage overrides
  via `spec.stages[stage]`.
- Per-schema content encoders (`encodeHandoffContent`, `encodeCommerceContent`,
  `encodeGHGScopeContent`, `encodeFulfilmentContent`, `encodeGeoContent`,
  `encodeLifecycleContent`, `encodeProximityPolicyContent`,
  `encodeProximityProofContent`, `encodeMerchantContent`,
  `encodeCourierContent`) — bridge between TS objects and ABI bytes expected by
  the on-chain validator. Each schema's encoder is the canonical TS-side
  declaration of its field-to-position mapping. Topology has no encoder —
  it's a manifest-only clause with no runtime attestation.

Frontend wiring: `useSchemaValidator(schemaId)` hook + `schemaSpecSource.ts`
preloads built-in specs and lazy-fetches remote ones.

### Layer B — SP1 prover (Rust mirror) — pending

The prover guest program will mirror the TS validator byte-for-byte to
enforce schema validation during batched attestation execution. Not yet
implemented; the TS test suite + Foundry tests serve as the conformance
spec for the Rust port.

### Layer C — On-chain (Solidity)

`AttestationCoordinator.setValidator(schemaId, validator)` registers an
`ISchemaValidator` for a schemaId — **permissionless, first-write-wins**.
Once set, the binding is immutable (no admin, no rug-pull). Every
`attest*` call routes through the registered validator before emitting
the `Attestation` event. A schema with no validator cannot be attested
under (`ValidatorNotSet` revert).

Per-schema validators live in `src/schemaValidators/` and ABI-decode
content (no on-chain JSON parsing). They are pure / view contracts.

### Schema-spec format

Lives off-chain as JSON at the URI hashed into `SchemaRegistry.uriHash`.
Built-in specs ship in `sdk/src/schemas/examples/` and
`frontend/lib/shared/schemas/` (the application's working copy).

### The 17 local-commerce + jurisdiction schemas

| schemaId | What it carries | Attestation surface |
|---|---|---|
| `figaro-topology-v1` | DAG lineage (parent order hashes) | **Manifest-only** (no runtime validator) |
| `figaro-handoff-v1` | Physical-exchange mode | Layer A + C |
| `figaro-commerce-v1` | Currency, payment, line items | Layer A + C |
| `figaro-geo-v1` | Origin / destination geohash | Layer A + C |
| `figaro-fulfilment-v1` | Fulfilment method (single canonical enum: modality + who-organizes) | Layer A + C |
| `figaro-ghg-protocol-v1` | GHG Protocol Corporate Standard + scope (Category-2) | Layer A + C |
| `figaro-ghg-iso-14064-v1` | ISO 14064 family + scope (Category-2) | Layer A + C |
| `figaro-ghg-pas-2050-v1` | PAS 2050 product carbon footprint + scope (Category-2) | Layer A + C |
| `figaro-ghg-en-16258-v1` | EN 16258 transport-emissions methodology + scope (Category-2) | Layer A + C |
| `figaro-ghg-custom-v1` | Custom / non-standard GHG methodology + scope (Category-2) | Layer A + C |
| `figaro-ghg-measurement-v1` | Runtime grams CO2e (Category-1) | Layer A + C |
| `figaro-delivery-lifecycle-v1` | Stage progression (5 stages) + evidence URI | Layer A + C |
| `figaro-proximity-policy-v1` | Required detection band committed at agreement signing (Category-2) | Layer A + C |
| `figaro-proximity-proof-v1` | Per-handoff nonce + signed witness payload at runtime (Category-1) | Layer A + C |
| `figaro-merchant-process-v1` | Merchant per-role event enum (sovereign log) | Layer A + C |
| `figaro-courier-process-v1` | Courier per-role event enum (sovereign log) | Layer A + C |
| `figaro-jurisdiction-v1` | Off-chain dispute-resolution jurisdiction (applicable law + forum + language) — baseline graph per Paper E | Layer A + C |

The five `figaro-ghg-<standard>-v1` entries are sister schemas — one per
accounting standard. Standard identity lives in the schemaId; the content
shape is `(uint8 scope)` for all five and the encoder (`encodeGHGScopeContent`)
is shared. Per-standard extensions (reporting boundaries, period, etc.) can
be added to a single sister schema's validator without affecting siblings.

`figaro-proximity-policy-v1` + `figaro-proximity-proof-v1` are sister
schemas that split the committed-vs-runtime concerns the way
GHG-disclosure + GHG-measurement do for emissions. Policy commits the
required band at agreement signing (Category-2, byte-equality enforced);
proof carries the per-handoff nonce + signed witness payload at runtime
(Category-1, fresh per attestation). Off-chain consumers verify
`proof.band == policy.band` when the policy section is present.

### Adding a new schema — checklist

1. JSON spec in `sdk/src/schemas/examples/<schema>.json`.
2. Mirror in `frontend/lib/shared/schemas/<schema>.json` (preloaded by `schemaSpecSource`).
3. SDK content encoder in `sdk/src/schemas/encode.ts` + export from `index.ts`.
4. SDK examples test in `sdk/tests/schemas/examples.test.ts`.
5. Solidity `Foo<Schema>V1Validator.sol` in `src/schemaValidators/`. Validate function MUST be declared `external pure override` (no external state reads, no `block.*`/`tx.*`, no external calls). Use `bytes32 public constant override schemaId = keccak256("...")` so the schemaId is a compile-time literal — `immutable` constructor-set schemaIds force the override to `view` and forfeit the EVM-enforced determinism guarantee. See `ISchemaValidator` NatSpec for the rationale.

   **When to add a per-role process schema vs not** (kernel-participant vs off-chain-operator principle): a role needs its own process schema if and only if its state transitions are off-chain. Off-chain operators (merchants, couriers, locker operators, etc.) need a process schema because their state transitions happen in physical reality and need a sovereign event log to be tamper-proof evidence. Kernel-participant roles — most importantly the **buyer**, who acts via `commit` and `resolveProcess` — do NOT need a process schema; their evidence IS the kernel event log itself. `merchant-process` and `courier-process` are sovereign-log primitives in this sense. Don't add `figaro-buyer-process-v1` — it would duplicate kernel events. Do add a process schema for any new off-chain operator role whose internal events need to be on-chain attestable.
6. Foundry test in `test/schemaValidators/`.
7. Rust mirror in the SP1 prover (Layer B; deferred).
8. List the schema + one-line summary on `/builders` "Schema validators in force".
9. `setValidator(schemaId, validator)` call added to `script/Deploy.s.sol` and `script/DeployMainnet.s.sol`; regression covered by `test/DeployScriptTest.t.sol`. (Bootstrap-time atomicity: the deploy scripts inline schema registration + validator binding within a single broadcast transaction. Post-deploy third-party schemas should use `SchemaRegistrationHelper.registerSchemaAndValidator(...)` instead — see "Third-party schema deployment" subsection below.)

If any step is skipped the validator gate either rejects all attestations under that schemaId
(missing on-chain validator) or silently accepts content the spec would have rejected (Layer A
gap). Maintain lockstep.

### Third-party schema deployment — atomic register+bind required

`SchemaRegistry.registerSchema` and `AttestationCoordinator.setValidator` are
independent permissionless writes. The 14 reference figaro-* schemas are bound
inside a single transaction by `script/Deploy.s.sol:_deployAndRegisterValidators`,
so no front-running window exists at genesis.

For any **third-party schema** registered post-deploy, the schema author MUST
perform both writes in a single transaction. The recommended path is
**`SchemaRegistrationHelper.registerSchemaAndValidator(schemaId, version, uriHash, validator)`**
— a stateless, no-admin helper contract deployed alongside the protocol that
composes the two underlying public calls atomically. Alternative paths: a
custom deploy script, or a wallet multicall covering both writes.

Two separate transactions exposes a window where any address can `setValidator`
under the new schemaId with a malicious validator that self-attests the correct
`schemaId()`, capturing the binding permanently (binding is immutable
first-write-wins). The validator's `validate()` logic is not constrained at
binding time, so a self-attesting malicious validator passes
`InvalidValidatorBinding` and becomes the gate forever.

This is deployment discipline, not a protocol gap. See
`docs/v5/DESIGN_DECISIONS.md` #13 for the full rationale and the rejection of
admin-based mitigations.


---

## Agent SDK (`sdk/`)

`@figaro/core` — TypeScript SDK for reading, analyzing, and proposing Figaro transactions.
Single dependency: `viem ^2.0.0`. ESM, four subpath exports.

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

### `@figaro/core/schemas`

Schema-spec format + content validation + per-schema content encoders.
The single source of truth that all three validation layers (client TS,
SP1 prover, on-chain Solidity) parse identically. Imports:
- `parseSchemaSpec(json) → ParseResult` — meta-schema validator
- `validateContent(content, spec, options?) → ValidationResult`
- `encode<Schema>Content(...)` — one encoder per local-commerce schema, returning
  the ABI bytes the on-chain validator expects

See "Schema Validation Architecture" above for the full lockstep checklist.

### SDK Scripts

```bash
cd sdk && npm test
cd sdk && npm run build   # tsc → dist/
cd sdk && npm run lint    # tsc --noEmit
```

---

## Frontend — Structure

Next.js 14 (App Router), TypeScript, Tailwind CSS. **`frontend/` is the only
active frontend.** The prior `frontend/` directory was archived to
`archive-frontend/` on 2026-04-26 — do not edit it. If a frontend change is
needed, it ships in `frontend/` only.

### Routes (`frontend/app/`)

`/`, `/admin`, `/builders`, `/builders/assemblies`, `/builders/authoring`,
`/builders/designer`, `/builders/prototype`, `/builders/prototype/[slug]`,
`/console`, `/evidence-display`, `/fig`, `/fig/claim`, `/local-commerce`,
`/help`, `/i/[slug]`, `/onboarding`, `/operators`, `/operators/catalogue`,
`/sign`, `/terminal` (with `/workbench` → `/terminal` 308 redirect preserved
in `next.config.mjs`), `/api/semantic/agreements`,
`/api/semantic/agreements/[agreementHash]`, `/api/semantic/assemblies`,
`/api/semantic/runtime`.

`/i/[slug]` is the canonical assembly instance route, authored as declarative
composition over the module registry via `useAssemblyRuntime`. The
`/builders/designer` three-column tool (palette + canvas + inspector) ships a
publish-readiness drawer.

### Key Library Areas (`lib/`)

- **`core/`** — FigaroCore hooks, commitment/agreement utilities
- **`dispute/`** — Kleros evidence, delivery attestation 4 modes
- **`handoff/`** — ECDH key exchange, per-order encryption
- **`mechanisms/`** — Mechanism hooks, package registry
- **`semantic/`** — Assembly derivation and capability models. Key entries: `deriveAssemblyModel.ts`, `deriveAssemblyCapabilities.ts`, `models.ts`
- **`shared/`** — Wagmi config, runtime identity, assembly schema/parser/registry/validation, IPFS. Key entries: `assembly.ts` (schema types), `assemblyParser.ts`, `assemblyRegistry.ts`, `assemblyValidation.ts`, `assemblyPublication.ts`, `runtimeResolution.ts`, `moduleRegistry.ts`, `blockMetadata.ts` (designer block registry — see below), `schemaSpecSource.ts` (preloaded + lazy-fetched schema specs), `schemas/` (built-in schema spec JSONs)
- **`commerce/`**, **`console/`**, **`marketplace/`**

### Block model (designer-tool foundation)

`lib/shared/blockMetadata.ts` defines `BlockMetadata` — the composable unit
the designer palette renders. A block bundles **schema(s) + backend + UI module(s)**.
Categories: `mechanism` / `schema` / `handoff` / `display` / `shell`. Registry
is in-memory, populated by `registerAllModules()`, with a dev-only invariant
(`assertBlockMetadataIntegrity`) that asserts every registered moduleId has
a metadata entry. Block arrays exported by `registerAllModules.ts`:
`PACKAGE_BLOCKS`, `STANDALONE_BLOCKS`, `SHELL_BLOCKS`. Designer code consumes
via `listBlockMetadata()` / `listBlocksByCategory(category)` / `getBlockForModule(moduleId)`.

### Designer tool surface (`frontend/`)

Lives at `/builders/designer`. Three-column layout:

- **Palette** (`components/core/designer/DesignerPalette.tsx`) — left rail.
  Lists registered blocks grouped by visible category, with per-block Layer A
  schema-availability signal (✓ = spec loaded, ⚠ = missing).
- **Canvas** (`components/core/designer/DesignerCanvas.tsx`) — middle. Shows
  identity / roles / mechanisms / views×slots×bindings. Read-only by default;
  becomes interactive when callbacks are passed (slot selection, binding
  selection, remove `×`).
- **Inspector** (`components/core/designer/DesignerInspector.tsx`) — right
  rail. Edits the selected binding's `componentKind` / `semanticInput` /
  `priority`; surfaces the owning block.
- **Publish drawer** (`components/core/designer/DesignerPublishDrawer.tsx`)
  — overlay. Runs `validateDraftPublicationReadiness` (collision checks
  suppressed for the demo), shows readiness badge + issue list + serialized
  assembly JSON with clipboard copy.

Pure draft-mutation helpers live in `lib/shared/designerOps.ts`:
`addBlockToSlot` (auto-priority, dedup per `moduleId`+`slot`),
`removeBindingFromSlot`, `updateBinding`. All return the same Assembly
reference on no-op so React re-renders are minimal.

### Schema validation in the frontend

- `useSchemaValidator(schemaId)` hook (`hooks/core/`) — binds `validateContent`
  to a form value. `{ isReady, validate, loadError }`.
- `schemaSpecSource.ts` — preloads built-in specs at module load (15 local-commerce
  schemas live in `lib/shared/schemas/`); supports async `loadSchemaSpec(id, uri)`
  for IPFS-resolved specs.

### Components (`components/`)

- **`core/`** — order flows, bond/token, builder/assembly, semantic. Assembly rendering shells: `AssemblyShell`, `AssemblyInspector`, `AssemblyProcessWorkspace`, `RegisteredAssemblyWorkspace` (all `Institution*` names have been renamed)
- **`modules/`** — composable mechanism components registered via `registerAllModules.ts`. Base-slot registry entries consumed by the declarative `/i/[slug]` route.
- **`shared/`** — shell/utility; **`ui/`** — design primitives; **`icons/`** — SVGs; **`console/`** and **`operators/`** — route-specific panels

### Wallet-provider scope per route

Every route in `frontend/app/` is classified into one of three tiers
governing wallet-provider load:

- **Marketing** — pure publication / explanation. Must NOT trigger wallet-provider load. Examples: `/`, `/about`, `/help`, `/legal`, `/research`, `/publications`, `/spec`, `/verification`, `/sovereign-commerce`, `/economics`, `/labor-law`, `/displaced`, `/compliance`, `/mechanism`, `/resources`.
- **Reference / read-only** — registries and tools whose primary purpose is read-only inspection. May surface inline write affordances via `WalletGate`, but the page renders fully without a connected wallet. Examples: `/builders`, `/builders/assemblies`, `/builders/authoring`, `/builders/designer*` (DesignDraft is localStorage), `/builders/prototype*`, `/integrate`, `/schemas`, `/groups`, `/groups/[slug]`, `/grants`, `/treasuries`, `/i/[slug]` (read-mode views).
- **Transactional** — primary purpose is signing or sending transactions. Must require a connected wallet (route-guard or `WalletGate` at the page top). Examples: `/terminal`, `/sign`, `/operators`, `/operators/catalogue`, `/console`, `/admin`, `/fig`, `/fig/claim`, `/fig/design`, `/evidence-display`, `/accounting`, `/local-commerce`.

**Rules:**

1. Do NOT gate read-only pages behind `useAccount` / `isConnected`. Wallet-connect is a signing prerequisite, not a login (see `feedback_wallet_connect_not_auth.md`). A user who has never connected must be able to read every Reference / read-only and Marketing route.
2. For inline write affordances on Reference pages, use `WalletGate` (the canonical inline-gate wrapper).
3. The current root layout loads `<Providers>` (WagmiProvider + RainbowKit) for every route, so Marketing pages technically load the wallet provider today. Splitting `app/` into `(marketing)` / `(transactional)` route groups with separate layouts is a known follow-on (see backlog) — the classification above is the canonical reference for that future refactor.

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

cd frontend && npm run dev                # Dev server

forge test --via-ir                        # --via-ir required

FOUNDRY_PROFILE=halmos halmos \
  --contract HalmosFigaroCore \
  --solver-timeout-assertion 5m --solver z3

cd frontend && npx vitest run
cd frontend && npx playwright test --project=mock
cd frontend && npx playwright test --project=devnet

cd sdk && npm test
cd prover && cargo test -p figaro-kernel
cd prover && cargo test -p figaro-sequencer
```

### Deployment Scripts

- `script/Deploy.s.sol` — devnet (Anvil), uses mock verifier and mock tokens
- `script/DeployMainnet.s.sol` — mainnet, no mocks; reads all sensitive params from env
- `script/MintTokens.s.sol` — utility: mint test tokens to existing devnet accounts

---

## Testing

### Foundry (`test/`)

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

### Halmos (`test/`) — 2 harnesses

| Harness | Properties | Key invariants |
|---|---|---|
| `HalmosFigaroCore.t.sol` | 7 | Token conservation, bond amounts, resolution payouts, status transitions, buyer dominance, monotonicity |
| `HalmosStagedMerkleAirdrop.t.sol` | 4 | Claim flag set, one-shot per (stage, address), balance math, merkle leaf format |

### Certora (`certora/`) — 6 specs

| Spec | Rules | Covers |
|---|---|---|
| `FigaroCore.spec` | 8 | Status monotonicity, transitions, active count, buyer dominance, no double-commit, cumulative monotonicity, rootBuyer immutable, currency immutable |
| `AttestationCoordinator.spec` | 7 → 8 sub-rules | Role-gate on `attestAsBuyer` (non-buyer reverts; success ⟹ caller is buyer) + parametric Core-immutability (AC cannot change orderStatus or processes[]) + validator-gate (schemaId with no registered validator reverts) + setValidator invariants (first-write-wins, per-schema storage isolation). Re-authored + cloud-verified 2026-04-23 for the new commitment-arg ABI — 8/8 green. |
| `TokenOpsVerification.spec` | 7 → 8 sub-rules | Universal FigaroCore token-flow: exact commit deltas (buyer/seller/Core), allowance-drain safety (∀ address), commit + single-order resolve conservation, single-order resolve exact payouts. Generalizes Halmos root-only coverage to arbitrary sub-orders. |
| `BatchVerifierTokenOps.spec` | 4 | Single-position `settleBatch`: user balance delta = payout − deposit, contract delta = deposit − payout, allowance-drain safety, conservation. |
| `FigToken.spec` | 6 | Supply cap, registered-cap bound, registered-cap monotonicity, renounce one-way latch, minter cap immutability, minter within cap |
| `StagedMerkleAirdrop.spec` | 3 | Claim monotonicity, stage config immutability, minter immutability |

Companion: `certora/token-ops.inventory` + `lint-token-ops.sh` — declarative inventory of every ERC20 transfer call site in `src/`; the linter (run as a `./test-certora.sh` prelude) fails if a new transfer call merges without an inventory entry.

### Echidna — 7 properties

Harness: `src/echidna/EchidnaFuzzer.sol`.
`echidna_solvency`, `echidna_active_count_consistent`, `echidna_cumulative_accounting`,
`echidna_state_monotonicity`, `echidna_token_conservation`, `echidna_buyer_dominance`,
`echidna_atomic_resolution`

### TLA+ (`formal/`) — 15 invariants across 2 models (FigaroCore 7 + FigToken 8)

`TokenConservation`, `ContractSolvency`, `WalletNonNegative`, `CumulativeIntegrity`,
`ActiveCountCorrect`, `ResolutionAlwaysPossible`, `TypeOK`.
Also `formal/FigToken.tla` / `formal/FigToken.cfg` — 8 FigToken invariants.

### Frontend Vitest
### Playwright — mock, mock-mobile, and devnet projects
### Rust prover — figaro-kernel + figaro-sequencer

---

## Design & Audit Docs (`docs/v5/`)

Core theory:
- `VISION.md` — Post-firm economy, Coasean collapse, token denomination
- `THEORY.md` — Game-theoretic derivation of the six protocol properties
- `CURRENT_STATE.md` — Active reading path and archive boundaries

Security & verification:
- `DESIGN_DECISIONS.md` — 14 intentional patterns that look like vulnerabilities **(read before auditing)**
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

# Figaro Architecture Blueprint

The canonical map of what Figaro is built from and how it is wired — the
external architectural model an agent reloads each turn instead of re-deriving
it from scattered files (the recurring per-turn reconstruction failure). Built
**tier by tier, every edge verified against source** (constructors, the deploy
script, emitted events), never asserted.

**This file is the *structural* half of the blueprint. The *enforced* half is
the lexicon in `scripts/lint-architecture-lexicon.sh`** — one canonical name per
concept, checked at pre-commit. A blueprint nothing enforces goes stale; this
one is paired with that guard.

## How to read it

- **Tiers, bottom-up:** network → kernel → on-chain composition → off-chain
  composition → trade. (The frontend `/spec` page states the same spine.)
- **Edges are directed and tagged:**
  - **on-chain** — a real Solidity reference (a constructor argument or a call).
  - **off-chain** — a reference carried by a manifest, an indexer read, or a
    proof. *Not* a Solidity edge.
- **The single most load-bearing fact:** most nodes that look stacked are
  **horizontal siblings joined by off-chain references, not on-chain dependency
  edges.** A linear stack diagram erases exactly this; that is why every edge
  here carries an on/off-chain tag.

---

## Tier — network

The EVM chain the protocol is deployed on (Anvil/devnet → mainnet). The kernel
inherits execution security from it; nothing Figaro-specific lives here.

## Tier — kernel

The irreducible settlement primitive. **Depends on nothing inside Figaro** —
only the network, OpenZeppelin libraries, and `CommitmentTypes`. Every Figaro
edge to it is inbound. Frozen (see CLAUDE.md "Agent Permissions").

**Nodes**

| Node | File | What |
|---|---|---|
| `FigaroCore` | `src/FigaroCore.sol` | the kernel: `commit`, `resolveProcess` |
| `CommitmentTypes` | `src/CommitmentTypes.sol` | EIP-712 `Commitment` struct + `hashStruct` |

**Vocabulary** (names the tiers above reference)

| Canonical | What (verified) |
|---|---|
| `process` | `ProcessState{ rootBuyer, currency, cumulativeValue, activeOrderCount }` |
| **process chain** | the kernel's view: a *linear* sequence of `commit`s over `cumulativeValue`. Retired synonyms: `process tree`, `DAG` (DAG is the *off-chain* topology term, not a kernel term). |
| `order` | one buyer↔seller commitment; `orderHash`; `orderStatus` 0=unknown / 1=committed / 2=resolved |
| `commit` | creates an order; **is** order arrival + acceptance (core-owned). There is no `order-received` / `accepted` clause event. |
| `resolveProcess` | buyer-only **atomic** settlement |
| `rootBuyer` | `buyer == rootBuyer` on every order (star-shape) |
| `Commitment` | EIP-712 struct: `processId, buyer, seller, currency, payment, expectedCumulativeValue, agreementHash, salt, deadline` |
| `agreementHash` | fingerprint of the **off-chain** agreement — the coupling point up to off-chain composition |

**Edges**

| From | To | On/off-chain | Via |
|---|---|---|---|
| network (EVM) | `FigaroCore` | — | execution substrate |
| `FigaroCore` | `CommitmentTypes` | on-chain | library import (`Commitment`, `hashStruct`) |
| `FigaroCore` | OZ libs (ECDSA, EIP712, IERC20, SafeERC20, ReentrancyGuard) | on-chain | import |
| indexer | `FigaroCore` events | off-chain | reads `OrderCommitted / OrderResolved / ProcessResolved / OrderSeller / OrderCurrency` |

## Tier — on-chain composition

The permissionless primitives built **around** the kernel. Verified from
`script/Deploy.s.sol` (constructor calls = the real on-chain edges).

**Nodes**

| Node | File | What |
|---|---|---|
| `AttestationCoordinator` | `src/AttestationCoordinator.sol` | runtime attestation gate; binds `clauseId → IClauseValidator` via `setValidator`; runs content validation at attest |
| `IClauseValidator` (17 impls) | `src/clauseValidators/*.sol` | per-clause content validator: `validate(clauseId, stage, sectionData, content)`. Standalone; bound by the coordinator. |
| `ClauseRegistry` | `src/ClauseRegistry.sol` | event-only clause anchoring: `clauseId`, `uriHash`, `family` |
| `ClauseRegistrationHelper` | `src/ClauseRegistrationHelper.sol` | atomic register-clause + bind-validator composer |
| `SellerRegistry` | `src/SellerRegistry.sol` | permissionless seller self-registration (deposit + lock); `metadataURI` |
| `AssemblyRegistry` | `src/AssemblyRegistry.sol` | first-write-wins `slugHash → contentHash` anchor; **takes no on-chain manifest content** |
| `DutchAuction` | `src/DutchAuction.sol` | descending-price coordination mechanism |
| `ProcessOffsetReceipt` | `src/ProcessOffsetReceipt.sol` | offset-receipt anchor; gated to the process `rootBuyer` |
| `FigToken` | `src/fig/FigToken.sol` | FIG ERC-20; capped supply; minter registry |
| `RpgfMinter` | `src/fig/RpgfMinter.sol` | RPGF claim minter; per-stage merkle root, SP1-proved |
| `FigaroBatchVerifier` | `src/FigaroBatchVerifier.sol` | SP1 batch-settlement verifier |
| `SP1Verifier` | external (mock on devnet) | the proof verifier `RpgfMinter` + `FigaroBatchVerifier` share |

**Edges — on-chain** (constructor arg or call; verified)

| From | To | Via |
|---|---|---|
| `AttestationCoordinator` | `FigaroCore` | `constructor(address core)`; reads `orderStatus`, `DOMAIN_SEPARATOR()` |
| `AttestationCoordinator` | 17 × `IClauseValidator` | `setValidator(clauseId, validator)` |
| `ClauseRegistrationHelper` | `ClauseRegistry`, `AttestationCoordinator` | `constructor` |
| `ProcessOffsetReceipt` | `FigaroCore` | `constructor(core)`; reads `processes(processId).rootBuyer` |
| `RpgfMinter` | `FigToken`, `SP1Verifier` | `constructor` (mints FIG; verifies claim proof) |
| `FigaroBatchVerifier` | `SP1Verifier` | `constructor` (verifies batch proof) |

`ClauseRegistry`, `SellerRegistry`, `AssemblyRegistry`, `DutchAuction`,
`FigToken` have **empty / params-only constructors — zero on-chain edges to each
other or to the kernel.** They are siblings co-deployed on the chain.

**Edges — off-chain** (manifest / indexer read / proof)

| From | To | Via |
|---|---|---|
| indexer | every node's events | reads `ClauseRegistered`, `SellerRegistered/…`, `AssemblyRegistered`, `Attestation`, `ValidatorSet`, `Auction*`, `ReceiptRecorded` |
| `AssemblyRegistry.contentHash` | assembly document (IPFS) | the assembly JSON (`AssemblyDocument`); **the assembly→clause reference lives here, off-chain** |
| `ClauseRegistry.uriHash` | clause spec JSON (IPFS) | off-chain Layer-A spec |
| `ClauseRegistry.family` | RPGF SP1 program → `RpgfMinter` | the proof reads `family` for Tier-1 weighting — the **only** clause↔FIG link, and it is off-chain |

**Load-bearing facts** (the things a stack diagram hides)

1. The clause concern spans **two** contracts: `ClauseRegistry` anchors
   `clauseId + family + uriHash`; `AttestationCoordinator` binds
   `clauseId → validator` and runs validation. Validators are **not** in
   `ClauseRegistry`.
2. The three registries (Clause / Seller / Assembly) have **zero on-chain edges
   among themselves.** assembly→clause and seller→assembly are **off-chain**
   (manifest, seller metadata). This is the separation-of-concerns doctrine,
   verified in Solidity.
3. FIG / RPGF touches the protocol through **one off-chain edge** — the clause
   `family` field read by the RPGF proof. No on-chain edge to the registries or
   the kernel.
4. Only `AttestationCoordinator` and `ProcessOffsetReceipt` reference the kernel,
   both **read-only**.

## Tier — off-chain composition

Where agreements/manifests are pinned, network state is reconstructed, and
proofs are produced. Coarser-grained than the on-chain tiers (TS/Rust modules,
not one deploy script); the edges below are the verified cross-tier ones.

**Nodes**

| Node | Where | What |
|---|---|---|
| IPFS (pinning) | accessed via publish hooks (`lib/seller/*`, `lib/mechanisms/use*Registry`) | content-addressed store for the canonical JSON blobs the on-chain `contentHash` / `metadataURI` / `uriHash` point to |
| indexer | `frontend/lib/core/indexer.ts` | the **read** side — reconstructs network state from chain events; the frontend renders indexer state (network-is-SSoT) |
| sequencer / prover | `prover/sequencer/`, `prover/clause/`, `prover/rpgf/`, … (Rust + SP1) | the **write/batch/prove** side — batches settlement, produces SP1 proofs |
| `lib/` catalogues | `lib/shared/clauseSpecSource.ts`, `lib/semantic/`, `lib/mechanisms/`, `lib/designer/`, `lib/core/` | runtime infrastructure: clause specs, the semantic model, mechanism hooks, designer libs, agreement projection |
| authoring surfaces | `…/builders/designer/_components/{DesignerCanvas,AgreementDrawer}.tsx` | design-time composition: the **canvas draws the topology**, the **drawer composes each order's clauses** |

**Edges**

| From | To | On/off-chain | Via |
|---|---|---|---|
| indexer | every on-chain node's events | off-chain | event read (kernel + on-chain-composition) |
| on-chain `contentHash` / `metadataURI` / `uriHash` | IPFS blob | off-chain | content-address pointer |
| publish hooks | IPFS, then the matching registry | mixed | pin the JSON, then anchor its hash on-chain (simulate → write → wait) |
| sequencer / prover | `FigaroBatchVerifier`, `RpgfMinter` | off-chain → on-chain | SP1 proof consumed on-chain |
| `prover/rpgf` | `RpgfMinter` | off-chain | reads clause `family` + RPGF formula → proven claim root |
| designer canvas / drawer | `AssemblyRegistry` + IPFS | off-chain | builds the assembly template → publishes (`AssemblyDocument` pinned, slug+hash anchored) |
| `clauseSpecSource` | drawer, indexer, semantic layer | off-chain | the single clause-spec source, read everywhere |

**Load-bearing facts**

1. The frontend renders **indexer state**, never bundled lists (network-is-SSoT);
   the `(marketing)` / `(app)` split is wallet-scope, not data-freshness.
2. `lib/` is **runtime infrastructure** — the abstraction is the deliverable;
   catalogues land ahead of their UI consumers (product-code YAGNI does not apply).
3. The assembly→clause and seller→assembly references that were **absent
   on-chain** live here — in the pinned `AssemblyDocument` and seller metadata.

## Tier — trade

The participants who drive the four lifecycle phases (Design → Adopt → Checkout
→ Runtime) by holding a wallet that can sign and bond. The kernel **admits
anyone or anything that can sign + bond** — permissionless participation.

**Nodes**

| Node | Where | What |
|---|---|---|
| humans | the frontend surfaces | wallet-holders driving Design (designer) → Adopt (seller profile / catalogue) → Checkout (`/s/[seller]`) → Runtime (`/orders/[processId]`, `/inbox`) |
| agents | `sdk/src/agent/` (`@figaro/core/agent`), `agents/factotum/` | autonomous / HITL participants — sign, bond, resolve. **Participation-side only**; there is no authoring copilot (open: "build-assistant agent"). |

**Edges**

| From | To | On/off-chain | Via |
|---|---|---|---|
| humans / agents | designer canvas + drawer | off-chain | Design — compose the assembly template |
| humans / agents | `useCheckout` / `useCommitmentFlow` → `commit` | drives on-chain | Checkout — sign the EIP-712 commitment, lock bonds |
| humans / agents | capability-flow → attest / `resolveProcess` | drives on-chain | Runtime — attestations, settlement |

**Load-bearing facts**

1. A party is `buyer` or `seller`. What it DOES is a clause/state lookup, never a
   name — `merchant` / `courier` / `operator` are **layer-projections, not
   identities** (enforced by `scripts/lint-no-product-party-terms.sh`).
2. Kernel signatures are **ECDSA-only (EOA)** — a contract cannot be a kernel
   party (no EIP-1271). An agent acts for the wallet whose key it holds.
3. Agent code is **participation-side** (sign / bond / resolve). A build-assistant
   / authoring copilot is an open decide-whether-to-build item, not a shipped
   surface. (`Project Operator` — the human beta-admin — is a flagged
   reconsideration: the admin framing fights the ownerless doctrine.)

---

## Lexicon status

Enforced by `scripts/lint-architecture-lexicon.sh`.

| Canonical | Retired / banned | Guard |
|---|---|---|
| `commit` is arrival+acceptance | `order-received` / `accepted` as clause events | **FAIL** (quoted form) |
| `clause` (the artifact family) | `schema` (carve-outs: JSON Schema, commitment schema, schema version) | **FAIL** |
| `process chain` (kernel) / `DAG` (off-chain) | `process tree` | **WARN** (retire-sweep pending) |
| `asymmetric bonding` | `progressive collateralization` | **WARN** (retire-sweep + doctrine reword pending) |

Party vocabulary (`buyer` / `seller` vs `merchant` / `courier` / `operator`) is
enforced separately by `scripts/lint-no-product-party-terms.sh`. `manifest`
(assembly-JSON sense) has no row yet — sense D (handoff) is open and the frozen
kernel's NatSpec still uses the word, so a blanket ban is unsafe.

## Open churn — needs a ruling before it can be enforced

- **`manifest` is mid-retirement** (decided 2026-05-29, mostly done — backlog
  "manifest naming rename"). "manifest" is being disambiguated to GONE per sense:
  - **pinned assembly JSON:** `AssemblyManifest` → `AssemblyDocument` / `assemblyDoc`
    — DONE. **`AssemblyDocument` is the canonical name** (not "manifest").
  - `manifestFields` → `clauseFields`; `agreementManifest.ts` → `agreement.ts` — DONE.
  - **sense D** (handoff `lib/handoff/manifest.ts`, vestigial) — OPEN.
  - **separate KEPT sense:** `manifest-only` = a clause committed at signing with
    no runtime validator (`figaro-topology-v1`). NOT the assembly-JSON sense — do
    not conflate.
  - **Contract NatSpec — DONE** (`0e4fb90`): `AssemblyRegistry` /
    `AttestationCoordinator` now say "assembly document" / "agreement". Only the
    **frozen `FigaroCore`** keeps "manifest" (never-edit-kernel). So **sense D
    (`lib/handoff/manifest.ts`) is the sole remaining open item.**
- **`AssemblyTemplate` vs `AssemblyDocument` — distinct, an old/new migration**
  (`project_assembly_template_phase2`): `AssemblyTemplate` = intended
  (party-agnostic, no hashes); `AssemblyDocument` = current (bakes hashes +
  synthetic-process metadata). Endpoint retires `AssemblyDocument`.
- **`assembly` = design-time TEMPLATE; `process` = runtime INSTANCE** — settled
  (assembly→process rename declined by design). Not synonyms.
- **`schema` → `clause`** — shipped in code, residual in ~10 memory files;
  canonical = `clause` (carve-outs: IETF "JSON Schema", the kernel's "commitment
  schema"). A planned lexicon-guard row.
- **`OperatorRegistry`** — a stale name for `SellerRegistry` that survives only
  in the *memory corpus* (zero code/doc occurrences). A memory-hygiene fix.

## Status

All five tiers folded in: **network · kernel · on-chain composition · off-chain
composition · trade**. The structural map and the enforced lexicon
(`scripts/lint-architecture-lexicon.sh`) both grow as new nodes and terms land.

The infra tiers above are *finite and mappable*; below are the **deep-dives**
into the areas the bare tier map under-resolves — starting with the frontend,
the biggest development-pain area.

---

## Frontend pipeline (off-chain composition + trade — frontend detail)

The off-chain tier's coarse "lib/ catalogues" and "authoring surfaces" nodes,
expanded into the data-flow that drives the four lifecycle phases — the
frontend's actual wiring, where the development pain and the naming churn live.
All four phases are mapped below as **verified call-graphs** (an at-a-glance table
first, then per-phase detail, each followed by its in-flight / known-issues).

`lib/` modules (verified): `core` (agreement, indexer, orderAgreement, commitment
prep) · `designer` (assemblyTemplate, syntheticProcess) · `mechanisms` (registry +
process hooks) · `commerce` (cart, checkout, pricing) · `semantic` (models,
`deriveProcessModelFromRuntime` — the capability flow) · `seller` · `shared`
(clauseSpecSource + catalogues) · `handoff` · `audit` · `dispute`.

| Phase | Surface (route) | lib modules | Touches |
|---|---|---|---|
| **1 Design** | `/builders/designer` (`DesignerCanvas`, `AgreementDrawer`) | `designer`, `shared` (clauseSpecSource) | builds `AssemblyTemplate` (no-hash) → `useAssemblyRegistry` publish: pin `AssemblyDocument` (IPFS) + anchor slug/hash (`AssemblyRegistry`) |
| **2 Adopt** | `/sellers`, `/s` (seller profile / catalogue) | `seller`, `mechanisms` (`useSellerRegistry`) | pin seller profile (IPFS) + `SellerRegistry` anchor; bind assembly into the catalogue (`counterpartyBindings`) |
| **3 Checkout** | `/s/[seller]` | `commerce` (`useCheckout`), `core` (`orderCommitmentPreparation`, `agreement`) | prepare N commitments per topology → sign EIP-712 → `commit` (on-chain) + pin agreements (IPFS) |
| **4 Runtime** | `/orders/[processId]`, `/inbox`, `/audit`, `/dispute` | `semantic` (`deriveProcessModelFromRuntime`), `mechanisms` (`useMerchantProcess` / `useCourierProcess`), `core/indexer`, `dispute`, `audit` | indexer reads events → agreement clauses → `deriveProcessModelFromRuntime` → `CapabilityRail` → `executeCapability` → attest / `resolveProcess` (on-chain) |

**Stale-name corrections this frame surfaced** (backlog named them wrong):
- `useCheckout` lives in `lib/commerce/`, not `lib/mechanisms/`.
- `useCommitmentFlow` lives in `lib/core/` (not `lib/mechanisms/` as the backlog
  implied; an earlier pass wrongly recorded it as non-existent).

### Phase 1 — Design (verified call-graph)

**Surfaces:** `DesignerCanvas` → `AgreementDrawer` (compose) → `ViewAssemblyClient`
(`/builders/designer/view/[slug]`, review-confirm-publish).

1. **`DesignerCanvas`** (`/builders/designer`) — draws the orders (nodes), holds
   `clausesByOrderId` + name/slug/privilegedToken; persists the draft to
   `syntheticDesignStore` (localStorage). "Review" → navigates to `/view/[slug]`.
   Imports `buildAssemblyTemplate` (`lib/designer/assemblyTemplate`).
2. **`AgreementDrawer`** (composes one order's terms) — reads live clauses via
   `useAllRegisteredClauses()` (→ `useClauseRegistry` → `ClauseRegistry` events)
   and specs via `getClauseSpec` / `clauseNestsUnder` (`clauseSpecSource`); renders
   **recursively** through `ClauseControl` (spec-driven nesting, e.g. proximity
   under hand-off — never hardcoded).
3. **`ViewAssemblyClient`** (`/view/[slug]`) — calls `usePublishAssembly().publish`.
4. **`usePublishAssembly`** (`useAssemblyRegistry.ts:675`) — the wire:
   `buildAssemblyDocument(snapshot)` → `serializeAssemblyDocument`
   (`canonicalize` → `contentHash = keccak256(toHex(json))`) →
   **`DEFAULT_IPFS_SERVICE.publishJSON` → metadataURI** *(off-chain pin)* →
   `simulateContract(registerAssembly(slug, contentHash, metadataURI), value: deposit)`
   → `writeContractAsync` → wait *(on-chain, `AssemblyRegistry`)*.

Two artifacts, two names (not churn — see Open churn): the in-memory
`AssemblyTemplate` (no-hash, what the canvas edits) vs the pinned
`AssemblyDocument` (`buildAssemblyDocument` output, what `contentHash` hashes).

**Node-count gas cap (live, per-chain).** The assembly's node count is gated by
ceilings derived from the active chain's block gas limit
(`lib/shared/chainGasCeilings.ts`): `maxCommitsLandableInOneBlock` (commit,
224k gas/order → ~135/block — a soft "blocks-to-commit" signal) and
`maxOrdersResolvablePerProcess` (resolve, 14k gas/order → ~2,145/process — the
hard cap). `DesignerCanvas` caps + signals against these; the publish guard
(`useAssemblyRegistry.ts:707`) re-checks `orders.length` against
`maxOrdersResolvablePerProcess` before `registerAssembly`.

**Drift this phase surfaced (corrected):** `nodeCount` is **not** dead — it's the
live client-side gas cap above. The error is only in `useAssemblyRegistry.ts`'s
publish-flow comment (~lines 12–22), which mis-describes it as a
`registerAssembly(slug, nodeCount, …)` **parameter** and a stored binding field
`(msg.sender, nodeCount, …)`. The contract takes only `(slug, contentHash,
metadataURI)` and stores no count — `nodeCount` is verified **client-side** and
never goes on-chain.

### Phase 2 — Adopt (verified call-graph)

**Surface:** the seller onboarding wizard (final step `OnboardingReview`); the
published profile is consumed at `/s/[seller]` and `/sellers`.

1. **`usePublishSellerProfile`** (`lib/seller/usePublishSellerProfile.ts:88`) —
   mirrors `usePublishAssembly` in shape:
   1. `publishSellerCatalogue(catalogue)` → catalogueURI *(off-chain pin)*
   2. build `SellerProfileMetadata` with catalogueURI embedded
   3. pin the profile doc → metadataURI *(off-chain pin)*
   4. read `registrationDeposit` on demand
   5. `simulateContract` — `register(metadataURI)` first-time / `updateProfile` re-pin
   6. `writeContractAsync` → 7. wait receipt + `status === "success"`
      *(on-chain, `SellerRegistry`)*
2. **`SellerProfileMetadata`** (`lib/shared/sellerProfileMetadata.ts:107`) carries
   `catalogueURI` (→ items + pricing) and **`counterpartyBindings: CounterpartyBinding[]`**
   — each binds a `clauseId` (e.g. `figaro-courier-process-v1`) → seller addresses.
   **This is the off-chain seller→assembly link** (load-bearing fact 3, made
   concrete): an assembly's role-orders resolve to real seller addresses through
   these bindings at checkout.

`register` (first) vs `updateProfile` (re-pin) — the registry is update-in-place
by design (deposit + lock are spam-only; no role enum).

### Phases 1–2 — in-flight & known issues

The maps above are **current-state**; these load-bearing pieces are changing or
broken (the rest is tracked in the backlog):

- **Phase 1 — slug redesign (spec'd).** `buildAssemblyDocument:127` puts `slug`
  *inside* the hashed doc, so `contentHash` depends on it (circular). Pending:
  slug *out* of `contentHash` (derive slug *from* it) + drop the name input +
  publish becomes **register-or-ADOPT** (dedup). Re-hashes every assembly →
  fixture re-capture.
- **Phase 1 — template/document flip.** Publish currently pins `AssemblyDocument`
  (bakes synthetic agreements + hashes); the intended end-state pins the no-hash
  `AssemblyTemplate` (`project_assembly_template_phase2`).
- **Phase 1 — live bug.** `AgreementDrawer` Registry tab shows only
  `figaro-consent-v1`; the `useAllRegisteredClauses` / `BUILT_IN_SPECS` read path
  misbehaves.
- **Phase 2 — binding disambiguation.** `counterpartyBindings` → seller
  resolution happens at the `/s` page (`sellerListing.ts:154-155`); multi-binding
  disambiguation is unsettled.
- **Both — IPFS pin timeout.** The 8s `AbortController` in
  `DefaultIpfsService.add` is shared by every pin; may abort a legit 5 MB media
  upload.

### Phase 3 — Checkout (verified call-graph)

**Surfaces:** `/discover` (buyer finds sellers/assemblies from network state) →
`/s/[seller]` (`SellerDetailView`, `SellerAuctionPanel`) → `/sign` (the
counterparty counter-signs).

1. **`useCheckout`** (`lib/commerce/useCheckout.ts`) — orchestrates; delegates the
   per-order flow to **`useCommitmentFlow`** (`lib/core/useCommitmentFlow.ts`).
2. **Per topology node** — `planSubOrderSellers` (`assemblySubOrderPlan.ts:34`)
   resolves each node's seller by matching `counterpartyBindings` to the node's
   clauses (`cb.clauseId ∈ nodeClauses`, with a cursor for multi-binding);
   `resolveSubOrderPayment` (`:78`) prices it **live from that seller's OWN
   catalogue** (`resolveCatalogueItemPrice`) — the template carries no payment.
3. **`prepareOrderCommitment`** (`orderCommitmentPreparation.ts`) per order:
   `buildOrderAgreement` → `saveAgreement` → `agreementHash` →
   `buildUnsignedOrderCommitment` → the EIP-712 `Commitment` (`processId, buyer,
   seller, currency, payment, expectedCumulativeValue, agreementHash, salt,
   deadline`).
4. **`commitmentSubmission`** — `initiateAsParty(commitment, proposerRole, meta)`
   (the proposer's half). The **bilateral commit completes at `/sign`**: the
   counterparty's `useCommitmentFlow.counterSign(payload)` → `broadcast` →
   `FigaroCore.commit` → `waitForTransactionReceipt` (both sign points gated by
   `validateCommitmentAgreement`). Agreements are IPFS-hydrated off-chain
   (`useProcessAgreements`); only the `agreementHash` goes on-chain.

### Phase 3 — in-flight & known issues

- **Multi-tx checkout (P0 — the commit half of batching).** A process holds up to
  the resolve ceiling (~2,145 orders), but commit is per-order; the cart's
  N-commitment prep + sequential/batched N-sign through `useCheckout` is the open
  P0 (`prepareOrderCommitment` → multi-commitment).
- **`template→orders` unify.** `syntheticProcess` / `templateToOrders` /
  `prepareOrderCommitment` → one `reconstructOrdersFromTemplate` (pending).
- **Pricing — lead-node de-hardcode.** `resolveSubOrderPayment`'s
  node→catalogue-item mapping is the open kit-assembly refinement (the lead still
  reads a synthetic `node.payment` in places); the model is "every seller prices
  from its own catalogue."
- **Clause propagation.** `executeCheckout` must extract every clause and pass it
  via `clauseFields`, or `buildOrderAgreement` drops it.
- **Swap-and-commit not wired.** `SwapAndCommitCoordinator` (pay-in-another-token)
  has no checkout wiring — off-protocol auxiliary, built-but-not-deployed.

### Phase 4 — Runtime (verified call-graph)

**Surface:** `/orders/[processId]` (`OrderTimelineView`), `/inbox`, `/audit`,
`/dispute`, `/evidence-display`. The order page **names no clause** — capabilities
are *derived*; "add a clause → its capability surfaces here" (guard
`lint-no-hardcoded-clauses-in-runtime`).

1. **`OrderTimelineView`** reads the order's agreement clauses (IPFS-hydrated via
   `useProcessAgreements`) + on-chain state (`lib/core/indexer.ts`, event-derived).
2. **`deriveProcessModelFromRuntime`** (`lib/semantic/…:796`) → capability
   descriptors from the clauses + attestation state (merchant prep→ready→handed-off,
   courier en-route→…→completed, GHG measurement, offset, resolve).
3. **`CapabilityRail`** (`components/core/CapabilityRail.tsx`) renders them →
   `onExecute` → `workspace.executeCapability`.
4. **`executeCapability`** dispatches by action type:
   - attestation → `useMerchantProcess` / `useCourierProcess` →
     `submitSellerAttestation` → `attestAsSeller` (`AttestationCoordinator`)
     *(on-chain; cross-order: `msg.sender == role.seller`, same process)*
   - transaction → `executeTransactionCapability` → e.g. `resolveProcess`
     (`useFigaroActions`) *(on-chain, buyer-only atomic settlement)*

**Emissions reporting** (worked example of a derived self-gating panel): a
designer-time GHG-standard clause (`figaro-ghg-iso-14064-v1` etc. →
`submit-disclosure-commitment`) paired with a runtime grams clause
(`figaro-ghg-measurement-v1` → `submit-disclosure-inventory`) surface as
capabilities; `GHGWorkflowPanel` (mounted in `OrderTimelineView`) drives
`executeCapability` → `useGHGDisclosure` (`encodeMeasurementGramsContent`) →
`attestAsSeller`. The disclosure feeds the audit bundle via
`lib/audit/emissionsExtract`.

### Phase 4 — in-flight & known issues

- **`clauseId`→surface registry (pending).** The self-gating panels
  (GHG / auction / offset / settlement) still mount in `OrderTimelineView` partly
  **by name**; the goal is generic mounting keyed on `clauseId`.
- **Proximity device-witness.** Proofs submit `PROXIMITY_DEVICE_SIG_PLACEHOLDER`;
  real BLE/NFC/Wi-Fi capture is unbuilt.
- **`activeBondSum` reconstruction** (`TokenBalances`) — the frozen kernel has no
  aggregation getter; reconstructed from per-order events.
- **Settlement provenance** (`SettlementProceedsPanel` TODO) — proceeds shown
  without the per-order attestation trail.
- Coverage gaps: runtime e2e `btn-*`→`capability-execute-*` migration;
  `BatchVerifier` settlement e2e; kit-assembly multi-role (each party exercises
  its clause); zero error-path specs.

---

**Pipeline complete (Design · Adopt · Checkout · Runtime).**

---

## Off-protocol auxiliaries

External services a party uses **outside** the bilateral commitment, then anchors
back into the process. The unifying pattern: a contract counterparty **cannot
bond** (the kernel is ECDSA-only / EOA, no EIP-1271), so the swap venue /
arbitration forum / offset aggregator operates off-protocol — the party performs
the external action, then records it via an external tx + attestation against the
process. **The kernel commitment stays bilaterally signed (executor ≠
counterparty); alternative providers are valid permissionless extensions** (do
not couple to Uniswap / Kleros / Klima by name).

| Auxiliary | clause / contract | frontend | external service | status |
|---|---|---|---|---|
| **Swap** (pay-in-another-token) | `SwapAndCommitCoordinator` (`src/`) | `tokenConversion.ts` (Uniswap V3 quoter) — quote/display only | Uniswap (Permit2 + Universal Router) | **built-but-not-wired** — contract + Foundry exist; not in `Deploy.s.sol`; no checkout wiring |
| **Arbitration** | `figaro-arbitration-kleros-v1` + validator; `MockKlerosArbitrableProxy` | `lib/dispute/` (`klerosProxy` / `klerosCourts` / `klerosEvidence` / `processJurisdiction`) + `/dispute` | Kleros court (off-chain adjudication) | wired (mock on devnet); provider-agnostic — Kleros is one forum |
| **Offsets** | `figaro-offset-policy-v1`; `ProcessOffsetReceipt` (deployed) | `useOffsetRetirement` + `offsetAggregators` | Klima / Toucan aggregator (Polygon; `MockOffsetAggregator` on devnet) | wired (Path A: retire externally → `ProcessOffsetReceipt.record` → audit reads it) |

**Load-bearing facts**

1. Each is its own artifact family / anchor — offset receipts are **not**
   attestations (no agreement clause, no inclusion proof), a separate primitive.
2. The kernel never depends on any of them; they reference the process
   **read-only** (e.g. `ProcessOffsetReceipt` gates on `rootBuyer`).
3. Dispute resolution is **provider-agnostic** — do not couple naming to Kleros.

**Not an off-protocol auxiliary:** `DutchAuction` is an **internal coordination
mechanism** (a Figaro contract, standalone), not an external service. It's
integrated at **checkout** for the `dutch-auction` coordination value
(`SellerAuctionPanel` / the deferred-claim courier path) — "isolated" as a
contract (no on-chain deps), but used in the Phase-3 flow.

---

## Frontend subsystems (cross-cutting)

Live `lib/` subsystems the four-phase pipeline touches but doesn't deep-map.
Verified against source.

### Evidence export — `lib/audit/` (14 files)

The immutable-evidence pillar's frontend. `buildAuditBundle(inputs)` composes the
per-order extractors — `billOfLadingExtract`, `invoiceExtract`, `emissionsExtract`,
`proximityExtract`, `dutchAuctionExtract`, `sellerRegistryExtract`,
`processLogsExtract`, `contractExtract` — into an `AuditBundle`, rendered by
`pdfBundle` / `auditBundlePdf` and consumed by the **`/audit/[processId]`** surface
(recompute each hash against user-supplied content). Financials
(`lib/semantic/financialsProjection`) are composed alongside.

### Handoff coordination — `lib/handoff/` (10 files)

The off-chain secure channel for a physical handoff. Per-order ephemeral
secp256k1 keypairs (`ephemeralKeys`) + **ECDH** agreement (`ecdh`) over a
`CoordinationChannel` (`xmtpChannel` real / `mockChannel` devnet); `handoffIntent`
/ `handoffKeys` / `handoffArtifacts`; `useHandoffCleanup` purges keys on terminal
order events. This is the substrate beneath the hand-off / proximity clauses.
- **Vestigial:** `manifest.ts` — the on-chain codec was removed; now geohash/
  logistics utils (backlog sense-D rename, open).
- **Unbuilt:** device-witness capture (`PROXIMITY_DEVICE_SIG_PLACEHOLDER`) — the
  real QR / BLE / NFC sensor path; and the `virtual` modality (digital handoff,
  `figaro-content-handoff-v1`) has no implementation.

### Dispute evidence — `lib/dispute/` (9 files)

Beyond the Kleros proxy (auxiliaries facet): `evidenceTimeline` builds a
`ProcessTimeline` from coordinator events; `deliveryAttestation` carries
`PhotoGPSAttestation` + `GeohashMatchAttestation`. Feeds the **provider-agnostic**
arbitration forum.

### geohash (cross-cutting geo)

The geo-proximity primitive, anchored in `figaro-geo-v2`, used across
`deliveryAttestation` (geohash-match), `discoveryService` (seller location), and
`lib/handoff`. A concern, not a single module — no one home.

### Surfaces outside the protocol pipeline

- **`/consent`** — the Figaro Beta consent ceremony (beta-governance / "Project
  Operator"). Deliberately not a protocol surface; backlog tracks reconsidering
  the vocabulary (it fights the ownerless doctrine).
- **`components/modules/SellerBrandingModule.tsx`** — live (seller branding, used
  by `SellerDetailView`/`Watermark`) but a **V4 naming vestige**: the `modules/` +
  `Module` suffix is the retired module-registry vocabulary (backlog V4→V5
  residual — there is no module-registry runtime).

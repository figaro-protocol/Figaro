# Frontend — Structure

Next.js 14 (App Router), TypeScript, Tailwind CSS. **`frontend/` is the only
active frontend.** The prior V4 frontend was moved to `archive-frontend/` on
2026-04-26 and untracked from the repo in `a6110c6` (2026-05-24); it is not
present in fresh clones. If a frontend change is needed, it ships in
`frontend/` only.

CLAUDE.md keeps the active-frontend declaration and indexes this file; the per-route catalogue, lib map, designer surface, and wallet-provider scope live here.

## Routes (`frontend/app/`)

Audit by `ls app/(marketing)/ app/(app)/`. Source of truth is the directory listing, not this paragraph.

**`(marketing)/` (no wallet provider):** `/` (root), `/agents`, `/assemblies`, `/builders` (hub), `/builders/composability`, `/cryptoeconomics`, `/integrate`, `/local-commerce` (worked example), `/physics`, `/protocol`, `/rpgf`, `/clauses`, `/spec`, `/users`, `/why`. The `/clauses` and `/assemblies` inventories read on-chain state event-driven through the standalone `publicClient` — marketing-tier reads do not require the wallet provider.

**`(app)/` (wallet provider mounted):** `/audit` + `/audit/[processId]`, `/builders/designer` (landing), `/builders/designer/new`, `/builders/designer/edit/[slug]`, `/builders/designer/view/[slug]`, `/consent` (beta-only ceremony), `/discover` (seller catalogue), `/dispute` (beta-consent dispute), `/evidence-display` (Kleros juror iframe target), `/fig` (transactional surface, with `/fig/claim`), `/s/[seller]` (seller detail + cart), `/sellers` (enrolment) + its sub-routes `/sellers/{agents,assemblies,catalogue,identity,review}` and `/sellers/edit/{agents,assemblies,catalogue,identity}`, `/orders` (the wallet's actor-neutral order list — buyer + seller, with the "Your turn" accept section), `/orders/[processId]` (per-order live timeline), `/sign`. (`/builders` and `/builders/composability` are `(marketing)/` pages, not `(app)/`.)

**API:** `/api/geocode`.

**Consumer flow** (May 2026 split, replaces the prior `/i/[slug]` seller-runtime shape):
- Buyers: `/discover` → `/s/[seller]` (browse + cart) → `/orders/[processId]` (live timeline + Confirm receipt) → `/orders` (history).
- Sellers: `/orders` (the "Your turn" section — incoming to accept, then in-progress + completed) → `/orders/[processId]` (fire merchant-process events).
- Builders: `/builders/designer/view/[slug]` (assembly inspector). The prior `/i/[slug]` route was deleted; its inbound bookmarks redirect to `/discover`.

The `/builders/designer` tool is a DAG editor (`ProcessGraphCanvas` + `AgreementDrawer`); the palette/canvas/inspector three-column shape was rejected as "wrong-direction" during this project's evolution.

## Key Library Areas (`lib/`)

Tiered, bottom to top; each tier imports only what sits below it (enforced by `scripts/lint-lib-import-direction.sh`).

- **`shared/`** — the generic leaf: EVM helpers (`evm.ts`), wagmi/chain config (`wagmi.ts`, `chains.ts`, `connectors.ts`), IPFS (`ipfsService.ts`), clause-spec cache source (`clauseSpecSource.ts`), assembly-template reading vocabulary (`assemblyTemplate.ts`, `clauseFields.ts`), errors/formatting/json. Imports no other `lib/` layer; the one sanctioned exception is the runtime-services DI seam (`runtimeServices.ts` + `runtimeServicesContext.tsx`), which assembles feature-layer service implementations.
- **`kernel/`** — the FigaroCore seam: commit/resolve writes (`useFigaroActions.ts`, `orderCommitted.ts`), order-event reads (`indexer.ts`, `walletProcessQueries.ts`, `eventCache.ts`), commitment + agreement hashing (`signedCommitment.ts`, `orderAgreement.ts`, `agreementFetch.ts`, `agreementSections.ts`), chain config (`contracts.ts` — the five core contract ABIs + ERC20, SDK-sourced), the `Order` domain types + UI store (`store.ts`). Imports only `shared/`.
- **`protocol/`** — the registry tier: `useClauseRegistry.ts`, `useClauseSpecs.ts`, `useAssemblyRegistry.ts`, `assemblyChoices.ts`, `sellerRegistryIndexer.ts`. Reads ClauseRegistry / SellerRegistry / AssemblyRegistry; imports `kernel/` + `shared/`.
- **`agent/`** — did:web identity for agents acting for wallets (`useDidWeb.ts`)
- **`audit/`** — audit-bundle assembly + dispute evidence (read path for `/audit/[processId]`)
- **`checkout/`** — the Checkout lifecycle phase: cart (`cartStore.ts`, `CommerceProvider.tsx`, `useCheckout.ts`), the assembly commit algorithm + sub-order planner (`assemblyCheckout.ts`, `assemblySubOrderPlan.ts`), and the commitment choreography (`draftOrders.ts`, `orderPreview.ts`, `orderCommitmentFlow.ts`, `orderSignedAndShared.ts`, `orderPendingSellerSignature.ts`)
- **`composition/`** — third-party on-network contract composition (the fifth noun): the generic dispatch (`compositionTarget.ts`, `useCompositionActions.ts`) + per-contract hooks/readers
- **`designer/`** — assembly authoring: synthetic DAG session + autosave + fork + publish (`syntheticProcess.ts`, `syntheticDesignStore.ts`, `forkAssembly.ts`, `assemblyTemplateToDraft.ts`, `buildAssemblyTemplate.ts`, `publishAssembly.ts`)
- **`handoff/`** — handoff-clause runtime: ECDH key exchange, coordination-messaging + handoff-persistence services (`coordinationMessagingService.ts`, `handoffPersistenceService.ts`)
- **`seller/`** — seller profile + catalogue management, the discovery-service implementation (`discoveryService.ts`)
- **`semantic/`** — runtime derivation from committed state: `deriveProcessModelFromRuntime.ts`, `processTopology.ts`, `processRecourse.ts`, `models.ts`, capability execution

## Designer tool surface (`frontend/`)

The Designer is a DAG editor — assembly designers start blank or fork an existing published assembly, modify the bonded-process DAG on the canvas, edit per-node clauses in a side drawer, save drafts to local storage, and publish to the on-chain `AssemblyRegistry` when ready. The canvas DAG is an assembly-tier composition; the kernel itself only ever sees the linear `commit` chains that result at runtime. The three-column palette/canvas/inspector shape was rejected during this project's evolution.

**Routes:**
- `/builders/designer` — landing. Three sections: drafts (`<DraftsList>`, localStorage), the wallet's published assemblies (`<PublishedList>`, reconstructed from `AssemblyRegistered` events), and the clauses catalogue (`<ClausesList>`, read from `ClauseRegistry`).
- `/builders/designer/new` — blank DAG editor. Three init paths: `?draft=slug` query, autosaved current session, or fresh blank.
- `/builders/designer/edit/[slug]` — fork an existing published assembly into the editor.
- `/builders/designer/view/[slug]` — read-only view of a published assembly.

**Components (`app/(builders)/builders/designer/_components/`):**
- `DesignerCanvas.tsx` — the shared editor surface used by `/new` and `/edit/[slug]`. Hosts the toolbar (← Assemblies | name | saved hint | Save | Publish | Reset), the DAG canvas, the agreement drawer, and the autosave loop.
- `AgreementDrawer.tsx` — per-node clause composer. Two tabs: Parties (buyer / seller / DAG position) and a network-driven **Registry** tab listing every clause registered on `ClauseRegistry` (grouped by `block.article`), each a checkbox that expands to single-select design-time field choices. Checked clauses + their values are captured into the no-hash assembly template (`clausesByOrderId` → `buildAssemblyTemplate`). No hardcoded clause roster.
- `DraftsList.tsx` — saved-drafts list on the landing.
- `PublishedList.tsx` — published-assemblies list for the connected wallet.
- `ClausesList.tsx` — clauses catalogue on the landing.
- Shared DAG canvas: `components/core/ProcessGraphCanvas.tsx` (drag green handle to spawn sub-orders; drag onto another node to merge fan-in; click edge pill to swap modality).

**State:** `lib/designer/syntheticProcess.ts` (synthetic session + DAG mutation helpers — `createSyntheticRootOrder`, `createSyntheticSubOrder`, `mergeSyntheticParent`, `editSyntheticAgreement`, `collectDescendants`, `isRootOrder`). Persistence: `lib/designer/syntheticDesignStore.ts` (localStorage). Bridge: `lib/designer/forkAssembly.ts` + `lib/designer/assemblyTemplateToDraft.ts` (fork a published assembly's template into an editable draft).

## Clause validation in the frontend

- `useClauseValidator(clauseId)` hook (`hooks/core/`) — binds `validateContent`
  to a form value. `{ isReady, validate, loadError }`.
- `clauseSpecSource.ts` — the module spec cache. No bundled copy and no
  preload: `useClauseSpecs` warms it chain→IPFS via `loadClauseSpec(id, uri)`
  from `ClauseRegistered` events (17 protocol clauses on the devnet — 16
  runtime-attestable + 2 agreement-only (`figaro-topology`,
  plus any third-party registrations);
  spec-consuming surfaces gate on its `loaded`.

## Components (`components/`)

- **`core/`** — order flows, bond/token, builder/assembly, semantic. Assembly rendering shell: `AssemblyProcessWorkspace` (all `Institution*` names have been renamed)
- **`marketing/`** — marketing-route layout primitives (`MarketingHeader`, `MarketingHero`, `MarketingSection`)
- **`modules/`** — feature modules (e.g. `SellerBrandingModule`). The prior module registry and the `/i/[slug]` runtime that rendered registered modules were retired in the V4→V5 narrowing; consumer surfaces are now purpose-shaped pages (`/s/[seller]`, `/orders`, `/orders/[processId]`).
- **`shared/`** — shell/utility; **`ui/`** — design primitives; **`icons/`** — SVGs; **`sellers/`** — route-specific panels (onboarding shell + edit forms)

## Canonical exemplars — copy these shapes

When building a new surface, anchor on the canonical implementation of its
surface-type below — extend or mirror it; never generate the shape from
scratch. (The base-model default shape is a closed-world product app; the
nearest exemplar in this repo beats it. Commission work as "make X work like
Y", not as an open-ended build.)

- **Runtime (phase-4) order surface** — `components/core/CapabilityRail.tsx`,
  driven by `deriveProcessModelFromRuntime` → `executeCapability`. The order
  page names NO clause (guard: `scripts/lint-no-hardcoded-clauses-in-runtime.sh`).
- **Clause-composition UI** — `app/(builders)/builders/designer/_components/AgreementDrawer.tsx`
  (reads ClauseRegistry live; grouping word is `block.article`).
- **On-chain write flow** — `lib/seller/usePublishSellerProfile.ts`
  (`simulateContract` → write → `waitForTransactionReceipt` → verify
  `status === "success"` before navigating).
- **IPFS-hydrated reads** — `hooks/core/useProcessAgreements.ts` over
  `lib/kernel/agreementFetch.ts` (singleton Map; never a synchronous
  `loadAgreement` in a render path).
- **Event-driven inventory page + smoke** — the `/clauses` and `/assemblies`
  marketing pages with `tests/e2e/clauses-inventory.devnet.spec.ts` /
  `tests/e2e/assemblies-inventory.devnet.spec.ts`.
- **Scenario e2e pair** — `tests/e2e/scenario-direct-sale.devnet.spec.ts`
  (pins to IPFS + anchors on-chain, persisted) and
  `tests/e2e/direct-sale-runtime.devnet.spec.ts` (consumes from chain + IPFS;
  discovers, never imports a roster).
- **Network reads** — `lib/kernel/indexer.ts` (order events) + `lib/protocol/sellerRegistryIndexer.ts` (registry events) (the canonical read side; reconstructs
  process/clause/seller state from chain events).

## Wallet-provider scope per route

Every route in `frontend/app/` is classified into one of three tiers
governing wallet-provider load:

- **Marketing** — pure publication / explanation. Lives in `app/(marketing)/`; does not load the wallet provider. Current routes: `/`, `/agents`, `/assemblies`, `/builders`, `/builders/composability`, `/cryptoeconomics`, `/integrate`, `/local-commerce`, `/physics`, `/protocol`, `/rpgf`, `/clauses`, `/security`, `/spec`, `/users`, `/why`.
- **Reference / read-only (in `(app)/`)** — registries / tools whose primary purpose is read-only inspection but which mount the wallet provider for inline write affordances via `WalletGate`. Current: `/builders/designer*` (drafts in localStorage), `/discover` (seller catalogue), `/audit` + `/audit/[processId]` (audit / forensics), `/s/[seller]` (read-mode catalogue with WalletGate-protected place-order CTA). The `/builders` hub and `/builders/composability` are publication pages and live in `(marketing)/`.
- **Transactional** — primary purpose is signing or sending transactions; lives in `app/(app)/`; requires a connected wallet. Current: `/sign`, `/sellers`, `/fig`, `/fig/claim`, `/dispute` (beta-consent disputes), `/consent` (beta-only ceremony), `/evidence-display` (Kleros juror iframe target), `/orders` (the wallet's actor-neutral order list — buyer + seller; the "Your turn" section is where counter-sign/accept fires) + `/orders/[processId]` (per-order timeline; resolveProcess fires here).

**Rules:**

1. Do NOT gate read-only pages behind `useAccount` / `isConnected`. Wallet-connect is a signing prerequisite, not a login. A user who has never connected must be able to read every Reference / read-only and Marketing route.
2. For inline write affordances on Reference pages, use `WalletGate` (the canonical inline-gate wrapper).
3. The `(marketing)` / `(app)` route-group split is in place: `app/(marketing)/layout.tsx` does NOT mount `<Providers>`; only `app/(app)/layout.tsx` does. Marketing pages still read on-chain state via the standalone `publicClient` exported from `lib/shared/wagmi.ts` — `/clauses` and `/assemblies` are the canonical event-driven marketing inventory pages.

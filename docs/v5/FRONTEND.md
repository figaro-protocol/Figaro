# Frontend — Structure

Next.js 14 (App Router), TypeScript, Tailwind CSS. **`frontend/` is the only
active frontend.** The prior V4 frontend was moved to `archive-frontend/` on
2026-04-26 and untracked from the repo in `a6110c6` (2026-05-24); it is not
present in fresh clones. If a frontend change is needed, it ships in
`frontend/` only.

CLAUDE.md keeps the active-frontend declaration and indexes this file; the per-route catalogue, lib map, designer surface, and wallet-provider scope live here.

## Routes (`frontend/app/`)

Audit by `ls app/(marketing)/ app/(app)/`. Source of truth is the directory listing, not this paragraph.

**`(marketing)/` (no wallet provider):** `/` (root), `/assemblies`, `/builders` (hub), `/builders/composability`, `/integrate`, `/local-commerce` (worked example), `/protocol`, `/research`, `/rpgf`, `/schemas`, `/spec`. The `/schemas` and `/assemblies` inventories read on-chain state event-driven through the standalone `publicClient` — marketing-tier reads do not require the wallet provider.

**`(app)/` (wallet provider mounted):** `/audit` + `/audit/[processId]`, `/builders/designer` (landing), `/builders/designer/new`, `/builders/designer/edit/[slug]`, `/builders/designer/view/[slug]`, `/consent` (beta-only ceremony), `/discover` (operator catalogue), `/dispute` (beta-consent dispute), `/evidence-display` (Kleros juror iframe target), `/fig` (transactional surface, with `/fig/claim`), `/inbox` (merchant inbox), `/m/[merchant]` (merchant detail + cart), `/operators` (enrolment) + its sub-routes `/operators/{agents,assemblies,catalogue,identity,review}` and `/operators/edit/{agents,assemblies,catalogue,identity}`, `/orders` (buyer order list), `/orders/[processId]` (per-order live timeline), `/sign`. (`/builders` and `/builders/composability` are `(marketing)/` pages, not `(app)/`.)

**API:** `/api/geocode`.

**Consumer flow** (May 2026 split, replaces the prior `/i/[slug]` operator-runtime shape):
- Buyers: `/discover` → `/m/[merchant]` (browse + cart) → `/orders/[processId]` (live timeline + Confirm receipt) → `/orders` (history).
- Merchants: `/inbox` (incoming + active + completed) → `/orders/[processId]` (fire merchant-process events).
- Builders: `/builders/designer/view/[slug]` (assembly inspector). The prior `/i/[slug]` route was deleted; its inbound bookmarks redirect to `/discover`.

The `/builders/designer` tool is a DAG editor (`ProcessGraphCanvas` + `AgreementDrawer`); the palette/canvas/inspector three-column shape was rejected as "wrong-direction" during this project's evolution.

## Key Library Areas (`lib/`)

- **`core/`** — FigaroCore hooks, commitment/agreement utilities
- **`audit/`** — Audit-bundle assembly + verification (read path for `/audit/[processId]`)
- **`commerce/`** — Checkout / cart provider (`CommerceProvider`, `useCheckout`)
- **`designer/`** — Synthetic DAG session + autosave + fork (`syntheticProcess.ts`, `syntheticDesignStore.ts`, `forkAssembly.ts`, `manifestToDraft.ts`, `deriveDesignSurface.ts`, `agreementHints.ts`)
- **`dispute/`** — Kleros evidence, delivery attestation 4 modes
- **`handoff/`** — ECDH key exchange, per-order encryption
- **`mechanisms/`** — Mechanism hooks (Dutch auction, courier process, DID:web, attestation coordinator, FIG token, …)
- **`operators/`** — Operator-profile / onboarding state helpers
- **`seller/`** — Seller-side catalogue / merchant helpers
- **`semantic/`** — Runtime-process model derivation: `deriveProcessModelFromRuntime.ts`, `financialsProjection.ts`, `models.ts`
- **`shared/`** — Wagmi config (`chains.ts`, `connectors.ts`, `rpc.ts`), IPFS (`ipfsService.ts`), schema specs (`schemaSpecSource.ts` + `schemas/`), operator + catalogue metadata (`operatorProfileMetadata.ts`, `sellerCatalogueMetadata.ts`, `discoveryService.ts`), slug↔label tables (`assemblyLabels.ts`)

## Designer tool surface (`frontend/`)

The Designer is a DAG editor — assembly designers start blank or fork an existing published assembly, modify the bonded-process DAG on the canvas, edit per-node clauses in a side drawer, save drafts to local storage, and publish to the on-chain `AssemblyRegistry` when ready. The canvas DAG is an assembly-tier composition; the kernel itself only ever sees the linear `commit` chains that result at runtime. The three-column palette/canvas/inspector shape was rejected during this project's evolution.

**Routes:**
- `/builders/designer` — landing. Three sections: drafts (`<DraftsList>`, localStorage), the wallet's published assemblies (`<PublishedList>`, reconstructed from `AssemblyRegistered` events), and the schemas catalogue (`<SchemasList>`, read from `SchemaRegistry`).
- `/builders/designer/new` — blank DAG editor. Three init paths: `?draft=slug` query, autosaved current session, or fresh blank.
- `/builders/designer/edit/[slug]` — fork an existing published assembly into the editor.
- `/builders/designer/view/[slug]` — read-only view of a published assembly.

**Components (`app/(app)/builders/designer/_components/`):**
- `DesignerCanvas.tsx` — the shared editor surface used by `/new` and `/edit/[slug]`. Hosts the toolbar (← Assemblies | name | saved hint | Save | Publish | Reset), the DAG canvas, the agreement drawer, and the autosave loop.
- `AgreementDrawer.tsx` — per-node clause editor (Geo / GHG / Topology baseline-graph clauses + the rest of the agreement surface).
- `DraftsList.tsx` — saved-drafts list on the landing.
- `PublishedList.tsx` — published-assemblies list for the connected wallet.
- `SchemasList.tsx` — schemas catalogue on the landing.
- Shared DAG canvas: `components/core/ProcessGraphCanvas.tsx` (drag green handle to spawn sub-orders; drag onto another node to merge fan-in; click edge pill to swap fulfilment method).

**State:** `lib/designer/syntheticProcess.ts` (synthetic session + DAG mutation helpers — `createSyntheticRootOrder`, `createSyntheticSubOrder`, `swapSyntheticFulfilmentMethod`, `mergeSyntheticParent`, `editSyntheticAgreement`, `collectDescendants`, `isRootOrder`). Persistence: `lib/designer/syntheticDesignStore.ts` (localStorage). Bridge: `lib/designer/forkAssembly.ts` + `lib/designer/manifestToDraft.ts` (fork a published assembly's manifest into an editable draft).

## Schema validation in the frontend

- `useSchemaValidator(schemaId)` hook (`hooks/core/`) — binds `validateContent`
  to a form value. `{ isReady, validate, loadError }`.
- `schemaSpecSource.ts` — preloads built-in specs at module load (17 schemas in
  `lib/shared/schemas/` — 16 runtime-attestable + the manifest-only
  `figaro-topology-v1`); supports async `loadSchemaSpec(id, uri)` for
  IPFS-resolved specs.

## Components (`components/`)

- **`core/`** — order flows, bond/token, builder/assembly, semantic. Assembly rendering shell: `AssemblyProcessWorkspace` (all `Institution*` names have been renamed)
- **`marketing/`** — marketing-route layout primitives (`MarketingHeader`, `MarketingHero`, `MarketingSection`)
- **`modules/`** — feature modules (e.g. `MerchantBrandingModule`). The prior module registry and the `/i/[slug]` runtime that rendered registered modules were retired in the V4→V5 narrowing; consumer surfaces are now purpose-shaped pages (`/m/[merchant]`, `/orders/[processId]`, `/inbox`).
- **`shared/`** — shell/utility; **`ui/`** — design primitives; **`icons/`** — SVGs; **`operators/`** — route-specific panels (onboarding shell + edit forms)

## Wallet-provider scope per route

Every route in `frontend/app/` is classified into one of three tiers
governing wallet-provider load:

- **Marketing** — pure publication / explanation. Lives in `app/(marketing)/`; does not load the wallet provider. Current routes: `/`, `/assemblies`, `/builders`, `/builders/composability`, `/integrate`, `/local-commerce`, `/protocol`, `/research`, `/rpgf`, `/schemas`, `/spec`.
- **Reference / read-only (in `(app)/`)** — registries / tools whose primary purpose is read-only inspection but which mount the wallet provider for inline write affordances via `WalletGate`. Current: `/builders/designer*` (drafts in localStorage), `/discover` (operator catalogue), `/audit` + `/audit/[processId]` (audit / forensics), `/m/[merchant]` (read-mode catalogue with WalletGate-protected place-order CTA). The `/builders` hub and `/builders/composability` are publication pages and live in `(marketing)/`.
- **Transactional** — primary purpose is signing or sending transactions; lives in `app/(app)/`; requires a connected wallet. Current: `/sign`, `/operators`, `/fig`, `/fig/claim`, `/dispute` (beta-consent disputes), `/consent` (beta-only ceremony), `/evidence-display` (Kleros juror iframe target), `/orders` + `/orders/[processId]` (buyer order list + per-order timeline; resolveProcess fires here), `/inbox` (merchant inbox; counter-sign + merchant-process attestations fire here).

**Rules:**

1. Do NOT gate read-only pages behind `useAccount` / `isConnected`. Wallet-connect is a signing prerequisite, not a login. A user who has never connected must be able to read every Reference / read-only and Marketing route.
2. For inline write affordances on Reference pages, use `WalletGate` (the canonical inline-gate wrapper).
3. The `(marketing)` / `(app)` route-group split is in place: `app/(marketing)/layout.tsx` does NOT mount `<Providers>`; only `app/(app)/layout.tsx` does. Marketing pages still read on-chain state via the standalone `publicClient` exported from `lib/shared/wagmi.ts` — `/schemas` and `/assemblies` are the canonical event-driven marketing inventory pages.

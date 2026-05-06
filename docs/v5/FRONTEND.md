# Frontend — Structure

Next.js 14 (App Router), TypeScript, Tailwind CSS. **`frontend/` is the only
active frontend.** The prior frontend was archived to
`archive-frontend/` on 2026-04-26 — do not edit it. If a frontend change is
needed, it ships in `frontend/` only.

CLAUDE.md keeps the active-frontend declaration and indexes this file; the per-route catalogue, lib map, designer surface, and wallet-provider scope live here.

## Routes (`frontend/app/`)

Audit by `ls app/(marketing)/ app/(app)/`. Source of truth is the directory listing, not this paragraph.

**`(marketing)/` (no wallet provider):** `/` (root), `/about`, `/compliance`, `/composability`, `/cryptoeconomics`, `/fig` (informational, no wallet), `/groups`, `/integrate`, `/local-commerce` (worked example), `/protocol`, `/schemas`, `/spec`.

**`(app)/` (wallet provider mounted):** `/audit/[processId]`, `/builders` (hub), `/builders/designer` (landing), `/builders/designer/new`, `/builders/designer/edit/[slug]`, `/builders/designer/view/[slug]`, `/consent` (beta-only ceremony), `/console`, `/discover` (operator catalogue), `/dispute` (beta-consent dispute), `/evidence-display` (Kleros juror iframe target), `/fig` (transactional surface, with `/fig/claim`), `/inbox` (merchant inbox), `/m/[merchant]` (merchant detail + cart), `/operators` (enrolment), `/orders` (buyer order list), `/orders/[processId]` (per-order live timeline), `/sign`, `/terminal`.

**API:** `/api/semantic/agreements`, `/api/semantic/agreements/[agreementHash]`, `/api/semantic/assemblies`, `/api/semantic/runtime`.

**Consumer flow** (May 2026 split, replaces the prior `/i/[slug]` operator-runtime shape):
- Buyers: `/discover` → `/m/[merchant]` (browse + cart) → `/orders/[processId]` (live timeline + Confirm receipt) → `/orders` (history).
- Merchants: `/inbox` (incoming + active + completed) → `/orders/[processId]` (fire merchant-process events).
- Builders: `/builders/designer/view/[slug]` (assembly inspector). The prior `/i/[slug]` route was deleted; its inbound bookmarks redirect to `/discover`.

The `/builders/designer` tool is a DAG editor (`ProcessGraphCanvas` + `AgreementDrawer`); the palette/canvas/inspector three-column shape was rejected as "wrong-direction" — see `feedback_designer_dag_is_canonical.md`.

## Key Library Areas (`lib/`)

- **`core/`** — FigaroCore hooks, commitment/agreement utilities
- **`dispute/`** — Kleros evidence, delivery attestation 4 modes
- **`handoff/`** — ECDH key exchange, per-order encryption
- **`mechanisms/`** — Mechanism hooks, package registry
- **`semantic/`** — Assembly derivation and capability models. Key entries: `deriveAssemblyModel.ts`, `deriveAssemblyCapabilities.ts`, `models.ts`
- **`shared/`** — Wagmi config, runtime identity, assembly schema/parser/registry/validation, IPFS. Key entries: `assembly.ts` (schema types), `assemblyParser.ts`, `assemblyRegistry.ts`, `assemblyValidation.ts`, `assemblyPublication.ts`, `runtimeResolution.ts`, `moduleRegistry.ts`, `blockMetadata.ts` (designer block registry — see below), `schemaSpecSource.ts` (preloaded + lazy-fetched schema specs), `schemas/` (built-in schema spec JSONs)
- **`commerce/`**, **`console/`**, **`marketplace/`**

## Block model (designer-tool foundation)

`lib/shared/blockMetadata.ts` defines `BlockMetadata` — the composable unit
the designer palette renders. A block bundles **schema(s) + backend + UI module(s)**.
Categories: `mechanism` / `schema` / `handoff` / `display` / `shell`. Registry
is in-memory, populated by `registerAllModules()`, with a dev-only invariant
(`assertBlockMetadataIntegrity`) that asserts every registered moduleId has
a metadata entry. Block arrays exported by `registerAllModules.ts`:
`PACKAGE_BLOCKS`, `STANDALONE_BLOCKS`, `SHELL_BLOCKS`. Designer code consumes
via `listBlockMetadata()` / `listBlocksByCategory(category)` / `getBlockForModule(moduleId)`.

## Designer tool surface (`frontend/`)

The Designer is a DAG editor — assembly designers fork a reference assembly or start blank, modify the bonded-process DAG on the canvas, edit per-node clauses in a side drawer, and save drafts to local storage. The canvas DAG is an assembly-tier composition; the kernel itself only ever sees the linear `commit` chains that result at runtime. The three-column palette/canvas/inspector shape was rejected during this project's evolution — see `feedback_designer_dag_is_canonical.md`.

**Routes:**
- `/builders/designer` — landing. Lists local drafts (`<DraftsList>`) and the 6 forkable reference assemblies (`REFERENCE_ASSEMBLIES`).
- `/builders/designer/new` — blank DAG editor. Three init paths: `?draft=slug` query, autosaved current session, or fresh blank.
- `/builders/designer/edit/[slug]` — fork an existing reference assembly into the editor.
- `/builders/designer/view/[slug]` — read-only view of a reference assembly.

**Components:**
- `components/core/ProcessGraphCanvas.tsx` — the DAG canvas. Drag green handle to spawn sub-orders; drag onto another node to merge fan-in; click edge pill to swap fulfilment method.
- `components/core/designer/AgreementDrawer.tsx` — per-node clause editor (Geo / GHG / Topology baseline-graph clauses).
- `components/core/designer/DraftsList.tsx` — saved-drafts list on the landing.

**State:** `lib/designer/syntheticProcess.ts` (synthetic session + DAG mutation helpers — `createSyntheticRootOrder`, `createSyntheticSubOrder`, `swapSyntheticFulfilmentMethod`, `mergeSyntheticParent`, `editSyntheticAgreement`, `collectDescendants`, `isRootOrder`). Persistence: `lib/designer/syntheticDesignStore.ts` (localStorage). Bridge: `lib/designer/assemblyToSyntheticOrders.ts` (forks an `Assembly` into an `Order[]`).

No publish-to-registry path exists today; saved drafts stay in localStorage. `DesignerPublishDrawer.tsx` was specified in this doc historically but never built.

## Schema validation in the frontend

- `useSchemaValidator(schemaId)` hook (`hooks/core/`) — binds `validateContent`
  to a form value. `{ isReady, validate, loadError }`.
- `schemaSpecSource.ts` — preloads built-in specs at module load (15 local-commerce
  schemas live in `lib/shared/schemas/`); supports async `loadSchemaSpec(id, uri)`
  for IPFS-resolved specs.

## Components (`components/`)

- **`core/`** — order flows, bond/token, builder/assembly, semantic. Assembly rendering shells: `AssemblyShell`, `AssemblyInspector`, `AssemblyProcessWorkspace`, `RegisteredAssemblyWorkspace` (all `Institution*` names have been renamed)
- **`modules/`** — composable mechanism components registered via `registerAllModules.ts`. Module registry remains for assembly-tier composition (designer view, future tooling); the prior consumer-facing `/i/[slug]` runtime that rendered them was deleted in favour of purpose-shaped pages (`/m/[merchant]`, `/orders/[processId]`, `/inbox`).
- **`shared/`** — shell/utility; **`ui/`** — design primitives; **`icons/`** — SVGs; **`console/`** and **`operators/`** — route-specific panels

## Wallet-provider scope per route

Every route in `frontend/app/` is classified into one of three tiers
governing wallet-provider load:

- **Marketing** — pure publication / explanation. Lives in `app/(marketing)/`; does not load the wallet provider. Current routes: `/`, `/about`, `/compliance`, `/composability`, `/cryptoeconomics`, `/fig` (informational), `/groups`, `/integrate`, `/local-commerce`, `/protocol`, `/schemas`, `/spec`.
- **Reference / read-only (in `(app)/`)** — registries / tools whose primary purpose is read-only inspection but which mount the wallet provider for inline write affordances via `WalletGate`. Current: `/builders` (hub, currently publication-shaped — could move to `(marketing)/`), `/builders/designer*` (drafts in localStorage), `/discover` (operator catalogue), `/audit/[processId]` (audit / forensics), `/m/[merchant]` (read-mode catalogue with WalletGate-protected place-order CTA).
- **Transactional** — primary purpose is signing or sending transactions; lives in `app/(app)/`; requires a connected wallet. Current: `/terminal`, `/sign`, `/operators`, `/console`, `/fig`, `/fig/claim`, `/dispute` (beta-consent disputes), `/consent` (beta-only ceremony), `/evidence-display` (Kleros juror iframe target), `/orders` + `/orders/[processId]` (buyer order list + per-order timeline; resolveProcess fires here), `/inbox` (merchant inbox; counter-sign + merchant-process attestations fire here).

**Rules:**

1. Do NOT gate read-only pages behind `useAccount` / `isConnected`. Wallet-connect is a signing prerequisite, not a login (see `feedback_wallet_connect_not_auth.md`). A user who has never connected must be able to read every Reference / read-only and Marketing route.
2. For inline write affordances on Reference pages, use `WalletGate` (the canonical inline-gate wrapper).
3. The current root layout loads `<Providers>` (WagmiProvider + RainbowKit) for every route, so Marketing pages technically load the wallet provider today. Splitting `app/` into `(marketing)` / `(transactional)` route groups with separate layouts is a known follow-on (see backlog) — the classification above is the canonical reference for that future refactor.

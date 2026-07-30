# Frontend — Structure

Next.js 14 (App Router), TypeScript, Tailwind CSS. **`frontend/` is the only
active frontend.** The prior V4 frontend was moved to `archive-frontend/` on
2026-04-26 and untracked from the repo in `a6110c6` (2026-05-24); it is not
present in fresh clones. If a frontend change is needed, it ships in
`frontend/` only.

CLAUDE.md keeps the active-frontend declaration and indexes this file; the per-route catalogue, lib map, designer surface, and wallet-provider scope live here.

## Routes (`frontend/app/`)

Audit by `ls app/(marketing)/ app/(app)/ app/(builders)/`. Source of truth is the directory listing, not this paragraph.

**`(marketing)/` (no wallet provider):** `/` (root), `/agents`, `/assemblies`, `/builders` (hub), `/builders/composability`, `/cryptoeconomics`, `/integrate`, `/local-commerce` (worked example), `/papers/<slug>` (the paper corpus), `/physics`, `/protocol`, `/clause-rewards`, `/clauses`, `/security`, `/spec`, `/users`, `/why`. The `/clauses` and `/assemblies` inventories read on-chain state event-driven through the standalone `publicClient` — marketing-tier reads do not require the wallet provider.

**`(app)/` (wallet provider mounted):** `/audit` + `/audit/view?process=<id>`, `/discover` (seller catalogue), `/evidence-display` (forum-iframe evidence reader), `/s/view?seller=<addr>` (seller detail + cart) + `/s/checkout?seller=<addr>` (order review + commit), `/sellers` (enrolment) + its sub-routes `/sellers/{agents,assemblies,catalogue,identity,review}` and `/sellers/edit/{agents,assemblies,catalogue,identity}`, `/orders` (the wallet's actor-neutral order list — buyer + seller, with the "Your turn" accept section), `/orders/view?process=<id>` (per-order live timeline), `/rewards` (an author's RPGF tranche claim, read from `UsageCounter` + `RpgfMinter`), `/sign`, `/settings` (the user's runtime endpoint overrides — RPC provider, IPFS node/gateway, and geocoder via `lib/shared/userEndpoints.ts`; the build-baked `NEXT_PUBLIC_*` values are defaults only, so a hosted deploy never seizes users onto the operator's provider key or pinning node).

**`(builders)/` (wallet provider mounted — authoring publishes on-chain):** `/builders/designer` (landing), `/builders/designer/new`, `/builders/designer/edit?slug=<slug>`, `/builders/designer/view?slug=<slug>`, `/builders/clauses` (clause authoring — paste a spec, validate via Layer-A, register on `ClauseRegistry`; reclaim a registered clause's stake). (`/builders` and `/builders/composability` are `(marketing)/` pages.)

**API:** none — the app has zero server routes. The former `/api/geocode` Nominatim proxy was retired 2026-07-09 (no-PP/ToS ruling): the geocoder is a user endpoint (`lib/shared/userEndpoints.ts`, OpenStreetMap's public instance by default) called directly from the browser, so no typed address transits an operator server.

### Static export

The whole site is a **static export** (`output: 'export'` in `frontend/next.config.mjs`). `next build` prerenders every route to real HTML in the build dir (`out/` on a default build; the custom `NEXT_DISTDIR` used by the e2e/verify flows redirects the export into that dir) and ships a plain file tree — servable from any CDN with no Node.js runtime. Marketing/reference pages materialize their full prose at build time (curl/crawlers see real content); wallet- and network-dependent pages prerender to a shell that hydrates and reads chain + IPFS client-side after mount (the `useMounted` gate keeps first render matching SSR).

Consequences that shaped the code, and where each server-only feature moved:
- **Open-world ids ride in query params, never route segments.** A processId / seller address / assembly slug is unknowable at build time, so `generateStaticParams` can't enumerate it. The id-bearing pages read it client-side via `useSearchParams` behind a `Suspense` boundary: `/orders/view?process=`, `/audit/view?process=`, `/s/view?seller=`, `/s/checkout?seller=`, `/builders/designer/{view,edit}?slug=`.
- **CSP + security headers → ARTIFACT-ENFORCED at the hosting layer.** `middleware.ts` (the per-request CSP nonce) was removed — middleware is incompatible with `output: export`. The policy now ships INSIDE the export as `public/_headers` (checked in; Next copies it into the export dir), in the Cloudflare Pages / Netlify `_headers` convention: the full former set (CSP + HSTS / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy / COOP / CORP), `'unsafe-inline'` in place of the nonce (script **hashes** are the future hardening), scheme-wide `connect-src` because `/settings` points the app at the USER'S own RPC/IPFS endpoints, and the `/evidence-display` `frame-ancestors` override (deployment config — a recognized forum edits that line) for arbitration-forum iframing. An IPFS-gateway mirror serves no custom headers — the ownerless mirror trades the header layer for re-pinnability.
- **`redirects()` + `rewrites()` → deleted.** Static export honors neither. The legacy-URL redirect table was dropped (device-only repo, no external bookmarks); the dev `/rpc` proxy is gone — the RPC transport (`lib/shared/wagmi.ts`) now points straight at the chain endpoint in every environment, which is how the production build already ran.

**Consumer flow** (May 2026 split, replaces the prior `/i/[slug]` seller-runtime shape):
- Buyers: `/discover` → `/s/view?seller=<addr>` (browse + cart) → `/s/checkout?seller=<addr>` (commit) → `/orders/view?process=<id>` (live timeline + Confirm receipt) → `/orders` (history).
- Sellers: `/orders` (the "Your turn" section — incoming to accept, then in-progress + completed) → `/orders/view?process=<id>` (fire merchant-process events).
- Builders: `/builders/designer/view?slug=<slug>` (assembly inspector). The prior `/i/[slug]` route was deleted.

The `/builders/designer` tool is a composition surface (`TopologyCanvas` + `AgreementDrawer`) — it composes BOTH the DAG of orders AND each order's clauses; "just a DAG editor" under-states it. The palette/canvas/inspector three-column shape was rejected as "wrong-direction" during this project's evolution.

## Key Library Areas (`lib/`)

Tiered, bottom to top; each tier imports only what sits below it (enforced by `scripts/lint-lib-import-direction.sh`).

- **`shared/`** — the generic leaf: EVM helpers (`evm.ts`), wagmi/chain config (`wagmi.ts`, `chains.ts`, `connectors.ts`), IPFS (`ipfsService.ts`), clause-spec cache source (`clauseSpecSource.ts`), assembly-template reading vocabulary (`assemblyTemplate.ts`, `clauseFields.ts`), errors/formatting/json. Imports no other `lib/` layer; the one sanctioned exception is the runtime-services DI seam (`runtimeServices.ts` + `runtimeServicesContext.tsx`), which assembles feature-layer service implementations.
- **`kernel/`** — the FigaroCore seam: commit/resolve writes (`useFigaroActions.ts`, `orderCommitted.ts`), order-event reads (`indexer.ts`, `walletProcessQueries.ts`, `eventCache.ts`), the deployment-curried hash wrappers + agreement fetch (`signedCommitment.ts`, `agreementFetch.ts`), chain config (`contracts.ts` — the five core contract ABIs + ERC20, SDK-sourced), the `Order` domain types + UI store (`store.ts`). Imports only `shared/`. (The agreement projection itself — `buildOrderAgreement`, the Layer-A sign gate, `sectionByField` — is `@figaro/sdk`; `sdk/README.md` owns it.)
- **`protocol/`** — the registry tier: `useClauseRegistry.ts`, `useClauseSpecs.ts`, `useAssemblyRegistry.ts`, `assemblyChoices.ts`, `membersRegistryIndexer.ts`. Reads ClauseRegistry / MembersRegistry / AssemblyRegistry; imports `kernel/` + `shared/`.
- **`agent/`** — did:web identity for agents acting for wallets (`useDidWeb.ts`)
- **`audit/`** — audit-bundle assembly + dispute evidence (read path for `/audit/view?process=<id>`)
- **`checkout/`** — the Checkout lifecycle phase: cart (`cartStore.ts`, `CommerceProvider.tsx`, `useCheckout.ts`), the thin checkout wrapper driving the SDK's ONE template→orders walk (`assemblyCheckout.ts` — per-node fills/selections/compositions via the shared `checkoutNodes` resolution, root signed last; `planAssemblyOrders` is the DRY walk the dispatch race drafts with; the planning vocabulary itself — fills, sub-order seller plan, live pricing, the rate-quantity registry — is `@figaro/sdk` `checkoutPlan`), the dispatch race (`dispatchRace.ts` — `useDispatchRace` + the race relay legs; an unbound sub-order filled by racing every priceable discovered catalogue instead of the manual pick: unsigned drafts out, countersignatures back — or QUOTES back under the buyer's ceiling — cheapest valid reply wins with buyer override; per-candidate transport: a candidate whose profile declares `services.rest` is an AGENT candidate and exchanges the same artifacts over HTTP (`postToAgentEndpoint`, the HttpChannel wire — mixed human×agent races are this branch), wallet candidates ride the coordination channel; rendered by `components/runtime/DispatchRacePanel.tsx` beside the picker), and the commitment choreography (`draftOrders.ts`, `orderPreview.ts` — the confirm gate (before every sign AND the standalone commit broadcast) + chain-time deadline, `orderCommitmentFlow.ts` — buyer sign/share, the counter-party accept, the race candidate's `counterSignAndReturn`, and the fully-signed `commitOrder` broadcast, `orderSignedAndShared.ts`, `orderPendingSellerSignature.ts` — the pending predicates incl. `awaitsMyBroadcast`, the race winner's ready-to-submit lane on `/orders`; the gate's terms rendering is `components/runtime/AgreementReview.tsx` — the ONE shared agreement-terms surface, composed by `AgreementPreviewModal` and rendered inline on `/sign`)
- **`composition/`** — third-party on-network contract composition (the fifth noun): the generic dispatch (`compositionTarget.ts`, `useCompositionActions.ts`) + per-contract hooks/readers, incl. the swap-funded bond legs (`swapFunding.ts` — devnet venue rate/quote/route + the party-agnostic witness-signed leg builder, buyer's at checkout and seller's at accept, plus `inputForOutput` — the checkout's price conversion from the seller's default into the buyer's picked payment token; `useSwapAndCommitActions.ts` — the `swapAndCommit` broadcast either funded form routes through). Swap-and-commit is the ON-RAMP into the process denomination, never the denomination itself (the token-layer grid in `LEXICON.md` owns the model)
- **`designer/`** — assembly authoring: synthetic DAG session + autosave + fork + publish (`syntheticProcess.ts`, `syntheticDesignStore.ts`, `forkAssembly.ts`, `assemblyTemplateToDraft.ts`, `publishAssembly.ts`; the template build itself — `buildAssemblyTemplate`/`serializeAssemblyTemplate` — is `@figaro/sdk`)
- **`handoff/`** — handoff-clause runtime TRANSPORTS + persistence: the channel factory (`channel.ts` — mock/null/XMTP selection over the SDK's `HandoffChannel`), the transport implementations (`xmtpChannel.ts`, `mockChannel.ts`, `nullChannel.ts`), per-order ECDH keypair sessionStorage (`ecdh.ts`), coordination-messaging + handoff-persistence services (`coordinationMessagingService.ts`, `handoffPersistenceService.ts`). The wire protocol itself (message shapes, ECDH derivation, AES-GCM wrapping) is `@figaro/sdk/handoff`.
- **`seller/`** — seller profile + catalogue management, the discovery-service implementation (`discoveryService.ts`); the ONE cached read path per document family (`profileFetcher.ts`, `catalogueFetcher.ts`, both on the `uriFetcher.ts` pipeline) and the ONE counterparty-name resolver (`sellerListing.ts` `displayNameForAddress`, over any `{address, name}` collection)
- **`semantic/`** — runtime derivation from committed state: `deriveProcessModelFromRuntime.ts`, `processTopology.ts`, `processRecourse.ts`, `models.ts`, capability execution

## Designer tool surface (`frontend/`)

The Designer is a DAG editor — assembly designers start blank or fork an existing published assembly, modify the bonded-process DAG on the canvas, edit per-node clauses in a side drawer, save drafts to local storage, and publish to the on-chain `AssemblyRegistry` when ready. The canvas DAG is an assembly-tier composition; the kernel itself only ever sees the linear `commit` chains that result at runtime. The three-column palette/canvas/inspector shape was rejected during this project's evolution.

**Routes:**
- `/builders/designer` — landing. Three sections: drafts (`<DraftsList>`, localStorage), the wallet's published assemblies (`<PublishedList>`, reconstructed from `AssemblyRegistered` events), and the clauses catalogue (`<ClausesList>`, read from `ClauseRegistry`).
- `/builders/designer/new` — blank DAG editor. Three init paths: `?draft=slug` query, autosaved current session, or fresh blank.
- `/builders/designer/edit?slug=<slug>` — fork an existing published assembly into the editor.
- `/builders/designer/view?slug=<slug>` — read-only view of a published assembly.

**Components (`app/(builders)/builders/designer/_components/`):**
- `DesignerCanvas.tsx` — the shared editor surface used by `/new` and `/edit?slug=<slug>`. Hosts the toolbar (← Assemblies | Agent assist | saved hint | Save | Review | Reset), the DAG canvas, the agreement drawer, and the autosave loop.
- `CompositionAssist.tsx` — the composition-assist hand-off surface (toolbar "Agent assist"). The designer's OWN agent (`figaro-assembly-designer`, the public ecosystem seam — `docs/AI_AGENT_COORDINATION.md`) runs in the designer's runtime for the designer's wallet; nothing is invoked from this static export. The panel round-trips the canonical artifact instead: OUT — the live draft serialized by the same `buildAssemblyTemplate` walk publish uses; IN — a pasted template parsed by `parseAssemblyTemplateJson` (`lib/designer/assemblyTemplateToDraft.ts`) and applied to the canvas as ordinary unsaved state (replace-confirmed when the canvas is non-trivial). Composition stays the designer's act — review/edit/publish are unchanged.
- `AgreementDrawer.tsx` — per-node clause composer. Two tabs: Parties (buyer / seller / DAG position) and a network-driven **Registry** tab listing every clause registered on `ClauseRegistry` (grouped by `block.design.article`), each a checkbox (ASSEMBLY-SCOPED clauses — `design.scope: "assembly"` — are EXCLUDED here: they compose once in the canvas's `AssemblyTermsPanel`, and the two surfaces partition the registry by declared scope, so designer-side duplicates are structurally impossible; `buildAssemblyTemplate` re-verifies at draft/publish) — design time is STRUCTURAL (ruled 2026-07-14): the designer SELECTS clauses and sub-clauses; field editors render exactly for the fields a clause names in `block.design.fills` (consent's affix, the denomination pin, the credential register: the designer's tailoring). Every other field is a transaction particular, filled at checkout (the checkout's spec-routed fill surface → `clauseFills` → `executeAssemblyCheckout`). The selection is captured into the no-hash assembly template (`clausesByOrderId` → `buildAssemblyTemplate`, which strips general-clause values by construction). No hardcoded clause roster. The drawer is **per-order**: a concern that resolves once per PROCESS (resolve, audit bundle, a process-wide declaration) belongs at the process-detail layer, never as a drawer clause group; a genuinely process-scoped declaration anchors on the **root order's** agreement, edited from process-level controls rather than the per-order drawer.
- `DraftsList.tsx` — saved-drafts list on the landing.
- `PublishedList.tsx` — published-assemblies list for the connected wallet.
- `ClausesList.tsx` — clauses catalogue on the landing.
- Shared DAG canvas: `components/runtime/TopologyCanvas.tsx` (drag green handle to spawn sub-orders; drag onto another node to merge fan-in).

**State:** `lib/designer/syntheticProcess.ts` (synthetic session + DAG mutation helpers — `createSyntheticRootOrder`, `createSyntheticSubOrder`, `mergeSyntheticParent`, `editSyntheticAgreement`, `collectDescendants`, `isRootOrder`). Persistence: `lib/designer/syntheticDesignStore.ts` (localStorage). Bridge: `lib/designer/forkAssembly.ts` + `lib/designer/assemblyTemplateToDraft.ts` (fork a published assembly's template into an editable draft).

**The agreement build (composition rules).** The published **template is the faithful record** of what the designer composed; `buildOrderAgreement` (`@figaro/sdk`, fed by the live-cache `specSource()` adapter) is a **pure, deterministic projection** of it — the composed clauses, plus the spec-declared mandatory defaults, and nothing more. It synthesizes no meaning the template + specs don't determine and reads no clause by name: mandatory clauses (`block.design.article: "mandatory"` — commerce, topology) auto-fold into every draft generically (the SDK's fold iterates the loaded spec set, so a never-seen mandatory clause folds in with zero code). Never a hardcoded clause→clause map, a named-clause branch, or a checkout-time guess; and no clause auto-spawns a DAG node — nodes are the designer's, drawn on the canvas.

## Clause validation in the frontend

- `clauseSpecSource.ts` — the module spec cache. No bundled copy and no
  preload: `useClauseSpecs` warms it chain→IPFS via `loadClauseSpec(id, uri)`
  from `ClauseRegistered` events (the seed clauses in `clauses/` on the devnet —
  all runtime-attestable except the agreement-only `figaro-topology` —
  plus any third-party registrations;
  spec-consuming surfaces gate on its `loaded`.

## Components (`components/`)

- **`core/`** — order flows, bond/token, builder/assembly, semantic. Assembly rendering shell: `AssemblyProcessWorkspace` (all `Institution*` names have been renamed)
- **`marketing/`** — marketing-route layout primitives (`MarketingHeader`, `MarketingHero`, `MarketingSection`)
- **`modules/`** — feature modules (e.g. `MemberBrandingModule`). The prior module registry and the `/i/[slug]` runtime that rendered registered modules were retired in the V4→V5 narrowing; consumer surfaces are now purpose-shaped pages (`/s/view?seller=<addr>`, `/orders`, `/orders/view?process=<id>`).
- **`shared/`** — shell/utility; **`ui/`** — design primitives; **`icons/`** — SVGs; **`sellers/`** — route-specific panels (onboarding shell + edit forms)

## Canonical exemplars — copy these shapes

When building a new surface, anchor on the canonical implementation of its
surface-type below — extend or mirror it; never generate the shape from
scratch. (The base-model default shape is a closed-world product app; the
nearest exemplar in this repo beats it. Commission work as "make X work like
Y", not as an open-ended build.)

- **Runtime (phase-4) order surface** — `components/runtime/CapabilityRail.tsx`,
  driven by `deriveProcessModelFromRuntime` → `executeCapability`. The order
  page names NO clause (guard: `scripts/lint-no-hardcoded-clauses-in-runtime.sh`).
  Two derived capability shapes: process-log LADDERS (attestations article →
  one-click next-stage buttons) and WITNESS stages (any composed clause
  declaring `spec.stages[N]` → a form generated from the declared fields via
  the one `FieldControl`, offered to both parties, repeatable while the order
  is active — mechanism owned by `docs/CLAUSES.md` § "Witness stages").
  Order ARRIVAL + acceptance + resolution are CORE (the `OrderCommitted` event +
  the bell notification, `lib/kernel/useNotifications.ts`) — never a clause
  lifecycle stage or a capability; clause state/labels surface from the clause
  DATA via the spec's `valueLabels` (`describeAttestation`), never a frontend
  label enum.
- **Declared-semantic component registries** — richer UI mounts keyed on what
  the clause SPEC declares, never a clause id / mechanism kind / component
  name; no entry ⇒ graceful degradation (plain input / nothing). Two seams:
  `components/runtime/fieldFormatInputs.tsx` (a string field's open `format` →
  input component; tenants: `geohash` → `GeohashFieldInput`, device-location
  assisted; `bytes32-hex` → `ContentAnchorFieldInput`, the AFFIX — pick a
  file, pin it, keccak256 fills the field, and the pinned locator rides the
  companion channel to the first sibling declaring `format: "uri"`; pasting
  raw hex is used nowhere as a content fill, ruled 2026-07-10;
  `evidence-capture` → `EvidenceCaptureInput`, the device-layer witness
  capture — the device's OWN capabilities detected at runtime (geolocation
  cross-check everywhere, NFC tap on Android Chrome, BLE sighting on
  Chromium; browser and mobile, one surface — `lib/shared/deviceEvidence.ts`),
  capture pins the artifact and the URI fills the field, manual URI entry
  stays; richer ranging arrives via the agent/operator seam, never the page).
  The format key may be VALUE-DRIVEN: a field declaring `formatFromField`
  resolves its input from the committed VALUE of a named sibling
  (`resolveInputFormat`) — `figaro-geolocation`'s origin/destination follow
  `geocodeStandard`, so the geohash picker renders only when the committed
  standard is geohash. The picker applies the `cap(disposition, geocodeStandard)`
  grain cap — a `public` geohash is coarsened to neighborhood grain, a `private`
  one keeps fine grain (`lib/shared/geohash.ts`)) and
  `components/runtime/interactionSurfaces.tsx`
  (`block.runtime.interaction.interface` — the party↔party runtime interaction
  standard, the sibling of `block.design.composes` — → order-page surfaces via
  `OrderInteractionSurfaces`, mounted on every order the wallet is a party
  to; tenants: `qr-challenge` → `QrChallengePanel` (order identity over
  the visual channel at a hand-off), `ecdh-address` →
  `AddressDetailPanel` (the private-address ceremony on the geolocation
  clause: seller requests, buyer answers with the ECDH-encrypted addressee
  block over the coordination channel — `lib/handoff/addressDetail.ts` —
  its keccak anchored on-chain as a buyer attestation; the chain never
  learns the plaintext), and `ecdh-content` → `ContentDeliveryPanel` (the
  digital-hand-off twin: the artifact itself travels the same encrypted
  channel — `lib/handoff/contentDelivery.ts` — and its keccak256 files as
  the clause's stage-1 completion evidence; both ceremonies share the
  two-message core in `lib/handoff/ceremony.ts`)).
- **Clause-composition UI** — `app/(builders)/builders/designer/_components/AgreementDrawer.tsx`
  (reads ClauseRegistry live; grouping word is `block.design.article`).
- **On-chain write flow** — `lib/seller/usePublishMemberProfile.ts`
  (`simulateContract` → write → `waitForTransactionReceipt` → verify
  `status === "success"` before navigating).
- **IPFS-hydrated reads** — `hooks/useProcessAgreements.ts` over
  `lib/kernel/agreementFetch.ts` (singleton Map; never a synchronous
  `loadAgreement` in a render path).
- **Event-driven inventory page + smoke** — the `/clauses` and `/assemblies`
  marketing pages with `frontend/tests/e2e/clauses-inventory.devnet.spec.ts` /
  `frontend/tests/e2e/assemblies-inventory.devnet.spec.ts`.
- **Scenario e2e** — `frontend/tests/e2e/local-commerce.devnet.spec.ts` is the
  live exemplar (authors on the canvas, pins to IPFS + anchors on-chain, then
  consumes from chain + IPFS — discovers, never imports a roster). The old
  seeded `scenario-*`/`*-runtime` pairs were deleted with the fixture
  migration; open-world rebuilds of 2–3 scenarios are punch-listed.
- **Network reads** — `lib/kernel/indexer.ts` (order events) + `lib/protocol/membersRegistryIndexer.ts` (registry events) (the canonical read side; reconstructs
  process/clause/seller state from chain events).

## Wallet-provider scope per route

Every route in `frontend/app/` is classified into one of three tiers
governing wallet-provider load:

- **Marketing** — pure publication / explanation. Lives in `app/(marketing)/`; does not load the wallet provider. Current routes: `/`, `/agents`, `/assemblies`, `/builders`, `/builders/composability`, `/cryptoeconomics`, `/integrate`, `/local-commerce`, `/physics`, `/protocol`, `/clause-rewards`, `/clauses`, `/security`, `/spec`, `/users`, `/why`.
- **Reference / read-only (in `(app)/` or `(builders)/`)** — registries / tools whose primary purpose is read-only inspection but which mount the wallet provider for inline write affordances via `WalletGate`. Current: `/builders/designer*` (in `(builders)/`; drafts in localStorage), `/builders/clauses` (in `(builders)/`; clause authoring — reads walletlessly, register + reclaim writes gated by `WalletGate`), `/discover` (seller catalogue), `/audit` + `/audit/view?process=<id>` (audit / forensics — the spectator surface: no account hook anywhere in the tree; a walletless visitor reads the full record), `/evidence-display` (forum-iframe evidence reader — needs neither the provider nor an account: it builds its own read client from query params), `/s/view?seller=<addr>` (read-mode catalogue with WalletGate-protected place-order CTA), `/rewards` (RPGF tranche reader; the claim writes are `WalletGate`-protected). The `/builders` hub and `/builders/composability` are publication pages and live in `(marketing)/`.
- **Transactional** — primary purpose is signing or sending transactions; lives in `app/(app)/`; requires a connected wallet. Current: `/sign`, `/sellers`, `/orders` (the wallet's actor-neutral order list — buyer + seller; the "Your turn" section is where counter-sign/accept fires) + `/orders/view?process=<id>` (per-order timeline; resolveProcess fires here).

**Rules:**

1. Do NOT gate read-only pages behind `useAccount` / `isConnected`. Wallet-connect is a signing prerequisite, not a login. A user who has never connected must be able to read every Reference / read-only and Marketing route.
2. For inline write affordances on Reference pages, use `WalletGate` (the canonical inline-gate wrapper).
3. The `(marketing)` / `(app)` route-group split is in place: `app/(marketing)/layout.tsx` does NOT mount `<Providers>`; `app/(app)/layout.tsx` and `app/(builders)/layout.tsx` do. Marketing pages still read on-chain state via the standalone `publicClient` exported from `lib/shared/wagmi.ts` — `/clauses` and `/assemblies` are the canonical event-driven marketing inventory pages.

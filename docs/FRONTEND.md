# Frontend — Structure

Next.js 14 (App Router), TypeScript, Tailwind CSS. **`frontend/` is the only frontend.** A frontend change ships in `frontend/` only.

This file owns the per-route catalogue, lib map, designer surface, and wallet-provider scope.

## Routes (`frontend/app/`)

Generated from the tree, not maintained by hand: `find app -name page.tsx`. The
directory listing is the source of truth; this table is a reading of it, and a row
that disagrees with the tree is the table's error. Tier definitions and the rules
behind them: § "Wallet-provider scope per route" below.

**Marketing — `(marketing)/`, no wallet provider.** Seven route groups, one per
protocol object. Marketing-tier reads reach on-chain state through the standalone
`publicClient`; reading needs an RPC, never a wallet.

| Group | Routes | Notes |
|---|---|---|
| `(use)` | `/use`, `/members`, `/faq`, `/local-commerce`, `/worked-example` | The Use door. `/local-commerce` is ONE example among unbounded kinds, never THE model. Discover and Orders, in `(app)`, are admitted under it in the nav. |
| `(build)` | `/build`, `/clauses`, `/assemblies`, `/registries`, `/composition`, `/pitfalls`, `/rpgf`, `/tokenomics`, `/dao` | The Build door. The two authoring tools in `(tools)` are admitted under it. Rewards, Tokenomics, and The DAO are three concepts, three pages, in reading order. The docs-site is its second step. |
| `(core)` | `/core`, `/kernel`, `/invariants`, `/spec`, `/security` | The Core door. `/security` is testing + audit results only. |
| `(research)` | `/research`, `/working-groups`, `/working-groups/for/[tag]`, `/working-groups/on/[tag]` | The Research door leads to Working Groups. `/papers/<slug>` is reached through Working Groups — the corpus has ONE surface, and no papers index. The two `[tag]` routes are the reader's index into that surface, derived from each paper's `industries` (`for`) and `keywords` (`on`) in `frontend/app/(marketing)/_lib/paperGroups.ts`. |
| `(data)` | `/data`, `/data/yours`, `/attestations` | The Data door: the data a trade leaves. Audit and the data explorer, in `(app)`, are admitted under it. |
| `(agents)` | `/agents`, `/agents/how` | The Agents door: agents are participants, not a feature; the door leads to the agents' own surface (`ecosystem-agents/`, the signer, the machine-readable index). |
| `(reference)` | `/about` | Footer chrome, never nav: who is behind Figaro, answered without a name (pseudonymous by design). |

**No audience-carve hub.** An audience's payloads belong on the object pages themselves. Sections are named for what
a reader does, never for who they are.

**Reference / read-only — `(app)/` or `(tools)/`, provider mounted for inline
writes via `WalletGate`.**

| Route | Notes |
|---|---|
| `/assemblies/designer` + `/new`, `/edit?slug=`, `/view?slug=` | In `(tools)/`; drafts in localStorage. |
| `/clauses/register` | In `(tools)/`; paste a spec, validate it off-chain, register on `ClauseRegistry`, reclaim a registered clause's stake. Reads walletlessly; register and reclaim are `WalletGate`-gated. |
| `/discover` | Seller catalogue. |
| `/audit`, `/audit/view?process=` | Forensics, and a SPECTATOR surface: no account hook anywhere in the tree, so a walletless visitor reads all of it. |
| `/data/explore` | The graph-query surface `DATA_LAYER.md` describes; in `(app)/` but spectator-capable like `/audit`. One layer at a time, each carrying its own truth boundary. Views and the wallet subject ride query params (`lib/data/explorer.ts`); graphs are projected in the browser (`lib/data/graphCorpus.ts`) over the existing event caches; the prompt box renders ONLY when an analyst endpoint resolves. |
| `/evidence-display` | See "Deliberate orphan" below. |
| `/s/view?seller=` | Seller detail + cart; place-order CTA is `WalletGate`-protected. |
| `/rewards` | A designer's reward-tranche claim, read from `UsageCounter` + `RpgfMinter`; the claim writes are `WalletGate`-protected. |

**Transactional — `(app)/`, requires a connected wallet.**

| Route | Notes |
|---|---|
| `/sign` | |
| `/s/checkout?seller=` | Order review + commit. |
| `/members/manage` | The registered dashboard + stake claim. |
| `/members/{identity,agents,assemblies,buyer,catalogue,endpoints,review}` | The registration wizard. The buyer step subscribes the assemblies the wallet buys through and declares the data offered for sale. |
| `/members/edit/{identity,agents,assemblies,buyer,catalogue,endpoints}` | Endpoints are the member's own infrastructure — device configuration via `lib/shared/userEndpoints.ts`, never pinned or published. |
| `/orders`, `/orders/view?process=` | The wallet's actor-neutral order list, buyer and seller both; "Your turn" is where counter-sign/accept fires, and `resolveProcess` fires on the detail view. |

The build-baked `NEXT_PUBLIC_*` values are defaults only, so a hosted deploy never
seizes users onto the operator's provider key or pinning node. Endpoint configuration
is per-wallet, at `/members/edit/endpoints`.

**URL-depth rule.** Concept pages — pages that explain a protocol object in plain
language, for a reader who isn't necessarily about to act — live at the site root
(`/clauses`, `/assemblies`, `/composition`, `/security`, …). The authoring tools that
DO what a concept page explains live one level beneath their object
(`/clauses/register`, `/assemblies/designer`, …). How each concept page names its
tool is per-page, not one shape: `/assemblies` states the seam as a one-line pointer
near the top; `/clauses` places its one register link in the add-your-own section
near the bottom; `/data` states its seam inside the section describing the public
half; `/composition` has no separate tool to hand off to. Where a seam exists, the
tool keeps at most one intro paragraph plus a pointer back to the concept page,
rather than re-deriving it.

**Deliberate orphan:** `/evidence-display` is unlinked from every in-app surface BY
DESIGN — it is the iframe target a recognised arbitration forum embeds (hence the
`frame-ancestors` override for it in `public/_headers`), reached by a
forum-composed URL, never by navigation. It is excluded from `app/sitemap.ts` for
the same reason. Reachability audits should not flag it.

**API:** none — the app has zero server routes. The geocoder is a user endpoint
(`lib/shared/userEndpoints.ts`, OpenStreetMap's public instance by default) called
directly from the browser, so no typed address transits an operator server.

### Static export

The whole site is a **static export** (`output: 'export'` in `frontend/next.config.mjs`). `next build` prerenders every route to real HTML in the build dir (`out/` on a default build; the custom `NEXT_DISTDIR` used by the e2e/verify flows redirects the export into that dir) and ships a plain file tree — servable from any CDN with no Node.js runtime. Marketing/reference pages materialize their full prose at build time (curl/crawlers see real content); wallet- and network-dependent pages prerender to a shell that hydrates and reads chain + IPFS client-side after mount (the `useMounted` gate keeps first render matching SSR).

Consequences that shaped the code, and where each server-only feature moved:
- **Open-world ids ride in query params, never route segments.** A processId / seller address / assembly slug is unknowable at build time, so `generateStaticParams` can't enumerate it. The id-bearing pages read it client-side via `useSearchParams` behind a `Suspense` boundary: `/orders/view?process=`, `/audit/view?process=`, `/s/view?seller=`, `/s/checkout?seller=`, `/assemblies/designer/{view,edit}?slug=`.
- **CSP + security headers → ARTIFACT-ENFORCED at the hosting layer.** Middleware is incompatible with `output: export`, so there is no per-request CSP nonce. The policy ships INSIDE the export as `public/_headers` (checked in; Next copies it into the export dir), in the Cloudflare Pages / Netlify `_headers` convention: the full set (CSP + HSTS / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy / COOP / CORP), `'unsafe-inline'` in place of the nonce (script **hashes** are the future hardening), scheme-wide `connect-src` because the member-endpoints surface points the app at the USER'S own RPC/IPFS endpoints, and the `/evidence-display` `frame-ancestors` override (deployment config — a recognized forum edits that line) for arbitration-forum iframing. An IPFS-gateway mirror serves no custom headers — the ownerless mirror trades the header layer for re-pinnability.
- **`public/llms.txt` → the machine-facing entry point.** Ships verbatim into the export root (`/llms.txt`): routes an arriving AI agent to the frame in machine register, the two-worlds seam, the `ecosystem-agents/` manuals, the SDK/npm package, and the deployment record. The `/agents` page's closing paragraph is the human-side pointer to the same set. `robots.txt` (`Disallow: /` until the launch flip) does not block direct fetches of it.
- **`redirects()` + `rewrites()` → unavailable.** Static export honors neither, so the site keeps no redirect table. The RPC transport (`lib/shared/wagmi.ts`) points straight at the chain endpoint in every environment.

**Consumer flow:**
- Buyers: `/discover` → `/s/view?seller=<addr>` (browse + cart) → `/s/checkout?seller=<addr>` (commit) → `/orders/view?process=<id>` (live timeline + Confirm receipt) → `/orders` (history).
- Sellers: `/orders` (the "Your turn" section — incoming to accept, then in-progress + completed) → `/orders/view?process=<id>` (fire merchant-process events).
- Designers: `/assemblies/designer/view?slug=<slug>` (assembly inspector).

The `/assemblies/designer` tool is a composition surface (`TopologyCanvas` + `AgreementDrawer`) — it composes BOTH the DAG of orders AND each order's clauses; "just a DAG editor" under-states it. It is not a palette/canvas/inspector three-column tool, and is not to be rebuilt as one.

## Key Library Areas (`lib/`)

Tiered, bottom to top; each tier imports only what sits below it (enforced by the maintainers' pre-commit guard battery).

- **`shared/`** — the generic leaf: EVM helpers (`evm.ts`), wagmi/chain config (`wagmi.ts`, `chains.ts`, `connectors.ts`), IPFS (`ipfsService.ts`), clause-spec cache source (`clauseSpecSource.ts`), assembly-template reading vocabulary (`assemblyTemplate.ts`, `clauseFields.ts`), errors/formatting/json. Imports no other `lib/` layer; the one sanctioned exception is the runtime-services DI seam (`runtimeServices.ts` + `runtimeServicesContext.tsx`), which assembles feature-layer service implementations.
- **`kernel/`** — the FigaroCore seam: commit/resolve writes (`useFigaroActions.ts`, `orderCommitted.ts`), order-event reads (`indexer.ts`, `walletProcessQueries.ts`, `eventCache.ts`), the deployment-curried hash wrappers + agreement fetch (`signedCommitment.ts`, `agreementFetch.ts`), chain config (`contracts.ts` — the five core contract ABIs + ERC20, SDK-sourced), the `Order` domain types + UI store (`store.ts`). Imports only `shared/`. (The agreement projection itself — `buildOrderAgreement`, the off-chain sign gate, `sectionByField` — is `@figaro-protocol/sdk`; `sdk/README.md` owns it.)
- **`protocol/`** — the registry tier: `useClauseRegistry.ts`, `useClauseSpecs.ts`, `useAssemblyRegistry.ts`, `assemblyChoices.ts`, `membersRegistryIndexer.ts` (liveness fold delegated to the SDK's `reconstructDiscovery`), plus the shared factory shapes the clause/assembly readers are built from (`registryEventScan.ts` — the paired registered+withdrawn cached scan with the `failed` contract; `useWithdrawStake.ts` — the `withdrawDeposit` write hook, the shared revert-extraction preamble, and the noun-parameterised withdraw revert table). Reads ClauseRegistry / MembersRegistry / AssemblyRegistry; imports `kernel/` + `shared/`.
- **`agent/`** — did:web identity for agents acting for wallets (`useDidWeb.ts`)
- **`audit/`** — audit-bundle assembly + dispute evidence (read path for `/audit/view?process=<id>`). Witness VALUES resolve from the network: an `Attestation` event's `contentRef` is the keccak-CID digest of the published preimage (`lib/composition/witnessContent.ts`), so the reader derives the address from the event alone, verifies the bytes hash back to the fingerprint, and decodes them through the spec's declared stage fields (`describeWitness`); private-disposition, withheld, or erased content resolves absent and the fingerprint receipt still renders.
- **`data/`** — the data explorer's read model (`/data/explore`): `explorer.ts` (PURE — the query↔permalink parse/serialise, the layer descriptors with their truth boundaries, and the row projections with their absence postures: an unresolved clause family is a fingerprint-only row, an unattributed process is counted and said to be, an unread venue is "unreadable" and never "empty"), `graphCorpus.ts` (the I/O — the existing event caches folded through `@figaro-protocol/sdk/derive`'s projections; substance recovered at the edge from each attestation's own fingerprint, assembly attribution read from the DECLARED `compositionHash` field of an attested provenance overlay, never a clause name), `analystEndpoint.ts` (the analyst wire — same configuration-not-doctrine posture as the batch relay: no shipped fallback, user override wins, unset means no prompt box at all)
- **`checkout/`** — the Checkout lifecycle phase.
  - *Cart:* `cartStore.ts`, `CommerceProvider.tsx`, `useCheckout.ts`.
  - *The template→orders walk:* `assemblyCheckout.ts` is a thin wrapper over the
    SDK's ONE walk — per-node fills/selections/compositions through the shared
    `checkoutNodes` resolution, root signed last. `planAssemblyOrders` is the DRY
    walk the dispatch race drafts with, and the planning vocabulary itself (fills,
    sub-order seller plan, live pricing, the rate-quantity registry) is
    `@figaro-protocol/sdk`'s `checkoutPlan`.
  - *The dispatch race:* `dispatchRace.ts` — `useDispatchRace` plus the race relay
    legs. An unbound sub-order is filled by racing every priceable discovered
    catalogue instead of a manual pick: unsigned drafts out, counter-signatures
    back — or QUOTES back under the buyer's ceiling — cheapest valid reply wins,
    with buyer override. Transport is per candidate: one whose profile declares
    `services.rest` is an AGENT candidate and exchanges the same artifacts over
    HTTP (`postToAgentEndpoint`, the HttpChannel wire — mixed human×agent races are
    this branch); wallet candidates ride the coordination channel. Rendered by
    `components/runtime/DispatchRacePanel.tsx` beside the picker.
  - *The commitment choreography:* `draftOrders.ts` and `orderPreview.ts` carry the
    confirm gate — before every sign AND the standalone commit broadcast — plus the
    chain-time deadline. `orderCommitmentFlow.ts` carries buyer sign/share, the
    counterparty accept, the race candidate's `counterSignAndReturn`, and the
    fully-signed `commitOrder` broadcast. `orderSignedAndShared.ts` and
    `orderPendingSellerSignature.ts` hold the pending predicates including
    `awaitsMyBroadcast`, the race winner's ready-to-submit lane on `/orders`. The
    gate's terms rendering is `components/runtime/AgreementReview.tsx` — the ONE
    shared agreement-terms surface, composed by `AgreementPreviewModal` and
    rendered inline on `/sign`.
- **`composition/`** — third-party on-network contract composition (the fifth noun).
  Generic dispatch is `compositionTarget.ts` + `useCompositionActions.ts`, with
  per-contract hooks and readers beneath it.
  - *Swap-funded bond legs:* `swapFunding.ts` — devnet venue rate/quote/route plus
    the party-agnostic witness-signed leg builder, the buyer's at checkout and the
    seller's at accept; `inputForOutput` converts the seller's default price into
    the buyer's picked payment token; `useSwapAndCommitActions.ts` carries the
    `swapAndCommit` broadcast either funded form routes through. Swap-and-commit is
    the ON-RAMP into the process denomination, never the denomination itself — the
    token-layer grid in `LEXICON.md` owns that model.
  - *The attestation choke point:* `useAttestationCoordinatorActions.ts`, which
    every attest surface routes through; calldata carries fingerprints only.
  - *The witness-content seam behind it:* `witnessContent.ts` publishes a
    non-re-assert payload's ABI bytes as a RAW IPFS block multihashed keccak-256, so
    `contentRef` IS the CID digest. The disposition gate is FAIL-CLOSED — an unknown
    spec, or any `private` field in the `contentFieldsFor` set, withholds. Fetch
    verifies the bytes hash back to the fingerprint; erasure is a best-effort unpin
    of the derived CID, surfaced by `components/runtime/WitnessPinErasure.tsx`.
  - *Post-resolution payout routing:* `payoutRouting.ts` +
    `usePayoutRoutingActions.ts` — a resolved seller splits its own receipts through
    the composed public multisender in one atomic batch; devnet rehearses
    MockDisperse, mainnet composes canonical Disperse. Surfaced by
    `components/runtime/PayoutRoutingPanel.tsx` beside what resolution paid out.
- **`designer/`** — assembly authoring: synthetic DAG session + autosave + fork + publish (`syntheticProcess.ts`, `syntheticDesignStore.ts`, `forkAssembly.ts`, `assemblyTemplateToDraft.ts`, `draftToAssemblyTemplate.ts` — the authoring mirror of `assemblyTemplateToDraft.ts` and the ONE draft→template walk that publish, the hand-off panel, the canvas identity readout, and the review screen share (`projectSnapshotForReview` is that walk's review face: the composition a review renders comes out of the template publish anchors, never a second reading of the draft) — `publishAssembly.ts`; the template build itself — `buildAssemblyTemplate`/`serializeAssemblyTemplate` — is `@figaro-protocol/sdk`)
- **`handoff/`** — handoff-clause runtime TRANSPORTS + persistence: the channel factory (`channel.ts` — mock/null/XMTP chosen by DERIVED facts, never a setting: XMTP iff the wallet already has an inbox, `walletHasXmtpInbox` probe — one seam, one choreography, and no per-wallet transport setting), the transport implementations (`xmtpChannel.ts`, `mockChannel.ts`, `nullChannel.ts`), the relay adapter (`relayChannel.ts` — the handoff relay's PRE-COMMIT cell speaking the SDK's `CoordinationChannel`, so the dispatch race runs ONE choreography over every transport; also home of `relayCommitmentPayload`), per-order ECDH keypair sessionStorage (`ecdh.ts`), handoff-messaging + handoff-persistence services (`handoffMessagingService.ts`, `handoffPersistenceService.ts`). The wire protocol itself (message shapes, ECDH derivation, AES-GCM wrapping) is `@figaro-protocol/sdk/handoff`.
- **`member/`** — the participant's own data: member-profile document family (`memberProfileMetadata.ts`, `memberProfileAdapter.ts`), branding (`memberBranding*.ts`, `useMemberBranding.ts`), the MembersRegistry write/read hooks (`useMembersRegistry.ts`, `usePublishMemberProfile.ts`, `useUpdateMemberProfile.ts`), profile geocoding (`geocode.ts`), the cached URI-fetch pipeline (`uriFetcher.ts` — a single-layer reader, so it lives here), the cached profile read path (`profileFetcher.ts`) and its erasure half (`profileErasure.ts`); the catalogue family — authoring/publication/reads (`catalogue*.ts`, `memberCatalogueMetadata*.ts`, on the same `uriFetcher.ts` pipeline), listings + discovery (`useMemberListings.ts`, `discoveryService.ts`), the enrolment-wizard state (`onboardingState.ts` — the wizard spans profile, catalogue, seller and buyer steps), and the ONE counterparty-name resolver (`memberListing.ts` `displayNameForAddress`, over any `{address, name}` collection). Both sides live here: member = what a wallet IS, seller = which side of a trade it stands on.
- **`semantic/`** — runtime derivation from committed state: `deriveProcessModelFromRuntime.ts`, `processTopology.ts`, `processRecourse.ts`, `models.ts`, capability execution

## Designer tool surface (`frontend/`)

The Designer is a DAG editor — assembly designers start blank or fork an existing published assembly, modify the bonded-process DAG on the canvas, edit per-node clauses in a side drawer, save drafts to local storage, and publish to the on-chain `AssemblyRegistry` when ready. The canvas DAG is an assembly-tier composition; the kernel itself only ever sees the linear `commit` chains that result at runtime. It is not a three-column palette/canvas/inspector tool, and is not to be rebuilt as one.

**Routes:**
- `/assemblies/designer` — landing. Three sections: drafts (`<DraftsList>`, localStorage), the wallet's published assemblies (`<PublishedList>`, reconstructed from `AssemblyRegistered` events), and the clauses catalogue (`<ClausesList>`, read from `ClauseRegistry`).
- `/assemblies/designer/new` — blank DAG editor. Three init paths: `?draft=slug` query, autosaved current session, or fresh blank.
- `/assemblies/designer/edit?slug=<slug>` — fork an existing published assembly into the editor.
- `/assemblies/designer/view?slug=<slug>` — read-only view of a published assembly, and (with `&intent=publish`, where the Review button lands) the review-before-publish surface for a local draft. Everything it shows — node clauses, drawer ticks, assembly-scoped terms, composition identity — is read out of the assembly template; publish is reachable only while that template builds and the stored draft still hashes to the composition on screen.

**Components (`app/(tools)/assemblies/designer/_components/`):**
- `DesignerCanvas.tsx` — the shared editor surface used by `/new` and `/edit?slug=<slug>`. Hosts the toolbar (← Assemblies | Agent assist | saved hint | Save | Review | Reset), the DAG canvas, the agreement drawer, and the autosave loop.
- `CompositionIdentity.tsx` — the canvas's whole-composition identity readout (left inspector): derived slug + truncated compositionHash from the live draft via `snapshotCompositionIdentity`, with the one-paragraph statement that changing a composed value is a DIFFERENT assembly (regime variants are siblings) while editorial prose is hash-excluded. Nothing renders on an empty canvas.
- `AssemblyTermsPanel.tsx` — the canvas-level composer for ASSEMBLY-SCOPED clauses (`design.scope: "assembly"`) — the denomination pin, the dispute forum: terms that compose once per assembly, partitioned from the per-order drawer by declared scope.
- `CompositionAssist.tsx` — the composition-assist hand-off surface (toolbar "Agent assist"). The designer's OWN agent (`figaro-assembly-designer`, the public ecosystem seam — `docs/AI_AGENT_COORDINATION.md`) runs in the designer's runtime for the designer's wallet; nothing is invoked from this static export. The panel round-trips the canonical assembly template instead: OUT — the live draft serialized by the same `buildAssemblyTemplate` walk publish uses; IN — a pasted template parsed by `parseAssemblyTemplateJson` (`lib/designer/assemblyTemplateToDraft.ts`) and applied to the canvas as ordinary unsaved state (replace-confirmed when the canvas is non-trivial). Composition stays the designer's act — review/edit/publish are unchanged.
- `AgreementDrawer.tsx` — per-node clause composer, with two tabs.
  - *Parties:* buyer, seller, DAG position.
  - *Registry:* every clause registered on `ClauseRegistry`, grouped by
    `block.design.article`, each a checkbox — read from the network, never a
    hardcoded roster. ASSEMBLY-SCOPED clauses (`design.scope: "assembly"`) are
    EXCLUDED here: they compose once in the canvas's `AssemblyTermsPanel`. The two
    surfaces partition the registry by declared scope, so designer-side duplicates
    are structurally impossible, and `buildAssemblyTemplate` re-verifies at
    draft/publish.
  - *Design time is STRUCTURAL.* The designer SELECTS clauses and sub-clauses; field
    editors render exactly for the fields a clause names in `block.design.fills` —
    consent's affix, the denomination pin, the credential register: the designer's
    tailoring. Every other field is a transaction particular, filled at checkout
    (the spec-routed fill surface → `clauseFills` → `executeAssemblyCheckout`). The
    selection is captured into the no-hash assembly template (`clausesByOrderId` →
    `buildAssemblyTemplate`, which strips general-clause values by construction).
  - *The drawer is per-ORDER.* A concern that resolves once per PROCESS — resolve,
    the audit bundle, a process-wide declaration — belongs at the process-detail
    layer, never as a drawer clause group. A genuinely process-scoped declaration
    anchors on the ROOT order's agreement, edited from process-level controls.
- `DraftsList.tsx` — saved-drafts list on the landing.
- `PublishedList.tsx` — published-assemblies list for the connected wallet.
- `ClausesList.tsx` — clauses catalogue on the landing.
- Shared DAG canvas: `components/runtime/TopologyCanvas.tsx` (drag green handle to spawn sub-orders; drag onto another node to merge fan-in).

**State:** `lib/designer/syntheticProcess.ts` (synthetic session + DAG mutation helpers — `createSyntheticRootOrder`, `createSyntheticSubOrder`, `mergeSyntheticParent`, `collectDescendants`, `isRootOrder`). Persistence: `lib/designer/syntheticDesignStore.ts` (localStorage); agreements via `lib/designer/syntheticAgreementStore.ts` (`saveAgreement`). Bridge: `lib/designer/forkAssembly.ts` + `lib/designer/assemblyTemplateToDraft.ts` (fork a published assembly's template into an editable draft).

**The agreement build (composition rules).** The published **template is the faithful statement** of what the designer composed; `buildOrderAgreement` (`@figaro-protocol/sdk`, fed by the live-cache `specSource()` adapter) is a **pure, deterministic projection** of it — the composed clauses, plus the spec-declared mandatory defaults, and nothing more. It synthesizes no meaning the template + specs don't determine and reads no clause by name: mandatory clauses (`block.design.article: "mandatory"` — commerce, topology) auto-fold into every draft generically (the SDK's fold iterates the loaded spec set, so a never-seen mandatory clause folds in with zero code). Never a hardcoded clause→clause map, a named-clause branch, or a checkout-time guess; and no clause auto-spawns a DAG node — nodes are the designer's, drawn on the canvas.

## Clause validation in the frontend

- `clauseSpecSource.ts` — the module spec cache. No bundled copy and no
  preload: `useClauseSpecs` warms it chain→IPFS via `loadClauseSpec(id, uri)`
  from `ClauseRegistered` events (the seed clauses in `clauses/` on the devnet —
  all runtime-attestable except the agreement-only `figaro-topology` —
  plus any third-party registrations);
  spec-consuming surfaces gate on its `loaded`.

## Components (`components/`)

- **`runtime/`** — order flows, bond/token, attestation + capability surfaces (the lens system; e.g. `CapabilityRail`)
- **`members/`** — member onboarding shell + edit panels (profile, catalogue)
- **`registries/`** — the registry-explorer surfaces (`RegistryExplorer`)
- **`assemblies/`** — assembly display + designer surfaces
- **`data/`** — the data-explorer surfaces (`DataExplorer`)
- **`papers/`** — the paper-corpus chrome (`PaperLayout`)
- **`figures/`** — shared SVG figures (papers + marketing)
- **`marketing/`** — marketing-route layout primitives (`MarketingHeader`, `MarketingHero`, `MarketingSection`, `CtaLink`) plus `readingPathSteps.ts` — the reading spine's ordered steps (data, not a component; rendered as the per-route "read this next" link by `ReadingPathNext`, mounted in the marketing layout — home carries no path section)
- **`modules/`** — feature modules (e.g. `MemberBrandingModule`). Consumer surfaces are purpose-shaped pages (`/s/view?seller=<addr>`, `/orders`, `/orders/view?process=<id>`).
- **`shared/`** — shell/utility; **`ui/`** — design primitives; **`icons/`** — SVGs

## Canonical exemplars — copy these shapes

When building a new surface, anchor on the canonical implementation of its
surface-type below — extend or mirror it; never generate the shape from
scratch. (The base-model default shape is a closed-world product app; the
nearest exemplar in this repo beats it. Commission work as "make X work like
Y", not as an open-ended build.)

- **Runtime (phase-4) order surface** — `components/runtime/CapabilityRail.tsx`,
  driven by `deriveProcessModelFromRuntime` → `executeCapability`. The order
  page names NO clause (guarded by the maintainers' pre-commit guard battery).
  Two derived capability shapes: process-log LADDERS (attestations article →
  one-click next-stage buttons) and WITNESS stages (any composed clause
  declaring `spec.stages[N]` → a form generated from the declared fields via
  the one `FieldControl`, offered to both parties, repeatable while the order
  is active — mechanism owned by `docs/CLAUSES.md` § "Witness stages").
  Order ARRIVAL + acceptance + resolution are CORE (the `OrderCommitted` event +
  the your-turn badge, `components/shared/YourTurnBadge.tsx` in the Header) — never a clause
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
  raw hex is used nowhere as a content fill;
  `evidence-capture` → `EvidenceCaptureInput`, the device-layer witness
  capture — the device's OWN capabilities detected at runtime (geolocation
  cross-check everywhere, NFC tap on Android Chrome, BLE sighting on
  Chromium; browser and mobile, one surface — `lib/shared/deviceEvidence.ts`),
  capture pins the artifact and the URI fills the field, manual URI entry
  stays; richer ranging arrives via the wallet-operator agent seam, never the page).
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
- **Clause-composition UI** — `app/(tools)/assemblies/designer/_components/AgreementDrawer.tsx`
  (reads ClauseRegistry live; grouping word is `block.design.article`).
- **On-chain write flow** — `lib/member/usePublishMemberProfile.ts`
  (`simulateContract` → write → `waitForTransactionReceipt` → verify
  `status === "success"` before navigating).
- **IPFS-hydrated reads** — `hooks/useProcessAgreements.ts` over
  `lib/kernel/agreementFetch.ts` (singleton Map; never a synchronous
  `loadAgreement` in a render path).
- **Event-driven inventory page + smoke** — the `/registries` explorer
  (`frontend/components/registries/RegistryExplorer.tsx` over the pure
  `frontend/lib/registries/explorer.ts`) with
  `frontend/tests/e2e/registries.devnet.spec.ts` (one test per family + a
  facet deep link). Every row carries the state of the pinned content behind
  its on-chain pointer (`ExplorerRow.content`: resolved / resolving /
  unavailable) and renders an unresolved row as unresolved — the identity
  alone, never a name or article it does not have; "(unclassified)" is a
  RESOLVED spec that declares no article. Content the gateway has not served
  yet is re-read on `contentRetryDelayMs`'s schedule (10 s, 20 s, 40 s, then
  every 60 s) by the three pointer readers — `useClauseSpecs`,
  `useAssemblyChoices`, `useRegisteredMembers` — so a fresh registration names
  itself without a reload; reads walk the gateway chain (`ipfsService.ts`:
  `NEXT_PUBLIC_IPFS_GATEWAY_URL`, then `NEXT_PUBLIC_IPFS_FALLBACK_GATEWAY_URL`).
- **Scenario e2e** — `frontend/tests/e2e/local-commerce.devnet.spec.ts` is the
  live exemplar (composes on the canvas, pins to IPFS + anchors on-chain, then
  consumes from chain + IPFS — discovers, never imports a roster).
  `scenario-tradelens.devnet.spec.ts` + `tradelens-runtime.devnet.spec.ts` are
  the live producer/consumer pair (the scenario anchors the assembly, the
  runtime spec adopts it and says so in its own assertion message).
- **Network reads** — `lib/kernel/indexer.ts` (order events) + `lib/protocol/membersRegistryIndexer.ts` (registry events) (the canonical read side; reconstructs
  process/clause/seller state from chain events).

## Wallet-provider scope per route

Every route in `frontend/app/` is classified into one of three tiers
governing wallet-provider load. **The per-tier route lists live in the ONE
catalogue at § "Routes" above** — do not maintain a second list here.

- **Marketing** — pure publication / explanation. Lives in `app/(marketing)/`; does not load the wallet provider.
- **Reference / read-only (in `(app)/` or `(tools)/`)** — registries / tools whose primary purpose is read-only inspection but which mount the wallet provider for inline write affordances via `WalletGate`.
- **Transactional** — primary purpose is signing or sending transactions; lives in `app/(app)/`; requires a connected wallet.

**Rules:**

1. Do NOT gate read-only pages behind `useAccount` / `isConnected`. Wallet-connect is a signing prerequisite, not a login. A user who has never connected must be able to read every Reference / read-only and Marketing route.
2. For inline write affordances on Reference pages, use `WalletGate` (the canonical inline-gate wrapper).
3. The `(marketing)` / `(app)` route-group split is in place: `app/(marketing)/layout.tsx` does NOT mount `<Providers>`; `app/(app)/layout.tsx` and `app/(tools)/layout.tsx` do. Marketing pages still read on-chain state via the standalone `publicClient` exported from `lib/shared/wagmi.ts` — `/registries` is the canonical event-driven marketing inventory page (the concept pages keep a live count).

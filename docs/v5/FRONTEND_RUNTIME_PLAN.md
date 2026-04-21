# Frontend Runtime Plan

Status: active execution plan for moving the frontend from partial assembly composition to bounded institutional mutation.

## Goal

One runtime should be able to render buyer, operator, fulfiller, reviewer, and agent surfaces from the same institution package and subject binding.

The end state is not "generate any app." The end state is:

1. one secured protocol base
2. one semantic runtime
3. multiple institution surfaces selected by binding, service, and skin

## Current State

Implemented already:

1. assembly registry and reference assemblies
2. semantic derivation layer
3. reusable module registry
4. builder authoring and prototype surfaces
5. runtime identity seed types and parsers
6. safe skinning hooks

Missing or incomplete:

1. typed action registry
2. service registry
3. explicit mechanism package abstraction
4. end-to-end subject binding resolution
5. seller-address skin and metadata resolution in the live institution shell

## Phase 1. Freeze The Model

Goal: stop adding new frontend/runtime abstractions until they fit the canonical model.

Deliverables:

1. keep `FRONTEND_RUNTIME_MODEL.md` as the canonical runtime/frontend doc
2. archive the overlapping exploratory doctrine set
3. route readers from `RUNTIME_THESIS.md`, README, builder docs, and agent docs into the new model

Status: done in this session.

## Phase 2. Centralize The Action Model

Problem: action execution still lives inside modules and archetype-specific hooks.

Goal: make actions runtime-owned and module-consumed.

Deliverables:

1. introduce a typed action descriptor layer for protocol and mechanism actions
2. make modules render descriptors instead of constructing transactions ad hoc
3. let the semantic layer attach action descriptors to role contexts and order/process scopes
4. share the same descriptors with human UI and agent execution surfaces

Code seams:

1. `frontend/lib/core/useSemanticProcessWorkspace.ts`
2. `frontend/lib/core/useFigaroActions.ts`
3. `frontend/lib/semantic/deriveProcessModelFromRuntime.ts`
4. `frontend/components/modules/*ActionModule.tsx`

Success criterion: a resolve, claim, attest, register, or disclose action is described once and rendered many ways.

Status: in progress. The live semantic workspace now emits typed descriptors for process resolution, order-scoped sub-order composition, order-scoped auction claims, order-scoped delivery coordinator signals, seller-side disclosure writes, and institution-scoped operator profile writes, and the current workspace routes resolve, register, update-profile, auction claim, coordinator signal, seller disclosure, and delivery-proof actions through the shared descriptor executor. The console HITL surface also now normalizes operating and build actions through a shared presentation layer, forwards interactive sub-order proposals into the create-order surface instead of treating them as a dead-end execution path, shares the same AttestationCoordinator and resolve-process execution plumbing used by the live workspace, routes queued schema registration plus assembly publication through a shared build executor that prefers the workspace publication path and syncs executed publishes back into builder state, and uses the shared commitment flow plus commitment-share payload model for console order creation instead of a console-only signature path. Root-order, sub-order, console create-order, and the remaining TokenApprovalFlow-based entry points now also share one order-commitment preparation/approval stack plus the same token-decimal parsing rules, signed permits are broadcast through one shared helper across root-order, sub-order, and console order creation, and the approval-state / mock-mode / permit-fallback rules now live in one shared order-approval helper instead of being duplicated across the root-order and sub-order surfaces. The legacy workbench GHG workflow panel now also submits disclosure writes through `useSemanticProcessWorkspace` capability execution instead of calling the disclosure hook directly, so the workbench helper and semantic workspace share the same seller-disclosure action path, GHG disclosure transactions now feed their pending / confirming / success state back into the shared workspace action status instead of leaving disclosure capabilities stuck in an executing state, the `/fig` route now executes emission claims plus timelock withdrawals through the same shared transaction-capability dispatcher used by the semantic workspace rather than direct page-local hook branches, and the live delivery-attestation mechanism module now routes on-chain proof submissions through shared workspace capability execution instead of its own panel-local transaction path. Draft validation remains local editor feedback rather than a queued build mutation. The broader mechanism/module surface is still mid-migration.

## Phase 3. Introduce A Service Registry

Problem: discovery, catalogue, identity, messaging, and other service logic is still scattered across hooks.

Goal: institution assemblies bind service interfaces, not implementation-specific hooks.

Deliverables:

1. define service interfaces for identity, catalogue, discovery, messaging, handoff, and evidence transport
2. register at least one concrete implementation for each interface
3. let assemblies choose service providers through stable binding keys
4. give modules a resolved service object instead of reaching directly into archetype-specific helpers

Code seams:

1. `frontend/lib/shared/runtimeDataSource.ts`
2. `frontend/lib/shared/runtimeIdentity*.ts`
3. `frontend/lib/marketplace/*`
4. `frontend/lib/handoff/*`
5. `frontend/lib/dispute/*`

Success criterion: swapping a catalogue or discovery backend does not require a new module tree.

Status: started. The runtime now has six concrete service footholds: `frontend/lib/shared/runtimeIdentityService.ts` wraps bundled-source fallback, remote manifest loading, and assembly-context resolution behind one identity service interface, with `frontend/hooks/core/useRuntimeIdentitySource.ts` now centralizing both the manifest-input / remote-load / bundled-fallback state machine and assembly-context resolution used by the builder prototype shells; `frontend/lib/shared/catalogueService.ts` now wraps merchant catalogue fetch, cache invalidation, and publish operations so the catalogue editor and catalogue read hooks no longer import fetcher/publisher helpers directly, and its publish path can now be composed against an injected evidence-transport dependency instead of always pinning through the default IPFS service; `frontend/lib/shared/discoveryService.ts` now owns merchant roster lookup, catalogue-to-restaurant mapping, and mock fallback merging for buyer discovery instead of leaving that logic embedded in the registered-catalogues hook, and it can now compose against an injected catalogue service instead of reaching back into the default catalogue singleton internally; `frontend/lib/shared/ipfsService.ts` now centralizes JSON pinning, image upload, and URI resolution for agreement publication, dispute evidence, delivery attestation capture, and catalogue image upload instead of duplicating Kubo HTTP wiring in those surfaces; `frontend/lib/shared/coordinationMessagingService.ts` now centralizes wallet-to-channel resolution plus typed handoff and commitment-payload messaging so `useKeyExchange` and `HandoffKeyExchangeModule` no longer construct XMTP/mock channel access themselves; and `frontend/lib/shared/handoffPersistenceService.ts` now centralizes handoff key storage, pending-intent storage, receipt-backed artifact persistence, and deferred purge scheduling so the handoff library and cleanup hook no longer split those concerns across separate storage helpers. The first registry layer now exists too: assemblies can declare optional `serviceBindings`, `frontend/lib/shared/runtimeServices.ts` resolves a typed service bundle from those stable binding keys, registered provider keys can now resolve to real implementations instead of only warning and falling back to the defaults, `ModuleRenderContext` now carries that resolved bundle, and `HandoffKeyExchangeModule`, `CatalogueEditorModule`, plus `SellerDiscoveryModule` now consume `context.services` instead of importing default providers directly. The catalogue and discovery hooks under those modules also accept injected service implementations now, so those live seller and buyer surfaces no longer fall back to hardwired default providers beneath the module boundary. A shared `frontend/lib/shared/runtimeServicesContext.tsx` now exposes that resolved bundle to non-module consumers too, so `DisputeStatusPanel` and `useDeliveryAttestation` no longer import the default IPFS service directly when evidence transport is available through runtime context, the agreement artifact helpers in `frontend/lib/core/agreementStore.ts` can now publish and hydrate against an injected evidence transport instead of hardwiring the default IPFS singleton internally, `frontend/lib/handoff/useKeyExchange.ts` and `frontend/lib/handoff/useHandoffCleanup.ts` now resolve coordination-messaging and handoff-persistence implementations from runtime context or explicit overrides, the plain handoff helper wrappers in `frontend/lib/handoff/` can now compose against injected handoff-persistence services instead of always tunneling back to the default singleton, and the remaining IPFS compatibility wrappers now accept injected evidence transport too. Service resolution is still fragmented across hooks and other provider-bound flows, but direct `DEFAULT_*SERVICE.method(...)` calls are now gone from `frontend/lib`, `frontend/hooks`, and `frontend/components`, and the runtime has started resolving service objects at the assembly/workspace boundary.

## Phase 4. Promote Mechanism Packages To First-Class Objects

Problem: the runtime composes modules, but not complete mechanism packages.

Goal: each mechanism becomes a package the runtime can bind consistently.

A package should own:

1. contract hooks
2. semantic adapter
3. capability mapping
4. default action and inspector modules
5. guarantee and risk language

Deliverables:

1. define a package contract in the shared runtime layer
2. wrap core orders, attestation, operator registration, auction, and disclosure as packages
3. let assemblies reference packages instead of manually repeating module and capability glue

Code seams:

1. `frontend/lib/mechanisms/packages.ts`
2. `frontend/lib/shared/moduleRegistry.ts`
3. `frontend/lib/semantic/assemblyCapabilityBinding.ts`
4. `frontend/lib/shared/institutionAssembly.ts`
5. `frontend/components/modules/registerAllModules.ts`

Success criterion: adding a new mechanism mostly means shipping one package, not wiring five disconnected layers.

Status: started. `frontend/lib/mechanisms/packages.ts` now defines a built-in mechanism-package contract plus registry, and the first packaged mechanism set now covers core orders, Dutch auction, disclosure, attestation, FIG, coordinator, and operator registry with their default modules, capability bindings, and hook exports. `frontend/components/modules/registerAllModules.ts` now registers those packages instead of wiring their action panels directly, and `frontend/lib/semantic/assemblyCapabilityBinding.ts` can now resolve core, auction, disclosure, attestation, FIG, coordinator, and operator-registration capabilities through registered package metadata before it falls back to heuristics. The coordinator package now also owns the delivery handoff details, tracking, and key-exchange surfaces used by physical-handoff assemblies, while the attestation slice is currently the delivery-attestation runtime module plus proof-capability metadata for delivery assemblies; broader AttestationCoordinator ownership still spans the coordinator and disclosure families. Package defaults now also supply effective module and capability ownership during parsing, validation, and runtime derivation, while built-in assembly scaffolding now defaults module metadata (`componentKind`, `semanticInput`), baseline layout for the standard runtime-shell/core/coordinator modules (`slot`, `priority` when both are omitted), and the standard `overview` / base `role-dashboard` view shape (`route`, `contextsAccepted`, baseline `moduleSlots`) during parsing plus authoring serialization. Shipped assemblies can therefore carry only mechanism-specific deltas, richer view composition choices, non-default layout policy, and true overrides instead of repeating runtime-owned boilerplate. The remaining standalone modules are now explicitly split between runtime-shell scaffolding (`role-switcher`, `capability-rail`, `mechanism-inspector`) and assembly-composition surfaces (`seller-discovery`, `cart`, `job-market`, `catalogue-editor`). Operator registration is package-owned, while `CatalogueEditorModule` stays assembly-specific because it composes catalogue authoring, branding, IPFS transport, and operator-profile writes for the Eats discovery surface rather than expressing a generic registry primitive. Most mechanisms are still unwrapped, but mechanism packages are now a live runtime primitive instead of a plan-only concept.

## Phase 5. Complete Subject Binding

Problem: runtime identity exists as a seed, but the full binding pipeline is not yet what decides the live institution surface.

Goal: seller and operator addresses should resolve directly into the correct institution context.

Deliverables:

1. complete subject record resolution
2. complete institution binding resolution
3. make role mapping explicit in the binding, not heuristic
4. resolve metadata and assets from the binding into the institution shell

Code seams:

1. `frontend/lib/shared/runtimeIdentity.ts`
2. `frontend/lib/shared/runtimeIdentityParser.ts`
3. `frontend/lib/shared/runtimeIdentityRegistry.ts`
4. `frontend/lib/shared/runtimeResolution.ts`
5. `frontend/lib/shared/runtimeDataSource.ts`
6. `frontend/lib/shared/runtimeServices.ts`
7. `frontend/components/core/InstitutionWorkspace.tsx`
8. `frontend/app/i/[slug]/InstitutionPageShell.tsx`

Success criterion: a bound seller address lands in its own institution surface with the right roles, services, and skin.

Status: started. The runtime identity layer now preserves binding-level metadata, asset references, and optional binding-level service bindings inside the resolved assembly runtime context, institution-scoped bindings can emit explicit `assemblyRoleKinds` mappings for shell role selection, runtime manifest validation now warns when those institution bindings omit an explicit assembly-role mapping, and the live role-selection path no longer falls back to suffix heuristics when a connected address matches a bound subject. The live institution shell and artifact workspace now resolve title/subtitle plus raw branding and asset refs from the matched binding instead of always rendering assembly identity, shared module context carries the selected bound subject plus shell presentation metadata for downstream consumers, the live workspace resolves runtime services against the matched binding before it falls back to assembly-level provider keys, and the shell now executes a first runtime skin bundle from binding-resolved asset documents when present, falling back to seller metadata otherwise, via logo, hero image, accent token, theme class, sanitized CSS injection, and `data-skin` targeting at the shell boundary. That skin path can now also hydrate binding asset documents over the selected evidence-transport service when the runtime only has an `assetURI`, the runtime-shell scaffolding plus shared wallet-process list now consume the resolved skin bundle as presentation-only chrome instead of staying hardcoded neutral, the seller setup surfaces now use that same bundle for accent and shell-label chrome inside the catalogue editor and operator registration panel, the core seller mechanism panels now pick up the same skin for action buttons, timeline filters, capital bars, settlement cards, and order-detail chrome without changing their semantic state rules, the delivery coordination, disclosure, plus delivery-attestation panels now consume that same bundle for presentation-only chrome while preserving their mechanism-specific status semantics, the buyer-side discovery and cart surfaces now carry that same runtime skin path into assembly-composition panels without touching cart state or seller data, the driver-side job-market surface now does the same for shell labels, driver profile chrome, auction cards, and claim controls without changing auction semantics, the FIG, auction-action, plus process-graph runtime panels now also expose the same shell-label and accent path without changing token, auction-claim, or process-selection semantics, and the handoff tracker, key-exchange, plus handoff-details panels now do the same while preserving lifecycle, transport, and privacy semantics. The mounted Phase 6 runtime-panel seam is now effectively closed; `MerchantBrandingModule` remains the lower-level skin executor rather than a runtime panel gap.

## Phase 6. Connect Skin Bundles End To End

Problem: skinning hooks exist, but they are not yet a resolved runtime product of the institution binding.

Goal: safe presentation overrides flow from institution assets into the rendered shell.

Deliverables:

1. define a runtime skin bundle shape
2. load theme tokens and assets from resolved bindings
3. apply them at shell boundaries only
4. preserve mandatory risk and guarantee surfaces under every skin

Code seams:

1. `frontend/SKINNING_HOOKS.md`
2. `frontend/components/core/InstitutionShell.tsx`
3. `frontend/components/modules/MerchantBrandingModule.tsx`
4. `frontend/components/core/InstitutionWorkspace.tsx`
5. `frontend/components/core/InstitutionArtifactWorkspace.tsx`
6. `frontend/lib/shared/merchantBranding.ts`
7. `frontend/lib/shared/runtimeResolution.ts`
8. `frontend/components/core/RoleSwitcher.tsx`
9. `frontend/components/core/CapabilityRail.tsx`
10. `frontend/components/core/MechanismInspectorCard.tsx`
11. `frontend/components/core/ProcessSummaryCard.tsx`

Status: started. The live shell now resolves a runtime skin bundle from binding-resolved asset documents when available, falls back to seller metadata when those documents are absent, executes theme class plus accent token plus sanitized CSS through the existing merchant-branding wrapper, exposes `data-skin` on the shell wrapper, and renders logo and hero assets inside the shell header while keeping the existing risk and process surfaces intact. When the runtime only has an `assetURI`, the shell can now hydrate the asset document over the selected evidence-transport service and upgrade the skin asynchronously instead of stopping at manifest-bundled records. The runtime-shell scaffolding surfaces (`role-switcher`, `capability-rail`, `mechanism-inspector`) plus the shared wallet-process summaries now also consume the resolved skin bundle for accent and shell-label chrome while leaving capability logic, guarantees, and risk boundaries untouched, the seller-facing setup surfaces (`CatalogueEditorModule`, `OperatorRegistrationModule`) now do the same for card chrome and call-to-action styling without changing their execution paths, the core seller mechanism panels (`OrderActionModule`, `OrderNodeModule`, `SettlementBreakdownModule`, `ProcessCapitalSummaryModule`, `EventTimelineModule`) now consume the same bundle for presentation-only chrome while preserving their protocol state semantics, the delivery coordination / disclosure / delivery-attestation panels now carry the same presentation-only skin path into deeper mechanism surfaces, the buyer-side discovery/cart composition surfaces now do the same for shell labels, filter chrome, add-to-cart controls, and cart checkout chrome, the driver-side job-market surface now does the same for shell labels, profile chrome, filter controls, and auction claim cards, the FIG plus generic neutral runtime panels (`FigTokenModule`, `AuctionActionModule`, `ProcessGraphModule`) now also consume that same shell-label and accent path without mutating token, auction, or process semantics, and the handoff panels (`HandoffTrackerModule`, `HandoffKeyExchangeModule`, `HandoffDetailsModule`) now do the same while preserving their lifecycle and transport semantics. The remaining live work is no longer runtime-panel adoption; it is hardening and future skin evolution around the lower-level branding executor and any new surfaces that land later.
4. `frontend/lib/shared/runtimeManifest.ts`

Success criterion: institutions can look distinct without altering semantic truth.

## Phase 7. Rationalize Runtime Surfaces

Problem: the repo still carries overlapping surfaces for workbench, builder, institution, and archetype exploration.

Goal: make each route class do one job.

Route posture:

1. `/workbench` stays protocol-native and builder-friendly
2. `/builders/*` authors and inspects assemblies and packages
3. `/i/[slug]` is the primary live institution runtime shell
4. archetype marketing pages explain institutions, but do not become the main execution surface

Success criterion: users can tell whether they are in protocol space, builder space, or institution space at a glance.

Status: started. The first rationalization seam now lands posture cues without rewriting route internals: the shared header can expose a route-class badge so `/workbench` reads as protocol space and `/builders/*` reads as builder space, the protocol workbench now owns its header/footer plus protocol-space banner at `frontend/app/workbench/layout.tsx` instead of keeping that chrome inline inside the page body, the builders subtree now owns its shared header/footer plus builder-space banner at `frontend/app/builders/layout.tsx` instead of repeating that chrome in each page, the live institution subtree now owns its shared header/footer plus institution-runtime banner at `frontend/app/i/[slug]/layout.tsx` so `InstitutionPageShell` can focus on workspace content and fallback state rather than route framing, and the Eats archetype marketing route now declares itself as a reference-archetype explanatory surface with an explicit handoff link into `/i/figaro-eats` instead of reading like another execution shell. Browser-level mock Playwright coverage now also asserts those route-class cues on `/workbench`, `/builders`, `/i/figaro-eats`, and `/figaro-eats`, so the route posture work is no longer only a component-test seam. The remaining Phase 7 work is harmonizing broader layout and navigation expectations across the remaining explanatory routes without collapsing those route classes back together.

## Phase 8. Human And Agent Parity

Problem: agent coordination is documented, but runtime execution still assumes mostly human-driven modules.

Goal: the same runtime model should be consumable by agents without a second architecture.

Status: done. The runtime now exposes a structured `/api/semantic/runtime` snapshot that resolves the same bound subjects, provider-key bindings, shell presentation, role selection, visible mechanisms/modules, and institution-scoped capabilities used by the live institution shell. The route accepts runtime binding or subject selection plus optional role narrowing, so agent clients can consume the same institution model a human sees instead of a second integration surface. The console HITL queue now also resolves that same runtime snapshot from the queued actor address, attaches it to operating queue items for human review, surfaces the resolved institution and provider bindings inside the approval cards, and carries the resolved binding context through forwarded execution results instead of approving raw SDK actions in isolation. The generic SDK `ActionQueue` now also carries optional typed approval-context metadata per queued action, so non-console agent workflows can preserve the same runtime-bound review context without taking a frontend dependency. Phase 8's parity seam now lands on both the runtime API side and the shared HITL queue side, rather than stopping at the human console surface.

Deliverables:

1. expose typed action descriptors through agent-facing endpoints or structured APIs
2. let agent workflows consume resolved institution bindings and service bindings
3. keep action approval and action execution compatible with human-in-the-loop queues

Success criterion: an agent can operate the same institution model a human sees, not a special parallel integration.

## Non-Goals

This plan does not aim to:

1. create arbitrary remote app loading
2. make schemas into first-class page types
3. maximize composability for its own sake
4. rebuild every route before the action and service layers are fixed

## Sequence Rule

Do the work in this order:

1. action model
2. service registry
3. mechanism packages
4. subject binding
5. skin pipeline
6. surface rationalization
7. agent parity

That order matters because view and skin work will stay unstable until actions, services, and bindings become runtime-owned.

## Success Criteria

The plan is complete when all of the following are true:

1. actions are typed once and rendered many ways
2. institutions bind services through stable interfaces
3. seller or operator address selects the correct institution surface
4. skins load safely from institution bindings
5. modules are packaged by mechanism, not just registered ad hoc
6. humans and agents consume the same institution model
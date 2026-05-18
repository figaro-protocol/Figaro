# Figaro Runtime

The complete description of Figaro's runtime layer — the thesis, the
frontend composition model, and the semantic-layer type system. This
doc consolidates what was previously three files: `RUNTIME_THESIS.md`,
`FRONTEND_RUNTIME_MODEL.md`, and `SEMANTIC_MODEL_LAYER.md`.

---

# Part 1 — Runtime Thesis


Status: working architectural note that connects the protocol, builder, semantic frontend, and downstream archetypes into one practical model.

## Core Claim

Figaro should be treated primarily as a runtime for composed institutions, not merely as a backend for isolated vertical apps.

The protocol secures coordination through asymmetric bonding.
Additional mechanisms can then be attached on top of that security surface.

In practice, one institution may combine:

1. blockchain network coordination
2. ERC20-denominated asset coordination
3. FigaroCore bonded process coordination
4. attached coordination mechanisms such as auctions, lifecycle modules, disclosure modules, reputation modules, and provenance modules

The frontend should therefore be able to render and operate many institution assemblies from the same semantic runtime.

## Default Interpretation For Contributors And Agents

When you are unsure how to interpret a new feature, document, or frontend
surface, default to these assumptions:

1. `Figaro-Prototype2` is the canonical runtime, semantic layer, builder surface,
   and shared module environment
2. downstream repos such as `Figaro-eats` are archetypes and proving grounds,
   not the main architectural center of gravity
3. archetypes may specialize presentation and workflow policy, but settlement
   semantics remain anchored in the protocol and shared runtime model

## Why The Builder Exists

The builder work in Prototype2 exists because the target is not one app.

The target is a reusable runtime that can:

1. understand an institution assembly
2. derive semantic objects from protocol state
3. bind reusable mechanism-aware modules
4. expose capabilities by role and context
5. let downstream archetypes specialize presentation, metadata, and workflow policy

Under this thesis, a concrete vertical such as Local Commerce is not the universal UI shape of Figaro.
It is one archetype assembly that proves how multiple coordination mechanisms can be composed into an operational institution.

## Practical Comparison

### Runtime Thesis

Prototype2 is the canonical runtime.
Concrete use cases are institution assemblies or downstream archetype packages.

Practical consequences by role:

1. buyers get a more consistent mental model across many institutions
2. merchants and operators can join an archetype with less bespoke app setup
3. drivers and other fulfillers can reuse capability surfaces across institutions
4. builders accumulate reusable assembly, mechanism, and semantic assets instead of rebuilding vertical shells
5. protocol maintainers harden one runtime model rather than many partially duplicated apps

### Vertical Thesis

Each use case becomes its own primary app.
Prototype2 remains protocol plus tooling.

Practical consequences by role:

1. buyers get use-case-specific polish faster, but face fragmented products
2. merchants and operators onboard into app silos rather than institution templates
3. builders gain less leverage from assemblies and reusable module work
4. protocol maintainers face repeated frontend reimplementation across verticals

## Revised Conclusion

The strategic default should be the runtime thesis.

The vertical thesis is still useful tactically when:

1. a downstream repo is needed as a proving ground
2. a service-layer specialization needs to move faster than the shared runtime
3. a concrete archetype needs independent testing and deployment discipline

But that should be understood as staging, specialization, or external packaging.
It should not displace the runtime model as the main architectural direction.

## Local Commerce In This Model

Figaro Local Commerce should be understood as the first concrete archetype of:

1. buyer-dominant merchant order flow
2. one-hop local fulfillment
3. one-hop delivery attachment
4. auction-mediated courier allocation
5. optional disclosure and reputation overlays

That makes Local Commerce valuable not only as a food-delivery demo, but as proof that the same secured process model can support other archetypes such as ride hailing, couriered retail, local service dispatch, or repair coordination.

## Practical Merchant Target

The runtime thesis only wins in the real world if joining an institution is simpler than building an app.

The target onboarding shape should therefore be:

1. merchant wallet or operator address is associated with an institution template or archetype
2. the runtime resolves role mappings, mechanism bindings, and policy defaults
3. merchant metadata, branding assets, and presentation overrides load from decentralized metadata
4. buyers enter a branded institution surface without losing protocol legibility or security guarantees

In short: wallet plus template plus metadata plus assets should be enough to join an institution.

## Architecture Layers

The runtime direction suggests four distinct layers:

1. protocol kernel
2. semantic derivation layer
3. institution assembly and mechanism module layer
4. party-specific presentation and asset layer

The protocol kernel determines settlement truth.
The semantic layer determines institution-aware meaning.
The assembly layer determines what is shown and how capabilities are grouped.
The party-specific layer determines branding, media, and presentation overrides.

These layers must remain distinct.
Presentation should never be able to change settlement semantics.

## Repository Roles

### Prototype2

Prototype2 should own:

1. protocol kernel and generic extensions
2. semantic model layer
3. institution assembly schema and registry
4. builder, authoring, prototype shell, and reusable mechanism-aware modules
5. runtime doctrine for how institutions are rendered and operated

### Figaro-eats

Figaro-eats should currently be treated as:

1. the first reference archetype
2. a downstream proving ground for service-layer specialization
3. a place to validate real operator flows before they are generalized into the runtime

Long term, more of what is currently Local Commerce-specific on the frontend should migrate into reusable runtime modules or assembly-governed institution surfaces where that generalization is justified.

## Immediate Planning Questions

1. what is the canonical merchant or operator binding model from wallet address to institution template
2. which assembly fields are protocol-adjacent and must be versioned strictly
3. which presentation overrides are safe, and which would cross trust boundaries
4. how should decentralized assets and metadata be resolved, cached, authenticated, and versioned
5. what remains archetype-specific versus what should be generalized into shared runtime modules

## Related Documents

The technical path from protocol composition to institution runtime is
covered in three places:

1. **Part 2 below** — the frontend composition model (was previously
   `FRONTEND_RUNTIME_MODEL.md`).
2. **Part 3 below** — the semantic-derivation layer (was previously
   `SEMANTIC_MODEL_LAYER.md`).
3. [PUBLIC_GRAPH_MODEL.md](PUBLIC_GRAPH_MODEL.md) — the protocol-level
   graph model that the runtime renders against.

The first-pass shared runtime implementation seeds now live under `frontend/lib/shared/`, including typed identity resolution records and an Local Commerce merchant metadata schema.

The workspace renderer now also consumes bound runtime context to constrain role selection when a connected address matches a bound institution subject, and it scopes the mechanism inspector to the selected role context instead of always showing the full assembly indiscriminately.

Binding-to-assembly role mapping in that pipeline is now explicit, so runtime role selection no longer depends on suffix heuristics in role labels, the resolved runtime context preserves binding-level metadata, asset references, optional service bindings, and manifest-backed asset documents for shell consumers, the live institution shell resolves title/subtitle from the matched binding rather than always rendering assembly identity, the live workspace resolves runtime services against the matched binding before it falls back to assembly defaults, and the shell now executes a first runtime skin bundle from binding asset documents with seller metadata as fallback through logo, hero, accent, theme class, sanitized CSS, and `data-skin` targeting. When only an `assetURI` is present, that shell-bound path can now hydrate the asset document over the selected evidence transport, and the runtime-shell scaffolding, shared wallet-process summaries, seller setup surfaces, core seller mechanism panels, the delivery coordination / disclosure / delivery-attestation surfaces, the buyer-side discovery/cart composition surfaces, the driver-side job-market surface, the handoff panels, plus the FIG and generic runtime wrapper panels now consume that same bundle for presentation-only chrome. The next hardening step is no longer basic panel adoption; it is preserving that seam as the runtime evolves while keeping `MerchantBrandingModule` as the lower-level executor rather than turning it into another special-case panel.
---

# Part 2 — Frontend Runtime Model


Status: canonical current model for the runtime-facing frontend after archiving the earlier exploratory frontend doctrine set.

## Purpose

The frontend should render institutions from bounded composition units.

It should not behave like:

1. one hardcoded app shell
2. a collection of page-specific contract forms
3. a system that mutates by shipping arbitrary remote UI

It should behave like a runtime that can render different institution surfaces from the same secured protocol base.

## Core Claim

The runtime mutates by composing seven layers:

1. protocol truth
2. semantic derivation
3. institution assembly
4. mechanism packages
5. service bindings
6. view definitions
7. skin bundles

That is enough to render a buyer storefront, operator cockpit, fulfiller workspace, reviewer surface, or agent-facing control plane without redefining the protocol each time.

## What Stays Fixed

These layers must remain runtime authority, not institution override points:

1. protocol truth from contracts and events
2. semantic derivation of roles, capabilities, guarantees, and risk boundaries
3. action validity and authority checks
4. mandatory guarantee and risk disclosures
5. mechanism trust boundaries

An institution may rename or reframe a mechanism, but it must not alter what that mechanism actually does.

## What May Vary Per Institution

These layers are the intended mutation surface:

1. the assembly selected for the institution
2. the mechanism packages the assembly includes
3. the service providers bound to that institution
4. the views exposed for each role and context
5. the metadata and assets loaded for that institution
6. the skin and narrative layer applied to the shell

The correct goal is not maximum composability. It is bounded institutional mutation.

## Runtime Pipeline

The runtime pipeline should be understood as:

`connected address -> subject record -> institution binding -> assembly -> mechanism packages -> service bindings -> role context -> view surface -> skin bundle`

Each step answers a distinct question:

1. who is here
2. which institution context applies
3. which mechanisms and services are active
4. what can this actor do now
5. which surface should the runtime render
6. how should that surface look

## Composition Units

### 1. Institution Assembly

The assembly is the runtime's structural declaration.

It decides:

1. roles
2. mechanisms
3. view definitions
4. module placement
5. narrative defaults

It is implemented today through `frontend/lib/shared/institutionAssembly*.ts` and the reference assembly JSON files.

### 2. Mechanism Package

A mechanism package is the reusable unit the runtime should actually compose.

Each package should own:

1. contract bindings and writes
2. semantic adapters
3. capability mappings
4. default inspector and action modules
5. guarantee and risk copy

The runtime already composes modules. The missing step is to make the package above those modules explicit.

### 3. Service Binding

Service bindings connect the institution to off-chain or hybrid infrastructure.

Typical service classes are:

1. identity resolution
2. catalogue or merchant metadata
3. discovery and search
4. messaging and handoff
5. evidence or artifact transport
6. geospatial filtering

These should be resolved through stable interfaces, not hardwired per archetype.

### 4. View Definition

View definitions remain the correct UI composition primitive.

They decide:

1. route or surface id
2. accepted context
3. visible slots
4. module ordering
5. role-specific visibility

We do not need a separate "view recipe" primitive yet. The current assembly view definitions are enough until the repo hits a real repeated pattern that cannot be expressed through them.

### 5. Skin Bundle — retired

The skin-bundle wrapper layer was retired in the V4→V5 narrowing. The V4
ENS/IPFS skinning system (per-binding `assets.cssURI`, hydrated asset
documents, `data-skin` attributes on 20+ surfaces) shipped in the prior
frontend (`archive-frontend/SKINNING_HOOKS.md`) but was never re-wired in
V5 — V5's `OperatorRegistry` metadata surface exposes only `logoURI`, and
no production code constructed a `ResolvedAssemblySkinBundle`.

Per-operator visual identity in V5 flows through `lib/shared/merchantBranding.ts`
+ `MerchantBrandingModule` directly from `useOperatorProfile()`. The
broader skinning vision is not part of the V5 product surface.

## Subject Binding and Seller-Address Mutation

Seller-address mutation should happen through subject binding, not through bespoke app forks.

The binding model is:

1. address resolves to a subject record
2. subject record resolves to one or more institution bindings
3. institution binding selects an assembly, metadata bundle, and asset bundle
4. runtime derives role context and visible mechanisms

This is how an address should become "my institution surface" without the repo collapsing back into one vertical app per seller.

## Schema Terms Are Not View Types

Schema-backed content such as allergens, GHG disclosure, manifests, safety declarations, or handoff evidence belongs in the agreement and metadata layer.

Those terms may influence which panels appear in a surface, but they do not justify a separate UI composition primitive.

In practical terms:

1. allergens are agreement or catalogue data
2. GHG is a disclosure schema and attestation flow
3. neither one requires a special "view recipe" concept

The runtime should render schema-backed content through the existing view and module system.

## Human and Agent Parity

The runtime should expose the same institution through the same underlying action model for both humans and agents.

That means:

1. actions should be typed and inspectable
2. modules should render those typed actions for humans
3. agents should be able to consume the same action descriptors without a separate institution model

The runtime is not human-only UI with an agent add-on. It is one institution model with multiple consumers.

## Current Repo State

The repo already has the foundation for this model:

1. assembly registry and parsing in `frontend/lib/shared/institutionAssembly*.ts`
2. semantic derivation in `frontend/lib/semantic/`
3. descriptor-backed institution, process, and order actions in the live semantic workspace for operator profile writes, seller disclosure writes, auction claims, delivery coordinator signals, resolve, and downstream composition entry points, with the legacy workbench GHG workflow panel now routing disclosure writes through that same capability executor instead of a direct disclosure hook
4. console-side action presentation normalized across operating and build actions, with interactive sub-order proposals forwarded into the create-order surface instead of failing at queue execution time
5. AttestationCoordinator writes now flow through one shared runner across the console provider, delivery lifecycle hook, and GHG disclosure hook, and GHG disclosure transactions now propagate their pending / confirming / success state back into the shared workspace executor status
6. resolve-process commitment reconstruction and transaction submission now share one frontend path across the semantic workspace and console provider
7. console build mutations now run through one shared executor, reuse the workspace-backed assembly publisher when available, and feed executed publish results back into BuildProvider so the registered assembly list stays live; draft validation stays local to the editor rather than entering the HITL queue
8. the console Create Order surface now reuses the shared commitment flow and commitment-share payload model already used by the workbench and sub-order modal, so forwarded sub-order proposals land in the same dual-signature flow instead of a console-only signing path
9. root-order, sub-order, and console create-order surfaces now share one order-commitment preparation path for agreement persistence, optional IPFS publication, default unsigned commitment construction, token-decimal parsing, buyer-bond approval gating, and signed-permit submission before they enter the shared commitment flow, the remaining TokenApprovalFlow-based entry points now reuse the same approval hook instead of a separate token-security helper, and the root-order / sub-order approval-state rules now live in one shared helper rather than duplicated component-local branches
10. transaction capability dispatch now shares one core helper across the semantic workspace, the `/fig` route, and the live delivery-attestation mechanism module, so FIG emission claims, timelock withdrawals, and delivery proof submissions no longer run through isolated local transaction branches
11. runtime identity seeds in `frontend/lib/shared/runtimeIdentity*.ts`
12. reusable modules in `frontend/components/modules/`
13. authoring and prototype surfaces under `/builders`
14. safe skinning hooks in `frontend/SKINNING_HOOKS.md`
15. schema-composed agreement and catalogue metadata in `frontend/lib/core/agreementManifest.ts` and `frontend/lib/shared/sellerCatalogueMetadata.ts`
16. assembly-level service binding and resolution in `frontend/lib/shared/runtimeServices.ts`, with `InstitutionWorkspace` now resolving one typed service bundle from optional assembly `serviceBindings` and threading it through `ModuleRenderContext`
17. an initial mechanism-package registry in `frontend/lib/mechanisms/packages.ts`, with core orders, Dutch auction, disclosure, attestation, FIG, coordinator, and operator registry now packaged as first-class runtime objects that own their default modules, capability bindings, and hook exports; the coordinator package now also owns the delivery handoff details, tracking, and key-exchange surfaces used by physical-handoff assemblies, while `registerAllModules.ts` registers those packages before the remaining standalone modules, now explicitly split between runtime-shell scaffolding and discovery/catalogue assembly-composition wrappers; built-in assembly defaults in `frontend/lib/shared/builtInModuleDefaults.ts` now also default module metadata (`componentKind`, `semanticInput`), baseline layout for standard runtime-shell/core/coordinator modules (`slot`, `priority` when both are omitted), plus the standard `overview` / base `role-dashboard` view shape for authored assembly documents so references mostly carry richer non-default layout and visibility policy rather than repeated runtime boilerplate
18. a consumer-facing commerce boundary in `frontend/lib/commerce/`: `CommerceProvider` supplies wallet identity via `useCommerce()`, `useCheckout(token)` composes token approval, balance checking, EIP-712 signing, and commitment broadcasting into one hook, and `types.ts` defines the `CheckoutHandle` surface shared by `CartModule`, `CreateOrderWithApproval`, and any future consumer-facing order flow
19. a centralized user-facing terminology dictionary in `frontend/lib/shared/vocab.ts`, mapping protocol-internal terms to consumer-friendly language (bond→deposit, commit→place, resolve→complete, attestation→verification) with namespaced label exports (`vocab.buttons.*`, `vocab.status.*`, `vocab.headings.*`, `vocab.progress.*`, `vocab.errors.*`, `vocab.info.*`, `vocab.labels.*`) consumed by order-flow components

## Main Gaps

The main architectural gaps are no longer module composition gaps.

They are:

1. action execution is still fragmented across modules beyond the current descriptor-backed semantic workspace slice for resolve, sub-order composition, auction claims, delivery coordinator signals, seller disclosure writes, delivery proof submissions, and operator profile writes; the console queue now shares action presentation semantics, resolve/attestation execution plumbing, a shared build executor for queued build mutations, the shared commitment flow for order creation, and the shared transaction-capability dispatcher now also covers the `/fig` route plus the live delivery-attestation mechanism module, while root-order, sub-order, console create-order, the legacy TokenApprovalFlow entry points, and the workbench GHG workflow helper share the current commitment/approval/disclosure execution seams, but broader mechanism execution still sits outside one fully converged descriptor-owned runtime layer
2. service resolution is still fragmented across archetype-specific hooks, although runtime identity preview loading now has a shared service seam for bundled fallback, remote manifest fetch, and assembly-context resolution used by the builder prototype shells, the catalogue read/write surface now shares a catalogue service wrapper instead of reaching straight into fetcher and publisher helpers, the buyer discovery path now shares a discovery service wrapper for merchant roster lookup, restaurant mapping, and mock fallback behavior, IPFS-backed artifact transport now shares one service for JSON pinning, file upload, and gateway URI resolution across agreement, evidence, attestation, and catalogue-image flows, handoff messaging now shares one coordination-messaging service for wallet-based channel resolution plus typed send/listen operations across `useKeyExchange` and `HandoffKeyExchangeModule`, handoff artifact persistence now shares one service for key storage, pending intents, receipt-backed persistence, and cleanup scheduling instead of splitting that state across multiple handoff-local helpers, and the workspace now resolves one typed runtime service bundle from optional assembly binding keys for module consumers; registered provider keys can now resolve to real runtime service implementations rather than only warning and falling back to defaults, the catalogue and discovery hooks used by the live seller and buyer modules can now take those injected service objects, a shared runtime-services React context now makes the resolved bundle available to non-module consumers like dispute evidence and delivery-attestation flows, the shared catalogue/discovery service layer plus agreement artifact helpers can now be composed against injected dependencies instead of hardwiring default transport or catalogue singletons internally, the handoff key-exchange / cleanup hooks plus the plain handoff helper wrappers can now consume injected messaging or persistence services instead of reaching straight back into the default singletons, and the remaining IPFS compatibility wrappers now also accept injected transport, but broader service adoption still needs to move deeper into the remaining runtime surfaces and future mechanism packages
3. subject binding is only partially implemented: runtime identity now carries explicit binding-to-assembly role mappings, the resolved assembly runtime context preserves binding-level metadata, asset references, optional binding-level service bindings, and manifest-backed asset documents, live role selection no longer depends on suffix heuristics, the live shell derives title/subtitle plus raw branding and asset refs from the matched binding, the live workspace resolves runtime services against the selected binding before falling back to assembly defaults, and the shell now executes a first skin bundle from binding asset documents when present while hydrating remote asset documents over the selected evidence transport when only an `assetURI` is available, with runtime-shell scaffolding plus the shared wallet-process list, seller setup surfaces, core seller mechanism panels, the delivery coordination / disclosure / delivery-attestation surfaces, the buyer-side discovery/cart composition surfaces, and the driver-side job-market surface now consuming that bundle as presentation-only chrome, but seller-address-to-institution resolution still does not drive the full binding-asset skin pipeline end to end
4. mechanism packages have only started to become explicit first-class objects: core orders, Dutch auction, disclosure, attestation, FIG, coordinator, and operator registry now have package contracts plus package-aware capability inference, the coordinator package now also absorbs the delivery handoff UI surfaces that were previously registered standalone, and package defaults now provide effective module/capability ownership so assemblies can carry only mechanism-specific deltas. Built-in assembly metadata now also defaults module metadata, baseline layout for the standard runtime-shell/core/coordinator modules, plus the standard `overview` / base `role-dashboard` view scaffold, leaving authored JSON to express richer view composition, non-default layout policy, and true overrides instead of repeating runtime-owned metadata. The remaining standalone modules are no longer a vague remainder bucket: `role-switcher`, `capability-rail`, and `mechanism-inspector` are runtime-shell scaffolding, while `seller-discovery`, `cart`, `job-market`, and `CatalogueEditorModule` are assembly-composition surfaces. `CatalogueEditorModule`, for example, stays a local-commerce / discovery composition surface because it layers catalogue authoring, branding, and IPFS-backed metadata publication on top of operator registration rather than defining a generic registry primitive. Broader AttestationCoordinator ownership across delivery coordination and disclosure, along with the rest of the mechanism layer, still lives across separate metadata, hooks, and module registrations
5. skin bundles now resolve at the shell boundary from binding asset documents with a seller-metadata fallback, missing asset documents can hydrate over the selected evidence transport, and the runtime-shell scaffolding, shared wallet-process summaries, seller setup surfaces, core seller mechanism panels, the delivery coordination / disclosure / delivery-attestation panels, the buyer-side discovery/cart composition surfaces, the driver-side job-market surface, the handoff panels, plus the FIG and generic runtime wrapper panels now consume that bundle for accent and labeling chrome; `MerchantBrandingModule` remains the lower-level skin executor rather than a missing runtime-panel adoption seam

## Decision Rules

Use these rules when deciding whether to add a new abstraction:

1. if the problem is schema meaning, solve it in agreement or metadata, not view composition
2. if the problem is repeated action logic, solve it in the action model, not by adding a new module type
3. if the problem is provider variance, solve it in service bindings, not in page code
4. if the problem is institution appearance, solve it in skin bundles, not in semantic derivation
5. if the problem is mechanism structure, solve it as a mechanism package, not a bespoke route

## Relationship To Other Active Docs

This part is the canonical runtime-facing frontend model. **Part 1**
above carries the repo-level runtime framing; **Part 3** below carries
the semantic-derivation layer. See `PUBLIC_GRAPH_MODEL.md` for the five
public graphs and provenance context.
---

# Part 3 — Semantic Model Layer


Status: implemented. `frontend/lib/semantic/` contains `models.ts`, `assemblyCapabilityBinding.ts`, `deriveInstitutionFromAssembly.ts`, `deriveProcessModelFromRuntime.ts`, and `deriveRoleContextsFromAssembly.ts`. The doctrine below describes the design rationale for that layer. Read it alongside [PUBLIC_GRAPH_MODEL.md](PUBLIC_GRAPH_MODEL.md) and [CURRENT_STATE.md](CURRENT_STATE.md).

## Purpose

The interface ontology defines what the frontend should understand.

This document defines the intermediate layer that makes that possible.

The semantic model layer sits between:

1. raw contract reads, writes, events, and indexer outputs
2. reusable mechanism-level UI modules and institution assemblies

Without this layer, the frontend collapses into:

1. ABI-driven forms
2. page-local conditionals
3. duplicated role logic
4. app-specific action wiring

The semantic layer exists to keep the UI institution-aware rather than contract-call-aware.

## Core Claim

The frontend should not render directly from raw on-chain data.

It should render from derived semantic objects that preserve:

1. institutional structure
2. mechanism boundaries
3. role context
4. guarantees and risks
5. capabilities and obligations
6. graph relationships

This layer is the bridge between protocol composition and UI composition.

## Inputs

The semantic layer may consume:

1. direct contract reads
2. contract events
3. local chain configuration
4. deployment metadata
5. off-chain institution metadata
6. indexer outputs
7. derived formulas from protocol state

It should not assume that all useful meaning is on-chain.

It should preserve a clear boundary between:

1. protocol truth
2. derived truth
3. institution metadata
4. presentation-only state

## Output Objects

The semantic layer should emit the objects defined by the interface ontology.

Minimum output families:

1. InstitutionModel
2. MechanismModel
3. RoleContext
4. ProcessModel
5. OrderNodeModel
6. AttachmentModel
7. CapabilityModel
8. GuaranteeModel
9. RiskBoundaryModel
10. EconomicBreakdownModel

## Required Properties Of The Layer

### 1. Deterministic Where Possible

If a semantic object can be derived deterministically from protocol state and public formulas, it should be.

Examples:

1. order lifecycle state
2. role membership at a specific order node
3. bond obligations
4. settled availability
5. some settlement breakdowns from protocol formulas

### 2. Explicit About Provenance

Every semantic field should be classifiable as one of:

1. on-chain enforced
2. derived from on-chain state
3. institution metadata
4. UI-local transient state

This prevents confusion between secured guarantees and helpful presentation.

### 3. Mechanism-Aware

The layer must understand that one institution may combine multiple mechanisms over the same process graph.

It should be able to answer:

1. what mechanisms are active here
2. what each mechanism adds
3. which role each mechanism assigns or recognizes
4. what actions each mechanism enables or forbids

### 4. Role-In-Context, Not Role-In-General

A wallet is not a sufficient semantic object.

The relevant object is a role in a particular institutional context.

Examples:

1. buyer of this order
2. seller of this order
3. assigned driver of this delivery suborder
4. eligible bidder in this auction
5. restaurant operator in this institution assembly

### 5. Graph-Aware

The layer must be able to model:

1. process topology
2. upstream and downstream order relations
3. cross-process provenance links
4. mechanism attachments
5. graph neighborhoods for focused inspection

## Canonical Models

The following are not final APIs. They are canonical shapes the frontend should be able to represent.

## InstitutionModel

Purpose: top-level semantic container for a composed institution.

Suggested fields:

1. `id`
2. `name`
3. `slug`
4. `network`
5. `availableNetworks`
6. `mechanisms`
7. `roles`
8. `processes`
9. `riskProfile`
10. `source`

Current implementation note:

1. the assembly-derived institution model now carries explicit provenance through `source`
2. role contexts are derived into the institution model rather than rebuilt ad hoc at each route
3. builder routes should consume a resolved institution artifact from the registry, not manually recompute validation and semantic projections
4. the prototype builder now resolves institutions by slug so multiple assemblies can share the same semantic projection and shell, even when they expose different module surfaces and non-coordinator extension mechanisms

Questions it should answer:

1. what institution is this
2. what contracts compose it
3. what roles exist here
4. what mechanisms are active
5. what process graphs belong to it

## MechanismModel

Purpose: semantic wrapper for one coordination mechanism.

Suggested fields:

1. `id`
2. `kind`
3. `name`
4. `description`
5. `riskClass`
6. `securityInheritance`
7. `contracts`
8. `touchesAssets`
9. `recognizedRoles`
10. `guarantees`
11. `attachments`
12. `capabilityFactories`

Questions it should answer:

1. what does this mechanism do
2. what does it secure
3. what can it touch
4. who can act through it
5. where is it attached

## RoleContext

Purpose: a role held by a specific actor in a specific institution context.

Suggested fields:

1. `id`
2. `actor`
3. `roleKind`
4. `displayName`
5. `scopeType`
6. `scopeId`
7. `mechanismIds`
8. `authoritySource`
9. `activeCapabilities`
10. `activeObligations`
11. `prototype`

Questions it should answer:

1. what role does this actor hold here
2. where did that role come from
3. what can the actor do now
4. what does the actor owe now

## ProcessModel

Purpose: semantic representation of a FigaroCore process plus attached mechanisms.

Suggested fields:

1. `processId`
2. `rootOrderId`
3. `orders`
4. `topology`
5. `stateSummary`
6. `economicSummary`
7. `attachments`
8. `downstreamLinks`
9. `upstreamLinks`

Current implementation note:

1. runtime derivation now emits process attachments for root order, currency binding, state summary, composed descendants, and connected actor presence
2. order derivation now emits runtime attachments for topology role, actor participation, and manifest commitments
3. upstream and downstream links are derived from runtime parent-child relations so topology consumers do not have to rebuild them locally

Questions it should answer:

1. what is the current state of this process
2. which orders belong to it
3. what mechanisms are attached
4. how does it relate to other processes

## OrderNodeModel

Purpose: semantic representation of one operational commitment node.

Suggested fields:

1. `orderId`
2. `processId`
3. `buyer`
4. `seller`
5. `payment`
6. `bondSummary`
7. `state`
8. `counterpartyStatus`
9. `attachments`
10. `capabilities`
11. `settlementBreakdown`

Questions it should answer:

1. what is this node
2. who are the counterparties
3. what is locked or settled here
4. what actions are currently valid

## AttachmentModel

Purpose: semantic link between a mechanism and an institution object.

Suggested fields:

1. `id`
2. `mechanismId`
3. `targetType`
4. `targetId`
5. `attachmentKind`
6. `state`
7. `visibleByDefault`

Questions it should answer:

1. what is attached
2. where is it attached
3. how should it be rendered
4. who should care about it

## CapabilityModel

Purpose: one valid next action available to an actor.

Suggested fields:

1. `id`
2. `label`
3. `actionKind`
4. `mechanismId`
5. `scopeType`
6. `scopeId`
7. `preconditions`
8. `riskLabel`
9. `writeTarget`
10. `uiPriority`

Questions it should answer:

1. can the actor do this now
2. why is it valid
3. what mechanism owns it
4. how risky or important is it

## GuaranteeModel

Purpose: explicit semantic statement of what is secured.

Suggested fields:

1. `id`
2. `mechanismId`
3. `label`
4. `description`
5. `guaranteeClass`
6. `sourceType`
7. `sourceReference`

Questions it should answer:

1. what exactly is guaranteed
2. who guarantees it
3. is it enforced, derived, or declared

## RiskBoundaryModel

Purpose: explicit statement of what a mechanism can and cannot affect.

Suggested fields:

1. `id`
2. `mechanismId`
3. `touchesAssets`
4. `canCustody`
5. `canReprice`
6. `canOnlySignal`
7. `dependsOn`
8. `failureModes`

## EconomicBreakdownModel

Purpose: semantic representation of economically meaningful values for one object or context.

Suggested fields:

1. `scopeType`
2. `scopeId`
3. `lockedBond`
4. `settledAvailable`
5. `typedOutputs`
6. `downstreamReferencedAmount`
7. `sourceClass`

Important note:

This model may contain fields whose provenance differs.

For example:

1. `lockedBond` may be directly derivable from protocol state
2. `settledAvailable` may be directly derivable from protocol state
3. `typedOutputs` may be derived or institution-defined rather than directly stored on-chain

The layer must preserve that distinction.

## Semantic Pipelines

The layer should be built as a set of pipelines rather than one giant transformer.

Suggested stages:

### 1. Data Acquisition

Collect:

1. reads
2. events
3. registry/config metadata
4. indexer results

### 2. Normalization

Convert raw outputs into stable internal records.

Examples:

1. normalized order records
2. normalized process records
3. normalized mechanism records
4. normalized deployment records

### 3. Semantic Derivation

Compute:

1. role contexts
2. capabilities
3. attachments
4. guarantees
5. risk boundaries
6. economic breakdowns

### 4. Institution Assembly Binding

Apply institution-specific metadata such as:

1. names
2. mechanism labels
3. role labels
4. visibility defaults
5. module ordering
6. emphasis rules

### 5. UI Projection

Emit stable models for reusable UI modules.

## Separation Of Truth Classes

Every semantic field should carry or imply one of the following truth classes:

1. `protocol-enforced`
2. `protocol-derived`
3. `institution-declared`
4. `indexer-derived`
5. `ui-local`

This should be treated as a first-class design rule, especially for:

1. guarantees
2. settlement breakdowns
3. provenance/accounting distinctions
4. builder-authored templates

## Why This Layer Matters For Composable UI

If frontend composability is real, the reusable unit cannot just be a visual component.

It must be a component plus a semantic contract.

That means reusable modules should depend on stable semantic inputs such as:

1. `MechanismModel`
2. `RoleContext`
3. `CapabilityModel`
4. `OrderNodeModel`
5. `RiskBoundaryModel`

That is what lets one module work across many institution assemblies.

## Frontend Folder Implication

This document implies a future frontend structure more like:

1. `lib/semantic/normalizers/`
2. `lib/semantic/derivers/`
3. `lib/semantic/models/`
4. `lib/semantic/projections/`
5. `components/mechanisms/`
6. `components/institutions/`

rather than a purely app-folder-first architecture.

## Non-Goals

This document does not define:

1. final TypeScript interfaces
2. final API boundaries
3. one mandatory indexer architecture
4. one mandatory persistence scheme for institution metadata

It defines the semantic responsibilities the frontend must satisfy.

## Open Questions

1. Which semantic derivations should be shared across all institutions versus left assembly-specific?
2. Which institution metadata should be signed, anchored, or versioned?
3. How should future builder tools author visibility and emphasis rules for modules?
4. Which economic distinctions should remain derived and which, if any, should become protocol or extension state?
5. How much of the semantic layer can be made portable across repos and apps?

## Practical Summary

The semantic model layer is the missing middle between contracts and composable UI.

It must:

1. normalize protocol state
2. derive institutional meaning
3. compute roles, capabilities, guarantees, and graph relationships
4. preserve distinctions between enforced, derived, declared, and local truth
5. provide stable semantic inputs to reusable UI modules

If this layer is built well, new institutions can inherit both security and interface logic without forcing a frontend rewrite every time.
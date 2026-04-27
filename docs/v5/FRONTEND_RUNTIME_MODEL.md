# Frontend Runtime Model

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

### 5. Skin Bundle

The skin bundle is presentation-only.

It may provide:

1. theme tokens
2. imagery and logos
3. type and spacing preferences
4. non-semantic copy

It must not alter:

1. capability validity
2. mechanism authority
3. risk boundaries
4. settlement semantics

## Subject Binding and Seller-Address Mutation

Seller-address mutation should happen through subject binding, not through bespoke app forks.

The binding model is:

1. address resolves to a subject record
2. subject record resolves to one or more institution bindings
3. institution binding selects an assembly, metadata bundle, and asset bundle
4. runtime derives role context and visible mechanisms
5. skin bundle personalizes the shell without altering protocol truth

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

This document is the canonical runtime-facing frontend model.

Use it together with:

1. `RUNTIME_THESIS.md` for the repo-level runtime framing
2. `SEMANTIC_MODEL_LAYER.md` for the derivation layer
3. `INSTITUTION_ASSEMBLY_SCHEMA.md` for assembly structure
4. `PUBLIC_GRAPH_MODEL.md` for the five public graphs and provenance context
5. `frontend/ASSEMBLY_AUTHORING.md` for the implemented authoring flow

The archived frontend/runtime doctrine set remains useful as design history, not as the current reading path.
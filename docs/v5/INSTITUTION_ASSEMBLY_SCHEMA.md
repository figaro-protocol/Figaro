# Institution Assembly Schema

Status: implemented. Five reference assemblies ship in `frontend/lib/shared/assemblies/` (eats, equipment-rental, procurement, disclosure-review, freelance). The authoring studio is at `/builders/authoring`, assembly validation and parsing live in `frontend/lib/shared/institutionAssembly*.ts`. The schema below is the conceptual foundation that guided that implementation.

## Purpose

The interface ontology defines the objects the frontend should understand.

The semantic model layer defines how those objects are derived.

This document defines the next layer up: how a specific institution assembly should declare what to show, what to hide, what to rename, and how to bind reusable modules into a coherent interface.

For the implemented frontend authoring and registration flow, see `frontend/ASSEMBLY_AUTHORING.md`.

This is the conceptual foundation for any future:

1. template-driven institution UI
2. drag-and-drop builder
3. metadata-backed institution shell
4. reusable frontend assembly format

## Core Claim

An institution assembly should be represented as structured metadata over shared semantic objects and reusable UI modules.

That metadata should not try to encode the entire institution as arbitrary page code.

It should specify:

1. which mechanisms are present
2. how they are labeled and grouped
3. which roles are exposed
4. which modules are shown in which contexts
5. what defaults, emphasis rules, and visibility rules apply

## What The Schema Is For

The schema should let a builder answer:

1. what institution am I assembling
2. which contracts and mechanisms belong to it
3. what semantic objects should be rendered prominently
4. which actions matter for ordinary participants
5. which views are advanced, builder-only, or audit-only
6. how much graph detail should be visible by default

## What The Schema Is Not For

The schema should not attempt to:

1. replace protocol contracts
2. replace semantic derivation logic
3. encode arbitrary business logic in UI metadata
4. hide the actual guarantees and risk boundaries of mechanisms

It is an assembly description, not a fake application runtime.

## Assembly Layers

An institution assembly should be thought of as configuration over four layers:

1. contract and deployment layer
2. semantic model layer
3. mechanism module layer
4. presentation and workflow layer

The schema mainly governs layers 3 and 4, while referencing layers 1 and 2.

## Canonical Sections

The schema should be organized into the following sections.

## 1. Institution Identity

Purpose: identify the assembly as a named institution.

Suggested fields:

1. `id`
2. `name`
3. `slug`
4. `description`
5. `networkTargets`
6. `version`
7. `iconSet`
8. `theme`

This section should answer:

1. what institution is this
2. where is it valid
3. how should it be presented

## 2. Contract Set

Purpose: declare the contract addresses or contract references the assembly depends on.

Suggested fields:

1. `core`
2. `tokens`
3. `mechanismContracts`
4. `optionalContracts`
5. `deploymentProfiles`

This section should answer:

1. what on-chain components are required
2. what on-chain components are optional
3. how local/dev/test deployments differ

## 3. Mechanism Registry

Purpose: declare which mechanisms are present in the institution and how they should be interpreted in the UI.

Suggested fields:

1. `mechanismId`
2. `kind`
3. `displayName`
4. `riskClass`
5. `enabled`
6. `visibility`
7. `group`
8. `recognizedRoles`
9. `contractKeys`
10. `capabilityBindings`
11. `moduleBindings`
12. `inspectorBindings`
13. `attachmentBindings`

Implementation note:

1. mechanism entries should declare the contract keys they depend on so semantic derivation can bind mechanisms to the correct contract set without hardcoding institution-specific assumptions
2. mechanisms that expose role-specific UI without role-specific capabilities should declare `recognizedRoles` explicitly so runtime role scoping does not depend on incidental view wiring
3. `capabilityBindings` is optional and should be reserved for assembly-specific capability ownership that diverges from the built-in mechanism package defaults
4. `moduleBindings` should declare only assembly-specific module deltas; packaged modules should come from the mechanism package by default

This section should answer:

1. which mechanisms are active
2. how they are named for this institution
3. where they appear in the UI

## 4. Role Registry

Purpose: define the role language and role grouping used by the institution.

Suggested fields:

1. `roleKind`
2. `displayName`
3. `description`
4. `visibility`
5. `defaultLandingView`
6. `modulePriorities`

This section should answer:

1. which roles are primary for end users
2. which roles are advanced or secondary
3. what each role should see first

## 5. View Definitions

Purpose: define the major interface surfaces of the institution.

Suggested fields:

1. `viewId`
2. `kind`
3. `title`
4. `route`
5. `contextsAccepted`
6. `moduleSlots`
7. `visibilityRules`

Views should be defined in terms of semantic contexts, not page-specific raw data.

Examples:

1. institution overview
2. process workspace
3. role dashboard
4. mechanism inspector
5. builder view
6. auditor view

## 6. Module Composition

Purpose: specify which reusable modules are used and where they render.

Suggested fields:

1. `moduleId`
2. `componentKind`
3. `semanticInput`
4. `slot`
5. `priority`
6. `visibilityRules`
7. `featureFlags`
8. `displayOptions`

This is the heart of interface composition.

It should allow an institution to reuse the same module library while assembling different shells.

Implementation note:

1. the prototype builder now resolves a registered institution artifact by slug and renders the same shell for multiple assemblies rather than special-casing a single institution route
2. built-in runtime modules now default `componentKind` and `semanticInput` from shared module metadata, and selected standard runtime-shell/core/coordinator modules also default their baseline `slot` and `priority` when both layout fields are omitted, so authored assembly JSON should usually carry only `moduleId` and any true display overrides when it follows runtime defaults; explicit `componentKind` or `semanticInput` fields are reserved for non-built-in or intentionally divergent modules, and explicit `slot` plus `priority` should be kept together whenever an assembly intentionally diverges from the baseline layout
3. built-in views now also default the standard `route`, `contextsAccepted`, and baseline `moduleSlots` for `overview` and the minimal `role-dashboard` scaffold, so authored assembly JSON can omit that boilerplate when it follows the runtime defaults and only keep explicit view fields where an assembly diverges

## 7. Capability Presentation Rules

Purpose: define how capabilities appear for different roles and contexts.

Suggested fields:

1. `capabilityKind`
2. `labelOverride`
3. `priority`
4. `group`
5. `requiresConfirmation`
6. `warningStyle`
7. `hiddenWhen`

This section should not define whether a capability is valid. The semantic layer does that.

It only defines how valid capabilities are presented.

## 8. Visibility And Disclosure Rules

Purpose: control how much complexity the institution exposes by default.

Suggested fields:

1. `showGraphByDefault`
2. `showAdvancedMechanisms`
3. `showRiskBoundaries`
4. `showGuarantees`
5. `showEconomicBreakdowns`
6. `showBuilderMode`
7. `showAuditMode`

This section matters because an institution may want to hide complexity from ordinary participants while preserving full inspectability.

## 9. Narrative Layer

Purpose: declare how the institution explains itself.

Suggested fields:

1. `institutionSummary`
2. `mechanismSummaries`
3. `riskExplanations`
4. `guaranteeExplanations`
5. `builderNotes`

This section should never contradict the actual semantics or guarantees.

Its job is explanation, not fiction.

## 10. Builder Metadata

Purpose: support future institution-builder tooling.

Suggested fields:

1. `assemblyClass`
2. `compositionLevel`
3. `templateBase`
4. `editableSections`
5. `requiresCustomModules`
6. `safetyWarnings`

This section should make it possible for a future builder tool to know whether an institution is:

Current implementation note:

1. the frontend now proves this contract with multiple registered assemblies, including Figaro Eats, a procurement reference institution, and a disclosure-first review institution, all rendered through the same prototype shell and semantic derivation path
2. those reference assemblies now live as file-backed authored documents under `frontend/lib/shared/assemblies/`, rather than only as hardcoded TypeScript literals
3. registry resolution now flows through a manifest layer that validates duplicate slugs, duplicate institution ids, and per-document integrity before exposing assemblies to routes
4. authored JSON documents are parsed through a runtime loader before they become `InstitutionAssembly` values, so malformed document shape fails at the document boundary instead of being silently cast
5. the frontend now includes a small authoring helper that can generate a starter assembly document and print the corresponding manifest entry, reducing manual boilerplate when adding a new institution

1. a Level 1 assembly over existing modules
2. a Level 2 assembly with low-risk coordinators
3. a Level 3 assembly with high-risk mechanisms

## Assembly Constraints

The schema should obey the following rules.

### 1. Semantic Inputs Must Be Stable

Modules should bind to semantic object kinds, not to ad hoc page-local data structures.

### 2. Visibility Must Not Override Truth

The schema may hide detail by default, but it must not misrepresent:

1. guarantees
2. risks
3. mechanism authority
4. asset touch points

### 3. Institution-Specific Naming Must Be Allowed

The same underlying mechanism may appear under different institution labels.

Examples:

1. seller versus restaurant
2. bidder versus driver candidate
3. provenance panel versus payout trace panel

### 4. Page Structure Should Be Secondary

The schema should prefer semantic slots and contexts over hardcoded route assumptions.

### 5. Builder Automation Should Be Optional

The schema should support future drag-and-drop or generated interfaces, but it should not require them.

### 6. Presentation Overrides Must Respect Trust Boundaries

An institution assembly may customize presentation, emphasis, and naming, but it must not override semantic or settlement truth.

Safe override classes include:

1. theme variables and CSS tokens
2. logos, images, and non-semantic visual assets
3. institution-local naming for roles and mechanisms
4. copy, narrative framing, and explanatory text that does not contradict secured meaning
5. visibility defaults for optional detail panels where mandatory disclosures remain reachable

Unsafe override classes include:

1. changing whether a capability is actually valid
2. hiding whether a mechanism touches funds or authority
3. relabeling a high-risk settlement action as a harmless action
4. suppressing guarantees, risks, or authority boundaries where the runtime marks them as mandatory
5. altering protocol formulas or semantic derivation through presentation metadata

The runtime should preserve a hard line between:

1. protocol truth
2. derived truth
3. institution metadata
4. presentation-only state

Assembly metadata may shape layers 3 and 4.
It must never be treated as authority over layers 1 and 2.

## Example Mental Model

An institution assembly could be understood as saying:

1. this institution uses core, auction, lifecycle, and disclosure mechanisms
2. ordinary users primarily see role dashboards and process workspaces
3. advanced provenance views exist but stay hidden by default
4. buyers see these capabilities first, drivers see those capabilities first
5. the Dutch auction is high-risk and should display stronger warnings and guarantee descriptions

That is enough to assemble a serious UI without hardcoding the whole institution into bespoke page logic.

## Storage Question

This document does not yet decide where assembly metadata should live.

Possible homes include:

1. repo-local source files
2. deployment-linked JSON or YAML
3. off-chain hosted metadata
4. IPFS-hosted metadata
5. anchored references to off-chain metadata

The correct answer may differ by use case and maturity level.

The schema should be defined before the storage location is fixed.

## Relationship To Templates

Assembly metadata is not the same thing as process templates.

Process templates describe institution-relevant structure inside a process or process family.

Assembly metadata describes how the frontend should present and compose an institution from semantic and mechanism modules.

Those may relate, but they are not the same object.

## Non-Goals

This schema draft does not define:

1. a final JSON schema
2. a drag-and-drop editor format
3. a versioning protocol
4. a signing model for metadata
5. an IPFS packaging format

It defines the conceptual contents an assembly format must eventually carry.

## Open Questions

1. Which parts of an assembly should be machine-editable versus code-authored?
2. Which module bindings should be standardized globally?
3. How much theme and branding should be part of assembly metadata?
4. Which assembly fields should be referenceable by builders without exposing dangerous abstraction leaks?
5. When, if ever, should assembly metadata be anchored or referenced on-chain?

## Practical Summary

An institution assembly schema should describe how to turn shared semantic objects and reusable modules into a concrete institution UI.

It should declare:

1. institution identity
2. contract set
3. active mechanisms
4. role language
5. view definitions
6. module composition
7. capability presentation rules
8. visibility defaults
9. narrative explanations
10. builder metadata

If this layer is designed well, future institution builders can compose real interfaces without collapsing back into bespoke app-by-app frontend architecture.
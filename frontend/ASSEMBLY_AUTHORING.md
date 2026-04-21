# Assembly Authoring Reference

Status: current implementation reference for authoring institution assembly documents in the frontend.

## Purpose

This document explains how an authored assembly JSON file becomes a registered institution artifact in the frontend.

It is not a theoretical schema note.

It describes the implemented path:

1. authored JSON document
2. runtime parsing
3. manifest validation
4. registry projection
5. builder route rendering

## Files That Matter

Core files:

1. `lib/shared/assemblies/*.reference.json`
2. `lib/shared/institutionAssembly.ts`
3. `lib/shared/institutionAssemblyParser.ts`
4. `lib/shared/institutionAssemblyManifest.ts`
5. `lib/shared/institutionAssemblyRegistry.ts`
6. `lib/shared/institutionAssemblyDraft.ts`
7. `lib/shared/assemblyPublication.ts`
8. `app/builders/authoring/page.tsx`
9. `components/core/BuilderAuthoringStudio.tsx`
10. `scripts/assembly-authoring.mjs`
11. `scripts/create-assembly-template.mjs`

Tests:

1. `tests/lib/assemblyAuthoring.test.ts`
2. `tests/lib/institutionAssemblyParser.test.ts`
3. `tests/lib/institutionAssemblyManifest.test.ts`
4. `tests/lib/semanticDerivation.test.ts`
5. `tests/lib/institutionAssemblyDraft.test.ts`
6. `tests/lib/assemblyPublication.test.ts`
7. `tests/e2e/builders-authoring.spec.ts`

## Lifecycle

An institution assembly currently moves through five stages.

### 1. Author A JSON Document

The canonical authored documents live under `lib/shared/assemblies/`.

Current examples:

1. `figaro-eats.reference.json`
2. `figaro-procurement.reference.json`
3. `figaro-disclosure-review.reference.json`

These files are the source of truth for institution assembly metadata.

## 2. Parse The Document

`institutionAssembly.ts` imports the JSON file and passes it through `parseInstitutionAssemblyDocument(...)`.

This means the document is not trusted just because TypeScript can import JSON.

The parser checks:

1. required object shape
2. string/boolean/number types
3. enum values such as risk class, visibility, and warning style
4. nested array element types

If parsing fails, the document fails at the import boundary instead of being silently cast to `InstitutionAssembly`.

## 3. Add The Parsed Assembly To The Shared Registry List

`institutionAssembly.ts` exports a single list:

1. `REFERENCE_ASSEMBLIES`

That list is the source of truth for which authored assemblies are available to the rest of the frontend.

The authoring helper can update this file automatically when `--register` is used.

## 4. Manifest Validation

`institutionAssemblyManifest.ts` derives `REFERENCE_ASSEMBLY_MANIFEST` from `REFERENCE_ASSEMBLIES`.

The manifest layer validates:

1. duplicate slugs across entries
2. duplicate institution ids across entries
3. mismatches between manifest slug and assembly slug
4. per-document validation failures from `validateInstitutionAssembly(...)`

This is the cross-document integrity layer.

## 5. Registry Projection

`institutionAssemblyRegistry.ts` projects the manifest into two main frontend-facing forms.

### RegisteredInstitutionArtifact

Used for semantic derivation and slug-driven builder rendering.

Contains:

1. `assembly`
2. `validation`
3. `model`
4. `riskBoundaries`

### InstitutionSelectorCardModel

Used by the prototype selector page.

Contains:

1. identity summary
2. composition metadata
3. mechanism count
4. role count
5. network targets
6. validation status

## Builder Consumption

The builder currently uses two route surfaces.

### `/builders/prototype`

Consumes selector-card projections from the registry.

### `/builders/prototype/[slug]`

Consumes a resolved institution artifact by slug.

That route then renders the shared prototype shell against:

1. the parsed assembly
2. the derived institution model
3. the derived risk boundaries

## Authoring UI

There is now a frontend authoring route:

1. `/builders/authoring`

This route is not a second schema system.

It uses the same parser and derivation path as registered assemblies.

Current implemented authoring flow:

1. start from a blank draft or clone a registered assembly
2. edit top-level identity fields directly
3. edit any top-level assembly section as JSON
4. validate the parsed draft against parser rules and publication-readiness rules
5. preview the draft through the shared institution workspace
6. export the parsed draft as JSON
7. publish and register the draft into the workspace
8. unregister an existing assembly from the workspace, optionally deleting its JSON file

The draft preview uses the same workspace component as `/builders/prototype/[slug]`.

That means the authoring route is previewing the actual derived institution substrate, not a separate mock renderer.

## Authoring Helper

The helper entrypoint is:

```bash
npm run create:assembly -- --name "Institution Name" --slug institution-slug --register --dry-run
```

Current supported flows:

1. blank template generation
2. clone from an existing assembly with `--from <slug>`
3. rename copied role kinds with `--rename-role old:new`
4. rename copied mechanism ids with `--rename-mechanism old:new`
5. auto-register in `institutionAssembly.ts` with `--register`
6. unregister from `institutionAssembly.ts` with `--unregister`
7. optionally delete the JSON file with `--delete-file`

## Publication Flow

UI publication and CLI publication both converge on the same workspace artifacts:

1. `lib/shared/assemblies/<slug>.reference.json`
2. generated import/export/registry entries inside `lib/shared/institutionAssembly.ts`

The publication utility in `lib/shared/assemblyPublication.ts` performs that mutation.

Current publication checks:

1. parser success for the full candidate document
2. per-document validation success
3. unique `identity.slug` across registered assemblies
4. unique `identity.id` across registered assemblies
5. kebab-case slug enforcement

The authoring UI also blocks publication when there are pending per-section JSON parse errors, even if the last valid parsed draft was otherwise publishable.

## Unregister Flow

There are now two supported unregister paths:

1. CLI with `--unregister`
2. UI from `/builders/authoring`

The unregister path removes the generated registration from `lib/shared/institutionAssembly.ts`.

If delete-file is selected, it also deletes the authored JSON document under `lib/shared/assemblies/`.

## Field Semantics

The most important assembly fields and their immediate downstream effects are below.

### `identity.id`

Used as the stable institution identifier in derived semantic models.

Must be unique across the manifest.

### `identity.slug`

Used for:

1. manifest identity consistency
2. registry lookup by slug
3. builder route selection
4. JSON filename convention for authored assemblies

### `contracts[].key`

Defines the contract-key namespace available to mechanisms.

Mechanism `contractKeys` are validated against this set.

### `mechanisms[].mechanismId`

Becomes the stable mechanism id in the semantic layer.

Also drives mechanism recognition in clone-time rename flows.

### `mechanisms[].contractKeys`

Controls which declared contracts are attached to the mechanism boundary during institution derivation.

### `roles[].roleKind`

Becomes the stable role id in derived role contexts.

Also affects capability-to-mechanism recognition during assembly derivation.

### `roles[].defaultLandingView`

Controls which view contributes visible module slots for the selected role in the builder shell.

Built-in `overview` and `role-dashboard` views can now omit their standard `route` / `contextsAccepted` boilerplate, and a base dashboard can also omit its default module slot skeleton when it follows the runtime defaults.

### `views[].moduleSlots`

Controls which shared UI modules are visible in the prototype shell for that context.

Keep this explicit whenever the assembly wants a richer or narrower surface than the built-in defaults. Omit it only when the view is intentionally using the runtime-owned `overview` scaffold or the minimal `role-dashboard` scaffold.

### `modules[]`

Defines the reusable module catalog the assembly is allowed to reference from mechanism bindings and views.

Built-in runtime-shell/core/coordinator modules can now also omit baseline `slot` and `priority` when the assembly is using the shared runtime layout. Keep both fields explicit whenever the assembly intentionally diverges, and do not author only one of them.

### `builderMetadata.assemblyClass`

Used as selector metadata and as a high-level classifier for the assembly.

### `builderMetadata.compositionLevel`

Used in selector summaries and validation heuristics.

## Validation Layers

There are three distinct validation layers.

### Parser validation

Checks the document shape and primitive types.

### Per-document assembly validation

Checks internal references such as:

1. module ids
2. mechanism module bindings
3. view module slots
4. role landing views
5. contract-key references

### Manifest validation

Checks cross-document uniqueness and consistency.

## Practical Rules For Authors

1. Keep slugs stable once a route is exposed.
2. Keep role kinds and mechanism ids stable once they are referenced by tests or clone workflows.
3. Prefer adding new modules to `modules[]` before referencing them from mechanisms or views.
4. Use `--dry-run` before any create or unregister operation.
5. Treat clone mode as a structural starting point, not a finished institution definition.

## Recommended Workflow

1. Use `/builders/authoring` for interactive draft editing and live preview.
2. If the new institution resembles an existing one, clone a registered assembly first.
3. Use export to inspect the exact JSON document that will be published.
4. Publish from the authoring UI or use the CLI with `--dry-run` if you want a shell-first flow.
5. Run `npm run type-check`.
6. Run the focused Vitest suites if you changed shared authoring, publication, or registry behavior.

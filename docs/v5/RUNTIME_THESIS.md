# Runtime Thesis

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

Under this thesis, a concrete vertical such as Eats is not the universal UI shape of Figaro.
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

## Eats In This Model

Figaro Eats should be understood as the first concrete archetype of:

1. buyer-dominant merchant order flow
2. one-hop local fulfillment
3. one-hop delivery attachment
4. auction-mediated courier allocation
5. optional disclosure and reputation overlays

That makes Eats valuable not only as a food-delivery demo, but as proof that the same secured process model can support other archetypes such as ride hailing, couriered retail, local service dispatch, or repair coordination.

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

Long term, more of what is currently Eats-specific on the frontend should migrate into reusable runtime modules or assembly-governed institution surfaces where that generalization is justified.

## Immediate Planning Questions

1. what is the canonical merchant or operator binding model from wallet address to institution template
2. which assembly fields are protocol-adjacent and must be versioned strictly
3. which presentation overrides are safe, and which would cross trust boundaries
4. how should decentralized assets and metadata be resolved, cached, authenticated, and versioned
5. what remains archetype-specific versus what should be generalized into shared runtime modules

## Related Documents

This note is intentionally short.
The detailed design work lives in:

1. [FRONTEND_RUNTIME_MODEL.md](FRONTEND_RUNTIME_MODEL.md)
2. [FRONTEND_RUNTIME_PLAN.md](FRONTEND_RUNTIME_PLAN.md)
3. [SEMANTIC_MODEL_LAYER.md](SEMANTIC_MODEL_LAYER.md)
4. [INSTITUTION_ASSEMBLY_SCHEMA.md](INSTITUTION_ASSEMBLY_SCHEMA.md)
5. [PUBLIC_GRAPH_MODEL.md](PUBLIC_GRAPH_MODEL.md)
6. [frontend/ASSEMBLY_AUTHORING.md](frontend/ASSEMBLY_AUTHORING.md)
7. [frontend/SKINNING_HOOKS.md](frontend/SKINNING_HOOKS.md)

Together, those documents define the technical path from protocol composition to institution runtime.

The first-pass shared runtime implementation seeds now live under `frontend/lib/shared/`, including typed identity resolution records and an Eats merchant metadata schema.

The workspace renderer now also consumes bound runtime context to constrain role selection when a connected address matches a bound institution subject, and it scopes the mechanism inspector to the selected role context instead of always showing the full assembly indiscriminately.

Binding-to-assembly role mapping in that pipeline is now explicit, so runtime role selection no longer depends on suffix heuristics in role labels, the resolved runtime context preserves binding-level metadata, asset references, optional service bindings, and manifest-backed asset documents for shell consumers, the live institution shell resolves title/subtitle from the matched binding rather than always rendering assembly identity, the live workspace resolves runtime services against the matched binding before it falls back to assembly defaults, and the shell now executes a first runtime skin bundle from binding asset documents with seller metadata as fallback through logo, hero, accent, theme class, sanitized CSS, and `data-skin` targeting. When only an `assetURI` is present, that shell-bound path can now hydrate the asset document over the selected evidence transport, and the runtime-shell scaffolding, shared wallet-process summaries, seller setup surfaces, core seller mechanism panels, the delivery coordination / disclosure / delivery-attestation surfaces, the buyer-side discovery/cart composition surfaces, the driver-side job-market surface, the handoff panels, plus the FIG and generic runtime wrapper panels now consume that same bundle for presentation-only chrome. The next hardening step is no longer basic panel adoption; it is preserving that seam as the runtime evolves while keeping `MerchantBrandingModule` as the lower-level executor rather than turning it into another special-case panel.
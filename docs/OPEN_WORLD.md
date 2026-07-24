# Open-World Runtime

The canonical doctrine for Figaro's open-world model and how the runtime composes
it. CLAUDE.md's top section is the one-paragraph summary; **this is the full
statement** it points to. Consolidates the former `RUNTIME.md` (runtime thesis +
frontend composition model + semantic-derivation layer) and the open-world-lens /
future-proofing doctrine into one home (2026-06-22).

Four parts: the **paradigm** (§1), how the ecosystem **extends** (§2), how the
runtime **composes** an institution (§3), and the **semantic layer** that bridges
contracts to UI (§4).

---

## 1. The open-world paradigm — the positive target

The base-model default is closed-world (a product app: role taxonomies, bundled
lists, stored meaning). Figaro is the inverse. Each pattern below **leads with the
positive form** (do this) and names the closed-world tell second (not that) — a
prohibition-only frame leaves a vacuum the base model fills with its default.

1. **WHO acts — name the role + its surface.** Party = buyer/seller at the kernel;
   the runtime roles are DISTINCT surfaces & projections — DESIGNER composes
   (`/builders/designer`), SELLER binds published assemblies (profile array), BUYER
   selects + fills at checkout, the order's SELLER attests at runtime, SPECTATOR
   reads. Say which role and where. *Tell:* "the buyer does X", "the user", a
   singular "participant", roles merged ("buyer composes"). The subtle collapse:
   "anyone may design" (true — permissionless) does NOT mean anyone composes *while*
   binding or buying — one wallet may play all three roles, but composition happens
   only on the designer surface, never mid-checkout or mid-profile-edit (guard:
   `lint-composition-is-designer-only.sh`).

2. **The SET is the live registry, read at runtime.** Clauses/sellers/assemblies
   are an UNBOUNDED set defined by the network — read from ClauseRegistry /
   SellerRegistry / AssemblyRegistry via the indexer, fetched chain→IPFS; code
   operates on the spec it fetched, never on identity. *Test:* would this still hold
   if a never-seen clause dropped into the registry now? *Tell:* naming a fixed clause
   count ("the 17 clauses"), a fixed list treated as the world, or citing a fixture /
   scenario spec as the authority — a scenario (direct-sale, local-commerce, …) is one
   set of drawer selections, an *output* of the live registry, never its definition.

3. **It's protocol infrastructure; the frontend is a SURFACE.** The TCP/IP of trade;
   surfaces compose the `lib/` catalogues and render indexer state; lifecycle =
   Design → First use → Checkout → Runtime; trust sits at the boundary/edge.
   *Tell:* "the app", "onboarding funnel", "user journey", UI-as-product.

4. **Meaning is DERIVED; storage is event-driven + IPFS.** The chain keeps a
   fingerprint/event; content lives off-chain in IPFS (pinned), reconstructed by the
   indexer; what a node/role/modality/category IS gets DERIVED at render time from
   the composed clauses + topology + attestation state. *Tell:* "the X field", a
   stored role/modality/category label, a checkbox that records meaning.
   Calibration for identity: a **closed taxonomy a party picks from**
   (`archetypeId`, `role`, `businessType`, `serviceType`, `documentKind`) is
   forbidden; a party's **free-form self-prose** (`name`, `specialty`,
   `description`) is fine — genuinely-open editorial content is not the
   anti-pattern, the closed picklist is. Discriminate document/actor kind by
   STRUCTURE (does it parse as the shape?) or a declared clauseId, never a nominal
   `type` tag; a clause names a PROVISION ("hand-off proven by proximity"), never
   a role — "what does this seller do" is a clause/event lookup, not an identifier
   name.

5. **A clause encodes ANY relationship.** A clause is a composable buyer↔seller /
   seller↔seller relationship; the SAME kernel serves a market-liberal, cooperative,
   mutual-aid, or Islamic-finance graph; examples are explicitly one-of-many. *Tell:*
   logistics / shipping-a-good / restaurant as the implicit default; mass/volume/
   class treated as mandatory.

6. **Generic code routes by SPEC, not name.** Fixed universal infrastructure over the
   unbounded set — read the spec (fields, `block` flags, `mechanismKinds`, tier) and
   route by FIELD / TIER / mechanism; one rule over arbitrary specs
   (`encodeContentFromSpec`, `deriveProcessModelFromRuntime`, `describeClause`).
   *Tell:* `if (clause === geo)`, branching on a specific clause/assembly/provider id.

7. **The surface READS network state at the edge.** The indexer is the read path,
   registries + IPFS are the source; resolved-empty = ABSENCE (never a fabricated
   default or coined label). *Tell:* the UI as custodian/source/the-thing-in-the-middle.

### Calibration — the SSoT violation predicate (patterns 2 + 7)

A surface violates the network-is-SSoT rule when it **renders a collection, count,
or status of network state from a bundled array, static const, or JSON** — maps
over a bundled list, prints a hardcoded count, filters a static roster. Merely
*mentioning* a chain artifact in authored editorial prose is not a violation. The
`(marketing)`/`(app)` split doesn't matter — reading needs an RPC, not a wallet, so
marketing pages are event-driven too.

Three legitimately bundled categories (do NOT flag):

1. **Deployment config** — contract addresses from `NEXT_PUBLIC_*` env vars; you
   can't read an address event-driven without already knowing one.
2. **Constructor-set protocol constants** — immutable values set at construction
   (the kernel's 2× bond ratio, a token's max supply); bundle the constant, read
   live state for the variable part.
3. **Off-chain content the chain commits only a hash/URI of** — clause specs,
   agreements, profiles/catalogues. Fetching the pre-image of an on-chain
   commitment is the pattern, not a copy. The SET stays event-driven; the per-item
   CONTENT resolves from the committed pointer.

**No fallbacks — absence is the representation.** A fallback *fabricates* network
state: no `?? SOME_DEFAULT` on a network-derived render path, no coined stand-in
pill/badge for an empty result. A resolved-empty read renders as absence; a
*pending* fetch may show a loading state — loading is not absence.

---

## 2. Extending the ecosystem — bounded, versioned, spec-declared

How the network grows with **zero code change and zero kernel change**. Worked out via
the emissions consolidation + the hazmat / cold-chain handling clauses (2026-06); the model for
every composition.

- **N closed-world variants → ONE clause + a spec-declared option set.** The clause is
  the reusable concept; the variation is **data in the spec** (an `enum` array or a
  nested `object` tree), never separate hardcoded clauses and never a hardcoded enum in
  code. (Five norm-specific emissions clauses → one `figaro-emissions`, methodology = one field.)

- **A field that represents a CHOICE or CATEGORY is BOUNDED.** Declared finite in the
  spec; never a free-form string for a choice. `type:"string"` is ONLY for genuinely
  free content (description, URI, nonce). Bounded beats free-form for three load-bearing
  reasons: (1) **validatable** — the Layer-C validator checks membership; (2)
  **deterministically encodable** — the generic encoder maps value → 0-based ordinal,
  which a free string cannot; (3) **renderable** as a real choice control.

- **Extend by VERSIONING, not by unbounding.** To add an option, register a NEW clause
  version (a new `(name, version)` pair — the on-chain key `keccak256(abi.encode(name, version))` makes it distinct) on the **additive-only**
  registries (once registered, a clause cannot be removed or deactivated). The network
  only grows: new versions/clauses, never mutation, never unbounding.

- **Code stays fixed; the spec carries the knowledge.** One generic spec-driven encoder
  reads the option set from the spec — no per-clause encoders, no hardcoded INDEX tables.
  New option / new version = edit-or-add JSON + register; zero code, zero kernel change.

- **Composition through the boundary is STRUCTURAL, not a product roster.** Figaro is
  ERC-20/contract-agnostic; anything a wallet holds, or any on-chain contract, composes
  through the surface permissionlessly — that openness IS the composability claim, not a
  feature shipped one-by-one. Never inventory external coupling as graded integrations
  ("shipped / shallow / roadmap"); name what each example DEMONSTRATES about the surface
  (Kleros/Klima/Toucan are builders composing through the boundary), never its
  shipped-depth.

- **Each artifact family gets its own anchor** (clauses → ClauseRegistry; sellers →
  SellerRegistry; assemblies → AssemblyRegistry) — parallel, never nested. Arrows point
  one way: assemblies use clauses; clauses don't know assemblies exist.

### Where a composed contract may stand — the four placements

The boundary is a **narrow waist**: EIP-712 signatures in, deterministic settlement events out.
Relative to the bilateral signature, a composed contract stands in exactly four places.

| # | Placement | Relative to the signature | What the contract supplies |
|---|---|---|---|
| 1 | **Terms in** | before | deterministic output that becomes content `fields` both parties sign under `agreementHash` |
| 2 | **Funding at the kernel-pull** | inside the `commit` tx | bond currency, delivered to the party's own EOA |
| 3 | **Attested auxiliary** (Path A) | after commit, off the bond path | an external receipt, attested against the root order under a purpose-built clause |
| 4 | **Settlement consumer** | after resolution | consequences derived from kernel state |

**The invariant: a composed contract supplies terms, funding, evidence, or consequences —
NEVER a signature.**

- **Placement 1 constraint — the output must be fully known at signing.** The accumulator is
  exact-match, so a composition whose result is not fixed when both parties sign cannot settle;
  counterparty-deferring compositions are dead as a class (the auction abandonment).
- **Placement 2 constraint — exactly one call qualifies.** `FigaroCore.commit` is the only place
  Figaro itself pulls a named party's ERC-20 (`_pullExact`, `FigaroCore.sol:130-135`), and it
  never checks `msg.sender` — so a coordinator funds the party **in place** instead of
  substituting itself, and the commitment stays bilaterally signed
  (`WitnessSwapAndCommitCoordinator` demonstrates the shape). Swap-and-commit is therefore the
  WHOLE family, not the first of many: an off-protocol auxiliary needs no such helper because
  Figaro never pulls its token.
- **Placement 4 constraint — read, never intercept.** A frozen kernel is a frozen ABI: its
  events and getters ARE the standard API, so a settlement consumer is a parallel contract family
  that reads it (`AttestationCoordinator` reads `core.orderStatus`; `RpgfMinter` scores settled
  history). A consumer that inserts itself into the money leg is placement-4 cosplay for
  contract-as-party.

#### The seller problem is a boundary detector, not a composability defect

Every composition that has failed here put a contract in a **party slot**. The kernel rejects that
by construction — ECDSA-only recovery (`FigaroCore.sol:161`), no EIP-1271 — and the rejection is
load-bearing: **a bond prices conduct, and a contract has no conduct to deter.** There is no
external standard to adopt: EIP-1271, ERC-4337, Safe modules, and hooks all standardize
contract-as-party, which is precisely what the mechanism design forbids.

So the triage before scoping any integration is one question — **who signs the seller half?**

- **A wallet-holding entity** (human, DAO multisig, agent holding a private key) → can be a
  seller. Bonded sub-order (**Path B**) or a separate bonded process (**Path C**); that party must
  be online to countersign.
- **A contract** (aggregator, oracle, bridge, router) → cannot sign EIP-712 → not a seller →
  **Path A**, placement 3 above: the buyer transacts with it directly, then attests the receipt
  against the root order. Evidence, not entanglement — no bonding, no second signature, no
  atomic-resolution coupling. (The offset apparatus that first demonstrated Path A was deleted
  2026-07-03; the pattern is what survives.)

Never invent a "wrapper operator" to drag a contract into the bonded model — that only moves the
problem to whoever must run the wrapper, online and signing, indefinitely.

---

## 3. The runtime composition model

The frontend renders **institutions from bounded composition units** — not one hardcoded
app shell, not page-specific contract forms, not arbitrary remote UI. The same secured
protocol base renders a buyer storefront, seller cockpit, fulfiller workspace, reviewer
surface, or agent control plane without redefining the protocol each time. The goal is
**bounded institutional mutation**, not maximum composability.

### Four architecture layers (must stay distinct)

1. **Protocol kernel** — determines settlement truth.
2. **Semantic derivation** — institution-aware meaning (§4).
3. **Assembly + mechanism layer** — what is shown and how capabilities are grouped.
4. **Party-specific presentation** — branding, media, presentation overrides.

**Presentation must never be able to change settlement semantics.** An institution may
rename or reframe a mechanism; it must not alter what that mechanism actually does.

### The runtime pipeline

`connected address → subject record → institution binding → assembly → mechanisms →
service bindings → role context → view surface`

Each step answers one question: who is here · which institution context applies · which
mechanisms/services are active · what can this actor do now · which surface to render ·
how it should look. (Seller-address mutation happens through **subject binding** — an
address resolves to a subject record → one or more institution bindings → an assembly +
metadata — not through bespoke app forks.)

### Composition units

- **Assembly** — the structural declaration (roles, mechanisms, view definitions, module
  placement, narrative defaults). Authored in `frontend/lib/designer/`, anchored on-chain
  via `src/AssemblyRegistry.sol`.
- **Mechanism package** — the reusable unit the runtime composes: contract bindings/writes,
  semantic adapters, capability mappings, default inspector/action modules, guarantee +
  risk copy.
- **Service binding** — connects the institution to off-chain/hybrid infra (identity,
  catalogue metadata, discovery, messaging/handoff, evidence transport, geospatial) through
  stable interfaces, not hardwired per use-case.
- **View definition** — the UI composition primitive (surface id, accepted context, visible
  slots, module ordering, role-specific visibility).

### What stays fixed vs what may vary

**Fixed (runtime authority, never an institution override point):** protocol truth from
contracts/events; semantic derivation of roles/capabilities/guarantees/risk; action
validity + authority checks; mandatory guarantee + risk disclosures; mechanism trust
boundaries. **May vary per institution:** the assembly selected; the mechanism packages it
includes; the service providers bound; the views exposed per role/context; the metadata,
assets, and narrative applied to the shell.

### Decision rules — when to add an abstraction

1. Clause meaning → solve in the agreement/metadata, not view composition.
2. Repeated action logic → the action model, not a new module type.
3. Provider variance → service bindings, not page code.
4. Per-seller branding → `sellerBranding.ts` + `SellerBrandingModule`, not semantic derivation.
5. Mechanism structure → a mechanism package, not a bespoke route.

### Human + agent parity

One institution model, multiple consumers. Actions are typed and inspectable; modules
render those typed actions for humans; agents consume the same action descriptors without
a separate institution model. The runtime is not human-only UI with an agent add-on.

---

## 4. The semantic-derivation layer

The layer between (raw contract reads/writes/events/indexer outputs) and (reusable
mechanism-level modules + assemblies). Without it the frontend collapses into ABI-driven
forms, page-local conditionals, duplicated role logic, and app-specific wiring. It keeps
the UI **institution-aware, not contract-call-aware** — the bridge from protocol
composition to UI composition. Lives in `frontend/lib/semantic/`.

The frontend renders from **derived semantic objects**, never raw on-chain data — objects
that preserve institutional structure, mechanism boundaries, role context, guarantees +
risks, capabilities + obligations, and graph relationships.

### Canonical model objects

Not final APIs — the shapes the frontend should represent:

- **InstitutionModel** — top-level container for a composed institution.
- **MechanismModel** — semantic wrapper for one coordination mechanism (what it does, what
  it secures, what it can touch, who acts through it, where it's attached).
- **RoleContext** — a role held by a *specific actor in a specific context* (buyer-of-this-
  order, assigned-fulfiller-of-this-suborder, attesting-seller-of-this-order). A wallet
  alone is not a sufficient semantic object; role is **derived in context**, not stored.
- **ProcessModel** — a FigaroCore process + attached mechanisms (orders, topology, state +
  economic summary, upstream/downstream links).
- **OrderNodeModel** — one operational commitment node (counterparties, payment, bond, state,
  valid actions, settlement breakdown).
- **AttachmentModel** — a semantic link between a mechanism and an institution object.
- **CapabilityModel** — one valid next action for an actor (precondition, owning mechanism,
  write target, priority).
- **GuaranteeModel** — an explicit statement of what is secured, and whether it's enforced,
  derived, or declared.
- **RiskBoundaryModel** — what a mechanism can and cannot affect (custody? reprice? signal-only?).
- **EconomicBreakdownModel** — economically meaningful values for one object/context (locked
  bond, settled-available, typed outputs) — fields may differ in provenance; the layer
  preserves that.

### Required properties

1. **Deterministic where possible** — derive from protocol state + public formulas when you can.
2. **Explicit about provenance** — every field carries a truth class (below).
3. **Mechanism-aware** — one institution may combine multiple mechanisms over one process graph.
4. **Role-in-context, not role-in-general** — see RoleContext.
5. **Graph-aware** — process topology, upstream/downstream relations, cross-process provenance.

### Truth classes (a first-class design rule)

Every semantic field is one of: `protocol-enforced` · `protocol-derived` ·
`institution-declared` · `indexer-derived` · `ui-local`. This prevents confusing a secured
guarantee with helpful presentation — load-bearing especially for guarantees, settlement
breakdowns, and provenance/accounting distinctions.

### Derivation pipeline (stages, not one transformer)

Data Acquisition (reads/events/config/indexer) → Normalization (stable internal records) →
Semantic Derivation (roles, capabilities, attachments, guarantees, risk, economics) →
Institution Assembly Binding (names, labels, visibility defaults, ordering, emphasis) → UI
Projection (stable models for reusable modules).

This is what lets one module work across many institution assemblies: a reusable unit is a
component **plus a semantic contract** (it depends on `MechanismModel` / `RoleContext` /
`CapabilityModel` / `OrderNodeModel` / `RiskBoundaryModel`), not just a visual component.

---

Related: [PUBLIC_GRAPH_MODEL.md](PUBLIC_GRAPH_MODEL.md) (the five public graphs the runtime
renders against), [CLAUSES.md](CLAUSES.md) (the versioning/validation mechanics §2 relies on),
[CONTRACTS.md](CONTRACTS.md) (the registries §1–§2 read from).

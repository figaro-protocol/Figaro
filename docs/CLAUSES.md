# Clauses — the spec, its validation, and how to add one

A clause is data: a JSON spec, registered publicly, that defines one term of an
agreement. Its content is validated in one place — off-chain, by the SDK
(`@figaro-protocol/sdk/clauses`) — against the spec. The chain registers the
spec's identity and content hash and binds each attestation to the signed
agreement; it validates no content shape. On the batch path, content is
validated in proof by a generic clause engine (the Rust mirror of the SDK's
validator, in `prover/clause`) that takes each spec as a witness input anchored
by `ClauseRegistry.contentHashOf` — `SCALING_STRATEGY.md` owns that argument.
Both paths keep the property that matters: a never-seen clause is attestable,
and batch-resolvable, with zero per-clause on-chain code.

This file owns the spec format and the seam inside it, the lockstep between
spec and registration, the design rules for clauses, and the checklist for
adding one. The list of clauses is the directory `clauses/`; each spec's
`description` says what it carries.

## Every clause is a merkle leaf

Every term of an agreement is a clause section, and every clause section is a
merkle leaf under `agreementHash`. A datum that is not a leaf is not a term of
the agreement. The commitment struct's fields (`currency`, `payment`,
`expectedCumulativeValue`, `deadline`) are execution data — what the kernel
holds and resolves — and never substitute for a term: the agreement's merkle
root is the data of the process's terms, and a term living only in the struct
leaves that data incomplete. Execution and terms are different layers; a copy
across them is the binding, not redundancy, and the sign gate's job is to
assert leaf == struct. `payment` has both homes — the commerce leaf and the
struct field — and so does the denomination.

## The SDK's validation

`@figaro-protocol/sdk/clauses` exposes one generic engine; `sdk/README.md` is
its manual.

- `parseClauseSpec(json)` — validates a spec against the published clause-spec definition
  (`sdk/src/clauses/clause-spec.schema.json`): a closed subset of JSON Schema
  (`string`, `integer`, `bigint` as a decimal string, `boolean`, `enum`,
  `array`, `object`). A string field's `format` is an open axis: any non-empty
  string is a valid declaration; the validator enforces the formats it knows
  and treats the rest as plain strings; an interface may map a known format to
  a richer input.
- `validateContent(content, spec, { stage? })` — validates a value against a
  parsed spec; rejects unknown fields; applies `spec.stages[stage]` when a
  stage is named.
- `encodeContentFromSpec` / `decodeContentFromSpec` — the one spec-driven
  encoder and its inverse, reading the field-to-position mapping from the
  parsed spec for any clause, with the same stage selection. There is no
  per-clause encoder; a new clause adds a spec, not a code path.

Every consumer loads each spec live from `ClauseRegistry` → IPFS; nothing
bundles a copy.

### Witness stages

A clause whose runtime evidence carries different content from its committed
terms — a temperature reading, measured grams, a detected proximity band —
declares that content as `spec.stages[N]`, a per-stage field set keyed by the
on-chain `uint8 stage`. Stage 0 is the committed content, declared by `fields`;
`stages[N≥1]` are the shapes of evidence attested while the process is open.
The declaration is the whole signal: an interface derives a witness capability
for any composed clause that declares stages, renders the form from the
declared fields, validates and encodes at the stage, and files through
`AttestationCoordinator`; readers decode the recovered calldata against the
same declaration. Who witnesses is never engine policy — either party may file,
and sufficiency is derived at read time against the committed terms. The
evidence window closes at resolution (`DESIGN_DECISIONS.md` §7).

Process-log ladders (clauses under the `attestations` article) are the other
runtime-evidence shape: their stage is the enum ordinal, and no `stages` key is
needed. A ladder event is one party's own log; evidence of a transfer between
parties is filed by a party through the relevant clause's own capability.
Whose hands the goods are in is derived by readers from the composed clauses'
events, never stored.

## On-chain anchoring

Two touch points, and neither validates content.

**Registration.** `ClauseRegistry.registerClause(clauseId, version,
contentHash, contentURI)` — permissionless, first-write-wins, immutable, under
a stake. The key is `keccak256(abi.encode(clauseId, version))`, `clauseId`
being the bare human-readable name (`figaro-emissions`). Registration anchors
identity and integrity only: no group field (grouping is `block.design.article`
in the spec, off-chain), no reward tag (designer rewards are uniform on real
use), no validator (a registered clause is immediately attestable). Stake,
withdrawal, and the registry's other semantics are in `CONTRACTS.md`
§ Registries.

On a public chain a registered spec is immutable — changing it means a new
version. On a local devnet the registry is re-seeded fresh on every `devup`, so
specs in `clauses/` are edited in place during development; `version` is not
bumped for an edit.

**Versioning.** `version` is an integer lineage counter, never semver. Semver
is a compatibility promise for consumers that resolve version ranges and
upgrade within them; here consumers pin an exact `(clauseId, version)`, every
content change produces a different hash, and in a first-write-wins registry a
compatibility claim is unverifiable data. Compatibility between two versions,
if it ever matters, is derived by diffing the two immutable specs. Assemblies
follow the same rule. The software packages (`@figaro-protocol/sdk`, the
interface) are ordinary mutable-name software and keep semver.

**Merkle binding.** `AttestationCoordinator` verifies an inclusion proof of
`leaf = keccak256(keccak256(clauseId ++ sectionHash))` against the signed
`agreementHash` and emits `Attestation` with the caller's `contentRef`. It takes
fingerprints, never preimages — `sectionHash = keccak256(sectionData)`,
`contentRef = keccak256(content)` — so a private section's plaintext never
touches the chain. A clause not committed at signing cannot be attested (the
proof will not open); any committed clause attests with zero per-clause code.
Public content is fingerprint-addressed: the attesting party pins the exact
content bytes so that the IPFS address is derived from `contentRef` alone, and
a reader verifies the fetched bytes hash back to it and decodes them against
the spec's stage fields. Withholding is fail-closed — an unknown spec, or any
private field in the encoded set, publishes nothing — and a lookup that
resolves empty reads as absence.

## Clause-spec format

A spec lives off-chain as JSON at the `contentURI` its registration emits;
`contentHash` is its integrity. The canonical specs are in `clauses/`, the
registry's seed data; the published definition of the format is
`sdk/src/clauses/clause-spec.schema.json`.

**The spec has two halves, and the protocol ends between them.**

- **Top level — the protocol**: identity (`clauseId`, `version`, `title`,
  `description`) and the content `fields`/`stages`. Stage 0 is the committed
  content (declared by `fields`); `stages[N≥1]` are the evidence shapes attested
  while the process is open. Every section is a merkle leaf under the signed
  `agreementHash`; the SDK validates the content against the spec off-chain, and
  the bonds secure what was signed. The chain registers clauses and binds
  attestations to the signed agreement; it reads no content shape.
- **`block` — the presentation**, organized into phase sections named for their
  reader: `design` (`article`, `scope`, `nestsUnder`, `fills`, `composes`),
  `checkout` (`catalogueFills`, `profileFills`), `runtime` (`interaction`,
  `fields`). `runtime.fields` serves on-network composition inputs only (paired
  with `design.composes`); reporting is witness stages (`spec.stages`), never
  `runtime.fields`. Nothing on-chain or in the SDK's content layer reads `block`;
  the reference parser is `ClauseBlockBinding`
  (`frontend/lib/shared/clauseBlockBinding.ts`) — derive the attribute list from
  that type. **One verb — `fills` — says who fills which content fields**
  (designer / catalogue / profile); the buyer owns every field named in no fills
  list, derived as the complement, never stored.

`fields` are the protocol; everything in `block` is replaceable presentation.
Anyone can build a different frontend — ignore `block`, invent their own
presentation — and still get the contracts, the mechanisms, the verified
`fields`, and designer rewards. A surface driven by `block` is the designed
presentation of verified clauses; a hardcoded list, a stored role or category,
or a bundled copy of a registry is drift.

**Every attribute is expressed — zero, empty, or `null`, never absent.** The
specs in `clauses/` all comply, enforced by the conformance suite in
`sdk/tests/clauses/`; consumers still treat an absent attribute as its empty
value, so a sparser third-party spec surfaces fine.

**`block.design.article` is the one grouping word** — the contract-document
section a clause reads under. Classification reads the article, never the
field shape:

- **`mandatory`** — committed content on every order (`figaro-commerce`,
  `figaro-topology`), never a designer choice; the assembly build folds
  mandatory clauses in generically.
- **`attestations`** — runtime transfer ladders the responsible party advances
  (`figaro-merchant-process`, `figaro-courier-process`; a supply chain runs the
  same structure at length). These are coordination attestations between
  sellers — the same runtime-evidence category as witness stages, differing in
  shape.
- **`coordination`** — committed declarations of which scenario everyone runs.
  Committed content, not a runtime lifecycle; a coordination clause never
  surfaces an attestation capability.

Other articles are whatever the registered clauses declare; they group the
drawer and the inventory.

## The clauses

The list is the directory: `ls clauses/`. The count is derived, never stored.
Each spec's `description` says what the clause carries, which fields the
designer fills and which the parties fill, and what it composes with; the
public inventory at `/clauses` and the designer's drawer render from the live
registry and the same specs. Do not restate a description here.

Two structural notes that no single spec can carry:

- `figaro-topology` states the order of the sellers in a process. It is
  committed at signing and is a merkle leaf like every other section,
  inclusion-provable against `agreementHash`; an assembly may also attest it at
  runtime as evidence that one seller performed after another. Indexers and
  interfaces read a process's topology from the signed agreement, never from
  the kernel, which stores no parent or child.
- `figaro-assembly-provenance` is the leaf whose committed content is the
  assembly's `compositionHash`. The assembly build folds it into every
  published assembly; checkout fills it from the loaded assembly's own
  identity; `UsageCounter.recordAssemblyUsage` proves that one leaf, which is
  how a process credits its assembly's designer. It is the one entry in
  `UsageCounter.excludedClauseOrAssembly`, so the credit-carrying leaf itself
  earns nothing twice.

## When something deserves a clause — payload vs anchor

A clause is an anchored definition whose meaning must stay stable across
parties, tools, and time, anchored on-chain by a minimal reference point —
`clauseId` + `contentHash` + `contentURI`. Not every value that flows through
an order deserves one.

- **Per-instance payloads** — operational values attached to one order: the
  details of one delivery, a sealed address, notes for a single event. Often
  private, instance-specific, decoded by one interface. These stay as order
  payload bytes; they do not get a clause.
- **Shared reference semantics** — definitions whose meaning must hold across
  counterparties and over time: a disclosure standard, a methodology
  reference, a content format. These are what a clause anchors.

**The decision rule.** Does the protocol need this fact to preserve shared
reference integrity across counterparties and over time? If yes, it is a
clause. If no, it is a per-instance payload: keep it off-chain, referenced
immutably, unregistered.

**Bounded generality.** A clause is generic enough to be reused across the
parties and tools that need it, and no more. Avoid both an interface-specific
one-off that can never become a shared concept, and a universal ontology that
registers every document as a first-class object. Clause identity is
append-only: new meaning is a new `clauseId`, never a mutation of an old one.

## Composition and decomposition — when to merge or split clauses

**Merge when two clauses duplicate one concept.** If two clauses occupy the
same conceptual space and differ only in which enum field they expose, they
are one concept parameterised twice. Replace them with one clause whose
orthogonal fields make the parameterisation explicit — but only when the fields
are genuinely facets of one decision. A request for a modality is not the same
decision as a physical hand-off point; two honest clauses beat a merge that has
to be undone.

**A runtime witness is a stage on the committed clause, never a sister
clause.** Every section — a committed term or a runtime witness — is a merkle
leaf under the same `agreementHash`; what differs is *when* the content is
supplied. A clause commits its terms at signing, fixed for the order's life;
any runtime proof of those terms is filed during the process as an attestation
on that same clause, its shape declared as a witness stage. So do not split a
clause to separate its committed band from its runtime proof; declare the proof
as `stages[N]` on the committed clause. Measured emissions are `figaro-emissions`'
stage-1 witness; a detected hand-off band is `figaro-proximity-policy`'s. A
correction is a later attestation at the same stage, weighed by readers.

**Split when a generic-named clause carries provider-specific fields.** A
clause whose name is generic but whose fields name one provider's internals is
the design smell; the tell is an "at least one of A or B" cross-field invariant
gluing two independently composable concerns. Split along the provider seam —
`figaro-arbitration-<provider>` beside the provider-agnostic
`figaro-applicable-law`, sisters registering symmetrically. The `clauseId` is
committed in the agreement hash, so which provider is an immutable term, not a
payload value; a combined clause forces either a closed enum, which ends
permissionless composition, or an open string, which ends committing to the
provider named. The boundary against the merge rule: `figaro-emissions` keeps
its methodology as a free-form field because a methodology is a label on one
disclosure concern, not a provider whose internals shape the fields.

**A new counterparty pair is composition, never a new clause.** The same
proximity policy composes onto a buyer↔seller pickup, a seller↔seller pickup,
or a buyer↔courier drop-off; only a genuinely different witness model clears
the bar for a new clause.

**The diagnostic, before adding a clause:** (a) does an existing clause cover
this concept with a different enum value? Extend its fields. (b) Does the
concept need a runtime proof of a committed term? Carry it as a witness stage.
(c) Do the field values name a specific provider's internals? Split along the
provider seam. All three are cheap at design time and expensive once a
`clauseId` is bound on a public chain.

## Adding a new clause — checklist

A new clause is a spec plus a registration — nothing else. The proof apparatus
needs no step: the prover's engine is generic and takes the spec as a witness
input anchored by the registration's `contentHash`.

1. Write the spec at `clauses/<clause>.json` — the canonical spec and the
   registry's seed data; nothing bundles a copy.
2. Every attribute expressed, never absent; the conformance suite in
   `sdk/tests/clauses/` reads the new spec from `clauses/` as a fixture. The
   validator and the encoder are generic and need no per-clause case.
3. Register: `frontend/scripts/populate-clauses.mjs` pins the spec to IPFS and
   calls `registerClause(clauseId, version, contentHash, contentURI)` under the
   stake. The Solidity deploy scripts deploy the registry and register no
   clauses. No validator step exists, and no interface step: the drawer, the
   `/clauses` inventory, and every other surface read the clause set live from
   `ClauseRegistry` events and each spec from IPFS.

**When a seller needs a process clause.** A seller needs its own process
clause if and only if its state transitions happen off-chain — in physical
reality — and need a sovereign event log as evidence (`figaro-merchant-process`,
`figaro-courier-process`). Kernel participants do not: the buyer acts through
`commit` and `resolveProcess`, and the kernel's events are its evidence. There
is no buyer-process clause, because it would duplicate kernel events.

If the spec and the registration drift — a spec the registered `contentHash`
does not match, or a registered `clauseId` with no pinned spec — the clause does
not surface. Keep them in lockstep.

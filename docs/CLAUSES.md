# Clauses — the spec, its validation, and how to add one

A clause is data: a JSON spec, registered publicly, that defines one term of an
agreement. Its content is validated in one place — off-chain, by the SDK
(`@figaro-protocol/sdk/clauses`) — against the spec. The chain registers the
clause's key — `keccak256` of the spec's pinned canonical bytes, its identity
and its content hash at once — and binds each attestation to the signed
agreement; it validates no content shape. On the batch path, content is
validated in proof by a generic clause engine (the Rust mirror of the SDK's
validator, in `prover/clause`) that takes each spec as a witness input whose
hash is the clause key, accepted for a key `ClauseRegistry.registered` holds —
`SCALING_STRATEGY.md` owns that argument.
Both paths keep the property that matters: a never-seen clause is attestable,
and batch-resolvable, with zero per-clause on-chain code.

This file owns the spec format and the seam inside it, the lockstep between
spec and registration, the design rules for clauses, and the checklist for
adding one. The list of clauses is the directory `clauses/`; each spec's
`description` says what it carries.

## Every clause is a merkle leaf

Every term of an agreement is a clause, and every clause is a
merkle leaf under `checkoutHash`. A datum that is not a leaf is not a term of
the agreement. The commitment struct's fields (`currency`, `payment`,
`expectedCumulativeValue`, `deadline`) are execution data — what `FigaroCore`
holds and resolves — and never substitute for a term: the agreement's merkle
root is the data of the process's terms, and a term living only in the struct
leaves that data incomplete. Execution and terms are different layers; a copy
across them is the binding, not redundancy, and the sign gate's job is to
assert leaf == struct. `payment` has both homes — the commerce leaf and the
struct field — and so does the denomination.

Beside the clause leaves, the agreement format carries one reserved leaf: the
**provenance leaf**, the link from an order to the registered agreement and the
assembly it instantiated. Its key is `keccak256("figaro-agreement-provenance")`
(`0x26dc18a2251a8f4629ada6df88b7c98553e011c08682d28ce5bb51a441227dc6`), its
committed content is exactly the canonical JSON
`{"agreementHash":"0x<64 lowercase hex>","assemblyHash":"0x<64 lowercase hex>"}`,
and its leaf follows the clause-leaf convention,
`keccak256(keccak256(key ‖ keccak256(content)))`, the same convention as a
clause, whose leaf key is the clause key. The provenance key is a
constant of the format, distinct from every clause key under keccak256's
second-preimage resistance: no spec describes the leaf, it is registered
nowhere, and it is refused at accrual whatever a registry holds at it — the
direct path reverts (`UsageCounter._accrue`,
`ReservedKeyIsNotARegistration`), the guest refuses a batch claim keyed on
it (`apply_usage_claims` in `prover/lib/src/kernel.rs`), and the counter's
batch path skips it (`applyBatchAccrual`). Checkout writes the leaf from the
agreement the order instantiates — the agreement's `agreementHash` and the assembly's
`assemblyHash`; an agreement that names no assembly carries no provenance
leaf. The SDK owns the format (`PROVENANCE_LEAF_KEY`,
`provenanceLeafBytes`, `computeProvenanceLeaf`, `agreementLeaves`,
`buildProvenanceInclusionProof`, `provenanceLeafAttestation` in
`sdk/src/agreement.ts`); `UsageCounter.provenanceLeaf` and the guest's
`PROVENANCE_LEAF_KEY` hold the same constant, and the guest verifies an
attestation of the leaf by inclusion with the bytes reproduced, consulting no
spec. `decodeProvenanceContent(bytes)` returns `{ agreementHash,
assemblyHash }` or `null`.

## The registered agreement and the assembly — units above the clause

Three design-time objects, three registries, parallel: a clause is its spec
(`ClauseRegistry`), a registered agreement is a agreement — the
clauses composed for one agreement (`AgreementRegistry`), and an assembly is
a sequence of agreements holding registered agreements plus the assembly-scoped terms
(`AssemblyRegistry`). Assemblies use agreements, agreements use clauses, and
neither knows what uses it; every arrow is off-chain, in the pinned documents.
`AssemblyRegistry` checks nothing about an assembly's agreements, and each kind of
designer reward is gated by its own registry alone. Each document's published
shape is a JSON Schema beside the clause's: `sdk/src/agreement.schema.json` and
`sdk/src/assembly.schema.json`, each covering the written form (clauses and
agreements by name, as `agreements/` and `assemblies/` are written) and the
registered or pinned form (by key), each `.schema.json` kept in lockstep with the
composer and the builder over the reference files by
`sdk/tests/documents/schema-conformance.test.ts` beside `sdk/src/agreement.schema.json`.

**The agreement.** The reusable unit a designer composes an assembly
from. Its document, `RegisteredAgreement`, is `{ name?, summary?, description?,
clauses }`, where `clauses` maps each clause key to the designer's fills —
value-free, and the topology clause composed with `{}`, because who follows
whom belongs to the agreement; one registered agreement can therefore sit in
any agreement of any assembly. Its key is the merkle root over one leaf per
composed clause, each leaf `keccak256(keccak256(clauseKey ‖ keccak256(fills)))`
under the agreement format's own leaf convention (`agreementHashOf(doc)` in the
SDK; a one-clause agreement's hash is its leaf), so a clause's membership in a
registered agreement is a merkle proof (`buildRegisteredClauseInclusionProof`); the
editorial fields are excluded from it. The designer pins the document and registers the key with
`AgreementRegistry.registerAgreement(agreementHash, contentURI)` under a stake.
The design-time `agreementHash` is never the runtime `checkoutHash`: the first
names the value-free composition, the second is the merkle root of one filled
order.

**Hydration.** A reader fetches the document from the binding's `contentURI`,
parses it, and requires `agreementHashOf(doc)` to equal the registered key
(`anchorRegisteredAgreement(raw, agreementHash)`, as `anchorAssembly` recomputes
an assembly's root). The check is on the key, not the raw bytes, because the
editorial fields sit outside the key. A failed fetch, a failed parse or a
mismatch is absence: the agreement, and so the assembly, is not offered, and
nothing falls back to a bundled or inline copy. Bindings are never cleared,
so a withdrawn stake leaves the agreement hydratable — an assembly composed
from it keeps working — while the drawer offers only live agreements for a new
composition, and the agreement earns only while its stake is live.

**The assembly.** The assembly document is `{ name?, summary?, description?,
faq?, assemblyClauses?, agreements: [{ id: "agreement-<i>", agreementHash,
clauses }] }`. Each entry of `agreements` is an agreement (`AssemblyAgreement`):
a position that holds one registered agreement and the fills that belong to
the position — the topology clause's `{ "follows": ["agreement-<j>",
…] }`, naming the agreements it follows. The topology stays a clause: at design
time in the assembly's agreement, at runtime in the signed agreement. The
assembly's key, `assemblyHash`, is the merkle root built with the clause-leaf
convention above over one leaf per agreement `i` (0-based, assembly order) — key
the agreement's `agreementHash`, content the canonical JSON `{"clauses":{…},"slot":i}`
(object keys sorted, arrays in assembly order) — and, when any
assembly-scoped clauses are composed, one assembly terms leaf, key
`ASSEMBLY_TERMS_LEAF_KEY = keccak256("figaro-assembly-terms")`, content the
canonical JSON of `assemblyClauses`. A one-leaf tree's root is its leaf.
Agreements are ordered, so one registered agreement may hold two. The
editorial fields are excluded from the root. Membership of an agreement in an
assembly is a membership proof: the sorted-pair proof of its agreement leaf under
`assemblyHash` (`buildAgreementInclusionProof(assembly, i)`, with
`agreementLeafBytes(slot, i)` giving the content and `slotContentHash` its
hash). The SDK owns the format (`assemblyHashOf`, `AssemblyAgreement`,
`ASSEMBLY_TERMS_LEAF_KEY` in `sdk/src/assembly.ts`).

**Two reserved keys.** `PROVENANCE_LEAF_KEY` and `ASSEMBLY_TERMS_LEAF_KEY` are
constants of the format, never a registration and never an `agreementHash`:
`AgreementRegistry.registerAgreement` refuses either
(`ReservedKeyIsNotARegistration`), the counter refuses both at accrual on
every kind and skips both on the batch path, `recordAssemblyUsage` refuses an
`agreementHash` equal to either, and the guest and the relay refuse both the
same way.

**The mandatory clauses — written in at composition, never picked.** An
agreement is not an agreement without commerce and topology, so the designer's
canvas writes them into every agreement it registers before the designer
composes anything, and the designer composes the rest. Which clauses they are
is read from `ClauseRegistry`: the DAO wallet's live registrations whose spec
declares the mandatory article at agreement scope, one per shape, the later
registration winning where the DAO holds two of one shape (`mandatoryClauses`
in the SDK; the frontend's `mandatoryClausesForCanvas` reads the DAO's wallet
from the chain's deployment record). Mandatory is a shape, never a name:
commerce is the clause declaring `payment`, `currency` and `lineItems` as
content, topology the clause declaring `follows`
(`specIsCommerceShape`, `specIsTopologyShape`), and every reader already finds
them by those fields. `composeOrderAgreement` refuses an agreement without one
clause of each shape, or with two; a registered agreement bound as is must
carry both shapes itself, whatever their keys. A mandatory-article
registration by any other wallet is an ordinary clause. A reference agreement file
(`agreements/*.json`) names the two clauses like any other. Checkout fills
values and writes the topology; it never adds or drops a clause. Each order's agreement is the agreement's hydrated
registered agreement with the agreement's own fills merged over it (the agreement's fill
wins for the keys it names) and the assembly-scoped clauses beside it; the
values are filled, the topology labels are mapped to order hashes, the
provenance leaf is written from the agreement, and the merkle root of the result is
the order's `checkoutHash`.

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
  stage is named. An `integer` value is a JSON number inside the safe range
  (±(2^53 − 1)), however the text writes it (`5`, `5.0` and `5e0` are one
  integer, read exactly by both engines); a `bigint` value is an unsigned decimal string inside the
  uint256 word. Content that validates encodes, in both engines. Every
  integer a spec itself declares (`version`, a bound, a length, an item
  count) is inside the safe range too.
- A string field's `pattern` is a regex written in the **portable core** —
  the constructs JavaScript's regex library (Layer A) and Rust's (the guest)
  read alike. `isPortablePattern` (`sdk/src/clauses/safeRegex.ts`) is its one
  statement and `is_portable_pattern` (`prover/clause/src/validate.rs`) its
  port: printable ASCII, at most 256 characters; literals, `.`, classes,
  groups `(...)` and `(?:...)`, `\d \D \w \W \s \S`, escaped punctuation,
  `^ $ \b \B`, alternation, and the quantifiers `* + ? {n} {n,} {n,m}` with
  counts up to 64, each optionally lazy. A spec whose pattern is outside the
  core does not parse, in either engine. A patterned field's value is
  printable ASCII; a value outside it does not validate.
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
evidence window closes at resolution (`DESIGN_DECISIONS.md` §6).

Process-log ladders (clauses under the `attestations` article) are the other
runtime-evidence shape: their stage is the enum ordinal, and no `stages` key is
needed. A ladder event is one party's own log; evidence of a transfer between
parties is filed by a party through the relevant clause's own capability.
Whose hands the goods are in is derived by readers from the composed clauses'
events, never stored.

## On-chain anchoring

Two touch points, and neither validates content.

**Registration.** `ClauseRegistry.registerClause(clauseKey, contentURI)` —
permissionless, first-write-wins on the key, immutable, under a stake. The
key is `keccak256` of the spec's pinned canonical bytes:
`computeClauseKey(spec) = canonicalContentHash(spec)` (`sdk/src/discovery.ts`).
The designer pins `canonicalize(spec)` and registers the hash of exactly those
bytes; a reader fetches the bytes from `contentURI` and checks
`keccak256(bytes) == clauseKey` on the bytes it fetched, re-canonicalizing
nothing (`loadClauseSpec` in `frontend/lib/shared/clauseSpecSource.ts`). A
spec pinned in any other byte form has a different key. The spec's
`clauseId` (`figaro-emissions`) and `version` are presentation fields inside
the document — a title and a lineage counter a human reads; nothing on chain
or in a leaf reads them, so two specs that carry one name are two clauses and
a lookalike shares nothing with the original. Registration anchors identity
and integrity in one word: no group field (grouping is `block.design.article`
in the spec, off-chain), no reward tag (designer rewards are uniform on real
use), no validator (a registered clause is immediately attestable). Stake,
withdrawal, and the registry's other semantics are in `CONTRACTS.md`
§ Registries.

On a public chain a registered spec is immutable — a change is a new spec
and therefore a new key. On a local devnet the registry is re-seeded fresh on
every `devup`, so specs in `clauses/` are edited in place during development;
`version` is not bumped for an edit.

**Versioning.** A change is a new spec and a new key; `version` is a lineage
counter a human reads, an integer and never semver. Semver is a compatibility
promise for consumers that resolve version ranges and upgrade within them;
here a consumer names an exact key, every content change produces a different
key, and in a first-write-wins registry a compatibility claim is unverifiable
data. Compatibility between two specs, if it ever matters, is derived by
diffing the two immutable documents. Assemblies follow the same rule. The
software packages (`@figaro-protocol/sdk`, the interface) are ordinary
mutable-name software and keep semver.

**Merkle binding.** `AttestationCoordinator` verifies an inclusion proof of
`leaf = keccak256(keccak256(clauseKey ++ clauseDataHash))` against the signed
`checkoutHash` and emits `Attestation` with the caller's `contentRef`. It takes
fingerprints, never preimages — `clauseDataHash = keccak256(clauseData)`,
`contentRef = keccak256(content)` — so a private clause's plaintext never
touches the chain. A clause not committed at signing cannot be attested (the
proof will not open); any committed clause attests with zero per-clause code.
Public content is fingerprint-addressed: the attesting party pins the exact
content bytes so that the IPFS address is derived from `contentRef` alone, and
a reader verifies the fetched bytes hash back to it and decodes them against
the spec's stage fields. Withholding is fail-closed — an unknown spec, or any
private field in the encoded set, publishes nothing — and a lookup that
resolves empty reads as absence.

## Clause-spec format

A spec lives off-chain as its canonical JSON bytes at the `contentURI` its
registration emits; the clause key is their hash. The canonical specs are in `clauses/`, the
registry's seed data; the published definition of the format is
`sdk/src/clauses/clause-spec.schema.json`.

**The spec has two halves, and the protocol ends between them.**

- **Top level — the protocol**: the presentation names (`clauseId`,
  `version`, `title`, `description`) a human reads, and the content
  `fields`/`stages`. Stage 0 is the committed
  content (declared by `fields`); `stages[N≥1]` are the evidence shapes attested
  while the process is open. Every clause is a merkle leaf under the signed
  `checkoutHash`; the SDK validates the content against the spec off-chain, and
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
  (designer / catalog / profile); the buyer owns every field named in no fills
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
  `figaro-topology`, both at agreement scope), never selected one by one; the
  designer's canvas writes the DAO's live ones into every agreement
  (§ "The registered agreement and the assembly"). No mandatory clause is at
  assembly scope, and one registered there joins no composition.
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
  committed at signing and is a merkle leaf like every other clause,
  inclusion-provable against `checkoutHash`; an assembly may also attest it at
  runtime as evidence that one seller performed after another. Indexers and
  interfaces read a process's topology from the signed agreement, never from
  `FigaroCore`, which stores no parent or child.
- A process credits its registered agreement's and its assembly's designers
  through the agreement format's provenance leaf (§ "Every clause is a merkle
  leaf"), never through a clause: `UsageCounter.recordAgreementUsage` proves
  that one leaf, and `recordAssemblyUsage` proves it and the agreement's
  membership proof under `assemblyHash`. The leaf earns
  nothing itself: it is refused at accrual by comparison with the constant,
  whatever a registry holds at that key (above).

## When something deserves a clause — payload vs anchor

A clause is an anchored definition whose meaning must stay stable across
parties, tools, and time, anchored on-chain by a minimal reference point —
the clause key + `contentURI`. Not every value that flows through
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
append-only: new meaning is a new spec and a new key, never a mutation of an
old one.

## Composition and decomposition — when to merge or split clauses

**Merge when two clauses duplicate one concept.** If two clauses occupy the
same conceptual space and differ only in which enum field they expose, they
are one concept parameterized twice. Replace them with one clause whose
orthogonal fields make the parameterization explicit — but only when the fields
are genuinely facets of one decision. A request for a modality is not the same
decision as a physical hand-off point; two honest clauses beat a merge that has
to be undone.

**A runtime witness is a stage on the committed clause, never a sister
clause.** Every clause — a committed term or a runtime witness — is a merkle
leaf under the same `checkoutHash`; what differs is *when* the content is
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
`figaro-applicable-law`, sisters registering symmetrically. The clause key is
committed in the checkout hash, so which provider is an immutable term, not a
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
clause key is bound on a public chain.

## Adding a new clause — checklist

A new clause is a spec plus a registration — nothing else. The proof apparatus
needs no step: the prover's engine is generic and takes the spec as a witness
input whose hash is the registered clause key.

1. Write the spec at `clauses/<clause>.json` — the canonical spec and the
   registry's seed data; nothing bundles a copy.
2. Every attribute expressed, never absent; the conformance suite in
   `sdk/tests/clauses/` reads the new spec from `clauses/` as a fixture. The
   validator and the encoder are generic and need no per-clause case.
3. Register: `frontend/scripts/populate-clauses.mjs` pins the spec to IPFS and
   calls `registerClause(clauseKey, contentURI)` under the stake, the key
   being `computeClauseKey(spec)` over the canonical bytes it pinned. The Solidity deploy scripts deploy the registry and register no
   clauses. No validator step exists, and no interface step: the drawer, the
   `/clauses` inventory, and every other surface read the clause set live from
   `ClauseRegistry` events and each spec from IPFS.

**When a seller needs a process clause.** A seller needs its own process
clause if and only if its state transitions happen off-chain — in physical
reality — and need a sovereign event log as evidence (`figaro-merchant-process`,
`figaro-courier-process`). The Core's own participants do not: the buyer acts through
`commit` and `resolveProcess`, and `FigaroCore`'s events are its evidence. There
is no buyer-process clause, because it would duplicate `FigaroCore`'s events.

If the spec and the registration drift — bytes at `contentURI` that do not
hash to the registered key, or a registered key with no pinned spec — the
clause does not surface. Keep them in lockstep.

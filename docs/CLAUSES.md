# Clauses — the spec, its validation, and how to add one

A clause is data: a JSON spec, registered publicly, that defines one term of an
agreement. Its content is validated in one place — off-chain, by the SDK
(`@figaro-protocol/sdk/clauses`) — against the spec. The chain registers the
clause's key — `keccak256` of the canonical bytes of the spec without its
top-level `block`, its identity and its content hash at once — and binds each attestation to the signed
agreement; it validates no content shape. Content validation exists on chain
only inside a proof and only at the attesting party's choice: a batched
attestation sent in the plaintext form has its content validated in proof by
a generic clause engine (the Rust mirror of the SDK's validator, in
`prover/clause`) that takes the spec as a witness input whose hash is the
clause key, accepted for a key `ClauseRegistry.registered` holds —
`SCALING_STRATEGY.md` owns that argument. The default on both paths binds
hashes: a batched attestation in its hash-only form carries exactly the
coordinator's `clauseDataHash`, inclusion proof and `contentRef`.
Both paths keep the property that matters: a never-seen clause is attestable,
and batch-resolvable, with zero per-clause on-chain code.

This file owns the spec format and the seam inside it, the lockstep between
spec and registration, the design rules for clauses, and the checklist for
adding one. The list of clauses is the directory `clauses/`; each spec's
`description` says what it carries.

## Every clause is a merkle leaf

Every clause is a merkle leaf under `checkoutHash`. The commitment
struct (`src/core/kernel/CommitmentTypes.sol`, struct `Commitment`) carries
what every order must carry: the parties, the token (`token`), the
`payment`, `runningTotal`, the `checkoutHash`, the salt and the
`commitDeadline`. Both parties sign that struct, and it names the merkle root, so
the struct and the clauses are signed together. No term that every order
carries is a registered clause, and no clause restates a field of the
struct: `figaro-commerce` declares only `lineItems`, and a clause carrying
`payment` or `currency` beside them declares a field its spec does not, which
the sign gate refuses. Every reader takes the payment and the token from the
commitment (or from `OrderCommitted`, which carries both), never from a
clause. The one comparison the gate makes across the two is the
denomination pin: where an assembly composes a clause with a designer-filled
`currency` (`figaro-utility-token`), the gate requires the commitment's token
to equal it.

Beside the clause leaves, the agreement format carries one reserved leaf: the
**provenance leaf**, the link from an order to the registered agreement and the
assembly it instantiated. Its key is `keccak256("figaro-agreement-provenance")`
(`0x26dc18a2251a8f4629ada6df88b7c98553e011c08682d28ce5bb51a441227dc6`), its
committed content is exactly the canonical JSON
`{"agreementHash":"0x<64 lowercase hex>","processDesignHash":"0x<64 lowercase hex>"}`,
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
`processDesignHash`; an agreement that names no assembly carries no provenance
leaf. The SDK owns the format (`PROVENANCE_LEAF_KEY`,
`provenanceLeafBytes`, `computeProvenanceLeaf`, `agreementLeaves`,
`buildProvenanceInclusionProof`, `provenanceLeafAttestation` in
`sdk/src/agreement.ts`); `UsageCounter.provenanceLeaf` and the guest's
`PROVENANCE_LEAF_KEY` hold the same constant, and the guest verifies an
attestation of the leaf by inclusion with the bytes reproduced, consulting no
spec. `decodeProvenanceContent(bytes)` returns `{ agreementHash,
processDesignHash }` or `null`.

The agreement format carries a second leaf of its own: the **topology leaf**,
the orders this order follows (`Agreement.follows`, their FigaroCore order
hashes, in the order the design names them, `[]` for the root of its
process). A tool without the SDK rebuilds it from these bytes:

- the label is the string `figaro-agreement-topology`, and the domain is
  its `keccak256`, `TOPOLOGY_LEAF_DOMAIN` =
  `0xbb19ab0597c6d28223160cd73f765e7ab09fb47de53be100cb982aec5ebc63af`;
- the committed content is the canonical JSON `{"follows":[…]}`, each edge
  `"0x<64 lowercase hex>"`, in the order given, no whitespace; a root's is
  `{"follows":[]}`;
- the data hash is `keccak256(content)`;
- the leaf is `keccak256(keccak256(TOPOLOGY_LEAF_DOMAIN ‖ uint256(n) ‖
  dataHash))`, `n` the number of edges as a 32-byte big-endian word: an
  inner preimage of 96 bytes. A root's leaf is
  `0xa17e1e2abf5a5709c413cce584db7e38200a19361ad5e98542a85c44a06b8709`.

The `checkoutHash` is the merkle root over every leaf of the agreement: one per
clause (an agreement naming one clause key twice is refused), the provenance
leaf when the agreement names a design, and the topology leaf when it carries
`follows`. A tool without the SDK rebuilds the root by these rules
(`sortLeaves`, `hashPair` and `buildMerkleRoot` in `sdk/src/agreement.ts`):

- the leaves are sorted in ascending order of their 32-byte values read as
  unsigned integers (the SDK compares their lowercase hex, which gives the
  same order);
- each layer pairs its nodes left to right, the first with the second, the
  third with the fourth, and so on, and a pair hashes as
  `keccak256(min(a,b) ‖ max(a,b))`, the smaller value first, a 64-byte
  preimage;
- a node left without a partner at the end of a layer goes up to the next
  layer unchanged; it is never hashed with itself;
- the root is the one node left: a one-leaf tree's root is its leaf, and an
  empty tree's is `bytes32(0)`.

An assembly's root is built by the same rules over the assembly tree's leaves
(`processDesignHashOf`, `sdk/src/assembly.ts`).

The inner preimage of a clause leaf, and of the provenance leaf, is 64 bytes,
a key and a data hash. No pair of a 32-byte key and a 32-byte data hash
reproduces a 96-byte preimage's hash, so no clause key opens the topology
leaf: no key exists to register in `ClauseRegistry`, no attestation can name
it (`AttestationCoordinator` rebuilds the clause shape), and no usage claim
counts it. A reserved key in the clause-leaf shape would not hold this,
because `ClauseRegistry.registerClause` accepts any nonzero key and
`UsageCounter` and the guest refuse only the two reserved keys
(`is_reserved_key`, `prover/lib/src/kernel.rs`). An assembly leaf's inner
preimage is also 96 bytes (domain, key, data hash), and it is kept apart from
the topology leaf by its first word, the domain: `PROCESS_LEAF_DOMAIN` =
`keccak256("figaro-assembly-leaf")` =
`0xb44cab2cf6dbf97cfe57060c8f30ee31552bc93f52859b4f32bd145f2882dfc6`, against
`TOPOLOGY_LEAF_DOMAIN` =
`0xbb19ab0597c6d28223160cd73f765e7ab09fb47de53be100cb982aec5ebc63af`. The edges are fixed at
commit and have no later stage, so no attestation of them is lost. The leaf stays
double-hashed, so it never passes as an internal node.

Checkout writes `follows` from the assembly entry the order instantiates,
each label mapped to the order hash of that entry's order, as it writes the
provenance. Every agreement built from a design carries the leaf, an empty
list included, so absence never reads as "no edges"; an agreement built
without a design leaves it absent. The sign gate refuses an agreement that
names a design (its provenance) and carries no topology leaf, and any
topology leaf whose edges are not distinct 32-byte hashes
(`validateCommitmentAgreement`). It also refuses an order whose leaf names
another number of orders than the design entry it matches follows entries.
It does not check which orders the edges name: an order hash depends on that
order's parties, payment and salt, which no design carries. The SDK owns the format (`TOPOLOGY_LEAF_LABEL`,
`TOPOLOGY_LEAF_DOMAIN`, `topologyLeafBytes`, `topologyContentRef`,
`computeTopologyLeaf`, `agreementLeaves` in `sdk/src/agreement.ts`); no
contract and no proof program holds the constant.

## The registered agreement and the assembly — units above the clause

Three design-time objects, three registries, parallel: a clause is its spec
(`ClauseRegistry`), a registered agreement is an agreement at design time, its
registered design and not a second object beside the agreement completed at checkout
(the lexicon has one entry for both) — a merkle tree of clauses, one leaf per composed
clause with the designer's fills, value-free, keyed by its root, the `agreementHash`
(`AgreementRegistry`), and an
assembly is a merkle tree of agreements, each binding a registered agreement by
its `agreementHash`, plus the assembly-scoped terms (`ProcessRegistry`). Assemblies use agreements, agreements use clauses, and
neither knows what uses it; every arrow is off-chain, in the pinned documents.
`ProcessRegistry` checks nothing about an assembly's agreements, and each kind of
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
value-free, and with no topology, because who follows whom belongs to the
assembly entry; one registered agreement can therefore sit in any entry of
any assembly. It composes at least one clause: an empty one's key is
`bytes32(0)`, which `AgreementRegistry.registerAgreement` refuses
(`ZeroAgreementHash`). Its key is the merkle root over one leaf per
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
(`anchorRegisteredAgreement(raw, agreementHash)`, as `anchorProcessDesign` recomputes
an assembly's root). The check is on the key, not the raw bytes, because the
editorial fields sit outside the key. A failed fetch, a failed parse or a
mismatch is absence: the agreement, and so the assembly, is not offered, and
nothing falls back to a bundled or inline copy. Bindings are never cleared,
so a withdrawn stake leaves the agreement hydratable — an assembly composed
from it keeps working — while the drawer offers only live agreements for a new
composition, and the agreement earns only while its stake is live.

**The assembly.** The assembly document is `{ name?, summary?, description?,
faq?, assemblyClauses?, agreements: [{ id: "agreement-<i>", agreementHash,
clauses, follows }] }`. Each entry of `agreements` is an agreement (`ProcessDesignAgreement`):
a position that holds one registered agreement, the fills that belong to
the position (`clauses`, `{}` when it fills none), and `follows`, the labels
`["agreement-<j>", …]` of the entries it follows (`[]` or absent on the
root). The topology is never a clause: at design time it is the entry's
`follows`, at runtime the signed agreement's topology leaf. The
assembly's key, `processDesignHash`, is the merkle root built with the clause-leaf
convention above over one leaf per agreement `i` (0-based, assembly order) — key
the agreement's `agreementHash`, content the canonical JSON
`{"agreement":i,"clauses":{…},"follows":[…]}` (object keys sorted, arrays in
assembly order, `follows` `[]` when absent) — and, when any
assembly-scoped clauses are composed, one assembly terms leaf, key
`PROCESS_TERMS_LEAF_KEY = keccak256("figaro-assembly-terms")`, content the
canonical JSON of `assemblyClauses`. A one-leaf tree's root is its leaf.
Agreements are ordered, so one registered agreement may hold two. The
editorial fields are excluded from the root. Membership of an agreement in an
assembly is a membership proof: the sorted-pair proof of its agreement leaf under
`processDesignHash` (`buildAgreementInclusionProof(assembly, i)`, with
`agreementLeafBytes(entry, i)` giving the content and `agreementContentHash` its
hash). Every leaf of the assembly tree, the agreement leaves and the terms leaf,
is built in the assembly tree's own shape,
`keccak256(keccak256(processLeafDomain ‖ key ‖ dataHash))` with
`processLeafDomain = keccak256("figaro-assembly-leaf")`, where the agreement format's leaf is
`keccak256(keccak256(key ‖ dataHash))`: a tree over agreements and a tree over
clauses never share one shape, so no agreement root opens an assembly
leaf. The SDK owns the format (`processDesignHashOf`, `computeProcessLeaf`,
`PROCESS_LEAF_DOMAIN`, `ProcessDesignAgreement`, `PROCESS_TERMS_LEAF_KEY` in
`sdk/src/assembly.ts`); `UsageCounter.processLeafDomain` and the guest hold the
same constant.

**Two reserved keys.** `PROVENANCE_LEAF_KEY` and `PROCESS_TERMS_LEAF_KEY` are
constants of the format, never a registration and never an `agreementHash`:
`AgreementRegistry.registerAgreement` refuses either
(`ReservedKeyIsNotARegistration`), the counter refuses both at accrual on
every kind and skips both on the batch path, `recordProcessDesignUsage` refuses an
`agreementHash` equal to either, and the guest and the relay refuse both the
same way.

**An agreement carries the clauses its designer composed, and no other.**
No clause is written into an agreement by the tooling: `composeOrderAgreement`
(`sdk/src/projection.ts`) keeps exactly the designer's selection and refuses
only an agreement composing no clause. `figaro-commerce` is a clause like any
other, composed where the parties commit the list of line items, or left out.
No clause is required: the topology is the agreement format's own leaf, and
the commitment carries the payment and the token, so an agreement that
composes no clause declaring `lineItems` still carries its payment; what it
does not commit is the list of what the payment buys. The designer's review
screen names each such order before publishing. A reference agreement file
(`agreements/*.json`) names its clauses by name. Checkout fills
values and writes the topology; it never adds or drops a clause. Each order's agreement is the agreement's hydrated
registered agreement with the agreement's own fills merged over it (the agreement's fill
wins for the keys it names) and the assembly-scoped clauses beside it; the
values are filled, the entry's `follows` labels are mapped to order hashes
and written as the topology leaf, the provenance leaf is written from the
agreement, and the merkle root of the result is the order's `checkoutHash`.

## The SDK's validation

`@figaro-protocol/sdk/clauses` exposes one generic engine; `sdk/README.md` is
its manual.

- `parseClauseSpec(json)` — validates a spec against the published clause-spec definition
  (`sdk/src/clauses/clause-spec.schema.json`): a closed subset of JSON Schema
  (`string`, `integer`, `bigint` as a decimal string, `boolean`, `enum`,
  `array`, `object`). An `enum` field names at most 256 values, since a
  value encodes as its `uint8` position; a spec with more does not parse in
  either engine. A string field's `format` is an open axis: any non-empty
  string is a valid value; the validator enforces the formats it knows
  and treats the rest as plain strings; an interface may map a known format to
  a richer input. It applies the private set's rules (§ "Clause-spec format",
  "Public and private fields, and the blinding field"): a set that declares a
  private field declares exactly one blinding field, of one shape, at its top
  level, and no set mixes public and private fields. The attribute is present
  only as `true`: a field carrying `"blinding": false` is refused. A
  `disposition` other than `"public"` or `"private"`, and a `formatFromField`
  that is not a non-empty string, are refused too. The guest's engine
  (`prover/clause`) applies every one of these rules, so a spec that breaks
  them fails gate S of a plaintext attestation, and a proof of a private
  set's content attests that its blinding value is present
  (`sdk/tests/clauses/engineVectors.test.ts`, `prover/clause/tests/engine_vectors.rs`).
  That check binds for the party that submitted the plaintext form; a
  reader of the chain cannot tell which form an attestation took
  (`docs/DESIGN_DECISIONS.md` § 26).
- `validateContent(content, spec, { stage? })` — validates a value against a
  parsed spec; rejects unknown fields; applies `spec.stages[stage]` when a
  stage is named. It applies the geohash grain cap, cap(disposition,
  geocodeStandard) (`sdk/src/clauses/grain.ts`), to the resolved format,
  static or named by a sibling (`resolveInputFormat`): a string field's
  static `format`, or, when it declares `formatFromField`, the named
  sibling's committed value, then that sibling's default, then `format`. A
  stage field's `formatFromField` names a field of the same stage, and
  resolves among that stage's fields only. When the resolved format is
  `geohash`, a `public` value carries at most 6 characters and a `private` one
  at most 12, under the field's `maxLength`, which stays the structural
  ceiling. An array whose item spec declares `format: "geohash"` caps each
  item by the array field's disposition. A standard it carries no grain
  knowledge of is bounded by `maxLength` only. The guest's engine
  (`prover/clause/src/grain.rs`, `validate.rs`) applies the same cap through
  the same resolution, so a proof of a plaintext attestation attests the
  grain, for the party that submitted that form; a reader of the chain cannot
  tell which form an attestation took (`docs/DESIGN_DECISIONS.md` § 26). An
  `integer` value is a JSON number inside the safe range
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
  counts up to 64, each optionally lazy. The pattern's **expanded size** is
  at most 4,096 (`MAX_PATTERN_EXPANSION`): each atom and each assertion
  counts one, a group counts the sum of what it holds (every branch of an
  alternation included), and a quantifier multiplies what it follows by `m`
  for `{n,m}`, `n` for `{n}`, `n + 1` for `{n,}`, and one for `*`, `+` and
  `?`. Nested counts multiply, so a short pattern such as
  `(?:(?:(?:(?:a{64}){64}){64}){64})` stands for some sixteen million
  items, past the guest's regex size limit; the bound refuses it in both
  engines first. Under the bound the guest compiles every portable pattern:
  it compiles with the Unicode tables off, which on a printable-ASCII value
  match as JavaScript's classes do, and compiles each pattern once, when the
  spec parses. A spec whose pattern is outside the core does not parse, in
  either engine. A patterned field's value is printable ASCII; a value
  outside it does not validate.
- A `string` value holds no lone UTF-16 surrogate (`"\ud800"` with no low
  half after it, or a low half alone). `JSON.parse` keeps one and
  `serde_json`, which reads content in the guest, refuses it; the SDK's
  `validateContent` refuses it too, so no party signs content the batch
  path cannot read.
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
on-chain `uint8 stage`. The content the parties sign is validated over
`fields` alone, at the sign gate (`validateCommitmentAgreement` in
`sdk/src/projection.ts`) and in the guest's gate for a re-asserted clause
(`validate_attestation_content` in `prover/lib/src/kernel.rs`). Content
attested at stage N, stage 0 included, is encoded and validated over
`stages[N]` where the spec declares it, else over `fields`, in both engines.
A stage key has one spelling: the decimal of an integer from 0 to 255, digits
only, with no sign, no leading zero and no whitespace (`"0"`, `"1"`, `"255"`).
A spec with any other key does not parse in either engine, and the issue names
the key (`stageOfKey` and `stageKey` in `sdk/src/clauses/spec.ts`,
`parse_stage_key` in `prover/clause/src/spec.rs`). `ClauseRegistry` reads no
spec and registers such a clause anyway; the reference tooling never loads it.
The spec's stage list is the whole signal: an interface derives a witness capability
for any composed clause that declares stages, renders the form from the
declared fields, validates and encodes at the stage, and files through
`AttestationCoordinator`; readers decode the recovered calldata against the
same spec. Who witnesses is never engine policy — either party may file,
and sufficiency is derived at read time against the committed terms. The
evidence window closes at resolution (`DESIGN_DECISIONS.md` §6).

Process-log ladders (clauses under the `attestations` article) are the other
runtime-evidence shape: their stage is the enum ordinal, and no `stages` key is
needed. One rule says which set an attestation's content is encoded over: at
stage N, `stages[N]` where the spec declares it, else the top-level `fields`.
The SDK (`contentFieldsFor` in `sdk/src/clauses/encode.ts`) and the proof
program (`encode_content_from_spec` in `prover/clause/src/encode.rs`) apply it
alike, and the reference frontend reads the same rule
(`attestationContentFields` in `frontend/lib/shared/clauseSpecSource.ts`). A
ladder that declares no stage sets encodes each of its events, with the stage,
to the same bytes as with none: over its top-level fields. A ladder that
declares `stages[k]` encodes its event at ordinal k over that set, and the
reference frontend's card at that ordinal collects that set's fields. A ladder event is one party's own log; evidence of a transfer between
parties is filed by a party through the relevant clause's own capability.
Whose hands the goods are in is derived by readers from the composed clauses'
events, never stored.

## On-chain anchoring

Two touch points, and neither validates content.

**Registration.** `ClauseRegistry.registerClause(clauseKey, contentURI)` —
permissionless, first-write-wins on the key, immutable, under a stake. The
key is `keccak256` of the canonical bytes of the spec without its top-level
`block`: `computeClauseKey(spec)`, which hashes `clauseKeyPreimage(spec)`
(`sdk/src/discovery.ts`). It covers `clauseId`, `version`, `title`,
`description`, `fields`, `stages` and every other top-level attribute; it
leaves out `block`, the presentation. The designer pins `canonicalize(spec)`,
`block` included, and registers its clause key; a reader fetches the document
from `contentURI`, parses it, drops `block`, canonicalizes and checks the hash
against the key (`anchorClauseSpec` in `sdk/src/anchored.ts`, called by
`loadClauseSpec` in `frontend/lib/shared/clauseSpecSource.ts`). The byte form
a spec is pinned in and its `block` do not change its key; an edit to
presentation alone keeps the clause, and so its count of use. The spec's
`clauseId` (`figaro-emissions`) and `version` are presentation fields inside
the document — a title and a lineage counter a human reads; nothing on chain
or in a leaf reads them, so two specs that carry one name are two clauses and
a lookalike shares nothing with the original. Registration anchors identity
and integrity in one word: no group field (grouping is `block.design.article`
in the spec, off-chain), no reward tag (designer rewards are uniform on real
use), no validator (a registered clause is immediately attestable). Stake,
withdrawal, and the registry's other semantics are in `CONTRACTS.md`
§ Registries.

**The canonical form, exactly.** `canonicalize` is ECMAScript's
`JSON.stringify` with no whitespace, applied after each object's keys are
sorted (`sdk/src/agreement.ts`, `sortedReplacer`). A tool that builds a key
or a witness without the SDK reproduces five things:

1. Keys that are array indexes (`"2"`, `"10"`) come first, in numeric order;
   `{"10":…,"2":…}` serializes with `2` before `10`.
2. Every other key follows, sorted by UTF-16 code unit.
3. A number is written as ECMAScript prints it (`1.5`, `1e+21`); an integer
   above 2^53 is rounded to the nearest double, so a spec carries none.
4. A string is escaped as `JSON.stringify` escapes it: `"`, the backslash and the
   control characters only; every other character stays raw UTF-8.
5. The SDK's readers drop the keys `__proto__`, `constructor` and `prototype`
   at every depth before they hash, so a spec carries none of them.

Array order is kept. A generic sorted-keys serializer differs on the first
and third points and yields another key.

On a public chain a registered spec is immutable — a change outside `block`
is a new spec and therefore a new key. On a local devnet the registry is re-seeded fresh on
every `devup`, so specs in `clauses/` are edited in place during development;
`version` is not bumped for an edit.

**Versioning.** A change outside `block` is a new spec and a new key; `version` is a lineage
counter a human reads, an integer and never semver. Semver is a compatibility
promise for consumers that resolve version ranges and upgrade within them;
here a consumer names an exact key, every change outside `block` produces a
different key, and in a first-write-wins registry a compatibility claim is unverifiable
data. Compatibility between two specs, if it ever matters, is derived by
diffing the two immutable documents. Assemblies follow the same rule. The
software packages (`@figaro-protocol/sdk`, the interface) are ordinary
mutable-name software and keep semver.

**Merkle binding.** `AttestationCoordinator` verifies an inclusion proof of
`leaf = keccak256(keccak256(clauseKey ++ clauseDataHash))` against the signed
`checkoutHash` and emits `Attestation` with the caller's `contentRef`. It takes
fingerprints, never preimages — `clauseDataHash = keccak256(clauseData)`,
`contentRef = keccak256(content)` — so a private clause's plaintext never
touches the chain. The batch path's default form takes the same three, and the
relay and the proving network see only those fingerprints; the plaintext form
reaches them only when the attesting party sends it to have its content
checked in the proof. A clause not committed at signing cannot be attested (the
proof will not open); any committed clause attests with zero per-clause code.
Public content is fingerprint-addressed: the attesting party pins the exact
content bytes so that the IPFS address is derived from `contentRef` alone, and
a reader verifies the fetched bytes hash back to it and decodes them against
the spec's stage fields. Withholding is fail-closed — an unknown spec, or any
private field in the encoded set, publishes nothing — and a lookup that
resolves empty reads as absence.

## Clause-spec format

A spec lives off-chain as its canonical JSON bytes at the `contentURI` its
registration emits; the clause key is the hash of the canonical spec without
its top-level `block`. The canonical specs are in `clauses/`, the
registry's seed data; the published definition of the format is
`sdk/src/clauses/clause-spec.schema.json`.

**The spec has two halves, and the protocol ends between them.**

- **Top level — the protocol**: the presentation names (`clauseId`,
  `version`, `title`, `description`) a human reads, and the content
  `fields`/`stages`. Stage 0 is the committed
  content (declared by `fields`); `stages[N≥1]` are the evidence shapes attested
  while the process is open. Each `stages` key is the decimal of the stage, from
  `"0"` to `"255"`, in one spelling (§ "Witness stages"). Every clause is a merkle leaf under the signed
  `checkoutHash`; the SDK validates the content against the spec off-chain, and
  the bonds secure what was signed. The chain registers clauses and binds
  attestations to the signed agreement; it reads no content shape.
- **`block` — the presentation**, organized into phase sections named for their
  reader: `design` (`article`, `scope`, `nestsUnder`, `fills`, `composes`),
  `checkout` (`catalogueFills`, `profileFills`, `catalogueMeasures`), `runtime`
  (`interaction`, `fields`). `runtime.fields` serves on-network composition inputs only (paired
  with `design.composes`); reporting is witness stages (`spec.stages`), never
  `runtime.fields`. The clause key leaves `block` out, and no fingerprint reads
  it. Six of its attributes (`design.article`, `design.scope`, `design.fills`,
  `checkout.catalogueFills`, `checkout.profileFills`,
  `checkout.catalogueMeasures`; `parseProjectionHints` in `sdk/src/projection.ts`)
  are the reference tooling's rules for collecting the data a party signs.
  Another frontend may collect it differently; both parties sign one
  `checkoutHash` over one agreement, which either recomputes from the agreement
  alone. Nothing on-chain or in the SDK's content layer reads `block`;
  the reference parser is `ClauseBlockBinding`
  (`frontend/lib/shared/clauseBlockBinding.ts`) — derive the attribute list from
  that type. **One verb — `fills` — says who fills which content fields**
  (designer / catalog / profile); the buyer owns every field named in no fills
  list and no `catalogueMeasures` entry, derived as the complement, never stored.
- **`block.checkout.catalogueMeasures` reads a field from the catalog item
  itself.** It maps a content field to the catalog-item field it is read from
  and how the order's lines combine it: `{ "massGrams": { "from": "massGrams",
  "combine": "sum" } }`. `"sum"` adds the item's value × the line's quantity
  over every line; `"single-unit"` takes the item's value only when the order
  is one unit (one line, quantity 1), for a measure such as a packaged dimension
  that does not add across units. `catalogueFills` differs: there the seller
  sets per-clause values on the item (`clauseValues`). The checkout fill
  (`fillCatalogueMeasures`) reads the field names from the spec and names no
  clause. A measure the lines cannot supply stays missing: the fill writes
  nothing, and a required one that stays missing refuses the order before it
  is signed (`missingCatalogueMeasures`). A clause's designer keeps a `default` off a
  measured field, or the agreement build would invent the number the catalog
  lacks. `figaro-cargo` declares its mass and volume as sums and its packaged
  dimensions as single-unit measures, with no `default` on any of them.

**Public and private fields, and the blinding field.** A field's
`disposition` is `"public"` (the default) or `"private"`. The leaf model
withholds a whole set, never one field, so a set (the top-level `fields`, or
one `stages[N]`) never mixes the two (`parseClauseSpec`). A private field is
withheld from every public place, and only its fingerprint is published:
a clause's data hash under the `checkoutHash`, or a witness's `contentRef`.
A value with few possibilities (a grade, a band, a yes or no) could then be
confirmed by hashing each guess, so a set that declares a private field also
declares exactly one **blinding field**:

```json
{ "name": "blinding", "type": "string", "format": "bytes32-hex",
  "required": true, "disposition": "private", "blinding": true }
```

The rules, each checked by the SDK (`sdk/src/clauses/spec.ts`,
`sdk/src/projection.ts`) and stated by the published definition of the
format (`sdk/src/clauses/clause-spec.schema.json`):

1. A set that declares a private field declares exactly one blinding field,
   at its top level (never inside an object or an array), of type `string`,
   format `bytes32-hex`, required, private, with no `default`. The name is the
   spec designer's; readers key on `"blinding": true`.
2. A set with no other private field declares none.
3. No set mixes public and private fields; each stage's set is held to the
   rule as the top-level set is. A field counts as private when it or a field
   nested in it (an object's `fields`, an array's `items`, at any depth) is,
   so a private field nested in a public one makes the set mixed
   (`fieldCarriesPrivate` in `sdk/src/clauses/spec.ts`,
   `field_carries_private` in `prover/clause/src/spec.rs`).
4. The sign gate (`validateCommitmentAgreement`) refuses an agreement whose
   clause spec names the blinding field in `block.design.fills`,
   `block.checkout.catalogueFills`, `block.checkout.profileFills` or
   `block.checkout.catalogueMeasures` (a designer's, catalog's or profile's
   value is public and the same in every order), a zero blinding value, and
   two clauses of one agreement that carry the same value.

The value is content like any other field: it enters the canonical JSON of
stage 0 and the ABI bytes of a stage, so no hash function, leaf, content
reference, CID or contract treats it apart, and the holder of the content
reproduces the fingerprint from the content alone. The party that fills the
set draws it, fresh for each commitment or attestation, through the SDK's one
entropy source (`withFreshBlinding`, `withClauseBlinding`, built on
`generateSalt`); a builder and a hash function never draw it, so a rebuild of
the same data reproduces the same hash. It is no term: no form offers an
input for it, a comparison of two parties' filings reads past it, and a
review says the clause carries one. A public set carries none, so public
content stays reproducible by anyone from what is published. The commitment's
own `salt` is another thing: it is the order's identity, emitted in
`OrderCommitted`, and blinds nothing (`docs/DESIGN_DECISIONS.md` § 33).

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

- **`attestations`** — runtime transfer ladders the responsible party advances
  (`figaro-merchant-process`, `figaro-courier-process`; a supply chain runs the
  same structure at length). These are coordination attestations between
  sellers — the same runtime-evidence category as witness stages, differing in
  shape.
- **`consent`** — documents a party accepts by signing: the agreement review
  shown before signing lists each value of a clause of this article under a
  consent notice, a fetchable document linked
  (`frontend/components/runtime/AgreementReview.tsx`).
- **`coordination`** — committed statements of which scenario everyone runs
  and what an order covers: the modality, the time window, the localities, the
  line items (`figaro-commerce`). Committed content, not a runtime lifecycle;
  a coordination clause never surfaces an attestation capability.
- **`denomination`** — an assembly-scoped clause of this article has each
  unfilled designer-filled `address-hex` field set to the deployment's token
  at seeding (`fillDeployTimeCurrency`, `sdk/src/projection.ts`).
- **`dispute-resolution`** — the forum a process names: the audit view's
  recourse reader keeps the clauses of this article
  (`frontend/lib/semantic/processRecourse.ts`).

Code routes on four of these: `attestations`, `consent`, `denomination` and
`dispute-resolution`. Any other word, a stranger's included, is a grouping
word only: the drawer and the inventory group the clause under it
(`groupClausesByArticle`, `frontend/lib/shared/clauseSpecSource.ts`), and the
composition, the checkout and the sign gate treat the clause as they treat
any clause.

Other articles are whatever the registered clauses declare; they group the
drawer and the inventory.

## The clauses

The list is the directory: `ls clauses/`. The count is derived, never stored.
Each spec's `description` says what the clause carries, which fields the
designer fills and which the parties fill, and what it composes with; the
public inventory at `/clauses` and the designer's drawer render from the live
registry and the same specs. Do not restate a description here.

Two structural notes that no single spec can carry:

- The order of the sellers in a process is the agreement format's topology
  leaf (§ "Every clause is a merkle leaf"), never a clause. It is committed at
  signing under `checkoutHash`; no attestation names it. Indexers and
  interfaces read a process's topology from the signed agreement's `follows`,
  never from `FigaroCore`, which stores no parent or child.
- A process credits its registered agreement's and its assembly's designers
  through the agreement format's provenance leaf (§ "Every clause is a merkle
  leaf"), never through a clause: `UsageCounter.recordAgreementUsage` proves
  that one leaf, and `recordProcessDesignUsage` proves it and the agreement's
  membership proof under `processDesignHash`. The leaf earns
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
   being `computeClauseKey(spec)`, the hash of the canonical spec without its
   `block`. The Solidity deploy scripts deploy the registry and register no
   clauses. No validator step exists, and no interface step: the drawer, the
   `/clauses` inventory, and every other surface read the clause set live from
   `ClauseRegistry` events and each spec from IPFS.

**When a seller needs a process clause.** A seller needs its own process
clause if and only if its state transitions happen off-chain — in physical
reality — and need a sovereign event log as evidence (`figaro-merchant-process`,
`figaro-courier-process`). The Core's own participants do not: the buyer acts through
`commit` and `resolveProcess`, and `FigaroCore`'s events are its evidence. There
is no buyer-process clause, because it would duplicate `FigaroCore`'s events.

If the spec and the registration drift — a document at `contentURI` whose
spec, without `block`, does not hash to the registered key, or a registered key with no pinned spec — the
clause does not surface. Keep them in lockstep.

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
denomination pin: where an assembly composes a clause whose spec declares one
(`specDenominationPinField`: assembly-scoped, of the denomination article,
with exactly one designer-filled `address-hex` field, whatever its name;
`figaro-utility-token`'s `currency` is the reference one), the gate requires
the commitment's token to equal it. The lines a clause marks as priced
(`block.checkout.pricedLines`, § "Clause-spec format") are never compared with
the payment: a review shows their sum beside it and says the two are not held
equal.

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
another number of orders than the design entry it matches follows entries,
and a commitment that opens a process (`processId` zero) whose leaf names
any order. It does not check which orders the edges name: an order hash
depends on that order's parties, payment and salt, which no design carries,
so the counter-signer checks them against the chain before it signs
(`followedOrderIssues`; `docs/DATA_LAYER.md`, the paragraph "The
counter-signer is the first reader of the edges"). The SDK owns the format (`TOPOLOGY_LEAF_LABEL`,
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
composes no clause marking priced lines still carries its payment; what it
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
  stage is named. It applies the grain cap, cap(disposition,
  geocodeStandard) (`sdk/src/clauses/grain.ts`), to the resolved format,
  static or named by a sibling (`resolveInputFormat`): a string field's
  static `format`, or, when it declares `formatFromField`, the named
  sibling's committed value, then that sibling's default, then `format`. A
  stage field's `formatFromField` names a field of the same stage, and
  resolves among that stage's fields only. When two fields share the
  sibling's name, the first gives the default. Each engine reads the
  defaults from a map it builds once per object, so a set of n fields costs
  n lookups. The cap knows four standards, by
  their format value, and reads the grain each one writes in its code:

  | Format | The grain it reads | Public cap | Private cap |
  |---|---|---|---|
  | `geohash` | the length in characters | 6 | 12 |
  | `h3` | the resolution of the cell index, written in hex | 8 | 15 |
  | `s2` | the level of the cell token, written in hex | 13 | 30 |
  | `olc` | the Open Location Code's length, its significant digits | 6 | 15 |

  Each public cap is the finest grade whose cells are, on average, no
  smaller than a six-character geohash cell at 45 degrees of latitude
  (about 0.53 km²): H3 resolution 8 averages 0.74 km², S2 level 13 1.27 km²,
  and an Open Location Code of length 6 is 0.05 degrees a side, where length 8
  is about 0.05 km². Each private cap is the standard's own finest grade,
  except geohash's, which stops at 12 characters. Under one of these formats,
  a value finer than its disposition's cap is refused, and so is a value that
  is no code of the standard (an H3 index whose mode is not a cell, an S2
  token whose lowest set bit is at an odd position or above bit 60, an Open
  Location Code with odd padding), because no grain can be read from it. The field's
  `maxLength` stays the structural ceiling. An array whose item spec declares
  one of these formats caps each item by the array field's disposition. A
  standard it carries no grain knowledge of is bounded by `maxLength` only. The
  reference clause `figaro-geolocation` declares `geocodeStandard` as an
  `enum` of the four, so under it every public endpoint is capped
  (`docs/DESIGN_DECISIONS.md` § 37). The guest's engine
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
  counts up to 64, each optionally lazy. The pattern's **expanded size**
  (`portablePatternSize`, `portable_pattern_size`) is one integer, computed
  alike in both engines with integer arithmetic. Each atom and each
  assertion counts one, and each `|` counts one. A group counts one more
  than what it holds, and `*`, `+` and `?` count one more than what they
  follow. A counted quantifier counts what it follows plus one, times `m`
  for `{n,m}`, `n` for `{n}` and `n + 1` for `{n,}`. The size counts every
  state an automaton holds, so nesting cannot hide cost: `(?:(?:a)*)*`
  counts five. The domain-name pattern `^([a-z0-9-]+\.)+[a-z]{2,}$` counts
  13, and the longest in `clauses/`, `^[A-Za-z0-9][A-Za-z0-9 ./-]{0,63}$`,
  counts 129.
- A pattern whose expanded size is past 4,096 (`MAX_PATTERN_EXPANSION`)
  does not parse, in either engine. Nested counts multiply, so a short
  pattern such as `(?:(?:(?:(?:a{64}){64}){64}){64})` stands for millions of
  states. Under the limit the guest compiles every portable pattern, with
  an explicit size limit of 8 MiB (`PATTERN_SIZE_LIMIT`), for `regex`
  1.13.1 with `regex-automata` 0.4.18. A portable class holds at most 49
  byte ranges of 8 bytes each, so the classes of a pattern at the limit
  cost at most some 1.6 MB; the widest class found needs 1,002,192 bytes in
  all, about 244 bytes a unit. It compiles with the Unicode tables off,
  which on a printable-ASCII value match as JavaScript's classes do, and
  compiles each pattern once, when the spec parses. Under the limit the
  SDK's automaton holds at most three instructions per unit of size, and
  the SDK builds it when the spec parses, so a pattern that cannot be built
  is a parse refusal in both engines. A value under a pattern the SDK
  cannot run, as in a spec built in code, is refused with the reason
  "cannot be run", never counted as matching. A spec whose pattern is
  outside the core does not parse, in either engine. A patterned field's
  value is printable ASCII; a value outside it does not validate.
- A pattern is untrusted, since anyone registers a spec, and neither engine
  runs it by backtracking. The guest's `regex` crate is an automaton engine.
  The SDK never runs a spec's pattern on JavaScript's `RegExp`, which takes
  exponential time on a pattern such as `(a+)+$` or `^(a|a)*$`: it compiles
  the pattern once, into a Thompson automaton over the portable core, and
  runs it as a state set, so a value is matched in time linear in its length
  (`portablePatternMatches`, `sdk/src/clauses/safeRegex.ts`). The SDK reads
  the classes as the guest reads them with its Unicode tables off.
- The work of matching a value is its length in UTF-16 units times its
  pattern's expanded size. A value whose work is past 4,194,304
  (`MAX_PATTERN_WORK`) is refused with the reason "string too long for
  pattern", without the pattern run, in both engines; it never counts as
  matching. Every other value is run against its pattern. A pattern of
  size 4,096 runs on up to 1,024 characters, the domain-name pattern on
  322,638, and `^0x[0-9a-fA-F]{40}$` (size 84) on 49,932. A value over the
  field's `maxLength` is refused with that reason alone, and its pattern is
  not run.
- One content's pattern work is bounded too. One call of `validateContent`
  or `validate_content` is one content: one clause entry's signed content
  at the sign gate, or one attestation's stage content in the guest and the
  relay. Both engines visit its values in one order: the spec's fields in
  the order it declares them, an array's items by index, depth first. They
  add the work of each value a pattern is run on; a value refused for its
  `maxLength` or its own budget adds nothing. When the next value would
  take the total past 16,777,216 (`MAX_CONTENT_PATTERN_WORK`), the content
  is refused once, at `$`, with the reason "content too long for its
  patterns", and no further pattern runs. The total admits 1,925 32-byte
  hashes (`^0x[0-9a-fA-F]{64}$`, size 132) or about 4,700 addresses. At the
  per-value edge the costliest pattern found, the widest classes, cost the
  guest 50 to 175 ms natively in a release build. At the content's edge the
  costliest content found cost the guest 0.2 to 0.53 seconds, and the SDK
  about 0.6 seconds (`docs/DESIGN_DECISIONS.md` #42).
  `sdk/tests/clauses/safeRegex.test.ts` compares the automaton with
  `RegExp` on every pattern in `clauses/`, and the shared vectors lock the
  verdicts, every limit included, to the guest's.
- A `string` value holds no lone UTF-16 surrogate (`"\ud800"` with no low
  half after it, or a low half alone). `JSON.parse` keeps one and
  `serde_json`, which reads content in the guest, refuses it; the SDK's
  `validateContent` refuses it too, so no party signs content the batch
  path cannot read. The spec's own JSON holds none either, in a string or
  in a key of any top-level attribute but `block`: those are the bytes a
  clause key hashes and a plaintext attestation's witness carries, and
  gate S refuses them when `serde_json` reads them. `parseClauseSpec`
  refuses such a spec, and names where the surrogate is
  (`sdk/tests/clauses/spec.test.ts`; `attest_spec_holding_a_lone_surrogate_fails`,
  `prover/lib/tests/parity.rs`).
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
`fields` alone, or is the empty anchor `{}` for a spec that declares
`emptyAnchor` (§ "Clause-spec format"), at the sign gate
(`validateCommitmentAgreement` in `sdk/src/projection.ts`) and in the guest's
gate for a re-asserted clause (`validate_attestation_content` in
`prover/lib/src/kernel.rs`), both through the one rule
(`validateSignedContent`, `validate_signed_content`). Content
attested at stage N, stage 0 included, is encoded and validated over
`stages[N]` where the spec declares it, else over `fields`, in both engines.
So a stage-0 attestation is not the signed content: it re-asserts that
content only when its `contentRef` is the leaf's data hash
(`hashClauseData`), and a reader compares the two
(`docs/DESIGN_DECISIONS.md` § 36).
A stage key has one spelling: the decimal of an integer from 0 to 255, digits
only, with no sign, no leading zero and no whitespace (`"0"`, `"1"`, `"255"`).
A spec with any other key does not parse in either engine, and the issue names
the key (`stageOfKey` and `stageKey` in `sdk/src/clauses/spec.ts`,
`parse_stage_key` in `prover/clause/src/spec.rs`). `ClauseRegistry` reads no
spec and registers such a clause anyway; the reference tooling never loads it.
The spec's stage list is the whole signal: an interface derives a witness capability
for any composed clause that declares stages, renders the form from the
declared fields, validates and encodes at the stage, and files through
`AttestationCoordinator`. The coordinator's calldata carries the content only
as fingerprints (`clauseDataHash` and `contentRef`), and its `Attestation` event
carries `contentRef`. A reader takes the content off the chain, from the party
that holds it or from where a public clause's content is published, checks
that its `keccak256` equals the event's `contentRef`, and decodes it against
the same spec. Who witnesses is never engine policy — either party may file,
and sufficiency is derived at read time against the committed terms. The
evidence window closes at resolution (`DESIGN_DECISIONS.md` §6).

Process-log ladders are the other runtime-evidence shape: their stage is the
ordinal of the event in the enum field `block.runtime.ladder` marks, and no
`stages` key is needed. A ladder signs the empty anchor
(`emptyAnchor`), and its first event is attested at stage 0 over its
top-level fields, as any later one is; the reference frontend groups such
clauses under the `attestations` article, which is presentation. One rule says which set an attestation's content is encoded over: at
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
presentation alone keeps the clause, and so its count of use. So the key alone
does not hold the `block` a reader receives: a gateway can serve another
`block` that still verifies against it. The reference frontend's fetcher
(`defaultClauseSpecFetcher`) accepts the fetched bytes only when they hash to
the CID in `contentURI` (`checkContentAddress` in
`frontend/lib/shared/contentAddress.ts`), so the `block` it reads is the one
the registrant pinned. Bytes that fail, or a `contentURI` whose CID form it
cannot recompute, leave the clause unread, its place empty
(`DESIGN_DECISIONS.md` § 40). Every reader parses a spec with `__proto__`,
`constructor` and `prototype` keys stripped, so `computeClauseKey` and
`clauseKeyPreimage` throw on a spec whose protocol half carries one, naming
it: its key would be one no reader anchors. The spec's
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
  `version`, `title`, `description`) a human reads, the content
  `fields`/`stages`, and `emptyAnchor`. The committed content is declared by
  `fields`; `stages[N]` are the evidence shapes attested while the process is
  open, and content attested at a stage the spec does not declare is read over
  `fields`. Each `stages` key is the decimal of the stage, from
  `"0"` to `"255"`, in one spelling (§ "Witness stages"). Every clause is a merkle leaf under the signed
  `checkoutHash`; the SDK validates the content against the spec off-chain, and
  the bonds secure what was signed. The chain registers clauses and binds
  attestations to the signed agreement; it reads no content shape.
- **`block` — the presentation**, organized into phase sections, each named
  for the phase whose actor it instructs: `design`, the designer composing
  agreements and assemblies (`article`, `scope`, `nestsUnder`, `fills`,
  `composes`); `checkout`, the seller binding and the buyer filling and
  signing (`catalogueFills`, `profileFills`, `catalogueMeasures`,
  `pricedLines`, `derives`, `timeWindow`, `endpoints`, `registerLink`,
  `dataSources`, `heldValues`, `compositionFields`); `runtime`, the
  parties while the process runs, after commit (`interaction`, `modality`,
  `jurisdiction`, `documentPart`, `ladder`, `contentDigest`). A later phase
  may read an earlier section; no phase reads a section named for a later
  one; an attribute read in two phases is declared in the section of its
  first reader. The order is held by
  `frontend/tests/lib/blockDesignPhaseReads.test.ts` over the frontend's design
  and checkout files, and by `sdk/tests/clauses/blockPhase.test.ts` over the
  SDK's hints, sign gate and checkout plan. `checkout.compositionFields` are
  the inputs a frontend may ask the buyer for at checkout, for the contract
  `design.composes` names (its opening parameters); they are not content
  fields and nothing commits them. This frontend performs no such call: its
  checkout collects none of them and places the order, with one line that
  says so (`CheckoutView.tsx`).
  Reporting while the process runs is witness stages (`spec.stages`), never
  `compositionFields`. The clause key leaves `block` out, and no fingerprint reads
  it. Eleven of its attributes (`design.article`, `design.scope`, `design.fills`,
  `checkout.catalogueFills`, `checkout.profileFills`,
  `checkout.catalogueMeasures`, `checkout.pricedLines`, `checkout.derives`,
  `checkout.timeWindow`, `checkout.endpoints`, `checkout.dataSources`;
  `parseProjectionHints` in `sdk/src/projection.ts`)
  are the reference tooling's rules for collecting and pricing the data a
  party signs.
  Another frontend may collect it differently; both parties sign one
  `checkoutHash` over one agreement, which either recomputes from the agreement
  alone. Nothing on-chain or in the SDK's content layer reads `block`;
  the reference parser is `ClauseBlockBinding`
  (`frontend/lib/shared/clauseBlockBinding.ts`) — derive the attribute list from
  that type. **One verb — `fills` — says who fills which content fields**
  (designer / catalog / profile); the buyer owns every field named in no fills
  list, no `catalogueMeasures` entry, no `derives` entry and no `pricedLines`
  mark, derived as the complement, never stored. **A field's name carries no
  meaning to any code**: a role a field plays (the order's priced lines, a
  derived value, a time window, a route's endpoints, a link to an outside
  register, the processes whose data a clause grants, the modality, the
  jurisdiction, the runtime ladder, the delivery evidence, the
  denomination pin) is read from what the spec declares, never from the
  name or the shape of its fields, so a stranger's clause naming its fields
  otherwise plays the same role (`docs/OPEN_WORLD.md` § 1).
  `frontend/tests/lib/noFieldNameReads.test.ts` fails where a frontend or SDK
  module names a field a reference spec declares.
- **`block.checkout.pricedLines` marks the order's priced lines.** It names the
  top-level array field that holds the lines and the field of each line item
  that plays each role: `{ "field": "lineItems", "item": "itemId", "name":
  "name", "quantity": "quantity", "unitPrice": "unitPrice" }`. `quantity` (an
  `integer` field) and `unitPrice` (a `bigint` field, in the token's smallest
  unit) are required; `item` (the catalog item's id) and `name` (both `string`
  fields) are optional, and a line carries only the roles the mark names. A
  mark the spec's own fields contradict marks nothing (`specPricedLines`). The
  mark is the one way any reader finds the lines: the checkout writes them in
  the shape the mark names into the first composed clause that carries one
  (`fillPricedLines`), the quote request prices each line's unit price
  (`derivePricedFields`; `buildQuoteRequest` refuses a request that leaves one
  out), the review reads them and shows their sum (`readPricedLines`,
  `pricedLinesSum`, `frontend/components/runtime/AgreementReview.tsx`), and the
  checkout form offers the buyer no input for the marked field. The sum of the
  lines and the commitment's payment are two figures: no check holds them
  equal, the payment is what moves, and the review shows the sum beside the
  payment and says so. A field named `lineItems` with no mark is content like
  any other. `figaro-commerce` carries the mark above.
- **`block.checkout.derives` declares a field the checkout computes.** It maps
  a content field to a rule, by its name in an open registry
  (`registerCheckoutDerivation` in `sdk/src/checkoutPlan.ts`, the same open
  axis as the rate-quantity sources), and to the rule's inputs, by the rule's
  own input names: each input is a field of the same clause (`{ "field":
  "divisor" }`, read after the catalog and profile folds) or a catalog measure
  (`{ "from": "massGrams", "combine": "sum" }`, combined as
  `catalogueMeasures` combines). A rule the registry does not hold, or inputs
  it cannot derive from, leave the field as it was (`fillCheckoutDerivations`).
  The reference rule is `dimensional-weight`, with inputs `mass`, `length`,
  `width`, `height` and `divisor`: billed weight is the greater of the gross
  mass and the packaged volume ÷ divisor, each dimension rounded up to the
  next whole centimeter first. `figaro-dimweight` declares
  `{ "billedMassGrams": { "rule": "dimensional-weight", "inputs": { "mass":
  { "from": "massGrams", "combine": "sum" }, "length": { "from": "lengthMm",
  "combine": "single-unit" }, "width": { "from": "widthMm", "combine":
  "single-unit" }, "height": { "from": "heightMm", "combine": "single-unit" },
  "divisor": { "field": "divisor" } } } }`. The checkout computes the billed
  weight from the order's catalog items, the same catalog fields
  `figaro-cargo` measures, and from the divisor the seller's profile fills.
- **`block.checkout.timeWindow` and `block.checkout.endpoints` mark the fields
  a rate quantity is read from.** `timeWindow` names the content field that
  holds a window's start and the one that holds its end: `{ "start":
  "windowStart", "end": "windowEnd" }` in `figaro-schedule`. `endpoints` names
  the field that holds a route's origin and the one that holds its
  destination: `{ "from": "origin", "to": "destination" }` in
  `figaro-geolocation`. A rate-priced catalog item names its quantity source
  (`rateQuantitySource`, an open registry, `registerRateQuantitySource` in
  `sdk/src/checkoutPlan.ts`). The `booking-window` source bills the hours of
  the marked window, and `order-geodistance` the distance between the marked
  endpoints. Each source reads only the mark, never the format, the order or
  the count of a clause's fields. A clause with two date-time fields and no
  mark, such as an issue date and an expiry, is never billed as a window. A
  mark the spec's own fields contradict marks nothing. It is contradicted by
  a field not declared, by one field named twice, by a window field not of
  format `iso-datetime`, and by an endpoint whose `formatFromField` sibling is
  undeclared or not committed as `geohash`. A source prices only when exactly one composed clause carries a
  mark it can read; otherwise the item stays unpriced
  (`unresolvable-quantity`). The marks steer the reference tooling's pricing
  only: the payment the parties sign is the commitment's, and another
  frontend may price differently. The audit's bill of lading shows the
  route's two ends through the same `endpoints` mark (`specEndpoints`).
- **`block.checkout.registerLink` marks a link to an outside register.** It
  names the content field that holds the register's address, a `string` field
  of format `uri-template` with an `{id}` placeholder, and the `string` field
  that holds the identifier: `{ "uri": "credentialRegisterUri", "id":
  "credentialId" }` in `figaro-credential`. The checkout and the audit offer a
  Verify link to the register's own entry through it
  (`frontend/components/runtime/CredentialVerifyButton.tsx`,
  `clauseRegisterLink`). The register stays the source of truth: nothing is
  fetched or stored.
- **`block.checkout.dataSources` marks the processes whose data a clause
  grants access to.** It names the content field that holds them, an array
  whose items are `string` fields of format `bytes32-hex`, each a
  `processId`: `"sourceProcesses"` in `figaro-data-license`. The buyer of a
  data sale reads each named process's resolution before it signs, and a
  reader proves each disclosed leaf against those processes' `checkoutHash`
  (`specDataSources`, `readDataSources` in `sdk/src/projection.ts`; the
  data-sale recipe in `sdk/README.md`). A field named `sourceProcesses` with
  no mark names no data source.
- **`block.runtime` marks what the parties and a forum read after commit.**
  Each mark names fields by the spec's own names, and each reader holds it to
  the spec's own fields (`frontend/lib/shared/clauseSpecSource.ts`):
  - `modality` names the field that holds how the order is fulfilled, a
    `string` or `enum` field: `"modality"` in `figaro-modalities`. The order
    page and the audit's contract document show its committed value
    (`committedModality`).
  - `jurisdiction` names the field of the governing law, and, when the clause
    carries them, the fields of the forum and of the language, each a `string`
    or `enum` field: `{ "law": "applicableLaw", "forum": "forum", "language":
    "language" }` in `figaro-applicable-law`. The audit's contract document
    summarizes it (`committedJurisdiction`).
  - `documentPart` names the section of a trade document the clause fills,
    in the words of the document layouts (`cargo`, `freight-class`,
    `delivery-terms`, `carriage`; `frontend/lib/data/audit/documentLayouts.ts`).
    It names no field. The bill of lading applies to an order that follows
    another, carries a marked route and a clause of the `carriage` section.
    `figaro-cargo`, `figaro-freight-class`, `figaro-incoterms` and
    `figaro-handoff` declare one each.
  - `ladder` names the `enum` field whose ordered values are the clause's
    runtime ladder: the value at index k is the event a party attests at
    stage k. `"eventType"` in `figaro-merchant-process` and
    `figaro-courier-process`. The capability rail offers and labels each
    party's next event through it (`clauseLadderField`,
    `frontend/lib/semantic/deriveProcessModelFromRuntime.ts`). An enum field
    with no mark is content, never a ladder.
  - `contentDigest` names the stage and the field where a party attests the
    keccak256 of the content it delivered over the per-order channel: `{
    "stage": 1, "field": "contentHash" }` in `figaro-content-handoff`. The
    `ecdh-content` ceremony writes and checks the digest there
    (`contentDigestOf`, `frontend/lib/data/handoff/contentDelivery.ts`).

  A mark the spec's own fields contradict marks nothing: a field not
  declared, one field named twice, or a field of the wrong type. A clause
  with no mark plays no role, whatever its fields are called.
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
- **`block.checkout.heldValues` offers only the enum values the chain
  holds.** It maps an `enum` content field to a reader standard (`reader`),
  to the contracts that reader reads on each chain (`contracts`, keyed by the
  decimal chain id, each address under the reader's own role name), and to
  what the reader looks for on the chain for each value (`values`, a list of
  strings in the reader's own terms). The checkout reads, for the chain in
  use, which values the chain holds, and offers only those
  (`useHeldValues`, `frontend/lib/composability/heldValues.ts`). The readers
  are an open registry keyed by the standard's name
  (`registerHeldValuesReader`), never by a clause, so a stranger's clause
  that names a registered standard with its own contracts and values is
  filtered the same way. On a chain the hint gives no contracts for, every
  value is offered; under a reader the frontend does not know, a read that
  fails or one that resolves empty, no value is, and a read in flight offers
  none. The attribute is a presentation hint, read only by a frontend that
  knows its reader's standard: it changes nothing the parties sign, the sign
  gate does not read it, and another frontend may ignore it. Its addresses
  are part of the spec's registered bytes, so a chain added later needs a
  new spec version. The reference reader, `kleros-liquid-policy-courts`,
  reads a KlerosLiquid arbitrator's court list (`courts(uint256)`, from 0 up
  to the first revert) and each court's name in the policy document its
  PolicyRegistry links (`policies(uint256)`); a value lists its court's
  policy names from the root down, the root court named alone, and is held
  when exactly one court of the chain carries that list.
  `figaro-arbitration-kleros` declares it on `klerosCourt`, with the
  arbitrator and PolicyRegistry of Ethereum mainnet and Ethereum Sepolia
  from `test/fixtures/kleros-courts.json`; on Sepolia it offers `general`
  only.

**`emptyAnchor` declares that the parties sign the empty anchor.** A clause
whose content is all attested while the process is open, such as a
process-log ladder (`figaro-merchant-process`, `figaro-courier-process`),
declares `"emptyAnchor": true` at the top level. The parties then sign `{}`
for it, and its `fields` and `stages` are the shapes of what is attested. One
rule decides what a party may sign for a clause, in both engines
(`validateSignedContent` in `sdk/src/clauses/validate.ts`,
`validate_signed_content` in `prover/clause/src/validate.rs`):

1. A spec that declares `emptyAnchor` signs `{}` and nothing else. The sign
   gate refuses any other content for it, and the guest's gate refuses a
   re-asserted clause whose committed content is any other.
2. Every other spec's signed content is validated over its `fields`, `{}`
   included: `{}` passes only when no field is required.

The parsers accept the attribute only as `true`, and refuse a spec that
declares it beside a `default` on a top-level field, since a default fills the
signed content and this one has none (`parseClauseSpec`,
`parse_clause_spec`). A default on a stage field is allowed. The rule reads
the top level only, never the article or anything else in `block`, so a
stranger's clause under any article signs the empty anchor by declaring it,
and a clause under the `attestations` article that does not declare it signs
its content. The reference tooling fills no default and draws no blinding
value into an empty anchor (`withSpecDefaults`, `withClauseBlinding`), and
its checkout offers the buyer no input for such a clause. The attribute is
part of the clause key, so declaring it is a new clause. The shared vectors
hold both engines to the rule (`signed` in
`test/fixtures/clause-engine-vectors.json`).

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
   `block.checkout.catalogueFills`, `block.checkout.profileFills`,
   `block.checkout.catalogueMeasures` or `block.checkout.derives` (a
   designer's, catalog's or profile's value, or one computed from them, is
   public and the same in every order), a zero blinding value, and
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
  shape. The reference frontend presents such a clause as a lifecycle; what
  the parties sign for it is read from `emptyAnchor`, never from the article.
- **`consent`** — documents a party accepts by signing: the agreement review
  shown before signing lists each value of a clause of this article under a
  consent notice, a fetchable document linked
  (`frontend/components/runtime/AgreementReview.tsx`).
- **`coordination`** — committed statements of which scenario everyone runs
  and what an order covers: the modality, the time window, the localities, the
  line items (`figaro-commerce`). Committed content, not a runtime lifecycle;
  a coordination clause never surfaces an attestation capability.
- **`denomination`** — an assembly-scoped clause of this article whose
  designer-filled fields include exactly one `address-hex` string field pins
  the composition's token in that field (`specDenominationPinField`,
  `sdk/src/projection.ts`). The seeding fills an unfilled pin with the
  deployment's token (`fillDeployTimeCurrency`). The sign gate
  (`validateCommitmentAgreement`) refuses a commitment whose token differs
  from the pinned one. A party is then never asked to sign in a token the
  designer did not choose. This check is the reference tooling's own, and the
  `block` steers it. The `block` is outside the clause key, so whoever serves
  it decides whether the check runs. A caller whose spec source passes no
  hints, or serves the clause under another article, gets no pin and no
  token check. The reference frontend reads a spec only when its bytes hash
  to the registered address (`docs/DESIGN_DECISIONS.md` § 40), so it runs the
  check the registrant's `block` declares. The chain is unaffected:
  `FigaroCore` holds every order of a process to the token its opening order
  signed (`TokenMismatch`, `src/core/kernel/FigaroCore.sol`).
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
- A value that names a thing an outside contract numbers per chain names it
  by the outside party's own name for it, never by one chain's number, so the
  spec reads the same on every chain. The number is read on the chain where
  it is used, when it is used. `figaro-arbitration-kleros` names each Kleros
  court by the name its policy carries in Kleros's PolicyRegistry: Kleros
  numbers its courts per deployment, and the "Non-Technical" court is number 2
  on Ethereum mainnet while number 2 on Ethereum Sepolia is another court. The
  tooling that raises a dispute reads the arbitrator's court list and its
  PolicyRegistry on that chain, finds the court of that name, and puts its
  number into the arbitrator's extraData. A chain with no court of that name
  has no court for the value; no other court stands in for it, and KlerosLiquid
  would otherwise read a number past its list as the General Court. An enum's
  position is only its encoding in the agreement (`sdk/src/clauses/encode.ts`).
  `sdk/tests/clauses/klerosCourts.test.ts` holds the clause against Kleros's
  court list on each target chain (`test/fixtures/kleros-courts.json`).

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

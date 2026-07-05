# Clause Validation Architecture

Figaro validates clause content in ONE place: an off-chain TypeScript layer
(`@figaro/core/clauses`, "Layer A") that parses the canonical JSON spec and
checks content against it. There is **no on-chain content validation** — the
chain merkle-binds each attestation to its signed agreement and content-hashes
the evidence (`AttestationCoordinator`), but validates no content shape.
Well-formedness is the SDK's job (honest authors) plus a read-time concern
(downstream forums reject garbage). A never-seen clause is attestable with
**zero per-clause on-chain code** — open-world by construction. (The on-chain
per-clause validators, the Rust/SP1 prover mirror, and the batch verifier were
deleted in the proof-apparatus teardown; what remains is Layer A + on-chain
registration.)

CLAUDE.md keeps the lockstep principle (spec ↔ SDK ↔ on-chain registration);
this file owns the full clause table, the architectural detail, and the
adding-a-clause checklist below.

## Layer A — the off-chain validation layer (TypeScript)

`@figaro/core/clauses` subpath:
- `parseClauseSpec(json)` — meta-clause validator (closed subset of JSON Schema:
  `string`, `integer`, `bigint` (decimal string), `boolean`, `enum`, `array`,
  `object`). A string field's `format` is an **open axis**: any non-empty string
  is a valid declaration; the validator enforces the formats it knows
  (`bytes32-hex`/`address-hex`/`bytes-hex`/`iso-datetime`) and treats the rest
  as plain strings; a frontend may map known formats to richer inputs (e.g.
  `geohash` → the device-location picker via `fieldFormatInputs`).
- `validateContent(content, spec, { stage? })` — validates a JS object against
  a parsed spec. Closed clauses: rejects unknown fields. Per-stage overrides
  via `spec.stages[stage]`.
- A single **generic `encodeContentFromSpec`** (`sdk/src/clauses/encode.ts`) — the one
  spec-driven content encoder, reading the field-to-position mapping FROM the parsed spec
  for ANY clause. The former per-clause encoders (`encodeCommerceContent`, `encodeGeoContent`,
  … one per clause) were **DELETED** — encoding is generic, not per-clause. Topology has no
  encoder — it is agreement-only, with no runtime attestation.

Frontend wiring: `clauseSpecSource.ts` loads each spec live from `ClauseRegistry`
→ IPFS (no bundled copy); form gates and previews validate against the parsed spec.

## On-chain anchoring — registration + merkle binding (no content validation)

Two on-chain touch points remain:

- **`ClauseRegistry.registerClause(clauseId, version, contentHash, contentURI)`**
  — permissionless, first-write-wins, immutable. `clauseId` is the **bare
  human-readable name** (a string, e.g. `figaro-ghg`) and `version` is a separate
  `uint64`; the on-chain identity/dedup key is `keccak256(abi.encode(clauseId, version))`,
  so the same name at a new version is a distinct registration (version is the
  evolution axis). It anchors the clauseId, the spec's IPFS locator, and the spec's
  content hash (identity + integrity only — no group field; grouping is `block.article`
  in the spec JSON). No validator is registered or bound; a registered clause is
  immediately attestable.
- **`AttestationCoordinator`** merkle-binds each attestation: it verifies an OZ-style
  inclusion proof of `leaf = keccak256(clauseId ++ keccak256(sectionData))` against the
  signed `agreementHash`, content-hashes the evidence (`contentRef = keccak256(content)`),
  and emits `Attestation`. It validates **no content shape** — an attestation whose clause
  was not committed at signing cannot land (the proof won't open), but any committed clause
  attests with zero per-clause on-chain code.

## Clause-spec format

Lives off-chain as JSON at the `contentURI` emitted by `ClauseRegistry`
(content integrity is the event's `contentHash`). The canonical Layer-A specs
live at repo-root `clauses/` (the `ClauseRegistry` seed data); nothing bundles a
copy — every consumer loads each spec from `ClauseRegistry` → IPFS at runtime.

## The 16 protocol clauses

15 runtime-attestable clauses (content validated off-chain by Layer A; no
on-chain validator) plus 1 agreement-only clause (`figaro-topology`).

| clauseId | What it carries | Attestation surface |
|---|---|---|
| `figaro-topology` | DAG lineage (parent order hashes) | **Agreement-only** (no runtime attestation) |
| `figaro-commerce` | Currency, payment, line items | Layer A (off-chain) |
| `figaro-geolocation` | Origin / destination geohash — where an order originates/terminates (any modality, incl. virtual). Default-on | Layer A (off-chain) |
| `figaro-cargo` | Physical shipment measure — mass + volume of the goods. Elective; hazmat / cold-chain / freight-class are co-equal sibling logistics clauses (no spec-level nesting) | Layer A (off-chain) |
| `figaro-hazmat` | Dangerous-goods declaration anchored to the UN Recommendations (ADR / IMDG / IATA-DGR) — UN number, proper shipping name, hazard class, packing group. Elective; a co-equal logistics clause | Layer A (off-chain) |
| `figaro-cold-chain` | Temperature-controlled handling anchored to GDP cold-chain classes — class + min/max °C window. Elective; a co-equal logistics clause | Layer A (off-chain) |
| `figaro-freight-class` | Declared freight classification anchored to the NMFC (NMFTA) — the NMFC class (50–500) + optional item number. Elective; a co-equal logistics clause | Layer A (off-chain) |
| `figaro-modalities` | The buyer's request — consume-onsite / pickup / delivery / virtual (single-select) | Layer A (off-chain) |
| `figaro-handoff` | Hand-off point — where the physical exchange happens (proximity-policy nests under it) | Layer A (off-chain) |
| `figaro-ghg` | GHG accounting methodology (free-form `standard` string, committed at signing) | Layer A (off-chain) |
| `figaro-proximity-policy` | Required detection bands committed at agreement signing | Layer A (off-chain) |
| `figaro-merchant-process` | Merchant per-role event enum (sovereign log) | Layer A (off-chain) |
| `figaro-courier-process` | Courier per-role event enum (sovereign log) | Layer A (off-chain) |
| `figaro-arbitration-kleros` | Decentralized off-chain arbitration via Kleros (subcourt + minimum jurors). Provider-specific; sister `figaro-arbitration-<provider>` clauses would cover future ODR providers | Layer A (off-chain) |
| `figaro-applicable-law` | State / ADR / traditional-jurisdiction recourse layer (applicable law + forum + language). Provider-agnostic. Composes with arbitration clauses | Layer A (off-chain) |
| `figaro-consent` | Cryptographic acceptance of an off-chain document (hash + version + title) — supports beta consent, ToS acceptance, governance vote receipts, etc. (`consent` article) | Layer A (off-chain) |

`figaro-ghg` is a single disclosure clause whose accounting methodology is
a **free-form `standard` string** — any methodology, existing or future ("GHG
Protocol Corporate Standard", "ISO 14064", "PAS 2050", "EN 16258", or a custom
one); the protocol takes no closed list. Content shape is `(string standard)`
— no scope is stored: scope 1/2/3 is relative to a reporting entity's boundary,
and a reader derives it from its own position in the process topology. Measured
emissions (grams CO2e) are carried as a **runtime
attestation** on this clause, not a separate registered clause — a runtime
witness is an attestation on the committed clause, so there is no
`figaro-ghg-measurement` companion clause (the WHY is in "Composition and
decomposition" below).

`figaro-proximity-policy` commits, at agreement signing, the set of
proximity-detection bands a hand-off will accept. The runtime
proof that a hand-off actually occurred within an accepted band is carried as a
**runtime attestation**, not a separate registered clause — an earlier
`figaro-proximity-proof` clause modelled that witness as its own clause and was
retired for the same reason.

`figaro-topology` is the one **agreement-only** clause — committed at
agreement-signing time, never re-asserted as a runtime attestation. It is
*not* off-chain-only, though. Like every agreement section, an agreement-only
section is a merkle leaf under the on-chain `agreementHash`,
inclusion-provable via OpenZeppelin `MerkleProof` (`computeSectionLeaf` /
`buildSectionInclusionProof` in `sdk/src/agreement.ts` (@figaro/core)). "No
runtime attestation" is not "no on-chain verification": the DAG is
reconstructed off-chain by indexers reading topology sections from the signed
agreement.

## When something deserves a clause — payload vs anchor

A clause is an *anchored artifact family*: an off-chain definition whose
meaning must stay stable across parties, tools, and time, anchored on-chain by
a minimal reference point — `clauseId` + `contentHash` + `contentURI` in
`ClauseRegistry` (identity + integrity only). Not every value
that flows through an order deserves one. The RPGF substrate-broadening
formula, when rebuilt, derives a clause's group key as
`keccak256(block.article)` from the contentHash-verified spec
(derive, don't store). (The on-chain RPGF distribution mechanism was removed in
the proof-apparatus teardown; the group-weighting rationale survives in
`docs/v5/PUBLIC_GRAPH_MODEL.md`.)

Separate two kinds of data:

- **Per-instance payloads** — operational values attached to one order: a
  specific delivery details, a sealed address, notes for a single fulfilment
  event. Often private, instance-specific, decoded by one app's client. These
  stay as order payload bytes; they do NOT get a clause.
- **Shared reference semantics** — definitions whose meaning must hold across
  counterparties and over time: a disclosure standard, a methodology
  reference, a content *format*. These are what a clause anchors.

**The decision rule.** Before proposing a clause, ask: *does the protocol need
this fact to preserve shared reference integrity across counterparties and over
time?* If yes, it is an anchored artifact family — give it a clause. If no, it
is a per-instance payload — keep it off-chain, referenced immutably, and do not
register it.

**Bounded generality.** A clause should be generic enough to be reused across
the parties and tools that need it, and no more. Avoid both failure modes: an
app-specific one-off that can never become a shared protocol concept, and a
fake universal ontology that registers every document as a first-class object.
The clause layer stays grounded in concrete coordination problems — process
obligations, disclosures, verifiable reference integrity — not in possibility.

Clauses are one artifact family among several (sellers, assemblies); each
family carries its own anchor and never nests inside another — see CLAUDE.md
"Separation of Concerns — Artifact Families". Clause identity is append-only:
new meaning is a new `clauseId`, never a mutation of an old one.

## Composition and decomposition — when to merge or split clauses

Two failure modes appear at the boundary between clauses. Each has a
canonical fix.

**Merge when two clauses duplicate one concept.** If two clauses occupy the
same conceptual space and the only difference is which single enum field they
expose, they are not independent — they are a degenerate parameterisation of
one concept. Replace with one clause whose orthogonal fields make the
parameterisation explicit — but only when the fields are genuinely facets of
one decision. If what looked like one concept turns out to carry independent
decisions (a modality *request* is not the same decision as a physical
*hand-off point*), keep them as separate clauses; a merge you have to undo is
worse than two honest clauses.

**Committed content vs a runtime witness is a LIFECYCLE difference, not two
cryptographic categories.** Every clause section — a committed policy or a
runtime witness — is a merkle leaf under the same `agreementHash`; that keccak
binding is the one cross-check, uniform across all of them (there is no
"cross-checked" tier vs a "runtime" tier — they are the same merkle-bound
object). What differs is *when* the content is supplied: a clause commits its
policy at agreement signing (fixed for the order's life), and any runtime proof
of that policy is filed during execution as a **runtime attestation on that same
clause** — not a separate proof clause. The earlier `figaro-proximity-proof` /
`figaro-ghg-measurement` sister-proof clauses were **retired** for exactly this
reason (the runtime witness is an attestation, not a registered clause — see
above). So do not split a clause to separate its committed band from its runtime
proof; carry the proof as an attestation on the committed clause.

**The diagnostic.** Before adding a clause, ask: (a) does an existing clause
already cover this concept with a different enum value? If yes, extend the
existing clause's fields, do not add a new one. (b) Does the concept need a
runtime proof of a committed policy? Carry the proof as a runtime attestation on
the clause — do not add a separate proof clause. Both checks are cheap to do at
design time and expensive to undo once `clauseId` is bound on chain.

## Adding a new clause — checklist

There is **no on-chain validator and no Rust/prover mirror** — both were deleted in
the proof-apparatus teardown. A new clause is a spec + off-chain encoder + registration.

1. JSON spec in `clauses/<clause>.json` (the canonical Layer-A spec / `ClauseRegistry` seed data — nothing bundles a copy).
2. `populate-clauses.mjs` pins it to IPFS + anchors `(clauseId, version, contentHash, contentURI)` on `ClauseRegistry`; the frontend loads it chain→IPFS via `clauseSpecSource` (no frontend copy, no preload).
3. **No per-clause encoder is needed** — `sdk/src/clauses/encode.ts` (`encodeContentFromSpec`) is the single generic, spec-driven encoder for ANY clause. A new clause adds a spec, not a code path.
4. SDK conformance/examples test reads the new spec from `clauses/` as a fixture (e.g. `sdk/tests/clauses/examples.test.ts`); the off-chain validator (`validateContent`) is generic and needs no per-clause case.
5. Registration via `frontend/scripts/populate-clauses.mjs` (NOT the Solidity deploy — `Deploy.s.sol`/`DeployMainnet.s.sol` deploy the registry but register no clauses): `registerClause(clauseId, version, contentHash, contentURI)`. No `setValidator` step exists — registration alone makes the clause attestable. No frontend registration step either: the drawer, `/clauses` inventory, and every surface read the clause set live from `ClauseRegistry` events and the spec from IPFS (`clauseSpecSource`); titles, articles, and tiers come from the spec.

**When to add a seller-process clause vs not** (kernel-participant vs off-chain-seller principle): an off-chain seller needs its own process clause if and only if its state transitions are off-chain. Off-chain sellers (merchants, couriers, locker sellers, etc.) need a process clause because their state transitions happen in physical reality and need a sovereign event log to be tamper-proof evidence. Kernel participants — most importantly the **buyer**, who acts via `commit` and `resolveProcess` — do NOT need a process clause; their evidence IS the kernel event log itself. `merchant-process` and `courier-process` are sovereign-log primitives in this sense. Don't add a `figaro-buyer-process` clause — it would duplicate kernel events.

If the spec and the on-chain registration drift (a spec field the registered `contentHash` doesn't match, or a registered clauseId with no pinned spec) the clause won't surface — keep them in lockstep.

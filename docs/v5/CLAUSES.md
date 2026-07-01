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
  `string` with format `bytes32-hex`/`address-hex`/`bytes-hex`/`iso-datetime`,
  `integer`, `bigint` (decimal string), `boolean`, `enum`, `array`, `object`).
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

There is **no on-chain content validation**. Two on-chain touch points remain:

- **`ClauseRegistry.registerClause(clauseId, version, contentHash, metadataURI)`**
  — permissionless, first-write-wins, immutable. It anchors the clauseId, the spec's
  IPFS locator, and the spec's content hash (identity + integrity only — no group
  field; grouping is `block.article` in the spec JSON). No validator is registered or bound; a
  registered clause is immediately attestable.
- **`AttestationCoordinator`** merkle-binds each attestation: it verifies an OZ-style
  inclusion proof of `leaf = keccak256(clauseId ++ keccak256(sectionData))` against the
  signed `agreementHash`, content-hashes the evidence (`contentRef = keccak256(content)`),
  and emits `Attestation`. It validates **no content shape** — an attestation whose clause
  was not committed at signing cannot land (the proof won't open), but any committed clause
  attests with zero per-clause on-chain code.

## Clause-spec format

Lives off-chain as JSON at the `metadataURI` emitted by `ClauseRegistry`
(content integrity is the event's `contentHash`). The canonical Layer-A specs
live at repo-root `clauses/` (the `ClauseRegistry` seed data); nothing bundles a
copy — every consumer loads each spec from `ClauseRegistry` → IPFS at runtime.

## The 18 protocol clauses

16 runtime-attestable clauses (content validated off-chain by Layer A; no
on-chain validator) plus 2 agreement-only clauses (`figaro-topology-v1`,
`figaro-descending-auction-v1`).

| clauseId | What it carries | Attestation surface |
|---|---|---|
| `figaro-topology-v1` | DAG lineage (parent order hashes) | **Agreement-only** (no runtime attestation) |
| `figaro-commerce-v1` | Currency, payment, line items | Layer A (off-chain) |
| `figaro-geolocation-v1` | Origin / destination geohash — where an order originates/terminates (any modality, incl. virtual). Default-on | Layer A (off-chain) |
| `figaro-cargo-v1` | Physical shipment measure — mass + volume of the goods. Elective (hazmat / cold-chain / freight-class nest under it) | Layer A (off-chain) |
| `figaro-hazmat-v1` | Dangerous-goods declaration anchored to the UN Recommendations (ADR / IMDG / IATA-DGR) — UN number, proper shipping name, hazard class, packing group. Elective; a co-equal logistics clause | Layer A (off-chain) |
| `figaro-cold-chain-v1` | Temperature-controlled handling anchored to GDP cold-chain classes — class + min/max °C window. Elective; a co-equal logistics clause | Layer A (off-chain) |
| `figaro-freight-class-v1` | Declared freight classification anchored to the NMFC (NMFTA) — the NMFC class (50–500) + optional item number. Elective; a co-equal logistics clause | Layer A (off-chain) |
| `figaro-modalities-v1` | The buyer's request — consume-onsite / pickup / delivery / virtual (single-select) | Layer A (off-chain) |
| `figaro-handoff-v1` | Hand-off point — where the physical exchange happens (proximity-policy nests under it) | Layer A (off-chain) |
| `figaro-ghg-v1` | GHG accounting methodology (free-form `standard` string) + scope (cross-checked) | Layer A (off-chain) |
| `figaro-proximity-policy-v1` | Required detection bands committed at agreement signing (cross-checked) | Layer A (off-chain) |
| `figaro-offset-policy-v1` | Carbon-offset provider set committed at agreement signing (cross-checked) | Layer A (off-chain) |
| `figaro-merchant-process-v1` | Merchant per-role event enum (sovereign log) | Layer A (off-chain) |
| `figaro-courier-process-v1` | Courier per-role event enum (sovereign log) | Layer A (off-chain) |
| `figaro-descending-auction-v1` | Composition marker — this order's counterparty is auction-selected (composes the `descending-auction` interface; `startPrice` is a `block.fields` runtime input supplied at checkout) | **Agreement-only** (no runtime attestation; the auction runs on the composed `DutchAuction` contract) |
| `figaro-arbitration-kleros-v1` | Decentralized off-chain arbitration via Kleros (subcourt + minimum jurors). Provider-specific; sister `figaro-arbitration-<provider>-v1` clauses would cover future ODR providers | Layer A (off-chain) |
| `figaro-applicable-law-v1` | State / ADR / traditional-jurisdiction recourse layer (applicable law + forum + language). Provider-agnostic. Composes with arbitration clauses | Layer A (off-chain) |
| `figaro-consent-v1` | Cryptographic acceptance of an off-chain document (hash + version + title) — supports beta consent, ToS acceptance, governance vote receipts, etc. (`consent` article) | Layer A (off-chain) |

`figaro-ghg-v1` is a single disclosure clause whose accounting methodology is
a **free-form `standard` string** — any methodology, existing or future ("GHG
Protocol Corporate Standard", "ISO 14064", "PAS 2050", "EN 16258", or a custom
one); the protocol takes no closed list. Content shape is `(string standard,
uint256 scope)`. Measured emissions (grams CO2e) are carried as a **runtime
attestation** on this clause, not a separate registered clause — the runtime
`figaro-ghg-measurement` companion was removed when runtime attestation was
deferred.

`figaro-proximity-policy-v1` commits, at agreement signing, the set of
proximity-detection bands a hand-off will accept (cross-checked). The runtime
proof that a hand-off actually occurred within an accepted band is carried as a
**runtime attestation**, not a separate registered clause — an earlier
`figaro-proximity-proof` clause modelled that witness as its own clause and was
deleted as the wrong treatment when runtime attestation was deferred.

`figaro-topology-v1` and `figaro-descending-auction-v1` are the two
**agreement-only** clauses — committed at agreement-signing time, never
re-asserted as a runtime attestation. They are *not* off-chain-only, though.
Like every agreement section, an agreement-only section is a merkle leaf under
the on-chain `agreementHash`, inclusion-provable via OpenZeppelin `MerkleProof`
(`computeSectionLeaf` / `buildSectionInclusionProof` in
`frontend/lib/core/agreement.ts`). "No runtime attestation" is not "no on-chain
verification". `figaro-topology-v1`'s DAG is reconstructed off-chain by indexers
reading topology sections from the signed agreement; `figaro-descending-auction-v1`
is a composition marker whose auction executes on the composed `DutchAuction`
contract (its state read from that contract's own events), not via
`AttestationCoordinator`.

## When something deserves a clause — payload vs anchor

A clause is an *anchored artifact family*: an off-chain definition whose
meaning must stay stable across parties, tools, and time, anchored on-chain by
a minimal reference point — `clauseId` + `contentHash` + `metadataURI` in
`ClauseRegistry` (identity + integrity only; no group field). Not every value
that flows through an order deserves one. A clause's group is `block.article`
in its spec JSON; the RPGF substrate-broadening formula, when rebuilt, derives
its group key as `keccak256(block.article)` from the contentHash-verified spec
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
canonical fix and a precedent in the repo's history.

**Merge when two clauses duplicate one concept.** If two clauses occupy the
same conceptual space and the only difference is which single enum field they
expose, they are not independent — they are a degenerate parameterisation of
one concept. Replace with one clause whose orthogonal fields make the
parameterisation explicit. Precedent: `figaro-handoff-v1` was merged into
`figaro-fulfilment-v2` (commit `d4eda40`, 2026-05-11). Both clauses described
"how the order moves between parties"; both used a single enum to express
modality. The merge produced a single clause with three orthogonal fields
(`modalities`, `coordinations`, `handoffPoints`) — each a multi-valued enum
where the cross-product is the actual decision space. Same conceptual
coverage, one clause, no duplicate validation surface.

**Split when one clause conflates two cryptographic concerns.** A clause is
either cross-checked (committed at agreement signing, fixed for the order's life)
or runtime (attested at runtime, supplied by a per-event witness). One
clause cannot be both. If a single clause tries to carry both the
agreement-time policy AND the runtime proof, split it into a sister-clause
pair. Precedent: `figaro-proximity-v1` was split into `figaro-proximity-policy-v1`
(cross-checked, committed band) + `figaro-proximity-proof-v1` (runtime,
runtime witness) in commit `cc7a394` (2026-04-26), mirroring the existing
GHG-disclosure / GHG-measurement sister-clause pattern. The split aligns each
clause with one cryptographic category, lets each evolve independently, and
preserves the binding via the policy clause's reference to its proof.

**The diagnostic.** Before adding a clause, ask: (a) does an existing clause
already cover this concept with a different enum value? If yes, extend the
existing clause's fields, do not add a new one. (b) Does the proposed clause
mix committed and runtime content? If yes, split into the sister-clause pair
before registering. Both checks are cheap to do at design time and expensive
to undo once `clauseId` is bound on chain.

## Adding a new clause — checklist

There is **no on-chain validator and no Rust/prover mirror** — both were deleted in
the proof-apparatus teardown. A new clause is a spec + off-chain encoder + registration.

1. JSON spec in `clauses/<clause>.json` (the canonical Layer-A spec / `ClauseRegistry` seed data — nothing bundles a copy).
2. `populate-clauses.mjs` pins it to IPFS + anchors `(clauseId, version, contentHash, metadataURI)` on `ClauseRegistry`; the frontend loads it chain→IPFS via `clauseSpecSource` (no frontend copy, no preload).
3. **No per-clause encoder is needed** — `sdk/src/clauses/encode.ts` (`encodeContentFromSpec`) is the single generic, spec-driven encoder for ANY clause. A new clause adds a spec, not a code path.
4. SDK conformance/examples test reads the new spec from `clauses/` as a fixture (e.g. `sdk/tests/clauses/examples.test.ts`); the off-chain validator (`validateContent`) is generic and needs no per-clause case.
5. Registration via `frontend/scripts/populate-clauses.mjs` (NOT the Solidity deploy — `Deploy.s.sol`/`DeployMainnet.s.sol` deploy the registry but register no clauses): `registerClause(clauseId, version, contentHash, metadataURI)`. No `setValidator` step exists — registration alone makes the clause attestable. No frontend registration step either: the drawer, `/clauses` inventory, and every surface read the clause set live from `ClauseRegistry` events and the spec from IPFS (`clauseSpecSource`); titles, articles, and tiers come from the spec.

**When to add a seller-process clause vs not** (kernel-participant vs off-chain-seller principle): an off-chain seller needs its own process clause if and only if its state transitions are off-chain. Off-chain sellers (merchants, couriers, locker sellers, etc.) need a process clause because their state transitions happen in physical reality and need a sovereign event log to be tamper-proof evidence. Kernel participants — most importantly the **buyer**, who acts via `commit` and `resolveProcess` — do NOT need a process clause; their evidence IS the kernel event log itself. `merchant-process` and `courier-process` are sovereign-log primitives in this sense. Don't add a `figaro-buyer-process` clause — it would duplicate kernel events.

If the spec and the on-chain registration drift (a spec field the registered `contentHash` doesn't match, or a registered clauseId with no pinned spec) the clause won't surface — keep them in lockstep.

# Clause Validation Architecture

Figaro validates clause content in ONE place: an off-chain TypeScript layer
(`@figaro/sdk/clauses`, "Layer A") that parses the canonical JSON spec and
checks content against it. On the DIRECT path there is **no on-chain content
validation** — the chain merkle-binds each attestation to its signed agreement
and content-hashes the evidence (`AttestationCoordinator`), but validates no
content shape; well-formedness there is the SDK's job (honest authors) plus a
read-time concern (downstream forums reject garbage). On the BATCHED path
(rebuilt 2026-07-16 — `prover/` + `FigaroBatchVerifier`, `CONTRACTS.md` is the
owner), content IS validated in-proof: the Rust mirror of Layer A
(`prover/clause`, byte-parity locked by conformance suites) validates and
generically re-encodes the content against the clause's spec supplied as a
WITNESS INPUT, and settlement checks the witness's hash against
`ClauseRegistry.contentHashOf`. Both paths keep the property that matters: a
never-seen clause is attestable — and batch-settleable — with **zero
per-clause on-chain code**, open-world by construction
(`figaro-protocol-open-world-auditor` is the gate).

CLAUDE.md keeps the lockstep principle (spec ↔ SDK ↔ on-chain registration);
this file owns the full clause table, the architectural detail, and the
adding-a-clause checklist below.

## Layer A — the off-chain validation layer (TypeScript)

`@figaro/sdk/clauses` subpath:
- `parseClauseSpec(json)` — meta-clause validator (closed subset of JSON Schema:
  `string`, `integer`, `bigint` (decimal string), `boolean`, `enum`, `array`,
  `object`). A string field's `format` is an **open axis**: any non-empty string
  is a valid declaration; the validator enforces the formats it knows
  (`bytes32-hex`/`address-hex`/`bytes-hex`/`iso-datetime`) and treats the rest
  as plain strings; a frontend may map known formats to richer inputs (e.g.
  `geohash` → the device-location picker, `bytes32-hex` → the content-anchor
  affix — pick a file, pin it, keccak256 fills the field; pasting raw hex is
  used nowhere as a content fill (ruled 2026-07-10) — via `fieldFormatInputs`).
- `validateContent(content, spec, { stage? })` — validates a JS object against
  a parsed spec. Closed clauses: rejects unknown fields. Per-stage overrides
  via `spec.stages[stage]`.
- A single **generic `encodeContentFromSpec`** (`sdk/src/clauses/encode.ts`) — the one
  spec-driven content encoder, reading the field-to-position mapping FROM the parsed spec
  for ANY clause, with the same `{ stage? }` selection as the validator. Its inverse,
  `decodeContentFromSpec`, recovers a witness's structured values from calldata for
  readers (audit, timeline). The former per-clause encoders (`encodeCommerceContent`,
  `encodeGeoContent`, … one per clause) were **DELETED** — encoding is generic, not
  per-clause. Topology has no encoder — it is agreement-only, with no runtime attestation.

**Witness stages — the runtime feedback loop, declared in the spec.** A clause
whose runtime witness carries *different content* from its committed policy (a
temperature record, measured grams, a detected band) declares that content as
`spec.stages[N]` — a per-stage field set keyed by the on-chain `uint8 stage`.
Declaration IS the signal, end to end: the capability rail derives a repeatable
witness capability for any composed clause declaring stages (offered to BOTH
parties — who must witness is never engine policy; a dead-drop seller attests
with a device identifier in lieu of the buyer, and sufficiency is derived at
read time against the committed policy), renders the form from the declared
fields, validates and encodes at the stage, and files through
`AttestationCoordinator`; readers decode the recovered calldata against the
same declaration. A never-seen clause's feedback loop participates with zero
per-clause code — certified by the witness probe in
`permissionless-clause.devnet.spec.ts`. The evidence window closes at resolve
(`DESIGN_DECISIONS.md` §7): attestation is runtime evidence within an open
process, on-chain and in the derivation both. Process-log LADDERS
(`attestations` article) are the other runtime-evidence shape — their stage is
the enum ordinal, no `stages` key needed; a ladder stage listed in the clause's
`block.handoffStages` additionally PAIRS the witness stage of a co-composed
clause nesting under `handoff` when the witness's required values derive
unambiguously from the committed content (a single committed band) — one
action, two attestations.

Frontend wiring: `clauseSpecSource.ts` loads each spec live from `ClauseRegistry`
→ IPFS (no bundled copy); form gates and previews validate against the parsed spec.

## On-chain anchoring — registration + merkle binding (no content validation)

Two on-chain touch points remain:

- **`ClauseRegistry.registerClause(clauseId, version, contentHash, contentURI)`**
  — permissionless, first-write-wins, immutable. `clauseId` is the **bare
  human-readable name** (a string, e.g. `figaro-emissions`) and `version` is a separate
  `uint64`; the on-chain identity/dedup key is `keccak256(abi.encode(clauseId, version))`,
  so `name`+`version` together form the key. (On a live chain that registration is
  first-write-wins immutable — but this repo is **device-only**: specs in `clauses/`
  are edited **in place** and re-seeded fresh each `devup`. Do not bump `version` or
  mint a `-v2` to change a clause.) It anchors the clauseId, the spec's IPFS locator, and the spec's
  content hash (identity + integrity only — no group field; grouping is `block.article`
  in the spec JSON). No validator is registered or bound; a registered clause is
  immediately attestable.
- **`AttestationCoordinator`** merkle-binds each attestation: it verifies an OZ-style
  inclusion proof of `leaf = keccak256(keccak256(clauseId ++ keccak256(sectionData)))` (double-hashed — leaf/node domain separation) against the
  signed `agreementHash`, content-hashes the evidence (`contentRef = keccak256(content)`),
  and emits `Attestation`. It validates **no content shape** — an attestation whose clause
  was not committed at signing cannot land (the proof won't open), but any committed clause
  attests with zero per-clause on-chain code.

## Clause-spec format

Lives off-chain as JSON at the `contentURI` emitted by `ClauseRegistry`
(content integrity is the event's `contentHash`). The canonical Layer-A specs
live at repo-root `clauses/` (the `ClauseRegistry` seed data); nothing bundles a
copy — every consumer loads each spec from `ClauseRegistry` → IPFS at runtime.
The spec's `block` object is frontend/composition metadata (nothing on-chain or
in the SDK reads it) — its live field set is `ClauseBlockBinding`
(`frontend/lib/shared/clauseBlockBinding.ts`); derive the list from that type,
don't quote a remembered one.

**`block.article` is the SEMANTIC classifier axis** — it states what KIND of
thing a clause is; never infer kind from field shape ("has an enum" ≠ "is a
lifecycle"; every committed-choice clause carries a bounded enum):

- **`mandatory`** — committed content on every order (commerce, topology),
  never a designer choice. Renamed from `structural` 2026-07-14: that word
  collided with the design/DAG sense of "structure". `clauseIsMandatory` reads
  exactly this article, and the template build folds mandatory clauses in
  generically (`composeMandatoryClauses`).
- **`attestations`** — runtime TRANSFER ladders the responsible party advances
  (merchant-process, courier-process; a supply chain runs the same structure at
  length — each transfer attested, each intermediary paid at resolve).
  `clauseIsProcessLog` = `block.article === "attestations"` — ruled 2026-07-03,
  replacing a field-shape heuristic ("non-mandatory ∧ has enum") that misread
  committed-choice clauses as lifecycles.
- **`coordination`** — committed declarations of WHICH scenario everyone runs
  (modalities). Committed content, not a runtime lifecycle — topology carries an
  enum but never surfaces an attestation capability.

Other articles (geo, logistics, emissions, recourse, consent, …) group the
drawer/inventory; classification always reads the article, never the shape.

## The protocol clauses

The clause set is the specs in `clauses/` — the count is **derived, never
stored** (`ls clauses/*.json | wc -l`). All are runtime-attestable (content
validated off-chain by Layer A; no on-chain validator) except `figaro-topology`,
which is agreement-only — so runtime-attestable = that count minus one.

| clauseId | What it carries | Attestation surface |
|---|---|---|
| `figaro-topology` | DAG lineage (parent order hashes) | **Agreement-only** (no runtime attestation) |
| `figaro-commerce` | Payment + line items (the settlement currency is NOT here — it is signed in the kernel commitment, resolved from the denomination pin or the seller default) | Layer A (off-chain) |
| `figaro-denomination` | The one ERC-20 the whole assembly's processes bond and settle in — ANY token; the clause names no token and carries no economics. SPECIFIC-T&C (`block.terms: "specific"`, `settlement` article): the designer pins the token address into the template (identity-bearing — the pin is part of the compositionHash), tailoring the generic assembly; every bond (2×) and payment then moves in it. Elective, composed on the ROOT order (process-scoped; the kernel enforces one currency per process); absent = the BUYER'S PICK from the seller's accepted array denominates (checkout re-quotes at the venue rate), else the seller's default. The token-layer grid in `LEXICON.md` owns the full model | Layer A (off-chain) |
| `figaro-assembly-provenance` | The process→assembly link: the AssemblyRegistry `compositionHash` this agreement instantiates (`provenance` article). The designer composes it; the field fills MECHANICALLY at checkout from the loaded template's own identity (`fillProvenanceSection` — the hash cannot appear inside the composition it hashes, so it is never a designer value). A buyer attestation of the section is the on-chain event the RPGF recompute credits assembly designers of record from; the provenance article is scoring infrastructure and itself EXCLUDED from RPGF scoring | Layer A (off-chain) |
| `figaro-geolocation` | Origin / destination geohash — where an order originates/terminates (any modality, incl. virtual). Default-on | Layer A (off-chain) |
| `figaro-content-handoff` | THE DIGITAL TWIN of `figaro-handoff` — how a digital deliverable (production cut, design file, dataset, access credential) hands off: mode set (encrypted-transfer / repository-grant / public-release, the buyer's checkout pick), completion evidence = the artifact's keccak256 filed as the stage-1 witness (merkle-bound; verify by rehashing). Declares the `ecdh-content` interaction (the per-order ECDH channel carries counterparty-private transfers; surface = progressive enhancement). Compose `figaro-geolocation` alongside for territory/jurisdiction geofencing | Layer A (off-chain) |
| `figaro-cargo` | Physical shipment measure at the GDSN LOGISTIC-UNIT level (distinct from per-item trade-item measures on the catalogue) — gross/net mass, volume, packaged L×W×H, and packaging type/count/marks. Elective; hazmat / cold-chain / freight-class / dimweight are co-equal sibling logistics clauses (no spec-level nesting) | Layer A (off-chain) |
| `figaro-dimweight` | Dimensional (billed) weight for a PARCEL — a DERIVED leaf the checkout computes: billed = max(gross mass, volume ÷ divisor), the divisor a PROFILE-SOURCED seller value (`block.profileSourced: ["divisor"]` — authored once in the generic profile clause-values section, folded onto the leaf, then the derivation computes billed). Carries billedMassGrams + divisor (reproducible from the cargo dimensions). Elective; a co-equal logistics clause | Layer A (off-chain) |
| `figaro-hazmat` | Dangerous-goods declaration anchored to the UN Recommendations (ADR / IMDG / IATA-DGR) — UN number, proper shipping name, hazard class, packing group. Elective; a co-equal logistics clause | Layer A (off-chain) |
| `figaro-cold-chain` | Temperature-controlled handling anchored to GDP cold-chain classes — class + min/max °C window + the committed recording interval (no external standard mandates one) + free-form monitoring standard; the period record (observed range + evidence) is the `stages[1]` witness. Elective; a co-equal logistics clause | Layer A (off-chain) |
| `figaro-freight-class` | Declared freight classification anchored to the NMFC (NMFTA) — the NMFC class (50–500) + optional item number. Elective; a co-equal logistics clause | Layer A (off-chain) |
| `figaro-incoterms` | Trade-delivery terms anchored to the ICC's Incoterms® 2020 (publication 723E) — the declared rule (one of the standard's 11) + the named place/port every rule requires. The standard is the source of truth (referenced, never restated); a future ICC edition = a new clauseId. Elective; a co-equal logistics clause; derives onto the BoL + commercial-invoice document templates by declared field | Layer A (off-chain) |
| `figaro-modalities` | The buyer's request — consume-onsite / pickup / delivery / virtual (single-select) | Layer A (off-chain) |
| `figaro-handoff` | Hand-off point — where the physical exchange happens (proximity-policy nests under it) | Layer A (off-chain) |
| `figaro-emissions` | Accounting methodology (free-form `standard` string, committed at signing) + the measured-grams witness at `stages[1]` | Layer A (off-chain) |
| `figaro-proximity-policy` | Required detection bands committed at agreement signing; the hand-off witness (detected band + evidence) is the `stages[1]` witness, paired by hand-off ladder stages or filed standalone by either party | Layer A (off-chain) |
| `figaro-merchant-process` | Merchant per-role event enum (sovereign log) | Layer A (off-chain) |
| `figaro-courier-process` | Courier per-role event enum (sovereign log) | Layer A (off-chain) |
| `figaro-arbitration-kleros` | Decentralized off-chain arbitration via Kleros (subcourt + minimum jurors). Provider-specific; sister `figaro-arbitration-<provider>` clauses would cover future ODR providers | Layer A (off-chain) |
| `figaro-applicable-law` | State / ADR / traditional-jurisdiction recourse layer (applicable law + forum + language). Provider-agnostic. Composes with arbitration clauses | Layer A (off-chain) |
| `figaro-consent` | Cryptographic acceptance of an off-chain document (hash + version + title + optional locator) — supports ToS acceptance, governance vote receipts, and other document-acceptance ceremonies (`consent` article). The designer AFFIXES each document through the drawer repeater (pin → keccak anchor — the only fill path; no paste-hex); the parties' signatures over the agreement root ARE the acceptance, and the preview modal says so in the /security register (EDPB Guidelines 02/2025) | Layer A (off-chain) |
| `figaro-credential` | A DECLARED credential anchored to an external authority's public register (`credential` article; the NYC-TLC shape). SPECIFIC-T&C + profile-sourced, split by field: the designer pins the REGISTER (a URI template with an `{id}` placeholder) and optional title; the seller declares their identifier once on the profile (`block.profileSourced: ["credentialId"]`), folded at checkout. The register — the authority's own record, distinct from the protocol's on-chain registries — is the source of truth: verification is the READER's act (the per-leaf Verify link-out opens the substituted register URL; nothing gates signing, no status stored; the bond prices a false or lapsed declaration). A token-holding predicate for on-chain issuers is a future sister clause, not this one | Layer A (off-chain) |

`figaro-emissions` (renamed from `figaro-ghg`, 2026-07-10) is a single
disclosure clause whose accounting methodology is a **free-form `standard`
string** — any methodology, existing or future ("GHG Protocol Corporate
Standard", "ISO 14064", "PAS 2050", "EN 16258", or a custom one); the protocol
takes no closed list. No scope is stored: scope 1/2/3 is relative to a
reporting entity's boundary, and a reader derives it from its own position in
the process topology. Measured emissions (grams CO2e) are the clause's
**`stages[1]` witness** — a runtime attestation on the committed clause, not a
separate registered clause; there is no `figaro-ghg-measurement` companion
clause (the WHY is in "Composition and decomposition" below). A correction is
a later attestation at the same stage, weighed by readers. **Offset
procurement (retiring CO2 via a carbon router) is out of protocol scope** — it
composes as a fifth-noun on-network contract when a live router exists; the
earlier Klima-coupled tooling was retired when the Ethereum-based routers went
inactive.

`figaro-proximity-policy` commits, at agreement signing, the set of
proximity-detection bands a hand-off will accept. The runtime proof that a
hand-off actually occurred within an accepted band is the clause's
**`stages[1]` witness** (detected band + evidence — a Wi-Fi BSSID, BLE beacon
id, NFC payload, or a counterparty co-signature), not a separate registered
clause — an earlier `figaro-proximity-proof` clause modelled that witness as
its own clause and was retired for the same reason. Either party files it (a
dead-drop seller attests with the device identifier in lieu of the buyer);
sufficiency is derived at read time against the committed bands. The primitive
is **counterparty-pair-agnostic**: buyer↔merchant pickup, merchant↔courier
pickup, buyer↔courier drop-off all compose the same policy clause onto the
relevant order — a new hand-off pair is composition, never a new clause (only
a genuinely different witness model — multi-witness, on-chain device-sig
verification — clears the bar for a new primitive).

`figaro-topology` is the one **agreement-only** clause — committed at
agreement-signing time, never re-asserted as a runtime attestation. It is
*not* off-chain-only, though. Like every agreement section, an agreement-only
section is a merkle leaf under the on-chain `agreementHash`,
inclusion-provable via OpenZeppelin `MerkleProof` (`computeSectionLeaf` /
`buildSectionInclusionProof` in `sdk/src/agreement.ts` (@figaro/sdk)). "No
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
`docs/PUBLIC_GRAPH_MODEL.md`.)

Separate two kinds of data:

- **Per-instance payloads** — operational values attached to one order: a
  specific delivery details, a sealed address, notes for a single delivery
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
clause** — its content shape declared as a witness stage (`spec.stages[N]`, see
"Witness stages" above), never a separate proof clause. The earlier
`figaro-proximity-proof` / `figaro-ghg-measurement` sister-proof clauses were
**retired** for exactly this reason (the runtime witness is an attestation, not
a registered clause). So do not split a clause to separate its committed band
from its runtime proof; declare the proof as a witness stage on the committed
clause.

**Split when a generic-named clause carries provider-specific fields.** A clause
whose NAME is generic but whose fields name one provider's internals
(`klerosCourt`, `klerosMinJurors` inside a generic "jurisdiction" clause) is a
design smell — the tell is an "at least one of A or B" cross-field invariant
gluing two independently-composable concerns. Split along the provider seam:
`figaro-arbitration-kleros` (provider-specific) beside `figaro-applicable-law`
(provider-agnostic), with future `figaro-arbitration-<provider>` sisters
registering symmetrically. The clauseId is committed in the agreement hash, so
which-provider is an immutable term, not a payload value; a combined clause
forces either a closed enum (kills permissionless composition) or an open string
(kills committing which provider was named). Note the boundary against the merge
rule above: `figaro-emissions` keeps its methodology as a free-form field because a
methodology is a *label on one disclosure concern*, not a provider whose
internals shape the fields.

**The diagnostic.** Before adding a clause, ask: (a) does an existing clause
already cover this concept with a different enum value? If yes, extend the
existing clause's fields, do not add a new one. (b) Does the concept need a
runtime proof of a committed policy? Carry the proof as a runtime attestation on
the clause — do not add a separate proof clause. (c) Do the field values name a
specific provider's internals? Split along the provider seam. All three checks
are cheap at design time and expensive to undo once `clauseId` is bound on
chain.

## Adding a new clause — checklist

A new clause is a spec + registration — nothing else. The Rust/SP1 proof
apparatus needs NO step here by construction: the prover's clause engine is
generic and takes the spec as a witness input anchored by the registration's
`contentHash` (there is no per-clause validator contract, and never will be).

1. JSON spec in `clauses/<clause>.json` (the canonical Layer-A spec / `ClauseRegistry` seed data — nothing bundles a copy).
2. `populate-clauses.mjs` pins it to IPFS + anchors `(clauseId, version, contentHash, contentURI)` on `ClauseRegistry`; the frontend loads it chain→IPFS via `clauseSpecSource` (no frontend copy, no preload).
3. **No per-clause encoder is needed** — `sdk/src/clauses/encode.ts` (`encodeContentFromSpec`) is the single generic, spec-driven encoder for ANY clause. A new clause adds a spec, not a code path.
4. SDK conformance/examples test reads the new spec from `clauses/` as a fixture (e.g. `sdk/tests/clauses/examples.test.ts`); the off-chain validator (`validateContent`) is generic and needs no per-clause case.
5. Registration via `frontend/scripts/populate-clauses.mjs` (NOT the Solidity deploy — `Deploy.s.sol`/`DeployMainnet.s.sol` deploy the registry but register no clauses): `registerClause(clauseId, version, contentHash, contentURI)`. No `setValidator` step exists — registration alone makes the clause attestable. No frontend registration step either: the drawer, `/clauses` inventory, and every surface read the clause set live from `ClauseRegistry` events and the spec from IPFS (`clauseSpecSource`); titles, articles, and tiers come from the spec.

**When to add a seller-process clause vs not** (kernel-participant vs off-chain-seller principle): an off-chain seller needs its own process clause if and only if its state transitions are off-chain. Off-chain sellers (merchants, couriers, locker sellers, etc.) need a process clause because their state transitions happen in physical reality and need a sovereign event log to be tamper-proof evidence. Kernel participants — most importantly the **buyer**, who acts via `commit` and `resolveProcess` — do NOT need a process clause; their evidence IS the kernel event log itself. `merchant-process` and `courier-process` are sovereign-log primitives in this sense. Don't add a `figaro-buyer-process` clause — it would duplicate kernel events.

If the spec and the on-chain registration drift (a spec field the registered `contentHash` doesn't match, or a registered clauseId with no pinned spec) the clause won't surface — keep them in lockstep.

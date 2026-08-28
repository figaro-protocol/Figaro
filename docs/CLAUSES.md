# Clause Validation Architecture

Figaro validates clause content in ONE place: an off-chain TypeScript layer
(`@figaro-protocol/sdk/clauses`, "Layer A") that parses the canonical JSON spec and
checks content against it. On the DIRECT path there is **no on-chain content
validation** — the chain merkle-binds each attestation to its signed agreement
and content-hashes the evidence (`AttestationCoordinator`), but validates no
content shape; well-formedness there is the SDK's job (honest authors) plus a
read-time concern (downstream forums reject garbage). On the BATCHED path
(rebuilt 2026-07-16 — `prover/` + `FigaroBatchVerifier`, `CONTRACTS.md` is the
owner), content IS validated in-proof by a generic clause ENGINE — the Rust
mirror of Layer A (`prover/clause`, byte-parity locked by conformance suites),
taking each spec as a WITNESS INPUT anchored against
`ClauseRegistry.contentHashOf`; the engine-not-clauses argument is owned by
`SCALING_STRATEGY.md` § "Prover Clause Architecture". Both paths keep the property that matters: a
never-seen clause is attestable — and batch-settleable — with **zero
per-clause on-chain code**, open-world by construction
(`figaro-protocol-open-world-auditor` is the gate).

This file owns the lockstep principle (spec ↔ SDK ↔ on-chain registration),
the full clause table, the architectural detail, and the
adding-a-clause checklist below.

## Every clause is a merkle leaf (ruled 2026-08-11)

**Every term of an agreement is a clause section, and every clause section is a
merkle leaf under `agreementHash`. A datum that is not a leaf is NOT a term of
the agreement.** The kernel commitment struct's fields (currency, payment,
expectedCumulativeValue, deadline) are EXECUTION data — what the kernel escrows
and settles — and never substitute for a term: the agreement's merkle root is
the evidence record of the deal's terms, and a term living only in the struct
leaves that record incomplete. Evidence and execution are different layers; a
copy across them is not redundancy — it is the binding, and the sign gate's job
is to assert leaf == struct. (`payment` has always had both homes — the
commerce leaf and the struct field; any proposal to strip a term's leaf because
"the struct already has it" repeats the falsified 2026-07-14 currency removal
and is wrong on sight.)

## Layer A — the off-chain validation layer (TypeScript)

`@figaro-protocol/sdk/clauses` subpath:
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
  per-clause. No assembly attests topology at runtime yet
  (a current-state fact, not a design limit; see the topology note below).

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
the enum ordinal, no `stages` key needed. A diary event is one custodian's own
record; evidence of a custodial transfer (e.g. the proximity clause's witness)
is filed by a party through that clause's OWN standalone capability — there is
no declared pairing and the engine reads no presentation metadata at runtime
(custody is READER-DERIVED from the composed clauses' events; ruled
2026-07-28, retiring `handoffStages`).

Frontend wiring: `clauseSpecSource.ts` loads each spec live from `ClauseRegistry`
→ IPFS (no bundled copy); form gates and previews validate against the parsed spec.

## On-chain anchoring — registration + merkle binding (no content validation)

Two on-chain touch points remain:

- **`ClauseRegistry.registerClause(clauseId, version, contentHash, contentURI)`**
  — permissionless, first-write-wins, immutable; the on-chain identity/dedup
  key is `keccak256(abi.encode(clauseId, version))`, `clauseId` being the **bare
  human-readable name** (e.g. `figaro-emissions`). The registration semantics —
  the K4 stake, withdraw-to-de-surface, version migration — are owned by
  `CONTRACTS.md` § Registries. (On a live chain that registration is
  first-write-wins immutable — changing an anchored spec MEANS a new version; the
  immutability is the point. On a local devnet, where the registry is wiped and
  re-seeded fresh each `devup`, specs in `clauses/` are edited **in place** — do
  not bump `version` or mint a `-v2` during development.) It anchors the clauseId, the spec's IPFS locator, and the spec's
  content hash (identity + integrity only — no group field; grouping is
  `block.design.article` in the spec JSON, which stays off-chain). No RPGF tag
  reaches the chain — the reward is uniform on real usage, with no per-clause
  category (contract surface: `CONTRACTS.md` § RPGF). No validator
  is registered or bound; a registered clause is immediately attestable.
  **Versioning convention (RULED 2026-07-21): `version` is an integer lineage counter,
  never semver.** Semver's three-part contract (MAJOR.MINOR.PATCH) is a compatibility
  promise for consumers that resolve version *ranges* and auto-upgrade within them —
  machinery that does not and should not exist here: consumers pin an exact
  `(clauseId, version)` identity, every content change produces a different hash (so
  every change is "breaking" from the verifier's standpoint), and in a permissionless
  first-write-wins registry a compatibility claim is unverifiable data. If compatibility
  between two versions ever matters it is **derived** by diffing the two immutable specs,
  never stored in the author's numbering. Assemblies follow the same rule. The npm
  packages (`@figaro-protocol/sdk`, the frontend) are conventional mutable-name software and keep
  semver; the project as a whole versions by deployment lineage (V3/V4/V5). Three layers,
  three conventions — never collapsed.
- **`AttestationCoordinator`** merkle-binds each attestation: it verifies an OZ-style
  inclusion proof of `leaf = keccak256(keccak256(clauseId ++ sectionHash))` (double-hashed — leaf/node domain separation) against the
  signed `agreementHash` and emits `Attestation` with the caller-supplied `contentRef`. It
  takes only **fingerprints, never preimages** — `sectionHash = keccak256(sectionData)`,
  `contentRef = keccak256(content)` — so a `private`-disposition section's plaintext never
  touches public calldata (it lives off-chain, bound to the hash). It validates **no content
  shape** — an attestation whose clause was not committed at signing cannot land (the proof
  won't open), but any committed clause attests with zero per-clause on-chain code.
  **Public-disposition content is fingerprint-addressed on IPFS**: the attesting frontend
  pins the exact ABI content bytes as a RAW block multihashed with keccak-256, so the CID
  digest IS the event's `contentRef` (CIDv1 `f01551b20<contentRef-hex>`) — any reader
  derives the address from the event alone, verifies the fetched bytes hash back to the
  fingerprint, and decodes them against the spec's stage fields; no registry, no pointer.
  Withholding is FAIL-CLOSED (unknown spec, or any `private` field in the encoded set), and
  a resolved-empty lookup reads as absence — withheld, private, and erased are one state.

## Clause-spec format

Lives off-chain as JSON at the `contentURI` emitted by `ClauseRegistry`
(content integrity is the event's `contentHash`). The canonical Layer-A specs
live at repo-root `clauses/` (the `ClauseRegistry` seed data); nothing bundles a
copy — every consumer loads each spec from `ClauseRegistry` → IPFS at runtime.

**The spec has two halves either side of the UI/protocol crease** (format
ratified 2026-07-28; the published definition is
`sdk/src/clauses/clause-spec.schema.json`):

- **Top level = protocol + registration**: identity (`clauseId`, `version`,
  `title`, `description`) and the content `fields`/`stages`.
  **Stage 0 IS the committed content** (declared by `fields`); `stages[N≥1]`
  are the runtime-evidence shapes.
- **`block` = the UI half**, organized into PHASE SECTIONS named for their
  reader: `design` (`article`, `scope`, `nestsUnder`, `fills`, `composes`), `checkout`
  (`catalogueFills`, `profileFills`), `runtime` (`interaction`, `fields`).
  `runtime.fields` serves ON-NETWORK COMPOSITION INPUTS only (paired with
  `design.composes`); runtime REPORTING is witness stages (`spec.stages`),
  never `runtime.fields`. Its former tenants were deleted for cause — the
  auction composition (`bef1886e`) and the carbon-retirement leg
  (`f206d306`: no live mainnet router); the seam stays for the next
  on-chain-invoke tenant (maintainer rulings 2026-07-02 + 2026-07-28).
  Nothing on-chain or in the SDK's content layer reads it;
  the reference parser is `ClauseBlockBinding`
  (`frontend/lib/shared/clauseBlockBinding.ts`) — derive the attribute list
  from that type, don't quote a remembered one. **One verb — `fills` — says
  who authors which content fields** (designer / catalogue / profile); the
  buyer owns every field named in no fills list, derived as the complement,
  never stored.

**THE STANDARD (maintainer ruling 2026-07-28): every attribute expressed —
zero, empty, or `null`, never absent.** The repo's specs all comply (count derived: `ls clauses/*.json | wc -l`), enforced
by the JSON-Schema conformance suite in `sdk/tests/clauses/`; consumers still
treat an absent attribute as its empty value, so a sparser third-party spec
surfaces fine (resolved-empty = absence).

**`block.design.article` is the drawer grouping heading** — the
contract-document section a clause reads under. Classification never infers
from field shape ("has an enum" ≠ "is a lifecycle"; every committed-choice
clause carries a bounded enum):

- **`mandatory`** — committed content on every order (commerce, topology),
  never a designer choice. Renamed from `structural` 2026-07-14: that word
  collided with the design/DAG sense of "structure". `clauseIsMandatory` reads
  exactly this article, and the template build folds mandatory clauses in
  generically (`composeMandatoryClauses`).
- **`attestations`** — runtime TRANSFER ladders the responsible party advances
  (merchant-process, courier-process; a supply chain runs the same structure at
  length — each transfer attested, each intermediary paid at resolve). These
  are **coordination attestations for seller-to-seller coordination**
  (maintainer, 2026-07-28) — the same runtime-evidence category as witness
  stages, differing in shape (an event log the responsible party advances vs a
  measurement either party files). `clauseIsProcessLog` =
  `block.design.article === "attestations"` — ruled 2026-07-03, replacing a
  field-shape heuristic ("non-mandatory ∧ has enum") that misread
  committed-choice clauses as lifecycles.
- **`coordination`** — committed declarations of WHICH scenario everyone runs
  (modalities). Committed content, not a runtime lifecycle — a coordination
  clause never surfaces an attestation capability.

Other articles (the live set is whatever the registered clauses declare —
today: logistics, emissions, dispute-resolution, consent, settlement,
credential, data) group the drawer/inventory; classification
always reads the article, never the shape.

## The protocol clauses

The clause set is the specs in `clauses/` — the count is **derived, never
stored** (`ls clauses/*.json | wc -l`). All are runtime-attestable (content
validated off-chain by Layer A; no on-chain validator) except `figaro-topology`,
which no assembly has YET used for a runtime attestation — a current-state
fact, not a design limit (maintainer, 2026-07-28): a complex assembly can and
should attest topology as evidence that seller Y performed after X and before
Z. So runtime-attestable = that count minus one, today.

| clauseId | What it carries | Attestation surface |
|---|---|---|
| `figaro-topology` | DAG lineage (parent order hashes) | **Agreement-only** (no runtime attestation) |
| `figaro-commerce` | Payment + line items + the settlement currency (a content leaf again, ruled 2026-08-10 — mirroring the kernel commitment struct's `currency` field; the sign gate asserts leaf == struct) | Layer A (off-chain) |
| `figaro-utility-token` | The one ERC-20 the whole assembly's processes bond and settle in — ANY token; the clause names no token and carries no economics. Designer-fills (`block.design.fills: ["currency"]`, `settlement` article): the designer pins the token address into the template (identity-bearing — the pin is part of the compositionHash), tailoring the generic assembly; every bond (2×) and payment then moves in it. Elective, ASSEMBLY-SCOPED (`design.scope: "assembly"`, ruled 2026-07-28): composed once at the assembly level, folded into EVERY agreement at checkout so every party signs the pin, and the sign gate asserts a three-way match — pin == `figaro-commerce`'s currency leaf == the commitment struct's currency — before any signature (the match is what PROVES the denomination was designer-determined, not a coincidence); absent = the BUYER'S PICK from the seller's accepted array denominates (checkout re-quotes at the venue rate), else the seller's default. The token-layer grid in `LEXICON.md` owns the full model | Layer A (off-chain) |
| `figaro-assembly-provenance` | The process→assembly link: the AssemblyRegistry `compositionHash` this agreement instantiates. MANDATORY AT ASSEMBLY SCOPE (`article: "mandatory"` + `design.scope: "assembly"`, ruled 2026-07-28 — there are no ad-hoc processes; every process instantiates an assembly): the template build folds it into every published assembly automatically (never a designer choice), the assembly-scope fold carries it into every agreement, and the field fills MECHANICALLY at checkout from the loaded template's own identity (`fillProvenanceSection` — the hash cannot appear inside the composition it hashes). At resolve, the buyer's app records it on `UsageCounter` — `recordAssemblyUsage` reproduces the canonical section bytes from the claimed hash — which is how the RPGF path credits the assembly's designer of record. The provenance clause is the ONE entry in `UsageCounter.excludedClauseOrAssembly` (re-ruled 2026-08-13 — the two order-mandatory clauses earn for their author-of-record, the DAO treasury under the genesis registration): as the credit-carrying leaf it earns its author nothing directly, while the assembly credit above is untouched | Layer A (off-chain) |
| `figaro-geolocation` | Origin / destination locality codes under a DECLARED `geocodeStandard` (open axis, ruled 2026-07-28 — geohash is the built default; h3/s2/olc for cell grids, iso3166-1/-2 and unlocode for jurisdiction-grade digital-delivery territories; endpoint territory in digital chains is evidenced per RFC 8805/9632 geofeeds). Where an order originates/terminates, any modality, physical and digital chains alike. The geodistance rate source derives only for standards it knows (geohash today) — an unknown standard is unresolvable, never junk-priced. **Grain cap by disposition** (`cap(disposition, geocodeStandard)`, 2026-07-29): origin/destination are `disposition: "public"` — the reader coarsens a public geohash to neighborhood grain (≤6 chars; GDPR: no door-grade location on a plaintext/pinned artifact), while a fine machine/factory coordinate belongs to a `private`-disposition geolocation *version* (encrypted / content-withheld, off the public commons). Origin/destination declare `formatFromField: "geocodeStandard"` so the geohash picker + cap render only when the committed standard is geohash, degrading to plain text otherwise. `maxLength: 32` stays the structural ceiling for all standards. Default-on | Layer A (off-chain) |
| `figaro-content-handoff` | THE DIGITAL TWIN of `figaro-handoff` — how a digital deliverable (production cut, design file, dataset, access credential) hands off: mode set (encrypted-transfer / repository-grant / public-release, the buyer's checkout pick), completion evidence = the artifact's keccak256 filed as the stage-1 witness (merkle-bound; verify by rehashing). Declares the `ecdh-content` interaction (the per-order ECDH channel carries counterparty-private transfers; surface = progressive enhancement). Compose `figaro-geolocation` alongside for territory/jurisdiction geofencing | Layer A (off-chain) |
| `figaro-cargo` | Physical shipment measure at the GDSN LOGISTIC-UNIT level (distinct from per-item trade-item measures on the catalogue) — gross/net mass, volume, packaged L×W×H, and packaging type/count/marks. Elective; hazmat / cold-chain / freight-class / dimweight are co-equal sibling logistics clauses (no spec-level nesting) | Layer A (off-chain) |
| `figaro-dimweight` | Dimensional (billed) weight for a PARCEL — a DERIVED leaf the checkout computes: billed = max(gross mass, volume ÷ divisor), the divisor a PROFILE-authored seller value (`block.checkout.profileFills: ["divisor"]` — authored once in the generic profile clause-values section, folded onto the leaf, then the derivation computes billed). Carries billedMassGrams + divisor (reproducible from the cargo dimensions). Elective; a co-equal logistics clause | Layer A (off-chain) |
| `figaro-hazmat` | Dangerous-goods declaration anchored to the UN Recommendations (ADR / IMDG / IATA-DGR) — UN number, proper shipping name, hazard class, packing group. Elective; a co-equal logistics clause | Layer A (off-chain) |
| `figaro-cold-chain` | Temperature-controlled handling anchored to GDP cold-chain classes — class + min/max °C window + the committed recording interval (no external standard mandates one) + free-form monitoring standard; the period record (observed range + evidence) is the `stages[1]` witness. Elective; a co-equal logistics clause | Layer A (off-chain) |
| `figaro-freight-class` | Declared freight classification anchored to the NMFC (NMFTA) — the NMFC class (50–500) + optional item number. Elective; a co-equal logistics clause | Layer A (off-chain) |
| `figaro-incoterms` | Trade-delivery terms anchored to the ICC's Incoterms® 2020 (publication 723E) — the declared rule (one of the standard's 11) + the named place/port every rule requires. The standard is the source of truth (referenced, never restated); a future ICC edition = a new clauseId. Elective; a co-equal logistics clause; derives onto the BoL + commercial-invoice document templates by declared field | Layer A (off-chain) |
| `figaro-chain-of-custody` | Goods-level custody + integrity regime — the committed scheme (free-form reference: ISO 17712 container seal, tamper-evident bag, rail seal…; no closed list) + optional custody-unit identifier; every custody EVENT (applied / inspected-intact / transferred / breached / removed, with unit/seal identifiers, location, evidence) is a `stages[1]` witness filed by whichever party witnessed it. Custody continuity and breach exposure are DERIVED at read time from the event sequence, never stored. Elective; a co-equal logistics clause | Layer A (off-chain) |
| `figaro-acceptance-criteria` | The committed basis on which goods/work are accepted — free-form reference (AQL sampling plan, phytosanitary standard, PO spec…; no closed list) + optional affixed criteria document (keccak hash + locator, the consent affix pattern); inspection/receipt outcomes (conforming / non-conforming / conditionally-accepted + evidence) are `stages[1]` witnesses. The kernel's resolution stays the buyer's sovereign act — never conditioned on this clause. Elective; a co-equal logistics clause | Layer A (off-chain) |
| `figaro-modalities` | The buyer's request — consume-onsite / pickup / delivery / virtual (single-select) | Layer A (off-chain) |
| `figaro-schedule` | The agreed time window (`windowStart` / `windowEnd`, iso-datetime) — one `[start, end)` interval expressing an appointment, a booked timeslot, or a rental period alike (`coordination` article, checkout-filled). Duration is DERIVED, never stored: a rate-priced item bills hours via the `booking-window` rate-quantity source (windowEnd − windowStart, the time dual of `order-geodistance`). Records only the AGREED window; the ACTUAL start/finish is a runtime attestation on the process clause, any return leg a second co-equal order | Layer A (off-chain) |
| `figaro-handoff` | Hand-off point — where the physical exchange happens (proximity-policy nests under it) | Layer A (off-chain) |
| `figaro-emissions` | Accounting methodology (free-form `standard` string, committed at signing) + the measured-grams witness at `stages[1]` | Layer A (off-chain) |
| `figaro-proximity-policy` | Required detection bands committed at agreement signing; the hand-off witness (detected band + evidence) is the `stages[1]` witness, paired by hand-off ladder stages or filed standalone by either party — its `evidenceUri` declares `format: "evidence-capture"`, mounting the device-layer capture input (geolocation cross-check / NFC / BLE per device) | Layer A (off-chain) |
| `figaro-merchant-process` | Merchant per-role event enum (sovereign log) | Layer A (off-chain) |
| `figaro-courier-process` | Courier per-role event enum (sovereign log) | Layer A (off-chain) |
| `figaro-arbitration-kleros` | Decentralized off-chain arbitration via Kleros (subcourt + minimum jurors). ASSEMBLY-SCOPED + DESIGNER-AUTHORED (`design.fills`, ruled 2026-07-28 — never buyer-authored; a seller accepts by subscribing): a term of the whole composition, folded into every agreement. CONFORMS TO THE KLEROS DEVELOPER DOCUMENTATION (court set, ordering, position-as-index encoding — designed from those docs; the enum is the declared conformant subset, extended by spec edit; do not re-flag it against the live court tree). Provider-specific; sister `figaro-arbitration-<provider>` clauses would cover future ODR providers | Layer A (off-chain) |
| `figaro-applicable-law` | State / ADR / traditional-jurisdiction recourse layer (applicable law + forum + language). ASSEMBLY-SCOPED + DESIGNER-AUTHORED (`design.fills`, ruled 2026-07-28 — never buyer-authored; a seller accepts by subscribing): a term of the whole composition, folded into every agreement. Provider-agnostic. Composes with arbitration clauses | Layer A (off-chain) |
| `figaro-consent` | Cryptographic acceptance of an off-chain document (hash + version + title + optional locator) — supports ToS acceptance, governance vote receipts, and other document-acceptance ceremonies (`consent` article). The designer AFFIXES each document through the drawer repeater (pin → keccak anchor — the only fill path; no paste-hex); the parties' signatures over the agreement root ARE the acceptance, and the preview modal says so in the /security register (EDPB Guidelines 02/2025) | Layer A (off-chain) |
| `figaro-credential` | A DECLARED credential anchored to an external authority's public register (`credential` article; the NYC-TLC shape). Split by fills: the designer pins the REGISTER (a URI template with an `{id}` placeholder) and optional title (`block.design.fills`); the seller declares their identifier once on the profile (`block.checkout.profileFills: ["credentialId"]`), folded at checkout. The register — the authority's own record, distinct from the protocol's on-chain registries — is the source of truth: verification is the READER's act (the per-leaf Verify link-out opens the substituted register URL; nothing gates signing, no status stored; the bond prices a false or lapsed declaration). A token-holding predicate for on-chain issuers is a future sister clause, not this one | Layer A (off-chain) |
| `figaro-data-terms` | The disclosure regime for THIS process's own records (`data` article) — the co-produced private data behind the agreement's merkle leaves. Absent = the paper-contract default (each party holds and may disclose its own copy); composed = the regime is an explicit co-signed term: designer sets `disclosure` (closed / each-own / open) at design time (a `design.fills` field — the drawer's generic editor writes it; regime variants are sibling assemblies via compositionHash), buyer commits `buyerDisclosure` (withhold / permit) over their own half at checkout (the modality fill pattern). Sealed per-order encrypted fields are outside every regime by construction. Never article-mandatory. What a party SELLS of its disclosable records is a catalogue/profile concern | Layer A (off-chain) |
| `figaro-data-license` | The terms of a DATA SALE (`data` article) — an order whose value-added IS access to records: `licenseScope` (the named data product), optional `purpose` restriction, `access` (snapshot / stream — the stream is the sustainable, repeated-game product), `redistribution` (prohibited is an off-chain obligation: co-signed timestamped evidence for the outer recourse layers, never on-chain prevention), optional `sourceProcesses` provenance anchors (each disclosed leaf verifies by merkle inclusion proof against the named process's on-chain agreementHash — sold data is self-authenticating; the 2× bond replaces pre-inspection, answering Arrow's information paradox economically). Composes with `figaro-commerce` + `figaro-content-handoff` (delivery); schedule/geolocation compose alongside for windows/territory | Layer A (off-chain) |

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

`figaro-topology` is committed at agreement-signing time and — so far — never
re-asserted as a runtime attestation. That is a fact about today's simple
assemblies, not a design limit (maintainer, 2026-07-28): a complex assembly
(Tradelens-grade) can and should attest topology as runtime evidence that
seller Y performed after X and before Z. It is *not* off-chain-only, either
way. Like every agreement section, a committed topology section is a merkle
leaf under the on-chain `agreementHash`, inclusion-provable via OpenZeppelin
`MerkleProof` (`computeSectionLeaf` / `buildSectionInclusionProof` in
`sdk/src/agreement.ts` (@figaro-protocol/sdk)). "Not yet attested at runtime" is not
"no on-chain verification": the DAG is reconstructed off-chain by indexers
reading topology sections from the signed agreement.

## When something deserves a clause — payload vs anchor

A clause is an *anchored registry family*: an off-chain definition whose
meaning must stay stable across parties, tools, and time, anchored on-chain by
a minimal reference point — `clauseId` + `contentHash` + `contentURI` in
`ClauseRegistry` (identity + integrity only). Not every value
that flows through an order deserves one. RPGF pays every clause uniformly on its
real usage, with no category, tag, or weight — the registry anchors identity and
integrity, nothing that tilts the reward. Rationale in
`docs/PUBLIC_GRAPH_MODEL.md`.

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
time?* If yes, it is an anchored registry family — give it a clause. If no, it
is a per-instance payload — keep it off-chain, referenced immutably, and do not
register it.

**Bounded generality.** A clause should be generic enough to be reused across
the parties and tools that need it, and no more. Avoid both failure modes: an
app-specific one-off that can never become a shared protocol concept, and a
fake universal ontology that registers every document as a first-class object.
The clause layer stays grounded in concrete coordination problems — process
obligations, disclosures, verifiable reference integrity — not in possibility.

Clauses are one registry family among several (sellers, assemblies); each
family carries its own anchor and never nests inside another (Separation of
Concerns — Registry Families). Clause identity is append-only:
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
5. Registration via `frontend/scripts/populate-clauses.mjs` (NOT the Solidity deploy — `Deploy.s.sol`/`DeployMainnet.s.sol` deploy the registry but register no clauses): `registerClause(clauseId, version, contentHash, contentURI)`. No `setValidator` step exists — registration alone makes the clause attestable. No frontend registration step either: the drawer, `/clauses` inventory, and every surface read the clause set live from `ClauseRegistry` events and the spec from IPFS (`clauseSpecSource`); titles and articles come from the spec.

**When to add a seller-process clause vs not** (kernel-participant vs off-chain-seller principle): an off-chain seller needs its own process clause if and only if its state transitions are off-chain. Off-chain sellers (merchants, couriers, locker sellers, etc.) need a process clause because their state transitions happen in physical reality and need a sovereign event log to be tamper-proof evidence. Kernel participants — most importantly the **buyer**, who acts via `commit` and `resolveProcess` — do NOT need a process clause; their evidence IS the kernel event log itself. `merchant-process` and `courier-process` are sovereign-log primitives in this sense. Don't add a `figaro-buyer-process` clause — it would duplicate kernel events.

If the spec and the on-chain registration drift (a spec field the registered `contentHash` doesn't match, or a registered clauseId with no pinned spec) the clause won't surface — keep them in lockstep.

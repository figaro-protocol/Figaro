# Clause Validation Architecture

Figaro enforces clause-content correctness in three layers. All three layers
parse the same canonical JSON spec format and apply the same validation
rules. **A new clause is not "done" until all three layers ship in lockstep.**

CLAUDE.md keeps the lockstep principle; this file owns the full table, the architectural detail for each layer, and the adding-a-clause checklist below.

## Layer A — Client-side (TypeScript)

`@figaro/core/clauses` subpath:
- `parseClauseSpec(json)` — meta-clause validator (closed subset of JSON Schema:
  `string` with format `bytes32-hex`/`address-hex`/`bytes-hex`/`iso-datetime`,
  `integer`, `bigint` (decimal string), `boolean`, `enum`, `array`, `object`).
- `validateContent(content, spec, { stage? })` — validates a JS object against
  a parsed spec. Closed clauses: rejects unknown fields. Per-stage overrides
  via `spec.stages[stage]`.
- Per-clause content encoders (`encodeCommerceContent`, `encodeGeoContent`,
  `encodeFulfilmentV2Content`, `encodeJurisdictionContent`,
  `encodeGHGScopeContent` (shared across the 5 GHG sister clauses),
  `encodeGHGMeasurementContent`, `encodeProximityPolicyContent`,
  `encodeProximityProofContent`, `encodeOffsetPolicyContent`,
  `encodeMerchantContent`, `encodeCourierContent`, `encodeConsentContent`)
  plus a generic `encodeContentFromSpec` — bridge between TS objects and
  the ABI bytes expected by the on-chain validator. Each clause's encoder
  is the canonical TS-side declaration of its field-to-position mapping.
  13 distinct encoder shapes across the 20 runtime-attestable clauses
  (the 5 GHG sister clauses share one shape). Topology has no encoder —
  it's a manifest-only clause with no runtime attestation.

Frontend wiring: `useClauseValidator(clauseId)` hook + `clauseSpecSource.ts`
preloads built-in specs and lazy-fetches remote ones.

## Layer B — Rust (SP1 prover-integrated)

`prover/clause/` — `figaro-clause` crate. Mirrors Layer A byte-for-byte
(`parse_clause_spec` + `validate_content`). Two consumer surfaces:

1. **SP1 zkVM prover guest program** — `figaro-kernel`'s `apply_batch`
   gates `AttestAsSeller` / `AttestAsBuyer` operations through
   `validate_attestation_content` when the op carries an
   `AttestationContentProof { content_json, inclusion_proof,
   section_data }`. Five gates run inside the proof:
     1. The op's `clause_id` resolves to a canonical spec compiled into
        the prover (`figaro_clause::embedded_spec_json`). The spec is
        looked up by `clause_id`, never supplied by the caller, so the
        constraint set is covered by the program verification key.
     2. `validate_content(content_json, embedded_spec, stage)` returns
        `Ok` — the structured form satisfies the clause.
     3. `encode_content_for_clause(clauseId, content_json)` derives
        canonical ABI bytes (byte-for-byte equivalent to viem's
        `encodeAbiParameters` in `sdk/src/clauses/encode.ts`). This is
        the **cross-form binding** — the bytes Layer C decodes are
        derived *from* the JSON Layer B validates, so they describe the
        same content by construction. No separate `content_bytes` field
        exists; it would have allowed the caller to disagree with
        `content_json` and is impossible.
     4. `keccak256(derived_bytes) == content_ref` — binds the canonical
        bytes to the on-chain commitment value.
     5. **Agreement inclusion.** For a seller attestation, the clause's
        section is a clause of the order's signed agreement: a
        sorted-pair Merkle `inclusion_proof` verifies the section leaf —
        `keccak256(clauseId ++ keccak256(sectionData))` — against the
        role commitment's `agreement_hash`. A cross-checking (Category-2)
        clause's committed `sectionData` is the ABI content form, so
        `keccak256(sectionData) == content_ref` and the leaf needs no
        extra input; a non-cross-checking (Category-1) clause carries its
        canonical-JSON `section_data` in the proof. Buyer attestations
        skip this gate — a buyer's evidence is the kernel event log, not
        an agreement clause.
   `content_proof` is `Option`-typed. `None` is permitted only for
   content-opaque attestations (`content_ref == 0`) and for clauses the
   kernel has no embedded spec for; an attestation with a non-zero
   `content_ref` under a runtime-attestable protocol clause MUST carry a
   proof, else the gate returns `ContentProofRequired`.

2. **Off-chain sequencer** — `figaro_sequencer::mempool::Mempool`
   mirrors the kernel gate at submission time via
   `pre_check_attest_content`. The same gates run on every
   attestation that carries a `content_proof`; any failure surfaces as
   a `submit()` rejection with a human-readable reason and the op is
   never enqueued. This means the prover never spends cycles on
   batches the kernel would reject. Signature-only pre-checks remain
   for ops that opt out of `content_proof`.

Conformance is locked across the prover test crates:

- `prover/clause/tests/conformance.rs` — spec-parse + content-validation
  conformance against `sdk/tests/clauses/validate.test.ts`, every shipped
  protocol clause's parse, and a check that all 17 embedded canonical
  specs parse and resolve by clauseId.
- `prover/clause/tests/encode_conformance.rs` — per-clause
  canonical-encoder output is byte-for-byte equal to viem's
  `encodeAbiParameters` output for the same input (covers all 13 distinct
  encoder shapes across the 20 runtime-attestable clauses). Test vectors
  were captured from the TypeScript encoders.
- `prover/lib/tests/parity.rs` — kernel-integration tests
  (`attest_as_seller_with_valid_content_proof_passes`,
  `_content_hash_mismatch_fails`, `_invalid_content_fails`,
  `_unsupported_clause_encoder_fails`,
  `attest_as_seller_under_protocol_clause_requires_content_proof`,
  `_with_wrong_inclusion_proof_fails`,
  `attest_as_seller_non_cross_checking_clause_requires_section_data`)
  exercising every gate inside `apply_batch`, Gate 5 included.
- `prover/sequencer/tests/sequencer.rs` — mempool-boundary tests
  (`mempool_accepts_attest_with_valid_content_proof`,
  `_rejects_content_hash_mismatch`, `_rejects_invalid_content`,
  `_rejects_unsupported_clause_encoder`,
  `mempool_rejects_missing_content_proof_for_protocol_clause`,
  `mempool_rejects_wrong_inclusion_proof`,
  `mempool_rejects_missing_section_data`)
  verifying the gate trips at submission time.

The user-supplied `pattern` field uses the `regex` crate; the four
canonical formats (bytes32-hex, address-hex, bytes-hex, iso-datetime)
use hand-rolled character matching to avoid regex-engine cost in the
zkVM hot path. The per-clause ABI encoders use `alloy-dyn-abi` for
runtime-typed encoding.

## Layer C — On-chain (Solidity)

`AttestationCoordinator.setValidator(clauseId, validator)` registers an
`IClauseValidator` for a clauseId — **permissionless, first-write-wins**.
Once set, the binding is immutable (no admin, no rug-pull). Every
`attest*` call routes through the registered validator before emitting
the `Attestation` event. A clause with no validator cannot be attested
under (`ValidatorNotSet` revert).

Per-clause validators live in `src/clauseValidators/` and ABI-decode
content (no on-chain JSON parsing). They are pure / view contracts.

## Clause-spec format

Lives off-chain as JSON at the `metadataURI` emitted by `ClauseRegistry`
(content integrity is the event's `contentHash`). The canonical Layer-A specs
ship in `sdk/src/clauses/examples/`; the frontend no longer bundles a copy — it
loads each spec from `ClauseRegistry` → IPFS at runtime.

## The 21 protocol clauses

20 runtime-attestable clauses (each with a Layer C validator) plus the
manifest-only `figaro-topology-v1`.

| clauseId | What it carries | Attestation surface |
|---|---|---|
| `figaro-topology-v1` | DAG lineage (parent order hashes) | **Manifest-only** (no runtime validator) |
| `figaro-commerce-v1` | Currency, payment, line items | Layer A + C |
| `figaro-geo-v2` | Origin / destination geohash + mass + volume + class of service | Layer A + C |
| `figaro-fulfilment-v2` | Modality + coordination in one clause — MID-RETIREMENT, split into the two clauses below; delete when the migration lands | Layer A + C |
| `figaro-modalities-v1` | The buyer's request — consume-onsite / pickup / delivery / virtual (single-select) | Layer A + C |
| `figaro-coordination-v1` | How a delivery's courier edge is arranged — seller-assigned / buyer-assigned / dutch-auction (single-select, composes on the delivery parent order) | Layer A + C |
| `figaro-handoff-v1` | Hand-off point — where the physical exchange happens (proximity-policy nests under it) | Layer A + C |
| `figaro-ghg-protocol-v1` | GHG Protocol Corporate Standard + scope (Category-2) | Layer A + C |
| `figaro-ghg-iso-14064-v1` | ISO 14064 family + scope (Category-2) | Layer A + C |
| `figaro-ghg-pas-2050-v1` | PAS 2050 product carbon footprint + scope (Category-2) | Layer A + C |
| `figaro-ghg-en-16258-v1` | EN 16258 transport-emissions methodology + scope (Category-2) | Layer A + C |
| `figaro-ghg-custom-v1` | Custom / non-standard GHG methodology + scope (Category-2) | Layer A + C |
| `figaro-ghg-measurement-v1` | Runtime grams CO2e (Category-1) | Layer A + C |
| `figaro-proximity-policy-v1` | Required detection band committed at agreement signing (Category-2) | Layer A + C |
| `figaro-proximity-proof-v1` | Per-handoff nonce + signed witness payload at runtime (Category-1) | Layer A + C |
| `figaro-offset-policy-v1` | Carbon-offset provider set committed at agreement signing (Category-2) | Layer A + C |
| `figaro-merchant-process-v1` | Merchant per-role event enum (sovereign log) | Layer A + C |
| `figaro-courier-process-v1` | Courier per-role event enum (sovereign log) | Layer A + C |
| `figaro-arbitration-kleros-v1` | Decentralized off-chain arbitration via Kleros (subcourt + minimum jurors). Provider-specific; sister `figaro-arbitration-<provider>-v1` clauses would cover future ODR providers | Layer A + C |
| `figaro-applicable-law-v1` | State / ADR / traditional-jurisdiction recourse layer (applicable law + forum + language). Provider-agnostic. Composes with arbitration clauses | Layer A + C |
| `figaro-consent-v1` | Cryptographic acceptance of an off-chain document (hash + version + title) — supports beta consent, ToS acceptance, governance vote receipts, etc. (`consent` family) | Layer A + C |

The five `figaro-ghg-<standard>-v1` entries are sister clauses — one per
accounting standard. Standard identity lives in the clauseId; the content
shape is `(uint8 scope)` for all five and the encoder (`encodeGHGScopeContent`)
is shared. Per-standard extensions (reporting boundaries, period, etc.) can
be added to a single sister clause's validator without affecting siblings.

`figaro-proximity-policy-v1` + `figaro-proximity-proof-v1` are sister
clauses that split the committed-vs-runtime concerns the way
GHG-disclosure + GHG-measurement do for emissions. Policy commits the
required band at agreement signing (Category-2, byte-equality enforced);
proof carries the per-handoff nonce + signed witness payload at runtime
(Category-1, fresh per attestation). Off-chain consumers verify
`proof.band == policy.band` when the policy section is present.

`figaro-topology-v1` is the one **manifest-only** clause — no Layer C
validator and no SP1 encoder. That is by design: an order's parent edges are
fixed at agreement-signing time and are never re-asserted as a runtime
attestation, so there is no per-event content for a validator to gate. It is
*not* off-chain-only, though. Like every agreement section, the topology
section is a merkle leaf under the on-chain `agreementHash`, inclusion-provable
via OpenZeppelin `MerkleProof` (`computeSectionLeaf` / `buildSectionInclusionProof`
in `frontend/lib/core/agreement.ts`). "No runtime validator" is not "no
on-chain verification" — topology is verified by inclusion proof against the
signed agreement, not by an attestation validator. The DAG itself is
reconstructed off-chain by indexers reading topology sections from the signed
manifest.

## When something deserves a clause — payload vs anchor

A clause is an *anchored artifact family*: an off-chain definition whose
meaning must stay stable across parties, tools, and time, anchored on-chain by
a minimal reference point — `clauseId` + `uriHash` + `family` in
`ClauseRegistry`, plus the Layer C validator. Not every value that flows
through an order deserves one. The `family` (e.g. `keccak256("geo")`) is the
unit the RPGF SP1 program weights — Tier-1 families are deploy-frozen, but
new clauses register under existing families permissionlessly and inherit
the weight without any FIG-system redeployment.

Separate two kinds of data:

- **Per-instance payloads** — operational values attached to one order: a
  specific delivery manifest, a sealed address, notes for a single fulfilment
  event. Often private, instance-specific, decoded by one app's client. These
  stay as order payload bytes; they do NOT get a clause.
- **Shared reference semantics** — definitions whose meaning must hold across
  counterparties and over time: a disclosure standard, a methodology
  reference, a manifest *format*. These are what a clause anchors.

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
"Separation of Concerns — Artifact Families". Clause identity is append-only
(Layer C above): new meaning is a new `clauseId`, never a mutation of an old
one.

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

**Split when one clause conflates two cryptographic categories.** A clause is
either Category-2 (committed at agreement signing, fixed for the order's life)
or Category-1 (attested at runtime, supplied by a per-event witness). One
clause cannot be both. If a single clause tries to carry both the
agreement-time policy AND the runtime proof, split it into a sister-clause
pair. Precedent: `figaro-proximity-v1` was split into `figaro-proximity-policy-v1`
(Category-2, committed band) + `figaro-proximity-proof-v1` (Category-1,
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

1. JSON spec in `sdk/src/clauses/examples/<clause>.json` (the canonical Layer-A spec) + import it into `sdk/src/clauses/embedded.ts`.
2. `populate-clauses.mjs` pins it to IPFS + anchors `(clauseId, contentHash, metadataURI)` on `ClauseRegistry`; the frontend loads it chain→IPFS via `clauseSpecSource` (no frontend copy, no preload).
3. SDK content encoder in `sdk/src/clauses/encode.ts` + export from `index.ts`.
4. SDK examples test in `sdk/tests/clauses/examples.test.ts`.
5. Solidity `Foo<Clause>V1Validator.sol` in `src/clauseValidators/`. Validate function MUST be declared `external pure override` (no external state reads, no `block.*`/`tx.*`, no external calls). Use `bytes32 public constant override clauseId = keccak256("...")` so the clauseId is a compile-time literal — `immutable` constructor-set clauseIds force the override to `view` and forfeit the EVM-enforced determinism guarantee. See `IClauseValidator` NatSpec for the rationale.

   **When to add an seller-process clause vs not** (kernel-participant vs off-chain-seller principle): an off-chain seller needs its own process clause if and only if its state transitions are off-chain. Off-chain sellers (merchants, couriers, locker sellers, etc.) need a process clause because their state transitions happen in physical reality and need a sovereign event log to be tamper-proof evidence. Kernel participants — most importantly the **buyer**, who acts via `commit` and `resolveProcess` — do NOT need a process clause; their evidence IS the kernel event log itself. `merchant-process` and `courier-process` are sovereign-log primitives in this sense. Don't add `figaro-buyer-process-v1` — it would duplicate kernel events. Do add a process clause for any new off-chain seller whose internal events need to be on-chain attestable. The clause-category taxonomy carries this as the `seller-process` category (see `frontend/lib/shared/clauseCategories.ts`).
6. Foundry test in `test/clauseValidators/`.
7. Rust mirror at Layer B is generic (`prover/clause/`). A new clause does
   NOT require a new Rust file — Layer B parses any spec at runtime from
   its JSON. Adding a per-clause content-encoder helper to Layer B is only
   needed when a downstream Rust consumer wants strongly-typed content
   (the SP1 prover guest, for instance, can pass through serde_json::Value).
8. No frontend registration step remains — the drawer, `/clauses` inventory, and every other surface read the clause set live from on-chain `ClauseRegistry` events and the spec from IPFS (`clauseSpecSource`); titles, articles, tiers, and families all come from the spec itself. (The former `clauseCategories.ts` registry was deleted in the open-world de-hardcode.) The clause appears everywhere once step 9's on-chain registration lands.
9. `registerClause(clauseId, version, uriHash, family)` + `setValidator(clauseId, validator)` calls added to `script/Deploy.s.sol` and `script/DeployMainnet.s.sol`; regression covered by `test/DeployScriptTest.t.sol`. The `family` is `keccak256(primaryCategory)` from the spec's `categories[0]` (Tier-1 boost goes to `keccak256("geo")` and `keccak256("coordination")`; `keccak256("fulfilment")` stays Tier-1 only while `figaro-fulfilment-v2` is mid-retirement); the same `family` keys the RPGF Tier-1 weighting in `prover/rpgf/src/formula.rs` — Tier-1 families are deploy-frozen, but a new clause joining an existing family inherits the weight permissionlessly. (Bootstrap-time atomicity: the deploy scripts inline clause registration + validator binding within a single broadcast transaction. Post-deploy third-party clauses should use `ClauseRegistrationHelper.registerClauseAndValidator(...)` instead — see "Third-party clause deployment" below.)

If any step is skipped the validator gate either rejects all attestations under that clauseId
(missing on-chain validator) or silently accepts content the spec would have rejected (Layer A
gap). Maintain lockstep.

## Third-party clause deployment — atomic register+bind required

`ClauseRegistry.registerClause` and `AttestationCoordinator.setValidator` are
independent permissionless writes. The 16 reference figaro-* clauses are bound
inside a single transaction by `script/Deploy.s.sol:_deployAndRegisterValidators`,
so no front-running window exists at genesis.

For any **third-party clause** registered post-deploy, the clause author MUST
perform both writes in a single transaction. The recommended path is
**`ClauseRegistrationHelper.registerClauseAndValidator(clauseId, version, uriHash, family, validator)`**
— a stateless, no-admin helper contract deployed alongside the protocol that
composes the two underlying public calls atomically. Alternative paths: a
custom deploy script, or a wallet multicall covering both writes.

Two separate transactions exposes a window where any address can `setValidator`
under the new clauseId with a malicious validator that self-attests the correct
`clauseId()`, capturing the binding permanently (binding is immutable
first-write-wins). The validator's `validate()` logic is not constrained at
binding time, so a self-attesting malicious validator passes
`InvalidValidatorBinding` and becomes the gate forever.

This is deployment discipline, not a protocol gap. See
`docs/v5/DESIGN_DECISIONS.md` #13 for the full rationale and the rejection of
admin-based mitigations.

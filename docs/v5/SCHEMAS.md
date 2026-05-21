# Schema Validation Architecture

Figaro enforces schema-content correctness in three layers. All three layers
parse the same canonical JSON spec format and apply the same validation
rules. **A new schema is not "done" until all three layers ship in lockstep.**

CLAUDE.md keeps the lockstep principle and the adding-a-schema checklist; this file is the full table + the architectural detail for each layer.

## Layer A — Client-side (TypeScript)

`@figaro/core/schemas` subpath:
- `parseSchemaSpec(json)` — meta-schema validator (closed subset of JSON Schema:
  `string` with format `bytes32-hex`/`address-hex`/`bytes-hex`/`iso-datetime`,
  `integer`, `bigint` (decimal string), `boolean`, `enum`, `array`, `object`).
- `validateContent(content, spec, { stage? })` — validates a JS object against
  a parsed spec. Closed schemas: rejects unknown fields. Per-stage overrides
  via `spec.stages[stage]`.
- Per-schema content encoders (`encodeHandoffContent`, `encodeCommerceContent`,
  `encodeGHGScopeContent`, `encodeFulfilmentContent`, `encodeGeoContent`,
  `encodeProximityPolicyContent`, `encodeProximityProofContent`,
  `encodeMerchantContent`, `encodeCourierContent`) — bridge between TS objects
  and ABI bytes expected by
  the on-chain validator. Each schema's encoder is the canonical TS-side
  declaration of its field-to-position mapping. Topology has no encoder —
  it's a manifest-only clause with no runtime attestation.

Frontend wiring: `useSchemaValidator(schemaId)` hook + `schemaSpecSource.ts`
preloads built-in specs and lazy-fetches remote ones.

## Layer B — Rust (SP1 prover-integrated)

`prover/schema/` — `figaro-schema` crate. Mirrors Layer A byte-for-byte
(`parse_schema_spec` + `validate_content`). Two consumer surfaces:

1. **SP1 zkVM prover guest program** — `figaro-kernel`'s `apply_batch`
   gates `AttestAsSeller` / `AttestAsBuyer` operations through
   `validate_attestation_content` when the op carries an
   `AttestationContentProof { content_json, inclusion_proof,
   section_data }`. Five gates run inside the proof:
     1. The op's `schema_id` resolves to a canonical spec compiled into
        the prover (`figaro_schema::embedded_spec_json`). The spec is
        looked up by `schema_id`, never supplied by the caller, so the
        constraint set is covered by the program verification key.
     2. `validate_content(content_json, embedded_spec, stage)` returns
        `Ok` — the structured form satisfies the schema.
     3. `encode_content_for_schema(schemaId, content_json)` derives
        canonical ABI bytes (byte-for-byte equivalent to viem's
        `encodeAbiParameters` in `sdk/src/schemas/encode.ts`). This is
        the **cross-form binding** — the bytes Layer C decodes are
        derived *from* the JSON Layer B validates, so they describe the
        same content by construction. No separate `content_bytes` field
        exists; it would have allowed the caller to disagree with
        `content_json` and is impossible.
     4. `keccak256(derived_bytes) == content_ref` — binds the canonical
        bytes to the on-chain commitment value.
     5. **Agreement inclusion.** For a seller attestation, the schema's
        section is a clause of the order's signed agreement: a
        sorted-pair Merkle `inclusion_proof` verifies the section leaf —
        `keccak256(schemaId ++ keccak256(sectionData))` — against the
        role commitment's `agreement_hash`. A cross-checking (Category-2)
        schema's committed `sectionData` is the ABI content form, so
        `keccak256(sectionData) == content_ref` and the leaf needs no
        extra input; a non-cross-checking (Category-1) schema carries its
        canonical-JSON `section_data` in the proof. Buyer attestations
        skip this gate — a buyer's evidence is the kernel event log, not
        an agreement clause.
   `content_proof` is `Option`-typed. `None` is permitted only for
   content-opaque attestations (`content_ref == 0`) and for schemas the
   kernel has no embedded spec for; an attestation with a non-zero
   `content_ref` under a runtime-attestable protocol schema MUST carry a
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

- `prover/schema/tests/conformance.rs` — spec-parse + content-validation
  conformance against `sdk/tests/schemas/validate.test.ts`, every shipped
  protocol schema's parse, and a check that all 16 embedded canonical
  specs parse and resolve by schemaId.
- `prover/schema/tests/encode_conformance.rs` — per-schema
  canonical-encoder output is byte-for-byte equal to viem's
  `encodeAbiParameters` output for the same input (covers all 12 distinct
  encoder shapes across the 16 runtime-attestable schemas). Test vectors
  were captured from the TypeScript encoders.
- `prover/lib/tests/parity.rs` — kernel-integration tests
  (`attest_as_seller_with_valid_content_proof_passes`,
  `_content_hash_mismatch_fails`, `_invalid_content_fails`,
  `_unsupported_schema_encoder_fails`,
  `attest_as_seller_under_protocol_schema_requires_content_proof`,
  `_with_wrong_inclusion_proof_fails`,
  `attest_as_seller_non_cross_checking_schema_requires_section_data`)
  exercising every gate inside `apply_batch`, Gate 5 included.
- `prover/sequencer/tests/sequencer.rs` — mempool-boundary tests
  (`mempool_accepts_attest_with_valid_content_proof`,
  `_rejects_content_hash_mismatch`, `_rejects_invalid_content`,
  `_rejects_unsupported_schema_encoder`,
  `mempool_rejects_missing_content_proof_for_protocol_schema`,
  `mempool_rejects_wrong_inclusion_proof`,
  `mempool_rejects_missing_section_data`)
  verifying the gate trips at submission time.

The user-supplied `pattern` field uses the `regex` crate; the four
canonical formats (bytes32-hex, address-hex, bytes-hex, iso-datetime)
use hand-rolled character matching to avoid regex-engine cost in the
zkVM hot path. The per-schema ABI encoders use `alloy-dyn-abi` for
runtime-typed encoding.

## Layer C — On-chain (Solidity)

`AttestationCoordinator.setValidator(schemaId, validator)` registers an
`ISchemaValidator` for a schemaId — **permissionless, first-write-wins**.
Once set, the binding is immutable (no admin, no rug-pull). Every
`attest*` call routes through the registered validator before emitting
the `Attestation` event. A schema with no validator cannot be attested
under (`ValidatorNotSet` revert).

Per-schema validators live in `src/schemaValidators/` and ABI-decode
content (no on-chain JSON parsing). They are pure / view contracts.

## Schema-spec format

Lives off-chain as JSON at the URI hashed into `SchemaRegistry.uriHash`.
Built-in specs ship in `sdk/src/schemas/examples/` and
`frontend/lib/shared/schemas/` (the application's working copy).

## The 17 protocol schemas

16 runtime-attestable schemas (each with a Layer C validator) plus the
manifest-only `figaro-topology-v1`.

| schemaId | What it carries | Attestation surface |
|---|---|---|
| `figaro-topology-v1` | DAG lineage (parent order hashes) | **Manifest-only** (no runtime validator) |
| `figaro-commerce-v1` | Currency, payment, line items | Layer A + C |
| `figaro-geo-v2` | Origin / destination geohash + mass + volume + class of service | Layer A + C |
| `figaro-fulfilment-v2` | Fulfilment method — modality + coordination + handoff point | Layer A + C |
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
| `figaro-jurisdiction-v1` | Off-chain dispute-resolution jurisdiction (applicable law + forum + language) — baseline graph per Paper E | Layer A + C |
| `figaro-consent-v1` | Cryptographic acceptance of an off-chain document (hash + version + title) — supports beta consent, ToS acceptance, governance vote receipts, etc. (`consent` family) | Layer A + C |

The five `figaro-ghg-<standard>-v1` entries are sister schemas — one per
accounting standard. Standard identity lives in the schemaId; the content
shape is `(uint8 scope)` for all five and the encoder (`encodeGHGScopeContent`)
is shared. Per-standard extensions (reporting boundaries, period, etc.) can
be added to a single sister schema's validator without affecting siblings.

`figaro-proximity-policy-v1` + `figaro-proximity-proof-v1` are sister
schemas that split the committed-vs-runtime concerns the way
GHG-disclosure + GHG-measurement do for emissions. Policy commits the
required band at agreement signing (Category-2, byte-equality enforced);
proof carries the per-handoff nonce + signed witness payload at runtime
(Category-1, fresh per attestation). Off-chain consumers verify
`proof.band == policy.band` when the policy section is present.

`figaro-topology-v1` is the one **manifest-only** schema — no Layer C
validator and no SP1 encoder. That is by design: an order's parent edges are
fixed at agreement-signing time and are never re-asserted as a runtime
attestation, so there is no per-event content for a validator to gate. It is
*not* off-chain-only, though. Like every agreement section, the topology
section is a merkle leaf under the on-chain `agreementHash`, inclusion-provable
via OpenZeppelin `MerkleProof` (`computeSectionLeaf` / `buildSectionInclusionProof`
in `frontend/lib/core/agreementManifest.ts`). "No runtime validator" is not "no
on-chain verification" — topology is verified by inclusion proof against the
signed agreement, not by an attestation validator. The DAG itself is
reconstructed off-chain by indexers reading topology sections from the signed
manifest.

## When something deserves a schema — payload vs anchor

A schema is an *anchored artifact family*: an off-chain definition whose
meaning must stay stable across parties, tools, and time, anchored on-chain by
a minimal reference point — `schemaId` + `uriHash` in `SchemaRegistry`, plus
the Layer C validator. Not every value that flows through an order deserves
one.

Separate two kinds of data:

- **Per-instance payloads** — operational values attached to one order: a
  specific delivery manifest, a sealed address, notes for a single fulfilment
  event. Often private, instance-specific, decoded by one app's client. These
  stay as order payload bytes; they do NOT get a schema.
- **Shared reference semantics** — definitions whose meaning must hold across
  counterparties and over time: a disclosure standard, a methodology
  reference, a manifest *format*. These are what a schema anchors.

**The decision rule.** Before proposing a schema, ask: *does the protocol need
this fact to preserve shared reference integrity across counterparties and over
time?* If yes, it is an anchored artifact family — give it a schema. If no, it
is a per-instance payload — keep it off-chain, referenced immutably, and do not
register it.

**Bounded generality.** A schema should be generic enough to be reused across
the parties and tools that need it, and no more. Avoid both failure modes: an
app-specific one-off that can never become a shared protocol concept, and a
fake universal ontology that registers every document as a first-class object.
The schema layer stays grounded in concrete coordination problems — process
obligations, disclosures, verifiable reference integrity — not in possibility.

Schemas are one artifact family among several (operators, assemblies); each
family carries its own anchor and never nests inside another — see CLAUDE.md
"Separation of Concerns — Artifact Families". Schema identity is append-only
(Layer C above): new meaning is a new `schemaId`, never a mutation of an old
one.

## Adding a new schema — checklist

1. JSON spec in `sdk/src/schemas/examples/<schema>.json`.
2. Mirror in `frontend/lib/shared/schemas/<schema>.json` (preloaded by `schemaSpecSource`).
3. SDK content encoder in `sdk/src/schemas/encode.ts` + export from `index.ts`.
4. SDK examples test in `sdk/tests/schemas/examples.test.ts`.
5. Solidity `Foo<Schema>V1Validator.sol` in `src/schemaValidators/`. Validate function MUST be declared `external pure override` (no external state reads, no `block.*`/`tx.*`, no external calls). Use `bytes32 public constant override schemaId = keccak256("...")` so the schemaId is a compile-time literal — `immutable` constructor-set schemaIds force the override to `view` and forfeit the EVM-enforced determinism guarantee. See `ISchemaValidator` NatSpec for the rationale.

   **When to add an operator-process schema vs not** (kernel-participant vs off-chain-operator principle): an off-chain operator needs its own process schema if and only if its state transitions are off-chain. Off-chain operators (merchants, couriers, locker operators, etc.) need a process schema because their state transitions happen in physical reality and need a sovereign event log to be tamper-proof evidence. Kernel participants — most importantly the **buyer**, who acts via `commit` and `resolveProcess` — do NOT need a process schema; their evidence IS the kernel event log itself. `merchant-process` and `courier-process` are sovereign-log primitives in this sense. Don't add `figaro-buyer-process-v1` — it would duplicate kernel events. Do add a process schema for any new off-chain operator whose internal events need to be on-chain attestable. The schema-category taxonomy carries this as the `operator-process` category (see `frontend/lib/shared/schemaCategories.ts`).
6. Foundry test in `test/schemaValidators/`.
7. Rust mirror at Layer B is generic (`prover/schema/`). A new schema does
   NOT require a new Rust file — Layer B parses any spec at runtime from
   its JSON. Adding a per-schema content-encoder helper to Layer B is only
   needed when a downstream Rust consumer wants strongly-typed content
   (the SP1 prover guest, for instance, can pass through serde_json::Value).
8. List the schema + one-line summary on `/builders` "Schema validators in force".
9. `setValidator(schemaId, validator)` call added to `script/Deploy.s.sol` and `script/DeployMainnet.s.sol`; regression covered by `test/DeployScriptTest.t.sol`. (Bootstrap-time atomicity: the deploy scripts inline schema registration + validator binding within a single broadcast transaction. Post-deploy third-party schemas should use `SchemaRegistrationHelper.registerSchemaAndValidator(...)` instead — see "Third-party schema deployment" below.)

If any step is skipped the validator gate either rejects all attestations under that schemaId
(missing on-chain validator) or silently accepts content the spec would have rejected (Layer A
gap). Maintain lockstep.

## Third-party schema deployment — atomic register+bind required

`SchemaRegistry.registerSchema` and `AttestationCoordinator.setValidator` are
independent permissionless writes. The 16 reference figaro-* schemas are bound
inside a single transaction by `script/Deploy.s.sol:_deployAndRegisterValidators`,
so no front-running window exists at genesis.

For any **third-party schema** registered post-deploy, the schema author MUST
perform both writes in a single transaction. The recommended path is
**`SchemaRegistrationHelper.registerSchemaAndValidator(schemaId, version, uriHash, validator)`**
— a stateless, no-admin helper contract deployed alongside the protocol that
composes the two underlying public calls atomically. Alternative paths: a
custom deploy script, or a wallet multicall covering both writes.

Two separate transactions exposes a window where any address can `setValidator`
under the new schemaId with a malicious validator that self-attests the correct
`schemaId()`, capturing the binding permanently (binding is immutable
first-write-wins). The validator's `validate()` logic is not constrained at
binding time, so a self-attesting malicious validator passes
`InvalidValidatorBinding` and becomes the gate forever.

This is deployment discipline, not a protocol gap. See
`docs/v5/DESIGN_DECISIONS.md` #13 for the full rationale and the rejection of
admin-based mitigations.

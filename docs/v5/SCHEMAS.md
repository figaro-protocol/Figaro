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
   `AttestationContentProof { content_json, schema_spec }`. Four
   gates run inside the proof:
     1. `parse_schema_spec(schema_spec).schemaId` keccak-256s to
        `schema_id` — the right spec is being applied.
     2. `validate_content(content_json, spec, stage)` returns `Ok` —
        the structured form satisfies the schema.
     3. `encode_content_for_schema(spec.schemaId, content_json)`
        derives canonical ABI bytes (byte-for-byte equivalent to
        viem's `encodeAbiParameters` in `sdk/src/schemas/encode.ts`).
        This is the **cross-form binding** — the bytes Layer C decodes
        are derived *from* the JSON Layer B validates, so they describe
        the same content by construction. No separate `content_bytes`
        field exists; it would have allowed the caller to disagree
        with `content_json` and is now impossible.
     4. `keccak256(derived_bytes) == content_ref` — binds the canonical
        bytes to the on-chain commitment value.
   The `content_proof` field is optional; when `None`, the kernel
   preserves legacy content-opaque behavior (Layer C will gate the
   attestation at settlement time on chain).

2. **Off-chain sequencer** — calls `validate_content` before accepting
   attestation submissions into the batch mempool (signature gate only
   today; mirroring the kernel's content gate in the mempool is a
   tracked pre-flight hardening item).

Conformance is locked in three layers:

- `prover/schema/tests/conformance.rs` — 15 tests covering every
  shipped protocol schema parse + the 12 happy/sad content cases
  from `sdk/tests/schemas/validate.test.ts`.
- `prover/schema/tests/encode_conformance.rs` — 17 tests asserting
  per-schema canonical-encoder output is byte-for-byte equal to
  viem's `encodeAbiParameters` output for the same input (covers
  all 12 distinct encoder shapes across the 17 runtime-attestable
  schemas). Test vectors were captured from the TypeScript encoders
  via `generate_vectors.mjs`.
- `prover/lib/tests/parity.rs` — 5 kernel-integration tests
  (`attest_as_seller_with_valid_content_proof_passes`,
  `_content_hash_mismatch_fails`, `_invalid_content_fails`,
  `_schema_id_mismatch_fails`,
  `_unsupported_schema_encoder_fails`) exercising every gate inside
  `apply_batch`.

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

## The 18 protocol schemas

| schemaId | What it carries | Attestation surface |
|---|---|---|
| `figaro-topology-v1` | DAG lineage (parent order hashes) | **Manifest-only** (no runtime validator) |
| `figaro-handoff-v1` | Physical-exchange mode | Layer A + C |
| `figaro-commerce-v1` | Currency, payment, line items | Layer A + C |
| `figaro-geo-v2` | Origin / destination geohash + mass + volume + class of service | Layer A + C |
| `figaro-fulfilment-v1` | Fulfilment method (single canonical enum: modality + who-organizes) | Layer A + C |
| `figaro-ghg-protocol-v1` | GHG Protocol Corporate Standard + scope (Category-2) | Layer A + C |
| `figaro-ghg-iso-14064-v1` | ISO 14064 family + scope (Category-2) | Layer A + C |
| `figaro-ghg-pas-2050-v1` | PAS 2050 product carbon footprint + scope (Category-2) | Layer A + C |
| `figaro-ghg-en-16258-v1` | EN 16258 transport-emissions methodology + scope (Category-2) | Layer A + C |
| `figaro-ghg-custom-v1` | Custom / non-standard GHG methodology + scope (Category-2) | Layer A + C |
| `figaro-ghg-measurement-v1` | Runtime grams CO2e (Category-1) | Layer A + C |
| `figaro-proximity-policy-v1` | Required detection band committed at agreement signing (Category-2) | Layer A + C |
| `figaro-proximity-proof-v1` | Per-handoff nonce + signed witness payload at runtime (Category-1) | Layer A + C |
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
independent permissionless writes. The 14 reference figaro-* schemas are bound
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

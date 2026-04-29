# Schemas: TradeLens replacement

This file walks through which schemas the assembly needs, which already exist, and which would be authored by the `figaro-schema-author` agent. Verbatim prompts are runnable against the current agent set.

## Existing schemas (no agent work needed)

| Schema | Use in this assembly |
|---|---|
| `figaro-commerce-v1` | Per-leg payment commitment (shipper→forwarder, forwarder→carrier, etc.) |
| `figaro-geo-v1` | Pickup / drop-off geohash on every leg; vessel position updates |
| `figaro-handoff-v1` | Container handoff at every transfer point (terminal gate, vessel deck, port) |
| `figaro-jurisdiction-v1` | Customs clearance attestation by national authority |
| `figaro-courier-process-v1` | Multi-stop carrier process (the ocean carrier's internal sub-process tree) |
| `figaro-fulfilment-v1` | Final delivery to consignee |
| `figaro-ghg-protocol-v1` (or PAS-2050, ISO-14064) | Per-leg emissions disclosure on every transport edge |
| `figaro-proximity-policy-v1` + `figaro-proximity-proof-v1` | Geofence enforcement at port handoffs |

The assembly composes these. No agent work needed for the schemas above — they're already on chain.

## New schemas to author

Two candidates. The schema-author would refuse to author either if it didn't satisfy the decision rule in `docs/v5/PROTOCOL_EXTENSION_DOCTRINE.md` ("does the protocol need this fact to preserve shared reference integrity across counterparties and over time?").

### 1. `figaro-container-seal-v1`

Container seals are the integrity mechanism for ocean shipping: a uniquely-numbered seal is applied at the origin, broken only at customs or destination. Multiple parties (carrier, ports, customs, consignee) need to share a single canonical attestation of when the seal was applied, when it was inspected intact, and if it was broken.

This satisfies the decision rule: cross-party shared interpretation, stable over time, settlement-relevant (a broken seal en route is grounds for cargo rejection).

**Prompt to give the schema-author:**

```
Use the figaro-schema-author agent to draft figaro-container-seal-v1.

Purpose: attest container-seal state at every transfer point. Multiple
counterparties (carrier, port-of-loading, port-of-discharge, customs broker,
consignee) need to agree on a single canonical record of seal application,
inspection events, and breach events.

Fields (Layer A spec, closed schema):
- containerNumber: string (ISO 6346, e.g. "MSCU1234567")
- sealNumber: string
- event: enum {applied, inspected_intact, transferred, breached, removed_by_customs}
- inspectorAddress: address-hex (the wallet attesting)
- timestamp: iso-datetime
- locationGeohash: string (8-char precision)
- evidenceHash: bytes-hex (optional content hash of a photo / inspection report)

Family: argue for new family ("container-integrity") vs extending handoff. Default
to new family; the cross-party-attestation pattern is broader than
handoff-as-acceptance and could later cover seal-equivalents in other transport
modes (rail, air freight).

Verify before declaring done:
- No kernel changes.
- Validator-contract pattern: 1:1 schemaId↔contract, ABI-encoded content,
  first-write-wins.
- Forge tests cover well-formed input, every field-level revert, gas bound.
- Schema-lockstep coverage matrix shows all required surfaces present.
- Kernel-reviewer reports zero kernel-tier touches.
```

What you'd see the schema-author do:
1. Read `PROTOCOL_EXTENSION_DOCTRINE.md` and the kernel-discipline skill in full.
2. Argue out loud whether the schema satisfies the decision rule (yes, in this case).
3. Write `frontend/lib/shared/schemas/figaro-container-seal-v1.json`, `sdk/src/schemas/encode.ts` additions, `src/schemaValidators/FigaroContainerSealV1Validator.sol`, Foundry tests, registration script entry, and listing-page references.
4. Run forge / halmos / vitest / type-check.
5. Print a verification report and **not** commit. Return control to the main session.

### 2. `figaro-bol-issuance-v1` — bounded scope

A bill of lading (BoL) is the carrier's receipt of cargo. It functions as a contract of carriage and as a document of title (transferable in the negotiable case). The transferability question is parked per `project_bol_transferability_parked.md` — current working hypothesis is that BoL transferability lives at the application layer via `CancellableSeller` wrappers and counter-processes, not as a kernel-layer schema.

So the schema-author should be asked for a *non-transferable* BoL anchor — just an immutable record of issuance, not a transferable document of title.

**Prompt:**

```
Use the figaro-schema-author agent to draft figaro-bol-issuance-v1.

CRITICAL: this schema must NOT support transferability. Read
project_bol_transferability_parked.md before proposing. Transferability is
parked as application-layer composition (CancellableSeller + counter-process);
do not encode transfer logic into the schema. If the proposal naturally drifts
toward transferability fields (bearer flag, endorsee, etc.), refuse and
explain.

Purpose: anchor the carrier's issuance of a BoL on chain so the carrier and
shipper share a canonical record of the carriage contract.

Fields (Layer A spec):
- bolNumber: string (carrier's reference)
- shipper: address-hex
- consignee: address-hex (or bytes-hex for an off-chain identifier when the
  consignee isn't on chain at issuance)
- carrier: address-hex
- vessel: string
- voyage: string
- portOfLoading: string (UN/LOCODE)
- portOfDischarge: string (UN/LOCODE)
- containerNumbers: array of string
- issueDate: iso-datetime
- carriageContractHash: bytes-hex (off-chain document hash)

Family: shipping-document (new family; possibly extended later for AWB / rail
waybill / SeaWaybill).

Verify as in the container-seal prompt above.
```

If you ask for transferability features, the agent would refuse and refer to `project_bol_transferability_parked.md`. That refusal is the security-first posture working as designed.

## What the schema-author would refuse

For this assembly, the schema-author would refuse:

- Any change to `src/FigaroCore.sol` or `src/CommitmentTypes.sol` (e.g., "add a multi-currency-process feature so we can bond shipper-side in USD and consignee-side in EUR"). Multi-currency-within-one-process is a kernel anti-pattern (per `CLAUDE.md`), and the agent would cite it.
- Any in-place edit of an existing schema (e.g., "extend `commerce-v1` with maritime-specific fields"). Append-only identity rules: a new version means a new schemaId.
- A schema with mutable freeform text or large on-chain payloads (>~1KB).
- A schema with admin / pause / upgrade hooks.

These refusals are the value-add. Without them, you'd write a working schema that quietly weakens the equilibrium.

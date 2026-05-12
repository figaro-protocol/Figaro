# Schemas: TradeLens replacement

This file walks through which schemas the assembly needs, which already exist, and which would be authored by the `figaro-schema-author` agent. Verbatim prompts are runnable against the current agent set.

## Existing schemas (no agent work needed)

| Schema | Use in this assembly |
|---|---|
| `figaro-commerce-v1` | Per-leg payment commitment (shipper→forwarder, forwarder→carrier, etc.) |
| `figaro-geo-v2` | Pickup / drop-off geohash on every leg + cargo mass + volume + class; vessel position updates |
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

### 3. `figaro-incoterms-2020-v1` — Figaro-native, not pure-INCO

INCO Terms (Incoterms® 2020 from the ICC) are the international trade vocabulary for risk-transfer points and cost allocation across legs of a shipment: EXW, FCA, CPT, CIP, DAP, DPU, DDP, FAS, FOB, CFR, CIF. Useful as cross-party shared reference, but **traditional INCO Term semantics come from a context without Figaro's six invariants** and may not all map cleanly. Specifically:

1. **INCO Terms encode discretionary risk transfer** ("risk transfers at point X"). In Figaro, risk follows bond — the bonded party is at stake until they perform per the agreed clauses. There is no separate "risk transfer" concept; performance is what the chain attests.
2. **INCO Terms separate "who pays for transport" from "who bears risk during transport."** In Figaro, both follow from process structure: a party who bonds for a sub-process is the buyer of that sub-process. Risk and cost are not independent variables.
3. **Buyer dominance changes the resolution model.** INCO Terms assume good-faith resolution between parties; Figaro encodes buyer-dominance + MAD as the equilibrium that produces good-faith resolution. Some terms' implicit dispute-resolution paths may not transfer.

The right schema is therefore **not "INCO term as a traditional contract clause" but "INCO term as a reference to a Figaro-native delivery-clause specification."** The schema anchors the term + named place; the term-to-delivery-clause mapping is verified against the kernel code, *per term*, and lives in the validator contract + an off-chain reference document.

**This is also the canonical worked example for the agent's code-canonical discipline.** Before drafting fields, the schema-author MUST read `src/FigaroCore.sol`, `src/CommitmentTypes.sol`, and `formal/FigaroCore.tla` — and verify each of the 11 Incoterms 2020 codes against the actual kernel mechanics. State which terms map cleanly, which require composition (e.g., CIF/CIP's insurance feature → separate insurance process), and which do not transfer.

**Prompt:**

```
Use the figaro-schema-author agent to draft figaro-incoterms-2020-v1.

CRITICAL: do not assume INCO Terms map cleanly to Figaro. Standardization
in the traditional system is not a proxy for compatibility with Figaro's
invariants. Some terms or term-features may require composition (parallel
processes) or may not transfer at all (any discretionary recovery path
that overrides buyer dominance, any feature that splits resolution
authority, any mechanism that depends on cross-process atomicity).

Step 0 must include reading IN FULL:
- src/FigaroCore.sol           (kernel: 2 external functions, 3 mappings)
- src/CommitmentTypes.sol       (structs and EIP-712 hashing)
- formal/FigaroCore.tla         (the six invariants formally)

Then for each of the 11 Incoterms 2020 codes (EXW, FCA, CPT, CIP, DAP,
DPU, DDP, FAS, FOB, CFR, CIF), verify against the kernel code:
  1. What handoff-v1 attestation triggers seller release per the term's
     delivery-clause meaning?
  2. What auxiliary clauses (customs, insurance, unloading) does the
     term require?
  3. Does the term assume any discretionary feature (timeouts,
     fault-based recovery, third-party arbitration with override
     authority) that Figaro's invariants do not support?
  4. Map directly | requires composition | does not transfer.

Include this per-term verification as a structured table in your output
report. The reviewer will audit it against the kernel code.

Schema fields (Layer A spec):
- term:         enum {EXW, FCA, CPT, CIP, DAP, DPU, DDP, FAS, FOB, CFR, CIF}
- namedPlace:   string (every Incoterm requires a named place)
- placeGeohash: string (8-char) — for cross-reference with geo-v1

The schema anchors the term + place. The validator contract MUST NOT
encode per-term semantics in Solidity; those live in:
- the off-chain ICC publication (canonical text)
- a runtime term-to-delivery-clause table in frontend/public/schemas/

This split lets future Incoterms revisions ship as new schemaIds
(figaro-incoterms-2030-v1, etc.) without mutating prior anchors.

Verify before declaring done:
- No kernel changes.
- Validator-contract pattern: 1:1 schemaId↔contract, ABI-encoded
  content, first-write-wins.
- Forge tests cover well-formed input, every field-level revert, gas
  bound. Per-term mapping verification report attached to PR.
- Schema-lockstep coverage matrix shows all required surfaces present.
- Kernel-reviewer reports zero kernel-tier touches.
```

What the schema-author would do (and what the verification report would surface):

1. Read `src/FigaroCore.sol` IN FULL. State explicitly: "kernel has X external functions at lines Y…Z; commit() takes parameters …; resolveProcess() takes parameters …."
2. Walk through each of the 11 codes against this. Likely outcomes (subject to actual verification — which is the point):
   - **EXW, FCA, DAP, DPU, DDP, FAS, FOB**: probably map directly. Each becomes a delivery-clause spec — handoff-v1 attestation at named place, possibly with auxiliary clauses (customs for DDP, unloading for DPU).
   - **CPT, CFR**: map structurally. The "seller pays carriage" feature becomes a separate sub-process where the seller is buyer of carriage. The "risk transfers at first carrier" feature becomes the goods-commit's delivery-clause spec.
   - **CIP, CIF**: same as CPT/CFR + the "seller insures for buyer's benefit" feature. Insurance assignment may not transfer directly — likely requires composition with a parallel insurance process. The schema-author should flag this and propose the composition.
   - Anything that implies discretionary fault recovery or split resolution authority: refuse.
3. Produce the schema only after the per-term verification table is in the report.

The point of the verification step: traditional commercial vocabulary smuggles in assumptions. The agent exists specifically to catch this. Anchor the reference; don't import the assumptions.

## What the schema-author would refuse

For this assembly, the schema-author would refuse:

- Any change to `src/FigaroCore.sol` or `src/CommitmentTypes.sol` (e.g., "add a multi-currency-process feature so we can bond shipper-side in USD and consignee-side in EUR"). Multi-currency-within-one-process is a kernel anti-pattern (per `CLAUDE.md`), and the agent would cite it.
- Any in-place edit of an existing schema (e.g., "extend `commerce-v1` with maritime-specific fields"). Append-only identity rules: a new version means a new schemaId.
- A schema with mutable freeform text or large on-chain payloads (>~1KB).
- A schema with admin / pause / upgrade hooks.

These refusals are the value-add. Without them, you'd write a working schema that quietly weakens the equilibrium.

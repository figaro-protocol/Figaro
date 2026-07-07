# Assembly: TradeLens replacement

The DAG of bonded commitments that makes this a shipping protocol rather than a generic Figaro deployment. Composed on the designer canvas by a human, or scaffolded by the `figaro-assembly-author` subagent — see the authoring note at the end.

## DAG

ASCII sketch of the canonical export-import flow:

```
                   shipper (origin)
                       │
                       │  commerce-v1 + bol-issuance-v1
                       ▼
                  forwarder
                       │
                       │  commerce-v1 + bol-issuance-v1
                       ▼
                ocean carrier ──────────┐
                /                        │
               /  port-handoff           │  emissions-disclosure
              /   (handoff-v1 +          │  (ghg-protocol-v1)
             /    container-seal-v1)     │
            ▼                             ▼
   port-of-loading                    (consumed at resolution
   (terminal services)                 for sustainability audit)
            │
            │  vessel-position stream (geo-v1)
            ▼
   port-of-discharge
   (terminal services)
            │
            │  jurisdiction-v1 (customs clearance)
            ▼
   customs broker
            │
            │  handoff-v1 + last-mile commerce-v1
            ▼
   trucking
            │
            │  handoff-v1 (delivery receipt)
            ▼
   consignee
```

## Per-edge mechanism

| Edge | Mechanism | Notes |
|---|---|---|
| shipper → forwarder | bilateral commit (commerce-v1) + incoterms-2020-v1 clause | INCO term encodes the delivery-clause spec; per-term mapping verified against kernel code (see `clauses.md` § 3) |
| forwarder → carrier | bilateral commit (commerce-v1) + incoterms-2020-v1 clause | Often a different INCO term than shipper-leg (forwarder may use FCA upstream, CPT downstream) |
| carrier → port-of-loading | bilateral commit (rate-based: terminal tariff × moves) | Carrier procures terminal services at the published tariff |
| carrier ↔ port-of-discharge | bilateral commit (rate-based) | Discharge-side procurement |
| port → carrier (handoff) | handoff-v1 + container-seal-v1 (intact) | Off-chain process, on-chain attestation |
| carrier → consignee (BoL) | bol-issuance-v1 attestation | Anchor only; non-transferable per parked research |
| consignee → customs broker | bilateral commit (commerce-v1) | Customs clearance services |
| customs broker → customs authority | jurisdiction-v1 attestation | Customs is sovereign — *not* a Figaro counterparty, only an attestation source |
| trucking → consignee | bilateral commit + handoff-v1 | Last mile |

**Note on INCO Terms.** Each `commerce-v1` commit on a transport leg carries a `figaro-incoterms-2020-v1` clause specifying the term and named place. The term is a reference, not a behavior — the clause's validator anchors the (term, namedPlace) pair, and the runtime maps each term to a Figaro-native delivery-clause specification (handoff-v1 attestation at the named place, plus auxiliary clauses for customs / insurance / unloading where the term requires them). Some term features (e.g., CIP/CIF insurance assignment) may require composition with a parallel insurance process rather than direct encoding. See `clauses.md` § 3 for the agent's code-canonical verification posture.

## Per-node clauses

Order nodes carry clauses — clause-typed obligations that must be discharged for the order to be resolvable.

**Shipper-side (origin order):**
- handoff-v1: forwarder must attest receipt before resolution
- ghg-protocol-v1: emissions disclosure required for sustainability audit (optional clause; omitted if shipper hasn't elected)

**Forwarder-side:**
- handoff-v1 (incoming from shipper)
- handoff-v1 (outgoing to carrier)
- bol-issuance-v1 (carrier issues, forwarder counter-signs)

**Carrier-side (the big one):**
- container-seal-v1 sequence: applied → inspected_intact (per port handoff) → removed_by_customs
- vessel-position attestation every N hours (geo-v1 with 8-char geohash)
- ghg-protocol-v1: per-voyage emissions
- handoff-v1: at every port

**Consignee-side:**
- jurisdiction-v1: customs clearance attestation
- handoff-v1: physical receipt confirmation

## Bond posture

Each leg's bond is computed from the leg's value. Asymmetric bonding scales naturally — when the carrier sub-contracts to a port operator, the carrier is the *buyer* of port services and posts buyer bonds at that sub-process. Cumulative upstream bonding composes the legs without compounding the bond requirement explosion.

For a $20K shipment with $5K terminal handling at each port and $1K customs clearance:

- Shipper buyer-bond at top: 2 × $20,000 = $40,000
- Carrier seller-bond at top: 2 × $20,000 = $40,000 (cumulative service value)
- Carrier buyer-bond at port-of-loading sub-process: 2 × $5,000 = $10,000
- Port-of-loading seller-bond: 2 × $5,000 = $10,000
- ...and so on at each sub-process

These compose without the kernel needing to know about the structure beyond the local bilateral. That's the point of the primitive.

## Authoring this DAG

Draw it on the designer canvas at `/builders/designer/new`, or have the `figaro-assembly-author` subagent emit it as `DesignDraft` JSON. The subagent is newer and less battle-tested than the clause-author — treat its output as a draft to review against this file.

What the subagent does:

1. Reads the protocol's existing clauses and proposes a composition.
2. Emits a DAG with typed edges and clauses.
3. Produces sample bond budgets given a parameterized shipment value.
4. Refuses to compose anything that requires a kernel change (no multi-currency cross-leg, no centralized resolution).
5. Cites `CLAUSES.md` for any new clauses it identifies as needed; defers their authorship to `figaro-clause-author`.

This `assembly.md` file is a reference target for it.

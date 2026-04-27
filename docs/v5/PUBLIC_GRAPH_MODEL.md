# Public Graph Model — Design Decision

Status: active conceptual model. For the current codebase reading path and
archive boundaries, start with [CURRENT_STATE.md](CURRENT_STATE.md).

This document names and defines the five semantic graphs that emerge from the
Figaro protocol and its extensions. These graphs are **intentionally public
coordination infrastructure**, not accidental data leakage.

---

## The Five Graphs

Every Figaro institution produces up to five distinct graphs. Each graph has
its own truth boundary, purpose, and consumer profile.

### 1. Process Graph (Protocol-Enforced)

**Source:** `FigaroCore` — orders, bonds, process trees, settlement.

The process graph records who committed to what, under what economic terms,
and whether the commitment was fulfilled. It is the only graph directly
secured by asymmetric bonding.

**Contents:** Order nodes, buyer/seller roles, payment/bond amounts, process
tree topology, and commitment/resolution state.

**Truth boundary:** Protocol-enforced. Every node is economically backed.
Defection is costly; the graph is tamper-proof by design.

### 2. Manifest / Geo Graph (Institution-Declared)

**Source:** Manifest payloads on orders, geohash fields in delivery details.

The geo graph encodes **where** coordination happens: pickup locations,
delivery drop-off zones, and service areas. This data is public by design
— it serves as "economic pheromones" (see THEORY.md §Philosophy) that allow
autonomous agents (human or AI) to discover, filter, and route work.

**Contents:** Pickup geohashes, drop-off geohashes, manifest metadata,
cuisine/category tags.

**Truth boundary:** Institution-declared. The runtime encodes this data; the
protocol does not validate geographic accuracy. Economic pressure (bonding)
incentivizes accuracy: a seller that lies about its location loses demand and
bonds.

**Privacy model:** Geohashes are intentionally public. They are coordination
signals, not secrets. Private delivery details (exact address, apartment
number, recipient notes) are encrypted per-order and exchanged via XMTP
(see XMTP_KEY_EXCHANGE.md). The public geohash reveals a zone (~1.2km × 0.6km
at 6 chars), not a doorstep.

### 3. GHG / Disclosure Graph (Protocol-Derived)

**Source:** `SchemaRegistry`, `AttestationCoordinator`, and content-addressed
off-chain disclosure artifacts.

The GHG graph overlays environmental disclosure onto the process graph.
Reporting entities open boundaries, buyers create per-order requirements,
and sellers submit disclosure references — all anchored to the same process
tree that enforces economic coordination.

**Contents:** Schema registrations, reporting boundaries, order-level
requirements, seller disclosure submissions.

**Truth boundary:** Protocol-derived. The anchoring is on-chain (immutable
schema references, timestamped submissions), but the disclosure content
itself lives off-chain. The protocol ensures *referential integrity*, not
*substantive accuracy*. See ANCHORED_ARTIFACT_DESIGN.md in Prototype2.

### 4. Capital Graph (Protocol-Enforced)

**Source:** Bond mechanics in `FigaroCore`, auction clearing in
`DutchAuction`.

The capital graph tracks where economic value flows: bonds locked, payments
settled, auction clearing prices.

**Contents:** Bond amounts per order, settlement payouts, auction clearing
prices.

**Truth boundary:** Protocol-enforced. All capital flows are on-chain and
verified by contract invariants.

### 5. Cross-Process Graph (Protocol-Derived)

**Source:** Published assembly metadata, agreement/publication links, and
protocol-linked attestations that connect one process context to another.

The cross-process graph connects independent process trees via provenance
links — enabling process provenance, template reuse, and multi-institution
coordination.

**Contents:** Template commitments, settlement provenance links, cascade
attestations.

**Truth boundary:** Protocol-derived. Links are on-chain attestations, but
the semantic meaning ("this delivery fulfills that purchase order") is
institution-declared.

---

## Why Public?

The protocol's enforcement model (THEORY.md) requires economic pressure to
replace trust. Economic pressure requires **visibility**: agents must see
what work is available, where demand exists, which sellers are reliable,
and how processes interconnect.

Making these graphs public enables:

1. **Autonomous coordination** — AI agents and human operators discover
   work through graph queries, not platform-mediated matching.
2. **Heat maps and demand prediction** — Geohash clusters reveal demand
   patterns without exposing individual transaction details.
3. **Routing optimization** — Delivery agents optimize paths from public
   pickup/drop-off zones.
4. **Reputation derivation** — Settlement history, on-time rates, and
   disclosure compliance can be computed from public graph data.
5. **Cross-institution interoperability** — Other archetypes (not just Local Commerce)
   can consume the same graphs for their own coordination logic.

This is the "economic pheromones" model: coordination signals left by
participants that other agents learn from, without centralized orchestration.

---

## What Is Not Public

Private delivery details (exact street address, apartment number, recipient
phone, special instructions) are never stored on-chain. They are:

1. Encrypted with a per-order AES key at checkout
2. Stored in the manifest's encrypted fields
3. Exchanged via XMTP between buyer and assigned driver only
4. Decryptable only by the buyer and the assigned driver for that specific order

See XMTP_KEY_EXCHANGE.md for the full key exchange architecture.

---

## Graph Separation in the UI

When rendering these graphs, the frontend should present them as distinct
semantic layers — not as one blended application surface. Each graph has a
different trust model, update frequency, and audience:

| Graph | Trust Model | Primary Consumer | Update Frequency |
|-------|-------------|------------------|------------------|
| Process | Protocol-enforced | All participants | Per lifecycle event |
| Geo | Institution-declared | Drivers, agents, analytics | Per order creation |
| GHG | Protocol-derived | Reporters, auditors | Per disclosure event |
| Capital | Protocol-enforced | LPs, operators, analytics | Per settlement |
| Cross-Process | Protocol-derived | Process provenance tools | Per link creation |

Making these boundaries explicit in the UI — through visual separation,
labeling, or progressive disclosure — prevents users from conflating
protocol guarantees with institution-level claims.

# Public Graph Model — Design Decision

Status: active conceptual model. For the current codebase reading path and
doc map, start with [README.md](README.md).

This document names and defines the five semantic graphs that emerge from the
Figaro protocol and its compositions. These graphs are **intentionally public
coordination infrastructure**, not accidental data leakage.

---

## The Five Graphs

Every Figaro institution produces up to five distinct graphs. Each graph has
its own truth boundary, purpose, and consumer profile.

### 1. Process Graph (Protocol-Enforced)

**Source:** `FigaroCore` — orders, bonds, processs, settlement.

The process graph records who committed to what, under what economic terms,
and whether the commitment was fulfilled. It is the only graph directly
secured by asymmetric bonding.

**Contents:** Order nodes, buyer/seller roles, payment/bond amounts, process
DAG topology, and commitment/resolution state.

**Truth boundary:** Protocol-enforced. Every node is economically backed.
Defection is costly; the graph is tamper-proof by design.

### 2. Geo Graph (Institution-Declared)

**Source:** Off-chain payloads on orders, geohash fields in delivery details.

The geo graph encodes **where** coordination happens: pickup locations,
delivery drop-off zones, and service areas. This data is public by design
— it serves as "economic pheromones" (see THEORY.md §Philosophy) that allow
autonomous agents (human or AI) to discover, filter, and route work.

**Contents:** Pickup geohashes, drop-off geohashes, off-chain metadata,
free-form specialty tags.

**Analytics clauses composed by default are intentional incentive design, not
noise.** The RPGF weighting (below) pays clauses that feed the public analytics
graphs — geo, value, topology — so `figaro-geolocation` staying on assemblies
like direct-sale even when a consume-onsite sale ships nothing is deliberate:
geo is graph data locating the exchange, not delivery metadata. Optionality
lives at assembly-composition level — a seller who won't track geo doesn't bind
a geo-bearing assembly. Do not flag default-on analytics clauses as drift.

**Truth boundary:** Institution-declared. The runtime encodes this data; the
protocol does not validate geographic accuracy. Economic pressure (bonding)
incentivizes accuracy: a seller that lies about its location loses demand and
bonds.

**Privacy model:** Geohashes are intentionally public. They are coordination
signals, not secrets. Private delivery details (exact address, apartment
number, recipient notes) are encrypted per-order and exchanged out-of-band.
The public geohash reveals a zone (~1.2km × 0.6km
at 6 chars), not a doorstep.

### 3. GHG / Disclosure Graph (Protocol-Derived)

**Source:** `ClauseRegistry`, `AttestationCoordinator`, and content-addressed
off-chain disclosure artifacts.

The GHG graph overlays environmental disclosure onto the process graph.
Reporting entities open boundaries, buyers create per-order requirements,
and sellers submit disclosure references — all anchored to the same process
DAG that enforces economic coordination.

**Contents:** Clause registrations, reporting boundaries, order-level
requirements, seller disclosure submissions.

**Truth boundary:** Protocol-derived. The anchoring is on-chain (immutable
clause references, timestamped submissions), but the disclosure content
itself lives off-chain. The protocol ensures *referential integrity*, not
*substantive accuracy*. See `CLAUSES.md` §"When something deserves a clause — payload vs anchor".

### 4. Settlement Graph (Protocol-Enforced)

**Source:** Bond and settlement events in `FigaroCore`.

The settlement graph is the per-order record of kernel settlement events:
bonds locked at commit, payouts at resolve. It is LINEAR per process — the
kernel's own view (a chain of commits against a monotonic cumulative-value
accumulator). It carries no topology: how orders relate as a DAG is the
process graph's business, reconstructed off-chain, and the two layers are
independent of one another. (This entry was formerly named the "capital
graph" — a name that collapsed the linear bond record into the topology
layer and read bonds as capital; bonds are deterrents.)

**Contents:** Bond amounts per order, settlement payouts.

**Truth boundary:** Protocol-enforced. Every bond and payout is on-chain and
verified by contract invariants.

### 5. Cross-Process Graph (Protocol-Derived)

**Source:** Published assembly metadata, agreement/publication links, and
protocol-linked attestations that connect one process context to another.

The cross-process graph connects independent processs via provenance
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

1. **Autonomous coordination** — AI agents and human sellers discover
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

## Why the substrate-broadening weight exists — the geo/coordination incentive

This section is load-bearing. Without it, the RPGF `w_category` weight
(`FLORIN_TOKEN.md`) reads as an unexplained category privilege in a
neutrality-preaching system, is mistaken for closed-world cruft, and is removed.
It is not cruft. (The `lint-substrate-broadening-weight.sh` guard that once kept
parallel formula files in sync was retired with the RPGF prover; the 2026-07-15
optimistic rebuild replaced enforcement with derivation — the weight now lives in
exactly ONE artifact, `sdk/src/rpgf/formula.json`, anchored on-chain as
`RpgfMinter.formulaHash`, and the reference implementation derives every constant
from it, so there are no parallel copies left to drift.)

**The must-haves see value, not place.** Every Figaro agreement composes the core
protocol plus two clauses present in essentially all of them: **topology** (the
value-added chain — who comes before whom) and **commerce** (who pays whom, in what
token, how much). From these alone the network emits its economic skeleton by
construction — who paid whom, in what denomination, for how much, who the parties
in the value-added process are, and how value accumulates (the Process and Capital
graphs above). That skeleton is complete on its own.

**What it cannot see is *where*.** The must-haves record *that* value was added and
*by whom* — never the **physical or virtual flow** of the work: where a pickup
happened, where a hand-off occurred, which zones a service covers, how goods and
signals actually moved. That flow-map is not derivable from payment and topology;
it must be *attested* by clauses that carry it — geolocation, proximity, hand-off.
It is the Geo graph above, and nothing forces it into existence.

**So the protocol pays more for the clauses that draw the map.** To make the
flow-graph exist, the substrate-broadening formula weights a **category of work** —
the physical/virtual-flow article groups — above the rest (`w_category = 3.0`).
The tier-1 article set is finalized by formula v1 as **logistics + coordination**
(`sdk/src/rpgf/formula.json`, the canonical artifact `RpgfMinter.formulaHash`
anchors). The group is read as `block.article` from the contentHash-verified spec
— nothing is stored on-chain (there is no `family` field; derive, don't store).
Mandatory-article clauses are excluded entirely (committed on every order, their
usage carries no signal), as is the provenance article (scoring infrastructure).
It is a deliberate incentive: contribute and use the clauses that emit
physical/virtual-flow data, and earn more of the supply reserved for the
substrate's contributors — clause authors and assembly designers of record.

**This privileges a kind of public good, not a set of authors.** The weight attaches
to the *article group*, never to a wallet: any author who registers a clause under a
tier-1 article inherits the boost — permissionlessly, no committee, no application.
The formula is fixed and discretion-free — *the same rule for every author* — and
that rule happens to reward the data the network most needs. Procedural neutrality
(no one decides who deserves what) and a non-flat weighting (some work is worth more
to the substrate) are not in tension. Conflating them is the **neutrality ≠
flat-weighting error** — and the error that keeps getting this deleted.

**The objective is a public, verifiable god's-eye view.** Aggregated over time,
these attestations form a heat-map of physical/virtual flows — demand clusters,
routes, service areas — every datum emitted by event, content-addressed,
independently verifiable. No operator owns it; the bonds securing each order give
participants reason to attest accurately.

**The payoff is the point.** Today the map of who-moves-what-where is the private
asset on which platform companies build their value capture: they sit between
participants because they alone hold the coordination data. When that same data is
a public good — open, verifiable, permissionlessly extended, and incentivized into
existence by the protocol's own token — the informational moat dissolves. The
platforms are not attacked; the basis of their capture is simply no longer scarce.
That is what levels the field.

---

## What Is Not Public

Private delivery details (exact street address, apartment number, recipient
phone, special instructions) are never stored on-chain. They are:

1. Encrypted with a per-order AES key at checkout
2. Stored in the order's encrypted fields
3. Exchanged out-of-band between buyer and assigned driver only
4. Decryptable only by the buyer and the assigned driver for that specific order

### The private side is the owner's asset

The split above generalizes: everything the chain anchors is a fingerprint, and
the content behind the fingerprint — agreement bodies, evidence bundles, the
books a process leaves behind — stays with the wallets that produced it,
disclosed only by the owner's choice. The public graphs (see "Why Public?") are
the free public good; the private content is each owner's own asset. Because a
data sale is an ordinary trade, an owner who chooses to sell access to their
private data can already do so through the same bonded commitment as any other
sale — the content-handoff clause family names datasets and access credentials
as digital value-added, delivered over the sealed channel.

Whether a fuller VOLUNTARY DATA MARKET should form around that capacity is an
open operator question (2026-07-24), not a shipped design. The candidate under
consideration is kernel-native — data products as catalogue items, terms as a
not-yet-authored license clause, delivery over the existing sealed channel, the
sustainable product being the evolving stream rather than a snapshot. No
data-market contract exists and none is promised; nothing here changes the
posture that the protocol itself holds no user data to sell.

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
| Settlement | Protocol-enforced | Sellers, analytics | Per settlement |
| Cross-Process | Protocol-derived | Process provenance tools | Per link creation |

Making these boundaries explicit in the UI — through visual separation,
labeling, or progressive disclosure — prevents users from conflating
protocol guarantees with institution-level claims.

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

## Why the flow-map gets built — the geo/coordination incentive under a uniform reward

This section is load-bearing: it explains why the geo/coordination clauses exist and
get authored, now that the reward pays **no more for them than for any other clause.**
The reward mechanism was ratified UNIFORM on 2026-07-29 (owner: memory
`project_reward_mechanism_ratified_2026_07`): an artifact's score is its **real usage
alone** — `icbrt(c·d²·1e18)` — with **no tag, no category, no weight multiplier.** The
old "substrate-broadening weight" (`UsageCounter.BOOSTED_WEIGHT`/`BASE_WEIGHT`,
`ClauseRegistry.rpgfTag`/`rpgfTagOf`, the counter's `boostedTag`) is **deleted.**
Neutrality is now achieved by the **stake, not by weighting.**

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

**So the flow-map is built the same way everything is: by being used.** The protocol
does not pay a premium for the clauses that draw the map. It pays the same uniform
pro-rata for every clause and assembly, keyed to real usage. A geo/coordination clause
earns exactly when a real, staked seller's process invokes it — the demand for the
flow-map is the demand of the assemblies that need it, and the reward follows that
demand rather than a hardcoded category judgment. The map gets drawn because the
commerce that needs it draws it, and the author of the clause that carries it is paid
pro-rata for that real usage.

**Neutrality comes from the stake, not from the weight.** What keeps the uniform
reward honest is the two-sided **live ETH stake**, not a per-category multiplier.
Usage counts only when the process's seller-of-record
holds a live `MembersRegistry` stake (`UsageCounter` reads `MembersRegistry.registered`,
else `SellerNotStaked`), and an author is paid only while their registration deposit is
un-withdrawn (`RpgfMinter._isAuthor` requires clause `depositOf.withdrawn == false`,
assembly `bindings.depositWithdrawn == false`); withdraw and you forfeit future RPGF.
The ETH stake is a **value loop, not a cost**: more trade means more base-currency
demand for gas, so ETH appreciates in fiat for every registry staker — aligned upside,
not a fee. That is why every registry stakes in ETH: **florin is the Schelling-point
REWARD, ETH is the ALIGNMENT.** Procedural neutrality (the same uniform rule for every
author, no committee, no category) and Sybil-resistance now live in the *same*
mechanism — the stake — rather than being traded off against a non-flat weighting.

**What the stake does and does not do — state it this way, never stronger.** The stake
ALIGNS the honest majority; it does not DETER a determined Sybil, and the mechanism is
not "non-farmable". Appreciation accrues to anyone who stakes, a free-rider included.
What actually bounds farming (rulings 2026-07-31): the score's dominant term counts
DISTINCT LIVE-STAKED SELLERS, so n units of breadth cost n deposits held live — linear,
with no wallet-splitting leverage (the retired pair statistic was manufacturable on the
unstaked buyer side); the minimum-support floor (`minSellers = 3`) keeps everything one
actor can fabricate alone off the scoreboard; the withdrawal cooldown makes each deposit
serve at most P/T identities per period; the automatic EIP-1559 per-trade base-fee burn
is the one non-recoverable per-trade cost, scaling with fabricated volume and accruing
to every base-currency holder; and the 600M is a FIXED pool a farmer DILUTES rather
than inflates, in RISING tranches so the largest budgets pay on the most-measured
periods. Formally: capturing a fraction φ of a period requires attacker score
φ/(1−φ) times the honest score, at a capital cost LINEAR in that score — the
rent-dissipation bound whose closed form (and with it the derived deposit and cooldown)
is the open derivation the punch-list tracks; it is checkable at each period when both
terms are observable. The florin has no protocol-set price, so the bound is stated as
dilution per unit of attacker capital, never as a profit threshold.
[[project_reward_mechanism_ratified_2026_07]] owns the rulings.

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

The voluntary data market around that capacity is kernel-native and needs no
contract of its own (operator-ruled 2026-07-24): data products are catalogue
items; the disclosure regime for a process's own records is the composable
`figaro-data-terms` clause (designer-set regime, buyer-committed choice over
their own half); the terms of a specific sale are the `figaro-data-license`
clause (scope, purpose, snapshot-vs-stream, redistribution-as-evidence, and
process-anchored provenance — disclosed leaves verify by merkle proof against
the source process's on-chain agreementHash); delivery rides the sealed
content-handoff channel. The sustainable product is the evolving stream rather
than a snapshot. Nothing here changes the posture that the protocol itself
holds no user data to sell — the owner holds everything and chooses.

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

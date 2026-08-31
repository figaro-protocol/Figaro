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

**The class is open; the five are its named instances** (maintainer-ruled
2026-08-26). The two protocol-enforced graphs fall out of the must-have
clauses by construction; overlay graphs are spec-derived — every attestable
clause family a market composes draws its own overlay on the process spine
(Geo and GHG are the worked instances); and composition graphs are read from
the fifth-noun contracts a record touches (a swap venue's value flow, the
multisender's fiscal routing, a forum's rulings), the venues discovered from
clause fields and the deployment record, never a bundled list. A market
composing a clause or venue this document has never named draws its graph
the same way.

### 1. Process Graph (Protocol-Enforced)

**Source:** `FigaroCore` — orders, bonds, processes, settlement.

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
— it serves as "economic pheromones" that allow
autonomous agents (human or AI) to discover, filter, and route work.

**Contents:** Pickup geohashes, drop-off geohashes, off-chain metadata,
free-form specialty tags.

**Analytics clauses composed by default are intentional incentive design, not
noise.** Under the uniform reward (below) a geo/coordination clause is
usage-scored like every clause — no weighting — and it earns exactly when the
assemblies that need it are used, so `figaro-geolocation` staying on assemblies
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

**Source:** the `figaro-emissions` clause and its attestations
(`AttestationCoordinator`), referencing content-addressed off-chain
disclosure artifacts.

The GHG graph overlays environmental disclosure onto the process graph: an
order that composes `figaro-emissions` commits its disclosure terms in the
signed agreement, and sellers attest disclosure references — anchored to the
same process DAG that enforces economic coordination.

**Contents:** `figaro-emissions` sections in signed agreements, timestamped
disclosure attestations, content-addressed disclosure artifacts.

**Truth boundary:** Protocol-derived. The anchoring is on-chain (merkle-bound
agreement sections, timestamped attestations), but the disclosure content
itself lives off-chain. The protocol ensures *referential integrity*, not
*substantive accuracy*. See `CLAUSES.md` §"When something deserves a clause — payload vs anchor".

### 4. Settlement Graph (Protocol-Enforced)

**Source:** Bond and settlement events in `FigaroCore`.

The settlement graph is the per-order record of kernel settlement events:
bonds locked at commit, payouts at resolve. It is LINEAR per process — the
kernel's own view (a chain of commits against a monotonic cumulative-value
accumulator). It carries no topology: how orders relate as a DAG is the
process graph's business, reconstructed off-chain, and the two layers are
independent of one another. Bonds are deterrents, not capital.

**Contents:** Bond amounts per order, settlement payouts.

**Truth boundary:** Protocol-enforced. Every bond and payout is on-chain and
verified by contract invariants.

### 5. Cross-Process Graph (Protocol-Derived)

**Source:** Published assembly metadata, agreement/publication links, and
protocol-linked attestations that connect one process context to another.

The cross-process graph connects independent processes via provenance
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
5. **Cross-institution interoperability** — every assembly consumes the same
   graphs for its own coordination logic, whatever it is for; the kinds are
   unbounded and no one of them is the reference case.

This is the "economic pheromones" model: coordination signals left by
participants that other agents learn from, without centralized orchestration.

---

## The design instrument — three forward-looking stress tests

The 600M's design constraints are not aesthetic preferences; they are DERIVED, and
this is the instrument they are derived with (maintainer, ratified with the reward
mechanism 2026-07-29). The 600M exists to incentivize the permissionless creation of
the protocol-layer **public graphs** — the coordination commons agents and humans
(same level) learn from for free. Platforms' moat is privately holding
who-moves-what-where, reputation, and demand; make that a public good and the moat
dissolves. The kernel is fixed and neutral — **it's what we and others put in the
protocol layer that makes the difference.** Every mechanism proposal is checked
against three forward-looking stress tests:

1. **Break the platform companies** — the mechanism must work where the private
   flow-map monopoly is gone, because it built the public one.
2. **Operate post-apocalyptic** — no institutions: nothing in the path may require a
   committee, a registry authority, or a standing organization.
3. **Operate off-planet** — no Earth committee, no KYC oracle: identity-free,
   self-contained, no trusted third party.

These tests are the WORKING instrument, not decoration: they are what declined the
per-record fee routed to the DAO (inserts an institution into the identity-free
mechanical path — fails tests 2 and 3; see `DESIGN_DECISIONS.md` § "Recording has no
protocol fee and no burn"), and they are why the whole reward path is permissionless,
identity-free, and adjudication-free end to end. A future proposal that passes
benchmark reasoning but fails one of the three is wrong here.

## Why the flow-map gets built — the geo/coordination incentive under a uniform reward

This section is load-bearing: it explains why the geo/coordination clauses exist and
get authored, now that the reward pays **no more for them than for any other clause.**
The reward mechanism was ratified UNIFORM on 2026-07-29 (contract surface:
`CONTRACTS.md` § "Designer rewards"): a clause's or assembly's score is its **real usage
alone** — `icbrt(c·d²·1e18)` — with **no tag, no category, no weight multiplier.** The
old "substrate-broadening weight" (`UsageCounter.BOOSTED_WEIGHT`/`BASE_WEIGHT`,
`ClauseRegistry.rpgfTag`/`rpgfTagOf`, the counter's `boostedTag`) is **deleted.**
Neutrality is now achieved by the **stake, not by weighting.**

**The must-haves see value, not place.** Every Figaro agreement composes the core
protocol plus two clauses present in essentially all of them: **topology** (the
value-added chain — who comes before whom) and **commerce** (who pays whom, in what
token, how much). From these alone the network emits its economic skeleton by
construction — who paid whom, in what denomination, for how much, who the parties
in the value-added process are, and how value accumulates (the Process and Settlement
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
rent-dissipation bound whose closed form, and the deposit and cooldown derived from it,
is published as RPGF paper §7 (`/papers/substrate-broadening-rpgf`), the parameter values
ratified 2026-07-31; it is checkable at each period when both terms are observable. The florin has no protocol-set price, so the bound is stated as
dilution per unit of attacker capital, never as a profit threshold.
The ratified rulings are recorded in `RELEASE_READINESS.md` Task 3 and the RPGF paper (`/papers/substrate-broadening-rpgf`).

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

**A datum is a committed public field iff the mechanism needs it beyond the
two order endpoints** — bond and payment verification, document derivation
(invoice, bill of lading), or read-time and dispute verification — **and it is
committed at no finer grain than that need requires** (a neighborhood geohash
cell, never a door; a keccak hash, never the plaintext). **A datum only the
counterparty operationally needs** (door-grade address, addressee name, floor,
instructions) **travels the per-order channel** (`@figaro-protocol/sdk/handoff`),
**with a wallet-signed hash anchor on-chain for tamper evidence** — revealed to
a dispute forum by the party who holds it, verifiable against the anchor, and
crypto-shreddable until then.

Evidence follows the same pattern: the public artifact carries the coarsest
mechanism-sufficient grain (the geohash cell, hashed device identifiers) plus
the hash of the raw capture; full fidelity stays party-held for dispute-time
revelation. Raw coordinates and stable device identifiers never land on a
public artifact. Where the rule caps a public field's precision, the cap is a
protocol-tier rule, never one frontend's taste: the spec carries the structural
ceiling and every reader derives the public grain from the committed spec
(the `figaro-geolocation` spec in `clauses/` states the derivation).

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
contract of its own (maintainer-ruled 2026-07-24): data products are catalogue
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
| Composition (one per composed venue) | Composition-derived | Venue analysts, dispute readers | Per venue event |

Four trust models, and the label set is closed even though the graph class is
open (the paragraph atop this document): a composition graph's rows are read
from the composed venue's own events — a swap pool, the multisender, a forum —
true per that contract's rules, outside the kernel's guarantees. The SDK
carries these labels verbatim as `TruthBoundary` (`sdk/src/derive/truth.ts`);
a projection picks from them, never coins a new one.

Making these boundaries explicit in the UI — through visual separation,
labeling, or progressive disclosure — prevents users from conflating
protocol guarantees with institution-level claims.

The surface that implements this table is `/data/explore` (the data explorer,
`frontend/app/(app)/data/explore/`): one layer at a time, each rendered with its
own truth boundary named, the rows inside each layer derived from the record —
so the OPEN class above (one overlay per attestable clause family in use,
composition graphs per composed venue) is a census of what a corpus contains,
never a menu the frontend knows in advance.

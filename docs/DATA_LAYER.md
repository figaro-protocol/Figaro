# The Data Layer

Every process leaves a trail: what was committed, what was attested, what was
resolved. That trail is **data**, and a seam runs through it. The aggregate map is
public — free to anyone who reads the chain, and deliberately so. The private detail
belongs to the parties, who keep it sealed or sell it on their own terms.

This document states the seam and why it falls where it does. It does not enumerate
graphs. A graph is something a reader DERIVES from the data it can reach, so what
can be drawn changes as the clause registry changes; a reader composing a clause
family this document never named draws its view the same way as any other. How an
agent performs that reading is `AI_AGENT_COORDINATION.md`.

---

## The public side, and the rule that decides it

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

## The sealed side is the owner's asset

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
contract of its own: data products are catalogue items; the disclosure regime for
a process's own data is the composable
`figaro-data-terms` clause (designer-set regime, buyer-committed choice over
their own half); the terms of a specific sale are the `figaro-data-license`
clause (scope, purpose, snapshot-vs-stream, redistribution-as-evidence, and
process-anchored provenance — disclosed leaves verify by merkle proof against
the source process's on-chain agreementHash); delivery rides the sealed
content-handoff channel. The sustainable product is the evolving stream rather
than a snapshot. Nothing here changes the posture that the protocol itself
holds no user data to sell — the owner holds everything and chooses.

---

## Why the public side is public

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
4. **Reputation derivation** — resolution history, on-time rates, and
   disclosure compliance can be computed from public graph data.
5. **Cross-institution interoperability** — every assembly consumes the same
   graphs for its own coordination logic, whatever it is for; the kinds are
   unbounded and no one of them is the reference case.

This is the "economic pheromones" model: coordination signals left by
participants that other agents learn from, without centralized orchestration.

---

## The design instrument — three forward-looking stress tests

The 600M's design constraints are not aesthetic preferences; they are DERIVED, and
this is the instrument they are derived with. The 600M exists to incentivize the permissionless creation of
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
per-count charge routed to the DAO (inserts an institution into the identity-free
mechanical path — fails tests 2 and 3; see `DESIGN_DECISIONS.md` §18, "Recording costs
gas and nothing else"), and they are why the whole reward path is permissionless,
identity-free, and adjudication-free end to end. A future proposal that passes
benchmark reasoning but fails one of the three is wrong here.

## Why the flow-map gets built — the geo/coordination incentive under a uniform reward

This section is load-bearing: it explains why the geo/coordination clauses exist and
get written, now that the reward pays **no more for them than for any other clause.**
The reward is UNIFORM (contract surface: `CONTRACTS.md` § "Designer rewards"): a clause's or assembly's score is its **real usage
alone** — `icbrt(c·d²·1e18)` — with **no tag, no category, no weight multiplier.** The
old "substrate-broadening weight" (`UsageCounter.BOOSTED_WEIGHT`/`BASE_WEIGHT`,
`ClauseRegistry.rpgfTag`/`rpgfTagOf`, the counter's `boostedTag`) is **deleted.**
Neutrality is now achieved by the **stake, not by weighting.**

**The must-haves see value, not place.** Every Figaro agreement composes the core
protocol plus two clauses present in essentially all of them: **topology** (the
chain — who comes before whom) and **commerce** (who pays whom, in what
token, how much). From these alone the network emits its economic skeleton by
construction — who paid whom, in what denomination, for how much, who the parties
in the value-added process are, and how value accumulates (the Process and Settlement
graphs above). That skeleton is complete on its own.

**What it cannot see is *where*.** The must-haves show *that* value was added and
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
commerce that needs it draws it, and the designer of the clause that carries it is paid
pro-rata for that real usage.

**Neutrality comes from the stake, not from the weight.** What keeps the uniform
reward honest is the two-sided **live ETH stake**, not a per-category multiplier.
Usage counts only when the process's seller of record
holds a live `MembersRegistry` stake (`UsageCounter` reads `MembersRegistry.registered`,
else `SellerNotStaked`), and a designer is paid only while their registration stake is
un-withdrawn (`RpgfMinter._isAuthor` requires clause `depositOf.withdrawn == false`,
assembly `bindings.depositWithdrawn == false`); withdraw and you forfeit future rewards.
The ETH stake is a **value loop, not a cost**: more trade means more base-currency
demand for gas, so ETH appreciates in fiat for every registry staker — aligned upside,
not a cost. That is why every registry stakes in ETH: **florin is the Schelling-point
REWARD, ETH is the ALIGNMENT.** Procedural neutrality (the same uniform rule for every
designer, no committee, no category) and Sybil-resistance now live in the *same*
mechanism — the stake — rather than being traded off against a non-flat weighting.

**What the stake does and does not do — state it this way, never stronger.** The stake
ALIGNS the honest majority; it does not DETER a determined Sybil, and the mechanism is
not "non-farmable". Appreciation accrues to anyone who stakes, a free-rider included.
What actually bounds farming: the score's dominant term counts
DISTINCT LIVE-STAKED SELLERS, so n units of breadth cost n stakes held live — linear,
with no wallet-splitting leverage (the retired pair statistic was manufacturable on the
unstaked buyer side); the minimum-support floor (`minSellers = 3`) keeps everything one
actor can fabricate alone off the scoreboard; the withdrawal cooldown makes each stake
serve at most P/T identities per period; the automatic EIP-1559 per-trade base-fee burn
is the one non-recoverable per-trade cost, scaling with fabricated volume and accruing
to every base-currency holder; and the 600M is a FIXED pool a farmer DILUTES rather
than inflates, in RISING tranches so the largest budgets pay on the most-measured
periods. Formally: capturing a fraction φ of a period requires attacker score
φ/(1−φ) times the honest score, at a capital cost LINEAR in that score — the
rent-dissipation bound whose closed form, and the stake and cooldown derived from it, is
published as §7 of `/papers/substrate-broadening-rpgf`; it is checkable at each period
when both terms are observable. The florin has no protocol-set price, so the bound is
stated as dilution per unit of attacker capital, never as a profit threshold.
`RELEASE_READINESS.md` Task 3 carries the parameter values.

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

## Truth boundaries — what a row is worth

A reader that folds everything into one surface has lost the only distinction that
matters: what backs each row. There are four boundaries, and they are a closed set
because they describe how a fact came to exist, not what it is about — the SDK owns
the labels and the one-line gloss for each (`TruthBoundary` and
`TRUTH_BOUNDARY_GLOSS`, `sdk/src/derive/truth.ts`), and a projection picks from
them rather than coining its own.

Briefly: **protocol-enforced** rows are economically backed by the kernel, bonds
locked at commit and payouts at resolution. **Institution-declared** rows are what a
runtime encoded and the protocol never validated — bonding pressure is what
incentivizes their accuracy. **Protocol-derived** rows are anchored on chain, with
the content behind the fingerprint living off it: referential integrity, never
substantive accuracy. **Composition-derived** rows are read from a composed venue's
own events — a swap pool, the multisender, a forum — true per that contract's rules
and outside the kernel's guarantees.

A surface that renders this data should keep the boundaries visibly apart rather
than blending them, so nobody mistakes a declaration for a guarantee. `/data/explore`
is the built example: one layer at a time, each with its boundary named, and the
layers themselves a census of what the corpus actually contains — never a menu the
frontend knows in advance.

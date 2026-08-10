# Figaro Protocol: Vision

A public coordination economy of transaction-scoped institutions.

---

## For Visitors

Figaro is not a DeFi protocol — it subsumes DeFi, not the reverse. It is not
a food delivery app. It is not a platform-controlled application. It is not
venture-backed rent-extraction.

Figaro is infrastructure for a **post-firm economy** — a system where any two
parties can coordinate reliably without trusting each other, without an
arbitrator, and without geographic jurisdiction.

The concrete organizational unit this produces is the
**transaction-scoped institution**: a temporary assembly of directly bonded
contributors formed around a single process and dissolved at settlement.

The mechanism is simple: both parties lock collateral on-chain — the buyer 2×
the payment, each seller 2× the value the process has accumulated at its own
link. The doubling answers retention: value passes off-chain, so a defector
keeps what is in its hands, and a bond equal to that value would be exactly
offset by the taking. Only the buyer can trigger resolution — not as a power
asymmetry, but as a coordination property that prevents deadlock (the buyer is
locked too, so extraction is self-destructive). The equilibrium follows in two
composing steps: after performance, resolving is unconditionally strictly
better for the buyer; given that, performance is each seller's strict best
response. Not a hopeful social outcome — a comparison of two known amounts that
either party can make for itself.

In legal terms, this is a **self-executing bilateral performance bond** — a
known legal instrument, with one innovation: the counterparty is the surety.
No third-party surety trust is required. Enforcement is ex-ante (locked
capital), not ex-post (courts and police), making it jurisdiction-independent.

What makes this more than a clever escrow:

1. **Process DAGs** turn pairwise bonds into N-party value-added processes.
   There is no "restaurant" — there is a cook, a kitchen seller, an
   ingredient sourcer, a courier, each an independent node in the DAG. Every
   node adds value, bonds capital, and is compensated directly via settlement.
   The entire process resolves atomically — all or nothing.

2. **Token-agnostic denomination** means any ERC-20 can serve as the unit of
   coordination. A stablecoin for legal convenience. A DAO governance token to
   express community alignment. A commodity-backed token for value anchoring.
   Token choice is itself a coordination signal — it expresses the user's
   preferences, values, and jurisdictional strategy.

3. **Public coordination graphs** — every order, bond, geolocation signal, GHG
   disclosure, and settlement cascade is intentionally visible on-chain. This is
   not a data leak; it is the protocol's design. These graphs function as
   **economic pheromones**: autonomous agents (human or AI) discover
   opportunities, route capacity, and coordinate fulfillment by reading public
   state, exactly as ants follow chemical trails without central planning.

4. **Composable institutions** — the protocol provides settlement security;
   additional mechanisms (auctions, attestation coordinators, disclosure
   modules, member registries) layer on top without weakening the bonding
   guarantee.
   An institution is a composition of mechanisms, not a monolithic application.

The result: a **public coordination economy** where trust is priced by capital,
jurisdiction is replaced by code, processs assemble into
transaction-scoped institutions, and coordination emerges from economic
incentives rather than management hierarchies.

---

## The Vision in Detail

### The Six Properties

Everything in Figaro derives from six protocol properties (see THEORY.md):

| # | Property | What It Replaces |
|---|---|---|
| 1 | **Asymmetric bonding** | Trust, reputation, credit history |
| 2 | **Cumulative bonding** | Hierarchical authority, management chains |
| 3 | **Buyer dominance** | Arbitrators, dispute resolution, governance |
| 4 | **Atomic resolution** | Partial payments, individual accountability |
| 5 | **Immutable evidence** | Discovery, forensic audits — courts are not replaced; they consume the evidence from outside |
| 6 | **No escape hatches** | Timeouts, admin overrides, emergency pauses |

These six properties are the **starting point** for all reasoning. Contracts
implement properties. Mechanisms augment properties. UI renders contracts.

### The Augmentation Layers

The core bonding mechanism is augmented by coordination layers that extend its
reach without weakening its guarantees:

**`parentOrderId` + processs** — Public value-added process provenance.
Every value chain is visible as a DAG. A buyer's cart can settle as a single
root process that distributes tokens downstream to every contributor, or each
item can decompose into direct token flows to every value-adder in the DAG.
Cumulative bonding at each node creates coordination pressure that never
slackens with depth — later sellers have strictly more at stake, their bonds
keyed to everything accumulated through their own link. This replaces management hierarchies
with economic self-organization.

**Token denomination** — The choice of settlement token is a coordination
signal, not merely a technical parameter. Token-agnostic bonding means any
ERC-20 can denominate any process. A participant choosing a DAO token to pay
for services is expressing governance alignment — the same economic act carries
a social signal. A stablecoin denomination expresses legal-regime preference.
A commodity token anchors value to physical reality. The protocol treats all
tokens identically; the meaning flows from the participants' choices.

**Geolocation (geohash)** — Public spatial coordination graph. Geohashes
function as economic pheromones: a fulfiller sees active orders clustered in a
6-char cell and routes toward them; a seller (human or agent) sees demand
concentration and registers a catalogue serving that zone. Agents coordinate by
intersecting multiple graphs simultaneously — spatial density (geo graph) ×
bond flows and settlement payouts (settlement graph) × settlement history
(process graph) — and the coordination emerges
from graph intersection, not from a single signal. Private details (exact
address, notes) are sealed with per-order AES-256-GCM keys and exchanged
out-of-band. The public layer coordinates; the private layer protects.

**GHG disclosures** — Public accountability graph. Reporting entities open
process-level boundaries, buyers create order-level requirements, and sellers
submit disclosure references. All anchored to settlement — you cannot game the
disclosure without breaking the bond. Opt-in, but tamper-proof once committed.

**Cross-process links (templates, cascades)** — Public trade network graph.
Templates encode reusable value-added process patterns. A settlement cascade
is the parties' own sequencing of resolutions across linked processes — each
process resolved by its own buyer, the links carried in the signed agreements
and read off-chain. These are not auxiliary
infrastructure — they are the primary mechanism by which value distributes
through processs. A template defines how a buyer's payment decomposes into
flows reaching every contributor; when a process resolves, every order in it
settles together — and separate processes each resolve on their own buyer's
call, never across. These form the
bones of an inter-institution economy where provenance is verifiable across
process boundaries.

### The Five Graphs

Together, the protocol and its augmentation layers produce five semantic graphs
that constitute the information layer of the public coordination economy:

1. **Process graph** (protocol-enforced) — orders, bonds, settlement, DAG
2. **Spatial graph** (institution-declared) — geohashes, routing signals, zones
3. **Disclosure graph** (protocol-derived) — clauses, requirements, submissions
4. **Settlement graph** (protocol-enforced) — per-order bonds, settlement payouts (linear; topology is the process graph's)
5. **Cross-process graph** (protocol-derived) — template provenance, settlement links

Each graph has its own truth boundary:

- **Protocol-enforced**: immutable, on-chain, no external trust required
- **Protocol-derived**: computed from on-chain state, deterministic
- **Institution-declared**: claimed by participants, not protocol-verified
- **Off-chain overlay**: out-of-band data, not on-chain at all

Do not conflate these. A geohash is an institution-declared claim. A bond
amount is a protocol-enforced fact. Both are useful; only one is trustless.

### Beyond Delivery: The General Pattern

The delivery archetype (Figaro Local Commerce) demonstrates one instance of this system.
But the properties generalize to any coordination scenario. In every case,
the named "entity" is not a firm — it is a process of independent
value-adders:

- **Ride-hail**: buyer + driver (+ vehicle owner, + maintenance provider…),
  geohash routing, auction allocation
- **Prepared food**: buyer + cook + ingredient sourcer + kitchen seller +
  courier, value flowing through the DAG to every contributor
- **Repair dispatch**: buyer + diagnostician + parts sourcer + technician,
  lifecycle signals, sealed address
- **Procurement**: buyer + N value-adders at every stage, template-guided
  cascades, GHG disclosure at each node
- **Cross-border trade**: buyer + producer + shipper + customs broker +
  logistics chain, cumulative bonding with geographic bridging.
  In trade finance, a **Letter of Credit** (LC) is the closest legacy
  instrument: a bank-issued guarantee that payment will arrive on time and
  for the correct amount. The bank is the trusted third party; its fee is
  1–3%. FigaroCore replaces the bank with the $2x$ bond — same guarantee
  (irrevocable, document-conditional), no intermediary, no fee, no
  jurisdiction dependency. The legal framing is exact: an LC is a
  unilateral performance bond issued by a third party; Figaro is a
  bilateral performance bond where the counterparty is the surety.
- **Anonymous collaboration**: two pseudonymous developers co-building
  software without legal identities. The clause-typed agreement hash
  defines deliverables; the bond enforces completion. No platform
  mediation, no KYC, no escrow service fee.
- **Jurisdiction-free exchange**: high-stakes coordination in environments
  where legal recourse is non-existent. The bond works identically because
  enforcement is ex-ante (capital locked), not ex-post (courts invoked).
  Two parties in a failed state, or across hostile jurisdictions, can
  coordinate with the same mathematical certainty as two parties in
  Switzerland.

The pattern is always the same: asymmetric bonds secure the process, mechanisms
augment the coordination surface, public graphs enable agent discovery, and
private channels protect sensitive details. The institution is a composition of
value-added processes — not a monolithic application, and not a firm.

### Dispute Resolution: Math Replaces Power

Legacy dispute resolution is a product of firms and power structures — courts,
arbitrators, HR departments, consumer protection agencies. These systems assume
that enforcement happens *after* a breach, imposed by an authority with
jurisdiction over the parties.

Figaro inverts this. Enforcement happens *before* work begins, imposed by
mathematics, not authority. The protocol's defense-in-depth operates across
five layers:

**Layer 0: Foundation — Blockchain Security** — Everything above rests on the
host chain's consensus: signature verification, transaction ordering,
immutability of committed state. This layer is not Figaro's to build, but it
is named because it is load-bearing — the bonds are only as locked, and the
record only as immutable, as the chain that holds them.

**Layer 1: Economic — Primary Nash Equilibrium (MAD via asymmetric bonding),
plus the evidence record** — Both parties lock collateral at exactly 2× the
transaction value. Credit a defector with everything it retains off-chain and
it is still out of pocket — the seller at best at −G, the withholding buyer at
−P. So after performance, resolving is unconditionally strictly better for the
buyer, and given that, performance is each seller's strict best response —
not a social aspiration, a comparison of two known amounts. This handles the vast majority
of bilateral interactions. The enforcement is ex-ante (capital locked before
work begins), not ex-post (courts invoked after breach). Asymmetric bonding
replaces trust, reputation, credit history, and most forms of contractual
enforcement at the bilateral level — and scales the bilateral primitive to
N-party DAGs (each seller bonds against cumulative value through its own link, creating a
mesh of independently secured edges). Co-resident at this layer is the
evidence record: every commit and resolution, and every lifecycle event
emitted by coordinators, is an immutable, role-gated, block-timestamped
attestation on-chain — produced always, as a by-product of ordinary
operation, not only when something goes wrong. The upper layers consume this
record; none of them produces it.

**Layer 2: Social — Buyer Dominance + Atomic Resolution (the micro-lending
circle effect)** — Layer 1 produces the mesh; Layer 2 enforces coordination
across it. Only the buyer can trigger resolution, and resolution is atomic —
all orders in the process settle together or not at all. So nobody is paid
until the buyer resolves, and the remedy comes first: when one seller's work
is faulty, every co-seller's cheapest move is to help fix the fault, because
that is the only path back to settlement. The pressure is the backing behind
the remedy — the atomic-resolution rule is buyer dominance's forcing
function, inducing a weakest-link subgame among sellers with endogenous peer
exposure of magnitude P_i + 2G_i on a co-seller that has already performed, and
a floor of P_i + G_i on one that has not — it still holds what is in its hands.
The parallel is Grameen Bank's group lending model, and the claim is scoped:
Figaro reproduces the *coordination-pressure component* of that peer-enforcement
equilibrium — the interest each participant holds in the others' performance —
without repeated interaction, local information, an exogenous punishment
technology, or joint-liability contracting. The peer *selection* and peer
*monitoring* results of that literature it does not reproduce. The buyer does
not need to manage the sellers. This replaces management hierarchies, quality
control departments, and supervisory authority.

**Layer 3: Arbitration** — A standing layer, not a transition aid. For the
edge cases Layers 1 and 2 do not resolve, the parties can bring the dispute
to an arbitration forum (e.g. Kleros) that consumes the Layer-1 evidence
record as input. This recourse exists with no clause named: nothing in the
agreement has to designate a forum for the parties to seek one. The forum is
for the parties to determine; the protocol supplies only the tamper-proof
record it adjudicates over.

**Layer 4: Traditional Legal Systems** — Equally standing: courts, too,
consume the on-chain evidence from outside the protocol — jurisdiction and
venue are for the parties to determine, and no clause has to name them
either. The deterrence loop: because the evidence is already on-chain and
unforgeable, bringing frivolous claims is self-defeating. Layers 3 and 4
together handle the remaining fraction of irrational actors who defect
despite economic and social pressure.

The result is a system that returns **self-sovereignty to the wallet holder**.
Your economic protection comes from the capital you locked, not from the
jurisdiction you happen to live in, the firm that happens to employ you, or the
power structure that happens to govern your industry. It functions identically
for a human in a high-corruption jurisdiction, an AI agent in a server rack, or
a colony on Mars.

### The Coasean Collapse

Ronald Coase theorized that firms exist because transaction costs (vetting,
trusting, contracting) make external coordination expensive. Reduce those costs
and the firm dissolves.

Figaro prices the cost of trust at $2x$ — the bond each party locks. Trust
is not eliminated; it is made unnecessary. The counterparty need not be
trustworthy; they need only be rational. A rational actor who prefers $2x$
return over $0x$ will cooperate. The bond is pre-paid; the "lawsuit" is
resolved before work begins. No vetting, no credit check, no reputation
threshold required — only solvency.

**No firms, no employees.** Every participant in a process is an
independent value-adder. The entity formerly known as a "restaurant" does not
exist — what exists is a cook, a kitchen seller, an ingredient sourcer, each
bonding independently, each compensated directly for the value they add. A
"driver" is an independent fulfiller who counter-signed a bonded order at
their own catalogue rate, not an employee dispatched by management. Token fees flow to each node for the value it contributes —
identical in structure to validator fees paid for compute.

Two settlement topologies emerge naturally from this:

- **Indirect**: the buyer settles a root process; the root coordinator
  distributes tokens downstream to every contributor via sub-orders and
  cascades. The buyer sees one price; the DAG handles decomposition.
- **Direct**: each item in the buyer's cart decomposes into token flows that
  reach every value-adder explicitly. The process *is* the payment
  routing.

Token denomination compounds this. Paying in a local co-op token means every
node in the DAG receives value denominated in that alignment. A swap at any
node lets a participant convert to their preferred denomination, but the
incoming coordination signal is preserved as public graph data. Value is
transmitted not just to specific people, but to specific **value systems**.

### Value Capture After the Firm — the Privileged Token

If the firm dissolves, what happens to the value it captured? The answer is the
**privileged token**, and it is distinct from denomination (above).

**The process is an itemized P&L, surfaced three ways.** A Figaro process is a
self-closing ledger period (`/papers/self-closing-ledger-periods`). The service
the buyer purchases decomposes into *every cost required to produce it* — each a
real-world asset (RWA), **tangible or intangible**: the aircraft, the fuel, the
crew, the **landing slot**, the **brand**, the maintenance, the ground handling,
the public-authority service. Each RWA is a wallet that bonds and is paid its
line. This single decomposition is surfaced identically as **the buyer's
checkout line items**, **the audit trail**, and **the financial presentation**
(the EN-16931 e-invoice projection) — checkout, audit, and invoice are three
views of one itemized P&L, not three separate constructions.

**The moat is a subset of the RWAs.** A firm's stock value was its *moat* —
exclusive control of a scarce, hard-to-replicate resource competitors cannot
access. The moat is the scarce/exclusive *subset* of the cost-lines: for an
airline, the airport slots and the brand — **not** the aircraft (leased,
fungible, commodity; airlines have no moat around aircraft). The bonded
primitive competes the commodity cost-lines toward their cost of capital; the
moat retains pricing power.

**The privileged token tokenizes the moat — a use-priced share certificate.**
Value capture survives the firm's dissolution through the assembly's privileged
token. To access the moat asset — or the moat *process* (the assembly itself) —
counterparties must **use** its privileged token; its price is discovered
on-chain through use (demand for access), not on a stock market. It is the
share-certificate-equivalent of the dissolved legal entity, **use-priced rather
than market-priced**. This is the assembly-author's value-capture instrument —
distinct from the seller's denomination/accepted tokens, which are a community
*alignment* signal, not a claim on a moat. TradeLens (`/papers/after-tradelens`)
is the moat as competitor-controlled gatekeeping — the anti-pattern the
ownerless, use-priced token replaces.

**The chain, told whole.** A wallet address is an asset — real-world, human or
machine, tangible or intangible — participating in value-added processes. *Which*
processes is not an attribute stored anywhere: it is defined by the assemblies
the wallet subscribes — the bindings a seller holds in the `AssemblyRegistry`
are the asset's book of business. Because assemblies are compositions of
clauses, they are **public contracts**, usable anywhere in the world, and every
use produces fiscal, legal, and regulatory data — the itemized P&L above, the
audit trail, the e-invoice projection — shaped to satisfy existing *and future*
requirements, all of it self-sovereign to the wallets that produced it. The
kernel's mechanism design plus the coordination and attestation clauses push the
coordination overhead of the corporation and the institution to the periphery
(the Coasean Collapse, above), and **value capture reallocates from the top,
down**. What remains at the top is only the moat, tokenized and use-priced;
every commodity cost-line is competed toward its cost of capital.

**Where the equilibrium settles.** The tokens in a wallet split into the
**social** (the denomination — a community-alignment signal) and the **moated**
(the privileged token — a claim on scarce access), and both are valued against
the same measure: the value-added processes between them, the **constant
currency** in which every token's worth is discovered through use. Shares become
tokens; the tokens a wallet holds signal the communities it participates in. The
equilibrium does not settle at the reallocation itself — no particular
distribution of value capture is the terminal state. It settles where each asset
earns whatever rate of return it needs to continue participating in value-added
processes: **a productive life**. The market enforces this the way it enforces
going-concern everywhere — through ordinary rational exit.

### The Singleton Thesis

Figaro's shared-kernel design (one deployment, no owner, no fee) is not a
limitation — it maximizes network effects. Shared security (one battle-tested
contract > 1,000 forks), shared tooling (indexers, UIs, wallets work for
everyone), shared coordination surface (all institutions' graphs are
superimposable). Anyone can fork the code; the value is in the shared
coordination network.

The singleton stays safe because of a critical architectural separation:
**bonds are deterrents; payments are income.** The core bonding mechanism locks
and releases bonds — that is all it does. Compositions (attestation
coordinators, auctions, disclosure modules, member registries) operate on
coordination, discovery, and evidence surfaces around the process. They can
inform routing, allocation, and attestations, but they do not alter the bond
mechanism or buyer-only resolution. This is how the protocol scales
composability without scaling risk.

### Three-Tier Architecture

The system has three distinct tiers. Precision matters — proposals that
confuse tiers (e.g., "add yield to locked bonds") misidentify what they touch.

| Tier | What it is | Boundary |
|---|---|---|
| **Kernel** | `FigaroCore`. The irreducible settlement primitive: 2 external functions, 3 mappings, no owner, no fee, no escape hatches. Secures the process graph via asymmetric bonding. | Nothing modifies the kernel's payoff matrix. |
| **Protocol** | Kernel + composition doctrine + public graphs. Attestation, clause registry, mechanism modules (auctions, lifecycle coordinators, members registry), five semantic graphs. | Compositions read kernel state but never weaken its guarantees. |
| **Runtime** | Protocol + semantic derivation layer + institution assembly clause + builder surfaces + UI. The complete operational environment. | Institutions grow on top; they can wither or be replaced without shaking the kernel. |

The kernel is bedrock; the protocol is law; the runtime is the shared workshop;
institutions are the structures built on top.

### The florin — the named Schelling point

The token denomination thesis above is abstract: *any* ERC-20 carries a
coordination signal, and the bonding equilibrium holds regardless of which
token is used. The florin makes this concrete. It is the token participants converge
on by name — a Schelling point, not a governance mechanism.

The florin has a fixed supply of one billion tokens, set at genesis and never
inflated. There is no settlement-anchored emission: the florin is not minted on
`resolveProcess`, and there is no per-settlement reward path. The allocation
is 70M (7%) to founders, 30M (3%) to supporters (friends & family / early
supporters), and 300M (30%) to the DAO — all minted at genesis, no vesting —
and 600M (60%) reserved for retroactive public-goods funding to
clause authors and assembly designers of record. That 600M has a wired minter,
registered at florin genesis: usage is counted on chain as trade happens, and
each closed annual accrual period's budget is claimed pro rata — nine of them, grouped
into three RISING tranches so the largest budgets pay on the most-measured evidence
(mechanism in `CONTRACTS.md`, rationale in `PUBLIC_GRAPH_MODEL.md`).
The florin contracts are immutable: no owner, no upgrade path, no parameter changes. If one is wrong, a
new one is deployed and the community migrates.

This design is deliberate. The florin is not required for participation. It is not
staked, slashed, or voted with. Cooperation comes from the bonding
equilibrium — defection is never profitable — not from token incentives. The florin exists because people
will ask for a token — and when they do, they should receive one whose
issuance is fixed, transparent, and free of discretionary control. See
`FLORIN_TOKEN.md` for the full design.

### Per-Order Sovereignty

Self-sovereignty in Figaro extends from capital to data. Each order is a
cryptographic boundary: a fresh secp256k1 keypair generates a per-order
AES-256-GCM key that seals sensitive details (address, notes, coordination
data). Compromise of one order does not expose any other. There is no master
key, no platform-held decryption capability, no data silo.

The protocol core (`FigaroCore`) treats the agreement field as opaque bytes —
it stores nothing, interprets nothing, and only emits the raw bytes and their
hash in the `OrderCreated` event. What goes into the agreement, how it is
encrypted, and what clause it conforms to are **dapp-level policy decisions**.
A delivery archetype might use geohash-6 + AES-sealed street address. A
procurement archetype might use H3 hexagons + cleartext warehouse codes. A
repair archetype might use lat/long + sealed unit number. The protocol remains
constant; the dapp layer varies.

Clauses follow the same anchoring pattern as GHG disclosures:
off-chain semantics, on-chain reference integrity (clause ID, version, content
hash). Mechanisms declare which clause(s) they require; order creators declare
which clause their content conforms to. This makes content interpretation
verifiable without making the protocol opinionated about content.

### What This Means For Development

When working in this repository:

1. **Reason from properties downward**, not from contracts upward. The six
   properties are the starting point. If a feature weakens any property, it is
   wrong regardless of how useful it seems.

2. **No contract belongs to a dapp.** Every contract is a permissionless
   primitive. The two-repo split (Figaro / Figaro-eats) is organizational,
   not an ownership boundary.

3. **Token denomination matters.** When building UI or mechanism modules,
   surface token choice as a meaningful coordination signal, not just a
   technical detail. The user selecting a token is expressing something about
   their relationship to the counterparty and the broader economy.

4. **The runtime thesis is the default.** Figaro is the canonical runtime.
   Downstream repos are archetypes and proving grounds. Archetypes may
   specialize presentation; settlement semantics remain anchored here.

5. **Public graphs are features, not bugs.** Do not treat on-chain visibility
   as a privacy problem to solve. The public layer is coordination
   infrastructure. Private details have their own encryption layer.

### Project Lineage

Three iterations carried Figaro to its current shape; each removed
surface area while preserving the load-bearing intuition.

| Iteration | Year | Authors | Core mechanism | Status |
|---|---|---|---|---|
| Figaro-Original | March 2022 | F. R. Genovese & A. Daliana | Proof of Action consensus on its own chain | Abandoned |
| Figaro-2 | 2022–2023 | F. R. Genovese & A. Daliana | 5-tx escrow with Mutually Assured Loss reasoning | Abandoned |
| FigaroCore (current) | 2024–2026 | A. Daliana | Asymmetric bonding on existing chains, ~250 LOC kernel | Active |

What survived: the factotum-of-the-city metaphor (Figaro-Original §1.0),
the Mutually-Assured-Loss reasoning (Figaro-2 §3.4 Remark 3.4.6, fully
formalized as asymmetric bonding here), encrypted handoff via wallet
keypairs, geographic-area approximate locations for privacy, dual-signed
dispute resolution, and the no-platform ethic.

What was abandoned: Proof of Action consensus, own-chain architecture
(current is chain-agnostic), the five-transaction-type model,
slashing-to-protocol, fee caps, governance for refunds and disputes,
project-internal currency, categorical-semantics as the formal substrate
(replaced by industry-standard formal-verification tooling), and
last-mile-specific scope.

The convergence pattern is consistent: Figaro-Original was a chain plus
a protocol plus a currency plus a governance system; current FigaroCore
is just a contract. The intellectual asset that survived is asymmetric
bonding plus the factotum framing; everything else was scaffolding to
discover those.

The current portfolio is solo-authored, but the early intellectual
lineage includes Fabrizio Romano Genovese's categorical-mathematics
formalization and his contributions to the Figaro-Original and Figaro-2
protocol design. The project would not exist without that collaboration.

### Origin

Figaro's bonding mechanism descends from the **Safe Remote Purchase**
contract in the Solidity documentation (chriseth / the Solidity team, first
imported 2015) — a minimal escrow where buyer and seller each lock 2×
payment, creating mutual assured destruction that makes performance each
party's own better move.
The mechanism itself predates Ethereum: Satoshi proposed the one-sided
hostage escrow on Bitcointalk in August 2010 ("takes the profit out of
cheating"), and in the same thread aceat64 and ribuck stated the two-sided
double-deposit form; NashX ran it live (2013) and BitHalo (Zimbeck, 2014)
gave it a whitepaper and implementation. Figaro generalizes the insight from
a 2-party escrow into an N-party coordination protocol: cumulative bonding at
each link — its own payment included — scales the equilibrium along the
process, atomic resolution binds every order into a single game, and the
augmentation layers turn the bare mechanism into composable institutions.

The intellectual debt is real and worth stating: without the double-deposit
lineage that culminated in the Safe Remote Purchase primitive, the rest of
this system does not exist.

---

## Appendix: A Simple Version

A layperson-flavored pass at the same picture. If the rest of this
document was too dense, start here.

### The problem everyone has

You want to buy something from a stranger on the internet. Maybe it's
food. Maybe it's a service. Maybe it's something shipped from another
country. The problem is: you don't trust them, and they don't trust you.
Right now, the way we usually solve this is by packaging the deal
inside a big company. Uber, DoorDash, Amazon give you a familiar shell
for exchange: they hold the money, decide what counts as a problem,
take a huge cut, and make both sides operate on their terms.

Figaro starts from the deal itself. Instead of a standing company
coordinating every exchange, each exchange can assemble its own
temporary institution out of the people actually doing the work.

### The lockbox

Imagine you want to buy something for $10:

1. **You (the buyer) put $20 into a lockbox.** That's the $10 payment
   plus $10 as your guarantee that you won't mess around.
2. **The seller also puts $20 into the lockbox.** That's their
   guarantee that they'll deliver what they promised.
3. **Now there's $40 locked up, and neither of you can touch it.**

If the deal goes through, the lockbox opens: you get your $10 guarantee
back, the seller gets their $20 guarantee back plus the $10 payment.
If either of you tries to cheat, **both of you lose everything in the
lockbox**. The cheater loses their deposit, but so does the victim. That sounds
harsh, but it's the whole point: cheating always costs you more than
just playing fair.

It's like mutually assured destruction, but for online shopping.

**Why 2×?** At 1×, the seller could cheat and break even (lose deposit,
keep what they stole). At 2×, cheating always means a net loss. 3×
would work too, but it's wasted capital for no extra deterrent.

### There are no companies — only people doing work

Think about ordering a burger. In the current world, you think you're
buying from "Joe's Burger Joint." But under that name, there's a cook
making the burger, an ingredient sourcer, a kitchen seller, a driver,
and a platform like DoorDash sitting on top taking a cut.

In Figaro, "Joe's Burger Joint" doesn't exist as one thing. There's a
**process** of individual people, each doing their part:

```
You (buyer)
 └─ Cook (makes the burger, bonds $X)
     ├─ Ingredient person (got the tomatoes, bonds $Y)
     └─ Kitchen seller (provides the space, bonds $Z)
 └─ Driver (delivers it, bonds $W)
```

Each person locks their own deposit. Each person gets paid directly for
the value they added. And if any one person in the process screws up,
**the whole process fails and everyone loses their deposits**. So every
person in the process is motivated to make sure every other person does
their job — group-project peer pressure with real value on the line.

This same pattern works for rides, repairs, international shipments,
freelance work — any deal between people. Lock a deposit, do the work, get
paid. No leap of faith needed.

### What everyone can see (and what they can't)

How much value is locked, who's involved, whether it got completed —
all visible on chain. On purpose. It's a public bulletin board: anyone
can see "there's a $10 delivery needed in downtown Austin" or "50
orders happening in this neighborhood right now," and drivers (or AI
bots) can pick up work without going through a platform's algorithm.

But your home address, personal details, and private notes are
encrypted. Only the people involved in your specific order can see
them. Every order has its own separate encryption key — there's no
master database to steal.

### Who's in charge?

Nobody. There's no company running Figaro, no CEO, no customer
support, no one who can freeze your account. What protects you, in
order: the economics (cheating always costs more than playing fair, so
almost every deal never needs anything else), teammates who fix
problems (nobody gets paid until you say the job is done, so everyone
in the process pitches in to put a fault right — the shared stake is
what backs that up), and receipts (everything is permanently recorded
on chain, ready to be evidence before an arbitrator or a court if it
ever comes to that).

---

*This document distills the vision from THEORY.md, OPEN_WORLD.md, and
iterative development sessions. It is the starting point for new
agents and visitors. For game-theoretic foundations, see THEORY.md.
For the open-world paradigm + runtime architecture, see OPEN_WORLD.md.*

# Figaro Protocol: Pure Coordination Through Economic Pressure

**A game-theoretic approach to multi-party coordination without timeouts, arbitrators, or third-party dispute resolution**

---

## Abstract

Figaro is a coordination protocol that enables sovereign economic coordination
through two composing mechanisms: asymmetric bonding and buyer dominance.
Asymmetric bonding — the buyer locks 2× the payment, each seller 2× the value
the process has accumulated through its own link — produces the equilibrium in
two composing steps: after performance, resolving is unconditionally strictly
better for the buyer (`0` against `−P`, a comparison needing no assumption
whatever about the seller); given that, performance is each seller's strict
best response (`+P` against at best `−G`, crediting the seller with everything
it retains off-chain). The same schedule scales the bilateral primitive from
2-party to N-party process chains: each seller bonds against the cumulative
value at its link, its own payment included, creating a mesh of independently
secured edges. Buyer dominance — only the buyer can trigger resolution, and
resolution is atomic across all orders in the process — operates on the
already-scaled mesh to enforce inter-seller coordination. Atomic resolution is
the forcing function: it induces a weakest-link subgame among sellers,
reproducing the coordination-pressure component of Grameen joint-liability peer
enforcement at kernel granularity without repeated interaction or local
information.

The two mechanisms compose; neither substitutes the other. Bonding alone
yields independently bonded edges that can't multi-party coordinate;
buyer-dominance alone is worthless without the bonding equilibrium. Together,
they make the mesh resolvable from a single signature with cooperation
pressure propagating through it. The architecture makes trusted intermediaries
— escrows, arbitrators, platform sellers — structurally unnecessary.

Enforcement operates across five layers: blockchain security as the named
foundation; economic self-interest (bonding, with the evidence record
co-resident); remedy-first coordination among co-dependent sellers (atomic
resolution as buyer dominance's forcing function — nobody is paid until the
buyer resolves, so co-sellers help fix faults); arbitration; and traditional
legal systems — the last two standing layers that consume the on-chain
evidence from outside, ruling while the process stands open and holding no
power to resolve it. This paper presents the game-theoretic foundations, the
N-party scaling model, the enforcement architecture, and a security analysis
of the protocol.

---

## Table of Contents

1. [Core Innovation](#core-innovation)
2. [Mathematical Foundations](#mathematical-foundations)
3. [Architecture Rationale](#architecture-rationale)
4. [Implementation Details](#implementation-details)
5. [N-Party Model](#n-party-model)
6. [Enforcement Model](#enforcement-model)
7. [Security Analysis](#security-analysis)
8. [Comparison with Traditional Approaches](#comparison-with-traditional-approaches)
9. [Advanced Topics](#advanced-topics)
10. [Conclusion](#conclusion)

---

## Core Innovation

### The Coordination Forcing Function

Figaro achieves multi-party coordination through two composing mechanisms:

**Mechanism 1 — Asymmetric bonding (the bilateral equilibrium + scaling):**

1. **Both parties lock collateral on-chain** — buyer 2P, seller 2G, where G is the
   cumulative value at that seller's link, its own payment included
2. **The doubled schedule is what makes defection cost.** Value passes off-chain,
   so a defector keeps what is in its hands; credit it with all of that and it is
   still out of pocket — the seller at best at −G, the withholding buyer at −P
   (see *What the Doubling Does*)
3. **Each seller bonds against the cumulative value at its own link**, creating a
   mesh of independently secured edges that scales from 2-party to N-party
   process chains

**Mechanism 2 — Buyer dominance (inter-seller coordination on the mesh):**

4. **Only the buyer can unlock funds** by calling `resolveProcess()`
5. **Resolution is atomic** across all orders in the process — all or nothing
6. **Sellers must coordinate among themselves** to satisfy the buyer (weakest-link
   subgame; endogenous peer exposure of P_i + 2G_i on a co-seller that has already
   performed, and a floor of P_i + G_i on one that has not)
7. **Buyer accountability** through locked capital: an extracting buyer holds the
   delivery and still stands at −P against the 0 that closing would give it

**Key Insight**: Bond lockup creates the bilateral equilibrium and scales the mesh; buyer dominance enforces coordination across the mesh. Either mechanism alone is insufficient — bonding without buyer dominance gives a mesh that can't multi-party coordinate; buyer dominance without bonding is worthless. Together they replace external enforcement.

### Philosophy: The Post-Firm Economy

Figaro is **NOT DeFi**. It is not a financial protocol for trading, lending, or speculation. It is **Coordination Infrastructure** designed to enable the **Post-Firm Economy**.

#### 1. The Coasean Collapse (Death of the Firm)
Nobel laureate Ronald Coase theorized that firms exist because the transaction costs of vetting, trusting, and contracting external partners are too high.
*   **The Shift**: Figaro prices the cost of trust at $2x$ — the bond each party locks. Trust is not eliminated; it is made unnecessary. A seller that performs earns its payment and takes its bond back; one that walks off with the value at its link is credited that value and still stands at best at $-G$. The deterrent is pre-paid; the "lawsuit" is settled before work begins.
*   **The Result**: The standing firm is no longer the compulsory unit of organization. Each process can assemble a transaction-scoped institution of autonomous agents (human or AI) coordinating via economic pheromones (RFQs, public graph signals), then dissolve at settlement. The **Bond** acts as the immune system, isolating defectors instantly without management overhead.

#### 2. Universal Rule of Law (Space-Grade Institutions)
In the legacy world, legal enforcement is defined by geography. A contract is only as good as the local court system.
*   **The Inversion**: By moving enforcement from **Ex-Post** (Courts/Police) to **Ex-Ante** (Collateral), Figaro provides a "Rule of Law" accessible to anyone with a wallet.
*   **Legal framing**: Figaro is a **self-executing bilateral performance bond** — a known legal instrument, but without the trust assumptions that normally require a third-party surety. The innovation is that the counterparty *is* the surety. Both parties post collateral simultaneously; neither requires the other to be trustworthy.
*   **Implication**: It functions identically for a human in a high-corruption jurisdiction, an AI Agent in a server rack, or a colony on Mars. It is granting an equal economic footing based purely on solvency, not identity.


### The Singleton Thesis

Why does Figaro use a singleton contract with a shared coordination surface?

Figaro is **Infrastructure**, not an App. Like Ethereum itself, all participants agree to run the same version to maximize network effects and interoperability.
- **Shared Security**: One battle-tested contract is safer than 1,000 forks.
- **Shared Tooling**: Indexers, UIs, and wallets work for everyone.
- **Shared Upgrades**: Non-upgradable core, but shared compositions.

While anyone *can* fork the code, the value is in the shared coordination network.

### The Three Laws (Communication Layer)

The six properties above are precise but dense. For audiences who will never
read a payoff matrix, the mechanism reduces to three communicable laws. These
are not marketing inventions — they are projections of enforced on-chain
invariants.

| Law | Properties it projects | One-sentence statement |
|---|---|---|
| **Skin in the Game** | Asymmetric bonding (bilateral 2× + bonding against the cumulative value at the link) | Both parties prove they have more to lose than to gain by defecting — counting what a defector keeps, not just what the chain holds. The bond is the proof. |
| **One-Way Progress** | Monotonic cumulative-value accumulator + Atomic resolution | The deal only moves forward. Value accumulates; it never reverses. Settlement is all-or-nothing. |
| **Sovereign Settlement** | Buyer dominance + No escape hatches | No boss, no bank, no platform sits in the middle. Resolution is between the parties, enforced by code. |

Each law maps to a contract invariant:

- **Skin in the Game** → `sellerBond = 2 × cumulativeValue`, `buyerBond = 2 × payment` (enforced in `commit`)
- **One-Way Progress** → `cumulativeValue` is a monotonic accumulator per process; `orderStatus` advances `0 → 1 → 2` (unknown → committed → resolved) with no backward transitions
- **Sovereign Settlement** → `resolveProcess` requires `msg.sender == rootBuyer`; no owner, no fee, no admin function, no timeout

The emotional experience these laws produce: **the end of anxiety.** The
certainty that performance and resolution are each party's own best move — a
comparison of two known amounts, not a hope about the other side — eliminates
the "leap of faith" that characterizes every traditional exchange between
strangers. The mechanism produces the certainty; the certainty produces the calm.


---

## Mathematical Foundations

### Asymmetric Bonding Formula

For a transaction at position `i` in a value chain:

```
Seller Bond: Cs(i) = 2 × G(i)
Buyer Bond:  Cb(i) = 2 × P(i)

Where:
  G(i) = Cumulative value through position i (all prior work + current)
  P(i) = Payment for work at position i (local value added)
```

**Example**: Alice orders $10 goods from Bob, Charlie delivers for $2

| Step | Party | Role | G(i) | P(i) | Seller Bond | Buyer Bond |
|------|-------|------|------|------|-------------|------------|
| 1 | Bob | Baker | $10 | $10 | $20 | $20 |
| 1 | Alice | Buyer | - | $10 | - | $20 |
| 2 | Charlie | Courier | $12 | $2 | $24 | - |
| 2 | Alice | Buyer | - | $2 | - | $4 |

**Total locked**: $68 ($20 + $20 + $24 + $4)

### Nash Equilibrium Analysis

#### The boundary comes first

The kernel holds bonds, the accumulator, and the record of what was committed.
It does not hold the goods. Value, performance, and the parties' knowledge of
both pass off-chain, and no kernel operation can observe or undo them. Every
payoff below therefore has two parts: **what the kernel moves** (the bond
deposited at `commit`, the payout made at `resolveProcess`) and **what the party
retains off-chain**, credited at the value the parties themselves signed — `P`
for the exchange at an edge, at most `G` for everything accumulated at a link.
The second part is always a *credit* and never a debit: a party is counted for
what is in its hands and never charged for what is not. An analysis that omits
the retention term is an analysis of a different mechanism, and it is the
omission that has historically made the doubling look arbitrary.

**Game setup**:
- Players: buyer (B) and seller (S), from the state in which both bonds are locked
- Moves: the seller performs or holds out; the buyer resolves or withholds.
  Resolving *is* the buyer's acceptance — the kernel holds no test of performance
  of its own and admits no report of delivery
- Resolution is the only terminal move. Withholding is not terminal, and no clock
  runs from the bonded state, so every comparison below is between *doing* and
  *never doing*

**Outcomes** `(u_b, u_s)` — locked position plus the assented value of what each
party holds:

|                        | resolution occurs | no resolution |
|------------------------|-------------------|---------------|
| **performance occurs** | `(0, +P)`         | `(−P, −2G)`   |
| **no performance**     | `(−P, ≤ P + G)`   | `(−2P, ≤ −G)` |

This is a table of *outcomes*, not a strategic form, and no plan is excluded by
it: the rows record whether the seller ever performs, the columns whether the
buyer ever resolves, and every plan either party may adopt terminates in one of
the four. The seller's entries are bounds because what it can retain is at most
the accumulated value at its link and is often less — a courier holds the meal
but cannot retain a delivery it never made. The right-hand column holds no
settlements: those are open positions the kernel has no operation to convert
into anything.

#### The equilibrium, in two composing steps

The two calls carry two mechanism designs, and the result composes in their
order.

- **(a) Resolve.** At any buyer node *after performance*, the buyer strictly
  prefers to resolve. It holds the delivery either way, so the branches differ
  only in the kernel's transfers: resolving returns the bond less the payment,
  `−2P + P + P = 0`; never resolving leaves the bond locked, `−2P + P = −P`. The
  withheld payment is not kept by the buyer — it sits inside the buyer's own
  locked bond, out of reach of both parties — which is why withholding buys the
  buyer nothing at all. **This comparison needs no assumption whatever about the
  seller**: the seller's conduct is already fixed at that node.
- **(b) Perform.** Given (a), at any seller node performance is the seller's
  strict best response: `+P` for performing and being resolved, against at best
  `−2G + G = −G` for holding out — twice the value at its link locked, the value
  itself credited back to it. The margin is `P + G > 0`, and it widens with every
  payment accumulated ahead of the seller.
- **(c) Withhold before performance.** Given (b), at a buyer node where
  performance has not occurred the buyer strictly prefers to keep the process
  open — its continuation is `0` — over resolving at once, which is terminal at
  `−P`: paying for a product it does not have and foreclosing the only
  continuation on which the product could still arrive.

The profile — the seller performs; the buyer resolves once performance has
occurred and not before — therefore has each party choosing a strictly better
continuation at every one of its nodes, and its outcome `(0, +P)` is the buyer's
unique maximum over all four outcomes. Every deviation that changes the outcome
is strictly worse for the party making it.

#### What the result is not

It is **not a dominance result** and must not be restated as one. *Resolve
regardless* is a plan the kernel admits, and against a seller that will never
perform it is better for the buyer than holding the position open; what is
unconditional is the narrower claim (a) — *after performance*, resolving beats
never resolving, whatever the seller is like. The seller's side is conditional
throughout: no bond schedule can make handing goods to a party that will not pay
attractive. What carries the equilibrium is therefore not that each party
separately finds cooperation dominant, but that **the two calls compose in a
definite order** — resolve's design gives the buyer an unconditional reason to
close after performance, and only because that is settled is performance
strictly best for the seller. A buyer that resolves without regard to
performance has not been failed by the mechanism; it has declined to use it, and
what it loses is bounded by exactly what it agreed to pay.

#### Mutual assured destruction, with content

The deterrent holding all of this in place is **mutual assured destruction**, and
the doubled schedule is what gives it content. The content is *not* that the two
parties lose equal amounts — they do not, and an accounting that says so is
counting only what the kernel holds. It is that defection leaves **whichever
party holds the value** out of pocket, at every link, *after* crediting that
party with what it keeps. A seller that walks off with the product is credited
the product, worth at most `G`, and still stands at best at `−G` against the `+P`
it declined. A buyer that keeps the delivery and never resolves is credited the
delivery, worth `P`, and still stands at `−P` against the `0` it declined.
Neither can reach the frozen payment; neither is repaid by what it took.

#### Why the standoff ends in performance

Nothing in the kernel ever executes the destruction: no operation consumes a
bond, and an unresolved position is simply held — a standing position, not a
loss taken. That is why the threat resolves into performance rather than into
loss, and the asymmetry of the schedule is what decides which way. While the
standoff runs the buyer has `2P` locked and the seller `2G` with `G ≥ P`, so the
seller stands in at least as much and strictly more at every position past the
root; and of the two, only the seller holds the move that ends the standoff on
terms it prefers — perform, after which the buyer's own comparison (a) closes
the process, trading a position of at best `−G` for `+P`.

Where the seller *cannot* perform, the move that ends its exposure is the
**remedy, agreed before resolution**. Concretely: the failing seller sends the
buyer the payment it stands to receive and makes good whatever of the buyer's
its failure left in its hands. The buyer, whole, resolves. At resolution the
seller takes back its bond and the payment, having already paid that payment
away — it ends at zero, its failure earning it exactly nothing, and zero is
better than `−G` by the whole value at its link. Where the remedy is refused, an
outside forum may rule on the open record (Layers 3–4) — still before any
resolution, and with no power to resolve in the buyer's place. Where a party
neither performs nor remedies nor answers a ruling, the position simply stands:
both bonds locked, the seller at best at `−G`, the record marking an undertaking
never closed. That is the irrational residue every system carries — the
deterrent working, not a case the buyer solves by paying the party that failed.

#### Robustness to weaker rationality

Each comparison above (`+P` against at best `−G` for the seller; `0` against `−P`
for the buyer) is preserved under any strictly monotone utility transformation,
so the results hold for any preference order that prefers more to less —
including arbitrary risk-averse and loss-averse specifications. The seller's gap
`P + G` is bounded away from zero, so a trembling-hand perturbation does not
overturn the cooperative profile, and in a chain the gap widens with every
payment accumulated ahead of the seller. What remains outside the analysis is
behaviour under non-pecuniary preferences (spite, fairness norms, an intrinsic
taste for defection) and any valuation of the captured product other than the
one both parties signed.

#### The proof form is itself a design property

The form of the argument above was chosen, not merely found, and the choice is
part of the design. An earlier statement of this equilibrium leaned on iterated
elimination of weakly dominated strategies: cooperation is never worse and
sometimes better, so eliminate defection for both players and one profile
survives. That form is mathematically respectable and behaviourally implausible
— the level-k literature finds most participants reasoning at one or two steps,
so a guarantee that needs the full iteration is a guarantee real participants
cannot check. The ratified form asks
for something far smaller: at each node one party compares two certain amounts,
and the two comparisons compose in a stated order. A buyer who can see that `0`
beats `−P`, and a seller who can see that `+P` beats `−G`, have between them
verified the whole result. A protocol whose central claim is that anyone can
check what a platform merely asks them to believe should not rest that claim on
a proof only a game theorist can follow — the equilibrium's legibility is the
same property the rest of the design is built for.

### Cumulative Bonding

In multi-party chains, each seller's bond is keyed to the value the process has
accumulated at its own link — **its own payment included**:

```
Position 1: Seller bonds 2×P₁
Position 2: Seller bonds 2×(P₁ + P₂)
Position 3: Seller bonds 2×(P₁ + P₂ + P₃)
...
Position n: Seller bonds 2×∑Pᵢ
```

`G(i) = ∑_{j≤i} P(j)` is **inclusive**: a seller bonds against everything the
process has accumulated through its link, its own contribution counted, because
that total is the ceiling on what any defection at that link could carry off.
And the figure is not a report. `commit` admits exactly one value — the payment
itself at the root, the live accumulator plus the new payment for any extension
— and refuses every other declaration (`CumulativeValueMismatch`), so the
seller's bond base is fixed by arithmetic against the signed accumulator before
anything is locked. A seller has no interest in declaring more in any case: the
declaration is precisely what it must deposit.

**Coordination pressure**: cumulative exposure `2G(i)` is non-decreasing along
the chain, and the gap a seller weighs against holding out — `Δᵢ = Pᵢ + Gᵢ ≥
2Pᵢ` — grows with every payment accumulated ahead of it. The risk-to-reward
ratio `ρᵢ = 2Gᵢ/Pᵢ` rises with what came before while falling in the seller's own
payment: for equal payments `ρᵢ = 2i`, linear in depth, whereas a late order
with a large payment can face a lower ratio than its predecessor. What holds at
every position without qualification is the exposure and the gap; the ratio need
not rise.

**Example**: if Charlie (delivery) holds out:
- Charlie's $24 stays locked against a meal it can retain worth $10 — a standing
  position of −$14 against the +$2 it declined
- Bob's $20 stays locked too: his food was good, but nothing settles until Alice
  resolves, and Alice resolves when she is satisfied
- Bob's exposure to Charlie's holding out is `P_Bob + 2G_Bob = $10 + $20 = $30`,
  computable from the record — which is why **Bob has a bonded interest in
  Charlie curing** → self-organizing coordination, not altruism

### What the Doubling Does

The doubled schedule is **constitutive**, in the same way that buyer dominance
and atomic resolution are: it is an invariant of the mechanism, not a parameter
it exposes. There is one schedule, applied to every order at every position —
twice the payment from the buyer, twice the cumulative value through its own
link from the seller. The kernel carries no other, exposes no setting, and
admits no order bonded on different terms. What follows is therefore an account
of what the schedule *achieves*, not a derivation of it from something prior,
there being nothing prior to derive it from.

What it achieves is answering **retention**. A defector does not walk away
empty: it walks away holding the value at its link, off-chain, where the kernel
can neither see it nor recover it. A bond equal to the value at the link would
be exactly offset by what the defector keeps, leaving the taking free. The
second half of each bond *is* the retained value, and it is what makes the
taking cost — differently on the two sides, which is why they are stated apart:

- **Seller side.** Holding out leaves the seller credited at most `G` against a
  locked `2G`: at best `−G`, against the `+P` it declined. Retention can halve
  the seller's stake; it can never cancel it. That surviving exposure is what
  gives the buyer's withholding its force and makes the co-seller interest of
  Layer 2 a real one.
- **Buyer side.** Withholding after delivery leaves the buyer credited `P`
  against a locked `2P`: `−P`, against the `0` that closing would give it. Here
  the second half supplies the *whole* of the comparison — a bond equal to the
  payment would be cancelled outright by the goods the buyer holds, leaving it
  indifferent between resolving and not.

On the buyer's side the doubling **creates** the comparison; on the seller's side
it **preserves** an exposure that would otherwise vanish. Both are aimed at value
the kernel can neither see nor reach, which is the only reason a settlement
layer that holds nothing but tokens can discipline the passage of goods at all.

---


## Implementation Details

### Order Status

The kernel does not run a lifecycle state machine. Each order is a single
`uint8` nullifier — `orderStatus` — that advances in one direction only:

```
       commit()                      resolveProcess()
  0 (unknown) ───────→ 1 (committed) ───────→ 2 (resolved)
```

**Key Transitions**:
- **0 → 1**: `commit()` bonds the order. Both parties' EIP-712 signatures are supplied in the same call — there is no separate "offer" then "accept" step. A commitment is bonded atomically, or not at all.
- **1 → 2**: `resolveProcess()` settles every order in the process at once.

**No escape hatches**: there is no `Pending` state, no `Cancelled` state, and no cancellation path. Once an order is committed (`orderStatus == 1`) the only way out is resolution — a committed order cannot be unwound unilaterally; only the buyer can resolve it.

### Core Functions

The kernel exposes exactly two external functions:

- **`commit(Commitment c, bytes buyerSig, bytes sellerSig)`** — Bonds one order. A root order (`c.processId == 0`) creates a new process; a sub-order (`c.processId` set) extends an existing one. Both signatures are verified against the EIP-712 digest of `c`, then the buyer is charged `2 × payment` and the seller `2 × expectedCumulativeValue`. A sub-order additionally requires `c.buyer == process.rootBuyer` and that `expectedCumulativeValue` equals the live accumulator plus `payment` — so it cannot be added without the root buyer's signature, and cannot misreport cumulative value.
- **`resolveProcess(bytes32 processId, Commitment[] commitments)`** — Buyer atomically resolves ALL active orders in the process. The caller must be the process's `rootBuyer`, and the commitment array must list every active order or the call reverts (`IncompleteOrderList`). This all-or-nothing semantics is what creates the seller coordination pressure described in Layer 2: sellers cannot be paid individually, so they must collectively satisfy the buyer.

There is no `firstOrder`, `subOrder`, `acceptOffer`, or `cancelOffer` — those belonged to an earlier two-step offer/accept design. The unified `commit` replaced them: the agreement is negotiated and dual-signed off-chain, then one transaction bonds it. Full function signatures and access control are in the contract source (`src/kernel/FigaroCore.sol`).

### Bonding

The kernel computes bonds inline in `commit` — there is no separate helper
function:

```solidity
buyerBond  = c.payment * 2;                 // local value P, doubled
sellerBond = c.expectedCumulativeValue * 2; // cumulative value G, doubled
```

**Properties**:
- `sellerBond` is non-decreasing along the chain — it is keyed to the accumulator, so it carries every payment committed ahead of it
- `buyerBond` stays local (it tracks only this step's payment P)
- the deterrent holds at every position: the gap a seller weighs against holding out is `Δᵢ = Pᵢ + Gᵢ ≥ 2Pᵢ`, strictly positive everywhere and widening with what came before. The *ratio* `sellerBond / buyerBond = Gᵢ/Pᵢ` need not rise with depth — it falls in the seller's own payment, so a late order with a large payment can sit below its predecessor. What holds without qualification is the exposure and the gap, not the ratio

### Settlement on Resolution

The kernel takes no fee. There is no `feeRate`, no `feeSnapshot`, no treasury,
and no cancellation path. At resolution every order pays out directly:

```solidity
sellerPayout = c.expectedCumulativeValue * 2 + c.payment;  // bond back + payment earned
buyerPayout  = c.payment;                                  // bond back, minus the payment
```

**Net token effects** (per order, G = cumulative value, P = payment):
- Seller: `−2G + (2G + P) = +P` — earns the payment, recovers the bond ✓
- Buyer: `−2P + P = −P` — pays the payment, recovers the rest of the bond ✓
- Contract: every bonded token is transferred straight back out; balance = 0 ✓

These are the *token* movements, which is all the kernel knows. The buyer's full
settled position adds the delivery it now holds, worth `P` at the value the
parties signed: `−2P + P + P = 0`. That zero is the mark of an exchange
completed, not of an exchange without benefit, and it is the figure the
equilibrium analysis uses.

**Conservation invariant**:

```
sellerPayout + buyerPayout = (2G + P) + P = 2G + 2P = sellerBond + buyerBond
```

Every token that entered as a bond leaves to one of the two parties — nothing
is retained, and there is no third recipient. This is the "direct transfer
settlement, no internal ledger" property: the kernel never holds a
withdrawable balance.

---

## N-Party Model

### Constant Buyer Pattern

**Key Insight**: In value chains, the **buyer remains constant** (end consumer), while sellers form a chain.

**Example**: Food delivery
```
Alice (Customer) ← Bob (Restaurant) ← Charlie (Courier)
      BUYER            SELLER 1          SELLER 2
```

**Order Structure**:
```
Order #1: Alice ← Bob
  - Alice bonds $20 (buyer)
  - Bob bonds $20 (seller)
  
Order #2: Alice ← Charlie
  - Alice bonds $4 (buyer, only for delivery)
  - Charlie bonds $24 (seller, includes food + delivery)
```

### Coordination Cascade

**Critical property**: atomic resolution means one seller's holding out leaves *every* position in the process open — nobody's bond is consumed, and nobody's is released either.

**Mechanism**:
```
Charlie holds out with the meal
  ↓
Alice is not satisfied, so she does not resolve — and resolving would be
terminal at −P, paying the party that failed
  ↓
Charlie's $24 stands locked against a meal it can retain worth $10:
a standing position of −$14 against the +$2 it declined
  ↓
BUT: Bob delivered good food!
  ↓
Bob's $20 stands locked too — atomic resolution settles every order or none
  ↓
Bob's exposure to Charlie's holding out is P + 2G = $10 + $20 = $30,
a figure Bob reads off the record
  ↓
Bob has a bonded interest in Charlie curing — and Charlie's own cheapest
move is to perform, or to make Alice whole and net bond-only
  ↓
Self-organizing coordination
```

**Design Principle**: make curing cheaper than standing in an open position.

### Asymmetric Ratios

Position in chain determines bond asymmetry (rows below use the running
example: $10 food, +$2 delivery, +$3 packaging):

| Position | Seller Bond `C_s` | Buyer Bond `C_b` | `C_s : C_b` |
|----------|-------------------|------------------|-------------|
| 1 | $20 | $20 | 1:1 |
| 2 | $24 | $4 | 6:1 |
| 3 | $30 | $6 | 5:1 |
| n | 2×∑Pᵢ | 2×Pₙ | ∑Pᵢ : Pₙ |

Two quantities are easily conflated here, so they are named apart. The table's
last column is the **bond asymmetry** `C_s : C_b = Gᵢ/Pᵢ` — how the two parties'
positions at one order compare with each other. The seller's **risk-to-reward
ratio** is `ρᵢ = C_s/Pᵢ = 2Gᵢ/Pᵢ` — its own position against its own earnings, and
twice the first quantity. Everything below is stated for whichever is meant.

**Interpretation**: cumulative exposure `2G(i)` is non-decreasing along the
chain — the deeper party bonds against everything accumulated at its link while
earning only its own payment. Neither the asymmetry `C_s : C_b` nor `ρᵢ` need
rise with depth: both fall in the seller's own payment, which is why the third
row above sits below the second on the asymmetry (and `ρ₃ = 10` sits below
`ρ₂ = 12`). What holds at every position without qualification is the exposure
and the gap `Δᵢ = Pᵢ + Gᵢ`, not either ratio.

---

## Enforcement Model

Figaro's coordination mechanism operates across five layers. Understanding each layer explains why the protocol works without timeouts, protocol-run arbitrators, or governance backstops — not as a temporary simplification, but as a permanent design property.

The stack, bottom to top, and it is five: **Layer 0** — blockchain security, the named foundation; **Layer 1** — the bonding equilibrium at two parties and at N, with the evidence/audit/event record co-resident (produced always, by ordinary operation); **Layer 2** — the co-seller coordination game, told remedy-first; **Layer 3** — arbitration (e.g. Kleros); **Layer 4** — traditional legal systems. Layers 3 and 4 are standing layers that consume the Layer-1 record from outside the protocol — recourse there exists with no clause named. Scaling from two parties to N is not a layer: it is Layer 1's own schedule applied at every link, and it is treated inside Layer 1 for that reason.

### Layer 0: Blockchain Security (The Named Foundation)

**Mechanism**: The host chain's consensus — signature verification, transaction ordering, immutability of committed state.

This layer is not Figaro's to build, but it is load-bearing and therefore named: the bonds are only as locked, and the event record only as immutable, as the chain that holds them. Every guarantee in the layers above inherits from it.

### Layer 1: The Bonding Equilibrium (Evidence Record Co-Resident)

This layer is asymmetric bonding — Mechanism 1 — and it does two jobs that are
easily mistaken for two layers. It secures the bilateral edge, and it carries
that security to chains of any length. Both are the bond schedule's own work,
and the subsections below take them in that order.

#### At two parties

**Players**: Single buyer, single seller  
**Mechanism**: Bonding at the root, where `G = P` and the two bonds coincide at 2×payment  
**Outcome**: After performance, resolving is unconditionally strictly better for the
buyer; given that, performance is the seller's strict best response

**Outcomes** at the root (`G = P`), each cell = locked position + the assented
value of what the party holds:

|                        | resolution occurs | no resolution |
|------------------------|-------------------|---------------|
| **performance occurs** | B: 0, S: +P ✓     | B: −P, S: −2P |
| **no performance**     | B: −P, S: ≤ +2P   | B: −2P, S: ≤ −P |

**Key Properties**:
- **Single transaction**: isolated 2-party exchange
- **Equal stakes at the root**: `G = P`, so both parties bond 2×payment; every
  position below the root has the larger seller bond (next subsection)
- **Clear outcome**: performance with resolution yields `(0, +P)` — the buyer's
  unique maximum of the four; the unresolved cells are standing positions, not
  settlements, and nothing in the kernel converts them into anything
- **The two-step composition**: `0 > −P` for the buyer after performance (needing
  no assumption about the seller), and given that, `+P > −P` for the seller once
  it is credited with everything it retains

**Example**: Alice orders $10 bread from Bob
- Alice bonds $20, Bob bonds $20
- Bob bakes and delivers → Alice's own comparison is `0` against `−$10`, so she
  resolves → Bob recovers $20 and earns $10
- Bob holds out → he keeps bread worth at most $10 against $20 locked: −$10,
  against the +$10 he declined; Alice, having received nothing, stands at −$20
  and withholds, because paying for nothing is worse than waiting for something
- **Result**: Bob delivers and Alice resolves — each because it is that party's
  own better move, neither on trust in the other

The bilateral case is the well-studied one. What follows is the same layer at
N parties.

#### Layer 1 at N parties: scaling is the bond schedule's own work

**Scaling to N parties is Mechanism 1's work** — each seller bonding the
cumulative value at its own link — **and buyer dominance then coordinates the
already-scaled mesh.** The distinction is worth holding: this is not a bridge
between two layers, and the credit for reaching N parties belongs to the bond
schedule, not to the resolution rule. Atomic resolution's contribution is a
different one, taken up at Layer 2 — it closes the mesh from one signature and
induces the weakest-link subgame among sellers, neither of which is a scaling
result.

**Problem Statement**: how does the bilateral equilibrium extend to multi-party
chains without breaking the incentive structure?

**Naive Approach (Fails)**:
```
Chain: Alice ← Bob (food: $10) ← Charlie (delivery: $2)
Bonds fixed per trade, on each seller's own payment:
  Bob: $20, Charlie: $4

Problem:
- Charlie holds out with the meal in its hands
- What it retains is the $12 accumulated at its link, not the $2 it is paid
- Credit the retention: −$4 + $12 = +$8. The taking pays for itself
- The deterrent survives at the root and evaporates at depth
```

**Figaro Solution: Cumulative Bonding**

```
Chain: Alice ← Bob (food: $10) ← Charlie (delivery: $2)

Bonds:
- Bob: 2×$10 = $20 (symmetric with Alice)
- Charlie: 2×($10+$2) = $24 (asymmetric - scales with cumulative value)
- Alice: $20 + $4 = $24 total

Stakes (ρᵢ = C_s/Pᵢ, the risk-to-reward ratio — not the C_s : C_b asymmetry):
- Charlie stands in $24 to earn $2 → ρ = 12
- Bob stands in $20 to earn $10 → ρ = 2
```

**Why This Works**:

1. **Each seller's bond exceeds what it could carry off**: Charlie's $24 is twice
   the $12 accumulated at its link, so crediting the retention still leaves it out
   of pocket
2. **Cumulative exposure is non-decreasing along the chain**: `2G(i)` accumulates
   every payment ahead of it — linear in depth for equal payments, never geometric
3. **The deterrent holds at EVERY position**: the gap `Δᵢ = Pᵢ + Gᵢ ≥ 2Pᵢ` is
   strictly positive everywhere, and widens with what came before
4. **Self-enforcing coordination**: every seller's payout waits on every other's
   performance, so each holds a computable interest in the rest of the chain

**The comparison at position `i`**, with cumulative value `G(i)` and local payment
`P(i)`:

```
Seller bonds:  B(i) = 2×G(i)
Seller earns:  E(i) = P(i)

Performing, then resolution:   +P(i)             payment earned, bond recovered
Holding out, no resolution:    −2×G(i) + r(i)    r(i) ≤ G(i) is what it can
                                                 actually retain off-chain
                             ≤ −G(i)             at maximal retention

Given that the buyer resolves after performance — unconditional, assuming
nothing about the seller — performing is the seller's strict best response at
every position. The gap is

  Δ(i) = P(i) + G(i) ≥ 2×P(i)

equal to 2×P(i) only at the root, wider with every payment accumulated ahead of
the seller, and wider again wherever the seller cannot retain the whole
accumulated value (a courier holds the meal but cannot retain a delivery it
never made).
```

**Not dominance-solvable on the seller side.** The conclusion is conditional and
must stay so. Where some *other* seller has held out and the process is not going
to close, `S_i`'s own holding out is strictly better for it than performing:
performing costs it bond and product together, `−2G(i)`, against `−2G(i) + r(i)`
for keeping what it holds. No bond schedule can make handing goods to a party
that will not pay attractive. What recommends the cooperative profile to each
seller is that it is strictly better **provided the others perform** — the
weakest-link structure Layer 2 takes up — and what makes that proviso credible is
that a failed profile is never banked: no clock runs from the bonded state, so
the process does not fail, it stays open until it closes, and every party in it,
the holdout included, strictly prefers the closing to the position it holds.

**Critical Insight**: bonding against the accumulated value ensures that:
- **Early sellers** (high P, low G): stake and retention are close together, and
  the second half of the bond is what separates them
- **Late sellers** (low P, high G): stake against everything the chain has
  accumulated, while earning only their own payment

**Result**: the deeper the position, the larger the standing exposure a party
carries into the process. That is what produces quality-control pressure along
the chain — and it is exposure, not punishment: nothing consumes a bond.

**Why this is not a layer of its own**: it is not a separate game but the same
equilibrium at every position, produced by the same schedule. Nothing new is
assumed, no second mechanism is invoked, and the bilateral result is not
patched — the bond base simply keys to the accumulator instead of to the local
payment, and every comparison of the previous subsection carries through.

**Common Mistake**: treating multi-party coordination as just "multiple 2-party
games". Each position stands in a different amount, and it is that asymmetry —
not any coordination rule — that preserves the deterrent at depth.

#### Co-resident at Layer 1: the evidence record

Every `commit` and `resolveProcess` emits immutable, block-timestamped events (`OrderCommitted`, `OrderResolved`, `ProcessResolved`) — produced always, as a by-product of ordinary operation, not only when something goes wrong. The record lives here, beside the bonds, and it is co-resident with both subsections above: what it holds is the commitments and the fact of non-resolution, never performance. Layers 3 and 4 consume it from outside, and neither produces anything of its own.

---

### Layer 2: Seller Coordination Game (The Micro-Lending Circle Effect)

**Players**: Multiple sellers in the same service chain  
**Mechanism**: Atomic resolution (all-or-nothing payment)  
**Outcome**: Sellers pressure each other to perform

**The Micro-Lending Analogy**:

In Grameen Bank-style micro-lending:
- Lend to groups of 5-10 people
- If ONE defaults → ENTIRE group loses future lending access
- Result: **Group members police each other** → Higher repayment rates than individual loans

**Figaro mirrors this structure**:

```
Chain: Alice ← Bob (restaurant) ← Charlie (courier) ← Dave (packaging)

Atomic resolution:
- Alice calls resolveProcess(processId, [order1, order2, order3])
- ALL orders resolved together, or NONE
- If Dave fails → Charlie doesn't get paid
- If Charlie fails → Bob doesn't get paid
- Everyone sinks or swims together
```

**Coordination Pressure Mechanism**:

```
Scenario: Dave (packaging) does sloppy work

Direct effect:
  - Alice is not satisfied, so she does not resolve
  - Dave's $30 stays locked against what it holds — a standing position,
    not a loss taken, and one only he and Alice can end

Cascade effect (the externality, computed with retention):
  - Charlie delivered: his exposure to Dave's fault is P + 2G = $2 + $24 = $26
  - Bob cooked: his exposure is P + 2G = $10 + $20 = $30
  - Both figures are read off the record; a co-seller that has NOT yet
    performed still holds what is in its hands, so its exposure has the
    floor P_i + G_i and no exact figure

Social pressure:
  - Charlie to Dave: "Cure this — $26 of mine turns on it"
  - Bob to Charlie: "See that Dave cures it — $30 of mine turns on it"
  - Dave faces a bonded interest, not a plea, from both co-sellers

Result: Dave cures the packaging — the move that ends his exposure
```

**Game Theory**:

This is a **one-shot weakest-link game** — no repeated interaction and no
local information required:

```
Single transaction: Dave weighs curing against holding out

But nobody is paid until the buyer resolves:
  - Dave performs — repackages to what Alice will accept — and is resolved at +P
  - Or, where he cannot, the remedy transfer: send Alice the payment he stands
    to receive and make good what he holds, netting bond-only at resolution —
    zero, his failure earning him nothing
  - Every co-seller has reason to help him cure it; their own locked positions
    are what back the remedy
  - The weakest-link stakes (P_i + 2G_i on a co-seller that has performed,
    floor P_i + G_i on one that has not) are the pressure; the cure is the play

Rational Dave: perform, or make the buyer whole — either beats standing at −G
indefinitely with his $30 locked and every co-seller's position open beside his
```

Periphery, not mechanism: settlement history is public and permanent, so any
future counterparty can read how a process settled — but the protocol keeps no
score, no reviews, and no blacklist, and the coordination pressure above needs
none of them.

**Why Atomic Resolution Is Critical**:

Traditional approach (individual payments):
```
Alice pays Bob → Bob satisfied → No pressure on Charlie/Dave
Alice pays Charlie → Charlie satisfied → No pressure on Dave
Alice pays Dave → Dave gets paid even with bad work

Result: No coordination pressure, sellers independent
```

Figaro approach (atomic resolution):
```
Alice resolves ALL at once:
  - If ANY seller fails → NONE get paid
  - Sellers cannot free-ride on others' work
  - Group accountability emerges naturally

Result: Sellers self-organize into quality control networks
```

**What is and is not reproduced**: the analogy is to the *coordination-pressure
component* of the joint-liability equilibrium — the interest each participant
holds in the others' performance — obtained here requiring none of four
assumptions that literature carries:

1. **repeated interaction** — the equilibrium is established within a single
   process, with no continuation value across processes and no trigger strategies
2. **local information among sellers** — the exposure `P_i + 2G_i`, or its floor
   `P_i + G_i`, is computed from the accumulator alone. *Narrowly*: what is
   reduced is the **existence** of the pressure and the knowledge of its
   magnitude, not every use the parties may put it to. Acting on a *particular*
   failure still needs local information — which seller did not perform is
   knowledge the parties hold and the accumulator does not, performance being off
   the record entirely
3. **a punishment technology exogenous to the contract** — what a co-seller stands
   to lose is its own locked position, held through non-resolution, not imposed
   by anyone
4. **joint-liability contracting** — each bond is posted individually against that
   seller's own snapshot, never against a group's aggregate obligation; the
   coupling comes from atomic resolution, not from the bond structure

The peer-selection and peer-monitoring results of that literature are **not**
reproduced: they need structure above the bonded primitive, and nothing here
supplies it.

**Design Implication**: Features that break atomic resolution (e.g., partial payments, pay-one-at-a-time) would DESTROY this coordination layer. This is why we reject such features.

---

### Layer 3: Arbitration (Standing Recourse, e.g. Kleros)

**Players**: Parties + an arbitration forum of their choosing  
**Mechanism**: Third-party adjudication consuming the Layer-1 evidence record  
**Outcome**: Disputes the economics did not dissolve are decided on an unforgeable record

Arbitration is a standing layer, not a transition aid — and recourse here exists with no clause named: nothing in the agreement has to designate a forum for the parties to seek one. A decentralized arbitration protocol such as Kleros — or any forum the parties choose — takes the timestamped event record produced at Layer 1 as evidentiary input and renders a decision. **The forum rules while the process stands open, before the buyer resolves, and it cannot resolve in the buyer's place** — there is no direct enforcement mechanism, and that is precisely why composing a forum leaves the equilibrium untouched: nothing on the path by which bonds are released is handed to a party the bonds do not constrain. What an award changes is the parties' remedy negotiation; the parties then act on it — a cure, a remedy transfer, or a compensating reverse commitment — and the buyer resolves once satisfied. The record supplies what was undertaken and what remains unsettled; it never shows performance, which happened where the kernel cannot look, so the parties supply that themselves. Because arbitration is cheaper and faster than court, it is the natural first stop for the residue of cases Layers 1–2 leave; Layer 4 stands behind it.

**Resolution is terminal acceptance**, and this is the corollary on the other side of the same boundary. Once the buyer resolves, the process is settled, the transfers are made, and the mechanism holds nothing further for anyone to recover — no forum, and no later ruling, can reach a balance that is no longer there. A buyer with a live complaint therefore resolves **after** the complaint is answered, not before: the whole of the recourse window is the interval in which the process stands open, which is also the interval in which both parties want their positions released. There is no recourse after resolution because there is nothing left to act on, and that is what makes resolving mean acceptance rather than merely mean payment.

---

### Layer 4: Traditional Legal Systems (Edge Case Deterrence)

**Players**: Parties + legal system + public observers  
**Mechanism**: Court enforcement backed by the immutable on-chain evidence produced at Layer 1  
**Outcome**: Frivolous abuse deterred by legal precedent + the permanent public record

Courts, too, are a standing layer — they consume the Layer-1 record from outside the protocol, and no clause has to name a jurisdiction or venue for the parties to reach one. The same boundary binds here as at Layer 3: a court rules **while the process stands open**, and it cannot call `resolveProcess` — resolution is the buyer's alone, and no ruling gives anyone else the call. A judgment reaches the buyer the way judgments ordinarily reach parties, through the buyer's exposure outside the process, and inside the process it works by changing what the buyer expects from continuing to withhold.

**The SSoT (Single Source of Truth) Argument**:

The Layer-1 record provides **tamper-proof evidence** for legal proceedings:

```
Scenario: Buyer refuses to resolve despite good delivery

Traditional system:
  - He-said-she-said dispute
  - Expensive discovery process
  - Uncertain outcome

With Figaro:
  - Blockchain shows: Buyer bonded $20
  - Blockchain shows: All sellers bonded correctly
  - Blockchain shows: Order committed at time T (the `OrderCommitted` event, block timestamp)
  - Blockchain shows: Order is still unresolved (no `OrderResolved` event for it)
  - Therefore: Buyer has not resolved for 90 days (computed from event timestamps)
  - Evidence is IMMUTABLE (can't be altered)
  - What the record does NOT show: performance. That the bread was baked and
    handed over happened off-chain; the parties bring that themselves

Court ruling: on the undertaking from the record and the performance from the
parties. It binds the buyer through the buyer's exposure outside the process —
it cannot resolve the process, and does not try to
```

**Legal Precedent Creation**:

First few cases establish patterns:

```
Case 1: Buyer withholds resolution frivolously
  - Court reviews the on-chain record plus what the parties show it
  - Rules against the buyer; the ruling reaches the buyer outside the process
  - The buyer, now worse off from continuing to withhold, resolves — its own
    comparison was already 0 against −P before the ruling
  - Public court record established

Case 2: Another buyer tries same tactic
  - Lawyer cites Case 1 as precedent
  - Judge: "This has been settled, rule for sellers"
  - Buyer pays legal fees + damages

Result: after a few cases, the tactic is a known losing one
```

**Economic Deterrence**:

```
Buyer considering a frivolous withholding:

Costs:
  - Its own position: −P once credited with the delivery it holds, against the
    0 that resolving would give it — the mechanism's own figure, before any
    forum is involved
  - Legal fees and any damages awarded
  - Permanent public record of an undertaking never closed — read by every
    future counterparty

Benefits:
  - Annoy sellers: $0 economic value
  - Avoid payment: no. The payment is frozen inside the buyer's own bond,
    out of reach of both parties; withholding does not return it

Rational decision: resolve
```

**Why This Works**:

1. **Immutable evidence**: The Layer-1 event record is a perfect audit trail
2. **Public record**: All transactions visible; settlement history is permanent and derived — never a score, but readable by anyone
3. **Precedent cascade**: Early cases deter future abuse
4. **Economic irrationality**: Abuse costs more than cooperation

**How the precedent cascade works here**: forums ruling on the open process record accumulate a body of decisions — what counted as conforming performance, what a remedy had to look like — that anyone can read before committing. The deterrent is not a new enforcement organ; it is that record of decisions, standing beside the mechanism's own arithmetic.

**Layers 3–4 Handle Edge Cases Layers 1–2 Don't**:

- Truly irrational actors (rare but possible)
- Buyers who value spite > payoff (psychologically abnormal)
- Systemic attacks by bad-faith actors

For these cases, arbitration and the legal system provide **deterrent enforcement**. The kernel's event log — `OrderCommitted`, `OrderResolved`, `ProcessResolved`, each carrying its block timestamp — supplies the irrefutable audit trail both forums need. No on-chain governance assists them — the protocol is inert and immutable; the off-chain forums do the rest.

---

### Summary: Defense-in-Depth

The five enforcement layers work together. The goal is not redundancy for its own sake — it is overlap: each layer catches what the previous one cannot.

| Layer | Mechanism | Primary Cases |
|-------|-----------|---------------|
| **0. Blockchain security** | Host-chain consensus — signatures, ordering, immutability | The foundation everything above inherits |
| **1. Bonding equilibrium** | Asymmetric bonding at two parties and at N (evidence record co-resident) — after performance the buyer's preference for resolving is unconditional, and given it performance is each seller's strict best response at every chain position | The default: crediting a defector with everything it retains, defection is still out of pocket |
| **2. Co-Seller Remedy** | Atomic resolution — nobody is paid until the buyer resolves, so co-sellers help fix faults (micro-lending circle effect) | Multi-seller failures |
| **3. Arbitration** | A forum of the parties' choosing (e.g. Kleros) consumes the Layer-1 record | Disputes the economics did not dissolve |
| **4. Courts** | Traditional legal systems consume the same record from outside | Irrational or adversarial actors |

**Note on what Figaro does NOT include**: No governance layer. No timeout. No protocol-run dispute machinery. No insurance tranche. No oracle. The locked bonds are the enforcement mechanism; the immutable record is the evidence trail. Any feature that introduces a unilateral escape hatch from a committed order destroys Layer 1. Any feature that introduces partial resolution destroys Layer 2. These are hard constraints.

**Why This Is Superior to Traditional Approaches**:

Traditional protocols pick one enforcement mechanism — an arbitrator, a timeout, a validator. Each creates a single point of failure. Figaro layers orthogonal mechanisms:

```
Problem: Buyer tries to abuse system

Layer 1: Stands at −P holding the delivery, against the 0 that closing gives it
         (economic deterrence) — irrational unless spite > payoff
Layer 2: Co-sellers remedy any real fault, leaving a pretextless withholding
         exposed in the permanent record
Layers 3–4: Loses in arbitration or court (legal deterrence) — immutable
         evidence, unforgeable timeline, ruled on while the process stands open

Must beat ALL of these simultaneously → Economically and legally irrational
```


---

## Security Analysis

### Attack Vectors (and Defenses)

#### 1. Griefing Attack

**Attack**: Buyer withholds resolution after delivery, to keep the sellers' bonds locked.

**Defense**:
- The buyer's own 2×P stays locked for as long as it withholds — resolving is the only way to recover it, and the payment it is "keeping" is frozen inside that same bond, out of reach of both parties
- Credit the buyer with the delivery it holds and it still stands at −P against the 0 that closing would give it: the attack costs the attacker the whole payment
- The withholding is permanently visible: settlement history is public and derived, and every future counterparty can read an undertaking never closed

**Economic Analysis**:
```
Attacker position: −P (locked 2P, credited P for the delivery it holds)
Closing instead:    0
Attacker gain:      0 — the frozen payment is not returned by withholding

Result: irrational attack; the deterrent prices a grudge, it does not
        prevent an irrational party from paying that price
```

#### 2. Sybil Attack

**Attack**: Create fake orders to manipulate state.

**Defense**: Each order requires real bonds → Sybil is capital-intensive.

**Cost**: `2×(cumulativeValue + payment)` per fake order → Prohibitive at scale.

#### 3. Front-Running

**Attack**: Observe pending transaction, create conflicting order.

**Defense**: Orders are self-contained and content-addressed. A root order's `processId` is the EIP-712 digest of its own dual-signed commitment, and every `orderHash` is `keccak256(processId, structHash)`. An attacker cannot forge a commitment without both parties' signatures, and a duplicate commitment is rejected outright (`DuplicateCommitment`).

**Note**: The `salt` field in the `Commitment` struct is the bilateral nonce — replay protection and collision resistance. `block.prevrandao` is deliberately NOT used: under proof-of-stake the block proposer knows `prevrandao` up to an epoch ahead, which would make it a weaker source than a party-chosen salt bound into the signed struct.

#### 4. Bond-Minimization Attack

**Attack**: Split a chain into many small orders to reduce the bond posted at any one link.

**Defense**: the schedule is applied per order and keyed to the accumulator, not to the order's own payment — a seller at position `i` bonds `2G(i)`, everything the process has accumulated at its link. Splitting an order in two leaves the later half bonded against the same accumulated total, so the exposure at the link is unchanged. There is no order bonded on other terms.

### Liveness Properties

**Theorem**: a process closes whenever the buyer is satisfied, and no other party's conduct can withhold closure from a satisfied buyer.

**Proof**:
```
After performance, the buyer's own comparison is 0 (resolve) against −P
(withhold), and it holds whatever the seller is like. So a satisfied buyer
resolves because resolving is its better move, not because anything compels it.

Before performance, the buyer withholds — resolving is terminal at −P, and it
forecloses the continuation on which the goods could still arrive. Withholding
never worsens with time: no clock runs from the bonded state, and an unresolved
position is a position held, not a loss taken.

Therefore: the standoff ends in performance or in a remedy agreed before
resolution — the failing seller sends the buyer the payment it stands to
receive and makes good what it holds, netting bond-only at resolution.
```

**The one interference, and its bound**: `resolveProcess` requires the complete
active-order list, so a sub-order committed between the moment the buyer builds
its calldata and the moment the transaction lands makes the call revert
(`IncompleteOrderList`) and the buyer rebuilds and resends. This is a retry, not
a denial, and it is bounded by the buyer itself: every sub-order carries the
buyer's own signature and expires at its deadline, so the only party that can
force the retry is one the buyer has already signed for, and only for as long as
that signature remains valid.

**Caveat**: the residue is a party that neither performs, nor remedies, nor answers a forum's ruling. Its position simply stands — bonds locked, the seller at best at `−G`, the record marking an undertaking never closed. That is the irrational residue every system carries; the deterrent prices a grudge, it does not prevent an irrational party from paying that price.

---

## Comparison with Traditional Approaches

### Escrow Services

| Aspect | Traditional Escrow | Figaro |
|--------|-------------------|--------|
| Arbitrator | Required (trusted third party) | None (buyer is judge) |
| Timeouts | Yes (complex calibration) | No (indefinite pressure) |
| Edge Cases | Manual intervention | Economic resolution |
| Complexity | High (dispute system) | Low (pure game theory) |
| Stake posted | ~1× transaction value | 2× transaction value |
| Trust Model | Trust arbitrator | Trust code + incentives |

### Payment Channels

| Aspect | Lightning/Raiden | Figaro |
|--------|------------------|--------|
| Use Case | High-frequency payments | Coordinated fulfillment |
| Dispute | Timeout-based challenge | No disputes (coordination forcing) |
| Multi-Party | Limited (hubs) | Native (N-party chains) |
| Capital | 1× per channel | 2× per order |
| Liveness | Requires online parties | Asynchronous |

### Smart Contract Platforms

| Aspect | Ethereum L1 | Figaro |
|--------|-------------|--------|
| Validation | Miners/validators | Economic incentives only |
| Security | Consensus layer | Game theory layer |
| Dispute | Code is law | Capital is law |
| Upgrade | Forks/governance | No upgrades needed |
| Gas Costs | Per computation | Per state change |

---

## Advanced Topics

### DAG Support

**Question**: The kernel only ever sees a linear process — a single monotonic
`cumulativeValue` accumulator. Does that limit Figaro to linear chains?

**Answer**: No. DAG topology — fan-out, fan-in, diamond dependencies — is
fully expressible. It simply does not live in the kernel.

**Two layers**:

1. **The kernel** sees a flat process: a `processId`, a monotonic
   `cumulativeValue`, and an `activeOrderCount`. Every sub-order's
   `expectedCumulativeValue` is checked for exact equality against the live
   accumulator plus its own `payment`; a mismatched commitment reverts
   (`CumulativeValueMismatch`). The kernel stores no parent-child links —
   there is no on-chain order DAG.

2. **The topology layer** carries the DAG. It lives off-chain in the signed
   agreement (the `figaro-topology` clause) and is reconstructed
   by indexers and UI. Parents, children, and merges are expressed there, not
   in kernel state.

**Structures larger than one linear process** — wider DAGs, or DAGs beyond
the network's per-process gas ceiling — compose by nesting: a sub-order in process A is
also the root commitment of a child process B. The overall DAG then spans
multiple processes and multiple settlements, while each individual process
stays linear and within the ceiling.

**Why this is safe**: honesty is enforced *before* the fact. Because the
kernel pins each sub-order's `expectedCumulativeValue` to the accumulator, a
wrong value never commits in the first place — there is no "claim a false
value, lose your bond later" path. The off-chain topology is advisory
metadata; the economic enforcement rides entirely on the on-chain linear
accumulator and the bonds it sizes.

### Multi-Step Chains

**Generalization**: Figaro supports arbitrary-length service chains.

**Invariant**: The buyer remains constant (the `rootBuyer`); sellers extend the process one sub-order at a time.

**Bond Formula**:
```
For the seller of the order at position i in a process:
  G(i) = ∑ payment of every order committed so far, INCLUDING this order's
         own payment (the live accumulator plus P(i) — what commit checks)
  Bond(i) = 2 × G(i)
```

**Example**: 3-step chain
```
Alice ← Bob ← Charlie ← Dave
  $10    +$2     +$3

Bonds:
  Bob:     2×$10 = $20
  Charlie: 2×$12 = $24
  Dave:    2×$15 = $30
  Alice:   2×($10+$2+$3) = $30 total across all orders
```

### Capital Velocity Across Processes

**Pattern**: bonded capital is never consumed, so the same balance secures an
unbounded sequence of settlements over time.

Nothing in the kernel destroys a bond. At resolution every locked token is
transferred straight back out to the two parties, and the contract's balance
returns to zero. A bond is therefore a *position held for the life of one
process*, not a cost paid into it — which means the capital a party needs is
set by how many processes it holds open **at once**, not by how many it settles.

**Mechanism** (two successive processes, resolved in order):
```
Process A — Alice buys a $10 meal from Bob
  Alice locks 2×$10 = $20; Bob locks 2×$10 = $20
  Alice resolves: Bob receives $20 + $10 = $30, Alice receives $10
  Alice is out $10 — the payment — and her $20 of bonding capacity is free again

Process B — Alice buys a $10 meal from Dana the next day
  Alice locks the same $20 again
```

Within a single process there is no such recycling and the section should not
be read to suggest one: resolution is **atomic and terminal for the whole
process** — every active order settles together, and a resolved process cannot
be extended, so there is no "settle the first order, then commit the second
against the returned capital". A buyer running an N-order chain stands in
`2×∑Pᵢ` for the whole of that chain's life. What recycles is capital across
*settlements*, serially: the same $20 that secured Monday's process secures
Tuesday's, and the constraint on a participant is concurrency, not throughput.

This is the wallet-life reading of the mechanism from the buyer's side. A
participant stays productive for as long as it holds balances it can bond;
resolution returns those balances intact, so bonding is a use of capital rather
than a consumption of it.

### Mutual-Consent Exit (Permanently Excluded)

**Question**: What happens when neither party is at fault but the deal cannot
complete? A delivery truck is in an accident. A natural disaster destroys
inventory. Can both parties agree to unwind?

**Answer**: The kernel carries no exit path, and never will. It has exactly
two external functions — `commit()` and `resolveProcess()` — and resolution
pays one fixed settlement per order (seller: full bond back plus payment;
buyer: payment recovered). A `mutualExit(processId, splitRatio, …)` entry
point is permanently excluded (ruled 2026-07-14), and so is any operation that
returns part of a bond on any terms but resolution.

Nothing is lost, because the unwind is already fully expressible with the
existing primitives:

1. **The buyer resolves when it is satisfied.** `resolveProcess` has no
   precondition beyond buyer identity and the full active-order list. Bonds
   stand locked only while the buyer is not yet satisfied — a standing
   position, held by parties who each want it released, which is the deterrent
   working as designed and not a missing feature.
2. **The unwind is settled between the parties, before resolution.** The
   concrete transfer is the remedy of the equilibrium analysis: the seller that
   cannot deliver sends the buyer the payment it stands to receive and makes
   good whatever of the buyer's it holds; at resolution it takes back its bond
   and the payment it has already paid away, ending at zero, and the buyer ends
   at zero as well. Where the parties want a different split, the compensating
   transfer is itself a commitment: the original seller, acting as buyer of a
   new process, commits the agreed amount to the original buyer — bonded like
   any other order, under the same schedule. Both processes resolve; the net
   effect is exactly what the parties agreed. The "mutual consent" is enforced
   by the same bilateral EIP-712 dual signature as the original commitment: the
   unwind is the primitive itself, not a hatch.
3. **External legal forums** adjudicating frustration or impossibility rule on
   the timestamped on-chain record while the process stands open, and feed the
   parties' negotiation; none of them can call `resolveProcess`, so none of
   them ever sits on the path by which bonds are released.

A kernel-level exit with a split ratio would be a third entry point on a frozen
kernel, and it would break the analysis rather than extend it: every comparison
in the equilibrium weighs exactly two continuations at a node, and an exit path
adds a third — either seating the decision with a party the bonds do not
constrain, or replacing the comparison that made the cooperative move a best
response. The composed path has no such effect: knowing it exists changes
nothing, because it carries the same bond schedule as the deal it unwinds.

---

## Conclusion

Figaro represents a paradigm shift in multi-party coordination:

**Traditional Approach**: Build complex systems (timeouts, arbitrators, validators, governance) to handle edge cases.

**Figaro Approach**: Arrange the on-chain positions so that the off-chain passages of value run honestly. The value, the performance, and the parties' knowledge of both stay off the record; what the kernel holds is the bonds, the accumulator, and the record of undertakings — and that is enough, because a defector credited with everything it keeps is still out of pocket. When a disagreement does arise, the record is the evidence trail that arbitration and existing legal systems work from, while the process stands open.

**Core Thesis**: locked bonds sized against the value at each link make performance and resolution each party's own better move — no external enforcement required, and none available.

**Defense-in-Depth — five layers**:
1. **Layer 0 - Blockchain Security**: the host chain's consensus is the named foundation everything above inherits
2. **Layer 1 - The bonding equilibrium**: after performance, resolving is unconditionally strictly better for the buyer; given that, performance is the seller's strict best response. The same schedule carries that result to every position in an N-party chain — each seller bonding the cumulative value at its own link, which is asymmetric bonding's own work and not a layer of its own. The evidence record is co-resident here, produced by ordinary operation
3. **Layer 2 - Co-Seller Remedy**: Atomic resolution — nobody is paid until the buyer resolves, so co-sellers hold a computable, bonded interest in curing any one seller's fault (micro-lending circle effect). This coordinates the already-scaled mesh; it does not scale it
4. **Layer 3 - Arbitration**: a forum of the parties' choosing (e.g. Kleros) rules on the open record; it cannot resolve in the buyer's place
5. **Layer 4 - Courts**: traditional legal systems consume the same record from outside the protocol, on the same terms

**Key Innovations**:
1. **Asymmetric bonding**: bonding against the cumulative value at the link keeps the deterrent intact at depth, where what a defector could carry off is worth far more than the payment made for it
2. **No escape hatches**: the two calls are the whole state-changing surface — the results are derived for that game, and any further exit path either seats a decision with a party the bonds do not constrain or replaces the comparison the analysis turned on
3. **Buyer as sole resolver**: accountability through the buyer's own locked position — credited with the delivery it holds, an extracting buyer still stands at −P against the 0 that closing gives it — plus the permanent public record
4. **Atomic resolution**: all-or-nothing settlement induces a weakest-link subgame among sellers, and nothing ever banks a failed profile, so coordination failure is never terminal
5. **Pure game theory**: security from comparisons each party can make itself, not from validators

**Result**: A simpler, more secure coordination protocol with redundant enforcement layers. The deterrent's price is posted openly — 2× on both sides — versus the recurring extraction of intermediated coordination.

---

## Appendix: Implementation Checklist

### Core Contract (`FigaroCore.sol`)

- [x] `Commitment` struct (`CommitmentTypes.sol`): 9 fields — `{processId, buyer, seller, currency, payment, expectedCumulativeValue, agreementHash, salt, deadline}`, dual-signed via EIP-712. No on-chain `Order` struct.
- [x] Process state: `ProcessState{rootBuyer, currency, cumulativeValue, activeOrderCount}`; order status is a `uint8` nullifier `0 → 1 → 2` (unknown → committed → resolved) — no lifecycle enum
- [x] Asymmetric collateral, charged in `commit`: buyer `2×payment`, seller `2×expectedCumulativeValue`
- [x] No fee: no `feeRate`, no `feeSnapshot`, no treasury — resolution pays `sellerPayout = 2×expectedCumulativeValue + payment`, `buyerPayout = payment`
- [x] No cancellation path: a committed order can only be resolved
- [x] Entry points: `commit()` and `resolveProcess()` — the only two external functions
- [x] Buyer-only resolution: `resolveProcess()` reverts with `NotProcessBuyer` unless the caller is the process's `rootBuyer` (a custom-error guard, not a `require` string)
- [x] No timeouts: no escape from a committed order
- [x] No validators: economic incentives replace validation
- [x] Perfect accounting: every bonded token transferred back to the two parties; contract balance returns to 0

### Test Coverage

- [x] Nash equilibrium: Mutual cooperation payoffs correct
- [x] Collateral sufficiency: Bonds = 2× values
- [x] Multi-party chain: cumulative bonding verified
- [x] Token accounting: Zero contract balance after resolution
- [x] Access control: Only buyer can resolve
- [x] No escape hatches: No reclaim, no timeout, no challenges

### Security Properties

- [x] No reentrancy: ReentrancyGuard on all state changes
- [x] No overflow: Solidity 0.8.26 checked arithmetic
- [x] Token-agnostic: Any non-rebasing, non-fee-on-transfer ERC-20 per process
- [x] No admin backdoor: No pause, no upgrade, no owner escape hatch

---

**Version**: 1.3  
**Last Updated**: May 2026

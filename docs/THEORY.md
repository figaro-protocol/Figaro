# Theory — the equilibrium, bound to the kernel

This is the derivation the formal layers check: the payoff table below is the
kernel's own transfers, and the Lean proof, the TLA+ models, and the Certora
rules named in `VERIFICATION_MAP.md` reason over exactly these amounts. The
asymmetric-bonding paper on the site carries the same result in the
literature's terms; this file carries it in the code's. `VISION.md` says why
the mechanism matters; `CONTRACTS.md` describes the contract surface.

## The two mechanisms

The kernel exposes two operations, `commit` and `resolveProcess`, and each
carries a mechanism design of its own.

**Asymmetric bonding.** When an order is committed, each party deposits a bond
into the kernel: the buyer twice the payment `P`, the seller twice the
cumulative value `G` through its order — every payment the process has
accumulated so far, this order's own included. The doubling answers retention:
value passes off-chain, so a party that walks away keeps what is in its hands,
and a bond equal to that value would be exactly cancelled by the taking. The
same schedule, applied at every order, carries the bilateral result to a
process of any length.

**Buyer dominance with atomic resolution.** Only the buyer can resolve, and
resolution is atomic across every order in the process: all are resolved at
once or none is. Nobody is paid until the buyer resolves, so every seller
holds a live interest in every other seller's performance. This coordinates
the process the schedule has already secured; it does not secure it.

The two compose and neither substitutes for the other. Bonding alone secures
each order and gives the sellers no reason to coordinate; buyer dominance alone
is a resolver with nothing at stake. Together, one signature resolves the
whole process and the pressure to perform runs through every order in it.

There is no third operation. Commit and resolve are the whole state-changing
surface; the results below are derived for that game, and any further path
out of a committed order either seats a decision with a party the bonds do not
constrain or replaces the comparison the analysis turns on.

## Nash Equilibrium Analysis

### The boundary comes first

The kernel holds bonds, the accumulator, and the data of what was committed.
It does not hold the goods. Value, performance, and the parties' knowledge of
both pass off-chain, and no kernel operation can observe or undo them. Every
payoff below therefore has two parts: **what the kernel moves** (the bond
deposited at `commit`, the payout made at `resolveProcess`) and **what the party
retains off-chain**, credited at the value the parties themselves signed — `P`
for the exchange at an order, at most `G` for everything accumulated through
it. The second part is always a *credit* and never a debit: a party is counted
for what is in its hands and never charged for what is not. An analysis that
omits the retention term is an analysis of a different mechanism, and it is
the omission that has historically made the doubling look arbitrary.

**Game setup**:
- Players: buyer (B) and seller (S), from the state in which both bonds are
  deposited
- Moves: the seller performs or holds out; the buyer resolves or withholds.
  Resolving *is* the buyer's acceptance — the kernel holds no test of
  performance of its own and admits no report of delivery
- Resolution is the only terminal move. Withholding is not terminal, and no
  clock runs from the bonded state, so every comparison below is between
  *doing* and *never doing*

**Outcomes** `(u_b, u_s)` — the position in the kernel plus the assented value
of what each party holds:

|                        | resolution occurs | no resolution |
|------------------------|-------------------|---------------|
| **performance occurs** | `(0, +P)`         | `(−P, −2G)`   |
| **no performance**     | `(−P, ≤ P + G)`   | `(−2P, ≤ −G)` |

This is a table of *outcomes*, not a strategic form, and no plan is excluded
by it: the rows say whether the seller ever performs, the columns whether the
buyer ever resolves, and every plan either party may adopt ends in one of the
four. The seller's entries are bounds because what it can retain is at most
the accumulated value through its order and is often less — a courier holds
the cargo but cannot retain a delivery it never made. The right-hand column
holds no resolutions: those are open positions the kernel has no operation to
convert into anything.

### The equilibrium, in two composing steps

- **(a) Resolve.** At any buyer node *after performance*, the buyer strictly
  prefers to resolve. It holds the delivery either way, so the branches differ
  only in the kernel's transfers: resolving refunds the bond less the payment,
  `−2P + P + P = 0`; never resolving leaves the bond deposited, `−2P + P = −P`.
  The withheld payment is not kept by the buyer — it sits inside the buyer's
  own bond, out of reach of both parties — which is why withholding buys the
  buyer nothing at all. **This comparison needs no assumption whatever about
  the seller**: the seller's conduct is already fixed at that node.
- **(b) Perform.** Given (a), at any seller node performance is the seller's
  strict best response: `+P` for performing and being resolved, against at
  best `−2G + G = −G` for holding out — twice the value through its order
  deposited, the value itself credited back to it. The margin is `P + G > 0`,
  and it widens with every payment accumulated ahead of the seller.
- **(c) Withhold before performance.** Given (b), at a buyer node where
  performance has not occurred the buyer strictly prefers to keep the process
  open — its continuation is `0` — over resolving at once, which is terminal at
  `−P`: paying for a product it does not have and foreclosing the only
  continuation on which the product could still arrive.

The profile — the seller performs; the buyer resolves once performance has
occurred and not before — therefore has each party choosing a strictly better
continuation at every one of its nodes, and its outcome `(0, +P)` is the
buyer's unique maximum over all four outcomes. Every deviation that changes
the outcome is strictly worse for the party making it.

### What the result is not

It is **not a dominance result** and must not be restated as one. *Resolve
regardless* is a plan the kernel admits, and against a seller that will never
perform it is better for the buyer than holding the position open; what is
unconditional is the narrower claim (a) — *after performance*, resolving beats
never resolving, whatever the seller is like. The seller's side is
conditional throughout: no bond schedule can make handing goods to a party
that will not pay attractive. What carries the equilibrium is therefore not
that each party separately finds cooperation dominant, but that **the two
calls compose in a definite order** — resolve's design gives the buyer an
unconditional reason to close after performance, and only because that is
fixed is performance strictly best for the seller. A buyer that resolves
without regard to performance has not been failed by the mechanism; it has
declined to use it, and what it loses is bounded by exactly what it agreed to
pay.

### Deterrence with content

The deterrent holding all of this in place is mutual assured destruction, and
the doubled schedule is what gives it content. The content is *not* that the
two parties lose equal amounts — they do not, and an accounting that says so
is counting only what the kernel holds. It is that defection leaves
**whichever party holds the value** out of pocket, at every order, *after*
crediting that party with what it keeps. A seller that walks off with the
product is credited the product, worth at most `G`, and still stands at best
at `−G` against the `+P` it declined. A buyer that keeps the delivery and
never resolves is credited the delivery, worth `P`, and still stands at `−P`
against the `0` it declined. Neither can reach the frozen payment; neither is
repaid by what it took.

### Why the standoff ends in performance

Nothing in the kernel ever executes the destruction: no operation consumes a
bond, and an unresolved position is simply held — a standing position, not a
loss taken. That is why the threat resolves into performance rather than into
loss, and the asymmetry of the schedule is what decides which way. While the
standoff runs the buyer has `2P` deposited and the seller `2G` with `G ≥ P`,
so the seller stands in at least as much and strictly more at every position
past the root; and of the two, only the seller holds the move that ends the
standoff on terms it prefers — perform, after which the buyer's own comparison
(a) closes the process, trading a position of at best `−G` for `+P`.

Where the seller *cannot* perform, the move that ends its exposure is the
**remedy, agreed before resolution**. Concretely: the failing seller sends the
buyer the payment it stands to receive and makes good whatever of the buyer's
its failure left in its hands. The buyer, whole, resolves. At resolution the
seller is refunded its bond and paid the payment, having already paid that
payment away — it ends at zero, its failure earning it exactly nothing, and
zero is better than `−G` by the whole value through its order. Where the
remedy is refused, an outside forum may rule on the open process (below) —
still before any resolution, and with no power to resolve in the buyer's
place. Where a party neither performs nor remedies nor answers a ruling, the
position simply stands: both bonds deposited, the seller at best at `−G`, the
data marking an undertaking never closed. That is the irrational residue
every system carries — the deterrent working, not a case the buyer solves by
paying the party that failed.

### Robustness to weaker rationality

Each comparison above (`+P` against at best `−G` for the seller; `0` against
`−P` for the buyer) is preserved under any strictly monotone utility
transformation, so the results hold for any preference order that prefers
more to less — including arbitrary risk-averse and loss-averse
specifications. The seller's gap `P + G` is bounded away from zero, so a
trembling-hand perturbation does not overturn the cooperative profile, and in
a process the gap widens with every payment accumulated ahead of the seller.
What remains outside the analysis is behaviour under non-pecuniary preferences
(spite, fairness norms, an intrinsic taste for defection) and any valuation of
the captured product other than the one both parties signed.

### The proof form is itself a design property

The form of the argument above was chosen, not merely found, and the choice is
part of the design. A statement of this equilibrium could lean on iterated
elimination of weakly dominated strategies: cooperation is never worse and
sometimes better, so eliminate defection for both players and one profile
survives. That form is mathematically respectable and behaviourally
implausible — the level-k literature finds most participants reasoning at one
or two steps, so a guarantee that needs the full iteration is a guarantee real
participants cannot check. The form used here asks for something far smaller:
at each node one party compares two certain amounts, and the two comparisons
compose in a stated order. A buyer who can see that `0` beats `−P`, and a
seller who can see that `+P` beats `−G`, have between them verified the whole
result. A protocol whose central claim is that anyone can check what a
platform merely asks them to believe should not rest that claim on a proof
only a game theorist can follow — the equilibrium's legibility is the same
property the rest of the design is built for.

## Cumulative Bonding

In a process of several orders, each seller's bond is keyed to the value the
process has accumulated through its own order — **its own payment included**:

```
Order 1: seller bonds 2×P₁
Order 2: seller bonds 2×(P₁ + P₂)
Order 3: seller bonds 2×(P₁ + P₂ + P₃)
...
Order n: seller bonds 2×∑Pᵢ
```

`Gᵢ = ∑_{j≤i} Pⱼ` is **inclusive**: a seller bonds against everything the
process has accumulated through its order, its own contribution counted,
because that total is the ceiling on what any defection at that order could
carry off. And the figure is not a report. `commit` admits exactly one value —
the payment itself at the root, the live accumulator plus the new payment for
any extension — and refuses every other declaration
(`CumulativeValueMismatch`), so the seller's bond base is fixed by arithmetic
against the signed accumulator before anything is deposited. A seller has no
interest in declaring more in any case: the declaration is precisely what it
must deposit.

**Coordination pressure**: cumulative exposure `2Gᵢ` is non-decreasing along
the process, and the gap a seller weighs against holding out — `Δᵢ = Pᵢ + Gᵢ
≥ 2Pᵢ` — grows with every payment accumulated ahead of it. The ratio `2Gᵢ/Pᵢ`
rises with what came before while falling in the seller's own payment: for
equal payments it is `2i`, linear in depth, whereas a late order with a large
payment can face a lower ratio than its predecessor. What holds at every
position without qualification is the exposure and the gap; the ratio need
not rise.

**One example, used throughout.** A shipper buys the movement of a container:
a haulier carries it for 10, a broker clears it for 2, a warehouse receives it
for 3, all in the process's denomination.

| Order | Seller | `Gᵢ` | `Pᵢ` | Seller bond `2Gᵢ` | Buyer bond `2Pᵢ` |
|---|---|---|---|---|---|
| 1 | haulier | 10 | 10 | 20 | 20 |
| 2 | broker | 12 | 2 | 24 | 4 |
| 3 | warehouse | 15 | 3 | 30 | 6 |

If the broker holds out with the cargo in hand: its 24 stays deposited against
at most 12 it can retain — a standing position of −12 against the +2 it
declined. The haulier's 20 stays deposited too: it performed, but nothing is
resolved until the shipper resolves. The haulier's exposure to the broker's
holding out is `P + 2G = 10 + 20 = 30`, readable from the chain — which is why
the haulier has a bonded interest in the broker curing.

### What the Doubling Does

The doubled schedule is constitutive, in the same way that buyer dominance and
atomic resolution are: it is an invariant of the mechanism, not a parameter it
exposes. There is one schedule, applied to every order at every position —
twice the payment from the buyer, twice the cumulative value through its own
order from the seller. The kernel carries no other, exposes no setting, and
admits no order bonded on different terms. What follows is therefore an
account of what the schedule *achieves*, not a derivation of it from something
prior, there being nothing prior to derive it from.

What it achieves is answering **retention**. A defector does not walk away
empty: it walks away holding the value through its order, off-chain, where
the kernel can neither see it nor recover it. A bond equal to that value would
be exactly offset by what the defector keeps, leaving the taking free. The
second half of each bond *is* the retained value, and it is what makes the
taking cost — differently on the two sides, which is why they are stated
apart:

- **Seller side.** Holding out leaves the seller credited at most `G` against
  a deposited `2G`: at best `−G`, against the `+P` it declined. Retention can
  halve the seller's exposure; it can never cancel it. That surviving exposure
  is what gives the buyer's withholding its force and makes the co-seller
  interest below a real one.
- **Buyer side.** Withholding after delivery leaves the buyer credited `P`
  against a deposited `2P`: `−P`, against the `0` that closing would give it.
  Here the second half supplies the *whole* of the comparison — a bond equal
  to the payment would be cancelled outright by the goods the buyer holds,
  leaving it indifferent between resolving and not.

On the buyer's side the doubling **creates** the comparison; on the seller's
side it **preserves** an exposure that would otherwise vanish. Both are aimed
at value the kernel can neither see nor reach, which is the only reason a
contract that holds nothing but tokens can discipline the passage of goods at
all.

Splitting an order into smaller ones changes nothing: the schedule is keyed to
the accumulator, not to the order's own payment, so the later part is bonded
against the same accumulated total and the exposure through that position is
unchanged.

## What resolution moves

At resolution every order pays out directly:

```solidity
sellerPayout = c.expectedCumulativeValue * 2 + c.payment;  // bond refunded + payment
buyerPayout  = c.payment;                                  // bond refunded, less the payment
```

Net token effects per order (`G` = cumulative value, `P` = payment):
- Seller: `−2G + (2G + P) = +P` — paid the payment, refunded the bond
- Buyer: `−2P + P = −P` — pays the payment, refunded the rest of the bond
- Kernel: every bonded token is transferred straight back out; balance = 0

These are the *token* movements, which is all the kernel knows. The buyer's
full resolved position adds the delivery it now holds, worth `P` at the value
the parties signed: `−2P + P + P = 0`. That zero is the mark of an exchange
completed, not of an exchange without benefit, and it is the figure the
equilibrium analysis uses.

**Conservation**:

```
sellerPayout + buyerPayout = (2G + P) + P = 2G + 2P = sellerBond + buyerBond
```

Every token that entered as a bond leaves to one of the two parties — nothing
is retained, and there is no third recipient. The kernel never holds a
withdrawable balance.

## At N parties: scaling is the schedule's own work

Scaling to N parties is asymmetric bonding's work — each seller bonding the
cumulative value through its own order — and buyer dominance then coordinates
the process the schedule has already secured. The credit for reaching N
parties belongs to the bond schedule, not to the resolution rule. Atomic
resolution's contribution is a different one, taken up below — it closes the
process from one signature and induces a weakest-link game among sellers,
neither of which is a scaling result.

**Why a per-order bond fails at depth.** Bond each seller on its own payment
alone and the broker in the example deposits 4 while holding cargo worth 12;
credit the retention and holding out pays `−4 + 12 = +8`. The deterrent
survives at the root and evaporates at depth. Keyed to the accumulator, the
broker deposits 24 against the same 12, and holding out stands at −12.

### The comparison at position i

```
Seller bonds:  Bᵢ = 2×Gᵢ
Seller earns:  Eᵢ = Pᵢ

Performing, then resolution:   +Pᵢ             payment earned, bond refunded
Holding out, no resolution:    −2×Gᵢ + rᵢ      rᵢ ≤ Gᵢ is what it can
                                               actually retain off-chain
                             ≤ −Gᵢ             at maximal retention

Given that the buyer resolves after performance — unconditional, assuming
nothing about the seller — performing is the seller's strict best response at
every position. The gap is

  Δᵢ = Pᵢ + Gᵢ ≥ 2×Pᵢ

equal to 2×Pᵢ only at the root, wider with every payment accumulated ahead of
the seller, and wider again wherever the seller cannot retain the whole
accumulated value.
```

**Not dominance-solvable on the seller side.** The conclusion is conditional
and must stay so. Where some *other* seller has held out and the process is
not going to close, `Sᵢ`'s own holding out is strictly better for it than
performing: performing costs it bond and product together, `−2Gᵢ`, against
`−2Gᵢ + rᵢ` for keeping what it holds. No bond schedule can make handing goods
to a party that will not pay attractive. What recommends the cooperative
profile to each seller is that it is strictly better **provided the others
perform** — the weakest-link structure below — and what makes that proviso
credible is that a failed profile is never banked: no clock runs from the
bonded state, so the process does not fail, it stays open until it closes, and
every party in it, the holdout included, strictly prefers the closing to the
position it holds.

This is not a second game but the same equilibrium at every position, produced
by the same schedule. Nothing new is assumed, no second mechanism is invoked,
and the bilateral result is not patched — the bond base keys to the
accumulator instead of to the local payment, and every comparison above
carries through. Treating a process as "several two-party games" misses what
holds it: each position stands in a different amount, and that asymmetry, not
any coordination rule, preserves the deterrent at depth.

## The co-seller game

Atomic resolution induces a one-shot weakest-link game among the sellers of a
process. Nobody is paid until the buyer resolves, so when one seller's work is
faulty every co-seller's cheapest move is to help put it right, because that
is the only path back to resolution. The exposure a co-seller that has already
performed carries on the fault is `Pᵢ + 2Gᵢ`; one that has not yet performed
still holds what is in its hands, so its exposure has the floor `Pᵢ + Gᵢ` and
no exact figure. Both are computed from the accumulator alone. The failing
seller's own best move is to perform, or where it cannot, to make the buyer
whole and end at zero — either beats standing at `−G` indefinitely with every
co-seller's position open beside its own.

The parallel is the joint-liability lending literature, and the claim is
scoped. Figaro reproduces the *coordination-pressure component* of that
equilibrium — the interest each participant holds in the others' performance
— requiring none of four assumptions that literature carries:

1. **repeated interaction** — the equilibrium is established within a single
   process, with no continuation value across processes and no trigger
   strategies;
2. **local information among sellers** — the exposure is computed from the
   accumulator alone. Narrowly: what is reduced is the *existence* of the
   pressure and the knowledge of its magnitude, not every use the parties may
   put it to. Acting on a *particular* failure still needs local information —
   which seller did not perform is knowledge the parties hold and the
   accumulator does not, performance being off the chain entirely;
3. **a punishment technology exogenous to the contract** — what a co-seller
   stands to lose is its own deposited position, held through non-resolution,
   not imposed by anyone;
4. **joint-liability contracting** — each bond is deposited individually
   against that seller's own snapshot, never against a group's aggregate
   obligation; the coupling comes from atomic resolution, not from the bond
   structure.

The peer-selection and peer-monitoring results of that literature are **not**
reproduced: they need structure above the kernel, and nothing here supplies
it.

Periphery, not mechanism: resolution history is public and permanent, so any
future counterparty can read how a process resolved — but the protocol keeps
no score, no reviews, and no blacklist, and the pressure above needs none of
them. Any feature that resolves orders one at a time would remove this game;
that is why partial resolution is excluded.

## Forums, and terminal acceptance

An arbitration forum — composed into the terms, or chosen by the parties
afterward — and the courts rule on the data a process leaves. Both rule
**while the process stands open, before the buyer resolves, and neither can
resolve in the buyer's place**: there is no direct enforcement, and that is
precisely why composing a forum leaves the equilibrium untouched — nothing on
the path by which bonds are refunded is handed to a party the bonds do not
constrain. What a ruling changes is the parties' remedy negotiation; the
parties act on it — a cure, a remedy transfer, or a compensating reverse
commitment — and the buyer resolves once satisfied. The data supplies what was
undertaken and what remains unresolved; it never shows performance, which
happened where the kernel cannot look, so the parties supply that themselves.

Resolution is terminal acceptance, and this is the corollary on the other
side of the same boundary. Once the buyer resolves, the transfers are made and
the kernel holds nothing further for anyone to recover — no forum, and no
later ruling, can reach a balance that is not there. A buyer with a live
complaint therefore resolves after the complaint is answered, not before: the
whole of the recourse window is the interval in which the process stands
open, which is also the interval in which both parties want their positions
refunded.

## Liveness

**Theorem**: a process closes whenever the buyer is satisfied, and no other
party's conduct can withhold closure from a satisfied buyer.

**Proof**:
```
After performance, the buyer's own comparison is 0 (resolve) against −P
(withhold), and it holds whatever the seller is like. So a satisfied buyer
resolves because resolving is its better move, not because anything compels
it.

Before performance, the buyer withholds — resolving is terminal at −P, and it
forecloses the continuation on which the goods could still arrive.
Withholding never worsens with time: no clock runs from the bonded state, and
an unresolved position is a position held, not a loss taken.

Therefore: the standoff ends in performance or in a remedy agreed before
resolution — the failing seller sends the buyer the payment it stands to
receive and makes good what it holds, netting bond-only at resolution.
```

**The one interference, and its bound**: `resolveProcess` requires the
complete active-order list, so an order committed between the moment the buyer
builds its calldata and the moment the transaction lands makes the call
revert (`IncompleteOrderList`) and the buyer rebuilds and resends. This is a
retry, not a denial, and it is bounded by the buyer itself: every order in a
process carries the buyer's own signature and expires at its deadline, so the
only party that can force the retry is one the buyer has already signed for,
and only for as long as that signature remains valid.

**The residue**: a party that neither performs, nor remedies, nor answers a
forum's ruling. Its position simply stands — bonds deposited, the seller at
best at `−G`, the data marking an undertaking never closed. That is the
irrational residue every system carries; the deterrent prices a grudge, it
does not prevent an irrational party from paying that price. A buyer that
withholds after delivery to keep the sellers' bonds deposited keeps its own
`2P` deposited for as long as it does, stands at `−P` against the `0` that
closing would give it, and leaves an undertaking never closed on the public
chain for every future counterparty to read.

## Exit paths, permanently excluded

What happens when neither party is at fault but the process cannot complete —
a vehicle in an accident, a warehouse destroyed? The kernel carries no exit
path. It has exactly two external functions, and resolution pays one fixed
amount per order (seller: full bond refunded plus payment; buyer: payment's
worth of bond refunded). A `mutualExit(processId, splitRatio, …)` entry point
is permanently excluded, and so is any operation that refunds part of a bond
on any terms but resolution.

Nothing is lost, because the unwind is already fully expressible with the
existing primitives:

1. **The buyer resolves when it is satisfied.** `resolveProcess` has no
   precondition beyond buyer identity and the full active-order list. Bonds
   stay deposited only while the buyer is not yet satisfied — a standing
   position, held by parties who each want it refunded, which is the deterrent
   working as designed and not a missing feature.
2. **The unwind is agreed between the parties, before resolution.** The
   concrete transfer is the remedy of the equilibrium analysis: the seller that
   cannot deliver sends the buyer the payment it stands to receive and makes
   good whatever of the buyer's it holds; at resolution it is refunded its
   bond and paid the payment it has already paid away, ending at zero, and the
   buyer ends at zero as well. Where the parties want a different split, the
   compensating transfer is itself a commitment: the original seller, acting
   as buyer of a new process, commits the agreed amount to the original buyer
   — bonded like any other order, under the same schedule. Both processes
   resolve; the net effect is exactly what the parties agreed. The mutual
   consent is enforced by the same two signatures as the original commitment:
   the unwind is the primitive itself, not a hatch.
3. **Outside forums** adjudicating frustration or impossibility rule on the
   process while it stands open and feed the parties' negotiation; none of
   them can call `resolveProcess`, so none of them ever sits on the path by
   which bonds are refunded.

A kernel-level exit with a split ratio would be a third entry point, and it
would break the analysis rather than extend it: every comparison in the
equilibrium weighs exactly two continuations at a node, and an exit path adds
a third — either seating the decision with a party the bonds do not constrain,
or replacing the comparison that made the cooperative move a best response.
The composed path has no such effect: knowing it exists changes nothing,
because it carries the same bond schedule as the process it unwinds.

## A bond is a position, not a cost

Nothing in the kernel consumes a bond. At resolution every deposited token is
transferred straight back out to the two parties, and the kernel's balance
returns to zero. A bond is therefore a position held for the life of one
process, refunded at its resolution — which means what a wallet needs is set
by how many processes it holds open **at once**, not by how many it resolves.
Within a single process there is no recycling: resolution is atomic and
terminal for the whole process, a resolved process cannot be extended, and a
buyer running an N-order process stands in `2×∑Pᵢ` for the whole of that
process's life. Across processes, serially, the same balance that secured one
secures the next. A wallet stays productive for as long as it holds a balance
it can bond.

## Topology is not in the kernel

The kernel sees a flat process: a `processId`, a monotonic `cumulativeValue`,
and an `activeOrderCount`. Every order's `expectedCumulativeValue` is checked
for exact equality against the live accumulator plus its own `payment`; a
mismatch reverts (`CumulativeValueMismatch`). The kernel stores no parent or
child; there is no on-chain graph of orders. The topology of a process — who
comes before whom, fan-out, fan-in — lives in the signed agreement (the
`figaro-topology` clause) and is read from there by indexers and interfaces.
Structures larger than one process compose by nesting: an order in process A
is also the root commitment of process B, each process linear and within the
network's gas ceiling.

This is safe because honesty is enforced before the fact: a wrong cumulative
value never commits, so there is no "claim a false value, lose your bond
later" path. The topology is descriptive; the enforcement rides entirely on
the on-chain accumulator and the bonds it sizes.

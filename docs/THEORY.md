# Theory — the equilibrium, bound to the kernel

The theorem and its proof are the asymmetric-bonding paper's
(`frontend/app/(marketing)/papers/asymmetric-bonding/page.tsx`, served at
`/papers/asymmetric-bonding`); it is stated once, there. This file carries what
binds that theorem to the code: which transfers the kernel makes, which figures
the comparisons are made over, and which of the kernel's rules each step of the
argument rests on. The figures themselves live once, in
`sdk/src/equilibrium.json`; the Lean proof, the TLA+ models, and the Certora
rules named in `VERIFICATION_MAP.md` reason over exactly those amounts, and
`scripts/lint-equilibrium-owner.sh` fails a commit on which any of these
surfaces disagrees with the module. `VISION.md` says why the mechanism matters;
`CONTRACTS.md` describes the contract surface.

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

### The theorem, and what the kernel supplies to it

The paper's Theorem 1 has three comparisons and one structure. **(a)** After
performance the buyer strictly prefers resolving, `0`, to never resolving,
`−P`, and needs no assumption about the seller: the two branches differ only
in the kernel's transfers, and the withheld payment sits inside the buyer's
own bond, out of reach of both parties. **(b)** Given (a) and the buyer's
plan — resolve once performance has occurred and not before — the seller
strictly prefers performing, `+P`, to never performing, at most `−G`; the
margin is the gap `Δ = P + G ≥ 2P`. **(c)** Given (b), before performance the
buyer keeps the process open rather than resolving at once, which is terminal
at `−P`. (b) and (c) are the two parties' best-response checks against one
profile, verified jointly — a fixed point, which is what an equilibrium is; (a)
is the one unconditional anchor. On a process that will not close, a seller's
holding out beats performing strictly only when it retains something (`r > 0`)
and equals it at `r = 0`. The paper proves each part, states what the result is
not (not a dominance result; conditional on the seller's side throughout),
and treats the second equilibrium, robustness, and the co-seller game.

What the kernel supplies to each step is the binding this file owns:

- **(a)** rests on `resolveProcess` refunding the buyer's bond less exactly the
  payment (`buyerPayout = c.payment` below) and on there being no operation that
  consumes a bond — an unresolved position is held, never taken.
- **(b)** rests on the seller's bond being pulled at `2G`, exactly
  (`_pullExact`), against a retention the kernel can neither see nor recover,
  and on resolution paying the seller `2G + P` and nothing else.
- **(c)** rests on resolution being terminal and atomic: a resolved process
  cannot be extended (`ProcessAlreadyResolved`), and no partial resolution
  exists.
- The **standoff** rests on the absence of a clock: no timeout, no
  cancellation, no third call, so a failed profile is never banked and every
  comparison is between doing and never doing.
- The **remedy before resolution** rests on the same two primitives: a failing
  seller sends the buyer the payment it stands to receive and makes good what
  it holds; at resolution it is refunded its bond and paid the payment it has
  already paid away, ending at zero — better than `−G` by the whole value
  through its order. A compensating transfer on other terms is itself a
  commitment, bonded under the same schedule.

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

### What the doubling does

The doubled schedule is an invariant of the mechanism, not a parameter it
exposes: one schedule, applied to every order at every position, no setting,
no order bonded on other terms. The paper derives what it achieves — the
second half of each bond is the retained value, which makes the taking cost on
both sides — and the two sides are stated apart there (§ "The second half of
the bond"). What the kernel supplies is the exactness: `commit` admits one
cumulative value per commitment and refuses every other declaration
(`CumulativeValueMismatch`), so the bond base is fixed by arithmetic before
anything is deposited. Splitting an order into smaller ones changes nothing:
the schedule keys to the accumulator, so the later part is bonded against the
same accumulated total.

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

## At N parties

Scaling to N parties is asymmetric bonding's work — each seller bonding the
cumulative value through its own order — and buyer dominance coordinates the
process the schedule has already secured; the credit for reaching N belongs to
the schedule, not to the resolution rule. The paper's Lemma 1 and Theorem 3
carry the bilateral comparisons to every position, with the same conditioning
as Theorem 1, and its Proposition 1 shows why a per-order bond fails at depth
(the broker in the example above would deposit 4 against cargo worth 12).
What the kernel supplies is the accumulator itself: exact, monotone, inclusive,
and checked at every commit, so the bond base at position `i` is `G_i` by
arithmetic and never by report. The Lean file instantiates the two-party
inequalities at every position of a chain over that accumulator.

## The co-seller game

Atomic resolution induces a one-shot weakest-link game among a process's
sellers: nobody is paid until the buyer resolves, so when one seller's work is
faulty every co-seller's cheapest move is to help put it right. The exposure a
co-seller that has performed carries on the fault is `Pᵢ + 2Gᵢ`, readable from
the accumulator alone; one that has not yet performed has the floor `Pᵢ + Gᵢ`.
The paper's Theorem 4 and Proposition 3 state the game and scope the parallel
to joint-liability lending — the coordination-pressure component reproduced,
peer selection and monitoring not. What the kernel supplies: resolution is
atomic (`IncompleteOrderList`), so no order is paid alone — which is why
partial resolution is excluded — and resolution history is public and
permanent while the protocol keeps no score, no reviews, and no blacklist.

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

A process closes whenever the buyer is satisfied, and no other party's conduct
can withhold closure from a satisfied buyer: after performance the buyer's own
comparison closes it (Theorem 1(a)); before performance withholding never
worsens with time, because no clock runs from the bonded state. The one
interference is bounded by the buyer itself: `resolveProcess` requires the
complete active-order list, so an order committed between the buyer building
its calldata and the transaction landing reverts the call
(`IncompleteOrderList`) and the buyer rebuilds and resends — a retry, not a
denial, and only a party the buyer has already signed for can force it, only
while that signature is valid. The residue — a party that neither performs,
nor remedies, nor answers a ruling — simply stands: bonds deposited, the seller
at best at `−G`, the data marking an undertaking never closed.

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

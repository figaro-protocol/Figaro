# Theory — the equilibrium, bound to the Core

The theorem and its proof are the asymmetric-bonding paper's
(`frontend/app/(marketing)/papers/asymmetric-bonding/page.tsx`, served at
`/papers/asymmetric-bonding`, "Two Composing Mechanisms for N-Party Coordination
Among Strangers"); it is stated once, there, with the second equilibrium,
robustness, the N-party extension (Lemma 1, Theorem 3), the co-seller game
(Theorem 4, Proposition 3), why a per-order bond fails at depth (Proposition 1),
and what the doubling achieves (§ "The second half of the bond"). Remedies
before resolution and the forums are the external-events paper's
(`/papers/external-events`). This file carries only what binds that theorem to
the code: which transfers `FigaroCore` makes, which figures the comparisons are
made over, and which of `FigaroCore`'s rules each step of the argument rests
on. The figures live once, in `sdk/src/equilibrium.json`; the Lean proof, the
TLA+ models and the Certora rules named in `VERIFICATION_MAP.md` reason over
exactly those amounts, and `scripts/lint-equilibrium-owner.sh` fails a commit
on which any of these surfaces disagrees with the module. `CONTRACTS.md`
describes the contract surface.

## The boundary

`FigaroCore` exposes two operations, `commit` and `resolveProcess`, and no
third. It holds bonds, the accumulator, and the data of what was committed. It
does not hold the goods: value, performance, and the parties' knowledge of both
pass off-chain, and no `FigaroCore` operation can observe or undo them. Every
payoff therefore has two parts: **what `FigaroCore` moves** (the bond locked at
`commit`, the payout made at `resolveProcess`) and **what the party retains
off-chain**, credited at the value the parties themselves signed — `P` for the
exchange at an order, at most `G` for everything accumulated through it. The
second part is a credit and never a debit: a party is counted for what is in
its hands and never charged for what is not.

Resolving *is* the buyer's acceptance — `FigaroCore` holds no test of
performance and admits no report of delivery. Resolution is the only terminal
move; withholding is not terminal, and no clock runs from the bonded state, so
every comparison is between *doing* and *never doing*.

## The outcome table

Outcomes `(u_b, u_s)`, the position in `FigaroCore` plus the assented value of
what each party holds, from the state in which both bonds are locked:

|                        | resolution occurs | no resolution |
|------------------------|-------------------|---------------|
| **performance occurs** | `(0, +P)`         | `(−P, −2G)`   |
| **no performance**     | `(−P, ≤ P + G)`   | `(−2P, ≤ −G)` |

A table of outcomes, not a strategic form: the rows say whether the seller
ever performs, the columns whether the buyer ever resolves, and every plan
either party may adopt ends in one of the four. The seller's entries are
bounds because what it can retain is at most the accumulated value through its
order and is often less. The right-hand column holds no resolutions: those are
open positions `FigaroCore` has no operation to convert into anything.

## What `FigaroCore` supplies to each step

The paper's Theorem 1 has three comparisons and one structure. **(a)** After
performance the buyer strictly prefers resolving, `0`, to never resolving,
`−P`, with no assumption about the seller. **(b)** Given (a) and the buyer's
plan — resolve once performance has occurred and not before — the seller
strictly prefers performing, `+P`, to never performing, at most `−G`; the gap
is `Δ = P + G ≥ 2P`. **(c)** Given (b), before performance the buyer keeps the
process open rather than resolving at once, which is terminal at `−P`. (b) and
(c) are best-response checks against one profile, verified jointly — a fixed
point, which is what an equilibrium is; (a) is the one unconditional anchor.
The result is not a dominance result and is conditional on the other side's
plan throughout.

What `FigaroCore` supplies to each step:

- **(a)** rests on `resolveProcess` refunding the buyer's bond less exactly the
  payment (`buyerPayout = c.payment` below) and on there being no operation that
  consumes a bond — an unresolved position is held, never taken.
- **(b)** rests on the seller's bond being pulled at `2G`, exactly
  (`_pullExact`), against a retention `FigaroCore` can neither see nor recover,
  and on resolution paying the seller `2G + P` and nothing else.
- **(c)** rests on resolution being terminal and atomic: a resolved process
  cannot be extended (`ProcessAlreadyResolved`), no partial resolution exists,
  and `resolveProcess` takes the complete active-order list or reverts
  (`IncompleteOrderList`). An order committed between the buyer building its
  calldata and the transaction landing makes the buyer rebuild and resend — a
  retry, forced only by a party the buyer has already signed for.
- The **standoff** rests on the absence of a clock: no timeout, no
  cancellation, no third call, so a failed profile is never banked. The residue
  — a party that neither performs, nor remedies, nor answers a ruling — stands:
  bonds locked, the seller at best at `−G`, the data marking an undertaking
  never closed.
- The **remedy before resolution** rests on the same two primitives: a failing
  seller sends the buyer the payment it stands to receive and makes good what it
  holds; at resolution it is refunded its bond and paid the payment it has
  already paid away, ending at zero — better than `−G` by the whole value
  through its order. A compensating transfer on other terms is itself a
  commitment, bonded under the same schedule. A forum rules while the process
  stands open and never calls `resolveProcess`.

## The accumulator

In a process of several orders each seller's bond is keyed to the value the
process has accumulated through its own order, **its own payment included**:
`Gᵢ = ∑_{j≤i} Pⱼ`, so the seller at order `i` bonds `2Gᵢ`. The figure is not a
report. `commit` admits exactly one value — the payment itself at the root, the
live accumulator plus the new payment for any extension — and refuses every
other declaration (`CumulativeValueMismatch`), so the bond base at position `i`
is `Gᵢ` by arithmetic before anything is locked, and a seller has no interest
in declaring more, since the declaration is what it must lock. Splitting an
order into smaller ones changes nothing: the later part is bonded against the
same accumulated total. The gap a seller weighs against holding out, `Δᵢ = Pᵢ +
Gᵢ ≥ 2Pᵢ`, grows with every payment accumulated ahead of it; the ratio
`2Gᵢ/Pᵢ` need not rise. The Lean file instantiates the two-party inequalities
at every position of a chain over this accumulator. Atomic resolution
(`IncompleteOrderList`) is what makes a co-seller's interest in another's cure
readable from the accumulator alone, `Pᵢ + 2Gᵢ` once it has performed; the
protocol keeps no score, no reviews and no blacklist.

## What resolution moves

At resolution every order pays out directly:

```solidity
sellerPayout = c.expectedCumulativeValue * 2 + c.payment;  // bond refunded + payment
buyerPayout  = c.payment;                                  // bond refunded, less the payment
```

Net token effects per order (`G` = cumulative value, `P` = payment):
- Seller: `−2G + (2G + P) = +P` — paid the payment, refunded the bond
- Buyer: `−2P + P = −P` — pays the payment, refunded the rest of the bond
- `FigaroCore`: every bonded token is transferred straight back out; balance = 0

The buyer's full resolved position adds the delivery it now holds, worth `P`
at the value the parties signed: `−2P + P + P = 0`, the mark of an exchange
completed. Conservation:

```
sellerPayout + buyerPayout = (2G + P) + P = 2G + 2P = sellerBond + buyerBond
```

Every token that entered as a bond leaves to one of the two parties; there is
no third recipient and `FigaroCore` never holds a withdrawable balance. Nothing
in `FigaroCore` consumes a bond: a bond is a position held for the life of one
process and refunded at its resolution, so what a wallet needs is set by how
many processes it holds open at once, not by how many it resolves. Within one
process there is no recycling — a buyer running an N-order process stands in
`2×∑Pᵢ` for the whole of that process's life — and across processes, serially,
the same balance bonds the next.

## No exit path

`FigaroCore` carries no exit path: resolution pays one fixed amount per order,
and any operation that refunds part of a bond on terms other than resolution
(a `mutualExit` with a split ratio, a timeout, a cancellation) is permanently
excluded. Every comparison in the equilibrium weighs exactly two continuations
at a node; a third entry point either seats the decision with a party the
bonds do not constrain or replaces the comparison that made the cooperative
move a best response. The unwind the parties want is already expressible with
the primitives: the remedy transfer above, or a compensating commitment under
the same schedule, agreed before the buyer resolves; both carry the same two
signatures as the original commitment, so knowing the path exists changes
nothing.

## Topology is not in the Core

`FigaroCore` sees a flat process: a `processId`, a monotonic `cumulativeValue`,
and an `activeOrderCount`. It stores no parent or child; there is no on-chain
graph of orders. The topology of a process — who comes before whom, fan-out,
fan-in — lives in the signed agreement (the `figaro-topology` clause) and is
read from there by indexers and interfaces. Structures larger than one process
compose by nesting: an order in process A is also the root commitment of
process B, each process linear and within the network's gas ceiling. This is
safe because a wrong cumulative value never commits: the topology is
descriptive, and the bonds are sized by the on-chain accumulator alone.

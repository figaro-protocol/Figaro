/-
FigaroEquilibrium — the kernel's Nash argument, machine-checked.

The analytic proof lives in `docs/THEORY.md` § "Nash Equilibrium Analysis"
and `/papers/asymmetric-bonding`; the TLA⁺ payoff-table invariants
(`formal/FigaroCore.tla` § "The equilibrium proof's payoff table") tie the
numbers below to the machine that ships: while an order is committed the
buyer has 2·payment locked and the seller 2·cumulativeValue, and resolution
moves exactly `payment` buyer → seller with both bonds returned whole. This
file closes the one step no model checker can express — a rational agent
CHOOSING — as best-response inequalities over that pinned table.

Payoffs are ℤ, relative to each party's pre-commit balance, exactly as
THEORY.md § "The comparison at position i" states them:

  seller, perform then resolution:      +Pᵢ        (payment earned, bond back)
  seller, hold out (no resolution):     −2Gᵢ + rᵢ  (bond lost; rᵢ ≤ Gᵢ is what
                                                    it can actually retain)
  buyer after performance, resolve:     −Pᵢ        (pays, bond back)
  buyer after performance, withhold:    −2Pᵢ       (bond stays locked)

Hypotheses carried by every order, from the mechanism itself:
  1 ≤ payment          — the `figaro-commerce` clause floor (payment ≥ 1);
  payment ≤ cumulative — the accumulator is INCLUSIVE of the order's own
                         payment (`Gᵢ = ∑_{j≤i} Pⱼ`, THEORY.md).

Dependency-free by design: core Lean 4 plus `omega`. `lake build` needs no
network beyond the pinned toolchain — an auditor reruns it cold.
-/

/-- One committed order at a position in a value-added chain: its local
payment `Pᵢ` and the inclusive cumulative value `Gᵢ` at its link, with the
two mechanism-level facts every real order carries. -/
structure Order where
  payment : Int
  cumulative : Int
  payment_floor : 1 ≤ payment
  cumulative_inclusive : payment ≤ cumulative

namespace Order

/-- Seller payoff for performing, given the buyer then resolves. -/
def performPayoff (o : Order) : Int := o.payment

/-- Seller payoff for holding out with retention `r`: the bond is forfeit
(never returned — no escape hatches) against whatever the seller can
actually retain off-chain. -/
def holdoutPayoff (o : Order) (r : Int) : Int := -(2 * o.cumulative) + r

/-- Buyer payoff, post-performance, for resolving: exactly the payment
moves, the bond returns whole. -/
def resolvePayoff (o : Order) : Int := -o.payment

/-- Buyer payoff, post-performance, for withholding resolution: the whole
2× bond stays locked. -/
def withholdPayoff (o : Order) : Int := -(2 * o.payment)

/-! ## Layer 1 — the bilateral inequalities -/

/-- **Buyer dominance, the resolution half**: after performance, resolving
is unconditionally strictly better for the buyer — it assumes nothing about
the seller (THEORY.md: "unconditional, assuming nothing"). -/
theorem buyer_resolves (o : Order) : o.resolvePayoff > o.withholdPayoff := by
  have := o.payment_floor
  simp only [resolvePayoff, withholdPayoff]
  omega

/-- **Performance is the seller's strict best response**, given the buyer
resolves after performance: earning the payment strictly beats forfeiting
the bond, at every feasible retention `r ≤ Gᵢ`. -/
theorem seller_performs (o : Order) (r : Int) (hr : r ≤ o.cumulative) :
    o.performPayoff > o.holdoutPayoff r := by
  have h1 := o.payment_floor
  have h2 := o.cumulative_inclusive
  simp only [performPayoff, holdoutPayoff]
  omega

/-- **The deterrent gap** `Δᵢ = Pᵢ + Gᵢ ≥ 2Pᵢ` (THEORY.md): the margin by
which performing beats holding out at MAXIMAL retention — equal to `2Pᵢ`
only at the root, wider with every payment accumulated ahead. -/
theorem deterrent_gap (o : Order) :
    o.performPayoff - o.holdoutPayoff o.cumulative = o.payment + o.cumulative ∧
    o.payment + o.cumulative ≥ 2 * o.payment := by
  have h2 := o.cumulative_inclusive
  simp only [performPayoff, holdoutPayoff]
  omega

/-- **Not dominance-solvable, honestly** (THEORY.md: "the conclusion is
conditional and must stay so"): where the process will NOT close — some
other seller held out — a seller's own holdout strictly beats performing
whenever it retains anything: performing costs bond and product together,
`−2Gᵢ`, against `−2Gᵢ + rᵢ`. Cooperation is a best response GIVEN the
others perform; no bond schedule makes handing goods to a non-paying
process attractive. -/
theorem holdout_when_dead (o : Order) (r : Int) (hpos : 0 < r) :
    o.holdoutPayoff r > -(2 * o.cumulative) := by
  simp only [holdoutPayoff]
  omega

end Order

/-! ## Layer 2 — the N-party chain

A process is a LINEAR chain of orders under one buyer (the kernel sees
nothing else); the cumulative value at position `i` is the inclusive prefix
sum of payments. Cooperation — every seller performs, the buyer resolves —
is a Nash equilibrium: no unilateral deviation profits, at any position.
-/

/-- A value-added chain: the payments at each position, every one at the
mechanism floor. -/
structure Chain where
  payments : List Int
  floor : ∀ p ∈ payments, 1 ≤ p

namespace Chain

/-- The inclusive accumulator at position `i`: `Gᵢ = ∑_{j≤i} Pⱼ` — what
`commit` checks and the seller bonds against (2·Gᵢ). -/
def cumulative (c : Chain) (i : Nat) : Int :=
  (c.payments.take (i + 1)).sum

/-- Pure list form of inclusivity: an element never exceeds the prefix sum
that CONTAINS it, when everything before it meets the floor (earlier
payments only add). -/
theorem getElem_le_take_sum (l : List Int) (i : Nat)
    (h : ∀ p ∈ l, 1 ≤ p) (hi : i < l.length) :
    l[i] ≤ (l.take (i + 1)).sum := by
  induction l generalizing i with
  | nil => simp at hi
  | cons x xs ih =>
      cases i with
      | zero => simp
      | succ n =>
          have hx : 1 ≤ x := h x (List.mem_cons_self x xs)
          have hxs : ∀ p ∈ xs, 1 ≤ p := fun p hp => h p (List.mem_cons_of_mem x hp)
          have hn : n < xs.length := by simpa using hi
          have := ih n hxs hn
          simp only [List.getElem_cons_succ, List.take_succ_cons, List.sum_cons]
          omega

/-- The accumulator is inclusive: the payment at position `i` never exceeds
`Gᵢ` (`Gᵢ = Gᵢ₋₁ + Pᵢ` with every earlier payment positive). -/
theorem payment_le_cumulative (c : Chain) (i : Nat) (hi : i < c.payments.length) :
    c.payments[i] ≤ c.cumulative i :=
  getElem_le_take_sum c.payments i c.floor hi

/-- The order at position `i`, with both mechanism facts derived rather
than assumed. -/
def order (c : Chain) (i : Nat) (hi : i < c.payments.length) : Order where
  payment := c.payments[i]
  cumulative := c.cumulative i
  payment_floor := c.floor _ (c.payments.getElem_mem hi)
  cumulative_inclusive := c.payment_le_cumulative i hi

/-! ### The equilibrium, stated as the absence of a profitable deviation -/

/-- **No seller deviates**: at every position, against the cooperative
profile (the buyer resolves a fully-performed process; a deviation stops it
closing), performing strictly beats holding out at every feasible
retention. This is Layer 1's inequality instantiated pointwise along the
chain — asymmetric bonding is what SCALES it (each seller bonds the
cumulative value at its link). -/
theorem no_seller_deviation (c : Chain) (i : Nat) (hi : i < c.payments.length)
    (r : Int) (hr : r ≤ c.cumulative i) :
    (c.order i hi).performPayoff > (c.order i hi).holdoutPayoff r :=
  Order.seller_performs _ r hr

/-- **The buyer does not deviate**: after every seller performed, resolving
(net −Gₙ across the whole process: each payment moves once, every bond
returns) strictly beats withholding (every buyer bond stays locked) —
position by position, hence in sum. -/
theorem no_buyer_deviation (c : Chain) (i : Nat) (hi : i < c.payments.length) :
    (c.order i hi).resolvePayoff > (c.order i hi).withholdPayoff :=
  Order.buyer_resolves _

/-- **Cooperation is a Nash equilibrium of the bonded chain**: at every
position neither party's unilateral deviation profits — the seller's by
`no_seller_deviation`, the buyer's by `no_buyer_deviation`. The weakest-link
conditionality (`Order.holdout_when_dead`) is part of the statement, not a
caveat: cooperation is each seller's best response GIVEN the others
perform, which is precisely what atomic resolution makes the pivotal
condition. -/
theorem cooperation_is_equilibrium (c : Chain) :
    ∀ i (hi : i < c.payments.length),
      (∀ r ≤ c.cumulative i,
        (c.order i hi).performPayoff > (c.order i hi).holdoutPayoff r) ∧
      (c.order i hi).resolvePayoff > (c.order i hi).withholdPayoff :=
  fun i hi =>
    ⟨fun r hr => no_seller_deviation c i hi r hr, no_buyer_deviation c i hi⟩

end Chain

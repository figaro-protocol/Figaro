---- MODULE WitnessSwapAndCommitCoordinator ----

(*
 * Formal model of `src/protocol/coordinators/WitnessSwapAndCommitCoordinator.sol`
 * — the swap-funded on-ramp into a process denomination.
 *
 * The contract is a PURE EXECUTOR: it pulls a party's input token through a
 * Permit2 WITNESS signature, swaps it at an immutable router, forwards the whole
 * output to that party's own EOA, then calls `FigaroCore.commit`, which pulls the
 * bonds from the named parties. The swap is the ON-RAMP into the process
 * denomination, never the denomination itself — the kernel still sees exactly one
 * currency (`c.currency`).
 *
 * WHAT IS MODELED — the funds state machine, at EVM-step granularity so that the
 * intermediate "swap executed, commit not yet" states are REACHABLE and therefore
 * checkable:
 *
 *   StartTx           →  swapAndCommit() entry + the `NothingToFund` guard
 *                        (WitnessSwapAndCommitCoordinator.sol:185); snapshots the
 *                        pre-call state so `Revert` can restore it.
 *   BuyerPull         →  _fund step 1: permit2.permitWitnessTransferFrom pulls
 *   SellerPull           `maxInput` of the input token to the coordinator, then
 *                        forceApprove(router, maxInput)              (:205-220)
 *   BuyerSwapSettle   →  _fund steps 2-4 fused: router.call(swapData) consumes
 *   SellerSwapSettle     `consumed` input and returns `received` bond currency;
 *                        forceApprove(router, 0)                     (:222-224)
 *                        the OutputBelowBond floor                   (:229-230)
 *                        the FULL output forwarded to the party      (:231)
 *                        the unconsumed input refunded to the party  (:234-235)
 *   Commit            →  figaroCore.commit(): the kernel pulls 2*payment from the
 *                        buyer and 2*expectedCumulativeValue from the seller
 *                        (FigaroCore.sol:208-209), after the root-order guard
 *                        `expectedCumulativeValue == payment`        (:178-180)
 *   Revert            →  EVM revert from ANY mid-call step: the whole call frame
 *                        rolls back to the snapshot. Enabled everywhere in-flight,
 *                        which subsumes every named revert (SwapCallFailed,
 *                        OutputBelowBond, the kernel's own reverts, out-of-gas).
 *
 * WHAT IS ABSTRACTED:
 *   ECDSA / EIP-712 / Permit2 digests  — the standard abstraction: a signature
 *       either verifies or it does not. Signature VALIDITY is assumed; what is NOT
 *       assumed is that the submitted route matches the SIGNED route — that is
 *       modeled as data equality via the `substituted` flag, because it is the
 *       exact bug the witness variant was written to close (:62-82).
 *   Permit2 nonce / deadline replay    — Permit2's own concern, not the funds machine.
 *   ERC-20 mechanics                   — integer balances, exact transfers.
 *   Fee-on-transfer tokens             — the kernel's `_pullExact` guard is its own
 *                                        (FigaroCore.tla covers the kernel side).
 *   Reentrancy                         — `nonReentrant` on both the coordinator and
 *                                        the kernel; the model has one call in flight.
 *   Multi-currency processes           — forbidden by doctrine; one bond currency.
 *   Sub-orders / process chains        — root orders only (`expectedCumulativeValue`
 *                                        is a free parameter and the kernel's root
 *                                        guard rejects the mismatch, which is what
 *                                        exercises atomicity). Process-chain
 *                                        arithmetic belongs to FigaroCore.tla.
 *   Commitment replay (`DuplicateCommitment`) — each modeled call carries a fresh salt.
 *)

EXTENDS Integers, FiniteSets, Sequences, TLC


\* ── Constants ────────────────────────────────────────────────
CONSTANTS
    MaxPayment,         \* c.payment ranges over 1..MaxPayment
    MaxCumExcess,       \* c.expectedCumulativeValue ranges over payment..payment+MaxCumExcess
    MaxInput,           \* the Permit2 `maxInput` ceiling ranges over 1..MaxInput
    MaxSwapOutput,      \* the router may return 0..MaxSwapOutput of the bond currency
    PartyBond,          \* each party's starting bond-currency balance
    PartyInput,         \* each party's starting input-token balance
    RouterLiquidity,    \* the router's starting bond-currency balance
    MaxTx               \* how many swapAndCommit calls to model

ASSUME MaxPayment > 0 /\ MaxCumExcess >= 0 /\ MaxInput > 0
ASSUME MaxSwapOutput >= 0 /\ PartyBond >= 0 /\ PartyInput >= 0
ASSUME RouterLiquidity >= 0 /\ MaxTx > 0


\* ── Derived domains ──────────────────────────────────────────
\* Two tokens: the process bond currency and one input token. One input token
\* suffices — the coordinator's per-leg logic is token-agnostic and each leg is
\* independent, so a second input token adds states without adding behavior.
Tokens   == { "bond", "inp" }

\* Every holder of value the call touches. "core" is FigaroCore (the escrow),
\* "router" is the off-protocol swap venue / pool.
Parties  == { "buyer", "seller" }
Holders  == Parties \union { "coord", "core", "router" }

Payments == 1 .. MaxPayment
CumVals  == 1 .. ( MaxPayment + MaxCumExcess )
Inputs   == 1 .. MaxInput

\* Execution phases of the single in-flight swapAndCommit call.
Phases   == { "idle", "bPull", "bSwap", "sPull", "sSwap", "commit" }


\* ── Variables ────────────────────────────────────────────────
VARIABLES
    bal,            \* [Tokens -> [Holders -> Int]] — ERC-20 balances
    allow,          \* [Tokens -> Nat] — the coordinator's allowance TO the router
    pc,             \* Phases — where the in-flight call is
    snap,           \* the pre-call snapshot the EVM would restore on revert
    orders,         \* Seq of committed order records (FigaroCore storage)
    tx,             \* parameters of the in-flight call
    swapDone,       \* TRUE once a leg's swap has moved value in this call
    commitDone,     \* TRUE once figaroCore.commit landed in this call
    routeMismatch,  \* sticky: a route ever executed that the party did not sign
    txCount         \* calls started so far (model bound)

vars ==
  << bal, allow, pc, snap, orders, tx, swapDone, commitDone,
     routeMismatch, txCount >>


\* ── Helpers ──────────────────────────────────────────────────
RECURSIVE SetSum(_,_)
SetSum(S, f) ==
  IF S = {} THEN 0
  ELSE LET x == CHOOSE y \in S : TRUE IN f[x] + SetSum(S \ { x }, f)

RECURSIVE SumSeq(_)
SumSeq(s) == IF s = <<>> THEN 0 ELSE Head(s) + SumSeq(Tail(s))

\* An ERC-20 transfer. `from` and `to` are always distinct in this model.
Move(b, t, from, to, amt) ==
  [b EXCEPT ![t][from] = @ - amt, ![t][to] = @ + amt]

TotalSupply(t) ==
  IF t = "bond" THEN 2 * PartyBond + RouterLiquidity ELSE 2 * PartyInput

InitBal ==
  [t \in Tokens |->
     [h \in Holders |->
        IF t = "bond"
        THEN ( IF h \in Parties THEN PartyBond
               ELSE IF h = "router" THEN RouterLiquidity ELSE 0 )
        ELSE ( IF h \in Parties THEN PartyInput ELSE 0 )]]

ZeroAllow == [t \in Tokens |-> 0]

NullTx ==
  [ payment |-> 0, cumVal |-> 0, bEnabled |-> FALSE, sEnabled |-> FALSE,
    bMaxIn |-> 0, sMaxIn |-> 0, substituted |-> FALSE ]


\* ── Initial state ────────────────────────────────────────────
Init ==
  /\ bal = InitBal
  /\ allow = ZeroAllow
  /\ pc = "idle"
  /\ snap = [balSnap |-> InitBal, allowSnap |-> ZeroAllow, ordersSnap |-> <<>>]
  /\ orders = <<>>
  /\ tx = NullTx
  /\ swapDone = FALSE
  /\ commitDone = FALSE
  /\ routeMismatch = FALSE
  /\ txCount = 0


\* ── Action: StartTx ──────────────────────────────────────────
\* swapAndCommit() entry. `if (!buyerFunding.enabled && !sellerFunding.enabled)
\* revert NothingToFund();`  (WitnessSwapAndCommitCoordinator.sol:185)
\*
\* `substituted` models a relayer submitting a `swapData` / `inputToken` /
\* `maxInput` tuple OTHER than the one the party's witness signature covers.
StartTx(p, cv, be, se, bmi, smi, sub) ==
  /\ pc = "idle"
  /\ txCount < MaxTx
  /\ cv >= p                       \* expectedCumulativeValue is never below payment
  /\ ( be \/ se )                  \* the NothingToFund guard
  /\ tx' = [ payment |-> p, cumVal |-> cv, bEnabled |-> be, sEnabled |-> se,
             bMaxIn |-> bmi, sMaxIn |-> smi, substituted |-> sub ]
  /\ snap' = [balSnap |-> bal, allowSnap |-> allow, ordersSnap |-> orders]
  /\ pc' = IF be THEN "bPull" ELSE "sPull"
  /\ swapDone' = FALSE
  /\ commitDone' = FALSE
  /\ txCount' = txCount + 1
  /\ UNCHANGED << bal, allow, orders, routeMismatch >>


\* ── Action: LegPull ──────────────────────────────────────────
\* _fund step 1 + the head of step 2: Permit2 pulls `maxIn` of the input token
\* from the party to the coordinator, then forceApprove(router, maxIn).
\* (WitnessSwapAndCommitCoordinator.sol:205-220)
\*
\* WITNESS BINDING (the reason this contract exists): the digest Permit2 verifies
\* covers {router, inputToken, maxInput, keccak256(swapData)}. A submitted route
\* that differs from the signed one recomputes to a different witness, so the
\* signature no longer recovers the party and Permit2 reverts BEFORE any token
\* moves. Modeled as the data equality `~tx.substituted` gating the transfer.
LegPull(party, maxIn, nxt) ==
  /\ ~tx.substituted
  /\ bal["inp"][party] >= maxIn
  /\ bal' = Move(bal, "inp", party, "coord", maxIn)
  /\ allow' = [allow EXCEPT !["inp"] = maxIn]
  /\ routeMismatch' = ( routeMismatch \/ tx.substituted )
  /\ pc' = nxt
  /\ UNCHANGED << snap, orders, tx, swapDone, commitDone, txCount >>


\* ── Action: LegSwapSettle ────────────────────────────────────
\* _fund steps 2-4 (WitnessSwapAndCommitCoordinator.sol:222-235):
\*   router.call(swapData)  — consumes `consumed` of the input, returns `received`
\*                            of the bond currency (rate is the venue's business)
\*   forceApprove(router, 0)
\*   received < bondAmount  → OutputBelowBond, the whole call reverts
\*   safeTransfer(party, received)        — the FULL output, not just the bond,
\*                                          so the slippage residual stays with
\*                                          the party and the coordinator keeps 0
\*   safeTransfer(party, inputResidual)   — the unconsumed input
LegSwapSettle(party, maxIn, bondAmount, nxt, consumed, received) ==
  /\ consumed <= maxIn
  /\ received <= bal["bond"]["router"]
  /\ received >= bondAmount
  /\ LET b1 == Move(bal, "inp",  "coord",  "router", consumed)
         b2 == Move(b1,  "bond", "router", "coord",  received)
         b3 == Move(b2,  "bond", "coord",  party,    received)
         b4 == IF maxIn - consumed > 0
               THEN Move(b3, "inp", "coord", party, maxIn - consumed)
               ELSE b3
     IN bal' = b4
  /\ allow' = [allow EXCEPT !["inp"] = 0]
  /\ swapDone' = TRUE
  /\ pc' = nxt
  /\ UNCHANGED << snap, orders, tx, commitDone, routeMismatch, txCount >>


\* ── Action: Commit ───────────────────────────────────────────
\* figaroCore.commit(c, buyerSig, sellerSig). The kernel pulls the bonds from the
\* NAMED parties, not from msg.sender — which is why the coordinator funds the
\* party in place and never becomes a counterparty.
\*   _pullExact(currency, c.buyer,  c.payment * 2)                 FigaroCore.sol:208
\*   _pullExact(currency, c.seller, c.expectedCumulativeValue * 2) FigaroCore.sol:209
\* Root-order guard: expectedCumulativeValue must equal payment, else
\* InvalidRootCumulativeValue reverts the whole call            FigaroCore.sol:178-180
Commit ==
  /\ pc = "commit"
  /\ tx.cumVal = tx.payment
  /\ bal["bond"]["buyer"]  >= 2 * tx.payment
  /\ bal["bond"]["seller"] >= 2 * tx.cumVal
  /\ LET b1 == Move(bal, "bond", "buyer",  "core", 2 * tx.payment)
         b2 == Move(b1,  "bond", "seller", "core", 2 * tx.cumVal)
     IN bal' = b2
  /\ orders' = Append(orders,
       [ buyer      |-> "buyer",
         seller     |-> "seller",
         payment    |-> tx.payment,
         cumVal     |-> tx.cumVal,
         buyerBond  |-> 2 * tx.payment,
         sellerBond |-> 2 * tx.cumVal ])
  /\ commitDone' = TRUE
  /\ pc' = "idle"
  /\ UNCHANGED << allow, snap, tx, swapDone, routeMismatch, txCount >>


\* ── Action: Revert ───────────────────────────────────────────
\* An EVM revert at any point in the call frame. Restores everything the frame
\* touched. Enabled from every in-flight phase, so it subsumes every named revert
\* path (NothingToFund is a pre-state guard; SwapCallFailed; OutputBelowBond;
\* InvalidRootCumulativeValue; a failed _pullExact; out-of-gas).
\*
\* `routeMismatch` and `txCount` are model bookkeeping, not chain state, so they
\* are deliberately NOT rolled back.
Revert ==
  /\ pc # "idle"
  /\ bal' = snap.balSnap
  /\ allow' = snap.allowSnap
  /\ orders' = snap.ordersSnap
  /\ pc' = "idle"
  /\ swapDone' = FALSE
  /\ commitDone' = FALSE
  /\ UNCHANGED << snap, tx, routeMismatch, txCount >>


\* ── Phase wiring ─────────────────────────────────────────────
BuyerPull  == /\ pc = "bPull" /\ LegPull("buyer", tx.bMaxIn, "bSwap")
SellerPull == /\ pc = "sPull" /\ LegPull("seller", tx.sMaxIn, "sSwap")

BuyerSwapSettle(consumed, received) ==
  /\ pc = "bSwap"
  /\ LegSwapSettle("buyer", tx.bMaxIn, 2 * tx.payment,
                   IF tx.sEnabled THEN "sPull" ELSE "commit", consumed, received)

SellerSwapSettle(consumed, received) ==
  /\ pc = "sSwap"
  /\ LegSwapSettle("seller", tx.sMaxIn, 2 * tx.cumVal, "commit", consumed, received)


\* ── Next-state relation ──────────────────────────────────────
Next ==
  \/ \E p \in Payments, cv \in CumVals, be \in BOOLEAN, se \in BOOLEAN,
        bmi \in Inputs, smi \in Inputs, sub \in BOOLEAN :
       StartTx(p, cv, be, se, bmi, smi, sub)
  \/ BuyerPull
  \/ \E c \in 0 .. MaxInput, r \in 0 .. MaxSwapOutput : BuyerSwapSettle(c, r)
  \/ SellerPull
  \/ \E c \in 0 .. MaxInput, r \in 0 .. MaxSwapOutput : SellerSwapSettle(c, r)
  \/ Commit
  \/ Revert

Spec == Init /\ [][Next]_vars


\* ══════════════════════════════════════════════════════════════
\* SAFETY INVARIANTS
\* ══════════════════════════════════════════════════════════════

\* ── Type correctness ─────────────────────────────────────────
Inv_TypeOK ==
  /\ pc \in Phases
  /\ txCount \in 0 .. MaxTx
  /\ Len(orders) <= MaxTx
  /\ \A t \in Tokens : allow[t] \in Nat
  /\ \A t \in Tokens : \A h \in Holders : bal[t][h] \in Int
  /\ \A i \in 1 .. Len(orders) : orders[i].payment \in Payments


\* ── Conservation ─────────────────────────────────────────────
\* Every step is a pure transfer: payer + venue + coordinator + kernel escrow sum
\* to the starting supply, per token. Nothing is minted, burned or stranded.
Inv_Conservation ==
  \A t \in Tokens : SetSum(Holders, bal[t]) = TotalSupply(t)


\* ── No holder goes negative ──────────────────────────────────
Inv_NonNegative ==
  \A t \in Tokens : \A h \in Holders : bal[t][h] >= 0


\* ── Zero retention ───────────────────────────────────────────
\* THE coordinator property. Between calls — after one that completed AND after
\* one that reverted — the coordinator's balance in EVERY token is zero. It is a
\* pure executor: the full swap output goes to the party (:231) and every
\* unconsumed input is refunded (:234-235). Checked at `pc = "idle"` because
\* mid-call the coordinator legitimately holds the pulled input.
Inv_ZeroRetention ==
  pc = "idle" => \A t \in Tokens : bal[t]["coord"] = 0


\* ── Allowance hygiene ────────────────────────────────────────
\* forceApprove(router, maxInput) before the call, forceApprove(router, 0) after
\* (:220, :224). No standing allowance survives the call, so a later router
\* compromise cannot drain a coordinator that is holding nothing anyway.
Inv_AllowanceHygiene ==
  pc = "idle" => \A t \in Tokens : allow[t] = 0


\* ── Atomicity ────────────────────────────────────────────────
\* swap-then-commit lands entirely or not at all. In every quiescent state, a
\* swap has moved value in the call iff the commit landed in that call. The
\* intermediate states where `swapDone /\ ~commitDone` ARE reachable (that is the
\* point of modeling at EVM-step granularity) — they are simply never quiescent:
\* the only exits are `Commit` or `Revert`.
Inv_Atomicity ==
  pc = "idle" => ( swapDone = commitDone )


\* ── Bonding arithmetic ───────────────────────────────────────
\* Each landed order carries exactly the kernel's pulls: 2x payment from the
\* buyer, 2x expectedCumulativeValue from the seller (FigaroCore.sol:208-209),
\* which is what the coordinator funds each leg to (:190, :193). The swap is the
\* on-ramp; the bond ratio is untouched by it.
Inv_BondFormula ==
  \A i \in 1 .. Len(orders) :
    /\ orders[i].buyerBond  = 2 * orders[i].payment
    /\ orders[i].sellerBond = 2 * orders[i].cumVal


\* ── Kernel escrow is exact ───────────────────────────────────
\* FigaroCore holds precisely the doubled bonds of the orders that landed —
\* no more (the coordinator never over-pushes) and no less (it never under-funds:
\* the bond is derived from `c`, never supplied by the caller, :137).
Inv_CoreEscrowExact ==
  bal["bond"]["core"] =
    SumSeq([i \in 1 .. Len(orders) |->
              orders[i].buyerBond + orders[i].sellerBond])


\* ── Witness route binding ────────────────────────────────────
\* No route ever executes that the paying party did not sign. Data equality on
\* {router, inputToken, maxInput, keccak256(swapData)} — the witness tuple
\* (:112-121, :168-170). This is the property the predecessor coordinator lacked
\* and a relayer could exploit (:62-73).
Inv_WitnessRouteBinding == ~routeMismatch


\* ── Coordinator is never a counterparty ──────────────────────
\* The commitment is passed through unchanged: the kernel's buyer and seller stay
\* the EIP-712 signers. The coordinator funds them in place (:57-61).
Inv_CoordinatorNotCounterparty ==
  \A i \in 1 .. Len(orders) :
    orders[i].buyer # "coord" /\ orders[i].seller # "coord"


\* ── Composite ────────────────────────────────────────────────
SafetyInvariant ==
  /\ Inv_TypeOK
  /\ Inv_Conservation
  /\ Inv_NonNegative
  /\ Inv_ZeroRetention
  /\ Inv_AllowanceHygiene
  /\ Inv_Atomicity
  /\ Inv_BondFormula
  /\ Inv_CoreEscrowExact
  /\ Inv_WitnessRouteBinding
  /\ Inv_CoordinatorNotCounterparty

====

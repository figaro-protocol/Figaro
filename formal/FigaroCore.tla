---- MODULE FigaroCore ----

(*
 * Formal model of FigaroCore V5 — the self-enforcing agreement kernel.
 *
 * Two actions model the two external contract functions:
 *   CommitRoot / CommitSub  →  FigaroCore.commit()
 *   ResolveProcess          →  FigaroCore.resolveProcess()
 *
 * WHAT IS VERIFIED:
 *   Token conservation      — total supply is constant across all transitions
 *   Contract solvency       — contract balance is always non-negative
 *   Wallet non-negativity   — no participant goes below zero
 *   Bond formula            — buyer bond = 2×payment, seller bond = 2×cumulativeValue
 *   Cumulative integrity    — cumulativeValue = sum of all order payments in process
 *   Active count            — activeCount matches count of committed orders
 *   Resolution possible     — contract always has sufficient funds to resolve
 *
 * WHAT IS ABSTRACTED:
 *   EIP-712 signatures      — assumed correct if both parties participate
 *   ERC-20 token mechanics  — modeled as integer balances with direct transfer
 *   Fee-on-transfer tokens  — _pullExact revert abstracted (balances are exact)
 *   Reentrancy              — protected by ReentrancyGuard (orthogonal)
 *   Block.timestamp/deadline — timing concern, not economic
 *   Multi-currency          — single currency model (mechanism is per-currency)
 *   Gas limits              — operational, not mechanism concern
 *   Post-resolution continuation — contract allows sub-orders after resolve;
 *                                  modeled as single-resolution per process
 *)
EXTENDS Integers, FiniteSets, Sequences, TLC


\* ── Constants ────────────────────────────────────────────────
CONSTANTS Buyers,    \* Non-empty finite set of buyer addresses
         Sellers,    \* Non-empty finite set of seller addresses
         InitialBalance,    \* Starting token balance per participant
         MaxPayment,    \* 1..MaxPayment are valid payment amounts
         MaxProcesses,    \* Upper bound on concurrent processes
         MaxSubOrders

\* Upper bound on sub-orders per process
\* ── Derived ──────────────────────────────────────────────────
Payments == 1 .. MaxPayment
Participants == Buyers \union Sellers
MaxTotalOrders == MaxProcesses * ( 1 + MaxSubOrders )

ASSUME Buyers # {} /\ Sellers # {}
ASSUME InitialBalance > 0 /\ MaxPayment > 0 /\ MaxProcesses > 0


\* ── Variables ────────────────────────────────────────────────
VARIABLES
    \* On-chain state (mirrors FigaroCore.sol storage)
  processes,    \* [1..MaxProcesses] -> ProcessRecord | NullProcess
  orderStatus,
    \* [1..MaxTotalOrders] -> "Unknown" | "Committed" | "Resolved"
    \* Auxiliary state (reconstructed from calldata in the contract;
    \* stored here for resolution replay and invariant checking)
  orderRecords,    \* [1..MaxTotalOrders] -> OrderRecord | NullOrder
  processOrders,
    \* [1..MaxProcesses] -> Seq(Nat)
    \* Token balances
  contractBalance,    \* Nat: total tokens held by the contract
  wallets,
    \* [Participants] -> Nat: external token balances
    \* ID counters (abstraction of hash-based identifiers)
  nextProcId,
  nextOrdId

vars ==
  << processes,
     orderStatus,
     orderRecords,
     processOrders,
     contractBalance,
     wallets,
     nextProcId,
     nextOrdId
  >>


\* ── Sentinel values ──────────────────────────────────────────
NullProcess ==
  [ rootBuyer |-> "null", cumulativeValue |-> 0, activeCount |-> 0 ]

NullOrder ==
  [ processId |-> 0,
    buyer |-> "null",
    seller |-> "null",
    payment |-> 0,
    cumulativeValue |-> 0
  ]


\* ── Helpers ──────────────────────────────────────────────────
\* Sum over a set using a function
RECURSIVE SetSum(_,_)
SetSum(S, f) ==
  IF S = {}
  THEN 0
  ELSE LET x == CHOOSE x \in S: TRUE IN f[x] + SetSum(S \ { x }, f)

\* Sum of a sequence of integers
RECURSIVE SumSeq(_)
SumSeq(s) == IF s = <<>> THEN 0 ELSE Head(s) + SumSeq(Tail(s))

\* Set of elements in a sequence
Range(s) == {s[i]: i \in 1 .. Len(s)}

\* Process predicates
IsActive(pid) ==
  /\ processes[pid].rootBuyer # "null"
  /\ processes[pid].activeCount > 0

TotalSupply == Cardinality(Participants) * InitialBalance


\* ── Payout computation ───────────────────────────────────────
\* Per-order payouts from the contract:
\*   seller: cumulativeValue × 2 + payment   (bond return + payment)
\*   buyer:  payment                          (half bond return)
\* Compute per-participant wallet deltas from resolving a process
RECURSIVE PayoutDeltas(_,_,_)
PayoutDeltas(oids, idx, delta) ==
  IF idx > Len(oids)
  THEN delta
  ELSE LET o == orderRecords[oids[idx]]
           sellerAmt == o.cumulativeValue * 2 + o.payment
           buyerAmt == o.payment
    IN PayoutDeltas(oids, idx + 1, [p \in Participants |->
            delta[p] + ( IF p = o.seller THEN sellerAmt ELSE 0 ) +
              ( IF p = o.buyer THEN buyerAmt ELSE 0 )
          ])

\* Total payout for all orders in a process
ProcessTotalPayout(pid) ==
  LET oids == processOrders[pid]
  IN SumSeq([i \in 1 .. Len(oids) |->
          LET o == orderRecords[oids[i]]
          IN 2 * o.cumulativeValue + 2 * o.payment
        ])


\* ── Initial state ────────────────────────────────────────────
Init ==
  /\ processes = [pid \in 1 .. MaxProcesses |-> NullProcess]
  /\ orderStatus = [oid \in 1 .. MaxTotalOrders |-> "Unknown"]
  /\ orderRecords = [oid \in 1 .. MaxTotalOrders |-> NullOrder]
  /\ processOrders = [pid \in 1 .. MaxProcesses |-> <<>>]
  /\ contractBalance = 0
  /\ wallets = [p \in Participants |-> InitialBalance]
  /\ nextProcId = 1
  /\ nextOrdId = 1


\* ── Action: CommitRoot ───────────────────────────────────────
\* Create a new process with a root order.
\* Mirrors FigaroCore.commit() when c.processId == bytes32(0).
\*
\* Bond deposits:
\*   buyer:  payment × 2
\*   seller: payment × 2   (root: expectedCumulativeValue = payment)
CommitRoot(buyer, seller, payment) ==
  LET pid == nextProcId
      oid == nextOrdId
      buyerBond == payment * 2
      sellerBond == payment * 2
  IN \* Guards
     /\ pid <= MaxProcesses
     /\ oid <= MaxTotalOrders
     /\ buyer \in Buyers
     /\ seller \in Sellers
     /\ payment \in Payments
     /\ processes[pid] = NullProcess
     /\ \A p \in Participants:
          wallets[p] >=
            ( IF p = buyer THEN buyerBond ELSE 0 ) +
              ( IF p = seller THEN sellerBond ELSE 0 )
     \* State updates
     /\ processes' =
          [processes EXCEPT
          ![pid] =
          [ rootBuyer |-> buyer,
            cumulativeValue |-> payment,
            activeCount |-> 1
          ]]
     /\ orderStatus' = [orderStatus EXCEPT ![oid] = "Committed"]
     /\ orderRecords' =
          [orderRecords EXCEPT
          ![oid] =
          [ processId |-> pid,
            buyer |-> buyer,
            seller |-> seller,
            payment |-> payment,
            cumulativeValue |-> payment
          ]]
     /\ processOrders' = [processOrders EXCEPT ![pid] = << oid >>]
     /\ contractBalance' = contractBalance + buyerBond + sellerBond
     /\ wallets' =
          [p \in Participants |->
            wallets[p] - ( IF p = buyer THEN buyerBond ELSE 0 ) -
              ( IF p = seller THEN sellerBond ELSE 0 )
          ]
     /\ nextProcId' = pid + 1
     /\ nextOrdId' = oid + 1


\* ── Action: CommitSub ────────────────────────────────────────
\* Add a sub-order to an existing active process.
\* Mirrors FigaroCore.commit() when c.processId != bytes32(0).
\*
\* Bond deposits:
\*   buyer:  payment × 2
\*   seller: newCumulativeValue × 2   (cumulative bonding)
\*
\* The sub-order seller bonds 2× the TOTAL cumulative value (not just
\* their payment). Later sellers have more skin in the game.
CommitSub(pid, seller, payment) ==
  LET ps == processes[pid]
      oid == nextOrdId
      buyer == ps.rootBuyer
      newCumVal == ps.cumulativeValue + payment
      buyerBond == payment * 2
      sellerBond == newCumVal * 2
  IN \* Guards
     /\ IsActive(pid)
     /\ oid <= MaxTotalOrders
     /\ Len(processOrders[pid]) <= MaxSubOrders
     \* room for 1 more
     /\ seller \in Sellers
     /\ payment \in Payments
     /\ \A p \in Participants:
          wallets[p] >=
            ( IF p = buyer THEN buyerBond ELSE 0 ) +
              ( IF p = seller THEN sellerBond ELSE 0 )
     \* State updates
     /\ processes' =
          [processes EXCEPT
          ![pid] =
          [@ EXCEPT !.cumulativeValue = newCumVal, !.activeCount = @ + 1]]
     /\ orderStatus' = [orderStatus EXCEPT ![oid] = "Committed"]
     /\ orderRecords' =
          [orderRecords EXCEPT
          ![oid] =
          [ processId |-> pid,
            buyer |-> buyer,
            seller |-> seller,
            payment |-> payment,
            cumulativeValue |-> newCumVal
          ]]
     /\ processOrders' = [processOrders EXCEPT ![pid] = Append(@, oid)]
     /\ contractBalance' = contractBalance + buyerBond + sellerBond
     /\ wallets' =
          [p \in Participants |->
            wallets[p] - ( IF p = buyer THEN buyerBond ELSE 0 ) -
              ( IF p = seller THEN sellerBond ELSE 0 )
          ]
     /\ nextProcId' = nextProcId
     /\ nextOrdId' = oid + 1


\* ── Action: ResolveProcess ───────────────────────────────────
\* Atomically resolve all orders in a process.
\* Mirrors FigaroCore.resolveProcess().
\*
\* Buyer dominance: only the root buyer can trigger resolution.
\* (Modeled by the action structure — no adversary action exists.)
ResolveProcess(pid) ==
  LET oids == processOrders[pid]
      delta == PayoutDeltas(oids, 1, [p \in Participants |-> 0])
      totalOut == ProcessTotalPayout(pid)
  IN /\ IsActive(pid)
     \* Token transfers
     /\ contractBalance' = contractBalance - totalOut
     /\ wallets' = [p \in Participants |-> wallets[p] + delta[p]]
     \* Mark all orders resolved
     /\ orderStatus' =
          [oid \in 1 .. MaxTotalOrders |->
            IF oid \in Range(oids) THEN "Resolved" ELSE orderStatus[oid]
          ]
     \* Zero the active count (process record persists but is inactive)
     /\ processes' = [processes EXCEPT ![pid] = [@ EXCEPT !.activeCount = 0]]
     /\ UNCHANGED << orderRecords, processOrders, nextProcId, nextOrdId >>


\* ── Next-state relation ──────────────────────────────────────
Next ==
  \/ \E b \in Buyers, s \in Sellers, pay \in Payments: CommitRoot(b, s, pay)
  \/ \E pid \in 1 .. MaxProcesses,
       s \in Sellers,
       pay \in Payments:
       CommitSub(pid, s, pay)
  \/ \E pid \in 1 .. MaxProcesses: ResolveProcess(pid)

Spec == Init /\ [][Next]_vars



\* ══════════════════════════════════════════════════════════════
\* SAFETY INVARIANTS
\* ══════════════════════════════════════════════════════════════
\* ── Type correctness ─────────────────────────────────────────
TypeOK ==
  /\ nextProcId \in 1 .. ( MaxProcesses + 1 )
  /\ nextOrdId \in 1 .. ( MaxTotalOrders + 1 )
  /\ contractBalance \in Nat
  /\ \A p \in Participants: wallets[p] \in Nat
  /\ \A pid \in 1 .. MaxProcesses:
       processes[pid].rootBuyer \in ( { "null" } \union Buyers )
  /\ \A oid \in 1 .. MaxTotalOrders:
       orderStatus[oid] \in { "Unknown", "Committed", "Resolved" }


\* ── Perfect accounting ───────────────────────────────────────
\* Sum of all external wallets plus contract balance equals the
\* initial total supply. No tokens are created or destroyed.
TokenConservation ==
  SetSum(Participants, wallets) + contractBalance = TotalSupply


\* ── Contract solvency ────────────────────────────────────────
\* The contract always holds non-negative tokens. It never
\* promises more than it has.
ContractSolvency == contractBalance >= 0


\* ── Wallet non-negativity ────────────────────────────────────
\* No participant's balance ever goes below zero.
WalletNonNegative == \A p \in Participants: wallets[p] >= 0


\* ── Cumulative value integrity ───────────────────────────────
\* For every initialized process, cumulativeValue equals the sum
\* of all order payments in that process.
CumulativeIntegrity ==
  \A pid \in 1 .. MaxProcesses:
    processes[pid].rootBuyer # "null" =>
      processes[pid].cumulativeValue =
        SumSeq([i \in 1 .. Len(processOrders[pid]) |->
            orderRecords[processOrders[pid][i]].payment
          ])


\* ── Active count consistency ─────────────────────────────────
\* For every initialized process, activeCount equals the number
\* of orders currently in "Committed" status.
ActiveCountCorrect ==
  \A pid \in 1 .. MaxProcesses:
    processes[pid].rootBuyer # "null" =>
      processes[pid].activeCount =
        Cardinality({i \in 1 .. Len(processOrders[pid]):
            orderStatus[processOrders[pid][i]] = "Committed"
          })


\* ── Resolution always possible ───────────────────────────────
\* For every active process, the contract holds sufficient funds
\* to pay out all orders. Combined with TokenConservation, this
\* proves the economic mechanism is always solvent.
ResolutionAlwaysPossible ==
  \A pid \in 1 .. MaxProcesses:
    IsActive(pid) => contractBalance >= ProcessTotalPayout(pid)


\* ── Composite safety invariant ───────────────────────────────
SafetyInvariant ==
  /\ TypeOK
  /\ TokenConservation
  /\ ContractSolvency
  /\ WalletNonNegative
  /\ CumulativeIntegrity
  /\ ActiveCountCorrect
  /\ ResolutionAlwaysPossible

====

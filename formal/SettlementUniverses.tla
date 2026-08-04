---- MODULE SettlementUniverses ----

(*
 * Formal model of Figaro's COMPOSED settlement system — the cross-contract
 * temporal properties no per-contract harness (Foundry / Halmos / Certora,
 * all single-contract) can express.
 *
 * THE OBJECT UNDER TEST — three contracts and one off-chain guest:
 *
 *   FigaroCore            (src/kernel/FigaroCore.sol)
 *       commit()          → locks buyer 2×payment, seller 2×cumulativeValue
 *       resolveProcess()  → buyer-triggered, ATOMIC over a process's orders,
 *                           flips orderStatus 1 → 2
 *
 *   FigaroBatchVerifier   (src/protocol/verifier/FigaroBatchVerifier.sol)
 *       settleBatch()     → verifies an SP1 proof, reconciles NET token
 *                           positions per (token, user), re-emits attestations,
 *                           advances stateRoot, and bridges the RPGF accrual.
 *                           It writes NO kernel state — a batch-settled order
 *                           never acquires kernel orderStatus, ever.
 *
 *   UsageCounter          (src/protocol/usage/UsageCounter.sol)
 *       recordClauseUsage()  → direct path; requires core.orderStatus == 2
 *       applyBatchAccrual()  → batch path; proof-gated writer, CUMULATIVE
 *                              overwrite (REPLACE, never add)
 *       scoreOf()            → accrualOf.score + batchAccrualOf.score
 *
 *   the guest kernel       (prover/lib/src/kernel.rs) — a byte-faithful mirror
 *                          of FigaroCore's state machine that lives entirely
 *                          off-chain, under the verifier's state root.
 *
 * THE CREASE. FigaroCore and FigaroBatchVerifier share no state and never call
 * each other (docs/SCALING_STRATEGY.md § "Two settlement paths, two DISJOINT
 * state universes"). Exactly ONE thing crosses: the RPGF usage accrual, as
 * proved numbers. Money crosses as net token positions, which is settlement,
 * not state. This model is the first instrument that can see both universes at
 * once and interleave them arbitrarily.
 *
 * ── THE TWO NAMED ASSUMPTIONS ────────────────────────────────────────────
 *
 * The point of the model is to isolate WHICH assumption carries WHICH
 * invariant. Both are constants; flipping either to FALSE and re-running is
 * the experiment.
 *
 *   AssumeDomainSeparation
 *       "The same signed commitment can never acquire the same identity in
 *        both universes."
 *       STATUS: CONTRACT-ENFORCED, not a sequencer promise.
 *       FigaroBatchVerifier.settleBatch requires
 *         pv.verifyingContract == address(this)   (FigaroBatchVerifier.sol:266)
 *       and the guest builds its EIP-712 domain separator from exactly that
 *       address (prover/lib/src/eip712.rs domain_separator(chain_id,
 *       verifying_contract) — same name "FigaroCore", same version "3", but a
 *       DIFFERENT verifyingContract from the kernel's own EIP712 domain,
 *       FigaroCore.sol:107). A root order's processId IS the typed-data
 *       digest (FigaroCore.sol:170, kernel.rs derive_commitment_ids), so the
 *       two universes' processId spaces are disjoint by construction, and a
 *       sub-order is confined to the universe whose process exists (each side
 *       reverts UnknownProcess otherwise).
 *       WHAT IT CARRIES: NoDoublePayout, UniverseDisjointOrders,
 *       KernelBlindToBatch's usefulness, and ProcessCountedInOneUniverse
 *       (the RPGF face of the crease — UsageCounter.sol:210-213 explicitly
 *       rests the "sum scores, never components" argument on it).
 *
 *   AssumeAccrualGatesAligned
 *       "No accrual-period boundary is crossed between the guest proving a
 *        batch's usage claims and that batch settling on chain."
 *       STATUS: NOT contract-enforced. UsageCounter.applyBatchAccrual reverts
 *       PeriodMismatch when the sequencer's period is not the open one
 *       (UsageCounter.sol:548-549), and FigaroBatchVerifier catches that
 *       revert and settles the tokens anyway (FigaroBatchVerifier.sol:322-327,
 *       DESIGN_DECISIONS.md §20). The GUEST state has already advanced — its
 *       usage_process_counted set rides the state root and is GLOBAL, once
 *       ever, whatever the period (kernel.rs:714) — so the dropped processes
 *       can never be re-counted, in that period or any later one.
 *       WHAT IT CARRIES: AccrualNotLost. Note what it does NOT carry:
 *       AccrualNeverOverPays holds unconditionally. The failure mode is
 *       strictly conservative under-pay, exactly as documented.
 *
 * ── WHAT IS ABSTRACTED ───────────────────────────────────────────────────
 *
 *   SP1 proof validity      — assumed; the model asks what happens GIVEN a
 *                             valid proof, not whether one can be forged
 *   ECDSA / EIP-712 recovery — assumed correct; the DOMAIN's effect on
 *                             identity is modeled explicitly (see above)
 *   keccak collision-resistance — order/process identities are integers
 *   ERC-20 mechanics        — integer balances, exact transfers
 *   Merkle inclusion proofs — a usage claim is admitted or not
 *   icbrt(c·d²·1e18)        — abstracted to Score(c,d) == c·d·d below any
 *                             floor, ZERO under it. Every invariant here is
 *                             shape-independent: what is checked is that the
 *                             cached score is a pure function of the stored
 *                             (c, d), that the floor is applied per path, and
 *                             that the running total is maintained as a delta
 *   registry liveness       — MembersRegistry / ClauseRegistry /
 *                             AssemblyRegistry stakes are assumed LIVE; the
 *                             one gate whose failure has a permanent
 *                             consequence (the period race) is modeled
 *                             explicitly as AssumeAccrualGatesAligned
 *   intra-settleBatch ordering — _executePositions walks positions in
 *                             (token, user) order and can attempt a push
 *                             before the matching pull; that is a LIVENESS
 *                             hazard (audit L-6, batch reverts, nothing is
 *                             lost) and is abstracted to the net effect
 *   multi-currency          — single currency (the kernel forbids mixing)
 *   deadlines, gas, reentrancy — orthogonal
 *)

EXTENDS Integers, FiniteSets, TLC


\* ── Constants ────────────────────────────────────────────────
CONSTANTS
  Buyers,                    \* non-empty finite set of buyer addresses
  Sellers,                   \* non-empty finite set of seller addresses
  Artifacts,                 \* clause idHashes / assembly compositionHashes
  ExcludedArtifacts,         \* UsageCounter.excludedArtifact (deploy-frozen)
  InitialBalance,            \* starting token balance per participant
  MaxPayment,                \* 1..MaxPayment are valid payments
  MaxProcesses,              \* upper bound on process identities
  MaxSubOrders,              \* upper bound on sub-orders per process
  NumPeriods,                \* UsageCounter.periodEnd.length
  MinSellers,                \* UsageCounter.minSellers (support floor)
  AssumeDomainSeparation,    \* see header
  AssumeAccrualGatesAligned  \* see header


\* ── Derived ──────────────────────────────────────────────────
Participants  == Buyers \union Sellers
Payments      == 1 .. MaxPayment
Procs         == 1 .. MaxProcesses
OrdersPerProc == 1 + MaxSubOrders
Orders        == 1 .. ( MaxProcesses * OrdersPerProc )
Periods       == 0 .. ( NumPeriods - 1 )
ClosedPeriod  == NumPeriods
TotalSupply   == Cardinality(Participants) * InitialBalance

ASSUME Buyers # {} /\ Sellers # {}
ASSUME Artifacts # {} /\ ExcludedArtifacts \subseteq Artifacts
ASSUME InitialBalance > 0 /\ MaxPayment > 0
ASSUME MaxProcesses > 0 /\ MaxSubOrders >= 0
ASSUME NumPeriods > 0 /\ MinSellers > 0
ASSUME AssumeDomainSeparation \in BOOLEAN
ASSUME AssumeAccrualGatesAligned \in BOOLEAN

\* Order identities are laid out in per-process blocks. An order's identity is
\* a function of (process, position) plus its content — which is exactly what
\* keccak256(processId ++ structHash) is (FigaroCore.sol:202).
BlockOf(pid) == ( ( pid - 1 ) * OrdersPerProc + 1 ) .. ( pid * OrdersPerProc )
RootOrd(pid) == ( pid - 1 ) * OrdersPerProc + 1
MinOf(S) == CHOOSE x \in S: \A y \in S: x <= y

RECURSIVE SumFn(_,_)
SumFn(S, f) ==
  IF S = {}
  THEN 0
  ELSE LET x == CHOOSE y \in S: TRUE IN f[x] + SumFn(S \ { x }, f)


\* ── Sentinels ────────────────────────────────────────────────
NullProc == [ rootBuyer |-> "none", cumVal |-> 0, active |-> 0 ]
NullOrd  == [ pid |-> 0, buyer |-> "none", seller |-> "none", pay |-> 0, cum |-> 0 ]
ZeroAcc  == [ c |-> 0, d |-> 0, score |-> 0 ]
ZeroCnt  == [ c |-> 0, d |-> 0 ]

\* UsageCounter._score — ZERO below the minimum-support floor, a pure
\* function of the stored counts above it. See § "WHAT IS ABSTRACTED".
Score(c, d) == IF c = 0 \/ d < MinSellers THEN 0 ELSE c * d * d


\* ── Variables ────────────────────────────────────────────────
VARIABLES
  \* ── universe 1: FigaroCore (direct path) ──
  kStatus,      \* [Orders -> {"Unknown","Committed","Resolved"}] — orderStatus
  kProc,        \* [Procs -> ProcessState]
  kRec,         \* [Orders -> OrderRecord]  (calldata, kept for replay)
  coreBal,      \* tokens held by FigaroCore

  \* ── universe 2: the guest kernel under FigaroBatchVerifier's state root ──
  gStatus,      \* the guest's own order_status map — NOT kernel state
  gProc,
  gRec,
  verifBal,     \* tokens held by FigaroBatchVerifier

  \* ── the batch under assembly (net-position tracker + usage claims) ──
  batchOpen,    \* TRUE once a guest op has been added and not yet settled
  penNet,       \* [Participants -> Int] deposit - payout, the NET position
  penUse,       \* set of [art, ord] usage claims proved in this batch
  penPeriod,    \* the batch's usage_period (BatchUsageData.period)

  \* ── shared token ledger ──
  wallets,      \* [Participants -> Nat]

  \* ── UsageCounter state ──
  accrual,      \* [Artifacts -> [Periods -> Accrual]]  — accrualOf
  batchAcc,     \* [Artifacts -> [Periods -> Accrual]]  — batchAccrualOf
  counted,      \* [Artifacts -> SUBSET Procs]          — processCounted
  seen,         \* [Artifacts -> [Periods -> SUBSET Sellers]] — sellerSeen
  totalScore,   \* [Periods -> Int]                     — totalScoreIn
  period,       \* the OPEN period (ClosedPeriod == accrual closed forever)

  \* ── the guest's own usage bookkeeping (rides the state root) ──
  gUsage,       \* [Artifacts -> [Periods -> {c,d}]]  — usage_accrual
  gCounted,     \* [Artifacts -> SUBSET Procs]        — usage_process_counted
  gSeen,        \* [Artifacts -> [Periods -> SUBSET Sellers]] — usage_seller_seen

  \* ── ghosts (never read by any action; invariant witnesses only) ──
  kResolvedGhost,  \* orders the KERNEL resolved, recorded at ResolveProcess
  dropped          \* a BatchAccrualSkipped was emitted

vars ==
  << kStatus, kProc, kRec, coreBal,
     gStatus, gProc, gRec, verifBal,
     batchOpen, penNet, penUse, penPeriod,
     wallets,
     accrual, batchAcc, counted, seen, totalScore, period,
     gUsage, gCounted, gSeen,
     kResolvedGhost, dropped >>


\* ── Derived state ────────────────────────────────────────────
KActive(pid) == kProc[pid].rootBuyer # "none" /\ kProc[pid].active > 0
GActive(pid) == gProc[pid].rootBuyer # "none" /\ gProc[pid].active > 0

KOpenOrds(pid) == { o \in BlockOf(pid): kStatus[o] = "Committed" }
GOpenOrds(pid) == { o \in BlockOf(pid): gStatus[o] = "Committed" }

\* Total tokens an order releases at resolution: sellerPayout + buyerPayout
\* = (2·cumulativeValue + payment) + payment. Equal to what commit deposited
\* (2·payment + 2·cumulativeValue) — per-order conservation.
KRelease == [o \in Orders |-> 2 * kRec[o].cum + 2 * kRec[o].pay]
GRelease == [o \in Orders |-> 2 * gRec[o].cum + 2 * gRec[o].pay]

KernelOutstanding ==
  SumFn(Orders, [o \in Orders |-> IF kStatus[o] = "Committed" THEN KRelease[o] ELSE 0])
GuestOutstanding ==
  SumFn(Orders, [o \in Orders |-> IF gStatus[o] = "Committed" THEN GRelease[o] ELSE 0])


\* ── Identity coupling across the universes ───────────────────
\* Under AssumeDomainSeparation the two universes cannot share an order
\* identity at all (different EIP-712 domain ⇒ different processId ⇒ different
\* orderHash). With the assumption removed, an IDENTICAL commitment struct
\* yields the IDENTICAL identity in both — which is exactly the shape of a
\* double settlement. A DIFFERENT struct still yields a different identity, so
\* the coupling is admitted only when the records match.
KMayTake(o, rec) ==
  IF AssumeDomainSeparation
  THEN gStatus[o] = "Unknown"
  ELSE ( gStatus[o] # "Unknown" => gRec[o] = rec )

GMayTake(o, rec) ==
  IF AssumeDomainSeparation
  THEN kStatus[o] = "Unknown"
  ELSE ( kStatus[o] # "Unknown" => kRec[o] = rec )


\* ── Initial state ────────────────────────────────────────────
Init ==
  /\ kStatus = [o \in Orders |-> "Unknown"]
  /\ kProc = [p \in Procs |-> NullProc]
  /\ kRec = [o \in Orders |-> NullOrd]
  /\ coreBal = 0
  /\ gStatus = [o \in Orders |-> "Unknown"]
  /\ gProc = [p \in Procs |-> NullProc]
  /\ gRec = [o \in Orders |-> NullOrd]
  /\ verifBal = 0
  /\ batchOpen = FALSE
  /\ penNet = [p \in Participants |-> 0]
  /\ penUse = {}
  /\ penPeriod = 0
  /\ wallets = [p \in Participants |-> InitialBalance]
  /\ accrual = [a \in Artifacts |-> [q \in Periods |-> ZeroAcc]]
  /\ batchAcc = [a \in Artifacts |-> [q \in Periods |-> ZeroAcc]]
  /\ counted = [a \in Artifacts |-> {}]
  /\ seen = [a \in Artifacts |-> [q \in Periods |-> {}]]
  /\ totalScore = [q \in Periods |-> 0]
  /\ period = 0
  /\ gUsage = [a \in Artifacts |-> [q \in Periods |-> ZeroCnt]]
  /\ gCounted = [a \in Artifacts |-> {}]
  /\ gSeen = [a \in Artifacts |-> [q \in Periods |-> {}]]
  /\ kResolvedGhost = {}
  /\ dropped = FALSE


\* ══════════════════════════════════════════════════════════════
\* UNIVERSE 1 — FigaroCore, the direct path
\* ══════════════════════════════════════════════════════════════

\* FigaroCore.commit() with c.processId == bytes32(0).
\* Bonds pull SYNCHRONOUSLY (_pullExact), so the balance guard is here.
KCommitRoot(pid, b, s, pay) ==
  LET o    == RootOrd(pid)
      rec  == [pid |-> pid, buyer |-> b, seller |-> s, pay |-> pay, cum |-> pay]
      bBond == pay * 2
      sBond == pay * 2
  IN /\ kProc[pid] = NullProc
     /\ kStatus[o] = "Unknown"
     /\ KMayTake(o, rec)
     /\ \A p \in Participants:
          wallets[p] >= ( IF p = b THEN bBond ELSE 0 ) + ( IF p = s THEN sBond ELSE 0 )
     /\ kProc' = [kProc EXCEPT ![pid] =
                    [rootBuyer |-> b, cumVal |-> pay, active |-> 1]]
     /\ kStatus' = [kStatus EXCEPT ![o] = "Committed"]
     /\ kRec' = [kRec EXCEPT ![o] = rec]
     /\ coreBal' = coreBal + bBond + sBond
     /\ wallets' = [p \in Participants |->
                      wallets[p] - ( IF p = b THEN bBond ELSE 0 )
                                 - ( IF p = s THEN sBond ELSE 0 )]
     /\ UNCHANGED << gStatus, gProc, gRec, verifBal,
                     batchOpen, penNet, penUse, penPeriod,
                     accrual, batchAcc, counted, seen, totalScore, period,
                     gUsage, gCounted, gSeen, kResolvedGhost, dropped >>

\* FigaroCore.commit() with c.processId != bytes32(0).
\* Seller bonds 2× the NEW cumulative value (cumulative upstream bonding).
KCommitSub(pid, s, pay) ==
  LET free == { x \in BlockOf(pid): kStatus[x] = "Unknown" }
  IN /\ KActive(pid)
     /\ free # {}
     /\ LET o    == MinOf(free)
            b    == kProc[pid].rootBuyer
            cum  == kProc[pid].cumVal + pay
            rec  == [pid |-> pid, buyer |-> b, seller |-> s, pay |-> pay, cum |-> cum]
            bBond == pay * 2
            sBond == cum * 2
        IN /\ KMayTake(o, rec)
           /\ \A p \in Participants:
                wallets[p] >= ( IF p = b THEN bBond ELSE 0 ) + ( IF p = s THEN sBond ELSE 0 )
           /\ kProc' = [kProc EXCEPT ![pid] =
                          [@ EXCEPT !.cumVal = cum, !.active = @ + 1]]
           /\ kStatus' = [kStatus EXCEPT ![o] = "Committed"]
           /\ kRec' = [kRec EXCEPT ![o] = rec]
           /\ coreBal' = coreBal + bBond + sBond
           /\ wallets' = [p \in Participants |->
                            wallets[p] - ( IF p = b THEN bBond ELSE 0 )
                                       - ( IF p = s THEN sBond ELSE 0 )]
     /\ UNCHANGED << gStatus, gProc, gRec, verifBal,
                     batchOpen, penNet, penUse, penPeriod,
                     accrual, batchAcc, counted, seen, totalScore, period,
                     gUsage, gCounted, gSeen, kResolvedGhost, dropped >>

\* FigaroCore.resolveProcess() — buyer dominance, ATOMIC over every active
\* order of the process. Flips kernel orderStatus 1 → 2. Touches NOTHING in
\* the batch universe; kResolvedGhost witnesses that.
KResolve(pid) ==
  LET ro == KOpenOrds(pid)
      out == SumFn(ro, KRelease)
  IN /\ KActive(pid)
     /\ coreBal' = coreBal - out
     /\ wallets' = [p \in Participants |->
                      wallets[p] +
                      SumFn(ro, [o \in Orders |->
                          ( IF kRec[o].seller = p THEN 2 * kRec[o].cum + kRec[o].pay ELSE 0 )
                        + ( IF kRec[o].buyer  = p THEN kRec[o].pay ELSE 0 )])]
     /\ kStatus' = [o \in Orders |-> IF o \in ro THEN "Resolved" ELSE kStatus[o]]
     /\ kProc' = [kProc EXCEPT ![pid] = [@ EXCEPT !.active = 0]]
     /\ kResolvedGhost' = kResolvedGhost \union ro
     /\ UNCHANGED << kRec, gStatus, gProc, gRec, verifBal,
                     batchOpen, penNet, penUse, penPeriod,
                     accrual, batchAcc, counted, seen, totalScore, period,
                     gUsage, gCounted, gSeen, dropped >>


\* ══════════════════════════════════════════════════════════════
\* UNIVERSE 2 — the guest kernel + FigaroBatchVerifier
\* ══════════════════════════════════════════════════════════════
\* Guest ops move NO tokens. They accumulate into the net-position tracker
\* (prover/lib/src/kernel.rs TokenTracker); settleBatch reconciles the net.

GCommitRoot(pid, b, s, pay) ==
  LET o    == RootOrd(pid)
      rec  == [pid |-> pid, buyer |-> b, seller |-> s, pay |-> pay, cum |-> pay]
      bBond == pay * 2
      sBond == pay * 2
  IN /\ gProc[pid] = NullProc
     /\ gStatus[o] = "Unknown"
     /\ GMayTake(o, rec)
     /\ gProc' = [gProc EXCEPT ![pid] =
                    [rootBuyer |-> b, cumVal |-> pay, active |-> 1]]
     /\ gStatus' = [gStatus EXCEPT ![o] = "Committed"]
     /\ gRec' = [gRec EXCEPT ![o] = rec]
     /\ penNet' = [p \in Participants |->
                     penNet[p] + ( IF p = b THEN bBond ELSE 0 )
                               + ( IF p = s THEN sBond ELSE 0 )]
     /\ batchOpen' = TRUE
     /\ UNCHANGED << kStatus, kProc, kRec, coreBal, verifBal,
                     penUse, penPeriod, wallets,
                     accrual, batchAcc, counted, seen, totalScore, period,
                     gUsage, gCounted, gSeen, kResolvedGhost, dropped >>

GCommitSub(pid, s, pay) ==
  LET free == { x \in BlockOf(pid): gStatus[x] = "Unknown" }
  IN /\ GActive(pid)
     /\ free # {}
     /\ LET o    == MinOf(free)
            b    == gProc[pid].rootBuyer
            cum  == gProc[pid].cumVal + pay
            rec  == [pid |-> pid, buyer |-> b, seller |-> s, pay |-> pay, cum |-> cum]
            bBond == pay * 2
            sBond == cum * 2
        IN /\ GMayTake(o, rec)
           /\ gProc' = [gProc EXCEPT ![pid] =
                          [@ EXCEPT !.cumVal = cum, !.active = @ + 1]]
           /\ gStatus' = [gStatus EXCEPT ![o] = "Committed"]
           /\ gRec' = [gRec EXCEPT ![o] = rec]
           /\ penNet' = [p \in Participants |->
                           penNet[p] + ( IF p = b THEN bBond ELSE 0 )
                                     + ( IF p = s THEN sBond ELSE 0 )]
     /\ batchOpen' = TRUE
     /\ UNCHANGED << kStatus, kProc, kRec, coreBal, verifBal,
                     penUse, penPeriod, wallets,
                     accrual, batchAcc, counted, seen, totalScore, period,
                     gUsage, gCounted, gSeen, kResolvedGhost, dropped >>

GResolve(pid) ==
  LET ro == GOpenOrds(pid)
  IN /\ GActive(pid)
     /\ gStatus' = [o \in Orders |-> IF o \in ro THEN "Resolved" ELSE gStatus[o]]
     /\ gProc' = [gProc EXCEPT ![pid] = [@ EXCEPT !.active = 0]]
     /\ penNet' = [p \in Participants |->
                     penNet[p] -
                     SumFn(ro, [o \in Orders |->
                         ( IF gRec[o].seller = p THEN 2 * gRec[o].cum + gRec[o].pay ELSE 0 )
                       + ( IF gRec[o].buyer  = p THEN gRec[o].pay ELSE 0 )])]
     /\ batchOpen' = TRUE
     /\ UNCHANGED << kStatus, kProc, kRec, coreBal, gRec, verifBal,
                     penUse, penPeriod, wallets,
                     accrual, batchAcc, counted, seen, totalScore, period,
                     gUsage, gCounted, gSeen, kResolvedGhost, dropped >>

\* One in-proof usage claim (prover/lib/src/kernel.rs apply_usage_claim): the
\* guest proves a SETTLED (in ITS universe) process used an artifact. The
\* whole batch carries ONE usage_period; a claim can only join a batch whose
\* period is still the one now open.
GClaimUsage(a, o) ==
  /\ period < ClosedPeriod
  /\ gStatus[o] = "Resolved"
  /\ gRec[o].pid \notin gCounted[a]
  /\ \A e \in penUse: ~( e.art = a /\ gRec[e.ord].pid = gRec[o].pid )
  /\ ( penUse # {} => penPeriod = period )
  /\ penUse' = penUse \union { [art |-> a, ord |-> o] }
  /\ penPeriod' = period
  /\ batchOpen' = TRUE
  /\ UNCHANGED << kStatus, kProc, kRec, coreBal, gStatus, gProc, gRec, verifBal,
                  penNet, wallets,
                  accrual, batchAcc, counted, seen, totalScore, period,
                  gUsage, gCounted, gSeen, kResolvedGhost, dropped >>

\* FigaroBatchVerifier.settleBatch(). Steps modeled, in the contract's order:
\*   5. _executePositions  — net pull/push per (token, user)
\*   7. usageCounter.applyBatchAccrual, wrapped in try/catch
\*   8. advance state
\* Step 7's failure NEVER unwinds step 5 (DESIGN_DECISIONS.md §20).
SettleBatch ==
  LET netSum  == SumFn(Participants, penNet)
      pp      == penPeriod
      \* the guest's own counting — happens regardless of the chain's gates
      adm     == [a \in Artifacts |->
                    { e \in penUse: e.art = a /\ gRec[e.ord].pid \notin gCounted[a] }]
      newP    == [a \in Artifacts |-> { gRec[e.ord].pid    : e \in adm[a] }]
      newS    == [a \in Artifacts |-> { gRec[e.ord].seller : e \in adm[a] }]
      nc      == [a \in Artifacts |-> gUsage[a][pp].c + Cardinality(newP[a])]
      nd      == [a \in Artifacts |-> gUsage[a][pp].d
                                      + Cardinality(newS[a] \ gSeen[a][pp])]
      inBatch == { e.art : e \in penUse }
      \* the chain's own gates: open period + accrual still open
      gateOK  == ( pp = period /\ period < ClosedPeriod )
      writeSet == IF gateOK THEN inBatch \ ExcludedArtifacts ELSE {}
      delta   == SumFn(writeSet,
                   [a \in Artifacts |-> Score(nc[a], nd[a]) - batchAcc[a][pp].score])
  IN /\ batchOpen
     \* _pullExact: every net debtor must be able to pay (audit L-6 — a
     \* shortfall reverts the WHOLE batch; nothing is lost, the batch is
     \* re-assembled off chain).
     /\ \A p \in Participants: wallets[p] - penNet[p] >= 0
     /\ verifBal + netSum >= 0
     \* AccrualWentBackwards (UsageCounter.sol:582) — cumulative, never a delta
     /\ \A a \in writeSet: nc[a] >= batchAcc[a][pp].c /\ nd[a] >= batchAcc[a][pp].d
     /\ wallets' = [p \in Participants |-> wallets[p] - penNet[p]]
     /\ verifBal' = verifBal + netSum
     \* guest bookkeeping advances under the state root — chain gates or not
     /\ gCounted' = [a \in Artifacts |-> gCounted[a] \union newP[a]]
     /\ gSeen' = [a \in Artifacts |->
                    [q \in Periods |-> IF q = pp THEN gSeen[a][q] \union newS[a]
                                                 ELSE gSeen[a][q]]]
     /\ gUsage' = [a \in Artifacts |->
                     [q \in Periods |-> IF q = pp THEN [c |-> nc[a], d |-> nd[a]]
                                                  ELSE gUsage[a][q]]]
     \* the bridge write: REPLACE with the proven cumulative, never add
     /\ batchAcc' = [a \in Artifacts |->
                       [q \in Periods |->
                          IF q = pp /\ a \in writeSet
                          THEN [c |-> nc[a], d |-> nd[a], score |-> Score(nc[a], nd[a])]
                          ELSE batchAcc[a][q]]]
     /\ totalScore' = [q \in Periods |->
                         IF q = pp THEN totalScore[q] + delta ELSE totalScore[q]]
     \* Parenthesised deliberately: `=` binds tighter than `\/` in TLA+, so
     \* dropping the parens silently turns this into a DISJUNCTION that leaves
     \* dropped' unassigned whenever the batch is skipped.
     /\ dropped' = ( dropped \/ ( penUse # {} /\ ~gateOK ) )
     /\ batchOpen' = FALSE
     /\ penNet' = [p \in Participants |-> 0]
     /\ penUse' = {}
     /\ UNCHANGED << kStatus, kProc, kRec, coreBal,
                     gStatus, gProc, gRec, penPeriod,
                     accrual, counted, seen, period, kResolvedGhost >>


\* ══════════════════════════════════════════════════════════════
\* UsageCounter — direct path
\* ══════════════════════════════════════════════════════════════
\* UsageCounter.recordClauseUsage: permissionless, but gated on
\* core.orderStatus(orderHash) == 2. A batch-settled order can NEVER satisfy
\* this — that is the crease, and it is why the bridge exists.
RecordUsage(a, o) ==
  /\ period < ClosedPeriod
  /\ a \notin ExcludedArtifacts               \* reverts ArtifactExcluded
  /\ kStatus[o] = "Resolved"                  \* reverts OrderNotResolved
  /\ kRec[o].pid \notin counted[a]            \* reverts AlreadyCounted
  /\ LET s     == kRec[o].seller
         first == s \notin seen[a][period]
         c1    == accrual[a][period].c + 1
         d1    == accrual[a][period].d + ( IF first THEN 1 ELSE 0 )
         sc    == Score(c1, d1)
     IN /\ counted' = [counted EXCEPT ![a] = @ \union { kRec[o].pid }]
        /\ seen' = [seen EXCEPT ![a] =
                      [@ EXCEPT ![period] = @ \union { s }]]
        /\ accrual' = [accrual EXCEPT ![a] =
                         [@ EXCEPT ![period] = [c |-> c1, d |-> d1, score |-> sc]]]
        /\ totalScore' = [totalScore EXCEPT ![period] =
                            @ + sc - accrual[a][period].score]
  /\ UNCHANGED << kStatus, kProc, kRec, coreBal,
                  gStatus, gProc, gRec, verifBal,
                  batchOpen, penNet, penUse, penPeriod, wallets,
                  batchAcc, period, gUsage, gCounted, gSeen,
                  kResolvedGhost, dropped >>


\* ══════════════════════════════════════════════════════════════
\* Time — UsageCounter.currentPeriod()
\* ══════════════════════════════════════════════════════════════
\* AssumeAccrualGatesAligned is exactly the constraint that no boundary is
\* crossed while a batch is in flight (prover/sequencer/src/assembler.rs: "a
\* batch assembled just before a period boundary and settled just after it
\* must be re-proven for the new period").
AdvancePeriod ==
  /\ period < ClosedPeriod
  /\ ( AssumeAccrualGatesAligned => ~batchOpen )
  /\ period' = period + 1
  /\ UNCHANGED << kStatus, kProc, kRec, coreBal,
                  gStatus, gProc, gRec, verifBal,
                  batchOpen, penNet, penUse, penPeriod, wallets,
                  accrual, batchAcc, counted, seen, totalScore,
                  gUsage, gCounted, gSeen, kResolvedGhost, dropped >>


\* ── Next-state relation ──────────────────────────────────────
Next ==
  \/ \E pid \in Procs, b \in Buyers, s \in Sellers, pay \in Payments:
       KCommitRoot(pid, b, s, pay)
  \/ \E pid \in Procs, s \in Sellers, pay \in Payments: KCommitSub(pid, s, pay)
  \/ \E pid \in Procs: KResolve(pid)
  \/ \E pid \in Procs, b \in Buyers, s \in Sellers, pay \in Payments:
       GCommitRoot(pid, b, s, pay)
  \/ \E pid \in Procs, s \in Sellers, pay \in Payments: GCommitSub(pid, s, pay)
  \/ \E pid \in Procs: GResolve(pid)
  \/ \E a \in Artifacts, o \in Orders: GClaimUsage(a, o)
  \/ SettleBatch
  \/ \E a \in Artifacts, o \in Orders: RecordUsage(a, o)
  \/ AdvancePeriod

Spec == Init /\ [][Next]_vars


\* ══════════════════════════════════════════════════════════════
\* SAFETY INVARIANTS
\* ══════════════════════════════════════════════════════════════

TypeOK ==
  /\ \A o \in Orders: kStatus[o] \in { "Unknown", "Committed", "Resolved" }
  /\ \A o \in Orders: gStatus[o] \in { "Unknown", "Committed", "Resolved" }
  /\ coreBal \in Nat
  /\ verifBal \in Nat
  /\ \A p \in Participants: wallets[p] \in Nat
  /\ period \in 0 .. ClosedPeriod
  /\ penPeriod \in Periods
  /\ \A q \in Periods: totalScore[q] \in Nat
  /\ \A a \in Artifacts, q \in Periods:
       /\ accrual[a][q].c \in Nat /\ accrual[a][q].d \in Nat
       /\ batchAcc[a][q].c \in Nat /\ batchAcc[a][q].d \in Nat
       /\ gUsage[a][q].c \in Nat /\ gUsage[a][q].d \in Nat


\* ── 1. No value is paid out twice across the two universes ───
\* CARRIED BY: AssumeDomainSeparation.
\* The economic form: an order identity is settled by at most one universe, so
\* the buyer's payment leg is released exactly once.
NoDoublePayout ==
  \A o \in Orders: ~( kStatus[o] = "Resolved" /\ gStatus[o] = "Resolved" )

\* The stronger structural form — the identity is never even BONDED twice.
UniverseDisjointOrders ==
  \A o \in Orders: ~( kStatus[o] # "Unknown" /\ gStatus[o] # "Unknown" )


\* ── 2. Token conservation across the composed system ─────────
\* Wallets + FigaroCore + FigaroBatchVerifier = initial supply, under every
\* interleaving. Neither contract can create or destroy tokens, and neither
\* can reach into the other's pool.
TokenConservation ==
  SumFn(Participants, wallets) + coreBal + verifBal = TotalSupply

CoreSolvency     == coreBal >= 0
VerifierSolvency == verifBal >= 0
WalletNonNegative == \A p \in Participants: wallets[p] >= 0

\* Each pool holds EXACTLY its own universe's open obligations — the sharper
\* statement of "the pools are disjoint". For the verifier this can only be
\* asserted between batches; mid-assembly the deposits have not landed yet.
CoreExactEscrow == coreBal = KernelOutstanding
VerifierExactEscrow == ~batchOpen => verifBal = GuestOutstanding

\* Both pools can always pay out everything they owe (the composed form of
\* FigaroCore.tla's ResolutionAlwaysPossible).
ResolutionAlwaysPossible ==
  /\ \A pid \in Procs: KActive(pid) => coreBal >= SumFn(KOpenOrds(pid), KRelease)
  /\ ~batchOpen => ( \A pid \in Procs:
                       GActive(pid) => verifBal >= SumFn(GOpenOrds(pid), GRelease) )


\* ── 3. Usage-score composition ───────────────────────────────
\* scoreOf(artifact, period) == accrualOf.score + batchAccrualOf.score
\* (UsageCounter.sol:399-401), with each side's cached score a pure function
\* of ITS OWN stored counts — the two are summed as SCORES, never as
\* components (UsageCounter.sol:202-213).
ScoreOf(a, q) == accrual[a][q].score + batchAcc[a][q].score

ScoreCacheCorrect ==
  \A a \in Artifacts, q \in Periods:
    /\ accrual[a][q].score = Score(accrual[a][q].c, accrual[a][q].d)
    /\ batchAcc[a][q].score = Score(batchAcc[a][q].c, batchAcc[a][q].d)

ScoreComposition ==
  \A a \in Artifacts, q \in Periods:
    ScoreOf(a, q) = Score(accrual[a][q].c, accrual[a][q].d)
                  + Score(batchAcc[a][q].c, batchAcc[a][q].d)

\* totalScoreIn is maintained as an O(1) DELTA on every write; this is the
\* only thing that proves the delta bookkeeping never drifts from the sum.
TotalScoreIntegrity ==
  \A q \in Periods:
    totalScore[q] = SumFn(Artifacts, [a \in Artifacts |-> ScoreOf(a, q)])

\* The bridge write REPLACES the cumulative pair, never adds to it: the
\* on-chain batch counts can never exceed what the guest actually proved.
\* (An ADD would make them race past the guest's cumulative.)
BatchWriteReplacesNeverAdds ==
  \A a \in Artifacts, q \in Periods:
    /\ batchAcc[a][q].c <= gUsage[a][q].c
    /\ batchAcc[a][q].d <= gUsage[a][q].d

\* The minimum-support floor is applied PER PATH, never to a union of the two
\* seller sets (UsageCounter.sol:165-174).
FloorAppliedPerPath ==
  \A a \in Artifacts, q \in Periods:
    /\ accrual[a][q].d < MinSellers => accrual[a][q].score = 0
    /\ batchAcc[a][q].d < MinSellers => batchAcc[a][q].score = 0

ExcludedNeverScores ==
  \A a \in ExcludedArtifacts, q \in Periods:
    accrual[a][q].c = 0 /\ batchAcc[a][q].c = 0 /\ ScoreOf(a, q) = 0


\* ── 4. Kernel blindness is faithful ──────────────────────────
\* Batch settlement changes NO kernel orderStatus. kResolvedGhost is written
\* only by KResolve, so equality with the kernel's own RESOLVED set is exactly
\* the claim "nothing but resolveProcess ever flipped a kernel status".
KernelBlindToBatch ==
  kResolvedGhost = { o \in Orders: kStatus[o] = "Resolved" }

\* The mechanical consequence the crease memo leads with: anything gated on
\* orderStatus cannot see batched trade — not late, at all.
\* CARRIED BY: AssumeDomainSeparation.
BatchInvisibleToKernelGates ==
  \A o \in Orders: gStatus[o] = "Resolved" => kStatus[o] # "Resolved"


\* ── 5. RPGF: a process is counted in exactly one universe ────
\* CARRIED BY: AssumeDomainSeparation. This is the assumption UsageCounter
\* names in prose (sol:210-213) to justify summing scores from two counters
\* that cannot union their seller sets, and the one that makes guest-owned
\* idempotence sound (the guest never consults processCounted).
ProcessCountedInOneUniverse ==
  \A a \in Artifacts: counted[a] \intersect gCounted[a] = {}


\* ── 6. The accrual bridge under a period race ────────────────
\* The same predicate as BatchWriteReplacesNeverAdds, under its economic name:
\* the bridge can never credit more than the guest actually proved. Holds
\* UNCONDITIONALLY — neither assumption carries it. (Listed once in the .cfg.)
AccrualNeverOverPays == BatchWriteReplacesNeverAdds

\* CARRIED BY: AssumeAccrualGatesAligned. Stated UNCONDITIONALLY on purpose —
\* a `Assume... => ...` phrasing would go vacuously true the moment the
\* assumption is switched off, which is exactly the run that has to fail.
\*
\* With the assumption removed the period can advance while a batch is in
\* flight; applyBatchAccrual reverts PeriodMismatch, settleBatch catches it and
\* settles the tokens anyway, and the guest's GLOBAL counted set has already
\* absorbed those processes (kernel.rs:714, once ever, whatever the period).
\* So the accrual is not "recovered by the next batch" for those processes —
\* it is permanently forgone.
AccrualNotLost ==
  \A a \in Artifacts \ ExcludedArtifacts, q \in Periods:
    /\ batchAcc[a][q].c = gUsage[a][q].c
    /\ batchAcc[a][q].d = gUsage[a][q].d

\* No BatchAccrualSkipped was ever emitted. CARRIED BY:
\* AssumeAccrualGatesAligned.
NoAccrualDrop == dropped = FALSE

====

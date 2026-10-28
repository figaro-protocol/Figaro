---- MODULE ResolutionUniverses ----

(*
 * Formal model of Figaro's COMPOSED resolution system — the cross-contract
 * temporal properties no per-contract harness (Foundry / Halmos / Certora,
 * all single-contract) can express.
 *
 * THE OBJECT UNDER TEST — three contracts and one off-chain guest:
 *
 *   FigaroCore            (src/core/kernel/FigaroCore.sol)
 *       commit()          → locks buyer 2×payment, seller 2×cumulativeValue
 *       resolveProcess()  → buyer-triggered, ATOMIC over a process's orders,
 *                           flips orderStatus 1 → 2
 *
 *   FigaroBatchVerifier   (src/core/verifier/FigaroBatchVerifier.sol)
 *       settleBatch()     → verifies an SP1 proof, reconciles NET token
 *                           positions per (token, user), re-emits attestations,
 *                           advances stateRoot, and hands the batch's uses to
 *                           the counter.
 *                           It writes NO FigaroCore state — a batch-resolved order
 *                           never acquires FigaroCore orderStatus, ever.
 *
 *   UsageCounter          (src/build/rewards/UsageCounter.sol)
 *       recordClauseUsage()  → direct path; requires core.orderStatus == 2
 *       applyBatchAccrual()  → batch path; proof-gated writer of USES, each
 *                              counted through the same _count, into the
 *                              same tally, counted set and seller set
 *       scoreOf()            → accrualOf.score — ONE tally, route-blind
 *
 *   the guest mirror       (prover/lib/src/kernel.rs) — a byte-faithful mirror
 *                          of FigaroCore's state machine that lives entirely
 *                          off-chain, under the verifier's state root.
 *
 * THE CREASE. FigaroCore and FigaroBatchVerifier share no state and never call
 * each other (docs/SCALING_STRATEGY.md § "Two resolution paths, two DISJOINT
 * state universes"). Exactly ONE thing crosses: the batch's uses, as
 * proved (kind, key, process, seller) entries. Money crosses as net token positions, which is resolution,
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
 *       DIFFERENT verifyingContract from FigaroCore's own EIP712 domain,
 *       FigaroCore.sol:107). A root order's processId IS the typed-data
 *       digest (FigaroCore.sol:170, kernel.rs derive_commitment_ids), so the
 *       two universes' processId spaces are disjoint by construction, and a
 *       sub-order is confined to the universe whose process exists (each side
 *       reverts UnknownProcess otherwise).
 *       WHAT IT CARRIES: NoDoublePayout, UniverseDisjointOrders,
 *       KernelBlindToBatch's usefulness, and ProcessCountedInOneUniverse
 *       (the RPGF face of the crease — the counter's one processCounted set
 *       counts a process id once, which is counting a process once only
 *       because no id names a process in both universes).
 *
 *   AssumeAccrualGatesAligned
 *       "No accrual-period boundary is crossed between the guest proving a
 *        batch's usage claims and that batch resolving on chain."
 *       STATUS: NOT contract-enforced. UsageCounter.applyBatchAccrual reverts
 *       PeriodMismatch when the sequencer's period is not the open one, and
 *       FigaroBatchVerifier catches that revert and resolves the tokens
 *       anyway (DESIGN_DECISIONS.md §19). The guest keeps no usage state, so
 *       the uncounted uses may be proved again in a later batch; until one
 *       is, they are uncounted.
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
 *                             (c, d), that the floor is applied to the one
 *                             tally, and that the running total is maintained
 *                             as a delta
 *   registry liveness       — MembersRegistry / ClauseRegistry /
 *                             AssemblyRegistry / AgreementRegistry stakes are
 *                             assumed LIVE; the
 *                             one gate whose failure has a permanent
 *                             consequence (the period race) is modeled
 *                             explicitly as AssumeAccrualGatesAligned
 *   intra-settleBatch ordering — _executePositions makes every pull
 *                             before any push, so the net effect below is
 *                             the contract's: a push fails only when the
 *                             verifier's holding plus the batch's net is
 *                             short
 *   multi-currency          — single currency (FigaroCore forbids mixing)
 *   deadlines, gas, reentrancy — orthogonal
 *)

EXTENDS Integers, FiniteSets, TLC


\* ── Constants ────────────────────────────────────────────────
CONSTANTS
  Buyers,                    \* non-empty finite set of buyer addresses
  Sellers,                   \* non-empty finite set of seller addresses
  Artifacts,                 \* (kind, key) pairs: clause keys / assembly assemblyHashes / agreementHashes
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
ASSUME Artifacts # {}
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

  \* ── universe 2: the guest mirror under FigaroBatchVerifier's state root ──
  gStatus,      \* the guest's own order_status map — NOT FigaroCore state
  gProc,
  gRec,
  verifBal,     \* tokens held by FigaroBatchVerifier

  \* ── the batch under assembly (net-position tracker + usage claims) ──
  batchOpen,    \* TRUE once a guest op has been added and not yet resolved
  penNet,       \* [Participants -> Int] deposit - payout, the NET position
  penUse,       \* set of [art, ord] usage claims proved in this batch
  penPeriod,    \* the batch's usage_period (BatchUsageData.period)

  \* ── shared token ledger ──
  wallets,      \* [Participants -> Nat]

  \* ── UsageCounter state — ONE tally, both routes ──
  accrual,      \* [Artifacts -> [Periods -> Accrual]]  — accrualOf
  counted,      \* [Artifacts -> SUBSET Procs]          — processCounted
  seen,         \* [Artifacts -> [Periods -> SUBSET Sellers]] — sellerSeen
  totalScore,   \* [Periods -> Int]                     — totalScoreIn
  period,       \* the OPEN period (ClosedPeriod == accrual closed forever)

  \* ── ghosts (never read by any action; invariant witnesses only) ──
  kResolvedGhost,  \* orders FigaroCore resolved, recorded at ResolveProcess
  gSettled,        \* [Artifacts -> SUBSET Procs] — processes whose use a
                   \* landed batch carried
  dropped          \* a BatchAccrualSkipped was emitted

vars ==
  << kStatus, kProc, kRec, coreBal,
     gStatus, gProc, gRec, verifBal,
     batchOpen, penNet, penUse, penPeriod,
     wallets,
     accrual, counted, seen, totalScore, period,
     kResolvedGhost, gSettled, dropped >>


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
\* double resolution. A DIFFERENT struct still yields a different identity, so
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
  /\ counted = [a \in Artifacts |-> {}]
  /\ seen = [a \in Artifacts |-> [q \in Periods |-> {}]]
  /\ totalScore = [q \in Periods |-> 0]
  /\ period = 0
  /\ kResolvedGhost = {}
  /\ gSettled = [a \in Artifacts |-> {}]
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
                     accrual, counted, seen, totalScore, period,
                     kResolvedGhost, gSettled, dropped >>

\* FigaroCore.commit() with c.processId != bytes32(0).
\* Seller bonds 2× the NEW cumulative value (cumulative bonding).
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
                     accrual, counted, seen, totalScore, period,
                     kResolvedGhost, gSettled, dropped >>

\* FigaroCore.resolveProcess() — buyer dominance, ATOMIC over every active
\* order of the process. Flips FigaroCore orderStatus 1 → 2. Touches NOTHING in
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
                     accrual, counted, seen, totalScore, period,
                     gSettled, dropped >>


\* ══════════════════════════════════════════════════════════════
\* UNIVERSE 2 — the guest mirror + FigaroBatchVerifier
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
                     accrual, counted, seen, totalScore, period,
                     kResolvedGhost, gSettled, dropped >>

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
                     accrual, counted, seen, totalScore, period,
                     kResolvedGhost, gSettled, dropped >>

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
                     accrual, counted, seen, totalScore, period,
                     kResolvedGhost, gSettled, dropped >>

\* One in-proof usage claim (prover/lib/src/kernel.rs apply_usage_claims):
\* the guest proves a RESOLVED (in ITS universe) process used an artifact and
\* gives one use per (artifact, process) in the batch. The guest keeps no
\* counted set: a process the counter has already counted may be claimed
\* again, and the counter skips it. The whole batch carries ONE usage_period;
\* a claim can only join a batch whose period is still the one now open.
GClaimUsage(a, o) ==
  /\ period < ClosedPeriod
  /\ gStatus[o] = "Resolved"
  /\ \A e \in penUse: ~( e.art = a /\ gRec[e.ord].pid = gRec[o].pid )
  /\ ( penUse # {} => penPeriod = period )
  /\ penUse' = penUse \union { [art |-> a, ord |-> o] }
  /\ penPeriod' = period
  /\ batchOpen' = TRUE
  /\ UNCHANGED << kStatus, kProc, kRec, coreBal, gStatus, gProc, gRec, verifBal,
                  penNet, wallets,
                  accrual, counted, seen, totalScore, period,
                  kResolvedGhost, gSettled, dropped >>

\* FigaroBatchVerifier.settleBatch(). Steps modeled, in the contract's order:
\*   5. _executePositions  — net pull/push per (token, user)
\*   7. usageCounter.applyBatchAccrual, wrapped in try/catch
\*   8. advance state
\* Step 7's failure NEVER unwinds step 5 (DESIGN_DECISIONS.md §19).
\* Step 7 counts each use exactly as RecordUsage counts a direct one: a
\* process already counted under the artifact is skipped, and a use that is
\* counted adds one to c and, when its seller is new to the period's set, one
\* to d. The batch's uses name distinct (artifact, process) pairs, so the
\* order the counter walks them in changes nothing.
SettleBatch ==
  LET netSum  == SumFn(Participants, penNet)
      pp      == penPeriod
      \* the chain's own gates for the call: open period + accrual still open
      gateOK  == ( pp = period /\ period < ClosedPeriod )
      \* the uses the counter counts — none when the call reverts
      cnt     == [a \in Artifacts |->
                    IF gateOK
                    THEN { e \in penUse: e.art = a /\ gRec[e.ord].pid \notin counted[a] }
                    ELSE {}]
      newP    == [a \in Artifacts |-> { gRec[e.ord].pid    : e \in cnt[a] }]
      newS    == [a \in Artifacts |-> { gRec[e.ord].seller : e \in cnt[a] }]
      nc      == [a \in Artifacts |-> accrual[a][pp].c + Cardinality(newP[a])]
      nd      == [a \in Artifacts |-> accrual[a][pp].d
                                      + Cardinality(newS[a] \ seen[a][pp])]
      delta   == SumFn(Artifacts,
                   [a \in Artifacts |-> Score(nc[a], nd[a]) - accrual[a][pp].score])
  IN /\ batchOpen
     \* _pullExact: every net debtor must be able to pay (audit L-6 — a
     \* shortfall reverts the WHOLE batch; nothing is lost, the batch is
     \* re-assembled off chain).
     /\ \A p \in Participants: wallets[p] - penNet[p] >= 0
     /\ verifBal + netSum >= 0
     /\ wallets' = [p \in Participants |-> wallets[p] - penNet[p]]
     /\ verifBal' = verifBal + netSum
     \* the counter's one tally, one counted set, one seller set
     /\ counted' = [a \in Artifacts |-> counted[a] \union newP[a]]
     /\ seen' = [a \in Artifacts |->
                   [q \in Periods |-> IF q = pp THEN seen[a][q] \union newS[a]
                                                ELSE seen[a][q]]]
     /\ accrual' = [a \in Artifacts |->
                      [q \in Periods |->
                         IF q = pp
                         THEN [c |-> nc[a], d |-> nd[a], score |-> Score(nc[a], nd[a])]
                         ELSE accrual[a][q]]]
     /\ totalScore' = [q \in Periods |->
                         IF q = pp THEN totalScore[q] + delta ELSE totalScore[q]]
     /\ gSettled' = [a \in Artifacts |->
                       gSettled[a] \union { gRec[e.ord].pid : e \in { x \in penUse: x.art = a } }]
     \* Parenthesised deliberately: `=` binds tighter than `\/` in TLA+, so
     \* dropping the parens silently turns this into a DISJUNCTION that leaves
     \* dropped' unassigned whenever the batch is skipped.
     /\ dropped' = ( dropped \/ ( penUse # {} /\ ~gateOK ) )
     /\ batchOpen' = FALSE
     /\ penNet' = [p \in Participants |-> 0]
     /\ penUse' = {}
     /\ UNCHANGED << kStatus, kProc, kRec, coreBal,
                     gStatus, gProc, gRec, penPeriod,
                     period, kResolvedGhost >>


\* ══════════════════════════════════════════════════════════════
\* UsageCounter — direct path
\* ══════════════════════════════════════════════════════════════
\* UsageCounter.recordClauseUsage: permissionless, but gated on
\* core.orderStatus(orderHash) == 2. A batch-resolved order can NEVER satisfy
\* this — that is the crease, and it is why the bridge exists.
RecordUsage(a, o) ==
  /\ period < ClosedPeriod
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
                  period, kResolvedGhost, gSettled, dropped >>


\* ══════════════════════════════════════════════════════════════
\* Time — UsageCounter.currentPeriod()
\* ══════════════════════════════════════════════════════════════
\* AssumeAccrualGatesAligned is exactly the constraint that no boundary is
\* crossed while a batch is in flight (prover/sequencer/src/assembler.rs: "a
\* batch assembled just before a period boundary and resolved just after it
\* must be re-proven for the new period").
AdvancePeriod ==
  /\ period < ClosedPeriod
  /\ ( AssumeAccrualGatesAligned => ~batchOpen )
  /\ period' = period + 1
  /\ UNCHANGED << kStatus, kProc, kRec, coreBal,
                  gStatus, gProc, gRec, verifBal,
                  batchOpen, penNet, penUse, penPeriod, wallets,
                  accrual, counted, seen, totalScore,
                  kResolvedGhost, gSettled, dropped >>


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


\* ── 1. No value is paid out twice across the two universes ───
\* CARRIED BY: AssumeDomainSeparation.
\* The economic form: an order identity is resolved by at most one universe, so
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


\* ── 3. One tally, route-blind ──────────────────────────────────
\* scoreOf(artifact, period) == accrualOf.score: the one tally both routes
\* feed, its cached score a pure function of its stored counts.
ScoreOf(a, q) == accrual[a][q].score

ScoreCacheCorrect ==
  \A a \in Artifacts, q \in Periods:
    accrual[a][q].score = Score(accrual[a][q].c, accrual[a][q].d)

\* totalScoreIn is maintained as an O(1) DELTA on every write; this is the
\* only thing that proves the delta bookkeeping never drifts from the sum.
TotalScoreIntegrity ==
  \A q \in Periods:
    totalScore[q] = SumFn(Artifacts, [a \in Artifacts |-> ScoreOf(a, q)])

\* c counts each process ONCE, whichever route brought it: the periods' c
\* add up to exactly the counter's one counted-process set.
CountIsDistinctProcesses ==
  \A a \in Artifacts:
    SumFn(Periods, [q \in Periods |-> accrual[a][q].c]) = Cardinality(counted[a])

\* d counts each seller ONCE per period, whichever route carried them: it is
\* exactly the size of the period's one seller set.
SellersCountedOnce ==
  \A a \in Artifacts, q \in Periods: accrual[a][q].d = Cardinality(seen[a][q])

\* The minimum-support floor is applied to the one tally.
FloorApplied ==
  \A a \in Artifacts, q \in Periods:
    accrual[a][q].d < MinSellers => accrual[a][q].score = 0

\* ── 4. FigaroCore blindness is faithful ──────────────────────────
\* Batch resolution changes NO FigaroCore orderStatus. kResolvedGhost is written
\* only by KResolve, so equality with FigaroCore's own RESOLVED set is exactly
\* the claim "nothing but resolveProcess ever flipped a FigaroCore status".
KernelBlindToBatch ==
  kResolvedGhost = { o \in Orders: kStatus[o] = "Resolved" }

\* The mechanical consequence the crease memo leads with: anything gated on
\* orderStatus cannot see batched trade — not late, at all.
\* CARRIED BY: AssumeDomainSeparation.
BatchInvisibleToKernelGates ==
  \A o \in Orders: gStatus[o] = "Resolved" => kStatus[o] # "Resolved"


\* ── 5. RPGF: a process is counted in exactly one universe ────
\* CARRIED BY: AssumeDomainSeparation. The counter keeps one counted set for
\* both routes and counts a process id once; that counts a PROCESS once only
\* because no counted id names a process in both universes.
ProcessCountedInOneUniverse ==
  \A a \in Artifacts: \A p \in counted[a]:
    ~( ( \E o \in BlockOf(p): kStatus[o] # "Unknown" )
       /\ ( \E o \in BlockOf(p): gStatus[o] # "Unknown" ) )


\* ── 6. The uses under a period race ──────────────────────────
\* The counter counts only resolved trade: every counted process was resolved
\* in one of the universes. Holds UNCONDITIONALLY — neither assumption
\* carries it.
ResolvedPids ==
  { kRec[o].pid : o \in { x \in Orders: kStatus[x] = "Resolved" } }
  \union { gRec[o].pid : o \in { x \in Orders: gStatus[x] = "Resolved" } }

AccrualNeverOverPays ==
  \A a \in Artifacts: counted[a] \subseteq ResolvedPids

\* CARRIED BY: AssumeAccrualGatesAligned. Stated UNCONDITIONALLY on purpose —
\* a `Assume... => ...` phrasing would go vacuously true the moment the
\* assumption is switched off, which is exactly the run that has to fail.
\*
\* With the assumption removed the period can advance while a batch is in
\* flight; applyBatchAccrual reverts PeriodMismatch, settleBatch catches it
\* and resolves the tokens anyway, and the batch's uses go uncounted until a
\* later batch proves them again.
AccrualNotLost ==
  \A a \in Artifacts: gSettled[a] \subseteq counted[a]

\* No BatchAccrualSkipped was ever emitted. CARRIED BY:
\* AssumeAccrualGatesAligned.
NoAccrualDrop == dropped = FALSE

====

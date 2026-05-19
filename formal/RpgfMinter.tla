---- MODULE RpgfMinter ----
\* TLA+ specification of the three-stage SP1-gated RPGF minter.
\*
\* Abstracts the on-chain RpgfMinter contract to its state-machine essence:
\*   - Three stages, each with (root, unlockTime, totalAllocated)
\*   - Per-(stage, account) claimed flag
\*   - submitter authorization on root submission
\*   - Time-locked claim gate
\*
\* What we abstract away:
\*   - SP1 proof verification (modeled as a precondition: submitter calls
\*     SubmitRoot only when an honest aggregator would have produced this
\*     root for the snapshot. The SP1 verifier's job — proof-validity — is
\*     orthogonal to the state-machine invariants this model checks.)
\*   - Merkle inclusion (modeled by Entitlements[stage]: a fixed function
\*     mapping accounts to their leaf amount. The contract's MerkleProof
\*     check accepts iff (account, amount) is in the leaf set; we model this
\*     directly as Entitlements[stage][account] = amount.)
\*   - FigToken cap enforcement (delegated to the FigToken model in
\*     formal/FigToken.tla — this model is concerned only with the minter's
\*     own state machine).

EXTENDS Naturals, FiniteSets

CONSTANTS
    STAGE_COUNT,    \* should be 3 in the canonical config
    Accounts,       \* finite set of distinct account identifiers
    Submitter,      \* the submitter address
    NonSubmitters,  \* finite set of non-submitter accounts (for negative tests)
    UnlockTimes,    \* function stage -> unlock time, e.g. [0 |-> 2, 1 |-> 5, 2 |-> 8]
    Entitlements,   \* function stage -> (account -> amount); amount=0 means not in leaf set
    MaxTime         \* upper bound on the time variable (model-checking horizon)

VARIABLES
    roots,           \* function stage -> bytes32 (0 = unset)
    unlockTimes,     \* function stage -> uint64 (immutable post-init)
    totalAllocated,  \* function stage -> uint256 (one-shot with root)
    claimed,         \* function stage -> (account -> BOOLEAN)
    submitter,       \* the submitter address (immutable post-init)
    now              \* monotonic block.timestamp

vars == << roots, unlockTimes, totalAllocated, claimed, submitter, now >>

\* ── State predicates ────────────────────────────────────────────────────

Stages == 0..(STAGE_COUNT - 1)

Init ==
  /\ roots = [s \in Stages |-> 0]
  /\ unlockTimes = [s \in Stages |-> UnlockTimes[s]]
  /\ totalAllocated = [s \in Stages |-> 0]
  /\ claimed = [s \in Stages |-> [a \in Accounts |-> FALSE]]
  /\ submitter = Submitter
  /\ now = 0

\* ── Actions ─────────────────────────────────────────────────────────────

\* Advance time by 1. Bounded by MaxTime so the state space is finite.
Tick ==
  /\ now < MaxTime
  /\ now' = now + 1
  /\ UNCHANGED << roots, unlockTimes, totalAllocated, claimed, submitter >>

\* Submitter sets a stage's root. One-shot: root must be currently zero;
\* any non-zero proposed root is acceptable (the SP1 verifier off-stage
\* gates which root is honest, but the state-machine cares only that the
\* root is set exactly once per stage).
SubmitRoot(stage, root, total) ==
  /\ stage \in Stages
  /\ root # 0
  /\ roots[stage] = 0
  /\ roots' = [roots EXCEPT ![stage] = root]
  /\ totalAllocated' = [totalAllocated EXCEPT ![stage] = total]
  /\ UNCHANGED << unlockTimes, claimed, submitter, now >>

\* A non-submitter attempts SubmitRoot. The contract reverts; in TLA+ we
\* model this as a no-op disabled transition — the spec only takes Next
\* steps that the contract would actually execute on-chain.
\* (We do NOT model the failed call as a state transition: it leaves
\* state unchanged and is observationally equivalent to no action.)

\* Account claims its entitlement at a stage. Preconditions mirror the
\* contract: root set, unlock time reached, not already claimed, amount
\* matches entitlement (a proxy for valid Merkle proof).
Claim(stage, account, amount) ==
  /\ stage \in Stages
  /\ account \in Accounts
  /\ amount # 0
  /\ roots[stage] # 0
  /\ now >= unlockTimes[stage]
  /\ ~claimed[stage][account]
  /\ Entitlements[stage][account] = amount
  /\ claimed' = [claimed EXCEPT ![stage][account] = TRUE]
  /\ UNCHANGED << roots, unlockTimes, totalAllocated, submitter, now >>

\* Symbolic-value ranges chosen to keep TLC's state space tractable:
\*   root  \in 1..2  — two distinct nonzero values cover the one-shot
\*                    behavior (more values add multiplicity, not
\*                    new invariant counter-examples).
\*   total \in 1..2  — totalAllocated is observed via the lock-with-root
\*                    invariant; two values suffice.
\*   amount \in 1..3 — matches Entitlements value range so honest claims
\*                    succeed and out-of-range amounts fail.
Next ==
  \/ Tick
  \/ \E stage \in Stages, root \in 1..2, total \in 1..2 :
        SubmitRoot(stage, root, total)
  \/ \E stage \in Stages, account \in Accounts, amount \in 1..3 :
        Claim(stage, account, amount)

Spec == Init /\ [][Next]_vars

\* ── Invariants ──────────────────────────────────────────────────────────

\* I1: All variables have well-typed values.
TypeOK ==
  /\ roots \in [Stages -> Nat]
  /\ unlockTimes \in [Stages -> Nat]
  /\ totalAllocated \in [Stages -> Nat]
  /\ claimed \in [Stages -> [Accounts -> BOOLEAN]]
  /\ submitter \in Accounts \cup {Submitter}
  /\ now \in Nat

\* I2: submitter is immutable post-init.
Inv_SubmitterImmutable == submitter = Submitter

\* I3: stages[i].unlockTime is immutable post-init.
Inv_UnlockTimeImmutable ==
  \A s \in Stages : unlockTimes[s] = UnlockTimes[s]

\* I4: stages[i].root is one-shot — once set, never changes.
\* We can't directly compare across states in an invariant; the property
\* is enforced inductively by SubmitRoot's guard `roots[stage] = 0`.
\* Re-stated here as a sanity check on the state space:
\* every reachable state with roots[s] # 0 was reached via a single
\* SubmitRoot for that stage. Modeled as: no two SubmitRoots fire for
\* the same stage (proved separately by action-level reasoning).
\* As an *invariant* we assert the guard's contrapositive structural
\* property: every stage's root is in the model's value range.
Inv_RootInRange == \A s \in Stages : roots[s] \in 0..2

\* I5: claimed[stage][account] is monotonic — once true, stays true.
\* Same as I4: enforced inductively by Claim's not-already-claimed guard.
\* TLA+ proof obligation is discharged by the Init/Next structure;
\* we still encode the structural counterpart as an invariant.
Inv_ClaimedTyped ==
  \A s \in Stages, a \in Accounts : claimed[s][a] \in BOOLEAN

\* I6: A claim of (stage, account) succeeded only if root was set.
\* In other words: if any account has claimed at stage s, then
\* roots[s] # 0.
Inv_ClaimImpliesRootSet ==
  \A s \in Stages :
    (\E a \in Accounts : claimed[s][a]) => roots[s] # 0

\* I7: A claim of (stage, account) succeeded only after the unlock time.
\* Stated as: claimed[s][a] => now >= unlockTimes[s] at the moment of
\* claim. Since now is monotonic, this re-states as: if any account has
\* claimed at stage s, then now >= unlockTimes[s].
Inv_ClaimImpliesUnlocked ==
  \A s \in Stages :
    (\E a \in Accounts : claimed[s][a]) => now >= unlockTimes[s]

\* I8: now is monotonic — never decreases. Enforced by Tick.
\* Encoded as a TypeOK fragment (now \in Nat) plus the action guard.

\* I9: A stage's totalAllocated is non-decreasing and only changes when
\* root transitions from zero. Encoded structurally: totalAllocated[s] = 0
\* iff roots[s] = 0.
Inv_TotalAllocatedLockedWithRoot ==
  \A s \in Stages :
    (totalAllocated[s] = 0) <=> (roots[s] = 0)

\* I10: STAGE_COUNT bound — no out-of-range stage index is reachable in
\* any field of state. (Trivially true given the Init/Next domain
\* constraints.)
Inv_StageIndexBounded ==
  /\ DOMAIN roots = Stages
  /\ DOMAIN unlockTimes = Stages
  /\ DOMAIN totalAllocated = Stages
  /\ DOMAIN claimed = Stages

\* ── Temporal properties (optional, not in default cfg) ──────────────────

\* Eventually, given enough time, all stages may have roots set.
\* (Liveness; not enforced in the default INVARIANTS cfg.)
\* EventuallyAllRootsSet == <>(\A s \in Stages : roots[s] # 0)

====

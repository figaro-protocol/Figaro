---------------------------- MODULE RelayState ----------------------------
(***************************************************************************)
(* The relay's state lifecycle (prover/sequencer/src/state.rs, main.rs).   *)
(*                                                                         *)
(* FigaroBatchVerifier holds a root; the state behind it is off chain, and *)
(* a bond committed on the batch path is refunded only by a batch built on *)
(* that state. So whenever the verifier's root has moved past genesis,     *)
(* some relay must have the state behind it on disk: a relay can crash at  *)
(* any step, and a proof once sent is public, so ANYONE can settle a       *)
(* published batch while the verifier's root is that batch's previous      *)
(* root. That is `Recoverable`; the other invariants say every relay       *)
(* builds only on a root the verifier has held.                            *)
(*                                                                         *)
(* A state is modelled by its root: the root binds the state, and roots    *)
(* never repeat (each batch's root is fresh). A relay holds:               *)
(*   mirror   — the state in memory, lost on a crash                       *)
(*   kept     — the kept-state file (STATE_PATH); Genesis when absent      *)
(*   journal  — the next-state journal: the states batches it sent can     *)
(*              make the verifier's, each with the root it was built on    *)
(* and runs the batch loop: read the verifier's root and step to it        *)
(* (`step_to`: the mirror if it is the root, else adopt the journal's      *)
(* entry for it, else build nothing), build a batch on the mirror and      *)
(* hold its state (`hold_next`) before sending, send, read the outcome.    *)
(* Adopting (`adopt` → `keep`) writes the kept file, which can fail, and   *)
(* only then prunes the journal to the entries built on the new root.      *)
(* A relay starts on its kept file and refuses to start unless it holds    *)
(* the verifier's root; another relay can be started on a relay's          *)
(* `GET /state` (its mirror) written over its kept file.                   *)
(*                                                                         *)
(* A batch carries the parties whose bonds it pulls; a party can revoke    *)
(* its allowance after the relay's funding check, and `settleBatch` then   *)
(* refuses the batch while the verifier's root still sits on its previous  *)
(* root. The relay learns who revoked from that refusal (it re-reads       *)
(* funding) and must drop the revoker and rebuild with everyone else —     *)
(* never re-send a batch it knows cannot pull. The repeated-revocation     *)
(* window is an operational log signal, not modelled.                      *)
(*                                                                         *)
(* `knownRevoked` is an ABSTRACTION: the model assumes a refusal at the    *)
(* batch's previous root names the revoker. In the code the naming is a    *)
(* fresh funding read, which a party that re-approves before the re-read   *)
(* defeats — the code then dead-letters the whole batch, an outcome        *)
(* `NotLanded` covers. `Revoke` is permanent here, so re-approval is out   *)
(* of scope, and `SendsExcludeKnownRevoked` checks the relay's discipline  *)
(* GIVEN the knowledge, never the funding read itself.                     *)
(*                                                                         *)
(* FIVE SWITCHES. All TRUE is the relay as it must run; each FALSE         *)
(* restores a defect, and the model must then violate `Recoverable`        *)
(* (the first four) or `SendsExcludeKnownRevoked` (the fifth):             *)
(*   HoldBeforeSend         — FALSE: the state is written after the send,  *)
(*                            so a crash between the two loses a state the *)
(*                            chain can reach                              *)
(*   HoldThroughRevert      — FALSE: a batch the chain refused drops its   *)
(*                            state, though its public proof can still     *)
(*                            land                                         *)
(*   KeepRetainsBuiltOnRoot — FALSE: adopting a root clears the whole      *)
(*                            journal, including batches built on that     *)
(*                            root and sent while the kept file lagged     *)
(*   TakeoverChecksRoot     — FALSE: a relay's kept file is overwritten    *)
(*                            with another relay's `GET /state` whatever   *)
(*                            root it serves, which can destroy the only   *)
(*                            copy of the verifier's state                 *)
(*   RebatchDropsRevoker    — FALSE: a refusal caused by a revoked         *)
(*                            approval re-sends the same batch instead of  *)
(*                            dropping the revoker and rebuilding, so the  *)
(*                            relay sends a batch it knows cannot pull     *)
(*                                                                         *)
(* THE DEFERRAL (the second half of this module, `DeferSpec`, checked by   *)
(* RelayStateDeferral.cfg; `Spec` above holds its variables still and      *)
(* `DeferSpec` holds the lifecycle's). Batch formation drains at most      *)
(* `DCap` operations and filters them against the state: an operation      *)
(* that applies against no order of the drain (its dependency may sit past *)
(* the drain's cut, may not be submitted yet, or may never come), or a     *)
(* commit whose funding the node could not read, is DEFERRED, never        *)
(* dead-lettered at first sight; what was filtered into an order behind a  *)
(* deferred operation moves with it. A tick's deferrals wait apart from    *)
(* the queue in drain groups                                               *)
(* (`group_by_process`): each operation touches one process, so a group   *)
(* is one process's operations. A group is                                 *)
(* drained again only into the slots the queue leaves empty, whole; the    *)
(* groups decide what is drained together and nothing else. Each         *)
(* operation is dead-lettered once `DWindow` ticks have passed since its   *)
(* OWN first deferral, and what was filtered behind it goes with it; what  *)
(* is left of its group is grouped again. The ops are fixed: "a" a commit, *)
(* "b" an operation on a's order, both of process P1 and honest; "f" and   *)
(* "g" operations that never apply, which anyone may submit free, each     *)
(* once at any tick — f one naming P1, g one naming P2; "r" a resolve of   *)
(* P1 listing one order                                                    *)
(* twice, which never applies and which admission (`pre_check`) refuses.  *)
(* An operation the kernel refuses for good against the landed state (it  *)
(* exists, is resolved, is past its deadline, fails a signature or a       *)
(* witness) is dead-lettered at once and never enters the deferral, so it  *)
(* is not modeled here.                                                    *)
(*                                                                         *)
(* NINE MORE SWITCHES, each FALSE restoring one defect the deferral must  *)
(* not have:                                                               *)
(*   DeferBoundedInTime       — FALSE: the bound is in attempts, so an     *)
(*                              operation retried every tick expires       *)
(*                              before a late dependency had its window,   *)
(*                              and one never retried waits forever        *)
(*                              (fails `DeferralBoundedInTime`)            *)
(*   DeferOwnCounter          — FALSE: a deferral spends the transient     *)
(*                              re-queue's counter, so an operation is     *)
(*                              dead-lettered at the re-queue cap without  *)
(*                              that many transient failures (fails        *)
(*                              `RequeueCapCountsTransients`)              *)
(*   DeferDrainsOnlyFreeSlots — FALSE: a deferred operation goes back to   *)
(*                              the queue's front, and every tick drains   *)
(*                              it ahead of what waits behind it (fails    *)
(*                              `NoExtraDraining`)                         *)
(*   DeferMovesDependents     — FALSE: what was filtered into an order     *)
(*                              behind a deferred operation is dead-       *)
(*                              lettered, though its dependency stays      *)
(*                              (fails `BuiltOnOnlyBehindDead`)            *)
(*   DeferDropsCopy           — FALSE: a copy resubmitted while the        *)
(*                              operation was drained stays queued beside  *)
(*                              the deferred one (fails `NoTwoCopies`)     *)
(*   DeferGroupsByProcess     — FALSE: a tick's deferrals are one group,   *)
(*                              whatever processes they touch (fails       *)
(*                              `DrainGroupIsAClass`)                      *)
(*   DeferOwnWindow           — FALSE: a group with an operation past its  *)
(*                              window is dead-lettered whole, so an       *)
(*                              operation that never applies, submitted    *)
(*                              earlier and naming an honest operation's   *)
(*                              process, cuts that one's window short      *)
(*                              (fails `HonestWindowKept` when checked     *)
(*                              alone with the honest side held to the     *)
(*                              commit — `DHonest` edited to {"a"} in this *)
(*                              module; with `DHonest` as it stands,       *)
(*                              `DeferralBoundedInTime` is reported first) *)
(*   DeferDependentEdge       — FALSE: each operation expires on its own   *)
(*                              window alone, and what was filtered behind *)
(*                              it stays deferred (fails                   *)
(*                              `DependentLeavesWithItsDependency`)        *)
(*   AdmitRefusesDoubleListing — FALSE: a resolve listing one order twice  *)
(*                              is admitted (fails                         *)
(*                              `DoubleListingNeverAdmitted`)              *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS
    Relays,
    Parties,
    MaxBatches,
    HoldBeforeSend,
    HoldThroughRevert,
    KeepRetainsBuiltOnRoot,
    TakeoverChecksRoot,
    RebatchDropsRevoker,
    DCap,           \* MAX_BATCH_OPS: operations one drain takes
    DWindow,        \* the deferral's bound, in ticks from first deferral
    DMaxTime,       \* the ticks the model runs
    DMaxRequeues,   \* the transient re-queue's cap
    DMaxAttempts,   \* the attempt bound DeferBoundedInTime = FALSE uses
    DeferBoundedInTime,
    DeferOwnCounter,
    DeferDrainsOnlyFreeSlots,
    DeferMovesDependents,
    DeferDropsCopy,
    DeferGroupsByProcess,
    DeferOwnWindow,
    DeferDependentEdge,
    AdmitRefusesDoubleListing

Genesis == 0
Roots == 0..MaxBatches
Batches == [prev : Roots, new : Roots, parties : SUBSET Parties]
NoBatch == [prev |-> Genesis, new |-> Genesis, parties |-> {}]
Phases == {"idle", "held", "sentUnheld", "sent"}

VARIABLES
    vRoot,      \* FigaroBatchVerifier.stateRoot
    hist,       \* every root the verifier has held, in order
    published,  \* batches whose proof is public (sent at least once)
    nextId,     \* the next fresh root
    revoked,    \* parties whose allowance is revoked (world state)
    alive, mirror, ready, phase, inflight,
    kept, journal,
    knownRevoked \* per relay: parties whose revocation a refusal showed it

vars == <<vRoot, hist, published, nextId, revoked, alive, mirror, ready, phase, inflight, kept, journal, knownRevoked>>
relayVars == <<alive, mirror, ready, phase, inflight, kept, journal, knownRevoked>>

Range(s) == {s[i] : i \in DOMAIN s}
Pos(x) == CHOOSE i \in DOMAIN hist : hist[i] = x
Entry(root, prev) == [root |-> root, prev |-> prev]
JournalRoots(r) == {e.root : e \in journal[r]}

\* `keep`: once the kept file is written, the journal keeps exactly the
\* states that can still land — those built on the new root.
Retain(J, root) ==
    IF KeepRetainsBuiltOnRoot
    THEN {e \in J : e.prev = root /\ e.root # root}
    ELSE {}

\* `adopt`: the state becomes the mirror; `keep` writes the kept file or
\* fails, and a failure leaves the file and the journal as they were.
Adopt(r, root, keepWritten) ==
    /\ mirror' = [mirror EXCEPT ![r] = root]
    /\ kept' = IF keepWritten THEN [kept EXCEPT ![r] = root] ELSE kept
    /\ journal' = IF keepWritten
                  THEN [journal EXCEPT ![r] = Retain(journal[r], root)]
                  ELSE journal

TypeOK ==
    /\ vRoot \in Roots
    /\ hist \in Seq(Roots)
    /\ published \subseteq Batches
    /\ nextId \in 1..(MaxBatches + 1)
    /\ revoked \subseteq Parties
    /\ alive \in [Relays -> BOOLEAN]
    /\ mirror \in [Relays -> Roots]
    /\ ready \in [Relays -> BOOLEAN]
    /\ phase \in [Relays -> Phases]
    /\ inflight \in [Relays -> Batches]
    /\ kept \in [Relays -> Roots]
    /\ journal \in [Relays -> SUBSET [root : Roots, prev : Roots]]
    /\ knownRevoked \in [Relays -> SUBSET Parties]

Init ==
    /\ vRoot = Genesis
    /\ hist = <<Genesis>>
    /\ published = {}
    /\ nextId = 1
    /\ revoked = {}
    /\ alive = [r \in Relays |-> FALSE]
    /\ mirror = [r \in Relays |-> Genesis]
    /\ ready = [r \in Relays |-> FALSE]
    /\ phase = [r \in Relays |-> "idle"]
    /\ inflight = [r \in Relays |-> NoBatch]
    /\ kept = [r \in Relays |-> Genesis]
    /\ journal = [r \in Relays |-> {}]
    /\ knownRevoked = [r \in Relays |-> {}]

(***************************************************************************)
(* Start: the mirror is the kept file; the relay starts only when it holds *)
(* the verifier's root (in the kept file, or in the journal — adopted).    *)
(* Otherwise it refuses: no step.                                          *)
(***************************************************************************)
StartHolding(r) ==
    /\ ~alive[r]
    /\ kept[r] = vRoot
    /\ alive' = [alive EXCEPT ![r] = TRUE]
    /\ mirror' = [mirror EXCEPT ![r] = kept[r]]
    /\ UNCHANGED <<vRoot, hist, published, nextId, revoked, ready, phase, inflight, kept, journal, knownRevoked>>

StartAdopting(r) ==
    /\ ~alive[r]
    /\ kept[r] # vRoot
    /\ vRoot \in JournalRoots(r)
    /\ alive' = [alive EXCEPT ![r] = TRUE]
    /\ \E written \in BOOLEAN : Adopt(r, vRoot, written)
    /\ UNCHANGED <<vRoot, hist, published, nextId, revoked, ready, phase, inflight, knownRevoked>>

\* The verifier could not be read at start (it may not be deployed yet):
\* the relay starts on its kept file, and the batch loop reads again.
StartUnread(r) ==
    /\ ~alive[r]
    /\ alive' = [alive EXCEPT ![r] = TRUE]
    /\ mirror' = [mirror EXCEPT ![r] = kept[r]]
    /\ UNCHANGED <<vRoot, hist, published, nextId, revoked, ready, phase, inflight, kept, journal, knownRevoked>>

(***************************************************************************)
(* The batch loop's head: read the verifier's root and step to it.         *)
(***************************************************************************)
TickCurrent(r) ==
    /\ alive[r] /\ phase[r] = "idle"
    /\ mirror[r] = vRoot
    /\ ready' = [ready EXCEPT ![r] = TRUE]
    /\ UNCHANGED <<vRoot, hist, published, nextId, revoked, alive, mirror, phase, inflight, kept, journal, knownRevoked>>

TickAdopt(r) ==
    /\ alive[r] /\ phase[r] = "idle"
    /\ mirror[r] # vRoot
    /\ vRoot \in JournalRoots(r)
    /\ \E written \in BOOLEAN : Adopt(r, vRoot, written)
    /\ ready' = [ready EXCEPT ![r] = TRUE]
    /\ UNCHANGED <<vRoot, hist, published, nextId, revoked, alive, phase, inflight, knownRevoked>>

TickOutOfStep(r) ==
    /\ alive[r] /\ phase[r] = "idle"
    /\ mirror[r] # vRoot
    /\ vRoot \notin JournalRoots(r)
    /\ ready' = [ready EXCEPT ![r] = FALSE]
    /\ UNCHANGED <<vRoot, hist, published, nextId, revoked, alive, mirror, phase, inflight, kept, journal, knownRevoked>>

(***************************************************************************)
(* Build a batch on the mirror and hold its state before sending.          *)
(* The verifier's root may have moved since the tick; the batch is then    *)
(* refused on chain, which the outcome below covers.                       *)
(***************************************************************************)
Build(r) ==
    /\ alive[r] /\ phase[r] = "idle" /\ ready[r]
    /\ nextId <= MaxBatches
    /\ \E ps \in SUBSET (IF RebatchDropsRevoker THEN Parties \ knownRevoked[r] ELSE Parties) :
        /\ ps # {}
        /\ LET b == [prev |-> mirror[r], new |-> nextId, parties |-> ps] IN
            /\ inflight' = [inflight EXCEPT ![r] = b]
            /\ journal' = IF HoldBeforeSend
                          THEN [journal EXCEPT ![r] = @ \cup {Entry(b.new, b.prev)}]
                          ELSE journal
            /\ phase' = [phase EXCEPT ![r] = "held"]
    /\ nextId' = nextId + 1
    /\ UNCHANGED <<vRoot, hist, published, revoked, alive, mirror, ready, kept, knownRevoked>>

Send(r) ==
    /\ alive[r] /\ phase[r] = "held"
    /\ published' = published \cup {inflight[r]}
    /\ phase' = [phase EXCEPT ![r] = IF HoldBeforeSend THEN "sent" ELSE "sentUnheld"]
    /\ UNCHANGED <<vRoot, hist, nextId, revoked, alive, mirror, ready, inflight, kept, journal, knownRevoked>>

\* The defect HoldBeforeSend = FALSE restores: the state is written after.
HoldAfterSend(r) ==
    /\ alive[r] /\ phase[r] = "sentUnheld"
    /\ journal' = [journal EXCEPT ![r] = @ \cup {Entry(inflight[r].new, inflight[r].prev)}]
    /\ phase' = [phase EXCEPT ![r] = "sent"]
    /\ UNCHANGED <<vRoot, hist, published, nextId, revoked, alive, mirror, ready, inflight, kept, knownRevoked>>

\* The outcome: the batch landed (this send, or an earlier one) — adopt it.
Landed(r) ==
    /\ alive[r] /\ phase[r] = "sent"
    /\ vRoot = inflight[r].new
    /\ \E written \in BOOLEAN : Adopt(r, inflight[r].new, written)
    /\ phase' = [phase EXCEPT ![r] = "idle"]
    /\ ready' = [ready EXCEPT ![r] = FALSE]
    /\ inflight' = [inflight EXCEPT ![r] = NoBatch]
    /\ UNCHANGED <<vRoot, hist, published, nextId, revoked, alive, knownRevoked>>

\* The outcome: refused for a reason other than a revoked approval
\* (deterministic), or not known (transient). The state stays held — its
\* proof is public — unless the defect is restored.
NotLanded(r) ==
    /\ alive[r] /\ phase[r] = "sent"
    /\ vRoot # inflight[r].new
    /\ (vRoot # inflight[r].prev \/ inflight[r].parties \cap revoked = {})
    /\ journal' = IF HoldThroughRevert
                  THEN journal
                  ELSE [journal EXCEPT ![r] = @ \ {Entry(inflight[r].new, inflight[r].prev)}]
    /\ phase' = [phase EXCEPT ![r] = "idle"]
    /\ ready' = [ready EXCEPT ![r] = FALSE]
    /\ inflight' = [inflight EXCEPT ![r] = NoBatch]
    /\ UNCHANGED <<vRoot, hist, published, nextId, revoked, alive, mirror, kept, knownRevoked>>

\* The outcome: refused because a party revoked its approval after the
\* funding check — the verifier's root still sits on the batch's previous
\* root, so the refusal is the pull. The relay re-reads funding and learns
\* who. Correct: drop the batch, exclude the revoker, rebuild with everyone
\* else on the next tick (the refused batch's held state stays — its proof
\* is public). The defect RebatchDropsRevoker = FALSE restores: the same
\* batch is re-sent, though the relay knows it cannot pull.
RefusedRevoked(r) ==
    /\ alive[r] /\ phase[r] = "sent"
    /\ vRoot # inflight[r].new
    /\ vRoot = inflight[r].prev
    /\ inflight[r].parties \cap revoked # {}
    /\ knownRevoked' = [knownRevoked EXCEPT ![r] = @ \cup (inflight[r].parties \cap revoked)]
    /\ IF RebatchDropsRevoker
       THEN /\ phase' = [phase EXCEPT ![r] = "idle"]
            /\ ready' = [ready EXCEPT ![r] = FALSE]
            /\ inflight' = [inflight EXCEPT ![r] = NoBatch]
       ELSE /\ phase' = [phase EXCEPT ![r] = "held"]
            /\ ready' = ready
            /\ inflight' = inflight
    /\ UNCHANGED <<vRoot, hist, published, nextId, revoked, alive, mirror, kept, journal>>

(***************************************************************************)
(* The world around the relays.                                            *)
(***************************************************************************)
\* `settleBatch` is permissionless: any published proof lands while the
\* verifier's root is its previous root — this relay's send, a resend,
\* anyone — and every party's bond still pulls (none has revoked).
Settle(b) ==
    /\ b \in published
    /\ vRoot = b.prev
    /\ b.parties \cap revoked = {}
    /\ vRoot' = b.new
    /\ hist' = Append(hist, b.new)
    /\ UNCHANGED <<published, nextId, revoked, alive, mirror, ready, phase, inflight, kept, journal, knownRevoked>>

\* A party revokes its allowance to the verifier — free, repeatable at will,
\* visible to a relay only through a refused batch. Permanent here:
\* re-approval is a fresh act the state lifecycle does not depend on.
Revoke(p) ==
    /\ p \notin revoked
    /\ revoked' = revoked \cup {p}
    /\ UNCHANGED <<vRoot, hist, published, nextId, alive, mirror, ready, phase, inflight, kept, journal, knownRevoked>>

\* A crash at any step: memory is lost, the disk is not. The exclusion set
\* is memory — a restarted relay re-learns a revoker from its next refusal.
Crash(r) ==
    /\ alive[r]
    /\ alive' = [alive EXCEPT ![r] = FALSE]
    /\ ready' = [ready EXCEPT ![r] = FALSE]
    /\ phase' = [phase EXCEPT ![r] = "idle"]
    /\ inflight' = [inflight EXCEPT ![r] = NoBatch]
    /\ mirror' = [mirror EXCEPT ![r] = Genesis]
    /\ knownRevoked' = [knownRevoked EXCEPT ![r] = {}]
    /\ UNCHANGED <<vRoot, hist, published, nextId, revoked, kept, journal>>

\* A stopped relay is started on another's `GET /state`: the served state
\* (that relay's mirror) is written over its kept file; its journal stays
\* (the relay trims it to the states built on the adopted root, the only
\* ones that can still land). Checked, the overwrite happens only when the
\* served root (recomputed from the served state; the `x-figaro-state-root`
\* header is what the serving relay claims) is the verifier's, and never
\* when the relay already holds the state behind it.
Takeover(r, s) ==
    /\ r # s
    /\ ~alive[r] /\ alive[s]
    /\ TakeoverChecksRoot => mirror[s] = vRoot
    /\ kept' = [kept EXCEPT ![r] = mirror[s]]
    /\ UNCHANGED <<vRoot, hist, published, nextId, revoked, alive, mirror, ready, phase, inflight, journal, knownRevoked>>

Next ==
    \/ \E r \in Relays :
        \/ StartHolding(r) \/ StartAdopting(r) \/ StartUnread(r)
        \/ TickCurrent(r) \/ TickAdopt(r) \/ TickOutOfStep(r)
        \/ Build(r) \/ Send(r) \/ HoldAfterSend(r)
        \/ Landed(r) \/ NotLanded(r) \/ RefusedRevoked(r) \/ Crash(r)
    \/ \E b \in published : Settle(b)
    \/ \E p \in Parties : Revoke(p)
    \/ \E r, s \in Relays : Takeover(r, s)

(***************************************************************************)
(* THE DEFERRAL of an operation dropped at batch formation (main.rs's      *)
(* formation, mempool.rs's `defer`, `drain_up_to`, `expire_deferred`).     *)
(***************************************************************************)
DOps == {"a", "b", "f", "g", "r"}
\* a is the one commit; b is built on a's order; f, g and r never apply —
\* f and g operations that never apply, which anyone may submit free, each
\* submitted once at any tick.
DDep == [o \in DOps |-> IF o = "b" THEN {"a"} ELSE {}]
DFree == {"f", "g", "r"}
DCommits == {"a"}
\* The honest operations: those P1's parties make well-formed.
DHonest == {"a", "b"}
\* The resolve listing an order twice, which admission refuses.
DDoubleListed == {"r"}
\* The process each operation touches (`touched_processes`): a commit its
\* own, a resolve its process, an attestation its target order's process.
\* Each operation touches one process. f names P1, so it shares a group with
\* P1's honest operations; g names P2.
DTouch == [o \in DOps |->
             CASE o = "g" -> {"P2"}
               [] OTHER   -> {"P1"}]
DReasons == {"no", "expired", "requeueCap", "unfunded", "builtOn"}

VARIABLES
    queue,       \* the pending queue, oldest first
    parked,      \* the deferral: drain groups, oldest first, each the set
                 \* of its operations and the tick its formation ran
    deferred,    \* ghost: every operation deferred now, wherever it sits
    drained,     \* the tick's drain, between drain and formation
    dphase,      \* "idle" | "drained"
    landed,      \* operations a batch landed
    dead,        \* why each operation was dead-lettered ("no": it was not)
    sightSet,    \* operations holding a first-deferral record
    sight,       \* that record: the tick of the first deferral, 0 without one
    behind,      \* the operations each deferred operation was filtered
                 \* behind (`refilter_after_drops`): it rides with them
    requeues,    \* the transient re-queue's counter
    transients,  \* ghost: transient failures each operation suffered
    attempts,    \* the attempt counter DeferBoundedInTime = FALSE bounds by
    submitted,   \* operations submitted once
    now,         \* the tick
    lastDrain,   \* ghost: did the last drain retry a deferred operation,
                 \* and did it leave a queued one behind
    early,       \* ghost: the deferral dead-lettered an operation before
                 \* its own window ended, not with what it was filtered
                 \* behind
    cutShort,    \* ghost: the deferral dead-lettered an honest operation
                 \* before its own window ended while every operation it
                 \* depends on stood
    stranded     \* ghost: an operation stayed deferred when one it was
                 \* filtered behind was dead-lettered

dvars == <<queue, parked, deferred, drained, dphase, landed, dead,
           sightSet, sight, behind, requeues, transients, attempts,
           submitted, now, lastDrain, early, cutShort, stranded>>
allvars == <<vars, dvars>>

ParkedOps == UNION {parked[i].ops : i \in 1..Len(parked)}
SeqOf(S) == CHOOSE s \in [1..Cardinality(S) -> S] : Range(s) = S
Orders(S) == {s \in [1..Cardinality(S) -> S] : Range(s) = S}
Without(s, S) == SelectSeq(s, LAMBDA x : x \notin S)
Min(x, y) == IF x < y THEN x ELSE y

\* Two operations touch a common process.
Linked(x, y) == DTouch[x] \cap DTouch[y] # {}

\* The operations of S joined to C by a chain of operations, each touching
\* a process the next touches.
RECURSIVE Close(_, _)
Close(S, C) ==
    LET N == C \cup {y \in S : \E x \in C : Linked(x, y)}
    IN IF N = C THEN C ELSE Close(S, N)

\* Drain groups (`group_by_process`): the classes of the transitive closure
\* of `Linked`; each operation touches one process, so a class is one
\* process's operations. The groups decide what is drained together and
\* nothing else. DeferGroupsByProcess = FALSE: one group.
Groups(S) ==
    IF S = {} THEN {}
    ELSE IF ~DeferGroupsByProcess THEN {S}
    ELSE {Close(S, {o}) : o \in S}

Parcel(S, t) == {[ops |-> G, at |-> t] : G \in Groups(S)}

\* What is left of each group once the operations X leave it, grouped
\* again, so a group stays one class after a member is dead-lettered.
RECURSIVE Regroup(_, _)
Regroup(gs, X) ==
    IF gs = <<>> THEN <<>>
    ELSE SeqOf(Parcel(Head(gs).ops \ X, Head(gs).at)) \o Regroup(Tail(gs), X)

\* E and the operations of D filtered behind one of them, transitively
\* (`B[o]`: what o was filtered behind).
RECURSIVE WithFollowers(_, _, _)
WithFollowers(E, D, B) ==
    LET N == E \cup {o \in D : B[o] \cap E # {}}
    IN IF N = E THEN E ELSE WithFollowers(N, D, B)

\* What applies, in some order, against the landed state: the operations
\* whose dependencies landed or apply in the same drain. The dependencies
\* are acyclic, so the fixpoint is unique.
Applicable(D) ==
    CHOOSE V \in SUBSET D :
        V = {o \in D : o \notin DFree /\ o \notin landed /\ DDep[o] \subseteq landed \cup V}

\* Retry deferred groups, oldest first, each whole, into `room` slots.
RECURSIVE TakeGroups(_, _)
TakeGroups(gs, room) ==
    IF gs = <<>> THEN [taken |-> {}, rest |-> <<>>]
    ELSE IF Cardinality(Head(gs).ops) <= room
         THEN LET r == TakeGroups(Tail(gs), room - Cardinality(Head(gs).ops))
              IN [taken |-> Head(gs).ops \cup r.taken, rest |-> r.rest]
         ELSE LET r == TakeGroups(Tail(gs), room)
              IN [taken |-> r.taken, rest |-> <<Head(gs)>> \o r.rest]

DTypeOK ==
    /\ queue \in Seq(DOps)
    /\ parked \in Seq([ops : SUBSET DOps, at : 0..DMaxTime])
    /\ deferred \subseteq DOps
    /\ drained \subseteq DOps
    /\ dphase \in {"idle", "drained"}
    /\ landed \subseteq DOps
    /\ dead \in [DOps -> DReasons]
    /\ sightSet \subseteq DOps
    /\ sight \in [DOps -> 0..DMaxTime]
    /\ behind \in [DOps -> SUBSET DOps]
    /\ requeues \in [DOps -> 0..(DMaxTime + 1)]
    /\ transients \in [DOps -> 0..(DMaxTime + 1)]
    /\ attempts \in [DOps -> 0..(DMaxTime + 1)]
    /\ submitted \subseteq DOps
    /\ now \in 0..DMaxTime
    /\ lastDrain \in [retried : BOOLEAN, leftQueued : BOOLEAN]
    /\ early \in BOOLEAN
    /\ cutShort \in BOOLEAN
    /\ stranded \in BOOLEAN

DInit ==
    /\ queue = <<>>
    /\ parked = <<>>
    /\ deferred = {}
    /\ drained = {}
    /\ dphase = "idle"
    /\ landed = {}
    /\ dead = [o \in DOps |-> "no"]
    /\ sightSet = {}
    /\ sight = [o \in DOps |-> 0]
    /\ behind = [o \in DOps |-> {}]
    /\ requeues = [o \in DOps |-> 0]
    /\ transients = [o \in DOps |-> 0]
    /\ attempts = [o \in DOps |-> 0]
    /\ submitted = {}
    /\ now = 0
    /\ lastDrain = [retried |-> FALSE, leftQueued |-> FALSE]
    /\ early = FALSE
    /\ cutShort = FALSE
    /\ stranded = FALSE

\* A submission, once per operation (a deferred operation's key stays in the
\* mempool's index, so resubmitting it then is a duplicate and adds nothing).
\* Admission refuses a resolve that lists an order twice: it never applies,
\* whatever the state, and its list rides unsigned.
DSubmit(o) ==
    /\ o \notin submitted
    /\ o \in DDoubleListed => ~AdmitRefusesDoubleListing
    /\ queue' = Append(queue, o)
    /\ submitted' = submitted \cup {o}
    /\ UNCHANGED <<parked, deferred, drained, dphase, landed, dead,
                   sightSet, sight, behind, requeues, transients, attempts,
                   now, lastDrain, early, cutShort, stranded>>

\* The drain freed a drained operation's key: the same operation can be
\* submitted again while its tick runs. A fresh admission clears the key's
\* re-queue count (`Mempool::submit`).
DSubmitCopy(o) ==
    /\ dphase = "drained"
    /\ o \in drained
    /\ o \notin Range(queue)
    /\ queue' = Append(queue, o)
    /\ requeues' = [requeues EXCEPT ![o] = 0]
    /\ transients' = [transients EXCEPT ![o] = 0]
    /\ UNCHANGED <<parked, deferred, drained, dphase, landed, dead,
                   sightSet, sight, behind, attempts, submitted, now,
                   lastDrain, early, cutShort, stranded>>

\* A tick's head: the clock moves; a deferred operation past its own window
\* is dead-lettered, with what was filtered behind it (`expire_deferred`; in
\* time: whether or not it was ever retried); what is left of its group is
\* grouped again; and the drain takes the queue first and the deferred
\* groups, each whole, only into the slots left.
\*   DeferOwnWindow = FALSE     — a group with an operation past its window
\*                                is dead-lettered whole
\*   DeferDependentEdge = FALSE — an operation expires on its own window
\*                                alone
DDrain ==
    /\ dphase = "idle"
    /\ now < DMaxTime
    /\ LET t == now + 1
           pastWindow(o) == t - sight[o] >= DWindow
           own == {o \in deferred : pastWindow(o)}
           lateGroups == {parked[i].ops : i \in {j \in 1..Len(parked) :
                                                   parked[j].ops \cap own # {}}}
           exp == IF ~DeferBoundedInTime THEN {}
                  ELSE IF ~DeferOwnWindow THEN own \cup UNION lateGroups
                  ELSE IF DeferDependentEdge THEN WithFollowers(own, deferred, behind)
                  ELSE own
           q1 == Without(queue, exp)
           p1 == Regroup(parked, exp)
           n == Min(DCap, Len(q1))
           fromQueue == Range(SubSeq(q1, 1, n))
           tg == TakeGroups(p1, DCap - n)
           taken == IF DeferDrainsOnlyFreeSlots THEN fromQueue \cup tg.taken ELSE fromQueue
       IN
        /\ now' = t
        /\ queue' = SubSeq(q1, n + 1, Len(q1))
        /\ parked' = IF DeferDrainsOnlyFreeSlots THEN tg.rest ELSE p1
        /\ drained' = taken
        /\ deferred' = deferred \ (exp \cup taken)
        /\ dead' = [o \in DOps |-> IF o \in own THEN "expired"
                                  ELSE IF o \in exp
                                       THEN (IF DeferOwnWindow THEN "builtOn" ELSE "expired")
                                  ELSE dead[o]]
        /\ lastDrain' = [retried |-> taken \cap deferred # {},
                         leftQueued |-> SubSeq(q1, n + 1, Len(q1)) # <<>>]
        /\ early' = (early \/ \E o \in exp : ~pastWindow(o) /\ behind[o] \cap exp = {})
        /\ cutShort' = (cutShort \/ \E o \in exp \cap DHonest :
                           ~pastWindow(o) /\ \A d \in DDep[o] : d \notin exp /\ dead[d] = "no")
        /\ stranded' = (stranded \/ \E o \in deferred \ exp : behind[o] \cap exp # {})
        \* The records die with the operation.
        /\ sightSet' = sightSet \ exp
        /\ sight' = [o \in DOps |-> IF o \in exp THEN 0 ELSE sight[o]]
        /\ behind' = [o \in DOps |-> IF o \in exp THEN {} ELSE behind[o]]
    /\ dphase' = "drained"
    /\ UNCHANGED <<landed, requeues, transients, attempts, submitted>>

\* Formation and the send. The operation filter's poison and the funding
\* filter's unverifiable reads (U) are deferred; a verified shortfall (X) is
\* dead-lettered; the operation filter runs again after the funding drops,
\* and what was filtered behind a deferred operation moves with it and
\* records the edge (`behind`). What is deferred past its own window is
\* dead-lettered, with what was filtered behind it; the rest is grouped by
\* process (`defer`, `group_by_process`) and parked in an order the model
\* leaves free. The batch then lands, or fails transiently and re-queues at
\* the front, each operation at most DMaxRequeues times.
DForm ==
    /\ dphase = "drained"
    /\ LET valid0 == Applicable(drained)
           poison == drained \ valid0
       IN \E U \in SUBSET (valid0 \cap DCommits), X \in SUBSET (valid0 \cap DCommits),
             outcome \in {"land", "transient"} :
        /\ U \cap X = {}
        /\ LET rest == valid0 \ (U \cup X)
               batch == Applicable(rest)
               builtOn == rest \ batch
               follow == IF DeferMovesDependents
                         THEN builtOn \cap Applicable(batch \cup U \cup builtOn)
                         ELSE {}
               deadBuilt == builtOn \ follow
               toDefer == poison \cup U \cup follow
               edges == [o \in DOps |->
                           IF o \in follow THEN behind[o] \cup (DDep[o] \cap (U \cup follow))
                           ELSE behind[o]]
               pastWindow(o) == o \in sightSet /\ now - sight[o] >= DWindow
               late(o) == IF DeferBoundedInTime THEN pastWindow(o)
                          ELSE attempts[o] + 1 > DMaxAttempts
               own == {o \in toDefer : late(o)}
               overdue == IF DeferOwnWindow THEN own
                          ELSE UNION {G \in Groups(toDefer) : G \cap own # {}}
               capped == IF DeferOwnCounter
                         THEN {}
                         ELSE {o \in toDefer \ overdue : requeues[o] + 1 > DMaxRequeues}
               \* The transient re-queue.
               rq == [o \in DOps |-> IF ~DeferOwnCounter /\ o \in toDefer \ overdue
                                     THEN requeues[o] + 1 ELSE requeues[o]]
               failed == IF outcome = "transient" THEN batch ELSE {}
               overCap == {o \in failed : rq[o] + 1 > DMaxRequeues}
               back == failed \ overCap
               dropped == overdue \cup capped \cup overCap \cup X \cup deadBuilt
               followers == IF DeferOwnWindow /\ DeferDependentEdge
                            THEN WithFollowers(dropped, toDefer, edges) \ dropped
                            ELSE {}
               defer == toDefer \ (overdue \cup capped \cup followers)
               gone == dropped \cup followers
               keptSight == ((sightSet \cup defer) \ gone)
                            \ (IF outcome = "land" THEN batch ELSE {})
               \* Where the deferred go, a queued copy dropped first; the
               \* re-queue drops its copy whatever the switch.
               q1 == Without(IF DeferDropsCopy THEN Without(queue, defer) ELSE queue, back)
               q2 == IF DeferDrainsOnlyFreeSlots THEN q1 ELSE SeqOf(defer) \o q1
           IN
            /\ batch # {} \/ outcome = "land"
            /\ queue' = SeqOf(back) \o q2
            /\ IF DeferDrainsOnlyFreeSlots
               THEN \E order \in Orders(Parcel(defer, now)) : parked' = parked \o order
               ELSE parked' = parked
            /\ deferred' = deferred \cup defer
            /\ landed' = IF outcome = "land" THEN landed \cup batch ELSE landed
            \* The first-deferral record and the edges ride on the
            \* operation: set once, gone when it lands or is dead-lettered.
            /\ sightSet' = keptSight
            /\ behind' = [o \in DOps |-> IF o \in defer THEN edges[o]
                                        ELSE IF o \in drained THEN {}
                                        ELSE behind[o]]
            /\ early' = (early \/ \E o \in overdue \cup followers :
                            ~pastWindow(o) /\ edges[o] \cap gone = {})
            /\ cutShort' = (cutShort \/ \E o \in (overdue \cup followers) \cap DHonest :
                               ~pastWindow(o) /\ \A d \in DDep[o] : d \notin gone /\ dead[d] = "no")
            /\ stranded' = (stranded \/ \E o \in deferred \cup defer : edges[o] \cap gone # {})
            /\ sight' = [o \in DOps |-> IF o \in defer /\ o \notin sightSet THEN now
                                       ELSE IF o \in keptSight THEN sight[o]
                                       ELSE 0]
            /\ attempts' = IF DeferBoundedInTime THEN attempts
                           ELSE [o \in DOps |-> IF o \in toDefer THEN attempts[o] + 1 ELSE attempts[o]]
            /\ requeues' = [o \in DOps |-> IF o \in failed THEN rq[o] + 1 ELSE rq[o]]
            /\ transients' = [o \in DOps |-> IF o \in failed THEN transients[o] + 1 ELSE transients[o]]
            /\ dead' = [o \in DOps |->
                          IF o \in overdue THEN "expired"
                          ELSE IF o \in capped \cup overCap THEN "requeueCap"
                          ELSE IF o \in X THEN "unfunded"
                          ELSE IF o \in deadBuilt \cup followers THEN "builtOn"
                          ELSE dead[o]]
    /\ drained' = {}
    /\ dphase' = "idle"
    /\ UNCHANGED <<submitted, now, lastDrain>>

DNext ==
    \/ \E o \in DOps : DSubmit(o) \/ DSubmitCopy(o)
    \/ DDrain
    \/ DForm

Spec == Init /\ DInit /\ [][Next /\ UNCHANGED dvars]_allvars

DeferSpec == Init /\ DInit /\ [][DNext /\ UNCHANGED vars]_allvars

(***************************************************************************)
(* The deferral's invariants.                                              *)
(***************************************************************************)

\* Bounded in TIME from the first deferral, both ways: nothing deferred is
\* held past its own window, retried or not, and nothing is dead-lettered
\* by the deferral before its own window ends unless with an operation it
\* was filtered behind.
DeferralBoundedInTime ==
    /\ \A o \in deferred : now - sight[o] < DWindow
    /\ ~early

\* No honest operation is dead-lettered by the deferral before its own
\* window ends unless an operation it depends on was dead-lettered —
\* whatever operations that never apply, which anyone may submit free,
\* name its process, and whenever they are submitted.
HonestWindowKept == ~cutShort

\* No operation stays deferred after one it was filtered behind is
\* dead-lettered: a dependent leaves with its dependency.
DependentLeavesWithItsDependency == ~stranded

\* Every drain group is one class of the transitive closure of touching a
\* common process over its formation's deferrals: joined within (a chain of
\* its operations, each touching a process the next touches, joins any two)
\* and closed (no operation of another group of the same formation touches
\* a process one of its operations touches).
DrainGroupIsAClass ==
    \A i \in 1..Len(parked) :
        /\ parked[i].ops # {}
        /\ \A o \in parked[i].ops : Close(parked[i].ops, {o}) = parked[i].ops
        /\ \A j \in 1..Len(parked) :
              (j # i /\ parked[j].at = parked[i].at)
                  => \A x \in parked[i].ops, y \in parked[j].ops : ~Linked(x, y)

\* Admission refuses a resolve listing one order twice.
DoubleListingNeverAdmitted == DDoubleListed \cap submitted = {}

\* The re-queue cap counts transient failures alone.
RequeueCapCountsTransients ==
    \A o \in DOps : dead[o] = "requeueCap" => transients[o] > DMaxRequeues

\* A deferred operation is drained only into slots the queue left empty: a
\* drain that retries one leaves nothing queued behind it.
NoExtraDraining == lastDrain.retried => ~lastDrain.leftQueued

\* An operation is dead-lettered as built on a dropped one only when one of
\* its dependencies was dropped for good — never behind a deferred one.
BuiltOnOnlyBehindDead ==
    \A o \in DOps : dead[o] = "builtOn" => \E d \in DDep[o] : dead[d] # "no"

\* One copy of an operation waits at a time, queued or deferred.
NoTwoCopies ==
    \A o \in DOps :
        Cardinality({i \in 1..Len(queue) : queue[i] = o})
            + (IF o \in ParkedOps THEN 1 ELSE 0) <= 1

(***************************************************************************)
(* Invariants.                                                             *)
(***************************************************************************)

\* Some relay has the state behind the verifier's root on disk — whatever
\* crashed, whatever was refused, whoever sent the batch that landed.
Recoverable ==
    \/ vRoot = Genesis
    \/ \E r \in Relays : vRoot = kept[r] \/ vRoot \in JournalRoots(r)

\* Every published batch was built on a root the verifier held.
BuiltOnVerifierRoot == \A b \in published : b.prev \in Range(hist)

\* A running relay's mirror, and every kept file, is a root the verifier held.
MirrorOnVerifierRoot == \A r \in Relays : alive[r] => mirror[r] \in Range(hist)
KeptOnVerifierRoot == \A r \in Relays : kept[r] \in Range(hist)

\* Every held state was built on a root the verifier held.
JournalBuiltOnVerifierRoot == \A r \in Relays : \A e \in journal[r] : e.prev \in Range(hist)

\* The verifier's history is one chain: each root is fresh.
HistoryHasNoRepeat == \A i, j \in DOMAIN hist : i # j => hist[i] # hist[j]

(***************************************************************************)
(* Action property: a running relay's mirror never goes back.              *)
(***************************************************************************)
MirrorNeverGoesBack ==
    [][\A r \in Relays :
        (alive[r] /\ alive'[r] /\ mirror[r] \in Range(hist) /\ mirror'[r] \in Range(hist'))
            => Pos(mirror[r]) <= (CHOOSE i \in DOMAIN hist' : hist'[i] = mirror'[r])]_vars

(***************************************************************************)
(* Action property: a relay never sends a batch carrying a party whose     *)
(* revocation it has already seen — a refusal taught it the pull cannot    *)
(* land, so the re-batch drops the revoker instead of re-sending.          *)
(***************************************************************************)
SendsExcludeKnownRevoked ==
    [][\A r \in Relays :
        (phase[r] = "held" /\ phase'[r] \in {"sent", "sentUnheld"})
            => inflight[r].parties \cap knownRevoked[r] = {}]_vars

=============================================================================

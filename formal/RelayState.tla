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
(* FOUR SWITCHES. All TRUE is the relay as it must run; each FALSE         *)
(* restores a defect, and the model must then violate `Recoverable`:       *)
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
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS
    Relays,
    MaxBatches,
    HoldBeforeSend,
    HoldThroughRevert,
    KeepRetainsBuiltOnRoot,
    TakeoverChecksRoot

Genesis == 0
Roots == 0..MaxBatches
Batches == [prev : Roots, new : Roots]
NoBatch == [prev |-> Genesis, new |-> Genesis]
Phases == {"idle", "held", "sentUnheld", "sent"}

VARIABLES
    vRoot,      \* FigaroBatchVerifier.stateRoot
    hist,       \* every root the verifier has held, in order
    published,  \* batches whose proof is public (sent at least once)
    nextId,     \* the next fresh root
    alive, mirror, ready, phase, inflight,
    kept, journal

vars == <<vRoot, hist, published, nextId, alive, mirror, ready, phase, inflight, kept, journal>>
relayVars == <<alive, mirror, ready, phase, inflight, kept, journal>>

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
    /\ alive \in [Relays -> BOOLEAN]
    /\ mirror \in [Relays -> Roots]
    /\ ready \in [Relays -> BOOLEAN]
    /\ phase \in [Relays -> Phases]
    /\ inflight \in [Relays -> Batches]
    /\ kept \in [Relays -> Roots]
    /\ journal \in [Relays -> SUBSET [root : Roots, prev : Roots]]

Init ==
    /\ vRoot = Genesis
    /\ hist = <<Genesis>>
    /\ published = {}
    /\ nextId = 1
    /\ alive = [r \in Relays |-> FALSE]
    /\ mirror = [r \in Relays |-> Genesis]
    /\ ready = [r \in Relays |-> FALSE]
    /\ phase = [r \in Relays |-> "idle"]
    /\ inflight = [r \in Relays |-> NoBatch]
    /\ kept = [r \in Relays |-> Genesis]
    /\ journal = [r \in Relays |-> {}]

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
    /\ UNCHANGED <<vRoot, hist, published, nextId, ready, phase, inflight, kept, journal>>

StartAdopting(r) ==
    /\ ~alive[r]
    /\ kept[r] # vRoot
    /\ vRoot \in JournalRoots(r)
    /\ alive' = [alive EXCEPT ![r] = TRUE]
    /\ \E written \in BOOLEAN : Adopt(r, vRoot, written)
    /\ UNCHANGED <<vRoot, hist, published, nextId, ready, phase, inflight>>

\* The verifier could not be read at start (it may not be deployed yet):
\* the relay starts on its kept file, and the batch loop reads again.
StartUnread(r) ==
    /\ ~alive[r]
    /\ alive' = [alive EXCEPT ![r] = TRUE]
    /\ mirror' = [mirror EXCEPT ![r] = kept[r]]
    /\ UNCHANGED <<vRoot, hist, published, nextId, ready, phase, inflight, kept, journal>>

(***************************************************************************)
(* The batch loop's head: read the verifier's root and step to it.         *)
(***************************************************************************)
TickCurrent(r) ==
    /\ alive[r] /\ phase[r] = "idle"
    /\ mirror[r] = vRoot
    /\ ready' = [ready EXCEPT ![r] = TRUE]
    /\ UNCHANGED <<vRoot, hist, published, nextId, alive, mirror, phase, inflight, kept, journal>>

TickAdopt(r) ==
    /\ alive[r] /\ phase[r] = "idle"
    /\ mirror[r] # vRoot
    /\ vRoot \in JournalRoots(r)
    /\ \E written \in BOOLEAN : Adopt(r, vRoot, written)
    /\ ready' = [ready EXCEPT ![r] = TRUE]
    /\ UNCHANGED <<vRoot, hist, published, nextId, alive, phase, inflight>>

TickOutOfStep(r) ==
    /\ alive[r] /\ phase[r] = "idle"
    /\ mirror[r] # vRoot
    /\ vRoot \notin JournalRoots(r)
    /\ ready' = [ready EXCEPT ![r] = FALSE]
    /\ UNCHANGED <<vRoot, hist, published, nextId, alive, mirror, phase, inflight, kept, journal>>

(***************************************************************************)
(* Build a batch on the mirror and hold its state before sending.          *)
(* The verifier's root may have moved since the tick; the batch is then    *)
(* refused on chain, which the outcome below covers.                       *)
(***************************************************************************)
Build(r) ==
    /\ alive[r] /\ phase[r] = "idle" /\ ready[r]
    /\ nextId <= MaxBatches
    /\ LET b == [prev |-> mirror[r], new |-> nextId] IN
        /\ inflight' = [inflight EXCEPT ![r] = b]
        /\ journal' = IF HoldBeforeSend
                      THEN [journal EXCEPT ![r] = @ \cup {Entry(b.new, b.prev)}]
                      ELSE journal
        /\ phase' = [phase EXCEPT ![r] = "held"]
    /\ nextId' = nextId + 1
    /\ UNCHANGED <<vRoot, hist, published, alive, mirror, ready, kept>>

Send(r) ==
    /\ alive[r] /\ phase[r] = "held"
    /\ published' = published \cup {inflight[r]}
    /\ phase' = [phase EXCEPT ![r] = IF HoldBeforeSend THEN "sent" ELSE "sentUnheld"]
    /\ UNCHANGED <<vRoot, hist, nextId, alive, mirror, ready, inflight, kept, journal>>

\* The defect HoldBeforeSend = FALSE restores: the state is written after.
HoldAfterSend(r) ==
    /\ alive[r] /\ phase[r] = "sentUnheld"
    /\ journal' = [journal EXCEPT ![r] = @ \cup {Entry(inflight[r].new, inflight[r].prev)}]
    /\ phase' = [phase EXCEPT ![r] = "sent"]
    /\ UNCHANGED <<vRoot, hist, published, nextId, alive, mirror, ready, inflight, kept>>

\* The outcome: the batch landed (this send, or an earlier one) — adopt it.
Landed(r) ==
    /\ alive[r] /\ phase[r] = "sent"
    /\ vRoot = inflight[r].new
    /\ \E written \in BOOLEAN : Adopt(r, inflight[r].new, written)
    /\ phase' = [phase EXCEPT ![r] = "idle"]
    /\ ready' = [ready EXCEPT ![r] = FALSE]
    /\ inflight' = [inflight EXCEPT ![r] = NoBatch]
    /\ UNCHANGED <<vRoot, hist, published, nextId, alive>>

\* The outcome: refused (deterministic) or not known (transient). The state
\* stays held — its proof is public — unless the defect is restored.
NotLanded(r) ==
    /\ alive[r] /\ phase[r] = "sent"
    /\ vRoot # inflight[r].new
    /\ journal' = IF HoldThroughRevert
                  THEN journal
                  ELSE [journal EXCEPT ![r] = @ \ {Entry(inflight[r].new, inflight[r].prev)}]
    /\ phase' = [phase EXCEPT ![r] = "idle"]
    /\ ready' = [ready EXCEPT ![r] = FALSE]
    /\ inflight' = [inflight EXCEPT ![r] = NoBatch]
    /\ UNCHANGED <<vRoot, hist, published, nextId, alive, mirror, kept>>

(***************************************************************************)
(* The world around the relays.                                            *)
(***************************************************************************)
\* `settleBatch` is permissionless: any published proof lands while the
\* verifier's root is its previous root — this relay's send, a resend, anyone.
Settle(b) ==
    /\ b \in published
    /\ vRoot = b.prev
    /\ vRoot' = b.new
    /\ hist' = Append(hist, b.new)
    /\ UNCHANGED <<published, nextId, alive, mirror, ready, phase, inflight, kept, journal>>

\* A crash at any step: memory is lost, the disk is not.
Crash(r) ==
    /\ alive[r]
    /\ alive' = [alive EXCEPT ![r] = FALSE]
    /\ ready' = [ready EXCEPT ![r] = FALSE]
    /\ phase' = [phase EXCEPT ![r] = "idle"]
    /\ inflight' = [inflight EXCEPT ![r] = NoBatch]
    /\ mirror' = [mirror EXCEPT ![r] = Genesis]
    /\ UNCHANGED <<vRoot, hist, published, nextId, kept, journal>>

\* A stopped relay is started on another's `GET /state`: the served state
\* (that relay's mirror) is written over its kept file; its journal stays.
\* Checked, the overwrite happens only when the served root (the
\* `x-figaro-state-root` header) is the verifier's.
Takeover(r, s) ==
    /\ r # s
    /\ ~alive[r] /\ alive[s]
    /\ TakeoverChecksRoot => mirror[s] = vRoot
    /\ kept' = [kept EXCEPT ![r] = mirror[s]]
    /\ UNCHANGED <<vRoot, hist, published, nextId, alive, mirror, ready, phase, inflight, journal>>

Next ==
    \/ \E r \in Relays :
        \/ StartHolding(r) \/ StartAdopting(r) \/ StartUnread(r)
        \/ TickCurrent(r) \/ TickAdopt(r) \/ TickOutOfStep(r)
        \/ Build(r) \/ Send(r) \/ HoldAfterSend(r)
        \/ Landed(r) \/ NotLanded(r) \/ Crash(r)
    \/ \E b \in published : Settle(b)
    \/ \E r, s \in Relays : Takeover(r, s)

Spec == Init /\ [][Next]_vars

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

=============================================================================

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
(* the verifier's root, or starts on the state it rebuilds from the chain  *)
(* (`StartFromChain`). No relay serves its state to another.               *)
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
(* defeats — the code then isolates the batch's operations by splitting    *)
(* (`IsolateSpec` below), an outcome `NotLanded` covers here. `Revoke` is  *)
(* permanent here, so re-approval is out                                   *)
(* of scope, and `SendsExcludeKnownRevoked` checks the relay's discipline  *)
(* GIVEN the knowledge, never the funding read itself.                     *)
(*                                                                         *)
(* THE WORLD BEYOND THE RELAYS. `settleBatch` takes any caller, so a       *)
(* submitter that is no relay of this model can hold a copy of the state  *)
(* behind the verifier's root, build a batch on it, land it, and publish   *)
(* nothing to anyone (`ForeignSettle`; `ForeignSubmitters` admits it).    *)
(* Whether the chain then still carries what a stranger needs is the      *)
(* design switch `OpsOnChain`. TRUE is the verifier as built: every batch  *)
(* carries its whole stream of signed operations in its own transaction,   *)
(* the guest commits the stream's hash as public value 9, and              *)
(* `settleBatch` refuses a batch whose stream does not hash to it          *)
(* (`OperationsHashMismatch`), so a batch without its operations cannot    *)
(* land and the state behind any root the verifier holds is rebuilt from   *)
(* the chain alone (`StartFromChain`, the relay's rebuild-from-chain       *)
(* start). FALSE restores a verifier that does not check the stream and    *)
(* lands a batch whose operations are nowhere but a relay's files.         *)
(* `Recoverable` is therefore: some relay holds the state on disk, OR the  *)
(* chain carries every batch that ever landed. With `OpsOnChain` FALSE and *)
(* a foreign submitter the model violates `Recoverable`: that is the       *)
(* defect the batch review found, which the stream check closes.           *)
(*                                                                         *)
(* FOUR RELAY SWITCHES. All TRUE is the relay as it must run; each FALSE   *)
(* restores a defect, and the model must then violate `Recoverable`        *)
(* (the first three — checked with `OpsOnChain` and `ForeignSubmitters`    *)
(* FALSE, the world where the relay's discipline is the only keeper of     *)
(* the state) or `SendsExcludeKnownRevoked` (the fourth):                  *)
(*   HoldBeforeSend         — FALSE: the state is written after the send,  *)
(*                            so a crash between the two loses a state the *)
(*                            chain can reach                              *)
(*   HoldThroughRevert      — FALSE: a batch the chain refused drops its   *)
(*                            state, though its public proof can still     *)
(*                            land                                         *)
(*   KeepRetainsBuiltOnRoot — FALSE: adopting a root clears the whole      *)
(*                            journal, including batches built on that     *)
(*                            root and sent while the kept file lagged     *)
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
(*                                                                         *)
(* THE RESOLVE AUTHORIZATION (the third spec, `ResolveSpec`, checked by    *)
(* RelayStateResolve.cfg; the other two hold its variables still). On the  *)
(* batch path the buyer resolves by signing an authorization, which a      *)
(* relay holds until a batch applies it, and anyone holding it may apply   *)
(* it. Between the signature and its application the process can grow: a  *)
(* further order the buyer co-signs commits. The guest resolves every     *)
(* order the process holds when the authorization applies. The buyer may  *)
(* sign over the value the process holds or over one it has not reached;  *)
(* the relay holds the latter until the buyer's own later commits bring    *)
(* the process to it. `ResolvePaysSignedPrefix`: every applied             *)
(* authorization pays exactly the prefix of the process's commits whose    *)
(* cumulative value the buyer signed, every order of which the buyer       *)
(* co-signed; a value the process has not yet reached pre-authorizes       *)
(* exactly the orders that bring it there. The design switch:              *)
(*   ResolveBoundToState      — TRUE: the authorization signs the process  *)
(*                              id and a cumulative value, and the guest   *)
(*                              refuses it unless the process's cumulative *)
(*                              value at application is the signed one;    *)
(*                              every payment is at least 1, so the value  *)
(*                              rises at every commit and names at most    *)
(*                              one prefix. FALSE: the authorization signs *)
(*                              the process id alone (fails                *)
(*                              `ResolvePaysSignedPrefix`: signed over one *)
(*                              order, applied after a second commits,     *)
(*                              both are paid)                             *)
(* Signatures are unforgeable here as everywhere in this module: an       *)
(* authorization is one the buyer gave, and one whose signed value a      *)
(* relay rewrote recovers another signer, which the guest refuses.        *)
(*                                                                         *)
(* The authorization comes in two forms, as on the Core, where            *)
(* `resolveProcess` reads `msg.sender == rootBuyer` and so admits the      *)
(* buyer's key and any code the buyer's wallet installed while it held     *)
(* the key. The buyer's ECDSA signature is the first form. The second is   *)
(* a wallet-code authorization: bytes the buyer's own account code         *)
(* validates (`isValidSignature`, ERC-1271). The guest cannot run the      *)
(* wallet's code, so it checks the process, the value and the order list   *)
(* and publishes the bytes in the operation stream; the verifier calls the *)
(* buyer's code at resolution and refuses the batch unless the code        *)
(* validates the digest. Here the wallet installs its code only while it   *)
(* holds its key, the key can be lost, and the installed code authorizes   *)
(* after the loss as before it; anyone may submit bytes in the second form *)
(* for any value. `OnlyBuyerWalletResolves`: every applied resolve was     *)
(* authorized by the buyer's key or by the code the buyer's wallet         *)
(* installed. The design switch:                                           *)
(*   VerifierChecksWalletCode — TRUE: a wallet-code resolve lands only if  *)
(*                              the buyer's account has code and the code  *)
(*                              validates the digest. FALSE: the verifier  *)
(*                              takes the second form on the guest's word, *)
(*                              which checked nothing about the bytes      *)
(*                              (fails `OnlyBuyerWalletResolves`: a        *)
(*                              stranger's bytes resolve the process)      *)
(*                                                                         *)
(* THE ATTESTATION AUTHORIZATION (the fourth spec, `AttestSpec`, checked  *)
(* by RelayStateAttest.cfg; the others hold its variables still). It       *)
(* models an attestation by one party of the order (its                    *)
(* seller or its buyer; the role selects the party and the digest type,   *)
(* so one party stands for either). On the Core `attestAsSeller` reads     *)
(* `msg.sender == target.seller`, admitting the party's key and any code   *)
(* its wallet installed while it held the key. On the batch path the      *)
(* signed form carries the party's ECDSA signature, which the guest        *)
(* recovers; the wallet-code form carries bytes the party's own code       *)
(* validates, which the guest publishes unchecked in the stream's `0x05`   *)
(* entry, and the verifier asks the party's code: it emits the attestation *)
(* on the magic value and skips it otherwise, the batch landing either     *)
(* way. Anyone may submit bytes in the second form.                        *)
(* `OnlyPartyAttests`: every attestation the batch path emits was          *)
(* authorized by the party's key or by the code its wallet installed. The  *)
(* design switch:                                                          *)
(*   VerifierChecksAttestationCode — TRUE: a wallet-code attestation is    *)
(*                              emitted only if the party's account has    *)
(*                              code and the code validates the digest,   *)
(*                              and skipped otherwise. FALSE: the verifier *)
(*                              emits it on the guest's word (fails       *)
(*                              `OnlyPartyAttests`: a stranger's bytes     *)
(*                              attest for the party)                      *)
(*                                                                         *)
(* THE ISOLATION (the fifth spec, `IsolateSpec`, checked by                *)
(* RelayStateIsolate.cfg; the others hold its variables still). A batch    *)
(* the chain refuses while no re-read names a party and no operation is a  *)
(* wallet-code one is never dead-lettered whole: its operations wait       *)
(* apart, in halves, each tried alone as a batch of its own, until the     *)
(* operation that reverts alone is dead-lettered alone. A split budget of  *)
(* ⌈log2 n⌉ plus a constant bounds the extra settles; past it a set        *)
(* refused again is dead-lettered unattributed, with the reason. Any of    *)
(* the four operations may be an offender, which reverts any settle it     *)
(* rides in or lets it land. `HonestNeverDroppedForAnother`: no operation  *)
(* outside the offenders is dead-lettered; `IsolationBounded`: the settles *)
(* sent are at most the batch and two per split. With ISlack = 0 the       *)
(* budget runs out and dead-letters an honest operation                    *)
(* (`IsolationCapWitness`, RelayStateIsolateCap.cfg, must be violated).    *)
(* The model's gaps: it has no time, so no deadline or deferral window     *)
(* expires while the queue waits; no operation joins the queue during the  *)
(* isolation; and a set splits into any two halves of its size, where the  *)
(* relay halves the batch's order. The switch, the one here whose TRUE     *)
(* restores the defect:                                                    *)
(*   WholeBatchOnUnnamedRevert — TRUE: the refused batch is dead-lettered  *)
(*                              whole, the old relay (fails                *)
(*                              `HonestNeverDroppedForAnother`: an honest  *)
(*                              operation batched beside an offender is    *)
(*                              dead-lettered)                             *)
(***************************************************************************)
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS
    Relays,
    Parties,
    MaxBatches,
    HoldBeforeSend,
    HoldThroughRevert,
    KeepRetainsBuiltOnRoot,
    RebatchDropsRevoker,
    OpsOnChain,         \* the design: a batch carries its operations on chain
    ForeignSubmitters,  \* the world: a submitter that is no relay lands batches
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
    AdmitRefusesDoubleListing,
    ResolveBoundToState, \* the resolve authorization signs the cumulative value
    VerifierChecksWalletCode, \* the verifier calls the buyer's code on a
                              \* wallet-code resolve
    VerifierChecksAttestationCode, \* the verifier calls the attesting
                                   \* party's code on a wallet-code attestation
    WholeBatchOnUnnamedRevert, \* TRUE restores the old relay: a batch refused
                               \* naming nobody is dead-lettered whole
    ISlack    \* what the split budget adds to ⌈log2 n⌉

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
    knownRevoked, \* per relay: parties whose revocation a refusal showed it
    chainOps    \* batches whose signed operations are in their own transaction

vars == <<vRoot, hist, published, nextId, revoked, alive, mirror, ready, phase, inflight, kept, journal, knownRevoked, chainOps>>
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
    /\ chainOps \subseteq Batches

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
    /\ chainOps = {}

\* The chain carries every batch that ever landed: a stranger replays them
\* from genesis and holds the state behind the verifier's root.
RebuildableFromChain ==
    \A i \in DOMAIN hist : hist[i] = Genesis \/ \E b \in chainOps : b.new = hist[i]

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

\* The design's start: a relay holding nothing replays every landed batch
\* from the chain, writes the state behind the verifier's root as its kept
\* file, and starts on it.
StartFromChain(r) ==
    /\ ~alive[r]
    /\ OpsOnChain
    /\ kept[r] # vRoot
    /\ RebuildableFromChain
    /\ alive' = [alive EXCEPT ![r] = TRUE]
    /\ kept' = [kept EXCEPT ![r] = vRoot]
    /\ mirror' = [mirror EXCEPT ![r] = vRoot]
    /\ journal' = [journal EXCEPT ![r] = Retain(journal[r], vRoot)]
    /\ UNCHANGED <<vRoot, hist, published, nextId, revoked, ready, phase, inflight, knownRevoked>>

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
    /\ chainOps' = IF OpsOnChain THEN chainOps \cup {b} ELSE chainOps
    /\ UNCHANGED <<published, nextId, revoked, alive, mirror, ready, phase, inflight, kept, journal, knownRevoked>>

\* A submitter that is no relay here holds a copy of the state behind the
\* verifier's root (the state is published; anyone may copy it), builds a
\* batch on it, lands it, and publishes nothing: no relay's mirror, kept
\* file or journal learns the new state. The verifier admits the batch
\* under the same rule as any other, and records its operations on chain
\* exactly when the design makes it refuse a batch without them.
ForeignSettle ==
    /\ ForeignSubmitters
    /\ nextId <= MaxBatches
    /\ \E ps \in SUBSET (Parties \ revoked) :
        /\ ps # {}
        /\ LET b == [prev |-> vRoot, new |-> nextId, parties |-> ps] IN
            /\ vRoot' = b.new
            /\ hist' = Append(hist, b.new)
            /\ chainOps' = IF OpsOnChain THEN chainOps \cup {b} ELSE chainOps
    /\ nextId' = nextId + 1
    /\ UNCHANGED <<published, revoked, alive, mirror, ready, phase, inflight, kept, journal, knownRevoked>>

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

Next ==
    \/ /\ \E r \in Relays :
            \/ StartHolding(r) \/ StartAdopting(r) \/ StartUnread(r) \/ StartFromChain(r)
            \/ TickCurrent(r) \/ TickAdopt(r) \/ TickOutOfStep(r)
            \/ Build(r) \/ Send(r) \/ HoldAfterSend(r)
            \/ Landed(r) \/ NotLanded(r) \/ RefusedRevoked(r) \/ Crash(r)
       /\ UNCHANGED chainOps
    \/ \E b \in published : Settle(b)
    \/ ForeignSettle
    \/ /\ \E p \in Parties : Revoke(p)
       /\ UNCHANGED chainOps

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

(***************************************************************************)
(* THE RESOLVE AUTHORIZATION (kernel.rs's `apply_resolve`, eip712.rs's     *)
(* `resolve_struct_hash`).                                                 *)
(***************************************************************************)
ROrders == {"oA", "oB", "oC"}
\* Every payment is at least 1: the Core refuses a zero payment.
RPayments == 1..2
RMaxCv == Cardinality(ROrders) * 2

VARIABLES
    rSeq,       \* the orders the process holds, in commit order, all active
                \* until resolution; every one co-signed by the buyer
    rPay,       \* each committed order's payment (0 for one not committed)
    rCv,        \* the process's cumulative value: the sum of their payments
    rResolved,  \* the process is resolved
    rAuths,     \* the cumulative values the buyer signed authorizations
                \* over; anyone holding one may apply it
    rPaid,      \* ghost: the orders the resolution paid
    rSigned,    \* ghost: the cumulative value the applied authorization signed
    rKey,       \* the buyer's wallet holds its key
    rCode,      \* the buyer's wallet carries code it installed with its key
    rCodeAuths, \* the cumulative values the installed code validates
    rBy         \* ghost: who authorized the applied resolve — "key", "code"
                \* (the wallet's installed code) or "other"

VARIABLES
    aKey,       \* the attesting party's wallet holds its key
    aCode,      \* the party's wallet carries code it installed with its key
    aSigned,    \* the party signed the attestation with its key
    aCodeAuth,  \* the installed code validates the attestation's digest
    aBy         \* ghost: who authorized each attestation the batch path
                \* emitted — "key", "code" or "other"

resolveVars == <<rSeq, rPay, rCv, rResolved, rAuths, rPaid, rSigned, rKey, rCode, rCodeAuths, rBy>>
avars == <<aKey, aCode, aSigned, aCodeAuth, aBy>>
rvars == <<resolveVars, avars>>

VARIABLES
    iBad,       \* the operations that revert any settle they ride in, naming
                \* nobody; the adversary's choice, made at the start
    iQueue,     \* the operations queued, drained together as one batch
    iSets,      \* the isolation (`Mempool::isolate`): sets waiting apart,
                \* oldest first, each tried alone as a batch of its own
    iBudget,    \* the splits left to the batch the sets came from
    iLanded,    \* operations a settle landed
    iDead,      \* why each operation was dead-lettered ("no": it was not)
    iTries      \* ghost: the settles sent

ivars == <<iBad, iQueue, iSets, iBudget, iLanded, iDead, iTries>>
everyvars == <<allvars, rvars, ivars>>

\* The cumulative value of the first k orders the process committed.
RECURSIVE PrefixSum(_)
PrefixSum(k) == IF k = 0 THEN 0 ELSE PrefixSum(k - 1) + rPay[rSeq[k]]

RTypeOK ==
    /\ rSeq \in Seq(ROrders)
    /\ Len(rSeq) <= Cardinality(ROrders)
    /\ rPay \in [ROrders -> 0..2]
    /\ rCv \in 0..RMaxCv
    /\ rResolved \in BOOLEAN
    /\ rAuths \subseteq 0..RMaxCv
    /\ rPaid \subseteq ROrders
    /\ rSigned \in 0..RMaxCv
    /\ rKey \in BOOLEAN
    /\ rCode \in BOOLEAN
    /\ rCodeAuths \subseteq 0..RMaxCv
    /\ rBy \in {"none", "key", "code", "other"}
    /\ aKey \in BOOLEAN
    /\ aCode \in BOOLEAN
    /\ aSigned \in BOOLEAN
    /\ aCodeAuth \in BOOLEAN
    /\ aBy \subseteq {"key", "code", "other"}

RInit ==
    /\ rSeq = <<>>
    /\ rPay = [o \in ROrders |-> 0]
    /\ rCv = 0
    /\ rResolved = FALSE
    /\ rAuths = {}
    /\ rPaid = {}
    /\ rSigned = 0
    /\ rKey = TRUE
    /\ rCode = FALSE
    /\ rCodeAuths = {}
    /\ rBy = "none"
    /\ aKey = TRUE
    /\ aCode = FALSE
    /\ aSigned = FALSE
    /\ aCodeAuth = FALSE
    /\ aBy = {}

\* A commit, the buyer's and its seller's signatures both on it: the root
\* order creates the process, each later one extends it while it is open.
RCommit(o, p) ==
    /\ ~rResolved
    /\ o \notin Range(rSeq)
    /\ rSeq' = Append(rSeq, o)
    /\ rPay' = [rPay EXCEPT ![o] = p]
    /\ rCv' = rCv + p
    /\ UNCHANGED <<rResolved, rAuths, rPaid, rSigned, rKey, rCode, rCodeAuths, rBy>>

\* The buyer signs a resolve over the value the process holds or over one it
\* has not reached.
RSign(v) ==
    /\ ~rResolved
    /\ rKey
    /\ rSeq # <<>>
    /\ v >= rCv
    /\ rAuths' = rAuths \cup {v}
    /\ UNCHANGED <<rSeq, rPay, rCv, rResolved, rPaid, rSigned, rKey, rCode, rCodeAuths, rBy>>

\* The buyer's wallet installs its own code (an EIP-7702 delegation carrying
\* the wallet's own guardian authorization), which needs the key.
RInstall ==
    /\ rKey
    /\ ~rCode
    /\ rCode' = TRUE
    /\ UNCHANGED <<rSeq, rPay, rCv, rResolved, rAuths, rPaid, rSigned, rKey, rCodeAuths, rBy>>

\* The buyer loses its key; whatever its wallet installed stays.
RLoseKey ==
    /\ rKey
    /\ rKey' = FALSE
    /\ UNCHANGED <<rSeq, rPay, rCv, rResolved, rAuths, rPaid, rSigned, rCode, rCodeAuths, rBy>>

\* The installed code authorizes a resolve over the value the process holds
\* or one it has not reached, with the key or without it.
RCodeSign(v) ==
    /\ ~rResolved
    /\ rCode
    /\ rSeq # <<>>
    /\ v >= rCv
    /\ rCodeAuths' = rCodeAuths \cup {v}
    /\ UNCHANGED <<rSeq, rPay, rCv, rResolved, rAuths, rPaid, rSigned, rKey, rCode, rBy>>

\* A batch applies an authorization, whoever holds it. The guest resolves
\* every order the process holds (the listing must be complete), and under
\* the design refuses one whose signed value is not the process's now.
RApply(v) ==
    /\ ~rResolved
    /\ ResolveBoundToState => v = rCv
    /\ rResolved' = TRUE
    /\ rPaid' = Range(rSeq)
    /\ rSigned' = v
    /\ rBy' = "key"
    /\ UNCHANGED <<rSeq, rPay, rCv, rAuths, rKey, rCode, rCodeAuths>>

\* A batch applies a wallet-code resolve: bytes anyone submitted for value
\* v. The guest checks the process, the value and the list as for the
\* first form and nothing about the bytes; under the design the verifier
\* then requires the buyer's account to have code and the code to validate
\* the digest, and refuses the batch otherwise.
RApplyCode(v) ==
    /\ ~rResolved
    /\ rSeq # <<>>     \* the guest refuses an unknown process
    /\ ResolveBoundToState => v = rCv
    /\ VerifierChecksWalletCode => (rCode /\ v \in rCodeAuths)
    /\ rResolved' = TRUE
    /\ rPaid' = Range(rSeq)
    /\ rSigned' = v
    /\ rBy' = IF rCode /\ v \in rCodeAuths THEN "code" ELSE "other"
    /\ UNCHANGED <<rSeq, rPay, rCv, rAuths, rKey, rCode, rCodeAuths>>

(***************************************************************************)
(* THE ATTESTATION AUTHORIZATION (kernel.rs's `apply_attestation`,         *)
(* FigaroBatchVerifier's `_attestByWalletCode`).                           *)
(***************************************************************************)

\* The party signs the attestation with its key.
ASign ==
    /\ aKey
    /\ aSigned' = TRUE
    /\ UNCHANGED <<aKey, aCode, aCodeAuth, aBy>>

\* The party's wallet installs its own code, which needs the key.
AInstall ==
    /\ aKey
    /\ ~aCode
    /\ aCode' = TRUE
    /\ UNCHANGED <<aKey, aSigned, aCodeAuth, aBy>>

\* The party loses its key; whatever its wallet installed stays.
ALoseKey ==
    /\ aKey
    /\ aKey' = FALSE
    /\ UNCHANGED <<aCode, aSigned, aCodeAuth, aBy>>

\* The installed code validates the attestation, with the key or without it.
ACodeSign ==
    /\ aCode
    /\ aCodeAuth' = TRUE
    /\ UNCHANGED <<aKey, aCode, aSigned, aBy>>

\* A batch applies the signed form: the guest recovers the party's
\* signature, unforgeable here, and the event is in public value 6.
AApply ==
    /\ aSigned
    /\ aBy' = aBy \cup {"key"}
    /\ UNCHANGED <<aKey, aCode, aSigned, aCodeAuth>>

\* A batch carries a wallet-code attestation: bytes anyone submitted. The
\* guest checks nothing about the bytes; under the design the verifier asks
\* the party's code and emits the attestation only on the magic value,
\* skipping it otherwise while the batch lands.
AApplyCode ==
    /\ LET validated == aCode /\ aCodeAuth IN
        aBy' = IF validated THEN aBy \cup {"code"}
               ELSE IF VerifierChecksAttestationCode THEN aBy
               ELSE aBy \cup {"other"}
    /\ UNCHANGED <<aKey, aCode, aSigned, aCodeAuth>>

ANext == ASign \/ AInstall \/ ALoseKey \/ ACodeSign \/ AApply \/ AApplyCode

RResolveNext ==
    \/ \E o \in ROrders, p \in RPayments : RCommit(o, p)
    \/ \E v \in 0..RMaxCv : RSign(v)
    \/ \E v \in rAuths : RApply(v)
    \/ RInstall
    \/ RLoseKey
    \/ \E v \in 0..RMaxCv : RCodeSign(v)
    \/ \E v \in 0..RMaxCv : RApplyCode(v)

RNext == RResolveNext /\ UNCHANGED avars

(***************************************************************************)
(* THE ISOLATION of a batch the chain refused naming nobody (submitter.rs's *)
(* `classify_deterministic_revert`, mempool.rs's `isolate` and             *)
(* `drain_up_to`, main.rs's deterministic arm).                            *)
(***************************************************************************)
IOps == {"o1", "o2", "o3", "o4"}
\* `ISlack`, the constant the split budget adds to the batch's log2: 1 is
\* the least that covers every split four operations can need (three, when
\* all four revert); 0 lets the budget run out (`IsolationCapWitness`). The
\* relay's `ISOLATION_SPLIT_SLACK` is 8, sized for a batch of `MAX_BATCH_OPS`
\* carrying two offenders.
CeilLog2(n) == CHOOSE k \in 0..n : 2^k >= n /\ (k = 0 \/ 2^(k - 1) < n)
IBudgetOf(n) == CeilLog2(n) + ISlack
IReasons == {"no", "alone", "cap", "whole"}

ITypeOK ==
    /\ iBad \subseteq IOps
    /\ iQueue \subseteq IOps
    /\ iSets \in Seq(SUBSET IOps)
    /\ iBudget \in 0..IBudgetOf(Cardinality(IOps))
    /\ iLanded \subseteq IOps
    /\ iDead \in [IOps -> IReasons]
    /\ iTries \in Nat

\* The other specs hold the isolation still, with no offender.
IInit ==
    /\ iBad = {}
    /\ iQueue = IOps
    /\ iSets = <<>>
    /\ iBudget = 0
    /\ iLanded = {}
    /\ iDead = [o \in IOps |-> "no"]
    /\ iTries = 0

\* The isolation's own start: any set of the operations are offenders.
IInitAny ==
    /\ iBad \in SUBSET IOps
    /\ iQueue = IOps
    /\ iSets = <<>>
    /\ iBudget = 0
    /\ iLanded = {}
    /\ iDead = [o \in IOps |-> "no"]
    /\ iTries = 0

\* A tick's batch: the isolation's oldest set alone, when one waits (the
\* queue waits behind it); else the queue, a fresh batch with a fresh
\* budget. A settle carrying an offender may be refused, naming nobody; an
\* offender may also let a settle land. A refused set of one is
\* dead-lettered: it reverts alone. A larger one is split into halves that
\* wait apart at the front, in some order (the relay halves the execution
\* order), spending one split; with no split left it is dead-lettered
\* unattributed. WholeBatchOnUnnamedRevert = TRUE restores the old relay:
\* the refused batch is dead-lettered whole.
ITry ==
    /\ iQueue # {} \/ iSets # <<>>
    /\ LET fromSet == iSets # <<>>
           S == IF fromSet THEN Head(iSets) ELSE iQueue
           rest == IF fromSet THEN Tail(iSets) ELSE <<>>
           budget == IF fromSet THEN iBudget ELSE IBudgetOf(Cardinality(S))
       IN
        /\ iQueue' = IF fromSet THEN iQueue ELSE {}
        /\ iTries' = iTries + 1
        /\ \E refused \in (IF S \cap iBad # {} THEN BOOLEAN ELSE {FALSE}) :
            IF ~refused
            THEN /\ iLanded' = iLanded \cup S
                 /\ iSets' = rest
                 /\ iBudget' = budget
                 /\ UNCHANGED <<iBad, iDead>>
            ELSE IF WholeBatchOnUnnamedRevert \/ Cardinality(S) = 1 \/ budget = 0
            THEN /\ iDead' = [o \in IOps |->
                                IF o \in S
                                THEN (IF WholeBatchOnUnnamedRevert THEN "whole"
                                      ELSE IF Cardinality(S) = 1 THEN "alone"
                                      ELSE "cap")
                                ELSE iDead[o]]
                 /\ iSets' = rest
                 /\ iBudget' = budget
                 /\ UNCHANGED <<iBad, iLanded>>
            ELSE \E A \in SUBSET S :
                    /\ Cardinality(A) = (Cardinality(S) + 1) \div 2
                    /\ iSets' = <<A, S \ A>> \o rest
                    /\ iBudget' = budget - 1
                    /\ UNCHANGED <<iBad, iLanded, iDead>>

\* No honest operation is dead-lettered because another operation's revert
\* was unattributable: whatever operations are offenders, and whether or not
\* each offender lets a settle land.
HonestNeverDroppedForAnother == \A o \in IOps \ iBad : iDead[o] = "no"

\* The extra work is bounded: the batch and two settles per split.
IsolationBounded == iTries <= 2 * IBudgetOf(Cardinality(IOps)) + 1

\* A reachability witness, checked as an invariant that must be VIOLATED
\* (RelayStateIsolateCap.cfg, ISlack = 0): the budget runs out and
\* dead-letters an honest operation beside an offender, unattributed. The
\* residual the handover's limitation 3 states is reachable.
IsolationCapWitness == ~(\E o \in IOps \ iBad : iDead[o] = "cap")

Spec == Init /\ DInit /\ RInit /\ IInit /\ [][Next /\ UNCHANGED <<dvars, rvars, ivars>>]_everyvars

DeferSpec == Init /\ DInit /\ RInit /\ IInit /\ [][DNext /\ UNCHANGED <<vars, rvars, ivars>>]_everyvars

ResolveSpec == Init /\ DInit /\ RInit /\ IInit /\ [][RNext /\ UNCHANGED <<vars, dvars, ivars>>]_everyvars

AttestSpec == Init /\ DInit /\ RInit /\ IInit /\ [][ANext /\ UNCHANGED <<vars, dvars, resolveVars, ivars>>]_everyvars

IsolateSpec == Init /\ DInit /\ RInit /\ IInitAny /\ [][ITry /\ UNCHANGED <<vars, dvars, rvars>>]_everyvars

\* Every applied resolve pays exactly the prefix of the process's commits
\* whose cumulative value the buyer signed: some prefix sums to the signed
\* value, and the orders paid are that prefix's. Every order of it the buyer
\* co-signed (a commit carries both signatures), so a value signed ahead of
\* the state pays exactly the orders that brought the process to it.
ResolvePaysSignedPrefix ==
    rResolved =>
        \E k \in 0..Len(rSeq) :
            /\ PrefixSum(k) = rSigned
            /\ rPaid = {rSeq[i] : i \in 1..k}

\* Only the buyer's wallet resolves, by its key or by the code it installed
\* while it held the key: the Core's `msg.sender == rootBuyer`, read on the
\* batch path.
OnlyBuyerWalletResolves ==
    rResolved => rBy \in {"key", "code"}

\* Only the attesting party attests, by its key or by the code its wallet
\* installed while it held the key: the coordinator's `msg.sender ==
\* target.seller` (or `target.buyer`), read on the batch path.
OnlyPartyAttests ==
    aBy \subseteq {"key", "code"}

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

\* The state behind the verifier's root can be had: some relay has it on
\* disk — whatever crashed, whatever was refused, whoever sent the batch
\* that landed — or the chain carries every batch that landed, so a
\* stranger rebuilds it. With `OpsOnChain` FALSE a foreign submitter's
\* batch leaves neither, and the model violates this.
Recoverable ==
    \/ vRoot = Genesis
    \/ \E r \in Relays : vRoot = kept[r] \/ vRoot \in JournalRoots(r)
    \/ RebuildableFromChain

\* Under the design, no landing path escapes the rule: every batch that ever
\* moved the root, a relay's or a foreign submitter's, has its operations in
\* its own transaction.
ChainCarriesEveryLandedBatch == OpsOnChain => RebuildableFromChain

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

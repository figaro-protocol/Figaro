# The Data Layer

Every process leaves a trail: what was committed, what was attested, what was
resolved. That trail is **data**, and a seam runs through it. The chain's events are
public, free to anyone who reads the chain, and deliberately so: each order's parties,
token, amounts and `checkoutHash`, each resolution's payouts, and each attestation's
clause, stage and content fingerprint. From that fingerprint a stranger reaches the
attestation content its attester pinned. The agreement body behind a `checkoutHash`
is reached by a URI the chain never carries, so a stranger reads it only where a
party publishes it. The private detail belongs to the parties, who keep it sealed or
sell it on their own terms.

This document states the seam and why it falls where it does. It does not enumerate
graphs. A graph is something a reader DERIVES from the data it can reach, so what
can be drawn changes as the clause registry changes; a reader composing a clause
family this document never named draws its view the same way as any other. How an
agent performs that reading is `AI_AGENT_COORDINATION.md`.

---

## The public side, and the rule that decides it

**A datum is a committed public field iff the mechanism needs it beyond the
two order endpoints** — bond and payment verification, document derivation
(invoice, bill of lading), or read-time and dispute verification — **and it is
committed at no finer grain than that need requires** (a neighborhood geohash
cell, never a door; a keccak hash, never the plaintext). **A datum only the
counterparty operationally needs** (door-grade address, addressee name, floor,
instructions) **travels the per-order channel** (`@figaro-protocol/sdk/handoff`),
**with a wallet-signed hash anchor on-chain for tamper evidence** — revealed to
a dispute forum by the party who holds it, verifiable against the anchor, and
crypto-shreddable until then.

A committed public field is committed in the clear in the agreement body, never
sealed: whoever holds the body reads it and checks it against `checkoutHash`. The
chain carries only that hash, and the body's URI travels in the order's payload,
never in an event (`frontend/lib/core/agreementFetch.ts`). A stranger reaches a
public field only where a party publishes it: in attestation content, which a
reader reaches from the `Attestation` event's `contentRef`
(`frontend/lib/data/graphCorpus.ts`, `fetchWitnessContent`), or by disclosing the
body.

**The rule sorts each datum by who needs it, so no party lacks a datum its
trade needs.** A datum the mechanism needs is public; a datum the
counterparty needs travels sealed to the counterparty. A sealed field is
privacy against outsiders, never a datum kept from a party to the order.

Evidence follows the same pattern: the public artifact carries the coarsest
mechanism-sufficient grain (the geohash cell, blinded fingerprints of device
identifiers) plus the hash of the raw capture; full fidelity stays party-held
for dispute-time revelation. Raw coordinates and stable device identifiers
never land on a public artifact. A public fingerprint links no two orders and
confirms no guessed value: each capture draws its own 32-byte blinding value
through the SDK's entropy source (`freshBlindingHex`), and keeps it in the raw
capture. A tag's serial and a Bluetooth device id are published as
`keccak256` over that value and the identifier
(`blindedIdentifierFingerprint`), and the raw capture's hash covers the value
too (`toPublicEvidence` in `frontend/lib/shared/deviceEvidence.ts`). The holder
discloses the raw capture to a forum, which recomputes every fingerprint from
it. The capture's kind and time, its geohash cell and accuracy, and the
types of its NDEF records stay public, and two orders that share them can be
linked by them. Where the rule caps a public field's precision, the clause
validator holds the cap, never one frontend's taste and never the spec: the
SDK's `validateContent` (`sdk/src/clauses/validate.ts`, with the caps in
`sdk/src/clauses/grain.ts`) carries one table of caps, keyed by the field's
disposition and its standard. The spec declares no cap. It declares the standard and the
disposition, and a structural ceiling (`maxLength`): the field's `disposition`
(absent reads as public), and its format, static (`format`) or named by a
sibling (the value of the field `formatFromField` names, as the
`figaro-geolocation` spec in `clauses/` names its `geocodeStandard`). When that
format is one of the four standards in the table, the validator refuses
a value finer than its disposition's cap, and a value that is no code of the
standard. The public caps are neighborhood grade: a geohash of 6 characters, an
H3 cell of resolution 8, an S2 cell of level 13, an Open Location Code of
length 6. The private caps are 12 characters, resolution 15, level 30 and
length 15 (`docs/CLAUSES.md` gives the equivalence). A standard outside the
table is bounded by `maxLength` only. The `figaro-geolocation` spec names only
the four in its `geocodeStandard` enum, so its public `origin` and
`destination` are capped under every standard it admits; a clause whose
standard is a free string accepts a standard the table does not hold
(`docs/DESIGN_DECISIONS.md`, the entry on the grain cap's firmness).
A member profile's location is the member's own publication, read as written:
the SDK's profile parser (`sdk/src/memberProfile.ts`, `parseLocation`) applies
no cap, so a profile already published stays readable, and the reference
profile form (`frontend/components/members/OnboardingProfileForm.tsx`,
`clampPublicGeohash`) clamps the geohash to 6 characters when a member writes one.
The sign gate (`assertAgreementSignable`) runs that validation, so a party whose
tool uses the SDK refuses to sign a finer value. The limit of the rule: the
chain holds a fingerprint, so two parties whose tools skip this validation can
commit a finer value, and every reader of the SDK then shows it as it is,
because no read path of committed content validates it. A commit and an
attestation carry a fingerprint on both paths, and neither the chain nor the
proof program reads the content behind it (`docs/DESIGN_DECISIONS.md` § 26).

## The fields the chain's events carry, and who reads them

The rule above, applied to the chain itself. Every event a trade causes is
listed here, field by field, from the ABIs the contracts compile to (`abi/*.json`):
the Core's four contracts (`CommitmentTypes` is a library and declares none) and
the designer-rewards counter `UsageCounter`, whose `UsageRecorded` a resolution
causes. Each row says who reads the field and where in the code, and the grain the
chain carries it at. A reader cell names the code that reads the field; where the
only reader found is one of the order's own two parties, the cell says so; where no
code of ours reads the field, the cell says "no reader found" and names the
question the field answers for a stranger's reader, read from the contract that
emits it (`docs/DESIGN_DECISIONS.md` § 29). The
events `FigaroCore` and `FigaroBatchVerifier` share have the same fields and the
same readers, since a reader folds the two paths by address. `sdk/tests/abiParity.test.ts`
("data: every field an event carries has a row") fails when a compiled event gains,
loses, moves or retypes a field and this table does not move with it.

| Emitted by | Event | # | Field | Type | Who reads it, and where | Grain |
|---|---|---|---|---|---|---|
| `FigaroCore`, `FigaroBatchVerifier` | `OrderCommitted` | 0 | `orderHash` | `bytes32 indexed` | Any reader of the public data joins an order's later events to it: resolution (`sdk/src/state.ts:196`), attestations (`sdk/src/derive/attestation.ts:41`) | A fingerprint: the order's EIP-712 digest |
| `FigaroCore`, `FigaroBatchVerifier` | `OrderCommitted` | 1 | `processId` | `bytes32 indexed` | Every co-seller and any reader groups a process's orders by it (`sdk/src/derive/graphs.ts:129`) | A fingerprint: the root order's digest |
| `FigaroCore`, `FigaroBatchVerifier` | `OrderCommitted` | 2 | `buyer` | `address indexed` | Any reader of the public data: the resolution graph (`sdk/src/derive/graphs.ts:117`) and the buyer-to-seller pairs (`sdk/src/derive/queries.ts:165`) | The wallet's address |
| `FigaroCore`, `FigaroBatchVerifier` | `OrderCommitted` | 3 | `seller` | `address` | The same readers (`sdk/src/derive/graphs.ts:118`, `sdk/src/derive/queries.ts:165`); a co-seller sees the other sellers of its process | The wallet's address |
| `FigaroCore`, `FigaroBatchVerifier` | `OrderCommitted` | 4 | `token` | `address` | A forum's evidence file names the token the chain moved (`frontend/lib/data/audit/contractExtract.ts:153`); the resolution graph's denomination (`sdk/src/derive/graphs.ts:131`) | The token's address |
| `FigaroCore`, `FigaroBatchVerifier` | `OrderCommitted` | 5 | `payment` | `uint256` | Any reader: the volume per denomination (`sdk/src/derive/queries.ts:166`) and the bonds locked (`sdk/src/derive/graphs.ts:114`) | The exact amount, in the token's smallest unit |
| `FigaroCore`, `FigaroBatchVerifier` | `OrderCommitted` | 6 | `runningTotal` | `uint256` | Any reader derives each seller's bond from it (`sdk/src/derive/graphs.ts:114`); a software agent of a party reads it to know a seller's bond (`sdk/src/agent/proposer.ts:145`) | The exact amount |
| `FigaroCore`, `FigaroBatchVerifier` | `OrderCommitted` | 7 | `checkoutHash` | `bytes32` | A forum checks the agreement body against it (`frontend/lib/data/audit/hashAppendix.ts:87`) and looks the agreement up by it (`frontend/lib/data/audit/auditBundlePdf.ts:111`) | A fingerprint: the agreement's merkle root |
| `FigaroCore`, `FigaroBatchVerifier` | `OrderCommitted` | 8 | `salt` | `uint256` | Whoever rebuilds the signed commitment from events alone: the buyer's resolution (`sdk/src/commitments.ts:279`, called by `sdk/src/agent/proposer.ts:168`) and a forum's evidence file (`frontend/lib/data/audit/contractExtract.ts:156`) | A random 256-bit number (`sdk/src/commitments.ts:308`), no party's data |
| `FigaroCore`, `FigaroBatchVerifier` | `OrderCommitted` | 9 | `commitDeadline` | `uint256` | The same readers (`sdk/src/commitments.ts:280`, `frontend/lib/data/audit/contractExtract.ts:157`) | A time in seconds |
| `FigaroCore`, `FigaroBatchVerifier` | `OrderSeller` | 0 | `orderHash` | `bytes32 indexed` | A reader listing the orders a wallet sold, the seller itself among them (`frontend/lib/core/indexer.ts:265`) | A fingerprint, repeated from `OrderCommitted` |
| `FigaroCore`, `FigaroBatchVerifier` | `OrderSeller` | 1 | `seller` | `address indexed` | The same reader (`frontend/lib/core/indexer.ts:264`) | The wallet's address, repeated from `OrderCommitted` so it can be indexed |
| `FigaroCore`, `FigaroBatchVerifier` | `OrderResolved` | 0 | `orderHash` | `bytes32 indexed` | Any reader marks the order resolved (`sdk/src/state.ts:196`); a forum's timeline (`frontend/lib/data/audit/processTimeline.ts:289`) | A fingerprint |
| `FigaroCore`, `FigaroBatchVerifier` | `OrderResolved` | 1 | `processId` | `bytes32 indexed` | Only the order's own parties: a party purges its sealed-channel keys for the process (`frontend/lib/data/handoff/useHandoffCleanup.ts:88`) | A fingerprint |
| `FigaroCore`, `FigaroBatchVerifier` | `OrderResolved` | 2 | `sellerPayout` | `uint256` | Any reader of the resolution graph (`sdk/src/state.ts:200`); a forum's timeline (`frontend/lib/data/audit/processTimeline.ts:280`) | The exact amount |
| `FigaroCore`, `FigaroBatchVerifier` | `OrderResolved` | 3 | `buyerPayout` | `uint256` | The same readers (`sdk/src/state.ts:201`, `frontend/lib/data/audit/processTimeline.ts:281`) | The exact amount |
| `FigaroCore`, `FigaroBatchVerifier` | `ProcessResolved` | 0 | `processId` | `bytes32 indexed` | Any reader marks the process resolved (`sdk/src/state.ts:205`); a party waits on it after a batched resolution (`sdk/src/relay/index.ts:149`) | A fingerprint |
| `FigaroCore`, `FigaroBatchVerifier` | `ProcessResolved` | 1 | `buyer` | `address indexed` | no reader found: decoded (`sdk/src/events.ts:90`) and never read. It answers a stranger's question: which processes did this wallet close as buyer? A filter on the indexed topic finds them without reading any order (`src/core/kernel/FigaroCore.sol:291`) | The wallet's address, repeated from `OrderCommitted` |
| `FigaroCore`, `FigaroBatchVerifier` | `ProcessResolved` | 2 | `orderCount` | `uint256` | no reader found: decoded (`sdk/src/events.ts:91`) and never read. It answers a stranger's question: how many orders did this one call pay? A reader checks it against the `OrderResolved` events it holds (`src/core/kernel/FigaroCore.sol:291`, `src/core/verifier/FigaroBatchVerifier.sol:756`) | A count |
| `FigaroCore`, `FigaroBatchVerifier` | `EIP712DomainChanged` | — | — | — | no reader found: OpenZeppelin's `EIP712` declares the event and nothing in `src/` emits it. It answers the question ERC-5267 asks: did the signing domain change? The domain is fixed at construction, so the answer is never (`src/core/kernel/FigaroCore.sol:27`) | No field |
| `AttestationCoordinator`, `FigaroBatchVerifier` | `Attestation` | 0 | `orderHash` | `bytes32 indexed` | Any reader groups attestations by order (`sdk/src/derive/attestation.ts:41`) | A fingerprint |
| `AttestationCoordinator`, `FigaroBatchVerifier` | `Attestation` | 1 | `processId` | `bytes32 indexed` | Any reader: attestations by process (`sdk/src/derive/attestation.ts:31`); the data explorer attributes a process to its assembly (`frontend/lib/data/graphCorpus.ts:247`) | A fingerprint |
| `AttestationCoordinator`, `FigaroBatchVerifier` | `Attestation` | 2 | `attester` | `address indexed` | The data explorer counts distinct attesters per clause (`frontend/lib/data/explorer.ts:344`); a forum's evidence file names the attester (`frontend/lib/data/audit/processLogsExtract.ts:104`) | The wallet's address |
| `AttestationCoordinator`, `FigaroBatchVerifier` | `Attestation` | 3 | `clauseId` | `bytes32` | Any reader groups attestations by clause (`sdk/src/derive/overlay.ts:112`); a forum's evidence file (`frontend/lib/data/audit/processLogsExtract.ts:81`) | A fingerprint: the clause key |
| `AttestationCoordinator`, `FigaroBatchVerifier` | `Attestation` | 4 | `stage` | `uint8` | Any reader decodes the content by the stage's shape (`sdk/src/derive/overlay.ts:133`); a forum's evidence file (`frontend/lib/data/audit/processLogsExtract.ts:85`) | A small number |
| `AttestationCoordinator`, `FigaroBatchVerifier` | `Attestation` | 5 | `contentRef` | `bytes32` | Any reader fetches the content by it (`frontend/lib/data/graphCorpus.ts:304`) and checks the bytes against it (`sdk/src/anchored.ts:191`) | A fingerprint: `keccak256` of the content; a private set's content carries its blinding value, a public set's carries none |
| `FigaroBatchVerifier` | `BatchOperations` | 0 | `batchId` | `uint64 indexed` | A relay rebuilding the batch path's state from the chain pairs the log with its `BatchSettled` (`prover/sequencer/src/rebuild.rs:91`); the SDK's reader of the uses a batch left uncounted pairs it with the `BatchAccrualSkipped` of the same transaction and batch id (`sdk/src/rpgf/index.ts:437`) | A counter |
| `FigaroBatchVerifier` | `BatchOperations` | 1 | `blockTimestamp` | `uint64` | The same relay replays the batch at that clock (`prover/sequencer/src/rebuild.rs:105`) | A time in seconds |
| `FigaroBatchVerifier` | `BatchOperations` | 2 | `usagePeriod` | `uint8` | The SDK's reader of the uses a batch left uncounted returns it as the period its claims were applied under (`sdk/src/rpgf/index.ts:438`) | A period number |
| `FigaroBatchVerifier` | `BatchOperations` | 3 | `provenanceLeaf` | `bytes32` | The same SDK reader returns it beside the period (`sdk/src/rpgf/index.ts:439`) | A fixed key, the same for every batch |
| `FigaroBatchVerifier` | `BatchOperations` | 4 | `operations` | `bytes` | The same relay decodes and replays them (`prover/sequencer/src/rebuild.rs:103`); the same SDK reader reads each usage claim whole from them (`sdk/src/operationStream.ts:112`, called at `sdk/src/rpgf/index.ts:454`) | Every commitment field, signature and fingerprint of the batch; no clause content (`sdk/tests/abiParity.test.ts`, "data: the chain holds a fingerprint") |
| `FigaroBatchVerifier` | `BatchSettled` | 0 | `batchId` | `uint64 indexed` | A party waiting on its batched resolution (`sdk/src/relay/index.ts:167`); a rebuilding relay (`prover/sequencer/src/rebuild.rs:91`) | A counter |
| `FigaroBatchVerifier` | `BatchSettled` | 1 | `prevStateRoot` | `bytes32 indexed` | A rebuilding relay checks the chain of roots (`prover/sequencer/src/rebuild.rs:94`) | A fingerprint: a state root |
| `FigaroBatchVerifier` | `BatchSettled` | 2 | `newStateRoot` | `bytes32 indexed` | The same relay (`prover/sequencer/src/rebuild.rs:110`) | A fingerprint: a state root |
| `FigaroBatchVerifier` | `BatchSettled` | 3 | `positionCount` | `uint256` | no reader found. It answers a stranger's question: how many net token positions did this batch move, each with at most one transfer? (`src/core/verifier/FigaroBatchVerifier.sol:490`) | A count |
| `FigaroBatchVerifier` | `BatchAccrualSkipped` | 0 | `batchId` | `uint64 indexed` | A party finding the uses a batch left uncounted, to send them again, reads the claims and uses from the `BatchOperations` log of the same transaction and batch id, on every call route (`fetchSkippedBatchUses`, `sdk/src/rpgf/index.ts:447`); the Sepolia monitor (`scripts/monitor-sepolia.mjs:145`) | A counter |
| `FigaroBatchVerifier` | `BatchAccrualSkipped` | 1 | `reason` | `bytes` | The same reader passes it on unread (`sdk/src/rpgf/index.ts:434`); the Sepolia monitor reports it (`scripts/monitor-sepolia.mjs:149`) | The counter's revert data |
| `UsageCounter` | `UsageRecorded` | 0 | `kind` | `uint8` | A designer's reward accrual keys each use by kind and key (`sdk/src/rpgf/index.ts:207`) | A small number |
| `UsageCounter` | `UsageRecorded` | 1 | `clauseOrProcess` | `bytes32 indexed` | The same accrual (`sdk/src/rpgf/index.ts:206`) | A fingerprint: a clause key, an `agreementHash` or an `processDesignHash` |
| `UsageCounter` | `UsageRecorded` | 2 | `period` | `uint8 indexed` | The same accrual (`sdk/src/rpgf/index.ts:208`) | A period number |
| `UsageCounter` | `UsageRecorded` | 3 | `processId` | `bytes32 indexed` | The same accrual counts each seller of a process once (`sdk/src/rpgf/index.ts:213`) | A fingerprint |
| `UsageCounter` | `UsageRecorded` | 4 | `seller` | `address` | The same accrual counts distinct sellers (`sdk/src/rpgf/index.ts:218`) | The wallet's address |
| `UsageCounter` | `UsageRecorded` | 5 | `c` | `uint64` | no reader found: decoded (`sdk/src/rpgf/index.ts:322`); the accrual counts it again from the events. It answers a stranger's question: how many uses, each one seller of one process, has this key counted in the period, after this one? A reader checks its own count against it without replaying the period (`src/rewards/UsageCounter.sol:797`) | A count |
| `UsageCounter` | `UsageRecorded` | 6 | `d` | `uint64` | no reader found: decoded (`sdk/src/rpgf/index.ts:323`); the accrual counts it again from the events. It answers a stranger's question: how many distinct staked sellers has this key counted in the period, after this one? (`src/rewards/UsageCounter.sol:797`) | A count |
| `UsageCounter` | `UsageRecorded` | 7 | `score` | `uint256` | no reader found: decoded (`sdk/src/rpgf/index.ts:324`); the accrual computes it again from the events. It answers a stranger's question: what is this key's score in the period after this count? A designer reads its standing from its latest event alone (`src/rewards/UsageCounter.sol:797`) | A score |

## The sealed side is the owner's asset

The split above generalizes: everything the chain anchors is a fingerprint, and
the content behind the fingerprint — agreement bodies, evidence bundles, the
books a process leaves behind — stays with the wallets that produced it,
disclosed only by the owner's choice. The public graphs (see "Why Public?") are
the free public good; the private content is each owner's own asset. Because a
data sale is an ordinary trade, an owner who chooses to sell access to their
private data can already do so through the same bonded commitment as any other
sale — the content-handoff clause family names datasets and access credentials
as digital value-added, delivered over the sealed channel.

The evidence file a party hands a forum names each part it does not contain,
with the reason given, and fills no gap with content it does not hold.

### A private fingerprint carries a blinding value

A private field is withheld from every public place, and only a fingerprint
of its set is published: the clause's data hash, under the `checkoutHash`,
in the attestation calls and in the usage claims, and a witness's
`contentRef` in the `Attestation` event. The spec is public too. A value with
few possibilities would then be confirmed by hashing each guess with the rest
of the set and comparing. So every set that declares a private field declares
one blinding field, and the fingerprint over the set includes its value: 32
random bytes (`docs/CLAUSES.md` § "Clause-spec format", "Public and private
fields, and the blinding field").

- **Who draws it.** The party that fills the set: the buyer at checkout for a
  committed clause, the attesting party for a private witness stage. Its
  tooling draws it once, fresh for each commitment or attestation, through the
  SDK's one entropy source (`withFreshBlinding`, `withClauseBlinding`,
  `prepareAttestationContent`, on `generateSalt`, which refuses to run without
  Web Crypto). In the SDK and the reference frontend no designer, catalog or
  profile value stands in for it. The fill keeps only a value the party's own
  data carries and draws over one a design's clause data carried
  (`withAgreementBlinding`, `withCheckoutBlinding`). The SDK's sign gate
  refuses a spec that names the field in a fills list, a design whose clause
  data carries a value for it, and an agreement that carries the design's
  value. A stranger's tools sign what they choose, and the contracts read no
  content: these hold where the SDK's fill and gate run.
- **Each draft draws its own.** The reference checkout draws once per draft
  and keeps the value while the draft is rebuilt. Each candidate of a
  dispatch race receives a draft with values of its own, and the winner's are
  the ones signed. A new attempt after a failed one draws again, since an
  order the failed attempt signed may already be in a seller's hands. After
  a race, the new attempt keeps every value: the race fixed every salt and
  the deadline, so the attempt rebuilds the same orders, and the winner's
  countersignature still matches the raced order. A race reset ("Race
  again", "Try again") empties the store, so the next race's drafts share no
  private leaf with the structs the last race's candidates hold.
- **It travels with the content.** It is a field of the set, so it is inside
  the committed `data` the counterparty receives in the commitment payload,
  inside the encoded bytes of a witness, and inside whatever a party discloses
  to a forum or sells to a buyer. The evidence file a party builds lists each
  private clause's blinding value and the private witness content it holds,
  its own or received from the counterparty, says which, and names as missing
  each piece it does not hold. The evidence file a party pins in public for a
  forum (`RecoursePanel`, `forPublicPin` in
  `frontend/lib/data/audit/auditBundlePdf.ts`) carries each private clause and
  each private witness by its fingerprint only, and names the content as
  kept by its holder. Whoever holds the content reproduces the
  fingerprint from the content alone; a data buyer checks a disclosed leaf
  against the source process's `checkoutHash` as before, and before the sale
  cannot confirm a guess.
- **A public set carries none.** Public content is published, so a random
  value would hide nothing, and public fingerprints stay reproducible by
  anyone from what is published.

Four limits, stated plainly:

1. The party that fills the set draws the value, and both parties sign the
   clause. A careless or hostile filler weakens the other party's privacy in
   that clause: a predictable value lets anyone who can predict it confirm
   guesses again. The SDK's sign gate catches only a zero value, a value
   repeated inside one agreement and a value a design carries; a counterparty
   that distrusts the value refuses to sign.
2. The value proves nothing alone. A party that loses its own private content,
   blinding value included, cannot show what it signed or attested from the
   fingerprint, and cannot recover the value from it.
3. A private witness's content is never published. Its attester holds it,
   and the counterparty holds a copy only once its page has offered a key on
   the order, by asking for one or by sending its own filings. The
   reference frontend keeps it in the attester's browser storage
   (`localStorage`, `keepPrivateWitnessContent` in
   `frontend/lib/core/witnessContent.ts`), under the wallet that
   attested and the chain it attested on (point 4). The one submitter every
   filing goes through, the rail's attestations and the ceremony panels'
   evidence alike, writes it before the attestation is sent and refuses to
   send where the browser will not keep it (`submitAttestation` in
   `frontend/lib/core/useAttestationCoordinatorActions.ts`). It keeps the bytes only, one entry per attestation, and every reader
   decodes the values, blinding value included, from the bytes it has checked
   against the content reference. A party that clears its browser's storage
   loses it: the content is its own to keep, and its export (point 4) and the
   evidence file are how it carries it out. A filing that was kept and never landed stays on the
   device until the site's storage is cleared, and the copy holds the content
   and its blinding value; no page shows it, since no `Attestation` event
   names its place. The submitter removes the copy only where no transaction
   hash ever existed, when the simulation refuses the call or the wallet
   rejects it, since then the content was never referenced on the chain; a
   transaction that was sent and reverted, or whose outcome is unknown, keeps
   it, since the party may need it. A software agent keeps the `values` and `content` that
   `prepareAttestationContent` returns. The `figaro-content-handoff` clause
   declares its stage-1 set private (`clauses/figaro-content-handoff.json`),
   so the artifact's hash is published only inside a blinded fingerprint:
   one artifact delivered under two orders gives two fingerprints, and an
   outsider who guesses the artifact cannot confirm the guess. The sender
   draws the blinding value before the send and
   seals it in the encrypted delivery beside the artifact
   (`prepareCompletionEvidence` in `frontend/lib/data/handoff/contentDelivery.ts`),
   so the receiver rebuilds the content, recomputes the anchor and shows its
   verdict (`completionEvidenceAnchor`) once an `Attestation` by the sender
   holds that order, clause, stage and reference. The receiver then keeps the
   rebuilt content as a copy received from the sender
   (`keepVerifiedCompletionEvidence`), so its audit page and evidence file
   read it. A delivery under a stranger's clause whose stage-1 set is public
   carries no blinding value.

   The counterparty receives the private filings of an order by its own
   request, with both parties' order pages open
   (`frontend/lib/data/handoff/privateFilings.ts`, `PrivateFilingsPanel` on
   `/orders/view`). Its page counts a counterparty's filing as private once
   the clause's spec is read and declares the set private, never while the
   spec is unread. Its page offers its temporary public key, wallet-signed,
   and that key lives only in the requesting tab's session storage. The
   attester's page, with a key the counterparty offered present (by its
   request, or with its own send), seals every copy it kept for
   that order to that key and sends it on one click; nothing is sent
   unprompted. The receiver keeps an entry only when the entry names this
   order, its bytes hash to its content reference, and an `Attestation` by
   the sender holds that order, clause, stage and reference on either path;
   it reads again until the event appears. A kept copy is one entry of the
   same store as the attester's own copies, marked `received`; it never
   overwrites a copy the browser kept when filing, and it is never sent on.
   The order page, the comparison of filings, the audit page and the
   evidence file read it, and the evidence file says that the copy was
   received from the attester. One delivery carries at most 64 filings and
   128 KiB of content. The receiver refuses a sealed message longer than
   any delivery within that bound makes before it decrypts or parses it
   (`PRIVATE_FILINGS_MAX_BLOB_CHARS`), so the bound holds whatever size the
   transport lets through; a payload within that length but over the bound
   is refused once unsealed. A browser that duplicates a tab copies its
   session storage, the temporary key included: the duplicate's page shows
   the request as sent earlier and lets the party send it again, with the
   same key. What remains: a counterparty that never asks holds
   nothing, and a copy reaches only a tab that still holds the key it
   offered; the attester's evidence file is then the one route of that
   content to a forum.
4. The kept copy belongs to a wallet on a chain, not to the browser profile.
   Each entry is stored under the chain and the wallet that kept it (its
   own filing) or received it (a counterparty's copy), and every reader in
   the reference frontend reads only the entries of the wallet connected, on
   the chain the page shows (`WitnessHolder`, `useWitnessHolder`). With no
   wallet connected, no page reads a copy and the submitter keeps none, so
   it sends no private filing. The copy has no expiry: an open process has
   no timeout, and the content is evidence for as long as the process stays
   open. On `/orders/view`, where the process carries a private filing, the
   wallet exports its copies to a file of its own, imports such a file back
   into any browser (each entry checked again against its content reference,
   and only into the wallet and chain that exported it), and removes its
   copies from the browser (`KeptPrivateContentPanel`). What the scope does
   not do: the bytes sit in the browser profile's storage as written, so
   anyone who opens that storage directly, outside the pages, reads them. A
   party on a shared device exports its copies and removes them from the
   browser, or attests from a browser profile of its own that no one else
   opens.

What the blinding value does not hide: that a clause, a private stage and a
field set were used; the spec's structure, since the spec is public; who
traded, when, and the clause key and stage of every attestation.

The voluntary data market around that capacity is Core-native and needs no
contract of its own: data products are catalog items; the disclosure regime for
a process's own data is the composable
`figaro-data-terms` clause (designer-set regime, buyer-committed choice over
their own half); the terms of a specific sale are the `figaro-data-license`
clause (scope, purpose, snapshot-vs-stream, redistribution-as-evidence, and
process-anchored provenance — disclosed leaves verify by merkle proof against
the source process's on-chain checkoutHash); delivery rides the sealed
content-handoff channel. The sustainable product is the evolving stream rather
than a snapshot. Nothing here changes the posture that the protocol itself
holds no user data to sell — the owner holds everything and chooses.

---

## Why the public side is public

The protocol's enforcement model (THEORY.md) requires economic pressure to
replace trust. Economic pressure requires **visibility**: agents must see
what work is available, where demand exists, which sellers are reliable,
and how processes interconnect.

Making these graphs public enables:

1. **Autonomous coordination** — AI agents and human members discover
   work through graph queries, not platform-mediated matching.
2. **Heat maps and demand prediction** — the geohash cells parties publish in
   attestation content, reached from each `Attestation` event's `contentRef`,
   reveal demand patterns without exposing individual transaction details; a
   cell committed only in an agreement body reaches only those who hold the body.
3. **Routing optimization** — Delivery agents optimize paths from the pickup
   and drop-off cells published in attestation content or disclosed to them by
   a party.
4. **Reputation derivation** — resolution history is computed from the Core's
   events alone (`OrderCommitted`, `OrderResolved`, `ProcessResolved`); on-time
   rates and disclosure compliance also need the attestation content each
   party published.
5. **Cross-institution interoperability** — every assembly consumes the same
   graphs for its own coordination logic, whatever it is for; the kinds are
   unbounded and no one of them is the reference case.

This is the "economic pheromones" model: coordination signals left by
participants that other agents learn from, without centralized orchestration.

---

## The design instrument — three forward-looking stress tests

The 600M's design constraints are not aesthetic preferences; they are DERIVED, and
this is the instrument they are derived with. The 600M exists to incentivize the permissionless creation of
the protocol-layer **public graphs** — the coordination commons agents and humans
(same level) learn from for free. Platforms' moat is privately holding
who-moves-what-where, reputation, and demand; make that a public good and the moat
dissolves. The Core is fixed and neutral — **it's what we and others put in the
protocol layer that makes the difference.** Every mechanism proposal is checked
against three forward-looking stress tests:

1. **Operate on a public flow-map** — the mechanism must work where no private
   flow-map exists, because it builds the public one.
2. **Operate post-apocalyptic** — no institutions: nothing in the path may require a
   committee, a registry authority, or a standing organization.
3. **Operate off-planet** — no Earth committee, no KYC oracle: identity-free,
   self-contained, no trusted third party.

These tests are the WORKING instrument, not decoration: they are what declined the
per-count charge routed to the DAO (inserts an institution into the identity-free
mechanical path — fails tests 2 and 3; see `DESIGN_DECISIONS.md` §17, "Recording costs
gas and nothing else"), and they are why the whole reward path is permissionless,
identity-free, and adjudication-free end to end. A future proposal that passes
benchmark reasoning but fails one of the three is wrong here.

## Why the flow-map gets built — the geo/coordination incentive under a uniform reward

This section is load-bearing: it explains why the geo/coordination clauses exist and
get written, now that the reward is **no more for them than for any other clause.**
The reward is UNIFORM (contract surface: `CONTRACTS.md` § "Designer rewards"): a clause's or assembly's score is its **real usage
alone** — `icbrt(c·d²·1e18)` — with **no tag, no category, no weight multiplier.**
Neutrality is achieved by the **stake, not by weighting.**

**The must-haves see value, not place.** Every Figaro order carries **topology**
(the chain — who comes before whom), a leaf the agreement format itself
carries (`Agreement.follows`, never a clause), and its
commitment says who pays whom, in what token, how much; a clause whose spec
marks priced lines (`block.checkout.pricedLines`, `docs/CLAUSES.md`), where a
designer composes one, adds only the lines the payment buys, and nothing holds
their sum equal to the payment. The chain emits one part of the trade's economic skeleton
itself: each order's buyer, seller, token, payment and running total, in the
sequence the orders were committed (`OrderCommitted`), and each order's payouts
at resolution (`OrderResolved`). The sequence says which commit came before
which, and never that one order follows another. `FigaroCore` fixes no order
among sibling orders, and the reference checkout lets sibling sellers accept
in any order (`readFollowedOrders`, `frontend/lib/checkout/orderCommitmentFlow.ts`).
The other part, the edges of who follows whom, sits in each order's agreement
body, whose address no event carries (`frontend/lib/core/agreementFetch.ts`,
header). A reader names an edge between two orders only from an agreement it
holds whose leaves hash to that order's `checkoutHash`: `processEdges`
(`sdk/src/derive/queries.ts`) anchors each held agreement with
`anchorAgreement` (`sdk/src/anchored.ts`) and leaves every other order's edges
unknown (`docs/DESIGN_DECISIONS.md` § 32). A commit's position in the
sequence never stands in for an edge. A reader outside the trade holds no
agreement, so `/data/explore` names no edge between orders. A process may be
linked to a registered process design, by its buyer's provenance attestation
or by a `UsageRecorded` of the design. The page then shows that design's own
edges between its entries, labeled as the design's, and matches no entry to
an order. The sign gate (`validateCommitmentAgreement`, `sdk/src/projection.ts`)
holds two things about them at each party's signature, from the agreement and
the design alone: an order names as many orders as its design entry follows
(`designIssues`), and a commitment that opens a process (`processId` zero)
names none (`topologyIssues`). Which orders they are needs the chain, since no
design carries an order hash, so it is the reader's to check. Together the two
give who paid whom, in what denomination, for how much, who the parties in the
value-added process are, and how value accumulates. That skeleton is complete
on its own.

**The counter-signer is the first reader of the edges, and checks them before
it signs.** The check sits with the party that reads the chain, never in the
pure sign gate: `followedOrderIssues` (`sdk/src/projection.ts`) takes the
counter-signer's own reads, and for the design entry the order instantiates
holds each edge, in the entry's order, to an order that the chain holds
(`OrderCommitted`, on either path), in the process the commitment joins, whose
agreement names the same assembly and the registered agreement of the entry
the design entry follows at that place. The agreement of a followed order is
content the counter-signer verifies, never a claim it trusts: the party that
built the edges relays each one's public form beside the order
(`CommitmentPayload.followed`; `publicForm` withholds a private clause and
keeps the merkle root), and the counter-signer takes it only when its root
equals the `checkoutHash` the chain holds for that order; a followed order
whose agreement it cannot read is refused. In the reference frontend the seller
runs it at accept (`acceptOrder` and `readFollowedOrders`,
`frontend/lib/checkout/orderCommitmentFlow.ts`), once the orders before its own
are committed, and `/sign` shows the same verdict. A race candidate
countersigns a draft before those orders exist, so the check does not run
there, and the buyer, which built the edges from its own walk, does not run
it.

The check knows a design entry only by the registered agreement it binds: an
order's provenance names an `agreementHash`, never an entry, so the entries an
order may instantiate are those that bind its agreement
(`sdk/src/projection.ts:968`), and a followed order sits at the place an entry
names when its agreement is the one that entry binds
(`sdk/src/projection.ts:990`). Two parentless entries that bind the same
agreement are therefore one entry to the check: an order that should follow
the first passes when it follows an order of the second, and the counter-signer
cannot tell which of the two the followed order fills. A designer who wants
each parentless entry told apart gives each its own registered agreement.

**What it cannot see is *where*.** The must-haves show *that* value was added and
*by whom* — never the **physical or virtual flow** of the work: where a pickup
happened, where a hand-off occurred, which zones a service covers, how goods and
signals actually moved. That flow-map is not derivable from payment and topology;
it must be *attested* by clauses that carry it — geolocation, proximity, hand-off.
It is the Geo graph above, and nothing forces it into existence.

**So the flow-map is built the same way everything is: by being used.** The protocol
does not pay a premium for the clauses that draw the map. It pays the same uniform
pro-rata for every clause and assembly, keyed to real usage. A geo/coordination clause
earns exactly when a real, staked seller's process invokes it — the demand for the
flow-map is the demand of the assemblies that need it, and the reward follows that
demand rather than a hardcoded category judgment. The map gets drawn because the
commerce that needs it draws it, and the designer of the clause that carries it is rewarded
pro-rata for that real usage.

**Neutrality comes from the stake, not from the weight.** What keeps the uniform
reward honest is the two-sided **live ETH stake**, not a per-category multiplier.
A use counts only when its seller
holds a live `MembersRegistry` stake (`UsageCounter` reads `MembersRegistry.registered`,
else `SellerNotStaked`), and a designer is rewarded only while it is itself a live member
(`RpgfMinter.claim` reads `MembersRegistry.registered` on the claimant, else `NotLiveMember`)
and while their registration stake is
un-withdrawn (`RpgfMinter._isAuthor` requires clause `depositOf.withdrawn == false`,
assembly `bindings.depositWithdrawn == false`); withdraw and you forfeit future rewards.
The ETH stake is a **value loop**: every process pays its gas in the base chain's own
currency, the stake rises and falls with demand for that chain, and it stays
reclaimable by the wallet that placed it. That is why every registry stakes in ETH: **florin is the Schelling-point
REWARD, ETH is the ALIGNMENT.** Procedural neutrality (the same uniform rule for every
designer, no committee, no category) and Sybil-resistance now live in the *same*
mechanism — the stake — rather than being traded off against a non-flat weighting.

**What the stake does and does not do — state it this way, never stronger.** The stake
ALIGNS the honest majority; it does not DETER a determined Sybil, and the mechanism is
not "non-farmable". Appreciation accrues to anyone who stakes, a free-rider included.
What actually bounds farming: the score's dominant term counts
DISTINCT LIVE-STAKED SELLERS, so n units of breadth cost n stakes held live — linear,
with no wallet-splitting leverage; the minimum-support floor (`minSellers = 3`) keeps everything one
actor can fabricate alone off the scoreboard; the withdrawal cooldown makes each stake
serve at most P/T identities per period; the automatic EIP-1559 per-trade base-fee burn
is the one non-recoverable per-trade cost, scaling with fabricated volume and accruing
to every base-currency holder; and the 600M is a FIXED pool a farmer DILUTES rather
than inflates, in RISING tranches so the largest budgets pay on the most-measured
periods. Formally: capturing a fraction φ of a period requires attacker score
φ/(1−φ) times the honest score, at a capital cost LINEAR in that score for one
registration on one route — registrations committed in the same fabricated agreements
share those sellers and processes, each further one priced by its own designer-side
registration stake and its own counting gas, so the bound never holds over a portfolio — the
rent-dissipation bound whose closed form, and the stake and cooldown derived from it, is
published as §7 of `/papers/substrate-broadening-rpgf`; it is checkable at each period
when both terms are observable. The florin has no protocol-set price, so the bound is
stated as dilution per unit of attacker capital, never as a profit threshold.
`RELEASE_READINESS.md` Task 3 carries the parameter values.

**The objective is a public, verifiable god's-eye view.** Aggregated over time,
these attestations form a heat-map of physical/virtual flows — demand clusters,
routes, service areas — every datum emitted by event, content-addressed,
its integrity independently verifiable. No operator owns it. What keeps each
attestation accurate is what a false one costs its signer, before resolution and
after it (§ "Truth boundaries", below).

**The payoff is the point.** Today the map of who-moves-what-where is the private
asset on which platform companies build their value capture: they sit between
participants because they alone hold the coordination data. When that same data is
a public good — open, verifiable, permissionlessly extended, and incentivized into
existence by the protocol's own token — the informational moat dissolves. The
platforms are not attacked; the basis of their capture simply stops being scarce.
That is what levels the field.

---

## Truth boundaries — what a row is worth

A reader that folds everything into one surface has lost the only distinction that
matters: what backs each row. There are four boundaries, and they are a closed set
because they describe how a fact came to exist, not what it is about — the SDK owns
the labels and the one-line gloss for each (`TruthBoundary` and
`TRUTH_BOUNDARY_GLOSS`, `sdk/src/derive/truth.ts`), and a projection picks from
them rather than coining its own.

Briefly: **protocol-enforced** rows are economically backed by the Core, bonds
locked at commit and payouts at resolution. **Institution-declared** rows are what a
runtime encoded and the protocol never validated. **Protocol-derived** rows are
anchored on chain, with the content behind the fingerprint living off it:
referential integrity, never substantive accuracy. **Composition-derived** rows are
read from a composed venue's own events — a swap pool, the multisender, a forum —
true per that contract's rules and outside the Core's guarantees. The venues' swap legs
beside the commits are the value flowing between denominations, read from the venue's
own events: a commit transaction's receipt carries the ERC-20 transfers of each party
that funded its bond through the coordinator (`readFundingLegs`,
`@figaro-protocol/sdk/derive`), and the value-flow graph draws each as an edge between
two denominations.

**What stands behind a declaration or an attestation.** An institution-declared row is
a declaration: a clause both parties signed into the agreement at commit, which the
chain never validates. An attestation behind a protocol-derived row is a party's
representation about the process while it is open, signed and bound to its order,
which the chain checks for binding and never for truth. What stands behind a seller's
attestation is the buyer's decision: a buyer who finds it false before resolving can
withhold resolution, which keeps the seller's bond locked, and its own, and pays
nobody, until it is put right; the co-sellers, whose own payment waits on the same
resolution, have their own reason to press. That reach has three edges. A buyer's own
attestation meets no such pressure, since the buyer resolves at will. A clause of the
agreement is a term both parties signed, so there is nothing to put right; what stands
behind it is that both signed it. A member's profile is a statement outside any process,
backed by the member stake and the wallet's resolution history. After resolution, which no one can reverse, an attestation or a signed clause
stays in the public data: its worth to whoever buys or analyses it, the evidence a forum
or court reads, and the signer's resolution history. The SDK carries the two tails once
(`TRUTH_BOUNDARY_GLOSS` in `sdk/src/derive/truth.ts`). What none of this reaches is
parties acting together, covered below.

A third party that relies on the corpus — a lender, an insurer, a court — reads the
boundary with the row. The chain enforced the bonds and the payment; every claim
about the world entered as a party's declaration or attestation, and parties acting together can
emit perfectly formed books for a trade whose service was never rendered. The data
proves what the Core enforced, never the world, and whoever builds a decision on
the books carries that boundary into the decision.

A surface that renders this data should keep the boundaries visibly apart rather
than blending them, so nobody mistakes a declaration for a guarantee. `/data/explore`
is the built example: one layer at a time, each with its boundary named, and the
layers themselves a census of what the corpus actually contains — never a menu the
frontend knows in advance.

The corpus links an order to the registered agreement and the assembly it
instantiated through one attestation: the buyer attests the agreement format's
reserved provenance leaf (`CLAUSES.md` § "Every clause is a merkle leaf") while
the process is open. That link is the buyer's declaration. The `Attestation`
event carries the clause key, the stage and the content reference; the
coordinator proves the leaf from the clause data hash and never ties the content
reference to it (`AttestationCoordinator._verifyInclusion`), so on the direct
path only the SDK's `provenanceLeafAttestation` (`sdk/src/agreement.ts`) makes
the content reference equal to the leaf's fingerprint. A reader checks the
declaration: the content reference decodes to an `agreementHash` and an
`processDesignHash` (`decodeProvenanceContent`) or equals the `provenanceContentRef`
of a registered pair it loaded (`frontend/lib/data/graphCorpus.ts`, header); the
agreement's membership in the assembly is a merkle proof against the assembly's
root; and a reader who holds the agreement body that hashes to the order's
`checkoutHash` reads the same pair in its provenance leaf. A `UsageRecorded`
event of the agreement kind, for that process, shows that `UsageCounter` proved
the leaf under the `checkoutHash`. A process without the attestation is counted
as unattributed.

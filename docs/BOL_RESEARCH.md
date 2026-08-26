# Bill of Lading research: CargoX, TradeTrust, MLETR, TradeLens vs Figaro

**Status**: research deliverable, 2026-04-28.
**Author**: AI-drafted, maintainer-verified; grounded in the codebase at the
time of writing and the source citations below.
**Closes**: the order-as-traditional-contract UI + PDF question and the
research dependency of the supply-chain reference assembly.

This document settles whether Figaro can or should accommodate the BoL
patterns established by CargoX, TradeTrust, the UNCITRAL Model Law on
Electronic Transferable Records (MLETR), and the TradeLens consortium. It
does not propose code changes; it settles the conceptual question so that
subsequent code changes (a non-negotiable BoL projection derived from committed
leaves, and its view) can be made on solid ground.

> **Canonical finding — do not re-open (restored 2026-07-08).** The central
> question this document settles is **transferability**: can a supply chain be
> interrupted so the goods — a barrel of oil in transit — are resold to a *new*
> buyer mid-flight? **FigaroCore forbids it** (§5). A bonded order's parties are
> fixed at `commit`, the process has one buyer at the root, and there are no
> escape hatches — each invariant *independently* rules out substituting a
> party. This is a **structural property of the kernel, not a gap to fill or a
> mechanism to design.**
>
> Earlier revisions accreted a "parked pending protocol-layer mechanism design"
> hedge and a "CancellableSeller wrapper + counter-process" workaround that
> tried to make the forbidden thing expressible after all. That was closed-world
> drift — the base-model reflex to *build a feature* rather than accept that the
> kernel says no — and it has been removed. What Figaro **can** express is a
> **non-negotiable** BoL: the consignee is fixed at signing and the document is
> a read-only projection over committed leaves (§6.1), never a transferable
> document of title. The resale/negotiability limitation is recorded in
> `DESIGN_DECISIONS.md` (entry #12, "No MLETR-style transferable records — by
> design"), which cites this document for the full comparison. This file is
> load-bearing for that entry: edits here must preserve the canonical question +
> answer and the findings the entry cites.

## 1. Handoff is not a Bill of Lading

The first thing this document fixes is a vocabulary collapse in our prior
prose: handoff and BoL are not the same object.

**Handoff is a Figaro primitive.** `figaro-modalities` +
`figaro-proximity-policy` (the committed detection bands, with the runtime
proof-of-proximity filed as an attestation on that same clause) +
`figaro-courier-process` together document the fact-of-custody-change
and its conditions. Any order in any DAG that has a physical exchange opts
in. Two parties exchanging anything physical → handoff applies. The custody
change itself is what is being proved; no carrier role is required.

**BoL is a document genre, not a primitive.** It assembles handoff data
plus the additional structural condition that *goods were entrusted to a
third-party carrier with intent to deliver to a non-party consignee* — and
historically, plus an additional legal condition that *the document itself
is negotiable, transferring title with possession*. Local commerce where
the buyer picks up at the merchant counter has handoff but no BoL — no
carrier was involved. Local commerce where a courier collects from the
merchant and delivers to the buyer has handoff *and* a (non-negotiable) BoL
— a carrier was involved, but the consignee was committed at the order's
inception.

A Figaro BoL is therefore always the **non-negotiable** kind (§5–§6): the
consignee is a party committed at order signing, and the document is a
**read-only projection** derived from the order's committed leaves (handoff /
proximity + cargo + geolocation + the addressee block) — never a transferable
document of title. Which order is a carriage leg is derived **open-world** from
the graph — a sub-order (its topology declares parents) whose seller advances a
runtime process-log ladder is carrying goods that originated upstream — never by
naming a specific clause. (The earlier `billOfLadingExtract.ts`, which emitted a
BoL on every order regardless, leaned on closed-world clause knowledge and has
been deleted.)

The rest of this document concerns the BoL document genre, not the handoff
primitive.

## 2. The Figaro structural starting point

Three Figaro invariants frame the entire analysis below; they must be on
the page so the rest of the doc reads correctly.

**Single-buyer invariant.** A Figaro process has one buyer at the
root. Every order in the DAG has that same buyer on its buyer side. There
is no direct edge between two sellers. In the local-commerce reference
assembly, both the buyer↔merchant order (goods sale) and the buyer↔courier
order (carriage) carry the same buyer; the merchant and courier are
co-sellers under one buyer, not contractual counterparties to each other.

**Parties fixed at `commit`.** A bonded commitment binds buyer and seller
at the moment `FigaroCore.commit` lands on chain. After commit, neither
party can be substituted without invalidating the bond. There is no
mechanism in the kernel to nominate a new buyer or seller for an existing
order; the only way to change a party is a new commitment, which is a new
order. (See `CLAUDE.md` § "What Figaro Is Not" and `docs/THEORY.md`.)

**No escape hatches** (the Escape-Hatch Weakness theorem, /papers/asymmetric-bonding §4.2). Any unilateral exit path
weakens the Nash equilibrium. An exit that requires a third party J ∉ {B,
S} whose incentives are not bond-constrained — including arbitrator,
escrow, mediator, or governance vote — is forbidden at the kernel layer.
External legal forums adjudicating under duress / frustration /
impossibility are not this kind of escape hatch (Remark 4.8); they
operate on the bonded commitment as evidentiary input, not as a kernel
override.

These three properties together rule out the central technical pattern of
every project surveyed below — the negotiable transfer of title to a
party not committed at signing time. The body of the document spells out
why.

## 3. The four projects

### 3.1 MLETR — UNCITRAL Model Law on Electronic Transferable Records (2017)

MLETR is the legal framework the other three projects align to. It does
not specify a technology; it defines the properties an electronic record
must exhibit to be the legal equivalent of a paper transferable record
(bills of lading, bills of exchange, promissory notes, warehouse
receipts). Per TradeTrust's UNCITRAL panel framing, the operative
properties are:

- **Singularity** — only one authoritative record exists at any moment.
- **Exclusive control** — exactly one party has control, and control is
  transferable.
- **Integrity** — the record cannot be altered without detection.
- **Identifiability** — the record can be reliably identified across
  time and across systems (sometimes elided as a fourth property).

MLETR additionally addresses requirements of writing, signature, delivery,
and endorsement, but the four properties above are what concrete
implementations target.

### 3.2 CargoX — Ethereum-anchored eBL with ERC-721 transfer

CargoX is a commercial eBL platform on Ethereum mainnet, in production for
several years, with cross-platform interoperability via DCSA standards as
of 2026. The technical pattern:

- **Document storage**: encrypted document content sits in IPFS; a SHA
  hash of the document is the on-chain anchor.
- **Title token**: an ERC-721 NFT represents the title. Singularity is
  the ERC-721 invariant; integrity is the hash binding to IPFS content.
- **Transfer**: direct ERC-721 token transfer signed with the holder's
  private key. *"Users employ their private keys to sign transactions —
  these transactions then transfer the tokens, and with it the title"*
  (cargox.io content-hub). Transfer time under one minute.
- **Endorsement chain**: the public-blockchain transaction history is the
  endorsement chain; any blockchain explorer renders it.
- **Custodianship**: *"at no point in time can CargoX take over ownership
  of the title"* — the platform is not a custodian, the holder is.

CargoX's mechanism is the simplest of the three implementations: title is
just an NFT; transfer is `ERC721.transferFrom`. There is no separation of
holder and beneficiary; whoever holds the token has full title.

### 3.3 TradeTrust — TitleEscrow with holder/beneficiary split

TradeTrust is the Singapore IMDA framework, MLETR-aligned, used in
government-backed cross-border trade pilots. The technical pattern is
substantially more elaborate than CargoX's:

- **Document layer**: OpenAttestation document format; W3C Verifiable
  Credentials underpinnings; document content lives off-chain, with the
  hash and signatures notarized via the framework.
- **Token layer**: a Soulbound Token (SBT) loosely based on ERC-721,
  *"largely restricted to its designated Title Escrow contracts"* — the
  token cannot be freely transferred; it is bound to a TitleEscrow
  instance.
- **TitleEscrow contract**: per-token escrow contract, created by a
  TitleEscrowFactory at mint time, that mediates ownership operations.
- **Two-role split**: a TitleEscrow has both a **beneficiary** (economic
  interest, requires nomination before transfer) and a **holder**
  (operational control, direct transfer capable). The split mirrors the
  way negotiable instruments traditionally separate the right to delivery
  from the right to control delivery.
- **Transfer operations** on TitleEscrow:
  - `nominate(beneficiaryNominee)` — current owner proposes a new
    beneficiary.
  - `transferBeneficiary(beneficiaryNominee)` — holder endorses the
    nomination, completing the beneficiary transfer.
  - `transferHolder(newHolder)` — direct transfer of the holder role.
  - `transferOwners(beneficiaryNominee, newHolder)` — atomic transfer
    of both roles.
  - `surrender()` — terminal operation at delivery.
  - On the registry side: `burn(tokenId)` (after surrender) and
    `restore(tokenId)` (recovery for surrendered tokens).
- **Endorsement chain**: the chain of TitleEscrow events — nominations,
  beneficiary transfers, holder transfers, surrender — is the auditable
  record of who held title when.
- **Interoperability**: as of 2026, DCSA-published standards plus the
  MLETR framing allow a token issued on Platform A to be recognized as a
  title on Platform B; *"a logbook documenting who the possessor or title
  holder was at any given time"* travels with the document.

The TradeTrust pattern is the most directly comparable to a hypothetical
Figaro implementation, because it is the most structurally specific.

### 3.4 TradeLens — what failure cost the industry

TradeLens (Maersk + IBM, 2018-2023) was the largest blockchain shipping
consortium. It shut down because it failed to reach commercial viability,
not because the technology failed to work. Three facts from the
post-mortem literature matter for Figaro:

- **Permissioned, access-tiered architecture**. TradeLens was built on
  IBM Hyperledger Fabric: *"a system of nodes whose information is
  accessed according to the contracted level of visibility"*
  (piernext.portdebarcelona.cat). Different parties saw different
  slices; data governance was centralized by a small set of node
  sellers.
- **The dual-role problem**. Maersk was both consortium leader and a
  major commercial actor in the market the consortium was meant to
  serve. Competing shippers and freight forwarders refused to commit
  data to a platform a competitor governed; freight forwarders
  specifically *"harbored doubts whether the shipping company's real
  interest was to disintermediate and reduce the value that freight
  forwarders bring"*. The dual role was not the only failure cause but
  was load-bearing.
- **Governance, not technology, was the death**. Per Andrés Garrido at
  the Port of Barcelona: *"TradeLens disappears but has demonstrated
  that blockchain architecture can solve several problems related to
  cargo traceability"*. The Frontiers commons-theory analysis (Frontiers
  in Blockchain, 2025) reaches the same conclusion: governance rigidity,
  unclear roles, and inadequate incentives to outside participants — not
  technical inability — sank the project.

TradeLens did not publish its document model in detail; it was not
open-source and most of its specific BoL semantics remain
non-public. What did escape into the literature is the failure pattern:
permissioned consortium + commercially-conflicted lead + tiered visibility
= insufficient trust to attract participants. This is precisely the
governance shape Figaro avoids by being permissionless and bonded — no
consortium, no leader, no commercial actor with privileged access. Figaro
does not "succeed where TradeLens failed" by having better technology; it
sidesteps the failure mode by having no consortium at all.

## 4. MLETR properties — how each project implements them

| Property | CargoX | TradeTrust | TradeLens | Figaro (today, for the buyer↔courier order) |
|---|---|---|---|---|
| **Singularity** | ERC-721 invariant; one tokenId, one holder | SBT bound to TitleEscrow; one TitleEscrow per document | Permissioned ledger; consortium-enforced | One `agreementHash` per order; one `orderStatus` slot per orderHash in `FigaroCore.orderStatus` |
| **Exclusive control** | Whoever holds the ERC-721 token | TitleEscrow's holder + beneficiary roles, transferable via nominate/endorse | Access-tier-enforced visibility | Buyer + seller of the committed order; cannot be transferred |
| **Integrity** | SHA hash of document in the ERC-721; document encrypted in IPFS | Document hash + W3C Verifiable Credential signatures | Hyperledger Fabric ledger immutability | Merkle root over signed sections in `agreementHash`; on-chain `Commit` event binds it |
| **Identifiability** | Ethereum tokenId | TitleEscrow contract address | Consortium-issued document IDs | `orderHash` + `processId` |

Three of the four MLETR properties Figaro provides natively:
- Singularity → one orderHash / one agreementHash per committed order.
- Integrity → merkle-root binding via `agreementHash` (a Class A artifact —
  the evidence taxonomy in `/papers/on-chain-evidence`).
- Identifiability → `orderHash` is globally unique, derivable from the
  signed Commitment struct.

The fourth property — **exclusive control with transferability** — is
where Figaro structurally diverges. The next section is about that.

## 5. The transferability question

This is the central research question. The other three projects all
implement transferability — that is, *the right party at delivery is not
necessarily the same party that signed at issuance*. CargoX does it via
ERC-721 transfer; TradeTrust via TitleEscrow's beneficiary nomination
and holder endorsement; TradeLens via consortium-mediated record updates.
All three patterns require a mechanism for the title to move between
addresses after the document has been issued.

**Figaro has no such mechanism, by construction.** Three independent
kernel properties each separately rule it out:

1. **Single-buyer invariant.** A process has one buyer at the root,
   and every order in the DAG has that same buyer. A "transfer of the
   buyer-side title" mid-process would either fork the DAG (creating a
   second buyer, which the kernel doesn't represent) or substitute the
   buyer (which the kernel doesn't permit — see point 2).

2. **Parties fixed at `commit`.** Both buyer and seller addresses are
   bound into the EIP-712 Commitment struct that produces the
   `orderHash`. The hash is the order's identity; changing either party
   changes the hash, which is by definition a different order. There is
   no `setBuyer` or `transferBuyer` function, and there cannot be one
   without changing what an `orderHash` means.

3. **No escape hatches.** Even if (1) and (2) didn't apply, a transfer
   mechanism would require some authorization for the substitution. In
   TradeTrust this is the holder's `transferBeneficiary` endorsement;
   in CargoX it is the holder's signature on the ERC-721 transfer; in
   TradeLens it is a consortium-level write. In Figaro terms, the
   authorizer is a third party J ∉ {B, S} relative to the *new*
   bonded commitment between the new buyer and the existing seller —
   exactly the "third party J ∉ {B, S} whose incentives aren't
   bond-constrained" that the Escape-Hatch Weakness theorem forbids. Even if J = the original
   buyer, J's incentive structure no longer binds the new bilateral
   relationship.

**This is not a gap to fill. It is a structural consequence of the
kernel invariants.** Filling it would require either (a) changing the
single-buyer invariant — invalidating the asymmetric-bonding
derivation, since the cumulative-value calculation
depends on a fixed buyer at the root — or (b) introducing a J ∉ {B, S}
authorization path — invalidating the Escape-Hatch Weakness theorem's no-escape-hatches
property and weakening the Nash equilibrium. Neither is acceptable. The
kernel invariants are load-bearing for the protocol's central claim that
cooperation is the dominant strategy without any third party.

The honest framing: **Figaro does not implement MLETR-style transferable
records in any DAG-spanning sense, and adopting one would require
abandoning the equilibrium guarantees that make the protocol worth
building.** This is the same structural choice as Bitcoin's choice not to
implement reversible transactions — a feature traditional banking has
that Bitcoin doesn't, by design, because reversibility requires a trusted
third party with discretionary power.

## 6. What this leaves expressible — and what it closes off

### 6.1 Expressible in Figaro today

**A non-negotiable BoL where parties are committed at order signing.**
Local commerce buyer↔courier carriage is exactly this case: the buyer
hires the courier to deliver, the buyer is the consignee at destination,
no transfer mid-flight is needed because the consignee is the buyer is
the contractual principal of the carriage from the start. The merchant
participates in the pickup-handoff event but is not a party to the
carriage contract.

**Multi-leg carriage as a DAG of bonded orders.** A supply chain
shipper → ocean carrier → port → trucker → consignee can be expressed as
a process where each carriage leg is its own bonded
buyer↔seller_i order, all under the same root buyer. Each leg resolves
atomically when the buyer triggers `resolveProcess` on the whole graph;
each leg has its own handoff attestations and own non-negotiable BoL
extractable from its own agreement. The custody chain is the union of the
per-leg handoff records, not a single transferable token.

**Multi-party non-negotiable BoLs in any DAG shape the buyer can commit
upfront.** Whatever graph the buyer can sign at the start of the process
is expressible. The constraint is that the consignee at every leg's
destination must be a party committed at signing time.

### 6.2 Closed off by design

**Trade finance flows that depend on negotiability.** The classical
pattern — buyer's bank takes the BoL as collateral at issuance, releases
it to the importer when the importer pays the bank — is not expressible.
The bank cannot be inserted as a transient title-holder mid-flight; the
parties are fixed at commit. Adapting trade finance to Figaro requires
that the bank be a committed party from the start (e.g., as the buyer
on the order, with a separate buyer↔bank arrangement off-Figaro for the
financing) or that financing happen entirely outside the protocol.

**Cargo resale in transit.** The classical pattern — the consignee on a
moving ship sells the cargo to a downstream buyer by endorsing the BoL —
requires substituting the consignee, which Figaro forbids. A Figaro
analog would be that the original buyer triggers `resolveProcess` to
take delivery of the cargo at intermediate point P, then commits a new
process to ship the cargo from P to the new buyer. This is not
equivalent: it discloses delivery at P (which the parties may not want),
and it costs two full bond cycles instead of one transferable record.

**Negotiable warehouse receipts and similar instruments.** The same
structural constraints apply to any electronic transferable record where
the right-to-claim is meant to circulate before redemption.

### 6.3 The positioning

The protocol's job is to enforce bilateral agreements between parties
who committed to each other. The cargo itself does not carry rights in
Figaro; the *commitment* carries rights. When the cargo needs to carry
rights — as in trade finance, in cargo resale, in negotiable warehouse
receipts — Figaro is the wrong tool, by design.

This is not a deficiency to apologize for. It is the same kind of
positioning Bitcoin took relative to fiat clearing, or that TCP/IP took
relative to circuit-switched telephony: a substrate that does less,
on purpose, so that the less it does is unconditional.

## 7. Field-level comparison: traditional BoL vs Figaro clauses

For the non-negotiable BoL case (the one Figaro can express), the
extractable view assembles fields from the clauses attached to the
buyer↔courier order's agreement.

| Traditional BoL field | Figaro source | Notes |
|---|---|---|
| BoL number | `orderHash` | The order's identity is the BoL identity. |
| Carrier | `order.seller` | The committed courier address. |
| Shipper / consignor (party of contract) | `order.buyer` | The buyer hires the carrier; the buyer is the consignor on the carriage contract. |
| Tenderer of goods at pickup | merchant (a co-seller in the same process) | Not a party to the carriage contract; a participant in the pickup handoff event. Surfaceable from the topology + the merchant↔buyer order in the same process. |
| Consignee | `order.buyer` | Same address as the contractual shipper in local commerce. In supply-chain DAGs the buyer may designate the consignee via an encrypted destination address in the order's off-chain content and an address inside `figaro-geolocation.destination`. |
| Origin | `figaro-geolocation.origin` | A locality code under the committed `geocodeStandard` (geohash today). |
| Destination | `figaro-geolocation.destination` | As above. |
| Mode of carriage | `figaro-handoff.handoff` | Four handoff points: face-to-face / dead-drop / parking-area / locker; local-commerce focused. |
| Service class (modality + organizer) | `figaro-modalities.modality` | Modality: consume-onsite / pickup / delivery / virtual (single-select). The organizer/coordination variant — seller-assigned / buyer-assigned — is an assembly-level composition, not a clause field. |
| Stage progression (loaded / in-transit / delivered) | `figaro-courier-process` | The `eventType` enum's 5 values in lifecycle order: en-route-pickup / arrived-pickup / in-transit / arrived-dropoff / completed; each event filed as an attestation. |
| Custody-change verification at handoff | `figaro-proximity-policy` (committed band) + a runtime proximity attestation on that same clause (runtime nonce + sig) | The runtime proof is an attestation on the committed clause, not a separate clause. Off-chain consumers verify proof.band == policy.band. |
| Cargo description (line items) | `figaro-commerce.lineItems` | itemId / name / quantity / unitPrice. Cleartext by design — ruled ACCEPT 2026-07-21, `DESIGN_DECISIONS.md` §14 (discreet naming is the seller's catalogue-authoring mitigation). |
| Freight (carriage payment) | `figaro-commerce.payment` + `currency` (on the buyer↔courier order, not the buyer↔merchant order) | The carriage is its own commerce clause on its own order. |
| Liability for non-performance | The bond mechanism (asymmetric bonding + atomic resolution) | Figaro's bond *is* the liability mechanism; Hague-Visby tonnage-based caps are incommensurable with this bond structure. |
| Applicable law / forum | `figaro-applicable-law` | applicableLaw + forum + language. The doc-of-title transferability is governed by this clause, but Figaro has no transferability to govern. |
| DAG topology | `figaro-topology` | parentOrderHashes — needed to render the multi-leg structure when the BoL is for one leg of a longer chain. |
| Carrier per-role event log | `figaro-courier-process` | The same 5-value `eventType` vocabulary as the stage-progression row, plus an optional `evidenceUri` per event (mechanism-grain public evidence pointer). |

### 7.1 Fields that are *not* covered today

These appear on traditional BoLs and in the supply-chain BoL conventions
TradeTrust documents but have no current clause in Figaro:

- **Cargo-type / transport-category beyond hazmat.** Hazmat / dangerous-goods declarations are now expressible via `figaro-hazmat` (UN number, proper shipping name, hazard class 1–9, packing group, anchored to the UN Recommendations / ADR / IMDG / IATA-DGR); freight classification via `figaro-freight-class` (the declared NMFC class plus optional item number, anchored to the NMFTA standard); temperature via `figaro-cold-chain`. (The earlier `figaro-class-of-service` sketch was deleted as conflating four orthogonal axes; hazard, temperature, and freight class are now separate standard-anchored electives.)
- **Special-handling instructions — RESOLVED (2026-07-22, ruled: private detail, never clause content).** Fragile / orientation-sensitive / live-animal marks ride the addressee block on the ECDH private-detail channel (`frontend/lib/handoff/addressDetail.ts`, `handling` field) — like a BoL's handling marks, they travel with the label, encrypted to the order's counterparty, hash-anchored on-chain. Distinct from door-level delivery `instructions`. (Temperature-controlled handling remains committed clause content via `figaro-cold-chain`.)
- **Notify party — RESOLVED (2026-07-22, same ruling).** The addressee block carries `notifyName`/`notifyContact` — the BoL notify-party lines, distinct from the consignee. The notify party is DATA, never a participant: no wallet, no channel message, no kernel involvement; the counterparty notifies by the off-protocol contact given.
- **Cargo-detail beyond SKU.** `figaro-cargo` now carries the shipment's gross/net mass, volume, packaged dimensions (`lengthMm` / `widthMm` / `heightMm`), packaging type and count, and shipping marks & numbers — the "number and kind of packages" and "Marks & Numbers" columns of a traditional BoL — and `figaro-commerce.lineItems` carries `quantity` and `name`. Nothing at the logistic-unit grain remains unmodelled.
- **Liability terms / freight-paid status / freight-collect.** Whether the freight is prepaid by the shipper or collect-from-consignee. In Figaro this is implicit (the buyer pays the seller in the bonded payment); making it explicit is a labelling concern, not a clause concern.

The decision on each of these — extend an existing clause (e.g. `figaro-cargo`),
fork a new one, defer to a future supply-chain assembly,
or accept the gap as out-of-scope for local commerce — is a per-field
call. None of them are blocking for the non-negotiable buyer↔courier
case. They become live questions if and when the supply-chain reference
assembly enters build phase and a real customer's cargo set demands one
of them.

## 8. Recommendation

**8.1 Code — no genre code.** The audit bundle is GENERIC: `clauseData`
(`extractClauseData` / `describeClause`) already surfaces every committed leaf
from its spec — a cargo leaf, a geolocation leaf, a courier-process ladder, or a
clause this codebase has never seen — hash-verified against the on-chain
`agreementHash`. So the facts a bill of lading states are already in the bundle,
generically, with zero BoL code. A *recognizable* BoL form (the familiar layout)
is a projection over those same committed leaves; if it is ever built it must be a
DECLARED / generic composition (a document template a generic engine renders),
never a hand-rolled `projectBillOfLading` + a bespoke PDF page. A first attempt at
hand-rolled invoice/BoL projections was written and then deleted 2026-07-08 for
exactly this reason — genre code is the closed-world reflex. (The old
`extractBillOfLading`, which ran on every order and named clauses directly, was
deleted earlier for the same reason.)

**8.2 No `figaro-bol` clause for now.** The non-negotiable BoL view is
fully assemblable from the existing clauses. Adding a new clause would be
ceremonial. Defer this decision until a real supply-chain customer
demands a feature the existing clauses can't express.

**8.3 Document the negotiability limitation explicitly.** ✅ Shipped as
entry #12 in `docs/DESIGN_DECISIONS.md`: "No MLETR-style transferable
records — by design." Captures the three-invariant rejection
(single-buyer + parties-fixed-at-commit + no-escape-hatches) and
references this document for the full comparison. A reviewer
encountering the absence now has a written answer instead of treating
it as a gap.

**8.4 Defer the cargo-description decision; hazmat and notify-party are
now resolved.** Hazmat became `figaro-hazmat` (committed clause content —
a declaration the chain of custody bonds on); notify-party and
special-handling went the OTHER side of the seam (2026-07-22): private
operational detail on the addressee block over the ECDH channel, never
clause content (§7.1). The remaining cargo-description question becomes
live when the supply-chain assembly enters build phase; a pre-emptive
`figaro-cargo-description` fork would be premature design — `figaro-cargo`
already covers mass and volume.

**8.5 No interoperability with CargoX / TradeTrust title flows.** Because
the underlying transferability semantics differ structurally, a Figaro
order cannot be a TradeTrust transferable record and vice versa. This is
the same kind of incompatibility as Bitcoin and a credit-card-network
transaction: the rails are different shapes, by design. Future work could
consider an evidentiary bridge — e.g., a Figaro audit bundle that
references a separate TradeTrust BoL by content hash for the negotiable-leg
of a multi-protocol shipment — but that is composition, not interoperation
at the title layer.

## 9. Implications for the supply-chain reference assembly

This research closes the supply-chain assembly's research dependency. The
deliverable for that assembly, when build phase begins, is informed
by:

**The DAG model is the right primitive for supply chains.** Multi-leg
carriage as a process of buyer-rooted bonded orders is the structural
shape Figaro provides; it is exactly what TradeLens tried to model atop
a permissioned consortium and what the trade-finance literature struggles
to express in negotiable-instrument frames. Figaro provides this for free
at the kernel layer — no consortium, no permissioned ledger, no
commercially-conflicted leader.

**Negotiability is out of scope.** The supply-chain assembly should not
attempt to implement negotiable BoLs. It should target the
non-negotiable carriage chain: importer commits the full multi-leg DAG
upfront with one-or-more carriers, attestations land along the way, the
buyer triggers `resolveProcess` at completion. This excludes specific
trade-finance use cases that depend on bank-as-temporary-holder; those
remain off-Figaro.

**TradeLens governance is the avoided failure mode, not the model.**
Figaro's permissionless+bonded shape sidesteps the governance failure
that killed TradeLens. The supply-chain assembly should not adopt any
consortium structure, any permissioned visibility tier, or any commercial
leader. Each participant is bonded independently; the protocol takes no
position on the commercial relationship between them.

**The cargo-detail clauses largely exist.** The apparatus this research
anticipated has since landed: `figaro-cargo` (gross/net mass, volume,
packaged dimensions, packaging type/count, marks), `figaro-dimweight`
(billed dimensional weight), `figaro-freight-class`, `figaro-hazmat`, and
`figaro-cold-chain`; notify party rides the private addressee block —
§7.1. What remains open is whatever per-field call a real customer's
cargo set surfaces when the assembly enters build. Each such call follows
the procedure in `docs/CLAUSES.md` § "Adding a new clause — checklist",
or lands on the private-detail side of the seam when it is operational
data rather than bonded commitment.

**The TradeTrust document model is a useful reference, not a target.**
TradeTrust's OpenAttestation document layer (W3C VC + signed attributes
+ off-chain content) is a credible pattern for off-chain document
shape, but Figaro's `agreementHash` already does the binding work. The
useful borrow from TradeTrust is structural vocabulary (consignor /
consignee / holder / beneficiary distinctions), not the contract
architecture.

## 10. Open follow-on questions

Items the research surfaced but did not settle. (Transferability is **not**
among them — §5 settles it: the kernel forbids it. It is not a parked mechanism
to design.)

- **Naming for the "Proof of Handoff" document genre.** Distinct from
  "Bill of Lading"; needs to be precise about scope (any custody-change
  event, regardless of whether a carrier was involved).
- **Whether `figaro-handoff` needs to grow a `handoffParticipant`
  field.** In supply-chain assemblies the merchant-as-tenderer is
  conceptually distinct from the carrier-as-tenderee; surfacing both on
  the handoff record may matter for evidentiary completeness.
- **Hazmat / dangerous-goods and packaging clause decisions.** Largely
  addressed since — `figaro-hazmat`, `figaro-cold-chain`, `figaro-freight-class`,
  and `figaro-cargo` (gross/net mass, packaged dimensions, packaging type/count,
  marks) now exist. Any remaining per-field call follows the adding-a-clause
  checklist when the supply-chain assembly enters build.

## 11. Sources

- CargoX content hub on eBL legality and transferability mechanism — https://cargox.io/content-hub/legality-electronic-bill-lading
- DCSA on CargoX 2026 interoperability — https://dcsa.org/newsroom/cargox-once-interoperability-is-achieved-electronic-trade-records-will-be-moving-through-various-systems-for-true-efficiency-and-transparency-in-cross-border-trading
- TradeTrust developer docs (NFT model + TitleEscrow) — https://docs.tradetrust.io/docs/appendix/non-fungible-token/
- TradeTrust token-registry repo (TitleEscrow + TitleEscrowFactory smart-contract architecture) — https://github.com/Open-Attestation/token-registry
- ICC Academy on TradeTrust's MLETR alignment — https://academy.iccwbo.org/digital-trade/article/why-tradetrust-is-the-key-to-digital-trade-interoperability/
- IMDA TradeTrust fact sheet — https://www.imda.gov.sg/-/media/imda/files/news-and-events/media-room/media-releases/2021/08/tradetrust-factsheet.pdf
- Port of Barcelona on TradeLens closure — https://piernext.portdebarcelona.cat/en/technology/the-closure-of-tradelens
- Frontiers in Blockchain commons-theory analysis of TradeLens — https://www.frontiersin.org/journals/blockchain/articles/10.3389/fbloc.2025.1503595/full
- Maersk press release on TradeLens shutdown — https://www.maersk.com/news/articles/2022/11/29/maersk-and-ibm-to-discontinue-tradelens
- Supply Chain Dive on TradeLens shutdown reasons — https://www.supplychaindive.com/news/Maersk-IBM-shut-down-TradeLens/637580/
- UNCITRAL Model Law on Electronic Transferable Records (2017), via TradeTrust framing — https://uncitral.un.org/en/texts/ecommerce/modellaw/electronic_transferable_records (primary text not loaded for this research; TradeTrust's MLETR property summary served as the bridge per agreed methodology)

---

**Cross-references inside the repo**:
- `CLAUDE.md` § "What Figaro Is", § "What Figaro Is Not", § "Common Misframings — Do Not Propose"
- `docs/THEORY.md` — game-theoretic derivation of the kernel invariants
- `docs/DESIGN_DECISIONS.md` — the intentional patterns that look like vulnerabilities but are correct by design (count them there; entry #12 captures the MLETR-non-implementability finding from this research)
- `docs/CLAUSES.md` — the clause validation architecture and anchoring doctrine governing any future clause additions
- `frontend/lib/audit/clauseDataExtract.ts` — the GENERIC per-clause view (`describeClause`) that already surfaces every committed leaf from its spec; the audit bundle carries no genre document
- `frontend/lib/audit/auditBundle.ts` — the per-order audit bundle (generic; no per-genre extractor)
- the clause specs in `clauses/` referenced in §7

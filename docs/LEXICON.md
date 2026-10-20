# Lexicon

Nouns and their definitions. One name per thing.

**agent** — Software that holds a signing key and acts with it, on the same footing as a person. An agent acts for itself — it is then the asset, selling its own value — or for another asset whose wallet it operates. Either way it can buy, sell, and design clauses and assemblies.

**agreement** — The clauses composed for one order. At design time it holds the designer's fills and no values, and is registered under its agreement key; at checkout the buyer fills it with the particulars and the parties sign it, and its merkle root is what the commitment carries. One noun, two states: registered, then signed.

**agreement key** — The hash that names an agreement at design time: the merkle root over one leaf per clause it composes, each leaf the clause key and the designer's fills, value-free, so a clause's membership in the agreement is a merkle proof; the agreement is registered under it. Never the merkle root a signed agreement's commitment carries.

**arbitration forum** — An outside body a designer composes into an assembly to rule on disputes about a process, using the process's data as evidence. A forum rules; the buyer resolves.

**assembly** — A list of agreements: registered agreements composed in order into one reusable design of a process, each with the topology naming the agreements it follows, under the terms composed for the whole design. Published under the merkle root over its agreements and its assembly terms leaf; a process instantiates it.

**assembly terms leaf** — The leaf of an assembly's merkle root that holds the clauses composed for the whole design, which every agreement signed under the assembly carries. Present only when the assembly composes any.

**asset** — A productive thing that owns a wallet and trades through it: a kitchen, a vehicle, a person's labor, a machine, an agent selling its own service. The asset is the party; whoever holds its key operates it.

**attestation** — A representation or warranty a party gives about a process while it is open, signed and bound to the order it concerns: a term of the agreement, executed before resolve. Attestations are the evidence a process's data holds. The chain checks that an attestation is signed and bound, never that it is true; what stands behind a seller's attestation is the buyer's decision to withhold resolution, at the price of its own bond, until a false one is put right, and after resolution the attestation stays in the public data and in its signer's resolution history (`DATA_LAYER.md` § "Truth boundaries").

**batch** — A set of processes resolved together in one transaction on the strength of a validity proof, instead of one at a time through `FigaroCore`.

**bond** — What a party locks in the Core when it commits to an order: the buyer twice the payment — the payments travel inside it — and each seller twice the cumulative value through its order. A bond is what lets two strangers trust each other with no bank, platform, or court between them, the way a permissionless chain lets them transact with no bank: each bond is its party's own deterrent against its own defection, measured net of what a defector keeps. A seller that walks away forfeits twice what it promised and keeps only what it withheld, so it is out exactly what it promised; a buyer that never resolves forfeits twice the payment and keeps what arrived, so it is out exactly the payment. Defection never pays, on either side, and that is what frees a wallet to trade with anyone, anywhere, in any token, on any terms. At resolution each seller's bond is refunded whole; the buyer's is refunded less the payments it carried.

**buyer** — The one party in a process who pays, and the only party who can resolve it.

**catalog** — The document a member publishes listing what it offers, goods, work or its own data, and under which assemblies.

**channel** — The encrypted line along which a buyer and a seller exchange the documents of one order before and during the process.

**checkout** — The step in which a buyer takes a published assembly, fills it with the real parties and amounts, and produces the agreements to be signed.

**clause** — One reusable term of an agreement, written once and registered publicly for anyone to compose. A clause defines a relationship between a buyer and a seller or between two sellers.

**commitment** — The signed object the Core accepts for one order: the process it belongs to, the parties, the payment, the cumulative value, the denomination, the agreement's merkle root, and the deadline after which it can no longer be committed.

**community token** — A community's own token used as a denomination, so value spent through processes elsewhere sustains its worth at home.

**composition** — How anything here is built, on both sides of the Core. Internal: clauses composed into agreements, agreements into assemblies, assemblies instantiated as processes — the designer's act, over the Core without touching it. External, on-chain: plugging a process into another contract on the chain — a swap, a payment splitter, a dispute resolution forum. External, off-chain: meeting a legal or regulatory norm with the data a process leaves — an EU electronic invoice, ESG reporting, GDPR, taxation. Composition is what makes the protocol a network instead of a silo.

**consideration** — The element of a contract by which each party gives value to the other: here the seller's performance and the buyer's payment. The payment travels inside the buyer's bond, half of which is the payment and half the deterrent, and transfers to the seller at resolution; each seller's bond is deterrent only and is refunded whole. Between strangers it is the element that fails; the Core is what makes it hold.

**contract** — What every trade is in law. A binding contract needs six elements, and each has one place here: offer is the buyer's signature over the commitment, carried to the seller; acceptance is the seller's counter-signature over the same commitment; mutual assent is the Core's check at commit that both signatures recover to the named parties over one hash; consideration is the seller's performance and the buyer's payment, the payment carried inside the buyer's bond from commit and transferred to the seller at resolution; capacity is any wallet that can sign and fund its bond, a person's or an agent's, while the law's own capacity, age and competence, stays the person's status and is read where the law reads it; legality is absent from the Core by design and enters through the clauses the agreement hash binds, or through a forum ruling on the data afterward. Its terms are the agreement; its warranties and representations are the attestations; the trail it leaves is the process's data. On chain the word means code, so Figaro says agreement for the parties' document and keeps contract for this definition and for smart contracts.

**coordination token** — A token two strangers can agree on because it is neutral to both: a stablecoin, or the florin. Any process may be denominated in one.

**Core** — The four contracts every trade runs on. `FigaroCore` holds every bond and resolves a process when its buyer signs. `CommitmentTypes` defines the commitment each party signs and how it is hashed for signing. `AttestationCoordinator` binds what a party attests to the agreement it signed. `FigaroBatchVerifier` accepts a validity proof of many processes and resolves them in one transaction.

**cumulative value** — The total value a process has accumulated through a given seller's order, that seller's own payment included. A seller's bond is twice it.

**DAO** — The body that holds and spends the treasury by human judgment.

**data** — The trail a process leaves: what was committed, attested, and resolved, kept where anyone can verify its integrity. The aggregate map is public; the private detail belongs to the parties, who may keep it sealed or sell it on their own terms.

**declaration** — Content a wallet signs outside the Core's checks: a term both parties signed into the agreement at commit, or what a wallet publishes about itself in its registry profile (a service area, a catalog item, a price). The chain never validates a declaration; a term is backed by both signatures, a profile by the member stake and the wallet's resolution history. Never an attestation, which is given about a process while it is open.

**denomination** — The ERC-20 token in which every payment and every bond of one process is counted. One process, one token.

**designer** — The wallet that writes and registers a clause, a registered agreement or an assembly, and tailors its clauses to a market.

**designer rewards** — The share of florins a designer is rewarded, after the fact and in proportion to real use, for the clauses, registered agreements and assemblies processes have used. A reward, minted for the purpose; never a payment, which is the buyer's word.

**dispatch race** — One way an offer forms: a buyer's request goes out to several sellers, each at the price its catalog lists; each willing seller signs it, and the buyer signs one of the answers, the cheapest unless it picks another.

**field** — A value a clause leaves open to be filled: by the designer when the assembly is designed, or by the parties at checkout.

**gas** — What the chain charges to execute a transaction.

**judgment** — What a party decides rather than what the chain computes. Every judgment is exercised before both parties have signed — in design, in binding, in selection at checkout — or is kept by a named party afterwards: the buyer alone deciding to resolve, a forum ruling on a process's data, the DAO spending its treasury. The chain accepts exactly one judgment after commit — the buyer's resolution — and everything else it does is arithmetic.

**member** — A wallet that has registered a profile, with a stake, so that others can find it.

**membership proof** — The merkle proof that an agreement is one of an assembly's agreements: the agreement's leaf, proved under the assembly's merkle root. Membership is proved, never looked up.

**offer** — The buyer's signed commitment over an order's terms, carried to the seller before the seller has signed; the seller's counter-signature is the acceptance. Offers form by dispatch race or by request for quotes.

**operator** — Whoever holds the signing key of an asset's wallet and acts for the asset: a person or an agent. Whose value the wallet carries decides the word — an asset acting for itself is a seller; a key-holder acting for another asset is its operator.

**order** — One buyer–seller commitment inside a process.

**payment** — The value transferred from the buyer to the seller for the value transferred by the seller to the buyer.

**period** — One span of time over which use is counted for designer rewards; a designer's share of each period is claimed after it closes.

**process** — The runtime instance of an assembly that one buyer opens: its orders, resolved together.

**profile** — The document a wallet publishes about itself when it registers as a member.

**protocol** — The rules strangers follow to trade safely and to publish what they trade with: commit with bonds, resolve by the buyer alone, all at once; clauses, registered agreements, assemblies, and members registered publicly under a stake. Figaro is its name. The Core and the registries enforce the rules on a chain; any interface may read them, and anyone may build another. Decentralized and permissionless are the protocol's words, and they describe the protocol, never a wallet: the protocol is never described by its lack of an owner, because an owner is the firm's question and the protocol has no seat for one to be missing from.

**refund** — The return of a bond to the party that deposited it, at resolution: each seller's whole, the buyer's less the payments it carried. Only a bond is ever refunded; a payment transfers. The reversal of a payment, which commerce calls by the same name, has no path in the protocol — a shortfall is put right before the buyer resolves.

**register** — An outside authority's public list — a licensing board, a drivers' roster — that a clause may point to. It is read where it lives; it is never copied into the protocol.

**registered agreement** — An agreement pinned and registered under a stake in its own registry: the reusable unit a designer composes an assembly from, in any assembly, in any position. Named by its agreement key; at checkout it is filled and signed.

**registry** — One of the protocol's four public lists on the chain: clauses, registered agreements, assemblies, members. Each entry is placed by its own wallet with its own stake.

**request for quotes** — The other way an offer forms: a buyer's request goes out and sellers answer with a price, filling only the price fields the request names; the terms are the design's.

**resolution** — The buyer's single signature that ends a process: every payment transfers and every bond is refunded — the buyer's less the payments it carried — all at once.

**resolution history** — A wallet's public-graph summary of the resolved processes it was a party to and the attestations it carries, derived from events at read time, never stored; the honest absence of one is itself the signal. Never a score, a rating, or a protocol-issued credential.

**seller** — A party that adds value in one order of a process and is paid for it at resolution.

**seller of record** — The seller named in an order's commitment: the one whose stake as a member decides whether the order counts toward designer rewards.

**sequencer** — The off-chain relay that gathers signed operations into a batch, proves it, and submits it.

**stake** — The base chain's own currency a wallet places to take part in the ecosystem: to register as a member, or to register a clause, a registered agreement or an assembly as a designer. It rises and falls with demand for the chain the ecosystem runs on. It stays reclaimable by the wallet that placed it; withdrawing it removes the registration from view.

**topology** — The clause that states the order of the sellers in a process.

**treasury** — The DAO's wallet: the florins and the stake it holds.

**utility token** — A designer's own token, pinned as the denomination of an assembly so every process that instantiates it is paid and bonded in that token. Its value is discovered through use of the assembly; it is the designer's share in what they built.

**wallet** — A signing key and the balance it controls. The only identity the protocol knows.

## The two seams

Every noun above sits on one side of two seams, and a sentence that moves a noun across either one is wrong.

**The layers.** Core, protocol, runtime (`CLAUDE.md` § "Three-Tier Naming"). Each layer is usable without the ones above it: a wallet may call the Core alone; a builder may use the Core with the registries and the designer rewards; this interface is one runtime among any number, and a clause this interface de-surfaces may still be surfaced and composed through another. Nothing in a lower layer reads, clears or depends on a higher one.

**Design time and runtime.** Design time is the designer's: the clause, the agreement, the assembly, the registries and the stake. Checkout is the buyer's: the assembly is instantiated, the real parties and amounts fill its agreements, and each agreement's merkle root is computed. Runtime is the process's: the order, the commitment, the process, the attestation, the resolution, the refund. A design holds no values and a process holds no design: an assembly is published once and instantiated any number of times, and a process is the runtime instance of an assembly, never the assembly itself.

| Noun | Layer | Time |
|---|---|---|
| clause | protocol | design |
| registered agreement, agreement key | protocol | design |
| agreement | protocol | checkout |
| assembly, assembly terms leaf, membership proof | protocol | design |
| stake | protocol | design |
| checkout | runtime | checkout |
| order, commitment | Core | checkout to runtime |
| process, attestation, resolution, refund | Core | runtime |
| designer rewards, period | protocol | runtime, counted at resolution |

## Voice

The register every public page is measured against. The lexicon above gives the nouns; this gives the sentence.

- Third person, or the reader's "you". Never "we" or "I": the protocol has no speaker, and nobody signs the site.
- Declarative. One claim per sentence, in the lexicon's nouns and the industry's exact words — permissionless, decentralized, on-chain, smart contract, wallet, token, gas — never a paraphrase of them, and never the register of banking or of platforms.
- No exhortation, no combative absolute, no slogan beyond the tagline. A claim is stated, then shown: the theorem, the Core, or the chain fact it traces to sits beside it or one link away.
- The stranger's question is answered before the mechanism is explained: what it is, what it costs, what happens if it goes wrong.
- The honest caveat lives in the same paragraph as the claim it qualifies, never on another page.
- No sentence a regulator, a court, or a rival could quote against the project out of context. If a sentence needs the page around it to be true, it is rewritten until it is true alone.
- A ruling given in conversation is the meaning, not the wording. It is rendered in this voice before it reaches a page; a line supplied in conversation is never pasted verbatim.
- A designer is rewarded, never paid. Payment is the buyer's transfer to the seller and belongs to the trade; the designer's florins are a reward for use, minted for the purpose. Every florin that leaves the reward reserve is a reward. "Paid in florins" is correct in one case only: a trade whose payment is denominated in florins, where the buyer pays the seller.
- A designer builds a process, never a market: a clause, composed into an agreement, composed into an assembly, run as a process. A market in the world's sense keeps the world's word.

The beta panel is the measure: a page passes when a stranger of its audience states its claim back in their own words with the mechanism attached.

## Voice of the papers

The register every paper is measured against. A paper keeps the lexicon's nouns, the claim stated then shown, the caveat in the paragraph of the claim it qualifies, no sentence that needs the paper around it to be true, and a designer rewarded, never paid. Where a public page and a scholarly paper part, the paper's sentence is Vitalik Buterin's, as his essays show it.

- The claim comes first and its reason follows, marked plainly: "because", "the reason is", a colon. The reader never waits for the point.
- One idea per sentence, fifteen to thirty words; a short flat sentence sits between the long ones. A colon introduces a gloss or a list. No clause stacked on clause, no appositive piled on appositive.
- A definition or a mechanism statement is stated flat. A qualifier belongs to a judgment about the world and is one word: perhaps, arguably, likely. "We believe", "it could be argued", "to some extent" are deleted.
- The objection is named in the referee's own words, as a question, in the paragraph where the claim stands or the one after, and answered there. A claim is never hedged to pre-empt it.
- A number is a figure or a range. An example is a toy model with named variables, worked to its end. An analogy carries the reader into the mechanism once and is then dropped.
- The field's exact word, glossed at first use in a parenthesis or after a colon. A term the paper coins is stated as a definition where it first appears and used by that name after.
- "We" is the byline. "You" is a party reading its own position. "I" never.
- A paragraph runs three to seven sentences, and its thesis sentence can be lifted out and read as its summary. A heading is a statement or a question when the section argues, a label when it defines.
- A paper opens on a fact, a figure or a stipulated scenario, never on its thesis or on the project. It closes on the judgment the argument has earned, in one paragraph.
- One treatment of each idea. A sentence that restates an earlier one in other words is deleted, never varied; repetition is a referee's first finding.

The referee is the measure: a paper passes when a reader of its discipline can state its result and finds no objection the paper has not already answered.

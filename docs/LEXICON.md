# Lexicon

Nouns and their definitions. One name per thing.

**agent** — Software that holds a signing key and acts with it, on the same footing as a person. An agent acts for itself — it is then the asset, selling its own value — or for another asset whose wallet it operates. Either way it can buy, sell, and design clauses and assemblies.

**agreement** — The clauses composed for one order, every field filled. Its merkle root is what the commitment carries.

**arbitration forum** — An outside body a designer composes into an assembly to rule on disputes about a process, using the process's data as evidence. A forum rules; the buyer resolves.

**assembly** — Agreements composed into one reusable design of a process: which relationships it holds, in what order, under what terms. Published under the hash of its composition; a process instantiates it.

**asset** — A productive thing that owns a wallet and trades through it: a kitchen, a vehicle, a person's labour, a machine, an agent selling its own service. The asset is the party; whoever holds its key operates it.

**attestation** — A signed statement a party makes about a process while it is open, bound to the order it concerns. Attestations are the evidence a process's data holds.

**batch** — A set of processes resolved together in one transaction on the strength of a validity proof, instead of one at a time through the kernel.

**bond** — What a party locks in the kernel when it commits to an order: the buyer twice the payment — the payments travel inside it — and each seller twice the cumulative value through its order. A bond is the party's own deterrent against its own defection. At resolution each seller's bond is refunded whole; the buyer's is refunded less the payments it carried.

**buyer** — The one party in a process who pays, and the only party who can resolve it.

**catalogue** — The document a seller publishes listing what it offers and under which assemblies.

**channel** — The encrypted line along which a buyer and a seller exchange the documents of one order before and during the process.

**checkout** — The step in which a buyer takes a published assembly, fills it with the real parties and amounts, and produces the agreements to be signed.

**clause** — One reusable term of an agreement, written once and registered publicly for anyone to compose. A clause defines a relationship between a buyer and a seller or between two sellers.

**commitment** — The signed object the kernel accepts for one order: the process it belongs to, the parties, the payment, the cumulative value, the denomination, the agreement's merkle root, and the deadline after which it can no longer be committed.

**community token** — A community's own token used as a denomination, so value spent through processes elsewhere sustains its worth at home.

**composition** — Plugging a process into another contract on the chain: a swap, a payment splitter, an arbitration forum. Composition is what makes the protocol a network instead of a silo.

**consideration** — The element of a contract by which each party gives value to the other. Between strangers it is the element that fails; the kernel is what makes it hold.

**contract** — What every trade is. A binding contract needs offer, acceptance, consideration, capacity, legality, and mutual assent, and implies a body of terms and a trail of data.

**coordination token** — A token two strangers can agree on because it is neutral to both: a stablecoin, or the florin. Any process may be denominated in one.

**cumulative value** — The total value a process has accumulated through a given seller's order, that seller's own payment included. A seller's bond is twice it.

**DAO** — The body that holds and spends the treasury by human judgment.

**data** — The trail a process leaves: what was committed, attested, and resolved, kept where anyone can verify it. The aggregate map is public; the private detail belongs to the parties, who may keep it sealed or sell it on their own terms.

**denomination** — The ERC-20 token in which every payment and every bond of one process is counted. One process, one token.

**designer** — The wallet that writes and registers a clause or an assembly, and tailors its clauses to a market.

**designer rewards** — The share of florins paid, after the fact and in proportion to real use, to the designers whose clauses and assemblies processes have used.

**dispatch race** — One way an offer forms: a buyer's request goes out and the first willing seller takes it.

**field** — A value a clause leaves open to be filled: by the designer when the assembly is designed, or by the parties at checkout.

**gas** — What the chain charges to execute a transaction.

**judgment** — What a party decides rather than what the chain computes. Every judgment is exercised before both parties have signed — in design, in binding, at checkout, in negotiating the offer — or is kept by a named party afterwards: the buyer alone deciding to resolve, a forum ruling on a process's data, the DAO spending its treasury. The chain accepts exactly one judgment after commit — the buyer's resolution — and everything else it does is arithmetic.

**kernel** — The two frozen contracts: `FigaroCore`, which holds every bond and resolves a process when its buyer signs, and `CommitmentTypes`, which defines the commitment and how it is hashed for signing. Two operations: commit and resolve.

**member** — A wallet that has registered a profile, with a stake, so that others can find it.

**offer** — The terms one party proposes for an order before both have signed. Offers form by dispatch race or by request for quotes.

**operator** — Whoever holds the signing key of an asset's wallet and acts for the asset: a person or an agent. Whose value the wallet carries decides the word — an asset acting for itself is a seller; a key-holder acting for another asset is its operator.

**order** — One buyer–seller commitment inside a process.

**payment** — The value transferred from the buyer to the seller for the value transferred by the seller to the buyer.

**period** — One span of time over which use is counted for designer rewards; a designer's share is paid for each period after it closes.

**process** — The runtime instance of an assembly that one buyer opens: its orders, resolved together.

**profile** — The document a wallet publishes about itself when it registers as a member.

**protocol** — The rules strangers follow to trade safely and to publish what they trade with: commit with bonds, resolve by the buyer alone, all at once; clauses, assemblies, and members registered publicly under a stake. Figaro is its name. The kernel and the registries enforce the rules on a chain; any interface may read them, and anyone may build another.

**refund** — The return of a bond to the party that deposited it, at resolution: each seller's whole, the buyer's less the payments it carried. Only a bond is ever refunded; a payment transfers. The reversal of a payment, which commerce calls by the same name, has no path in the protocol — a shortfall is put right before the buyer resolves.

**register** — An outside authority's public list — a licensing board, a drivers' roster — that a clause may point to. It is read where it lives; it is never copied into the protocol.

**registry** — One of the protocol's three public lists on the chain: clauses, assemblies, members. Each entry is placed by its own wallet with its own stake.

**request for quotes** — The other way an offer forms: a buyer's request goes out and sellers answer with terms.

**resolution** — The buyer's single signature that ends a process: every payment transfers and every bond is refunded — the buyer's less the payments it carried — all at once.

**seller** — A party that adds value in one order of a process and is paid for it at resolution.

**seller of record** — The seller named in an order's commitment: the one whose stake as a member decides whether the order counts toward designer rewards.

**sequencer** — The off-chain relay that gathers signed operations into a batch, proves it, and submits it.

**stake** — The base chain's own currency a wallet places to take part in the ecosystem: to register as a member, or to register a clause or an assembly as a designer. It rises and falls with demand for the chain the ecosystem runs on. It stays reclaimable by the wallet that placed it; withdrawing it removes the registration from view.

**topology** — The clause that states the order of the sellers in a process.

**treasury** — The DAO's wallet: the florins and the stake it holds.

**utility token** — A designer's own token, pinned as the denomination of an assembly so every process that instantiates it is paid and bonded in that token. Its value is discovered through use of the assembly; it is the designer's share in what they built.

**wallet** — A signing key and the balance it controls. The only identity the protocol knows.

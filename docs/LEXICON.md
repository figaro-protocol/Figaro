# Lexicon

Nouns and their definitions. One name per thing.

## Figaro specific terminology

**agreement** — A merkle tree of clauses. It defines the relationship between a buyer and a seller. Its design is saved on IPFS and registered in the agreement registry under its merkle root, the `agreementHash`, and its CID, for designers to reuse in process designs. Completed at checkout, it is a new tree whose merkle root, the `checkoutHash`, commits to the parties' data; the commitment carries the root, never the data.

**attestation** — A statement a party signs with its wallet, during the process, about a clause of its agreement. The chain accepts it only from the process's buyer or one of its sellers, only before resolution, and only once the clause is proved in the `checkoutHash`; it keeps the hash of the content, never the content, and checks who signed it and what it is bound to, never whether it is true.

**clause** — A term in an agreement. Its spec is saved on IPFS and registered in the clause registry under its key and its CID, for designers to reuse in agreements.

**commitment** — The object a buyer and a seller both sign, one per seller in a process: the parties, the token, the payment, the process's running total, the `checkoutHash`, a salt and a commit deadline, past which it can no longer be committed. `FigaroCore` accepts it with both signatures and locks both bonds.

**composition** — How anything here is built, on both sides of the Core. Internal: clauses composed into agreements and agreements into process designs — the designer's act, over the Core without touching it — and a process design instantiated as a process at checkout. External, on-chain: plugging a process into another contract on the chain — a swap, a payment splitter, a dispute resolution forum. External, off-chain: meeting a legal or regulatory norm with the data a process leaves — an EU electronic invoice, ESG reporting, GDPR, taxation. Composition is what makes the protocol a network instead of a silo.

**Core** — The four contracts every trade runs on. `FigaroCore` holds each bond on the direct path and resolves a process when its buyer calls it. `CommitmentTypes` defines the commitment each party signs and how it is hashed for signing. `AttestationCoordinator` binds what a party attests to the agreement it signed. `FigaroBatchVerifier` accepts a validity proof of many processes, nets each party's deposits and payouts across them, and moves only the difference in one transaction.

**process** — A merkle tree of agreements, designed once and run many times. Its design, the process design, has one leaf per agreement, each verifiable by a merkle proof; when the design carries terms that belong to the whole process, one further leaf holds them, and that leaf is not an agreement. The design is saved on IPFS and registered in the process registry under its merkle root, the `processDesignHash`, and its CID, and every run of it reuses it. A run is opened by a buyer's first commitment, extended by each further commitment in the same token, and ended by the buyer's resolution. The Core identifies a run by the hash of its first commitment, the `processId`, and holds its buyer, its token, its running total and its open commitments.

**refund** — The return of a bond to the party that locked it, at resolution: each seller's whole, the buyer's less the payments it carried. Only a bond is ever refunded; a payment transfers.

**resolution** — The buyer's one act that ends a process: a call on the direct path, a signed operation on the batch path. It must name every open order of the process, and in one transaction every payment transfers and every bond is refunded. Only the buyer can make it, and it is final.

**stake** — The tokens a wallet locks in a registry to register: as a member, or a clause, an agreement or a process design. While they are locked, the registration is surfaced; once the wallet withdraws them, it leaves view.

## Words from the law and the market

These words are not Figaro's nouns. A sentence uses one only when it tells the law's or the market's side, and it names Figaro's counterpart beside it; every other sentence uses Figaro's noun.

| The outside word | Its outside sense | Figaro's counterpart |
|---|---|---|
| `contract`, `terms` | the parties' binding promise and what it says | the agreement: every trade is an agreement |
| `offer` | the first party's proposal | the buyer's signature over the commitment; in a dispatch race, the buyer's unsigned draft, which each candidate counter-signs as its availability and the buyer's signature on one of them then selects |
| `acceptance` | the other party's assent | the seller's counter-signature; in a dispatch race, the buyer's signature on the one counter-signed draft it selects |
| `mutual assent` | a meeting of minds | the Core's check of both signatures at commit |
| `negotiation` | bargaining over the terms | design and selection: the designer composes, the seller binds, the buyer selects |
| `consideration` | the value given in exchange | the payment |
| `capacity` | legal status: age, authority | a wallet that can sign and fund its bond |
| `legality` | a condition of validity | a clause that composes in, or a forum ruling on the data |
| `warranty`, `representation` | a promise about a fact | an attestation |
| `refund` (commerce) | a payment reversed | a refund: only of a bond, at resolution |
| `deposit`, `collateral`, `escrow` | tokens held as security by someone | the bond: the Core holds it, and no third party does |
| `fee`, `levy` | a charge or a tax | none: the Core takes nothing; designers are rewarded from the reserve, counted by use |
| `breach` | walking away, at a price | a move that leaves the party worse off than keeping its word |
| `remedy` | compensation after the fact | put right before the buyer resolves |
| `enforcement` | the state compelling performance | the equilibrium: keeping one's word is each party's best reply |
| `subordination` | another party deciding what an asset is used for, a person's labor included, and taking what that use returns; title is separate | none: the asset's own wallet decides its use trade by trade and keeps what it produces |

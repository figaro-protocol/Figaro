# Lexicon

Nouns and their definitions. One name per thing.

## Figaro specific terminology

**agreement** — A merkle tree of clauses, one leaf per clause, each verifiable by a merkle proof. It defines the relationship between a buyer and a seller. Its design is saved on IPFS and registered in the agreement registry under its merkle root, the `agreementHash`, and its CID, for designers to reuse in assemblies. Completed at checkout, it is a new tree whose merkle root, the `checkoutHash`, commits to the parties' data; the commitment carries the root, never the data.

**assembly** — A merkle tree of agreements, one leaf per agreement, each verifiable by a merkle proof. Its design is saved on IPFS and registered in the assembly registry under its merkle root and CID, and every process that instantiates it reuses it.

**attestation** — A statement a party signs with its wallet, during the process, about a clause of its agreement. The chain accepts it only from the process's buyer or one of its sellers, only before resolution, and only once the clause is proved in the `checkoutHash`; it keeps the hash of the content, never the content, and checks who signed it and what it is bound to, never whether it is true.

**clause** — A term in an agreement. Its spec is saved on IPFS and registered in the clause registry under the hash of its bytes and its CID, for designers to reuse in agreements.

**commitment** — The object a buyer and a seller both sign, one per seller in a process: the parties, the token, the payment, the process's running total, the `checkoutHash`, a salt and a deadline. `FigaroCore` accepts it with both signatures and locks both bonds.

**composition** — How anything here is built, on both sides of the Core. Internal: clauses composed into agreements and agreements into assemblies — the designer's act, over the Core without touching it — and assemblies instantiated as processes at checkout. External, on-chain: plugging a process into another contract on the chain — a swap, a payment splitter, a dispute resolution forum. External, off-chain: meeting a legal or regulatory norm with the data a process leaves — an EU electronic invoice, ESG reporting, GDPR, taxation. Composition is what makes the protocol a network instead of a silo.

**Core** — The four contracts every trade runs on. `FigaroCore` holds each bond on the direct path and resolves a process when its buyer calls it. `CommitmentTypes` defines the commitment each party signs and how it is hashed for signing. `AttestationCoordinator` binds what a party attests to the agreement it signed. `FigaroBatchVerifier` accepts a validity proof of many processes, nets each party's deposits and payouts across them, and moves only the difference in one transaction.

**process** — The runtime instance of an assembly: opened by a buyer's first commitment, extended by each further commitment in the same token, and ended by the buyer's resolution. The Core identifies it by the hash of its first commitment and holds its buyer, its token, its running total and its open commitments.

**refund** — The return of a bond to the party that deposited it, at resolution: each seller's whole, the buyer's less the payments it carried. Only a bond is ever refunded; a payment transfers.

**resolution** — The buyer's one act that ends a process: a call on the direct path, a signed operation on the batch path. It must name every open order of the process, and in one transaction every payment transfers and every bond is refunded. Only the buyer can make it, and it is final.

**stake** — The tokens a wallet locks in a registry to register: as a member, or a clause, an agreement or an assembly. While they are locked, the registration is surfaced; once the wallet withdraws them, it leaves view.

# Figaro — the vision

Every trade is a contract, and between strangers one element of it fails.
Figaro makes that element hold, and the firm stops being necessary.

## The problem

A binding contract needs offer, acceptance, consideration, capacity, legality,
and mutual assent, and it implies a body of terms and a trail of data. Between
people who know each other, or who share a court, all eight hold. Between
strangers, consideration fails: each can promise value; nothing makes delivering
it credible.

Everything built to get past that puts an institution between the two parties.
The firm puts both inside one hierarchy. The platform admits, holds, and polices.
The court punishes afterward. Each makes a stranger's promise credible by putting
a third party in charge of it — and the third party is the cost of coordination:
it decides who is admitted, holds what passes between the parties, sets the rules
and changes them, keeps the data, takes its share, and reaches only those it
reaches.

## What Figaro does

Figaro makes consideration credible with nobody in charge of it. When a buyer
and a seller commit to an order, each deposits a bond: the buyer twice the
payment, the seller twice the cumulative value through its order. A bond is its
owner's own deterrent — whatever a party could gain by walking away, it leaves
more behind. Only the buyer resolves the process, and resolution pays every
seller and refunds every bond at once. Keeping one's word is each party's best
move on every order, and the process holds as one: nobody is paid until the
buyer resolves, so every seller has a live interest in putting right any one
seller's fault before that signature. Two frozen contracts — the kernel — do
this and nothing else.

Everything people touch is built above the kernel. Terms are clauses, written
once and registered for anyone to compose. Offer and acceptance are assemblies
— agreements composed into a reusable design of a process — and checkout, where
a buyer fills one with real parties and amounts. Capacity is any wallet, a
person's or an agent's, registered under a stake. Mutual assent is the two
signatures. Legality composes in: name an arbitration forum in the terms, or let
an outside forum rule afterward on the same data. The data a process leaves is
public in aggregate and the parties' own in detail. Designers are paid from the
commons in proportion to real use of what they published. And a process
composes with any other contract on the chain — a swap, a payment splitter, a
forum — so the protocol is a network rather than a silo.

The derivation is in `THEORY.md`; the contracts in `CONTRACTS.md`; the clauses
in `CLAUSES.md`; the papers, reached from the site's working-groups page, carry
each result in full.

## The post-firm economy

Firms exist because coordinating across a market between strangers has been
costly: vetting, trusting, contracting, enforcing. Make a stranger's promise
self-enforcing and that cost falls to a signature. What forms instead of a firm
is a **transaction-scoped institution**: the parties a single process needs — a
cook, a kitchen, a sourcer, a courier; a haulier, a broker, a warehouse — each
bonding and paid in its own order, assembled for that process and dissolved at
its resolution. There is no restaurant and no shipping line, only the wallets
that did the work, paid directly for the value each added. The paper on
transaction-scoped institutions develops this; `/consequences` on the site
follows it outward.

## Where the value goes

If the firm dissolves, what becomes of the value it captured?

A process is an itemized ledger that closes itself. What the buyer pays
decomposes into every asset required to produce it — the aircraft, the fuel,
the crew, the landing slot, the brand, the maintenance, the ground handling —
and each asset is a wallet that bonds and is paid its line. That one
decomposition is the buyer's checkout, the trail a regulator reads, and the
invoice, all at once.

A firm's worth was its moat: exclusive control of something scarce that
competitors could not reach. The moat is a subset of those lines — for an
airline the slots and the brand, never the aircraft, which are leased and
interchangeable. Processes compete the interchangeable lines toward what they
must earn to keep participating; the moat keeps its pricing power.

The **utility token** is how the moat survives the firm. A designer pins their
own token as the denomination of their assembly, so every process that
instantiates it is paid and bonded in that token. Its worth is discovered
through use of the assembly, not on a stock market — the share certificate of
an entity that was never incorporated, priced by demand for access to what the
designer built. It is distinct from a **coordination token**, which strangers
choose because it is neutral to both, and from a **community token**, whose use
in processes elsewhere sustains its worth at home. The tokens a wallet holds
say which communities and which designs it takes part in.

The equilibrium has no fixed point. Value capture moves from the top
of the firm down to the assets that produce, and it rests where each asset
earns what it needs to keep taking part in processes — a productive life. The
market enforces that the way it enforces going concern everywhere: a wallet
that cannot bond leaves.

## Denominations, and the florin

Any ERC-20 may denominate a process, and the choice is itself a statement: a
stablecoin, a designer's utility token, a community's own token. The florin is
the protocol's own coordination token — a unit any two strangers can converge on
when they share no other, with a supply fixed at one billion and most of it
reserved for designer rewards. `FLORIN_TOKEN.md` holds the design.

## One deployment, anyone builds

The kernel is deployed once, owned by no one. One contract everyone reads is
worth more than a thousand forks of it: the same tooling, the same indexers,
the same wallets serve every process, and every process's public data lies on
one map. The network grows by what is built above the kernel, by anyone —
clauses, assemblies, interfaces, other contracts — and designer rewards pay for
that growth in proportion to use. `PUBLIC_GRAPH_MODEL.md` describes the map;
`OPEN_WORLD.md` describes how the layers above the kernel are composed.

## Recourse

Five layers stand behind a process, innermost first: the chain, whose
consensus makes the data authentic; the bonds, which make performance each
party's best move; the co-sellers, whose payment waits on the same resolution
and who therefore help remedy a fault; an arbitration forum, named in the terms
or chosen afterward, which rules on the data; and the courts, which read the
same data from outside. The inner layers carry almost every process; the outer
ones exist for the remainder. The paper on asymmetric bonding derives the
first three; the paper on on-chain evidence develops the last two.

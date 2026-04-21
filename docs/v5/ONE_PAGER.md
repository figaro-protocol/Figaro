# Figaro Protocol

**Self-enforcing agreements between strangers.**

---

## The Property

Two people who have never met can make a deal, and both will keep it —
not because they trust each other, not because a judge is watching, but
because breaking the deal costs more than keeping it. Always. Automatically.

This is the property Figaro creates. Everything else — the mechanism, the
composition, the evidence, the token — follows from it.

## How It Works

Both parties put down a deposit. The buyer deposits 2× the payment. The
seller deposits 2× the value they deliver. If both perform, both get
their deposits back and the seller earns the payment. If either cheats,
both lose their deposits.

A cheating buyer keeps the goods but forfeits a deposit worth twice the
goods. Net loss. A cheating seller keeps nothing and forfeits a deposit
worth twice their obligation. Worse loss. Neither party benefits from
defecting, regardless of what the other does.

This is a Nash equilibrium. The only rational move is to cooperate.

No arbitrator decides the outcome. No timeout releases the funds. No
one needs to trust anyone. The locked capital *is* the enforcement.

**Why 2×?** At 1×, a cheating seller breaks even. At 2×, cheating always
costs more than the maximum possible gain. 2× is the minimum amount that
makes every form of defection irrational.

## Agreements That Compose

Real commerce is not one buyer and one seller. It is a tree of
contributors: a cook, a kitchen operator, an ingredient sourcer, a
courier, a vehicle owner. Each one makes a separate self-enforcing
agreement within the same process.

Each contributor deposits against the full value of everything upstream —
not just their own slice. A courier delivering a $10 meal deposits against
the $12 cumulative value (meal + delivery), not against $2. If the courier
fails, the cook also loses their deposit — because the buyer cannot
approve a half-complete process.

This creates the micro-lending circle effect: everyone in the tree is
accountable for everyone else. Coordination emerges from self-interest,
not management. There is no firm. There is no employer. There are
independent contributors, each bonded directly to the process they
participate in.

The stronger consequence is organizational: each process becomes a
transaction-scoped institution. What the interface may still call a
restaurant, dispatch service, or marketplace is, underneath, a temporary
assembly of directly bonded contributors that exists for the life of the
process and dissolves at settlement.

The buyer resolves once. The entire tree settles in a single transaction.

## What Self-Enforcement Produces

When agreements are self-enforcing, they generate evidence as a
side effect.

Every lifecycle event — preparation started, picked up, delivered — is a
timestamped, role-gated attestation on the blockchain. This is not
ceremony. It is the evidence layer: tamper-proof records that serve as
court-admissible proof if the rare dispute escapes the economic deterrent.

These records organize into public semantic graphs:

- **Process graph** — every order, bond, and settlement
- **Geographic graph** — geohashes and routing signals
- **Disclosure graph** — GHG emissions, compliance data
- **Capital graph** — bond flows, vault positions, auction prices
- **Provenance graph** — links across processes and templates

The graphs are intentionally public — they are the "economic pheromones"
that let participants (human or autonomous) discover opportunities, assess
counterparties, and compose new processes. Private details (delivery
addresses, personal data) are encrypted per-order with ephemeral keys.

## The Token

Figaro works with any ERC-20 token. You can bond in stablecoins, ETH
wrappings, or community currencies. The protocol is token-agnostic.

**FIG** is the protocol's native token — a coordination Schelling point.
It is the unit participants converge on by name. "Send me 50 Fig." It is
not governance, not staking, not required to participate. It is the token
people ask for.

FIG is minted only when orders resolve. 100 FIG per settlement in epoch 0,
halving every ten million settlements, capped at 600 million. The batch
path uses Euler oscillation on the same decay envelope, peaking at 150 FIG.
Only sellers receive it — they bear the asymmetric capital commitment.

## Three Layers of Enforcement

Self-enforcing agreements do not rely on a single defense:

1. **Economic** — Deposits make cooperation the dominant strategy. Rational
   actors never defect. This covers 99%+ of transactions.

2. **Social** — Multi-party processes bind contributors together. Each
   contributor's failure costs everyone, so they police each other. Same
   principle as micro-lending circles, where group accountability drops
   default rates from ~20% to ~2%.

3. **Legal** — For the fraction involving irrational or adversarial actors,
   the blockchain provides immutable, timestamped evidence. Courts do not
   need to reconstruct what happened — it is already on-chain.

## What Eats Proves

Figaro Eats is the first working archetype — a complete food delivery
institution rendered from the canonical runtime and composed from
permissionless primitives:

- **Bonded ordering** — buyer and restaurant each deposit
- **Dutch auction** — delivery jobs posted at a decaying price; first
  driver to accept wins
- **Attestation coordinator** — on-chain attestations for each lifecycle stage
- **Operator registry** — on-chain participant registration and metadata
- **GHG disclosure** — optional per-order emissions reporting

Three roles — buyer, restaurant, driver — coordinate a real order
lifecycle with real deposits. The process tree settles atomically.

Prototype2 is the canonical runtime. Eats is the first proving ground.
Each order assembles a temporary institution around a bonded process
tree, then dissolves at settlement. Eats is a template. Any community
can fork it.

## The Opportunity

The property — self-enforcing agreements — is general. Any scenario where
strangers need to coordinate reliably is a candidate:

- **Delivery** — prepared food, parcels, groceries
- **Ride-hail** — driver, vehicle owner, passenger
- **Procurement** — multi-tier sourcing with progressive bonding
- **Freelance** — milestone-based delivery with bonded settlement
- **Any community** — diaspora networks, cooperatives, DAOs

In each case, the runtime is not rendering a standing firm by default.
It is rendering a transaction-scoped institution assembled around a
bonded process.

The protocol is permissionless. The code is open. Anyone with a wallet
can use it.

---

**Full mechanism design:** [THEORY.md](THEORY.md)
**Runtime architecture:** [RUNTIME_THESIS.md](RUNTIME_THESIS.md)
**Extension framework:** [PROTOCOL_EXTENSION_DOCTRINE.md](PROTOCOL_EXTENSION_DOCTRINE.md)
**Token design:** [FIG_TOKEN.md](FIG_TOKEN.md)
**Source code:** [github.com/figaro-protocol](https://github.com/figaro-protocol) *(pre-release)*

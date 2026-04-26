# Figaro Project History

This document traces the intellectual lineage of the Figaro protocol from
its first formulation in 2022 through the current FigaroCore architecture.
It is documentation, not citation: it explains where the project came from,
who contributed what, and which ideas were tried and abandoned along the
way. The current authoritative description of the protocol lives in
`docs/v5/VISION.md`, `docs/v5/THEORY.md`, the eight academic companion
papers in `paper/`, and the Solidity source in `src/`.

## Lineage at a glance

| Iteration | Year | Authors | Core mechanism | Status |
|---|---|---|---|---|
| Figaro-Original | March 2022 | F. R. Genovese & A. Daliana | Proof of Action (PoA), own consensus | Abandoned |
| Figaro-2 | 2022–2023 | F. R. Genovese & A. Daliana | 5-tx escrow with Mutually Assured Loss reasoning | Abandoned |
| FigaroCore (current) | 2024–2026 | A. Daliana | Asymmetric bonding on existing chains, 231 LOC | Active |

Archives: `docs/archive/origins/Figaro - Original.pdf` and
`docs/archive/origins/Figaro - 2.pdf`. Each archive carries a `.md`
companion. The README in that directory points readers to the current
docs; this document explains how the iterations connect.

## Figaro-Original (March 30, 2022)

**Authors**: Fabrizio Romano Genovese (fabrizio.eth, technical lead,
categorical-mathematics background) and Alessandro Daliana (logistics
expertise). The two were introduced by Vlad Zamfir.

**Concept**: A blockchain-based solution to the *last-mile problem* in
logistics. Substituted Proof of Work with **Proof of Action (PoA)**:
proof-of-delivery as evidence-of-work, earning the right to mint a block.

**Architecture**: Its own chain with its own consensus, its own currency,
fee caps (`baseFee + deliveryFee`, both capped at protocol level), and a
five-transaction-type escrow model — Request, Cancel-Request, Take, Pickup,
Delivery, plus slashing — with slashing-to-protocol when transactions
were left undetermined. A governance layer was contemplated for refunds
and dispute mediation.

**Naming**: The factotum framing originates here. From §1.0:
> *"The name Figaro plays homage to the main character of Gioacchino
> Rossini's* Il Barbiere di Siviglia. *Figaro is the city factotum, running
> around making errands here and there for a diversified plethora of
> clients."*

The "Largo al factotum" aria — Figaro's entrance in the Rossini opera —
is the load-bearing reference. This is the source the current portfolio
should cite for the metaphor; later attributions to Mozart's *Le Nozze*
are mistaken (Mozart's Figaro is a married servant in a different
Beaumarchais play, not a self-declared city factotum).

**Ethical motivation**: Explicit critique of platform exploitation
(Uber's review-driven safety problems, percentage extraction). The
"more ethical solution" framing is in §1.3.

**Surfaces continuous with current**: the name, the factotum metaphor,
the no-platform ethic, and the use of locked escrow as enforcement.

## Figaro-2 (2022–2023)

**Authors**: Same.

**Concept**: A refinement of Figaro-Original retaining the
five-transaction-type model but tightening the escrow logic. Each
transaction type carries explicit collateral commitments; cancellation
mechanisms were elaborated; a private-key-based encrypted messaging
layer was specified for handoff coordination.

**Architecture**: Unified Request → Take → Pickup → Delivery state
machine with explicit slashing for undetermined states. Stablecoin
reasoning was added (riders need stable purchasing power; the
geographically-local nature of Figaro favors non-USD stablecoin
adoption). Fee caps and governance-layer refunds remained.

**Key intellectual seed**: §3.4, Remark 3.4.6 on **Mutually Assured
Loss**. From the archive:

> *"A malicious user may create a fictitious restaurant and create fake
> R-Tx with high insurance. When rider emits a T-Tx to pick the order
> up he becomes aware that the R-Tx was a scam, and is forced to cancel
> T-Tx effectively 'donating' part of the escrow to the scammer. This
> hypothetical attack is avoided by noticing that rider may also choose
> not to sign a T-TX. In this way, rider keeps the escrow locked,
> losing some money, but the scammer looses fee as well."*

This is the conceptual seed of asymmetric bonding. The full formal
derivation — *that defection always costs more than cooperation when
collateral scales correctly with payment* — would not arrive until the
current iteration. But the core intuition — *make the worst outcome of
defection symmetric and large enough that no rational party will choose
it* — is here.

**Formal foundation**: Cited Genovese & Spivak's "Categorical Semantics
for Guarded Petri Nets" (Graph Transformation, 2020) as the formal
mathematical substrate for the dependent-finite-state-machine model of
the protocol's transaction lifecycle.

**Surfaces continuous with current**:
- The MAD-like reasoning that becomes asymmetric bonding
- Encrypted handoff coordination via wallet keypairs (now XMTP via
  `lib/handoff/`)
- Geographic-area approximate locations (now `figaro-geo-v1` schema)
- Dual-signed dispute-data transactions (now EIP-712 dual signatures)
- Stablecoin-volatility concerns (now monotoken-per-process invariant)

**Surfaces abandoned**:
- Own-chain consensus (current FigaroCore is chain-agnostic, deploys on
  existing EVM chains)
- Five-transaction-type model (replaced by unified `commit` and
  `resolveProcess`)
- Slashing-to-protocol (no protocol fees in current FigaroCore)
- Fee caps (`baseFee`, `deliveryFee`, `maxFee` — all gone; gas is the
  only cost)
- Governance layer for refunds (no governance in current FigaroCore;
  no admin, no owner, no upgrade path)
- Project-internal currency (replaced by ERC-20 token-agnosticism)
- Categorical-semantics formalization (replaced by Solidity + TLA⁺ /
  Echidna / Halmos / Certora)
- Last-mile-specific scope (generalized to coordination across all
  bilateral-bonded settlement)

## FigaroCore (2024–2026, current)

**Author**: Alessandro Daliana (solo).

**Concept**: A coordination primitive — not a chain, not a logistics
solution, not an Uber-killer. Two external functions (`commit`,
`resolveProcess`), three mappings, EIP-712 dual signatures, asymmetric
bonding (buyer locks 2× payment; seller locks 2× cumulative value),
N-party process trees with progressive collateralization. 231 LOC. No
admin, no owner, no fee, no governance.

**Three-tier framing**: kernel (FigaroCore) / protocol (kernel + extension
doctrine + public graphs) / runtime (protocol + semantic layer + builder
surfaces + UI). The kernel is ideologically agnostic; the graph composed
on top of it is where ideology, jurisdiction, currency, and forum get
expressed.

**External composability**: The kernel does not include a forum, an
offset market, a prediction market, an insurance pool, a lending facility,
a tax-reporting service, an identity provider, a storage layer, or a
messaging fabric. Each of these is composable via the *coordinator
pattern* (implementation paper §7).

**Formal verification**: TLA⁺ (15 invariants across FigaroCore + FigToken),
Echidna (7 properties), Halmos (11 z3-backed symbolic proofs), Certora
(35 declared CVL rules across 6 specs, all green as of 2026-04-23).

**Portfolio**: nine companion papers (A — mechanism design, B1 —
institutional economics, B2 — political economy, C — implementation &
verification, D — cryptoeconomics, E — law & evidence, F1 — labor law,
F2 — humanitarian/statelessness, G — accounting). Discipline-per-audience;
each paper assumes only its own field's vocabulary. See `paper/` and
`/research` on the frontend.

## What survived, what was abandoned

**Continuous threads** (present from Figaro-Original or Figaro-2,
preserved in current FigaroCore):

- The factotum-of-the-city / coordinator-without-ownership metaphor
  (originates in Figaro-Original)
- The Mutually-Assured-Loss reasoning (seed in Figaro-2 §3.4 Remark
  3.4.6, fully formalized as asymmetric bonding in current)
- Encrypted handoff via wallet keypairs (present in Figaro-2,
  implemented as XMTP integration in current)
- Geographic-area approximate locations for privacy (present in
  Figaro-2, formalized as `figaro-geo-v1` schema in current)
- Dual-signed dispute resolution (present in Figaro-2, formalized as
  EIP-712 dual signatures in current)
- The no-platform ethic (present from Figaro-Original)

**Abandoned threads** (tried in Figaro-Original or Figaro-2, deliberately
removed in current FigaroCore):

- Proof of Action consensus mechanism
- Own-chain architecture (current is chain-agnostic, deploys on existing
  EVM chains)
- Five-transaction-type model
- Slashing-to-protocol (any protocol-extracted fees)
- Fee caps (`baseFee`, `deliveryFee`, `maxFee`)
- Governance layer for refunds and disputes
- Project-internal currency
- Categorical-semantics as the formal substrate (replaced by
  industry-standard formal-verification tooling)
- Last-mile-specific scope

The convergence pattern is consistent: every iteration removed surface
area while preserving the load-bearing intuition. Figaro-Original was a
chain plus a protocol plus a currency plus a governance system; current
FigaroCore is just a contract. The intellectual asset that survived is
asymmetric bonding plus the factotum framing; everything else was
scaffolding to discover those.

## Why this document exists

Three reasons.

First, **provenance for the factotum metaphor**. The current portfolio
cites the metaphor as substantive rather than decorative; the credibility
of that claim is enhanced by the fact that the metaphor predates the
current mechanism by four years. The naming was the founding image, not
a retrospective justification.

Second, **acknowledgment of co-authorship in the early iterations**.
Fabrizio Romano Genovese was the technical co-author of both
Figaro-Original and Figaro-2. The current portfolio is solo-authored,
but the intellectual lineage includes his categorical-mathematics
formalization and his contributions to the early protocol design. The
project would not exist without that collaboration.

Third, **honest history of rejected ideas**. A reader who encounters
the current FigaroCore and finds it striking precisely because of how
narrow it is should know that the narrowness was reached through
deliberate cuts rather than initial parsimony. Each abandoned thread
(PoA, fee caps, governance refunds, own-chain) was tried in earlier
iterations and removed because the bonding-equilibrium analysis showed
the kernel was stronger without it. The convergence is the substantive
result.

## How to read the archives

If you have read the current portfolio and want to see what came before:

1. `docs/archive/origins/Figaro - Original.pdf` — March 2022, 21 pages.
   The PoA-and-last-mile starting point. The factotum naming passage
   is in §1.0 of Chapter 1.

2. `docs/archive/origins/Figaro - 2.pdf` — refines the escrow logic.
   The Mutually-Assured-Loss seed is in §3.4 (Remark 3.4.6). The
   five-transaction-type state machine is in Chapter 4.

Treat both as historical artifacts. They contain ideas the project
rejected; do not mistake their claims for current architecture. When
in doubt, the source of truth is the Solidity in `src/` and the
companion papers in `paper/`.

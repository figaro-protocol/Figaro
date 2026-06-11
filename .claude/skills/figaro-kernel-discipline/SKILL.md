---
name: figaro-kernel-discipline
description: Use when proposing, reviewing, or critiquing any change to FigaroCore.sol, CommitmentTypes.sol, bonding math, kernel storage mappings, or the six protocol invariants (asymmetric bonding, cumulative upstream bonding, buyer dominance, atomic resolution, immutable evidence, no escape hatches). TRIGGER when the user asks to add a feature to the kernel, when review surfaces a potential vulnerability in kernel patterns, when the model is about to propose timeout / admin / recovery / yield / governance / lifecycle-flag additions, or when the conversation mentions 'web2 pattern', 'stuck funds', 'escape hatch', 'MAD equilibrium', or any of the 14 false-positive patterns in DESIGN_DECISIONS.md. Invoke BEFORE proposing, not after.
---

# Figaro Kernel Discipline

## The Core Question for Any Proposed Change

> Does the bilateral EIP-712 signature requirement already enforce this?

If yes, adding on-chain state, role checks, or lifecycle flags is a web2
pattern being imposed on a stateless kernel. Do not propose it.

## What Figaro Is

Figaro is a **coordination protocol** — not DeFi, not TradFi. Closer to TCP/IP
than to a bank or a DEX. No liquidity pools, yield, lending, trading, or
financial instruments. It enforces bilateral agreements between strangers
through asymmetric bonding; cooperation is the dominant strategy in a one-shot
game.

## Kernel Constraints

The kernel has **two external functions** (`commit`, `resolveProcess`), **three
mappings** (`processes`, `orderStatus`, `orderProcessId`), **no owner**, **no
fee**, **no escape hatches**. These are not simplifications. Every feature
*absent* from the kernel is absent because adding it would weaken the Nash
equilibrium.

Authoritative reference: `docs/v5/DESIGN_DECISIONS.md` — 14 patterns that look
like vulnerabilities but are correct by design.

## Anti-Patterns — Reject on Sight

Each of these breaks a specific protocol property:

- **Timeout / recovery path for locked bonds** → breaks buyer dominance (MAD).
  Bonds remaining locked indefinitely *is* the deterrent.
- **Stuck-fund recovery** → stuck funds *are* the mechanism. "Recover stuck
  funds" is the most tempting and most lethal web2 pattern to import.
- **Finalized flag on resolved process** → breaks multi-round composition.
- **Admin / owner / pause function** → breaks the no-escape-hatch invariant.
  See Theorem (Escape-Hatch Weakness) in the paper.
- **Yield on locked bonds / bond-lending pools** → breaks asymmetric bonding.
  Bonds must have zero return to preserve the incentive math.
- **Governance vote / DAO for disputes** → reintroduces discretionary human
  decision, removing self-enforcement.
- **Green-bond fee discounts / conditional rate adjustments** → breaks the
  Nash equilibrium (the 2× ratio is proven minimum sufficient).
- **Soulbound reputation score** → reifies platform credential. Reputation is
  settlement velocity, not a stored score.
- **Partial resolution** → breaks atomic-resolution coordination pressure
  (the weakest-link property among sellers).
- **Role checks that duplicate what the EIP-712 signature already enforces** →
  redundant; adds capture vectors.
- **Internal ledger / withdrawal pattern** → payouts are direct ERC-20
  transfers. Internal balances add reentrancy surface for no gain.

## What Figaro Is Not — Framing Anti-Patterns

- Not "removing the middleman" — it makes middlemen structurally unnecessary.
- Not "Kill Uber" / platform-tax framing — defines Figaro by elimination.
- Not a DAO, not a governance token. FIG is a coordination Schelling point,
  not a governance instrument.
- Not upgradeable. Not pausable. Not owned. Not patched.

Do not reify role labels into entities. "Restaurant", "merchant", "supplier"
are roles within an assembly's process DAG, not firms.

## The Three-Layer Enforcement Architecture

1. **MAD via asymmetric bonding** — economic self-enforcement (>99% of orders).
2. **Buyer dominance → coordination pressure** — multi-party processes self-resolve.
3. **Timestamped on-chain attestations** — tamper-proof evidence for off-chain forums.

The kernel does NOT perform dispute resolution. It provides evidence to
off-chain systems that already exist.

## Three-Tier Naming

- **Kernel** = `FigaroCore`. The irreducible settlement primitive. Frozen.
- **Protocol** = kernel + extension doctrine + public graphs.
- **Runtime** = protocol + semantic layer + builder surfaces + UI.

Match proposals to the correct tier:
- "Add yield to locked bonds" → kernel concern. Reject.
- "Add a new attestation mode" → protocol extension.
- "Change how roles display" → runtime concern.

## Before Proposing Any Kernel Change — Verify 3×

The MAD equilibrium is fragile. Any single escape hatch degrades it. Before
proposing, check the change against:

1. **The six protocol properties** (asymmetric bonding, cumulative
   upstream bonding, buyer dominance, atomic resolution, immutable evidence,
   no escape hatches). Does the change preserve all six?
2. **The game-theoretic theorems** on the `/papers/asymmetric-bonding`
   page (Theorems: Two-Party Nash Equilibrium, Minimal Viable Bond
   Multiplier, Escape-Hatch Weakness, N-Party Nash Equilibrium,
   Cumulative-Value Reporting Honesty).
3. **The TLA⁺ invariants** in `formal/FigaroCore.tla` (TokenConservation,
   ContractSolvency, WalletNonNegative, CumulativeIntegrity,
   ActiveCountCorrect, ResolutionAlwaysPossible, TypeOK).

If any check fails or is unclear, stop and ask the user. Do not propose
"compromise" versions — compromises that preserve the web2 pattern in
softened form still break the equilibrium. The safest kernel is the most
constrained kernel.

## If the Proposed Change Is a Web2 Pattern

State this explicitly. Cite the property it breaks. Do not offer a softened
variant. Suggest moving the concern to the protocol or runtime tier if it
belongs there, or discarding it entirely if it does not.

## Reference Files (Read Before Acting)

- `docs/v5/DESIGN_DECISIONS.md` — 14 false-positive patterns, authoritative
- `/papers/asymmetric-bonding` page — game-theoretic proofs (mechanism paper)
- `docs/v5/VERIFICATION_MAP.md` — invariant → code → test → formal layer
- `docs/v5/THEORY.md` — derivation of the six properties
- `CLAUDE.md` — working inventory and naming conventions

# Figaro Protocol: Pure Coordination Through Economic Pressure

**A game-theoretic approach to multi-party coordination without timeouts, arbitrators, or third-party dispute resolution**

---

## Abstract

Figaro is a coordination protocol that enables sovereign economic coordination
through two composing mechanisms: asymmetric bonding and buyer dominance.
Asymmetric bonding (each party locks 2× their respective stake) produces a
Nash equilibrium where cooperation is strictly dominant for both parties, and
scales the bilateral primitive from 2-party to N-party service chains
(downstream sellers bond against cumulative
upstream value, creating a mesh of independently secured edges). Buyer
dominance — only the buyer can trigger resolution, and resolution is atomic
across all orders in the process — operates on the already-scaled mesh to
enforce inter-seller coordination, cooperation, and communication. Atomic
resolution is the forcing function: it induces a weakest-link subgame among
sellers, reproducing Grameen joint-liability peer enforcement at kernel
granularity without repeated interaction or local information.

The two mechanisms compose; neither substitutes the other. Bonding alone
yields independently bonded edges that can't multi-party coordinate;
buyer-dominance alone is worthless without the bonding equilibrium. Together,
they make the mesh resolvable from a single signature with cooperation
pressure propagating through it. The architecture makes trusted intermediaries
— escrows, arbitrators, platform sellers — structurally unnecessary.

Enforcement operates across three layers: economic self-interest (bonding),
social pressure among co-dependent sellers (atomic resolution as buyer
dominance's forcing function), and legal deterrence backed by immutable
on-chain evidence. This paper presents the game-theoretic foundations, the
N-party scaling model, the enforcement architecture, and a security analysis
of the protocol.

---

## Table of Contents

1. [Core Innovation](#core-innovation)
2. [Mathematical Foundations](#mathematical-foundations)
3. [Architecture Rationale](#architecture-rationale)
4. [Implementation Details](#implementation-details)
5. [N-Party Model](#n-party-model)
6. [Enforcement Model](#enforcement-model)
7. [Security Analysis](#security-analysis)
8. [Comparison with Traditional Approaches](#comparison-with-traditional-approaches)
9. [Advanced Topics](#advanced-topics)
10. [Conclusion](#conclusion)

---

## Core Innovation

### The Coordination Forcing Function

Figaro achieves multi-party coordination through two composing mechanisms:

**Mechanism 1 — Asymmetric bonding (the bilateral equilibrium + scaling):**

1. **Both parties lock collateral on-chain** (buyer 2P, seller 2G)
2. **The 2× ratio creates the Nash equilibrium** — cooperation strictly dominates defection for both, at the minimum viable multiplier
3. **Each seller bonds against cumulative upstream value**, creating a mesh of independently secured edges that scales from 2-party to N-party DAGs

**Mechanism 2 — Buyer dominance (inter-seller coordination on the mesh):**

4. **Only the buyer can unlock funds** by calling `resolveProcess()`
5. **Resolution is atomic** across all orders in the process — all or nothing
6. **Sellers must coordinate among themselves** to satisfy the buyer (weakest-link subgame; endogenous peer pressure of magnitude P_i + 2G_i on every co-seller)
7. **Buyer accountability** through locked capital + self-destructive griefing economics

**Key Insight**: Capital lockup creates the bilateral equilibrium and scales the mesh; buyer dominance enforces coordination across the mesh. Either mechanism alone is insufficient — bonding without buyer dominance gives a mesh that can't multi-party coordinate; buyer dominance without bonding is worthless. Together they replace external enforcement.

### Philosophy: The Post-Firm Economy

Figaro is **NOT DeFi**. It is not a financial protocol for trading, lending, or speculation. It is **Coordination Infrastructure** designed to enable the **Post-Firm Economy**.

#### 1. The Coasean Collapse (Death of the Firm)
Nobel laureate Ronald Coase theorized that firms exist because the transaction costs of vetting, trusting, and contracting external partners are too high.
*   **The Shift**: Figaro prices the cost of trust at $2x$ — the bond each party locks. Trust is not eliminated; it is made unnecessary. A rational actor who prefers $2x$ return over $0x$ will cooperate. The Penalty is pre-paid; the "lawsuit" is resolved before work begins.
*   **The Result**: The standing firm is no longer the compulsory unit of organization. Each process can assemble a transaction-scoped institution of autonomous agents (human or AI) coordinating via economic pheromones (Dutch auctions, RFQs), then dissolve at settlement. The **Bond** acts as the immune system, isolating defectors instantly without management overhead.

#### 2. Universal Rule of Law (Space-Grade Institutions)
In the legacy world, legal enforcement is defined by geography. A contract is only as good as the local court system.
*   **The Inversion**: By moving enforcement from **Ex-Post** (Courts/Police) to **Ex-Ante** (Collateral), Figaro provides a "Rule of Law" accessible to anyone with a wallet.
*   **Legal framing**: Figaro is a **self-executing bilateral performance bond** — a known legal instrument, but without the trust assumptions that normally require a third-party surety. The innovation is that the counterparty *is* the surety. Both parties post collateral simultaneously; neither requires the other to be trustworthy.
*   **Implication**: It functions identically for a human in a high-corruption jurisdiction, an AI Agent in a server rack, or a colony on Mars. It is granting an equal economic footing based purely on solvency, not identity.


### The Singleton Thesis

Why does Figaro use a singleton contract with a shared coordination surface?

Figaro is **Infrastructure**, not an App. Like Ethereum itself, all participants agree to run the same version to maximize network effects and interoperability.
- **Shared Security**: One battle-tested contract is safer than 1,000 forks.
- **Shared Tooling**: Indexers, UIs, and wallets work for everyone.
- **Shared Upgrades**: Non-upgradable core, but shared compositions.

While anyone *can* fork the code, the value is in the shared coordination network.

### The Three Laws (Communication Layer)

The six properties above are precise but dense. For audiences who will never
read a payoff matrix, the mechanism reduces to three communicable laws. These
are not marketing inventions — they are projections of enforced on-chain
invariants.

| Law | Properties it projects | One-sentence statement |
|---|---|---|
| **Skin in the Game** | Asymmetric bonding (bilateral 2× + cumulative upstream bonding) | Both parties prove they have more to lose than to gain by defecting. The bond is the proof. |
| **One-Way Progress** | Monotonic cumulative-value accumulator + Atomic resolution | The deal only moves forward. Value accumulates; it never reverses. Settlement is all-or-nothing. |
| **Sovereign Settlement** | Buyer dominance + No escape hatches | No boss, no bank, no platform sits in the middle. Resolution is between the parties, enforced by code. |

Each law maps to a contract invariant:

- **Skin in the Game** → `sellerBond = 2 × cumulativeValue`, `buyerBond = 2 × payment` (enforced in `commit`)
- **One-Way Progress** → `cumulativeValue` is a monotonic accumulator per process; `orderStatus` advances `0 → 1 → 2` (unknown → committed → resolved) with no backward transitions
- **Sovereign Settlement** → `resolveProcess` requires `msg.sender == rootBuyer`; no owner, no fee, no admin function, no timeout

The emotional experience these laws produce: **the end of anxiety.** The
mathematical certainty that cooperation is dominant eliminates the "leap of
faith" that characterizes every traditional exchange between strangers. The
mechanism produces the certainty; the certainty produces the calm.


---

## Mathematical Foundations

### Asymmetric Bonding Formula

For a transaction at position `i` in a value chain:

```
Seller Bond: Cs(i) = 2 × G(i)
Buyer Bond:  Cb(i) = 2 × P(i)

Where:
  G(i) = Cumulative value through position i (all prior work + current)
  P(i) = Payment for work at position i (local value added)
```

**Example**: Alice orders $10 goods from Bob, Charlie delivers for $2

| Step | Party | Role | G(i) | P(i) | Seller Bond | Buyer Bond |
|------|-------|------|------|------|-------------|------------|
| 1 | Bob | Baker | $10 | $10 | $20 | $20 |
| 1 | Alice | Buyer | - | $10 | - | $20 |
| 2 | Charlie | Courier | $12 | $2 | $24 | - |
| 2 | Alice | Buyer | - | $2 | - | $4 |

**Total locked**: $68 ($20 + $20 + $24 + $4)

### Nash Equilibrium Analysis

**Game Setup**:
- Players: Buyer (B), Seller (S)
- Strategies: {Cooperate, Defect}
- Payoffs defined by bond distribution

**Payoff Matrix** (Buyer perspective, Seller perspective):

|              | Buyer Cooperates | Buyer Defects |
|--------------|------------------|---------------|
| **Seller Cooperates** | (-P, +P) ✓ | (-2P, -2G) |
| **Seller Defects** | (-2P, -2G) | (-2P, -2G) |

**Analysis**:
- **Mutual Cooperation**: Buyer pays P, Seller earns P → **Pareto optimal**
- **Seller Defects**: Both lose bonds → (-2P, -2G) → **Worse for both**
- **Buyer Defects**: Same outcome → **Buyer hurts self**

**Dominant Strategy**: Cooperation is strictly dominant for both parties.

### Cumulative Upstream Bonding

In multi-party chains, seller bonds grow geometrically:

```
Position 1: Seller bonds 2×P₁
Position 2: Seller bonds 2×(P₁ + P₂)
Position 3: Seller bonds 2×(P₁ + P₂ + P₃)
...
Position n: Seller bonds 2×∑Pᵢ
```

**Coordination Pressure**: Later-stage sellers have MORE at stake, because they are responsible for more cumulative value (P₁ + P₂ + P₃). This creates automatic accountability up and down the chain.

**Example**: If Charlie (delivery) fails:
- Charlie loses $24 bond
- Bob loses $20 bond (his delivery was good, but Alice can't approve)
- **Bob will pressure Charlie** to fix the problem → Self-organizing coordination

### Capital Efficiency

**Theorem**: Minimum viable bond is `2×` the transaction value.

**Proof**:
```
Let defection profit = D
Let cooperation profit = C
Let bond = B

For cooperation to be Nash equilibrium:
  C > D - B   (cooperation must be more profitable)
  
When C = P and D = 0 (no delivery):
  P > 0 - B
  B > -P
  
But we need strict dominance:
  B ≥ 2P (sufficient condition)
```

**Why 2× specifically?**
- 1× insufficient: Seller breaks even by defecting (gets bond back)
- 2× sufficient: Seller loses entire payment value if buyer rejects
- 3×+ unnecessary: Increases capital requirements without improving incentives

---


## Implementation Details

### Order Status

The kernel does not run a lifecycle state machine. Each order is a single
`uint8` nullifier — `orderStatus` — that advances in one direction only:

```
       commit()                      resolveProcess()
  0 (unknown) ───────→ 1 (committed) ───────→ 2 (resolved)
```

**Key Transitions**:
- **0 → 1**: `commit()` bonds the order. Both parties' EIP-712 signatures are supplied in the same call — there is no separate "offer" then "accept" step. A commitment is bonded atomically, or not at all.
- **1 → 2**: `resolveProcess()` settles every order in the process at once.

**No escape hatches**: there is no `Pending` state, no `Cancelled` state, and no cancellation path. Once an order is committed (`orderStatus == 1`) the only way out is resolution — a committed order cannot be unwound unilaterally; only the buyer can resolve it.

### Core Functions

The kernel exposes exactly two external functions:

- **`commit(Commitment c, bytes buyerSig, bytes sellerSig)`** — Bonds one order. A root order (`c.processId == 0`) creates a new process; a sub-order (`c.processId` set) extends an existing one. Both signatures are verified against the EIP-712 digest of `c`, then the buyer is charged `2 × payment` and the seller `2 × expectedCumulativeValue`. A sub-order additionally requires `c.buyer == process.rootBuyer` and that `expectedCumulativeValue` equals the live accumulator plus `payment` — so it cannot be added without the root buyer's signature, and cannot misreport cumulative value.
- **`resolveProcess(bytes32 processId, Commitment[] commitments)`** — Buyer atomically resolves ALL active orders in the process. The caller must be the process's `rootBuyer`, and the commitment array must list every active order or the call reverts (`IncompleteOrderList`). This all-or-nothing semantics is what creates the seller coordination pressure described in Layer 2: sellers cannot be paid individually, so they must collectively satisfy the buyer.

There is no `firstOrder`, `subOrder`, `acceptOffer`, or `cancelOffer` — those belonged to an earlier two-step offer/accept design. The unified `commit` replaced them: the agreement is negotiated and dual-signed off-chain, then one transaction bonds it. Full function signatures and access control are in the contract source (`src/FigaroCore.sol`).

### Bonding

The kernel computes bonds inline in `commit` — there is no separate helper
function:

```solidity
buyerBond  = c.payment * 2;                 // local value P, doubled
sellerBond = c.expectedCumulativeValue * 2; // cumulative value G, doubled
```

**Properties**:
- `sellerBond` grows with chain position (it tracks cumulative value G)
- `buyerBond` stays local (it tracks only this step's payment P)
- the ratio `sellerBond / buyerBond` increases downstream → deeper coordination pressure

### Settlement on Resolution

The kernel takes no fee. There is no `feeRate`, no `feeSnapshot`, no treasury,
and no cancellation path. At resolution every order pays out directly:

```solidity
sellerPayout = c.expectedCumulativeValue * 2 + c.payment;  // bond back + payment earned
buyerPayout  = c.payment;                                  // bond back, minus the payment
```

**Net Effects** (per order, G = cumulative value, P = payment):
- Seller: `−2G + (2G + P) = +P` — earns the payment, recovers the bond ✓
- Buyer: `−2P + P = −P` — pays the payment, recovers the rest of the bond ✓
- Contract: every bonded token is transferred straight back out; balance = 0 ✓

**Conservation invariant**:

```
sellerPayout + buyerPayout = (2G + P) + P = 2G + 2P = sellerBond + buyerBond
```

Every token that entered as a bond leaves to one of the two parties — nothing
is retained, and there is no third recipient. This is the "direct transfer
settlement, no internal ledger" property: the kernel never holds a
withdrawable balance.

---

## N-Party Model

### Constant Buyer Pattern

**Key Insight**: In value chains, the **buyer remains constant** (end consumer), while sellers form a chain.

**Example**: Food delivery
```
Alice (Customer) ← Bob (Restaurant) ← Charlie (Courier)
      BUYER            SELLER 1          SELLER 2
```

**Order Structure**:
```
Order #1: Alice ← Bob
  - Alice bonds $20 (buyer)
  - Bob bonds $20 (seller)
  
Order #2: Alice ← Charlie
  - Alice bonds $4 (buyer, only for delivery)
  - Charlie bonds $24 (seller, includes food + delivery)
```

### Coordination Cascade

**Critical property**: If downstream seller fails, ALL upstream sellers lose bonds.

**Mechanism**:
```
Charlie fails delivery
  ↓
Alice cannot approve Order #2
  ↓
Charlie's $24 bond locked
  ↓
BUT: Bob delivered good food!
  ↓
Bob's $20 bond ALSO locked (Alice can't approve Order #1 without full delivery)
  ↓
Bob pressures Charlie: "Fix this or we BOTH lose money!"
  ↓
Self-organizing coordination
```

**Design Principle**: Make it cheaper to coordinate than to defect.

### Asymmetric Ratios

Position in chain determines bond asymmetry:

| Position | Seller Bond | Buyer Bond | Ratio |
|----------|-------------|------------|-------|
| 1 | $20 | $20 | 1:1 |
| 2 | $24 | $4 | 6:1 |
| 3 | $30 | $6 | 5:1 |
| n | 2×∑Pᵢ | 2×Pₙ | ∑Pᵢ/Pₙ |

**Interpretation**: Downstream sellers have exponentially more to lose → Must coordinate with upstream.

---

## Enforcement Model

Figaro's coordination mechanism operates across three primary game-theoretic layers (plus a critical scaling bridge between 2-party and N-party). Understanding each layer explains why the protocol works without timeouts, arbitrators, or governance backstops — not as a temporary simplification, but as a permanent design property.

### Layer 1: Primary Nash Equilibrium (2-Party Game)

**Players**: Single buyer, single seller  
**Mechanism**: Symmetric bonding (2× payment from each party)  
**Outcome**: Cooperation is the dominant strategy

**Payoff Matrix** (revisited for clarity):

|              | Buyer Cooperates | Buyer Defects |
|--------------|------------------|---------------|
| **Seller Cooperates** | B: -P, S: +P ✓ | B: -2P, S: -2P |
| **Seller Defects** | B: -2P, S: -2P | B: -2P, S: -2P |

**Key Properties**:
- **Single transaction**: Isolated 2-party exchange
- **Symmetric stakes**: Both parties bond 2×payment
- **Clear outcome**: Mutual cooperation yields (-P, +P), all defection paths yield (-2P, -2P)
- **Nash equilibrium**: (Cooperate, Cooperate) is strictly dominant

**Example**: Alice orders $10 bread from Bob
- Alice bonds $20, Bob bonds $20
- If Bob delivers good bread → Alice approves → Bob earns $10 profit
- If Bob delivers nothing → Alice rejects → Both lose $20
- **Result**: Bob delivers, Alice approves (rational outcome)

This layer is well-understood and thoroughly documented in existing game theory literature.

---

### Layer 1.5: Scaling via Asymmetric Bonding (The Critical Bridge)

**This is the most often overlooked layer, yet it's the key innovation that enables scaling from 2 to N parties while maintaining the Nash equilibrium.**

**Problem Statement**: How do we extend the 2-party Nash equilibrium to multi-party service chains without breaking the incentive structure?

**Naive Approach (Fails)**:
```
Chain: Alice ← Bob ← Charlie
Bonds: Bob: $20, Charlie: $20

Problem:
- Charlie delivers bad work → Alice rejects
- Charlie loses $20, Bob loses $20
- BUT: Charlie only added $2 value, Bob added $10 value
- Charlie's downside ($20) same as Bob's → Insufficient pressure
- Charlie may defect (low value-add, equal penalty)
```

**Figaro Solution: Cumulative Upstream Bonding**

```
Chain: Alice ← Bob (food: $10) ← Charlie (delivery: $2)

Bonds:
- Bob: 2×$10 = $20 (symmetric with Alice)
- Charlie: 2×($10+$2) = $24 (asymmetric - scales with cumulative value)
- Alice: $20 + $4 = $24 total

Stakes:
- Charlie risks $24 to earn $2 → 12:1 risk/reward ratio
- Bob risks $20 to earn $10 → 2:1 risk/reward ratio
```

**Why This Works**:

1. **Each seller has MORE to lose than earn**: Charlie risks $24 to earn $2
2. **Later sellers have EXPONENTIALLY more at stake**: Cumulative bonding creates geometric growth
3. **Nash equilibrium preserved at EVERY position**: No seller at any position benefits from defecting
4. **Self-enforcing coordination**: Downstream sellers MUST satisfy upstream requirements

**Mathematical Proof**:

For seller at position `i` with cumulative value `G(i)` and local payment `P(i)`:

```
Seller bonds: B(i) = 2×G(i)
Seller earns: E(i) = P(i)

Cooperation payoff:  +P(i)            (earns payment, recovers bond)
Defection payoff:    -B(i) = -2×G(i)   (loses entire bond)

Nash condition (cooperation strictly dominates):
  P(i) > -2×G(i)

Since P(i) > 0 and G(i) > 0, this inequality always holds.
Therefore: Cooperation is the dominant strategy at ALL chain positions.
```

**Critical Insight**: Asymmetric bonding ensures that:
- **Early sellers** (high P, low G): Standard 2× punishment
- **Late sellers** (low P, high G): AMPLIFIED punishment (risk 2×cumulative to earn small payment)

**Result**: The deeper you are in the chain, the MORE careful you must be. This creates automatic quality control pressure up the value chain.

**Why This Is "Layer 1.5"**:
- It's not a separate game, but an **extension** of the primary Nash equilibrium
- It **bridges** 2-party game theory to N-party coordination
- Without it, multi-party chains would collapse (incentives break down)

**Common Mistake**: Treating multi-party coordination as just "multiple 2-party games." Wrong! Each position has DIFFERENT stake sizes, creating ASYMMETRIC pressure that maintains Nash equilibrium across the entire chain.

---

### Layer 2: Seller Coordination Game (The Micro-Lending Circle Effect)

**Players**: Multiple sellers in the same service chain  
**Mechanism**: Atomic resolution (all-or-nothing payment)  
**Outcome**: Sellers pressure each other to perform

**The Micro-Lending Analogy**:

In Grameen Bank-style micro-lending:
- Lend to groups of 5-10 people
- If ONE defaults → ENTIRE group loses future lending access
- Result: **Group members police each other** → Higher repayment rates than individual loans

**Figaro mirrors this structure**:

```
Chain: Alice ← Bob (restaurant) ← Charlie (courier) ← Dave (packaging)

Atomic resolution:
- Alice calls resolveProcess(processId, [order1, order2, order3])
- ALL orders resolved together, or NONE
- If Dave fails → Charlie doesn't get paid
- If Charlie fails → Bob doesn't get paid
- Everyone sinks or swims together
```

**Coordination Pressure Mechanism**:

```
Scenario: Dave (packaging) does sloppy work

Direct effect:
  - Alice rejects → Dave loses $30 bond

Cascade effect:
  - Charlie delivered perfectly, but Alice rejected → Charlie loses $24 bond
  - Bob cooked perfectly, but Alice rejected → Bob loses $20 bond
  - Total locked: $74 across all parties

Social pressure:
  - Charlie to Dave: "Fix this or I lose $24!"
  - Bob to Charlie: "Make sure Dave fixes it or I lose $20!"
  - Dave faces pressure from BOTH upstream sellers
  
Result: Dave fixes the packaging (cheapest option for everyone)
```

**Game Theory**:

This is a **repeated game with reputation**:

```
Single transaction: Dave might defect (lose $30 once)

But with reputation:
  - Bob blacklists Dave (won't work with him again)
  - Charlie blacklists Dave
  - Alice flags Dave in reviews
  - Other sellers see Dave's failure rate → avoid him
  - Dave's future income stream: $0

Rational Dave: Fix the issue (cost: $5) vs. Get blacklisted (cost: $5,000+ future earnings)
```

**Why Atomic Resolution Is Critical**:

Traditional approach (individual payments):
```
Alice pays Bob → Bob satisfied → No pressure on Charlie/Dave
Alice pays Charlie → Charlie satisfied → No pressure on Dave
Alice pays Dave → Dave gets paid even with bad work

Result: No coordination pressure, sellers independent
```

Figaro approach (atomic resolution):
```
Alice resolves ALL at once:
  - If ANY seller fails → NONE get paid
  - Sellers cannot free-ride on others' work
  - Group accountability emerges naturally

Result: Sellers self-organize into quality control networks
```

**Empirical Parallel**: This is exactly how micro-lending works at Grameen Bank, Kiva, etc. Default rates drop from ~20% (individual) to ~2% (group) due to peer pressure.

**Design Implication**: Features that break atomic resolution (e.g., partial payments, pay-one-at-a-time) would DESTROY this coordination layer. This is why we reject such features.

---

### Layer 3: Legal System + Blockchain Transparency (Edge Case Deterrence)

**Players**: Parties + legal system + public observers  
**Mechanism**: Court enforcement backed by immutable on-chain evidence  
**Outcome**: Frivolous abuse deterred by legal precedent + reputation damage

**The SSoT (Single Source of Truth) Argument**:

Blockchain provides **tamper-proof evidence** for legal proceedings:

```
Scenario: Buyer refuses to resolve despite good delivery

Traditional system:
  - He-said-she-said dispute
  - Expensive discovery process
  - Uncertain outcome

With Figaro:
  - Blockchain shows: Buyer bonded $20
  - Blockchain shows: All sellers bonded correctly
  - Blockchain shows: Order committed at time T (the `OrderCommitted` event, block timestamp)
  - Blockchain shows: Order is still unresolved (no `OrderResolved` event for it)
  - Therefore: Buyer has not resolved for 90 days (computed from event timestamps)
  - Evidence is IMMUTABLE (can't be altered)
  
Court decision: Clear abuse, order buyer to resolve or forfeit bond
```

**Legal Precedent Creation**:

First few cases establish patterns:

```
Case 1: Buyer blocks payment frivolously
  - Court reviews on-chain evidence
  - Orders buyer to resolve
  - Buyer refuses → Held in contempt, fined
  - Public court record established

Case 2: Another buyer tries same tactic
  - Lawyer cites Case 1 as precedent
  - Judge: "This has been settled, rule for sellers"
  - Buyer pays legal fees + damages

Result: After 3-5 cases, buyers stop trying (known losing strategy)
```

**Economic Deterrence**:

```
Buyer considering frivolous block:

Costs:
  - Own bond locked: $20 (opportunity cost)
  - Legal fees: $5,000-$50,000
  - Court-ordered damages: Variable
  - Reputation damage: Permanent on-chain record
  - Future business loss: No seller will work with known abuser

Benefits:
  - Annoy sellers: $0 economic value
  - Avoid payment: Not possible (court orders resolution)

Rational decision: Don't abuse the system
```

**Why This Works**:

1. **Immutable evidence**: Blockchain creates perfect audit trail
2. **Public record**: All transactions visible, reputation is permanent
3. **Precedent cascade**: Early cases deter future abuse
4. **Economic irrationality**: Abuse costs more than cooperation

**Real-World Parallel**: Similar to credit card chargebacks. Early in credit card history, some buyers abused chargebacks. After legal precedents established fraudulent chargebacks as illegal, abuse dropped to <0.1%.

**Layer 3 Handles Edge Cases Layers 1-2 Don't**:

- Truly irrational actors (rare but possible)
- Buyers who value spite > money (psychologically abnormal)
- Systemic attacks by bad-faith actors

For these cases, the legal system provides **deterrent enforcement**. The kernel's event log — `OrderCommitted`, `OrderResolved`, `ProcessResolved`, each carrying its block timestamp — supplies the irrefutable audit trail courts need. No on-chain governance assists them — the protocol is inert and immutable; the off-chain legal system does the rest.

---

### Summary: Defense-in-Depth

The three enforcement layers work together. The goal is not redundancy for its own sake — it is overlap: each layer catches what the previous one cannot.

| Layer | Mechanism | Primary Cases |
|-------|-----------|---------------|
| **1 + 1.5** | Asymmetric bonding — cooperation is Nash dominant at every chain position | 99%+ of all orders |
| **2. Seller Coordination** | Atomic resolution — sellers police each other (micro-lending circle effect) | Multi-seller failures |
| **3. Legal + Transparency** | Immutable on-chain evidence — courts handle the 0.x% that economics cannot | Irrational or adversarial actors |

**Note on what Figaro does NOT include**: No governance layer. No timeout. No dispute arbitration. No insurance tranche. No oracle. The locked capital is the enforcement mechanism; the immutable record is the evidence trail. Any feature that introduces a unilateral escape hatch from a committed order destroys Layer 1. Any feature that introduces partial resolution destroys Layer 2. These are hard constraints.

**Why This Is Superior to Traditional Approaches**:

Traditional protocols pick one enforcement mechanism — an arbitrator, a timeout, a validator. Each creates a single point of failure. Figaro layers three orthogonal mechanisms:

```
Problem: Buyer tries to abuse system

Layer 1: Loses capital (economic deterrence) — irrational unless spite > money
Layer 2: Loses seller relationships (social deterrence) — on-chain history is permanent
Layer 3: Loses in court (legal deterrence) — immutable evidence, unforgeable timeline

Must beat ALL THREE mechanisms simultaneously → Economically and legally irrational
```


---

## Security Analysis

### Attack Vectors (and Defenses)

#### 1. Griefing Attack

**Attack**: Buyer refuses to approve to lock seller funds.

**Defense**:
- Buyer's capital also locked (opportunity cost)
- Buyer's reputation damaged (on-chain history)
- Buyer loses future business access (no seller works with known griefer)

**Economic Analysis**:
```
Attacker cost: 2×P (bond) + R (reputation) + F (future business)
Attacker gain: 0 (just griefs, no financial benefit)

Result: Irrational attack → Extremely rare
```

#### 2. Sybil Attack

**Attack**: Create fake orders to manipulate state.

**Defense**: Each order requires real bonds → Sybil is capital-intensive.

**Cost**: `2×(cumulativeValue + payment)` per fake order → Prohibitive at scale.

#### 3. Front-Running

**Attack**: Observe pending transaction, create conflicting order.

**Defense**: Orders are self-contained and content-addressed. A root order's `processId` is the EIP-712 digest of its own dual-signed commitment, and every `orderHash` is `keccak256(processId, structHash)`. An attacker cannot forge a commitment without both parties' signatures, and a duplicate commitment is rejected outright (`DuplicateCommitment`).

**Note**: The `salt` field in the `Commitment` struct is the bilateral nonce — replay protection and collision resistance. `block.prevrandao` is deliberately NOT used: under proof-of-stake the block proposer knows `prevrandao` up to an epoch ahead, which would make it a weaker source than a party-chosen salt bound into the signed struct.

#### 4. Capital Efficiency Attack

**Attack**: Lock minimal bonds by creating many small orders.

**Defense**: Bond formula ensures minimum `2×` coverage → Cannot reduce below threshold.

### Liveness Properties

**Theorem**: Protocol cannot deadlock if buyers are rational.

**Proof**:
```
Assume: Buyer refuses to resolve indefinitely
Result: Buyer's capital locked forever
Cost to buyer: Opportunity cost compounds continuously
Rational strategy: Resolve (recover capital)

Contradiction: Indefinite refusal is irrational
Therefore: Rational buyers always resolve eventually
```

**Caveat**: Assumes buyers value capital > grudge. True for economic actors, may fail for irrational agents.

---

## Comparison with Traditional Approaches

### Escrow Services

| Aspect | Traditional Escrow | Figaro |
|--------|-------------------|--------|
| Arbitrator | Required (trusted third party) | None (buyer is judge) |
| Timeouts | Yes (complex calibration) | No (indefinite pressure) |
| Edge Cases | Manual intervention | Economic resolution |
| Complexity | High (dispute system) | Low (pure game theory) |
| Capital Efficiency | ~1× transaction value | 2× transaction value |
| Trust Model | Trust arbitrator | Trust code + incentives |

### Payment Channels

| Aspect | Lightning/Raiden | Figaro |
|--------|------------------|--------|
| Use Case | High-frequency payments | Coordinated fulfillment |
| Dispute | Timeout-based challenge | No disputes (coordination forcing) |
| Multi-Party | Limited (hubs) | Native (N-party chains) |
| Capital | 1× per channel | 2× per order |
| Liveness | Requires online parties | Asynchronous |

### Smart Contract Platforms

| Aspect | Ethereum L1 | Figaro |
|--------|-------------|--------|
| Validation | Miners/validators | Economic incentives only |
| Security | Consensus layer | Game theory layer |
| Dispute | Code is law | Capital is law |
| Upgrade | Forks/governance | No upgrades needed |
| Gas Costs | Per computation | Per state change |

---

## Advanced Topics

### DAG Support

**Question**: The kernel only ever sees a linear process — a single monotonic
`cumulativeValue` accumulator. Does that limit Figaro to linear chains?

**Answer**: No. DAG topology — fan-out, fan-in, diamond dependencies — is
fully expressible. It simply does not live in the kernel.

**Two layers**:

1. **The kernel** sees a flat process: a `processId`, a monotonic
   `cumulativeValue`, and an `activeOrderCount`. Every sub-order's
   `expectedCumulativeValue` is checked for exact equality against the live
   accumulator plus its own `payment`; a mismatched commitment reverts
   (`CumulativeValueMismatch`). The kernel stores no parent-child links —
   there is no on-chain order DAG.

2. **The topology layer** carries the DAG. It lives off-chain in the signed
   agreement (the `figaro-topology` clause) and is reconstructed
   by indexers and UI. Parents, children, and merges are expressed there, not
   in kernel state.

**Structures larger than one linear process** — wider DAGs, or DAGs beyond
the ~1,240-order gas ceiling — compose by nesting: a sub-order in process A is
also the root commitment of a child process B. The overall DAG then spans
multiple processes and multiple settlements, while each individual process
stays linear and within the ceiling.

**Why this is safe**: honesty is enforced *before* the fact. Because the
kernel pins each sub-order's `expectedCumulativeValue` to the accumulator, a
wrong value never commits in the first place — there is no "claim a false
value, lose your bond later" path. The off-chain topology is advisory
metadata; the economic enforcement rides entirely on the on-chain linear
accumulator and the bonds it sizes.

### Multi-Step Chains

**Generalization**: Figaro supports arbitrary-length service chains.

**Invariant**: The buyer remains constant (the `rootBuyer`); sellers extend the process one sub-order at a time.

**Bond Formula**:
```
For the seller of the order at position i in a process:
  G(i) = ∑ payment of every order committed so far (the live accumulator)
  Bond(i) = 2 × G(i)
```

**Example**: 3-step chain
```
Alice ← Bob ← Charlie ← Dave
  $10    +$2     +$3

Bonds:
  Bob:     2×$10 = $20
  Charlie: 2×$12 = $24
  Dave:    2×$15 = $30
  Alice:   2×($10+$2+$3) = $30 total across all orders
```

### Capital Recycling

**Pattern**: Buyer capital can be reused across chain.

**Mechanism**:
```
Alice creates Order #1 with Bob: Locks $20
Order #1 resolved: Alice gets $10 back
Alice creates Order #2 with Charlie: Locks $4 (uses returned $10)
```

**Net Capital**: Alice only needs `2×(final total)` not `2×(sum of all steps)`.

### Mutual-Consent Exit (Permanently Excluded)

**Question**: What happens when neither party is at fault but the deal cannot
complete? A delivery truck is in an accident. A natural disaster destroys
inventory. Can both parties agree to unwind with a refund split?

**Answer**: The kernel carries no exit path, and never will. It has exactly
two external functions — `commit()` and `resolveProcess()` — and resolution
pays one fixed settlement per order (seller: full bond back plus payment;
buyer: payment recovered). A `mutualExit(processId, splitRatio, …)` entry
point is permanently excluded (ruled 2026-07-14).

Nothing is lost, because a mutual exit is already fully expressible with the
existing primitives:

1. **The buyer can always resolve.** `resolveProcess` has no precondition
   beyond buyer identity and the full active-order list. Bonds are locked only
   while the buyer chooses not to resolve — the indefinite lock is the
   deterrent working as designed (refusal is a war of attrition the seller
   loses), not a missing feature.
2. **The refund split is a compensating reverse commitment.** The original
   seller, acting as buyer of a new process, commits the agreed refund to the
   original buyer — bonded like any other order. Both processes resolve; the
   net effect is exactly the agreed split. The "mutual consent" is enforced by
   the same bilateral EIP-712 dual signature as the original commitment: the
   exit is the primitive itself, not a hatch.
3. **External legal forums** adjudicating frustration or impossibility operate
   on the timestamped on-chain evidence as input; they are constrained by
   their own institutional bond structures, never by kernel discretion.

A kernel-level exit with a split ratio would be a third entry point on a
frozen kernel and a soft edge on the no-escape-hatches constraint. The
composed path preserves the equilibrium: knowing the exit exists changes
nothing, because the exit carries the same bond structure as the deal it
unwinds.

---

## Conclusion

Figaro represents a paradigm shift in multi-party coordination:

**Traditional Approach**: Build complex systems (timeouts, arbitrators, validators, governance) to handle edge cases.

**Figaro Approach**: Design incentives so edge cases never occur. When they do occur, the immutable on-chain record provides the evidence trail that existing legal systems need.

**Core Thesis**: Locked capital creates sufficient economic pressure to force cooperation without external enforcement.

**Defense-in-Depth**:
1. **Layer 1 - Primary Nash Equilibrium**: 2-party game theory with symmetric bonding ensures cooperation
2. **Layer 1.5 - Asymmetric Bonding**: cumulative upstream bonding maintains Nash equilibrium at scale (2→N parties)
3. **Layer 2 - Seller Coordination**: Atomic resolution creates micro-lending circle effect (social pressure)
4. **Layer 3 - Legal + Transparency**: Blockchain SSoT + court precedents deter edge case abuse

**Key Innovations**:
1. **Asymmetric bonding**: cumulative upstream bonding ensures deep-chain coordination while preserving Nash equilibrium at every position
2. **No escape hatches**: Capital lockup is the enforcement mechanism (no timeouts, no partial payments)
3. **Buyer as sole resolver**: Accountability through reputation + locked capital
4. **Atomic resolution**: All-or-nothing payment creates seller coordination pressure (like micro-lending groups)
5. **Pure game theory**: Security from incentives, not validators

**Result**: Simpler, more secure, more capital-efficient coordination protocol with redundant enforcement layers.

---

## Appendix: Implementation Checklist

### Core Contract (`FigaroCore.sol`)

- [x] `Commitment` struct (`CommitmentTypes.sol`): 9 fields — `{processId, buyer, seller, currency, payment, expectedCumulativeValue, agreementHash, salt, deadline}`, dual-signed via EIP-712. No on-chain `Order` struct.
- [x] Process state: `ProcessState{rootBuyer, currency, cumulativeValue, activeOrderCount}`; order status is a `uint8` nullifier `0 → 1 → 2` (unknown → committed → resolved) — no lifecycle enum
- [x] Asymmetric collateral, charged in `commit`: buyer `2×payment`, seller `2×expectedCumulativeValue`
- [x] No fee: no `feeRate`, no `feeSnapshot`, no treasury — resolution pays `sellerPayout = 2×expectedCumulativeValue + payment`, `buyerPayout = payment`
- [x] No cancellation path: a committed order can only be resolved
- [x] Entry points: `commit()` and `resolveProcess()` — the only two external functions
- [x] Buyer-only resolution: `require(msg.sender == process.rootBuyer)` in `resolveProcess()`
- [x] No timeouts: no escape from a committed order
- [x] No validators: economic incentives replace validation
- [x] Perfect accounting: every bonded token transferred back to the two parties; contract balance returns to 0

### Test Coverage

- [x] Nash equilibrium: Mutual cooperation payoffs correct
- [x] Collateral sufficiency: Bonds = 2× values
- [x] Multi-party chain: cumulative upstream bonding verified
- [x] Token accounting: Zero contract balance after resolution
- [x] Access control: Only buyer can resolve
- [x] No escape hatches: No reclaim, no timeout, no challenges

### Security Properties

- [x] No reentrancy: ReentrancyGuard on all state changes
- [x] No overflow: Solidity 0.8.26 checked arithmetic
- [x] Token-agnostic: Any non-rebasing, non-fee-on-transfer ERC-20 per process
- [x] No admin backdoor: No pause, no upgrade, no owner escape hatch

---

**Version**: 1.3  
**Last Updated**: May 2026

# Figaro Protocol: Pure Coordination Through Economic Pressure

**A game-theoretic approach to multi-party coordination without timeouts, arbitrators, or third-party dispute resolution**

---

## Abstract

Figaro is a coordination protocol that enables sovereign economic coordination
through a single mechanism: asymmetric bonding. Both parties in a transaction
lock collateral on-chain; only the buyer can release it. This creates a Nash
equilibrium where cooperation is strictly dominant for all participants, without
timeouts, governance, or third-party dispute resolution. The architecture makes
trusted intermediaries — escrows, arbitrators, platform operators — structurally
unnecessary.

The mechanism scales from 2-party exchanges to N-party service chains through
progressive collateralization, where downstream sellers bond against cumulative
upstream value — producing geometric coordination pressure that maintains the
Nash equilibrium at every chain position.

Enforcement operates across three layers: economic self-interest (bonding),
social pressure among co-dependent sellers (atomic resolution), and legal
deterrence backed by immutable on-chain evidence. This paper presents the
game-theoretic foundations, the N-party scaling model, the enforcement
architecture, and a security analysis of the protocol.

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

Figaro achieves multi-party coordination through a deceptively simple mechanism:

1. **All parties lock collateral on-chain**
2. **Only the buyer can unlock funds** by calling `resolveProcess()`
3. **If buyer unhappy → ALL funds locked forever**
4. **Sellers must coordinate among themselves** to satisfy the buyer
5. **Buyer accountability** through locked capital + self-destructive griefing economics

**Key Insight**: Capital lockup creates sufficient economic pressure to force cooperation without any external enforcement mechanisms.

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
- **Shared Upgrades**: Non-upgradable core, but shared extensions.

While anyone *can* fork the code, the value is in the shared coordination network.

### The Three Laws (Communication Layer)

The six properties above are precise but dense. For audiences who will never
read a payoff matrix, the mechanism reduces to three communicable laws. These
are not marketing inventions — they are projections of enforced on-chain
invariants.

| Law | Properties it projects | One-sentence statement |
|---|---|---|
| **Skin in the Game** | Asymmetric bonding + Progressive collateralization | Both parties prove they have more to lose than to gain by defecting. The bond is the proof. |
| **One-Way Progress** | Monotonic cumulative-value accumulator + Atomic resolution | The deal only moves forward. Value accumulates; it never reverses. Settlement is all-or-nothing. |
| **Sovereign Settlement** | Buyer dominance + No escape hatches | No boss, no bank, no platform sits in the middle. Resolution is between the parties, enforced by code. |

Each law maps to a contract invariant:

- **Skin in the Game** → `sellerBond = 2 × cumulativeValue`, `buyerBond = 2 × payment` (enforced in `commit`)
- **One-Way Progress** → `cumulativeValue` is a monotonic accumulator per process; lifecycle state is `Pending → Active → Resolved` with no backward transitions
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

### Progressive Collateralization

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

### State Machine

```
         firstOrder() / subOrder()
                ↓
            Pending ──────────────────→ Cancelled
                │         cancelOffer()   (bond - fee refunded)
                │
                │ acceptOffer()
                │ (counterparty locks bond)
                ↓
            Active
                │
                │ resolveProcess()
                │ (only by buyer)
                ↓
            Resolved
```

**Key Transitions**:
- **Pending → Active**: Counterparty accepts and locks bond via `acceptOffer()`
- **Pending → Cancelled**: Maker cancels before acceptance via `cancelOffer()` (pays protocol fee on the refunded bond outflow)
- **Active → Resolved**: Buyer resolves all orders atomically via `resolveProcess()`

**No escape hatches**: No timeouts from Active state, no refunds after acceptance.

### Core Functions

The protocol exposes six public functions:

- **firstOrder()** — Creates root order. Either buyer or seller may propose; proposer locks bond first, counterparty accepts via `acceptOffer()`.
- **subOrder()** — Chains additional sellers to an existing process. Buyer-only (enforced on-chain), preventing seller harassment and third-party expansion attacks.
- **acceptOffer()** — Counterparty locks bond, transitions Pending → Active.
- **cancelOffer()** — Proposer cancels before acceptance. Refund = bond minus cancellation penalty (2× fee snapshot).
- **resolveProcess()** — Buyer atomically resolves ALL active orders in the process. This all-or-nothing semantics is what creates the seller coordination pressure described in Layer 2: sellers cannot be paid individually, so they must collectively satisfy the buyer.

Full function signatures and access control details are in the contract source (`FigaroCore.sol`).

### Collateral Calculation

```solidity
function calculateCollateral(
    uint256 cumulativeValue,  // Total value through chain
    uint256 payment           // Value added this step
) public pure returns (uint256 sellerBond_, uint256 buyerBond_) {
    sellerBond_ = cumulativeValue * 2;
    buyerBond_ = payment * 2;
}
```

**Properties**:
- `sellerBond` grows with chain position (progressive)
- `buyerBond` stays local (only pays for this step)
- Ratio `sellerBond/buyerBond` increases downstream → deeper coordination pressure

### Fee Structure

**Fee on tokens transferred out**:

Figaro uses a single `feeRate` in basis points (`FEE_DENOMINATOR = 10,000`; range 5–50 bps i.e. 0.05%–0.50%) applied to the **payment** during resolution. The total fee is split evenly between buyer and seller.

```solidity
feeRate = 25  // example: 0.25% protocol fee (basis points)

totalFee  = (payment × feeSnapshot) / FEE_DENOMINATOR
buyerFee  = totalFee / 2
sellerFee = totalFee - buyerFee

sellerPayout = (2 × cumulativeValue) + payment - sellerFee
buyerPayout  = payment - buyerFee
```

**Rationale**: Fees are assessed on `payment` only (invariant V3-7), keeping the fee basis proportional to the value exchanged at each step. The fee snapshot is locked at order creation, so fee-rate changes do not affect in-flight orders.

**Cancellation Fee**: Cancellation charges `2 × feeSnapshot` on the **locked bond amount** and refunds `bond - cancellationFee` to the proposer. The 2× multiplier deters cancel-and-recreate spam.

### Bond Distribution on Resolution

```solidity
// Fee assessed on payment only (V3-7), split 50/50
totalFee  = (payment × feeSnapshot) / FEE_DENOMINATOR
buyerFee  = totalFee / 2
sellerFee = totalFee - buyerFee   // rounds up if odd

// Seller receives: Bond back + payment earned - seller fee
sellerPayout = (2 × cumulativeValue) + payment - sellerFee

// Buyer receives: Payment outflow minus buyer fee
buyerPayout = payment - buyerFee

// Fees to treasury
treasuryPayout = totalFee

// Invariant: sellerPayout + buyerPayout + treasuryPayout
//          = (2 × cumulativeValue) + (2 × payment)
//          = sellerBond + buyerBond
```

**Net Effects**:
- Seller: `-2×cumulativeValue + (2×cumulativeValue + payment - sellerFee) = +payment - sellerFee` ✓
- Buyer: `-2×payment + (payment - buyerFee) = -payment - buyerFee` ✓
- Treasury: `+totalFee` ✓
- Contract: All funds distributed, balance = 0 ✓

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

**Figaro Solution: Progressive Collateralization**

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
  - Blockchain shows: Order became Active at time T (`activatedAt[orderId]`)
  - Blockchain shows: Order is still unresolved (`resolvedAt[orderId] == 0`)
  - Therefore: Buyer has not resolved for 90 days (computed from timestamps)
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

For these cases, the legal system provides **deterrent enforcement**. On-chain timestamps (`activatedAt`, `resolvedAt`) supply the irrefutable audit trail courts need. No on-chain governance assists them — the protocol is inert and immutable; the off-chain legal system does the rest.

---

### Summary: Defense-in-Depth

The three enforcement layers work together. The goal is not redundancy for its own sake — it is overlap: each layer catches what the previous one cannot.

| Layer | Mechanism | Primary Cases |
|-------|-----------|---------------|
| **1 + 1.5** | Asymmetric bonding — cooperation is Nash dominant at every chain position | 99%+ of all orders |
| **2. Seller Coordination** | Atomic resolution — sellers police each other (micro-lending circle effect) | Multi-seller failures |
| **3. Legal + Transparency** | Immutable on-chain evidence — courts handle the 0.x% that economics cannot | Irrational or adversarial actors |

**Note on what Figaro does NOT include**: No governance layer. No timeout. No dispute arbitration. No insurance tranche. No oracle. The locked capital is the enforcement mechanism; the immutable record is the evidence trail. Any feature that introduces an escape hatch from the Active state destroys Layer 1. Any feature that introduces partial resolution destroys Layer 2. These are hard constraints.

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

**Defense**: Orders are self-contained, processId is deterministically generated with high entropy → No exploitable MEV.

**Note**: Orders include unique nonces and processId generated with block.prevrandao → Replay protection and collision resistance.

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

### DAG Support: Prototype2's Hidden Superpower

**Question**: Does removing off-chain validation limit us to linear chains?

**Answer**: No! Prototype2 supports arbitrary DAGs MORE easily than Prototype1.

**Key Insight**: Since we don't validate parent relationships on-chain, sellers can claim ANY `cumulativeValue`. If they lie, they lose their bond → Self-enforcing honesty.

**Example**: Diamond Dependency (two parents merge into one child)

```
Alice ← Bob ($10)    Alice ← Charlie ($5)
         \                /
          \              /
           Alice ← Dave (cumulativeValue = $15)
```

**Implementation**:
1. Bob creates order: cumulativeValue=$10, bonds $20
2. Charlie creates order: cumulativeValue=$5, bonds $10
3. Dave creates order: cumulativeValue=$15, bonds $30

**What if Dave lies?**
```
Scenario: Dave claims cumulativeValue=$50 (but only received $15)
- Dave bonds: 2×$50 = $100 
- Dave delivers: Can't deliver $50 worth (only has $15)
- Alice rejects → Dave's $100 locked forever
- Loss: $100 > $15 (honest value)

Result: Lying is strictly dominated → Dave reports honestly
```

**Comparison with Prototype1**:
- **Prototype1**: Validator checks parent resolution states off-chain
- **Prototype2**: Economic penalty >> validation cost

**Advantage**: No validator infrastructure needed. DAG structure enforced by incentives alone.

**Implementation Note**: On-chain, the process chain is linear (`processTail`
advances sequentially). DAG relationships are expressed via `parentOrderIds` —
emitted in `OrderCreated` events as informational metadata for indexers and UI.
The economic enforcement (cumulative bonding) works on the linear chain; the
DAG semantics are a coordination overlay that the UI and off-chain agents
interpret. This separation keeps the kernel simple while preserving the
self-enforcing honesty property described above.

### Multi-Step Chains

**Generalization**: Figaro supports arbitrary-length service chains.

**Invariant**: Buyer remains constant, sellers form DAG structure.

**Bond Formula**:
```
For seller at position i with parents P:
  G(i) = ∑(payment at position j) for all j ∈ ancestors(i)
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

### Reputation Layer

**On-chain signals**:
- Buyer rejection rate: `rejected_orders / total_orders`
- Seller resolution rate: `resolved_orders / created_orders`
- Average resolution time: `sum(resolve_time) / resolved_orders`

**Possible integration** (not yet implemented — future work):
```
Reputation-weighted bonds:
  adjustedBond = baseBond × reputationMultiplier
  
High reputation  → lower multiplier → less capital locked
Low reputation   → higher multiplier → more capital locked
```

**Effect**: Good reputation → Lower bonds → More capital efficient. This remains a design direction, not a deployed feature.

### Mutual-Consent Exit (Open Question)

**Problem**: What happens when neither party is at fault but the deal cannot
complete? A delivery truck is in an accident. A natural disaster destroys
inventory. The current design has no exit from Active state — both bonds
remain locked permanently.

**The "no escape hatches" property** means no *unilateral* escape. But mutual
consent is a different category. If both parties agree to exit, neither gains
from defection — the exit is itself a bilateral agreement, just like the
original commitment.

**Proposed mechanism**:
1. Both parties sign a "mutual exit" EIP-712 message specifying a refund split
2. A `mutualExit(processId, splitRatio, buyerSig, sellerSig)` function
   verifies both signatures and distributes bonds according to the agreed split
3. No third party is involved; no governance vote; no oracle

**Payoff matrix analysis**:

|              | Seller signs exit | Seller refuses |
|--------------|-------------------|----------------|
| **Buyer signs exit** | Both recover agreed portion ✓ | Status quo (bonds locked) |
| **Buyer refuses** | Status quo (bonds locked) | Status quo (bonds locked) |

The exit is Pareto-improving relative to permanent lock: both parties prefer
*some* recovery over *none*. It cannot be exploited unilaterally because it
requires dual signature. It does not weaken the deterrent because the deterrent
operates on the *unilateral* defection path — knowing that a mutual exit
exists does not make unilateral cheating more attractive.

**Open questions**:
- Does the *existence* of a mutual exit path change off-chain negotiation
  dynamics? (A party might deliberately create an "Act of God" to trigger
  exit negotiations.)
- Should the split ratio be constrained (e.g., minimum 50/50) to prevent
  coerced exits?
- Does this belong in the kernel (bilateral primitive, like commitment) or
  in an extension (opt-in per institution)?

**Current status**: Not implemented. Requires formal analysis before any code
is written. The risk is small (bilateral agreement + dual signature is a
narrow surface), but the question of whether *knowing* about the exit changes
the game's equilibrium needs rigorous treatment.

---

## Conclusion

Figaro represents a paradigm shift in multi-party coordination:

**Traditional Approach**: Build complex systems (timeouts, arbitrators, validators, governance) to handle edge cases.

**Figaro Approach**: Design incentives so edge cases never occur. When they do occur, the immutable on-chain record provides the evidence trail that existing legal systems need.

**Core Thesis**: Locked capital creates sufficient economic pressure to force cooperation without external enforcement.

**Defense-in-Depth**:
1. **Layer 1 - Primary Nash Equilibrium**: 2-party game theory with symmetric bonding ensures cooperation
2. **Layer 1.5 - Asymmetric Bonding**: Progressive collateralization maintains Nash equilibrium at scale (2→N parties)
3. **Layer 2 - Seller Coordination**: Atomic resolution creates micro-lending circle effect (social pressure)
4. **Layer 3 - Legal + Transparency**: Blockchain SSoT + court precedents deter edge case abuse

**Key Innovations**:
1. **Asymmetric bonding**: Progressive collateralization ensures deep-chain coordination while preserving Nash equilibrium at every position
2. **No escape hatches**: Capital lockup is the enforcement mechanism (no timeouts, no partial payments)
3. **Buyer as sole resolver**: Accountability through reputation + locked capital
4. **Atomic resolution**: All-or-nothing payment creates seller coordination pressure (like micro-lending groups)
5. **Pure game theory**: Security from incentives, not validators

**Result**: Simpler, more secure, more capital-efficient coordination protocol with redundant enforcement layers.

---

## Appendix: Implementation Checklist

### Core Contract (`FigaroCore.sol`)

- [x] Order struct: `{id, processId, cumulativeValue, payment, currency, buyer, seller, feeSnapshot, state, buyerProposed}`
- [x] State enum: `{Pending, Active, Resolved, Cancelled}`
- [x] Asymmetric collateral: `(2×cumulativeValue, 2×payment)`
- [x] Fee on payment: single `feeRate` (basis points, range 5–50 bps) applied to `payment`, split 50/50 between buyer and seller
- [x] Cancellation fee: `2 × feeSnapshot` applied to locked bond (spam deterrent)
- [x] Entry points: `firstOrder()`, `subOrder()`, `acceptOffer()`, `cancelOffer()`, `resolveProcess()`
- [x] Buyer-only resolution: `require(msg.sender == order.buyer)` in `resolveProcess()`
- [x] No timeouts: No escape from Active state
- [x] No validators: Economic incentives replace validation
- [x] Perfect accounting: All bonds distributed to parties + treasury fees

### Test Coverage

- [x] Nash equilibrium: Mutual cooperation payoffs correct
- [x] Collateral sufficiency: Bonds = 2× values
- [x] Multi-party chain: Progressive collateralization verified
- [x] Token accounting: Zero contract balance after resolution
- [x] Access control: Only buyer can resolve
- [x] No escape hatches: No reclaim, no timeout, no challenges

### Security Properties

- [x] No reentrancy: ReentrancyGuard on all state changes
- [x] No overflow: Solidity 0.8.26 checked arithmetic
- [x] Token-agnostic: Any non-rebasing, non-fee-on-transfer ERC-20 per process
- [x] No admin backdoor: No pause, no upgrade, no owner escape hatch

---

**Version**: 1.2  
**Last Updated**: April 2026

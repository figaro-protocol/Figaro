# Formal Verification — FigaroCore

TLA+ model of the FigaroCore kernel. Exhaustively verifies the economic
mechanism (bond math, token conservation, resolution correctness) across
all reachable states.

## What Is Verified

| Invariant | Property |
|---|---|
| **TokenConservation** | Sum of all wallets + contract balance = initial supply. No tokens created or destroyed. |
| **ContractSolvency** | Contract balance is always ≥ 0. |
| **WalletNonNegative** | No participant balance goes below zero. |
| **CumulativeIntegrity** | Process cumulativeValue = sum of all order payments in the process. |
| **ActiveCountCorrect** | Process activeCount = number of committed (not yet resolved) orders. |
| **ResolutionAlwaysPossible** | Contract always holds sufficient funds to resolve any active process. |
| **TypeOK** | All variables stay within their expected domains. |

## What Is Abstracted

These concerns are orthogonal to the economic mechanism and are omitted:

- **EIP-712 signatures** — assumed correct; the model tests what happens
  given valid commitments, not whether signatures are forgeable
- **ERC-20 token mechanics** — modeled as integer balances with direct transfer
- **Fee-on-transfer tokens** — `_pullExact` revert is abstracted (balances are exact)
- **Reentrancy** — protected by `ReentrancyGuard` in the contract
- **Block timestamps / deadlines** — timing concern, not economic
- **Multi-currency** — single currency model (mechanism is identical per currency)
- **Gas limits** — operational concern
- **Post-resolution continuation** — the contract allows sub-orders after
  `resolveProcess`; modeled as single-resolution per process for tractability

## Model Checking Results

**Configuration:** 2 buyers, 2 sellers, InitialBalance=30, MaxPayment=3,
2 processes, 2 sub-orders per process.

```
States generated:  8,380,329
Distinct states:   6,087,113
Invariants:        7/7 verified ✓
Time:              ~19 minutes
TLC exit code:     0 (no errors)
```

## Files

| File | Purpose |
|---|---|
| `FigaroCore.tla` | Main specification — actions, state machine, safety invariants |
| `MC.tla` | Model-checking configuration (constants, model values) |
| `MC.cfg` | TLC configuration (specification, constant bindings, invariant list) |
| `archive-v3/` | Archived V3 formal specs (incompatible with the current kernel) |

## How to Run

### VS Code (TLA+ extension)

1. Open `MC.tla`
2. Run: **TLA+: Check model with TLC**
3. Add `-deadlock` to TLC options (bounded model has terminal states)

### Command Line

```bash
# Requires tla2tools.jar on the classpath
java -jar tla2tools.jar -deadlock formal/MC.tla
```

### Quick Smoke Test

Edit `MC.tla` to reduce constants for faster checking:

```tla
MCInitialBalance == 10
MCMaxPayment     == 2
MCMaxProcesses   == 1
MCMaxSubOrders   == 1
```

This reduces the state space to ~1,000 states and completes in seconds.

## Model Design

The TLA+ spec mirrors the two external functions of `FigaroCore.sol`:

| Contract Function | TLA+ Action | What It Models |
|---|---|---|
| `commit()` (root) | `CommitRoot(buyer, seller, payment)` | New process creation, bond deposit |
| `commit()` (sub) | `CommitSub(pid, seller, payment)` | Process extension, progressive collateralization |
| `resolveProcess()` | `ResolveProcess(pid)` | Atomic resolution, payout distribution |

### Bond Math

```
Root order:   buyerBond = payment × 2,  sellerBond = payment × 2
Sub-order:    buyerBond = payment × 2,  sellerBond = cumulativeValue × 2

Resolution:   sellerPayout = cumulativeValue × 2 + payment  (bond return + payment)
              buyerPayout  = payment                         (half bond return)
```

Per-order token conservation: `deposited = buyerBond + sellerBond = paid out`.
This holds for every order, which implies per-process and global conservation.

### Progressive Collateralization

Sub-order sellers bond against the *total* cumulative value, not just their
payment. This means later sellers in a process tree have more skin in the
game — they incentivize the entire upstream chain to cooperate, not just
their immediate counterparty.

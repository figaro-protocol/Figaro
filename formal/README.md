# Formal Verification — TLA+ models

Five TLC-checked models, nine configurations, all run by `../scripts/test-tla.sh`. The
passes and their run times are listed in `docs/TESTING.md` § TLA+; what each model holds, its
mutation checks and its witnesses in `docs/VERIFICATION_MAP.md` § "7) TLA+ formal models — current
posture"; the last recorded state counts in its § "14) Component status matrix".

| Model | Scope | Invariants |
|---|---|---|
| `FigaroCore.tla` + `MC.tla`/`MC.cfg` | `FigaroCore`'s economic mechanism (detailed below) | 9 |
| `FlorinToken.tla` + `.cfg` | The florin's supply cap and its minter registry | 9 |
| `WitnessSwapAndCommitCoordinator.tla` + `.cfg` | The swap-funded commit, step by step through the EVM | 10 |
| `ResolutionUniverses.tla` + `.cfg` | Both paths and the usage counter together, interleaved | 22 |
| `RelayState.tla` + `.cfg` | Off chain: whether the state behind the verifier's root survives the relay | 8 + 2 action properties |
| `RelayState.tla` + `RelayStateDeferral.cfg` (`DeferSpec`) | Off chain: how the relay defers an operation dropped at batch formation | 10 |
| `RelayState.tla` + `RelayStateResolve.cfg` (`ResolveSpec`) | Off chain: the buyer's resolve authorization on the batch path, both forms | 3 |
| `RelayState.tla` + `RelayStateAttest.cfg` (`AttestSpec`) | Off chain: a party's attestation on the batch path, both forms | 2 |
| `RelayState.tla` + `RelayStateIsolate.cfg` (`IsolateSpec`) | Off chain: splitting a batch the chain refuses when nobody is named; `RelayStateIsolateCap.cfg` is its reachability witness | 3 |

The remainder of this file documents the `FigaroCore` model in depth.
Exhaustively verifies the economic mechanism (bond math, token conservation,
resolution correctness) across all reachable states.

## What Is Verified

| Invariant | Property |
|---|---|
| **TokenConservation** | Sum of all wallets + contract balance = initial supply. No tokens created or destroyed. |
| **ContractSolvency** | Contract balance is always ≥ 0. |
| **WalletNonNegative** | No participant balance goes below zero. |
| **CumulativeIntegrity** | Process runningTotal = sum of all order payments in the process. |
| **ActiveCountCorrect** | Process activeCount = number of committed (not yet resolved) orders. |
| **ResolutionAlwaysPossible** | Contract always holds sufficient funds to resolve any active process. |
| **DeterrentEscrowMagnitudes** | Everything the contract holds is the two bonds of the committed orders, at 2× on both sides — the deterrent magnitude the equilibrium argument reasons over, not merely "enough to pay out". |
| **SettledNetPositions** | Every wallet = its starting balance − what it currently has locked + what it has resolved. Resolution moved exactly `payment` buyer → seller and refunded both bonds whole. |
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

## Model Checking Results

**Configuration:** 2 buyers, 2 sellers, InitialBalance=30, MaxPayment=3,
2 processes, 2 sub-orders per process.

```
States generated:  8,380,329
Distinct states:   6,087,113
Invariants:        9/9 verified ✓
Time:              7–19 minutes (hardware-dependent)
TLC exit code:     0 (no errors)
```

## The best-response inequalities (Lean)

`lean/FigaroEquilibrium.lean` closes the one step no model checker expresses, a party choosing:
the equilibrium argument's two-party comparisons as best-response inequalities over the payoff
table the TLA⁺ invariants pin (`DeterrentEscrowMagnitudes`, `SettledNetPositions`). Four theorems,
each over one order at a position of a chain: `buyer_resolves` (after performance, resolving
strictly beats withholding, assuming nothing of the seller), `seller_performs` (given the buyer's
plan, performing strictly beats holding out at every feasible retention), `deterrent_gap` (the
margin by which performing beats holding out at maximal retention is `Pᵢ + Gᵢ`, at least `2Pᵢ`),
and `holdout_when_dead` (where the process will not close, holding out beats performing, so the
conclusion stays conditional). The hypotheses are two, carried by every order as fields of the
`Order` structure and nowhere else, and they are the mechanism's own facts: `payment_floor`,
`1 ≤ payment` (`FigaroCore.commit` reverts `ZeroPayment` on a payment of zero), and `cumulative_inclusive`,
`payment ≤ cumulative` (the accumulator includes the order's own payment). Subgame perfection, the
second equilibrium and the co-sellers' selection are argued in `/papers/asymmetric-bonding` and
are not claimed by the file. `lake build` in `formal/lean/` checks it with core Lean 4 and `omega`,
no network beyond the pinned toolchain.

## The data lemmas (Lean)

The same `lake build` checks two lemmas about the data, each a model of the code it names with
keccak a parameter, under the assumption `lean/FigaroKeccak.lean` states once:
`lean/FigaroMerkle.lean` (`merkle_binding`, the agreement and assembly trees) and
`lean/FigaroStateTree.lean` (`state_tree_update`, the batch path's state tree). What each proves,
what it models, where it differs from the code and its mutation checks are in `docs/TESTING.md`
§ "Lean 4 (`formal/lean/`) — the equilibrium, machine-checked".

## Files

| File | Purpose |
|---|---|
| `FigaroCore.tla` | Main specification — actions, state machine, safety invariants |
| `MC.tla` | Model-checking configuration (constants, model values) |
| `MC.cfg` | TLC configuration (specification, constant bindings, invariant list) |
| `lean/FigaroEquilibrium.lean` | The best-response inequalities, machine-checked (above) |
| `lean/FigaroKeccak.lean` | The one cryptographic assumption, stated once (above) |
| `lean/FigaroMerkle.lean` | Merkle binding for the agreement and assembly trees (above) |
| `lean/FigaroStateTree.lean` | The state tree's update, for the batch path (above) |

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
| `commit()` (root) | `CommitRoot(buyer, seller, payment)` | New process creation, bonds locked |
| `commit()` (sub) | `CommitSub(pid, seller, payment)` | Process extension, cumulative bonding |
| `resolveProcess()` | `ResolveProcess(pid)` | Atomic resolution, payout distribution |

A resolved process is terminal in the model AND in the contract: `commit()`
reverts `ProcessAlreadyResolved` on a sub-order naming a resolved process
(`src/core/kernel/FigaroCore.sol` — the `activeOrderCount == 0` gate), so the model's
single-resolution-per-process shape is a faithful mirror, not an abstraction.

### Bond Math

```
Root order:   buyerBond = payment × 2,  sellerBond = payment × 2
Sub-order:    buyerBond = payment × 2,  sellerBond = runningTotal × 2

Resolution:   sellerPayout = runningTotal × 2 + payment  (bond return + payment)
              buyerPayout  = payment                         (half bond return)
```

Per-order token conservation: `deposited = buyerBond + sellerBond = paid out`.
This holds for every order, which implies per-process and global conservation.

### Cumulative Bonding

Sub-order sellers bond against the *total* cumulative value, not just their
payment. This means later sellers in a process chain have more skin in the
game — they incentivize the entire upstream chain to cooperate, not just
their immediate counterparty.

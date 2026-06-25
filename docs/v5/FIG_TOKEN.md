# FIG Token — Design Document

## Status

Implemented. Two contracts:

- `src/fig/FigToken.sol` — ERC-20 + EIP-2612 permit, 1B hard cap, minter registry
  with `totalRegisteredCap` enforcement.
- `src/fig/IFigMinter.sol` — minimal `mint(address,uint256)` interface, implemented
  by `FigToken`.

The proof-gated RPGF distribution (`src/fig/RpgfMinter.sol`, its SP1 prover, and the
off-chain aggregation/sequencer machinery) was removed in the proof-apparatus
teardown. There is no on-chain RPGF distribution. The surviving FIG stack is the
token contract plus its minter interface; the genesis distribution lives in the
deploy scripts.

Deployment: `script/DeployMainnet.s.sol` (mainnet) and `script/Deploy.s.sol` (devnet)
perform the genesis distribution and seal minting.

---

## Why a Native Token

The Figaro protocol does not need a native token for security. The bonding
mechanism is self-enforcing via MAD — the game-theoretic equilibrium holds
regardless of which ERC-20 participants use. The protocol remains
token-agnostic for bonding, settlement, and all coordination primitives.

The token serves a different purpose: **it is a coordination Schelling point.**

A native token works the same way fiat currency works — not because an
authority enforces it, but because participants converge on the same unit
of account. The value of the token is that people ask for it by name. That
recognition is more durable and more global than any trademark in any
jurisdiction. The token *is* the coordination, not a claim on revenue,
not a governance right, not a staking instrument.

### What the token is not

- **Not a security mechanism.** The 98% cooperation rate comes from the
  bonding equilibrium, not from token staking or slashing.
- **Not governance.** Minimizing governance is a security property. Every
  governance parameter is an attack surface. The protocol has no admin
  backdoor, no timeout, no arbiter. A governance token would reintroduce
  the discretionary power the protocol was designed to eliminate.
- **Not required for participation.** Gating order creation, bonding, or
  settlement behind a token would reintroduce infrastructure rent. The
  protocol's permissionless nature is load-bearing.
- **Not settlement-anchored emission.** FIG is **not minted on `resolveProcess`**.
  There is no per-settlement reward path.

---

## Name

**FIG.**

Three characters. Works as both ticker and spoken word. Three-letter tickers
are premium, pronounceable in every language. The short form is the currency;
the full name is the protocol.

---

## Allocation (canonical, 1B total)

| Allocation | % | Tokens | Distribution |
|---|---|---|---|
| **Founders** | **10%** | **100,000,000** | Genesis mint to founder wallet — **no vesting, no unlock** |
| **DAO**      | **30%** | **300,000,000** | Genesis mint to DAO wallet — **no vesting, no unlock** |
| **Clause-author RPGF** | **60%** | **600,000,000** | **No wired minter (removed in teardown)** — see below |
| **Total** | **100%** | **1,000,000,000** | |

Founders and DAO receive tokens directly to their wallets at deploy time. Only
the 400M founder + DAO allocation is minted; the remaining 600M of the 1B cap
has **no wired mint path**.

### The 600M clause-author RPGF allocation

The *intent* of this allocation is unchanged: 60% of the supply is reserved for
clause authors, distributed by how much a contribution broadens the protocol's
substrate — a category-weighted formula favoring Tier-1 families such as geo and
coordination clauses, which produce the public physical/virtual-flow graph that
dissolves platform value-capture.

**The on-chain mechanism that delivered this allocation was removed in the
proof-apparatus teardown.** The proof-gated minter (`RpgfMinter`, an SP1-gated
three-stage airdrop with per-tranche Merkle roots and claim transactions), its
Rust aggregator, and the off-chain sequencer/conformance tooling are all gone.
There is currently no contract that mints any part of the 600M, and no
settlement-anchored emission replaces it.

The rationale for the allocation — the substrate-broadening / category formula
and why the geo/coordination weight exists — survives in
`docs/v5/PUBLIC_GRAPH_MODEL.md` § "Why the substrate-broadening weight exists".
Re-home the formula and any rebuilt distribution mechanism alongside it.

### Rationale

- **No vesting for founders or DAO.** The code is already developed. Vesting
  protects investors from founders abandoning a project, but there are no
  investors. Adding a vesting cliff would be theater. The DAO needs its tokens
  at genesis to perform its coordination function from day one.

- **No settlement-anchored emission.** FIG is not minted per settlement. Coupling
  the token to protocol activity invites gaming and complicates the trust surface.

- **No token sale.** FIG is never sold — not in an ICO, IDO, SAFT, or
  presale. There is no investment contract. The founders and DAO receive
  their allocations at genesis.

---

## FigToken Mechanics

`FigToken` (`src/fig/FigToken.sol`) is an ERC-20 with EIP-2612 permit
(`ERC20Permit`) and a reentrancy-guarded `mint`. The supply discipline is
enforced entirely at registration and mint time — there is no admin, no pause,
no upgrade path.

- **Hard cap.** `MAX_SUPPLY = 1_000_000_000 ether`. Every `mint` reverts with
  `SupplyCapExceeded` if it would push `totalSupply()` past the cap.

- **Minter registry.** The deployer registers minter contracts via
  `registerMinter(minter, cap)`. Each minter has a `Minter { cap, minted }`
  record; a minter can only be registered once (`MinterAlreadySet`), and `mint`
  reverts past that minter's own `cap` (`MinterCapExceeded`).

- **`totalRegisteredCap`.** The sum of all registered minter caps. Registration
  reverts (`SupplyCapExceeded`) if `totalRegisteredCap + cap > MAX_SUPPLY`, so
  the allocation plan cannot be over-committed even before any minting occurs.

- **Renounce.** `renounceDeployerMint()` permanently sets `deployerMintRenounced`.
  After renounce, no new minters can be registered and the deployer can never
  mint again. The action cannot be undone.

- **EIP-2612 permit.** Gasless approvals via the inherited `ERC20Permit`
  (`permit`, `nonces`, `DOMAIN_SEPARATOR`).

---

## Deployment Flow

### Mainnet — `script/DeployMainnet.s.sol`

The deploy script mints only the founder + DAO genesis allocation, then seals
minting. `FOUNDER_ALLOC = 100M`, `DAO_ALLOC = 300M`.

```
1. Deploy FigToken (deployer becomes the constructor deployer).
2. Register the deployer as a one-shot genesis minter with cap 400M (= FOUNDER_ALLOC + DAO_ALLOC).
3. fig.mint(FOUNDER_WALLET, 100M)  — founder genesis mint.
4. fig.mint(DAO_WALLET, 300M)      — DAO genesis mint.
5. fig.renounceDeployerMint()      — permanent. No new minters. Deployer can never mint again.
```

After renounce:

- Deployer minter: `cap = 400M, minted = 400M`. Exhausted. Cannot mint more.
- `totalRegisteredCap = 400M`. The remaining 600M of the 1B cap has **no
  registered minter** — the proof-gated RPGF airdrop that would have minted it
  was removed in the teardown.
- Deployer mint renounced. **No further minter registration is possible.**

### Devnet — `script/Deploy.s.sol`

On devnet the deployer registers itself with a 100M cap, mints 100M to its own
wallet (standing in for founder + DAO), and renounces. There is no staged-airdrop
allocation on either path.

---

## Open Design Questions

All resolved. Each item is a **decision**, not an open question.

1. **Total supply: 1,000,000,000 FIG.** Round, memorable.
2. **Founder + DAO at genesis, no vesting.** See "Rationale" above.
3. **FIG token standard: ERC-20 + EIP-2612 permit.**
4. **No emission contract, no settlement-anchored minting.**
5. **No on-chain RPGF distribution.** The proof-gated minter was removed in the
   proof-apparatus teardown; the 600M clause-author allocation has no wired mint
   path. The allocation intent survives in `docs/v5/PUBLIC_GRAPH_MODEL.md`.
6. **Immutability.** Once deployed, no contract in the FIG stack can be
   upgraded, paused, or reconfigured. If any contract is wrong, a new one
   is deployed and the community migrates. There is no admin.

---

## What This Document Is Not

This is an internal design record. Not a whitepaper, pitch deck, or
regulatory disclosure. The allocation table above is the canonical reference
for any FIG-related work in the codebase.

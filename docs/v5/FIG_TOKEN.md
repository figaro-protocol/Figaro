# FIG Token — Design Document

## Status

Implemented. Three contracts:

- `src/fig/FigToken.sol` — ERC-20 + EIP-2612 permit, 1B hard cap, minter registry
  with `totalRegisteredCap` enforcement.
- `src/fig/StagedMerkleAirdrop.sol` — three-stage merkle-claim airdrop
  (year 2 / year 5 / year 9).
- `src/fig/IFigMinter.sol` — minimal `mint(address,uint256)` interface.

Deployment: `script/DeployMainnet.s.sol` performs the full genesis distribution
and seals minting in a single transaction bundle.

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
  There is no per-settlement reward path. The earlier `FigEmission` contract
  and any batch-verifier minting have been permanently removed.

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
| **Airdrop — Year 2** | 30% | 300,000,000 | Staged merkle claim, unlocks at year 2 |
| **Airdrop — Year 5** | 20% | 200,000,000 | Staged merkle claim, unlocks at year 5 |
| **Airdrop — Year 9** | 10% | 100,000,000 | Staged merkle claim, unlocks at year 9 |
| **Total** | **100%** | **1,000,000,000** | |

Founders and DAO receive tokens directly to their wallets at deploy time.
The community airdrop is a single `StagedMerkleAirdrop` contract with three
immutable merkle roots and three immutable unlock timestamps.

### Rationale

- **No vesting for founders or DAO.** The code is already developed. Vesting
  protects investors from founders abandoning a project, but there are no
  investors. Adding a vesting cliff would be theater. The DAO needs its tokens
  at genesis to perform its coordination function from day one.

- **Staged community airdrop (30 / 20 / 10).** The distribution is weighted
  toward the earliest stage because early-network coordination has higher
  marginal impact. The nine-year tail reserves 10% for long-term participants
  who demonstrate sustained engagement.

- **No settlement-anchored emission.** The original `FigEmission` design
  (per-settlement FIG mint with halving or Euler oscillation) was removed.
  It complicated the trust surface, coupled the token to protocol activity
  in ways that invited gaming, and added a large dead-code path in the
  batch verifier. The three airdrop stages replace it as the post-genesis
  distribution mechanism.

- **No token sale.** FIG is never sold — not in an ICO, IDO, SAFT, or
  presale. There is no investment contract. The founders and DAO receive
  their allocations at genesis; everyone else claims via the staged airdrop.

---

## Deployment Flow (`DeployMainnet.s.sol`)

The deploy script is a single transaction bundle that permanently seals
minting at the canonical 1B cap:

```
1. Deploy FigToken (deployer becomes the constructor deployer).
2. Deploy StagedMerkleAirdrop with 3 merkle roots + 3 unlock timestamps (all immutable).
3. Register the deployer as a one-shot genesis minter with cap 400M.
4. fig.mint(founderWallet, 100M)     — founder genesis mint.
5. fig.mint(daoWallet, 300M)         — DAO genesis mint.
6. Register StagedMerkleAirdrop as a minter with cap 600M.
7. fig.renounceDeployerMint()        — permanent. No new minters. Deployer can never mint again.
```

After step 7:

- Deployer minter: `cap = 400M, minted = 400M`. Exhausted. Cannot mint more.
- StagedMerkleAirdrop minter: `cap = 600M, minted = 0`. Drains only through valid merkle claims.
- `totalRegisteredCap = 1B` (exact MAX_SUPPLY).
- Deployer mint renounced. **No further minter registration is possible.**

The 400M + 600M = 1B cap sum is enforced at registration time via
`FigToken.totalRegisteredCap`, so the allocation plan cannot be over-committed
even by deployer misconfiguration.

---

## Claim Mechanism

Each airdrop stage uses the standard OZ MerkleProof pattern:

```solidity
leaf = keccak256(abi.encodePacked(recipient, amount));
```

A claim transaction on `StagedMerkleAirdrop` specifies:

- `stageIndex` (0 = year 2, 1 = year 5, 2 = year 9),
- `amount` (the leaf amount),
- `proof` (merkle proof against that stage's root).

Revert paths:

- `NotUnlocked(stageIndex)` — if `block.timestamp < stage.unlockTime`.
- `AlreadyClaimed(stageIndex, account)` — one-shot per (stage, account).
- `InvalidProof()` — proof does not verify against the stage's root.
- `InvalidStage(stageIndex)` — `stageIndex >= 3`.

The contract then calls `IFigMinter(minter).mint(msg.sender, amount)`, which
mints FIG directly to the claimer. The minter (`FigToken`) enforces its own
per-minter cap, so a stage cannot mint more than its merkle tree entitlements
summed to less than 600M collectively — and in any case cannot exceed the
registered 600M airdrop cap.

---

## Open Design Questions

All resolved. Each item in this section is a **decision**, not an open question.

1. **Total supply: 1,000,000,000 FIG.** Round, memorable.
2. **Founder + DAO at genesis, no vesting.** See "Rationale" above.
3. **Airdrop staged 30/20/10 at years 2/5/9.** Single contract.
4. **FIG token standard: ERC-20 + EIP-2612 permit.**
5. **No emission contract, no batch-verifier minting.** Dead and removed.
6. **Immutability.** Once deployed, no contract in the FIG stack can be
   upgraded, paused, or reconfigured. If any contract is wrong, a new one
   is deployed and the community migrates. There is no admin.

---

## What This Document Is Not

This is an internal design record. Not a whitepaper, pitch deck, or
regulatory disclosure. The allocation table above is the canonical reference
for any FIG-related work in the codebase.

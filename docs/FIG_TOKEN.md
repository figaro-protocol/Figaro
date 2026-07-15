# FIG Token — Design Document

## Status

Implemented. Two contracts:

- `src/fig/FigToken.sol` — ERC-20 + EIP-2612 permit, 1B hard cap, minter registry
  with `totalRegisteredCap` enforcement.
- `src/fig/IFigMinter.sol` — minimal `mint(address,uint256)` interface, implemented
  by `FigToken`.

The RPGF distribution is `src/fig/RpgfMinter.sol` (rebuilt optimistic 2026-07-15
— the SP1-proof-gated predecessor was removed in the proof-apparatus teardown)
plus `src/fig/IRpgfArbitrator.sol`, the provider-agnostic bond-settlement forum
seam. Contract surfaces are inventoried in `docs/CONTRACTS.md`.

Deployment: `script/DeployMainnet.s.sol` (mainnet) and `script/Deploy.s.sol` (devnet)
deploy the minter, register it at 600M, perform the genesis distribution, and
seal minting.

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
| **RPGF** | **60%** | **600,000,000** | `RpgfMinter` — optimistic three-tranche distribution to clause authors + assembly designers of record |
| **Total** | **100%** | **1,000,000,000** | |

Founders and DAO receive tokens directly to their wallets at deploy time. The
600M mints only through the `RpgfMinter`'s finalized merkle claims — the minter
is registered at genesis (before `renounceDeployerMint`, which is why it must
exist at deploy time), capped at exactly 600M by the FigToken minter registry.

### The 600M RPGF allocation

The *intent* of this allocation is unchanged: 60% of the supply is reserved for
the people whose artifacts broaden the protocol's substrate — clause authors
and assembly designers of record (recipients widened by the 2026-07-09
redesign) — distributed by a category-weighted formula favoring the tier-1
article groups (logistics, coordination) that produce the public
physical/virtual-flow graph dissolving platform value-capture. Mandatory-article
clauses are excluded: their usage is unconditional and carries no signal.

**The mechanism (rebuilt 2026-07-15, replacing the SP1-proof-gated minter
removed in the teardown) is OPTIMISTIC** — see `RpgfMinter` in
`docs/CONTRACTS.md`: anyone posts a tranche's payout Merkle root under an ETH
bond; the formula is deterministic over public chain events and anchored by
`formulaHash` (keccak256 of `sdk/src/rpgf/formula.json`, whose reference
implementation ships in the SDK), so anyone recomputes and challenges a wrong
root; a challenge always voids; only a root surviving its full challenge window
unchallenged mints, via merkle claims that never expire. A 15% per-wallet
water-filled cap spans both recipient families. Three tranches (300M/200M/100M)
at deployment-set times — testnet compresses the years-2/5/9 schedule (time
compresses when time is involved; ruled 2026-07-15).

The incentive rationale — why the substrate-broadening weight exists — lives in
`docs/PUBLIC_GRAPH_MODEL.md` § "Why the substrate-broadening weight exists".

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

The deploy script registers the RPGF minter, mints the founder + DAO genesis
allocation, then seals minting. `FOUNDER_ALLOC = 100M`, `DAO_ALLOC = 300M`,
`RPGF_ALLOC = 600M`.

```
1. Deploy FigToken (deployer becomes the constructor deployer).
2. Deploy RpgfMinter (forum, bond, windows, tranche times via environment;
   formulaHash = keccak256 of the canonical formula-spec bytes).
3. fig.registerMinter(rpgfMinter, 600M) — MUST precede renounce (irreversible).
4. Register the deployer as a one-shot genesis minter with cap 400M (= FOUNDER_ALLOC + DAO_ALLOC).
5. fig.mint(FOUNDER_WALLET, 100M)  — founder genesis mint.
6. fig.mint(DAO_WALLET, 300M)      — DAO genesis mint.
7. fig.renounceDeployerMint()      — permanent. No new minters. Deployer can never mint again.
```

After renounce:

- Deployer minter: `cap = 400M, minted = 400M`. Exhausted. Cannot mint more.
- `totalRegisteredCap = 1B` — the full cap is spoken for: 400M exhausted at
  genesis, 600M mintable only through the RpgfMinter's finalized merkle claims.
- Deployer mint renounced. **No further minter registration is possible.**

### Devnet — `script/Deploy.s.sol`

On devnet the deployer registers the RpgfMinter at 600M (MockArbitrator forum,
seconds-scale windows so the e2e runs the full post → challenge → finalize →
claim cycle in real time), registers itself with a 100M cap, mints 100M to its
own wallet (standing in for founder + DAO), and renounces.

---

## Open Design Questions

All resolved. Each item is a **decision**, not an open question.

1. **Total supply: 1,000,000,000 FIG.** Round, memorable.
2. **Founder + DAO at genesis, no vesting.** See "Rationale" above.
3. **FIG token standard: ERC-20 + EIP-2612 permit.**
4. **No emission contract, no settlement-anchored minting.**
5. **Optimistic RPGF distribution.** Posted-window + bonded challenge +
   deterministic public recompute (ruled 2026-07-15, replacing the removed
   proof-gated minter): input provenance is covered by anyone's recompute —
   strictly stronger than the SP1 version, with zero proving infrastructure
   and no recurring cost to anyone but disputing parties.
6. **Immutability.** Once deployed, no contract in the FIG stack can be
   upgraded, paused, or reconfigured. If any contract is wrong, a new one
   is deployed and the community migrates. There is no admin.

---

## What This Document Is Not

This is an internal design record. Not a whitepaper, pitch deck, or
regulatory disclosure. The allocation table above is the canonical reference
for any FIG-related work in the codebase.

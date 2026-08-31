# The Florin — Design Document

The florin is Figaro's own token: a coordination Schelling point, and nothing
else. This document owns what the token is, what it is not, its name, the whole
of its supply and how that supply is allocated, and the contract that enforces
those limits.

Two subjects that were once told here have their own documents, because they
are their own subjects: what the DAO is for and how it spends is `docs/DAO.md`;
how the 600M is earned and paid is `docs/DESIGNER_REWARDS.md`. Contract
surfaces are inventoried in `docs/CONTRACTS.md`.

---

## Why a native token

The Figaro protocol does not need a native token for security. The bonding
mechanism is self-enforcing — the equilibrium holds regardless of which ERC-20
the parties use. The protocol stays token-agnostic for bonding, resolution, and
every coordination primitive, and the florin changes none of that.

The token serves a different purpose: **it is a coordination Schelling point.**

A native token works the way a currency works — not because an authority
enforces it, but because participants converge on the same unit of account. The
value of the token is that people ask for it by name. That recognition is more
durable and more global than any trademark in any jurisdiction. The token *is*
the coordination: not a claim on revenue, not a governance right, not a staking
instrument.

### What the token is not

- **Not a security mechanism.** Cooperation comes from the bonding
  equilibrium, not from token staking or slashing.
- **Not governance.** Minimizing governance is a security property. Every
  governance parameter is an attack surface. The protocol has no admin
  backdoor, no timeout, no arbiter. A governance token would reintroduce
  the discretionary power the protocol was designed to eliminate.
- **Not required for participation.** Gating order creation, bonding, or
  resolution behind a token would reintroduce infrastructure rent. The
  protocol's permissionless nature is load-bearing.
- **Not resolution-anchored emission.** The florin is **not minted on
  `resolveProcess`**. There is no per-resolution reward path.
- **Never market-touched by its issuers.** The market stance is stated
  indelibly in the contract natspec (`src/florin/FlorinToken.sol`): neither the
  DAO treasury nor the founder ever sells, buys, or provides liquidity on any
  market; the first price is a stranger's to name.

---

## Name

**The florin.** Ticker **FLORIN**, symbol **ƒ** (U+0192).

Figaro is the protocol; the florin is its token. The unit is a **common noun** —
lowercase in prose, natural plural "florins" — because a real currency is a
common noun with a symbol, not a perpetually-capitalized brand.

**The rule this name obeys: a token name DENOMINATES, it never DESCRIBES.** A
name that describes the service reads as a substitutable product brand (the
"Filecoin mismatch"). Historical currency names come from four sources only —
weights (peso, lira, pound), places (dollar ← thaler; florin ← Florence),
persons (bolívar, napoleon), and material (guilder, złoty). The florin is the
archetypal trade denomination: the fiorino d'oro (1252) held its unit across
jurisdictions for centuries, which is Figaro's job description. The name also
plugs into a claim the corpus already makes — the florin era is the era of
double-entry bookkeeping, and a process is framed as a self-closing ledger
period.

The ticker is the full word because FLO, XFL, and FLR are taken or adjacent.
The symbol ƒ is the orphaned guilder/florin sign: universal font support, and
the initial of Figaro — the visual protocol↔unit bridge.

---

## Allocation (canonical, 1B total)

| Allocation | % | Tokens | Distribution |
|---|---|---|---|
| **Founders** | **7%** | **70,000,000** | Genesis mint to founder wallet — **no vesting, no unlock** |
| **Supporters** | **3%** | **30,000,000** | Genesis mint to supporters wallet (friends & family / early supporters) — **no vesting, no unlock** |
| **DAO**      | **30%** | **300,000,000** | Genesis mint to DAO wallet — **no vesting, no unlock**. What the DAO is for: `DAO.md` |
| **Designer rewards** | **60%** | **600,000,000** | `RpgfMinter` — minted lazily, per period, by claim. Who earns it and on what meter: `DESIGNER_REWARDS.md` |
| **Total** | **100%** | **1,000,000,000** | |

Founders, supporters, and the DAO receive tokens directly to their wallets at
deploy time. The 600M mints only through the `RpgfMinter`'s per-period claims —
the minter is registered at genesis (before `renounceDeployerMint`, which is
why it must exist at deploy time), capped at exactly 600M by the FlorinToken
minter registry.

> **The DAO's 300M and the 600M reserve are different objects.** The 300M is a
> one-time treasury grant, held and spent by human decision. The 600M is minted
> lazily by per-period usage claims that no one decides. Different tier,
> different mechanism — do not conflate them.

### Rationale

- **No vesting for founders, supporters, or DAO.** The code is already
  developed. Vesting protects investors from founders abandoning a project, but
  there are no investors. Adding a vesting cliff would be theater. The DAO
  needs its tokens at genesis to perform its coordination function from day
  one.

- **No resolution-anchored emission.** The florin is not minted per resolved
  process. Coupling the token to protocol activity invites gaming and
  complicates the trust surface.

- **No token sale.** The florin is never sold — not in an ICO, IDO, SAFT, or
  presale. There is no investment contract. The founders, supporters, and DAO
  receive their allocations at genesis.

---

## FlorinToken mechanics

`FlorinToken` (`src/florin/FlorinToken.sol`) is an ERC-20 with EIP-2612 permit
(`ERC20Permit`) and a reentrancy-guarded `mint`. The supply discipline is
enforced entirely at registration and mint time — there is no admin, no pause,
no upgrade path.

- **Hard cap.** `MAX_SUPPLY = 1_000_000_000 ether`. Every `mint` reverts with
  `SupplyCapExceeded` if it would push `totalSupply()` past the cap.

- **Minter registry.** The deployer registers minter contracts via
  `registerMinter(minter, cap)`. Each minter has a `Minter { cap, minted }`
  entry; a minter can only be registered once (`MinterAlreadySet`), and `mint`
  reverts past that minter's own `cap` (`MinterCapExceeded`).

- **`totalRegisteredCap`.** The sum of all registered minter caps. Registration
  reverts (`SupplyCapExceeded`) if `totalRegisteredCap + cap > MAX_SUPPLY`, so
  the allocation plan cannot be over-committed even before any minting occurs.

- **Renounce.** `renounceDeployerMint()` permanently sets `deployerMintRenounced`.
  After renounce, no new minters can be registered and the deployer can never
  mint again. The action cannot be undone.

- **EIP-2612 permit.** Gasless approvals via the inherited `ERC20Permit`
  (`permit`, `nonces`, `DOMAIN_SEPARATOR`).

`src/florin/IFlorinMinter.sol` is the minimal `mint(address,uint256)` interface,
implemented by `FlorinToken`.

---

## Deployment flow

### Mainnet — `script/DeployMainnet.s.sol`

The deploy script registers the designer-rewards minter, mints the founder +
supporters + DAO genesis allocation, then seals minting. `FOUNDER_ALLOC = 70M`,
`SUPPORTERS_ALLOC = 30M`, `DAO_ALLOC = 300M`, `RPGF_ALLOC = 600M`.

```
1. Deploy FlorinToken (deployer becomes the constructor deployer).
2. Deploy UsageCounter, then RpgfMinter over it (florin + counter +
   ClauseRegistry + AssemblyRegistry). Periods, budgets, and the
   minimum-support floor are DESIGNER_REWARDS.md's.
3. fig.registerMinter(rpgfMinter, 600M) — MUST precede renounce (irreversible).
4. Register the deployer as a one-shot genesis minter with cap 400M (= FOUNDER_ALLOC + SUPPORTERS_ALLOC + DAO_ALLOC).
5. fig.mint(FOUNDER_WALLET, 70M)     — founder genesis mint.
6. fig.mint(SUPPORTERS_WALLET, 30M)  — supporters (friends & family) genesis mint.
7. fig.mint(DAO_WALLET, 300M)        — DAO genesis mint.
8. fig.renounceDeployerMint()        — permanent. No new minters. Deployer can never mint again.
```

After renounce:

- Deployer minter: `cap = 400M, minted = 400M`. Exhausted. Cannot mint more.
- `totalRegisteredCap = 1B` — the full cap is spoken for: 400M exhausted at
  genesis, 600M mintable only through the RpgfMinter's per-period claims.
- Deployer mint renounced. **No further minter registration is possible.**

### Devnet — `script/Deploy.s.sol`

`Deploy.s.sol` performs the same sequence against a devnet stand-in: it
registers the RpgfMinter at 600M, registers itself with a 400M cap, mints 100M
to its own wallet (founder + supporters stand-in; mainnet splits this into 70M
`FOUNDER_WALLET` + 30M `SUPPORTERS_WALLET`) and 300M to `MockTreasuryMultisig`
(the DAO stand-in), and renounces. The `UsageCounter` it stands up runs the same
nine-period structure as mainnet, compressed — `DESIGNER_REWARDS.md` owns the
schedule and the gates it wires.

---

## Decisions

Each item is a **decision**, not an open question.

1. **Total supply: 1,000,000,000 florins.** Round, memorable.
2. **Founder + supporters + DAO at genesis, no vesting.** See "Rationale" above.
3. **Florin token standard: ERC-20 + EIP-2612 permit.**
4. **No emission contract, no resolution-anchored minting.**
5. **Immutability.** Once deployed, no contract in the florin stack can be
   upgraded, paused, or reconfigured. If any contract is wrong, a new one
   is deployed and the community migrates. There is no admin.

---

This is a design document — not a whitepaper, a pitch deck, or a regulatory
disclosure. The allocation table above is the canonical reference for any
florin-related work in the codebase.

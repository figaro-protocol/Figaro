# The Florin — Design Document

## Status

Implemented. Two contracts:

- `src/florin/FlorinToken.sol` — ERC-20 + EIP-2612 permit, 1B hard cap, minter registry
  with `totalRegisteredCap` enforcement.
- `src/florin/IFlorinMinter.sol` — minimal `mint(address,uint256)` interface, implemented
  by `FlorinToken`.

The RPGF distribution is `src/rpgf/RpgfMinter.sol`, paying from the accrual
`src/protocol/usage/UsageCounter.sol` records on chain as trade happens. Nothing
is posted, bonded, challenged, or adjudicated. Contract surfaces are inventoried
in `docs/CONTRACTS.md`.

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

- **Not a security mechanism.** Cooperation comes from the bonding
  equilibrium, not from token staking or slashing.
- **Not governance.** Minimizing governance is a security property. Every
  governance parameter is an attack surface. The protocol has no admin
  backdoor, no timeout, no arbiter. A governance token would reintroduce
  the discretionary power the protocol was designed to eliminate.
- **Not required for participation.** Gating order creation, bonding, or
  settlement behind a token would reintroduce infrastructure rent. The
  protocol's permissionless nature is load-bearing.
- **Not settlement-anchored emission.** The florin is **not minted on `resolveProcess`**.
  There is no per-settlement reward path.
- **Never market-touched by its issuers.** The market stance is stated indelibly in the
  contract natspec (`src/florin/FlorinToken.sol`): neither the DAO treasury nor the founder
  ever sells, buys, or provides liquidity on any market; the first price is a stranger's to
  name. Strategy: the `project_florin_market_strategy_2026_07` memory (operator-held).

---

## Name

**The florin.** Ticker **FLORIN**, symbol **ƒ** (U+0192).

Figaro is the protocol; the florin is its token. The unit is a **common noun** —
lowercase in prose, natural plural "florins" — because real money is a common
noun with a symbol, not a perpetually-capitalized brand. The teaching sentence:
*"Figaro settles in florins — the unit Florence gave world trade."*

**The rule this name obeys: a token name DENOMINATES, it never DESCRIBES.** A
name that describes the service reads as a substitutable product brand (the
"Filecoin mismatch"). Historical money names come from four sources only —
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
| **DAO**      | **30%** | **300,000,000** | Genesis mint to DAO wallet — **no vesting, no unlock** |
| **RPGF** | **60%** | **600,000,000** | `RpgfMinter` — nine annual accrual periods, budgets grouped into three RISING tranches (15/30/55% at years 2/5/9, equal slices within each; ruled 2026-07-31), claimed pro rata per period by clause authors + assembly designers of record |
| **Total** | **100%** | **1,000,000,000** | |

> **Note on the DAO 300M vs the RPGF 600M.** The DAO's 300M genesis allocation is a one-time treasury grant held by the DAO Safe — the human-judgment layer; the RPGF 600M is minted lazily by per-period usage claims over nine years. Different object, different tier, different mechanism — do not conflate them. (Until the 2026-07-31 schedule reversal, RPGF tranche 1 was ALSO 300M, a coincidence that invited exactly this conflation; the reversed 15/30/55 schedule has no 300M anywhere.)

Founders, supporters, and DAO receive tokens directly to their wallets at deploy time. The
600M mints only through the `RpgfMinter`'s per-tranche claims — the minter
is registered at genesis (before `renounceDeployerMint`, which is why it must
exist at deploy time), capped at exactly 600M by the FlorinToken minter registry.

**DAO governance is NOT kernel governance.** The kernel has no governance and never will —
no admin, no owner, no vote decides a resolution. The DAO governs its own treasury: what
the 300M is spent on — which public goods to fund, which programs to stand up, who gets
paid for what — all by discretionary decision, the human-judgment layer the uniform 600M
RPGF deliberately avoids. Those are two different objects at two different tiers, and collapsing them is the error
this section exists to prevent. A DAO vote can move the DAO's treasury; nothing can move a
bonded commitment except its buyer.

**The DAO can spend its 300M three ways.** Nothing gates which — these are treasury acts,
DAO-decided at any time, nothing hardcoded (ruled 2026-07-17):

1. **Stand up a public-goods program** — fund a grant, a bounty, a commons initiative
   by ordinary token transfer at its own discretion. There is no crowd, donation, or
   match-round mechanism: the DAO decides and pays.
2. **Pay a third party directly** for services rendered — marketing, design, audits,
   anything — as an ordinary token transfer. No protocol involvement, no bond: this is
   trust-based payment, the same as any organisation paying an invoice.
3. **Procure through the protocol as buyer** (below) when the payment should be bonded
   and atomically resolved rather than trusted.

**DAO custody**: the DAO wallet is a **multisig** (mainnet: a canonical Safe instance —
deployment config via `DAO_WALLET`, never authored code). The concrete custody detail —
signer set, threshold, and the founder/supporter wallet addresses — is deployment
configuration and will be disclosed in the deployment record when a public deployment
exists; none is named now because none exists yet, not because any is withheld. *No vault contract exists or is
needed* — custody is composed, not authored. For path 3 the DAO **procures** through a
**per-procurement funded operator-EOA** (it *procures services*; it never buys tokens —
the issuer never touches a market) — the treasury itself can never sign kernel
commitments (the kernel is ECDSA-only), so governance gates the *funding* and the EOA's
blast radius is only ever the current procurement. Devnet rehearses the whole shape:
`Deploy.s.sol` stands up `MockTreasuryMultisig` (anvil-placeholder 2-of-3) as the 300M
mint target, and `test/florin/TreasuryProcurement.t.sol` drives fund → bonded commit →
resolve → sweep-back, asserting the treasury's net spend is exactly the payment.
Threshold-ECDSA (a multisig in cryptography, an EOA on-chain) is the recorded custody
upgrade for the buyer key, rehearsed on testnet before adoption.

### The 600M RPGF allocation

The *intent* of this allocation is unchanged: 60% of the supply is reserved for
the people whose clauses and assemblies broaden the protocol's substrate — clause authors
and assembly designers of record (recipients widened by the 2026-07-09
redesign). The reward was ratified UNIFORM on 2026-07-29 (owner: memory
`project_reward_mechanism_ratified_2026_07`): every clause and assembly earns by its **real
usage alone**, with no category, tag, or weight tilting the split toward any kind
of contribution.

**The mechanism COUNTS USAGE WHEN IT HAPPENS** — `UsageCounter` records each
clause's or assembly's real usage at resolve, permissionlessly, from facts the chain already
holds, and `RpgfMinter.claim` pays **uniform pro rata, no per-wallet cap** from the
period's fixed budget. The MECHANICS — proof shape, the `icbrt(c·d²·1e18)` score,
the two-sided live-ETH-stake gates, and what deliberately does NOT exist (no
posting, no bonds, no challenges, no forum) — are owned by `docs/CONTRACTS.md`
(§ `UsageCounter` / `RpgfMinter`); the stake/value-loop rationale and the honest
Sybil bound by `docs/PUBLIC_GRAPH_MODEL.md` § "What the stake does and does not
do". Neither is restated here. This doc owns the ALLOCATION facts:

- The 600M pool is **fixed** — a farmer only ever dilutes it, never inflates it.
- Accrual buckets into fixed ANNUAL **periods**; a period's counts are final once
  it ends, each period's budget pays for that period alone, and claims never
  expire — a closed period's arithmetic is stable forever.
- Nine annual periods, budgets grouped into three RISING tranches — 15% over years
  1–2, 30% over 3–5, 55% over 6–9, equal slices within each (ruled 2026-07-31: the
  largest share pays on the most-measured evidence; the cold-start years carry the
  smallest budgets, and early evidence-poor funding is the DAO treasury's job).
  Devnet and testnet compress the schedule (time compresses when time is involved;
  ruled 2026-07-15).

The incentive rationale — why the flow-map gets built under a uniform reward — lives in
`docs/PUBLIC_GRAPH_MODEL.md` § "Why the flow-map gets built — the geo/coordination incentive under a uniform reward".

### Rationale

- **No vesting for founders, supporters, or DAO.** The code is already developed.
  Vesting protects investors from founders abandoning a project, but there are no
  investors. Adding a vesting cliff would be theater. The DAO needs its tokens
  at genesis to perform its coordination function from day one.

- **No settlement-anchored emission.** The florin is not minted per settlement. Coupling
  the token to protocol activity invites gaming and complicates the trust surface.

- **No token sale.** The florin is never sold — not in an ICO, IDO, SAFT, or
  presale. There is no investment contract. The founders, supporters, and DAO
  receive their allocations at genesis.

---

## FlorinToken Mechanics

`FlorinToken` (`src/florin/FlorinToken.sol`) is an ERC-20 with EIP-2612 permit
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

The deploy script registers the RPGF minter, mints the founder + supporters + DAO
genesis allocation, then seals minting. `FOUNDER_ALLOC = 70M`,
`SUPPORTERS_ALLOC = 30M`, `DAO_ALLOC = 300M`, `RPGF_ALLOC = 600M`.

```
1. Deploy FlorinToken (deployer becomes the constructor deployer).
2. Deploy UsageCounter (nine annual period ends derived from `RPGF_GENESIS`;
   minimum-support floor `minSellers = 3`), then RpgfMinter over it
   (florin + counter + ClauseRegistry + AssemblyRegistry; per-period budgets
   45M/45M · 60M×3 · 82.5M×4 — the 15/30/55 rising-tranche grouping).
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

On devnet `Deploy.s.sol` stands up the UsageCounter with the same nine-period
schedule as mainnet, compressed to thirty-minute periods (deploy + clause
population alone takes over a minute, and resolve-time usage recording needs
accrual open across a full e2e suite run; nine 30-minute periods give a
4.5-hour accrual life while still letting the rewards spec advance the chain
past a period boundary). The constructor wires the seller-side live-stake gate
(`MembersRegistry`), the clause-or-assembly-side deposit gates (`ClauseRegistry` +
`AssemblyRegistry`), the batch verifier as the proof-gated writer of the
batch-path accrual, the assembly-provenance clause key, the three excluded
protocol-floor clauses (`figaro-commerce`, `figaro-topology`,
`figaro-assembly-provenance` — their count is the process count and carries no
adoption signal), and the minimum-support floor `minSellers = 3` (the mainnet
value, rehearsed on devnet). It then registers the RpgfMinter over it at 600M,
registers itself with a 400M cap, mints 100M to its own wallet (founder +
supporters stand-in; mainnet splits this into 70M FOUNDER_WALLET +
30M SUPPORTERS_WALLET) and 300M to `MockTreasuryMultisig` (DAO stand-in), and
renounces.

---

## Settled decisions

Each item is a **decision**, not an open question.

1. **Total supply: 1,000,000,000 florins.** Round, memorable.
2. **Founder + supporters + DAO at genesis, no vesting.** See "Rationale" above.
3. **Florin token standard: ERC-20 + EIP-2612 permit.**
4. **No emission contract, no settlement-anchored minting.**
5. **RPGF distribution counts usage on chain, as it happens**: the chain cannot
   look backwards, so the fact is recorded when it occurs. Nothing to believe,
   nothing to adjudicate, and no recurring cost to anyone.
6. **Immutability.** Once deployed, no contract in the florin stack can be
   upgraded, paused, or reconfigured. If any contract is wrong, a new one
   is deployed and the community migrates. There is no admin.

---

## What This Document Is Not

This is an internal design record. Not a whitepaper, pitch deck, or
regulatory disclosure. The allocation table above is the canonical reference
for any florin-related work in the codebase.

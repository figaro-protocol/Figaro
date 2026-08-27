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
  name.

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
configuration, disclosed in the deployment record per network
(`deployments/11155111.json` names the Sepolia treasury; the operator EOA and its
delegation in `deployments/dao-operator-delegation.11155111.json`); mainnet's is
named when mainnet deploys, not before — never withheld, just not yet real. *No vault contract exists or is
needed* — custody is composed, not authored. **The DAO meets the ecosystem through ONE
account: its operator EOA, an externally-owned account carrying an EIP-7702 delegation to
governance-controlled code** (ruled 2026-08-18; the same delegation shape
`DESIGN_DECISIONS.md` § key-loss records for any buyer). The delegated code is
**MetaMask Delegation Framework's `EIP7702StatelessDeleGator`** at its canonical CREATE2
address `0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B` (v1.3.0; ruled 2026-08-19 —
audited, off-the-shelf, the SAME address on Sepolia and mainnet, so the testnet
rehearses mainnet literally; `DelegationManager`
`0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3`): the multisig's authority
is an ERC-7710 delegation the operator grants it, bounded by caveat enforcers, redeemed
through the framework's `DelegationManager` to act from the operator's address. The treasury contract itself can
never sign kernel commitments (the kernel is ECDSA-only), so the multisig authorises
*upstream* — it funds the operator per procurement, and through the delegated code it can
act from the operator's address for `msg.sender`-authorised calls (resolution, recovery)
and bound what the operator may do — while the operator's own key produces the EIP-712
signatures. That operator EOA is the DAO's identity in every registry and every deal: it
holds the DAO's member profile (buyer side and, when the DAO sells — merchandise, tickets,
its co-produced data — seller side), it is the buyer of record when the DAO **procures**
through the protocol (path 3: it *procures services*; the issuer never buys tokens or
touches a market), and its blast radius is bounded by the delegation and by per-procurement
funding. Devnet rehearses the shape: `Deploy.s.sol` stands up `MockTreasuryMultisig`
(anvil-placeholder 2-of-3) as the 300M mint target, and `test/florin/TreasuryProcurement.t.sol`
drives fund → bonded commit → resolve → sweep-back, asserting the treasury's net spend is
exactly the payment. Threshold-ECDSA (a multisig in cryptography, an EOA on-chain) is the
recorded custody upgrade for the operator's key, rehearsed on testnet before adoption. On
Sepolia the operator EOA and its delegation are created BEFORE the DAO's member profile is
registered under it (`RELEASE_READINESS.md` Task 13 rules the ordering); the vault address
itself holds no profile.

### The DAO's income — the endowment logic (ruled 2026-08-13)

The 300M is a grant; the DAO's LIVING is earned. This section states the
design — never discovered arithmetic: the qualitative structure below carries
no projected yield, no break-even model, no income forecast, and none should
ever be added. The mechanism has been live since the 2026-08-19 Sepolia
redeploy: the DAO Safe registered exactly the mandatory clauses, from its own
balance.

**The levy.** The DAO Safe is author-of-record of the two *scoring* mandatory
clauses — `figaro-commerce` and `figaro-topology` — plus any clause DONATED to
it (donation = registering a clause key under the Safe: permissionless,
irreversible, first-write-wins; competing under one's own wallet is equally
welcome). Every settled process composes the mandatory clauses, so their usage
accrues RPGF to the DAO the way any author's clauses accrue: **the commons
taxing its own unavoidable usage into the commons pot**. This is NOT a
protocol fee and NOT a privileged weight — the levy rides the uniform meter
(`icbrt(c·d²·1e18)`, the 2026-07-29 ratification untouched); "mandatory" is a
registration-layer convention, nothing on-chain.

**Countercyclical by construction.** Each period's budget divides pro rata
over every clause and assembly that scored. In a world where third-party
authorship thrives, the mandatory clauses' share is automatically diluted —
and little DAO funding is needed, because the ecosystem is flourishing. In a
world where little else emerged, the mandatory clauses dominate the period's
score and the endowment income is large — exactly the world where the commons
still needs the DAO. The sizing is automatic: no parameter, no vote, no one to
lobby.

**Beyond the sunset.** The RPGF budgets end after the nine periods. What
continues commons funding afterward is the accumulated levy income plus
whatever remains of the 300M — an endowment, not an annuity.

**Alignment is the interest structure, not a spending rule.** DAO discretion
is unrestricted — public goods and private goods both (the three spend paths
above, unchanged). What aligns the DAO with the network is where its income
originates: the levy pays only when the network is used, so the DAO's interest
IS network usage. No spending covenant could add to that, and none exists.

**The mortality doctrine.** The DAO's life IS its treasury. When it runs dry,
governance exits to the community: donations sustain it if the community wants
it sustained; otherwise it dies. There is no self-perpetuation right — no fee
switch to flip, no levy it can raise, no protocol lever reachable by a DAO
vote (the kernel-governance section above is absolute).

**The boundary — the meter earns nothing.** `figaro-assembly-provenance`, the
third mandatory clause, stays the ONE entry on the exclusion list. The line is
TERMS vs METER: commerce and topology are contract *terms* parties agree to,
and mandatory term levies are disciplined by runtime competition — a runtime
that piles on levy clauses loses its users, which also answers how many levy
lines the commons may hold: as many as survive that competition. The
provenance leaf is the reward system's own attribution plumbing — structurally
singular, no competing runtime to exit to — so a levy on it would be the meter
charging for reading itself. It meters; it never earns.

Academic form: `/papers/substrate-broadening-rpgf` §4 ("Why the clauses every
order carries earn"). On-chain surface: `CONTRACTS.md` § RPGF (the one-entry
exclusion list, `RpgfMinter._isAuthor` reading `registeredBy`).

### The 600M RPGF allocation

The *intent* of this allocation is unchanged: 60% of the supply is reserved for
the people whose clauses and assemblies broaden the protocol's substrate — clause authors
and assembly designers of record (recipients widened by the 2026-07-09
redesign). The reward was ratified UNIFORM on 2026-07-29 (contract surface:
`CONTRACTS.md` § RPGF): every clause and assembly earns by its **real
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
  Devnet compresses the schedule to thirty-minute periods (time compresses when
  time is involved; ruled 2026-07-15). PUBLIC deployments — Sepolia included — run
  the REAL annual schedule: the testnet weekly compression was reverted before the
  2026-08-14 Sepolia broadcast (the testnet is the full-dress rehearsal for
  mainnet and runs mainnet's real schedule; `script/DeploySepolia.s.sol` documents it).

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
batch-path accrual, the assembly-provenance clause key, the single exclusion
(`figaro-assembly-provenance` — attribution plumbing, whose designers accrue via
`recordAssemblyUsage` instead; the mandatory clauses EARN, ruled 2026-08-13,
mirroring `DeployMainnet`), and the minimum-support floor `minSellers = 3` (the mainnet
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
7. **The DAO earns its living and can die** (ruled 2026-08-13): the mandatory
   clauses score for the DAO as author-of-record on the uniform meter (the
   endowment logic above); provenance — the meter itself — stays the one
   exclusion; when the treasury runs dry, governance exits to the community.

---

## What This Document Is Not

This is a design record. Not a whitepaper, pitch deck, or
regulatory disclosure. The allocation table above is the canonical reference
for any florin-related work in the codebase.

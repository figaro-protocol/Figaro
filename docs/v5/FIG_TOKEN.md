# FIG Token — Design Document

## Status

Implemented. Three contracts:

- `src/fig/FigToken.sol` — ERC-20 + EIP-2612 permit, 1B hard cap, minter registry
  with `totalRegisteredCap` enforcement.
- `src/fig/RpgfMinter.sol` — three-stage SP1-gated minter for the
  clause-author RPGF (year 2 / year 5 / year 9). Per-tranche Merkle
  root submitted at tranche time; the SP1 proof attests that the
  aggregation formula was applied correctly to the event stream the
  submitter supplied — it does not attest that that stream mirrors
  chain history, which is a trusted-submitter assumption. Aggregation
  logic in `prover/rpgf/` (Rust).
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
| **RPGF — Year 2** | 30% | 300,000,000 | Clause-author RPGF, unlocks at year 2 |
| **RPGF — Year 5** | 20% | 200,000,000 | Clause-author RPGF, unlocks at year 5 |
| **RPGF — Year 9** | 10% | 100,000,000 | Clause-author RPGF, unlocks at year 9 |
| **Total** | **100%** | **1,000,000,000** | |

Founders and DAO receive tokens directly to their wallets at deploy time.
The community airdrop is a single `RpgfMinter` contract with three immutable
unlock timestamps. Per-tranche Merkle roots are NOT baked at deploy — they
are submitted at tranche time by a sequencer. The accompanying SP1 proof
attests that the clause-author substrate-broadening aggregation formula
was applied correctly to the event stream the sequencer supplied; it does
not attest that that stream faithfully mirrors chain history — the
sequencer is trusted for input provenance. See `prover/rpgf/` (Rust
aggregator) and `prover/rpgf-script/` (host-side SP1 wrapper) for the
off-chain pieces.

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

## The Substrate-Broadening Formula

The three RPGF tranches reserve FIG for clause authors — but the allocation
table does not say *which* authors, or *how much* each receives. That is decided
by the **substrate-broadening formula**, implemented canonically in
`prover/rpgf/` (Rust, compiled into the SP1 program) and mirrored by
`sdk/scripts/rpgf-simulator/` (TypeScript conformance spec). The SP1 proof that
gates `RpgfMinter.submitRoot` attests this formula was applied correctly to the
event window the sequencer supplied — not that the window mirrors chain history
(see the trusted-submitter note above).

**Recipient.** A clause's allocation goes to its `clauseAuthor` — the
first-write-wins wallet that registered the clause on `ClauseRegistry`. One
clause, one recipient. There is no per-attestation, per-seller, or
per-settlement reward path anywhere in the system.

**What is measured.** Per tranche, the aggregator builds one snapshot per clause
from a window of on-chain events, under a **resolved-only filter**: an
attestation counts only if its order belongs to a process that has resolved.
Work that never settles earns nothing; a clause with no resolved attestations in
the window receives zero by absence.

**The score.** Each clause is scored:

```
score = w_tier1 × processCount^α × pairs^(1 − α)        α = 33/100
```

- `processCount` — distinct resolved processes the clause appeared in.
- `pairs` — distinct buyer↔seller pairs that used it.
- The exponent split (α = 0.33) weights **counterparty diversity** (`pairs`)
  above raw `processCount`: a clause adopted across many distinct relationships
  broadens the protocol's substrate more than one used heavily between the same
  two parties. A clause with zero processes or zero pairs scores zero.

**The tier-1 weight** (`w_tier1`, range 1.0–5.0) adds two dimensions —
`w = 1 + (w_category − 1) + (w_topology − 1)`:

- `w_category` — `3.0` for tier-1 category clauses (the coordination family and
  `figaro-geo-v2`, hard-coded at deploy), `1.0` otherwise.
- `w_topology` — the clause's mean chain position over the window, clamped to
  `[1.0, 3.0]`; clauses used deeper in process chains weigh more.

**Why the `w_category` boost exists.** It is a deliberate incentive, not a
privileged class of authors: it rewards the *category of work* — geo/coordination
clauses — that produces the public physical/virtual-flow graph the must-have clauses
(core + topology + commerce) cannot, and whose existence dissolves platform
value-capture. Removing it on "a privileged category contradicts open-world
neutrality" is the neutrality ≠ flat-weighting error. Full rationale + the
anti-platform objective: `docs/v5/PUBLIC_GRAPH_MODEL.md` § "Why the
substrate-broadening weight exists". Enforced by
`scripts/lint-substrate-broadening-weight.sh`.

**Value is deliberately excluded.** Payment and bond size do not enter the
formula. The protocol's cost to move one unit equals its cost to move a
trillion; weighting by value would import a TradFi "TVL matters" metric the
coordination layer rejects.

**Scores to FIG.** Scores become pro-rata shares of the tranche budget. A
**15% per-author cap** is then enforced by iterative water-filling — any share
above the cap is truncated and its excess redistributed pro-rata across
under-cap shares, iterated to a fixpoint — so no author can take more than 15%
of a single tranche. Capped shares scale to FIG amounts; the
`(clauseAuthor, amount)` pairs form the Merkle tree whose root `submitRoot`
records.

**The formula is frozen.** `α = 33/100`, the `15/100` cap, and the tier-1
category set are deploy-time constants. The SP1 program commits to this one
formula and applies it unchanged across all three tranches (years 2 / 5 / 9).
Changing it would require deploying a new FIG system — the minter is sealed by
`renounceDeployerMint`.

---

## Deployment Flow (`DeployMainnet.s.sol`)

The deploy script is a single transaction bundle that permanently seals
minting at the canonical 1B cap:

```
1. Deploy FigToken (deployer becomes the constructor deployer).
2. Deploy RpgfMinter with (SP1 verifier, programVKey, submitter, 3 unlock timestamps). Roots are NOT baked at deploy — they are submitted at tranche time.
3. Register the deployer as a one-shot genesis minter with cap 400M.
4. fig.mint(founderWallet, 100M)     — founder genesis mint.
5. fig.mint(daoWallet, 300M)         — DAO genesis mint.
6. Register RpgfMinter as a minter with cap 600M.
7. fig.renounceDeployerMint()        — permanent. No new minters. Deployer can never mint again.
```

After step 7:

- Deployer minter: `cap = 400M, minted = 400M`. Exhausted. Cannot mint more.
- RpgfMinter minter: `cap = 600M, minted = 0`. Drains only through valid merkle claims against sequencer-submitted, SP1-proved per-tranche roots.
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

A claim transaction on `RpgfMinter` specifies:

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

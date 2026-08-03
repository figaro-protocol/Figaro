# Figaro Protocol — Design Decisions

This document records intentional design choices that may appear as
vulnerabilities or omissions to a reviewer unfamiliar with the protocol's
architecture. Each entry states the pattern, why it looks wrong, and why it
is correct.

The intended audience is an external security auditor. Reading this document
before reviewing the code will prevent the most common false-positive findings.

---

## 1. Resolved processId is permanently closed

**Pattern**: `resolveProcess()` sets `ps.activeOrderCount = 0`. Any
subsequent `commit()` targeting that same `processId` reverts with
`ProcessAlreadyResolved`. The `ProcessState` struct is not deleted —
`rootBuyer`, `currency`, and `cumulativeValue` persist — but the gate at
the top of the sub-order branch refuses extension.

**Why it looks like overhead**: A reviewer trained on permissionless
substrate design might expect a closure-less model, where bilateral
signatures alone gate extension. "If both parties want a follow-on round,
let them sign one against the same processId" sounds protocol-aligned.

**Why the gate is correct**: Each bonded process is a transaction-scoped
institution that dissolves at settlement (CLAUDE.md). The closure is the
*dissolution*. Parties wanting a follow-on bonded relationship sign a
fresh root commitment, getting a new `processId`; cross-process
composition (a sub-order in process A roots process B) carries the
"this is a continuation" semantic at the assembly layer, not the kernel.

The gate is implemented in the minimum-possible form: a single comparison
against the existing `activeOrderCount` field, which `resolveProcess`
already maintains. There is no new lifecycle enum, no `finalized` flag,
no additional storage. The closure semantic is derived from data the
kernel already keeps. This is invariant enforcement using existing state,
not a state machine added on top.

**The kernel's overall design philosophy**: bilateral EIP-712 signatures
are the principal enforcement mechanism, and the kernel deliberately
avoids state that signatures alone could enforce. This entry is the one
place where state-based enforcement is justified: the bond-locking and
cumulative-value invariants tie the process together as a single
institution, and that institution's lifetime is finite. Reopening would
require the cumulative-value accumulator to reset, which would break the
cumulative-upstream-bonding property for any new orders.

---

## 2. Seller of order X can attest against order Y in the same process

**Pattern**: `AttestationCoordinator.attestAsSeller` allows cross-order
attestation. A seller who holds any committed order in process P can attest
against any other order in process P, even if that order has a different seller.

**Why it looks wrong**: Standard access control would require the attester to
be the seller of the specific order being attested.

**Why it is correct**: The `Attestation` event always records `attester =
msg.sender` truthfully. There is no identity forgery. Off-chain indexers
consuming the event can always determine who attested and compare that against
the on-chain commitment record for the target order.

Enforcing "attester must be seller of this specific order" on-chain would
require storing per-order seller data — state the kernel explicitly avoids.
The on-chain gate correctly answers "is this a process participant?"; the
semantic question "does this attester have authority over this order?" is
answered off-chain by indexing commitment events.

---

## 3. Buyer and seller can be the same address

**Pattern**: `commit()` does not check `c.buyer != c.seller`.

**Why it looks wrong**: Self-dealing is a common attack vector in protocols
where buyer and seller roles carry different privileges.

**Why it is correct**: If buyer equals seller, the same address deposits both
the buyer bond (`2 × payment`) and the seller bond (`2 × cumulativeValue`)
and receives both payouts at resolution. The bond math balances identically.
No tokens are created, destroyed, or transferred to a third party.

Allowing this is consistent with the permissionless, no-role-separation
design. Both parties must sign — if a single key signs both sides, that
is a choice, not an exploit.

---

## 4. No owner, no admin, no escape hatch — by design

**Pattern**: FigaroCore, AttestationCoordinator, ClauseRegistry,
MembersRegistry, and AssemblyRegistry have no owner, no
pause function, no upgrade path, and no admin recovery. FlorinToken has a one-shot
deployer who registers minter contracts then renounces (`deployerMintRenounced`)
— a bounded privileged actor, documented separately in `CONTRACTS.md`.

**Why it looks wrong**: Most protocols include emergency controls for incident
response.

**Why it is correct**: The protocol's core property is self-enforcement between
strangers. An admin escape hatch is a trusted third party by another name. The
absence of admin controls is not an omission — it is the mechanism. The six
properties (asymmetric bonding, cumulative upstream bonding, buyer dominance,
atomic resolution, immutable evidence, no escape hatches) are mutually
reinforcing. Removing any one of them degrades the Nash equilibrium.

If a contract is deployed with a bug, a new version is deployed. Immutability
is the safety guarantee, not a liability.

---

## 5. Buyer key loss permanently locks bonds — by design

**Pattern**: If the root buyer loses their private key, the process cannot be
resolved and all bonds are permanently locked. There is no timeout, no
recovery path, no admin override.

**Why it looks wrong**: Most protocols include a timeout or fallback for
stuck funds.

**Why it is correct**: A timeout path is an escape hatch. An escape hatch
breaks buyer dominance. Breaking buyer dominance breaks the MAD equilibrium
(if the seller knows the buyer can be timed out, withholding cooperation
becomes a viable strategy).

**The mitigation matches the kernel** (ruled 2026-07-14): the kernel verifies
both parties by ECDSA recovery alone (`FigaroCore.sol:161-165`), so a contract
wallet — multi-sig, ERC-1271 smart account — can never hold the buyer role,
and the frozen kernel forecloses adding contract-signature support. The live
mitigation is **pre-installed EIP-7702 delegation**: before committing, the
buyer sets a delegation (carrying its own guardian/recovery authorization) on
the buyer EOA. `resolveProcess` authorizes by `msg.sender`
(`FigaroCore.sol:267`), so after key loss the delegated code can still
originate the resolve call from the buyer's address — every active process
remains settleable and no bond is stranded. New commitments are not rescuable:
each requires a fresh EIP-712 ECDSA signature from the lost key. The
delegation must be installed while the key is still held; it cannot be added
after loss.

(The kernel natspec at `FigaroCore.sol:238-240` still says "use social
recovery or multi-sig for the buyer role" — a stale comment on a frozen
contract, contradicted by its own ECDSA-only verification; recorded for
auditor handover, never edited.)

---

## 6. `prevrandao` is not used as a salt — by design

**Pattern**: The `salt` field in the `Commitment` struct is party-chosen and
not seeded from `block.prevrandao` (formerly `block.difficulty`).

**Why it looks wrong**: On-chain entropy sources like `prevrandao` are
sometimes used to prevent replay or ensure uniqueness.

**Why it is correct**: Under Ethereum's PoS consensus, validators know their
assigned `prevrandao` values up to one epoch in advance. Using `prevrandao`
as a salt would introduce a partial-predictability vector for validator-MEV.

The party-chosen `salt`, signed by both buyer and seller in the EIP-712
commitment, is sufficient. If both parties sign the same salt twice (same
commitment submitted a second time), `DuplicateCommitment` reverts it. The
salt does not need to be unpredictable — it only needs to distinguish two
separate agreements between the same parties with the same terms.

---

## 7. Attestations are confined to active orders — the evidence window closes at resolve

**Pattern**: `AttestationCoordinator._requireKnownCommitment` reverts with
`OrderResolved` for orders with `orderStatus == 2` (resolved); only
`orderStatus == 1` (committed, active) orders are attestable.

**Why it looks wrong**: Post-settlement evidence (a warranty claim, a late
temperature-record download) looks legitimate, so rejecting it looks like
data loss.

**Why it is correct**: A bonded process is a transaction-scoped institution
and `resolveProcess` dissolves it. Attestation is runtime evidence *within*
that open institution — letting the merkle-bound evidence stream continue
after atomic settlement would dilute the finality the resolve mechanism is
designed to produce. Post-settlement claims belong to off-chain forums, which
receive the resolved process's complete, closed evidentiary record as input.
(An earlier revision permitted post-resolve attestation; that was closed-world
residue — closed by operator ruling, 2026-07-10.)

---

## 8. ClauseRegistry is fully permissionless

**Pattern**: Anyone can call `registerClause` with any `clauseId`, `version`,
`contentHash`, and `contentURI`, staking the fixed `registrationDeposit`
(ETH, immutable at deploy). There is no approval and no identity check.
First write wins per `(clauseId, version)` (`AlreadyRegistered` revert) and
the binding is permanent — `withdrawDeposit` returns the stake without
clearing it; readers de-surface a withdrawn clause for new compositions.

**Why it looks wrong**: Permissionless registration enables namespace
squatting and spam. The clause names are public, human-readable strings, so
a squatter can register a well-known name (or the next version of one)
before its author does — nothing about the id is secret.

**Why it is correct**: Nothing that settles trusts the registry's binding.
Integrity routes through `agreementHash` and `contentHash`, never through
the registry: an agreement merkle-commits the clause CONTENT under the hash
both parties sign, and every consumer of a registry entry fetches the spec
from `contentURI` and verifies its bytes against the anchored `contentHash`
before trusting a field. A squatted or garbage entry can therefore pollute
DISCOVERY only — it cannot alter, impersonate, or invalidate any commitment,
attestation, or settlement. The staked-intent deposit prices that pollution
in deposit × time-surfaced, and the permanent binding means a squatter buys
one dead `(name, version)` slot, not the name: honest authors register the
next version.

Clause governance — which clauses are authoritative — is a convention-layer
concern resolved off-chain, consistent with the event-sourced architecture.

**RPGF escalation, accepted (audit 2026-08-01, finding H-2; ruled 2026-08-01):**
once RPGF pays authors, registry authorship is also the reward PAYEE key
(`RpgfMinter._isAuthor`), so a front-runner who copies an in-flight registration
captures its future reward, not just a discovery slot. This was weighed and the
first-write-wins design KEPT, for two reasons. First, the shared flat clause
namespace IS the coordination commons — namespacing ids under the author address
(the structural fix) would fragment it, and signature-based authorship breaks the
author-is-staker assumption the reward's live-stake gate rests on. Second, reward
follows real USAGE (network truth): a squatted key earns nothing unless the
ecosystem actually composes it, which the squatter cannot force, and the deposit
still prices the attempt. The reactive-front-run window is already minimal —
registration pins the spec to the author's OWN node and registers in one atomic UI
action, so nothing is publicly observable before the register tx hits the mempool.
The residual (mempool front-run of that tx; proactive squatting of a guessable
name) is the accepted, deposit-priced cost. Assemblies are unaffected — their id is
content-derived, not a guessable name. Revisit only if reward-capture griefing is
observed in the wild; the fallback is commit-reveal on `AssemblyRegistry` alone.

---

## 9. RETIRED — DutchAuction (contract deleted 2026-07-02)

**Was**: "DutchAuction holds no funds and enforces no role separation" — the
auction creator could claim their own auction; the contract held no tokens.

**Retirement**: competitive pricing was abandoned. A mid-chain order whose
price or counterparty is unknown at signing is structurally incompatible with
the kernel's exact-match cumulative accumulator (`expectedCumulativeValue`),
and the V3-era workaround (the market contract standing in as the kernel
seller, bonds borrowed from a float vault) is banned three ways in V5:
ECDSA-only parties, no bond lending, no custody. Pricing is a catalogue
concern (e.g. rate × geohash distance). The number is kept so the pattern
count and cross-references stay stable.

---

## 10. `_pullExact` rejects fee-on-transfer and rebasing tokens — permanently

**Pattern**: `_pullExact` uses a before/after balance check with strict equality.
Any token that transfers less than requested (fee-on-transfer) or changes
balance mid-call (rebasing) is permanently incompatible.

**Why it looks correct and IS correct**: The MAD bonding model requires that
the exact committed amount is locked. If the received amount differs from the
committed amount, the bond math is broken. Rejection is the correct behavior.
Wrapped, non-rebasing variants (e.g., wstETH instead of stETH) must be used.

---

## 11. Single currency per process — multi-token is a composition concern

**Pattern**: `commit` binds every order in a process to one `currency` address;
sub-orders with a mismatched currency revert (`CurrencyMismatch`). Two parties
cannot buy and sell in different tokens within the same process.

**Why it looks correct and IS correct**: The 2:1 asymmetric bond ratio is
Nash-stable from chain state alone — no oracle, no DEX dependency, no pre-agreed
FX rate. Mixing currencies within one process would require all three to compare
"buyer bond" against "seller bond" at settlement, and each reintroduces a
discretionary actor (oracle seller, DEX router, a counterparty picking the
rate). Kernel-level single-currency binding is precisely what preserves
trust-minimization.

**The composition patterns** (no kernel change required):

1. **Process-DAG composition.** A "single transaction with N vendors in N
   currencies" is N independent monotoken processes, one per vendor relationship,
   each in the vendor's preferred token. The kernel sees N bonded handshakes; the
   UI or wallet correlates them. Closer in spirit to "every participant is an
   independent value-adder." Buyer holds each currency or swaps upstream.

2. **Wallet-side atomic swap → monotoken commit.** Buyer holds DAI, vendor wants
   USDC. The wallet performs a DEX swap, then calls `commit` with USDC in the
   same transaction. Kernel sees one clean commitment; slippage is absorbed
   pre-bond. Modern wallets (Rabby, MetaMask Swap, Rainbow) do this natively.
   The shipped form of this pattern is `WitnessSwapAndCommitCoordinator`
   (`CONTRACTS.md`): the swap route is bound into the party's Permit2 witness
   signature, the coordinator funds the party in-place, and the kernel pulls
   the bond as always — still one monotoken process.

3. **Level-3 atomic bundler mechanism.** When all-or-nothing semantics is needed
   across N differently-denominated vendor processes, a Level-3 composition contract
   can orchestrate N monotoken commits as a wallet-bundled group with
   revert-on-any-fail. Kernel still sees N independent monotoken processes.

Do not propose adding oracles, DEX routers, or "multi-currency bonds" to
FigaroCore. The perceived limitation is a misframing — point inquirers at the
three composition patterns above.

---

## 12. No MLETR-style transferable records — by design

**Pattern**: Figaro's audit bundle assembles a Bill-of-Lading view (and
contract-of-carriage, invoice, and stage-progression views) from the
clauses committed at order signing, but exposes no `transferTitle`,
`endorse`, `nominate`, or `surrender` operation. Once an order is
committed, neither the buyer nor the seller can be substituted; the
right-to-claim does not transfer between addresses during the order's
lifetime. An auditor familiar with the UNCITRAL Model Law on Electronic
Transferable Records (MLETR) and the TitleEscrow pattern in TradeTrust /
ERC-721 transfer pattern in CargoX will look for the equivalent and find
nothing.

**Why it looks wrong**: Industry-standard electronic Bills of Lading are
*negotiable* by construction — the right-to-claim transfers with possession
of the document, in the same way a paper BoL transfers by physical
endorsement. TradeTrust implements this via TitleEscrow's holder /
beneficiary split with a two-step `nominate` + `transferBeneficiary`
endorsement; CargoX implements it via direct ERC-721 token transfer;
TradeLens implemented it via consortium-mediated record updates. Three
production protocols — and the legal framework all three align to —
treat transferability as load-bearing. Figaro's absence of any
equivalent mechanism appears to be a missing feature.

**Why it is correct**: Three independent kernel properties each
separately rule transferability out:

1. **Single-buyer invariant**. A Figaro process has one buyer at
   the root, and every order in the DAG carries that same buyer on its
   buyer side. There is no kernel mechanism to fork the buyer (creating
   two buyer-roots) or substitute the buyer (changing the orderHash). A
   "transfer of buyer-side title" mid-process has no representation in the
   `processes` mapping.

2. **Parties fixed at `commit`**. Both buyer and seller addresses are
   bound into the EIP-712 `Commitment` struct that produces the
   `orderHash`. The hash is the order's identity; changing either party
   changes the hash, which is by definition a different order. There
   cannot be a `transferBuyer` or `transferSeller` function without
   changing what an `orderHash` means.

3. **No escape hatches** (the Escape-Hatch Weakness theorem, /papers/asymmetric-bonding §4.3). A transfer mechanism
   requires authorization for the substitution. In TradeTrust this is
   the holder's `transferBeneficiary` endorsement; in CargoX it is the
   holder's signature on the ERC-721 transfer. In Figaro terms, the
   authorizer is a third party J ∉ {B, S} relative to the *new*
   bilateral relationship between the new buyer and the existing seller
   — exactly the unbonded actor the Escape-Hatch Weakness theorem forbids. Even if J equals
   the original buyer, J's incentive structure no longer binds the new
   relationship.

Adding transferability would require either (a) abandoning the
single-buyer invariant, which invalidates the asymmetric-bonding
derivation since cumulative-value math depends on a
fixed root buyer, or (b) introducing a J ∉ {B, S} authorization path,
which weakens the Nash equilibrium that makes the bonded commitment
work. Neither is acceptable.

The framing is the same kind of structural choice as Bitcoin's
non-reversibility relative to fiat clearing: a substrate that does
less, on purpose, so the less it does is unconditional. **Cargo does
not carry rights in Figaro; the *commitment* carries rights.** When the
cargo needs to carry rights — in trade finance with bank-as-temporary-
holder, cargo resale in transit, negotiable warehouse receipts — Figaro
is the wrong tool, by design.

See `docs/BOL_RESEARCH.md` for the full comparison against CargoX,
TradeTrust, MLETR, and TradeLens, including the field-level mapping of
what *is* expressible (non-negotiable BoLs in any DAG the buyer commits
upfront, including multi-leg supply-chain carriage) and what is closed
off. Its canonical header settles the question this entry records: the
kernel forbids mid-flight resale — a structural property, not a parked
design.

---

## 13. `deadline` is not auction residue and not redundant with `salt`

**Pattern**: The `Commitment` struct carries both a `salt` and a `deadline`;
`commit` rejects expired commitments (`DeadlineExpired`,
`FigaroCore.sol:153`) and nothing else in the kernel reads the field.

**Why it looks wrong**: `salt` already appears to "secure" the commitment,
so `deadline` reads as leftover plumbing — plausibly from the deleted
DutchAuction (it wasn't: V3's core, which lived alongside the original
auction, had no deadline; the field arrived with the V5 baseline).

**Why it is correct**: the two fields answer different attacks. `salt` is
IDENTITY — it makes two otherwise-identical orders hash differently, and
provides no time-bounding at all. `deadline` is EXPIRY of the
UNCONSUMMATED dual-signature window: signing and committing are two steps
with real latency between them (share → counter-sign → commit), a
signature cannot be revoked (no cancel — revocation is escape-hatch
machinery), so without a deadline every signed-but-never-committed order
is a perpetual option on the signer's funds, exercisable whenever standing
allowances permit. The deadline makes stale signatures die on their own —
the only passive protection a no-cancel kernel can offer. Doctrinal check:
it gates ENTRY only; nothing expires post-commit (bonds have no timeout),
so it is the mirror image of an escape hatch, not an instance of one.
Questioned and ruled KEEP 2026-07-02.

---

## 14. Committed `lineItems.name` and `cargo.marks` are public — accepted

**Pattern**: `figaro-commerce.lineItems[].name` (and free-text `figaro-cargo.marks`)
are committed public fields, so a wallet's purchase content is publicly linkable to
that wallet in an immutable, IPFS-pinned agreement. There is no hash-only line-item
variant.

**Why it looks wrong**: sensitive purchase categories leak by design; a privacy
audit reads this as a GDPR-shaped defect next to the ECDH address channel, which
keeps its plaintext off-chain.

**Why it is correct**: the public/confidential boundary rule
(`ARCHITECTURE.md` § "The other boundary") puts a datum on the committed side iff
the mechanism needs it beyond the two endpoints — and line items are exactly that:
invoices and audit documents derive from them, disputes verify against them, and
bond/price checks read them. Mitigation is compositional, not mechanical: item
*names* are the seller's catalogue authoring choice, so a discreet catalogue names
discreetly ("item #123" — `itemId` is already committed alongside), and `marks`
follows bill-of-lading practice (reference codes, never personal names — the spec
description says so). Pseudonymity of the wallet does the rest. Ruled ACCEPT
2026-07-21 (public/confidential boundary audit).

---

## 15. `MembersRegistry` time-locks a requested withdrawal — that ETH is not stuck

**Pattern**: `requestWithdrawal()` clears the registration guard and schedules the
deposit; the ETH itself is only claimable via `withdraw()` once the immutable
`withdrawalCooldown` has elapsed. Between the two calls the contract holds ETH that
its owner has explicitly asked for and cannot yet take. There is no admin path, no
early release, and no way for anyone — including the depositor — to shorten it.

**Why it looks wrong**: it reads as two separate red flags. First, held funds with a
timer look like §5's stuck-fund shape, and this file is emphatic that the kernel has
no time locks. Second, a mandatory waiting period on someone's own capital looks like
the "escape hatch in reverse" — a protocol asserting custody it has no business
asserting.

**Why it is correct**: the tier is the whole answer. **This is the PROTOCOL tier, not
the kernel** — `LEXICON.md`'s grid places all three registries there, and the
no-time-lock rule is a *kernel* law about bonded commitments, where any timer would
hand a party a unilateral exit and break the MAD equilibrium. Nothing here touches a
bond, a commitment, or a settlement. Citing the kernel rule at this contract is the
Folding error.

What the cooldown does is make the deposit *mean* something. Withdrawal used to be a
single call that cleared the guard and paid out at once, which made one deposit
recyclable through identity after identity: register → transact → withdraw →
re-register from a fresh address. The capital cost of sustaining N fabricated
identities was therefore `deposit`, not `N · deposit` — O(1) no matter how much
breadth was manufactured. Since the RPGF reward counts distinct LIVE-STAKED SELLERS
(ruled 2026-07-31 — the pair statistic it replaced could not be priced at all, the buyer
side holding no stake) and **no scoring shape can distinguish a fabricated counterparty
from a genuine one**, the
identity stake is the only place Sybil resistance can live — and an instantly
recyclable stake is not a stake. With the cooldown, sustaining N identities across a
reward period `P` costs `deposit · N · T / P`.

The funds are not stuck, on any reading:
- **Bounded and known.** `withdrawalCooldown` is an immutable constructor parameter,
  readable on-chain before anyone deposits. Nobody is surprised by it.
- **Unconditionally claimable.** After `releaseAt`, `withdraw()` succeeds with no
  counterparty, no signature, and no cooperation required. The fuzz test
  `everyDepositIsEventuallyClaimable` asserts exactly this across arbitrary
  deposit/cooldown pairs, and that the contract ends at zero balance.
- **Not a lock on participation.** De-surfacing is immediate, and so is
  re-registration — coming back needs a *second* deposit, which is the point. The
  member is never held on a surface they asked to leave, so discovery removal and
  erasure of the published declaration are unaffected.

**Scope**: `MembersRegistry` only. `ClauseRegistry` and `AssemblyRegistry` deliberately
have no cooldown and need none — their withdrawal is one-shot per key and the key's
binding is permanent, so there is nothing to recycle. Ruled ACCEPT 2026-07-30, with
the operator's framing: "no rage quitting."

---

## 16. `UsageCounter.applyBatchAccrual` has one privileged caller — a proof-gated writer, not an admin

**Pattern**: every other write in the protocol is permissionless. This one is
not: `applyBatchAccrual` reverts unless `msg.sender == batchVerifier`, an
address fixed at construction. A reviewer scanning for authority patterns
finds a single hard-coded writer on a contract that governs a 600M-token
distribution.

**Why it looks wrong**: "no owner, no admin" is stated everywhere in this
codebase, and a lone privileged caller on the reward path is exactly the shape
an admin backdoor takes. The natural next question — can that address mint,
re-weight, or seize? — is the right question to ask.

**Why it is correct**: the verifier has **no discretion**. It may call this
function only with numbers an SP1 proof committed under an IMMUTABLE
verification key, against a state root that advances by that same proof. It
cannot choose the accrual, cannot invent a process, cannot write twice for the
same trade (the guest's counted set rides the batch state root, so idempotence
holds across batches), and cannot be repointed — `batchVerifier` is
`immutable` and no setter exists. What it can do is exactly what the direct
path lets *anyone* do permissionlessly: present proof that settled trade used
an artifact.

The distinction that matters is **discretion, not permission**. An admin
function is one whose outcome depends on who calls it. This one's outcome
depends only on what the proof says; the caller is a courier. The reason it
needs a named caller at all is that the accrual is proved OFF-chain — which is
the entire point, since ~85% of a direct record's gas is storage plus `icbrt`
— so the fact cannot be re-derived from calldata here. The contract trusts the
vkey, and a named caller is how a vkey's authority reaches storage.

**What the counter still enforces itself**, because the proof cannot see live
chain state: the open period, each seller's live `MembersRegistry` stake, and
the excluded-artifact set. The verifier deliberately checks none of these — it
owns the proof, the counter owns the reward's gates.

**Blast radius if the vkey were wrong**: a bad program could inflate
batch-path accrual for artifacts of its choosing, diluting every honest
author's pro-rata share of a tranche. It could not mint, could not touch
direct-path accrual, could not reach bonds or settlement, and could not
withdraw anything — `RpgfMinter` still pays only authors of record with a live
stake. The mitigation is the same one the whole batch path already rests on:
the vkey is immutable, and a program change means a NEW verifier deployment,
reviewed as such.

**Related**: the two settlement universes are DISJOINT — a batch-settled
process never acquires kernel status, and a kernel-settled one is never in a
batch. That is what makes guest-owned idempotence safe, and why the two
accruals are merged as SCORES and never as components (`scoreOf`): the chain
holds counts, not the pair sets needed to union them.


---

## 17. `UsageCounter` scores nothing below the minimum-support floor — real usage, zero score

**Looks wrong because:** an artifact with genuinely settled, genuinely recorded trade shows
`c > 0`, `d > 0` and `score = 0` — which reads like lost accrual, or like the counter
penalising honest early adopters.

**Is correct because (ruled 2026-07-31):** below `minSellers` (mainnet 3) distinct
live-staked sellers sit exactly the artifacts one actor can fabricate alone — self-farms,
fragmentation shards, squatted names, trivial riders — and a floor of 3 makes the minimum
viable farm three deposits and three cooldowns, with no curation and no judgment. Within an
open period nothing is lost: counting is never refused, `c` and `d` accrue below the floor,
and the FULL score springs the moment the third distinct staked seller lands. State the
edge honestly (the public page does): a period that CLOSES below the floor scores zero
permanently — processes count once ever and cannot re-record into a later period, so
sub-floor accrual defers within a period and expires at its boundary. The floor lives in
`_score`, so both settlement paths inherit it identically and PER PATH — the chain holds
counts, not seller sets, so summing the paths toward the floor would let one seller
straddle the two universes and count twice; flooring each side separately can only ever
under-pay a boundary case. Conservative by construction, like the score merge itself.

## 18. Recording has no protocol fee and no burn — and none should be added

**Looks wrong because:** `recordClauseUsage` costs only gas, so fabricating `c` looks
underpriced — an auditor's natural fix is a flat per-record base-currency burn, or a
per-record fee routed to the DAO treasury.

**Is correct because (ruled 2026-07-31, both variants declined):** under the
staked-seller breadth statistic the burn's protective job is gone — a pure-`c` attack
grows score as `c^(1/3)` (octuple the records to double the score) against linear gas,
the same cube-root futility that killed the per-pair cap, while the dominant term `d` is
priced by deposits. An app-layer ETH burn destroys real value to deter an attack the
exponent already crushes (the EIP-1559 base fee of every record is already burned at the
protocol level). Routing the fee to the DAO instead is WORSE, not better: it inserts an
institution into the identity-free mechanical path (the mechanism must survive the
no-institutions stress tests, and the DAO is not yet instantiated), gives the treasury
usage-coupled revenue (exactly the value-accrual coupling the pure-Schelling-point florin
design refuses, and a fresh Howey fact), and turns permissionless recording into a fee
paid TO an entity. If the Sybil bound's algebra ever exposes a gap here, the reserve
lever is lengthening the withdrawal cooldown — which moves no tokens at all.

**The accepted posture (recorded so it is not re-litigated):** the ONLY non-recoverable
per-trade cost in the reward path is the network's own EIP-1559 base-fee burn — in base
currency, automatic, free of protocol machinery, and scaling with fake volume exactly as
with real. That this is the WHOLE per-record cost is accepted, knowingly: together with
live-stake-to-earn and the fixed 600M pool (which a farmer dilutes, never inflates), it
is the residual anti-Sybil bite, and in the positive-sum frame that residual is a minor
leak, not a hole. Do not "fix" it by adding a protocol-side cost — both variants above
are declined and the door is closed on the family.

## 19. Usage accrual requires the artifact to hold a live registration deposit — an unregistered leaf key scores nothing

**Looks wrong because:** `recordClauseUsage` proves a real, resolved order committed the
artifact and its seller is staked — yet still reverts `ArtifactNotRegistered` (direct path)
or silently skips it (batch path) unless the artifact ALSO holds a live deposit in its own
registry. A settled, proven use that earns nothing reads like lost accrual.

**Is correct because (audit 2026-08-01, finding M-2):** the artifact key is otherwise just a
merkle-leaf key a self-authored agreement chooses freely, so without this gate a self-dealt
process could accrue score to ANY `bytes32` and inflate `totalScoreIn` — the shared payout
denominator — at gas cost, diluting every honest author. The gate is the ARTIFACT-side twin
of the seller-side stake gate: score counts only what a live ETH deposit has priced. It does
not eliminate the paid replication lever (register N keys for N deposits) — that is the
accepted, deposit-priced cost the reward's uniform pro-rata already dilutes — it closes the
FREE variant. Direct path reverts (a standalone tx with nothing to unwind); the batch path
skips (see §20).

## 20. The RPGF accrual never blocks batch settlement — a reverting reward gate does not unwind trade

**Looks wrong because:** `applyBatchAccrual` `continue`s past excluded/unregistered artifacts
instead of reverting, and `settleBatch` wraps the whole accrual call in try/catch, emitting
`BatchAccrualSkipped` and settling anyway. A reward write that can be silently dropped looks
like lost or manipulable accrual.

**Is correct because (audit 2026-08-01, finding "settlement/reward coupling"):** the accrual
is a REWARD-tier write inside a SETTLEMENT-tier transaction. A reward gate that reverts
settlement lets one party block every co-batched trader's already-reconciled payouts — a free,
unauthenticated griefing vector (a poison claim naming the excluded `figaro-commerce`, which
rides every agreement; or a seller who unstakes between prove and submit). Tier separation is
the doctrine: settlement must never be hostage to the reward. A dropped batch's accrual is
recovered by the next batch that touches the same artifacts (the counter's write is a
cumulative overwrite) or forgone — conservative under-pay, never over-pay, the same posture as
the per-path floor (§17). The sequencer additionally pre-filters poison claims so the catch
only ever fires on the genuine stake-race.

## 21. The seller-stake gate is retroactive — usage must be recorded while the stake is live

**Looks wrong because:** a seller who requests withdrawal doesn't merely stop FUTURE trades
counting — every one of their settled-but-not-yet-recorded processes becomes permanently
unrecordable once the period ends. A seller can even do it deliberately to deny a specific
author (withdraw, then re-register). That reads like a griefing hole.

**Is correct because (audit 2026-08-01, finding M-1; ruling 2026-08-01):** the chain cannot
see WHEN a process resolved (the kernel is frozen and stores no per-order timestamp), which is
the same reason `processCounted` is global — so the stake can only be gated at RECORD time,
never at settlement time. No stateless on-chain fix exists. The mitigation is a habit, not
state: usage is recorded AT SETTLEMENT (`createCapabilityExecutors.ts`, right after
`resolveProcess` confirms), when the seller is definitionally still staked, closing the normal
window. The residual grief is self-limiting — to deny an author the griefer must stay unstaked
through the period end, forfeiting their own eligibility and locking their deposit. Accepted as
the cost of the stateless kernel.

---

## Summary Table

| # | Pattern | Looks wrong because | Is correct because |
|---|---|---|---|
| 1 | Resolved processId is permanently closed | Closure-less extension "sounds protocol-aligned" | The closure IS the institution dissolving; follow-on rounds sign a fresh root; the gate derives from existing state |
| 2 | Cross-order seller attestation | Wrong role for target order | Attester recorded truthfully; semantics off-chain |
| 3 | buyer == seller allowed | Self-dealing vector | Bond math balances; bilateral signature required |
| 4 | No owner/admin/pause | No incident response | Admin = trusted third party = breaks mechanism |
| 5 | Buyer key loss is terminal | No stuck-fund recovery | Timeout = escape hatch = breaks MAD equilibrium |
| 6 | No prevrandao salt | Missing on-chain entropy | Validators predict prevrandao; party-chosen salt sufficient |
| 7 | Attestation reverts on resolved orders | Rejecting legitimate late evidence | Evidence window closes with the institution; forums get the closed record |
| 8 | Permissionless clause registry | Namespace squatting | Integrity routes through contentHash, never the registry; squatting pollutes discovery only, priced by the staked deposit |
| 9 | RETIRED (DutchAuction deleted 2026-07-02) | — | Competitive pricing abandoned; see §9 |
| 10 | Strict token compatibility rejection | Overly restrictive | Bond math requires exact amounts; wrapping is the solution |
| 11 | Single currency per process | Can't do multi-token commerce | 2:1 bond ratio is Nash-stable only in one currency; multi-token lives at composition layer (process / wallet swap / Level-3 bundler) |
| 12 | No `transferTitle` / `endorse` / `nominate` for BoLs | Industry-standard MLETR-aligned eBLs are negotiable; CargoX / TradeTrust / TradeLens all implement this | Single-buyer invariant + parties-fixed-at-commit + no-escape-hatches each separately rule it out; cargo doesn't carry rights, the commitment does |
| 13 | `deadline` alongside `salt` | Redundant / auction residue | Salt is identity, deadline is expiry of the unconsummated signature window; no-cancel kernel needs signatures to age out |
| 14 | Committed `lineItems.name` / `cargo.marks` are public | Wallet-linkable purchase content leaks | Mechanism needs line items beyond the endpoints (invoices, disputes, price checks); mitigation is compositional (discreet catalogue naming, coded marks) + wallet pseudonymity |
| 15 | `MembersRegistry` withdrawal cooldown holds ETH on a timer | Looks like stuck funds + a kernel-forbidden time lock | PROTOCOL tier, not kernel — no bond or commitment involved; without it one deposit is recycled across identities, so the stake priced nothing; bounded, immutable, and unconditionally claimable after `releaseAt` |
| 16 | `applyBatchAccrual` has one privileged caller | A named writer on the reward path is the shape of an admin backdoor | Discretion, not permission, is the test: the caller may only relay numbers an immutable vkey committed; the counter still enforces period, seller stake and exclusions itself |
| 17 | Recorded usage can score zero (`minSellers` floor) | Real settled trade with `score = 0` reads like lost accrual | Below 3 staked sellers sits what one actor fabricates alone; sub-floor accrual defers within the period (full score springs at the third seller) and expires when the period closes; per-path because the paths' seller sets cannot be unioned |
| 18 | No per-record fee or burn | Fabricating `c` costs only gas | `c^(1/3)` already crushes volume farming; breadth is deposit-priced; an ETH burn destroys value needlessly and a DAO-routed fee inserts an institution + usage-coupled revenue into an identity-free mechanism |
| 19 | Usage needs a live artifact registration deposit | A proven, settled use that scores nothing reads like lost accrual | The artifact key is otherwise a free-choice merkle leaf; without the gate a self-dealt process inflates the shared denominator at gas cost; closes the FREE dilution, leaves the accepted deposit-priced replication lever |
| 20 | RPGF accrual never reverts settlement (skip + try/catch) | A silently-droppable reward write looks like lost/manipulable accrual | A reward-tier gate must not unwind settlement-tier trade; a dropped batch is recovered by the next cumulative overwrite or forgone (conservative under-pay); sequencer pre-filters so the catch fires only on the stake-race |
| 21 | Seller-stake gate is retroactive | A withdrawal makes settled-but-unrecorded trades unrecordable — looks like a grief hole | Chain can't see resolve time (frozen kernel), so the gate is record-time only; record-at-settlement closes the normal window; residual grief is self-limiting (griefer forfeits own eligibility through period end) |

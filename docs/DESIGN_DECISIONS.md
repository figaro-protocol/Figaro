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
SellerRegistry, and AssemblyRegistry have no owner, no
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
off.

> **Scope note (2026-04-28)**: this entry covers the **kernel layer**
> only — a single bonded order's parties cannot be substituted, by the
> three invariants above. Whether the same economic event (cargo title
> transfer mid-flight) can be expressed at the **protocol layer** via
> composition is an **open research question, parked pending mechanism
> design**.
>
> Working hypothesis (2026-04-28 late session): the
> **CancellableSeller wrapper + counter-process pattern** appears
> viable. Buyer commits a parallel `P_cancel` process where each
> sub-order pays a small cancellation fee back via a CancellableSeller
> wrapper that programmatically signs the acknowledgment under a
> pre-agreed fee schedule. Arithmetic netting across P1 + P_cancel
> produces the same effect as a partial DAG resolve, with cash flow
> equal to just the cancellation fees rather than full downstream
> payments. All three kernel invariants survive: same buyer at root of
> both processes, parties fixed at each commit, cancellation
> acknowledgments are bilateral signatures encoded in the wrapper's
> code (not unbonded third-party authorizations). The new buyer's side
> is a separate `P2` process committed independently.
>
> The closing paragraph above ("Cargo does not carry rights in Figaro;
> the *commitment* carries rights ... Figaro is the wrong tool, by
> design") should be read as scoped to the kernel layer; do **not**
> extend it to the protocol layer. The initial framing in
> `BOL_RESEARCH.md` §5/§6 dismissed the protocol-layer question as "out
> of scope by design" on flawed economics (the rejected "early
> `resolveProcess` + new process" pattern doubles DAG cost) — that
> dismissal is incorrect-as-written. The BoL-transferability question is
> tracked in the punch-list (FORKS / open questions); the full sketch and
> open design points are in `BOL_RESEARCH.md` §5/§6 and its status header.
> V3 reference material at `archive-v3/src/composability/` +
> `archive-v5/COMPOSABILITY.md`.

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

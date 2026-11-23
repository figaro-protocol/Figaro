# Figaro Protocol — Design Decisions

This document states intentional design choices that may appear as
vulnerabilities or omissions to a reviewer unfamiliar with the protocol's
architecture. Each entry states the pattern, why it looks wrong, and why it
is correct.

The intended audience is an external security auditor. Reading this document
before reviewing the code will prevent the most common false-positive
findings. The catalog's size is the summary table at the bottom — count it
there, never quote a remembered number.

---

## 1. Resolved processId is permanently closed

**Pattern**: `resolveProcess()` sets `ps.activeOrderCount = 0`. Any
subsequent `commit()` targeting that same `processId` reverts with
`ProcessAlreadyResolved`. The `ProcessState` struct is not deleted —
`rootBuyer`, `token`, and `runningTotal` persist — but the gate at
the top of the sub-order branch refuses extension.

**Why it looks like overhead**: A reviewer trained on permissionless
substrate design might expect a closure-less model, where bilateral
signatures alone gate extension. "If both parties want a follow-on round,
let them sign one against the same processId" sounds protocol-aligned.

**Why the gate is correct**: Each bonded process is a transaction-scoped
institution that dissolves at resolution (`/papers/figaro-as-a-cryptoeconomic-system` § 6). The closure is the
*dissolution*. Parties wanting a follow-on bonded relationship sign a
fresh root commitment, getting a new `processId`. No code links the new
process to the old one; whatever "this is a continuation" means to the
parties lives in what they sign, not in `FigaroCore`.

The gate is implemented in the minimum-possible form: a single comparison
against the existing `activeOrderCount` field, which `resolveProcess`
already maintains. There is no new lifecycle enum, no `finalized` flag,
no additional storage. The closure semantic is derived from data
`FigaroCore` already keeps. This is invariant enforcement using existing state,
not a state machine added on top.

**`FigaroCore`'s overall design philosophy**: bilateral EIP-712 signatures
are the principal enforcement mechanism, and `FigaroCore` deliberately
avoids state that signatures alone could enforce. This entry is the one
place where state-based enforcement is justified: the bond-locking and
cumulative-value invariants tie the process together as a single
institution, and that institution's lifetime is finite. Reopening would
require the cumulative-value accumulator to reset, which would break the
cumulative-bonding property for any new orders.

---

## 2. Buyer and seller can be the same address

**Pattern**: `commit()` does not check `c.buyer != c.seller`.

**Why it looks wrong**: Self-dealing is a common attack vector in protocols
where buyer and seller roles carry different privileges.

**Why it is correct**: If buyer equals seller, the same address deposits both
the buyer bond (`2 × payment`) and the seller bond (`2 × runningTotal`)
and receives both payouts at resolution. The bond math balances identically.
No tokens are created, destroyed, or transferred to a third party.

Allowing this is consistent with the permissionless, no-role-separation
design. Both parties must sign — if a single key signs both sides, that
is a choice, not an exploit.

---

## 3. No admin, no escape hatch — by design

**Pattern**: FigaroCore, AttestationCoordinator, ClauseRegistry,
MembersRegistry, AgreementRegistry, and ProcessRegistry have no admin, no
pause function, no upgrade path, and no admin recovery. FlorinToken has a one-shot
deployer who registers minter contracts then renounces (`deployerMintRenounced`)
— a bounded privileged actor, documented separately in `CONTRACTS.md`.

**Why it looks wrong**: Most protocols include emergency controls for incident
response.

**Why it is correct**: The protocol's core property is that a stranger's promise is made good before
the trade, by the parties' own bonds. An admin escape hatch is a trusted third party by another name. The
absence of admin controls is not an omission — it is the mechanism. The six
properties (asymmetric bonding, cumulative bonding, buyer dominance,
atomic resolution, immutable evidence, no escape hatches) are mutually
reinforcing. Removing any one of them degrades the Nash equilibrium.

If a contract is deployed with a bug, a new version is deployed. Immutability
is the safety guarantee, not a liability.

---

## 4. Buyer key loss, with no code installed to resolve, permanently locks bonds — by design

**Pattern**: If the root buyer loses their private key with no code installed on
their wallet that resolves for them (the mitigation below), the process cannot be
resolved and all bonds are permanently locked. There is no timeout, no
recovery path, no admin override.

**Why it looks wrong**: Most protocols include a timeout or fallback for
stuck funds.

**Why it is correct**: A timeout path is an escape hatch. An escape hatch
breaks buyer dominance. Breaking buyer dominance breaks the MAD equilibrium
(if the seller knows the buyer can be timed out, withholding cooperation
becomes a viable strategy).

**The mitigation matches `FigaroCore`**: `FigaroCore` verifies
both parties by ECDSA recovery alone (`FigaroCore.sol:155-160`), so a contract
wallet — multi-sig, ERC-1271 smart account — can never hold the buyer role,
and `FigaroCore` as deployed forecloses adding contract-signature support. The live
mitigation is **pre-installed EIP-7702 delegation**: while it still holds its key, the
buyer sets a delegation (carrying its own guardian/recovery authorization) on
the buyer EOA. `resolveProcess` authorizes by `msg.sender`
(`FigaroCore.sol:255`), so after key loss the delegated code can still
originate the resolve call from the buyer's address — every active process the
buyer opened through `FigaroCore` remains resolvable and none of its bonds is
stranded. The same code reaches the proof-batched path: a batched resolve
carries its authorization in one of two forms, the buyer's ECDSA signature over
`ResolveProcess`, or bytes the buyer's own account code validates for that
digest through ERC-1271's `isValidSignature` (`KernelOp::ResolveByWalletCode`,
`prover/lib/src/types.rs`). The guest cannot run the wallet's code, so it
applies the second form on the process, the value and the order list alone and
publishes the bytes in the operation stream; `FigaroBatchVerifier.settleBatch`
derives the digest under its own domain, requires the buyer's account to have
code, and asks the code before any token moves; any answer but the magic value
reverts the whole batch, because the proven root already holds the resolve, so
the entry cannot be dropped alone (`_checkWalletCode`). So after key loss the delegated code resolves the
buyer's batched processes too, and on both paths only the buyer's wallet, by
its key or by its code, resolves (`formal/RelayState.tla` `ResolveSpec`,
`OnlyBuyerWalletResolves`). New commitments on either path are not rescuable:
each requires a fresh EIP-712 ECDSA signature from the lost key. The
delegation must be installed while the key is still held; it cannot be added
after loss.

**The seller, likewise.** A seller's key loss stalls nothing on chain: only the
buyer resolves, and resolution pays the seller's address and refunds its bond
there, whatever became of the key; without a pre-installed delegation, what
lands there is unreachable, and a buyer who waits for the seller's attestations
before resolving waits in vain. What the lost key takes is the seller's voice while
the process is open: its attestations. The same pre-installed EIP-7702
delegation answers it. The delegated code can originate `attestAsSeller` from
the seller's address. What the code allows is the seller's own act and the
seller's own risk, as the buyer's is. The same code reaches the proof-batched
path: a batched attestation, the seller's or the buyer's, carries its
authorization in one of two forms, the party's ECDSA signature over
`AttestSeller` / `AttestBuyer`, or bytes the party's own account code validates
for that digest through ERC-1271's `isValidSignature`
(`KernelOp::AttestByWalletCode`, `prover/lib/src/types.rs`). The guest cannot
run the code, so it applies the second form with every check of the first but
the signer's recovery, leaves it out of the attestation events, and publishes
the role, the target, the clause id, the stage, the content reference and the
bytes in the operation stream's `0x05` entry. `FigaroBatchVerifier.settleBatch`
derives the target's ids and the role's digest under its own domain, takes the
attester from the role, and asks that account's code before any token moves;
it emits the coordinator's `Attestation` on the magic value, and reverts the
batch by name on any other answer (`WalletCodeAttestationRefused`) or an
account with no code (`AttesterHasNoCode`), as a refused wallet-code resolve
does (`_attestByWalletCode`; § 21). An attestation moves no token and no
state, so the verifier could let a refused one drop alone; it does not,
because the batch publishes its stream: a landed stream then says what
happened, each `0x05` entry in it with its `Attestation`. So after key loss the
delegated code attests on both paths, and only the party's wallet, by its key
or by its code, attests (`formal/RelayState.tla` `AttestSpec`,
`OnlyPartyAttests`).

A party's code may validate, for ERC-1271, more signers than it lets originate
calls: a session key it accepts for `isValidSignature` is one example. On the
batch path that code, not the party's key, decides what the party authorized.
Whatever the code validates is the party's own act and the party's own risk, as
the calls it originates are on the Core: the code is installed by the party,
answers only for the party's own address, and authorizes nothing about another
party's order or bond.

New commitments are not rescuable on either path, for the same reason as the
buyer's: each needs a fresh signature from the lost key.

---

## 5. `prevrandao` is not used as a salt — by design

**Pattern**: The `salt` field in the `Commitment` struct is party-chosen and
not seeded from `block.prevrandao`.

**Why it looks wrong**: On-chain entropy sources like `prevrandao` are
sometimes used to prevent replay or ensure uniqueness.

**Why it is correct**: Under Ethereum's PoS consensus, validators know their
assigned `prevrandao` values up to one epoch in advance. Using `prevrandao`
as a salt would introduce a partial-predictability vector for validator-MEV.

The party-chosen `salt`, signed by both buyer and seller in the EIP-712
commitment, is sufficient. If both parties sign the same salt twice (same
commitment submitted a second time), the replay is rejected — by
`ProcessAlreadyExists` at the root and `RunningTotalMismatch` on
sub-orders (the accumulator has strictly moved), with `DuplicateCommitment`
as the content-addressed backstop behind both (the revert-branch suite pins
the preempting error on each path). The salt does not need to be
unpredictable — it only needs to distinguish two separate orders
between the same parties with the same terms.

---

## 6. Attestations are confined to active orders — the evidence window closes at resolve

**Pattern**: `AttestationCoordinator._requireKnownCommitment` reverts with
`OrderResolved` for orders with `orderStatus == 2` (resolved); only
`orderStatus == 1` (committed, active) orders are attestable.

**Why it looks wrong**: Post-resolution evidence (a warranty claim, a late
temperature-log download) looks legitimate, so rejecting it looks like
data loss.

**Why it is correct**: A bonded process is a transaction-scoped institution
and `resolveProcess` dissolves it. Attestation is runtime evidence *within*
that open institution — letting the merkle-bound evidence stream continue
after atomic resolution would dilute the finality the resolve mechanism is
designed to produce. Post-resolution claims belong to off-chain forums, which
receive the resolved process's complete, closed evidentiary data as input.

---

## 7. ClauseRegistry is fully permissionless

**Pattern**: Anyone can call `registerClause(clauseKey, contentURI)` with any
key and any URI, placing the fixed registration stake
(`registrationDeposit`, immutable at deploy). There is no approval and no identity check.
First write wins per key (`AlreadyRegistered` revert) and
the binding is permanent — `withdrawDeposit` returns the stake without
clearing it; readers de-surface a withdrawn clause for new compositions.
The key is `keccak256` of the canonical bytes of the spec without its
top-level `block` (`computeClauseKey(spec)`); `block` is presentation and
stays outside the key, and the spec's `clauseId` and `version` are words
inside the document.

**Why it looks wrong**: Permissionless registration looks like it enables
namespace squatting and spam: a well-known clause name is public, so a
squatter could seem to claim it before its designer does.

**Why it is correct**: The layers are hard boundaries in a permissionless
system. Anyone may use the Core alone, the Core with the registries and the
reward, or all three under a frontend of their own. This frontend de-surfaces
a withdrawn clause for new compositions because that is how it chose to read
the registry; another frontend may keep surfacing it and its users may keep
composing it, so the registry clears nothing on any frontend's account. The
same permanence is what every committed agreement and the batch verifier read:
integrity routes through `checkoutHash` and the clause key, never through
the registry, so a garbage entry can pollute discovery only, and the stake
prices that. There is nothing to squat but bytes: the registry holds no name,
a reader verifies a fetched spec by recomputing `computeClauseKey` from it,
two specs with one name are two clauses, and a lookalike shares nothing with
the original but its label.

Clause governance — which clauses are authoritative — is a convention-layer
concern resolved off-chain, consistent with the event-sourced architecture.

**Reward escalation, accepted:**
once designer rewards reach designers, the registering wallet is also the reward CLAIMANT key
(`RpgfMinter._isAuthor`), so a front-runner who copies an in-flight registration
captures its future reward, not just a discovery slot. The front-runner also chooses the `contentURI`, and with it the `block` that tooling reads for that key, since the clause key covers the spec without `block`: it can mislabel fields and steer a tool's collection of the data, and it cannot change the fields, the stages, the key or any hash a party signs. A wallet that uses only the Core and the registries loses nothing by this; a frontend that reads `block` chooses how far to trust it. This was weighed and the
first-write-wins design KEPT, for two reasons. First, the shared flat keyspace
IS the coordination commons — namespacing keys under the designer's address
(the structural fix) would fragment it, and signature-based registration breaks the designer-is-staker assumption the reward's live-stake gate rests on. Second, reward
follows real USAGE (network truth): a squatted key earns nothing unless the
ecosystem actually composes it, which the squatter cannot force, and a squatter that KEEPS the key keeps its stake live to claim, so the stake prices that attempt. A front-runner that registers a key and withdraws it in the same transaction pays only gas; the stake prices nothing there, and § 41 states that residual. The reactive-front-run window is already minimal —
registration pins the spec to the designer's OWN node and registers in one atomic UI
action, so nothing is publicly observable before the register tx hits the mempool.
The residual — a mempool front-run of that tx by a wallet that keeps the key — is the accepted,
stake-priced cost; no registry has a guessable id to claim in advance,
since a clause key, an `agreementHash` and an assembly's `processDesignHash` are all derived from
content. The same holds on `AgreementRegistry` and `ProcessRegistry`: anyone can
compute a pinned agreement's hash or an assembly's root from the document, so a
front-runner can become designer of record there too, at the same stake and
under the same usage-only reward, and both contracts accept it as stated. Revisit only if reward-capture griefing is
observed in the wild; the fallback is commit-reveal on `ProcessRegistry` alone.

---

## 8. No competitive-pricing mechanism — pricing is a catalog concern

**Pattern**: there is no auction, order-book, or price-discovery contract
anywhere in `src/`; every payment is a figure both parties sign.

**Why it looks wrong**: a market protocol without a market-price primitive
looks unfinished.

**Why it is correct**: a mid-chain order whose
price or counterparty is unknown at signing is structurally incompatible with
`FigaroCore`'s exact-match cumulative accumulator (`runningTotal`),
and the workaround (a market contract standing in as the seller
`FigaroCore` sees, bonds borrowed from a float vault) is banned three ways:
ECDSA-only parties, no bond lending, no intermediary holding. Pricing is a catalog
concern (e.g. rate × geohash distance).

---

## 9. `_pullExact` rejects fee-on-transfer tokens — permanently; rebasing and blocklisting tokens carry their own terms

**Pattern**: `_pullExact` uses a before/after balance check with strict equality
around the one `transferFrom` call. Any token that delivers less than requested
(fee-on-transfer) reverts at commit. A rebasing token passes the check — the
balance moves at the token's rebase events, not inside the transfer — so
`FigaroCore` does not detect it: a downward rebase leaves the Core's pooled balance in that token short,
and the resolve that runs it dry — possibly a process committed after the
rebase — reverts on the transfer out; an upward rebase strands the surplus in
the contract, since nothing sweeps it.

**Why it looks correct and IS correct**: The MAD bonding model requires that
the exact committed amount is locked. If the received amount differs from the
committed amount, the bond math is broken. Rejecting fee-on-transfer is the
correct behavior, and detecting a rebase would need state `FigaroCore` does not
keep. Wrapped, non-rebasing variants (e.g., wstETH instead of stETH) must be
used; `FigaroCore`'s NatSpec above `_pullExact` states the same. `RELEASE_READINESS.md` carries the deployment precondition.

**The same holds for a token with an issuer blocklist.** Resolution is atomic:
if the currency refuses a transfer to one party, the whole process stays open
— every bond held, every other seller unpaid — until the issuer relents. That
is the token's own term, chosen by the parties when they chose the currency;
`FigaroCore` has no path around a currency that will not move. A currency
whose issuer can block a wallet is an issuer inside the process. Tokens
that return nothing from `transfer` (USDT's shape) and tokens with six
decimals settle exactly; `FigaroCore` decodes through `SafeERC20` and never
reads `decimals()`. `WeirdTokenTest` exercises all four shapes on `commit`
and `resolveProcess`; `FigaroBatchVerifierTest` the no-return and blocklist
shapes on `settleBatch`, where a blocked payee reverts the whole batch and
the state root does not move.

---

## 10. Single currency per process — multi-token is a composition concern

**Pattern**: `commit` binds every order in a process to one `token` address;
sub-orders with a mismatched currency revert (`TokenMismatch`). Two parties
cannot buy and sell in different tokens within the same process.

**Why it looks correct and IS correct**: The 2:1 asymmetric bond ratio is
Nash-stable from chain state alone — no oracle, no DEX dependency, no pre-agreed
FX rate. Mixing currencies within one process would require all three to compare
"buyer bond" against "seller bond" at resolution, and each reintroduces a
discretionary actor (oracle seller, DEX router, a counterparty picking the
rate). Single-currency binding in `FigaroCore` is precisely what preserves
trust-minimization.

**The composition patterns** (no Core change required):

1. **Process-DAG composition.** A "single transaction with N vendors in N
   currencies" is N independent monotoken processes, one per vendor relationship,
   each in the vendor's preferred token. `FigaroCore` sees N bonded handshakes; the
   UI or wallet correlates them. Closer in spirit to "every participant is an
   independent value-adder." Buyer holds each currency or swaps upstream.

2. **Wallet-side atomic swap → monotoken commit.** Buyer holds DAI, vendor wants
   USDC. The wallet performs a DEX swap, then calls `commit` with USDC in the
   same transaction. `FigaroCore` sees one clean commitment; slippage is absorbed
   pre-bond. Modern wallets (Rabby, MetaMask Swap, Rainbow) do this natively.
   The shipped form of this pattern is `WitnessSwapAndCommitCoordinator`
   (`CONTRACTS.md`): the swap route is bound into the party's Permit2 witness
   signature, the coordinator supplies the party in-place, and `FigaroCore` pulls
   the bond as always — still one monotoken process.

3. **Level-3 atomic bundler mechanism.** When all-or-nothing semantics is needed
   across N differently-denominated vendor processes, a Level-3 composition contract
   can orchestrate N monotoken commits as a wallet-bundled group with
   revert-on-any-fail. `FigaroCore` still sees N independent monotoken processes.

Do not propose adding oracles, DEX routers, or "multi-currency bonds" to
FigaroCore. The perceived limitation is a misframing — point inquirers at the
three composition patterns above.

---

## 11. No MLETR-style transferable records — by design

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
TradeLens implemented it via consortium-mediated ledger updates. Three
production protocols — and the legal framework all three align to —
treat transferability as load-bearing. Figaro's absence of any
equivalent mechanism appears to be a missing feature.

**Why it is correct**: Three independent `FigaroCore` properties each
separately rule transferability out:

1. **Single-buyer invariant**. A Figaro process has one buyer at
   the root, and every order in the process carries that same buyer on its
   buyer side. `FigaroCore` has no mechanism to fork the buyer (creating
   two buyer-roots) or substitute the buyer (changing the orderHash). A
   "transfer of buyer-side title" mid-process has no representation in the
   `processes` mapping.

2. **Parties fixed at `commit`**. Both buyer and seller addresses are
   bound into the EIP-712 `Commitment` struct that produces the
   `orderHash`. The hash is the order's identity; changing either party
   changes the hash, which is by definition a different order. There
   cannot be a `transferBuyer` or `transferSeller` function without
   changing what an `orderHash` means.

3. **No escape hatches** (the Escape-Hatch Weakness theorem, /papers/asymmetric-bonding §4.2). A transfer mechanism
   requires authorization for the substitution. In TradeTrust this is
   the holder's `transferBeneficiary` endorsement; in CargoX it is the
   holder's signature on the ERC-721 transfer. In Figaro terms, the
   authorizer is a third party J ∉ {B, S} relative to the *new*
   bilateral relationship between the new buyer and the existing seller
   — exactly the unbonded actor the Escape-Hatch Weakness theorem forbids. Even if J equals
   the original buyer, J's incentive structure does not bind the new
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
not carry rights in Figaro; the *commitment* carries rights.** When a
right must CIRCULATE as an instrument — trade finance with the bank as
temporary holder, negotiable warehouse receipts — Figaro is the wrong
tool, by design.

**What this does not close off: the commerce those instruments carry.**
A cargo resale in transit needs no transferable right and no party
substitution. The buyer agrees the sale under the outside instrument; the
sellers are not asked to agree to it (what they agree is the variation, the
transfers and the revised terms), and ownership passes when the outside
instrument says, here at resolution. The sellers make the sale possible, exactly as every
other outside event is squared before the buyer's one terminal call: each
returns to the buyer the whole, or the part, of its committed payment
that answers to what the buyer will not receive, the transfer is
attested under `figaro-property-transfer` (the event in the parties' words,
the sale instrument's fingerprint, the netting transfers, the revised terms'
fingerprint; each party against its own order, agreement among the
attestations derived when read), and a single `resolveProcess` executes the
schedule unchanged,
so the sellers' transfers net inside one bond cycle. Ownership then passes to
the new owner on the sale instrument's terms, which in this composition set it at
resolution; a bond is tokens and references no goods. The new owner never becomes a
process party, so no in-protocol right is minted; it does what it wants
with its own property once the transfer is final, and its protection
between the agreed sale and the resolution is the ordinary legal layer
plus the attested data.

`/papers/external-events` owns the general rule (§5) and the
netting-completeness result behind it (§4); `/papers/after-tradelens` §7 works
this instance in full, and its §8 compares the approach against CargoX,
TradeTrust, MLETR, and TradeLens. What remains
expressible here is the non-negotiable BoL — the consignee fixed at signing,
the document a read-only projection over committed leaves, in any topology the
buyer commits upfront.

---

## 12. `commitDeadline` is not auction residue and not redundant with `salt`

**Pattern**: The `Commitment` struct carries both a `salt` and a `commitDeadline`;
`commit` rejects expired commitments (`DeadlineExpired`,
`FigaroCore.sol:147`) and nothing else in `FigaroCore` reads the field.

**Why it looks wrong**: `salt` already appears to "secure" the commitment,
so `commitDeadline` reads as leftover plumbing from an earlier design (it is not).

**Why it is correct**: the two fields answer different attacks. `salt` is
IDENTITY — it makes two otherwise-identical orders hash differently, and
provides no time-bounding at all. `commitDeadline` is EXPIRY of the
UNCONSUMMATED dual-signature window: signing and committing are two steps
with real latency between them (share → counter-sign → commit), a
signature cannot be revoked (no cancel — revocation is escape-hatch
machinery), so without a deadline every signed-but-never-committed order
is a perpetual option on the signer's balance, exercisable whenever standing
allowances permit. The deadline makes stale signatures die on their own —
the only passive protection a no-cancel `FigaroCore` can offer. Doctrinal check:
it gates ENTRY only; nothing expires post-commit (bonds have no timeout),
so it is the mirror image of an escape hatch, not an instance of one.


---

## 13. Committed `lineItems.name` and `cargo.marks` are public — accepted

**Pattern**: `figaro-commerce.lineItems[].name` (and free-text `figaro-cargo.marks`)
are committed public fields: they are committed in the clear in the agreement
body, never sealed, so whoever holds that body links the purchase content to the
wallet, and the body is pinned on IPFS and cannot change. The chain carries only
the body's `checkoutHash`, and the body's URI travels in the order's payload, never
in an event (`frontend/lib/core/agreementFetch.ts`), so a stranger reads a line item
only where a party or an attester publishes it. There is no hash-only line-item
variant.

**Why it looks wrong**: sensitive purchase categories leak by design; a privacy
audit reads this as a GDPR-shaped defect next to the ECDH address channel, which
keeps its plaintext off-chain.

**Why it is correct**: the public/confidential boundary rule
(`DATA_LAYER.md` § "The public side, and the rule that decides it") puts a datum on the committed side iff
the mechanism needs it beyond the two endpoints — and line items are exactly that:
invoices and audit documents derive from them, disputes verify against them, and
bond/price checks read them. Mitigation is compositional, not mechanical: item
*names* are the seller's catalog authoring choice, so a discreet catalog names
discreetly ("item #123" — `itemId` is already committed alongside), and `marks`
follows bill-of-lading practice (reference codes, never personal names — the spec
description says so). Pseudonymity of the wallet does the rest.

---

## 14. `MembersRegistry` time-locks a requested withdrawal — that ETH is not stuck

**Pattern**: `requestWithdrawal()` clears the registration guard and schedules the
deposit; the ETH itself is only claimable via `withdraw()` once the immutable
`withdrawalCooldown` has elapsed. Between the two calls the contract holds ETH that
its owner has explicitly asked for and cannot yet take. There is no admin path, no
early release, and no way for anyone — including the depositor — to shorten it.

**Why it looks wrong**: it reads as two separate red flags. First, held ETH with a
timer look like §4's stuck-fund shape, and this file is emphatic that the Core has
no time locks. Second, a mandatory waiting period on someone's own capital looks like
the "escape hatch in reverse" — a protocol asserting a hold it has no business
asserting.

**Why it is correct**: the tier is the whole answer. **This is a protocol contract beside the Core, not the Core** — and the
no-time-lock rule is a *Core* law about bonded commitments, where any timer would
hand a party a unilateral exit and break the MAD equilibrium. Nothing here touches a
bond, a commitment, or a resolution. Citing the Core rule at this contract is a tier error.

What the cooldown does is make the stake *mean* something. Without it,
withdrawal is a single call that clears the guard and pays out at once,
making one stake recyclable through identity after identity: register →
transact → withdraw → re-register from a fresh address. The capital cost of sustaining N fabricated
identities is therefore one stake, not N stakes — O(1) no matter how much
breadth was manufactured. Since designer rewards count distinct LIVE-STAKED SELLERS and **no scoring shape can distinguish a fabricated counterparty
from a genuine one**, the
identity stake is the only place Sybil resistance can live — and an instantly
recyclable stake is not a stake. With the cooldown, sustaining N identities across a
reward period `P` costs `stake · N · T / P`.

The ETH is not stuck, on any reading:
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

**Scope**: `MembersRegistry` only. `ClauseRegistry`, `AgreementRegistry` and
`ProcessRegistry` return a stake in one call and need no wait: a key holds no
identity to recycle and no name to take, and its stake prices it through the
reward (§ 41).

---

## 15. `UsageCounter.applyBatchAccrual` has one privileged caller — a proof-gated writer, not an admin

**Pattern**: every other write in the protocol is permissionless. This one is
not: `applyBatchAccrual` reverts unless `msg.sender == batchVerifier`, an
address fixed at construction. A reviewer scanning for authority patterns
finds a single hard-coded writer on a contract that governs a 600M-token
distribution.

**Why it looks wrong**: "no admin" is stated everywhere in this
codebase, and a lone privileged caller on the reward path is exactly the shape
an admin backdoor takes. The natural next question — can that address mint,
re-weight, or seize? — is the right question to ask.

**Why it is correct**: the verifier has **no discretion**. It may call this
function only with uses an SP1 proof committed under an IMMUTABLE
verification key, against a state root that advances by that same proof. It
cannot choose the uses, cannot invent a process, cannot count a process twice
(the counter's one `processCounted` set holds for both routes, and a use whose
process it holds is skipped), and cannot be repointed — `batchVerifier` is
`immutable` and no setter exists. What it can do is exactly what the direct
path lets *anyone* do permissionlessly: present proof that resolved trade used
a clause, a registered agreement or an assembly.

The distinction that matters is **discretion, not permission**. An admin
function is one whose outcome depends on who calls it. This one's outcome
depends only on what the proof says; the caller is a courier. The reason it
needs a named caller at all is that a batch-resolved order never acquires
`FigaroCore` status, so the two facts a direct call proves here — the order is
resolved, the key is committed in its agreement — are proved OFF-chain by the
guest and cannot be re-derived from calldata. The contract trusts the vkey, and
a named caller is how a vkey's authority reaches storage.

**What the counter still enforces itself**, because the proof cannot see live
chain state: the open period, each use's seller's live `MembersRegistry` stake,
each clause's, agreement's or assembly's live registration in its own kind's
registry, and whether the process is already counted. The verifier deliberately checks none of these — it
owns the proof, the counter owns the reward's gates.

**Blast radius if the vkey were wrong**: a bad program could hand the counter
uses no resolved trade made, for clauses, agreements or assemblies of its
choosing — each still gated by a live registration and a live-staked seller, each
process counted once — diluting every honest designer's pro-rata share of a
period's budget. Because the counted-process set is shared by both routes, it
could also hand over a use naming a direct-route process id under some key,
pre-marking it in `processCounted`, so a later direct call for that process
and key reverts `AlreadyCounted` and its use is never counted. It could not
mint, could not reach bonds or resolution, and could not
withdraw anything — `RpgfMinter` still rewards only designers of record with a live stake. The mitigation is the same one the whole batch path already rests on:
the vkey is immutable, and a program change means a NEW verifier deployment,
reviewed as such.

**What a later verifier earns: nothing in florins.** The rewards contracts
know one verifier, and each link is fixed at deploy. The counter names its one
batch writer (`UsageCounter.batchVerifier`, immutable) and refuses every other
caller (`NotBatchVerifier`). A verifier refuses a counter bound to another
verifier (`UsageCounterNotBoundToThis`, in `FigaroBatchVerifier`'s
constructor), so a new verifier needs a new counter. `RpgfMinter` reads one
counter (`RpgfMinter.counter`, immutable). `FlorinToken` registers a minter
only by its deployer and only before `renounceDeployerMint`, which the deploy
scripts call, so no second `RpgfMinter` can ever mint.

It follows that a change to the proof program, which changes the key and so
the verifier, ends the batch path's florins on that deployment. The trades of
the new verifier run, bond and resolve as before. Their uses can be counted
only by a counter of their own, which no minter reads. The direct path and the
first verifier keep counting into the first counter. The same holds for a
verifier a stranger deploys with a program of its own.

This is accepted, because the other choice is an authority. Letting a later
verifier feed the reward needs a party that may name it after deploy: a
deployer that can still register a minter, or a counter whose writer can be
repointed. Either is a key that can redirect every designer's share, which § 3
refuses. So the proof program is treated as final at the deploy that fixes the
florin, and a later program is a new rewards deployment under a new token, or
a batch path with no reward.

**Related**: the two paths are DISJOINT — a batch-resolved
process never acquires `FigaroCore` status, and a `FigaroCore`-resolved one is never in a
batch, and a batch-path process id is derived under the verifier's EIP-712
domain. That is why one counted-process set serves both routes: counting an id
once is counting a process once. Both routes count into one tally (`accrualOf`),
so a use scores the same whichever way its process reached the chain.


---

## 16. `UsageCounter` scores nothing below the minimum-support floor — real usage, zero score

**Looks wrong because:** a clause or assembly with genuinely resolved, genuinely recorded trade shows
`c > 0`, `d > 0` and `score = 0` — which reads like lost accrual, or like the counter
penalizing honest early adopters.

**Is correct because:** below `minSellers` (mainnet 3) distinct
live-staked sellers sit exactly the clauses and assemblies one actor can fabricate alone — self-farms,
fragmentation shards, squatted names, trivial riders — and a floor of 3 makes the minimum
viable farm three deposits and three cooldowns, with no curation and no judgment. Within an
open period nothing is lost: counting is never refused, `c` and `d` accrue below the floor,
and the FULL score springs the moment the third distinct staked seller lands. State the
edge honestly (the public page does): a period that CLOSES below the floor scores zero
permanently — processes count once ever and cannot re-enter a later period, so
sub-floor accrual defers within a period and expires at its boundary. The floor lives in
`_score` and reads the one tally both routes feed, so a seller counts toward it once,
whichever route carried their trade.

## 17. Recording costs gas and nothing else — no protocol charge, no burn

**Looks wrong because:** `recordClauseUsage` costs only gas, so fabricating `c` looks
underpriced — an auditor's natural fix is a flat per-recording burn, or a
per-recording charge routed to the DAO treasury.

**Is correct because (both variants declined):** under the
staked-seller breadth statistic the burn has no protective job — a pure-`c` attack
grows score as `c^(1/3)` (octuple the recordings to double the score) against linear gas,
cube-root futility, while the dominant term `d` is
priced by deposits. An app-layer ETH burn destroys real value to deter an attack the
exponent already crushes (the EIP-1559 base fee of every recording is already burned at the
protocol level). Routing the charge to the DAO instead is WORSE, not better: it inserts an
institution into the identity-free mechanical path (the mechanism must survive the
no-institutions stress tests, and the DAO is not yet instantiated), gives the treasury
usage-coupled revenue (exactly the value-accrual coupling the pure-Schelling-point florin
design refuses, and a fresh Howey fact), and turns permissionless recording into a charge
paid TO an entity. If the Sybil bound's algebra ever exposes a gap here, the reserve
lever is lengthening the withdrawal cooldown — which moves no tokens at all.

**The accepted posture (recorded so it is not re-litigated):** the ONLY non-recoverable
per-trade cost in the reward path is the network's own EIP-1559 base-fee burn — in base
currency, automatic, free of protocol machinery, and scaling with fake volume exactly as
with real. That this is the WHOLE per-recording cost is accepted, knowingly: together with
live-stake-to-earn and the fixed 600M pool (which a farmer dilutes, never inflates), it
is the residual anti-Sybil bite, and in the positive-sum frame that residual is a minor
leak, not a hole. Do not "fix" it by adding a protocol-side cost — both variants above
are declined and the door is closed on the family.

## 18. Usage accrual requires the clause, agreement or assembly to hold a live registration stake — an unregistered key scores nothing

**Looks wrong because:** `recordClauseUsage` proves a real, resolved order committed the
clause or assembly and its seller is staked — yet still reverts `ClauseAgreementOrProcessNotRegistered` (direct path)
or silently skips it (batch path) unless the clause or assembly ALSO holds a live stake in its own registry; the agreement leg is gated the same way by `AgreementRegistry`. A resolved, proven use that earns nothing reads like lost accrual.

**Is correct because:** the clause-or-assembly key is otherwise just a
merkle-leaf key a self-written agreement chooses freely, so without this gate a self-dealt
process could accrue score to ANY `bytes32` and inflate `totalScoreIn` — the shared payout
denominator — at gas cost, diluting every honest designer. The gate is the CLAUSE-OR-ASSEMBLY-SIDE twin
of the member-stake gate on the seller of record: score counts only what a live stake has priced. It does
not eliminate the paid replication lever (register N keys for N deposits) — that is the accepted, stake-priced cost the reward's uniform pro-rata already dilutes — it closes the
FREE variant. Direct path reverts (a standalone tx with nothing to unwind); the batch path
skips (see §19).

## 19. The rewards accrual never blocks batch resolution — a reverting reward gate does not unwind trade

**Looks wrong because:** `applyBatchAccrual` `continue`s past a use naming either reserved key,
a clause, agreement or assembly without a live registration, a seller without a live stake, or a
process already counted, instead of reverting, and `settleBatch` wraps the whole call in try/catch,
emitting `BatchAccrualSkipped` and resolving the batch anyway. A reward write that can be silently dropped looks
like lost or manipulable accrual.

**Is correct because:** the accrual
is a REWARD-tier write inside a RESOLUTION-tier transaction. A reward gate that
reverts resolution lets one party block every co-batched trader's already-reconciled payouts — a free,
unauthenticated griefing vector (a poison claim naming a key with no live registration, or naming
the agreement format's reserved provenance leaf, which rides every agreement that names its
assembly; or a seller who unstakes between prove and submit). Tier separation is
the doctrine: resolution must never be hostage to the reward. A use the counter skips, and
every use of a batch whose call reverts (a period boundary crossed in flight), stays uncounted,
and a later batch may prove it again — conservative under-pay, never over-pay. The sequencer
additionally pre-filters the claims the counter would skip, so a batch carries few.

**The gas leg: a starved accrual is not skipped.** The catch covers the counter's gates only. The
verifier forwards at most 63/64 of what remains (EIP-150) and keeps 1/64, and at sixty-four uses
that 1/64 covers the tail after the call (the root write, the batch id, the events), so without a
check a band of gas limits would land the batch with its accrual starved and its uses uncounted.
The counter reads its whole-call gates (the writer, the period, the provenance leaf) before its
loop, for a few thousand gas; a failed call that hands back less than 1/32 of the gas the frame
held before it therefore consumed what it was given, and `settleBatch` reverts
(`AccrualStarvedOfGas`, `_applyAccrual`). The 1/32 leaves room for a registry read one frame down,
which hands the counter back at most 1/64 of its remainder.

The revert stays because `settleBatch` is open to anyone. An observer can copy a relay's pending
call and send it first with a gas limit inside the band. Without the revert, that copy lands the
batch with its uses uncounted. The relay's own send then fails its root check, because the root
has moved. So anyone could leave designers' uses uncounted for the price of one batch's gas. With
the revert, the copy fails, the root stays, and the relay's batch lands with every use counted.

The relay that sends its own batch keeps it out of the band: a batch that carries uses is sent with
at least its plan, which counts `SETTLE_GAS_PER_USE` for each use, never past the batch's ceiling
(`gas::settle_send_gas_limit`, `docs/SCALING_STRATEGY.md` § "What a batch may cost the relay").
The node's estimate is the lowest gas at which the call does not revert. A limit at that estimate
plus its headroom is not tied to the cost of a use, so it could still revert the relay's batch here. A use a batch leaves uncounted for another reason, a
gate of the counter, is proved again by whoever sends its claim; a stranger's relay may choose
another gas limit, and loses only its designers' counts until someone sends their claims again.

The probe `test_settleBatch_gasStarvationProbe` (`test/core/verifier/FigaroBatchVerifierTest.t.sol`)
walks the gas limit down from a full run at one, sixteen, thirty-two and sixty-four uses. It
asserts that no limit lands the batch with `BatchAccrualSkipped`, and that the relay's plan is at
or above the lowest gas that lands the batch. `test_settleBatch_aStarvedAccrualRevertsTheBatch`
sends sixty-four uses at 95% of a full run, inside the band that landed them uncounted before the
check, and the batch reverts by name.
`test_settleBatch_aCopiedCallSentFirstAtAStarvingLimitRevertsAndTheRelaysSendLands` holds the
reason: a third party's copy at a starving limit reverts, and the same batch sent afterwards at
its plan lands with every use counted.

## 20. The member-stake gate on the seller of record is retroactive — usage must be recorded while the stake is live

**Looks wrong because:** a seller who requests withdrawal doesn't merely stop FUTURE trades
counting — none of their resolved-but-not-yet-counted processes counts while their stake is
down. A seller can even do it deliberately to deny a specific designer the usage for a while.
That reads like a griefing hole.

**Is correct because:** the chain cannot
see WHEN a process resolved (`FigaroCore` stores no per-order timestamp), which is
the same reason `processCounted` is global — so the stake can only be gated at RECORDING time,
never at resolution time. No stateless on-chain fix exists. The mitigation is a habit, not
state: usage is recorded AT RESOLUTION (`createCapabilityExecutors.ts`, right after
`resolveProcess` confirms), when the seller is definitionally still staked, closing the normal
window. The denial is not lost usage: `processCounted` is once-ever and tied to no period, and a
seller can stake again at once, so an uncounted use is counted in whichever period is open when
it is next presented with its seller staked, on either route. It is lost only once the last
period has closed. The residual grief is self-limiting — to deny a designer the griefer must
stay unstaked, forfeiting their own eligibility and locking their stake for the cooldown, and
it defers the use rather than erasing it. Accepted as the cost of the stateless Core.

## 20a. The member-stake gate on the designer is read at the claim, not across the period

**Looks wrong because:** `RpgfMinter.claim` requires the claimant to hold a live
`MembersRegistry` stake in the claim's block only (`NotLiveMember`; `claimable`
quotes a non-member zero). A designer can register, claim and request withdrawal
in one transaction from a contract wallet, so the gate does not require membership
across the period the usage accrued in. That reads like a gate a wallet can rent
for one block.

**Is correct because:** the stake is a stake, not a history. What the one-block
rental costs is the registration stake locked for the cooldown, per claim
(0.05 ether for 28 days on the public networks; the devnet sets both to zero),
which is the same price the seller-side gate puts on an identity (§20), and a
withdrawal request withholds every later claim until the wallet registers again,
since `registered` clears at the request. The alternative, reading membership at
accrual time, would have `UsageCounter` resolve each counted key to its designer
through the three registries and read that designer's membership — new reads
and a new arrow between the registries for every usage counted, to enforce a
continuity the stake does not promise. The claim is the one moment the designer
acts, so the gate reads there, stateless, as every other gate in the minter does.

## 21. Batch-path resolve is a `ResolveProcess(processId, runningTotal)` authorization — no nonce, no deadline

**Pattern**: `FigaroCore` authorizes resolution by presence — `resolveProcess`
requires `msg.sender == ps.rootBuyer`, over the orders the process holds at
that call. The batch path replaces presence with an EIP-712 authorization over
`ResolveProcess(bytes32 processId,uint256 runningTotal)` in one of two
forms: the buyer's ECDSA signature, which the guest (`prover/lib/src/kernel.rs`
`apply_resolve`) recovers and requires to equal the root buyer; or bytes the
buyer's own account code validates for the digest (ERC-1271), which
`FigaroBatchVerifier` checks against the buyer's code at resolution (§ 4). The
guest refuses either (`StaleResolveAuthorization`) unless the process's
cumulative value when the operation applies is the authorized one. No nonce,
no deadline.

**Why it looks wrong**: a nonce-less, deadline-less authorization signature is
the canonical replay-attack shape; every EIP-712 checklist flags it.

**Why it is correct**: the authorization binds the state it was given for.
A signature is held, by the buyer or by a relay, between its making and its
application, and anyone holding it may apply it; the guest resolves every
order the process holds at application. The cumulative value is the Core's
accumulator: it rises strictly at every commit (every payment is at least 1),
so a signed value names at most one prefix of the process's commits, and the
resolve pays exactly that prefix, every order of which the buyer co-signed.
Signed over the value the process holds, a later commit moves the value past
it and the authorization is refused for good; the buyer signs again over the
new value if it still accepts. Signed over a value the process has not yet
reached, it pre-authorizes exactly the orders that bring the process there:
the relay holds it, and it applies once the buyer's own commits reach the
value. Only the buyer signs it, so this is buyer dominance. The binding is to
the state, so no nonce, counter or clock is needed and none
enters the Core. A replay needs a second state in which the same message
authorizes something again, and that state cannot exist: after a process
resolves, its orders leave status 1 and its active count is zero, so a
replayed resolve fails the guest's own state gates (`OrderNotCommitted` /
`NoActiveOrders`), and that state rides the on-chain state-root chain, so no
relay can rewind it. The domain pins `chainId` and the VERIFIER as
`verifyingContract`, so the signature cannot travel to another chain, another
verifier, or to `FigaroCore` (whose domain — and authorization model — differ;
the two paths never share a signature, see `SCALING_STRATEGY.md`). A deadline
is absent because the message's meaning is time-invariant: it authorizes the
resolution of the process at the value the buyer signed, which pays exactly
the prefix that value names, so late submission delivers precisely that.
`formal/RelayState.tla` `ResolveSpec` models it, the buyer signing over the
value the process holds or any it has not reached: `ResolveBoundToState` TRUE
holds `ResolvePaysSignedPrefix` (every applied resolve pays exactly the prefix
of the process's commits whose cumulative value the buyer signed), FALSE (a
signature over the process id alone) fails it; the wallet-code form binds the
same digest, so the same holds of it, and `VerifierChecksWalletCode` TRUE
holds `OnlyBuyerWalletResolves` while FALSE (the second form taken on the
guest's word) fails it. The asymmetry against `FigaroCore` is the deliberate cost of the
batch universe: `msg.sender` does not exist inside a proof, so authorization
must be carried as a signature or as bytes the buyer's code answers for, in
its minimal sufficient form.

**The wallet-code form's residual.** The verifier asks the buyer's code with
the gas left, before any token moves, so the question it asks is about the
state before the batch; the relay asks the same code the same question against
the latest block at its door and at batch formation
(`prover/sequencer/src/submitter.rs`, `check_wallet_code`). Any
refusal reverts the whole batch, because the proven root already holds the
resolve, so the entry cannot be dropped alone. A wallet's code can answer yes
to every `eth_call` and no in the transaction (branching on `tx.origin`,
`gasleft()` or a block field) at no cost and with no state change, so the
relay's re-ask after the revert may name nobody. The relay then dead-letters
the refused batch's wallet-code resolves alone, re-submittable, counts each
buyer in the adversarial signal, and re-queues every other operation
(`classify_deterministic_revert`). Such a wallet's cost is its own
resubmission; each co-batched operation it sinks spends one of its three
re-queues. A batch carrying no wallet-code operation that the chain refuses
while nobody is named — a revoker who re-approved before the re-read, a token
whose transfer reverts, any cause no re-read sees — is not dead-lettered
whole: within the split budget, no operation is dead-lettered for a revert it
may not have caused. Its operations wait apart from the queue, in halves of
the batch's order, each half tried alone as a batch of its own
(`Mempool::isolate`, `drain_up_to`), so the operation that reverts alone is
dead-lettered alone, re-submittable, and, within the budget, every other
lands, unless its deadline or deferral window passes while the queue waits.
`/status` counts the operations waiting in the isolation (`isolating_ops`),
and an operation that enters the isolation from a fresh refused batch more
than `MAX_ISOLATION_ROUNDS` (3) times is dead-lettered with that reason. A
split budget of ⌈log2 n⌉ plus
`ISOLATION_SPLIT_SLACK` (8, enough for two offenders in a batch of 100) bounds
the extra `settleBatch` calls at the batch and two per split; past it a set refused again
is dead-lettered unattributed with that reason on `/status`, so a batch carrying
more offenders than the budget covers can still cost an honest operation its
batch. The queue waits while the isolation runs, and a deferred operation's
window keeps running (`formal/RelayState.tla` `IsolateSpec`:
`HonestNeverDroppedForAnother`, which `WholeBatchOnUnnamedRevert` TRUE, the old
relay, fails). The relay's gas plan for
the wallet's own code (`WALLET_CODE_EXECUTION_GAS`) and for the bytes'
length (`MAX_WALLET_AUTHORIZATION_BYTES`) is the relay's, never the protocol's:
the verifier bounds neither, so code that needs more resolves through a relay
that plans more or a batch its wallet submits itself.

**The wallet-code attestation's residual.** An attestation in the wallet-code
form (§ 4) reverts the batch when the party's code refuses it, as a wallet-code
resolve does. The verifier could skip a refused entry and let the batch land,
since an attestation moves no token and no state, and it once did. A skip is
unsound against the submitter's gas limit. The verifier asks with all the gas
left and sets no cap, so the call receives 63/64 of it (EIP-150) and the batch
keeps 1/64; as § 19 measures for the accrual, a large enough batch finishes on
what it keeps. `settleBatch` is permissionless, so anyone holding the proof
could choose a limit that starves a validation the code would have passed, and
land the batch without the attestation. No reading of the gas left closes
that: a call starved in the account's own frame leaves at most 1/64, but most
smart wallets are a proxy that delegates to an implementation, and a
validation starved one frame down hands the proxy back the 1/64 it kept, which
reads as an ordinary refusal. A fixed gas amount forwarded to the code would
close it and would put a gas figure in a contract nobody can change, which a
repricing then makes wrong. So any answer but the magic value reverts the
batch by name (`WalletCodeAttestationRefused`; `AttesterHasNoCode` for an
account with no code): a batch that lands carries the `Attestation` of every
`0x05` entry in its stream
(`test_settleBatch_walletCodeAttestation_gasStarvationProbe` and
`…_gasStarvationProbe_throughADelegatingWallet` walk the limit down, in the
account's own frame and one frame below it, and find every landing carries the
attestation). The cost is the resolve's: code that refuses in the transaction
what it validated for the relay reverts any batch carrying its attestation.
The relay plans the same `WALLET_CODE_EXECUTION_GAS` for the attestation's code
as for the resolve's, asks the code at its door and at batch formation, and
after a refused batch that names nobody dead-letters the wallet-code operations
alone, attestations included, re-submittable, counting each party in the
adversarial signal (`classify_deterministic_revert`). Code whose cost rises
between the node's estimate and inclusion would starve under a limit set at the
estimate, and revert the batch; the relay sends the `settleBatch` call with `SETTLE_GAS_HEADROOM_PCT` (25 percent)
over the estimate, capped at the batch's own ceiling (`gas::settle_gas_limit`,
`gas::settle_ceiling`): the batch's plan with one more planned transfer per
net position and a quarter over that, never past the tick's budget. Gas a
transaction does not use is not charged, so the headroom costs only block
space. A node's estimate above that ceiling is refused before anything is
sent, as a deterministic refusal that names nobody, so code that answers the
relay's check cheaply and burns enough in the estimate to pass the ceiling
costs the relay no transaction and is dead-lettered alone. The verifier
forwards all the gas left, so code that burns it and then answers yes lands
the batch at more than its plan; held to its own ceiling, never to the
tick's whole budget, it costs the relay at most that ceiling. The margin of
one planned transfer per position lets a batch in an honest token whose
transfer costs up to twice the planned one land
(`docs/SCALING_STRATEGY.md` § "What a batch may cost the relay").

---

## 22. The site has no pinning account — a browser with no node and no service publishes nothing

**Pattern**: no build carries a pinning credential, on any chain.
`activePublishTarget` (`frontend/lib/shared/ipfsService.ts`) pins through the
wallet's own IPFS node, else a pinning service the user chose with its own
token, both stored in that browser only (`frontend/lib/shared/userEndpoints.ts`,
set at `/members/edit/endpoints`), else the node the build names (the devnet's
local Kubo; a public build names none). With none, every publish and erasure
is refused with one line, `NO_PUBLISH_TARGET_LINE`, before any request is
sent, and a publishing page shows that line with a link to the setting
(`frontend/components/shared/PublishTargetNotice.tsx`).

**Why it looks wrong**: A visitor with no node of its own cannot publish a
profile, a clause, an assembly or the agreement checkout pins until it sets
one; a site account would let it publish at once.

**Why it is correct**: A credential compiled into a public bundle belongs to
whoever holds the account: its payload names the holder, and the account is a
central dependency that can withhold or unpin what is published through it.
Content stays with its party (`docs/DATA_LAYER.md`), so durability is the
publishing wallet's: it pins, it pays, it erases (RELEASE_READINESS Task 6). A
test network runs the same code as mainnet, so the rule is one for every
chain. Content integrity never rested on the account: every registry read is
digest-checked against the on-chain anchor (`Anchored<T>`).
`frontend/tests/lib/ipfsService.test.ts` holds that no build source reads a
site pinning token and that, with no node and no service set, a publish sends
nothing.

---

## 23. The reward keys every accrual by (kind, key) — the registries have no edge between them

**Pattern**: `UsageCounter` keys every accrual, count, counted process and
score by `(kind, key)`, kind `KIND_CLAUSE = 0`, `KIND_PROCESS = 1` or
`KIND_AGREEMENT = 2` (`accrualOf[kind][key][period]`,
`processCounted`, `scoreOf(kind, key, period)`). `recordClauseUsage` counts
under the clause kind and checks `ClauseRegistry` only;
`recordAgreementUsage` counts under the agreement kind and checks
`AgreementRegistry` only; `recordProcessDesignUsage` counts under the assembly kind
and checks `ProcessRegistry` only — it proves the agreement's membership
under `processDesignHash` but never asks whether that agreement is
registered; `applyBatchAccrual` gates each `BatchUse{clauseOrProcess,
kind, processId, seller}` by its own kind's registry and skips an unknown kind. `RpgfMinter.claim(period, (kind, key)[])` reads
the counter's slot for each kind, and `_isAuthor(kind, key, account)` reads
the one registry the kind names, reverting `UnknownKind` on a kind above 2.
`FigaroBatchVerifier._hashUsage` packs `key(32) ‖ kind(1) ‖ processId(32) ‖
seller(20)` per use, so the proof commits the kind.

**Why it looks wrong**: The registry families are parallel and carry no
edge between them (CLAUDE.md § "The six layers"), so a discriminator
that names which registry a key belongs to looks like the reward reaching
across the boundary — and all three hash-keyed registries already key by
content, so the bytes look like they should suffice.

**Why it is correct**: Each registry takes any `bytes32` but its own reserved
keys, so a stranger can register an existing assembly's `processDesignHash` as a
clause key or an agreement hash. Nothing on chain tells a clause key, an
`agreementHash` and a `processDesignHash` apart by their bytes, and no registry
knows another exists, so the separation cannot live in a registry;
it lives in the reward's own accounting. With one keyspace, the stranger's
clause registration at the assembly's bytes would make them a designer of record
for the assembly's accrual. With the kind, a stake in one family
earns only what accrues under that family: the stranger's clause-kind slot at
that key holds only what processes committing a clause leaf under that key
accrue, priced by the seller stake and the floor like any squatted key
(§ 7, § 16). The registries still reference nothing; the counter and the
minter each read all three, and the kind names the one that answers for a
given key — never a second one: no kind's gate consults another kind's
registry. The two reserved keys of the agreement format, the provenance leaf
and the assembly terms leaf, are refused at accrual on every kind whatever a
registry holds at them: the direct path reverts
(`ReservedKeyIsNotARegistration`), the guest
refuses a batch claim keyed on either, the counter's batch path skips both,
and `AgreementRegistry` refuses both as registrations.

**Tests**: `test_aStrangerWhoStakesAnAssemblysKeyAsAClauseTakesNothingOfIt`
(`test/rewards/RpgfIntegrationTest.t.sol`) — the stranger claims
nothing under the clause kind and is refused under the assembly kind, and the
assembly's registrant takes the accrual;
`test_aStrangerWhoStakesAClausesKeyAsAnAssemblyTakesNothingOfIt` and
`test_claimableQuotesNothingUnderACrossedKind` (the same file) — the reverse
squat, and `claimable` quoting what `claim` pays under a crossed kind;
`test_settleBatch_anAssemblyAccrualPaysNoStrangerWhoStakedItsKeyAsAClause`
(`test/core/verifier/FigaroBatchVerifierTest.t.sol`) — the same squat on the
batch path, through `settleBatch`, the counter and `claim`;
`check_theKindsNeverShareAKey`, `check_aKindNeverDisturbsAnotherKindsAccrual`
and `check_anUnknownKindIsSkipped`
(`test/rewards/HalmosUsageCounter.t.sol`) — an accrual under one kind on
either route leaves every other kind's accrual at the same key empty, leaves an
existing one exactly as it was, and an unknown kind writes nothing — the
three kinds, symbolically; `certora/RpgfMinterAuthor.spec` — `_isAuthor`
answers for each kind from its own registry alone and refuses an unknown
kind; `test_theThreeKindsNeverShareACount`
(`test/rewards/UsageCounterTest.t.sol`) and
`test_theThreeKindsPayOnlyTheirOwnDesignerOfRecord`
(`test/rewards/RpgfMinterTest.t.sol`) — no kind's count or claim is
read from another kind's registry.

## 24. The assembly root is a merkle tree over registered agreement hashes — membership is proved, never looked up

**Pattern**: An assembly's `processDesignHash` is a merkle root built with the
assembly tree's own leaf convention, `keccak256(keccak256(processLeafDomain ‖
key ‖ dataHash))` with `processLeafDomain = keccak256("figaro-assembly-leaf")`, over one
leaf per agreement — key the agreement's `agreementHash`, content the canonical
`{"agreement":i,"clauses":{…}}` — plus, when any are composed, the assembly terms
leaf (`keccak256("figaro-assembly-terms")`). The agreement format's leaf carries
no domain, so a tree over agreements and a tree over clauses never share one
shape and no tree over agreement-format leaves opens an assembly leaf. `ProcessRegistry` stores the root and
a URI and checks nothing about the agreements inside it; `AgreementRegistry`
knows no assembly. The counter's assembly leg takes the agreement's
`agreementHash`, its `agreementContentHash` and a membership proof, and proves the
agreement leaf under `processDesignHash` after proving the order's provenance leaf
under `checkoutHash`.

**Why it looks wrong**: An assembly that composes registered agreements reads
like it should hold an on-chain list of them, and the process registry like
it should refuse an assembly naming an unregistered agreement. A proof
supplied by the caller reads like trust handed to the caller.

**Why it is correct**: A list stored in `ProcessRegistry`, or a lookup into
`AgreementRegistry` at assembly registration, is an edge between two
registry families, and the families are parallel (CLAUDE.md § "The six
layers"): assemblies use agreements, agreements use clauses, and neither
knows what uses it. The root carries the membership instead: an agreement leaf
either hashes up to the registered `processDesignHash` or it does not, so the
caller can supply nothing the root did not already commit, and a wrong
`agreementHash` or agreement content derives a leaf that is not in the tree. An
assembly that names an agreement nobody registered is published like any
other content; the agreement leg simply never counts it (the kind's own gate,
§ 18, § 23), and readers that cannot hydrate an agreement do not offer the
assembly. The reserved assembly terms key is refused as an agreement's
`agreementHash`, so the terms leaf can never be proved as a member.

**Tests**: the SDK, the counter and the guest each rebuild the agreement
leaves, the terms leaf, the root and the membership proofs of
`test/fixtures/assembly-vectors.json` (the parity legs, `TESTING.md` §
"Assembly parity"); in `test/rewards/UsageCounterTest.t.sol`,
`test_aSlotLeafUnderADifferentProcessDesignHashFails` and
`test_aSlotLeafWithAnotherSlotsBytesFails` refuse a membership proof that the
root did not commit, and `test_theTermsLeafNeverPassesAsAnAgreement` refuses
the reserved terms key as an agreement's `agreementHash`; the guest's twins
are in `prover/lib/tests/usage.rs`.

## 25. An assembly's agreements are ordered — one registered agreement may hold two agreements

**Pattern**: The agreements of an assembly are a sequence, and each agreement leaf
carries its 0-based index in its content (`"agreement":i`). Two agreements may
name the same `agreementHash`; their leaves differ by index and by the order
agreement's own fills.

**Why it looks wrong**: A set of agreement hashes is the smaller structure and
needs no index; a repeated key in a merkle tree looks like a duplicate leaf an
indexer would double-count.

**Why it is correct**: A design repeats its terms: two couriers on one
process, or two sellers adding value under the same terms, are two orders under one
registered agreement, and a set root cannot express that. The index makes each
leaf distinct, so the root commits the multiplicity, and the topology — which
agreements each one follows — is a fill of the agreement, inside the leaf,
never a field of the registered agreement. Usage still counts once per
process per (kind, key) (`CONTRACTS.md` § "Usage accounting", idempotence),
so a repeated agreement earns for the process, not per agreement.

**Tests**: the third vector assembly in `test/fixtures/assembly-vectors.json`
holds one `agreementHash` in two of its three agreements, and every parity leg
rebuilds its distinct leaves and its root.

---

## 26. The attestation signature does not cover the witness form — the in-proof content check is not evidence to a reader

**Pattern**: The attestation typed data a party signs covers `orderHash`,
`clauseId`, `stage` and `contentRef` only. The witness form the party chose
for a batched attestation — hash-only, or plaintext to have its content
checked inside the proof — is neither signed nor legible on chain: a relay
holding a plaintext operation can submit it hash-only, and the `Attestation`
event the verifier re-emits is identical for both forms.

**Why it looks wrong**: A party that paid for an in-proof content check would
expect the chain to show that the check ran, and a reader would expect to
tell a content-checked attestation from one that was not.

**Why it is correct**: The evidence a reader relies on — the signer, an open
order, the leaf's inclusion under the signed `checkoutHash`, and the
`contentRef` — is bound identically on every path: the coordinator's, the
batch path's hash-only form, and its plaintext form. The in-proof content
check assures the attesting party's own submission (its bytes satisfy the
spec it names) and is not attributable evidence to a reader; a reader checks
content by fetching the bytes and hashing them to the `contentRef`, as on the
direct path. Signing the form would add a field to the attestation struct
that changes nothing a reader can rely on.

**Tests**: `prover/lib/tests/attestation_vectors.rs` (the hash-only event is
the coordinator's, byte for byte); `prover/lib/tests/parity.rs` (both forms
emit the same event fields).

## 27. A state-neutral batch's proof can land twice — the root check is the replay guard, and it is inert there

**Pattern**: `settleBatch` guards against a second landing by one check,
`pv.prevStateRoot == stateRoot`. A batch that moves no state — usage claims
only, or attestations only — has `prevStateRoot == newStateRoot`, so after it
lands its proof still names the current root, and anyone may land it again
at any later time, until a batch that moves the root lands. The verifier
bounds the committed clock only to be no later than the block's, never its
age: a bound on its age would also stop a buyer whose own proof of a resolve
was slow, on a path with no other way out, and each commit's deadline is held
against the landing block whatever the clock (`DeadlineExpired`).

**Why it looks wrong**: A proof that can be submitted twice is the canonical
replay shape, and the verifier logs `BatchOperations` and `BatchSettled` again
under a new batch id.

**Why it is correct**: The second landing has no effect a reader or a party
relies on. Such a batch carries no net position, so no token moves. Every use
it carries meets the counter's once-ever `processCounted` set, which holds for
both routes, and is skipped: the tally and the period total do not move.
Re-emitted attestations are copies of the first landing's — the same order
hash, attester, clause, stage and `contentRef` — so a reader that keys evidence
by those fields reads nothing new; one that counts raw events sees a repeat,
at a later block: the block of a repeat is never the time an attestation was
made, which is the block of its first landing. A use the counter skipped at
the first landing, for a seller whose stake had lapsed, is counted at a later
one in the same period if the stake is live again; anyone could prove that use
afresh, so the repeat gives nothing a new proof would not. A nonce in the public values would add
state to the verifier to refuse a call that changes nothing. A batch that moves
the root cannot land twice: its prev root is no longer current.

**Tests**: `test_settleBatch_aStateNeutralBatchLandsTwiceAndCountsOnce`,
`test_settleBatch_aStateNeutralBatchLandsAgainDaysLaterAndCountsOnce`,
`test_settleBatch_aStateNeutralBatchLandsAgainAfterItsPeriodAndCountsNothing` and
`test_settleBatch_aSkippedUseIsCountedWhenPresentedAgain`
(`test/core/verifier/FigaroBatchVerifierTest.t.sol`);
`test_settleBatch_revertsOnStaleRoot` (a batch that moved the root).

---

## 28. `FlorinToken.mint` checks the supply cap although the minters' caps already bound it

**Pattern**: `mint` reverts with `SupplyCapExceeded` when `totalSupply() +
amount > MAX_SUPPLY`. The minter registry already makes that impossible:
`registerMinter` refuses a cap that would take `totalRegisteredCap` past
`MAX_SUPPLY`, and `mint` refuses an amount past the minter's own cap
(`MinterCapExceeded`), so the supply is at most the sum of the caps.

**Why it looks wrong**: A check that cannot fire is dead code, and dead code
in a token reads as either a misunderstanding or a hidden path.

**Why it is correct**: The check states the cap in the token itself, at the
one function that creates florins. A stranger who reads `mint` sees the
billion bound there, without first proving the registry's arithmetic across
`registerMinter`, `minters` and `totalRegisteredCap`. It costs one storage
read per mint and changes no outcome. `mint` makes no external call, so it
carries no reentrancy guard.

**Tests**: `test_CannotRegisterMinterIfCapExceedsMaxSupply` (the registry's
bound), `test_MintMakesNoExternalCall` and
`test_MintWritesOnlyTheTallyTheSupplyAndTheBalance`
(`test/rewards/FlorinToken.t.sol`); the Echidna property
`echidna_max_supply_never_exceeded` (`src/echidna/EchidnaFlorinToken.sol`).

---

## 29. Public pieces no code of ours reads stay for a stranger's reader

**Pattern**: Each piece below is public, and no contract, SDK reader, page,
relay or agent in this repository reads it (searched over `src`, `sdk/src`
without its ABI lists, `frontend`, `prover/sequencer/src`, `scripts` and
`ecosystem-agents`; tests and ABI lists are not readers).

**Why it looks wrong**: Surface nothing reads is surface to audit for nothing.

**Why it is correct**: Each one answers a question a stranger asks of the
chain without trusting this project's software or documents.

| Piece | What it gives a stranger | Who would read it |
|---|---|---|
| `FlorinToken.MinterRegistered(minter, cap)` | The list of every wallet that may mint florins and its cap; the `minters(address)` getter answers only for an address already known | Anyone checking the florin supply plan against the chain, from the token's logs alone |
| `AgreementRegistry.PROVENANCE_LEAF_KEY()` and `PROCESS_TERMS_LEAF_KEY()` | The two reserved keys the registry refuses to register (`ReservedKeyIsNotARegistration`); the registry reads the constants itself, and the getters publish them | A stranger's software that builds agreements and assemblies, to check its own reserved leaf keys against the deployed registry (the SDK checks the counter's copies, `UsageCounter.provenanceLeaf()` and `processTermsLeaf()`) |
| `MembersRegistry.MemberWithdrawn(member, amount)` | The receipt of the release: the stake left the registry, to which wallet, and how much. De-surfacing is `MemberWithdrawalRequested`, which the readers fold | The member, or anyone auditing the registry's balance against its stakes |
| `UsageCounter.sellerSeen(kind, key, period, seller)` | Whether a seller already counted toward a key's breadth `d` in a period; the counter reads it to count each seller once | Anyone recomputing a key's score from `UsageRecorded` events and checking it against the counter's state |
| `registeredAt` in `AgreementRegistry.bindings(agreementHash)` and `ProcessRegistry.bindings(processDesignHash)` | The block timestamp at which the key was registered, which our readers test only against zero | Anyone who asks whether an agreement or an assembly was on the chain before a given order committed, or who orders the registry's entries by age |
| `amount` in `DepositWithdrawn` of `ClauseRegistry`, `AgreementRegistry` and `ProcessRegistry` | How much stake left the registry with this withdrawal, which the SDK's parsers skip | Anyone auditing a registry's balance against the stakes paid in and paid out, from the logs alone |

A commit-time guard, `scripts/lint-contract-surface-read.sh`, holds this
entry: it refuses a commit that leaves a public function, variable or event of
the Core, the registries, the designer rewards or the composability contracts
with no reader in the contracts, the deploy scripts, the SDK, the app, the
relay, the scripts or the agents' runtime, unless an allowlist line cites the
entry that says why it stays.

---

## 30. Topology is not in the commitment struct

**Pattern**: The `Commitment` both parties sign
(`src/core/kernel/CommitmentTypes.sol`) carries the process, the parties, the
token, the payment, the running total, the `checkoutHash`, the salt and the
deadline, and no parent order. Which order follows which is in the agreement
body (its topology leaf, `Agreement.follows`), bound by the `checkoutHash`, and no event
carries the body's address.

**Why it looks wrong**: A process's shape reads as part of what the parties
bond to, and leaving it off the struct reads as a loss: the chain events alone
do not show the graph of orders.

**Why it is correct**: The bonds are sized by the running total alone, and a
commitment with a wrong running total never commits, so the edges size
nothing (`THEORY.md` § "Topology is not in the Core"). A field in the struct
that the Core neither reads nor checks adds calldata to every commit for a
graph the Core does not use. The parties still sign the edges, since the
agreement body hashes into the `checkoutHash` they sign. A wallet outside the
trade reads the design's edges between its entries from the registered
process design (`planProcessOrders`, `sdk/src/reconstructOrders.ts`), never
from an event. It never matches an entry to an order by commit position,
since the Core fixes no order among sibling orders (§ 32).
The counter-signer reads the edges first, and checks each one before it signs
(`followedOrderIssues`, `sdk/src/projection.ts`; `DATA_LAYER.md`, "The
counter-signer is the first reader of the edges").

**History**: Each earlier version of the Core held the edges in a different
place. Version 3 took a list of parent order ids at each sub-order and
validated it on the chain: each id existed, was in the same process, was not
past the tail and was not repeated, up to four
(its `_validateUiParents`). It took the bond's
parent from the process's tail, never from that list. Version 4 put the
parents in the signed struct, `SubOrderCommitment.parentOrderHashes`, signed
and not validated. Version 5 moved them
into the agreement. The repository's history starts at version 5, and no
document states a reason for the move. The reason above
is the one that stands: the bonds read only the running total, and the
counter-signer and the registered process design give each reader the edges.

**Tests**: `COMMITMENT_TYPEHASH equals FigaroCore's literal type string`
(`sdk/tests/commitments.test.ts`) pins the struct's fields.

---

## 31. The topology leaf has a shape of its own

**Pattern**: The orders an order follows are a leaf of the agreement format,
not a registered clause, and not a reserved key in the clause-leaf shape. The
leaf is `keccak256(keccak256(TOPOLOGY_LEAF_DOMAIN ‖ uint256(n) ‖ dataHash))`,
with `TOPOLOGY_LEAF_DOMAIN = keccak256("figaro-agreement-topology")`, `n` the
number of edges and `dataHash` the `keccak256` of the canonical JSON
`{"follows":[…]}`: an inner preimage of 96 bytes, where a clause leaf's and the
provenance leaf's are 64 (`computeTopologyLeaf`, `sdk/src/agreement.ts`;
`docs/CLAUSES.md` § "Every clause is a merkle leaf"). No contract and no proof
program holds the domain.

**Why it looks wrong**: The provenance leaf, the format's other leaf, takes
the clause-leaf shape under a reserved key, and the two format leaves read as
if they should share one convention. A leaf no contract can rebuild also
reads as a leaf no one can prove, and `AttestationCoordinator` cannot attest
it.

**Why it is correct**: A key in the clause-leaf shape is a key anyone can
register. `ClauseRegistry.registerClause` accepts any nonzero key, and
`UsageCounter` and the guest refuse only the two reserved keys by constant
(`is_reserved_key`, `prover/lib/src/kernel.rs`). A third reserved key in that
shape would let a stranger register it and earn on every order, or would
need a contract and a guest change to refuse it. A leaf of another length
opens under no clause key, so it is registered nowhere, attested nowhere and
counted nowhere, with no contract and no verification key moved. On chain a
data hash is a `bytes32`; off chain the SDK refuses a withheld clause whose
`dataHash` is not 32 bytes (`hashClauseData`) and a clause entry under
`TOPOLOGY_LEAF_DOMAIN` or `PROVENANCE_LEAF_KEY` (`agreementLeaves`,
`sdk/src/agreement.ts`), so no entry of a served agreement rebuilds either
format leaf, and `anchorAgreement` refuses a document that tries
(`sdk/tests/topologyLeaf.test.ts`, `sdk/tests/anchored.test.ts`). The leaf
stays double-hashed, so it never passes as an internal node. An assembly
leaf's inner preimage is also 96 bytes (domain, key, data hash), and it is
kept apart from the topology leaf by its first word, the domain:
`PROCESS_LEAF_DOMAIN` = `keccak256("figaro-assembly-leaf")` against
`TOPOLOGY_LEAF_DOMAIN` = `keccak256("figaro-agreement-topology")`. The cost is
that no attestation can name it, and none is lost: the edges are fixed at
commit and have no later stage. A reader proves them by rebuilding the root
from the signed agreement, which carries them in full.

**Tests**: `sdk/tests/topologyLeaf.test.ts` (no clause key and data hash
reproduce the leaf; the inner preimage lengths; the coordinator's rebuilt
leaf does not open; the root moves with the edges, and an empty list differs
from no leaf); `sdk/tests/projection.test.ts` (the sign gate refuses a
design-built agreement whose topology leaf is absent or malformed, or names
another number of orders than its design entry follows entries).

---

## 32. A reader names the opening order from the chain, and the edges from the agreement

**Pattern**: Two facts about a process's orders have two sources, and a
reader keeps them apart. Which order opened the process is the Core's fact:
the opening order is committed with a zero `processId`, and its cumulative
value is its own payment (`InvalidRootRunningTotal`, `FigaroCore.commit`;
the same refusal in the proof program, `prover/lib/src/kernel.rs`). Both
paths carry `payment` and `runningTotal` in `OrderCommitted`, and
`isProcessRoot` (`sdk/src/state.ts`) reads them. Which order follows which is
the agreement's fact: the topology leaf, `Agreement.follows`
(`sdk/src/agreement.ts`), off the chain. A reader takes the opening order
from the event and the edges from the leaf, and derives no edge from the
event's figures. While an agreement is absent or unread, its order's edges
are unknown: the page shows none, and the order is never named the opening
order on that ground.

**Why it looks wrong**: Bonding and topology are separate layers (§ 30), so a
test on `runningTotal` in a reader of the process's shape reads as the
Core's arithmetic deciding the graph. And an order with no known edges reads
as an order that follows nothing.

**Why it's correct**: The test decides no edge. It answers one question the
Core itself answers at commit, which order opened the process, and a later
order always carries a cumulative value above its payment, since `commit`
refuses a zero payment (`ZeroPayment`). The edges stay the parties' own,
signed under the `checkoutHash` and absent from every event. Reading
"unknown" as "follows nothing" names a later order's seller as the opening
order's whenever one agreement has not loaded; an agreement is content off
the chain, and a failed or pending read of it is the ordinary case
(`docs/OPEN_WORLD.md` § 1).

**Tests**: `frontend/tests/lib/processModelRoot.test.ts` and
`frontend/tests/components/OrderTimelineRoot.test.tsx` (a two-order process
whose later order's agreement carries no leaf, is unread, or carries an
empty list: the opening order named is the chain's, and no edge is shown for
unknown edges); `ecosystem-agents/runtime/tests/analyst.test.mjs` (the same,
and a batched process read from the verifier's events);
`frontend/tests/lib/batchTopologyLeaf.test.ts` (a batched two-order process
read from the verifier's events: the order page's process model and the
evidence file's contract section each read the sub-order's edge from its
leaf); `sdk/tests/state.test.ts` (`isProcessRoot`).

---

## 33. A private set carries its own blinding value

**Pattern**: A set of fields (a clause's top-level `fields`, or one
`stages[N]`) that declares a private field declares exactly one blinding
field: a top-level `string` of format `bytes32-hex`, required, private, with
no `default`, marked `"blinding": true`. A set with no other private field
declares none, and no set mixes public and private fields
(`parseClauseSpec`, `sdk/src/clauses/spec.ts`; the published definition,
`sdk/src/clauses/clause-spec.schema.json`). The party that fills the set draws
the value fresh for each commitment or attestation (`withFreshBlinding`,
`withClauseBlinding`, `sdk/src/projection.ts`; `prepareAttestationContent`,
`sdk/src/agent/autonomous.ts`). The sign gate refuses a spec that names the
blinding field in a designer's, catalog's or profile's fills list, a zero
value, and one value carried by two clauses of one agreement
(`validateCommitmentAgreement`).

**Why it looks wrong**: The commitment already carries a random 32-byte
`salt`, so a second random value reads as a duplicate. A value declared in
every private spec reads as boilerplate the SDK could add on its own, under a
reserved key. And a public clause carrying none reads as an inconsistency.

**Why it is correct**: The commitment's `salt` is the order's identity, not a
secret: `OrderCommitted` emits it on both paths (§ 5, § 12), so a value
derived from it is public and blinds nothing. A private value of few
possibilities is published only as a fingerprint: the clause's data hash
under the `checkoutHash`, and a witness's `contentRef`, while the spec is
public. Without a random value inside the hashed bytes, anyone confirms the
value by hashing each guess. The value sits inside the set as a declared
field, so it enters the canonical JSON of stage 0 and the ABI bytes of a
stage like any field: no hash function, leaf, content reference, CID or
contract changes, and both engines validate and encode a `bytes32-hex`
string. Both engines apply the set's rules (`parseClauseSpec`;
`parse_clause_spec`, `prover/clause/src/spec.rs`), so gate S of a plaintext
attestation refuses a spec that breaks them, and gate C refuses a private
set's content without its blinding value. A reserved key that no spec declares would be
refused as an undeclared field by both validators, dropped by the encoder
from a witness's bytes, and refused by a stranger's validator written from
the published format, so the rule would live outside the spec a tool fetches.
A public set's content is published, so a random value there hides nothing,
and it would make public fingerprints unreproducible from what is published.
The cost is stated in `docs/DATA_LAYER.md` § "A private fingerprint carries a
blinding value": the filler draws the value, so a careless or hostile filler
weakens the other party's privacy in that clause, and the gate catches only
a zero or a repeat.

**Tests**: `sdk/tests/clauses/spec.test.ts` and
`sdk/tests/clauses/schema-conformance.test.ts` (each rule, in the parser and
in the published definition); `sdk/tests/clauses/engineVectors.test.ts` and
`prover/clause/tests/engine_vectors.rs` (each rule, both verdicts, the same in
both engines); `prover/lib/tests/parity.rs` (a blinded private clause passes
the plaintext form's gates, and a private set without its blinding field is
refused at gate S);
`sdk/tests/blinding.test.ts` (two commitments of one private value differ in
data hash and `checkoutHash`; the holder reproduces the fingerprint through
`anchorAgreement` and a guess of the value alone does not; a public clause
gains nothing; a present value is kept; private-stage preparations differ and
public-stage ones agree; without Web Crypto the fill throws; the agent paths
draw it); `sdk/tests/projection.test.ts` (the sign gate's three refusals;
the public form keeps the `checkoutHash` and withholds the value with the
clause); `frontend/tests/lib/checkoutBlinding.test.ts` (a rebuild of a
checkout draft keeps its `checkoutHash`);
`frontend/tests/lib/contentHandoffFingerprint.test.ts` (the hand-off
clause's private stage 1: one artifact under two orders gives two
fingerprints, a guessed artifact is not confirmed, the counterparty
recomputes the fingerprint and keeps its copy, and the evidence file pinned
in public carries neither the hash nor the value);
`frontend/tests/lib/deviceEvidence.test.ts` (a device capture's public
identifiers, under a value drawn per capture, the same scheme outside a
clause).

---

## 34. The sign gate refuses an agreement whose design it could not read

**Pattern**: An agreement whose provenance leaf names a design (an
`processDesignHash` and an `agreementHash`) is signed only against that design in
hand. The gate (`validateCommitmentAgreement`, thrown by
`assertAgreementSignable`, `sdk/src/projection.ts`) takes the design as a
required argument, and `designIssues` refuses the agreement when the design is
`null`: "the agreement instantiates assembly …, which was not read, so its
designer values cannot be checked". Every reader that hands the gate its
design answers `null` on a failed or empty read: `readSigningInputs`
(`frontend/lib/checkout/orderCommitmentFlow.ts`), which first loads the
agreement's clause specs through `ClauseRegistry`, on the buyer's sign, the
counterparty's accept, the race candidate's counter-sign, the broadcast of a
fully signed payload and the `/sign` review; `readOfferDesign` (`sdk/src/agent/originate.ts`) on
the agents' offer, race and quote handlers, which refuse every offer naming a
design when the operator gives no reader. On `/sign` the review shows the
refusal before any signature, and its heading names the design that was not
read. The gate compares the merkle root with the signed `checkoutHash` only
when no other issue stands, so the review says the terms do not match that
hash only beside the gate's `(merkle)` issue; any other refusal reads that
the terms are refused. An agreement with
no provenance leaf names no design and is not checked against one.

**Why it looks wrong**: `docs/OPEN_WORLD.md` § 1 holds that a read which
fails or resolves empty is absence, never a stand-in and never an error a
page builds on. A failed fetch of an assembly from IPFS is an ordinary event,
so refusing on it hands a party's signature to a gateway's uptime. And an
agreement that names no design signs without the check, so naming a design
looks to cost its parties more than naming none.

**Why it is correct**: Absence is the rule of a display; a signature binds.
The provenance leaf is inside the merkle root the `checkoutHash` commits, so
a party that signs asserts the order instantiates that design. Only the
design shows what that assertion holds: which clauses the registered
agreement composes, which values its designer set under
`block.design.fills`, and how many orders the entry follows. Without it the
signer cannot tell whether the counterparty dropped a clause, added one, or
changed a designer's value. Were an unread design read as nothing to check,
a party could escape every one of these checks by naming an assembly no
registry anchors, since its read then resolves empty
(`frontend/tests/e2e/sign-gate-design.devnet.spec.ts` signs such a payload
and is refused). The refusal is the same rule the gate holds for a clause
whose spec is not loaded and a clause whose content is withheld: a signer
binds nothing it cannot read. An agreement with no provenance claims no
design, so no designer value exists for it to keep. The cost is time: a read
that fails holds the signature until a read succeeds, and no bond moves
meanwhile. The gate is the SDK's and the reference frontend's, not the
Core's: `FigaroCore` reads the `checkoutHash` as 32 bytes and no agreement,
so a stranger's tool that signs without the design is refused nothing on the
chain, and its party carries what the gate would have caught.

**Tests**: `sdk/tests/projection.test.ts` (an agreement naming a design that
no one read is refused; one naming a design read and kept signs);
`sdk/tests/originate.test.ts` (the seller refuses an offer whose design it
cannot read); `frontend/tests/lib/signGateDesignRead.test.tsx` (both sign
flows refuse an agreement whose design cannot be fetched or does not verify);
`frontend/tests/components/SignPageFlow.test.tsx` (the `/sign` review names
the unread design in its heading; a clause that breaks its spec is refused
without being called a mismatch, beside an unread design or alone; only a
signed hash that differs from the root is called one; a malformed provenance
is not called an unread design);
`frontend/tests/e2e/sign-gate-design.devnet.spec.ts` (an assembly no
registry anchors is refused on counter-sign and on broadcast, with no
`OrderCommitted` and no balance moved, read out of band).

---

## 35. `resolveProcess` pays an order before it marks the order resolved

**Pattern**: Inside its loop, `FigaroCore.resolveProcess` checks that an
order's `orderStatus` is 1, sends the seller's payout and the buyer's refund
with `safeTransfer`, and only then sets `orderStatus` to 2. It sets
`activeOrderCount` to zero after the loop. The function carries
`nonReentrant` (`src/core/kernel/FigaroCore.sol`).

**Why it looks wrong**: The usual order is checks, then effects, then
interactions. Here an external call to the token comes before the write that
marks the order resolved. A token that calls out on transfer can run code while the order
still reads as open.

**Why it is correct**: Every reader of the status is safe in that window.
`orderStatus` has three readers in the contracts, and each one is checked
here.

1. `FigaroCore` itself, in `commit` (`DuplicateCommitment`) and in
   `resolveProcess`. Both functions carry `nonReentrant`, and they share one
   guard. A call back into either one during a transfer reverts with
   `ReentrancyGuardReentrantCall`, so no second payout and no new order can
   use the stale status.
2. `AttestationCoordinator`, a separate contract with no storage, reads the
   status in `_requireKnownCommitment` and accepts an attestation only on an
   order at status 1. A callback can attest an order whose payout has left
   and whose status is still 1. That attestation moves no token and writes no
   state: the coordinator only emits `Attestation`. It lands in the same
   transaction as the resolution, before that order's `OrderResolved`, as an
   attestation in the block before would. The window still closes at resolve
   (§ 6). If the resolve reverts, the attestation reverts with it.
3. `UsageCounter`, in `_requireResolvedOrder`, counts an order only at
   status 2. During a callback, only the orders the loop already finished
   read 2, and each one's payout has already left. A use counted then is the
   use a later transaction would count, and the counter's once-ever
   `processCounted` stops a second count. If the resolve reverts, the count
   reverts with it.

The resolution is one transaction, so a reader outside it sees status 1
before and status 2 after, never the window. The guard holds the function,
and the place of the status write changes no outcome for any of the three
readers.

**Tests**: `test_resolve_reentry_isBlocked_payoutsStillCorrect` and
`test_commit_reentry_isBlocked_resolutionStillCorrect`
(`test/ReentrancyAdversarialTest.t.sol`) arm `MockReentrantToken` to call
back into `FigaroCore` and assert the guard's own error and one payout each.
`test/ResolutionWindowReadersTest.t.sol` calls back into
`AttestationCoordinator` and `UsageCounter` from inside every transfer of a
resolution: `test_eachReaderInsideAResolutionsTransfers_readsWhatTheEntrySays`
holds items 2 and 3 (an order at status 1 is attested, one at status 2 is
refused, the counter counts a paid order once and refuses an open one, and the
payouts are those of a resolution with no callback), and
`test_aResolutionThatReverts_takesTheCallbacksAttestationsAndCountWithIt`
holds that a reverted resolution takes the callbacks' writes with it. Moving
the status write before the transfers fails both.
## 36. A stage-0 attestation is not the signed content; a reader compares its `contentRef` with the leaf's data hash

**Pattern**: A clause may declare a `"0"` key in `stages`. The content the
parties sign is then validated over `fields`, at the sign gate
(`validateCommitmentAgreement`, `sdk/src/projection.ts`) and in the guest's
gate for a re-asserted clause (`ContentKind::ReAssert` in
`validate_attestation_content`, `prover/lib/src/kernel.rs`). Content
attested at stage 0 is encoded and validated over `stages["0"]`
(`contentFieldsFor`, `sdk/src/clauses/encode.ts`; `encode_content_from_spec`,
`prover/clause/src/encode.rs`). `AttestationCoordinator` takes any
`contentRef` at any stage and checks only that the leaf opens against the
signed `checkoutHash`. So a stage-0 attestation of a clause is a
re-assertion of the signed content only when its `contentRef` is the leaf's
data hash (`hashClauseData`, `sdk/src/agreement.ts`; for the provenance
leaf, `provenanceContentRef`). A reader that asks whether a party
re-asserted a clause compares the two; the reference frontend's re-assert
card does (`deriveProcessModelFromRuntime`,
`frontend/lib/semantic/deriveProcessModelFromRuntime.ts`).

**Why it looks wrong**: Stage 0 reads as the signing stage: the content
the parties sign is the stage before any runtime evidence. A reader that
takes every stage-0 attestation as the signed content needs no hash. A spec format with one meaning for stage 0
would seem simpler.

**Why it is correct**: The stage is a `uint8` the attesting party picks, and
nothing on the chain ties stage 0 to the signed bytes; only the leaf's data
hash does. A `"0"` stage key is the decimal of a `uint8` like any other
(`stageOfKey`, `sdk/src/clauses/spec.ts`; `parse_stage_key`,
`prover/clause/src/spec.rs`), so refusing it would make one stage unlike
the rest for no rule of the mechanism. The re-assertion's own form already
names the signed bytes: its `contentRef` is `keccak256(clauseData)`, the
leaf's data hash, on both paths. A reader that compares the two is right for
every spec, a spec with a `"0"` key and a party that files other content at
stage 0 included. A reader that does not would take a party's stage-0
witness, or any `contentRef` the coordinator accepted, for a re-assertion of
what was signed. The reference frontend offers no re-assert card for a
clause that declares a stage-0 witness, so its witness owns that stage.

**Tests**: `frontend/tests/lib/deriveProcessModelFromRuntime.test.ts` (a
stage-0 attestation whose `contentRef` is not the leaf's data hash leaves
the clause, and the provenance leaf, to be re-asserted);
`prover/lib/tests/parity.rs` (a re-assertion passes gate C over `fields`,
and a witness at a declared stage validates over that stage's set).

---

## 37. The grain cap is as firm as the values the designer allows the sibling `formatFromField` names

**Pattern**: A string field that declares `formatFromField` takes its format
from the named sibling's committed value, then from that sibling's default,
then from its own static `format` (`resolveInputFormat`,
`sdk/src/clauses/spec.ts`; `resolve_input_format`,
`prover/clause/src/validate.rs`). The grain cap applies only when the
resolved format is one of the four standards whose grain both engines read
(`sdk/src/clauses/grain.ts`, `prover/clause/src/grain.rs`): `geohash` (6
characters for a public value, 12 for a private one), `h3` (resolution 8 and
15), `s2` (level 13 and 30) and `olc`, the Open Location Code (length 6 and
15). Under one of the four, a value that is no code of the standard is
refused too, because no grain can be read from it. When the sibling carries
any other standard's name, the cap is lifted and the field's `maxLength`
bounds the value. Both engines apply the same rule. The reference clause
`figaro-geolocation` declares its `geocodeStandard` sibling as an `enum` of
the four, so under it every public endpoint is capped.

**Why it looks wrong**: In a stranger's clause that declares the sibling as
a free string, the party that fills it can write `"Geohash"`, `"maidenhead"`
or any other name, and then commit a location finer than the cap. The cap
reads as a privacy guarantee that one word lifts.

**Why it is correct**: The engines know the grain of four standards, by
their format value, and no list of the others (`docs/OPEN_WORLD.md` § 1): a
closed list of standard names would refuse a standard no one has registered
yet. So the cap is a rule for a value the spec says is a code of a known
standard, and the designer decides how firmly a value is one. A designer who
wants the cap firm declares the sibling as an `enum` of capped standards, or
gives it a `pattern`, so the sibling cannot carry another name; the
reference clause does so. A designer who leaves it a free string accepts
every standard and, with it, the field's `maxLength` as the only bound. The
party that fills the field also fills the sibling, so the cap guards that
party against writing more than the field needs, never against its own
choice. The counterparty reads the committed standard and the value before
it signs, and a party that will not have a finer location published declines
to sign it.

**Tests**: `sdk/tests/clauses/engineVectors.test.ts` and
`prover/clause/tests/engine_vectors.rs` (the same verdicts in both engines:
each capped standard at its public cap and one grade past it, at its private
cap and past it, and a value that is no code of it; an `enum` sibling of the
four capped standards; a sibling naming another standard lifts the cap, an
`enum` sibling whose default is geohash keeps it, a sibling whose value is no
string falls back to the static format, and of two siblings of one name the
first gives the default). `sdk/tests/clauses/examples.test.ts` holds the
reference clause to each cap and refuses a standard outside its enum.

---

## 38. `RpgfMinter.claim` checks the period budget although consistent counter data already bounds it

**Pattern**: `claim` reverts with `PeriodBudgetExceeded` when
`minted[periodId] + amount > periodAmount[periodId]`. On consistent data from
`UsageCounter` the check cannot fire: `_entitlement` refuses a list with a
repeated `(kind, key)`, pays each key only to the one wallet that registered it and
only once per period (`claimed`), and `totalScoreIn` is the sum of every key's
score in a closed period. So the scores claimed in a period sum to at most
`totalScoreIn`, and the floored pro-rata amounts sum to at most the budget.

**Why it looks wrong**: A check that cannot fire is dead code, and an
unreachable revert in a minter reads as either a misunderstanding or a path
someone means to open.

**Why it is correct**: It is a backstop, the same shape as `FlorinToken`'s
supply cap (§ 28). The minter trusts the counter's arithmetic for the bound;
the check states the bound in the minter itself, at the one function that
mints, so a fault in the counter's tally (a score above its own period
total) is refused rather than minted from other designers' share of the
period. It costs one storage read per claim and changes no outcome on
consistent data.

**Tests**: `test_budgetBackstopRefusesOverMintOnInconsistentCounterData`
(`test/rewards/RpgfMinterTest.t.sol`) feeds the minter a counter whose score
exceeds its period total and requires the revert.

---

## 39. The buyer's attestation type signs `processId` beside `orderHash`; the seller's does not

**Pattern**: The batch path authorizes an attestation by an EIP-712 message
in one of two types. The seller signs
`AttestSeller(bytes32 orderHash,bytes32 clauseId,uint8 stage,bytes32 contentRef)`;
the buyer signs
`AttestBuyer(bytes32 processId,bytes32 orderHash,bytes32 clauseId,uint8 stage,bytes32 contentRef)`
(`prover/lib/src/eip712.rs:94` and `:115`;
`src/core/verifier/FigaroBatchVerifier.sol:779-782`). The guest recovers the
signer over the role's type (`apply_attestation`,
`prover/lib/src/kernel.rs:637-652`), and the verifier asks a wallet's code
about the same digest (`_attestDigest`,
`src/core/verifier/FigaroBatchVerifier.sol:945`).

**Why it looks wrong**: Two parties attest about the same order, yet their
messages differ by one field. The difference reads as a field the seller's
message is missing, so that a seller's signature might be applied to an
order of another process.

**Why it is correct**: The order hash already binds the process.
`orderHash = keccak256(processId ‖ structHash)` on every path:
`compute_order_hash` (`prover/lib/src/eip712.rs:157`),
`_requireKnownCommitment` (`src/core/attestation/AttestationCoordinator.sol:183`)
and `_attestTarget` (`src/core/verifier/FigaroBatchVerifier.sol:927-928`). The
guest (`derive_commitment_ids`, `prover/lib/src/kernel.rs:314`) and the
verifier (`_attestTarget`, `src/core/verifier/FigaroBatchVerifier.sol:920`)
both derive the two ids from the one target commitment, so a
relay cannot pair a signed `orderHash` with any other `processId`, and the
attestation is refused unless that order is committed and unresolved. An
`orderHash` of one process cannot equal one of another without a keccak
collision, and the domain pins the chain and the verifier. So the seller's
message is bound to one order of one process, and the buyer's `processId` is
a second statement of a fact `orderHash` already fixes: it can neither widen
nor narrow what the signature authorizes. Changing either type would change
every signature, the guest's bytes, and so the verification key, the verifier
and the SDK's parity vectors (`sdk/tests/eip712Parity.test.ts`,
`prover/lib/tests/eip712_vectors.rs`), for no gain in what is bound.

The difference comes from the Version 5 baseline (commit `74005ba36`). There
the direct path's `attestAsBuyer` took `processId` and `orderHash` as its
arguments, and `attestAsSeller` took the seller's commitment and `orderHash`;
each batch type listed the ids its direct call named. Commit `6acabf95c`
gave the buyer's call the target commitment in place of the ids, and the
seller's a role and a target commitment; commit `2d7d03260` left the seller
only the target (`src/core/attestation/AttestationCoordinator.sol:106` and
`:128`). The two signed types kept their shape (`schemaId` since named
`clauseId`).

**Tests**: `prover/lib/tests/eip712_vectors.rs` and
`sdk/tests/eip712Parity.test.ts` hold both types' digests equal in the guest
and the SDK; `FigaroBatchVerifierTest` and `OperationStreamVectorsTest` hold
the verifier's `_attestDigest` to the same type strings.

---

## 40. The reference frontend reads a clause spec only when its bytes hash to the CID in the registered URI

**Pattern**: `ClauseRegistry` stores a clause key and a `contentURI`, once, by
whoever registers the key first (§ 7). The key is the hash of the spec without
its `block` (`computeClauseKey`, `sdk/src/discovery.ts:102`), so a reader's key
check (`anchorClauseSpec`, `sdk/src/anchored.ts:65`) accepts any `block`. The
reference frontend's default fetcher (`defaultClauseSpecFetcher` in
`frontend/lib/shared/clauseSpecSource.ts`) therefore checks a second hash
before the key check: it recomputes the CID of the fetched bytes in the form
the URI's CID states (`checkContentAddress`,
`frontend/lib/shared/contentAddress.ts`) and accepts the bytes only on a match.
Bytes that do not match, and a URI whose CID form it cannot recompute, are a
permanent load failure (`getClauseSpecLoadError`), and every surface leaves the
clause's place empty (CLAUDE.md § "Open world").

The forms it recomputes are the ones the project's pinning produces: Kubo's
`add` with its defaults (`pinBlob` and `pinJSON` in
`frontend/lib/shared/ipfsService.ts`, `pinForm` in
`frontend/scripts/populate-clauses.mjs`), which gives a CIDv0 over UnixFS
dag-pb blocks under sha2-256; `add --cid-version=1`, which gives a raw block
or a UnixFS root with raw leaves; and `block/put` with the raw codec under
sha2-256 or keccak-256. A UnixFS file is rebuilt with Kubo's default import,
262144-byte chunks under one balanced root of at most 174 links. Any other
hash function, codec, chunker, a deeper tree, a path below the CID, a base36
CID and an `http(s)://` locator are refused, never trusted.

**Why it looks wrong**: The key already anchors every byte a party signs and
every hash the chain or the proof program reads, and a hostile `block` cannot
change any of them (§ 7). A second hash over presentation looks redundant, and
refusing a `contentURI` the reader cannot verify looks harsher than the
registry, which accepts any string.

**Why it is correct**: The key leaves the `block` out so that a designer may
change presentation without changing the clause; it does not make the `block`
anyone's to change in transit. Without the CID check, the `block` the
frontend reads is whatever the gateway or any transport between it and the
reader serves: a field's label, its article and the reference tooling's rules
for collecting the data (`docs/CLAUSES.md` § "Clause-spec format"). With it,
the `block` is the one the registrant pinned, so a gateway is an untrusted
transport, as it is for the key-anchored half. The check binds the bytes to
the registrant's choice, not to an honest registrant: a first registrant
chooses its own `block`, and § 7 states that residual. The check is the
reference frontend's; the Core, the registries and the SDK read no `block`,
and another frontend chooses its own rule. A URI form the frontend cannot
recompute is refused rather than read, because a `block` read from such a URI
is exactly the unchecked transport the check closes.

A lying gateway makes the clause unreadable for the session, even when
another gateway in the chain would serve the pinned bytes: the gateway chain
(`walkGatewayChain` in `frontend/lib/shared/ipfsService.ts`) falls through on
a failed read only, and the check runs after it.

**Tests**: `frontend/tests/lib/contentAddress.test.ts` checks each form
against the CID Kubo 0.42 reports for the same bytes (one chunk and three
chunks, CIDv0 and CIDv1, sha2-256 and keccak-256, base32, base16 and
base58btc), a changed byte as a mismatch, and each refused form as
unverifiable. `frontend/tests/components/RegistryExplorerContentState.test.tsx`
serves a spec with a swapped `block` under its registered CID through the
default fetcher and holds that the registry page shows no row for the clause
and no failure text.

---

## 41. A withdrawn key forfeits its unclaimed periods; the key registries return a stake in one call

**Pattern**: `RpgfMinter._isAuthor` requires the key's registration stake to be
live at the claim. A designer that withdraws the stake of a clause, an
agreement or an assembly before claiming loses every closed period of that key
not yet claimed. `ClauseRegistry`, `AgreementRegistry` and `ProcessRegistry`
return the stake in one call, `withdrawDeposit(key)`, by the stored
`registeredBy`, once, with no wait.

**Why it looks wrong**: a closed period the counter scored under a live stake,
lost because the stake was withdrawn later, looks like earned rewards taken
back. And `MembersRegistry` holds its stake for a cooldown (§ 14), so the three
key registries returning theirs at once looks like a missing guard.

**Why it is correct**: the forfeit is the claim-time half of the live-stake
check, and the check runs at both ends: at the count (§ 18) and at the claim.
The paper at `/papers/substrate-broadening-rpgf` grounds it: it closes the path
of registering, farming and withdrawing, because the stake that makes a
registration costly cannot be recovered while the registration still earns. A
check at the count alone would let a designer withdraw as soon as its last use
counted and still claim. The capital behind the paid replication lever (§ 18)
would then be held only through the farming, not through the period and its
claim. `script/DeployMainnet.s.sol` sizes the stake on that whole span. The
forfeited share stays in the period's total and is never minted, so the pool
under-pays and never over-pays. The order that keeps a period is claim first,
then withdraw, and that order costs the designer nothing.

The key registries need no wait. § 14's wait stops one stake being recycled
across identities, and a key registry holds no identity. A key is the hash of
the content, and the registry holds no name, so there is nothing to take but
bytes (§ 7). A designer whose exact bytes another registered first registers a
new key. A clause's designer gets one by any change to the spec outside
`block`. An agreement's key covers only its clauses' keys and the values filled
for them (`agreementHashOf`, `sdk/src/assembly.ts`), so a new agreement key
needs a changed clause or a changed value. An assembly's key is the root over
its agreements, so a new one needs a changed agreement. The stake prices a key
through the reward: the key earns only while its stake is live, at the count
and at the claim. A designer releases a new version by withdrawing the old key
and registering the new one. A wait would hold a second stake for its whole
length on every release.

**The accepted residual: a key burned for the price of gas.** With a one-call
withdrawal, a rival that sees a designer's registration in the mempool can
register the same key first and withdraw it in the same transaction. Its stake
comes back at once, so it pays only gas. The key stays registered and
withdrawn for good: no use of it is ever counted (§ 18), and the designer's
transaction reverts as a second registration. The rival can do so again for
each new key the designer tries. The stake prices a front-runner that keeps
the key, because that stake must stay live for the key to earn; it prices
nothing for one that burns the key. What bounds the burn is that the
registering page pins the content and registers in one act, so nothing shows
before the transaction reaches the mempool, and a private mempool closes the
rest.

**Tests**: `test/rewards/KeyWithdrawalRegressionTest.t.sol`: a designer that
withdraws its stake after a period closed and before claiming cannot claim it,
and the share is never minted; a designer that claims first and then withdraws
keeps the period. Each registry's suite (`test/registries/*RegistryTest.t.sol`)
holds the one-call withdrawal by the registrant, once; `RpgfMinterTest` holds
the forfeit on each kind.

---

## 42. A pattern past a size is refused at parse, and long values are refused rather than run

**Pattern**: a string field's `pattern` has one expanded size, computed alike
by `portablePatternSize` (`sdk/src/clauses/safeRegex.ts`) and
`portable_pattern_size` (`prover/clause/src/validate.rs`). A spec whose pattern
is past `MAX_PATTERN_EXPANSION` (4,096) does not parse, in either engine. A
value whose length in UTF-16 units times its pattern's size is past
`MAX_PATTERN_WORK` (4,194,304) is refused with its own reason, "string too long
for pattern", without the pattern run. One content, one call of
`validateContent` or `validate_content`, adds that work over every value a
pattern is run on. Its values are visited in the spec's field order and by
array index, depth first. When the next value would take the total past
`MAX_CONTENT_PATTERN_WORK` (16,777,216), the content is refused once, at `$`,
with the reason "content too long for its patterns". Every other value is run
against its pattern, whatever the pattern's shape and the value's length.

**Why it looks wrong**: both engines match in time linear in the value, so a
limit on what they run looks like the skip it replaced. A value that matches
its pattern can be refused because it is long, and a list of values can be
refused because it is long. Three numbers decide this, and nothing in the
mechanism fixes them. The size limit also refuses patterns both engines used
to accept. Before, a counted quantifier multiplied its item by its count and
nothing more, and a group, a `|`, `*`, `+` and `?` added nothing. So counted
items under counts at the old bound parsed: `(?:a{64}){64}`, `(?:\w{64}){64}`,
`(?:a{1,64}){64}` and `^(?:a{64}){63}a{62}$`. Alternation under counts parsed
too, such as `(?:(?:ab|cd){64}){16}`, and so did nested quantifiers under
counts, such as `^(?:(?:a+){64}){63}$`. The guest compiled all of them, and
none of them parses now.

**Why it is correct**: linear in the value is not cheap. The cost per
character is the size of the pattern's automaton, and the old count did not
measure it. An automaton holds a state for each item, a split for each `|`, a
split and a jump for each `*`, `+` or `?`, and a split for each optional copy
a counted range writes. The old count left those out, so a pattern under its
bound could hold several times as many states as it counted. A pattern with
`*` nested twenty deep under two counts counted 4,034 and cost the guest about
7 ms a character in a release build. The fuller count is the true one because
it counts what both automata hold. Under it the SDK's automaton holds at most
three instructions per unit, and the guest's no more than a small constant
number of states. The relay runs the same check when it admits an operation,
and a proof pays it again in cycles. The two engines used to skip such a
pattern, or a value past 4,096 characters, and count the field as satisfied. A
skip lets a stranger's clause carry a term the parties sign and nothing checks.
A refusal keeps every admitted term checked and puts the cost on the party that
wrote the large pattern or the long values. The per-value budget alone bounds
one value, not one content: before the total, 1,000 values at the budget's
edge in one content of about 1 MiB cost the guest 29 seconds. The guest
compiles every pattern under the size limit within its explicit 8 MiB size
limit, so no spec parses in one engine and not the other. That margin is a
property of the `regex` crate the guest builds with, 1.13.1 with
`regex-automata` 0.4.18 (`prover/Cargo.lock`). That version counts 8 bytes
for each byte range of a class, and a portable class holds at most 49
ranges: every other printable character, negated, with the bytes outside
printable ASCII. So the classes of a pattern at the size limit cost at most
4,096 units × 49 ranges × 8 bytes, some 1.6 MB, and its states some 134 bytes
a unit more in every shape measured. The widest class found,
`` [^ "$&(*,.02468:<>@BDFHJLNPRTVXZ\\\^`bdfhjlnprtvxz|~] `` under counts at the
limit, needs 1,002,192 bytes, about 244 bytes a unit. The maintainer approved
this design: one shared measure, a parse limit, and a work budget that
refuses, per value and per content. An agent set the numbers from
measurements, natively in a release build on a machine other jobs also
loaded, so each figure is a range over repeated runs. At the per-value edge
the costliest pattern found cost the guest 50 to 175 ms, the widest classes
the most, and the SDK up to about 150 ms. At the content's edge the costliest
content found cost the guest 0.2 to 0.53 seconds, which is above a quarter of
a second and below one second, and the SDK about 0.6 seconds. The
1,000-value content is refused after four values, in that time. The list of
reasons a refused content carries is not bounded; one reason per value at
most, so the number of values, which the relay's 1 MiB request body bounds,
bounds its cost, and the proof program reads only the first reason. The reference
patterns are far under all three numbers: the domain-name pattern counts 13
and runs on up to 322,638 characters, and a content holds 1,925 32-byte
hashes. A field that wants short values declares `maxLength`, which is
refused first and adds nothing to the total.

**Tests**: `sdk/tests/clauses/safeRegex.test.ts` holds the measure on each
construct and on the reference patterns, the size limit at 4,096 and 4,097,
the per-value budget at its edge and one character past it, the content's
total at 1,925 and 1,926 hashes, each refusal's reason, and the costliest
patterns at the edge in bounded time.
`sdk/tests/clauses/engineVectors.test.ts` fits each costly shape to the limit,
under the largest count that keeps it and one more, and checks that every one
the SDK parses builds its automaton. The frozen verdicts in
`test/fixtures/clause-engine-vectors.json` lock both edges of each limit to
the guest's (`prover/clause/tests/engine_vectors.rs`), the many-small-values
shape and a total over two fields included.
`prover/clause/tests/conformance.rs` holds the same limits, the reasons and
the costliest patterns at the edge; it compiles the widest classes and the
other costly shapes in a quarter of `PATTERN_SIZE_LIMIT`, and runs the widest
classes at both budgets' edges. The SDK refuses a value under a pattern it
cannot run, with a reason of its own, and builds the automaton when the spec
parses (`safeRegex.test.ts`). The clause leg of
`scripts/test-cross-impl-fuzz.sh` draws patterns on both sides of the size
limit, values at both edges of the per-value budget, and lists at both edges
of the content's total.

---

## Summary Table

| # | Pattern | Blast radius | Looks wrong because | Is correct because |
|---|---|---|---|---|
| 1 | Resolved processId is permanently closed | Core-critical | Closure-less extension "sounds protocol-aligned" | The closure IS the institution dissolving; follow-on rounds sign a fresh root; the gate derives from existing state |
| 2 | buyer == seller allowed | Core-critical | Self-dealing vector | Bond math balances; bilateral signature required |
| 3 | No admin/pause | Core-critical | No incident response | Admin = trusted third party = breaks mechanism |
| 4 | Buyer key loss is terminal | Core-critical | No stuck-fund recovery | Timeout = escape hatch = breaks MAD equilibrium; code the party's wallet installed with its key resolves (the buyer) and attests (either party) on both paths (`msg.sender` on the Core, ERC-1271 asked by the verifier on the batch path: a refused resolve and a refused attestation each revert the batch) |
| 5 | No prevrandao salt | Core-critical | Missing on-chain entropy | Validators predict prevrandao; party-chosen salt sufficient |
| 6 | Attestation reverts on resolved orders | evidence-layer | Rejecting legitimate late evidence | Evidence window closes with the institution; forums get the closed data |
| 7 | Permissionless clause registry | registry/discovery | Namespace squatting | The key is the hash of the canonical spec without its `block`: there is nothing to squat but bytes, two specs with one name are two clauses; integrity routes through the key, never the registry; garbage pollutes discovery only, priced by the stake |
| 8 | No competitive-pricing contract | — | A market protocol without a price primitive looks unfinished | Mid-chain unknown price or counterparty is incompatible with the exact-match accumulator; pricing is a catalog concern |
| 9 | Strict token compatibility rejection | Core-critical | Overly restrictive | Bond math requires exact amounts; wrapping is the solution |
| 10 | Single currency per process | Core-critical | Can't do multi-token commerce | 2:1 bond ratio is Nash-stable only in one currency; multi-token lives at composition layer (process / wallet swap / Level-3 bundler) |
| 11 | No `transferTitle` / `endorse` / `nominate` for BoLs | Core-critical | Industry-standard MLETR-aligned eBLs are negotiable; CargoX / TradeTrust / TradeLens all implement this | Single-buyer invariant + parties-fixed-at-commit + no-escape-hatches each separately rule it out; cargo doesn't carry rights, the commitment does |
| 12 | `commitDeadline` alongside `salt` | Core-critical | Redundant / auction residue | Salt is identity, deadline is expiry of the unconsummated signature window; no-cancel `FigaroCore` needs signatures to age out |
| 13 | Committed `lineItems.name` / `cargo.marks` are public | privacy/evidence | Wallet-linkable purchase content leaks | Mechanism needs line items beyond the endpoints (invoices, disputes, price checks); mitigation is compositional (discreet catalog naming, coded marks) + wallet pseudonymity |
| 14 | `MembersRegistry` withdrawal cooldown holds ETH on a timer | registry/stake | Looks like stuck funds + a Core-forbidden time lock | PROTOCOL tier, not the Core — no bond or commitment involved; without it one stake is recycled across identities and prices nothing; bounded, immutable, and unconditionally claimable after `releaseAt` |
| 15 | `applyBatchAccrual` has one privileged caller | reward-path | A named writer on the reward path is the shape of an admin backdoor | Discretion, not permission, is the test: the caller may only hand over uses an immutable vkey committed; the counter enforces period, seller stake, live registration and once-ever counting itself |
| 16 | Recorded usage can score zero (`minSellers` floor) | reward-path | Real resolved trade with `score = 0` reads like lost accrual | Below 3 staked sellers sits what one actor fabricates alone; sub-floor accrual defers within the period (full score springs at the third seller) and expires when the period closes; the floor reads the one tally both routes feed, and a seller counts toward it once |
| 17 | No per-recording charge or burn | reward-path | Fabricating `c` costs only gas | `c^(1/3)` already crushes volume farming; breadth is deposit-priced; an ETH burn destroys value needlessly and a DAO-routed charge inserts an institution + usage-coupled revenue into an identity-free mechanism |
| 18 | Usage needs a live clause, agreement or assembly registration stake | reward-path | A proven, resolved use that scores nothing reads like lost accrual | The clause-or-assembly key is otherwise a free-choice merkle leaf; without the gate a self-dealt process inflates the shared denominator at gas cost; closes the FREE dilution, leaves the accepted stake-priced replication lever |
| 19 | Rewards accrual never reverts resolution (skip + try/catch) | reward-path | A silently-droppable reward write looks like lost/manipulable accrual | A reward-tier gate must not unwind resolution-tier trade; a skipped use stays uncounted and may be proved again in a later batch (conservative under-pay); the sequencer pre-filters what the counter would skip; an accrual starved of gas reverts the batch, never skips, since anyone could send a copied call starved first |
| 20 | Member-stake gate on the seller of record is retroactive | reward-path | A withdrawal stops resolved-but-uncounted trades counting — looks like a grief hole | Chain can't see resolve time (`FigaroCore` stores none), so the gate is read when a use is counted; counting at resolution closes the normal window; an uncounted use counts in whichever period is open once its seller stakes again, lost only after the last period closes; residual grief is self-limiting (griefer forfeits own eligibility while unstaked) |
| 21 | Batch resolve: nonce-less, deadline-less `ResolveProcess(processId, runningTotal)` authorization, by the buyer's key or its wallet code | batch-path | The canonical EIP-712 replay shape | The authorization binds a cumulative value, so it pays exactly the prefix of the process that value names and a later commit invalidates it; resolution is terminal and single-shot — the guest's root-chained state rejects a second resolve; the domain pins chain + verifier so the signature travels nowhere; a wallet-code attestation's refusal reverts the batch by name, a call that ran out of gas included, so no gas limit lands a batch without it, and the relay dead-letters it alone |
| 22 | No site pinning account; a browser with no node and no service publishes nothing | site/pinning | A visitor without a node cannot publish until it sets one | A bundled credential names its holder and makes one account a central dependency; each publishing wallet pins through its own node or a service it chose, on every chain; with neither, a publishing page shows one line and the setting, and nothing is sent |
| 23 | Reward keyed by (kind, key), three kinds | reward-path | A family discriminator looks like the reward crossing the registries' boundary | Each registry takes any bytes32 and nothing tells the families apart by bytes; without the kind a stranger staking an assembly's hash as a clause or an agreement would take its reward; the kind keeps a stake in one family from earning another's, and no kind's gate reads another kind's registry |
| 24 | The assembly root is a merkle tree over registered agreement hashes | registry/reward-path | No stored list of an assembly's agreements; a caller-supplied proof | A stored list or a cross-registry lookup is an edge between parallel families; the root commits membership, so a proof either reaches the registered root or fails |
| 25 | Ordered agreements; one agreement may hold two | registry | A repeated key looks like a duplicate leaf | Designs repeat terms; the index makes each leaf distinct and the root commits the multiplicity; usage counts once per process per (kind, key) |
| 26 | The attestation signature does not cover the witness form | batch-path/evidence | A relay can submit a plaintext operation hash-only, and the event is the same for both forms, so the in-proof check is not legible | The evidence a reader relies on (signer, open order, inclusion, `contentRef`) is identical on every path; the in-proof check assures the attesting party's own submission, not a reader |
| 27 | A state-neutral batch's proof can land twice | batch-path/reward-path | A proof submitted twice is the replay shape, and `BatchSettled` repeats | A batch that moves no state has prev root == new root; its second landing moves no token, and the counter's once-ever `processCounted` skips every use, so nothing a reader relies on changes; a batch that moved the root cannot land twice |
| 28 | `FlorinToken.mint` checks the supply cap the minters' caps already bound | token | A check that cannot fire reads as dead code | It states the billion bound in the token, at the one function that creates florins, where a stranger reads it; one storage read, no outcome changes |
| 29 | Public pieces no code of ours reads | registry/reward-path/token | Surface nothing reads is surface to audit for nothing | Each answers a stranger's question of the chain: who may mint, which keys are reserved, when a key was registered, where a stake went and how much, which sellers counted |
| 30 | Topology is not in the commitment struct | Core-critical | The process's shape reads as part of what is bonded, and the events alone do not show the graph of orders | The bonds are sized by the running total alone; the parties sign the edges through the `checkoutHash`; a wallet outside the trade reads the design's edges between its entries from the registered process design, and matches no entry to an order; the counter-signer checks a sub-order's edges before it signs; version 3 validated parent ids on the chain, version 4 signed them in the struct, version 5 moved them into the agreement |
| 31 | The topology leaf has a shape of its own | agreement format/reward-path | The provenance leaf takes the clause-leaf shape under a reserved key, and a leaf no contract rebuilds reads as unprovable | A reserved key in the clause-leaf shape could be registered by anyone and earn on every order; a 96-byte inner preimage opens under no clause key, with no contract or verification key moved, and the edges have no stage after commit to attest |
| 32 | A reader names the opening order from the chain, and the edges from the agreement | reader/frontend | A test on `runningTotal` in a reader of the process's shape reads as bond arithmetic deciding the graph | It decides no edge: it answers which order opened the process, the Core's own fact at commit; the edges come only from the agreement's topology leaf, and unknown edges are shown as none |
| 33 | A private set carries its own blinding value | data/spec format | The commitment's `salt` looks like the same random value, a declared field looks like boilerplate, and a public clause carries none | The commitment's `salt` is emitted in `OrderCommitted` and blinds nothing; a declared field enters the hashed bytes with no hash, contract or proof change and is what a stranger's tool reads from the spec; public content is published, so a random value there hides nothing |
| 34 | The sign gate refuses an agreement whose design it could not read | sign gate/SDK/frontend | A failed or empty read is absence elsewhere, and an agreement naming no design signs without the check | A signature binds the provenance leaf; only the design shows its clauses, designer values and edge count, and reading "not read" as "nothing to check" lets a party escape them by naming an assembly no registry anchors; the gate is the SDK's, never the Core's |
| 35 | `resolveProcess` pays an order before it marks it resolved | Core-critical | An external call precedes the status write, against checks-effects-interactions | `nonReentrant` refuses a callback into `commit` or `resolveProcess`; the coordinator only emits and accepts no late evidence the window did not already allow; the counter counts only finished orders once; a revert takes every callback's effect with it |
| 36 | A stage-0 attestation is not the signed content | evidence/reader | Stage 0 reads as the signing stage, so a reader takes any stage-0 attestation for the signed content | The stage is a `uint8` the attester picks and a `"0"` stage key validates stage-0 content over `stages["0"]`; only `contentRef` equal to the leaf's data hash makes a re-assertion, and the reader compares the two |
| 37 | The grain cap is as firm as the sibling's allowed values | spec format/data | One word in the sibling lifts a privacy cap | The engine knows one standard's grain and no closed list of the others; a designer makes the cap firm with an `enum` or `pattern` sibling; the filler of the field fills the sibling, and the counterparty reads both before it signs |
| 38 | `RpgfMinter.claim` checks the period budget consistent counter data already bounds | reward-path | A check that cannot fire reads as dead code | A backstop like § 28: it states the budget in the minter, so a fault in the counter's tally is refused rather than minted from other designers' share |
| 39 | `AttestBuyer` signs `processId` beside `orderHash`; `AttestSeller` does not | batch-path/evidence | The seller's message looks one field short | `orderHash = keccak256(processId ‖ structHash)` binds the process on every path, and both ids derive from the one target commitment; the buyer's extra field adds nothing to what is bound, and changing a type changes every signature and the verification key |
| 40 | The reference frontend reads a clause spec only when its bytes hash to the CID in the registered URI | frontend/reader | The key already anchors everything a party signs, and the registry accepts any URI | The key leaves the `block` out, so without the CID the `block` read is the transport's choice; with it, the registrant's; a URI form the frontend cannot recompute is the unchecked transport, so it is refused |
| 41 | A withdrawn key forfeits its unclaimed periods; the key registries return a stake in one call | registry/reward-path | A period scored under a live stake and lost at a later withdrawal looks like earned rewards taken back; no wait beside the members' cooldown looks like a missing guard | The live-stake check runs at the count and at the claim, so the stake stays held through the period and its claim (`/papers/substrate-broadening-rpgf`); a designer claims first, then withdraws. A key holds no identity and no name, only bytes (§ 7); the stake prices it through the reward, and a wait would hold a second stake on every new version. Accepted residual: a rival can register a key and withdraw it in one transaction for gas, burning it, once per key tried; the one-act pin and register and a private mempool bound it |
| 42 | A pattern past a size is refused at parse, and long values are refused rather than run | spec format/clause engine | Both engines are linear in the value, so a limit looks like the skip it replaced; a matching value or list can be refused; the fuller count refuses patterns a narrower count would admit | Linear is not cheap: the cost per character is the automaton's size, which the fuller count measures and the old one did not; a skip leaves a signed term unchecked, a refusal keeps every admitted term checked; the limit keeps the two engines' parse verdicts one, and the budgets bound one value's and one content's work in both |

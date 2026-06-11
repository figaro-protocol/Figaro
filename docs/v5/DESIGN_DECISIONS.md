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
progressive-collateralization property for any new orders.

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
ClauseRegistrationHelper, DutchAuction, SellerRegistry, AssemblyRegistry,
ProcessOffsetReceipt, and FigaroBatchVerifier have no owner, no pause function,
no upgrade path, and no admin recovery. FigToken has a one-shot deployer who
registers minter contracts then renounces (`deployerMintRenounced`); RpgfMinter
has a `submitter` (sequencer wallet) authorized to call `submitRoot` against
the SP1 verifier — these are bounded privileged actors, documented separately
in `CONTRACTS.md`.

**Why it looks wrong**: Most protocols include emergency controls for incident
response.

**Why it is correct**: The protocol's core property is self-enforcement between
strangers. An admin escape hatch is a trusted third party by another name. The
absence of admin controls is not an omission — it is the mechanism. The six
properties (asymmetric bonding, progressive collateralization, buyer dominance,
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

The accepted risk is documented: buyers should use a multi-sig or social-
recovery wallet for the buyer role in any high-value process.

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

## 7. Attestations are permitted on resolved orders

**Pattern**: `AttestationCoordinator._requireKnownCommitment` accepts orders
with `orderStatus == 2` (resolved), not just `orderStatus == 1` (committed).

**Why it looks wrong**: Attesting against a resolved order looks like operating
on stale state.

**Why it is correct**: Post-resolution attestations are an intended use case.
Lifecycle events (delivery confirmation, GHG disclosure summary, handoff
completion) may legitimately be recorded after the financial settlement has
occurred. Blocking attestations on resolved orders would prevent this.

The attestation event records the current block and the attester; indexers
can determine whether the attestation predates or postdates resolution.

---

## 8. ClauseRegistry is fully permissionless

**Pattern**: Anyone can call `registerClause` with any `clauseId`, `version`,
and `uriHash`. There is no approval, no staking, no identity check.

**Why it looks wrong**: Permissionless registration enables namespace squatting
and spam.

**Why it is correct**: `clauseId` is content-addressed — it is the keccak256
of a human-readable clause name. Squatting `keccak256("figaro-delivery-v1")`
requires knowing the preimage. Registering a garbage `uriHash` for a known
clauseId is blocked by the dedup guard (`AlreadyRegistered` revert).

Clause governance — which clauses are authoritative — is a convention-layer
concern resolved off-chain, consistent with the event-sourced architecture.

---

## 9. DutchAuction holds no funds and enforces no role separation

**Pattern**: The auction creator can claim their own auction. There is no
check that `driver != creator`. The contract holds no tokens and stores only
a `clearingPrice`.

**Why it looks wrong**: An auction where the creator wins appears to defeat
the auction's purpose.

**Why it is correct**: DutchAuction is a pure price-discovery coordination
primitive. It does not intermediate funds. The financial commitment happens in
FigaroCore, where the driver becomes the seller and must bond capital. Whether
the creator and driver are the same address is a governance concern for the
off-chain institution, not a financial invariant that needs on-chain
enforcement.

---

## 10. FigaroBatchVerifier trusts the ZK proof program — not additional on-chain guards

**Pattern**: The batch verifier does not check things like `newRoot != prevRoot`
(no-op batches) or validate individual position amounts against known limits.

**Why it looks wrong**: Defense-in-depth usually means layering redundant
checks.

**Why it is correct**: The SP1 program is the single source of truth for valid
state transitions. Duplicating program invariants as on-chain checks would
create a maintenance surface where the on-chain guard and the program could
diverge. If a state transition is invalid, the proof will not verify. If the
proof verifies, the state transition is valid by the program's definition.
On-chain guards are applied only at the trust boundary (proof verification,
chain ID, verifying contract, auxiliary data hashes).

---

## 11. `_pullExact` rejects fee-on-transfer and rebasing tokens — permanently

**Pattern**: `_pullExact` uses a before/after balance check with strict equality.
Any token that transfers less than requested (fee-on-transfer) or changes
balance mid-call (rebasing) is permanently incompatible.

**Why it looks correct and IS correct**: The MAD bonding model requires that
the exact committed amount is locked. If the received amount differs from the
committed amount, the bond math is broken. Rejection is the correct behavior.
Wrapped, non-rebasing variants (e.g., wstETH instead of stETH) must be used.

---

## 12. Single currency per process — multi-token is a composition concern

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

3. **Level-3 atomic bundler mechanism.** When all-or-nothing semantics is needed
   across N differently-denominated vendor processes, a Level-3 extension contract
   can orchestrate N monotoken commits as a wallet-bundled group with
   revert-on-any-fail. Kernel still sees N independent monotoken processes.

Do not propose adding oracles, DEX routers, or "multi-currency bonds" to
FigaroCore. The perceived limitation is a misframing — point inquirers at the
three composition patterns above.

---

## 13. Clause validator binding is not bundled with clause registration

**Pattern**: `ClauseRegistry.registerClause` and
`AttestationCoordinator.setValidator` are independent permissionless writes.
There is no single-call function that registers a clause and binds its
validator atomically. A clause can be registered with no validator bound
(attestations under it revert with `ValidatorNotSet`); a validator can be
bound to a clauseId before that clauseId has been registered in
`ClauseRegistry`. The two writes are not transactionally coupled at the
protocol layer.

**Why it looks wrong**: A new clause registered via
`ClauseRegistry.registerClause` exposes a window where any address can call
`setValidator(clauseId, maliciousValidator)` and capture the binding
permanently — `setValidator` is first-write-wins and immutable. A malicious
validator that returns the correct `clauseId()` from its self-attestation
(passing the `InvalidValidatorBinding` check) but contains adversarial
`validate()` logic can become the immutable binding before the legitimate
validator deploys. The clauseId is then permanently captured.

**Why it is correct**: First-write-wins binding IS the no-admin mechanism
(Decision #4). Adding an admin who can override or revoke validator bindings
is the only way to "fix" this front-running risk at the protocol layer, and
that admin is itself the larger problem — it reintroduces the trusted third
party the protocol is designed to eliminate. The risk lives at the deployment-
discipline layer, not the protocol layer.

**The discipline**: A clause author deploys their validator and binds it to
their clauseId **in a single transaction**. The pattern is established by
`script/Deploy.s.sol:_deployAndRegisterValidators`, which deploys each of the
19 reference figaro-* validators inline with its `setValidator` call so no
front-running window exists between deploy and bind. Third-party clause
authors must follow the same pattern via one of:

1. **`ClauseRegistrationHelper.registerClauseAndValidator(clauseId, version, uriHash, validator)`** —
   the recommended path for post-deploy clauses. A stateless, no-admin helper
   contract deployed alongside the protocol that composes both writes
   atomically. See `src/ClauseRegistrationHelper.sol`.
2. A custom deploy script that performs both writes in one external transaction.
3. A multicall/batch transaction submitted via the clause author's wallet.

**Why a separate helper contract instead of bundling into AttestationCoordinator**:
the kernel-discipline framing prefers keeping `ClauseRegistry` and
`AttestationCoordinator` as independently-addressable primitives. The helper
is opt-in syntactic sugar — clause authors who want atomic register+bind use it;
those who don't can still call the two primitives separately. Neither AC nor
ClauseRegistry gains a dependency on the other. The "two primitives bundled"
concern is preserved at the kernel layer; the bundling happens at a
non-privileged composer one tier above.

**Behavioral note for helper users**: when a clause is registered through the
helper, the `ClauseRegistered` event records the helper's address as the
`registrar`, not the calling user's address. Clause authors who want to be
on record as the registrar (e.g., for off-chain provenance) should call
`ClauseRegistry.registerClause` directly — this trades atomicity for
registrar-identity. The atomic-bind property protects against malicious-
validator front-running; the registrar-identity property is informational.

The risk surface is bounded: `script/Deploy.s.sol` and
`script/DeployMainnet.s.sol` have zero front-running window for the 16
reference clauses; only post-deploy third-party clauses need to apply the
discipline.

---

## 14. No MLETR-style transferable records — by design

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

3. **No escape hatches** (Theorem 4.7, Paper A). A transfer mechanism
   requires authorization for the substitution. In TradeTrust this is
   the holder's `transferBeneficiary` endorsement; in CargoX it is the
   holder's signature on the ERC-721 transfer. In Figaro terms, the
   authorizer is a third party J ∉ {B, S} relative to the *new*
   bilateral relationship between the new buyer and the existing seller
   — exactly the unbonded actor Theorem 4.7 forbids. Even if J equals
   the original buyer, J's incentive structure no longer binds the new
   relationship.

Adding transferability would require either (a) abandoning the
single-buyer invariant, which invalidates Theorem 5.3's progressive-
collateralization derivation since cumulative-value math depends on a
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

See `docs/v5/BOL_RESEARCH.md` for the full comparison against CargoX,
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
> dismissal is incorrect-as-written. See
> `memory/project_bol_transferability_parked.md` (full sketch + open
> design points), the "🔬 Open — BoL transferability mechanism design
> (parked)" entry in `memory/project_backlog.md`, and V3 reference
> material at `archive-v3/src/composability/` +
> `docs/archive/COMPOSABILITY.md`.

---

## Summary Table

| # | Pattern | Looks wrong because | Is correct because |
|---|---|---|---|
| 1 | Process re-opens after resolution | Missing lifecycle guard | Multi-round by bilateral signature |
| 2 | Cross-order seller attestation | Wrong role for target order | Attester recorded truthfully; semantics off-chain |
| 3 | buyer == seller allowed | Self-dealing vector | Bond math balances; bilateral signature required |
| 4 | No owner/admin/pause | No incident response | Admin = trusted third party = breaks mechanism |
| 5 | Buyer key loss is terminal | No stuck-fund recovery | Timeout = escape hatch = breaks MAD equilibrium |
| 6 | No prevrandao salt | Missing on-chain entropy | Validators predict prevrandao; party-chosen salt sufficient |
| 7 | Attestations on resolved orders | Operating on stale state | Post-resolution lifecycle events are valid |
| 8 | Permissionless clause registry | Namespace squatting | Content-addressed IDs; governance is off-chain |
| 9 | Auction creator can self-claim | Defeats price discovery | No funds held; financial commitment is in FigaroCore |
| 10 | No redundant on-chain batch guards | Insufficient defense-in-depth | ZK proof is the single authority; duplicating guards creates drift |
| 11 | Strict token compatibility rejection | Overly restrictive | Bond math requires exact amounts; wrapping is the solution |
| 12 | Single currency per process | Can't do multi-token commerce | 2:1 bond ratio is Nash-stable only in one currency; multi-token lives at composition layer (process / wallet swap / Level-3 bundler) |
| 13 | `setValidator` unbundled from `registerClause` | Front-running window for new clauses | First-write-wins is the no-admin mechanism; atomic deploy+bind is deployment discipline, not a protocol gap |
| 14 | No `transferTitle` / `endorse` / `nominate` for BoLs | Industry-standard MLETR-aligned eBLs are negotiable; CargoX / TradeTrust / TradeLens all implement this | Single-buyer invariant + parties-fixed-at-commit + no-escape-hatches each separately rule it out; cargo doesn't carry rights, the commitment does |

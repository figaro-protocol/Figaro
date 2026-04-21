# Figaro Protocol — Design Decisions

This document records intentional design choices that may appear as
vulnerabilities or omissions to a reviewer unfamiliar with the protocol's
architecture. Each entry states the pattern, why it looks wrong, and why it
is correct.

The intended audience is an external security auditor. Reading this document
before reviewing the code will prevent the most common false-positive findings.

---

## 1. Process can receive new sub-orders after resolution

**Pattern**: After `resolveProcess()` sets `ps.activeOrderCount = 0`, the
`ProcessState` struct is not deleted and no `finalized` flag is set. A new
sub-order can be committed to the same `processId`.

**Why it looks wrong**: A resolved process receiving new orders appears to be
a missing lifecycle guard — an "already settled" case that should be blocked.

**Why it is correct**: Committing any sub-order requires valid EIP-712
signatures from both the buyer and the seller. Neither party can unilaterally
reopen a process. If both parties sign a new sub-order referencing an existing
`processId`, they are bilaterally agreeing to a new round under the same
process. This is the intended multi-round composition model.

Adding a `finalized` flag would impose a web2 lifecycle state machine on a
kernel whose invariants are enforced entirely by cryptographic agreement, not
on-chain state. The signature requirement is the protection.

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

**Pattern**: FigaroCore, AttestationCoordinator, SchemaRegistry, DutchAuction,
and OperatorRegistry have no owner, no pause function, no upgrade path, and
no admin recovery.

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

## 8. SchemaRegistry is fully permissionless

**Pattern**: Anyone can call `registerSchema` with any `schemaId`, `version`,
and `uriHash`. There is no approval, no staking, no identity check.

**Why it looks wrong**: Permissionless registration enables namespace squatting
and spam.

**Why it is correct**: `schemaId` is content-addressed — it is the keccak256
of a human-readable schema name. Squatting `keccak256("figaro-delivery-v1")`
requires knowing the preimage. Registering a garbage `uriHash` for a known
schemaId is blocked by the dedup guard (`AlreadyRegistered` revert).

Schema governance — which schemas are authoritative — is a convention-layer
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
| 8 | Permissionless schema registry | Namespace squatting | Content-addressed IDs; governance is off-chain |
| 9 | Auction creator can self-claim | Defeats price discovery | No funds held; financial commitment is in FigaroCore |
| 10 | No redundant on-chain batch guards | Insufficient defense-in-depth | ZK proof is the single authority; duplicating guards creates drift |
| 11 | Strict token compatibility rejection | Overly restrictive | Bond math requires exact amounts; wrapping is the solution |

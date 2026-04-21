# Figaro Protocol — AI Security Audit Report

**Date**: 2026-04-20
**Auditor**: Claude Sonnet 4.6 (Anthropic), interactive audit with design-challenge verification
**Scope**: 10 production contracts in `src/`, Solidity 0.8.26, Foundry

> **Post-audit amendment (2026-04-21)**: This audit describes the pre-amendment
> Solidity surface. After this audit, the following changes were applied and
> are NOT reflected in the sections below:
> - FIG allocation restructured to 10% founder / 30% DAO / 60% staged airdrop (yr 2/5/9).
> - `MerkleAirdrop.sol` and `TrancheVesting.sol` deleted; `StagedMerkleAirdrop.sol` added.
> - `figToken` field (INFO-2 in this audit) removed from `FigaroBatchVerifier.sol`.
> - `DOMAIN_SEPARATOR()` getter added to `FigaroCore.sol`.
> - `totalRegisteredCap` sum-enforcement added to `FigToken.sol`.
> - Test suite: 14 suites / 225 tests (Foundry). Halmos: 7/7 via `./test-halmos.sh`.
>
> Current state is described in `AUDIT_REPORT.md`. References to `MerkleAirdrop`,
> `TrancheVesting`, `figToken`, or the prior 252-test count below are historical.
**Disclaimer**: This is an AI-generated audit. It complements but does not
replace a professional audit from a firm like Trail of Bits, OpenZeppelin, or
Spearbit. AI audits excel at systematic pattern matching and exhaustive
checklist coverage. Professional auditors bring adversarial creativity,
economic modeling, and legal accountability.

---

## Methodology

Two-phase approach:

| Phase | Focus |
|---|---|
| 1 | Full source read of all 10 production contracts. Traditional vulnerability classes (reentrancy, access control, integer overflow, signature handling, ERC-20 edge cases, assembly safety, hash collision). Economic invariants (bond math, token conservation, settlement completeness). Cross-contract trust boundaries. |
| 2 | Design-philosophy challenge of every finding. Each finding was re-examined against the protocol's stateless, event-sourced, no-escape-hatch architecture. Findings that imposed web2 lifecycle or role-separation patterns were withdrawn. |

The challenge phase is deliberate: this codebase has moved coordination and
semantic logic off-chain. Applying standard web2 access-control or
lifecycle-state patterns to a stateless, signature-enforced kernel produces
false positives. Each finding must survive the question: does the code need
to enforce this, or does the bilateral signature requirement already enforce it?

---

## Contract Inventory

| Contract | Lines | Purpose |
|---|---|---|
| `FigaroCore.sol` | 297 | Protocol kernel — commit and resolve |
| `CommitmentTypes.sol` | 55 | EIP-712 struct and hash library |
| `AttestationCoordinator.sol` | 204 | Zero-storage role-gated attestation |
| `SchemaRegistry.sol` | 87 | Permissionless event-only schema anchoring |
| `IRoleResolver.sol` | 18 | Role-authorization interface |
| `DutchAuction.sol` | 199 | Descending-price coordination primitive |
| `OperatorRegistry.sol` | 162 | Self-declaration with reclaimable deposit |
| `FigToken.sol` | 74 | ERC-20 + EIP-2612, 1B cap, minter registry |
| `MerkleAirdrop.sol` | 37 | Merkle-claim airdrop, one-shot per address |
| `TrancheVesting.sol` | 49 | Time-locked beneficiary vesting |
| `FigaroBatchVerifier.sol` | 533 | SP1-proved batch verification |

---

## Hash Collision Analysis

Examined all three hash layers in FigaroCore:

**Layer 1 — structHash**
`keccak256(abi.encode(COMMITMENT_TYPEHASH, all fields))` — uses `abi.encode`,
not `encodePacked`. Every field is padded to 32 bytes. No length ambiguity
between any field combination.

**Layer 2 — processId (root orders)**
`keccak256("\x19\x01" || domainSeparator || structHash)` where domainSeparator
includes `chainId` and `verifyingContract`. processId is chain-and-contract-bound.
Cross-chain and cross-deployment replay is structurally impossible.

**Layer 3 — orderHash**
`keccak256(abi.encodePacked(processId, structHash))` — both inputs are `bytes32`,
always exactly 64 bytes total. No length ambiguity. Collision requires a direct
keccak256 collision — computationally infeasible.

**prevrandao**: Confirmed absent from all source and test files. The `salt`
field in the `Commitment` struct is the correct replacement. This is an
improvement: under PoS, validators know prevrandao up to one epoch ahead,
making chain-sourced entropy subtly manipulable. A party-chosen salt with
bilateral EIP-712 signatures is cleaner and sufficient.

**Verdict**: No hash collision risk. All three layers are sound.

---

## Findings

### Initial Findings — Raised and Withdrawn After Design Challenge

**H-1 — Process re-extension after resolution (WITHDRAWN)**

Initial concern: after `resolveProcess()` sets `activeOrderCount = 0`, the
`ProcessState` is not deleted, so new sub-orders can be committed to the same
processId.

Withdrawn because: committing any sub-order requires valid EIP-712 signatures
from both buyer and seller. Neither party can unilaterally reopen a process.
If both parties sign a new sub-order for a resolved process, that is a
bilateral agreement — the intended design for multi-round processes. Adding a
`finalized` flag would impose a web2 lifecycle state machine on a
signature-enforced kernel.

**H-2 — Cross-order seller attestation (WITHDRAWN)**

Initial concern: `attestAsSeller` allows a seller of any order in a process to
attest against any other order in the same process, even if they are not the
seller of the target order.

Withdrawn because: the `Attestation` event records `attester = msg.sender`
truthfully. There is no identity forgery. Semantic interpretation — whether a
given attester has authority over a given order — belongs to off-chain indexers,
consistent with the event-sourced design. Enforcing the tighter restriction
on-chain would require per-order seller storage, re-introducing web2 state
that the design explicitly avoids.

**M-2 — DutchAuction creator self-claim (WITHDRAWN)**

Initial concern: `claim()` does not prevent the auction creator from claiming
their own auction.

Withdrawn because: DutchAuction holds no funds. The clearing price is a
coordination number, not a payment. Preventing self-claiming is a business
rule that belongs off-chain. No financial harm is possible.

**L-1 — MerkleAirdrop single-hash leaves (WITHDRAWN)**

Initial concern: single-hashed leaves are vulnerable to second-preimage attack.

Withdrawn because: leaf preimages are 52 bytes (20-byte address + 32-byte
amount), while OZ MerkleProof internal node preimages are 64 bytes (two
32-byte hashes). The different preimage lengths make leaf/node conflation
structurally impossible, not merely computationally hard.

**L-5 — No-op batch accepted by FigaroBatchVerifier (WITHDRAWN)**

Initial concern: a valid proof could advance state to the same root (no-op).

Withdrawn because: valid state transitions are defined by the ZK program, not
by on-chain checks. Adding `newRoot != prevRoot` on-chain duplicates a
constraint that belongs in the program. If the program never produces a
same-root transition, this cannot happen with a valid proof.

**L-6 — SchemaRegistry version 0 accepted (WITHDRAWN)**

Initial concern: `registerSchema(id, 0, uriHash)` succeeds.

Withdrawn because: whether version=0 is meaningful is a semantic concern for
off-chain indexers. The registry's only enforcement role is the dedup guard.
Adding a version-zero check is a business rule that belongs off-chain.

---

### Surviving Findings — Informational Only

No code changes required for any of the following. Noted for completeness.

**INFO-1 — FigToken: Minter cap registration does not sum all registered caps**

`registerMinter` checks `totalSupply() + cap > MAX_SUPPLY` at registration
time, not against the sum of all registered minter caps. Two minters could be
registered with combined caps exceeding MAX_SUPPLY if no minting has occurred.
The per-mint check `totalSupply() + amount > MAX_SUPPLY` is the real
enforcement and prevents actual over-minting. Cap semantics are advisory.

**INFO-2 — FigaroBatchVerifier: `figToken` field is dead (RESOLVED)**

The `address public immutable figToken` field was a remnant of the removed
emission logic. It has since been deleted from `FigaroBatchVerifier.sol`, the
constructor reduced to three arguments, and all call sites updated. No
security impact either before or after removal; this entry is retained as
audit history.

**INFO-3 — FigaroBatchVerifier: Batch DoS via approval revocation**

Any user who revokes token approval before `settleBatch` executes reverts the
entire batch. Already documented in the contract with a `@dev WARNING` comment.
Mitigation is operational: sequencer verifies approvals immediately before
proof submission. No on-chain fix is appropriate (would require state).

**INFO-4 — FigaroCore: `_pullExact` panic on extreme downward rebase**

If a rebasing token decreases the contract balance during `safeTransferFrom`
by more than the transferred amount (extremely unlikely in a single call),
Solidity 0.8 checked arithmetic reverts with a panic rather than the custom
`FeeOnTransferDetected` error. Behavior (revert) is correct; error signal
differs. Rebasing tokens are already documented as incompatible.

**INFO-5 — OperatorRegistry: `InsufficientDeposit` fires on excess**

The error name implies only insufficient deposit, but it fires for
`msg.value != registrationDeposit` (including excess). Naming inconsistency
only; NatSpec correctly documents the exact-match requirement.

**INFO-6 — FigToken: Deployer can self-register as minter**

Before calling `renounceDeployerMint()`, the deployer can call
`registerMinter(deployer, cap)` and mint freely. This is an explicit
trusted-setup assumption. No code change can protect against a malicious
deployer; it is a deployment governance concern.

---

## Trust Graph (current)

```
┌────────────────────────────────────────────────────────────────┐
│                    TRUST ROOT: FigaroCore                       │
│  No external project contract writes to it                      │
│  Entry: commit() + resolveProcess() via user signatures         │
└───────────────┬────────────────────────────────────────────────┘
                │ reads orderStatus, orderProcessId, processes
                ▼
 ┌─────────────────────────┐
 │  AttestationCoordinator  │
 │  reads: orderStatus,     │
 │   orderProcessId,        │
 │   processes              │
 │  calls: IRoleResolver    │
 │   (untrusted, view only) │
 └─────────────────────────┘

 ┌──────────────────────────┐        ┌──────────────┐
 │  FigaroBatchVerifier      │        │  FigToken     │
 │  reads: ISP1Verifier      │        │  minters:     │
 │  reads/writes: ERC-20     │        │   (registered │
 │  emits: protocol events   │        │    contracts) │
 └──────────┬────────────────┘        └──────┬────────┘
            │ verifies                        │ mint()
            ▼                                 ▼
 ┌──────────────────────┐        ┌─────────────────────────┐
 │  ISP1Verifier        │        │  MerkleAirdrop           │
 │  (real or mock)      │        │  TrancheVesting          │
 └──────────────────────┘        └─────────────────────────┘

 Standalone (no cross-contract reads):
   SchemaRegistry, DutchAuction, OperatorRegistry
```

---

## Assessment

**FigaroCore is exceptionally well-secured.** Six independent verification
methods (Foundry 252 tests, Echidna 7 properties, Halmos 7 symbolic proofs,
TLA+ 15 invariants across 2 models (FigaroCore 6M+ states, FigToken 160k states), Certora 27 CVL rules across 4 specs, Slither 0 findings).
Zero critical or high findings on the kernel. The six core protocol properties
(asymmetric bonding, progressive collateralization, buyer dominance, atomic
resolution, immutable evidence, no escape hatches) are verifiably enforced.

**Mechanism modules are clean.** DutchAuction, SchemaRegistry, and
OperatorRegistry have minimal attack surface, no financial intermediation
(DutchAuction), and correct CEI patterns where funds are held (OperatorRegistry
ETH deposits).

**FIG token layer is sound.** FigToken's 1B hard cap is enforced on every mint
path. MerkleAirdrop and TrancheVesting are simple, minimal contracts with
one-shot claim guards and no privileged roles.

**FigaroBatchVerifier inherits ZK trust assumptions.** Its security depends on
the correctness of the SP1 program and the integrity of the verifier gateway.
On-chain, it correctly validates state root continuity, chain ID, verifying
contract, and all auxiliary data hashes before executing any transfers.

**This AI audit found zero new actionable findings.** The protocol's
stateless, bilateral-signature-enforced design is internally consistent. The
patterns that initially appeared as vulnerabilities were confirmed to be
correct design decisions once evaluated against the protocol's architecture.

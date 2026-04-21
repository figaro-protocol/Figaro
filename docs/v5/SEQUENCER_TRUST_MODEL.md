# Figaro V5 — Sequencer Trust Model

Date: 2026-04-20

This document defines what must be trusted about the batch sequencer, what is
guaranteed by the ZK proof regardless of sequencer behavior, and what operational
procedures the sequencer operator must follow.

---

## Overview

The Figaro batch sequencer sits between FigaroCore (the on-chain kernel) and
FigaroBatchVerifier (the on-chain ZK proof verifier). Its role is to:

1. Watch FigaroCore for resolved processes (via `OrderResolved` events)
2. Accumulate resolved positions into batches
3. Generate an SP1 proof of the state transition from `prevStateRoot` to `newStateRoot`
4. Call `FigaroBatchVerifier.settleBatch()` to apply the batch on-chain

The sequencer is implemented in `prover/` (Rust) and exercised by
`sdk/sequencer.test.ts` and `sdk/batch-e2e.test.ts`.

---

## What the ZK Proof Guarantees (No Sequencer Trust Required)

The SP1 program is the single source of truth for valid state transitions
(DESIGN_DECISIONS.md §10). The on-chain verifier checks:

- Proof validity (Groth16 / Plonk via Succinct's SP1 verifier)
- `prevStateRoot == currentStateRoot` (chain continuity)
- `chainId` matches the chain where the verifier contract is deployed
- `verifyingContract` matches the FigaroBatchVerifier address
- Hashes of positions, attestations, schemas, and operator events match the
  proof public inputs

These checks mean that **no invalid state transition can be applied**, even if
the sequencer is compromised. A malicious sequencer cannot:

- Fabricate positions (amounts, addresses)
- Double-apply a batch (chain continuity check rejects it)
- Apply a batch from a different chain or contract
- Skip or alter attestation or schema events

Security (correctness of what gets settled) does **not** require trusting the sequencer.

---

## What Requires Trusting the Sequencer (Liveness)

**Liveness** — the property that valid resolved orders eventually get settled —
does require trusting the sequencer. A non-submitting or slow sequencer:

- Delays FIG distribution (if/when emissions are live)
- Delays net-position settlement for participants who are waiting on batch settlement
- Does not affect FigaroCore directly (FigaroCore settlement is independent of batches)

The protocol's safety invariants (bond math, buyer dominance, atomic resolution)
are enforced entirely by FigaroCore. Batch settlement is an additional coordination
layer, not a prerequisite for process resolution.

**Implication**: the sequencer should be treated as a liveness-trusted operator,
not a safety-trusted operator.

---

## Batch DoS via Approval Revocation (INFO-3)

`FigaroBatchVerifier.settleBatch()` calls `safeTransferFrom` for each participant
position. If any participant has revoked their ERC-20 approval between proof
generation and the `settleBatch` transaction landing, the entire batch reverts.

This is documented in the contract with a `@dev WARNING` comment. It is **not**
an on-chain fixable problem (fixing it would require per-participant state).

**Operational mitigation**: the sequencer must verify that every participant in
the batch has approved `FigaroBatchVerifier` for at least their net settlement
amount immediately before submitting the proof. If any approval is missing or
insufficient, the batch must be split to exclude that participant, or delayed
until the approval is restored.

This is a sequencer operational responsibility, not a protocol invariant.

---

## Sequencer Trust Assumptions Summary

| Property | Trust required? | Enforcement mechanism |
|---|---|---|
| State transition correctness | None | SP1 ZK proof + on-chain verifier |
| Chain continuity | None | `prevStateRoot == currentStateRoot` check |
| Cross-chain replay prevention | None | `chainId` + `verifyingContract` in proof public inputs |
| Batch liveness | Yes — sequencer operator | Operational SLA; no on-chain enforcement |
| Approval integrity before batch | Yes — sequencer operator | Pre-submission approval check (operational) |
| Ordering of settlements within a batch | None (up to SP1 program) | Deterministic kernel execution |

---

## Sequencer Operator Requirements

1. **Monitor FigaroCore events**: watch for `ProcessResolved` and `OrderCommitted`
   events in real time to avoid falling behind.

2. **Check approvals before proof submission**: for every position in a batch,
   verify `allowance(participant, address(batchVerifier)) >= settlement_amount`
   using a recent block. Exclude participants with insufficient approval.

3. **Handle reorgs**: use a finality threshold (e.g., 12+ confirmations on
   Ethereum mainnet) before including events in a batch to avoid proof
   invalidation from chain reorgs.

4. **Maintain `currentStateRoot` consistency**: the sequencer is the canonical
   keeper of the off-chain state root. Losing this state means the sequencer
   cannot produce valid `prevStateRoot` values until the root is recovered from
   on-chain events.

5. **Proof retry on gas spike**: if `settleBatch` reverts due to gas limits,
   retry with higher gas. Do not discard proofs — regenerating them is expensive.

---

## Relationship to Protocol Safety

The sequencer's trusted scope is narrow and cannot break the protocol's core
invariants:

- It cannot undo a resolved process (FigaroCore transitions are final)
- It cannot reorder or modify bond payouts (FigaroCore settles atomically)
- It cannot drain FigaroCore (FigaroBatchVerifier is a separate contract)
- It cannot forge ZK proofs (Groth16/Plonk computational security)

The worst outcome of a compromised or stopped sequencer is delayed batch
settlement and delayed FIG distribution — both recoverable by deploying a new
sequencer against the same on-chain state root.

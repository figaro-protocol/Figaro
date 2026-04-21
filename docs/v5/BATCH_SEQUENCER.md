# Batch Sequencer Architecture

Status: Phase 1 (devnet) implemented and tested.

## What the Sequencer Is

The batch sequencer is the off-chain service that collects signed protocol
operations from participants, assembles them into batches, runs the SP1
prover, and submits the proof + auxiliary data to the on-chain
`FigaroBatchVerifier` contract.

The sequencer is a **coordination convenience**, not a trust assumption.
It cannot fabricate operations (every operation requires valid EIP-712
signatures from the relevant parties). It cannot censor selectively
(participants can always fall back to the direct `FigaroCore` on-chain
path). It cannot extract value (the kernel has no fee, no MEV surface).

## Architecture

```
                    ┌──────────────────┐
  signed ops ──────►│    Sequencer     │
  (EIP-712)        │                  │
                    │  1. Collect      │
                    │  2. Validate     │
                    │  3. Assemble     │
                    │  4. Prove (SP1)  │
                    │  5. Submit       │
                    └──────┬───────────┘
                           │ proof + positions + events
                           ▼
                    ┌──────────────────┐
                    │ FigaroBatchVerifier │
                    │  (on-chain)      │
                    │                  │
                    │  verify proof    │
                    │  check state root│
                    │  reconcile tokens│
                    │  re-emit events  │
                    └──────────────────┘
```

## Operation Lifecycle

### 1. Submission

Participants submit signed protocol operations to the sequencer via a
JSON-RPC or REST endpoint. Each operation is a typed message containing:

- The operation type (commit, resolve, attest, register-schema,
  register-operator, etc.)
- The operation payload (commitment struct, process ID, attestation data, etc.)
- EIP-712 signatures from the required parties

The sequencer validates signatures immediately on receipt and rejects
malformed or unauthorized operations.

### 2. Pre-checks

Before including an operation in a batch, the sequencer verifies:

- **Signature validity**: EIP-712 typed data hash recovery matches expected signers
- **Token approval**: For `commit` operations, the buyer and seller have
  sufficient ERC-20 balance and approval for the verifier contract
- **State validity**: The operation is consistent with the current state
  (no duplicate commitments, process exists for sub-orders, etc.)

Pre-checks are advisory — the proof itself enforces all invariants.
But pre-checks avoid wasting prover compute on batches that would fail.

### 3. Batch Assembly

The sequencer collects operations into a batch once a trigger condition is met:

- **Time-based**: every N seconds (e.g., 10s for devnet, configurable)
- **Size-based**: when the batch reaches M operations
- **Whichever comes first**

The assembled `BatchInput` contains:

```typescript
{
  chain_id: number,
  verifying_contract: Address,
  prev_state: KernelStateSnapshot,
  operations: KernelOp[],
  block_timestamp: number
}
```

The `prev_state` is the sequencer's local mirror of the kernel state,
which it maintains by replaying all previously submitted batches.

### 4. Proving

The sequencer feeds the `BatchInput` to the SP1 prover, which executes
the Figaro kernel program in the zkVM and produces:

- A validity proof
- `PublicValues` (8 fields: prev/new state roots, chain binding, 4 event hashes)
- `NetPosition[]` (aggregated token movements)
- `BatchEvents` (attestation, schema, operator events)

For devnet, the MockProver is used (no real proof generation).
For production, the SP1 network prover generates STARK/SNARK proofs.

### 5. Settlement Transaction

The sequencer submits a single transaction to `FigaroBatchVerifier.settleBatch()`:

```solidity
settleBatch(
  proof,           // SP1 proof bytes
  publicValues,    // ABI-encoded 8 × 32-byte words
  positions,       // NetPosition[] for token reconciliation
  events           // BatchEventData (attestations, schemas, operators)
)
```

The verifier contract:
1. Verifies the proof via ISP1Verifier
2. Checks state root continuity (`prevRoot == stateRoot`)
3. Checks chain binding (`chainId`, `verifyingContract`)
4. Verifies auxiliary data hashes match proof commitments
5. Executes net token transfers (mints FIG directly when the settlement token is FIG)
6. Re-emits protocol-compatible events
7. Advances the state root

## Trust Analysis

### What the sequencer CAN do

- **Delay**: withhold operations from a batch, delaying settlement.
  Mitigation: participants can submit directly to `FigaroCore` on-chain
  (the sequencer is an optimization layer, not a requirement).
- **Order within batch**: choose the order of operations within a batch.
  This is harmless — the kernel's state transitions are deterministic
  and order-independent within a batch (no MEV surface).
- **Refuse service**: decline to include an operation.
  Mitigation: same as delay — direct on-chain fallback.

### What the sequencer CANNOT do

- **Fabricate operations**: every operation requires valid EIP-712
  signatures. The prover verifies signatures inside the zkVM.
- **Steal funds**: token movements are determined by the kernel logic
  inside the proof. The verifier contract executes only the movements
  the proof commits to.
- **Violate invariants**: the proof enforces all 9 kernel invariants.
  A batch that violates any invariant produces no valid proof.
- **Forge state**: the on-chain state root chain prevents the sequencer
  from submitting proofs against a fabricated prior state.

### Relationship to "no escape hatches"

The sequencer does not weaken the kernel's no-escape-hatches property.
The kernel invariants are enforced by the proof, not by the sequencer.
The sequencer is more analogous to a miner/validator (orders transactions)
than to a governance council (makes discretionary decisions).

A participant who distrusts the sequencer can always bypass it by
submitting directly to `FigaroCore` on the settlement chain. The
sequencer is a throughput optimization, not a trust requirement.

## Fallback Path

The direct on-chain `FigaroCore` contract remains deployed and functional
alongside the batch verifier. This creates a two-tier settlement model:

- **Batch path**: sequencer → prover → FigaroBatchVerifier (cheaper, batched)
- **Direct path**: participant → FigaroCore (immediate, unbatched)

Both paths produce equivalent state changes and emit compatible events.
The SDK and runtime can consume events from either path transparently.

## State Synchronization

The sequencer maintains a local state mirror by:

1. Initializing from the on-chain `stateRoot` at startup
2. Replaying all operations from submitted batches
3. Incorporating direct `FigaroCore` transactions (if any) by reading
   on-chain events and applying them to the local state

If a direct `FigaroCore` transaction occurs between batch submissions,
the sequencer must detect the state divergence (the prover's `prevRoot`
won't match the on-chain `stateRoot`) and re-sync before the next batch.

## Implementation Phases

### Phase 1: Devnet Sequencer (implemented)

Rust crate in `prover/sequencer/`. 6 modules, 22 tests.

- **Mempool** (`mempool.rs`): Thread-safe operation queue with full EIP-712
  pre-check validation for all 11 `KernelOp` variants. Rejects malformed or
  mis-signed operations before they reach the prover. Supports `requeue()`
  to push failed-batch operations back to the front of the queue.
- **State mirror** (`state.rs`): Local kernel state tracking via
  `KernelState` with snapshot export, advance, and deterministic root.
- **Assembler** (`assembler.rs`): Configurable batch assembly (max ops,
  interval). Builds `BatchInput` from drained operations + state snapshot.
- **Prover** (`prover.rs`): SP1 mock prover integration. Runs local
  `apply_batch_with_state()` for positions/events + SP1 mock execution
  for proof validation. Returns `ProveResult` with post-batch state.
- **Submitter** (`submitter.rs`): On-chain transaction submission via
  alloy. Converts kernel types to Solidity types, calls
  `FigaroBatchVerifier.settleBatch()`, reads on-chain state root.
- **API** (`api.rs`): axum HTTP routes — `POST /submit` (accepts
  `KernelOp` JSON, returns operation ID or validation error),
  `GET /status` (state root, pending ops, batches settled).
- **Main** (`main.rs`): Env config, component bootstrap, time-triggered
  batch loop (drain → assemble → prove → submit → advance state).
  State mirror advances only after successful on-chain submission.
  On prove or submission failure, drained operations are re-queued
  to the front of the mempool via `Mempool::requeue()` — no operations
  are lost.
- MockSP1Verifier (no real proof generation)
- Time-based batch trigger (configurable, default 10s)
- 22 tests: mempool pre-checks (valid/invalid signatures, wrong chain,
  drain, sequential IDs, schema/operator/resolve ops), state mirror
  (genesis determinism, snapshot roundtrip, advance), assembler,
  API (status, submit valid/invalid, pending count), end-to-end
  (mempool → assemble → kernel → advance, sequential batch chaining)

### Phase 2: Production Sequencer

- SP1 network prover for real proof generation
- Redundant sequencer instances for availability
- Rate limiting and operation prioritization
- Monitoring and alerting

### Phase 3: Decentralized Sequencing (future)

- Shared sequencer set with leader rotation
- MEV protection (not currently a concern — the kernel has no MEV surface,
  but worth monitoring as usage patterns evolve)
- Economic incentives for sequencer operators (potentially FIG-denominated)

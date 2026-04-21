# Scaling Strategy

Status: canonical scaling document for the V5 kernel.

## The Kernel's Shape

FigaroCore has two external functions: `commit` and `resolveProcess`.
No owner, no fee, no timeout, no cancel, no escape hatches.

The kernel is small and correct. Scaling must preserve it exactly.

Any execution environment must preserve these properties:

1. asymmetric bonding: buyer bond = 2 × payment, seller bond = 2 × cumulativeValue
2. dual-signed commitment entry, not staged offer/accept
3. buyer dominance at resolution
4. atomic process resolution
5. monotonic cumulative value per process
6. single-currency invariant per process
7. direct settlement transfer semantics
8. no protocol fee in the kernel
9. no timeout / cancel / admin escape hatches

If an execution environment changes any of these, it is not scaling the
kernel. It is proposing a different protocol.

## Two Constraints

Scaling involves two distinct constraints. Do not conflate them.

**Throughput**: many concurrent processes competing for block space.
Solved by cheaper execution environments.

**Depth**: single-process order count bounded by gas.
`resolveProcess` iterates every commitment in the process (~14k gas per
order). At Ethereum's 30M gas limit, the ceiling is ~2,145 orders.
Practical institution assemblies should stay well below this (50–100).
Depth is already solved by multi-process composition — the kernel
supports it structurally via the `processId` field, and the V3
composability contracts (`SettlementCascade`, `SettlementRouter`,
`TemplateRegistry`) proved the pattern. This is not a scaling layer
to build. It is an existing kernel property.

## Track 1: Launch

Deploy the unchanged V5 kernel on Ethereum mainnet when the release gate
is closed. Until then, development and scaling architecture work continue
on devnet (Anvil, chain 31337).

### Sequence

1. continue development and Track 2 work on devnet
2. freeze the audited Solidity surface
3. run the final external audit pass
4. deploy on Ethereum mainnet as the canonical live settlement domain

## Track 2: Proof-Based Kernel Scaling

This is the actual scaling question. Everything else — network choice,
L2 deployment, multi-process composition — is either already solved or
is an execution-environment decision, not a scaling architecture.

The kernel scaling problem is: how do you batch many `commit` and
`resolveProcess` transitions so that the on-chain cost is sublinear
in the number of operations?

The answer is validity proofs. A prover executes many kernel
transitions off-chain and publishes a succinct proof to the
settlement chain that the resulting state root is reachable from the
prior state root under V5 rules.

### Implementation Status

The proof-based kernel is implemented and tested:

**Rust kernel** (`prover/lib/`): Full protocol surface translated to Rust.
11 `KernelOp` variants covering commit, resolve, attestation (seller/buyer),
schema registration, mechanism-schema binding, and operator lifecycle
(register, update, deactivate, reactivate). 6-mapping Merkle state
(processes, orderStatus, orderProcessId, schemasRegistered, operatorRoles,
operatorActive). 30 unit tests. EIP-712 signature verification with
byte-exact parity to the Solidity kernel.

**SP1 guest program** (`prover/program/`): Executes `apply_batch()` in
the SP1 zkVM and commits `PublicValues` (8 fields: prev/new state roots,
chain binding, 4 event hashes). Verified execution: 19.8M cycles for a
6-operation mixed batch (commit + schema + operator + attest-seller +
attest-buyer + resolve).

**On-chain verifier** (`src/FigaroBatchVerifier.sol`): Accepts SP1 proofs,
verifies state root continuity and chain binding, hash-verifies auxiliary
data (positions, attestation events, schema events, operator events),
executes net token transfers, and re-emits protocol-compatible events.
The legacy FIG-mint path has been removed along with the `figToken`
constructor argument; the batch verifier does not and will not mint FIG.
Uses `BatchEventData` struct to avoid stack-too-deep.

**Mock verifier** (`src/mocks/MockSP1Verifier.sol`): Accepts any proof
for devnet/Anvil testing. Drop-in replacement for the real SP1 gateway.

**SP1 verifier interface** (`src/interfaces/ISP1Verifier.sol`): Matches
the Succinct SP1 verifier gateway ABI.

### What The Proof Must Verify

1. each `commit` in the batch preserved asymmetric bond formulas,
   dual-signature validity, monotonic cumulative value, and
   single-currency invariant
2. each `resolveProcess` in the batch preserved buyer dominance,
   atomic resolution, conservation, and direct transfer semantics
3. each attestation, schema registration, and operator mutation
   preserved the corresponding authorization gates
4. the resulting state root follows from the prior state root under
   the V5 kernel rules — no transition was skipped, reordered, or
   fabricated

### What This Changes

- settlement throughput becomes a function of proof generation, not
  block gas limits
- the on-chain footprint per settlement batch collapses to a single
  proof verification, state-root update, and net token reconciliation
- mechanism events (attestation, schema, operator) are hash-verified
  against the proof and re-emitted for frontend/indexer compatibility
- the kernel invariants are preserved exactly — the proof enforces
  the same rules the Solidity kernel enforces, just at batch scale

### What This Does Not Change

- the kernel's external interface (`commit`, `resolveProcess`)
- the 9 invariants listed above
- the event semantics consumed by the SDK and frontend
- buyer dominance, atomic resolution, no escape hatches

### Gas Economics — Why Batching Is Cheaper

The batch path is not competing with `resolveProcess` for per-block
throughput. It replaces the *entire* direct settlement lifecycle
(`commit` + `resolveProcess`) with a single on-chain transaction whose
cost is dominated by token transfers, not kernel logic.

**Direct path — full per-order on-chain cost:**

| Step | Gas | Notes |
|---|---|---|
| `commit()` execution | ~224k | ECDSA recovery × 2, storage writes, 2–4 token transfers |
| Transaction base cost | 21k | Per-transaction overhead |
| `resolveProcess()` per order | ~12.5k | hashStruct + SLOAD + 2 safeTransfer + SSTORE + event |
| **Total per order** | **~257k** | Across 2+ separate transactions |

For 100 orders, the direct path costs ~25.7M gas across 100+ transactions.

**Batch path — full per-order on-chain cost:**

| Step | Gas | Notes |
|---|---|---|
| SP1 proof verification | ~300k | Fixed cost, amortized across all operations |
| Hash verification (O(n)) | ~2k/position | Pre-allocated memory, linear scaling |
| Net token transfer | ~24k/position | One `safeTransfer` per net position |
| **Total per position** | **~26.5k** | In a single transaction |

For 100 kernel operations producing ~30 net positions (after netting),
the batch path costs ~1.1M gas in 1 transaction.

**The netting effect.** In the direct path, every order triggers its
own token transfers. In the batch path, the prover aggregates all
movements per (token, user) pair into a single net position. If 100
buyers all pay the same seller in the same token, that's 100 commit
transactions on the direct path but 1 net position on the batch path.
Netting is the batch path's structural advantage.

**Why it's not "half of FigaroCore."** A naive comparison of the batch
verifier's ~1,130-position ceiling against `resolveProcess`'s ~2,400-order
ceiling is misleading. The 2,400 figure measures only the resolve step
— the cheapest part of the direct lifecycle. The 224k-gas `commit()`
calls that preceded those resolves consumed ~537M gas across 2,400
separate transactions. The batch path eliminates all of that: every
commit, resolve, attestation, and schema registration runs off-chain
inside the SP1 prover, and only the net financial effects land on-chain.

**Empirical gas ceilings at 30M gas limit:**

| Path | Ceiling | Unit | Per-unit gas |
|---|---|---|---|
| Direct `commit()` | ~130 orders | Per block | ~224k/order |
| Direct `resolveProcess()` | ~2,400 orders | Single call | ~12.5k/order |
| Batch `settleBatch()` | ~1,130 positions | Single call | ~26.5k/position |

The correct comparison is total lifecycle cost: ~257k gas per order
(direct) vs. ~26.5k gas per net position (batch) — roughly **10×
cheaper** per settled order, with further improvement from netting.

**Implementation note — O(n) hashing required.** The hash verification
functions that check auxiliary data parity between the proof and the
calldata must use pre-allocated memory with fixed-stride writes (assembly).
A naive `bytes.concat` loop produces O(n²) memory allocation, which
collapses the ceiling from ~1,130 to ~250 positions and negates the
batch path's gas advantage entirely.

### Batch Sequencer

The off-chain service that collects signed operations, assembles batches,
runs the SP1 prover, and submits proofs to the verifier contract.
Implemented as a Rust crate (`prover/sequencer/`) with 6 modules and
22 tests. See `docs/v5/BATCH_SEQUENCER.md` for the full architecture.

Key trust property: the sequencer is a **coordination convenience**,
not a trust assumption. It cannot fabricate operations (all operations
require valid EIP-712 signatures). It cannot violate kernel invariants
(the proof enforces them). Participants can always bypass the sequencer
by submitting directly to `FigaroCore` on-chain.

### Architecture Summary

```
  participants ──► sequencer ──► SP1 prover ──► FigaroBatchVerifier
  (signed ops)    (collect,      (prove state    (verify proof,
                   validate,      transition)     reconcile tokens,
                   assemble)                      re-emit events)
```

### Resolved Design Decisions

1. **Proof system**: SP1 (Succinct). RISC-V based zkVM. Chosen for
   Rust compatibility, mature toolchain, and mock prover for rapid
   development. Production proofs via SP1 network.

2. **State representation**: BTreeMap-based kernel state with 6 mappings.
   Deterministic `compute_root()` produces a bytes32 state root by
   hashing sorted key-value pairs from each mapping. On-chain state
   root chain prevents fabricated state transitions.

3. **Sequencing**: Single-operator sequencer for devnet. Collects
   EIP-712 signed operations, validates pre-checks (approvals, state
   consistency), assembles `BatchInput`, runs prover, submits to
   verifier contract. Cannot fabricate, steal, or violate invariants.
   Direct `FigaroCore` fallback path always available.

4. **Settlement surface**: Devnet first (Anvil, chain 31337, MockSP1Verifier).
   Production: Ethereum mainnet with real SP1 verifier gateway.
   The batch verifier and direct `FigaroCore` coexist — two-tier
   settlement model.

5. **Event reconstruction**: The verifier contract re-emits all mechanism
   events (attestation, schema, operator) with protocol-compatible
   signatures. Events are hash-verified against proof commitments.
   The SDK's event-sourced architecture (`eventCache.ts` single swap
   point, 4s poll) consumes verifier events identically to `FigaroCore`
   events. Builder surfaces are chain-independent and require no changes.

### What Is Not Kernel Scaling

- Merkle trees for evidence or disclosure bundles → protocol-extension
  infrastructure
- zk proofs for proximity, compliance, or selective reveal →
  extension-layer tooling
- deploying on a cheaper network → execution-environment choice
- multi-process composition → already built into the kernel

## Secondary-Network Deployment

This is an execution-environment decision, not a scaling architecture.
It is gated by two prerequisites:

1. Ethereum mainnet is already the live canonical kernel (Track 1 complete)
2. the token-reward doctrine for multi-network deployment is specified

### Evaluation Criteria (in priority order)

1. **Security** — what trust assumptions are added relative to
   Ethereum mainnet? Sequencer, upgrade, governance, and withdrawal
   assumptions must be explicitly acceptable. Only public networks
   with verifiable security properties qualify.
2. **Kernel fidelity** — same Solidity deployment, same ABI, same
   event semantics, same ERC-20 interaction model.
3. **Operational continuity** — standard RPC, stable explorers,
   reliable archive/log access, standard wallet compatibility.
4. **Token-reward coherence** — whether FIG emission remains
   single-domain or becomes network-aware; whether adding a network
   strengthens or muddies token denomination as coordination signal.
5. **Cost under real process shapes** — root `commit`, sub-order
   `commit`, `resolveProcess` across realistic order counts,
   attestation writes.

### Rules

- each chain is an independent settlement domain
- no bridge dependency for the first secondary deployment
- no mixed-chain single-process settlement
- no cross-chain routing before single-chain parity exists
- candidate selection is security-first, not cost-first

## Cairo / StarkNet Posture

The existing Cairo branch in `cairo/` implements a pre-V5 protocol shape
(`first_order`, `sub_order`, `accept_offer`, `cancel_offer`, fee logic).
It is a divergent protocol branch, not a scaled version of the live kernel.

If a Cairo/StarkNet path becomes strategically justified:

1. write the parity matrix from the frozen V5 kernel
2. create a fresh rewrite from that matrix
3. ship it as an independent deployment, not as a bridge-dependent extension

Do not resume StarkNet implementation until V5 parity gates are cleared.

## Decision Rule

1. ship the unchanged kernel on Ethereum mainnet (Track 1)
2. design the validity-proof circuit for batched kernel transitions (Track 2)
3. expand to secondary networks only when security and reward criteria are met

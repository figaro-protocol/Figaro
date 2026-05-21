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
chain binding, 4 event hashes). Verified execution: ~1.0M cycles for a
6-operation mixed batch (commit + schema + operator + attest-seller +
attest-buyer + resolve) with the k256 SP1 precompile patched in
(`prover/Cargo.toml`); a real Core proof of that batch generates and
verifies locally.

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

## Prover Schema Architecture — Generic Engine, Not Compiled-In Specs

Permissionless schema extension is an axiom of the protocol, not a
forecast. `SchemaRegistrationHelper` makes registration permissionless
on-chain; the schema-author RPGF funds authors across years 2/5/9; the
extension doctrine assumes third-party schema families forever. An
architecture is correct only if it serves an unbounded, ever-growing
schema population. "Is there enough demand to justify it" is a product
question and has no place here.

The SP1 guest currently compiles in the 16 canonical specs
(`prover/schema/src/embedded.rs` — `include_str!` of the Layer A JSONs)
and per-schema ABI encoders (`encode.rs` — a `match schemaId` dispatch).
Adding a schema changes the guest ELF → the program verification key → a
`FigaroBatchVerifier` redeploy. **Measured against the axiom, that is
broken**: it makes registering a schema a protocol-side migration event,
and it makes the prover a gatekeeper of the schema namespace — a
component with opinions about which schemas exist. The kernel owns
nothing; a prover that knows the schema list owns something.

**The asymmetry that names the bug.** Layer C already scales
permissionlessly — a schema author deploys their own `ISchemaValidator`
and binds it via `SchemaRegistrationHelper`, no protocol redeploy. Layer
B (the prover) does not. Layer C got the infrastructure design; Layer B
got the shortcut — "bake in the schemas we have." Today a third-party
schema in the proven path can only be attested content-opaque (no
in-proof validation) or is rejected outright (`SchemaEncoderMissing`).
The scaling path structurally cannot validate the population the
protocol exists to serve.

**Required end-state.** The guest holds a generic schema *engine* —
parse + validate + encode — and no schemas. The spec is a witness input,
bound to its `schemaId` by content hash; `SchemaRegistry` is the trust
anchor. Adding a schema is a `SchemaRegistry` transaction and nothing
else: no guest rebuild, no vkey change, no verifier redeploy. The vkey
then covers *the engine* — "content validated against whatever spec the
registry says is canonical for this id" — which is the soundness
property of the current compiled-in design, generalized rather than
enumerated. (Compiling specs in was a real hardening — Phase 1 removed a
caller-supplied `schema_spec` field for exactly this reason — but
enumeration is a bootstrap, not the architecture.)

The validator engine (`parse_schema_spec` + `validate_content`) is
already generic. The sequence to the rest is a dependency order — every
step committed, none demand-gated:

1. **Keystone — the spec format must totally determine the ABI layout.**
   The per-schema encoders embed shape decisions (e.g. consent transposes
   its document array into three parallel arrays to suit a hand-written
   validator). For encoding to be generic the spec must declare the
   canonical layout completely. This is the load-bearing change: it also
   makes the Layer C validator mechanically derivable from the spec
   rather than hand-written.
2. **Generic encoder.** Once the spec is the total source, `encode.rs`
   collapses to one spec-driven encoder (`alloy-dyn-abi` already does
   runtime-typed encoding inside the per-schema functions).
3. **Content-binding.** The guest must verify a witness spec against an
   on-chain anchor. `SchemaRegistry` commits to a `uriHash`, not a
   spec-content hash; the schema family's identity scheme should be
   content-binding — a content-derived `schemaId`, or a registry that
   exposes `keccak256(spec)`. The deployed registry is immutable, so this
   is a registry v2 / parallel anchor — a protocol-extension-doctrine
   decision.
4. **Witness-supplied specs.** The 16 protocol specs stop being
   special-cased; they become input like any other.

### Keystone Design — Canonical ABI Mapping

The keystone makes the canonical ABI encoding of a schema's content a
total function of its `SchemaSpec` — no per-schema code. This is the
design to implement against; an audit of all 16 current encoders grounds
every decision below — 15 are pure structural transforms, one is not.

**Objective.** One generic `encode_content(&SchemaSpec, content)` — Rust
(`prover/schema/src/encode.rs`) and TS (`sdk/src/schemas/encode.ts`),
byte-identical — replaces the per-schema dispatch (12 encoder functions
over 16 schemaIds). Done-criterion: the dispatch is gone and the
encode-conformance suite passes.

**Encoding algorithm.** Content encodes as `abi_encode_params` of the
top-level `spec.fields`, in declaration order. Each field encodes
recursively by type; an absent optional field encodes as the ABI
zero-value of its type (`0`, `""`, `false`, empty array, zero-bytes). A
required field that is absent is a validation error, not an encoding
case. `stages` does not affect encoding — it scopes validation only; the
encoder always uses `spec.fields`.

**The type mapping.**

| `FieldSpec`              | ABI type                                    |
|--------------------------|---------------------------------------------|
| `boolean`                | `bool`                                      |
| `bigint`                 | `uint256`                                   |
| `integer`                | `uint<N>` — see *width*                     |
| `enum`                   | `uint8` — the value's index                 |
| `string`, no format      | `string`                                    |
| `string`, `bytes32-hex`  | `bytes32`                                   |
| `string`, `address-hex`  | `address`                                   |
| `string`, `bytes-hex`    | `bytes`                                     |
| `array<T>`               | `T[]` — element type mapped recursively     |
| `object`                 | `tuple(...)` of its fields, declared order  |

**Three conventions to fix.**

1. *Integer width.* `IntegerFieldSpec` already carries `max`. Width = the
   smallest byte-aligned `uintN` holding `max`; `uint256` when `max` is
   absent. The only sub-256 integer fields today are `figaro-geo-v2`'s
   `massGrams` / `volumeMl` (encoded `uint32`) — they must declare
   `max: 4294967295`; add it if absent (also a missing validation bound).
2. *Enum index.* `EnumFieldSpec` carries only `values`; today's
   per-schema index tables are inconsistent (merchant/courier 0-based,
   geo/fulfilment/proximity/offset/kleros 1-based). Canonical rule: index
   = 0-based position in `values`. The one optional *scalar* enum,
   `figaro-jurisdiction-v1`'s `klerosCourt`, gets an explicit leading
   `"none"` value so index 0 is a declared state, not a sentinel. Enum
   *arrays* need no sentinel — an absent optional array is the empty array.
3. *Defaults.* No `default` field is needed: "absent optional → ABI
   zero-value" covers every current case (`scope`→0, `evidenceUri`→`""`,
   `coordinations`/`handoffPoints`→`[]`, `klerosCourt`→0).

**`figaro-jurisdiction-v1` — the one non-structural encoder.** It forces
`klerosMinJurors` to 0 when `klerosCourt` is unset, and defaults it to 3
otherwise. Encoding becomes literal: `klerosMinJurors` encodes as
declared (absent → 0). The "court-set ⇒ jurors coherent" rule becomes a
`validate_content` cross-field constraint; the "suggest 3" default moves
to the authoring UI. For already-consistent content the encoded bytes
are unchanged — jurisdiction does not migrate.

**`figaro-consent-v1` — the one layout change.** Its `documents`
object-array is encoded struct-of-arrays (`bytes32[], string[],
string[]`); the canonical rule is `tuple[]`. Consent's encoder and Layer
C validator are rewritten to `tuple[]`.

**Migration verdict — timing decides it.** Under the canonical rule the
1-based enum schemas and consent's transpose change their bytes. Done
**before any persistent public registration** — today the 16 are
devnet-only — that is a free rewrite: no `-v2` schemaIds, just
regenerated Layer C validators and conformance vectors. Done **after**
mainnet/testnet registration, the off-convention schemas plus consent
need `-v2` schemaIds. The post-mainnet fallback is the explicit path:
declare per-value enum indices and integer widths in the spec, so the
generic encoder reproduces today's bytes exactly (verbose spec, zero
migration). The clean canonical design is free only while the window is
open — which is now.

**Spec-format delta.** Pre-mainnet canonical path: none for enums
(0-based position is derived); ensure `geo`'s `massGrams`/`volumeMl`
declare `max`, and `klerosCourt`'s `values` lists `"none"` at position 0.
Post-mainnet explicit path: `EnumFieldSpec` gains a per-value index and
`IntegerFieldSpec` an explicit width, each mirrored Rust ↔ TS ↔ JSON.

**Scope boundary.** This task is the encoder only — the generic Layer C
validator, content-binding, and witness-supplied specs are later steps.
It rewrites `encode.rs` / `encode.ts`, the affected spec JSONs, and the
rewritten schemas' Layer C validators; it does not touch the kernel or
its invariants. Changing the schema family — even a free pre-mainnet
rewrite — is a protocol-extension-doctrine event and runs past that
review.

**Implementation order.** (1) ratify this design; (2) `spec.rs` + TS
spec-parser changes, only if the explicit path is chosen; (3) the
generic encoder in Rust and TS, in lockstep, behind the
encode-conformance suite; (4) rewrite consent's and the off-convention
schemas' Layer C validators, regenerate conformance vectors; (5) delete
the per-schema dispatch. Once the rule holds, a generic — or
mechanically generated — Layer C validator follows from the same spec.

**Costs — one-time bootstrap costs, not recurring.** Generic JSON
parsing in-circuit is heavier than the specialized path (mitigable: a
compact binary spec form, per-batch spec amortization since a batch's
attestations share schemas). Making the spec the total ABI source is a
shape change, so the existing 16 migrate to `-v2` schemaIds with
regenerated Layer C validators — a coordinated one-time migration. The
point of paying these once is to delete the *recurring* cost the current
design imposes: a verifier redeploy per schema, forever.

**Status.** Compiling in the 16 frozen protocol schemas is an acceptable
*bootstrap* for initial mainnet — they freeze with the kernel, and launch
does not block on the engine. But the generic schema engine is a
committed prover-roadmap milestone with a definite expiry: the first
third-party schema that needs the proven path. It is not conditional on
demand — the demand is the design. None of this touches the kernel or
its invariants; it is `prover/` and `FigaroBatchVerifier`'s deployment
story.

## Proving Infrastructure — Succinct (SP1)

Figaro already uses Succinct's SP1 zkVM (`prover/`). Two further Succinct
surfaces matter for mainnet; they are proving infrastructure, separate
from the schema-engine work above and sequenced independently of it.

**On-chain verification — `SP1VerifierGateway`.** `FigaroBatchVerifier`
verifies a batch proof through `ISP1Verifier.verifyProof`;
`DeployMainnet.s.sol` wires a real verifier (devnet uses
`MockSP1Verifier`). SP1 verification is EVM-pure — a Solidity
Groth16/PLONK verifier — so it runs on any EVM chain. Succinct maintains
canonical gateway deployments on Ethereum and the major L2s (Base,
Arbitrum One, Optimism, BNB Chain among them — the current list is in
Succinct's `verification/contract-addresses` docs); a chain with no
canonical deployment can still host the verifier contract directly.
Figaro is therefore not chain-constrained — the deployment target is a
Figaro decision, not an SP1 limit.

**Proof generation — the Succinct Prover Network.** The sequencer's
`prove_groth16` (`prover/sequencer/src/prover.rs`) proves locally today;
Groth16 wrapping is RAM-heavy. The Succinct Prover Network is a
decentralised proof marketplace — submit program + inputs, receive a
proof. Adding a network prover mode alongside the existing mock and
local-Groth16 modes is a contained change to the sequencer's prover
module. It is a liveness dependency only: the proof still verifies
against the program vkey, so a faulty or adversarial prover cannot forge
a settling proof — the same liveness-not-safety boundary the sequencer
trust model already draws.

**Connection to the schema engine.** The generic schema engine raises
in-circuit cost (generic spec parsing is heavier than the specialised
path). That makes offloading proof generation to the Prover Network the
natural answer rather than scaling a self-hosted prover. The two land
independently — the schema engine is the architectural blocker, the
Prover Network lands whenever production proving is stood up — but the
engine's cost increase is what makes the network worth adopting.

## Decision Rule

1. ship the unchanged kernel on Ethereum mainnet (Track 1)
2. design the validity-proof circuit for batched kernel transitions (Track 2)
3. expand to secondary networks only when security and reward criteria are met

---

## Batch Sequencer Architecture


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
For testnet and mainnet, the sequencer runs the open-source SP1 prover
locally (`SP1_PROVER=cpu` or `cuda`) and generates Groth16 proofs — the
form `FigaroBatchVerifier` verifies on-chain. There is no dependency on an
external proving service; a sequencer self-proves like a validator runs
node software.

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

- Real Groth16 proof generation via the local SP1 prover (cpu / cuda)
- Redundant sequencer instances for availability
- Rate limiting and operation prioritization
- Monitoring and alerting

### Phase 3: Decentralized Sequencing (future)

- Shared sequencer set with leader rotation
- MEV protection (not currently a concern — the kernel has no MEV surface,
  but worth monitoring as usage patterns evolve)
- Economic incentives for sequencer operators (potentially FIG-denominated)

---

## Sequencer Trust Model


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

### Adversarial selective approval revocation (extension of INFO-3, 2026-04-26)

The base INFO-3 case is **accidental**: a user revokes approval before the
batch lands and the batch reverts. The 2026-04-26 Web3 adversarial audit
(C-2 / D-2; summary in `AUDIT_REPORT.md` "Web2 / UI / Specific-Feature
Audits") identifies a **deliberate** extension that is materially worse:

**Attack flow**:
1. Attacker observes `settleBatch` proof submission in the mempool (or learns
   of it via off-chain coordination).
2. Attacker has a small position in the batch (sufficient to be included).
3. Attacker revokes their ERC-20 approval in a higher-priority tx that lands
   in the same block as (or before) the `settleBatch` tx.
4. `safeTransferFrom` for the attacker's position reverts → entire batch
   reverts atomically.
5. **Other participants in the batch are griefed**. Their settlement is
   delayed; they may need to be re-batched. Their costs include re-batching
   gas (sequencer-borne) and time-to-settle.
6. **Attacker cost**: ~21,000 gas for the revocation tx. No bond, no on-chain
   penalty.

**Why this is worse than the accidental case**:
- The accidental revoker pays a higher cost: their own settlement reverts and
  they must re-approve and re-batch.
- The deliberate adversarial case is asymmetric: the attacker pays minimal
  gas to grief other participants of the batch.
- An attacker can repeat this against specific counterparties to systematically
  delay or extort them, especially in a batch where the attacker holds an
  unrelated grievance against another participant.

**Sequencer hardening required**:

1. **Same-block approval re-verification**: pre-submission approval checks
   MUST run against a recent block (ideally same block as proof submission).
   A 12-block-old check is insufficient — the attacker has 12 blocks of
   mempool visibility to revoke.
2. **Finality threshold + retry budget**: if `settleBatch` reverts due to
   approval revocation, the sequencer should re-batch the non-attacker
   participants and exclude addresses that revoked. Repeated revocation
   from the same address within a window is a strong signal of adversarial
   behavior — exclude that address from future batches at sequencer discretion.
3. **Optional rate-limit on settlement participation**: a sequencer may
   require an off-chain stake or reputation gate before including a
   participant in a batch, to make repeat griefing economically costly.

**Why no on-chain fix**: per DESIGN_DECISIONS.md §10, on-chain redundant
guards are rejected — the SP1 program is the single authority. Per-participant
state on-chain (e.g., a "revoked-recently" flag) breaks the stateless design
and creates new attack surface. The mitigation lives at the sequencer layer
where it belongs: detect adversarial revocations, re-batch around them,
optionally rate-limit known offenders.

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

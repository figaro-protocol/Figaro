# Scaling Strategy

**Status: BUILT — rebuilt 2026-07-16 from the teardown baseline, upgraded to the
witness model.** The proof-based batch-scaling path in Track 2 is live code:
the Rust kernel mirror + generic clause engine (`prover/lib`, `prover/clause`),
the SP1 guest (`prover/program`; a real local Core proof of the canonical batch
generates and verifies, ~1.2M cycles), the `FigaroBatchVerifier` Solidity
contract (devnet-deployed by `Deploy.s.sol`; live on Sepolia as the
`batchVerifier` in `deployments/11155111.json`, where real Groth16 batches have
settled through the canonical gateway — `CONTRACTS.md` § deployment record;
mainnet wires Succinct's gateway + program vkey the same way, by env), and the
devnet sequencer (`prover/sequencer`) with its
SDK client (`@figaro-protocol/sdk/agent` `SequencerClient`) — proven end to end by
`sdk/tests/batch-e2e.test.ts`. The rebuild landed the "Prover Clause
Architecture" end-state below on day one: the guest embeds NO clauses — specs
are witness inputs bound on-chain to `ClauseRegistry.contentHashOf`, so the
vkey covers the ENGINE and registering a clause never touches the prover.
Direct settlement (the kernel's atomic `resolveProcess`, per-process ceiling
~1,240 orders at the 30M gas limit) remains the always-available path; the
batch path is the throughput tier beside it.

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

(These nine are the kernel invariants K-1–K-9; their canonical definitions +
code/test/formal-layer mappings are authoritative in `VERIFICATION_MAP.md` —
this list is the scaling-relevant restatement, not a second source.)

## Two Constraints

Scaling involves two distinct constraints. Do not conflate them.

**Throughput**: many concurrent processes competing for block space.
Solved by cheaper execution environments.

**Depth**: single-process order count bounded by gas.
`resolveProcess` iterates every commitment in the process (~23k gas per
order, all-in cold per-tx — measured on Anvil receipts). At Ethereum's 30M
gas limit, the ceiling is ~1,240 orders.
Practical institution assemblies should stay well below this (50–100).
Depth is already solved by multi-process composition — the kernel
supports it structurally via the `processId` field, and the V3
composability contracts (`SettlementCascade`, `SettlementRouter`,
`TemplateRegistry`) proved the pattern. This is not a scaling layer
to build. It is an existing kernel property. (The kernel sees LINEAR
process chains; DAG topology lives off-chain — canonical statement in
`OPEN_WORLD.md` §1, restated in CLAUDE.md.)

## Track 1: Launch

Deploy the unchanged V5 kernel on Ethereum mainnet when the release gate
is closed. Until then, development and scaling architecture work continue
on devnet (Anvil, chain 31337) and on the public-network deployment — the
full stack, batch verifier included, is live on Sepolia
(`deployments/11155111.json`), the mainnet rehearsal.

### Sequence

1. continue development and Track 2 work on devnet
2. freeze the audited Solidity surface
3. run the final external audit pass
4. deploy on Ethereum mainnet as the canonical live settlement domain

## Two settlement paths, two DISJOINT state universes

**This is the crease.** It is the single most important thing to hold about the
scaling path, and until 2026-07-30 it was stated nowhere — not in this document,
not on a builder surface, not in an agent brief.

`FigaroCore` and `FigaroBatchVerifier` do not share state and never call each
other. A process settled through a batch advances the verifier's own
`stateRoot`; it **never acquires kernel status**. `core.orderStatus(orderHash)`
returns 0 — UNKNOWN — for it, permanently. And the converse holds: a
kernel-settled process is never inside a batch.

**What follows from it, mechanically:**

- **Anything gated on `orderStatus` cannot see batched trade.** Not "sees it
  late" — cannot see it at all. `AttestationCoordinator` requires an ACTIVE
  order; `UsageCounter.recordClauseUsage` requires a RESOLVED one. A
  batch-settled process satisfies neither, forever.
- **That is why the RPGF counter silently missed batched trade**, and why the
  bridge below exists. The gap was found by writing the soundness argument, not
  by a test or a probe — no harness could see it, because both contracts were
  individually correct.
- **It is also why guest-owned idempotence is SAFE.** The batch guest keeps its
  own counted set (under the state root) rather than consulting the counter's
  `processCounted`. That would be unsound if a process could settle on both
  paths — and it cannot.
- **A reader must fold BOTH.** An indexer, a reward calculator, or a UI that
  reads only `FigaroCore` events sees the direct path alone and under-reports
  everything that scaled. The two event streams are deliberately distinguishable
  (`FigaroBatchVerifier.Attestation` shares the coordinator's topic hash —
  filter by contract address).

**What crosses the crease, and what does not.** Exactly one thing crosses today:
the RPGF usage accrual, carried by `settleBatch` into
`UsageCounter.applyBatchAccrual` as proved numbers, never as kernel state. Value
crosses as net token positions, which is settlement, not state. Nothing else
does — no status, no process, no attestation record. Registry mutations never
enter a batch at all (they are once-per-registry-entry ETH-staked intents on the
direct path).

**PRE-COMMIT composition is direct-path only.**
`WitnessSwapAndCommitCoordinator.swapAndCommit` funds a party's bond from a
token they hold and then calls `FigaroCore.commit` in the same transaction
(`src/protocol/coordinators/WitnessSwapAndCommitCoordinator.sol:178-197`). The
batch path has no such contract and can have none in-batch: a batch operation is
`KernelOp::Commit { commitment, buyer_sig, seller_sig }`
(`prover/lib/src/types.rs:116-120`) — there is no funding leg in the wire format
or in the proof — and `settleBatch` pulls each party's NET deposit by
`transferFrom` when the batch lands (`FigaroBatchVerifier._executePositions`),
so the party must already hold the settlement currency and have approved the
VERIFIER, not the kernel. The batch-path equivalent is therefore a wallet-side
swap performed before the signed commitment is submitted. POST-settlement
composition is identical in both universes — both contracts deliver by ERC-20
transfer to the party's own address (`FigaroCore.sol:294-295`,
`FigaroBatchVerifier.sol:531`), so wallet-side routing of received tokens is
path-blind.

**The direct path remains the fallback.** The sequencer is a liveness
convenience, never a trust assumption — but "fall back to direct" means starting
a NEW process on the kernel, not migrating a batched one. There is no migration
between universes and none is planned; the crease is the design, not a gap in it.

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

### The live surface

A first prototype was built, verified locally, and deleted in the 2026-06-25
proof-apparatus teardown; the 2026-07-16 rebuild returned every piece as the
witness-based apparatus below — all of it live in the tree and inside the
frozen audit scope (`CONTRACTS.md` § "Teardown state — CLOSED" owns the
teardown/rebuild statement):

**Rust kernel mirror** (`prover/lib/`): `FigaroCore`'s commit/resolve logic
plus the attestation witness gates and the RPGF usage bridge, translated to
Rust. 4 `KernelOp` variants — `Commit`, `Resolve`, `AttestAsSeller`,
`AttestAsBuyer` (registry mutations never enter a batch; they are ETH-staked
intents on the direct path). 6-member Merkle state (processes, orderStatus,
orderProcessId, plus the three usage-accrual members `usage_counted`,
`usage_seller_seen`, `usage_accrual`).
EIP-712 signature verification with byte-exact parity to the Solidity kernel.

**Generic clause engine** (`prover/clause/`): parse + validate + encode over
any clause spec supplied as witness input — the Rust mirror of
`@figaro-protocol/sdk/clauses` (Layer A), conformance-locked against the TypeScript
side. No per-clause code, by design ("Prover Clause Architecture" below).

**SP1 guest program** (`prover/program/`): Executes `apply_batch()` in
the SP1 zkVM and commits `PublicValues` (8 fields: prev/new state roots,
chain binding — chainId + verifyingContract — and 4 commitment hashes:
token positions, attestation events, spec bindings, usage accrual).
Verified execution: ~1.2M cycles for the canonical batch (all four op
kinds: commit + attest-as-seller + attest-as-buyer + resolve) with the
k256 SP1 precompile patched in (`prover/Cargo.toml`); a real Core proof
of that batch generates and verifies locally.

**On-chain verifier** (`src/protocol/verifier/FigaroBatchVerifier.sol`): Accepts SP1 proofs,
verifies state root continuity and chain binding, hash-verifies auxiliary
calldata (positions, attestation events, spec bindings, the usage accrual),
checks each (clauseId → specHash) binding against
`ClauseRegistry.contentHashOf`, executes net token transfers, re-emits
proven `Attestation` events, and carries the batch's RPGF usage accrual to
`UsageCounter.applyBatchAccrual`.
The legacy florin-mint path has been removed along with the `florinToken`
constructor argument; the batch verifier does not and will not mint florins.
Uses `BatchEventData` struct to avoid stack-too-deep.

**Mock verifier** (`src/mocks/MockSP1Verifier.sol`): Accepts any proof
for devnet/Anvil testing. Drop-in replacement for the real SP1 gateway.

**SP1 verifier interface** (`src/protocol/verifier/ISP1Verifier.sol`): Matches
the Succinct SP1 verifier gateway ABI.

### What The Proof Must Verify

1. each `commit` in the batch preserved asymmetric bond formulas,
   dual-signature validity, monotonic cumulative value, and
   single-currency invariant
2. each `resolveProcess` in the batch preserved buyer dominance,
   atomic resolution, conservation, and direct transfer semantics
3. each attestation preserved its authorization gates, and its content
   validated against a witness spec whose bytes are bound to
   `ClauseRegistry.contentHashOf`
4. the resulting state root follows from the prior state root under
   the V5 kernel rules — no transition was skipped, reordered, or
   fabricated

### What This Changes

- settlement throughput becomes a function of proof generation, not
  block gas limits
- the on-chain footprint per settlement batch collapses to a single
  proof verification, state-root update, and net token reconciliation
- attestation events are hash-verified against the proof and re-emitted
  for frontend/indexer compatibility
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
| `commit()` execution | ~224k (root) / ~144k (sub) | ECDSA recovery × 2, storage writes, 2–4 token transfers |
| Transaction base cost | 21k | Per-transaction overhead |
| `resolveProcess()` per order | ~12.5k marginal / ~23k all-in | hashStruct + SLOAD + 2 safeTransfer + SSTORE + event |
| **Total per order** | **~190k (sub) – ~257k (root)** | Across 2+ separate transactions |

> **Which number to quote.** The two rows above are ranges because a ROOT commit
> costs more than a SUB-order commit, and resolve's MARGINAL cost (warm storage,
> mid-loop) is below its ALL-IN cost (cold, amortising the call). The single
> source of truth for anything downstream is the lint-pinned pair
> `COMMIT_GAS_PER_ORDER = 144_000` and `RESOLVE_GAS_PER_ORDER = 23_000`
> (`sdk/src/gasCeilings.ts` ↔ `test/kernel/GasCeilingTest.t.sol`, enforced by
> `scripts/lint-chain-gas.sh`) — the same anchors the ceilings table below uses,
> which is why the summary quotes ~167k/order for a sub-order. Quote those, add
> the 21k base per TRANSACTION when counting a full lifecycle, and do not
> re-derive from this table.

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
verifier's ~1,130-position ceiling against `resolveProcess`'s ~1,240-order
ceiling is misleading. The 1,240 figure measures only the resolve step
— the cheapest part of the direct lifecycle. The ~144k-gas sub-order
`commit()` calls (the root is ~235k) that preceded those resolves consumed
~179M gas across 1,240 separate transactions. The batch path eliminates all
of that: every commit, resolve, attestation, and clause registration runs
off-chain inside the SP1 prover, and only the net financial effects land
on-chain.

**Empirical gas ceilings at 30M gas limit** (resolve/commit measured on Anvil
transaction receipts, 2026-06-25):

| Path | Ceiling | Unit | Per-unit gas |
|---|---|---|---|
| Direct `commit()` | ~208 orders | Per block | ~144k/order (sub) |
| Direct `resolveProcess()` | ~1,240 orders | Single call | ~23k/order (all-in) |
| Batch `settleBatch()` | ~1,130 positions | Single call | ~26.5k/position |

The correct comparison is total lifecycle cost: ~167k gas per order
(direct) vs. ~26.5k gas per net position (batch) — roughly **6×
cheaper** per settled order, with further improvement from netting.

**Implementation note — O(n) hashing required.** The hash verification
functions that check auxiliary data parity between the proof and the
calldata must use pre-allocated memory with fixed-stride writes (assembly).
A naive `bytes.concat` loop produces O(n²) memory allocation, which
collapses the ceiling from ~1,130 to ~250 positions and negates the
batch path's gas advantage entirely.

### Batch Sequencer

The off-chain service that collects signed operations, assembles batches,
runs the SP1 prover, submits proofs to the verifier contract, and
**publishes what it settled** (`archive.rs` — the batch universe's mirror
of the kernel's `OrderCommitted` / `OrderResolved` / `ProcessResolved`
publication, which `FigaroBatchVerifier` does not emit). Implemented as a
Rust crate (`prover/sequencer/`); route contract, retention bounds, and
the publication trust story → `prover/sequencer/README.md`.

Key trust property: the sequencer is a **coordination convenience**,
not a trust assumption. It cannot fabricate operations (all operations
require valid EIP-712 signatures). It cannot violate kernel invariants
(the proof enforces them). Publication inherits the same posture — every
field a relay publishes is verifiable by the reader against the chain, so
a relay can omit or delay, never forge. Participants can always bypass the
sequencer by submitting directly to `FigaroCore` on-chain.

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

2. **State representation**: BTree-based kernel state with 6 members.
   Deterministic `compute_root()` produces a bytes32 state root by
   hashing sorted key-value pairs from each mapping. On-chain state
   root chain prevents fabricated state transitions. Known cost,
   accepted: `compute_root()` rehashes the ENTIRE state every batch (a
   flat hash); the bridge's usage maps raise the constant, not the class —
   the merkle/incremental successor takes them along.

3. **Sequencing**: Single-instance sequencer for devnet. Collects
   EIP-712 signed operations, validates pre-checks (approvals, state
   consistency), assembles `BatchInput`, runs prover, submits to
   verifier contract. Cannot fabricate, steal, or violate invariants.
   Direct `FigaroCore` fallback path always available.

4. **Settlement surface**: Devnet (Anvil, chain 31337, MockSP1Verifier), and
   live on Sepolia with the real SP1 verifier gateway — real Groth16 batches
   settled (`deployments/11155111.json`). Production: Ethereum mainnet, the
   same shape. The batch verifier and direct `FigaroCore` coexist — two-tier
   settlement model.

5. **Event reconstruction**: The verifier contract re-emits proven
   attestation events with protocol-compatible signatures, hash-verified
   against proof commitments. The runtime's event-sourced reads
   (`frontend/lib/kernel/eventCache.ts`, the single swap point) consume
   verifier events identically to `FigaroCore` events — filtered by
   contract address. Builder surfaces are chain-independent and require
   no changes.

### What Is Not Kernel Scaling

- Merkle trees for evidence or disclosure bundles → protocol-composition
  infrastructure
- zk proofs for proximity, compliance, or selective reveal →
  composition-layer tooling
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
4. **Token-reward coherence** — whether florin emission remains
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

There is no Cairo implementation in the tree. A StarkNet deployment is a
planned later line of work — a fresh Cairo REWRITE, gated on the Ethereum
mainnet leg (`RELEASE_READINESS.md` § Deployment Targets).

If a Cairo/StarkNet path becomes strategically justified:

1. write the parity matrix from the frozen V5 kernel
2. create a fresh rewrite from that matrix
3. ship it as an independent deployment, not as a bridge-dependent extension

Do not start a StarkNet implementation until V5 parity gates are cleared.

## Prover Clause Architecture — Generic Engine, Not Compiled-In Specs

Permissionless clause composition is an axiom of the protocol, not a
forecast. `ClauseRegistry.registerClause` is permissionless and
first-write-wins; the clause-author RPGF funds authors across years
2/5/9; the composition doctrine assumes third-party clause families
forever. An architecture is correct only if it serves an unbounded,
ever-growing clause population. "Is there enough demand to justify it"
is a product question and has no place here.

The removed prototype compiled the canonical specs and per-clause ABI
encoders into the SP1 guest, so adding a clause changed the guest ELF →
the program verification key → a `FigaroBatchVerifier` redeploy.
**Measured against the axiom, that is broken**: it makes registering a
clause a protocol-side migration event, and it makes the prover a
gatekeeper of the clause namespace — a component with opinions about
which clauses exist. The kernel owns nothing; a prover that knows the
clause list owns something. The 2026-07-16 rebuild landed the corrected
architecture directly; per-clause anything — embedded specs, `clauseId`
dispatch, per-clause validator contracts — is permanently rejected
(`CONTRACTS.md` § "Teardown state — CLOSED" owns that ruling).

**The live architecture.** The guest holds a generic clause *engine* —
parse + validate + encode (`prover/clause/src/spec.rs`, `validate.rs`,
`encode.rs`) — and no clauses: no embedded spec table, no per-clause
code path anywhere in `prover/`. The spec is a witness input, bound to
its `clauseId` by content hash; `ClauseRegistry` is the trust anchor —
`registerClause` anchors `contentHash = keccak256(canonical spec JSON)`,
the guest commits the deduplicated (clause key → witness-spec hash)
bindings it validated against (`spec_bindings_hash`), and `settleBatch`
checks each binding against `ClauseRegistry.contentHashOf` before
accepting the batch. Adding a clause is a `ClauseRegistry` transaction
and nothing else: no guest rebuild, no vkey change, no verifier redeploy
(`test_permissionless_newClause_settlesWithZeroVerifierChanges`). The
vkey covers *the engine* — "content validated against whatever spec the
registry says is canonical for this id." The protocol specs in `clauses/`
are input like any other clause's — nothing is special-cased, and a
never-seen clause settles through the proven path with zero code
changes.

The engine exists once in each of the two lockstep languages: Rust
(`prover/clause`, used by the SP1 guest and the sequencer) and
TypeScript (`@figaro-protocol/sdk/clauses`, Layer A) — parse/validate behavior
locked by `prover/clause/tests/conformance.rs` against the canonical
clause JSONs, encoding locked byte-for-byte against Layer A vectors by
`prover/clause/tests/encode_conformance.rs`.

### Keystone Design — Canonical ABI Mapping

The keystone that makes the generic encoder possible: the canonical ABI
encoding of a clause's content is a **total function of its
`ClauseSpec`** — no per-clause code. `encode_content_from_spec`
(`prover/clause/src/encode.rs`) and its TS mirror
(`sdk/src/clauses/encode.ts`) implement it, byte-identical under the
encode-conformance suite. This is the cross-form binding the kernel uses
inside the proof: `content_bytes` are derived from the JSON content, and
the guest asserts `keccak256(content_bytes) == content_ref`, so "some
bytes hash to content_ref" and "some JSON validates" cannot be forged
apart.

**Encoding algorithm.** Content encodes as `abi_encode_params` of the
top-level `spec.fields`, in declaration order. Each field encodes
recursively by type; an absent optional field encodes as the ABI
zero-value of its type (`0`, `""`, `false`, empty array, zero-bytes). A
required field that is absent is a validation error, not an encoding
case. Stage selection mirrors validation: when the caller passes a stage
and the spec declares a matching `stages[stage]` override, those fields
drive the encoding (a runtime witness whose content differs from the
committed content); otherwise the spec's default `fields` apply.

**The type mapping.**

| `FieldSpec`              | ABI type                                    |
|--------------------------|---------------------------------------------|
| `boolean`                | `bool`                                      |
| `bigint`                 | `uint256` (unsigned decimal string)         |
| `integer`                | `int256` — SIGNED; the spec grammar admits negative bounds |
| `enum`                   | `uint8` — 0-based position in `values`      |
| `string`, no format      | `string`                                    |
| `string`, `bytes32-hex`  | `bytes32`                                   |
| `string`, `address-hex`  | `address`                                   |
| `string`, `bytes-hex`    | `bytes`                                     |
| `array<T>`               | `T[]` — element type mapped recursively     |
| `object`                 | `tuple(...)` of its fields, declared order  |

Width never enters encoding: `abi_encode_params` pads every value to a
32-byte word, so integer `min`/`max` bounds are a *validation*-range
concern only. The string `format` axis is OPEN — a clause may declare
any format permissionlessly; an unknown one validates as a plain string
and encodes as `string`, never a hard failure. A spec's optional
`default` is build/UI composition metadata, shape-validated at parse; it
never affects encoding — "absent optional → ABI zero-value" is the whole
rule.

The canonical rule landed while the clause set was devnet-only, so no
legacy encodings survive: every spec in `clauses/` — and any third-party
spec — encodes under this one rule (object arrays as `tuple[]`, enums by
0-based position), and the conformance vectors derive from the same
specs.

**Cost posture.** Generic JSON parsing in-circuit is heavier than a
specialized path (mitigable: per-batch spec amortization, since a
batch's attestations share clauses). That in-circuit cost bought the
deletion of the *recurring* cost the compiled-in design imposed: a
verifier redeploy per clause, forever. None of this touches the kernel
or its invariants; it is `prover/` and `FigaroBatchVerifier`'s
deployment story.

## Proving Infrastructure — Succinct (SP1)

Figaro already uses Succinct's SP1 zkVM (`prover/`). Two further Succinct
surfaces matter for mainnet; they are proving infrastructure, separate
from the clause-engine work above and sequenced independently of it.

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
`prove_wrapped` (`prover/sequencer/src/prover.rs`) proves with the backend
`SP1_PROVER` names: `cpu`/`cuda` locally (Groth16 wrapping is RAM-heavy —
~14 GB), or `network` (since 2026-08-18, the alloy 1.x bump that let
sp1-sdk's `network` feature compile) — the Succinct Prover Network, a
decentralised proof marketplace: submit program + inputs, receive a proof,
paid per proof in PROVE by the REQUESTER (the relay operator; never the
protocol, never its users — the ruled cost model). It is a liveness
dependency only: the proof still verifies against the program vkey, so a
faulty or adversarial prover cannot forge a settling proof — the same
liveness-not-safety boundary the sequencer trust model already draws.
`SP1_PROOF_MODE` (`groth16` default | `plonk`) picks the form; it must be
the form the deployed verifier's gateway routes.

**Connection to the clause engine.** The generic clause engine carries
in-circuit cost (generic spec parsing is heavier than a specialised
path). That makes offloading proof generation to the Prover Network the
natural answer rather than scaling a self-hosted prover. The engine is
live; the Prover Network lands whenever production proving is stood up —
and the engine's in-circuit cost is what makes the network worth
adopting.

## Decision Rule

1. ship the unchanged kernel on Ethereum mainnet (Track 1)
2. design the validity-proof circuit for batched kernel transitions (Track 2)
3. expand to secondary networks only when security and reward criteria are met

---

## Batch Sequencer Architecture

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

- The operation type (commit, resolve, attest-as-seller, attest-as-buyer)
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
  block_timestamp: number,
  operations: KernelOp[],
  prev_state: KernelStateSnapshot,
  usage_claims: UsageClaim[],  // RPGF usage to credit for batch-settled orders
  usage_period: number,        // the counter, not the sequencer's clock, decides at settlement
  provenance_clause: Hex       // the assembly-claim leaf key, checked against UsageCounter
}
```

The `prev_state` is the sequencer's local mirror of the kernel state,
which it maintains by replaying all previously submitted batches.

### 4. Proving

The sequencer feeds the `BatchInput` to the SP1 prover, which executes
the Figaro kernel program in the zkVM and produces:

- A validity proof
- `PublicValues` (8 fields: prev/new state roots, chain binding —
  chainId + verifyingContract — and 4 commitment hashes: token
  positions, attestation events, spec bindings, usage accrual)
- `NetPosition[]` (aggregated token movements)
- `BatchEvents` (attestation events, spec bindings, the usage accruals +
  their sellers + period)

For devnet, the MockProver is used (no real proof generation).
For testnet and mainnet, the sequencer proves with the backend `SP1_PROVER`
names (`prover/sequencer/src/prover.rs`): `cpu` / `cuda` run the open-source
SP1 prover locally, `network` submits the same program + inputs to the
Succinct Prover Network (§ "Proof generation" above) — each yielding Groth16
proofs, the form `FigaroBatchVerifier` verifies on-chain. No backend is a
trust assumption: the proof verifies against the program vkey regardless of
who generated it. A sequencer self-proves like a validator runs node
software, or buys liveness — never safety — from the network.

### 5. Settlement Transaction

The sequencer submits a single transaction to `FigaroBatchVerifier.settleBatch()`:

```solidity
settleBatch(
  proof,           // SP1 proof bytes
  publicValues,    // ABI-encoded 8 × 32-byte words
  positions,       // NetPosition[] for token reconciliation
  events,          // BatchEventData (attestations, specBindings)
  usage            // BatchUsageData (period, provenanceClause, accruals, sellers)
)
```

The verifier contract:
1. Verifies the proof via ISP1Verifier
2. Checks state root continuity (`prevRoot == stateRoot`)
3. Checks chain binding (`chainId`, `verifyingContract`)
4. Verifies auxiliary calldata hashes match proof commitments
5. Checks each spec binding against `ClauseRegistry.contentHashOf`
6. Executes net token transfers
7. Re-emits protocol-compatible events
8. Forwards the usage accrual to `UsageCounter.applyBatchAccrual`
9. Advances the state root

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

1. Starting from the genesis state and checking its root against the
   verifier's on-chain `stateRoot` at startup
2. Advancing the mirror only after each successful `settleBatch`

Direct `FigaroCore` transactions never touch this state — the two
settlement paths are DISJOINT state universes (see "Two settlement
paths" above), so nothing on the direct path can move the verifier's
root. What CAN move it is another submitter: settlement is
permissionless, so if a different sequencer instance settles a batch,
this one's `prevRoot` won't match the on-chain `stateRoot`. The
sequencer must detect that divergence and re-sync before the next batch.

## Implementation Phases

### Phase 1: Devnet Sequencer (live — `prover/sequencer/`)

A Rust crate in `prover/sequencer/`; its modules:

- **Mempool** (`mempool.rs`): Thread-safe operation queue with full EIP-712
  pre-check validation for all 4 `KernelOp` variants. Rejects malformed or
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
- **Archive** (`archive.rs`): the publication mirror. Retains what each
  batch settled — the per-order commitment structs with both signatures,
  and the per-process resolution facts — bounded in memory and journalled
  to an append-only, rotated JSONL file so it survives a restart. Without
  it a batch-settled order is publicly invisible: the verifier's public
  values carry no order hashes and `BatchSettled` names no order.
- **API** (`api.rs`): axum HTTP routes — `POST /submit`, `POST
  /submit-usage`, `GET /health`, `GET /status` (state root, pending ops,
  batches settled, publication window), and the publication reads
  `GET /orders/{orderHash}`, `GET /processes/{processId}`,
  `GET /batches?from&limit`. Full contract → `prover/sequencer/README.md`.
- **Main** (`main.rs`): Env config, component bootstrap, time-triggered
  batch loop (drain → assemble → prove → submit → advance state).
  State mirror advances only after successful on-chain submission.
  On prove or submission failure, drained operations are re-queued
  to the front of the mempool via `Mempool::requeue()` — no operations
  are lost.
- MockSP1Verifier (devnet: no real proof generation; `SP1_PROVER=cpu` /
  `cuda` runs the real Groth16 prover)
- Time-based batch trigger (configurable, default 10s)
- The crate's test suite covers mempool pre-checks (valid/invalid
  signatures, wrong chain, witness-spec substitution, drain, requeue,
  dedup, caps), state mirror (genesis determinism, snapshot roundtrip,
  advance), usage claims, the publication archive (retention, journal
  restart/rotation), API (submit/status/health + the publication reads),
  and end-to-end (mempool → assemble → kernel → advance, sequential
  batch chaining)

### Phase 2: Production Sequencer

- Redundant sequencer instances for availability
- Rate limiting and operation prioritization
- Monitoring and alerting

### Phase 3: Decentralized Sequencing (future)

- Shared sequencer set with leader rotation
- MEV protection (not currently a concern — the kernel has no MEV surface,
  but worth monitoring as usage patterns evolve)
- Economic incentives for sequencers

---

## Sequencer Trust Model

This document defines what must be trusted about the batch sequencer, what is
guaranteed by the ZK proof regardless of sequencer behavior, and what operational
procedures the sequencer must follow.

---

## Overview

The Figaro batch sequencer sits in front of FigaroBatchVerifier (the on-chain
ZK proof verifier), beside the direct FigaroCore path. Its role is to:

1. Collect EIP-712-signed operations submitted by participants
2. Assemble them into batches
3. Generate an SP1 proof of the state transition from `prevStateRoot` to `newStateRoot`
4. Call `FigaroBatchVerifier.settleBatch()` to apply the batch on-chain

The sequencer is implemented in `prover/` (Rust) and exercised by
`sdk/tests/sequencer.test.ts` and `sdk/tests/batch-e2e.test.ts`.

---

## What the ZK Proof Guarantees (No Sequencer Trust Required)

The SP1 program is the single source of truth for valid state transitions
(`CONTRACTS.md` § Verifier owns the on-chain surface). The on-chain verifier
checks:

- Proof validity (Groth16 / Plonk via Succinct's SP1 verifier)
- `prevStateRoot == currentStateRoot` (chain continuity)
- `chainId` matches the chain where the verifier contract is deployed
- `verifyingContract` matches the FigaroBatchVerifier address
- Hashes of positions, attestation events, spec bindings, and the usage
  accrual match the proof public inputs

These checks mean that **no invalid state transition can be applied**, even if
the sequencer is compromised. A malicious sequencer cannot:

- Fabricate positions (amounts, addresses)
- Double-apply a batch (chain continuity check rejects it)
- Apply a batch from a different chain or contract
- Skip or alter attestation events or spec bindings

Security (correctness of what gets settled) does **not** require trusting the sequencer.

---

## What Requires Trusting the Sequencer (Liveness)

**Liveness** — the property that valid resolved orders eventually get settled —
does require trusting the sequencer. A non-submitting or slow sequencer:

- Delays net-position settlement for participants who are waiting on batch settlement
- Does not affect FigaroCore directly (FigaroCore settlement is independent of batches)

The protocol's safety invariants (bond math, buyer dominance, atomic resolution)
are enforced entirely by FigaroCore. Batch settlement is an additional coordination
layer, not a prerequisite for process resolution.

**Implication**: the sequencer is liveness-trusted infrastructure, never
safety-trusted — an off-protocol convenience with a permanent direct-path
fallback, not a trade party.

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
(findings C-2 / D-2) identifies a **deliberate** extension that is
materially worse:

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
   behavior — the sequencer re-batches without that address; the direct
   `FigaroCore` path remains open to it, always.
3. **Optional stake-based rate limiting**: a sequencer may require an
   off-chain stake before including a participant in a batch, to make
   repeat griefing economically costly. This stays within the sequencer's
   scope: it is an off-protocol liveness convenience with a permanent
   direct-path fallback — a participant it declines to batch settles
   directly on `FigaroCore`.

**Why no on-chain fix**: the SP1 program is the single authority for valid
state transitions, and on-chain redundant guards are rejected (`CONTRACTS.md`
§ Verifier owns the verifier's surface). Per-participant
state on-chain (e.g., a "revoked-recently" flag) breaks the stateless design
and creates new attack surface. The mitigation lives at the sequencer layer
where it belongs: detect adversarial revocations, re-batch around them,
optionally apply stake-based rate limiting.

---

## Sequencer Trust Assumptions Summary

| Property | Trust required? | Enforcement mechanism |
|---|---|---|
| State transition correctness | None | SP1 ZK proof + on-chain verifier |
| Chain continuity | None | `prevStateRoot == currentStateRoot` check |
| Cross-chain replay prevention | None | `chainId` + `verifyingContract` in proof public inputs |
| Batch liveness | Yes — sequencer | Operational SLA; no on-chain enforcement |
| Approval integrity before batch | Yes — sequencer | Pre-submission approval check (operational) |
| Ordering of settlements within a batch | None (up to SP1 program) | Deterministic kernel execution |

---

## Sequencer Operational Requirements

1. **Monitor the verifier**: watch `FigaroBatchVerifier.stateRoot` (and
   `BatchSettled`) so a batch settled by another submitter is detected before
   the next proof is generated against a stale `prevStateRoot`.

2. **Check approvals before proof submission**: for every position in a batch,
   verify `allowance(participant, address(batchVerifier)) >= settlement_amount`
   using a recent block. Exclude participants with insufficient approval.

3. **Handle reorgs**: use a finality threshold (e.g., 12+ confirmations on
   Ethereum mainnet) before treating a settled batch as final and advancing
   the local mirror past it, to avoid state divergence from chain reorgs.

4. **Maintain `currentStateRoot` consistency**: the sequencer keeps the
   off-chain PREIMAGE of the on-chain state root. Losing this state means the
   sequencer cannot produce valid `prevStateRoot` values until the state is
   reconstructed by replaying settled batches (the archive journals what each
   batch settled).

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
settlement — recoverable by deploying a new sequencer against the same
on-chain state root.

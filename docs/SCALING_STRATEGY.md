# Scaling Strategy

Two resolution paths, one kernel. The direct path — the kernel's atomic
`resolveProcess`, per-process ceiling ~1,240 orders at the 30M gas limit — is
the always-available floor. The batch path is the throughput tier beside it: a
Rust mirror of the kernel plus a generic clause engine (`prover/lib`,
`prover/clause`) executes many kernel transitions off-chain, an SP1 guest
(`prover/program`) proves them, and `FigaroBatchVerifier` verifies the proof
on-chain and reconciles net token positions. A sequencer (`prover/sequencer`)
carries operations to the prover; the SDK's `SequencerClient` speaks its wire.
Which networks carry a deployment is stated by the deployment records in
`deployments/`, never here.

## The Kernel's Shape

FigaroCore has two external functions: `commit` and `resolveProcess`. No
owner, no timeout, no cancel, no escape hatches.

The kernel is small and correct. Scaling must preserve it exactly. Any
execution environment must preserve these properties:

1. asymmetric bonding: buyer bond = 2 × payment, seller bond = 2 × cumulativeValue
2. dual-signed commitment entry, not staged offer/accept
3. buyer dominance at resolution
4. atomic process resolution
5. monotonic cumulative value per process
6. single-denomination invariant per process
7. direct transfer at resolution
8. the kernel takes nothing from any transfer
9. no timeout / cancel / admin escape hatches

If an execution environment changes any of these, it is not scaling the
kernel. It is proposing a different protocol.

(These nine are the kernel invariants K-1–K-9; their canonical definitions and
code/test/formal-layer mappings are authoritative in `VERIFICATION_MAP.md` —
this list is the scaling-relevant restatement, not a second source.)

## Two Constraints

Scaling involves two distinct constraints. Do not conflate them.

**Throughput**: many concurrent processes competing for block space. Solved by
cheaper execution — the batch path below.

**Depth**: single-process order count bounded by gas. `resolveProcess`
iterates every commitment in the process (~23k gas per order, all-in), so at a
30M gas limit the ceiling is ~1,240 orders; practical assemblies stay well
below it (50–100). Depth is already solved by multi-process composition — an
order in process A roots process B, each process linear and within the
ceiling. This is an existing kernel property, not a scaling layer to build.
(The kernel sees linear process chains; topology lives off-chain —
`OPEN_WORLD.md` §1.)

## The two paths share no state

This is the single most important thing to hold about the scaling path.

`FigaroCore` and `FigaroBatchVerifier` do not share state and never call each
other. A process resolved through a batch advances the verifier's own
`stateRoot`; it **never acquires kernel status**. `core.orderStatus(orderHash)`
returns 0 — UNKNOWN — for it, permanently. And the converse holds: a
kernel-resolved process is never inside a batch.

**What follows from it, mechanically:**

- **Anything gated on `orderStatus` cannot see batched trade.** Not "sees it
  late" — cannot see it at all. `AttestationCoordinator` requires an ACTIVE
  order; `UsageCounter.recordClauseUsage` requires a RESOLVED one. A
  batch-resolved process satisfies neither, forever. That is why the usage
  bridge below exists.
- **It is also why guest-owned idempotence is SAFE.** The batch guest keeps
  its own counted set (under the state root) rather than consulting the
  counter's `processCounted`. That would be unsound if a process could resolve
  on both paths — and it cannot.
- **A reader must fold BOTH.** An indexer, a reward calculator, or an
  interface that reads only `FigaroCore` events sees the direct path alone and
  under-reports everything that scaled. The two event streams are deliberately
  distinguishable (`FigaroBatchVerifier.Attestation` shares the coordinator's
  topic hash — filter by contract address).

**What crosses the boundary, and what does not.** Exactly one thing crosses:
the usage accrual for designer rewards, carried by `settleBatch` into
`UsageCounter.applyBatchAccrual` as proved numbers, never as kernel state.
Value crosses as net token positions, which is payment, not state. Nothing
else does — no status, no process, no attestation entry. Registry mutations
never enter a batch at all (they are once-per-registry-entry staked intents on
the direct path).

**Pre-commit composition is direct-path only.**
`WitnessSwapAndCommitCoordinator.swapAndCommit` supplies a party's bond from a
token they hold and then calls `FigaroCore.commit` in the same transaction.
The batch path has no such contract and can have none in-batch: a batch
operation is `KernelOp::Commit { commitment, buyer_sig, seller_sig }`
(`prover/lib/src/types.rs`) — there is no funding leg in the wire format or in
the proof — and `settleBatch` pulls each party's NET deposit by `transferFrom`
when the batch lands, so the party must already hold the denomination and have
approved the VERIFIER, not the kernel. The batch-path equivalent is a
wallet-side swap performed before the signed commitment is submitted.
Post-resolution composition is identical on both paths — both contracts
deliver by ERC-20 transfer to the party's own address, so wallet-side routing
of received tokens is path-blind.

**The direct path remains the fallback.** The sequencer is a liveness
convenience, never a trust assumption — but "fall back to direct" means
starting a NEW process on the kernel, not migrating a batched one. There is no
migration between the paths and none is planned; the disjointness is the
design, not a gap in it.

## Proof-Based Kernel Scaling

The kernel scaling problem: how do you batch many `commit` and
`resolveProcess` transitions so that the on-chain cost is sublinear in the
number of operations?

The answer is validity proofs. A prover executes many kernel transitions
off-chain and publishes a succinct proof that the resulting state root is
reachable from the prior state root under V5 rules.

### The live surface

**Rust kernel mirror** (`prover/lib/`): `FigaroCore`'s commit/resolve logic
plus the attestation witness gates and the usage bridge, translated to Rust.
Four `KernelOp` variants — `Commit`, `Resolve`, `AttestAsSeller`,
`AttestAsBuyer` (registry mutations never enter a batch). Six-member merkle
state (processes, orderStatus, orderProcessId, plus the three usage members
`usage_counted`, `usage_seller_seen`, `usage_accrual`). EIP-712 signature
verification with byte-exact parity to the Solidity kernel.

**Generic clause engine** (`prover/clause/`): parse + validate + encode over
any clause spec supplied as witness input — the Rust mirror of the SDK's
off-chain module (`@figaro-protocol/sdk/clauses`), conformance-locked against
the TypeScript side. No per-clause code, by design ("Prover Clause
Architecture" below).

**SP1 guest program** (`prover/program/`): executes `apply_batch()` in the SP1
zkVM and commits `PublicValues` — eight fields: prev/new state roots, chain
binding (chainId + verifyingContract), and four commitment hashes (token
positions, attestation events, spec bindings, usage accrual). The canonical
batch (all four op kinds) proves in ~1.2M cycles with the k256 SP1 precompile.

**On-chain verifier** (`src/protocol/verifier/FigaroBatchVerifier.sol`):
accepts SP1 proofs, verifies state-root continuity and chain binding,
hash-verifies auxiliary calldata (positions, attestation events, spec
bindings, the usage accrual), checks each (clause key → spec hash) binding
against `ClauseRegistry.contentHashOf`, executes net token transfers, re-emits
proven `Attestation` events, and carries the batch's usage accrual to
`UsageCounter.applyBatchAccrual`. It is not a florin minter. Uses a
`BatchEventData` struct to avoid stack-too-deep.

**Verifier interface and mock** (`ISP1Verifier.sol`, `MockSP1Verifier.sol`):
the Succinct gateway ABI, and a devnet stand-in that accepts any proof.

### What the proof must verify

1. each `commit` in the batch preserved asymmetric bond formulas,
   dual-signature validity, monotonic cumulative value, and the
   single-denomination invariant
2. each `resolveProcess` in the batch preserved buyer dominance, atomic
   resolution, conservation, and direct transfer semantics
3. each attestation preserved its authorization gates, and its content
   validated against a witness spec whose bytes are bound to
   `ClauseRegistry.contentHashOf`
4. the resulting state root follows from the prior state root under the V5
   kernel rules — no transition skipped, reordered, or fabricated

### What this changes

- throughput becomes a function of proof generation, not block gas limits
- the on-chain footprint per batch collapses to a single proof verification,
  state-root update, and net token reconciliation
- attestation events are hash-verified against the proof and re-emitted for
  interface/indexer compatibility
- the kernel invariants are preserved exactly — the proof enforces the same
  rules the Solidity kernel enforces, at batch scale

### What this does not change

- the kernel's external interface (`commit`, `resolveProcess`)
- the nine invariants listed above
- the event semantics consumed by the SDK and the interfaces
- buyer dominance, atomic resolution, no escape hatches

### Gas economics — why batching is cheaper

The batch path is not competing with `resolveProcess` for per-block
throughput. It replaces the *entire* direct lifecycle (`commit` +
`resolveProcess`) with a single on-chain transaction whose cost is dominated
by token transfers, not kernel logic.

**Direct path — full per-order on-chain cost:**

| Step | Gas | Notes |
|---|---|---|
| `commit()` execution | ~235k (root) / ~144k (sub) | ECDSA recovery × 2, storage writes, 2–4 token transfers |
| Transaction base cost | 21k | per-transaction overhead |
| `resolveProcess()` per order | ~12.5k marginal / ~23k all-in | hashStruct + SLOAD + 2 safeTransfer + SSTORE + event |
| **Total per order** | **~190k (sub) – ~257k (root)** | across 2+ separate transactions |

> **Which number to quote.** The rows are ranges because a ROOT commit costs
> more than a SUB-order commit, and resolve's MARGINAL cost (warm storage,
> mid-loop) sits below its ALL-IN cost (cold, amortising the call). The single
> source of truth for anything downstream is the pinned pair
> `COMMIT_GAS_PER_ORDER = 144_000` and `RESOLVE_GAS_PER_ORDER = 23_000`
> (`sdk/src/gasCeilings.ts` ↔ `test/kernel/GasCeilingTest.t.sol`) — the same
> anchors the ceilings table below uses, which is why the summary quotes
> ~167k/order for a sub-order. Quote those, add the 21k base per TRANSACTION
> when counting a full lifecycle, and do not re-derive from this table.

For 100 orders, the direct path costs ~25.7M gas across 100+ transactions.

**Batch path — full per-order on-chain cost:**

| Step | Gas | Notes |
|---|---|---|
| SP1 proof verification | ~300k | fixed cost, amortized across all operations |
| Hash verification (O(n)) | ~2k/position | pre-allocated memory, linear scaling |
| Net token transfer | ~24k/position | one `safeTransfer` per net position |
| **Total per position** | **~26.5k** | in a single transaction |

For 100 kernel operations producing ~30 net positions (after netting), the
batch path costs ~1.1M gas in one transaction.

**The netting effect.** On the direct path, every order triggers its own token
transfers. On the batch path, the prover aggregates all movements per
(token, wallet) pair into a single net position. If 100 buyers all pay the
same seller in the same token, that is 100 commit transactions on the direct
path but one net position on the batch path. Netting is the batch path's
structural advantage.

**Why it is not "half of FigaroCore."** A naive comparison of the batch
verifier's ~1,130-position ceiling against `resolveProcess`'s ~1,240-order
ceiling is misleading: the 1,240 figure measures only the resolve step — the
cheapest part of the direct lifecycle. The ~144k-gas sub-order `commit()`
calls that precede those resolutions consume ~179M gas across 1,240 separate
transactions. The batch path eliminates all of that: every commit, resolution,
and attestation runs off-chain inside the prover, and only the net effects
land on-chain.

**Ceilings at a 30M gas limit:**

| Path | Ceiling | Unit | Per-unit gas |
|---|---|---|---|
| Direct `commit()` | ~208 orders | per block | ~144k/order (sub) |
| Direct `resolveProcess()` | ~1,240 orders | single call | ~23k/order (all-in) |
| Batch `settleBatch()` | ~1,130 positions | single call | ~26.5k/position |

The correct comparison is total lifecycle cost: ~167k gas per order (direct)
against ~26.5k per net position (batch) — roughly **6× cheaper** per resolved
order, with further improvement from netting.

**Implementation note — O(n) hashing required.** The hash-verification
functions that check auxiliary-data parity between the proof and the calldata
must use pre-allocated memory with fixed-stride writes (assembly). A naive
`bytes.concat` loop produces O(n²) memory allocation, which collapses the
ceiling from ~1,130 to ~250 positions and negates the batch path's gas
advantage entirely.

### Resolved design decisions

1. **Proof system**: SP1 (Succinct) — a RISC-V zkVM. Chosen for Rust
   compatibility, a mature toolchain, and a mock prover for development.
2. **State representation**: BTree-based kernel state with six members; a
   deterministic `compute_root()` hashes sorted key-value pairs into a bytes32
   root, and the on-chain root chain prevents fabricated transitions. Known
   cost, accepted: `compute_root()` rehashes the entire state every batch; a
   merkle/incremental successor takes the usage members along.
3. **Sequencing**: a single-instance sequencer per deployment. It collects
   signed operations, runs advisory pre-checks, assembles `BatchInput`, runs
   the prover, and submits. It cannot fabricate, steal, or violate invariants;
   the direct `FigaroCore` path is always available beside it.
4. **Verification wiring**: a devnet wires `MockSP1Verifier`; a public
   deployment wires the canonical Succinct gateway and the program vkey, by
   environment. The batch verifier and the kernel coexist — two resolution
   paths.
5. **Event reconstruction**: the verifier re-emits proven attestation events
   with protocol-compatible signatures, hash-verified against proof
   commitments. Event-sourced readers consume verifier events identically to
   kernel events — filtered by contract address — so builder surfaces need no
   changes.

### What is not kernel scaling

- merkle trees for evidence or disclosure bundles → composition infrastructure
- zk proofs for proximity, compliance, or selective reveal → composition-layer
  tooling
- deploying on a cheaper network → an execution-environment choice
- multi-process composition → already a kernel property

## Secondary-network deployment

An execution-environment decision, not a scaling architecture. It is gated on
the canonical deployment being live and on the token-reward doctrine for
multi-network deployment being specified.

**Evaluation criteria, in priority order:**

1. **Security** — what trust assumptions are added relative to the canonical
   chain? Sequencer, upgrade, governance, and withdrawal assumptions must be
   explicitly acceptable. Only public networks with verifiable security
   properties qualify.
2. **Kernel fidelity** — the same Solidity, the same ABI, the same event
   semantics, the same ERC-20 interaction model.
3. **Operational continuity** — standard RPC, stable explorers, reliable
   archive and log access, standard wallet compatibility.
4. **Token-reward coherence** — whether florin issuance remains single-domain
   or becomes network-aware; whether adding a network strengthens or muddies
   denomination as a signal.
5. **Cost under real process shapes** — root commit, sub-order commit,
   resolution across realistic order counts, attestation writes.

**Rules:** each chain is an independent domain; no bridge dependency for the
first secondary deployment; no mixed-chain single-process resolution; no
cross-chain routing before single-chain parity exists; candidate selection is
security-first, never cost-first.

## Prover Clause Architecture — generic engine, not compiled-in specs

Permissionless clause composition is an axiom of the protocol, not a forecast.
`ClauseRegistry.registerClause` is permissionless and first-write-wins;
designer rewards pay designers across the nine periods; the composition
doctrine assumes third-party clause families forever. An architecture is
correct only if it serves an unbounded, ever-growing clause population — "is
there enough demand to justify it" is a product question and has no place
here.

Compiling specs into the guest fails that test: adding a clause would change
the guest ELF → the program verification key → a `FigaroBatchVerifier`
redeploy, making registration a protocol-side migration event and the prover a
gatekeeper of the clause namespace — a component with opinions about which
clauses exist. The kernel owns nothing; a prover that knows the clause list
owns something. Per-clause anything — embedded specs, `clauseId` dispatch,
per-clause validator contracts — is permanently rejected (`CONTRACTS.md`
§ "What the protocol has no contract for").

**The live architecture.** The guest holds a generic clause *engine* — parse +
validate + encode (`prover/clause/src/spec.rs`, `validate.rs`, `encode.rs`) —
and no clauses: no embedded spec table, no per-clause code path anywhere in
`prover/`. The spec is a witness input, bound to its clause key by content
hash; `ClauseRegistry` is the trust anchor — `registerClause` anchors
`contentHash = keccak256(canonical spec JSON)`, the guest commits the
deduplicated (clause key → witness-spec hash) bindings it validated against
(`spec_bindings_hash`), and `settleBatch` checks each binding against
`ClauseRegistry.contentHashOf` before accepting the batch. Adding a clause is
a `ClauseRegistry` transaction and nothing else: no guest rebuild, no vkey
change, no verifier redeploy
(`test_permissionless_newClause_settlesWithZeroVerifierChanges`). The vkey
covers *the engine* — "content validated against whatever spec the registry
says is canonical for this id." The protocol's own specs in `clauses/` are
input like any other clause's — nothing is special-cased, and a never-seen
clause resolves through the proven path with zero code changes.

The engine exists once in each of the two lockstep languages: Rust
(`prover/clause`, used by the guest and the sequencer) and TypeScript
(`@figaro-protocol/sdk/clauses`) — parse/validate behavior locked by
`prover/clause/tests/conformance.rs` against the canonical clause JSONs,
encoding locked byte-for-byte against the TypeScript vectors by
`prover/clause/tests/encode_conformance.rs`.

### Keystone design — canonical ABI mapping

The keystone that makes the generic encoder possible: the canonical ABI
encoding of a clause's content is a **total function of its `ClauseSpec`** —
no per-clause code. `encode_content_from_spec` (`prover/clause/src/encode.rs`)
and its TypeScript mirror (`sdk/src/clauses/encode.ts`) implement it,
byte-identical under the encode-conformance suite. This is the cross-form
binding the kernel uses inside the proof: `content_bytes` are derived from the
JSON content, and the guest asserts `keccak256(content_bytes) == content_ref`,
so "some bytes hash to content_ref" and "some JSON validates" cannot be forged
apart.

**Encoding algorithm.** Content encodes as `abi_encode_params` of the
top-level `spec.fields`, in declaration order. Each field encodes recursively
by type; an absent optional field encodes as the ABI zero-value of its type
(`0`, `""`, `false`, empty array, zero-bytes). A required field that is absent
is a validation error, not an encoding case. Stage selection mirrors
validation: when the caller passes a stage and the spec declares a matching
`stages[stage]` override, those fields drive the encoding; otherwise the
spec's default `fields` apply.

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

Width never enters encoding: `abi_encode_params` pads every value to a 32-byte
word, so integer `min`/`max` bounds are a *validation*-range concern only. The
string `format` axis is OPEN — a clause may declare any format
permissionlessly; an unknown one validates as a plain string and encodes as
`string`, never a hard failure. A spec's optional `default` is composition
metadata, shape-validated at parse; it never affects encoding — "absent
optional → ABI zero-value" is the whole rule. Every spec in `clauses/` — and
any third-party spec — encodes under this one rule, and the conformance
vectors derive from the same specs.

**Cost posture.** Generic JSON parsing in-circuit is heavier than a
specialized path (mitigable: per-batch spec amortization, since a batch's
attestations share clauses). That in-circuit cost buys the deletion of the
*recurring* cost a compiled-in design imposes: a verifier redeploy per clause,
forever. None of this touches the kernel or its invariants.

## Proving Infrastructure — Succinct (SP1)

Two Succinct surfaces beyond the zkVM itself; both are proving
infrastructure, separate from the clause-engine work and sequenced
independently of it.

**On-chain verification — `SP1VerifierGateway`.** `FigaroBatchVerifier`
verifies a batch proof through `ISP1Verifier.verifyProof`. SP1 verification is
EVM-pure — a Solidity Groth16/PLONK verifier — so it runs on any EVM chain.
Succinct maintains canonical gateway deployments on the major chains (the
current list is in Succinct's `verification/contract-addresses` docs); a chain
with no canonical deployment can still host the verifier contract directly.
Figaro is therefore not chain-constrained — the deployment target is a Figaro
decision, not an SP1 limit.

**Proof generation — the Succinct Prover Network.** The sequencer's
`prove_wrapped` (`prover/sequencer/src/prover.rs`) proves with the backend
`SP1_PROVER` names: `cpu`/`cuda` locally (Groth16 wrapping is RAM-heavy —
~14 GB), or `network` — the Succinct Prover Network, a decentralised proof
marketplace: submit program + inputs, receive a proof, paid per proof in PROVE
by the REQUESTER (the relay operator; never the protocol, never its
participants). It is a liveness dependency only: the proof still verifies
against the program vkey, so a faulty or adversarial prover cannot forge a
proof that resolves — the same liveness-not-safety boundary the sequencer
trust model draws. `SP1_PROOF_MODE` (`groth16` default | `plonk`) picks the
form; it must be the form the deployed verifier's gateway routes. The generic
clause engine's in-circuit cost is what makes offloading proof generation to
the network the natural answer rather than scaling a self-hosted prover.

---

## The Batch Sequencer

The off-chain service that collects signed protocol operations, assembles
them into batches, runs the SP1 prover, submits the proof and auxiliary data
to `FigaroBatchVerifier.settleBatch()`, and **publishes what it resolved**
(the batch path's mirror of the kernel's event publication, which the
verifier does not emit). It is implemented as a Rust crate in
`prover/sequencer/`; that crate's README owns the module contract, the route
contract, retention bounds, and the run-your-own recipe. This section owns
the trust model.

The sequencer is a **coordination convenience, not a trust assumption**. It
cannot fabricate operations (every operation requires valid EIP-712
signatures, verified inside the zkVM). It cannot censor terminally
(participants always have the direct `FigaroCore` path). It cannot collect
anything (the kernel takes no cut and offers no MEV surface).

### Operation lifecycle

**1. Submission.** Participants submit signed operations over HTTP. Each
carries the operation type (commit, resolve, attest-as-seller,
attest-as-buyer), the payload, and the required EIP-712 signatures. The
sequencer validates signatures on receipt and rejects malformed or mis-signed
operations.

**2. Pre-checks.** Before including an operation in a batch, the sequencer
verifies signature validity, token balance and approval for the VERIFIER (for
commits), and state consistency (no duplicate commitments; the process exists
for an extension). Pre-checks are advisory — the proof itself enforces every
invariant — but they avoid wasting prover compute on batches that would fail.

**3. Batch assembly.** Operations are drained into a `BatchInput` on a
trigger — every N seconds, or at M operations, whichever comes first —
together with the sequencer's local state snapshot, the usage claims for
batch-resolved orders, the period, and the provenance clause key. The local
state is the sequencer's mirror of the batch path's kernel state, maintained
by replaying its own landed batches.

**4. Proving.** The prover executes the kernel program in the zkVM and
produces the validity proof, the eight `PublicValues`, the `NetPosition[]`
(aggregated token movements), and the `BatchEvents` (attestations, spec
bindings, usage accruals with their sellers and period). A devnet uses the
mock prover; otherwise `SP1_PROVER` selects `cpu`, `cuda`, or `network`. No
backend is a trust assumption: the proof verifies against the program vkey
regardless of who generated it — a sequencer self-proves the way a validator
runs node software, or buys liveness, never safety, from the network.

**5. The resolution transaction.** One call to `settleBatch(proof,
publicValues, positions, events, usage)`. The verifier: verifies the proof;
checks state-root continuity and chain binding; verifies the auxiliary
calldata hashes against the proof's commitments; checks each spec binding
against `ClauseRegistry.contentHashOf`; executes the net token transfers;
re-emits protocol-compatible events; forwards the usage accrual to
`UsageCounter.applyBatchAccrual`; advances the state root.

### Trust analysis

**What the sequencer CAN do:**

- **Delay** — withhold operations from a batch. Mitigation: submit directly
  to `FigaroCore`; the sequencer is an optimization, not a requirement.
- **Order within a batch** — harmless: the kernel's transitions are
  deterministic and order-independent within a batch; there is no MEV surface.
- **Refuse service** — same mitigation as delay.

**What the sequencer CANNOT do:**

- **Fabricate operations** — every operation requires valid EIP-712
  signatures, verified inside the zkVM.
- **Steal tokens** — movements are determined by the kernel logic inside the
  proof; the verifier executes only the movements the proof commits to.
- **Violate invariants** — a batch that violates any of the nine produces no
  valid proof.
- **Forge state** — the on-chain state-root chain rejects a proof against a
  fabricated prior state, and rejects the same batch twice.
- **Replay across chains or contracts** — `chainId` and `verifyingContract`
  are in the proof's public inputs.

Correctness of what resolves requires no trust in the sequencer. What does
require trust is **liveness**: a slow or stopped sequencer delays
net-position payout for participants waiting on a batch. It cannot affect
the kernel — the kernel's path is independent of batches — so the sequencer
is liveness-trusted infrastructure, never safety-trusted: an off-protocol
convenience with a permanent direct-path fallback, not a trade party. This is
also why it does not weaken no-escape-hatches: the invariants are enforced by
the proof, and the sequencer is analogous to a block producer ordering
transactions, never to a council making discretionary decisions.

| Property | Trust required? | Enforcement |
|---|---|---|
| State-transition correctness | none | SP1 proof + on-chain verifier |
| Chain continuity | none | `prevStateRoot == stateRoot` check |
| Cross-chain replay prevention | none | `chainId` + `verifyingContract` in public inputs |
| Batch liveness | the sequencer | operational, with the direct-path fallback |
| Approval integrity before a batch | the sequencer | pre-submission approval check (operational) |
| Ordering within a batch | none | deterministic kernel execution |

### State synchronization

The sequencer starts from the genesis state, checks its root against the
verifier's on-chain `stateRoot`, and advances its mirror only after each
successful `settleBatch`. Direct `FigaroCore` transactions never touch this
state — the two paths share none — so nothing on the direct path can move the
verifier's root. What CAN move it is another submitter: `settleBatch` is
permissionless, so if a different sequencer instance lands a batch, this
one's `prevRoot` no longer matches and it must detect the divergence and
re-sync before its next batch.

### Batch DoS via approval revocation

`settleBatch` calls `safeTransferFrom` for each net position. If any
participant has revoked their ERC-20 approval between proof generation and
the transaction landing, the entire batch reverts. This is not fixable
on-chain — a per-participant "revoked recently" flag would break the
stateless design and add attack surface — so the mitigation is operational,
at the sequencer, where it belongs.

The **accidental** case costs the revoker their own payout and a re-batch.
The **deliberate** case is worse because it is asymmetric: an attacker with a
small position in the batch watches the proof submission in the mempool,
revokes their approval in a higher-priority transaction, and the whole batch
reverts — other participants' payouts are delayed at a cost to the attacker
of ~21k gas, repeatable against specific counterparties.

**Sequencer hardening:**

1. **Same-block approval re-verification** — pre-submission approval checks
   run against a recent block, ideally the submission block; a stale check
   gives the attacker a mempool-visibility window.
2. **Re-batch around revokers** — on an approval-revocation revert, re-batch
   the remaining participants and exclude the address that revoked; repeated
   revocation from one address within a window is the adversarial signal. The
   direct path remains open to the excluded address, always.
3. **Optional stake-based rate limiting** — a sequencer may require an
   off-chain stake before batching a participant, making repeat griefing
   costly. This stays within the sequencer's scope: an off-protocol liveness
   convenience with a permanent direct-path fallback.

### Operational requirements

1. **Monitor the verifier** — watch `stateRoot` and `BatchSettled` so a batch
   landed by another submitter is detected before the next proof is generated
   against a stale root.
2. **Check approvals before submission** — for every position,
   `allowance(participant, verifier) >= netAmount` at a recent block; exclude
   shortfalls.
3. **Handle reorgs** — apply a finality threshold before advancing the local
   mirror past a landed batch.
4. **Keep the root's preimage** — the sequencer holds the off-chain PREIMAGE
   of the on-chain state root; losing it means replaying landed batches from
   the publication archive to reconstruct it.
5. **Retry on gas spikes** — a `settleBatch` that reverts on gas is retried
   with more; proofs are expensive and are not discarded.

### Relationship to protocol safety

The sequencer's trusted scope cannot reach the kernel: it cannot undo a
resolved process, cannot reorder or modify payouts, cannot drain the kernel
(the verifier is a separate contract), and cannot forge proofs. The worst
outcome of a compromised or stopped sequencer is delayed batch resolution —
recoverable by pointing a new sequencer at the same on-chain state root.

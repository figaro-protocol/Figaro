# Scaling Strategy

Two resolution paths, one set of rules — `FigaroCore`'s. The direct path — `FigaroCore`'s atomic
`resolveProcess`, per-process ceiling about 550 orders under the chain's cap on one transaction's gas (EIP-7825's 2^24, which mainnet enforces; the block's budget where that is smaller — about 920 at a 30M block on a chain without the cap; the SDK reads the limit live and takes the cap) — is
the always-available floor. The batch path is the throughput tier beside it: a
Rust mirror of `FigaroCore` and of `AttestationCoordinator`'s checks
(`prover/lib`) executes many `FigaroCore` transitions off-chain, an SP1 guest
(`prover/program`) proves them, and `FigaroBatchVerifier` verifies the proof
on-chain and reconciles net token positions. A sequencer (`prover/sequencer`)
carries operations to the prover; the SDK's `SequencerClient` speaks its wire.
Which networks carry a deployment is stated by the deployment records in
`deployments/`, never here.

## `FigaroCore`'s Shape

FigaroCore has six external functions, and two of them change state:
`commit` and `resolveProcess`. The other four are views: `DOMAIN_SEPARATOR`,
`eip712Domain` (from OpenZeppelin's `EIP712`), and the getters of its two
mappings, `processes` and `orderStatus` (`src/core/kernel/FigaroCore.sol`). No
admin, no timeout, no cancel, no escape hatches.

`FigaroCore` is small and correct. Scaling must preserve it exactly. Any
execution environment must preserve these properties:

1. asymmetric bonding: buyer bond = 2 × payment, seller bond = 2 × runningTotal
2. dual-signed commitment entry, not staged offer/accept
3. buyer dominance at resolution
4. atomic process resolution
5. monotonic cumulative value per process
6. single-denomination invariant per process
7. direct transfer at resolution
8. `FigaroCore` takes nothing from any transfer
9. no timeout / cancel / admin escape hatches

If an execution environment changes any of these, it is not scaling the
`FigaroCore`. It is proposing a different protocol.

(These nine are `FigaroCore` invariants K-1–K-9; their canonical definitions and
code/test/formal-layer mappings are authoritative in `VERIFICATION_MAP.md` —
this list is the scaling-relevant restatement, not a second source.)

## Two Constraints

Scaling involves two distinct constraints. Do not conflate them.

**Throughput**: many concurrent processes competing for block space. Solved by
cheaper execution — the batch path below.

**Depth**: single-process order count bounded by gas. `resolveProcess`
iterates every commitment in the process in one transaction (the per-order
constant `RESOLVE_GAS_PER_ORDER` in `sdk/src/gasCeilings.ts`, read from live
post-fork receipts), so under the chain's cap on one transaction's gas the ceiling is about 550 orders (about 920 at a 30M block on a chain without the cap); practical assemblies stay well
below it (50–100). No code links one process to another, so the ceiling bounds
each process; clients read it live and refuse the order that would pass it
(`assertOrderFitsResolveCap`, `VERIFICATION_MAP.md` A-6). (`FigaroCore` sees
linear process chains; topology lives off-chain — `OPEN_WORLD.md` §1.)

## The two paths share no state

This is the single most important thing to hold about the scaling path.

`FigaroCore` and `FigaroBatchVerifier` do not share state and never call each
other. A process resolved through a batch advances the verifier's own
`stateRoot`; it **never acquires `FigaroCore` status**. `core.orderStatus(orderHash)`
returns 0 — UNKNOWN — for it, permanently. And the converse holds: a
`FigaroCore`-resolved process is never inside a batch.

**What follows from it, mechanically:**

- **Anything gated on `orderStatus` cannot see batched trade.** Not "sees it
  late" — cannot see it at all. `AttestationCoordinator` requires an ACTIVE
  order; `UsageCounter.recordClauseUsage` requires a RESOLVED one. A
  batch-resolved process satisfies neither, forever. That is why the usage
  bridge below exists.
- **It is also why one counted set serves both routes.** The counter's
  `sellerCounted` counts each (process id, seller) pair once, whichever route
  presents it; the guest keeps no usage state of its own. A batch-path process
  id is derived under the verifier's EIP-712 domain, a direct one under
  `FigaroCore`'s, so no id names a process on both paths, and counting a pair
  once is counting that seller of that process once.
- **A reader must fold BOTH.** The verifier emits `FigaroCore`'s own
  `OrderCommitted`, `OrderSeller`, `OrderResolved` and
  `ProcessResolved` for every batched order, and re-emits its attestations, so
  an indexer, a reward calculator or an interface reads both addresses with
  one decoder; one that reads only `FigaroCore` sees the direct path alone and
  under-reports everything that scaled. The streams stay distinguishable by
  contract address (`FigaroBatchVerifier.Attestation` shares the coordinator's
  topic hash; the order events share `FigaroCore`'s).

**What crosses the boundary, and what does not.** Exactly one thing crosses:
the uses for designer rewards — each a (kind, key, process, seller) the guest
proved — carried by `settleBatch` into `UsageCounter.applyBatchAccrual`, which
counts them into the same tally a direct call feeds, never as `FigaroCore`
state. A use is a use whichever way its process reached the chain.
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
approved the VERIFIER, not `FigaroCore`. The batch-path equivalent is a
wallet-side swap performed before the signed commitment is submitted.
Post-resolution composition is identical on both paths — both contracts
deliver by ERC-20 transfer to the party's own address, so wallet-side routing
of received tokens is path-blind.

**The direct path remains the fallback.** The sequencer is a liveness
convenience, never a trust assumption — but "fall back to direct" means
starting a NEW process on `FigaroCore`, not migrating a batched one. There is no
migration between the paths and none is planned; the disjointness is the
design, not a gap in it.

**What a party cannot do on the batch path through this project's tools.**
The app and the SDK read both paths. Each marks an order with the path whose
contract emitted it, from the emitter's address at read time
(`frontend/lib/core/indexer.ts` `parseCoreLogsByPath`; `FigaroContext.sync`,
`Order.path`, `Process.path`). What a party can do on the direct path and
cannot do on the batch path, as the code stands:

- Through the app (`docs/FRONTEND.md` § "The batch path through this app"), the app places, attests and resolves on the batch path through a relay whose reported chain, verifier and program key match the chain and whose operator lets the page's origin submit. What it does not do:
  - It sends nothing on the batch path while no such relay is in use; the order page states so.
  - It offers no send of an address detail or a content delivery on a batched order, because the send files its anchor through the coordinator.
  - It drafts a dispatch race and a quote request on the direct path alone, because a draft carries no signature that names a path.
  - It pays a bond through a swap on the direct path alone, because the swap coordinator commits through `FigaroCore`.
  - No reader of the app shows the operations a relay holds in its queue for one process.
- Through the SDK:
  - The agents start trades on the direct path only: `originateProcess`, the seller loop and `executeAction`'s `initiate-process` commit through `FigaroCore`.
  - `executeAction` sends a batched process's resolve or attestation to a relay only when it is given one (`ExecuteActionConfig.relay`); without one it sends nothing and returns `sent: "nothing"`.
  - `recordProcessUsage` counts the uses of a direct resolution only; a batched one's go through `buildUsageClaims` and `SequencerClient.submitUsageClaim`, which the agent loop does not call.
  - `SequencerClient.status` reports the relay's counts, and no reader lists the operations it holds for one process.

`SequencerClient` itself submits every batch-path operation, the commit
included (`submitCommit`); the lists above say what the app and the agent
loop do with it, not what the relay accepts.

## Proof-Based `FigaroCore` Scaling

`FigaroCore` scaling problem: how do you batch many `commit` and
`resolveProcess` transitions so that the on-chain cost is sublinear in the
number of operations?

The answer is validity proofs. A prover executes many `FigaroCore` transitions
off-chain and publishes a succinct proof that the resulting state root is
reachable from the prior state root under `FigaroCore`'s rules.

### The live surface

**Rust `FigaroCore` mirror** (`prover/lib/`): `FigaroCore`'s commit/resolve logic
plus the coordinator's attestation checks (the attesting party, an open order,
the leaf's inclusion under the signed `checkoutHash`) and the usage bridge,
translated to Rust. It reads no clause, no spec and no content.
Five `KernelOp` variants — `Commit`, `Resolve`, `ResolveByWalletCode`,
`AttestAsSeller`, `AttestAsBuyer` (registry mutations never enter a batch);
the two resolves are one rule under two forms of the buyer's authorization. Two-member state
(processes, orderStatus), committed as one sparse merkle tree with a leaf per
process and a leaf per order (`prover/lib/src/state_tree.rs`); the guest reads only the entries a
batch touches, proved against the previous root, so its work grows with the batch and with the
logarithm of the state, not with the state; a usage claim moves no state. EIP-712 signature
verification with byte-exact parity to the Solidity.

**SP1 guest program** (`prover/program/`): reads the batch with the witness of
the state entries it touches (`GuestInput`), executes `apply_guest()` in the SP1
zkVM and commits `PublicValues` — nine fields, 288 bytes: prev/new state roots, chain
binding (chainId + verifyingContract), four commitment hashes (token
positions, attestation events, the uses, and the
operation stream: every commit and resolve the batch applied, whole — a
wallet-code resolve with its authorization bytes — and every usage claim,
`prover/lib/src/operation_stream.rs`), and the clock the
guest checked deadlines against. The canonical
batch (all four op kinds) executes in 976,999 cycles with the k256 SP1
precompile on an otherwise empty state, 1,496,718 beside 1,000 stored orders
and 1,528,258 beside 10,000 (`prover/script/tests/guest_cycles.rs`, run with
`--ignored`): the witness grows with the logarithm of the state, not with the
state. A batch of one hundred operations, the size this project's relay cuts
a batch at by default (`MAX_BATCH_OPS`), executes in 21,345,189 cycles, about
213,000 an operation: twenty-five processes of a commit, two attestations and
a resolve each, with their usage claims (`the_guests_cycles_for_a_full_batch`).

**On-chain verifier** (`src/core/verifier/FigaroBatchVerifier.sol`):
accepts SP1 proofs, verifies state-root continuity and chain binding,
hash-verifies auxiliary calldata (positions, attestation events, the uses,
the operation stream), reads no registry, executes net
token transfers, re-emits
proven `Attestation` events, emits the Core's order and process events from
the operation stream and logs the stream itself (`BatchOperations`), asks
the buyer's account code about every wallet-code resolve in the stream before
any token moves (ERC-1271 `isValidSignature` over the `ResolveProcess` digest
it derives under its own domain, the batch reverting on any answer but the
magic value, since the proven root already holds the resolve), and
hands the batch's uses to `UsageCounter.applyBatchAccrual`. It is not a florin minter. Uses a
`BatchEventData` struct to avoid stack-too-deep.

**Verifier interface and mock** (`ISP1Verifier.sol`, `MockSP1Verifier.sol`):
the SP1 verifier interface (`verifyProof`, and `VERIFIER_HASH()`, which the
constructor reads to pin one SP1 verifier contract), and a devnet stand-in
that accepts any proof.

### What the proof must verify

1. each `commit` in the batch preserved asymmetric bond formulas,
   dual-signature validity, monotonic cumulative value, and the
   single-denomination invariant
2. each `resolveProcess` in the batch preserved buyer dominance, atomic
   resolution, conservation, and direct transfer semantics, its buyer's
   authorization over `ResolveProcess(bytes32 processId,uint256 runningTotal)`
   applied only while the process holds the authorized cumulative value, so it
   pays exactly the prefix of the process whose cumulative value the buyer
   authorized, every order of which the buyer co-signed; a value the process has
   not yet reached pre-authorizes exactly the orders that bring it there. The
   authorization is the buyer's ECDSA signature, which the proof recovers, or
   bytes the buyer's wallet code validates, which the proof publishes in the
   operation stream and the verifier checks against the buyer's code at
   resolution: as `FigaroCore.resolveProcess` reads `msg.sender == rootBuyer`,
   code the buyer's wallet installed while it held its key resolves on both
   paths, and nothing else does (`docs/DESIGN_DECISIONS.md` § 4)
3. each attestation preserved the coordinator's checks — its signer is the
   party, its order is committed and open, and its `clauseDataHash` opens
   against the order's signed `checkoutHash` under its inclusion proof — and
   re-emits its `contentRef` as signed; like the coordinator, the proof reads
   no clause, no spec and no content
4. the resulting state root follows from the prior state root under the
   `FigaroCore`'s rules — no transition skipped, reordered, or fabricated

### What this changes

- throughput becomes a function of proof generation, not block gas limits
- the on-chain footprint per batch collapses to a single proof verification,
  state-root update, and net token reconciliation
- attestation events are hash-verified against the proof and re-emitted, and
  the order and process events are emitted from the proof-bound operation
  stream, for interface and indexer compatibility; the stream itself is
  logged, so the state behind any root is rebuilt from the chain alone
- `FigaroCore` invariants are preserved exactly — the proof enforces the same
  rules the Solidity `FigaroCore` enforces, at batch scale

### What this does not change

- `FigaroCore`'s external interface (`commit`, `resolveProcess`)
- the nine invariants listed above
- the interfaces and the events: the verifier emits the Core's own order, process and attestation events for batched trade under its address, so an event-sourced reader folds both paths by filtering on two addresses
- buyer dominance, atomic resolution, no escape hatches

### Gas economics — why batching is cheaper

The batch path is not competing with `resolveProcess` for per-block
throughput. It replaces the *entire* direct lifecycle (`commit` +
`resolveProcess`) with a single on-chain transaction whose cost is dominated
by token transfers, not `FigaroCore` logic.

**Direct path — what each order pays on-chain:** one `commit()` transaction
per order (two ECDSA recoveries, the order's storage writes, two to four
token transfers; a process's first commit also creates its `ProcessState`),
then its share of the one `resolveProcess()` call (the order's hash, its
status read and write, two token transfers and an event), plus the call's
fixed overhead once per process and the memory the loop expands into. The
SDK's model of the resolve is `RESOLVE_FIXED_OVERHEAD`,
`RESOLVE_GAS_PER_ORDER` and the memory term
`(RESOLVE_MEMORY_WORDS_PER_ORDER·N)² / RESOLVE_MEMORY_QUADRATIC_DIVISOR`, and
of the commit `COMMIT_GAS_PER_ORDER` (`sdk/src/gasCeilings.ts`, locked to
`test/core/kernel/GasCeilingTest.t.sol` by `scripts/lint-chain-gas.sh`).
Read the ceilings from the SDK; no figure is quoted here, since each moves
with the network and its upgrades.

**Batch path — what each position pays on-chain:** one `settleBatch()`
transaction for the whole batch: the proof's verification once, then per net
position its hash check and one `safeTransfer`. The relay plans each item at
a ceiling over the measurement (`prover/sequencer/src/gas.rs`, measured in
`test/core/verifier/BatchGasCeilingTest.t.sol`, whose allowance over the
pre-fork measurement is stated there).

**The netting effect.** On the direct path, every order triggers its own token
transfers. On the batch path, the prover aggregates all movements per
(token, wallet) pair into a single net position. If 100 buyers all pay the
same seller in the same token, that is 100 commit transactions on the direct
path but one net position on the batch path. Netting is the batch path's
structural advantage.

**Why it is not "half of FigaroCore."** A naive comparison of the batch
verifier's ceiling (about 115 orders in one resolution under the 2^24 transaction cap, about
410 at a 60M block without it, as the relay plans a batch from its own
execution — `prover/sequencer/src/gas.rs`) against `resolveProcess`'s
ceiling (about 550 orders under the transaction cap, about 920 at a 30M block without it) is misleading: that figure measures only the resolve step — the
cheapest part of the direct lifecycle. The `commit()` calls that precede
those resolutions are one transaction per order, each dearer than its share
of the resolve. The batch path eliminates all of that: every commit, resolution,
and attestation runs off-chain inside the prover, and only the net effects
land on-chain.

**Ceilings.** The direct path's resolve ceiling is about 550 orders under the
2^24 transaction cap (`maxOrdersResolvablePerProcess` reads it live); its
commit rate is how many `commit()` transactions fit a block
(`maxCommitsLandableInOneBlock`). The batch path's ceiling is about 115 orders
in one resolution under the 2^24 transaction cap (EIP-7825, mainnet), each one
position, its commitment published in the operation stream and its events,
planned in the dearer of the resolve's two forms (the wallet-code one, with
the wallet's own execution); without the cap it grows with the block limit,
as the relay plans it from the batch's own execution
(`prover/sequencer/src/gas.rs`); a batch-path process is kept within what one
transaction resolves.

The correct comparison is total lifecycle cost: on the direct path every
order pays its own `commit()` transaction and its share of the resolve; on
the batch path a net position pays its share of one `settleBatch()`, with
further improvement from netting.

**Implementation note — O(n) hashing required.** The hash-verification
functions that check auxiliary-data parity between the proof and the calldata
must use pre-allocated memory with fixed-stride writes (assembly). A naive
`bytes.concat` loop produces O(n²) memory allocation, which collapses the
ceiling several-fold and negates the batch path's gas advantage entirely.

### Resolved design decisions

1. **Proof system**: SP1 (Succinct) — a RISC-V zkVM. Chosen for Rust
   compatibility, a mature toolchain, and a mock prover for development.
2. **State representation**: the mirror's three maps, committed as a compact
   sparse merkle tree over keccak256 (`prover/lib/src/state_tree.rs`): a leaf
   per process and a leaf per order (its status and process id), a lone leaf
   its own subtree, the empty state's root zero. The guest receives a witness
   of the entries a batch reads or writes, proved against the previous root,
   refuses any access outside it, and computes both roots by one descent; the
   on-chain root chain prevents fabricated transitions.
3. **Sequencing**: a single-instance sequencer per deployment. It collects
   signed operations, runs advisory pre-checks, assembles `BatchInput`, runs
   the prover, and submits. It cannot fabricate, steal, or violate invariants;
   the direct `FigaroCore` path is always available beside it.
4. **Verification wiring**: a devnet wires `MockSP1Verifier`; a public
   deployment pins one specific SP1 verifier contract for one proof form,
   never a gateway, and the program vkey, by environment. The batch verifier
   and `FigaroCore` coexist — two resolution paths.
5. **Event reconstruction**: the verifier re-emits proven attestation events
   with protocol-compatible signatures, hash-verified against proof
   commitments. It emits `OrderCommitted`, `OrderSeller`, `OrderResolved` and
   `ProcessResolved` from the operation stream, with the Core's signatures and
   ids derived under its own domain, so a reader filters them by contract
   address. Within one order it emits `OrderCommitted`, then `OrderSeller`,
   as `FigaroCore.commit` does (`_emitCommitted`). A batch is one transaction,
   so the order of its events across orders differs from the direct path. It
   emits every `Attestation` before any order event: a wallet-code
   attestation's during the walk that checks the batch, then the proof's
   attestations, then the order events, then the counter's `UsageRecorded`
   (`FigaroBatchVerifier`, steps 4, 6 and 7). A reader that depends on the
   order of logs within a transaction treats the two paths apart.
   `CoreBatchEquivalenceTest` compares the two paths' whole sequences under
   that one normalization.
6. **The deadline clock**: the proof program checks each commitment's
   `commitDeadline` against the clock the batch commits in its public values, never
   against the landing block. Whoever builds and proves the batch chooses that
   clock; `settleBatch` accepts it when it is no later than the landing
   block's `block.timestamp`, however old it is
   (`src/core/verifier/FigaroBatchVerifier.sol:419`), so a proof that took
   long to make still lands. `settleBatch` then reads
   each commit's deadline in the operation stream's `0x01` entry and refuses
   the batch (`DeadlineExpired`, `src/core/verifier/FigaroBatchVerifier.sol:741`) when it is before the landing block's
   `block.timestamp`, as `FigaroCore.commit` refuses the commitment
   (`src/core/kernel/FigaroCore.sol:147`). A commitment therefore bonds on
   either path only while its deadline has not passed at the block that bonds
   it; a batch proven before a deadline and landed after it reverts whole.

### What is not `FigaroCore` scaling

- merkle trees for evidence or disclosure bundles → composition infrastructure
- zk proofs for proximity, compliance, or selective reveal → composition-layer
  tooling
- deploying on a cheaper network → an execution-environment choice

## Secondary-network deployment

An execution-environment decision, not a scaling architecture. It is gated on
the canonical deployment being live and on the token-reward doctrine for
multi-network deployment being specified.

**Evaluation criteria, in priority order:**

1. **Security** — what trust assumptions are added relative to the canonical
   chain? Sequencer, upgrade, governance, and withdrawal assumptions must be
   explicitly acceptable. Only public networks with verifiable security
   properties qualify.
2. **`FigaroCore` fidelity** — the same Solidity, the same ABI, the same event
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

## The proof program reads no clause

Permissionless clause composition is an axiom of the protocol, not a forecast.
`ClauseRegistry.registerClause` is permissionless and first-write-wins;
designer rewards reach designers across the nine periods; the composition
doctrine assumes third-party clause families forever. An architecture is
correct only if it serves an unbounded, ever-growing clause population — "is
there enough demand to justify it" is a product question and has no place
here.

Compiling specs into the guest fails that test: adding a clause would change
the guest ELF → the program verification key → a `FigaroBatchVerifier`
redeploy, making registration a protocol-side migration event and the prover a
gatekeeper of the clause namespace — a component with opinions about which
clauses exist. `FigaroCore` owns nothing; a prover that knows the clause list
owns something. Per-clause anything — embedded specs, `clauseId` dispatch,
per-clause validator contracts — is permanently rejected (`CONTRACTS.md`
§ "What the protocol has no contract for").

**The live architecture.** The guest reads no clause: no spec, no content, no
embedded table and no per-clause code path anywhere in `prover/`. It checks a
batched attestation as `AttestationCoordinator` checks a direct one, and
`FigaroBatchVerifier` reads no registry. Adding a clause is a `ClauseRegistry`
transaction and nothing else: no guest rebuild, no vkey change, no verifier
redeploy. A clause key nobody registered is attested through a batch as it is
through the coordinator
(`test_permissionless_anUnregisteredClauseKeyIsAttestedThroughABatch`), and
the verifier makes no call to any registry
(`test_theVerifierMakesNoCallToAnyRegistryReadOrWrite`). The vkey freezes the
Core's rules and the coordinator's checks, never a clause format: a change to
the clause format's rules needs no new key, as a new clause, agreement or
process design needs none. The protocol's own specs in `clauses/` are clauses
like any other, and a never-seen clause resolves through the proven path with
zero code changes.

### What a batched attestation carries

A batched attestation carries what `AttestationCoordinator` takes on the
direct path (`AttestationWitness`, `prover/lib/src/types.rs`): the committed
clause data's hash (`clauseDataHash`) and the inclusion proof, beside the
signed `contentRef`. The guest checks who attests, that the order is committed
and open, and that the leaf
`keccak256(keccak256(clauseId ++ clauseDataHash))` opens against the order's
signed `checkoutHash` (`validate_attestation_witness`,
`prover/lib/src/kernel.rs`), and re-emits the `contentRef` as signed. No
operation carries a clause's content, so the relay and, under
`SP1_PROVER=network`, the proving network never receive it.

The reserved provenance leaf (`PROVENANCE_LEAF_KEY`) is attested like any
leaf, on inclusion alone (`a_provenance_attestation_is_accepted_on_inclusion_alone`,
`a_provenance_attestation_of_an_uncommitted_leaf_is_refused`,
`prover/lib/tests/usage.rs`). The check that the leaf names the registered
agreement and process design is made at the usage claim: `UsageCounter`, and
the guest's `apply_usage_claims`, rebuild the leaf from the claim's
`agreementHash` and `processDesignHash`.

The event the verifier re-emits is the coordinator's byte for byte
(`prover/lib/tests/attestation_vectors.rs`,
`a_batched_attestation_emits_the_coordinator_s_event_bytes`, against
`test/core/attestation/AttestationVectorsTest.t.sol`; the differential fuzz,
`KernelDifferentialFuzzTest` with `fuzz_stream.rs`, replays every coordinator
attestation through the batch path).

Neither path checks a content against its spec. A signer's tool checks the
content before signing, and a reader checks a disclosed content against the
spec its clause key names; this project's SDK (`@figaro-protocol/sdk/clauses`)
is one such tool, and the published clause format
(`sdk/src/clauses/clause-spec.schema.json`) states its rules for any other
(`docs/DESIGN_DECISIONS.md` § 26).

## Proving Infrastructure — Succinct (SP1)

Two Succinct surfaces beyond the zkVM itself; both are proving
infrastructure.

**On-chain verification — one pinned SP1 verifier.** `FigaroBatchVerifier`
verifies a batch proof through `ISP1Verifier.verifyProof` on one specific SP1
verifier contract, bound immutably at construction. The constructor reads that
contract's `VERIFIER_HASH()` and refuses any contract that names none
(`VerifierNotPinned`), a gateway included. A gateway routes proofs to verifier
versions, and its owner can freeze a route; this verifier fixes one program key
and has no upgrade path, so a route buys nothing and a frozen route would leave
every open batch-path process unresolvable. The deployment binds the one SP1
verifier contract for the chosen proof form, passed as `SP1_VERIFIER`
(`script/DeploySepoliaPair.s.sol`). SP1 verification is
EVM-pure — a Solidity Groth16/PLONK verifier — so it runs on any EVM chain; a
chain with no Succinct deployment can host the verifier contract directly.
Figaro is therefore not chain-constrained — the deployment target is a Figaro
decision, not an SP1 limit.

**Proof generation — the Succinct Prover Network.** The sequencer's
`prove_wrapped` (`prover/sequencer/src/prover.rs`) proves with the backend
`SP1_PROVER` names: `cpu`/`cuda` locally (Groth16 wrapping is RAM-heavy —
~14 GB), or `network` — the Succinct Prover Network, a decentralized proof
marketplace: submit program + inputs, receive a proof, paid per proof in PROVE
by the REQUESTER (the relay operator; never the protocol, never its
participants). It is a liveness dependency only: the proof still verifies
against the program vkey, so a faulty or adversarial prover cannot forge a
proof that resolves — the same liveness-not-safety boundary the sequencer
trust model draws. It is not only a cost choice: under `network` the whole
batch input reaches the network's provers: the signed commitments (the
parties, the token, the payment, the running total, the salt and the
deadline), the signatures or wallet-code authorization bytes, the clause keys
and stages, and the fingerprints (`KernelOp` and `UsageClaim`,
`prover/lib/src/types.rs`). No operation carries a clause's content.
`SP1_PROOF_MODE` (`groth16` default | `plonk`) picks the
form; it must be the form of the SP1 verifier contract the deployed verifier pins.

---

## The Batch Sequencer

The off-chain service that collects signed protocol operations, assembles
them into batches, runs the SP1 prover, submits the proof and auxiliary data
to `FigaroBatchVerifier.settleBatch()`. It publishes nothing a reader needs:
the batch it lands carries its operation stream and the Core's own events. It
is implemented as a Rust crate in
`prover/sequencer/`; that crate's README owns the module contract, the route
contract and the run-your-own recipe. This section owns
the trust model.

The sequencer is a **coordination convenience, not a trust assumption**. It
cannot fabricate operations (every operation requires valid EIP-712
signatures, verified inside the zkVM). It cannot keep a new process out
(any process can open on `FigaroCore` directly); a process already open on
the batch path resolves only through a batch built on the state behind the
verifier's root, which any relay rebuilds from the verifier's logs
(§ "Operational requirements"). It cannot collect
anything (`FigaroCore` takes no cut, and the relay's order chooses only among what the parties authorized).

### Operation lifecycle

**1. Submission.** Participants submit signed operations over HTTP. Each
carries the operation type (commit, resolve, attest-as-seller,
attest-as-buyer), the payload, and the required EIP-712 signatures; an
attestation carries what the coordinator takes (§ "What a batched attestation
carries"). The
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
batch-resolved orders (kind 0 a clause, 1 an assembly with its agreement's
`agreementHash`, `agreementContentHash` and membership proof, 2 a registered
agreement with its assembly's `processDesignHash`) and the period. The provenance
leaf's key is no input: the guest proves agreement and assembly claims under
its own constant and commits it in the usage hash. The
relay's pre-filter checks each claim against its own kind's registry —
`AgreementRegistry.bindings` for kind 2 — its seller's member stake and the
counter's `sellerCounted` for its process and seller, and drops a claim keyed on either
reserved key, one the counter would skip, or one whose read fails; a zero
registry address does not disable the pre-filter. The local
state is the sequencer's mirror of the batch path's state, maintained
by replaying its own landed batches.

**4. Proving.** The prover executes the mirror program in the zkVM and
produces the validity proof, the nine `PublicValues`, the `NetPosition[]`
(aggregated token movements), and the `BatchEvents` (attestations, the uses
and their period). A devnet uses the
mock prover; otherwise `SP1_PROVER` selects `cpu`, `cuda`, or `network`. No
backend is a trust assumption: the proof verifies against the program vkey
regardless of who generated it — a sequencer self-proves the way a validator
runs node software, or buys liveness, never safety, from the network.

**5. The resolution transaction.** One call to `settleBatch(proof,
publicValues, positions, events, usage, operations)`. The verifier: verifies the proof;
checks state-root continuity and chain binding; verifies the auxiliary
calldata hashes against the proof's commitments; executes the net token transfers, every pull before any payout, so a payout listed before the pull it needs lands;
re-emits the attestations and emits the Core's order and process events from
the operation stream, and logs the stream (`BatchOperations`); hands the
uses to `UsageCounter.applyBatchAccrual`; advances the state root.

### Trust analysis

**What the sequencer CAN do:**

- **Delay** — withhold operations from a batch. Mitigation for a process not yet
  opened on the batch path: open it directly on `FigaroCore`. A process already open
  on the batch path cannot move to the direct path; its buyer lands its own
  resolve instead, with a relay of its own started on the state rebuilt from
  the chain (`proveAndSettle`, `@figaro-protocol/sdk/relay`), proving with a
  prover of its choice (§ "Operational requirements" 4).
- **Order within a batch** — the relay places the operations, and where two
  signed operations conflict, its order decides which one the guest applies.
  The guest refuses a commit placed after its process's resolve
  (`ProcessAlreadyResolved`, `prover/lib/src/kernel.rs` `apply_commit`), the
  second of two sub-orders signed against one running total
  (`RunningTotalMismatch`), a resolve placed after a commit that moved the
  value it was signed over (`StaleResolveAuthorization`, `apply_resolve`),
  and an attestation placed after its process's resolve
  (`OrderAlreadyResolved`). Every operation the relay orders is one a party
  signed or its wallet code authorized, so its order chooses among what the
  parties authorized and adds nothing they did not; the same choice falls to
  a block builder on the direct path. A buyer that will not leave the choice
  to a relay signs no resolve while a commit of its process is pending, and no
  two sub-orders over one running total; a seller's attestation races the
  buyer's resolve on either path (`docs/DESIGN_DECISIONS.md` § 6).
- **Refuse service** — same mitigation as delay.

**What the sequencer CANNOT do:**

- **Fabricate operations** — every operation requires valid EIP-712
  signatures, verified inside the zkVM.
- **Steal tokens** — movements are determined by `FigaroCore` logic inside the
  proof; the verifier executes only the movements the proof commits to.
- **Violate invariants** — a batch that violates any of the nine produces no
  valid proof.
- **Forge state** — the on-chain state-root chain rejects a proof against a
  fabricated prior state, and rejects a second landing of a batch that moved
  the root. A batch that moves no state — usage claims or attestations only —
  names the current root as both prev and new, so anyone may land its proof
  again until the root moves: the counter's once-ever
  `sellerCounted` skips every use the second time, no token moves, and the
  verifier re-emits the stream, the attestations and `BatchSettled` under a new
  batch id (`DESIGN_DECISIONS.md` § 27).
- **Replay across chains or contracts** — `chainId` and `verifyingContract`
  are in the proof's public inputs.

Correctness of what resolves requires no trust in the sequencer. What does
require trust is **liveness**: a slow or stopped sequencer delays
net-position payout for participants waiting on a batch, and a lost state (every copy
of the root's preimage gone) blocks it until someone holds that state again — by
rebuilding it from the operation streams every landed batch publishes in its
transaction (a relay started with `REBUILD_FROM_CHAIN=1`). It cannot affect
`FigaroCore` — `FigaroCore`'s path is independent of batches — so the sequencer
is liveness-trusted infrastructure, never safety-trusted: an off-protocol
convenience, not a trade party, and the direct path stays open to every new
process. This is
also why it does not weaken no-escape-hatches: the invariants are enforced by
the proof, and the sequencer is analogous to a block producer ordering
transactions, never to a council making discretionary decisions.

| Property | Trust required? | Enforcement |
|---|---|---|
| State-transition correctness | none | SP1 proof + on-chain verifier |
| Chain continuity | none | `prevStateRoot == stateRoot` check |
| Cross-chain replay prevention | none | `chainId` + `verifyingContract` in public inputs |
| Batch liveness | the sequencer and the prover it proves with | operational; a new process can open on the direct path, and an open batch-path process resolves when its buyer's signed resolve reaches a relay of the pinned guest, which rebuilds the state behind the verifier's root from the chain |
| Approval integrity before a batch | the sequencer | pre-submission approval check (operational) |
| Ordering within a batch | none | deterministic mirror execution |

### State synchronization

The sequencer starts from its kept state (`STATE_PATH`; genesis on a first
run; with `REBUILD_FROM_CHAIN=1`, the state it rebuilds from the operation
streams the verifier logs), reads the verifier's on-chain `stateRoot` at
startup and before every batch, and builds only when it holds a state with
that root; it advances its
mirror only after a `settleBatch` of its own has landed. Direct `FigaroCore`
transactions never touch this state — the two paths share none — so nothing
on the direct path can move the verifier's root. What CAN move it is another
submitter: `settleBatch` is permissionless, so if a different sequencer
instance lands a batch, this one holds no state for the new root and builds
nothing until it is restarted with `REBUILD_FROM_CHAIN=1`, which replays that
batch's stream from the chain like every other. No relay serves its state to
another: the chain is the one source every relay rebuilds from.

### Batch DoS via approval revocation

`settleBatch` calls `safeTransferFrom` for each net deposit. If any
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
of one approval transaction, repeatable against specific counterparties.

**What the relay does about it** (`prover/sequencer`):

1. **Funding is checked twice, against the latest block.** A commit's two
   bonds — the buyer's 2 × payment, the seller's 2 × cumulative value — are
   read as balance and allowance to the verifier when the operation arrives
   (`/submit` refuses an unfunded commit with `402` and a reason) and again at
   batch formation, right before proving, where each wallet's funds are
   allocated across the batch's commits in order (the verifier pulls a
   wallet's bonds from one balance); a commit that does not fund is dropped
   there and dead-lettered, never proved. A revocation inside the
   proving window itself still reverts the batch; the chain's evaluated
   refusal is deterministic, so the batch is dead-lettered on the first
   attempt, never re-proved, and its operations are re-submittable.
   The door reads a commit's bonds from the landed chain alone. A commit
   whose bond would come from a payout of a resolution sent earlier in the
   same round is refused there (`unfunded commitment`), though `FigaroCore`
   accepts it, because there the two are separate transactions. That is the
   batch path's own rule: `settleBatch` makes every pull before any payout,
   so a payout of a batch cannot fund a pull of the same batch. The order
   lands in a later batch, once the payout has landed.
2. **The door is bounded.** A per-IP submit rate limit (`429`), an in-flight
   cap and a request timeout stand in front of the mempool's queue caps and
   body cap; an operation re-queued after transient submission trouble is
   dead-lettered after a fixed number of attempts, so nothing loops.
3. **The direct path stays open** to every address, always: a relay's refusal
   is a liveness decision about its own batches, never a protocol outcome.

### What a batch may cost the relay

The relay pays the gas of every `settleBatch` call it sends. The verifier
forwards a party's wallet code (an EIP-7702 delegation or a contract
wallet's `isValidSignature`) and a token's `transferFrom` all the gas left.
Code that burns that gas and then answers yes lands the batch, and nothing
names the party. The relay therefore bounds what it pays for a batch by that
batch's own plan, never by the tick's whole budget:

1. **The plan is read from the batch sent.** `submitter::submit_batch`
   computes the plan from the positions, events, operation stream and
   calldata it sends (`submitter::planned_settle_gas`), by the same function
   the tick cut the batch by (`submitter::settle_plan`,
   `gas::settle_gas_estimate`). No caller passes a ceiling of its own.
2. **The ceiling is the plan with a stated margin.** One more planned
   transfer per net position (`SETTLE_GAS_PER_POSITION`), then a quarter
   over the whole (`SETTLE_GAS_HEADROOM_PCT`), never past the tick's budget
   (`gas::settle_ceiling`). A batch whose plan is all positions costs the
   relay at most about two and a half times its plan; a batch with no
   position, at most a quarter over its plan.
3. **Above it, nothing is sent.** A node's estimate above the ceiling is a
   deterministic refusal that names nobody. The batch's wallet-code
   operations are dead-lettered alone and the rest re-queued; a batch with
   none is isolated by splitting, so the operation that reverts alone is
   dead-lettered alone (`classify_deterministic_revert`, `Mempool::isolate`).
4. **The send never passes it.** The gas limit is the estimate with a quarter
   of headroom, capped at the ceiling (`gas::settle_gas_limit`), so code that
   burns whatever it is forwarded at inclusion burns at most the ceiling.
5. **A batch with uses is sent with at least its plan.** The verifier
   reverts a batch whose call to the counter ran out of the gas it was
   handed (`AccrualStarvedOfGas`, `docs/DESIGN_DECISIONS.md` § 19). The
   node's estimate is the lowest gas at which the call does not revert, and
   it can sit near the band where the counter's call is starved. A relay
   that sent only the estimate with its headroom could see its own batch
   revert there. A batch that carries a use is therefore sent with the larger
   of the estimate with its headroom and the batch's plan, which counts
   `SETTLE_GAS_PER_USE` for each use, and never past the ceiling
   (`gas::settle_send_gas_limit`). A batch with no use keeps item 4's rule.
   The plan fits under the ceiling for every batch the relay forms, because
   the tick cuts a batch's claims until its plan fits the budget
   (`gas::trim_claims_to_budget`) and the ceiling is at least the plan under
   that budget. The Forge probe `test_settleBatch_gasStarvationProbe` holds
   the plan at or above the lowest gas at which the batch lands, at one,
   sixteen, thirty-two and sixty-four uses.

A use a batch leaves uncounted for a gate of the counter, such as a period
that closed in flight, is not lost: the verifier logs the batch's operation
stream, and whoever sends its claim again has a later batch prove it
(`fetchSkippedBatchUses`, `SequencerClient.submitUsageClaim`). This relay
keeps no claim once its batch lands. A stranger's relay may set its gas limit
otherwise; a limit that starves the counter only reverts its own batch.

The margin is sized for an honest token. A token whose transfer costs up to
twice what a position is planned at lands, and its send keeps the whole
headroom over the estimate. The quarter covers the one-time storage a first
batch writes. The headroom shrinks only for an estimate past the plan and its
per-position margin. The tests are
`a_batch_whose_code_burns_the_forwarded_gas_costs_the_relay_no_more_than_its_own_ceiling`
and `a_batch_in_a_token_costing_twice_the_planned_transfer_lands`
(`prover/sequencer/src/submitter.rs`).

### Operational requirements

1. **Monitor the verifier** — the relay reads `stateRoot` before every batch
   and builds only on a state it holds whose root that is, so a batch landed
   by another submitter is detected before the next proof is generated
   against a stale root.
2. **Check approvals before submission** — for every position,
   `allowance(participant, verifier) >= netAmount` at a recent block; exclude
   shortfalls.
3. **Handle reorgs** — apply a finality threshold before advancing the local
   mirror past a landed batch.
4. **Keep the root's preimage** — the sequencer holds the off-chain PREIMAGE
   of the on-chain state root, on disk at `STATE_PATH`, written before each
   batch is sent. Losing that copy loses nothing: a relay
   started with `REBUILD_FROM_CHAIN=1` (`prover/sequencer/src/rebuild.rs`)
   replays every landed batch's operation stream from the verifier's
   `BatchOperations` logs, holds each root to the one its `BatchSettled` names, and
   starts on the result. A relay
   that does not hold the state behind the verifier's root refuses to start.
5. **Retry on gas spikes** — a `settleBatch` that reverts on gas is retried
   with more; proofs are expensive and are not discarded.

### Relationship to protocol safety

The sequencer's trusted scope cannot reach `FigaroCore`: it cannot undo a
resolved process, cannot reorder or modify payouts, cannot drain `FigaroCore`
(the verifier is a separate contract), and cannot forge proofs. The worst
outcome of a compromised or stopped sequencer is delayed batch resolution:
any relay, started on the state rebuilt from the verifier's logs
(`REBUILD_FROM_CHAIN=1`), resumes (`AUDITOR_HANDOVER.md` § "Accepted risks and known limitations", row 6).

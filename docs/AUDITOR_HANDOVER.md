# External Audit Handover

The handover package for an external audit of Figaro's on-chain surface and
the proof apparatus beside it: what the system is, what is in scope and at
which commit, how to build it and run its gate, which properties the review is
asked to break, which behaviors are intentional, what the project's own
verification found, and the evidence the baseline passes. The project wrote
this document; where it states a judgment, the judgment is the project's, and
the review's is its own.

## At a glance

| | |
|---|---|
| Repository | https://github.com/figaro-protocol/Figaro |
| Baseline commit | set when an audit is engaged; the line counts are the tree's at the latest commit, the results the commits their rows name (§ "The baseline commit") |
| Languages in scope | Solidity (`src/`, three deploy scripts) and Rust (`prover/`, four crates) |
| Solidity in scope | 14 contract files, 1,419 lines of code (3,530 physical); 3 deploy scripts, 401 lines of code (840 physical) |
| Rust in scope | 4 crates, 21 files under `src/`, 6,966 lines of code (9,776 physical) net of their inline test modules |
| Configuration in scope | `foundry.toml`, the `Cargo.toml` files and `Cargo.lock`, the Rust toolchain pin (§ "In scope — configuration") |
| Trusted, not reviewed | SP1 (the zkVM, its crates, its on-chain verifier gateway), OpenZeppelin Contracts, Permit2, Uniswap SwapRouter02 |
| Out of scope | mocks, fuzz harnesses, tests and formal specs, the proving harness crate, the Sepolia deploy script, `frontend/`, `sdk/` |
| Deployed | Sepolia only: the baseline's contracts, the verifier pinning the baseline's own guest key (§ "What is deployed"); nothing on mainnet |
| Upgrade path | none: no admin, no proxy, no pause, in any contract |

Lines of code are counted with comments, NatSpec and blank lines removed —
the count an estimate is priced on; physical lines count every line of the
file. The Rust files carry `#[cfg(test)]` modules, out of scope like every
test, and the Rust figures leave them out (567 physical lines, 478 of code).

## Repository and build

```bash
git clone --recurse-submodules https://github.com/figaro-protocol/Figaro.git
cd Figaro && git checkout ec0e1993fffdd7b59218ba6d1eee637c526308b9
foundryup --version v1.5.1
forge build --via-ir                 # the deployed pipeline; the default profile fails on stack depth
cd prover && cargo build --locked    # Rust at the pin in rust-toolchain.toml; SP1's toolchain (sp1up) at the release Cargo.lock names
```

Without the SP1 toolchain, `cargo build --locked -p figaro-clause -p figaro-kernel`
builds the guest's two crates; the relay and the program embed the guest and
need it. The guest's own bytes, and the verification key derived from them,
come from a build inside SP1's image (§ "The guest and its verification key").

## The system

Figaro is a bonded-commitment protocol: two parties who have never met trade
under a contract whose performance and resolution are each party's best reply,
with no arbitrator, no timeout and no administrator. The nouns below are the
ones this document uses; `docs/LEXICON.md` defines every other.

- A **process** is one buyer's run of a trade: its **orders**, resolved
  together. An order is one buyer–seller commitment, an EIP-712 struct
  (`CommitmentTypes.Commitment`) that both parties sign off-chain and anyone
  may submit.
- The **buyer** (`rootBuyer`, the same wallet in every order of a process)
  pays, and is the only party who can resolve. A **seller** adds value in one
  order and is paid at resolution; the **seller of record** is the seller the
  commitment names.
- **Payment** P_i is what order i transfers from the buyer to its seller.
  **Cumulative value** G_i (`expectedCumulativeValue`) is the total payment
  through order i; each later order must extend the process's accumulator by
  exactly its own payment.
- A **bond** is what `commit` pulls into `FigaroCore`, in the process's one
  ERC-20: the buyer 2·P_i, the seller 2·G_i. **Resolution** is one call by the
  buyer over every active order, and transfers to each seller 2·G_i + P_i and
  to the buyer P_i per order: every payment transfers and every bond is
  refunded, atomically. Nothing else moves a bond.
- A **clause** is one reusable term of an agreement, registered once in
  `ClauseRegistry` under a **spec** (a JSON document whose content hash and
  URI the chain holds). An **agreement** is the clauses composed for one
  order, every field filled; its merkle root is what the commitment carries.
  A **registered agreement** is the clauses composed for one agreement with
  the designer's fills, value-free, registered in `AgreementRegistry` under
  its **agreementHash** (the merkle root over one leaf per composed clause, the
  clause key and the designer's fills, under the agreement format's leaf
  convention). An
  **assembly** is registered agreements composed into a reusable design, its
  `assemblyHash` the merkle root over its agreements, registered in
  `AssemblyRegistry`. A **designer** is the wallet that registers a clause, a
  registered agreement or an assembly, under a registration stake.
- An **attestation** is a signed statement a party makes about an open order,
  bound by merkle proof to a clause of the agreement: on the direct path
  through `AttestationCoordinator`, on the batch path inside the proof. A
  **witness spec** is the clause spec supplied to the proof as input; the
  verifier checks its hash against the registry's.
- A **member** is a wallet registered in `MembersRegistry` under a member
  stake with a withdrawal cooldown. A resolved order counts toward designer
  rewards only when its seller of record is a live-staked member.
- **Designer rewards.** `UsageCounter` scores each clause, registered
  agreement and assembly by use alone — c distinct processes, d distinct staked sellers, score
  `icbrt(c·d²)` — per annual period; `RpgfMinter` mints the period's budget
  of **florins** (the protocol's ERC-20, `FlorinToken`, one billion cap) pro
  rata to the designers of record.
- **Two resolution paths.** The **direct path** is `FigaroCore`: `commit` and
  `resolveProcess`. The **batch path** resolves many processes under one SP1
  proof. The **guest** (the proof program: the **mirror** of `FigaroCore`'s
  rules and the clause engine) runs inside the zkVM over a stream of signed
  operations and commits public values. The **relay** (the sequencer)
  collects operations, proves, and calls `settleBatch` on the **verifier**
  (`FigaroBatchVerifier`), which checks the proof, the bindings and the
  **state root** (the root of the off-chain state the next batch builds on),
  then moves the tokens and writes accrual into `UsageCounter`. `settleBatch`
  is permissionless. A process opened on one path resolves on that path.
- `WitnessSwapAndCommitCoordinator` pays a commit's bonds through a Permit2 witness
  transfer and a Uniswap swap in the same transaction, then calls
  `FigaroCore.commit`.

## Scope

This section says what the audit reviews; § "The baseline commit" says at
which commit.

The audit covers two languages: the Solidity contracts in `src/`, and the Rust
workspace in `prover/` that the batch path runs on. **Both are in scope.**

### The batch path, component by component

The protocol resolves a process on one of two paths. The direct path is the
Core, `FigaroCore`: two calls, `commit` and `resolveProcess`. The batch path
resolves many processes under one proof. The batch path has four parts; each
is named here once, with the other names the code and the documents use for
it:

| Part | Also called | Where | Language | Status |
|---|---|---|---|---|
| The on-chain verifier | the batch verifier | `src/core/verifier/FigaroBatchVerifier.sol`, `ISP1Verifier.sol` | Solidity | In scope |
| The proof program | the guest, the SP1 program, the Rust verifier, the prover, the Core mirror | `prover/program/`, `prover/lib/`, `prover/clause/` | Rust | In scope |
| The relay | the sequencer | `prover/sequencer/` | Rust | In scope |
| SP1 | the zkVM, the verifier gateway | Succinct's crates and contracts; none of their source is in this repository | Rust, Solidity | Trusted dependency; the project's use of it is in scope |

No Rust code verifies a proof on chain. "The Rust verifier" names the proof
program: the Rust that decides what a valid proof proves.

### In scope — Solidity

| Directory / file | Contents | Lines |
|---|---|---|
| `src/core/kernel/` | `FigaroCore.sol`, `CommitmentTypes.sol` | 306, 53 |
| `src/core/attestation/` | `AttestationCoordinator.sol` | 195 |
| `src/core/verifier/` | `FigaroBatchVerifier.sol`, `ISP1Verifier.sol` | 609, 15 |
| `src/build/registries/` | `ClauseRegistry.sol`, `AssemblyRegistry.sol`, `AgreementRegistry.sol` | 196, 188, 201 |
| `src/build/rewards/` | `UsageCounter.sol`, `RpgfMinter.sol` | 914, 344 |
| `src/build/florin/` | `FlorinToken.sol`, `IFlorinMinter.sol` | 83, 9 |
| `src/app/` | `MembersRegistry.sol`, `WitnessSwapAndCommitCoordinator.sol` | 210, 239 |
| `script/Deploy.s.sol` | Devnet deploy (defines the devnet surface) | 428 |
| `script/DeployMainnet.s.sol` | Mainnet deploy (defines the audited mainnet surface; deploys the swap coordinator) | 354 |
| `script/DeploySwapCoordinator.s.sol` | The swap coordinator alone onto a LIVE stack | 58 |

The Lines column counts physical lines, every line of the file.

### In scope — Rust

`prover/` is one Cargo workspace of five crates (`prover/README.md`). Four are
in scope.

| Crate | Package | Lines | What it is | What a defect costs |
|---|---|---|---|---|
| `prover/program/` | `figaro-prover` | 13 | The guest's entry point: reads the batch input, runs the Core mirror, commits the public values | A batch the chain resolves wrongly |
| `prover/lib/` | `figaro-kernel` | 2,033 | The mirror of `FigaroCore`'s commit and resolve logic, the witness gates, the public-values encoding, the state root, the usage accrual | A batch the chain resolves wrongly |
| `prover/clause/` | `figaro-clause` | 1,939 | The generic clause engine: parses any clause spec supplied as witness input, validates content against it, encodes it | An attestation the batch path reads differently from the party who signed it |
| `prover/sequencer/` | `figaro-sequencer` | 5,791 | The relay: collects signed operations, forms batches, proves them, calls `settleBatch`, publishes what it resolved | Liveness and griefing; a reader misled by what the relay publishes |

The Lines column counts physical lines under each crate's `src/`, net of the
inline test modules.

**The proof program** (`prover/program/`, `prover/lib/`, `prover/clause/`) is
what a valid proof proves: `FigaroBatchVerifier` accepts the public values a
proof under `programVKey` commits to, so a defect in the guest is a batch the
chain resolves wrongly — the same class of loss as a Core defect. Review
goal: public-values completeness — no operation stream yields public values
the verifier accepts that differ from what `FigaroCore` would have done with
the same signatures.

**The relay** (`prover/sequencer/`). `settleBatch` is permissionless and the
proof is checked on chain, so the relay cannot forge; the direct path stays
open to every new process (`SCALING_STRATEGY.md` § Trust analysis). A process
opened on the batch path resolves on the batch path, through a batch built on
the state behind the verifier's root, which the relay that built the last
batch holds (Known limitation 6).
It holds one key, `SEQUENCER_PRIVATE_KEY`, which signs the `settleBatch`
transaction and pays its gas; the key grants no protocol privilege. What the
relay publishes is how a stranger checks that a batch happened; nothing it
publishes is authority, and every field is checkable against the chain, with one
stated limit: the wire carries no inclusion proof, so a browser can check that a
batch with the named root landed, never that a given order is under that root.
Review goals: a stall for free, mempool poisoning, re-queue exhaustion, the
handling of its one key, and a publication that misleads its reader.

### In scope — configuration

A few files hold no program logic and decide what the program is. An
audit platform's file picker may not list them; they are in scope all the
same, and short.

| File | What it decides |
|---|---|
| `foundry.toml` | The Solidity compiler's version, EVM version and optimizer; the import remappings; which files a test may read and write |
| `scripts/deploy-mainnet.sh` | The mainnet deploy's wrapper: its guards, and the `--via-ir` flag the deployed bytecode is compiled with |
| `scripts/check-sp1-gateway-route.sh` | The deploy's refusal of an SP1 gateway that does not route this release's proofs |
| `prover/Cargo.toml` | The workspace's members and Rust floor; the `[patch.crates-io]` entry that routes the guest's signature recovery through SP1's patched `k256` |
| `prover/Cargo.lock` | Every Rust dependency's exact version, the SP1 release among them. The verification key is a function of it |
| `prover/rust-toolchain.toml` | The Rust release the guest and the relay are built with |
| `prover/clause/Cargo.toml`, `prover/lib/Cargo.toml` | The guest's direct dependencies and their features: `serde_json`'s `float_roundtrip`, without which a number written with a fraction is read inexactly |
| `prover/program/Cargo.toml`, `prover/sequencer/Cargo.toml`, `prover/sequencer/build.rs` | The guest's and the relay's dependencies; the build step that compiles the guest the relay embeds |

### Trusted dependency — SP1

SP1 is Succinct's zkVM. The audit reviews how the project uses SP1. It does not
review SP1.

| In scope: the project's use of SP1 | Where |
|---|---|
| The interface the verifier calls | `src/core/verifier/ISP1Verifier.sol` |
| The one proof check, and everything `settleBatch` does with the public values after it | `FigaroBatchVerifier.sol:287` |
| The guest's three SP1 calls: entry point, input read, public-values commit | `prover/program/src/main.rs` |
| The verification key: derived from the guest, pinned at construction, immutable | `FigaroBatchVerifier` constructor; `sequencer --vkey` |
| The choice of the patched `k256` for signature recovery inside the zkVM | `prover/Cargo.toml` `[patch.crates-io]` |
| The relay's proving calls | `prover/sequencer/src/prover.rs` |
| The deploy-time check that the gateway routes this release's proofs | `scripts/check-sp1-gateway-route.sh` |

| Trusted, not reviewed | Pinned where |
|---|---|
| The SP1 zkVM and the `sp1-*` crates | `prover/Cargo.lock` names the release |
| `sp1-patches/elliptic-curves`, the patched `k256` | `prover/Cargo.lock` |
| The SP1 verifier gateway and the verifier contracts behind it | `SP1_VERIFIER_GATEWAY`, an immutable constructor argument |

SP1 is trusted for one property: that a proof accepted under `programVKey`
came from the program with that key. The other external dependencies are in
§ "Actors, privileges, and external dependencies".

### Out of scope

- `src/mocks/` — test helpers, never deployed to mainnet
- `src/echidna/` — fuzzing harnesses, never deployed to mainnet
- `test/`, `certora/`, `formal/` — the verification harnesses; evidence for the
  audit, not its subject
- `prover/script/` — the host-side proving harness, the fifth crate; it holds
  the guest's end-to-end test and is never deployed
- `script/DeploySepolia.s.sol`, `script/MintTokens.s.sol` — testnet and devnet
  scripts; the mainnet surface is `DeployMainnet.s.sol`'s
- `frontend/`, `sdk/` — the client, reviewed separately. One part of the SDK
  is load-bearing for this scope though outside it: `@figaro-protocol/sdk/clauses`
  is the reference the guest's clause engine is locked to, and a reviewer of
  `prover/clause/` reads the two side by side.

## The baseline commit

No external audit is engaged, so no commit is under audit. The line counts
in § "At a glance" and § "Scope" are the tree's at the latest commit. The
results — every figure under § "Verification evidence" — are those measured
at the commits each row names, the last full production at `eeb903b7`; the
code has moved since, and each result stands for its own commit alone. The
guest has changed since `eeb903b7`: a seller's attestation is checked
against the attested order's own seller, the provenance leaf's bytes
name the assembly's root `assemblyHash` where they named `compositionHash`,
and an assembly claim's membership leaf carries the assembly tree's own
domain (`assembly_leaf`), so the verification key moves; on the Solidity side
`CommitmentTypes` gained the agreement format's one leaf function, which the
coordinator and the counter now call in place of three inline copies, and the
counter builds the assembly leaf in one internal function. The guest's batch
runs its operations through one function, `apply_operations`, and its claims
through `apply_claims`, neither computing a root; the relay's trials call the
same two on a clone of their running state, so a trial costs one operation
where it cost the whole state's keccak and a snapshot rebuild — the public
values are unchanged (the transition vectors and the executor tests), the
verification key moves with the guest's bytes. The Sepolia verifier's pinned
key is the earlier guest's. `RpgfMinter` takes the members registry after the
counter and rewards a designer only while it holds a live member stake
(`NotLiveMember`, read on the claimant before any key; `claimable` quotes a
non-member zero), the designer-side membership gate the powers table below
already stated; the Sepolia minter predates it, a stated divergence in its
expectations until the pair redeploy. When an audit is
engaged, this section names the commit it reviews, the line counts and the
results are measured there once, and a tag is placed at it. The descriptive
sections of this document stay true of the code throughout.

```bash
git show --no-patch eeb903b7
```

The baseline differs from the previous baseline, `32c4ef8d`, in the relay,
in `UsageCounter`'s one error and in comments. `scripts/frozen-scope.sh`
prints these scope files as differing in code: the relay's
`prover/sequencer/src/main.rs`, `mempool.rs`, `api.rs`, `submitter.rs` (its
test constructors' `behind` field) and `Cargo.toml` (`tower-http`'s `cors`
feature), with `prover/sequencer/tests/sequencer.rs`; `src/build/rewards/UsageCounter.sol`;
`prover/clause/tests/encode_conformance.rs` (one vector added); and
`prover/Cargo.lock`. Every other scope file differs in comments and NatSpec
alone, line for line, and the guest's
one changed line (`prover/lib/src/types.rs`, a comment) keeps its line count,
so the verification key stands. In the relay, a deferred operation expires on
its own window and takes with it what was filtered behind it, the groups
decide only what is drained together, admission refuses a resolve that lists
one order twice, the read routes carry CORS, one in-flight cap counts every
route, and a recorded error carries no URL (§ "Behaviors to surface"; Known
limitation 7; `formal/RelayState.tla`, `DeferSpec`). `UsageCounter` reverts
`ClauseAgreementOrAssemblyNotRegistered` where it reverted
`ClauseOrAssemblyNotRegistered`; no other statement moved. `prover/Cargo.lock`
names `rustls-webpki` 0.103.16, `webpki-roots` and `webpki-root-certs` 1.0.10
(RUSTSEC-2026-0381/0382/0383), the relay's host TLS, outside the guest's graph;
that lock is the one difference between the baseline and `4fd38042`, so a
figure measured at `4fd38042` stands for the baseline. The layers re-run there
are the ones the change reaches: Foundry, the `UsageCounter` Halmos harness,
Certora's `FigaroCore.spec` and the new `RpgfMinterAuthor.spec`, the Rust
workspace, the relay's TLA+ deferral model, and the batch end-to-end.

`32c4ef8d` differs from the previous baseline, `28489848`, in the relay
alone, in no contract and in no guest crate: `scripts/frozen-scope.sh`
prints `prover/sequencer/src/main.rs`, `mempool.rs`, `assembler.rs`,
`api.rs` and `submitter.rs` (its test module) as differing in code. Batch
formation defers what it dropped at first sight before — an operation that
applies against no order of its drain, a commit whose funding could not be
read, and what was filtered behind such a commit — bounded in time from the
first deferral, drained only into the room the queue leaves, its group
whole; a copy resubmitted meanwhile is dropped when an operation is deferred
or re-queued; and `GET /status` counts dropped usage claims apart from
operations (§ "Behaviors to surface"; Known limitation 7;
`formal/RelayState.tla`, `DeferSpec`). The guest's bytes did not change, so
the verification key stands. The layers re-run at the baseline are the ones
§ "The gate" names at it: the Rust workspace, the relay's TLA+ model in both
configurations, and the batch end-to-end, re-run at `32c4ef8d`; Foundry, Halmos, Certora, Echidna,
the differential fuzz and the Vitest suites read none of the relay's code,
and stand at the commits their rows name.

`28489848` differs from the previous baseline, `d934e032`, in comments
alone: the NatSpec of `AssemblyRegistry`, `AgreementRegistry` and
`UsageCounter`, a comment in `script/Deploy.s.sol` and one in the relay's
`submitter.rs` say agreement and registered agreement, the lexicon's nouns,
where they said the words the lexicon retired; the guest's test files and
the parity fixtures' per-leaf keys say clause (`clauseData`,
`clauseDataHash`, `clauseCount`), every hex value in the fixtures
unchanged; no statement, no ABI and no crate source moved, so every figure
measured at `0cfded15` stands and names it, and `figaro-kernel`'s tests pass
at `28489848`.

`d934e032` differs from `0cfded15` in the guest's
test files alone (`prover/lib/tests/`: the test names, the variables and the
parity fixture's `agreements[]` and `agreementBytes` keys say agreement, the
lexicon's noun), in no contract and in no crate source; every figure
measured at `0cfded15` stands and names it, and `figaro-kernel`'s tests pass
at `d934e032`.

`0cfded15` differs from `ec0e1993` in one guest
test file and the lockfile, in no contract and in no crate source:
`prover/lib/tests/merkle_parity.rs` reads each registered agreement's clause
leaves and membership proofs from `test/fixtures/assembly-vectors.json` and
holds the agreement key to the root over them (the SDK's `agreementKeyOf` is
that root; nothing on chain or in the guest derives the key), and
`prover/Cargo.lock` names rustls 0.23.46 (`98255ef8`, the relay's host TLS,
outside the guest's graph). Every figure measured at `ec0e1993` stands and
names it; re-run at `0cfded15`: `MerkleParityTest` 5 passed,
`figaro-kernel` `merkle_parity` 8 and `parity` 31 passed.

`ec0e1993` differs from `e800bfb2` in one more
registry family and in the reward's third kind. `scripts/frozen-scope.sh`
prints these scope files as differing in code:
`src/build/registries/AgreementRegistry.sol` (new),
`src/build/rewards/UsageCounter.sol`, `src/build/rewards/RpgfMinter.sol`,
`script/Deploy.s.sol`, `script/DeployMainnet.s.sol`,
`prover/lib/src/kernel.rs`, `prover/lib/src/types.rs`,
`prover/sequencer/src/main.rs` and `prover/sequencer/src/submitter.rs`, with
the guest's test files under `prover/lib/tests/`.
- `AgreementRegistry` is a fourth registry family, parallel to
  `ClauseRegistry`, `AssemblyRegistry` and `MembersRegistry`, and reads none
  of them: `registerAgreement(bytes32 agreementKey, string contentURI)` is
  first-write-wins under the exact `registrationDeposit` stake, refuses the
  zero key (`ZeroAgreementKey`), an empty URI (`EmptyContentURI`) and both
  reserved keys (`ReservedKeyIsNotARegistration`); `withdrawDeposit` returns
  the stake once to the registrant and leaves the binding
  (`AgreementRegistry.sol:159-200`; `test/build/registries/AgreementRegistryTest.t.sol`,
  `test_registerAgreement_revertsOnTheReservedKeys`; `HalmosAgreementRegistry`,
  six properties).
- `UsageCounter` counts three kinds, `KIND_CLAUSE = 0`, `KIND_ASSEMBLY = 1`
  and `KIND_AGREEMENT = 2` (`UsageCounter.sol:161-167`), and its constructor
  takes `_agreements` after `_assemblies`. The provenance leaf's bytes name
  two keys, `{"agreementKey":"0x…","compositionHash":"0x…"}`, rebuilt from
  the claim (`_requireProvenance`, `:607-622`). `recordAgreementUsage(order,
  agreementKey, compositionHash, proof)` proves that leaf and accrues under
  `KIND_AGREEMENT` while the agreement's stake is live in `AgreementRegistry`
  (`:534-550`). `recordAssemblyUsage(order, compositionHash, agreementKey,
  slotContentHash, leafProof, membershipProof)` proves the same leaf, then
  the agreement's leaf `keccak256(keccak256(assemblyLeafDomain ‖ agreementKey ‖ slotContentHash))`
  under `compositionHash`, reverting `InvalidMembershipProof` when it does not
  open (`:572-603`). `applyBatchAccrual` gains the `KIND_AGREEMENT` branch.
- Two reserved keys, the provenance leaf's `keccak256("figaro-agreement-provenance")`
  and the assembly terms leaf's `keccak256("figaro-assembly-terms")`
  (`provenanceLeaf`, `assemblyTermsLeaf`, `UsageCounter.sol:188`, `:198`),
  are refused as registrations wherever a key is taken: `_accrue` reverts
  `ReservedKeyIsNotARegistration(bytes32)` on either under every kind
  (`:788-790`), `applyBatchAccrual` skips either (`:733`), and
  `recordAssemblyUsage` refuses either as an agreementKey (`:586-588`). The
  error replaces `ProvenanceLeafIsNotARegistration`, which no longer exists
  in the counter or the guest.
- `RpgfMinter` takes `_members` after `_counter` and `_agreements` after
  `_assemblies`; `_isAuthor(2, key, account)` reads `AgreementRegistry.bindings`
  and no other registry, and any kind above 2 reverts `UnknownKind`
  (`RpgfMinter.sol:329-343`); `claim` reads `members.registered(msg.sender)`
  before any key and reverts `NotLiveMember` for a non-member.
- No kind gates another: each recording path reads its own kind's registry
  only, and `_isAuthor` the one registry its kind names.
- The guest: `UsageClaimKind` has three variants, `Clause { section_hash }`,
  `Agreement { composition_hash }` and `Assembly { agreement_key,
  slot_content_hash, membership_proof }`, with `code()` 0, 2 and 1
  (`types.rs`); `provenance_section_bytes(agreement_key, composition_hash)`
  reproduces the two-key bytes, an assembly claim verifies its membership
  proof under the compositionHash with the same sorted-pair verifier, and a
  claim keyed on either reserved key, or an assembly claim naming either as
  its agreementKey, is refused (`kernel.rs:787-794`).
- The relay reads `AgreementRegistry.bindings` for a kind-2 claim
  (`AGREEMENT_REGISTRY_ADDRESS`, `main.rs`) and drops a claim naming either
  reserved key before proving (`submitter.rs`, `names_a_reserved_key`).
- The deploy scripts deploy `AgreementRegistry` beside `AssemblyRegistry`,
  0.05 ETH on mainnet, and pass it to the counter and the minter.

Unchanged: `FigaroBatchVerifier`, its `_hashUsage` packing
(`key(32) ‖ kind(1) ‖ c(8) ‖ d(8)`, the kind already one byte), the public
values, and the Core. The guest's bytes changed, so its verification key moves
again (§ "The guest and its verification key"). The layers re-run at the
baseline are the ones § "The gate" names at it; every other figure names the
commit it stands at.

`e800bfb2` differs from its previous baseline, `c53bdaeb`, in the clause's
identity and in the reward's accounting. In `ClauseRegistry` the clause key
is `keccak256` of the spec's pinned canonical bytes;
`registerClause(bytes32 clauseKey, string contentURI)` takes no name, version
or separate content hash and refuses the zero key (`ZeroClauseKey`); the
storage is `registered` and `depositOf`. `FigaroBatchVerifier._checkSpecBindings`
requires each binding's `specHash == clauseId` (`SpecBindingMismatch`) and
`clauseRegistry.registered(clauseId)` (`ClauseNotRegistered`); the accrual
struct gains `uint8 kind`, and `_hashUsage` packs
`key(32) ‖ kind(1) ‖ c(8) ‖ d(8)` per accrual, a span of `49 + 49n + 20m`
bytes for n accruals and m sellers, where it was `49 + 48n + 20m`.
`UsageCounter` keys every accrual, count, counted process and score by
(kind, key); `RpgfMinter.claim(period, (uint8 kind, bytes32 key)[])` reads the
registry the kind names. In the guest, Gate S is
`keccak256(spec_json bytes) == clause_id` and the kind enters the usage sets
the state root hashes (`state.rs`, `hash_usage`); the relay checks an
attestation's spec hash against its clause key and reads `registered(key)`
before proving. The guest's bytes changed at `e800bfb2` too.

`c53bdaeb` differs from its previous baseline, `cf6ba4ab`, in the link
from a resolved process to the assembly it instantiated, which is a fact of
the agreement format: one reserved merkle leaf (§ "Behaviors to surface").
In `src/build/rewards/UsageCounter.sol` its key is the public constant
`provenanceLeaf`; the constructor takes no provenance key and no excluded
set, and the contract holds no exclusion list; `applyBatchAccrual` takes
`claimedProvenanceLeaf` and reverts `ProvenanceLeafMismatch`; `_accrue`
reverts `ProvenanceLeafIsNotARegistration` and `applyBatchAccrual` skips the
reserved key. In `src/core/verifier/FigaroBatchVerifier.sol` the usage
field is `provenanceLeaf`, names and comments only; `_hashUsage`'s layout was
unchanged at `c53bdaeb` (`e800bfb2` adds the kind byte, above). `script/Deploy.s.sol` and `script/DeployMainnet.s.sol` drop the
two constructor arguments. In the guest, `prover/lib/src/kernel.rs` and
`prover/lib/src/types.rs` add `PROVENANCE_LEAF_KEY`, verify an attestation on
it with no spec, and refuse a usage claim on it; the relay
(`prover/sequencer/src/assembler.rs`, `main.rs`, `prover.rs`,
`submitter.rs`) reads `provenanceLeaf()` from the counter and drops a claim
on the reserved key before proving. The guest's bytes changed at
`c53bdaeb` too. A figure that stands at `e800bfb2`, at `c53bdaeb`, at `cf6ba4ab`, or at
`f62b71cf` (whose Solidity, deploy scripts and guest crates equal
`cf6ba4ab`'s) names which. `cf6ba4ab` differs from `f62b71cf` only in the relay and in
`prover/Cargo.lock`, in one crate outside the guest's graph.

This prints every scope file whose code differs between two commits, and
nothing when none does:

```bash
source scripts/frozen-scope.sh
for f in $(git ls-files src script prover); do in_scope "$f" || continue
  diff -q <(git show <A>:"$f" | strip_comments "$f") <(git show <B>:"$f" | strip_comments "$f") >/dev/null 2>&1 || echo "$f"
done
```

This document is kept current. A change to the scope's code is followed, at
the verified commit, by this section's update, the baseline moved to that
commit, the line counts re-measured, and every layer of the gate re-run. A
change that leaves the stripped code equal — a comment or NatSpec line,
changed in place — moves the baseline and re-runs the gate's quick layers
(§ "Validation commands"); the mutation runs and the Certora reports depend
on code and tests alone, so they stand and name the commit they were measured
at. A change confined to `prover/Cargo.lock` in a crate outside the guest's
graph (`cargo tree -p figaro-prover --locked` lists the same crates before
and after) moves the baseline and re-runs the Rust rows; the Solidity rows
and the Rust mutation run read none of it, so they stand and name their
commit. NatSpec enters the compiler's metadata (`foundry.toml` sets no
`bytecode_hash`), so a build at a later commit carries a different metadata
hash in its bytecode suffix than a build at the baseline; a review builds at
the baseline.

### The Core

`FigaroCore.sol` last changed in CODE at `c7f85d0d`; since then it moved
directory and comment lines changed in place, so its code is byte-identical
to the baseline. `CommitmentTypes.sol` holds one code change after that
commit: the agreement format's leaf function `clauseLeaf`, `internal pure`,
which adds no selector and leaves `COMMITMENT_TYPEHASH` and `hashStruct`
unchanged. The diff against the baseline prints as two renames whose every
hunk is a comment, plus that one function:

```bash
git diff -M c7f85d0d ec0e1993 -- src/kernel/ src/core/kernel/
```

### Toolchains

| Tool | Pin | Where |
|---|---|---|
| Solidity compiler | 0.8.26, EVM version cancun, optimizer at 200 runs, compiled through the IR pipeline (`--via-ir`) | `foundry.toml`; the flag is the deploy wrappers' (`scripts/deploy-mainnet.sh`) |
| Foundry | v1.5.1 | `.github/workflows/foundry-ci.yml` |
| OpenZeppelin Contracts | 5.5.0 | `lib/`, pinned submodule |
| Rust | 1.93.0 | `prover/rust-toolchain.toml` |
| SP1 | the release `prover/Cargo.lock` names for `sp1-sdk`; it embeds circuit v6.1.0 | `prover/Cargo.lock` |

The bytecode that is deployed is the IR pipeline's. The gate tests that
pipeline (`forge test --via-ir`), and so do coverage, Halmos and Certora. The
pre-commit hook and the mutation runs compile with the legacy code generator,
which builds in seconds; they test behaviour, not bytecode.

### The guest and its verification key

The verification key is a function of the guest's bytes. A changed guest is a
new key, and a new key is a new verifier at a new address.

| | |
|---|---|
| Guest ELF, SHA-256, at the baseline | `e98d22aed98ea087f9c34a5115d2cf3364328ed6c128580b8531bb34f4ca9ac7` |
| Verification key, at the baseline | `0x00d74a88d7c774fb211bc2ade8ed502fbd33c42b64d081b1bb4bea66d9c31e39` |
| Guest ELF, SHA-256, at `cf6ba4ab` | `1015f99f61f0a362fdffa6f96b8f48ba050fccc0862d9a9d018b1e142dca5fcc` |
| Verification key, at `cf6ba4ab` | `0x005f16f47c211b066a9cd85fb78295ae76df7f888f2e4962871f25636a0b3452` |

The guest is built inside SP1's build image, by
`scripts/prover-box/build-guest.sh`; the release is read from
`prover/Cargo.lock`. The build that counts is the `Sequencer Release` workflow's
docker build at tag `v0.2.0` (commit `8eaf1c56`, run 37504308141), which
printed the hash and the key named at `cf6ba4ab` above and checked the key
against the Sepolia deployment file of that build. The guest at `cf6ba4ab` differs from that commit's guest in four
comment lines of `prover/lib/src/types.rs`, replaced in place; an in-place
comment edit does not change the ELF (measured: the same hash before and
after one), and `prover/Cargo.lock` at `cf6ba4ab` moves one crate outside
the guest's graph (`cargo tree -p figaro-prover --locked` lists the same 189
crates at both), so the guest at `cf6ba4ab` is that build's. The guest at the
baseline changes code in `prover/lib/src/kernel.rs` and `types.rs`
(§ "The baseline commit"), as the guests at `e800bfb2` and `c53bdaeb` did
before it, so its ELF and key are new. They are the ones named at the
baseline above, built by SP1's pinned docker image on a fresh prover host
(`scripts/prover-box/provision.sh`, then `scripts/prover-box/build-guest.sh`);
the relay built beside it reports the same key through `sequencer --vkey`,
and the Sepolia verifier pins it (§ "What is deployed"). The ELF does not reproduce across operating systems,
so the image's build is the one that counts. The relay derives the key from
the guest it embeds (`sequencer --vkey`) and refuses to start when the deployed
`programVKey()` differs.

### What is deployed

Nothing is deployed on mainnet.

Sepolia carries the baseline's full stack, recorded in
`deployments/11155111.json` from block 11,922,698, every contract verified
on Etherscan: `FigaroCore`, `AttestationCoordinator`, `ClauseRegistry`,
`AssemblyRegistry`, `AgreementRegistry`
(`0x7C5ff9b17BD9d05B0d7290F649443b3a91d1FEA4`), `MembersRegistry`,
`UsageCounter` and `RpgfMinter` with the three-kind constructors,
`FigaroBatchVerifier`, `WitnessSwapAndCommitCoordinator`, and a
`FlorinToken` deployed beside the minter, whose genesis mint and
`renounceDeployerMint` ran in the same broadcast. The verifier pins
`programVKey` `0x00d74a88d7c774fb211bc2ade8ed502fbd33c42b64d081b1bb4bea66d9c31e39`,
the baseline's own canonical guest key (§ "The guest and its verification
key"). The registries hold no registration until the genesis
registration: the DAO's mandatory clauses and the founder's
(`deployments/11155111.expected.json` names who registers which). No
contract has an upgrade path. Mainnet deploys every contract once, from
`DeployMainnet.s.sol`. This is the third stack deployed from the baseline,
and the one that stands: the first was retired because a founder run
registered the mandatory clause `figaro-commerce` before the DAO vault could,
and the first write wins; the second because its verifier carried the
previous guest's key. The registration script
(`frontend/scripts/populate-clauses.mjs`) skips the mandatory clauses on a
Ledger-driven founder run unless `SEED_CLAUSES` names one by hand.

Sepolia runs Glamsterdam, whose state-creation repricing makes a contract
creation cost about seven times forge's own simulation of it. The deploy
wrappers (`scripts/deploy-sepolia.sh`, `scripts/deploy-mainnet.sh`) take
`FORGE_GAS_MULTIPLIER`, a percentage passed to forge as
`--gas-estimate-multiplier`, and print forge's output when it fails. A
multiplier of 740 landed each of these stacks; its largest creation, `UsageCounter`, used about 15.5M
gas, under the chain's cap of 16,777,216 on one transaction. The two
creations that failed before it cost their gas and deployed nothing.

### Change policy

A change to a path in scope, Solidity or Rust, is:

1. Scoped to a specific finding or accepted-risk item
2. Reviewed by someone other than its writer — the project's own reviewer,
   or the auditor when one is engaged
3. Recorded with the finding it answers and its outcome
4. Followed by the gate (§ "Validation commands"): every layer when the
   stripped code moves, the formal suites included — a signature change
   silently orphans any CVL spec that calls it, and the break is invisible
   until the gate runs; the quick layers alone when it does not
5. For a change to the guest: followed by a rebuilt guest, a re-derived key,
   and a verifier deployed with it
6. Followed by this document's § "The baseline commit", line counts and
   evidence updated at the verified commit; a figure that was not re-measured
   keeps the commit it names

Changes to `test/`, `frontend/`, or `sdk/` do not require re-audit unless they
expose a new on-chain attack surface.

## Actors, privileges, and external dependencies

Every actor and what it alone can do. The Core has no privileged role: `commit`
never reads `msg.sender`, and `resolveProcess` is gated by presence
(`msg.sender == rootBuyer`), not by a role.

| Actor | Can | Cannot |
|---|---|---|
| Buyer | sign an order; call `resolveProcess` on its own process; sign the batch path's resolve authorization; attest on its own orders | resolve a process it did not open; resolve one order of a process |
| Seller of record | sign an order; attest on its own orders | move any bond; resolve |
| Designer / registrant | register a clause, registered agreement or assembly under a stake; withdraw that stake (the binding stays); claim designer rewards on the keys it registered while its member stake is live | edit or remove a registration; earn on an unstaked key |
| Member | register, update, request withdrawal, withdraw after the cooldown | act for another wallet |
| Batch submitter (the relay or anyone) | call `settleBatch` with a valid proof over the current root | fabricate an operation, move a token the proof does not commit to, replay a proof (`SCALING_STRATEGY.md` § Trust analysis) |
| `FigaroBatchVerifier` | write accrual into `UsageCounter` (sole caller, immutable) | mint, edit a score, block a resolution (`DESIGN_DECISIONS.md` #15, #19) |
| `RpgfMinter` | mint florins up to its 600M cap, pro rata to score | exceed the cap; mint outside a closed period |
| Florin deployer | register minters until `renounceDeployerMint`; the mainnet script renounces in the same broadcast | anything after the renounce |
| DAO treasury multisig | spend the 300M it holds | any protocol write; it is upstream of every contract |

| External dependency | Bound where | Trusted for |
|---|---|---|
| OpenZeppelin Contracts 5.5.0 (`lib/`, pinned submodule) | inheritance and SafeERC20 | library correctness |
| Permit2 (canonical, `0x000000000022D473030F116dDEE9F6B43aC78BA3`) | `WitnessSwapAndCommitCoordinator` constructor, probed for code at deploy | witness-transfer semantics on the swap leg only |
| Uniswap SwapRouter02 (per chain; `deployments/<chainId>.json`) | same constructor, probed for `factory()` and `WETH9()` at deploy | executing the swap the signer's witness commits to |
| SP1 verifier gateway (`SP1_VERIFIER_GATEWAY`; the devnet script wires `MockSP1Verifier`) | `FigaroBatchVerifier` constructor, immutable, beside `programVKey` (`SP1_PROGRAM_VKEY`); the deploy wrappers refuse a gateway that does not route this release's proofs | proof soundness: that a proof under `programVKey` came from that program. The program is the project's own and in scope |
| SP1 zkVM and crates; the patched `k256` | `prover/Cargo.lock` | executing the guest as written; the accelerated curve arithmetic |
| `regex`, `serde_json`, `alloy-primitives` | `prover/Cargo.lock`; they are compiled into the guest | pattern matching inside the portable core; exact JSON number parsing (`float_roundtrip`); hashing and ABI encoding |
| IPFS | content behind every on-chain hash | availability, never integrity (`DATA_LAYER.md`) |
| XMTP | the runtime's coordination channel | nothing on-chain |
| Arbitration forums | composed at the edge (`CONTRACTS.md` § coordinators) | nothing on-chain; a forum rules on open data and cannot call resolve |

No oracle, no bridge, no upgrade proxy, no pause anywhere.

### Parameters

The constants and constructor arguments the mainnet deploy fixes
(`script/DeployMainnet.s.sol`); every one is immutable once deployed.

| Parameter | Value | Where |
|---|---|---|
| Bond multiple | 2× payment (buyer), 2× cumulative value (seller) | `FigaroCore.sol:208-209` |
| `MAX_BATCH_STALENESS` | 1 hour: the batch timestamp may trail the block by this much (accepted risk 4) | `FigaroBatchVerifier.sol:101` |
| `PUBLIC_VALUES_LENGTH` | 288 bytes, nine words; any other length is refused by name | `FigaroBatchVerifier.sol:106` |
| `MAX_BATCH_OPS` | the relay's bound on what the prover finishes in one sitting, 100 operations by default; an operator's environment variable | `prover/sequencer/src/main.rs:121` |
| The batch's gas budget | 95 percent of the latest block's gas limit, read at every tick, under the chain's cap on one transaction (`SETTLE_GAS_CAP`, EIP-7825's 2^24 by default, the bound a batch-path process is admitted under; below a one-order `settleBatch` call's 590,096, or at or past 95 percent of the block limit read at startup, the relay refuses to start); the call's cost is planned per item from ceilings measured on the pre-fork EVM with a stated allowance (at least twice the cold measurement for every item that writes state, at least half again for events and registry reads) and the proof's verification read from live receipts | `prover/sequencer/src/gas.rs`; `test/core/verifier/BatchGasCeilingTest.t.sol` |
| Re-queue bound | an operation re-queued after a transient submission failure is re-queued at most three times, then dead-lettered; a deferral at batch formation spends nothing of it | `prover/sequencer/README.md`; `mempool.rs`, `requeue` |
| Deferral window | an operation deferred at batch formation (it applies against no order of its drain, or its funding could not be read) is dead-lettered once 600 seconds have passed since its own first deferral, retried or not, and what was filtered behind it goes with it — each operation that no longer applies without it, whether it names its order or counts its payment in a cumulative value (past `MAX_DEPENDENCY_RERUNS` re-runs a tick, each following operation of its process that it precedes); an operator's environment variable, `DEFER_WINDOW_SECS` | `prover/sequencer/src/mempool.rs`, `DEFAULT_DEFER_WINDOW` |
| Clause, agreement and assembly registration stake | 0.05 ETH per registration, no cooldown, withdrawable once; the binding stays | `DeployMainnet.s.sol:160`, `:174`, `:167` |
| Member stake | 0.05 ETH, 28-day withdrawal cooldown | `DeployMainnet.s.sol:207` |
| Minimum-support floor | 3 distinct staked sellers before a clause, registered agreement or assembly scores, under each of the three kinds | `DeployMainnet.s.sol:268` |
| Reward periods | nine annual periods from `RPGF_GENESIS` | `DeployMainnet.s.sol:256-258` |
| Period budgets | 45M, 45M, 60M, 60M, 60M, 82.5M, 82.5M, 82.5M, 82.5M florins: 600M, the `RpgfMinter` cap | `DeployMainnet.s.sol:290-298` |
| Florin supply | 1B cap; at genesis 70M to the founders' wallet, 30M to the supporters' wallet, 300M to the DAO treasury, and the 600M minter registered; the deployer's minting renounced in the same broadcast | `FlorinToken.sol:26`, `DeployMainnet.s.sol:65-68` |

### Entry points

Every external state-changing function in scope and who may call it. View
and pure functions are omitted.

| Contract | Function | Who may call |
|---|---|---|
| `FigaroCore` | `commit` | anyone carrying both parties' signatures; the bonds are pulled from the signers, the gas is the caller's |
| `FigaroCore` | `resolveProcess` | the process's `rootBuyer`, over every active order |
| `AttestationCoordinator` | `attestAsSeller` | the order's seller (`msg.sender == target.seller`) |
| `AttestationCoordinator` | `attestAsBuyer` | the order's buyer (`msg.sender == target.buyer`) |
| `FigaroBatchVerifier` | `settleBatch` | anyone, with a valid proof over the current state root |
| `ClauseRegistry` | `registerClause` | anyone, with the registration stake; first write wins |
| `ClauseRegistry` | `withdrawDeposit` | the registrant |
| `ClauseRegistry` | `setMechanismClause` | any contract; emits an event, writes nothing |
| `AssemblyRegistry` | `registerAssembly` | anyone, with the registration stake; first write wins |
| `AssemblyRegistry` | `withdrawDeposit` | the registrant |
| `AgreementRegistry` | `registerAgreement` | anyone, with the registration stake; first write wins; the zero key and both reserved keys are refused |
| `AgreementRegistry` | `withdrawDeposit` | the registrant |
| `UsageCounter` | `recordClauseUsage`, `recordAgreementUsage`, `recordAssemblyUsage` | anyone, with merkle proofs over a resolved direct-path order (and, for an assembly, the agreement's membership proof) |
| `UsageCounter` | `applyBatchAccrual` | `FigaroBatchVerifier` only, immutable |
| `RpgfMinter` | `claim` | a live member that is the designer of record of every key it passes, once per closed period |
| `FlorinToken` | `registerMinter` | the deployer, until `renounceDeployerMint` |
| `FlorinToken` | `mint` | a registered minter, within its cap; the deployer's own registration ends at the renounce |
| `FlorinToken` | `renounceDeployerMint` | the deployer; one-way |
| `MembersRegistry` | `register` | anyone, with the member stake |
| `MembersRegistry` | `updateProfile`, `requestWithdrawal`, `withdraw` | the member itself |
| `WitnessSwapAndCommitCoordinator` | `swapAndCommit` | anyone carrying both parties' commitment signatures and their Permit2 witness signatures |

## Invariants

The properties the review is asked to break, by the identifiers
`docs/VERIFICATION_MAP.md` uses to map each one to its code, tests and formal
layer.

| Id | Property |
|---|---|
| K-1 | The buyer's bond is twice the payment; the seller's is twice the cumulative value |
| K-2 | Only the root buyer can call `resolveProcess` |
| K-3 | A process resolves every active order together, or not at all |
| K-4 | No timeout and no administrative exit from an active process |
| K-5 | A process's cumulative value only increases, by exactly each order's payment |
| K-6 | Resolution is a direct ERC-20 transfer; the Core keeps no internal ledger |
| K-7 | A process is bound to one token at its root order |
| K-8 | Both parties' EIP-712 signatures are verified on every commit |
| K-9 | An order's hash is content-addressed: `keccak256(processId ‖ structHash)` |
| A-7 | A fee-on-transfer token is rejected at the pull |
| A-8 | The Core holds exactly the bonds of its committed orders |
| A-9 | Resolution moves exactly the payment from buyer to seller and refunds both bonds whole |
| A-10 | Every committed order is bound to its process once, at commit |
| E-1 | Only the role-holder named in a committed order attests on it |
| E-2 | A registered clause, registered agreement or assembly is never overwritten |
| E-6 | The florin's supply never exceeds one billion |
| E-7 | Batch-resolved trade counts toward designer rewards once; the two paths share no state |
| E-9 | Every persistent effect of `settleBatch` is bound by a public value the proof commits to |

## Review goals

Where the project asks the review to spend its hours, in the order of the
doubt it holds.

**Worst case.** Locked bonds lost or moved through a defect rather than through
the documented by-design cases: a resolution by anyone but the buyer, a bond
that leaves the Core other than at resolution, or a batch resolution the
direct path would have refused.

**Areas of concern, in order.**

1. Any path by which the payoff table the equilibrium rests on can be altered:
   signature or domain-separator replay, accumulator manipulation, reentrancy
   through the token, an order that resolves a process it does not belong to.
   The Core is about 200 SLOC; its verification layers are listed in
   § "Verification evidence". The items below are what composes with it.
2. The batch path's seam between languages. `FigaroBatchVerifier.settleBatch`
   is the largest function in scope, and the guest decides what it moves: a
   forged or mis-bound proof accepted by the verifier, a clause-hash binding
   that diverges from the registry, public values the guest commits that the
   Core would have refused, the one privileged writer (the verifier into
   `UsageCounter`) doing more than accrue, and the off-chain state the root
   commits to (Known limitation 6). Every defect the project found itself sat
   on a seam between two implementations of one rule (§ "What the project's
   own verification found").
3. The reward and stake economics: reward inflation or Sybil accrual through
   `UsageCounter` and `RpgfMinter` under any of the three kinds; stake
   accounting in the registries' withdrawal paths.
4. Token-boundary behaviour: the Permit2 witness digest and SwapRouter02 call in
   `WitnessSwapAndCommitCoordinator`, and non-standard ERC-20s beyond the
   fee-on-transfer rejection.
5. The clause engine: a spec or a content the guest reads differently from
   the SDK's engine (`@figaro-protocol/sdk/clauses`), and the witness gates the
   mirror enforces — spec-identity substitution, content-hash mismatch,
   inclusion failure, attest-after-resolve — agreeing with
   `AttestationCoordinator` and the Core.
6. The relay: liveness under a hostile client — admission (the balance and
   allowance read before an operation is queued), the batch cap and the
   re-queue bound (§ "Parameters") — the handling of its one key, and what it
   publishes.

**Questions for the auditor.**

1. Is there any sequence of `commit` calls, on one process or across processes,
   that makes `resolveProcess` pay a seller more than 2·G_i + P_i or refund the
   buyer other than P_i per order?
2. Can a valid SP1 proof over a stale or foreign state be replayed against the
   verifier, given the `prevRoot`, `chainId`, `verifyingContract` and
   `blockTimestamp` checks?
3. Can the try/catch around `applyBatchAccrual` be made to swallow anything other
   than an accrual-gate revert?
4. Is the `icbrt(c·d²)` score manipulable at a cost below the registration stake
   plus the member stake it requires?
5. Does the Permit2 witness in `swapAndCommit` bind every field a signer would
   want bound, so a relayer cannot substitute a route?
6. Can any operation stream make the guest commit public values `settleBatch`
   accepts that `FigaroCore` would have refused for the same signatures?
7. Does the state root bind everything the next batch depends on, so that no
   prover can carry state across batches that the root does not cover?
8. Is the batch path's resolve authorization — a bare
   `ResolveProcess(processId)` signature, no nonce and no deadline
   (`DESIGN_DECISIONS.md` #21) — replayable to any effect?
9. Can one client stall the relay, or exhaust its re-queue, at a cost below its
   own rate-limit budget?

## What the project's own verification found

The project's three differential fuzz streams, its mutation testing over the
Rust, and its real-proof rehearsal found nine defects. None is in the
Core: eight are two implementations of one rule disagreeing, corrected to
the reference implementation named in the row, and one is a publication the
relay's readers did not read. All are fixed at the baseline commit, each with
the test that found it. They are listed because they show where this codebase
breaks: at the seams.

| # | Seam | Defect | Found by |
|---|---|---|---|
| 1 | Core ↔ Rust mirror | The mirror accepted a signature whose recovery id is written 0 or 1; `ECDSA.recover` hands it to `ecrecover` as written and the Core rejects it | Core fuzz stream |
| 2 | SDK clause engine ↔ Rust clause engine | An integer past ±(2^53 − 1): one JSON text, read as two integers | Clause fuzz stream |
| 3 | Validator ↔ encoder, both engines | A `bigint` past 2^256 − 1 validated and could not be encoded | Clause fuzz stream |
| 4 | Validator ↔ encoder, both engines | A signed `bigint` validated and could not be encoded | Clause fuzz stream |
| 5 | JavaScript regex ↔ Rust regex | A field's `pattern` run by two libraries that read lookaround, inline flags, Unicode classes and set operations differently | Engine vectors |
| 6 | SDK spec parser ↔ Rust spec parser | A spec `version` of `1e21` parsed by one and refused by the other | Engine vectors |
| 7 | JSON text ↔ Rust number | `9007199254740991.0` read as `…990` by the Rust JSON parser's default mode | A test written for a surviving mutant |
| 8 | SDK clause engine ↔ Rust clause engine | An integer written `5.0` or `5e0` refused by the guest, read as 5 by the SDK | The same test |
| 9 | Relay ↔ its readers | The relay published a batch's transaction hash under a name its readers did not read; every batch read as unanchored | The real-proof rehearsal |

Two of `FigaroBatchVerifier`'s checks came the same way: the batch timestamp is
the ninth public-values word, bounded on chain (`MAX_BATCH_STALENESS`), so the
guest's deadline checks run against a timestamp the verifier sees; and public
values of any length but nine words are refused by name
(`PublicValuesLengthMismatch`) before the proof is read.

## Behaviors to surface

Correct by design, but non-obvious — flagged so a reviewer does not spend time
re-deriving they are intentional. `DESIGN_DECISIONS.md` is the full catalogue;
read it first.

- `FlorinToken.renounceDeployerMint()` emits NO event (the state is readable via
  `deployerMintRenounced`; the renounce is a one-way latch, not an event source).
- `FlorinToken.registerMinter` treats `cap == 0` as the "not a minter" sentinel — a
  minter registered with a zero cap is indistinguishable from an unregistered one.
- The Core has an unreachable `expectedCumulativeValue ∈ (max/3, max/2]` window (above max/2 the seller's
  bond overflows at commit; the window itself cannot be reached while the
  token keeps the Core's balance, since the process's bonds already in it total
  at least four times the value). The mirror reports the same window as `Overflow`.
- Token authority is a class, not one case. A token that reverts transfers to a
  party's address bricks `resolveProcess` for the whole process — the seller at
  `FigaroCore.sol:294`, the buyer at `:295`; a token that blocklists or freezes
  the Core's own address, pauses, or is upgraded to do any of these has the same
  effect. Accepted (the buyer chose the token and the seller), a token-choice
  concern, not a Core escape hatch. On the batch path the same class reverts one
  batch, not the protocol: a payout the token refuses reverts `settleBatch` in
  `_executePositions` (`FigaroBatchVerifier.sol:579`), and the batch's
  operations are dead-lettered and re-submittable; a process open on the batch
  path resolves on the batch path only. The relay reads each party's balance and
  allowance before it submits (`prover/sequencer/src/submitter.rs`), and a batch
  a mid-flight revocation reverts is re-run without the revoker (Known
  limitation 3).
- The Core recovers ECDSA signers (`ECDSA.recover` in `commit()`), so a
  smart-contract wallet (multisig) cannot be a Core party directly; it transacts
  through an EOA it controls, and whoever holds that key acts for it
  (`FigaroCore.sol:238-240`).
- A signature is accepted in one form: `s` in the lower half of the curve order,
  `v` written 27 or 28. The Core takes this from OpenZeppelin's `ECDSA`; the
  mirror enforces the same two rules itself.
- The batch path's resolve authorization is a signature over
  `ResolveProcess(processId)` under the VERIFIER's EIP-712 domain, with no nonce
  and no deadline (`DESIGN_DECISIONS.md` #21): a process resolves once, so the
  authorization has one use.
- The two paths share no state. A batch-resolved process never acquires Core
  status; `UsageCounter` is the one place the two meet, and only accrual crosses.
- The direct path merkle-binds and content-hashes an attestation and validates
  no shape; the batch path validates content against the clause spec inside the
  proof. Per-clause validator contracts do not exist (`CONTRACTS.md`
  § "What the protocol has no contract for").
- A clause is its spec. The clause key is `keccak256` of the spec's pinned
  canonical bytes (`computeClauseKey(spec) = canonicalContentHash(spec)`,
  `sdk/src/discovery.ts:66-68`); `ClauseRegistry.registerClause(clauseKey,
  contentURI)` is first-write-wins on the key and never sees the bytes
  (`ClauseRegistry.sol:150-160`). The spec's `clauseId` and `version` are
  presentation inside the document: two specs with one name are two clauses
  (`test_twoSpecsWithOneNameAreTwoClauses`,
  `test/build/registries/ClauseRegistryTest.t.sol`), and a reader verifies
  fetched bytes by hashing them, re-canonicalizing nothing. A spec pinned in
  any other byte form has a different key. The SDK and the guest
  canonicalize alike: `test/fixtures/clause-keys.json` holds every
  `clauses/*.json` key, harvested by `sdk/tests/clauseKeys.test.ts` and
  asserted by `prover/script/tests/clause_keys.rs` and
  `prover/lib/tests/parity.rs`.
- The verifier accepts an in-proof clause validation only for a registered
  key whose spec the proof validated. The guest's Gate S requires
  `keccak256(spec_json bytes) == clause_id` (`prover/lib/src/kernel.rs:456-458`)
  and commits the binding with both words; `_checkSpecBindings` requires
  `specHash == clauseId` (`SpecBindingMismatch`) and
  `clauseRegistry.registered(clauseId)` (`ClauseNotRegistered`)
  (`FigaroBatchVerifier.sol:546-554`). Tests:
  `test_settleBatch_revertsOnSpecBindingMismatch`,
  `test_settleBatch_revertsOnUnregisteredClauseBinding`,
  `test_permissionless_newClause_settlesWithZeroVerifierChanges`
  (`test/core/verifier/FigaroBatchVerifierTest.t.sol`);
  `attest_spec_identity_mismatch_fails`,
  `attest_lookalike_spec_under_the_same_name_fails`
  (`prover/lib/tests/parity.rs`).
- The reward keeps the clause, agreement and assembly families apart by kind
  (`KIND_CLAUSE = 0`, `KIND_ASSEMBLY = 1`, `KIND_AGREEMENT = 2`,
  `UsageCounter.sol:161-167`). Each registry takes any `bytes32` but the
  reserved keys, so a stranger can register an existing assembly's
  `assemblyHash` as a clause key or an agreementHash; nothing on chain
  tells the families apart by bytes. `UsageCounter` keys every accrual,
  count, counted process and score by (kind, key); `recordClauseUsage` checks
  `ClauseRegistry` only, `recordAgreementUsage` `AgreementRegistry` only,
  `recordAssemblyUsage` `AssemblyRegistry` only, and `applyBatchAccrual`
  gates each `BatchAccrual{clauseOrAssembly, kind, c, d}` by its own kind's
  registry and skips an unknown kind (`UsageCounter.sol:734-746`). No kind
  gates another: an assembly accrues without its agreements' agreements
  being live, and an agreement without its assembly being live.
  `RpgfMinter.claim(period, (kind, key)[])` reads the counter's slot for each
  kind, and `_isAuthor(kind, key, account)` reads the one registry the kind
  names (`RpgfMinter.sol:329-343`). The verifier's `_hashUsage` packs
  `key(32) ‖ kind(1) ‖ c(8) ‖ d(8)` per accrual, span `49 + 49n + 20m`
  (`FigaroBatchVerifier.sol:488-516`), and the guest's
  `compute_usage_accrual_hash` mirrors it. `DESIGN_DECISIONS.md` § 23 states
  the pattern. Tests:
  `test_aStrangerWhoStakesAnAssemblysKeyAsAClauseTakesNothingOfIt`,
  `test_aStrangerWhoStakesAClausesKeyAsAnAssemblyTakesNothingOfIt`,
  `test_claimableQuotesNothingUnderACrossedKind`,
  `test_aRegisteredAgreementsDesignerIsPaidForItsUse`
  (`test/build/rewards/RpgfIntegrationTest.t.sol`),
  `test_settleBatch_anAssemblyAccrualPaysNoStrangerWhoStakedItsKeyAsAClause`
  (`test/core/verifier/FigaroBatchVerifierTest.t.sol`),
  `test_assemblyUsageLandsUnderTheAssemblyKindOnly`,
  `test_batchAccrualGatesEachKindByItsOwnRegistry`,
  `test_theThreeKindsNeverShareACount`,
  `test_batchAccrualGatesTheAgreementKindByTheAgreementRegistry`
  (`test/build/rewards/UsageCounterTest.t.sol`),
  `test_eachKindReadsOnlyItsOwnRegistry`, `test_revertsOnUnknownKind`,
  `test_theThreeKindsPayOnlyTheirOwnDesignerOfRecord`
  (`test/build/rewards/RpgfMinterTest.t.sol`),
  `check_theKindsNeverShareAKey`, `check_aKindNeverDisturbsAnotherKindsAccrual`,
  `check_anUnknownKindIsSkipped`
  (`test/build/rewards/HalmosUsageCounter.t.sol`), the rules of
  `certora/RpgfMinterAuthor.spec` (verified, on the non-via-IR build), and
  `a_clause_and_an_assembly_on_the_same_key_accrue_apart`,
  `one_provenance_leaf_credits_the_agreement_and_the_assembly_apart`
  (`prover/lib/tests/usage.rs`).
- A clause's `pattern` is a regex in the portable core (`CLAUSES.md`): the
  constructs JavaScript's regex library and Rust's read alike. A pattern that
  exhibits the nested-quantifier shape, or an input over 4,096 UTF-16 units, is
  treated as satisfied by both engines — the safe direction for a check whose
  binding form is the merkle commitment.
- The coordinator has two entry points, `attestAsSeller` and `attestAsBuyer`:
  a party attests for itself, from its own address, about a clause of its own
  order — each takes the attested order's commitment and checks the caller
  against its `seller` or its `buyer`, and the batch path's `AttestAsSeller`
  checks the recovered signer against `target.seller` alike; a seller's own
  EIP-7702 code files through `attestAsSeller`. No caller files for another
  address, and no seller files on another seller's order
  (`test_sellerCannotAttestAgainstAnotherSellersOrder`,
  `attest_as_seller_against_another_sellers_order_fails`).
  `test_attestViaResolver_selectorIsNotDispatched`
  (`test/core/attestation/AttestationCoordinatorTest.t.sol`) holds that a
  low-level call carrying selector `0x3ef7b1fb` against a committed order does
  not succeed; the batch path's `KernelOp` carries only the two.
- The link from a resolved process to the registered agreement and the
  assembly it instantiated is a fact of the agreement format, not a clause:
  one reserved merkle leaf beside the clause leaves, keyed by
  `keccak256("figaro-agreement-provenance")` (`0x26dc18a2…7dc6`), whose
  committed bytes are exactly
  `{"agreementHash":"0x<64 lowercase hex>","assemblyHash":"0x<64 lowercase hex>"}`
  and whose leaf follows the clause-leaf convention. `UsageCounter.provenanceLeaf`
  is that key as a public constant, taken from no constructor argument
  (`test_provenanceLeafIsAConstantOfTheFormat`,
  `test/build/rewards/UsageCounterTest.t.sol`). `_requireProvenance`
  reproduces the bytes from the two claimed keys and proves that one leaf
  under `checkoutHash` (`UsageCounter.sol:617-632`); a claim naming another
  agreement or another assembly derives a leaf that is not in the tree
  (`test_aProvenanceLeafNamingAnotherAgreementIsNotInTheTree`).
  `recordAgreementUsage` proves that leaf alone and credits the agreementHash
  (`:534-550`). `recordAssemblyUsage` proves it, then proves the
  agreement's leaf `keccak256(keccak256(assemblyLeafDomain ‖ agreementHash ‖ slotContentHash))` under
  `assemblyHash` and reverts `InvalidMembershipProof` when it does not
  open (`:590-596`); one order credits its agreement and its assembly apart
  (`test_oneOrderCreditsItsAgreementAndItsAssembly`). `ClauseRegistry` and
  `AssemblyRegistry` accept any non-zero key, so a wallet can register a
  clause or an assembly at a reserved key; each reserved key is distinct
  from every honest key under keccak256's second-preimage resistance, and it
  is refused at accrual whatever a registry holds (the next item).
  `MerkleParityTest` (`test/core/attestation/MerkleParityTest.t.sol`,
  `_assertProvenanceLeaf`, `test_theFixturePinsAProvenanceLeaf`) holds the
  SDK's key, bytes, leaf and proof equal to the counter's on the third
  agreement of `test/fixtures/merkle-vectors.json`; `merkle_parity.rs` holds
  the guest's side of the same fixture.
- The assembly root is a merkle tree over its agreements, with the assembly
  tree's own leaf convention (`assemblyLeafDomain = keccak256("figaro-assembly-leaf")`
  mixed into every leaf, so the tree never shares the agreement format's shape):
  one leaf per agreement, keyed by the agreement's
  agreementHash over the canonical bytes `{"clauses":{…},"slot":i}`, and one
  terms leaf keyed by `keccak256("figaro-assembly-terms")` over the
  assembly-scoped clauses when there are any (`DESIGN_DECISIONS.md` § 24,
  § 25). Membership is proved, never looked up: `AssemblyRegistry` holds no
  edge to `AgreementRegistry`. The terms leaf opens under the root
  (`test_theTermsLeafIsALeafOfTheAssemblyTree`) and never passes as an order
  agreement (`test_theTermsLeafNeverPassesAsAnAgreement`); an agreement leaf opens under
  its own root only (`test_anAgreementLeafUnderADifferentAssemblyHashFails`) and
  with its own bytes only (`test_anAgreementLeafWithAnotherAgreementsBytesFails`).
  `test/fixtures/assembly-vectors.json` carries three agreements and three
  assemblies (keys, agreement leaves, terms leaf, roots, membership proofs and
  provenance bytes); `test_everyAgreementHashIsTheRootOverItsClauseLeaves` and
  `test_everyAssemblyVectorOpensUnderItsRoot` (`MerkleParityTest`) and the
  `merkle_parity.rs` and `parity.rs` vector tests hold the counter and the
  guest to it.
- Nothing limits an order's signed agreement to one provenance leaf, so an
  order can credit several agreements and assemblies, each once per process:
  the same posture as clause leaves, since both parties signed it, and the
  seller's member stake and the `minSellers` floor price it.
- The two reserved keys never accrue, whatever a registry holds at them. The
  direct path reverts: `_accrue` reverts
  `ReservedKeyIsNotARegistration(bytes32)` on either under every kind
  (`UsageCounter.sol:788-790`; the error at `:384`), and
  `recordAssemblyUsage` refuses either as an agreement's agreementHash
  (`:586-588`). `AgreementRegistry.registerAgreement` refuses both as
  registrations (`AgreementRegistry.sol:162-164`). The guest refuses a claim
  keyed on either, of any kind, and an assembly claim naming either as its
  agreementHash (`prover/lib/src/kernel.rs:787-794`, `apply_usage_claims`).
  The counter's batch path skips either: `applyBatchAccrual` continues past
  them before the registration gate (`UsageCounter.sol:733`). The relay drops
  such a claim before proving (`submitter.rs`, `names_a_reserved_key`;
  `drops_claims_naming_either_reserved_key_without_touching_the_chain`,
  `drops_a_claim_keyed_on_the_provenance_leaf_without_touching_the_chain`).
  `test_theProvenanceLeafCannotBeClaimedAsAClause` registers a clause and an
  assembly at the provenance key and proves the direct-path revert, the
  assembly claim's `InvalidMembershipProof` (no tree has the reserved key as
  its root) and the batch-path skip;
  `test_theReservedKeysAreRefusedUnderTheAgreementKind` and
  `test_theTermsLeafNeverPassesAsAnAgreement` prove the agreement kind's and
  the agreement's refusals; `every_kind_keyed_on_a_reserved_key_is_refused`
  and `an_assembly_claim_passing_the_terms_leaf_as_an_agreement_is_refused`
  (`prover/lib/tests/usage.rs`) prove the guest's.
- The counter holds no exclusion list. Every clause, registered agreement or
  assembly with a live registration earns under the same rule, the two
  mandatory clauses (`figaro-commerce`, `figaro-topology`) among them
  (`test_mandatoryClausesEarnForTheirAuthor`); the two reserved keys above
  are the keys refused, and they are refused as constants of the formats.
- `applyBatchAccrual(period, claimedProvenanceLeaf, accruals, sellers)`
  reverts `ProvenanceLeafMismatch` when the leaf key the guest proved
  agreement and assembly claims against is not `provenanceLeaf`
  (`test_batchAccrualRejectsAForeignProvenanceLeaf`); the verifier's
  try/catch around the call lets the batch resolve with its accrual dropped.
- The guest verifies an attestation on the provenance key by the format's
  own rule: the committed bytes are reproduced from the agreementHash and the
  assemblyHash they carry, the attestation's `contentRef` is their
  keccak, and the leaf opens against the signed `checkoutHash`; it consults
  no clause spec and emits no spec binding (`prover/lib/src/kernel.rs:361`,
  `validate_provenance_attestation`, reached at `:438`;
  `the_provenance_leaf_is_attestable_without_a_spec`). It refuses bytes that
  name a key the agreement never committed
  (`a_provenance_attestation_of_an_uncommitted_key_is_refused`), a
  `contentRef` that is not the bytes' keccak
  (`a_provenance_attestation_whose_content_ref_is_not_the_bytes_is_refused`),
  and bytes that are not the canonical reproduction
  (`non_canonical_provenance_bytes_are_refused`).

**The relay**, each behaviour with the test that holds it
(`prover/sequencer/tests/sequencer.rs` unless named otherwise):

- A submission's identity in the mempool covers every input the proof or the
  verifier judges and admission does not: the signer, the order list and the
  witness spec bytes. A stranger's resolve for an open process, a buyer's
  signature replayed over another order list, or an attestation copied with
  other spec bytes cannot take the party's own position (`mempool.rs`,
  `op_key`; the `mempool_*` slot tests).
- A batch takes at most `MAX_BATCH_OPS` operations, oldest first
  (`mempool.rs`, `drain_up_to`;
  `mempool_drains_at_most_the_batch_cap_and_keeps_the_rest_queued`), and its
  `settleBatch` call is planned to fit the latest block: what a batch costs the chain is
  what it publishes — positions, attestation events, spec bindings, accruals,
  the proof's verification, the call's fixed execution and its calldata —
  estimated from the batch's own execution with per-item ceilings measured in
  `test/core/verifier/BatchGasCeilingTest.t.sol` and held equal in `gas.rs`,
  against 95 percent of the block's gas limit read at every tick, under the
  chain's cap on one transaction (a tick on which the block cannot be read
  plans under the cap alone); the operations after the kept prefix of the
  execution order go back to the front of the mempool untried when the call
  would not fit, and the usage claims are filtered against the kept operations
  and cut the same way, a tick whose claims were cut giving the next tick's
  claims the first half of the budget. A batch-path process is kept within
  what one `settleBatch` call can resolve under the cap, a bound stable across ticks: a
  commit that would grow it past that is dropped at batch formation and
  dead-lettered with the reason, and what was filtered into an order behind
  it is filtered again
  (`gas::max_orders_in_one_settle`,
  `assembler::filter_commits_within_resolve_capacity`;
  `a_commit_that_would_grow_a_process_past_one_settle_is_dropped_at_formation`),
  and an operation that fits no `settleBatch` call under the cap on its own is
  dead-lettered with the gas it was planned at, the operations filtered into
  an order behind it filtered again without it, while one that fits the cap
  but not a tick's budget waits (`gas.rs`, `trim_ops_to_budget`,
  `trim_claims_to_budget`, `settle_gas_estimate`; `main.rs`; `mempool.rs`,
  `give_back`;
  `trim_ops_to_budget_keeps_the_longest_fitting_prefix_and_gives_the_rest_back`,
  `an_operation_that_fits_no_batch_is_returned_unfit_and_nothing_is_planned_behind_it`,
  `trim_claims_to_budget_cuts_the_claims_and_leaves_the_operations`,
  `the_canonical_batch_is_planned_from_its_own_execution_and_fits_a_block`,
  `mempool_gives_back_operations_at_the_front_untried`,
  `mempool_gives_back_no_copy_of_an_operation_resubmitted_meanwhile`).
- Every operation dropped at batch formation — short of balance or
  allowance, unanchored, past the resolve capacity, built on a dropped one, or
  deferred past its window — is a recorded failure with its reason on
  `GET /status`, re-submittable, like a batch that failed to prove or to plan
  (`api.rs`, `record_dropped`, `FailureLog`;
  `an_operation_dropped_at_batch_formation_is_recorded_with_its_reason`).
- An operation the Core's rules refuse for good, judged alone against the landed
  state (its process or order exists or has resolved, its deadline has
  passed, a signature or its witness fails, an order list shorter than the
  active orders, a cumulative value the process has passed, a resolve
  listing an order of another process), is dead-lettered at once with
  the Core's reason, and so is what names a process or an order only a refused
  commit would have created (`assembler.rs`, `is_permanent_refusal`,
  `split_permanent_refusals`;
  `a_permanent_kernel_refusal_is_dead_lettered_at_once_and_a_missing_dependency_deferred`,
  `a_refusal_is_classified_on_the_fields_it_carries`,
  `what_was_built_on_a_permanently_refused_operation_is_dead_lettered_at_once`).
  Any other operation that applies against no order of the drain it was
  taken in (its dependency may sit past the drain's cut, ride a batch in
  flight, not be submitted yet, or never come) and a commit whose balance or
  allowance the node could not read are deferred, not dropped; what was filtered into an
  order behind a deferred commit applies again once the commit is restored
  and moves with it, in its group (`assembler.rs`, `refilter_after_drops`;
  `what_was_built_on_a_deferred_operation_moves_with_it`). A tick's deferrals
  are grouped by the process they touch — a commit's, a resolve's, an
  attestation's target order's — and each operation touches one process, so
  a group is one process's operations (`mempool.rs`, `defer`, `group_by_process`;
  `deferred_operations_are_grouped_by_the_process_they_touch`). A deferred group
  waits apart from the queue, its keys held, and is drained again only into
  the room the queue leaves, whole (`mempool.rs`, `drain_up_to`,
  `defer`;
  `a_deferred_operation_is_drained_only_into_slots_the_queue_leaves_empty`,
  `a_deferred_group_is_retried_whole`). The groups decide what is drained
  together and nothing else: each operation is dead-lettered once the
  deferral window has passed since its own first deferral, at every tick,
  retried or not, and what was filtered behind it goes with it, never the
  rest of its group. The edge rides on the operation (`PendingOp::behind`):
  formation re-runs the operation filter over each follower's drain group,
  against that group's slice of the landed state, with each deferred or
  following commit taken out (only a commit creates a process, an order or
  a cumulative step), and marks the follower behind every one without which
  it no longer applies — an order it names, or an earlier sub-order whose
  payment its cumulative value counts, though it names only the process —
  and never behind one it applies without. At most `MAX_DEPENDENCY_RERUNS`
  (32) re-runs a tick: a group whose candidates would pass the cap is marked
  conservatively instead, each follower behind every deferred or following
  commit of a process it touches that precedes it, which can join a
  follower only to commits of its own processes
  (`Mempool::refilter_behind_deferred`, which formation calls in place of
  `refilter_after_drops`; `mark_behind`;
  `a_sub_order_filtered_behind_a_deferred_sub_order_is_dead_lettered_with_it`,
  `an_unread_root_with_99_attestations_behind_it_is_marked_in_one_run`,
  `a_chain_of_99_sub_orders_behind_an_unread_one_is_marked_within_the_cap`).
  What is left of the group is grouped again (`defer`,
  `expire_deferred`, `take_expired`;
  `a_deferral_is_bounded_in_time_from_first_deferral_not_in_attempts`,
  `a_dependent_deferred_with_its_parent_is_dead_lettered_with_it`,
  `an_operation_that_never_applies_does_not_cut_an_honest_window_short`). The
  first deferral's time rides on the operation (`PendingOp::deferred_since`),
  so it ends when the operation lands or is dead-lettered and spends nothing
  of the re-queue count (`a_deferral_spends_nothing_of_the_requeue_count`);
  a copy resubmitted while the operation was drained is dropped when it is
  deferred or re-queued
  (`deferring_drops_a_copy_resubmitted_meanwhile_and_holds_the_key`,
  `requeue_drops_a_copy_resubmitted_meanwhile`). `formal/RelayState.tla`,
  `DeferSpec` (`formal/RelayStateDeferral.cfg`), checks the deferral as ten
  invariants, each of nine switches set FALSE failing the one it names: drain
  groups that are each one process's operations, each
  operation expiring on its own window with what was filtered behind it, so
  no honest operation's window is cut short by operations that never apply
  naming its process.
- A usage claim dropped without landing — at the pre-filter, at formation,
  with no counter or accrual closed, or with a batch that did not land — is
  counted on `GET /status` as `dropped_usage_claims` with its reason in
  `last_dropped_claim_error`, apart from `dead_lettered_ops`, which counts
  operations alone (`api.rs`, `record_dropped_claims`,
  `FailureLog::record_claims`;
  `a_dropped_usage_claim_is_counted_apart_from_operations`). A claim in a
  batch that failed transiently is counted dropped, not re-queued: its
  submitter re-submits it. The
  counter and the reason are the relay's, never one client's: the README
  sends a client to its order and its process on the publication routes, and
  to the root. What was filtered into an order behind a dropped commit or
  attestation is filtered again without it, as after a capacity drop.
- The batch's timestamp is the latest block's, read before anything is drained
  (`submitter.rs`, `read_chain_timestamp`; `sdk/tests/batch-e2e.test.ts`
  proves against Anvil's clock). The verifier's one-hour staleness bound is
  accepted risk 4.
- A wallet's balance and allowance are read once and allocated across the
  batch's commits in order, so several commits from one wallet cannot pass
  singly and revert `settleBatch` as a sum (`submitter.rs`,
  `allocate_funding`, `filter_funded_commits`;
  `funding_is_allocated_across_a_wallets_commits_in_order`).
- An attestation's witness spec is checked before proving: the relay
  requires the keccak of the spec bytes it carries to equal its clause key,
  and reads `ClauseRegistry.registered(clauseKey)` from the verifier's own
  registry; one that fails is dropped alone, since the verifier would
  revert the whole batch on it (`submitter.rs:289-359`, `attestation_spec`,
  `filter_anchored_attestations`;
  `the_spec_an_attestation_carries_is_what_the_registry_check_reads`).
- The state behind the verifier's root is written to disk before the batch is
  sent and held for as long as the batch can land; the relay reads
  `stateRoot()` at startup and before every batch, adopts a held state whose
  root it is, refuses to start (exit 2) when it reads a root and holds no state
  for it, and builds nothing while it holds none. A batch that landed without
  the relay reading its receipt is published under the transaction its
  `BatchSettled` log names (`state.rs`, `StateStore`, `held_state_for`;
  `main.rs`, `step_to`, `adopt`; `submitter.rs`, `find_settle_tx`; the
  `state_store_*` and `held_state_for_*` tests; `sdk/tests/batch-e2e.test.ts`
  restarts the relay between its two batches and starts one holding no state,
  which must exit 2). `GET /state` serves the state under an
  `x-figaro-state-root` header (`api.rs`, `get_state`;
  `api_state_route_serves_the_state_another_relay_starts_on`). The read
  routes (`/health`, `/status`, `/state`, `/orders`, `/processes`,
  `/batches`) answer any origin for `GET` and its preflight, the root header
  exposed, the cross-origin header outermost so a `408` carries it
  (`a_timed_out_read_still_answers_a_cross_origin_page`); the submission
  routes answer none: a JSON submission from a page needs a preflight they
  never answer, and a `text/plain` POST, a CORS simple request sent with no
  preflight, is answered `415` by the JSON extractor and admits nothing, so
  no page can have its visitors' browsers submit for it past the per-address
  limit (`api.rs`, `router`;
  `the_read_routes_answer_a_cross_origin_page_and_the_submit_routes_do_not`,
  `a_cross_origin_text_plain_submission_is_refused_and_admits_nothing`). The
  in-flight cap is one count across every route
  (`the_in_flight_cap_is_one_count_across_every_route`). A failure's text on
  `GET /status` (`last_settle_error`, `last_dropped_claim_error`) is recorded
  with every URL replaced by `<url>`, since an HTTP client's error names the
  URL it requested and a keyed RPC URL carries its key (`api.rs`,
  `without_urls`; `a_recorded_failure_carries_no_url`). A relay
  started with `STATE_FROM=<another relay's base URL>` fetches that state
  itself, recomputes its root from the body, and writes it over its kept file
  only when the root is the verifier's and the kept file does not already
  hold it; a served state behind any other root, or whose header names a root
  other than the body's, is a refusal to start (exit 2) that writes nothing
  (`state.rs`, `takeover`, `take_over_from_served`, `fetch_served_state`;
  `main.rs`; the `takeover_*` tests,
  `adopting_a_served_state_keeps_only_the_journal_entries_built_on_it`,
  `a_relay_takes_over_from_another_relays_state_route_through_its_own_fetch`
  and `fetching_a_served_state_refuses_every_malformed_peer`). A relay that
  already holds the state behind the verifier's root — in its kept file, or
  in its journal as a batch of its own that landed — writes nothing and runs
  on what it holds, so the landed batch is still published.
  `formal/RelayState.tla` (`TakeoverChecksRoot`) is the property: with the
  check off, a stale served state overwrites the only copy. Known limitation
  6 states what remains.

### Measured complexity

**Cyclomatic complexity** (Slither 0.11.3 `function-summary`, at the baseline):

| Function | CC | Why |
|---|---|---|
| `FigaroCore.commit` | 15 | the Core's one entry point does the whole commit: deadline, payment, hashing, two signature recoveries, the root-or-extension branch, bond math, two pulls |
| `UsageCounter.applyBatchAccrual` | 15 | period, provenance leaf, per-accrual skip of the two reserved keys, the three kinds' registration gates and the unknown-kind skip, stake gates, monotone-update checks |
| `FigaroBatchVerifier.settleBatch` | 12 | length, proof, five public-value checks, four calldata hashes, registry anchor, token legs, events, the accrual try/catch |
| `FigaroCore.resolveProcess` | 8 | presence, count, per-order status and overflow guards |
| `UsageCounter` constructor | 7 | six zero-address checks, the floor, the period list's length and order |
| `RpgfMinter.claim` | 8 | period closed, not claimed, the claimant's member stake, per-key designer of record and stake |

Every other function in the Solidity in scope is at 6 or below.

**The one `unchecked` block** (`UsageCounter.sol:823-826`) increments two
`uint64` counters by one: `c`, the distinct processes counted for a key, and
`d`, the distinct sellers. Each process is counted once ever
(`processCounted`), so `c` cannot exceed the number of resolved processes on
the chain, and `d` cannot exceed `c`. Reaching 2^64 would take more resolutions
than the chain can hold; the block is safe by that bound, not by an inline
check.

**Rust.** No `unsafe` block in any crate in scope. Inside the mirror every
refusal is a returned `KernelError` and arithmetic is checked. The guest's
entry point (`prover/program/src/main.rs`) ends the program on that error, by
design: a batch the mirror refuses has no proof.

## Accepted risks

Current design realities accepted by the protocol surface, not accidental defects:

1. buyer key loss is terminal for an active process because the Core has no timeout or admin recovery path
2. very large processes are gas-bounded, so institution design should compose across processes instead of pushing single-process fanout toward the ceiling
3. fee-on-transfer tokens are unsupported by design and are rejected explicitly by the Core; rebasing tokens are unsupported and NOT detected (`_pullExact` sees only the delta inside its own transfer call — `DESIGN_DECISIONS.md` #9 states the consequence); a token with an issuer blocklist holds any process a blocked party sits in until the issuer relents, since resolution is atomic (`WeirdTokenTest`; the same entry)
4. a commitment can be bonded on the batch path up to one hour after its deadline: `settleBatch` accepts a batch timestamp up to `MAX_BATCH_STALENESS` (one hour, `FigaroBatchVerifier.sol:101`, checked at `:307`) behind its block, from any prover, and the guest checks deadlines against that timestamp; the Core refuses an expired commitment at once. Both parties signed the commitment and both fund its bonds, so nothing moves that they did not agree to; a party that needs a hard cut-off signs a deadline one hour earlier. Closing it is a verifier change, so a new key and a new deployment

## Known limitations

Stated so the review does not spend hours finding them.

1. **The Rust carries less verification than the Solidity.** The contracts have
   symbolic proofs (Halmos), formal rules (Certora), model checking (TLA+) and
   property fuzzing (Echidna). The Rust has unit and conformance tests,
   cross-language vectors, three differential fuzz streams, mutation testing
   over the guest's two crates, and static analysis. It has no formal proof.
   What locks the mirror to the Core is agreement on generated input, not a
   proof of equivalence.
2. **The relay is not mutation-tested.** Mutation testing covers the guest
   (`figaro-kernel`, `figaro-clause`), where a defect costs a wrong resolution.
   The relay has its 120 integration tests, 21 unit tests and the batch
   end-to-end test.
3. **A mid-flight revocation sinks a shared batch once.** A party who revokes
   its allowance after the funding check and before `settleBatch` reverts that
   batch; the relay re-reads funding at the latest block, dead-letters the
   named revoker's operations alone (re-submittable once funded), re-queues
   the rest, and the next batch is built without it. The refused batch is
   never re-sent, though its state stays held: its proof is public, and a
   revoker who re-approves revives it. Repeated revocation from one address
   within an hour is logged as the adversarial signal (`main.rs`, the
   deterministic-revert arm; `submitter.rs`, `allocate_funding` names the
   failing party, `RevocationLog`; `revocation_log_counts_within_the_window_only`;
   `formal/RelayState.tla`, whose `RebatchDropsRevoker` switch FALSE fails
   `SendsExcludeKnownRevoked`; `sdk/tests/batch-revoke-e2e.test.ts` runs the
   arm against a live Anvil and the real binary). Two gas-priced ways to sink
   a shared batch remain: a party who re-approves (or moves its balance back) before the
   re-read is not named, and the whole batch dead-letters re-submittable,
   as before; and each refusal costs the innocent operations one of their
   three re-queues, so distinct revoking addresses — the per-address signal
   does not aggregate them — can burn a co-batched operation's cap. The
   direct path stays open to a new process throughout.
4. **The batch path's per-position gas figure is pre-fork.** The direct
   path's per-order constants are measured on live post-fork Sepolia
   receipts against the deployed Core (resolve ~73,000 + ~29,800·N;
   sub-order commit 382,032, root 793,549 — `sdk/src/gasCeilings.ts` carries
   the provenance); the batch verifier's ~26.5k/position and its ~1,130-position
   ceiling are still pre-fork figures, re-derived when enough post-fork
   `settleBatch` receipts accumulate (three stand so far).
5. **The incident procedure's redeploy leg is rehearsed on Sepolia; the full
   procedure is not.** The counter↔verifier pair was redeployed on live
   Sepolia from a clean worktree at `a4a34e91` — fork rehearsal first,
   then the broadcast, the deployment file's update, and the deployment check with
   via-IR artifacts at that commit. The chain's post-fork gas repricing
   (~6.8× on these deploys) needs forge's gas estimator multiplied past its
   default. The disclosure and advisory legs remain unrehearsed.
6. **The state behind the verifier's root lives off chain.** The verifier
   stores a root. The state it commits to is held by the relay that built the
   last batch (`STATE_PATH`) and published by it (`GET /state`), so a party
   can keep a copy and a second relay can start on it (`STATE_FROM`), the
   relay itself refusing any copy whose root is not the verifier's; nothing in this
   repository rebuilds it from the chain or from the publication archive. A
   process opened on the batch path resolves only through a batch built on
   that state, so if every copy is lost — or another submitter lands a batch
   and publishes nothing — those processes have no one who can build their
   resolve, and their bonds stay in the verifier. A relay that does not hold
   the state refuses to start and builds nothing.
7. **A deferral at batch formation is bounded by a window, not by the
   dependency.** An operation that applies against no order of its drain, or
   a commit whose funding the node could not read, waits for its dependency
   or a readable node for `DEFER_WINDOW_SECS` (600 seconds by default) from
   its own first deferral, and is retried only in the room the queue leaves
   empty: under a queue that stays longer than `MAX_BATCH_OPS` for the whole
   window it is never retried, and a dependency that arrives later than the
   window finds it dead-lettered, recorded with its reason and
   re-submittable. Each operation touches one process, so a drain group is
   one process's operations, and a group is drained whole. An operation that never applies, which anyone may submit free,
   naming an honest process (a resolve of a process not yet landed, signed
   by any key) still joins that process's group and takes drain capacity:
   the group needs room for that many more operations to be retried. It cannot
   shorten an honest operation's window, which runs from that operation's
   own first deferral; what goes when an operation's window ends is what
   was marked behind it — exactly what was filtered behind it, or, past the
   re-run cap below, every following commit of its process it precedes. Two
   residuals of that edge: a follower
   that applies behind either of two unread sub-orders competing for one
   cumulative step is marked behind neither (taking out either alone leaves
   it applying), and waits its own window — bounded, and it costs no honest
   operation; and past `MAX_DEPENDENCY_RERUNS` (32) re-runs in a tick, a
   group is marked conservatively, each follower behind every deferred or
   following commit of a process it touches that precedes it, so a follower
   can go with a commit of its own process it did not need. Anyone can spend
   a tick's re-run budget with candidates of their own (groups are taken in
   the order of their first operation), so the conservative mark reaches an
   honest group at will; the harm is bounded to an honest follower leaving
   with an honest sibling commit of its own process that precedes it. A
   deferred
   operation counts against
   `MEMPOOL_MAX_OPS` for its window. The refusals that defer, and so hold capacity, are the ones
   that name what a later operation may supply, judged against the landed
   state: an unknown process or order (`UnknownProcess`, `UnknownOrder`); a
   resolve whose listed orders are all of its own process but not yet
   committed (`OrderNotCommitted`); an order list longer than the active
   orders (`IncompleteOrderList` with provided above required); a cumulative
   value the process has not yet reached (`CumulativeValueMismatch` with
   expected above actual); and a commit whose funding could not be read. A
   resolve that lists an order twice never applies (the Core resolves the
   first listing and reads the second as `OrderNotCommitted`) and is refused
   at admission, never deferred (`mempool.rs`, `pre_check`;
   `mempool_refuses_a_resolve_listing_an_order_twice`).
   Every other refusal — and every operation in the same drain that names a
   process or an order only a refused commit would have created — is
   dead-lettered at once and holds none; such a dependent arriving in a later
   tick, after the commit was dead-lettered, reads as `UnknownProcess` or
   `UnknownOrder` against the landed state and defers for the window. A deferring operation costs its sender nothing (a resolve of a
   process that never comes needs only a signature that recovers), so one
   client address can hold up to `SUBMITS_PER_MINUTE_PER_IP` (60) times the
   window's minutes of capacity — 600 operations at the defaults, against a
   `MEMPOOL_MAX_OPS` of 10,000 — rather than until each one's first drain;
   the limit is per IP, and behind a proxy it is the proxy's.

## Verification evidence

A figure in this section was measured at the baseline unless its row names
another commit; a row that names `32c4ef8d`, `28489848`, `e800bfb2`, `c53bdaeb`, `cf6ba4ab` or
`f62b71cf` was not re-run at the baseline (§ "The baseline commit" states the rule).
Which invariant each layer carries is `VERIFICATION_MAP.md`; the inventory of
tests is `TESTING.md`.

### The gate

| Layer | Result |
|---|---|
| Foundry | 389 test functions in the tree. At `4fd38042` (Foundry CI), `forge test --via-ir`: 27 suites, 420 passed, 0 failed, 3 skipped (the batch gas-ceiling suite's inherited harness tests counted in forge's figure); the three skipped are the fork tests (mainnet's Permit2, Sepolia's SwapRouter02), run without `MAINNET_RPC_URL` and `SEPOLIA_RPC_URL`. At `f62b71cf`, the fork tests included: 381 passed, 0 failed, 0 skipped |
| Halmos | 41 properties, every one proved: `UsageCounter` 9 of 9 at `4fd38042` (its code moved; one property mutation-checked against a kind-blind counter); at `28489848`, whose Solidity for these contracts equals the baseline's once comments are stripped, `FigaroCore` 7, `MembersRegistry` 7, `ClauseRegistry` 6, `AssemblyRegistry` 6, `AgreementRegistry` 6 |
| Certora | 7 of 7 specs, every rule verified, at `f62b71cf`; not re-run at `c53bdaeb`, at `e800bfb2`, at `28489848` or at the baseline. `certora/RpgfMinter.spec`, `BatchVerifierTokenOps.spec`, `BatchVerifierStateRoot.spec` and `token-ops.inventory` are edited for `e800bfb2`'s (kind, key) claim and `registered` read, and `RpgfMinter.spec` again for `28489848`'s agreement kind and fifth constructor address; they have not been run against either. `FigaroCore.spec` verified at `4fd38042`'s tree, every rule, among them `noDoubleCommit` (a successful commit returns only an order hash whose status was 0) and `activeCountRisesOrDropsToZero` (an existing process's active count rises or drops to zero): https://prover.certora.com/output/9512759/024d183244654c348229ee01814292ca. `certora/RpgfMinterAuthor.spec` verified at the same tree, both rules — `_isAuthor` answers for each kind from its own registry alone and refuses an unknown kind: https://prover.certora.com/output/9512759/f62a013cbdb44692b77bf04219670f75. It compiles without via-IR: under via-IR the prover's call resolution fails on `_isAuthor`'s decoding of the dynamic `string` that `bindings` returns, so the property is proved on the non-via-IR build |
| Echidna | 15 properties, every one held on both harnesses, at `f62b71cf` |
| TLA+ | 5 models in 6 configurations, 64 invariants and 2 action properties, no error. `RelayState`: the relay's state lifecycle (`RelayState.cfg`, 7 invariants + 2 action properties) at `32c4ef8d`, whose lifecycle the change leaves as it was, 10,837,227 states generated, 1,959,944 distinct, depth 32; at `4fd38042`, the deferral at batch formation (`DeferSpec`, `RelayStateDeferral.cfg`, 10 invariants) 388,784 generated, 112,528 distinct; each of its ten switches set FALSE fails the property it names. Not re-run at `32c4ef8d` or `4fd38042`, which the other models do not reach: `ResolutionUniverses` (20 invariants) at `c53bdaeb`, 10,030,087 states, no error; `FigaroCore` (9) at `cf6ba4ab`, 8,380,329 states generated, 6,087,113 distinct; `FlorinToken` (8) and `WitnessSwapAndCommitCoordinator` (10) at `cf6ba4ab`; the models' defect switches are their mutation checks (`TESTING.md` § TLA+) |
| Rust (`cargo test --locked`) | at `4fd38042` (Prover CI): every crate of the workspace passes, 0 failed, among them `usage` 32, `parity` 31, `merkle_parity` 8, `guest_program` 6, and the relay's 21 unit and 120 integration tests (the relay's again at the baseline, on its lock); 2 ignored by design, run by the fuzz script |
| Differential fuzz | at `cf6ba4ab`: one round at seed 1791923560, no divergence: 400 Core operations (298 accepted, 102 rejected, 94 processes), the agreement vectors, 6,352 clause cases (1,850 encoded byte-for-byte, 3,318 rejected, 1,184 specs refused); CI runs four rounds on every push |
| SDK (Vitest) | at `28489848`: 974 passed, 65 files |
| Frontend (Vitest) and devnet end-to-end (Playwright) | at `28489848`; no spec runs the relay: 1,067 passed, 119 files; every devnet e2e spec green |
| Batch end-to-end (SDK → relay → verifier) | passed at `4fd38042` (Prover CI, `REQUIRE_BATCH_E2E=1`): `batch-e2e.test.ts` 3 of 3 (a second relay started on the first's served state, `STATE_FROM`, resolves the second batch), `batch-revoke-e2e.test.ts` 2 of 2, against a fresh Anvil with the release binary rebuilt and stamped |

Certora reports, each "No errors found by Prover" at `f62b71cf`:

| Spec | Report |
|---|---|
| FigaroCore | https://prover.certora.com/output/9512759/483a8186ffa14389b25a97628d213f51 |
| AttestationCoordinator | https://prover.certora.com/output/9512759/885572b62a1846799587ecf0341b3973 |
| TokenOpsVerification | https://prover.certora.com/output/9512759/d0a5627a8f194a93a98c3fd9e1a0df0d |
| FlorinToken | https://prover.certora.com/output/9512759/8377c510209e41db9b362c011f2f6b92 |
| BatchVerifierTokenOps | https://prover.certora.com/output/9512759/33955d86828e46c7b6321eaf7f993fd9 |
| BatchVerifierStateRoot (the spec reads the contract through `certora/harness/FigaroBatchVerifierHarness.sol`, which adds only a decoding view; each rule mutation-checked against the same contract code, failing on its own mutation: https://prover.certora.com/output/9512759/9fb2a938b04847b8b44c83fee498631a) | https://prover.certora.com/output/9512759/f7825c60f72d4506b2d99ffa13329ad8 |
| RpgfMinter | https://prover.certora.com/output/9512759/7d4d6e182d1e419e8fbcfba884186c22 |

### Test coverage, Solidity

`scripts/coverage.sh` (`forge coverage` under the full via-IR pipeline; the two
gas-anchor tests excluded, since instrumentation raises their measurements),
over the eleven contracts in scope that hold code, measured at `f62b71cf`:

| | Lines | Statements | Branches | Functions |
|---|---|---|---|---|
| In scope | 99.81% (527/528) | 99.44% (707/711) | 97.04% (131/135) | 100% (66/66) |
| Lowest file: `FigaroCore.sol` | 98.57% | 97.78% | 90.48% | 100% |

What is uncovered, line by line: `FigaroCore.sol:204`, the
`DuplicateCommitment` guard, and `:288-289`, the `CumulativeValueOverflow`
revert, both unreachable (§ "Behaviors to surface"); `RpgfMinter.sol:228`
(`:278` at the baseline), an
early return whose arithmetic yields the same result without it;
`FlorinToken.sol:72`, a supply-cap check behind per-minter caps that already
bound the supply. These four are also the lines whose mutants survive below:
two measurements, one set of lines. The report's `Total` row counts mocks,
scripts and tests and is not the scope's figure.

### Mutation testing, Solidity

Both mutation sections' runs are launched by `scripts/mewt-run.sh` and
`scripts/cargo-mutants-run.sh`, which hold `.mewt.lock` and first print
`gate_layers` (`scripts/frozen-scope.sh`): "full gate" when a scope file's
stripped code or a build configuration moved from the baseline commit, else
"quick layers only", and these reports stand. `scripts/check-red-on-parent.sh`
proves a test-first change's new tests fail on the `src/` before it.

Trail of Bits' `mewt` 4.0.0, measured at `f62b71cf`, high and medium severity
mutations (statement removal, error replacement, condition forcing, negation
removal, return-default), one run and one database per contract, each against the
test files that cover it, the gas-anchor tests excluded so a catch means
behaviour. The test command for each run is
`forge test --no-match-test test_Gas_ --match-path '<paths>'` with:

| Contract | Test paths |
|---|---|
| `FigaroCore.sol` | `test/core/kernel/*.t.sol`, `test/ReentrancyAdversarialTest.t.sol` |
| `CommitmentTypes.sol` | `test/core/kernel/*.t.sol` |
| `AttestationCoordinator.sol` | `test/core/attestation/*.t.sol`, `test/script/DeployWiringTest.t.sol` |
| `FigaroBatchVerifier.sol` | `test/core/verifier/*.t.sol`, `test/ReentrancyAdversarialTest.t.sol`, `test/build/rewards/*.t.sol` |
| `ClauseRegistry.sol`, `AssemblyRegistry.sol`, `AgreementRegistry.sol` | `test/build/registries/*.t.sol`, `test/build/rewards/*.t.sol` |
| `UsageCounter.sol` | `test/build/rewards/*.t.sol`, `test/core/verifier/*.t.sol` |
| `RpgfMinter.sol` | `test/build/rewards/*.t.sol` |
| `FlorinToken.sol` | `test/build/florin/*.t.sol`, `test/build/rewards/*.t.sol` |
| `MembersRegistry.sol` | `test/app/MembersRegistryTest.t.sol`, `test/build/rewards/*.t.sol` |
| `WitnessSwapAndCommitCoordinator.sol` | `test/app/WitnessSwapAndCommitCoordinator*.t.sol`, `test/script/DeployWiringTest.t.sol` |


| Contract | Mutants | Caught | Survived |
|---|---|---|---|
| `FigaroCore.sol` | 99 | 96 | 3 |
| `CommitmentTypes.sol` | 3 | 3 | 0 |
| `AttestationCoordinator.sol` | 51 | 51 | 0 |
| `WitnessSwapAndCommitCoordinator.sol` | 56 | 56 | 0 |
| `MembersRegistry.sol` | 63 | 63 | 0 |
| `ClauseRegistry.sol` | 59 | 59 | 0 |
| `AssemblyRegistry.sol` | 43 | 43 | 0 |
| `UsageCounter.sol` | 224 | 223 | 1 |
| `RpgfMinter.sol` | 104 | 102 | 2 |
| `FlorinToken.sol` | 54 | 52 | 2 |
| `FigaroBatchVerifier.sol` | 156 | 156 | 0 |
| **All** | **912** | **904** | **8** |

No timeout, nothing skipped. Every High-severity mutant was caught.
`AgreementRegistry.sol` postdates `f62b71cf` and has no row; the
`UsageCounter.sol` and `RpgfMinter.sol` rows stand for those contracts at
`f62b71cf`, before the agreement kind.

The eight survivors, each read against the source:

| Contract, line | Mutation | Why no test can tell |
|---|---|---|
| `FigaroCore.sol:204`, two mutants | Remove or disable the `DuplicateCommitment` guard | Every replay is refused earlier: a repeated root by `ProcessAlreadyExists`, a repeated extension by `CumulativeValueMismatch`, since the accumulator has moved. `FigaroCoreRevertBranchTest` pins each preempting error |
| `FigaroCore.sol:288` | Disable the `CumulativeValueOverflow` guard | An order with such a value cannot be committed while the token keeps the Core's balance: the process's bonds already in it total at least four times the value (§ "Behaviors to surface") |
| `UsageCounter.sol:664` at `f62b71cf` (`:801` at the baseline) | Write the seller-seen flag unconditionally | When the seller was seen before the flag is already true; the breadth count two lines below keeps its own condition |
| `RpgfMinter.sol:228` at `f62b71cf` (`:278` at the baseline), two mutants | Remove or disable `if (score == 0) return (0, 0)` | The next line computes `amount × 0 / total`, which is 0; the return only saves the arithmetic |
| `FlorinToken.sol:72`, two mutants | Remove or disable the `MAX_SUPPLY` check in `mint` | Tokens are created in `mint` alone, each minter is held to its cap on the line above, and `registerMinter` refuses a cap that would take the sum of caps past `MAX_SUPPLY` |

### Mutation testing, Rust

`cargo-mutants` over the guest's two crates, `figaro-kernel` and
`figaro-clause`, with `cargo test` as the oracle, measured at `f62b71cf`. A mutant that makes a loop
run forever is detected by timeout.

| | Count |
|---|---|
| Mutants | 617 |
| Caught | 550 |
| Timed out | 26 |
| Survived | 12 |
| Not compilable | 29 |

The twelve survivors, each read against the source: one in the Core mirror
— the text `KernelError` prints when displayed, which nothing reads; eleven
in the clause engine — four identity mutations (`i += 1` to `i *= 1`), three
bounds only an unterminated class would cross, which the portable-pattern
scanner refuses before the screen runs, two sign branches in the decimal
comparison for a value that is never negative, since a signed `bigint` is
refused before the comparison, one branch that yields the same verdict with a
different message, and one bound that is always true after the function's
early return.

### Differential fuzz

`scripts/test-cross-impl-fuzz.sh` runs three streams under one seed; CI runs
four rounds on every push, seeded from the run id.

| Stream | Generated by | Checked by | One round |
|---|---|---|---|
| Core operations: commits and resolutions, valid and malformed, over five wallets and two tokens | Foundry, on `FigaroCore` itself | the Rust mirror: same acceptance, same error, same ids, bonds, payouts and process states | 400 operations |
| Agreements: one to six clauses, their root, leaves and inclusion proofs | the SDK | OpenZeppelin `MerkleProof` and the guest's verifier | 64 agreements |
| Clauses: every protocol clause, generated specs nobody has seen, specs of one random `pattern`; content inside each bound and across it | the SDK | the Rust clause engine: same parse verdict, same validation verdict, same bytes | about 6,000 cases |

The generator asserts nothing about what a case deserves: the reference
implementation's answer is the oracle. A divergence prints the seed and the
step, and the same seed reproduces it.

### Static analysis

**Solidity.** Slither 0.11.3 (`--exclude-dependencies`; mocks, fuzz harnesses,
tests and scripts filtered) and Semgrep with the `p/smart-contracts` ruleset.
Semgrep returns only INFO gas-style rules. Both run in CI on every push
(`.github/workflows/foundry-ci.yml`, job `static-analysis`): Semgrep fails on any WARNING or
ERROR, and a gate holds Slither's High and Medium results to the triaged set
below, by detector, so a new one fails the push and so does one vanishing.
Slither's 50 results at the baseline, triaged (eight High and Medium):

| Severity | Detector | Where | Verdict |
|---|---|---|---|
| High | arbitrary-send-erc20 | `_pullExact` in `FigaroCore` and `FigaroBatchVerifier` | Designed. The `from` is a recovered EIP-712 signer (Core) or a net position hashed into the proof's public values (verifier), never a caller-supplied address. |
| Medium | incorrect-equality | `MembersRegistry.withdraw` (`unlockAt == 0`) | Sentinel for "nothing pending"; `DESIGN_DECISIONS.md` #14. |
| Medium | reentrancy-no-eth | `settleBatch` writes `stateRoot` after calling `UsageCounter` | `nonReentrant`; the callee is an immutable address that accepts only this caller and calls nothing back; the call sits in a try/catch so its revert cannot unwind the token legs. |
| Medium | unused-return | tuple destructuring of `assemblies.bindings` and `agreements.bindings`, in `UsageCounter` and in `RpgfMinter._isAuthor` (four results) | Reads the fields it needs. |
| Low | missing-zero-check | `WitnessSwapAndCommitCoordinator` constructor `router_` | A zero router yields a coordinator whose swap leg always reverts and holds nothing; the deploy scripts probe the router before construction. |
| Low | reentrancy-benign | `settleBatch` increments `batchCount` after the token legs and the accrual call | `nonReentrant`; the same reasoning as the Medium above. |
| Low | calls-loop | accrual, spec-binding, position, and entitlement loops | Designed; loops are over caller-sized calldata and gas-bounded (accepted risk 2). No loop body reverts on a third party's action. |
| Low | timestamp | `deadline` in `commit`; the batch's clock in `settleBatch`; registry cooldowns; reward periods | `deadline` is the expiry of the unconsummated signature window (`DESIGN_DECISIONS.md` #12); the batch's clock is bounded to an hour; the rest are day-scale comparisons. |
| Info | assembly, cyclomatic-complexity, low-level-calls, missing-inheritance, naming | verifier hashing helpers; `commit`, `settleBatch` and `applyBatchAccrual`; the swap call and the four ETH refunds; local interfaces; `DOMAIN_SEPARATOR` | Calldata hashing mirrored by the prover's parity tests; the three largest functions; checks-effects-interactions on every refund; style. |

**Rust.** In CI on every push (`.github/workflows/prover-ci.yml`): Clippy with its correctness
and suspicious groups denied, over all four crates in scope — clean; Semgrep
with the `p/rust` ruleset, failing on any WARNING or ERROR — two INFO results,
both in the relay (it reads its arguments; it names a temporary directory);
`cargo audit` over `prover/Cargo.lock` (`.github/workflows/guards-ci.yml`) — no advisory that
fails the run, one set aside by id in `prover/.cargo/audit.toml`, and 13
warnings: nine transitive crates marked unmaintained, and unsoundness notices
on `lru` and `chacha20`. The advisory set aside is RUSTSEC-2026-0344, a
decompression bomb in `ruzstd` 0.8.3, fixed at 0.9.1: the crate reaches the
relay and the proving harness through `object` 0.37.3, `backtrace` and
`sp1-recursion-compiler`, where it reads the compressed debug sections of the
host's own executable; every `object` release to date requires `ruzstd` ^0.8
and `sp1-core-executor` pins `object` ^0.37.3, so no lockfile update takes the
fix. Of the crates named, one is compiled into the guest: `bincode`,
unmaintained, through SP1's input encoding. `lru` reaches the relay through
`alloy-provider` and `sp1-prover`; neither it, `chacha20` nor `ruzstd` is in
the guest's graph.

### The real-proof rehearsal

One batch lifecycle on a fork of Sepolia, run from the guest and relay whose
key § "The guest and its verification key" names at `cf6ba4ab`: a fresh `UsageCounter` and `FigaroBatchVerifier` deployed on the fork
with the key above, bound to Succinct's live Groth16 gateway; two Groth16
proofs made on a 16-core host, about six minutes each; both accepted. Read
from the chain afterwards: the bonds pulled at commit (4 units for a payment of
1), the attestation re-emitted, the buyer's net −1 and the seller's +1 after
resolution, the verifier holding nothing, the state root advanced twice from
the genesis root, the usage counted on the counter's own storage.

## Reading list

| Document | Purpose |
|---|---|
| `docs/LEXICON.md` | Every noun this document uses, defined once |
| `docs/DESIGN_DECISIONS.md` | The catalogued intentional patterns that look like vulnerabilities; read first |
| `docs/VERIFICATION_MAP.md` | Every invariant → code → test → formal layer |
| `docs/CONTRACTS.md` | Every contract's surface, and what the protocol has no contract for |
| `docs/CLAUSES.md` | The clause spec format, the generic engine, the portable pattern core |
| `docs/SCALING_STRATEGY.md` | The batch path's architecture, and what the relay is trusted for |
| `docs/TESTING.md` | The inventory of tests, vectors and fuzz streams |
| `prover/README.md` | The five crates of the proof apparatus, the toolchain, and how the tests run |
| `prover/sequencer/README.md` | The relay's trust model, its routes and bounds, the guest fingerprint, and how to run one |
| `scripts/prover-box/README.md` | The host that builds the guest and makes real proofs |
| `docs/RELEASE_READINESS.md` | The open release tasks (testnet + mainnet) |
| `/docs` (site) | The public manual: the contract catalogue, the two resolution paths, the sharp edges |
| `/papers/verified-resolution-kernel` (site) | The batch resolution sequence figure and the verification method, per technique |

## Validation commands — the verification gate

The gate is every row below at exit code 0 with the stated result. The
commands, their prerequisites and the environment they run in are
`LOCAL_DEV.md` § "Commands"; the harness inventory (suite, file, property and
rule counts) is `TESTING.md`. The gate RUNS the three fork tests (the
coordinator against mainnet's Permit2 and Sepolia's SwapRouter02), so the
first row needs `MAINNET_RPC_URL` and `SEPOLIA_RPC_URL`, which a public node
serves; without them those tests skip, and CI's `fork` job fails on a skip.

| Command | Expected |
|---|---|
| `MAINNET_RPC_URL=<rpc> SEPOLIA_RPC_URL=<rpc> forge test --via-ir` | 0 failed, 0 skipped |
| `./scripts/test-halmos.sh` | `✅ All 41 Halmos properties proved (7 FigaroCore + 7 MembersRegistry + 9 UsageCounter + 6 ClauseRegistry + 6 AssemblyRegistry + 6 AgreementRegistry).` |
| `CERTORAKEY=<key> CERTORA_WAIT=1 ./scripts/test-certora.sh` | all 8 specs green (FigaroCore, AttestationCoordinator, TokenOpsVerification, FlorinToken, BatchVerifierTokenOps, BatchVerifierStateRoot, RpgfMinter, RpgfMinterAuthor). `CERTORA_WAIT=1` blocks until the cloud's verdict; without it the script only dispatches. `Failed on rule_not_vacuous` alone is the vacuity heuristic, not a rule failure; the results table is the authority. The script first checks `certora/token-ops.inventory` against every token-moving call site and refuses to run on a stale line |
| `./scripts/test-echidna.sh` | every property holds on both harnesses (Core + FlorinToken) |
| `./scripts/test-tla.sh` | all five models verify every invariant, TLC exit 0. `ResolutionUniverses.cfg` ships both named assumptions TRUE; flipping either to FALSE is a deliberate experiment that is EXPECTED to fail, not a gate regression |
| `(cd formal/lean && lake build)` | the equilibrium proof builds with no error (`TESTING.md` § "Lean 4") |
| `cd prover && cargo test --locked` | 0 failed; two tests ignored by design (they read a fuzz stream; the next row runs them). Needs Rust at the pin in `prover/rust-toolchain.toml` and the SP1 toolchain at the release `prover/Cargo.lock` names (`sp1up --version`); without SP1, `cargo test --locked -p figaro-clause -p figaro-kernel` runs the guest's two crates |
| `./scripts/test-cross-impl-fuzz.sh [seed]` | `✅ The implementations agree on every operation, agreement and clause case`; a fresh seed without the argument, the same seed to reproduce. Needs Foundry, Rust and the SDK's dependencies (`npm ci --workspace sdk`) |
| `scripts/prover-box/provision.sh` once on a fresh Ubuntu x86_64 host, then `scripts/prover-box/build-guest.sh` | the ELF's SHA-256 and `SP1_PROGRAM_VKEY`, equal to § "The guest and its verification key" |
| `cd sdk && npx vitest run` | no failing suite. `sdk/tests/batch-e2e.test.ts` needs a running Anvil and the relay's release binary and skips without them; `prover-ci`'s `sp1` job runs it with its skip turned into a failure |

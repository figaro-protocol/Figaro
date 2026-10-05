# External Audit Handover

The handover package for the external audit: what is in scope, what is trusted,
what is out of scope, the commit under audit and how to verify it, what the
maintainer wants from the review, which behaviors are intentional, what the
project's own verification found, and the gate the audited tree passes.

## At a glance

| | |
|---|---|
| Commit under audit | the tag `audit-2026-10` (§ "The audit commit") |
| Languages in scope | Solidity (`src/`, three deploy scripts) and Rust (`prover/`, four crates) |
| Solidity in scope | 14 contract files, 3,184 lines; 3 deploy scripts, 852 lines |
| Rust in scope | 4 crates, 20 files, 7,394 lines under `src/` |
| Configuration in scope | `foundry.toml`, the `Cargo.toml` files and `Cargo.lock`, the Rust toolchain pin (§ "In scope — configuration") |
| Trusted, not reviewed | SP1 (the zkVM, its crates, its on-chain verifier gateway), OpenZeppelin Contracts, Permit2, Uniswap SwapRouter02 |
| Out of scope | mocks, fuzz harnesses, tests and formal specs, the proving harness crate, the Sepolia deploy script, `frontend/`, `sdk/` |
| Deployed | Sepolia only, at an earlier commit (§ "What is deployed"); nothing on mainnet |
| Upgrade path | none: no admin, no proxy, no pause, in any contract |

Lines are physical lines, comments and NatSpec included.

## Scope

Scope and freeze are two separate statements. This section says what the audit
reviews. § "The audit commit" says at which commit. A component is in scope
because this section lists it, and for no other reason.

The audit covers two languages: the Solidity contracts in `src/`, and the Rust
workspace in `prover/` that the batch path runs on. **Both are in scope.**

### The batch path, component by component

The protocol resolves a process on one of two paths. The direct path is the
kernel, `FigaroCore`: two calls, `commit` and `resolveProcess`. The batch path
resolves many processes under one proof. The batch path has four parts, and
the names used for them vary, so each is given here once with its path:

| Part | Also called | Where | Language | Status |
|---|---|---|---|---|
| The on-chain verifier | the batch verifier | `src/core/verifier/FigaroBatchVerifier.sol`, `ISP1Verifier.sol` | Solidity | In scope |
| The proof program | the guest, the SP1 program, the Rust verifier, the prover, the kernel mirror | `prover/program/`, `prover/lib/`, `prover/clause/` | Rust | In scope |
| The relay | the sequencer | `prover/sequencer/` | Rust | In scope |
| SP1 | the zkVM, the verifier gateway | Succinct's crates and contracts; none of their source is in this repository | Rust, Solidity | Trusted dependency; the project's use of it is in scope |

No Rust code verifies a proof on chain. "The Rust verifier" names the proof
program: the Rust that decides what a valid proof proves.

### In scope — Solidity

The directory IS the tier map (`CONTRACTS.md` § header).

| Directory / file | Contents | Lines |
|---|---|---|
| `src/core/kernel/` | `FigaroCore.sol`, `CommitmentTypes.sol` | 306, 53 |
| `src/core/attestation/` | `AttestationCoordinator.sol`, `IRoleResolver.sol` | 235, 16 |
| `src/core/verifier/` | `FigaroBatchVerifier.sol`, `ISP1Verifier.sol` | 596, 15 |
| `src/build/registries/` | `ClauseRegistry.sol`, `AssemblyRegistry.sol` | 211, 188 |
| `src/build/rewards/` | `UsageCounter.sol`, `RpgfMinter.sol` | 770, 253 |
| `src/build/florin/` | `FlorinToken.sol`, `IFlorinMinter.sol` | 83, 9 |
| `src/app/` | `MembersRegistry.sol`, `WitnessSwapAndCommitCoordinator.sol` | 210, 239 |
| `script/Deploy.s.sol` | Devnet deploy (defines the devnet surface) | 436 |
| `script/DeployMainnet.s.sol` | Mainnet deploy (defines the audited mainnet surface; deploys the swap coordinator) | 356 |
| `script/DeploySwapCoordinator.s.sol` | The swap coordinator alone onto a LIVE stack | 60 |

### In scope — Rust

`prover/` is one Cargo workspace of five crates (`prover/README.md`). Four are
in scope.

| Crate | Package | Lines | What it is | What a defect costs |
|---|---|---|---|---|
| `prover/program/` | `figaro-prover` | 13 | The guest's entry point: reads the batch input, runs the kernel mirror, commits the public values | A batch the chain resolves wrongly |
| `prover/lib/` | `figaro-kernel` | 1,888 | The mirror of `FigaroCore`'s commit and resolve logic, the witness gates, the public-values encoding, the state root, the usage accrual | A batch the chain resolves wrongly |
| `prover/clause/` | `figaro-clause` | 1,938 | The generic clause engine: parses any clause spec supplied as witness input, validates content against it, encodes it | An attestation the batch path reads differently from the party who signed it |
| `prover/sequencer/` | `figaro-sequencer` | 3,555 | The relay: collects signed operations, forms batches, proves them, calls `settleBatch`, publishes what it resolved | Liveness and griefing; a reader misled by what the relay publishes |

**The proof program** (`prover/program/`, `prover/lib/`, `prover/clause/`) is
what a valid proof proves: `FigaroBatchVerifier` accepts the public values a
proof under `programVKey` commits to, so a defect in the guest is a batch the
chain resolves wrongly — the same class of loss as a kernel defect. Review
goal: public-values completeness — no operation stream yields public values
the verifier accepts that differ from what `FigaroCore` would have done with
the same signatures.

**The relay** (`prover/sequencer/`). `settleBatch` is permissionless and the
proof is checked on chain, so the relay cannot forge; the direct path stays
open to every new process (`SCALING_STRATEGY.md` § Trust analysis). A process
opened on the batch path resolves on the batch path, through a batch built on
the state behind the verifier's root, which the relay that built the last
batch holds (Known limitation 7).
It holds one key, `SEQUENCER_PRIVATE_KEY`, which signs the `settleBatch`
transaction and pays its gas; the key grants no protocol privilege. What the
relay publishes is how a stranger checks that a batch happened; nothing it
publishes is authority, and every field is checkable against the chain.
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

### Line counts

This document counts physical lines, comments included. Without comments and
blank lines the scope is 1,299 lines of contracts, 405 of deploy scripts and
5,147 of Rust. An audit platform that normalises each statement to one line
counts lower still — about 5% lower for the Solidity and about 40% for the
Rust, whose formatter spreads a statement over several lines.

### Trusted dependency — SP1

SP1 is Succinct's zkVM. The audit reviews how the project uses SP1. It does not
review SP1.

| In scope: the project's use of SP1 | Where |
|---|---|
| The interface the verifier calls | `src/core/verifier/ISP1Verifier.sol` |
| The one proof check, and everything `settleBatch` does with the public values after it | `FigaroBatchVerifier.sol:279` |
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
- `frontend/`, `sdk/` — reviewed separately (§ "Frontend + SDK audit posture")

## The audit commit

**The commit under audit is the tag `audit-2026-10`.** One commit covers the
whole scope, Solidity and Rust together.

```bash
git rev-parse 'audit-2026-10^{commit}'
```

No change is made to a path in scope during the audit window, the changes below
excepted. The tag is never moved: a change to the scope is a new tag.

### Changes after the tag

Seven changes were made to the relay (`prover/sequencer/`) after the tag, on
the maintainer's override, each closing a defect the project's own review
found. None touches a contract, a guest crate, a `Cargo.toml` or the lock, so the
guest's bytes and the verification key are the tag's. This prints them all:

```bash
git diff audit-2026-10 -- prover/sequencer/
```

| Change | The defect it closes | Where | Held by |
|---|---|---|---|
| A submission's dedup identity covers every input the proof or the verifier judges and admission cannot | A resolve was deduplicated by process id alone, and admission accepts a resolve signed by any key (the root buyer is state). A stranger's resolve for an open process therefore made the buyer's own a duplicate; batch formation refused the stranger's, and the buyer's was never queued. Repeated every tick, it kept the resolve out of every batch at no cost. The same held for the buyer's signature replayed over an incomplete order list, for a seller attestation replayed under another role order, and for an attestation copied with other witness spec bytes. | `prover/sequencer/src/mempool.rs` (`op_key`) | `mempool_resolve_signed_by_a_stranger_does_not_take_the_buyers_slot`, `mempool_resolve_with_another_order_list_does_not_take_the_slot`, `mempool_seller_attest_under_another_role_does_not_take_the_slot`, `mempool_attest_with_other_spec_bytes_does_not_take_the_slot`, `mempool_duplicate_resolve_is_idempotent` |
| The relay keeps the state behind the verifier's root on disk and builds on no other | The state lived in memory, every start began from genesis, and a root that differed from the verifier's was a warning. After one landed batch a restarted relay proved batches that could only revert, and the state every open batch-path process needs for its resolve ended with the process. The state a batch produces is written before the batch is sent and held for as long as the batch can land (a refused batch's proof is public, and anyone can send it again while the verifier's root is its previous root); the relay reads `stateRoot()` at startup and before every batch, adopts a held state whose root it is, refuses to start when it reads the root and holds no state for it, and builds nothing while it holds none. A batch that landed without the relay reading its receipt is published under the transaction its `BatchSettled` log names. | `prover/sequencer/src/state.rs` (`StateStore`, `held_state_for`), `prover/sequencer/src/main.rs` (`step_to`, `adopt`, the batch loop), `prover/sequencer/src/submitter.rs` (`find_settle_tx`) | the `state_store_*` and `held_state_for_*` tests in `prover/sequencer/tests/sequencer.rs`; `sdk/tests/batch-e2e.test.ts` restarts the relay between its two batches and starts a relay holding no state, which must exit 2 |
| The relay publishes its state (`GET /state`) | With the state on one relay's disk only, losing that disk left every open batch-path process with no one who could build its resolve. A party or a second relay now fetches the state into a new file and, once its `x-figaro-state-root` header is the verifier's `stateRoot`, starts on it as its `STATE_PATH`; the root is recomputed and checked against the verifier's, so a copy is checked, never trusted. The recipe never writes a served state over a state file unchecked: `formal/RelayState.tla` (`TakeoverChecksRoot`) shows a stale served state overwriting the only copy. | `prover/sequencer/src/api.rs` (`get_state`) | `api_state_route_serves_the_state_another_relay_starts_on`; `sdk/tests/batch-e2e.test.ts` starts a second relay on the first relay's `/state` and reads the verifier's root from it |
| `MAX_BATCH_OPS` is applied | It was read and logged, never applied: a batch took the whole queue (up to 10,000 operations), past what one block holds and one proof finishes. A batch now takes at most `MAX_BATCH_OPS` operations, oldest first. | `prover/sequencer/src/mempool.rs` (`drain_up_to`), the batch loop | `mempool_drains_at_most_the_batch_cap_and_keeps_the_rest_queued` |
| The batch's clock is the chain's | The batch timestamp was the host's clock. A host clock ahead of the chain made the verifier refuse every batch (`BatchTimestampOutOfRange`). It is now the latest block's timestamp, read before anything is drained. The verifier itself still accepts a timestamp up to `MAX_BATCH_STALENESS` (one hour) behind its block from any prover, so a commitment up to an hour past its deadline can be bonded on the batch path that the kernel would refuse; both parties signed it, and the verifier is as tagged (accepted risk 4). | `prover/sequencer/src/submitter.rs` (`read_chain_timestamp`), the batch loop | `sdk/tests/batch-e2e.test.ts` (the relay proves against the chain's clock on Anvil) |
| Funding is allocated per wallet | Each commit was checked against its wallet's balance alone, so several commits from one wallet each passed and `settleBatch` reverted when it pulled their sum, dead-lettering every operation in the batch after minutes of proving. A wallet's balance and allowance are now read once and allocated across the batch's commits in order. | `prover/sequencer/src/submitter.rs` (`allocate_funding`, `filter_funded_commits`) | `funding_is_allocated_across_a_wallets_commits_in_order` |
| An attestation's witness spec is checked against the registry before proving | The relay checked that the spec parsed; the verifier checks that its hash is `ClauseRegistry.contentHashOf` for the clause and reverts the whole batch otherwise. Anyone could copy a landed attestation with one byte of the spec changed and sink every batch at no cost. The relay now reads the anchor from the verifier's own registry and drops such an attestation alone. | `prover/sequencer/src/submitter.rs` (`attestation_spec`, `filter_anchored_attestations`) | `the_spec_an_attestation_carries_is_what_the_registry_check_reads`; the batch end-to-end test's attestation passes the check against the live registry |
| The binary's own log lines are on by default | The relay's default log filter named the library's target (`figaro_sequencer`) and not the binary's (`sequencer`), so startup, every refusal to start (the signing key, the guest fingerprint) and every batch-loop line (a batch landed, an operation dropped or dead-lettered) were filtered out unless `RUST_LOG` named both: a relay that refused to start exited 2 and said nothing. | `prover/sequencer/src/main.rs` (the default filter) | `sdk/tests/batch-e2e.test.ts` reads the refusal line of the relay that holds no state |

All seven are liveness or operability defects of the relay: none let a batch
move value the parties did not sign, and the proof and the verifier are as
tagged. Known limitation 7 states what the state changes leave standing.

### The kernel

The kernel — `FigaroCore.sol` and `CommitmentTypes.sol` — last changed at
`c7f85d0d` (2026-08-12). Since then the two files moved directory and nothing
else. This prints two renames and `0 insertions(+), 0 deletions(-)`:

```bash
git diff -M --stat c7f85d0d audit-2026-10 -- src/kernel/ src/core/kernel/
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
| Guest ELF, SHA-256 | `1015f99f61f0a362fdffa6f96b8f48ba050fccc0862d9a9d018b1e142dca5fcc` |
| Verification key | `0x005f16f47c211b066a9cd85fb78295ae76df7f888f2e4962871f25636a0b3452` |

The guest is built inside SP1's build image, by
`scripts/prover-box/build-guest.sh`; the release is read from
`prover/Cargo.lock`. Built twice on one host from the audit commit: the same
bytes and the same key. The ELF does not reproduce across operating systems,
so the image's build is the one that counts. The relay derives the key from
the guest it embeds (`sequencer --vkey`) and refuses to start when the deployed
`programVKey()` differs.

### What is deployed

Nothing is deployed on mainnet.

Sepolia carries a full stack, recorded in `deployments/11155111.json`. Its
batch verifier and usage counter are an earlier commit's: the verifier there
pins the key of an earlier guest and predates two checks the audit commit
carries (the batch's clock, the public-values length). A Sepolia redeploy of
the batch path is the verifier and the usage counter together, since each
holds the other's address as an immutable. `RpgfMinter` on Sepolia stays bound
to the first counter: `FlorinToken.registerMinter` was renounced there with
the cap fully allocated, so no second minter can be registered. Mainnet
deploys every contract once, from `DeployMainnet.s.sol`, and has no such seam.

### Change policy

During the audit window nothing in scope changes. After it, a change to a path
in scope, Solidity or Rust, is:

1. Scoped to a specific finding or accepted-risk item
2. Reviewed by the original auditor or a qualified substitute
3. Recorded in the backlog with finding reference and outcome
4. Followed by the whole gate (§ "Validation commands"), the formal suites
   included — a signature change silently orphans any CVL spec that calls it,
   and the break is invisible until the gate runs
5. For a change to the guest: followed by a rebuilt guest, a re-derived key,
   and a verifier deployed with it

Changes to `test/`, `frontend/`, or `sdk/` do not require re-audit unless they
expose a new on-chain attack surface.

## Review goals

What the maintainer wants from the review, so hours go where the doubt is.

**Worst case.** Locked bonds lost or moved through a defect rather than through
the documented by-design cases: a resolution by anyone but the buyer, a bond
that leaves the kernel other than at resolution, or a batch resolution the
direct path would have refused.

**Areas of concern, in order.**

1. Any path by which the payoff table the equilibrium rests on can be altered:
   signature or domain-separator replay, accumulator manipulation, reentrancy
   through the token, an order that resolves a process it does not belong to.
   The kernel is about 200 SLOC and carries five verification layers; the
   doubt is in what composes with it, not in it.
2. The batch path's seam between languages. `FigaroBatchVerifier.settleBatch`
   is the largest function in scope, and the guest decides what it moves: a
   forged or mis-bound proof accepted by the verifier, a clause-hash binding
   that diverges from the registry, public values the guest commits that the
   kernel would have refused, and the one privileged writer (the verifier into
   `UsageCounter`) doing more than accrue. Every defect the project found
   itself before this handover sat on a seam between two implementations of
   one rule (§ "What the project's own verification found").
3. The reward and stake economics: reward inflation or Sybil accrual through
   `UsageCounter` and `RpgfMinter`; stake accounting in the registries'
   withdrawal paths.
4. Token-boundary behaviour: the Permit2 witness digest and SwapRouter02 call in
   `WitnessSwapAndCommitCoordinator`, and non-standard ERC-20s beyond the
   fee-on-transfer rejection.
5. The clause engine: a spec or a content the guest reads differently from
   the SDK's engine (`@figaro-protocol/sdk/clauses`), and the witness gates the mirror
   enforces — spec-identity substitution, content-hash mismatch, inclusion
   failure, attest-after-resolve — agreeing with `AttestationCoordinator` and
   the kernel.
6. The relay: liveness under a hostile client — the door, the cap, the
   re-queue — the handling of its one key, and what it publishes.

**Questions for the auditor.**

1. Is there any sequence of `commit` calls, on one process or across processes,
   that makes `resolveProcess` pay a seller more than `2·G_i + P_i` or refund the
   buyer other than `P_i` per order?
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
   (`DESIGN_DECISIONS.md` #22) — replayable to any effect?
9. Can one client stall the relay, or exhaust its re-queue, at a cost below its
   own rate-limit budget?

## What the project's own verification found

Between the first handover and this one the project built three differential
fuzz streams, ran mutation testing over the Rust, and rehearsed a real proof.
They found nine defects. None moved value wrongly; eight of the nine were two
implementations of one rule disagreeing. All are fixed at the audit commit,
each with the test that found it. They are listed because they show where this
codebase breaks: at the seams.

| # | Seam | Defect | Found by |
|---|---|---|---|
| 1 | Kernel ↔ Rust mirror | The mirror accepted a signature whose recovery id is written 0 or 1; `ECDSA.recover` hands it to `ecrecover` as written and the kernel rejects it | Kernel fuzz stream |
| 2 | SDK clause engine ↔ Rust clause engine | An integer past ±(2^53 − 1): one JSON text, read as two integers | Clause fuzz stream |
| 3 | Validator ↔ encoder, both engines | A `bigint` past 2^256 − 1 validated and could not be encoded | Clause fuzz stream |
| 4 | Validator ↔ encoder, both engines | A signed `bigint` validated and could not be encoded | Clause fuzz stream |
| 5 | JavaScript regex ↔ Rust regex | A field's `pattern` run by two libraries that read lookaround, inline flags, Unicode classes and set operations differently | Engine vectors |
| 6 | SDK spec parser ↔ Rust spec parser | A spec `version` of `1e21` parsed by one and refused by the other | Engine vectors |
| 7 | JSON text ↔ Rust number | `9007199254740991.0` read as `…990` by the Rust JSON parser's default mode | A test written for a surviving mutant |
| 8 | SDK clause engine ↔ Rust clause engine | An integer written `5.0` or `5e0` refused by the guest, read as 5 by the SDK | The same test |
| 9 | Relay ↔ its readers | The relay published a batch's transaction hash under a name its readers did not read; every batch read as unanchored | The real-proof rehearsal |

Two changes to `FigaroBatchVerifier` came the same way. The guest checked every
commitment deadline against a timestamp the prover chose and the verifier
never saw; the timestamp is now the ninth public-values word, bounded on chain
(`MAX_BATCH_STALENESS`). And public values of any length but nine words are
now refused by name (`PublicValuesLengthMismatch`) before the proof is read.

## Actors, privileges, and external dependencies

Every actor and what it alone can do. The kernel has no privileged role: `commit`
never reads `msg.sender`, and `resolveProcess` is gated by presence
(`msg.sender == rootBuyer`), not by a role.

| Actor | Can | Cannot |
|---|---|---|
| Buyer | sign an order; call `resolveProcess` on its own process; sign the batch path's resolve authorization; attest on its own orders | resolve a process it did not open; resolve one order of a process |
| Seller of record | sign an order; attest on its own orders, or delegate that to an `IRoleResolver` contract at the seller address (direct path only) | move any bond; resolve |
| Designer / registrant | register a clause or assembly under a stake; withdraw that stake (the binding stays); claim designer rewards on the keys it registered while its member stake is live | edit or remove a registration; earn on an unstaked key |
| Member | register, update, request withdrawal, withdraw after the cooldown | act for another wallet |
| Batch submitter (the relay or anyone) | call `settleBatch` with a valid proof over the current root | fabricate an operation, move a token the proof does not commit to, replay a proof (`SCALING_STRATEGY.md` § Trust analysis) |
| `FigaroBatchVerifier` | write accrual into `UsageCounter` (sole caller, immutable) | mint, edit a score, block a resolution (`DESIGN_DECISIONS.md` #16, #20) |
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

## Behaviors to surface

Correct by design, but non-obvious — flagged so a reviewer does not spend time
re-deriving they are intentional. `DESIGN_DECISIONS.md` is the full catalogue;
read it first.

- `FlorinToken.renounceDeployerMint()` emits NO event (the state is readable via
  `deployerMintRenounced`; the renounce is a one-way latch, not an event source).
- `FlorinToken.registerMinter` treats `cap == 0` as the "not a minter" sentinel — a
  minter registered with a zero cap is indistinguishable from an unregistered one.
- The kernel has an unreachable `expectedCumulativeValue ∈ (max/3, max/2]` window (bond
  math would overflow above it; it cannot be reached because a prior order's bond would
  have reverted first). The mirror reports the same window as `Overflow`.
- Token authority is a class, not one case. A token that reverts transfers to a
  party's address bricks `resolveProcess` for the whole process — the seller at
  `FigaroCore.sol:294`, the buyer at `:295`; a token that blocklists or freezes
  the kernel's own address, pauses, or is upgraded to do any of these has the same
  effect. Accepted (the buyer chose the token and the seller), a token-choice
  concern, not a kernel escape hatch. On the batch path the same class reverts one
  batch, not the protocol: a payout the token refuses reverts `settleBatch` in
  `_executePositions` (`FigaroBatchVerifier.sol:566`), and the batch's
  operations are dead-lettered and re-submittable; a process open on the batch
  path resolves on the batch path only. The relay reads each party's balance and
  allowance before it submits (`prover/sequencer/src/submitter.rs`); it does not
  yet drop a revoking party and re-run the batch without it
  (§ "Known limitations").
- The kernel recovers ECDSA signers (`ECDSA.recover` in `commit()`), so a
  smart-contract wallet (multisig) cannot be a kernel party directly; it transacts
  through an EOA it controls (the off-protocol auxiliary pattern). The buyer-key-loss
  comment at `FigaroCore.sol:238-240` recommends social recovery or multisig for the
  buyer role — upstream of the kernel, consistent with the same pattern.
- A signature is accepted in one form: `s` in the lower half of the curve order,
  `v` written 27 or 28. The kernel takes this from OpenZeppelin's `ECDSA`; the
  mirror enforces the same two rules itself.
- The batch path's resolve authorization is a signature over
  `ResolveProcess(processId)` under the VERIFIER's EIP-712 domain, with no nonce
  and no deadline (`DESIGN_DECISIONS.md` #22): a process resolves once, so the
  authorization has one use.
- The two paths share no state. A batch-resolved process never acquires kernel
  status; `UsageCounter` is the one place the two meet, and only accrual crosses.
- The direct path merkle-binds and content-hashes an attestation and validates
  no shape; the batch path validates content against the clause spec inside the
  proof. Per-clause validator contracts do not exist (`CONTRACTS.md`
  § "What the protocol has no contract for").
- A clause's `pattern` is a regex in the portable core (`CLAUSES.md`): the
  constructs JavaScript's regex library and Rust's read alike. A pattern that
  exhibits the nested-quantifier shape, or an input over 4,096 UTF-16 units, is
  treated as satisfied by both engines — the safe direction for a check whose
  binding form is the merkle commitment.

### Conventions and measured complexity

**Naming, as practised across the Solidity in scope.** Contracts and structs
PascalCase; external and public functions camelCase; every internal and private
function carries a leading underscore (the one exception is the library
function `CommitmentTypes.hashStruct`, named for the EIP-712 operation it
performs); immutables camelCase, constants UPPER_SNAKE (`COMMITMENT_TYPEHASH`,
`MAX_SUPPLY`, `CUBE_MAX`); custom errors are PascalCase statements of the
condition (`OrderNotCommitted`, `SellerNotStaked`); events are PascalCase
past-tense facts (`OrderResolved`, `MemberWithdrawalRequested`) except
`Attestation`, which names the attestation itself. `forge fmt` is the formatter
and runs in CI.

**Cyclomatic complexity** (Slither `function-summary`):

| Function | CC | Why |
|---|---|---|
| `FigaroCore.commit` | 15 | the kernel's one entry point does the whole commit: deadline, payment, hashing, two signature recoveries, the root-or-extension branch, bond math, two pulls |
| `FigaroBatchVerifier.settleBatch` | 12 | length, proof, five public-value checks, four calldata hashes, registry anchor, token legs, events, the accrual try/catch |
| `UsageCounter.applyBatchAccrual` | 10 | period, provenance, per-accrual registration and stake gates, monotone-update checks |
| `FigaroCore.resolveProcess` | 8 | presence, count, per-order status and overflow guards |
| `UsageCounter` constructor | 8 | five zero-address checks, the floor, the period list's length and order |
| `RpgfMinter.claim` | 7 | period closed, not claimed, per-key designer of record and stake |

Every other function in the Solidity in scope is at 6 or below.

**The one `unchecked` block** (`UsageCounter.sol:667-670`) increments two
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

### Known stale comments in the kernel

The kernel is frozen, so its comments are too. None describes behaviour wrongly
except the first, which `DESIGN_DECISIONS.md` #10 corrects.

| Location | Says | Reality |
|---|---|---|
| `FigaroCore.sol:124-129` | rebasing tokens are rejected by the balance check | the check sees only the delta inside its own transfer call (`DESIGN_DECISIONS.md` #10) |
| `FigaroCore.sol:238-240` | use social recovery or a multisig for the buyer role | the kernel recovers ECDSA signers; a multisig transacts through an EOA it controls (§ "Behaviors to surface" above) |
| `FigaroCore.sol:287` | "see audit L-4" | a label from a pre-freeze AI-assisted review; that report is not in the tree and the numbering carries no weight — the external auditor forms independent findings |

## Accepted risks

Current design realities accepted by the protocol surface, not accidental defects:

1. buyer key loss is terminal for an active process because the kernel has no timeout or admin recovery path
2. very large processes are gas-bounded, so institution design should compose across processes instead of pushing single-process fanout toward the ceiling
3. fee-on-transfer tokens are unsupported by design and are rejected explicitly by the kernel; rebasing tokens are unsupported and NOT detected (`_pullExact` sees only the delta inside its own transfer call — `DESIGN_DECISIONS.md` #10 states the consequence and corrects the kernel's NatSpec, which is frozen); a token with an issuer blocklist holds any process a blocked party sits in until the issuer relents, since resolution is atomic (`WeirdTokenTest`; the same entry)
4. a commitment can be bonded on the batch path up to one hour after its deadline: `settleBatch` accepts a batch timestamp up to `MAX_BATCH_STALENESS` (one hour, `FigaroBatchVerifier.sol:98`, checked at `:299`) behind its block, from any prover, and the guest checks deadlines against that timestamp; the kernel refuses an expired commitment at once. Both parties signed the commitment and both fund its bonds, so nothing moves that they did not agree to; a party that needs a hard cut-off signs a deadline one hour earlier. Closing it is a verifier change, so a new key and a new deployment

## Known limitations

Stated so the review does not spend hours finding them.

1. **The Rust carries less verification than the Solidity.** The contracts have
   symbolic proofs (Halmos), formal rules (Certora), model checking (TLA+) and
   property fuzzing (Echidna). The Rust has unit and conformance tests,
   cross-language vectors, three differential fuzz streams, mutation testing
   over the guest's two crates, and static analysis. It has no formal proof.
   What locks the mirror to the kernel is agreement on generated input, not a
   proof of equivalence.
2. **The relay is not mutation-tested.** Mutation testing covers the guest
   (`figaro-kernel`, `figaro-clause`), where a defect costs a wrong resolution.
   The relay has its 79 integration tests, 12 unit tests and the batch
   end-to-end test.
3. **The relay does not yet re-batch around a revoker.** A party who revokes
   its allowance after the relay's funding check and before `settleBatch`
   reverts that batch; its operations are dead-lettered and re-submittable.
   The direct path stays open to a new process.
4. **The full devnet end-to-end suite runs by hand.** CI runs its spine. Run
   once on a fresh devnet at the audit commit: 55 specs, 52 passed at the
   first attempt, 3 passed at the second — a three-seller chain's accept and
   the two swap-funded on-ramps, whose first attempt on a fresh chain
   revert `ERC20InsufficientAllowance` before the allowance the page has
   just set is read back. A timing fault in the tests, not in the contracts;
   none failed.
5. **Gas figures predate the chain's latest fork.** The per-order gas constants
   the SDK carries were measured before Sepolia's fork of 2026-09-28; accepted
   risk 2's ceiling is to be re-measured on it.
6. **The incident procedure is written and not rehearsed.** `SECURITY.md`
   § "Incident response"; its redeploy leg is owed one run on Sepolia.
7. **The state behind the verifier's root lives off chain.** The verifier
   stores a root. The state it commits to is held by the relay that built the
   last batch (`STATE_PATH`) and published by it (`GET /state`), so a party
   or a second relay can keep a copy and start on it once the copy's root is
   checked against the verifier's; nothing in this
   repository rebuilds it from the chain or from the publication archive. A
   process opened on the batch path resolves only through a batch built on
   that state, so if every copy is lost — or another submitter lands a batch
   and publishes nothing — those processes have no one who can build their
   resolve, and their bonds stay in the verifier. A relay that does not hold
   the state refuses to start and builds nothing.

## Accepted runtime posture

Current runtime posture decisions, not release blockers:

1. geolocation remains allowed for same-origin runtime surfaces instead of being narrowed to a brittle route allowlist, because handoff and delivery-attestation modules are runtime-composable across multiple live pages

## Verification evidence

Everything in this section was measured at the audit commit, on 2026-09-29,
unless a line says otherwise. Which invariant each layer carries is
`VERIFICATION_MAP.md`; the inventory of tests is `TESTING.md`.

### The gate

| Layer | Result |
|---|---|
| Foundry | 341 passed, 0 failed, 0 skipped |
| Fork tests (mainnet's Permit2, Sepolia's SwapRouter02) | 3 passed, 0 skipped |
| Halmos | 32 of 32 properties proved |
| Certora | 6 of 6 specs, every rule verified |
| Echidna | every property held on both harnesses |
| TLA+ | 4 models, 48 invariants, no error; `FigaroCore` explored 8,380,329 states. Added after the tag: `RelayState` (the relay's state lifecycle, 7 invariants + 1 action property), no error over 27,535 distinct states, each of its four defect switches caught |
| Rust (`cargo test`, five crates) | 195 passed, 0 failed; 2 ignored by design, run by the fuzz script |
| Differential fuzz | 4 rounds, no divergence: 1,600 kernel operations, 256 agreements, about 22,000 clause cases |
| SDK (Vitest) | 813 passed; frontend (Vitest) 873 passed |
| Batch end-to-end (SDK → relay → verifier) | passed |
| Devnet end-to-end (Playwright, 55 specs) | 52 passed, 3 passed on retry (§ "Known limitations") |

Certora reports:

| Spec | Report |
|---|---|
| FigaroCore | https://prover.certora.com/output/9512759/45aab7c04aa74df2a394adacf737b0bb |
| AttestationCoordinator | https://prover.certora.com/output/9512759/b029681770794669add40ece51cbbb91 |
| TokenOpsVerification | https://prover.certora.com/output/9512759/b07ef08009c145bfa6c1f4ebbe7a39c1 |
| FlorinToken | https://prover.certora.com/output/9512759/7e9a532568dd4249b99397a564fe8c4e |
| BatchVerifierTokenOps | https://prover.certora.com/output/9512759/79f9b51977c74a9db3e38d479bd69692 |
| RpgfMinter | https://prover.certora.com/output/9512759/cfdf957d26fd4b2393c8576d2c5ec372 |
| BatchVerifierStateRoot (added after the tag, run 2026-10-05 against the verifier as tagged; the spec reads the contract through `certora/harness/FigaroBatchVerifierHarness.sol`, which adds only a decoding view; each rule mutation-checked, failing on its own mutation: https://prover.certora.com/output/9512759/9fb2a938b04847b8b44c83fee498631a) | https://prover.certora.com/output/9512759/69781170fd464b3596575f725896b9c0 |

### Test coverage, Solidity

`scripts/coverage.sh` (`forge coverage` under the full via-IR pipeline; the two
gas-anchor tests excluded, since instrumentation raises their measurements),
over the eleven contracts in scope that hold code:

| | Lines | Statements | Branches | Functions |
|---|---|---|---|---|
| In scope | 99.81% (530/531) | 99.44% (711/715) | 97.04% (131/135) | 100% (67/67) |
| Lowest file: `FigaroCore.sol` | 98.57% | 97.78% | 90.48% | 100% |

What is uncovered, line by line: `FigaroCore.sol:204`, the
`DuplicateCommitment` guard, and `:288-289`, the `CumulativeValueOverflow`
revert, both unreachable (§ "Behaviors to surface"); `RpgfMinter.sol:228`, an
early return whose arithmetic yields the same result without it;
`FlorinToken.sol:72`, a supply-cap check behind per-minter caps that already
bound the supply. These four are also the lines whose mutants survive below:
two measurements, one set of lines. The report's `Total` row counts mocks,
scripts and tests and is not the scope's figure.

### Mutation testing, Solidity

Trail of Bits' `mewt` 4.0.0, high and medium severity mutations (statement
removal, error replacement, condition forcing, negation removal,
return-default), each contract against the test files that cover it, the
gas-anchor tests excluded so a catch means behaviour. One run, one database,
at the audit commit:

| Contract | Mutants | Caught | Survived |
|---|---|---|---|
| `FigaroCore.sol` | 99 | 96 | 3 |
| `CommitmentTypes.sol` | 3 | 3 | 0 |
| `AttestationCoordinator.sol` | 60 | 60 | 0 |
| `WitnessSwapAndCommitCoordinator.sol` | 56 | 56 | 0 |
| `MembersRegistry.sol` | 63 | 63 | 0 |
| `ClauseRegistry.sol` | 59 | 59 | 0 |
| `AssemblyRegistry.sol` | 43 | 43 | 0 |
| `UsageCounter.sol` | 224 | 223 | 1 |
| `RpgfMinter.sol` | 104 | 102 | 2 |
| `FlorinToken.sol` | 54 | 52 | 2 |
| `FigaroBatchVerifier.sol` | 156 | 156 | 0 |
| **All** | **921** | **913** | **8** |

No timeout, nothing skipped. Every High-severity mutant was caught.

The eight survivors, each read against the source:

| Contract, line | Mutation | Why no test can tell |
|---|---|---|
| `FigaroCore.sol:204`, two mutants | Remove or disable the `DuplicateCommitment` guard | Every replay is refused earlier: a repeated root by `ProcessAlreadyExists`, a repeated extension by `CumulativeValueMismatch`, since the accumulator has moved. `FigaroCoreRevertBranchTest` pins each preempting error |
| `FigaroCore.sol:288` | Disable the `CumulativeValueOverflow` guard | An order with such a value cannot be committed: its bond, twice the value, overflows at `commit` |
| `UsageCounter.sol:664` | Write the seller-seen flag unconditionally | When the seller was seen before the flag is already true; the breadth count two lines below keeps its own condition |
| `RpgfMinter.sol:228`, two mutants | Remove or disable `if (score == 0) return (0, 0)` | The next line computes `amount × 0 / total`, which is 0; the return only saves the arithmetic |
| `FlorinToken.sol:72`, two mutants | Remove or disable the `MAX_SUPPLY` check in `mint` | Tokens are created in `mint` alone, each minter is held to its cap on the line above, and `registerMinter` refuses a cap that would take the sum of caps past `MAX_SUPPLY` |

### Mutation testing, Rust

`cargo-mutants` over the guest's two crates, `figaro-kernel` and
`figaro-clause`, with `cargo test` as the oracle. A mutant that makes a loop
run forever is detected by timeout.

| | Count |
|---|---|
| Mutants | 617 |
| Caught | 550 |
| Timed out | 26 |
| Survived | 12 |
| Not compilable | 29 |

The twelve survivors, each read against the source: one in the kernel mirror
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
| Kernel operations: commits and resolutions, valid and malformed, over five wallets and two tokens | Foundry, on `FigaroCore` itself | the Rust mirror: same acceptance, same error, same ids, deposits, payouts and process states | 400 operations |
| Agreements: one to six sections, their root, leaves and inclusion proofs | the SDK | OpenZeppelin `MerkleProof` and the guest's verifier | 64 agreements |
| Clauses: every protocol clause, generated specs nobody has seen, specs of one random `pattern`; content inside each bound and across it | the SDK | the Rust clause engine: same parse verdict, same validation verdict, same bytes | about 6,000 cases |

The generator asserts nothing about what a case deserves: the reference
implementation's answer is the oracle. A divergence prints the seed and the
step, and the same seed reproduces it.

### Static analysis

**Solidity.** Slither 0.11.3 (`--exclude-dependencies`; mocks, fuzz harnesses,
tests and scripts filtered) and Semgrep with the `p/smart-contracts` ruleset.
Semgrep returns only INFO gas-style rules. Both run in CI on every push
(`.github/workflows/foundry-ci.yml`, job `static-analysis`): Semgrep fails on any WARNING or
ERROR, and a gate holds Slither's High and Medium results to exactly the six
triaged below, by detector, so a new one fails the push and so does one
vanishing. Slither's 42 results, triaged:

| Severity | Detector | Where | Verdict |
|---|---|---|---|
| High | arbitrary-send-erc20 | `_pullExact` in `FigaroCore` and `FigaroBatchVerifier` | Designed. The `from` is a recovered EIP-712 signer (kernel) or a net position hashed into the proof's public values (verifier), never a caller-supplied address. |
| Medium | incorrect-equality | `MembersRegistry.withdraw` (`unlockAt == 0`) | Sentinel for "nothing pending"; `DESIGN_DECISIONS.md` #15. |
| Medium | reentrancy-no-eth | `settleBatch` writes `stateRoot` after calling `UsageCounter` | `nonReentrant`; the callee is an immutable address that accepts only this caller and calls nothing back; the call sits in a try/catch so its revert cannot unwind the token legs. |
| Medium | unused-return | tuple destructuring of `assemblies.bindings` | Reads the fields it needs. |
| Low | missing-zero-check | `WitnessSwapAndCommitCoordinator` constructor `router_` | A zero router yields a coordinator whose swap leg always reverts and holds nothing; the deploy scripts probe the router before construction. |
| Low | reentrancy-benign | `settleBatch` increments `batchCount` after the token legs and the accrual call | `nonReentrant`; the same reasoning as the Medium above. |
| Low | calls-loop | accrual, spec-binding, position, and entitlement loops | Designed; loops are over caller-sized calldata and gas-bounded (accepted risk 2). No loop body reverts on a third party's action. |
| Low | timestamp | `deadline` in `commit`; the batch's clock in `settleBatch`; registry cooldowns; reward periods | `deadline` is the expiry of the unconsummated signature window (`DESIGN_DECISIONS.md` #13); the batch's clock is bounded to an hour; the rest are day-scale comparisons. |
| Info | assembly, cyclomatic-complexity, low-level-calls, missing-inheritance, naming | verifier hashing helpers; `commit` and `settleBatch`; the swap call and the three ETH refunds; local interfaces; `DOMAIN_SEPARATOR` | Calldata hashing mirrored by the prover's parity tests; the two largest functions; checks-effects-interactions on every refund; style. |

**Rust.** In CI on every push (`.github/workflows/prover-ci.yml`): Clippy with its correctness
and suspicious groups denied, over all four crates in scope — clean; Semgrep
with the `p/rust` ruleset, failing on any WARNING or ERROR — two INFO results,
both in the relay (it reads its arguments; it names a temporary directory);
`cargo audit` over `prover/Cargo.lock` (`.github/workflows/guards-ci.yml`) — no advisory that
fails the run, and 13 warnings: nine transitive crates marked unmaintained,
and unsoundness notices on `lru` and `chacha20`. Of these, one is compiled
into the guest: `bincode`, unmaintained, through SP1's input encoding. `lru`
reaches the relay through `alloy-provider` and `sp1-prover`; neither it nor
`chacha20` is in the guest's graph.

### The real-proof rehearsal

One batch lifecycle on a fork of Sepolia, run from the audit commit's guest and
relay: a fresh `UsageCounter` and `FigaroBatchVerifier` deployed on the fork
with the key above, bound to Succinct's live Groth16 gateway; two Groth16
proofs made on a 16-core host, about six minutes each; both accepted. Read
from the chain afterwards: the bonds pulled at commit (4 units for a payment of
1), the attestation re-emitted, the buyer's net −1 and the seller's +1 after
resolution, the verifier holding nothing, the state root advanced twice from
the genesis root, the usage counted on the counter's own storage.

## External evaluation frameworks — where the surface stands

The published checklists an auditor or a reviewer applies to a protocol of this
shape, answered from the tree. Each answer names its evidence.

### The Rekt Test (Trail of Bits)

| # | Question | Answer | Evidence |
|---|---|---|---|
| 1 | Actors, roles, and privileges documented | Yes | The kernel has no privileged role. The two that exist above it, the florin deployer until `renounceDeployerMint` and `FigaroBatchVerifier` as `UsageCounter`'s sole writer, are in `CONTRACTS.md`. |
| 2 | External services, contracts, and oracles documented | Yes | § "Actors, privileges, and external dependencies" above: one table, with where each is bound and what it is trusted for. There is no oracle. |
| 3 | Written and tested incident-response plan | Written, not yet rehearsed | `SECURITY.md` § "Incident response": nothing can be paused or upgraded, so the procedure is disclosure, advisory, redeployment at a new address, and propagation of the deployment file. A Sepolia rehearsal of the redeploy leg is owed. |
| 4 | Best attack paths documented | Yes | `DESIGN_DECISIONS.md`, the public manual's sharp-edges page, § "Behaviors to surface" above. |
| 5 | Identity verification and background checks on employees | Not applicable | One maintainer. |
| 6 | A team member with security in their role | Yes | The maintainer. |
| 7 | Hardware security keys for production systems | Not in the tree | Operational, outside the repo. |
| 8 | Key management requiring multiple humans and physical steps | Largely dissolved | No admin key survives deployment. The one standing key is the DAO treasury multisig, upstream of the protocol. |
| 9 | Key invariants defined and tested on every commit | Yes | Pre-commit compiles the Solidity tree (`forge build`); the Foundry suite, Halmos, Slither and Semgrep run in CI on every push that changes the Solidity tree, and Clippy, Semgrep and the differential fuzz on every push that changes the prover; Certora, TLA+, Echidna and the Lean 4 equilibrium proof run in the gate. `VERIFICATION_MAP.md` maps each invariant to its test. |
| 10 | Best automated tools for discovering security issues | Yes | Certora, Halmos, Echidna, Mythril (`scripts/mythril-docker.sh`), Slither, Semgrep, `mewt`, `cargo-mutants`, Clippy, `cargo audit` (§ "Verification evidence" above). |
| 11 | External audits and a vulnerability-disclosure or bug-bounty programme | In progress | The first external audit is being arranged; this document is its handover. Disclosure channel and the florin-denominated bounty schedule, paid from the DAO treasury at mainnet, are in `SECURITY.md`. |
| 12 | Avenues for abusing users considered and mitigated | Yes | Buyer key loss, bad-faith withholding, and prompt injection against operator agents are documented; the policy signer (`@figaro-protocol/sdk/signer`) is the mitigation for the last. |

### Trail of Bits' code-maturity categories

Rated with Trail of Bits' published assessor (Building Secure Contracts,
code-maturity evaluation v0.1.0) on its four-step scale, from the tree alone;
the categories that rate a process rather than code are rated on what the tree
shows. The rubric is threshold-based: a category holds a tier only when every
criterion of that tier is met, so Auditing stays Moderate until the incident
plan has been rehearsed.

| Category | Rating | What holds it there |
|---|---|---|
| Arithmetic | Satisfactory | Checked math throughout, in both languages; one two-line `unchecked` block on `uint64` counters (`UsageCounter.sol:667-670`) carries no inline bound argument. |
| Auditing | Moderate | Events cover every state change (`renounceDeployerMint` excepted, documented). The watcher runs in CI and the incident procedure is written (`SECURITY.md` § Monitoring, § Incident response); a rehearsal of the redeploy leg is what Satisfactory still needs. |
| Access controls | Satisfactory | Two privileged relations, both immutable, documented, tested (§ "Actors"). |
| Complexity management | Satisfactory | The functions at or above the rubric's threshold of 11 are `commit` and `settleBatch` (§ "Conventions and measured complexity"), each justified there and in NatSpec; the naming convention is written; the only duplication is the documented mirrors, locked by vectors and fuzz. |
| Decentralization | Strong | No admin, pause, upgrade, or proxy; every parameter immutable; the direct path always open to a new process beside the batch path; the state behind the batch path's root is published by the relay that holds it (`GET /state`), so any party or a second relay can keep a copy and take over (Known limitation 7 states what remains); immutability proved in CVL. |
| Documentation | Satisfactory | Glossary, invariant map, design-decision catalogue, review goals, dense NatSpec; the stale comment referents listed under § "Known stale comments in the kernel". |
| Transaction ordering | Satisfactory | Route substitution closed by the Permit2 witness; registry front-running and reward capture accepted and priced; no oracle. |
| Low-level manipulation | Satisfactory | Assembly confined to four hash packers, mirrored by `abi.encodePacked` tests, differentially fuzzed against those mirrors, and pinned by Rust cross-language vectors. |
| Testing and verification | Satisfactory | Coverage above; every reachable revert branch in the Solidity has a test that asserts its error; mutation testing over every contract in scope and over the guest; three differential fuzz streams in CI. |

### The L2BEAT risk categories, applied to the batch path

| Risk | Posture | Evidence |
|---|---|---|
| State validation | Validity proof | `FigaroBatchVerifier.settleBatch` verifies an SP1 proof and checks every witness-spec binding against the live `ClauseRegistry`. |
| Data availability | Off-chain by design | The chain holds hashes; the parties hold the preimages. `DATA_LAYER.md` owns the seam. |
| Exit window | Immutable | No admin, no upgrade path, no pause, in every contract. A changed program is a new verifier under a new address. |
| Proposer failure | Direct path open to a new process; a batch-path process needs the state | The kernel needs no relay, and any new process can open on `FigaroCore`. A process opened on the batch path resolves only through a batch built on the state behind the verifier's root, which the relay publishes so another can take over (Known limitation 7). |
| Sequencer failure | Same | A batch-resolved process never acquires kernel status (`FigaroBatchVerifier.sol` NatSpec on designer rewards); the two resolution paths are disjoint, and `UsageCounter` bridges only the accrual. |

## Reading list

| Document | Purpose |
|---|---|
| `docs/DESIGN_DECISIONS.md` | The catalogued intentional patterns that look like vulnerabilities (read first; count them there, never quote a stored number) |
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

Use these commands as the release gate. Expected output means successful completion with exit code `0` and the stated pass criteria. This gate asserts pass/fail; the harness inventory (suite, file, property, and rule counts) is `TESTING.md`.

### Contracts

```bash
MAINNET_RPC_URL=<mainnet rpc> SEPOLIA_RPC_URL=<sepolia rpc> forge test --via-ir
```

Expected output:

- 0 failed
- 0 skipped — the release gate RUNS the three fork tests (the coordinator
  against mainnet's Permit2 and Sepolia's SwapRouter02); without the two
  variables those tests skip, which is a dev convenience, not a release
  posture. A public node serves both; CI's `fork` job uses one and fails on a
  skip.

### Halmos Symbolic Proofs

```bash
./scripts/test-halmos.sh
```

Prereqs (one-time): `brew install z3 && pipx install halmos`.

Expected output: `✅ All 32 Halmos properties proved (7 FigaroCore + 7 MembersRegistry + 6 UsageCounter + 6 ClauseRegistry + 6 AssemblyRegistry).` (exit code 0)

### Certora Formal Verification

```bash
export CERTORAKEY=<key>
CERTORA_WAIT=1 ./scripts/test-certora.sh
```

Expected output: all 6 specs green (FigaroCore, AttestationCoordinator,
TokenOpsVerification, FlorinToken, BatchVerifierTokenOps, RpgfMinter).
`CERTORA_WAIT=1` blocks until the cloud's verdict; without it the script only
dispatches. `Failed on rule_not_vacuous` alone is the vacuity heuristic, not a
rule failure — the results table is the authority. The script first checks
`certora/token-ops.inventory` against every token-moving call site and refuses
to run on a stale line.

### Echidna Fuzzing

```bash
./scripts/test-echidna.sh
```

Prereqs: `brew install echidna`.

Expected output: all properties hold on both harnesses (kernel + FlorinToken), exit code 0.

### TLA+ Model Checking

```bash
./scripts/test-tla.sh
```

Prereqs: Java 11+, `tla2tools.jar` in `formal/` (script header has the `curl`).

Expected output: all four models verify every invariant, TLC exit code 0.
(`ResolutionUniverses.cfg` ships both named assumptions TRUE; flipping either
to FALSE is a deliberate experiment that is EXPECTED to fail — not a gate
regression.)

### Rust

```bash
cd prover && cargo test --locked
```

Prereqs: Rust at the pin in `prover/rust-toolchain.toml`, and the SP1
toolchain at the release `prover/Cargo.lock` names (`sp1up --version`); three
of the five crates build the guest. Without SP1,
`cargo test --locked -p figaro-clause -p figaro-kernel` runs the guest's two
crates.

Expected output: 0 failed. Two tests are ignored by design: they read a fuzz
stream, and the next command runs them.

### Differential fuzz

```bash
./scripts/test-cross-impl-fuzz.sh            # a fresh seed
./scripts/test-cross-impl-fuzz.sh <seed>     # reproduce
```

Prereqs: Foundry, Rust, and the SDK's dependencies (`npm ci --workspace sdk`).

Expected output: `✅ The implementations agree on every operation, agreement
and clause case`, exit code 0.

### The guest and its key

```bash
scripts/prover-box/provision.sh      # once, on a fresh Ubuntu x86_64 host
scripts/prover-box/build-guest.sh
```

Expected output: the ELF's SHA-256 and `SP1_PROGRAM_VKEY`, equal to
§ "The guest and its verification key".

### SDK Tests

```bash
cd sdk && npx vitest run
```

Expected output: Vitest exits cleanly with no failing suites. The batch
end-to-end test (`sdk/tests/batch-e2e.test.ts`) needs a running Anvil and the
relay's release binary and skips without them; `prover-ci`'s `sp1` job runs it
with its skip turned into a failure.

### Frontend Type Check

```bash
cd frontend && npm run type-check
```

Expected output:

- TypeScript completes with no errors

### Frontend Production Build

```bash
cd frontend && npm run build
```

Expected output:

- Next.js production build completes successfully
- no hard build failures

### Frontend Unit And Integration Tests

```bash
cd frontend && npx vitest run
```

Expected output:

- Vitest exits cleanly with no failing suites

### Frontend Browser Validation

Devnet posture:

```bash
cd frontend && npm run test:e2e:devnet
```

Expected output:

- Anvil deployment verification passes first
- Playwright devnet project exits cleanly with no failing specs (the census is
  derived — `npx playwright test --list` — never a stored count)

High-value browser checks that must remain covered:

1. `/evidence-display` works under iframe-style embedding rules
2. handoff geolocation works under production-style headers
3. delivery-attestation geolocation works under production-style headers

## Frontend + SDK audit posture

The FE/SDK security audit — the contract audit's sibling: open-world places the
trust boundary in the client, a static export that renders permissionless,
attacker-authored network state and is the what-you-see-is-what-you-sign surface —
completed 2026-07-22 across eight domains: signing integrity, dispatch-race/RFQ
market formation, untrusted-content rendering, IPFS content-integrity, the
ECDH/XMTP coordination channel, client-side key material, app hardening + supply
chain, and the ecosystem-agent tier. All findings ruled and fixed with regressions.

Standing rule: a change that exposes a NEW client-side trust-boundary surface (a
new untrusted-content render path, a new signing path, a new coordination-channel
message type) warrants a scoped re-review against the eight domains — not a
re-freeze.

One part of the SDK is load-bearing for the audit's scope though outside it:
`@figaro-protocol/sdk/clauses` is the reference the guest's clause engine is
locked to. A reviewer of `prover/clause/` reads the two side by side.

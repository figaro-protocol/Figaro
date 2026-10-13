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
| Baseline commit | `00465c75` (§ "The baseline commit"); no tag names a commit under audit — one is placed when an audit is engaged |
| Languages in scope | Solidity (`src/`, three deploy scripts) and Rust (`prover/`, four crates) |
| Solidity in scope | 13 contract files, 3,142 lines; 3 deploy scripts, 846 lines |
| Rust in scope | 4 crates, 20 files, 7,394 lines under `src/` |
| Configuration in scope | `foundry.toml`, the `Cargo.toml` files and `Cargo.lock`, the Rust toolchain pin (§ "In scope — configuration") |
| Trusted, not reviewed | SP1 (the zkVM, its crates, its on-chain verifier gateway), OpenZeppelin Contracts, Permit2, Uniswap SwapRouter02 |
| Out of scope | mocks, fuzz harnesses, tests and formal specs, the proving harness crate, the Sepolia deploy script, `frontend/`, `sdk/` |
| Deployed | Sepolia only, at an earlier commit (§ "What is deployed"); nothing on mainnet |
| Upgrade path | none: no admin, no proxy, no pause, in any contract |

Lines are physical lines, comments and NatSpec included. Without comments and
blank lines the scope is 1,279 lines of contracts, 405 of deploy scripts and
5,147 of Rust.

## Repository and build

```bash
git clone --recurse-submodules https://github.com/figaro-protocol/Figaro.git
cd Figaro && git checkout 00465c7512e97138fb5814f395767c49dac5b88f
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
  An **assembly** is agreements composed into a reusable design, registered
  in `AssemblyRegistry`. A **designer** is the wallet that registers a clause
  or an assembly, under a registration stake.
- An **attestation** is a signed statement a party makes about an open order,
  bound by merkle proof to a section of the agreement: on the direct path
  through `AttestationCoordinator`, on the batch path inside the proof. A
  **witness spec** is the clause spec supplied to the proof as input; the
  verifier checks its hash against the registry's.
- A **member** is a wallet registered in `MembersRegistry` under a member
  stake with a withdrawal cooldown. A resolved order counts toward designer
  rewards only when its seller of record is a live-staked member.
- **Designer rewards.** `UsageCounter` scores each clause and assembly by use
  alone — c distinct processes, d distinct staked sellers, score
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
- `WitnessSwapAndCommitCoordinator` funds a commit through a Permit2 witness
  transfer and a Uniswap swap in the same transaction, then calls
  `FigaroCore.commit`.

## Scope

This section says what the audit reviews; § "The baseline commit" says at
which commit.

The audit covers two languages: the Solidity contracts in `src/`, and the Rust
workspace in `prover/` that the batch path runs on. **Both are in scope.**

### The batch path, component by component

The protocol resolves a process on one of two paths. The direct path is the
kernel, `FigaroCore`: two calls, `commit` and `resolveProcess`. The batch path
resolves many processes under one proof. The batch path has four parts; each
is named here once, with the other names the code and the documents use for
it:

| Part | Also called | Where | Language | Status |
|---|---|---|---|---|
| The on-chain verifier | the batch verifier | `src/core/verifier/FigaroBatchVerifier.sol`, `ISP1Verifier.sol` | Solidity | In scope |
| The proof program | the guest, the SP1 program, the Rust verifier, the prover, the kernel mirror | `prover/program/`, `prover/lib/`, `prover/clause/` | Rust | In scope |
| The relay | the sequencer | `prover/sequencer/` | Rust | In scope |
| SP1 | the zkVM, the verifier gateway | Succinct's crates and contracts; none of their source is in this repository | Rust, Solidity | Trusted dependency; the project's use of it is in scope |

No Rust code verifies a proof on chain. "The Rust verifier" names the proof
program: the Rust that decides what a valid proof proves.

### In scope — Solidity

| Directory / file | Contents | Lines |
|---|---|---|
| `src/core/kernel/` | `FigaroCore.sol`, `CommitmentTypes.sol` | 306, 53 |
| `src/core/attestation/` | `AttestationCoordinator.sol` | 209 |
| `src/core/verifier/` | `FigaroBatchVerifier.sol`, `ISP1Verifier.sol` | 596, 15 |
| `src/build/registries/` | `ClauseRegistry.sol`, `AssemblyRegistry.sol` | 211, 188 |
| `src/build/rewards/` | `UsageCounter.sol`, `RpgfMinter.sol` | 770, 253 |
| `src/build/florin/` | `FlorinToken.sol`, `IFlorinMinter.sol` | 83, 9 |
| `src/app/` | `MembersRegistry.sol`, `WitnessSwapAndCommitCoordinator.sol` | 210, 239 |
| `script/Deploy.s.sol` | Devnet deploy (defines the devnet surface) | 435 |
| `script/DeployMainnet.s.sol` | Mainnet deploy (defines the audited mainnet surface; deploys the swap coordinator) | 353 |
| `script/DeploySwapCoordinator.s.sol` | The swap coordinator alone onto a LIVE stack | 58 |

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
- `frontend/`, `sdk/` — the client, reviewed separately. One part of the SDK
  is load-bearing for this scope though outside it: `@figaro-protocol/sdk/clauses`
  is the reference the guest's clause engine is locked to, and a reviewer of
  `prover/clause/` reads the two side by side.

## The baseline commit

**Every figure in this document stands for the code at commit
`00465c7512e97138fb5814f395767c49dac5b88f`**, the baseline, which covers the
whole scope, Solidity and Rust together. A figure is measured at the baseline,
or at a commit whose in-scope code equals the baseline's once comments and
NatSpec are stripped — the comparison `scripts/frozen-scope.sh` makes — and a
figure measured elsewhere names its commit. No external audit has been
engaged, so no tag names a commit under audit; when one is engaged, a tag is
placed at the commit it reviews and this section names it.

```bash
git show --no-patch 00465c75
```

The baseline differs from `f62b71cf` in `prover/Cargo.lock` alone: one crate
outside the guest's graph, `quinn-proto`, moved from 0.11.17 to 0.11.18 for
three RustSec advisories, and `prover/.cargo/audit.toml` sets one advisory
aside (§ "Static analysis"). The Solidity, the deploy scripts and the Rust
sources are equal between the two commits, so the Solidity rows, the Certora
reports and the mutation runs stand at `f62b71cf`, named where they appear;
the Rust rows were re-run at the baseline.

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

### The kernel

The kernel — `FigaroCore.sol` and `CommitmentTypes.sol` — last changed in
CODE at `c7f85d0d`. Since then the two files moved directory and comment
lines changed in place; their code is byte-identical to the baseline. The
diff prints as two renames whose every hunk is a comment:

```bash
git diff -M c7f85d0d 00465c75 -- src/kernel/ src/core/kernel/
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
`prover/Cargo.lock`. The build of record is the `Sequencer Release` workflow's
docker build at tag `v0.2.0` (commit `8eaf1c56`, run 37504308141), which
printed this hash and this key and checked the key against the Sepolia
record. The guest at the baseline differs from that commit's guest in four
comment lines of `prover/lib/src/types.rs`, replaced in place; an in-place
comment edit does not change the ELF (measured: the same hash before and
after one), and `prover/Cargo.lock` at the baseline moves one crate outside
the guest's graph (`cargo tree -p figaro-prover --locked` lists the same 189
crates at both), so the baseline's guest is that build's. The ELF does not reproduce across operating systems,
so the image's build is the one that counts. The relay derives the key from
the guest it embeds (`sequencer --vkey`) and refuses to start when the deployed
`programVKey()` differs.

### What is deployed

Nothing is deployed on mainnet.

Sepolia carries a full stack, recorded in `deployments/11155111.json`. Its
batch verifier and usage counter were deployed as a pair at `a4a34e91`; the
verifier carries the baseline's checks (`MAX_BATCH_STALENESS` 3600,
`PUBLIC_VALUES_LENGTH` 288, read from the chain) and pins the canonical
guest's key (§ "The guest and its verification key"). A redeploy of the batch
path is the two together, since each holds the other's address as an
immutable. The other contracts are an earlier commit's; the coordinator keeps
`attestViaResolver` (selector `0x3ef7b1fb`, present in its bytecode): no
contract has an upgrade path. The tree's SDK no longer encodes that call,
and the Sepolia signer policy (`deployments/signer-policy.11155111.json`) no
longer lists the selector, so the policy signer does not sign it. `RpgfMinter` on Sepolia stays bound
to the first counter: `FlorinToken.registerMinter` was renounced there with
the cap fully allocated, so no second minter can be registered. Mainnet
deploys every contract once, from `DeployMainnet.s.sol`, and has no such seam.

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

Every actor and what it alone can do. The kernel has no privileged role: `commit`
never reads `msg.sender`, and `resolveProcess` is gated by presence
(`msg.sender == rootBuyer`), not by a role.

| Actor | Can | Cannot |
|---|---|---|
| Buyer | sign an order; call `resolveProcess` on its own process; sign the batch path's resolve authorization; attest on its own orders | resolve a process it did not open; resolve one order of a process |
| Seller of record | sign an order; attest on its own orders | move any bond; resolve |
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

### Parameters

The constants and constructor arguments the mainnet deploy fixes
(`script/DeployMainnet.s.sol`); every one is immutable once deployed.

| Parameter | Value | Where |
|---|---|---|
| Bond multiple | 2× payment (buyer), 2× cumulative value (seller) | `FigaroCore.sol:208-209` |
| `MAX_BATCH_STALENESS` | 1 hour: the batch timestamp may trail the block by this much (accepted risk 4) | `FigaroBatchVerifier.sol:98` |
| `PUBLIC_VALUES_LENGTH` | 288 bytes, nine words; any other length is refused by name | `FigaroBatchVerifier.sol:103` |
| `MAX_BATCH_OPS` | the relay's batch cap, 100 by default; an operator's environment variable | `prover/sequencer/src/main.rs:121` |
| Re-queue bound | an operation re-queued after a transient submission failure is re-queued at most three times, then dead-lettered | `prover/sequencer/README.md` |
| Clause and assembly registration stake | 0.05 ETH per registration, no cooldown, withdrawable once; the binding stays | `DeployMainnet.s.sol:157`, `:164` |
| Member stake | 0.05 ETH, 28-day withdrawal cooldown | `DeployMainnet.s.sol:197` |
| Minimum-support floor | 3 distinct staked sellers before a clause or assembly scores | `DeployMainnet.s.sol:269` |
| Reward periods | nine annual periods from `RPGF_GENESIS` | `DeployMainnet.s.sol:246-248` |
| Period budgets | 45M, 45M, 60M, 60M, 60M, 82.5M, 82.5M, 82.5M, 82.5M florins: 600M, the `RpgfMinter` cap | `DeployMainnet.s.sol:291-299` |
| Florin supply | 1B cap; at genesis 70M to the founders' wallet, 30M to the supporters' wallet, 300M to the DAO treasury, and the 600M minter registered; the deployer's minting renounced in the same broadcast | `FlorinToken.sol:26`, `DeployMainnet.s.sol:63-66` |

### Entry points

Every external state-changing function in scope and who may call it. View
and pure functions are omitted.

| Contract | Function | Who may call |
|---|---|---|
| `FigaroCore` | `commit` | anyone carrying both parties' signatures; the bonds are pulled from the signers, the gas is the caller's |
| `FigaroCore` | `resolveProcess` | the process's `rootBuyer`, over every active order |
| `AttestationCoordinator` | `attestAsSeller` | the seller named in a committed order of the same process (`msg.sender == role.seller`) |
| `AttestationCoordinator` | `attestAsBuyer` | the order's buyer (`msg.sender == target.buyer`) |
| `FigaroBatchVerifier` | `settleBatch` | anyone, with a valid proof over the current state root |
| `ClauseRegistry` | `registerClause` | anyone, with the registration stake; first write wins |
| `ClauseRegistry` | `withdrawDeposit` | the registrant |
| `ClauseRegistry` | `setMechanismClause` | any contract; emits an event, writes nothing |
| `AssemblyRegistry` | `registerAssembly` | anyone, with the registration stake; first write wins |
| `AssemblyRegistry` | `withdrawDeposit` | the registrant |
| `UsageCounter` | `recordClauseUsage`, `recordAssemblyUsage` | anyone, with a merkle proof over a resolved direct-path order |
| `UsageCounter` | `applyBatchAccrual` | `FigaroBatchVerifier` only, immutable |
| `RpgfMinter` | `claim` | the designer of record of every key it passes, once per closed period |
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
| K-6 | Resolution is a direct ERC-20 transfer; the kernel keeps no internal ledger |
| K-7 | A process is bound to one token at its root order |
| K-8 | Both parties' EIP-712 signatures are verified on every commit |
| K-9 | An order's hash is content-addressed: `keccak256(processId ‖ structHash)` |
| A-7 | A fee-on-transfer token is rejected at the pull |
| A-8 | The kernel holds exactly the bonds of its committed orders |
| A-9 | Resolution moves exactly the payment from buyer to seller and returns both bonds whole |
| A-10 | Every committed order is bound to its process once, at commit |
| E-1 | Only the role-holder named in a committed order attests on it |
| E-2 | A registered clause or assembly is never overwritten |
| E-6 | The florin's supply never exceeds one billion |
| E-7 | Batch-resolved trade counts toward designer rewards once; the two paths share no state |
| E-9 | Every persistent effect of `settleBatch` is bound by a public value the proof commits to |

## Review goals

Where the project asks the review to spend its hours, in the order of the
doubt it holds.

**Worst case.** Locked bonds lost or moved through a defect rather than through
the documented by-design cases: a resolution by anyone but the buyer, a bond
that leaves the kernel other than at resolution, or a batch resolution the
direct path would have refused.

**Areas of concern, in order.**

1. Any path by which the payoff table the equilibrium rests on can be altered:
   signature or domain-separator replay, accumulator manipulation, reentrancy
   through the token, an order that resolves a process it does not belong to.
   The kernel is about 200 SLOC; its verification layers are listed in
   § "Verification evidence". The items below are what composes with it.
2. The batch path's seam between languages. `FigaroBatchVerifier.settleBatch`
   is the largest function in scope, and the guest decides what it moves: a
   forged or mis-bound proof accepted by the verifier, a clause-hash binding
   that diverges from the registry, public values the guest commits that the
   kernel would have refused, the one privileged writer (the verifier into
   `UsageCounter`) doing more than accrue, and the off-chain state the root
   commits to (Known limitation 6). Every defect the project found itself sat
   on a seam between two implementations of one rule (§ "What the project's
   own verification found").
3. The reward and stake economics: reward inflation or Sybil accrual through
   `UsageCounter` and `RpgfMinter`; stake accounting in the registries'
   withdrawal paths.
4. Token-boundary behaviour: the Permit2 witness digest and SwapRouter02 call in
   `WitnessSwapAndCommitCoordinator`, and non-standard ERC-20s beyond the
   fee-on-transfer rejection.
5. The clause engine: a spec or a content the guest reads differently from
   the SDK's engine (`@figaro-protocol/sdk/clauses`), and the witness gates the
   mirror enforces — spec-identity substitution, content-hash mismatch,
   inclusion failure, attest-after-resolve — agreeing with
   `AttestationCoordinator` and the kernel.
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
   (`DESIGN_DECISIONS.md` #22) — replayable to any effect?
9. Can one client stall the relay, or exhaust its re-queue, at a cost below its
   own rate-limit budget?

## What the project's own verification found

The project's three differential fuzz streams, its mutation testing over the
Rust, and its real-proof rehearsal found nine defects. None is in the
kernel: eight are two implementations of one rule disagreeing, corrected to
the reference implementation named in the row, and one is a publication the
relay's readers did not read. All are fixed at the baseline commit, each with
the test that found it. They are listed because they show where this codebase
breaks: at the seams.

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
- The kernel has an unreachable `expectedCumulativeValue ∈ (max/3, max/2]` window (above max/2 the seller's
  bond overflows at commit; the window itself cannot be reached while the
  token keeps the Core's balance, since the process's bonds already in it total
  at least four times the value). The mirror reports the same window as `Overflow`.
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
  allowance before it submits (`prover/sequencer/src/submitter.rs`), and a batch
  a mid-flight revocation reverts is re-run without the revoker (Known
  limitation 3).
- The kernel recovers ECDSA signers (`ECDSA.recover` in `commit()`), so a
  smart-contract wallet (multisig) cannot be a kernel party directly; it transacts
  through an EOA it controls, and whoever holds that key acts for it
  (`FigaroCore.sol:238-240`).
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
- The coordinator has two entry points, `attestAsSeller` and `attestAsBuyer`:
  a party attests for itself, from its own address; a seller's own EIP-7702
  code files through `attestAsSeller`. No caller files for another address.
  `test_attestViaResolver_selectorIsNotDispatched`
  (`test/core/attestation/AttestationCoordinatorTest.t.sol`) holds that a
  low-level call carrying selector `0x3ef7b1fb` against a committed order does
  not succeed; the batch path's `KernelOp` carries only the two. The Sepolia
  coordinator predates this (§ "What is deployed").

**The relay**, each behaviour with the test that holds it
(`prover/sequencer/tests/sequencer.rs` unless named otherwise):

- A submission's identity in the mempool covers every input the proof or the
  verifier judges and admission does not: the signer, the order list, the role
  order and the witness spec bytes. A stranger's resolve for an open process,
  a buyer's signature replayed over another order list, a seller attestation
  under another role order, or an attestation copied with other spec bytes
  cannot take the party's own slot (`mempool.rs`, `op_key`; the five
  `mempool_*` slot tests).
- A batch takes at most `MAX_BATCH_OPS` operations, oldest first
  (`mempool.rs`, `drain_up_to`;
  `mempool_drains_at_most_the_batch_cap_and_keeps_the_rest_queued`).
- The batch's timestamp is the latest block's, read before anything is drained
  (`submitter.rs`, `read_chain_timestamp`; `sdk/tests/batch-e2e.test.ts`
  proves against Anvil's clock). The verifier's one-hour staleness bound is
  accepted risk 4.
- A wallet's balance and allowance are read once and allocated across the
  batch's commits in order, so several commits from one wallet cannot pass
  singly and revert `settleBatch` as a sum (`submitter.rs`,
  `allocate_funding`, `filter_funded_commits`;
  `funding_is_allocated_across_a_wallets_commits_in_order`).
- An attestation's witness spec is checked against
  `ClauseRegistry.contentHashOf`, read from the verifier's own registry,
  before proving; one that fails is dropped alone, since the verifier would
  revert the whole batch on it (`submitter.rs`, `attestation_spec`,
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
  `x-figaro-state-root` header, so a party or a second relay fetches a copy,
  recomputes its root against the verifier's, and starts on it
  (`api.rs`, `get_state`;
  `api_state_route_serves_the_state_another_relay_starts_on`). A served state
  is never written over a state file unchecked: `formal/RelayState.tla`
  (`TakeoverChecksRoot`) shows a stale served state overwriting the only copy.
  Known limitation 6 states what remains.

### Measured complexity

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

## Accepted risks

Current design realities accepted by the protocol surface, not accidental defects:

1. buyer key loss is terminal for an active process because the kernel has no timeout or admin recovery path
2. very large processes are gas-bounded, so institution design should compose across processes instead of pushing single-process fanout toward the ceiling
3. fee-on-transfer tokens are unsupported by design and are rejected explicitly by the kernel; rebasing tokens are unsupported and NOT detected (`_pullExact` sees only the delta inside its own transfer call — `DESIGN_DECISIONS.md` #10 states the consequence); a token with an issuer blocklist holds any process a blocked party sits in until the issuer relents, since resolution is atomic (`WeirdTokenTest`; the same entry)
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
   The relay has its 79 integration tests, 13 unit tests and the batch
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
   receipts against the deployed kernel (resolve ~73,000 + ~29,800·N;
   sub-order commit 382,032, root 793,549 — `sdk/src/gasCeilings.ts` carries
   the provenance); the batch verifier's ~26.5k/position and its ~1,130-position
   ceiling are still pre-fork figures, re-derived when enough post-fork
   `settleBatch` receipts accumulate (three stand so far).
5. **The incident procedure's redeploy leg is rehearsed on Sepolia; the full
   procedure is not.** The counter↔verifier pair was redeployed on live
   Sepolia from a clean worktree at `a4a34e91` — fork rehearsal first,
   then the broadcast, the record update, and the deployment check with
   via-IR artifacts at that commit. The chain's post-fork gas repricing
   (~6.8× on these deploys) needs forge's gas estimator multiplied past its
   default. The disclosure and advisory legs remain unrehearsed.
6. **The state behind the verifier's root lives off chain.** The verifier
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

## Verification evidence

Every figure in this section was measured at the baseline, or at `f62b71cf`
where the row's inputs are equal between the two commits (§ "The baseline
commit" states which rows those are and the rule for a figure that names
another commit).
Which invariant each layer carries is `VERIFICATION_MAP.md`; the inventory of
tests is `TESTING.md`.

### The gate

| Layer | Result |
|---|---|
| Foundry, the three fork tests included (mainnet's Permit2, Sepolia's SwapRouter02) | 340 passed, 0 failed, 0 skipped |
| Halmos | 32 of 32 properties proved |
| Certora | 7 of 7 specs, every rule verified |
| Echidna | 15 properties, every one held on both harnesses |
| TLA+ | 5 models, 55 invariants, no error; `FigaroCore` 8,380,329 states generated, 6,087,113 distinct; `RelayState` (the relay's state lifecycle, 7 invariants + 1 action property) 10,837,227 generated, 1,959,944 distinct; the models' defect switches are their mutation checks (`TESTING.md` § TLA+) |
| Rust (`cargo test`, five crates) | 213 passed, 0 failed; 2 ignored by design, run by the fuzz script |
| Differential fuzz | one round at seed 1791814782, no divergence: 400 kernel operations (290 accepted, 110 rejected, 103 processes), the agreement vectors, 6,208 clause cases (1,719 encoded byte-for-byte, 3,225 rejected, 1,264 specs refused); CI runs four rounds on every push |
| SDK (Vitest) | 922 passed |
| Batch end-to-end (SDK → relay → verifier) | passed |

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
over the eleven contracts in scope that hold code:

| | Lines | Statements | Branches | Functions |
|---|---|---|---|---|
| In scope | 99.81% (527/528) | 99.44% (707/711) | 97.04% (131/135) | 100% (66/66) |
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
return-default), one run and one database per contract, each against the
test files that cover it, the gas-anchor tests excluded so a catch means
behaviour. The test command for each run is
`forge test --no-match-test test_Gas_ --match-path '<paths>'` with:

| Contract | Test paths |
|---|---|
| `FigaroCore.sol` | `test/core/kernel/*.t.sol`, `test/ReentrancyAdversarialTest.t.sol` |
| `CommitmentTypes.sol` | `test/core/kernel/*.t.sol` |
| `AttestationCoordinator.sol` | `test/core/attestation/*.t.sol`, `test/script/DeployWiringTest.t.sol` |
| `FigaroBatchVerifier.sol` | `test/core/verifier/*.t.sol`, `test/ReentrancyAdversarialTest.t.sol`, `test/build/rewards/*.t.sol` |
| `ClauseRegistry.sol`, `AssemblyRegistry.sol` | `test/build/registries/*.t.sol`, `test/build/rewards/*.t.sol` |
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

The eight survivors, each read against the source:

| Contract, line | Mutation | Why no test can tell |
|---|---|---|
| `FigaroCore.sol:204`, two mutants | Remove or disable the `DuplicateCommitment` guard | Every replay is refused earlier: a repeated root by `ProcessAlreadyExists`, a repeated extension by `CumulativeValueMismatch`, since the accumulator has moved. `FigaroCoreRevertBranchTest` pins each preempting error |
| `FigaroCore.sol:288` | Disable the `CumulativeValueOverflow` guard | An order with such a value cannot be committed while the token keeps the Core's balance: the process's bonds already in it total at least four times the value (§ "Behaviors to surface") |
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

One batch lifecycle on a fork of Sepolia, run from the baseline commit's guest and
relay: a fresh `UsageCounter` and `FigaroBatchVerifier` deployed on the fork
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
| `./scripts/test-halmos.sh` | `✅ All 32 Halmos properties proved (7 FigaroCore + 7 MembersRegistry + 6 UsageCounter + 6 ClauseRegistry + 6 AssemblyRegistry).` |
| `CERTORAKEY=<key> CERTORA_WAIT=1 ./scripts/test-certora.sh` | all 6 specs green (FigaroCore, AttestationCoordinator, TokenOpsVerification, FlorinToken, BatchVerifierTokenOps, RpgfMinter). `CERTORA_WAIT=1` blocks until the cloud's verdict; without it the script only dispatches. `Failed on rule_not_vacuous` alone is the vacuity heuristic, not a rule failure; the results table is the authority. The script first checks `certora/token-ops.inventory` against every token-moving call site and refuses to run on a stale line |
| `./scripts/test-echidna.sh` | every property holds on both harnesses (kernel + FlorinToken) |
| `./scripts/test-tla.sh` | all five models verify every invariant, TLC exit 0. `ResolutionUniverses.cfg` ships both named assumptions TRUE; flipping either to FALSE is a deliberate experiment that is EXPECTED to fail, not a gate regression |
| `(cd formal/lean && lake build)` | the equilibrium proof builds with no error (`TESTING.md` § "Lean 4") |
| `cd prover && cargo test --locked` | 0 failed; two tests ignored by design (they read a fuzz stream; the next row runs them). Needs Rust at the pin in `prover/rust-toolchain.toml` and the SP1 toolchain at the release `prover/Cargo.lock` names (`sp1up --version`); without SP1, `cargo test --locked -p figaro-clause -p figaro-kernel` runs the guest's two crates |
| `./scripts/test-cross-impl-fuzz.sh [seed]` | `✅ The implementations agree on every operation, agreement and clause case`; a fresh seed without the argument, the same seed to reproduce. Needs Foundry, Rust and the SDK's dependencies (`npm ci --workspace sdk`) |
| `scripts/prover-box/provision.sh` once on a fresh Ubuntu x86_64 host, then `scripts/prover-box/build-guest.sh` | the ELF's SHA-256 and `SP1_PROGRAM_VKEY`, equal to § "The guest and its verification key" |
| `cd sdk && npx vitest run` | no failing suite. `sdk/tests/batch-e2e.test.ts` needs a running Anvil and the relay's release binary and skips without them; `prover-ci`'s `sp1` job runs it with its skip turned into a failure |

# External Audit Handover

The package for an audit of Figaro's on-chain contracts and the proof
apparatus beside them: what is in scope, how to build and test it, who can do
what, which properties the review is asked to break, what is accepted, and the
evidence. The project wrote it; where it states a judgment, the judgment is the
project's, and the review's is its own. `docs/DESIGN_DECISIONS.md` catalogues
the patterns that look like vulnerabilities and are intended: read it first.

## At a glance

| | |
|---|---|
| Repository | https://github.com/figaro-protocol/Figaro |
| Baseline commit | none: no audit is engaged (§ "The baseline commit") |
| Languages in scope | Solidity (`src/`, three deploy scripts) and Rust (`prover/`, four crates) |
| Solidity in scope | 14 contract files, 1,598 lines of code (3,850 physical); 3 deploy scripts, 398 lines of code (842 physical) |
| Rust in scope | 4 crates, 23 files under `src/`, 7,032 lines of code (9,985 physical) net of their inline test modules |
| Configuration in scope | `foundry.toml`, the `Cargo.toml` files and `Cargo.lock`, the Rust toolchain pin (§ "In scope — configuration") |
| Trusted, not reviewed | SP1 (the zkVM, its crates, the routed on-chain verifier), OpenZeppelin Contracts, Permit2, Uniswap SwapRouter02 |
| Out of scope | mocks, fuzz harnesses, tests and formal specs, the proving harness crate, the testnet scripts, `frontend/`, `sdk/` |
| Deployed | Sepolia only (`deployments/11155111.json`); nothing on mainnet |
| Upgrade path | none: no admin, no proxy, no pause, in any contract |

Lines of code are counted with comments, NatSpec and blank lines removed;
physical lines count every line of the file. The Rust files carry
`#[cfg(test)]` modules, out of scope like every test, and the Rust figures
leave them out. Both rows are the tree's at every commit.

### The baseline commit

No audit is engaged, so no commit is under audit. When one is, this section
names the commit it reviews, every bench in § "Verification evidence" is run
there once, and a tag is placed at it. Until then each figure in this document
stands at the revision its row names, and for that revision alone. Whether a
change from one revision to another moves the scope's code is
`scripts/frozen-scope.sh` `gate_layers`: "full gate" when a scope file's code,
comments stripped, or a build configuration moved; "quick layers only"
otherwise. NatSpec enters the compiler's metadata (`foundry.toml` sets no
`bytecode_hash`), so a review builds at the commit it reviews.

## Scope

Figaro resolves a process on one of two paths. The **direct path** is
`FigaroCore`: `commit` and `resolveProcess`. The **batch path** resolves many
processes under one SP1 proof, in four parts:

| Part | Also called | Where | Status |
|---|---|---|---|
| The on-chain verifier | the batch verifier | `src/core/verifier/` | In scope |
| The proof program | the guest; the mirror of `FigaroCore` and the clause engine | `prover/program/`, `prover/lib/`, `prover/clause/` | In scope |
| The relay | the sequencer | `prover/sequencer/` | In scope |
| SP1 | the zkVM, the routed verifier contract | Succinct's crates and contracts | Trusted; the project's use of it is in scope |

### In scope — Solidity

| Directory / file | Contents | Lines of code (physical) |
|---|---|---|
| `src/core/kernel/` | `FigaroCore.sol`, `CommitmentTypes.sol` | 164 (306), 36 (67) |
| `src/core/attestation/` | `AttestationCoordinator.sol` | 77 (197) |
| `src/core/verifier/` | `FigaroBatchVerifier.sol`, `ISP1Verifier.sol` | 497 (903), 7 (23) |
| `src/build/registries/` | `ClauseRegistry.sol`, `AgreementRegistry.sol`, `AssemblyRegistry.sol` | 49 (196), 53 (202), 47 (189) |
| `src/build/rewards/` | `UsageCounter.sol`, `RpgfMinter.sol` | 296 (884), 147 (344) |
| `src/build/florin/` | `FlorinToken.sol`, `IFlorinMinter.sol` | 51 (83), 4 (9) |
| `src/app/` | `MembersRegistry.sol`, `WitnessSwapAndCommitCoordinator.sol` | 60 (210), 110 (239) |
| `script/Deploy.s.sol` | The devnet deploy | 198 (435) |
| `script/DeployMainnet.s.sol` | The mainnet deploy: the audited mainnet surface | 169 (349) |
| `script/DeploySwapCoordinator.s.sol` | The swap coordinator alone, onto a live stack | 31 (58) |

### In scope — Rust

`prover/` is one Cargo workspace of five crates (`prover/README.md`); four are
in scope.

| Crate | Package | Files, lines of code (physical) | What it is | What a defect costs |
|---|---|---|---|---|
| `prover/program/` | `figaro-prover` | 1, 9 (13) | The guest's entry point: reads the batch input, runs the mirror, commits the public values | A batch the chain resolves wrongly |
| `prover/lib/` | `figaro-kernel` | 7, 1,558 (2,472) | The mirror of `FigaroCore`'s commit and resolve, the witness gates, the operation stream, the public values, the state root, the usage claims | A batch the chain resolves wrongly |
| `prover/clause/` | `figaro-clause` | 4, 1,588 (1,939) | The generic clause engine: parses any clause spec supplied as witness input, validates content against it, encodes it | An attestation the batch path reads differently from the party who signed it |
| `prover/sequencer/` | `figaro-sequencer` | 11, 3,877 (5,561) | The relay: admits signed operations, forms batches, proves them, calls `settleBatch`, rebuilds its state from the chain | Liveness and griefing |

The figures count the files under each crate's `src/`, net of their inline
test modules.

### In scope — configuration

| File | What it decides |
|---|---|
| `foundry.toml` | Compiler version (0.8.26), EVM version (cancun), optimizer (200 runs), remappings, the files a test may read and write |
| `scripts/deploy-mainnet.sh` | The mainnet deploy's guards, and `--via-ir`, the pipeline the deployed bytecode is compiled with |
| `scripts/check-sp1-gateway-route.sh` | The deploy-time lookup of the SP1 verifier Succinct's gateway routes, which the batch verifier binds (never the gateway) |
| `prover/Cargo.toml` | The workspace; `[patch.crates-io]` routes the guest's signature recovery through SP1's patched `k256` |
| `prover/Cargo.lock` | Every Rust dependency's exact version, SP1's among them; the verification key is a function of it |
| `prover/rust-toolchain.toml` | The Rust release (1.93.0) the guest and the relay are built with |
| `prover/lib/Cargo.toml`, `prover/clause/Cargo.toml` | The guest's dependencies; `serde_json`'s `float_roundtrip`, without which a number written with a fraction is read inexactly |
| `prover/program/Cargo.toml`, `prover/sequencer/Cargo.toml`, `prover/sequencer/build.rs` | The guest's and the relay's dependencies; the build step that compiles the guest the relay embeds |

### Trusted, not reviewed

SP1 is trusted for one property: a proof accepted under `programVKey` came from
the program with that key. Its use is in scope: `ISP1Verifier.sol`, the one
`verifyProof` call in `settleBatch`, the guest's SP1 calls
(`prover/program/src/main.rs`), the patched `k256`, `ecdsa` and `rfc6979` the
guest recovers signers with (`prover/Cargo.lock`), the relay's proving calls
(`prover/sequencer/src/prover.rs`) and the route lookup at deploy. The other
dependencies are in § "Actors, privileges and external dependencies".

### The guest and its verification key

The verification key is a function of the guest's bytes. A changed guest is a
new key, and a new key is a new `FigaroBatchVerifier` at a new address. The
guest that counts is built inside SP1's image (`scripts/prover-box/provision.sh`,
then `scripts/prover-box/build-guest.sh`), since the ELF does not reproduce
across operating systems; the relay derives the key from the guest it embeds
(`sequencer --vkey`) and refuses to start when the deployed `programVKey()`
differs.

### Out of scope

- `src/mocks/`, `src/echidna/`: test doubles and fuzzing harnesses, never deployed to mainnet
- `test/`, `certora/`, `formal/`: the verification harnesses, evidence for the audit, not its subject
- `prover/script/`: the host-side proving harness, the fifth crate
- `script/DeploySepolia.s.sol`, `script/DeploySepoliaPair.s.sol`, `script/MintTokens.s.sol`: testnet and devnet scripts
- `frontend/`, `sdk/`: the client. One part of the SDK bears on this scope: `@figaro-protocol/sdk/clauses` is the reference the guest's clause engine is held to, and a reviewer of `prover/clause/` reads the two side by side.

### Change policy

A change to a path in scope is:

1. Scoped to a finding or an accepted-risk item, and recorded with it
2. Written test-first, and reviewed by someone other than its writer
3. Followed by the gate (§ "Validation commands — the verification gate"): every layer, the formal suites included, when `gate_layers` says "full gate" (a signature change silently orphans a CVL spec that calls it); the quick layers otherwise
4. For the guest: followed by a rebuilt guest, a re-derived key and a verifier deployed with it
5. Followed, in the same change, by this document: its descriptive sections, its line counts, and each evidence row re-measured, with the revision it was measured at

A change to `test/`, `frontend/` or `sdk/` needs no re-audit unless it exposes
new on-chain surface.

## Build and validation commands

### Build

```bash
git clone --recurse-submodules https://github.com/figaro-protocol/Figaro.git
cd Figaro && git checkout <the commit under review>
foundryup --version v1.5.1
forge build --via-ir                 # the pipeline the deployed bytecode is compiled with
cd prover && cargo build --locked    # Rust at prover/rust-toolchain.toml; SP1's toolchain (sp1up) at the release Cargo.lock names
```

Without the SP1 toolchain, `cargo build --locked -p figaro-clause -p figaro-kernel`
builds the guest's two crates; the relay and the program embed the guest and
need it. The default profile compiles the legacy pipeline (coverage, the
pre-commit hook, the mutation runs); the deployed bytecode is the IR pipeline's.

### Validation commands — the verification gate

The gate is every row at exit code 0 with the stated result. Prerequisites
and environment: `docs/LOCAL_DEV.md` § "Commands"; the harness inventory:
`docs/TESTING.md`.

| Command | Expected |
|---|---|
| `MAINNET_RPC_URL=<rpc> SEPOLIA_RPC_URL=<rpc> forge test --via-ir` | 0 failed, 0 skipped (without the URLs the three fork tests, against mainnet's Permit2 and Sepolia's SwapRouter02, skip) |
| `./scripts/test-halmos.sh` | `✅ All 41 Halmos properties proved (7 FigaroCore + 7 MembersRegistry + 9 UsageCounter + 6 ClauseRegistry + 6 AssemblyRegistry + 6 AgreementRegistry).` |
| `CERTORAKEY=<key> CERTORA_WAIT=1 ./scripts/test-certora.sh` | all 8 specs green; the results table is the authority (`Failed on rule_not_vacuous` alone is the vacuity heuristic). The script first checks `certora/token-ops.inventory` against every token-moving call site |
| `./scripts/test-echidna.sh` | every property holds on both harnesses (Core, FlorinToken) |
| `./scripts/test-tla.sh` | all five models verify every invariant, TLC exit 0 (`ResolutionUniverses.cfg`'s two named assumptions set FALSE is an experiment expected to fail) |
| `(cd formal/lean && lake build)` | the equilibrium proof builds with no error |
| `cd prover && cargo test --locked` | 0 failed; the tests ignored by design read a fuzz stream and run in the next row. Without SP1, `cargo test --locked -p figaro-clause -p figaro-kernel` runs the guest's two crates |
| `./scripts/test-cross-impl-fuzz.sh [seed]` | `✅ The implementations agree on every operation, agreement and clause case`; the same seed reproduces a run |
| `scripts/prover-box/build-guest.sh` on a host prepared by `scripts/prover-box/provision.sh` | the ELF's SHA-256 and the verification key |
| `cd sdk && npx vitest run` | no failing suite; `sdk/tests/batch-e2e.test.ts` needs a running Anvil and the relay's release binary |

## The system on one page

Figaro is a bonded-commitment protocol: two parties who have never met trade
under a contract whose performance and resolution are each party's best reply,
with no arbitrator, no timeout and no administrator. `docs/LEXICON.md` defines
every noun; the ones this document uses:

- A **process** is one buyer's run of a trade: its **orders**, resolved together. An order is one buyer–seller commitment, an EIP-712 struct (`CommitmentTypes.Commitment`) both parties sign off-chain and anyone may submit. The **buyer** (`rootBuyer`, the same wallet in every order of a process) pays and is the only party who can resolve; a **seller** adds value in one order.
- **Payment** P_i is what order i moves from buyer to seller. **Cumulative value** G_i (`expectedCumulativeValue`) is the total payment through order i; each later order extends the process's accumulator by exactly its payment.
- `commit` pulls the **bonds** into `FigaroCore` in the process's one ERC-20: the buyer 2·P_i, the seller 2·G_i. **Resolution** is one call by the buyer over every active order: each seller receives 2·G_i + P_i and the buyer P_i per order, every payment made and every bond refunded, atomically. Nothing else moves a bond.
- A **clause** is a reusable term, registered in `ClauseRegistry` under the keccak256 of its spec's canonical bytes. An **agreement** is the clauses composed for one order, every field filled; its merkle root is the commitment's `checkoutHash`. A **registered agreement** (`AgreementRegistry`) and an **assembly** (`AssemblyRegistry`, a merkle root over registered agreements) are value-free designs. A **designer** registers any of the three under a stake.
- An **attestation** is a party's signed statement about a clause of its own open order, bound by merkle proof to the agreement: through `AttestationCoordinator` on the direct path, inside the proof on the batch path, hash-only by default or with the spec and content in plaintext at the party's choice.
- A **member** is a wallet staked in `MembersRegistry`, with a withdrawal cooldown. **Designer rewards**: `UsageCounter` scores each clause, registered agreement and assembly by use alone (c distinct processes, d distinct staked sellers, `icbrt(c·d²·1e18)`) per annual period, in one tally both paths feed; `RpgfMinter` mints each closed period's budget of **florins** (`FlorinToken`, one billion cap) pro rata to the designers of record.
- **The batch path.** The guest runs inside the zkVM over a stream of signed operations and commits ten public-value words. The relay collects operations, proves, and calls `settleBatch`, which is permissionless: it checks the proof, the public values (previous state root, chain id, its own address, a batch timestamp within `MAX_BATCH_STALENESS`) and five calldata hashes, anchors every witness spec to `ClauseRegistry`, asks a buyer's wallet code about a wallet-code resolve, moves the tokens (every pull before any payout), re-emits the Core's events, hands the uses to `UsageCounter` inside a try/catch, and advances the root. The two paths share no state: a process opened on one resolves on it, and `UsageCounter` is where they meet.
- `WitnessSwapAndCommitCoordinator` sources a commit's bonds through a Permit2 witness transfer and a SwapRouter02 swap in the same transaction, then calls `FigaroCore.commit`.

`docs/SCALING_STRATEGY.md` draws the batch path; `docs/CONTRACTS.md` lists every
contract's surface.

## Actors, privileges and external dependencies

No contract has a privileged role. `commit` never reads `msg.sender`;
`resolveProcess` is gated by presence (`msg.sender == rootBuyer`).

| Actor | Can | Cannot |
|---|---|---|
| Buyer | sign an order; resolve its own process, directly or by a `ResolveProcess` authorization on the batch path (its key, or bytes its wallet code validates under ERC-1271); attest on its own orders | resolve a process it did not open, or part of one |
| Seller | sign an order; attest on its own orders | move any bond; resolve |
| Designer | register a clause, registered agreement or assembly under a stake; withdraw the stake once (the binding stays); claim rewards on its keys while its member stake is live | edit or remove a registration |
| Member | register, update its profile, request withdrawal, withdraw after the cooldown | act for another wallet |
| Batch submitter (the relay, or anyone) | call `settleBatch` with a valid proof over the current root | fabricate an operation, move a token the public values do not bind, replay a proof whose batch moved the root (`DESIGN_DECISIONS.md` #27 covers one that did not) |
| `FigaroBatchVerifier` | call `UsageCounter.applyBatchAccrual`, its one caller, fixed at construction | mint, edit a score, block a resolution (`DESIGN_DECISIONS.md` #15, #19) |
| `RpgfMinter` | mint florins within its registered cap, pro rata to score, per closed period | exceed a period's budget or its cap |
| Florin deployer | register minters until `renounceDeployerMint`, which the mainnet script calls in the same broadcast | anything after the renounce |
| DAO treasury | hold the 300M florins the genesis mint sends it | any protocol write |

Every state-changing external function in scope, and who may call it:

| Contract | Function | Caller |
|---|---|---|
| `FigaroCore` | `commit` | anyone holding both parties' signatures; the bonds are pulled from the signers |
| `FigaroCore` | `resolveProcess` | the process's `rootBuyer`, over every active order |
| `AttestationCoordinator` | `attestAsSeller`, `attestAsBuyer` | the order's seller, the order's buyer |
| `FigaroBatchVerifier` | `settleBatch` | anyone, with a valid proof over the current state root |
| `ClauseRegistry`, `AgreementRegistry`, `AssemblyRegistry` | `registerClause`, `registerAgreement`, `registerAssembly` | anyone, with the exact stake; first write wins; the zero key refused, and in `AgreementRegistry` the two reserved keys |
| the three registries | `withdrawDeposit` | the registrant, once |
| `ClauseRegistry` | `setMechanismClause` | anyone, for a registered key; emits an event, writes nothing |
| `UsageCounter` | `recordClauseUsage`, `recordAgreementUsage`, `recordAssemblyUsage` | anyone, with merkle proofs over a resolved direct-path order |
| `UsageCounter` | `applyBatchAccrual` | `FigaroBatchVerifier` only |
| `RpgfMinter` | `claim` | a live member that registered every key it passes, once per closed period |
| `FlorinToken` | `registerMinter`, `renounceDeployerMint` | the deployer, until the renounce |
| `FlorinToken` | `mint` | a registered minter, within its cap |
| `MembersRegistry` | `register`; `updateProfile`, `requestWithdrawal`, `withdraw` | anyone, with the stake; the member itself |
| `WitnessSwapAndCommitCoordinator` | `swapAndCommit` | anyone holding both commitment signatures and the Permit2 witness signatures |

| External dependency | Bound where | Trusted for |
|---|---|---|
| OpenZeppelin Contracts 5.5.0 | `lib/`, pinned submodule: ECDSA, EIP712, SafeERC20, ReentrancyGuard, MerkleProof, ERC20 | library correctness |
| Permit2 (canonical address) | `WitnessSwapAndCommitCoordinator` constructor; the deploy script requires code there | witness-transfer semantics, on the swap leg only |
| Uniswap SwapRouter02 | the same constructor; the deploy script probes `factory()` and `WETH9()` | executing the swap the witness commits to |
| The routed SP1 verifier | `FigaroBatchVerifier` constructor, immutable beside `programVKey`; the constructor reads `VERIFIER_HASH()` and refuses a gateway (`VerifierNotPinned`), so no route owner can change it | proof soundness |
| SP1 zkVM and crates; the patched `k256`, `ecdsa`, `rfc6979` | `prover/Cargo.lock` | executing the guest as written |
| `regex`, `serde_json`, `alloy-primitives` | compiled into the guest | pattern matching; exact JSON numbers; hashing and ABI encoding |
| IPFS | content behind every on-chain hash | availability, never integrity (`docs/DATA_LAYER.md`) |

No oracle, no bridge, no upgrade proxy, no pause.

The mainnet deploy (`script/DeployMainnet.s.sol`) fixes these, each immutable
once deployed: a registration stake of 0.05 ETH for each of the three
registries; a member stake of 0.05 ETH with a 28-day cooldown; a
minimum-support floor of 3 distinct staked sellers; nine annual reward periods
from `RPGF_GENESIS`, budgets 45M, 45M, 60M, 60M, 60M, 82.5M, 82.5M, 82.5M, 82.5M
(600M, the minter's cap); a genesis mint of 70M (founders), 30M (supporters),
300M (DAO treasury). In the verifier, `MAX_BATCH_STALENESS` is one hour and
`PUBLIC_VALUES_LENGTH` 320 bytes. The relay's bounds (`MAX_BATCH_OPS`, the
re-queue count, `DEFER_WINDOW_SECS`, the mempool and rate limits, the gas plan)
are its operator's settings, never the protocol's: `prover/sequencer/README.md`.

## Invariants

The properties the review is asked to break, by the ids
`docs/VERIFICATION_MAP.md` § 2 defines; each id's row in § 3 (K), § 4 (A) or
§ 5 (E) maps it to code, tests and formal layer.

- **K-1** The buyer's bond is twice the payment, the seller's twice the cumulative value (§ 3)
- **K-2** Only the root buyer can call `resolveProcess` (§ 3)
- **K-3** A process resolves every active order together, or none (§ 3)
- **K-4** No timeout and no administrative exit from an active process (§ 3)
- **K-5** A process's cumulative value only increases, by exactly each order's payment (§ 3)
- **K-6** Resolution is a direct ERC-20 transfer; the Core keeps no internal ledger (§ 3)
- **K-7** A process is bound to one token at its root order (§ 3)
- **K-8** Both parties' EIP-712 signatures are verified on every commit (§ 3)
- **K-9** An order's hash is `keccak256(processId ‖ structHash)` (§ 3)
- **A-1–A-6** Conservation, solvency, cumulative integrity, active count, resolution always possible (§ 4)
- **A-7** A fee-on-transfer token is rejected at the pull (§ 4)
- **A-8** The Core holds exactly the bonds of its committed orders (§ 4)
- **A-9** Resolution moves exactly the payment buyer → seller and refunds both bonds whole (§ 4)
- **A-10** Every committed order is bound to its process once, at commit (§ 4)
- **E-1** Only a party to the order attests on it (§ 5)
- **E-2** A registration is never overwritten (§ 5)
- **E-4, E-5** The member stake's two-step reclaim, and the stake mechanics the reward's Sybil bound assumes (§ 5)
- **E-6** The florin's supply never exceeds one billion (§ 5)
- **E-7** Batch usage is proof-gated, counted once ever, route-blind (§ 5)
- **E-9** Every persistent effect of `settleBatch` is bound by a public value (§ 5)
- **E-10** Every immutable the deploy scripts set reads back as given (§ 5)
- **E-11, E-12** Membership in an assembly and in an agreement is proved, never looked up (§ 5)
- **E-13, E-16** A batched process is a process in every respect a reader or a party can test, and resolves by what resolves it on the Core (§ 5, § "E-13 — the two paths, operation by observable")
- **E-14** The batch path's resolve authorization pays exactly what the buyer signed (§ 5)
- **E-15** A batched attestation discloses what a direct one discloses (§ 5)

## Review goals and areas of concern

**Worst case.** Bonds lost or moved through a defect rather than through a
documented case: a resolution by anyone but the buyer, a bond that leaves the
Core other than at resolution, or a batch resolution the direct path would
have refused.

**Areas of concern, in order.**

1. The payoff table the equilibrium rests on: signature or domain-separator replay, accumulator manipulation, reentrancy through the token, an order that resolves a process it does not belong to. The Core is two functions; everything below composes with it.
2. The batch path's seam between languages. `settleBatch` is the largest function in scope and the guest decides what it moves: a forged or mis-bound proof, a spec binding that diverges from the registry, public values the Core would refuse, the verifier's one write into `UsageCounter` doing more than accrue, the off-chain state the root commits to. Where two implementations of one rule meet (Core and mirror, SDK and Rust clause engine, relay and its readers) is where this codebase has broken.
3. Reward and stake economics: inflation or Sybil accrual through `UsageCounter` and `RpgfMinter` under any of the three kinds; the registries' withdrawal accounting.
4. The token boundary: the Permit2 witness digest and the SwapRouter02 call in `WitnessSwapAndCommitCoordinator`; non-standard ERC-20s beyond the fee-on-transfer rejection.
5. The clause engine: a spec or content the guest reads differently from `@figaro-protocol/sdk/clauses`; the witness gates (inclusion and attest-after-resolve in both forms, spec identity and content hash in the plaintext form) agreeing with `AttestationCoordinator` and the Core.
6. The relay: liveness under a hostile client (admission, the batch cap, the re-queue bound, deferral), its one key (`SEQUENCER_PRIVATE_KEY`, which pays gas and grants no protocol privilege), and what it serves.

**Questions for the auditor.**

1. Can any sequence of `commit` calls make `resolveProcess` pay a seller other than 2·G_i + P_i, or the buyer other than P_i, per order?
2. Can a valid proof over a stale or foreign state be replayed, given the `prevRoot`, chain id, verifying-contract and timestamp checks?
3. Can the try/catch around `applyBatchAccrual` swallow anything but a whole-call gate revert (period, provenance leaf)?
4. Is the `icbrt(c·d²·1e18)` score manipulable at a cost below the registration stake plus the member stakes it requires?
5. Does the Permit2 witness in `swapAndCommit` bind every field a signer would want bound, so a relayer cannot substitute a route?
6. Can any operation stream make the guest commit public values `settleBatch` accepts that `FigaroCore` would have refused?
7. Does the state root bind everything the next batch depends on?
8. Is the `ResolveProcess(processId, cumulativeValue)` authorization (`DESIGN_DECISIONS.md` #21) replayable, or applicable to orders the buyer did not accept? In its wallet-code form (`_resolveByWalletCode`, `_checkWalletCode`), can a stream make the verifier ask another code, about another digest than the guest applied, or reach state the batch then reads?
9. Can one client stall the relay, or exhaust its re-queue, at a cost below its own rate-limit budget?

**Intended behaviour.** `docs/DESIGN_DECISIONS.md` is the catalogue; the
entries this scope touches are #1–#5, #9, #10 and #12 (the Core), #6 (the
attestation window), #7 and #14–#20a (registries and rewards), #21 and #23–#27
(the batch path, the reward's kinds, the assembly tree, the witness form). The
relay's behaviour, each with its test, is `prover/sequencer/README.md`. What
neither covers:

- `FigaroCore` accepts a signature with `v` of 27 or 28 only, as OpenZeppelin's `ECDSA` does; the mirror refuses any other `v` itself (`eip712.rs`, `recover_signer`), and the differential fuzz feeds both sides high-s and 0/1 recovery-id signatures.
- The Core's parties are recovered ECDSA signers: a contract wallet transacts through a key it controls (`DESIGN_DECISIONS.md` #4 covers code a buyer's wallet installed).
- `resolveProcess`'s `CumulativeValueOverflow` guard is unreachable while the token keeps the Core's balance: the process's bonds already held total at least four times the value.
- `FlorinToken.renounceDeployerMint` emits no event; `deployerMintRenounced` is the state.
- `FlorinToken` reads a cap of zero as "not a minter": a minter registered with a zero cap is indistinguishable from an unregistered one, and can be registered again.
- `UsageCounter._count` holds the scope's one `unchecked` block, `c` and `d` each incremented by one; a process is counted once ever, so `c` is bounded by resolved processes and `d` by `c`.
- A clause `pattern` is a regex in the portable core (`docs/CLAUSES.md`); a pattern of the catastrophic shape, or an input over 4,096 UTF-16 units, is treated as satisfied by both engines, the safe direction for a check whose binding form is the merkle commitment.
- No crate in scope has an `unsafe` block. The mirror returns every refusal as a `KernelError`; the guest's entry point ends on it, so a batch the mirror refuses has no proof.

## Accepted risks and known limitations

| # | Risk or limitation | Owner |
|---|---|---|
| 1 | A buyer's lost key locks its active processes' bonds for good, unless code its wallet installed while it held the key resolves for it | `DESIGN_DECISIONS.md` #4 |
| 2 | A process's order count is bounded by the gas one transaction may spend; larger designs compose across processes | `FigaroCore.resolveProcess` NatSpec; `docs/SCALING_STRATEGY.md` |
| 3 | A party who revokes its allowance between the relay's funding check and `settleBatch` sinks that batch once; the relay names it, dead-letters its operations, re-queues the rest, and each refusal costs the others one re-queue. A buyer's wallet code that answers the relay's `eth_call` otherwise than the transaction does the same at no cost; the relay then dead-letters the batch's wallet-code resolves alone | `prover/sequencer/src/submitter.rs`, `classify_deterministic_revert`; `formal/RelayState.tla` |
| 4 | Fee-on-transfer tokens are refused at the pull; rebasing tokens are not detected; a token that blocklists, pauses or is upgraded against a party or the Core holds every process that party sits in, since resolution is atomic | `DESIGN_DECISIONS.md` #9 |
| 5 | A commitment can be bonded on the batch path up to `MAX_BATCH_STALENESS` (one hour) after its deadline, since the guest checks deadlines against the batch timestamp; both parties signed and fund it | `FigaroBatchVerifier.settleBatch` |
| 6 | The state behind the verifier's root is not stored on chain: every landed batch logs its operation stream (`BatchOperations`) and the Core's events, and a relay started with `REBUILD_FROM_CHAIN=1` rebuilds it; history expiry would reach these logs as it reaches the Core's events | `prover/sequencer/src/rebuild.rs`; `prover/sequencer/README.md` § "The state behind the root" |
| 7 | An operation deferred at batch formation waits `DEFER_WINDOW_SECS` from its own first deferral, not until its dependency arrives; operations that never apply, naming an honest process, take drain room in its group | `prover/sequencer/src/mempool.rs`; `prover/sequencer/README.md` § "Mempool bounds"; `formal/RelayState.tla` `DeferSpec` |
| 8 | A batched attestation's witness form is not signed: a relay holding a plaintext operation can submit it hash-only, and the event is the same | `DESIGN_DECISIONS.md` #26 |
| 9 | The batch path's resolve authorization carries no nonce and no deadline | `DESIGN_DECISIONS.md` #21 |
| 10 | A state-neutral batch's proof can land twice | `DESIGN_DECISIONS.md` #27 |
| 11 | The Rust carries no formal proof: the mirror is held to the Core by vectors and the differential fuzz, not by a proof of equivalence | `docs/VERIFICATION_MAP.md` § 14 |
| 12 | The relay is not mutation-tested; mutation testing covers the guest's two crates | `docs/VERIFICATION_MAP.md` § 14 |
| 13 | The Sepolia verifier pins an earlier guest's key; this tree's guest is not deployed | `docs/VERIFICATION_MAP.md` § 14 |

## Verification evidence

Each result stands at the revision its row names. Which invariant each bench
carries is `docs/VERIFICATION_MAP.md`; its § 14 is the per-component matrix
these rows summarize.

| Bench | What it covers | Result | Revision |
|---|---|---|---|
| Foundry, `forge test --via-ir` | every contract's behaviour, the deploy wiring, the cross-language vectors | every test passes; the three fork tests skipped (no RPC URL) | `04611ead` |
| Halmos | `FigaroCore`, `MembersRegistry`, `UsageCounter`, the three registries | 41 of 41 proved | `1d39092c` |
| Certora | `FigaroCore`, `TokenOpsVerification`, `AttestationCoordinator`, `FlorinToken`, `RpgfMinterAuthor` | every rule verified | `1d39092c` |
| Certora | `RpgfMinter` (built without via-IR) | 11 of 11 rules verified | `98a1e953` |
| Certora | `BatchVerifierTokenOps`, `BatchVerifierStateRoot` | owed: no rule processed within the prover's global timeout | `1d39092c` |
| Echidna | `FigaroCore`, `FlorinToken` | 15 of 15 properties hold | `1d39092c` |
| TLA+ | five models in seven configurations (the Core, the florin, the swap coordinator, the two paths composed, the relay) | no error | `1d39092c` |
| Lean 4 | the best responses over the A-8/A-9 payoff table | builds | `1d39092c` |
| Rust, `cargo test` | the guest against the Core, the clause engine, the guest in the executor | 0 failed | `1d39092c` |
| Rust, `cargo test -p figaro-sequencer` | the relay | 37 unit, 112 integration, 0 failed | `b1b26c54` |
| Differential fuzz | Core operations (wallet-code resolves among them), agreements, clause cases: the Core and the SDK as oracles of the mirror and the Rust engine | no divergence over nine seeds | `0532cd3a` |
| Batch end-to-end, SDK → relay → verifier | a batch on Anvil with the release binary | 4 of 4 pass | `b1b26c54` |
| Coverage, `scripts/coverage.sh` (legacy pipeline) | the eleven contracts then in scope that hold code | lines 99.81%, statements 99.44%, branches 97.04%, functions 100%; uncovered: the `DuplicateCommitment` and `CumulativeValueOverflow` guards, `RpgfMinter`'s `score == 0` early return, `FlorinToken.mint`'s `MAX_SUPPLY` check | `f62b71cf` |
| Mutation, `mewt` 4.0.0 (`scripts/mewt-run.sh`) | the same eleven contracts, high and medium severity | 912 mutants, 904 caught, 8 survived, each read as unreachable or equivalent: the `DuplicateCommitment` guard (2) and the `CumulativeValueOverflow` guard in `FigaroCore`, `UsageCounter`'s seller-seen write, `RpgfMinter`'s `score == 0` return (2), `FlorinToken.mint`'s `MAX_SUPPLY` check (2); `AgreementRegistry` not run | `f62b71cf` |
| Mutation, `cargo-mutants` (`scripts/cargo-mutants-run.sh`) | `figaro-kernel`, `figaro-clause` | 617 mutants: 550 caught, 26 timed out, 29 unviable, 12 survived, each read as equivalent | `f62b71cf` |
| Static analysis | Slither 0.11.3, Semgrep (`p/smart-contracts`, `p/rust`), Clippy, `cargo audit` | Slither's High and Medium results equal the triaged set below; Semgrep no WARNING or ERROR; Clippy clean; `cargo audit` fails on no advisory but the five set aside | every push (`foundry-ci`, `prover-ci`, `guards-ci`) |
| Real proof | two Groth16 proofs through Succinct's gateway, resolved by a `FigaroBatchVerifier` deployed with the guest's key | both accepted; bonds, payouts, re-emitted attestation and state root read from the chain | `cf6ba4ab`, on a Sepolia fork |
| Guest build, `scripts/prover-box/build-guest.sh` | the ELF and key the Sepolia verifier pins | ELF `e98d22aed98ea087f9c34a5115d2cf3364328ed6c128580b8531bb34f4ca9ac7`, key `0x00d74a88d7c774fb211bc2ade8ed502fbd33c42b64d081b1bb4bea66d9c31e39` | `eeb903b7` |

### Static analysis

`foundry-ci`'s `static-analysis` job fails when Slither's High and Medium
results differ from this triage, finding by finding (the detector, the function
and the statement text, never a line number), in either direction:

| Severity | Detector | Where | Verdict |
|---|---|---|---|
| High | arbitrary-send-erc20 (2) | `_pullExact` in `FigaroCore` and `FigaroBatchVerifier` | Designed: `from` is a recovered EIP-712 signer (Core) or a net position bound by the proof's public values (verifier), never a caller-supplied address |
| Medium | incorrect-equality (1) | `MembersRegistry.withdraw` (`unlockAt == 0`) | The "nothing pending" sentinel; `DESIGN_DECISIONS.md` #14 |
| Medium | reentrancy-no-eth (1) | `settleBatch` writes `stateRoot` after calling `UsageCounter` | `nonReentrant`; the callee is fixed at construction, accepts only this caller and calls nothing back; the try/catch keeps its revert from unwinding the token legs |
| Medium | unused-return (4) | `bindings` tuple reads in `UsageCounter` and `RpgfMinter._isAuthor` | Reads the fields it needs |

`cargo audit` sets five advisories aside in `prover/.cargo/audit.toml`, each
because no release of the crate's dependents takes the fixed version; the file
names each one's path and reason: RUSTSEC-2026-0344 (`ruzstd`), -0387
(`crypto-bigint`, compiled into the guest through SP1's patched `ecdsa`, where
execution is proven and holds no secret), -0391, -0398 and -0403 (`zstd`,
`zstd-safe`, outside the guest's graph).

## Reading list

| Document | Purpose |
|---|---|
| `docs/DESIGN_DECISIONS.md` | The intended patterns that look like vulnerabilities; read first |
| `docs/LEXICON.md` | Every noun, defined once |
| `docs/VERIFICATION_MAP.md` | Every invariant → code → test → formal layer; § 14, every bench's status |
| `docs/TESTING.md` | The inventory of tests, vectors, fuzz streams and CI |
| `docs/CONTRACTS.md` | Every contract's surface, and what the protocol has no contract for |
| `docs/CLAUSES.md` | The clause spec format, the generic engine, the portable pattern core |
| `docs/SCALING_STRATEGY.md` | The batch path's architecture and its trust analysis |
| `prover/README.md` | The five crates, the toolchain, how the tests run |
| `prover/sequencer/README.md` | The relay's trust model, routes, bounds and behaviour |
| `scripts/prover-box/README.md` | The host that builds the guest and makes real proofs |
| `SECURITY.md` | Reporting, the bug bounty, monitoring and incident response |

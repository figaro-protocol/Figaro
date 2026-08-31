# Smart Contracts — the inventory

Every contract in `src/`. Solidity 0.8.26, Foundry. The directory is the tier
map — `src/kernel/` · `src/protocol/{registries,coordinators,verifier,usage}/`
· `src/florin/` · `src/rpgf/` · `src/mocks/` · `src/echidna/` — and the
sections below mirror it; if they diverge, the filesystem is right.

**This file is the canonical inventory. A contract not listed here does not
exist in this repo.** Every contract is a permissionless primitive; none
belongs to an interface. Verification coverage per contract is derived in
`VERIFICATION_MAP.md`; commands, environment variables, and deploy scripts are
in `LOCAL_DEV.md`; the mechanism's derivation is in `THEORY.md`.

## The contract-edge graph

Every arrow is an immutable pointer fixed at construction (a read, unless
marked); parenthesized nodes are external canonical contracts, not this
repo's. Two structural facts: the kernel is the centre and points at nothing,
and the three registries carry no edges among themselves — parallel anchors,
never nested.

```
AttestationCoordinator ──▶ FigaroCore ◀── WitnessSwapAndCommitCoordinator ──▶ (Permit2)
                               ▲                                          └──▶ (Uniswap router)
                               │
                          UsageCounter ──▶ MembersRegistry
                            ▲   ▲     └──▶ ClauseRegistry, AssemblyRegistry
             writes accrual │   │ reads accrual
                            │   │
          FigaroBatchVerifier   RpgfMinter ──▶ ClauseRegistry, AssemblyRegistry
              │        │            │              (designer of record)
              ▼        ▼            ▼
       (SP1 gateway)  ClauseRegistry   FlorinToken
                      (contentHashOf)  (registered minter at genesis, 600M cap)
```

- `FigaroCore` — no outbound edges: the kernel reads no contract above it.
- `UsageCounter.applyBatchAccrual` is the verifier's one write edge and the
  counter's one privileged caller; everything else on the graph is a read.
- `FlorinToken` — no outbound edges: minters point at it, registered by the
  deployer at genesis before `renounceDeployerMint` closes the registry.
- Assembly→clause and seller→assembly relationships are off-chain (assembly
  content, profile bindings) — deliberately absent from this graph.

## Kernel (`src/kernel/`)

The two frozen contracts. Never edited.

**`src/kernel/FigaroCore.sol`** — Holds every deposit and resolves a process
when its buyer signs.
- Two state-changing entry points: `commit(Commitment c, bytes buyerSig,
  bytes sellerSig)` and `resolveProcess(bytes32 processId, Commitment[]
  commitments)`.
- Three mappings: `processes` (`ProcessState{rootBuyer, currency,
  cumulativeValue, activeOrderCount}`), `orderStatus` (`uint8`: 0 unknown,
  1 committed, 2 resolved), `orderProcessId` (`bytes32`).
- `commit` verifies both EIP-712 signatures over `c`, then pulls `2 × payment`
  from the buyer and `2 × expectedCumulativeValue` from the seller. A root
  order (`c.processId == 0`) opens a process; any other order extends one and
  must carry `c.buyer == process.rootBuyer` and `expectedCumulativeValue`
  equal to the live accumulator plus `payment` (`CumulativeValueMismatch`).
- `resolveProcess` requires `msg.sender == rootBuyer` (`NotProcessBuyer`) and
  the complete active-order list (`IncompleteOrderList`), then pays every order
  at once: seller `2 × expectedCumulativeValue + payment`, buyer `payment`.
  Every deposited token leaves; the kernel never holds a withdrawable balance.
- No owner, no admin, no pause, no upgrade, no timeout, no third entry point.
  `ReentrancyGuard` on both functions.

**`src/kernel/CommitmentTypes.sol`** — The `Commitment` struct and its EIP-712
hashing: `{processId, buyer, seller, currency, payment, expectedCumulativeValue,
agreementHash, salt, deadline}`. `salt` makes repeat orders hash distinctly;
`deadline` bounds the window in which an unconsummated pair of signatures can
be committed (`DeadlineExpired`) — a signature cannot be revoked, so it ages
out; nothing expires after commit. `DESIGN_DECISIONS.md` §13 owns the
reasoning.

## Registries (`src/protocol/registries/`)

Three parallel anchors, each with its own identity scheme, event stream, and
withdrawal behaviour; none references another. Registering publishes; it
never qualifies — the kernel gates nothing on registry state.

**`src/protocol/registries/ClauseRegistry.sol`** — Permissionless clause
anchoring under a stake.
- Key: `idHash = keccak256(abi.encode(clauseId, version))`. `contentHash` is
  keccak256 of the canonical spec JSON; `contentURI` is where readers fetch it.
  `contentHashOf[idHash]` is never cleared — it is the anchor
  `FigaroBatchVerifier` checks every witness-spec binding against.
- `registerClause` — first-write-wins, immutable, `payable`, requires exactly
  `registrationDeposit` (`WrongDeposit`); emits `ClauseRegistered`.
- `withdrawDeposit(idHash)` — the registering wallet only, once, no time lock;
  refunds the stake and emits `DepositWithdrawn`. The binding stays; readers
  remove the clause from view for new compositions, and committed agreements
  keep resolving it.
- `setMechanismClause(idHash)` — permissionless self-declaration by any
  contract; writes no storage, emits `MechanismClauseSet(msg.sender, idHash)`,
  reverts `NotRegistered` on an unanchored key. It confers nothing.
- Registration anchors a locator and a content hash only; the contract
  validates no content. `CLAUSES.md` owns the validation model.

**`src/protocol/registries/MembersRegistry.sol`** — Permissionless member
registration under a stake. A member is a wallet that publishes a
declaration — buyer, seller, or both; the declaration is one document, split
between the identity envelope here and the item list behind `catalogueURI`.
- `register(metadataURI)` — sets the dedup guard, takes the stake, emits
  `MemberRegistered`.
- `updateProfile(metadataURI)` — caller-only replacement, no stake movement,
  emits `MemberProfileUpdated`.
- `requestWithdrawal()` — clears the dedup guard at once (the member leaves
  view and may re-register), schedules the stake for release, emits
  `MemberWithdrawalRequested` — the signal discovery and erasure readers fold.
- `withdraw()` — refunds the stake once `withdrawalCooldown` has elapsed,
  emits `MemberWithdrawn`.
- State: `_registered`, `pendingDeposit`, `releaseAt`. No active flag, no role
  field, no deactivate. `UsageCounter` reads one field, `registered`, as the
  seller-side gate for designer rewards.
- The cooldown is what prices an identity: without it one stake serves N
  identities in sequence; with it, sustaining N identities across a period `P`
  costs `stake · N · T / P`. Leaving view and refunding are different moments
  by design.

**`src/protocol/registries/AssemblyRegistry.sol`** — Permissionless assembly
anchoring under a stake.
- Identity is the composition: `compositionHash = keccak256` of the assembly's
  canonical composition (the composed agreements — clauses, values, topology;
  editorial prose excluded). Identical compositions collapse to one binding;
  no caller-chosen name exists on-chain. The human-readable slug is derived
  off-chain (`deriveAssemblySlug`).
- `registerAssembly(compositionHash, contentURI)` — first-write-wins, requires
  exactly `registrationDeposit`, emits `AssemblyRegistered`.
- `withdrawDeposit(compositionHash)` — the registering wallet only, once, no
  time lock; refunds the stake and emits `DepositWithdrawn`. The binding is
  permanent: buyers and sellers that reference the assembly rely on its content
  staying stable.
- State: `bindings: compositionHash → AssemblyBinding{registeredBy,
  registeredAt, depositWithdrawn, contentURI}`. No owner, no transfer, no
  removal. The contract validates no content.

The two hash-keyed registries carry no cooldown — their withdrawal is one-shot
per key and the binding permanent, so there is nothing to recycle.

## Coordinators (`src/protocol/coordinators/`)

Contracts that compose the kernel without becoming a party to it. A new
capability beside the kernel is a NEW parallel contract composing kernel
state — never a kernel edit, never a tenant inside an existing registry. The
copyable shape:

1. **Bind through a minimal, immutable surface.** Declare only the kernel
   functions you call and bind at construction: each coordinator declares its
   own local `interface IFigaroCore` naming exactly the surface it uses
   (`commit` in `WitnessSwapAndCommitCoordinator.sol`; `orderStatus` +
   `DOMAIN_SEPARATOR` in `AttestationCoordinator.sol`) and holds it
   `immutable`. The local-minimal interface is the pattern for external
   composers too: a third party composing the deployed kernel cannot import
   this repo's files, only its ABI. (`CommitmentTypes` is the shared
   struct/hashing library both import.)
2. **Read kernel state as the single source of truth; never re-implement
   kernel logic.** A coordinator may read (`orderStatus`, `DOMAIN_SEPARATOR`),
   call (`commit`), and — when it cannot import a constant from the frozen
   kernel — mirror one with a comment pinning the source (the 2× bond
   multiplier in `WitnessSwapAndCommitCoordinator`). The kernel does the
   enforcing: the bond pull, the status transition, the atomic resolution. A
   contract that enforces bonding or resolution itself is re-implementing the
   kernel, not composing it.
3. **Hold no resolution-time discretion.** A coordinator carries setup or
   evidence legs (a swap before `commit`; a merkle-checked attestation), never a
   lever over a live process's resolution.
4. **The arrow points one way.** The kernel never knows the coordinator exists
   (its one mention of `AttestationCoordinator`, in the `DOMAIN_SEPARATOR` doc
   comment, is illustrative, not a dependency). Tenant names — Kleros, Uniswap,
   a lender — live at the edge: in the composing contract, in a clause's
   `block.design.composes`, in the UI dispatch. Never in the kernel, never in
   the SDK's protocol modules.

The test before building anything beside the kernel: *can this be a parallel
contract that reads kernel state and lets the kernel enforce?* If the answer
seems to be no, the proposal is adding a mechanism to the kernel — stop.

**`src/protocol/coordinators/AttestationCoordinator.sol`** — Zero-storage
attestation, merkle-only, bound to the signed `agreementHash`. Three modes:
- `attestAsSeller(Commitment role, Commitment target, bytes32 clauseId, uint8
  stage, bytes32 sectionHash, bytes32[] proof, bytes32 contentRef)` — role and
  target commitments; the same commitment twice for same-order attestation,
  distinct commitments for cross-order attestation within a process.
- `attestAsBuyer(Commitment target, bytes32 clauseId, uint8 stage, bytes32
  sectionHash, bytes32[] proof, bytes32 contentRef)` — caller must equal
  `target.buyer`.
- `attestViaResolver(Commitment target, ...)` — caller authorized by
  `IRoleResolver(target.seller).isAuthorized`. Kernel parties are ECDSA
  externally owned accounts, so `target.seller` can expose `isAuthorized` only
  through EIP-7702 delegation; without it the staticcall finds no code and the
  path reverts. No production caller today.

The call carries fingerprints, never preimages: `sectionHash =
keccak256(sectionData)`, `contentRef = keccak256(content)`; a private section's
plaintext never touches the chain. For every call the coordinator verifies an
OpenZeppelin-style merkle inclusion proof of `leaf =
keccak256(keccak256(clauseId || sectionHash))` (double-hashed for leaf/node
domain separation) against `target.agreementHash`, then emits
`Attestation(orderHash, processId, attester, clauseId, stage, contentRef)`.
`_requireKnownCommitment` checks the caller-supplied commitment against a
committed `orderHash` via `core.orderStatus`. It validates no content shape;
a clause not committed at signing cannot be attested (`InvalidInclusionProof`),
and a never-seen clause is attestable with zero per-clause on-chain code.

**`src/protocol/coordinators/IRoleResolver.sol`** — `isAuthorized(orderHash,
caller)`, the interface a seller address implements to delegate attestation.

**`src/protocol/coordinators/WitnessSwapAndCommitCoordinator.sol`** — Lets a
buyer and/or seller fund a bond from a token other than the process's
denomination, in the same transaction as `commit`. One external function,
`swapAndCommit(c, buyerSig, sellerSig, buyerFunding, sellerFunding)`: for each
enabled leg it pulls the party's input token through a Permit2 witness
signature (`permitWitnessTransferFrom`), forwards the swap calldata to the
immutable `router` (Uniswap SwapRouter02 — a venue that pulls by ERC-20
allowance; never the Universal Router), forwards the swapped denomination to
the party's own address, then calls `FigaroCore.commit`.
- The kernel pulls each bond from the named party and never checks
  `msg.sender`, so the coordinator supplies the party in place and never becomes
  a counterparty; the commitment stays bilaterally signed.
- Bond amounts derive from `c` (`2·payment`, `2·expectedCumulativeValue`),
  never from calldata; a leg reverts `OutputBelowBond` if the swap yields less.
- The witness binds `{router, inputToken, maxInput, keccak256(swapData)}` into
  a `SwapWitness` the party signs (`swapWitness(inputToken, maxInput,
  swapData)` recomputes it for off-chain signers); substituting any of them
  fails Permit2's own signature check before a token moves, so no relayer can
  reroute the swap and capture the residual.
- Immutable `figaroCore` / `permit2` / `router`; `ReentrancyGuard`; no owner,
  no admin, no pause. Alternative coordinators with other routers are valid
  compositions.
- Per-party prerequisites: a one-time `approve(FigaroCore, …)` for the
  denomination, a one-time `approve(Permit2, …)` for the input token, and a
  per-commit Permit2 witness signature.

## Verifier (`src/protocol/verifier/`)

The proof-based path that resolves batches of processes beside the direct
kernel path. `SCALING_STRATEGY.md` owns the design; this is the surface.

**`src/protocol/verifier/FigaroBatchVerifier.sol`** — One external function,
`settleBatch(proof, publicValues, positions, events, usage)`:
- verifies an SP1 proof of a batch of kernel operations (commits, resolutions,
  witness-gated attestations) against the immutable `programVKey`;
- checks state-root continuity and chain binding, and hash-verifies the
  calldata (positions, attestations, spec bindings) byte-for-byte against the
  Rust kernel's `compute_*_hash`;
- checks every (clause key → witness-spec hash) binding against
  `ClauseRegistry.contentHashOf` — the vkey covers the generic clause engine,
  the registry anchors the constraint set, so a new clause never touches the
  prover;
- reconciles net token positions (pulls net deposits, pushes net payouts;
  `FeeOnTransferDetected` guard), re-emits proven `Attestation` events (same
  topic as the coordinator's — indexers filter by address), forwards the usage
  accrual to `UsageCounter.applyBatchAccrual`, and advances the state root.
- Immutable `verifier` / `programVKey` / `clauseRegistry` / `usageCounter`; no
  owner, no upgrade path — a program change is a fresh deploy. Not a florin
  minter.

The two paths share no state: a batch-resolved process never acquires kernel
status (`core.orderStatus` stays 0 for it), so every reader folds both
streams. The usage accrual is the one thing that crosses: the guest proves each
clause's or assembly's cumulative `(c, d)`, an eighth public value
(`usageAccrualHash`) commits the period, the provenance clause key, the
accruals and the distinct sellers behind them (both array lengths in the
preimage), and `settleBatch` re-derives that hash from calldata before
forwarding. What the proof cannot see — the open period, each seller's live
stake, the excluded set — is checked in the counter. A batch that credits no
usage passes empty arrays; that call is a no-op, which lets trade keep
resolving after the reward's last period closes.

**`src/protocol/verifier/ISP1Verifier.sol`** — the Succinct SP1
verifier-gateway ABI, `verifyProof(programVKey, publicValues, proof)`.

## Usage accounting (`src/protocol/usage/`)

**`src/protocol/usage/UsageCounter.sol`** — Counts how much real trade a
clause or assembly carried, on chain, at the moment it happens. The chain
cannot look backwards — the kernel calls no registry and contracts cannot read
events — so the fact is recorded when it occurs, and nothing is posted,
bonded, challenged, or adjudicated afterward.

Two permissionless functions and one proof-gated writer:
- `recordClauseUsage(order, clauseOrAssembly, sectionHash, proof)` — proves
  the order is RESOLVED (`core.orderStatus == 2`) and that the clause was
  committed in that order's signed agreement (merkle inclusion against
  `agreementHash`). Fingerprint only, never the preimage. The same check
  `AttestationCoordinator` performs, with the status gate inverted:
  attestation is evidence during an open process; usage is counted once it
  has resolved. Recording is opt-in and gas-paid by whoever benefits.
- `recordAssemblyUsage(order, compositionHash, proof)` — credits an assembly.
  Agreement leaves are keyed by clause, so a `compositionHash` is never a leaf
  key; what is a leaf is `figaro-assembly-provenance`, whose committed content
  is exactly the compositionHash. The contract derives that section hash from
  `compositionHash` and proves that one leaf; a wrong hash derives a leaf that
  is not in the tree. The provenance clause key is fixed at deploy. Without
  that clause in the agreement, no process can credit its designer.
- `applyBatchAccrual(period, provenanceClause, accruals, sellers)` — callable
  only by `batchVerifier` (immutable). A proof-gated writer, not an admin: the
  caller has no discretion, only numbers an immutable vkey committed
  (`DESIGN_DECISIONS.md` §16). The write overwrites the clause's or
  assembly's cumulative `(c, d)` for the period, so the batch path keeps no
  per-process storage; counts are asserted non-decreasing
  (`AccrualWentBackwards`). The open period (`PeriodMismatch`), each seller's
  live stake, and the excluded set are checked here. An empty accrual returns
  before `currentPeriod()` is consulted, so the reward's end never blocks the
  batch path.

Per clause or assembly per period it keeps `c` (distinct resolved processes),
`d` (distinct live-staked sellers of record), and `score = icbrt(c·d²·1e18)`
when `d ≥ minSellers`, else zero. Uniform: no tag, category, or weight. The
formula and its rationale are stated normatively in `sdk/src/rpgf/formula.json`.
- **Seller-side stake gate:** a recording counts only if the order's
  seller of record holds a live `MembersRegistry` stake
  (`members.registered(order.seller)`, else `SellerNotStaked`). The gate closes at `requestWithdrawal()`, not at
  `withdraw()`.
- **Minimum-support floor:** `minSellers` (constructor-immutable) — a clause
  or assembly scores nothing in a period until that many distinct staked
  sellers have carried it; counting is never refused below the floor, and the
  score appears whole when it is crossed. The floor lives in `_score`, so both
  paths inherit it identically and per path.
- **One exclusion:** `excludedClauseOrAssembly` holds exactly
  `figaro-assembly-provenance`; `recordClauseUsage` on it reverts
  `ClauseOrAssemblyExcluded` — scoring the credit-carrying leaf would pay every
  assembly-composed process twice. The two order-mandatory clauses
  (`figaro-commerce`, `figaro-topology`) earn under the uniform rule for their
  designer of record — the DAO treasury, which registers exactly the mandatory
  clauses at genesis.
- **Periods, not checkpoints:** a period's counts are final once it ends;
  `totalScoreIn(period)` is maintained as an O(1) delta on every recording. The
  contract knows nothing about budgets or who pays.
- **Merging the two paths — sum the scores, never the components:**
  `scoreOf(clauseOrAssembly, period) = accrualOf.score + batchAccrualOf.score`,
  and `totalScoreIn` counts both. Summing components would over-count breadth
  for a seller active on both paths; the score is concave and homogeneous of
  degree 1, so summing scores can never over-count. `RpgfMinter` reads
  `scoreOf`; a reader that reaches for `accrualOf` alone under-reports. The
  batch leg emits `BatchUsageRecorded` (cumulative, replaces), the direct leg
  `UsageRecorded` (adds); indexers fold them differently.
- **Idempotence is global:** a process counts once ever per clause or
  assembly, in whichever period it is first recorded; each period counts only
  usage new to it.
- `icbrt` binary-searches the floor cube root with its ceiling at
  `floor(cbrt(2^256−1))`, so the cube cannot overflow.
- No owner, no admin, no pause. The measured gas anchor for
  `recordClauseUsage` and its regression ceiling live in
  `test/protocol/usage/UsageCounterTest.t.sol` (`RECORD_USAGE_GAS`); every
  analysis quotes that one home.

## The florin (`src/florin/`)

**`src/florin/FlorinToken.sol`** — ERC-20 with EIP-2612 permit. `MAX_SUPPLY` of
one billion, enforced on every mint. A minter registry with
`totalRegisteredCap` (the sum of registered caps may not exceed
`MAX_SUPPLY`); the deployer registers capped minters, then
`renounceDeployerMint` closes the registry. Reentrancy-guarded. No owner after
renounce, no upgrade, no parameter.

**`src/florin/IFlorinMinter.sol`** — `mint(address, uint256)`, the interface a
registered minter implements.

Genesis: the deployer deploys `RpgfMinter`, registers it with a 600M cap,
registers itself as a one-shot minter with a 400M cap, mints 70M / 30M / 300M
to the founder, supporters, and DAO wallets, then renounces. `FLORIN_TOKEN.md`
owns the allocation and its reasoning. Nothing is minted on resolution.

## Designer rewards (`src/rpgf/`)

The 600M reserve, paid to designers of record in proportion to the trade
their clauses and assemblies carried: one claim per period, nine annual
periods, per-period budgets rising over three groups (15% of the reserve
over years 1–2, 30% over 3–5, 55% over 6–9, split equally within each group).
`DESIGNER_REWARDS.md` owns the schedule's reasoning and the boundary;
`DATA_LAYER.md` owns what the stake does and does not do.

**`src/rpgf/RpgfMinter.sol`** — `claim(periodId, clausesOrAssemblies)` mints
`periodAmount · callerScore / totalScoreInPeriod`, once per wallet per period;
a wallet passes every clause and assembly it designed in that one call.
- `claim` requires `counter.periodClosed(periodId)`: the numbers it reads are
  final, so there is no snapshot, checkpoint, or history walk.
- The list must be duplicate-free (`DuplicateClauseOrAssembly`); with distinct
  entries `score ≤ total` holds structurally.
- Each entry is verified against its own registry with a live stake —
  `ClauseRegistry.depositOf` (`registeredBy == caller` and not withdrawn) or
  `AssemblyRegistry.bindings` (`registeredBy == caller` and not withdrawn);
  both anchors are consulted because neither knows the other exists. This is
  the designer-side half of the two-sided live-stake gate; the seller-side
  half is `UsageCounter`'s.
- Payout is uniform pro rata with no cap. The budget array is validated
  against `UsageCounter.periodCount()` at deploy (`AmountsPeriodsMismatch`), so
  the two schedules cannot drift; the budget is enforced twice — `minted` per
  period here and the token's 600M minter cap.
- No owner, no pause, no sweep, no claim expiry; a closed period's arithmetic
  is stable forever. The minter must exist at florin genesis because
  `registerMinter` precedes `renounceDeployerMint`.

`sdk/src/rpgf/` mirrors the scoring off-chain for display and verification —
recomputing what the chain holds, never posting an answer. The 300M DAO
treasury pays for public goods by human decision; there is no match round and
no crowd mechanism.

## Test and mock contracts (`src/mocks/`, `src/echidna/`)

Never deployed to a public network. `LOCAL_DEV.md` owns which the devnet
deploy script wires and under which environment variable.

- `MockERC20.sol` — the devnet denomination; permissionless `mint(to, amount)`.
- `MockERC20FeeOnTransfer.sol` — fee-on-transfer ERC-20, Foundry tests only.
- `MockPermitToken.sol` — a second devnet ERC-20 (EIP-2612), the swap-funding
  input token.
- `MockWitnessPermit2.sol` — stand-in for Permit2's `permitWitnessTransferFrom`
  with real witness-signature verification (same digest as canonical Permit2;
  deadline and amount enforced).
- `MockTreasuryMultisig.sol` — stand-in for the DAO treasury's Safe
  (propose → threshold approvals → anyone executes; no owner acts alone).
- `MockDisperse.sol` — mirrors the canonical public multisender's verified
  interface (`disperseEther`, `disperseToken`, `disperseTokenSimple`, every
  batch atomic).
- `MockSwapVenue.sol` — a swap venue at a settable rate, pulling its input by
  ERC-20 allowance like the production router; its `swap(...)` shape is a test
  stand-in, not the production interface.
- `MockSP1Verifier.sol` — accepts any proof, so the batch path runs end to end
  on a devnet without proving hardware.
- `MockReentrantToken.sol` — a malicious ERC-20 that re-enters on transfer;
  proves the `nonReentrant` guards on `commit`, `resolveProcess`, and
  `settleBatch` fire under a live attempt. Foundry tests only.
- `src/echidna/EchidnaFuzzer.sol`, `EchidnaFlorinToken.sol`, `EchidnaToken.sol`
  — the Echidna property targets.

## Composed, not owned

**Multisender.** Batch dispersal — one payment, many recipients, one
transaction — is a wallet splitting its own receipts after resolution to
earmarked addresses, leaving a fiscal trail as a byproduct. It reads neither
the kernel nor any registry, and the network already supplies it: the
canonical public Disperse deployment
(`0xD152f549545093347A162Dce210e7293f1452150`, ownerless, the same address
across chains) is composed, never duplicated. `MockDisperse.sol` mirrors its
interface so a devnet rehearses the composition.

**Permit2, the Uniswap router, the SP1 gateway, the DAO's Safe** — external
canonical contracts the coordinators, the verifier, and the treasury compose;
addresses are deployment configuration, never code written here.

## What the protocol has no contract for

Clause content is validated off-chain by the SDK against the spec, and in
proof on the batch path against specs anchored by `contentHashOf`; there are
no per-clause validator contracts, and a never-seen clause is attestable and
batch-resolvable with zero per-clause code (`CLAUSES.md`). Usage for designer
rewards is counted as it happens; there is no posted root, no reward bond, no
challenge window, and no reward referee. Clause-tier arbitration
(`figaro-arbitration-<provider>` clauses, `block.design.composes.forumUrl`) is a
different object and is untouched. There is no factory, router, governance,
compliance, vesting, airdrop, or proxy contract; no protocol-level owner or
admin surface; the florin votes on nothing.

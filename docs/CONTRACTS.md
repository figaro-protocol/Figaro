# Smart Contracts — What Actually Exists (V5)

All contracts in `src/`. Solidity 0.8.26, Foundry. V3 in `archive-v3/`.

**The directory IS the tier map** (reorganised 2026-07-27) — `src/kernel/` · `src/protocol/{registries,coordinators,verifier,usage}/` · `src/florin/` · `src/rpgf/` · `src/mocks/` · `src/echidna/`. The sections below mirror those directories exactly; if they ever diverge, the filesystem is right. Establish a contract's tier from its path before citing any doctrine at it — `docs/LEXICON.md` § "Failure modes" (Folding).

No contract belongs to a dapp. Every contract is a permissionless primitive.

This file is the canonical inventory. CLAUDE.md indexes it; agents must not reference contracts not listed here.

## Kernel (`src/kernel/`)

The frozen settlement primitive. Never edited — see CLAUDE.md § Agent Permissions.

**`src/kernel/FigaroCore.sol`** — The protocol kernel. No owner, no fee, no escape hatches.
- 2 state-changing entry points: `commit` (unified dual-signed), `resolveProcess`
- 3 mappings: `processes` (ProcessState), `orderStatus` (uint8), `orderProcessId` (bytes32)
- EIP-712 dual-signed commitments; asymmetric bonding; direct transfer at resolution
- Covered by Foundry unit tests, 7 Echidna properties (EchidnaFuzzer), 7 Halmos symbolic proofs (HalmosFigaroCore), and 4 Certora CVL specs across the protocol (FigaroCore, AttestationCoordinator, TokenOpsVerification, FlorinToken — see `docs/VERIFICATION_MAP.md` for the current per-contract verification coverage)

**`src/kernel/CommitmentTypes.sol`** — EIP-712 typed structs and hash functions.
Single `Commitment` struct for both root and sub-orders; `processId` zero for root.
`salt` is identity (repeat orders hash distinctly); `deadline` is expiry of the
unconsummated dual-signature window — a signature cannot be revoked (no cancel,
by doctrine), so it must age out (`DeadlineExpired` gates commit; nothing
expires post-commit). See `DESIGN_DECISIONS.md` §13.

## Registries (`src/protocol/registries/`)

The three registry-family anchors — **parallel, not nested**. Each has its own identity scheme, evolution path, and event stream; none references another's existence.

**`src/protocol/registries/ClauseRegistry.sol`** — Permissionless clause anchoring with a
reclaimable ETH deposit (staked intent — K4).
`clauseId` is the bare human-readable name; the on-chain dedup key is `keccak256(abi.encode(clauseId, version))` (details in CLAUSES.md). `contentHash` is keccak256 of the canonical off-chain spec JSON (integrity); `contentURI` is the pointer readers fetch it from. `contentHashOf[idHash]` stores the anchor (never cleared) — the trust anchor the batch verifier checks each proof's witness-spec binding against when the proof apparatus lands.
`registerClause` is first-write-wins, immutable, and `payable` (requires the
immutable `registrationDeposit`); `withdrawDeposit(idHash)` (registrar-only,
once, no time lock) returns the stake and emits `DepositWithdrawn` — the
binding stays permanent, but readers DE-SURFACE the clause for new
compositions (surfacing derives from the live stake; committed agreements
keep resolving it). Version migration = withdraw the old version's stake +
register the new. The commits == resolves withdraw gate is protocol-surface:
the count lives in the indexer (the same count RPGF pays on), and the contract
cannot hold it (the kernel is frozen, with no composition provenance), so the
gate has no on-chain hardening. There is **no on-chain
clause-content validation** — registration anchors the spec locator (IPFS) +
content hash, and well-formedness is the off-chain Layer-A SDK's job
(`@figaro/sdk/clauses` `validate.ts`/`encode.ts`) plus a read-time concern.

Note: `figaro-topology` is an **agreement-only clause** — parties commit to
it at contract-signing time inside the off-chain agreement, and it's
never fired as a runtime attestation. It is *not* off-chain-only, though: the
topology section is a merkle leaf under the on-chain `agreementHash`,
inclusion-provable via OpenZeppelin `MerkleProof` (`buildSectionInclusionProof`
in `agreement.ts`) — "no runtime attestation" is not "no on-chain verification".
Its `ClauseRegistry` entry anchors the clauseId as off-chain vocabulary; the DAG
itself is reconstructed by indexers/frontend reading topology sections from the
signed agreement.

**`src/protocol/registries/MembersRegistry.sol`** — Permissionless participant
self-registration with a reclaimable ETH deposit (staked intent — K4). **MEMBER, not
seller:** the kernel is actor-neutral, but a seller-only registry left a pure buyer
nowhere to publish a price, a whitelist, or a calendar. "Member" is registry-tier
vocabulary for *a wallet that publishes a declaration* — **not a sixth noun and not a
role**; role stays DERIVED from the orders a wallet holds and the clauses they carry.
Registering is how a wallet PUBLISHES, never how it QUALIFIES: transacting through the
kernel requires no registration at all.

The declaration is **ONE document, no halves** (ruled 2026-07-30) — it is already split
on stable↔volatile (identity envelope here, item list behind `catalogueURI`), and a
buyer/seller split would be a second, crossing axis.

Four external functions: `register(metadataURI)` (sets the dedup guard, consumes the
deposit, emits `MemberRegistered`); `updateProfile(metadataURI)` (caller-only metadata
replacement, no deposit movement, emits `MemberProfileUpdated`);
`requestWithdrawal()` (clears the dedup guard **immediately** — the member de-surfaces
and may re-register at once — schedules the ETH for release and emits
`MemberWithdrawalRequested`); and `withdraw()` (transfers the pending deposit once
`withdrawalCooldown` has elapsed, emits `MemberWithdrawn`).

**The cooldown is what makes `registrationDeposit` a real Sybil price.** Without it one
deposit is recyclable across N identities in sequence, so capital cost is O(1) however
much breadth is fabricated; with it, sustaining N identities across a reward period `P`
costs `deposit · N · T / P`. De-surfacing and release are deliberately different
moments: nobody is held on a surface they asked to leave (discovery removal and erasure
are immediate), while the capital stays committed. The two ID-keyed registries
(`ClauseRegistry`, `AssemblyRegistry`) carry **no** cooldown — their withdrawal is
one-shot per key and the binding is permanent, so there is nothing to recycle.

Four events: `MemberRegistered`, `MemberProfileUpdated`, `MemberWithdrawalRequested`
(**the de-surfacing signal discovery and erasure readers fold** — not `MemberWithdrawn`),
`MemberWithdrawn`. State is the dedup guard plus the pending-release schedule
(`_registered`, `pendingDeposit`, `releaseAt`). **No `_active` flag, no role enum, no
`deactivate` / `reactivate`**: availability is signal-by-availability off-chain, not
registry state. The deposit is a spam-protection knob only; profile updates do not
require withdrawing. The kernel does not gate any operation on registry state — this is
advisory metadata for off-chain discovery surfaces. `UsageCounter` reads exactly one
field of it (`registered`) as the seller-side RPGF gate.

**`src/protocol/registries/AssemblyRegistry.sol`** — Permissionless assembly anchoring with a
reclaimable ETH deposit. An assembly is a composition template that USES
clauses; this registry is the assembly registry family's anchor, parallel to
`ClauseRegistry` (clauses) and `MembersRegistry` (participants) per the
separation-of-concerns doctrine. Two external functions:
`registerAssembly(compositionHash, contentURI)` (first-write-wins, requires the
immutable `registrationDeposit`, emits `AssemblyRegistered`) and
`withdrawDeposit(compositionHash)` (author-only, callable once, no time lock —
K4: withdrawing DE-SURFACES the assembly; the commits == resolves gate is
protocol-surface against the indexer's count, emits `DepositWithdrawn`). Identity IS the
composition: `compositionHash` = keccak256 of the template's canonical
composition subset (the composed agreements — clauses, values, topology;
editorial prose excluded), so identical compositions collapse to one binding
and no caller-chosen name exists on-chain to squat; the human-readable slug is
presentation, derived off-chain as a pure function of the hash
(`deriveAssemblySlug`). State is one mapping `bindings: compositionHash →
AssemblyBinding` {author, registeredAt, depositWithdrawn, contentURI}. The
composition binding is permanent — `withdrawDeposit` returns only the ETH and
never clears the binding, because buyers and sellers that reference the
assembly rely on its content staying stable; the deposit is a reclaimable
Sybil-resistance stake, not a fee, and the surfacing readers derive
visibility from it. No owner, no admin, no fee, no `transferAssembly`, no
`removeAssembly`. The contract does not validate content — well-formedness is an
off-chain (Layer-A SDK + read-time) concern, never an on-chain check. Foundry
tests in `test/protocol/registries/AssemblyRegistryTest.t.sol`.

## Coordinators (`src/protocol/coordinators/`)

Contracts that compose the kernel without becoming a party to it — the coordinator pattern (`ARCHITECTURE.md` § "Composing the kernel").

**`src/protocol/coordinators/AttestationCoordinator.sol`** — Unified zero-storage attestation,
**merkle-only**, receipt-bound to the signed `agreementHash`. Three modes:
- `attestAsSeller(Commitment role, Commitment target, bytes32 clauseId, uint8 stage, bytes32 sectionHash, bytes32[] proof, bytes32 contentRef)` — role + target commitments; pass the same commitment twice for same-order attestation, or distinct commitments for cross-order within a process.
- `attestAsBuyer(Commitment target, bytes32 clauseId, uint8 stage, bytes32 sectionHash, bytes32[] proof, bytes32 contentRef)` — caller must equal `target.buyer` (which equals rootBuyer by commit invariant).
- `attestViaResolver(Commitment target, ...)` — caller authorized by `IRoleResolver(target.seller).isAuthorized`. **EIP-7702-only precondition**: kernel parties are ECDSA EOAs, so `target.seller` can expose `isAuthorized` code only via 7702 delegation — without it the staticcall finds no code and the path reverts.

The call carries only **fingerprints, never preimages** (matching the batched
path): `sectionHash = keccak256(sectionData)` and `contentRef = keccak256(content)`.
Calldata is public and permanent, so a `private`-disposition section's plaintext
never touches the chain — it lives off-chain (encrypted IPFS), bound to this hash.
For every call, the coordinator verifies an OZ-style merkle inclusion proof of
`leaf = keccak256(keccak256(clauseId || sectionHash))` (double-hashed — leaf/node domain separation) against
`target.agreementHash`, then emits
`Attestation(orderHash, processId, attester, clauseId, stage, contentRef)`
with the caller-supplied `contentRef` (emitted verbatim). It **validates no content shape** — it
binds the attestation to the signed agreement (merkle inclusion) and content-hashes
the evidence; well-formedness is an off-chain SDK + read-time concern. An
attestation whose clause was not committed at contract-signing time cannot land —
the proof won't open (`InvalidInclusionProof` revert). A never-seen clause is
attestable with **zero per-clause on-chain code**.

No new kernel state: `agreementHash` is read from the caller-supplied
Commitment struct, which `_requireKnownCommitment` verifies matches a
committed orderHash via `core.orderStatus`. One of the two live embodiments of
the coordinator pattern — canonical statement in `ARCHITECTURE.md`
§ "Composing the kernel".

4 Certora CVL rules in `certora/AttestationCoordinator.spec` (role-gate +
parametric Core-immutability). Binding-integrity, the `contentRef` emission,
and the inclusion-proof revert path are covered by Foundry tests.

`attestViaResolver` is a latent Level-3 path — no current production caller.
A mechanism contract adopting it must have its seller address implement
`IRoleResolver.isAuthorized(orderHash, caller)`; the inclusion-proof gate fires
before the resolver check.

**`src/protocol/coordinators/IRoleResolver.sol`** — Role-authorization interface for mechanism-delegated attestation.

**`src/protocol/coordinators/WitnessSwapAndCommitCoordinator.sol`** — Off-protocol executor letting a
buyer and/or seller post their FigaroCore bond in a token other than the process
bond currency. One external function, `swapAndCommit(c, buyerSig, sellerSig,
buyerFunding, sellerFunding)`: for each enabled leg it pulls the party's input
token via a Permit2 **witness** signature (`permitWitnessTransferFrom`), forwards
the swap calldata to an immutable `router` (the Uniswap Universal Router in
production), forwards the swapped bond currency to the party's EOA, then calls
`FigaroCore.commit`. Because the kernel pulls each bond from the named party
(`c.buyer`/`c.seller`) and never checks `msg.sender`, the coordinator funds the
party in-place rather than substituting itself — the EIP-712 commitment stays
bilaterally signed and the coordinator never becomes a counterparty. Bond amounts
are derived from the commitment (2·payment, 2·expectedCumulativeValue), never
passed in, so a caller cannot under-fund the pull; the leg reverts
(`OutputBelowBond`) if the swap yields less than the bond. The witness binds
`{router, inputToken, maxInput, keccak256(swapData)}` into a `SwapWitness` the
party signs (helper `swapWitness(inputToken, maxInput, swapData)` recomputes it
for off-chain signers): substitute any of those and the recomputed witness no
longer matches the signed digest — Permit2's own signature check reverts before a
token moves. Without the witness a relayer/front-runner could substitute its own
route — sandwiching the pool or routing to a just-above-bond output — and capture
the slippage residual owed to the party (MED severity; an earlier unhardened
coordinator with exactly that flaw was deleted before any deployment — git
history). Bond currency/amount are NOT re-bound in the witness: they derive from
`c`, already bilaterally EIP-712-signed and kernel-enforced. Immutable
`figaroCore`/`permit2`/`router`, `ReentrancyGuard`, no owner/admin/pause. Kernel
untouched; the swap venue is an off-protocol auxiliary; permissionless
first-write-wins means alternative coordinators with different routers/MEV
policies are valid compositions. Per-party prerequisites: a one-time
`approve(FigaroCore, …)` for the bond currency (same as the plain flow), a
one-time `approve(Permit2, …)` for the input token, and a per-commit Permit2
**witness** signature. Deploy-wired on devnet (`Deploy.s.sol`, composed with
`MockWitnessPermit2` + `MockUniversalRouter`; mainnet uses the canonical Permit2
and a real venue) and UI-wired: the checkout's swap-funding panel builds the
witness-signed buyer leg (`@figaro/sdk` `buildSwapWitnessTypedData` +
`lib/composition/swapFunding.ts`), and any payload carrying one broadcasts
through `swapAndCommit` (`lib/composition/useSwapAndCommitActions.ts`). Its two
token-forwarding sites are tracked in `certora/token-ops.inventory` — both
`[PENDING]` a CVL rule.
Foundry tests in `test/protocol/coordinators/WitnessSwapAndCommitCoordinatorTest.t.sol` cover both
funding legs, residual refunds, and
`test_RevertWhen_SwapDataSubstituted_FrontRunImpossible` (a substituted route
fails witness verification) using `src/mocks/MockWitnessPermit2.sol`, which
verifies the witness signature; digest parity with the canonical Permit2
deployment is proven by `test/protocol/coordinators/WitnessSwapAndCommitCoordinatorForkTest.t.sol`
(mainnet fork, `MAINNET_RPC_URL`-gated). Its local-minimal `IFigaroCore` binding is the
copyable exemplar of the coordinator pattern — canonical statement in
`ARCHITECTURE.md` § "Composing the kernel". EIP-7702 and ERC-4337 variants are
out of scope.

## Verifier (`src/protocol/verifier/`)

The proof-based settlement path that runs beside the direct kernel path (`SCALING_STRATEGY.md`).

**`src/protocol/verifier/FigaroBatchVerifier.sol`** — Proof-based batch settlement (the Track-2
scaling path, `SCALING_STRATEGY.md`; rebuilt 2026-07-16 from the pre-teardown
prototype, upgraded to the witness model). One external function,
`settleBatch(proof, publicValues, positions, events, usage)`: verifies an SP1 proof of
a batch of kernel operations (commits, resolves, witness-gated attestations)
against the immutable `programVKey`, checks state-root continuity + chain
binding, hash-verifies the calldata (positions / attestations / spec bindings,
O(n) assembly packing — byte-exact parity with the Rust kernel's
`compute_*_hash`), **checks every (clause key → witness-spec hash) binding
against `ClauseRegistry.contentHashOf`** — the open-world gate: the vkey covers
the generic clause ENGINE, the registry anchors the constraint set, so a
never-seen registered clause settles through the proven path with zero code
changes while a permissive-spec substitution reverts
(`test_permissionless_newClause_settlesWithZeroVerifierChanges`) — reconciles
net token positions (pull net deposits / push net payouts;
`FeeOnTransferDetected` guard), re-emits proven `Attestation` events (same
topic as the coordinator's — indexers filter by address), **carries the RPGF
usage accrual across to `UsageCounter`** (below), and advances the state root.
Immutable `verifier`/`programVKey`/`clauseRegistry`/`usageCounter`, no owner,
no fee, no upgrade path — a program change is a fresh deploy. NOT a florin
minter.

**The RPGF leg** exists because the two settlement paths are DISJOINT state
universes: a batch-settled process never acquires kernel status, so
`UsageCounter`'s direct path — which requires `FigaroCore.orderStatus ==
RESOLVED` — can never see batched trade, and the 600M would measure a
shrinking fraction of real adoption exactly as the protocol scales. The guest
proves each clause's or assembly's cumulative `(c, d)`; an 8th public value
(`usageAccrualHash`) commits the period, the provenance clause key, those
accruals and the distinct sellers behind them; and `settleBatch` re-derives
that hash from calldata before forwarding to `applyBatchAccrual`. **Both array
lengths are in the hash preimage** — an accrual record is 48 bytes and a
seller 20, so without them the same preimage could be re-split, presenting
accruals whose sellers were never stake-checked. The gates the proof cannot
see (open period, live seller stake, excluded clauses or assemblies) belong to the counter
and are checked there, not here. A batch that credits no usage passes empty
arrays; that call is a no-op, which is what lets trade keep settling after the
reward's last period closes.
The Rust side lives in `prover/` (kernel mirror, generic clause engine, SP1
guest, sequencer); a real local SP1 Core proof of the canonical batch
generates and verifies (`SP1_REAL_PROOF=1 cargo run -p figaro-prove-test
--release`, ~1.2M cycles with the k256 precompile patch). The sequencer is a
liveness convenience, never a trust assumption — direct `FigaroCore` remains
the fallback path. Its two token-moving sites are tracked in
`certora/token-ops.inventory` (`[PENDING]` the realigned
`BatchVerifierTokenOps.spec` cloud run).

**`src/protocol/verifier/ISP1Verifier.sol`** — the Succinct SP1 verifier-gateway ABI
(`verifyProof(programVKey, publicValues, proof)`); devnet wires
`MockSP1Verifier`, mainnet the canonical gateway (env `SP1_VERIFIER_GATEWAY`).

## Usage accounting (`src/protocol/usage/`)

**`src/protocol/usage/UsageCounter.sol`** — counts how much real trade a clause or
assembly carried, **on chain, at the moment it happens**.

It exists because the chain cannot look backwards: `FigaroCore` never calls the
registries, the kernel is frozen, and contracts cannot read events — so no contract
can learn a clause's or assembly's usage after the fact. Reconstructing it later is what forced
the posting/bond/challenge/referee apparatus in the RPGF and match designs; recording
the fact as it happens leaves no claim to believe and nothing to adjudicate.

Two permissionless functions, plus one proof-gated writer for the batch path.
`recordClauseUsage(order, clauseOrAssembly, sectionHash, proof)`
proves two things from data the chain already holds: the order is real and **RESOLVED**
(`core.orderStatus == 2`), and the clause or assembly was committed in that order's signed
agreement (merkle inclusion against `agreementHash`). It carries only the section
FINGERPRINT (`sectionHash = keccak256(sectionData)`), never the preimage — so a
`private`-disposition section's plaintext never touches public calldata. Same check
`AttestationCoordinator` performs, with the status gate inverted — attestation is
evidence *during* an open process, usage is counted only once it has settled. Nobody is
trusted; recording is opt-in and gas-paid by whoever benefits.

`recordAssemblyUsage(order, compositionHash, proof)` credits an **assembly**,
and it exists because the two families are proved differently: an agreement's merkle leaves
are keyed by CLAUSE (`agreement.ts`), so a `compositionHash` is never itself a leaf key. What
IS a leaf is `figaro-assembly-provenance`, whose committed section content is exactly the
compositionHash — **fully determined by it**, so the contract *derives* the provenance
section hash from `compositionHash` (no section arg is taken) and proves that one leaf. A
wrong `compositionHash` derives a leaf that is simply not in the tree, collapsing the old
two-step inclusion-plus-content-match into a single structural gate. The provenance clause
key is fixed at deploy, which stops a caller substituting some other clause. Without that
clause in the agreement, no process can credit its designer.

**Excluded clauses and assemblies earn nothing directly:** `UsageCounter.excludedClauseOrAssembly` holds the
protocol-floor clauses that ride every (or nearly every) agreement — `figaro-commerce`,
`figaro-topology`, and `figaro-assembly-provenance` — and `recordClauseUsage` on any of
them reverts `ClauseOrAssemblyExcluded` by design (scoring the floor would pay its author for
the protocol's own mandatory carriage). The provenance clause's exclusion is what makes
the resolve-time recording loop's clause leg and assembly leg independent: the clause
record on provenance always reverts while `recordAssemblyUsage` still credits the
assembly's designer of record.

Per clause or assembly per period it keeps `c` (distinct settled processes), `d` (distinct
LIVE-STAKED SELLERS of record — ruled 2026-07-31), and `score = icbrt(c·d²·1e18)` when
`d ≥ minSellers`, else **zero** — **UNIFORM**, breadth weighted twice as heavily as
volume, value deliberately not a term. There is **no tag, category, or weight
multiplier**: every clause's and assembly's score is its real usage alone (ratified 2026-07-29 — the
substrate-broadening weight and `boostedTag`/`rpgfTagOf` read are deleted). **Why sellers,
not (buyer, seller) pairs (the pre-2026-07-31 statistic):** pairs cannot be priced — the
buyer side holds no stake, so one staked seller plus N free buyer wallets was N units of
the score's dominant term at gas cost, and even staking both sides prices pairs
sublinearly (k staked buyers × m staked sellers mint k·m pairs from k+m deposits).
Distinct staked sellers is the leverage-free statistic: n units of breadth cost n live
stakes, exactly linear, which is what the Sybil bound's rent-dissipation argument needs.
**The minimum-support floor** (`minSellers`, constructor-immutable; mainnet 3, devnet
rehearses 3): a clause or assembly scores nothing in a period until 3 distinct staked sellers have
carried it there — below the floor sit exactly the clauses and assemblies one actor can fabricate
alone (self-farms, fragmentation shards, squatted names, trivial riders). Counting is
never refused below the floor; the score springs whole when it is crossed. The floor
lives in `_score`, so both settlement paths inherit it identically and PER PATH — the
chain cannot union the paths' seller sets, and per-path flooring only ever under-pays a
boundary case, never lets one seller straddle the universes.

**Reading the exponent.** `score = d·(c/d)^(1/3)` — distinct relationships, times average
repeat depth raised to α. So **α is the elasticity of reward to repeat depth** (8× the depth
earns 2× the score), and when every pair trades once (`c = d`) the score is the count itself
for any α at all. Worked rows (score in units of `1e6`-scaled `icbrt(c·d²·1e18)`,
shown here unscaled as `d·(c/d)^(1/3)`):

| c (uses) | d (staked sellers) | c/d | score ≈ | reading |
|---|---|---|---|---|
| 8 | 8 | 1 | 8.0 | every pair once — score is the breadth itself |
| 8 | 2 | 4 | 3.2 | same volume, thin breadth — depth discounted |
| 64 | 8 | 8 | 16.0 | 8× the depth of row 1 earns 2× its score |
| 64 | 2 | 32 | 6.3 | volume farming on two counterparties barely moves it | `α < 1/2` is justified because a new relationship informs more than another
observation of a known one; **α = 1/3 exactly is a JUDGMENT, not a derivation** — uniform
across clauses and assemblies, so it is not curation. It is **not** a Sybil defense and must not be
described as one (2026-07-30): no scoring shape can separate a fabricated counterparty from a
genuine one. **Seller-side live-stake gate:** a record counts only if
the process's seller-of-record holds a live `MembersRegistry` stake
(`members.registered(order.seller)`, else `SellerNotStaked`) — and since `d` counts distinct
staked sellers, this one gate prices breadth itself: fabricating `d` units costs one
base-currency (ETH) stake per fake seller, linearly. The gate closes at
`requestWithdrawal()`, not at `withdraw()`: eligibility ends when the member asks to
leave, while the ETH is still locked. Scope it honestly — this prices the SELLER
identity, not breadth itself (the buyer side is ungated by design), and the price is
real only because the deposit carries a **withdrawal cooldown**; without one the same
deposit is recycled through identity after identity.

**Accrual buckets into fixed periods, not checkpoints.** A period's counts are final
once it ends, so a consumer paying out for it reads a number that can no longer move —
no snapshots, no checkpoint arrays, no history walk. Periods are generic: this contract
knows nothing about tranches, rewards, or who pays. A running `totalScoreIn(period)` is
maintained as an O(1) delta on every record.

**The batch path — `applyBatchAccrual(period, provenanceClause, accruals, sellers)`.**
Batch-settled trade never acquires kernel status, so it can never travel the two
functions above; it arrives here instead, and only from `FigaroBatchVerifier`
(`batchVerifier`, immutable). This is a **proof-gated writer, not an admin** — the
caller has no discretion, only numbers an immutable vkey committed;
`DESIGN_DECISIONS.md` §16 owns that argument and an auditor should read it before
filing the finding. The write is an OVERWRITE of the clause's or assembly's CUMULATIVE `(c, d)`
for the period, because the guest proves the running totals off-chain — so this
contract keeps **no per-process storage for the batch path at all**, and cost is
O(distinct clauses and assemblies in the batch) rather than O(records). That is the whole economy
of the bridge: ~85% of a direct record's ~169k gas is storage plus `icbrt`, so
batching only the authorisation would have saved nothing. Counts are asserted
non-decreasing (`AccrualWentBackwards`) — free, since the previous score is read for
the running total anyway, and it turns a guest regression into a revert rather than
silently destroyed accrual. **What the proof cannot see is checked here**, because it
is live chain state this contract owns: the open period (`PeriodMismatch` — the chain
decides, never the sequencer's clock), each seller's live stake, and the excluded set.
An EMPTY accrual returns before `currentPeriod()` is consulted, and must: otherwise
every batch would revert `AccrualClosed` forever once the last period ended, and the
reward path would brick the scaling path.

**Merging the two paths: sum the SCORES, never the components.** `scoreOf(clauseOrAssembly,
period)` returns `accrualOf.score + batchAccrualOf.score`, and `totalScoreIn` counts
both. Adding `c` to `c` and `d` to `d` would over-count breadth for any (buyer, seller)
pair active on both sides — the chain holds counts, not the pair SETS needed to union
them, so an attacker splitting one relationship across the two universes would be paid
twice for breadth they never had. Summing scores can never over-count: the score is
concave and homogeneous of degree 1, so the component merge is superadditive, and the
shortfall is EXACTLY ZERO when the split is proportional. No PROCESS is ever counted
on both sides — the universes are disjoint. **`RpgfMinter` reads `scoreOf`**; a reader
that reaches for `accrualOf` alone silently under-reports every clause or assembly whose trade
moved to batches, and the batch leg emits its own `BatchUsageRecorded` (cumulative,
REPLACES rather than adds) which an indexer must fold differently from `UsageRecorded`.

`icbrt` binary-searches the floor cube root with its ceiling clamped to
`CUBE_MAX = floor(cbrt(2^256-1))`, so the cube cannot overflow. **The bound belongs to the
type the arithmetic is done in:** until 2026-07-30 it was `floor(cbrt(2^64-1)) = 2642245`,
which SATURATED every score above `c·d² ≥ 19` at that constant — flattening real usage and
collapsing the pro-rata split toward equal shares. The fuzz test that should have caught it
sampled `uint64` only, the one domain where the wrong bound is coincidentally exact; it now
fuzzes the whole `uint256` domain, and the fix was corroborated against solady's audited
`FixedPointMathLib.cbrt` over 512 runs.

**Idempotence is GLOBAL — a process counts ONCE EVER per clause or assembly** (ruled 2026-07-30),
in whichever period it is first recorded. A resolved order stays resolved and its struct is
public in the commit event, so a per-period key let the same trade be re-presented in every
period: rational play became "re-record everything each period," which pays for *recording
gas* rather than adoption (an author who records once and moves on collects nothing later,
while one who knows to re-record collects three times on the same trades) and let a
fabricated period-0 farm be milked across every later period. Each period now counts only
usage NEW to it — what a fixed per-period budget schedule assumes.

**The per-pair cap of 5 was DELETED 2026-07-30, and pairs themselves on 2026-07-31.** The
cap was introduced as a farming defense and did not work as one: an attacker maximising
score per unit cost always chooses ONE trade per fabricated counterparty (score per cost
falls as `t^(-2/3)` in trades-per-counterparty), so the cap sat at 5 and never bound —
while it did bind honest repeat trade. The `c^(1/3)` exponent already discounts repetition
far more steeply than the cliff did. The pair statistic followed it out for the deeper form
of the same disease (unpriceable breadth — see above); breadth is now `sellerSeen`, a
boolean per (clause-or-assembly, period, seller). **The general rule both instances teach: Sybil
resistance cannot live in the shape of the score.** No scoring function can separate a
fabricated counterparty from a genuine one — any concavity that dampens fake breadth
dampens real breadth identically — so it can only live in the cost of an identity, which is
the registries' stake terms; the 07-31 ruling made the score's dominant statistic count
ONLY what those terms have priced.

**Gas anchor — `recordClauseUsage` costs ~168,678 all-in** (`forge --gas-report` median; ~162,642
in-test execution, which excludes calldata charged at the tx level). The anchor and its
regression guard live in `UsageCounterTest.RECORD_USAGE_GAS`; it is deliberately NOT in
`sdk/src/gasCeilings.ts`, which derives per-block/per-process CEILINGS and has no consumer for
this figure. Any analysis costing manufactured usage (the RPGF soundness bound's `γ`) cites
that anchor plus the 21,000 tx base cost — never a re-derivation. Same discipline as the
kernel's `COMMIT_GAS_PER_ORDER`/`RESOLVE_GAS_PER_ORDER` pair: one measured home, everything
else quotes it.

No owner, no admin, no pause; records are idempotent per (clause-or-assembly, process).
Foundry tests in `test/protocol/usage/UsageCounterTest.t.sol` (the count is derived,
never stored; incl. the fuzzed `icbrt` floor-cube-root property over all of `uint256`,
and a no-saturation regression).

## The florin (`src/florin/`)

**`src/florin/FlorinToken.sol`** — ERC-20 + EIP-2612 permit. 1B MAX_SUPPLY hard cap on every mint.
Reentrancy-guarded. Minter registry with `totalRegisteredCap` (sum of all registered
caps enforced not to exceed MAX_SUPPLY). Deployer registers capped minters, then renounces.

**`src/florin/IFlorinMinter.sol`** — `mint(address, uint256)` interface florin minter modules implement; `FlorinToken.registerMinter` is where implementations attach (before renounce).

**Florin allocation:** `FLORIN_TOKEN.md` owns the canonical allocation table; the
incentive rationale lives in `docs/PUBLIC_GRAPH_MODEL.md`.

Deploy flow: deployer deploys `RpgfMinter`, registers it with cap 600M, registers itself
as a one-shot genesis minter with cap 400M, mints 70M+30M+300M to the founder/supporters/DAO
wallets, then renounces — the minter must exist at genesis because `registerMinter` precedes
`renounceDeployerMint`. No settlement-anchored emission.

## RPGF (`src/rpgf/`)

The **600M retroactive distribution** — one claim per ANNUAL accrual period, budgets
grouped into three RISING tranches (ruled 2026-07-31): 15% of the reserve over years 1–2,
30% over years 3–5, 55% over years 6–9, each tranche split equally across its years
(45M/45M · 60M×3 · 82.5M×4). Rising, because the largest share should pay on the
most-measured evidence — the early network is the thinnest, most manipulable denominator,
and early evidence-poor funding is the 300M DAO treasury's job. Annual, because authors
cannot price a multi-year lag in an unpriced token, and shorter periods shrink the deposit
recycling window. Paid to clause authors and assembly designers of record, in proportion
to the trade their clauses and assemblies actually carried. No donors, no pool. No buyer or seller
touches it.

**`src/rpgf/RpgfMinter.sol`** — `claim(periodId, clausesOrAssemblies)` mints `periodAmount · callerScore / totalScoreInPeriod`, once per wallet per period (a wallet passes every clause or assembly it authored in that one call). The tranche grouping is deploy-script data; the minter knows only periods and their budgets, and validates its budget array against `UsageCounter.periodCount()` at deploy so the two schedules cannot drift (`AmountsPeriodsMismatch`).

**There is nothing to post, nothing to bond, and nothing to dispute.** `UsageCounter` (above) records verified usage as it happens, so a period's payout is arithmetic over numbers that are already final. `claim` requires `counter.periodClosed(periodId)`, which is why no snapshot, checkpoint array, or history walk is needed.

**The caller's list must be duplicate-free** — a repeat reverts `DuplicateClauseOrAssembly`. Until
2026-07-30 duplicates were summed and the sum then CLAMPED to the period total, so an author
of record for ANY clause or assembly with a non-zero score could repeat it until the sum reached the
denominator and mint the entire period budget, leaving every other author to revert on
the budget backstop; the clamp was what made it maximal, silently rounding a malformed
claim up to the whole pool rather than letting the budget backstop reject it. Both are gone —
with distinct clauses and assemblies `score ≤ total` holds structurally, so there is nothing to clamp.
(The test that was supposed to cover this passed a SOLE clause or assembly, where taking 100% is the
correct answer either way — a case that cannot distinguish inflation from correctness.)

Each clause or assembly in the caller's list is verified against its own registry **with a live stake** — `ClauseRegistry.depositOf` (registrar == caller AND `withdrawn == false`) for a clause, `AssemblyRegistry.bindings` (author == caller AND `depositWithdrawn == false`) for an assembly — so the list is a lookup key, never a claim of ownership (the families are parallel; both anchors are consulted because neither knows the other exists). This `!withdrawn` requirement is the **author-side** half of the two-sided live-ETH-stake gate (its seller-side half is `UsageCounter`'s stake check above): you earn RPGF only while your clause's or assembly's stake stays live. Payout is **UNIFORM pro rata with no cap** — `periodAmount · score / total`, straight; the fixed 600M pool is one a farmer dilutes, never inflates (the old 15% cap was arbitrary and is deleted).

No owner, no pause, no sweep, no claim expiry — a closed period's arithmetic is stable forever. The budget is enforced twice: `minted` per period here, and the outer FlorinToken minter cap (600M registered at genesis before `renounceDeployerMint`, which is why this contract must exist at florin genesis). Foundry: `test/rpgf/RpgfMinterTest.t.sol` + `test/rpgf/RpgfIntegrationTest.t.sol` (no stubs — real process → real counter → real mint).

`sdk/src/rpgf/` mirrors the scoring off-chain for display and verification (and `sdk/src/rpgf/formula.json` states the mechanism normatively). It **recomputes what the chain already holds** — nothing is anchored, so there is no `formulaHash` and no posted answer for the mirror to assert.

**No match rounds, no quadratic funding.** The 300M DAO treasury funds public goods by DECIDING to — discretionary spend, the human-judgment layer the 600M deliberately avoids — not through a crowd mechanism. `MatchPool`/QF was deleted (ratified 2026-07-29): nothing in the 300M intention called for a Sybil-fragile match round.

## Test / Mock Contracts

- `src/mocks/MockERC20.sol` — the devnet payment/bond token. Plain ERC-20 with a permissionless `mint(to, amount)`; constructor takes `(name, symbol)`. Deployed by `Deploy.s.sol` as `NEXT_PUBLIC_TOKEN_ADDRESS` (minted 100k to anvil[0..19]) and used by the Foundry tests — one mock, not a per-file inline copy. (Mainnet uses a real ERC-20, e.g. USDC.e.)
- `src/mocks/MockERC20FeeOnTransfer.sol`, `MockPermitToken.sol` — fee-on-transfer ERC-20 (Foundry tests only) and a second devnet ERC-20 (EIP-2612-capable, incidental — `Deploy.s.sol` deploys it as `NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS`; used as the swap-funding input token and the MOCKP seller-catalogue token; the V3 `*WithPermit` flow it once served is gone).
- `src/mocks/MockWitnessPermit2.sol` — devnet/test stand-in for Uniswap Permit2's `permitWitnessTransferFrom`, WITH witness-signature verification (reconstructs the exact digest real Permit2 builds; deadline + amount enforced), pulling the owner's input token under the standard one-time Permit2 approval. Used by `WitnessSwapAndCommitCoordinatorTest` and deployed by `Deploy.s.sol` as `NEXT_PUBLIC_PERMIT2`; mainnet uses the canonical Permit2.
- `src/mocks/MockTreasuryMultisig.sol` — devnet/test stand-in for the DAO treasury Safe (mainnet composes a canonical Safe at `DAO_WALLET` — config, never authored code): Safe's approveHash flow (propose → threshold approvals → anyone executes), no owner acts alone. Deployed by `Deploy.s.sol` as `NEXT_PUBLIC_DAO_TREASURY` (anvil[0..2] placeholder owners, 2-of-3) and the 300M devnet genesis mint target; `TreasuryProcurementTest` rehearses the funded operator-EOA procurement loop against it.
- `src/mocks/MockDisperse.sol` — devnet stand-in for the canonical public multisender (Disperse.app, `0xD152f549545093347A162Dce210e7293f1452150`); mirrors its verified interface and behavior — `disperseEther` (legs + remainder refund), `disperseToken` (aggregate pull then legs), `disperseTokenSimple` (per-leg pulls), every batch atomic. Used by `MockDisperseTest` and deployed by `Deploy.s.sol` as `NEXT_PUBLIC_MULTISENDER`; mainnet composes the canonical deployment.
- `src/mocks/MockUniversalRouter.sol` — test stand-in for a swap venue; `swap(tokenIn, tokenOut, amountIn, recipient)` at a settable rate, paying out of pre-funded liquidity. Used by `WitnessSwapAndCommitCoordinatorTest` and deployed by `Deploy.s.sol` as `NEXT_PUBLIC_SWAP_ROUTER` (pre-funded with both devnet tokens); mainnet uses the real Uniswap Universal Router.
- `src/mocks/MockSP1Verifier.sol` — devnet/test stand-in for Succinct's SP1 verifier gateway behind `ISP1Verifier`: accepts any proof, so the batch path runs end-to-end on Anvil without proving hardware. Deployed by `Deploy.s.sol` for `FigaroBatchVerifier`; mainnet wires the canonical gateway (`SP1_VERIFIER_GATEWAY`).
- `src/mocks/MockReentrantToken.sol` — Foundry-tests-only malicious ERC-20 that re-enters an armed target on `transfer`/`transferFrom` (the fee-on-transfer / ERC-777 hook an attacker gets). Used by `ReentrancyAdversarialTest` to prove the `nonReentrant` guards on `FigaroCore.commit`/`resolveProcess` and `FigaroBatchVerifier.settleBatch` actually fire under a live re-entry attempt. Never deployed.
- `src/echidna/EchidnaFuzzer.sol`, `EchidnaFlorinToken.sol`, `EchidnaToken.sol`

## What Does NOT Exist

**Dutch auction — DELETED 2026-07-02.** Competitive pricing was abandoned: a mid-chain order whose price or counterparty is unknown at signing is structurally incompatible with the kernel's exact-match cumulative accumulator, and the V3-style workaround (contract-as-seller + float-vault bond lending) is banned three ways. Pricing is a catalogue concern (e.g. rate × geohash distance).

**Carbon-offset apparatus — DELETED 2026-07-03.** `ProcessOffsetReceipt.sol`,
`MockOffsetAggregator.sol`, the aggregator bridge, and the
`figaro-offset-policy` clause were removed: the deployment network (Ethereum
Mainnet) has no live documented retirement router to compose with (Toucan is
Polygon/Celo; Klima's aggregator is deprecated in favor of an off-network REST
API; Moss has none), and a cross-chain retirement can't be verified from the
process's chain without a trusted bridge. Emissions *disclosure*
(`figaro-emissions` + attestations) survives — it never depended on a router. An
offset re-enters, permissionlessly, as a new clause naming a mainnet router's
interface when one exists.

**Multisender — composed, not owned.** Batch dispersal (one payment, many
recipients, one transaction) is post-settlement fiscal routing: a wallet
splits its own receipts — fiscal remittance, savings, obligations — to
earmarked addresses, producing a self-sovereign fiscal trail as a byproduct.
It never reads FigaroCore, bonds, or any registry, and the network already
supplies it: mainnet composes the canonical public **Disperse** deployment
(`0xD152f549545093347A162Dce210e7293f1452150` — verified, ownerless, live
since 2018 at the same address across 16 chains) — fifth-noun composition,
never a Figaro-owned duplicate. `src/mocks/MockDisperse.sol` mirrors its
verified interface so devnet rehearses the composition; `Deploy.s.sol`
deploys it as `NEXT_PUBLIC_MULTISENDER` (mainnet points the same variable at
the canonical address).

**Per-clause validator contracts — permanently.** The 17 `src/clauseValidators/*`
validators, `IClauseValidator.sol`, `MockClauseValidator.sol`,
`ClauseRegistrationHelper.sol`, and `JSONSchemaValidator.sol` were deleted in the
2026-06-25 teardown and never return: a clause is DATA (a spec JSON anchored on
`ClauseRegistry`), not code. In-proof clause validation lives in the rebuilt
generic prover engine (see `FigaroBatchVerifier` above) — the engine validates
against witness specs anchored by `contentHashOf`, so no clause ever needs a
contract. On the DIRECT path, validation remains off-chain Layer-A (SDK
`validate.ts`/`encode.ts`) + the coordinator's merkle/content-hash binding.

**The optimistic posting apparatus — DELETED 2026-07-27, permanently.** `IRpgfArbitrator`,
`KlerosRpgfAdapter`, `MockArbitrator`, `MockKlerosCourt`, `DonationRail`,
`OptimisticMatchPool`, and its successor `MatchPool`/all quadratic funding are gone, along
with every posted root, ETH bond, challenge window,
dispute window, and forum callback in the reward path. They existed because the chain
cannot look backwards — `FigaroCore` never calls the registries, the kernel is frozen, and
contracts cannot read events — so usage had to be reconstructed off-chain, POSTED, made
costly with a BOND, contestable with a CHALLENGE, and settled by a FORUM. `UsageCounter`
counts the fact as it happens instead, and every layer of
that apparatus disappears with it. The 300M DAO treasury funds public goods by discretionary
decision, not a crowd/match mechanism. **This does not touch clause-tier arbitration:**
`figaro-arbitration-kleros`, the `composesForumUrl` recourse seam, and the evidence bundle
are a different object at a different tier and are untouched (`CLAUSES.md`,
`THEORY.md` Layer 3).

Also absent: `FigaroFactory.sol`, `FigaroRouter.sol`, `governance/`, `compliance/`,
`FigEmission.sol`, `FigTimeLock.sol`, `MerkleAirdrop.sol`, `StagedMerkleAirdrop.sol`,
`TrancheVesting.sol` (founder, supporters, and DAO receive tokens at genesis with no vesting),
`ProximityTypes.sol`, `IRoleResolverV4.sol` (renamed to `IRoleResolver.sol`),
upgradeable proxy, protocol fee, owner, or admin surface.
The florin is not a governance token.

### Teardown state — CLOSED (the canonical statement)

This subsection is the OWNER of teardown state (per the ownership map in `README.md`).
Every other surface — docs, marketing pages, agent prompts, memories — states this only
as a summary plus a pointer here.

**Every surface removed in the 2026-06-25 proof-apparatus teardown has been rebuilt;
nothing remains deferred:**

- **The RPGF distribution** is live as `UsageCounter` + `RpgfMinter` (recipients =
  clause authors + assembly designers of record; usage counted on chain as it happens,
  paid pro rata from a closed accrual period; the minter ships in TESTNET and gates
  florin genesis). The 2026-07-15 optimistic intermediate — posted merkle root under an
  ETH bond, challenge window, arbitrator seam (`IRpgfArbitrator`, `KlerosRpgfAdapter`,
  `MockArbitrator`, `MockKlerosCourt`) — was **deleted 2026-07-27** and does not return:
  the whole apparatus existed only to make the chain believe a claim about the past, and
  recording the fact as it happens leaves no claim to believe.
  `FLORIN_TOKEN.md` carries the allocation; `PUBLIC_GRAPH_MODEL.md` the rationale.
- **On-chain clause-content validation + the batch prover/verifier/sequencer**
  returned 2026-07-16 as the witness-based proof apparatus (`prover/` +
  `FigaroBatchVerifier` above). It is a STRICT upgrade over the removed prototype:
  the SP1 guest holds a generic clause ENGINE and no clauses — specs arrive as
  witness inputs bound to `ClauseRegistry.contentHashOf`, so registering a clause
  never touches the prover, the vkey, or the verifier. The per-clause Layer-C
  validators never return (see "What Does NOT Exist").

**PERMANENT — the property the rebuild preserves:** a never-seen clause is attestable
permissionlessly with zero per-clause on-chain code, and the coordinator's merkle
binding stays the direct path's integrity floor. In-proof content validation is a
property of the BATCHED path; the direct path validates no content shape.

**Reading rule:** the "rebuild pre-launch" markers that guarded launch-state literature
are retired — present-state surfaces state the apparatus as built (devnet-deployed;
mainnet wires Succinct's verifier gateway by env). What remains two-tense is
DEPLOYMENT: no public network deployment exists yet, so surfaces must not claim a
live mainnet/testnet.

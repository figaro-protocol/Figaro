# Smart Contracts — What Actually Exists (V5)

All contracts in `src/`. Solidity 0.8.26, Foundry. V3 in `archive-v3/`.

**The directory IS the tier map** (reorganised 2026-07-27) — `src/kernel/` · `src/protocol/{registries,coordinators,verifier,usage}/` · `src/florin/` · `src/rpgf/` · `src/mocks/` · `src/echidna/`. The sections below mirror those directories exactly; if they ever diverge, the filesystem is right. Establish a contract's tier from its path before citing any doctrine at it — `docs/LEXICON.md` § "Failure modes" (Folding).

No contract belongs to a dapp. Every contract is a permissionless primitive.

This file is the canonical inventory. CLAUDE.md indexes it; agents must not reference contracts not listed here.

## Kernel (`src/kernel/`)

The frozen settlement primitive. Never edited — see CLAUDE.md § Agent Permissions.

**`src/kernel/FigaroCore.sol`** — The protocol kernel. No owner, no fee, no escape hatches.
- 2 external functions: `commit` (unified dual-signed), `resolveProcess`
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

The three artifact-family anchors — **parallel, not nested**. Each has its own identity scheme, evolution path, and event stream; none references another's existence.

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
the count lives in the indexer (the same count RPGF pays on) and hardens
on-chain when the RPGF proof apparatus returns. There is **no on-chain
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

**`src/protocol/registries/SellerRegistry.sol`** — Permissionless seller self-registration with
reclaimable ETH deposit (staked intent — K4, no time lock). Three external
functions: `register(metadataURI)` (sets the dedup guard, consumes the
deposit, emits `SellerRegistered`), `updateProfile(metadataURI)` (caller-only
metadata replacement, no deposit movement, emits `SellerProfileUpdated`), and
`withdraw()` (returns the deposit and clears the dedup guard — allowed at any
time; withdrawing DE-SURFACES the seller, so pollution costs deposit ×
time-surfaced rather than calendar time). Three events: `SellerRegistered`,
`SellerProfileUpdated`, `SellerWithdrawn`. State is dedup-only
(`_registered: address → bool`). **No `_active` flag, no role enum, no
`deactivate` / `reactivate`**: seller availability is signal-by-availability
off-chain, not registry state, and a seller's role is DERIVED from the orders
it holds and the clauses they carry — never a stored field. The deposit is a
spam-protection knob only; profile updates do not require withdrawing. The
kernel does not gate any operation on seller state — this registry is
advisory metadata for off-chain discovery surfaces.

**`src/protocol/registries/AssemblyRegistry.sol`** — Permissionless assembly anchoring with a
reclaimable ETH deposit. An assembly is a composition template that USES
clauses; this registry is the assembly artifact family's anchor, parallel to
`ClauseRegistry` (clauses) and `SellerRegistry` (sellers) per the
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
`settleBatch(proof, publicValues, positions, events)`: verifies an SP1 proof of
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
topic as the coordinator's — indexers filter by address), and advances the
state root. Immutable `verifier`/`programVKey`/`clauseRegistry`, no owner, no
fee, no upgrade path — a program change is a fresh deploy. NOT a florin minter.
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
can learn an artifact's usage after the fact. Reconstructing it later is what forced
the posting/bond/challenge/referee apparatus in the RPGF and match designs; recording
the fact as it happens leaves no claim to believe and nothing to adjudicate.

Two permissionless functions. `recordUsage(order, artifact, sectionHash, proof)`
proves two things from data the chain already holds: the order is real and **RESOLVED**
(`core.orderStatus == 2`), and the artifact was committed in that order's signed
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

Per artifact per period it keeps `c` (distinct settled processes), `d` (distinct
(buyer, seller) pairs), and `score = icbrt(c·d²·1e18)` — **UNIFORM**, breadth weighted
twice as heavily as volume, value deliberately not a term. There is **no tag, category, or
weight multiplier**: every artifact's score is its real usage alone (ratified 2026-07-29 —
the substrate-broadening weight and `boostedTag`/`rpgfTagOf` read are deleted). A **pair
cap of 5** drops further processes from the same pair entirely, so repeat trade between two
wallets cannot farm an artifact. **Seller-side live-stake gate:** a record counts only if
the process's seller-of-record holds a live `SellerRegistry` stake
(`sellers.registered(order.seller)`, else `SellerNotStaked`) — fabricating `d` distinct
pairs costs one base-currency (ETH) stake per fake seller.

**Accrual buckets into fixed periods, not checkpoints.** A period's counts are final
once it ends, so a consumer paying out for it reads a number that can no longer move —
no snapshots, no checkpoint arrays, no history walk. Periods are generic: this contract
knows nothing about tranches, rewards, or who pays. A running `totalScoreIn(period)` is
maintained as an O(1) delta on every record.

No owner, no admin, no pause; records are idempotent per (artifact, period, process).
Foundry tests in `test/protocol/usage/UsageCounterTest.t.sol` (22, incl. a fuzzed
`icbrt` floor-cube-root property).

## The florin (`src/florin/`)

**`src/florin/FlorinToken.sol`** — ERC-20 + EIP-2612 permit. 1B MAX_SUPPLY hard cap on every mint.
Reentrancy-guarded. Minter registry with `totalRegisteredCap` (sum of all registered
caps enforced not to exceed MAX_SUPPLY). Deployer registers capped minters, then renounces.

**`src/florin/IFlorinMinter.sol`** — `mint(address, uint256)` interface florin minter modules implement; `FlorinToken.registerMinter` is where implementations attach (before renounce).

**Florin allocation (canonical, 1B total):**
- **70M (7%) founders** — genesis mint, no vesting, no unlock
- **30M (3%) supporters** — friends & family / early supporters; genesis mint, no vesting, no unlock
- **300M (30%) DAO**       — genesis mint, no vesting, no unlock
- **600M (60%) RPGF** — clause authors + assembly designers of record, distributed by
  `RpgfMinter` below. The incentive rationale lives in `docs/PUBLIC_GRAPH_MODEL.md`.

Deploy flow: deployer deploys `RpgfMinter`, registers it with cap 600M, registers itself
as a one-shot genesis minter with cap 400M, mints 70M+30M+300M to the founder/supporters/DAO
wallets, then renounces — the minter must exist at genesis because `registerMinter` precedes
`renounceDeployerMint`. No settlement-anchored emission.

## RPGF (`src/rpgf/`)

The **600M retroactive distribution** — three declining tranches (300M / 200M / 100M) paid to clause authors and assembly designers of record, in proportion to the trade their artifacts actually carried. No donors, no pool. No buyer or seller touches it.

**`src/rpgf/RpgfMinter.sol`** — `claim(trancheId, artifacts)` mints `trancheAmount · callerScore / totalScoreInPeriod`, once per wallet per tranche (a wallet passes every artifact it authored in that one call).

**There is nothing to post, nothing to bond, and nothing to dispute.** `UsageCounter` (above) records verified usage as it happens, so a tranche is arithmetic over numbers that are already final. Tranche `i` pays for accrual period `i` — the counter's periods and these tranches are ONE schedule, configured consistently at deploy — and `claim` requires `counter.periodClosed(trancheId)`, which is why no snapshot, checkpoint array, or history walk is needed.

Each artifact in the caller's list is verified against its own registry **with a live stake** — `ClauseRegistry.depositOf` (registrar == caller AND `withdrawn == false`) for a clause, `AssemblyRegistry.bindings` (author == caller AND `depositWithdrawn == false`) for an assembly — so the list is a lookup key, never a claim of ownership (the families are parallel; both anchors are consulted because neither knows the other exists). This `!withdrawn` requirement is the **author-side** half of the two-sided live-ETH-stake gate (its seller-side half is `UsageCounter`'s stake check above): you earn RPGF only while your artifact's stake stays live. Payout is **UNIFORM pro rata with no cap** — `trancheAmount · score / total`, straight; the fixed 600M pool is one a farmer dilutes, never inflates (the old 15% cap was arbitrary and is deleted).

No owner, no pause, no sweep, no claim expiry — a closed period's arithmetic is stable forever. The budget is enforced twice: `minted` per tranche here, and the outer FlorinToken minter cap (600M registered at genesis before `renounceDeployerMint`, which is why this contract must exist at florin genesis). Foundry: `test/rpgf/RpgfMinterTest.t.sol` + `test/rpgf/RpgfIntegrationTest.t.sol` (no stubs — real process → real counter → real mint).

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

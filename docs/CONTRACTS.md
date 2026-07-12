# Smart Contracts — What Actually Exists (V5)

All contracts in `src/`. Solidity 0.8.26, Foundry. V3 in `archive-v3/`.

No contract belongs to a dapp. Every contract is a permissionless primitive.

This file is the canonical inventory. CLAUDE.md indexes it; agents must not reference contracts not listed here.

## Core Protocol

**`src/FigaroCore.sol`** — The protocol kernel. No owner, no fee, no escape hatches.
- 2 external functions: `commit` (unified dual-signed), `resolveProcess`
- 3 mappings: `processes` (ProcessState), `orderStatus` (uint8), `orderProcessId` (bytes32)
- EIP-712 dual-signed commitments; asymmetric bonding; direct transfer at resolution
- Covered by Foundry unit tests, 7 Echidna properties (EchidnaFuzzer), 7 Halmos symbolic proofs (HalmosFigaroCore), and 4 Certora CVL specs across the protocol (FigaroCore, AttestationCoordinator, TokenOpsVerification, FigToken — see `docs/VERIFICATION_MAP.md` for the current per-contract verification coverage)

**`src/CommitmentTypes.sol`** — EIP-712 typed structs and hash functions.
Single `Commitment` struct for both root and sub-orders; `processId` zero for root.
`salt` is identity (repeat orders hash distinctly); `deadline` is expiry of the
unconsummated dual-signature window — a signature cannot be revoked (no cancel,
by doctrine), so it must age out (`DeadlineExpired` gates commit; nothing
expires post-commit). See `DESIGN_DECISIONS.md` §13.

## Attestation & Clause

**`src/AttestationCoordinator.sol`** — Unified zero-storage attestation,
**merkle-only**, receipt-bound to the signed `agreementHash`. Three modes:
- `attestAsSeller(Commitment role, Commitment target, bytes32 clauseId, uint8 stage, bytes sectionData, bytes32[] proof, bytes content)` — role + target commitments; pass the same commitment twice for same-order attestation, or distinct commitments for cross-order within a process.
- `attestAsBuyer(Commitment target, bytes32 clauseId, uint8 stage, bytes sectionData, bytes32[] proof, bytes content)` — caller must equal `target.buyer` (which equals rootBuyer by commit invariant).
- `attestViaResolver(Commitment target, ...)` — caller authorized by `IRoleResolver(target.seller).isAuthorized`.

For every call, the coordinator verifies an OZ-style merkle inclusion proof of
`leaf = keccak256(clauseId || keccak256(sectionData))` against
`target.agreementHash`, then emits
`Attestation(orderHash, processId, attester, clauseId, stage, contentRef)`
where `contentRef = keccak256(content)`. It **validates no content shape** — it
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
parametric Core-immutability). Binding-integrity, `contentRef == keccak256(content)`,
and the inclusion-proof revert path are covered by Foundry tests.

`attestViaResolver` is a latent Level-3 path — no current production caller.
A mechanism contract adopting it must have its seller address implement
`IRoleResolver.isAuthorized(orderHash, caller)`; the inclusion-proof gate fires
before the resolver check.

**`src/ClauseRegistry.sol`** — Permissionless clause anchoring with a
reclaimable ETH deposit (staked intent — K4).
`clauseId` is the bare human-readable name; the on-chain dedup key is `keccak256(abi.encode(clauseId, version))` (details in CLAUSES.md). `uriHash` points at off-chain JSON spec.
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

**`src/IRoleResolver.sol`** — Role-authorization interface for mechanism-delegated attestation.

## Mechanism Modules

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

**`src/SwapAndCommitCoordinator.sol`** — Off-protocol executor letting a buyer
and/or seller post their FigaroCore bond in a token other than the process bond
currency. One external function, `swapAndCommit(c, buyerSig, sellerSig,
buyerFunding, sellerFunding)`: for each enabled leg it pulls the party's input
token via a Permit2 signature (`IPermit2SignatureTransfer.permitTransferFrom`),
forwards caller-supplied swap calldata to an immutable `router` (the Uniswap
Universal Router in production), forwards the swapped bond currency to the
party's EOA, then calls `FigaroCore.commit`. Because the kernel pulls each bond
from the named party (`c.buyer`/`c.seller`) and never checks `msg.sender`, the
coordinator funds the party in-place rather than substituting itself — the
EIP-712 commitment stays bilaterally signed and the coordinator never becomes a
counterparty. Bond amounts are derived from the commitment (2·payment,
2·expectedCumulativeValue), never passed in, so a caller cannot under-fund the
pull; the leg reverts (`OutputBelowBond`) if the swap yields less than the bond.
`ReentrancyGuard`; immutable `figaroCore`/`permit2`/`router`. Kernel untouched;
the swap venue is an off-protocol auxiliary; permissionless first-write-wins
means alternative coordinators with different routers/MEV policies are valid
compositions. Per-party prerequisites: a one-time `approve(FigaroCore, …)` for the
bond currency (same as the base flow) plus a one-time `approve(Permit2, …)` for
the input token. EIP-7702 and ERC-4337 variants are out of scope. Its
local-minimal `IFigaroCore` binding is the copyable exemplar of the coordinator
pattern — canonical statement in `ARCHITECTURE.md` § "Composing the kernel".

**`src/WitnessSwapAndCommitCoordinator.sol`** — Front-run-hardened sibling of
`SwapAndCommitCoordinator` (a new, separately-identified contract; the base
coordinator is immutable and untouched). Same job and same
`swapAndCommit(c, buyerSig, sellerSig, buyerFunding, sellerFunding)` surface, one
difference: the base coordinator forwarded each leg's `swapData` (the swap route)
to the router **outside every signature**, so a relayer/front-runner could
substitute its own route — sandwiching the pool or routing to a just-above-bond
output — and capture the slippage residual the coordinator would otherwise refund
to the party (MED severity). This sibling calls Permit2's
`permitWitnessTransferFrom`, binding `{router, inputToken, maxInput, keccak256(swapData)}`
into a `SwapWitness` the party signs (helper `swapWitness(inputToken, maxInput, swapData)`
recomputes it for off-chain signers). Substitute any of those and the recomputed
witness no longer matches the signed digest — Permit2's own signature check reverts
before a token moves. Bond currency/amount are NOT re-bound in the witness: they
derive from `c`, already bilaterally EIP-712-signed and kernel-enforced. Immutable
`figaroCore`/`permit2`/`router`, `ReentrancyGuard`, no owner/admin/pause. Kernel
untouched; the swap venue is an off-protocol auxiliary; permissionless first-write-wins
means it coexists with the base coordinator as a distinct composition. Per-party
prerequisites identical to the base flow plus a per-commit Permit2 **witness**
signature. Not yet UI-wired or deploy-wired. Its two token-forwarding sites ARE
tracked in `certora/token-ops.inventory` (unlike the base coordinator, which is
carved out of `lint-token-ops.sh` while pre-production) — both `[PENDING]` a CVL
rule. Foundry tests in `test/WitnessSwapAndCommitCoordinatorTest.t.sol` mirror the
base coordinator's coverage and add `test_RevertWhen_SwapDataSubstituted_FrontRunImpossible`
(a substituted route fails witness verification) using a test-local
`MockWitnessPermit2` that verifies the witness signature.

**`src/SellerRegistry.sol`** — Permissionless seller self-registration with
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

**`src/AssemblyRegistry.sol`** — Permissionless assembly anchoring with a
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
tests in `test/AssemblyRegistryTest.t.sol`.

## FIG Token (`src/fig/`)

**`FigToken.sol`** — ERC-20 + EIP-2612 permit. 1B MAX_SUPPLY hard cap on every mint.
Reentrancy-guarded. Minter registry with `totalRegisteredCap` (sum of all registered
caps enforced not to exceed MAX_SUPPLY). Deployer registers capped minters, then renounces.

**`IFigMinter.sol`** — `mint(address, uint256)` interface a FIG minter module would implement. No implementation is wired (the proof-gated RPGF minter was removed in the teardown); `FigToken.registerMinter` is where a future implementation attaches.

**FIG allocation (canonical, 1B total):**
- **100M (10%) founders** — genesis mint, no vesting, no unlock
- **300M (30%) DAO**       — genesis mint, no vesting, no unlock
- **600M (60%) clause-author RPGF** — the proof-gated distribution (an `RpgfMinter`
  staged behind an SP1 prover) was **removed in the proof-apparatus teardown**, so this
  600M of the cap currently has **no wired mint path**. The RPGF rationale survives in
  `docs/PUBLIC_GRAPH_MODEL.md`; re-home a distribution mechanism there if one is rebuilt.

Deploy flow: deployer registers itself as a one-shot genesis minter with cap 400M,
mints 100M+300M to the founder/DAO wallets, then renounces. Only the 400M genesis is
minted; the remaining 600M has no wired mint path. No settlement-anchored emission.

## Test / Mock Contracts

- `src/mocks/MockERC20.sol` — the devnet payment/bond token. Plain ERC-20 with a permissionless `mint(to, amount)`; constructor takes `(name, symbol)`. Deployed by `Deploy.s.sol` as `NEXT_PUBLIC_TOKEN_ADDRESS` (minted 100k to anvil[0..19]) and used by the Foundry tests — one mock, not a per-file inline copy. (Mainnet uses a real ERC-20, e.g. USDC.e.)
- `src/mocks/MockERC20FeeOnTransfer.sol`, `MockPermitToken.sol` — fee-on-transfer ERC-20 (Foundry tests only) and EIP-2612 permit ERC-20 (`Deploy.s.sol` deploys it as `NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS` for the `*WithPermit` flow).
- `src/mocks/MockPermit2.sol` — test stand-in for Uniswap Permit2 SignatureTransfer; implements `permitTransferFrom` (deadline + amount enforced, signature not verified), pulling the owner's input token under the standard one-time Permit2 approval. Test-only (`SwapAndCommitCoordinatorTest`); not wired into any deploy script — mainnet uses the canonical Permit2.
- `src/mocks/MockUniversalRouter.sol` — test stand-in for a swap venue; `swap(tokenIn, tokenOut, amountIn, recipient)` at a settable rate, paying out of pre-funded liquidity. Test-only (`SwapAndCommitCoordinatorTest`); not wired into any deploy script — mainnet uses the real Uniswap Universal Router.
- `src/echidna/EchidnaFuzzer.sol`, `EchidnaFigToken.sol`, `EchidnaToken.sol`

## What Does NOT Exist

**Deleted in the proof-apparatus teardown (no on-chain content validation, no proof/batch path):**
the 17 `src/clauseValidators/*` validators, `IClauseValidator.sol`, `MockClauseValidator.sol`,
`ClauseRegistrationHelper.sol`, `JSONSchemaValidator.sol`; `FigaroBatchVerifier.sol`,
`src/interfaces/ISP1Verifier.sol`, `MockSP1Verifier.sol`; `RpgfMinter.sol`; the entire Rust
`prover/` tree and the SDK sequencer / `merkleAirdrop`. Validation is now off-chain Layer-A
(SDK `validate.ts`/`encode.ts`) + `ClauseRegistry.registerClause`; settlement is the kernel's
atomic `resolveProcess` only.

Also absent: `FigaroFactory.sol`, `FigaroRouter.sol`, `governance/`, `compliance/`,
`FigEmission.sol`, `FigTimeLock.sol`, `MerkleAirdrop.sol`, `StagedMerkleAirdrop.sol`,
`TrancheVesting.sol` (founder and DAO receive tokens at genesis with no vesting),
`ProximityTypes.sol`, `IRoleResolverV4.sol` (renamed to `IRoleResolver.sol`),
upgradeable proxy, protocol fee, owner, or admin surface.
FIG is not a governance token.

### Deferred vs permanent — the canonical two-tense ruling

This subsection is the OWNER of teardown state (per the ownership map in `README.md`).
Every other surface — docs, marketing pages, agent prompts, memories — states this only
as a summary plus a pointer here.

**DEFERRED — removed 2026-06-25, coming back; describe as the intended design, never as
eliminated:**

- **On-chain clause-content validation** (the per-clause validators) — rebuilt **before
  launch** (operator ruling 2026-07-05). Until then, the on-chain integrity mechanism is
  the `AttestationCoordinator` merkle binding alone; Layer-A (SDK) is the only content
  validation.
- **The batch prover / verifier / sequencer** (SP1 batch settlement) — rebuilt after the
  RPGF mechanism, before launch. Design baseline retained in `SCALING_STRATEGY.md`.
- **The RPGF distribution mechanism** — returns, but the 2026-07-09 redesign REVISES this
  leg: recipients widen to clause authors + assembly designers of record, the zk-proved
  minter is replaced by an optimistic posted-window + challenge-recompute design, and
  whether the minter gates launch (vs shipping before the year-2 tranche) is an OPEN
  operator fork. `FIG_TOKEN.md` carries the allocation; `PUBLIC_GRAPH_MODEL.md` the
  incentive rationale.

**PERMANENT — a property, not an artifact absence:** a never-seen clause must remain
attestable permissionlessly, and the merkle binding stays the integrity floor. The
rebuilt validator/verifier must preserve this; the property constrains the rebuild's
design — it does not forbid the rebuild.

**Reading rule (both directions):** launch-state literature (papers, `/builders`,
`/cryptoeconomics`) describing validators/proofs is CORRECT BY DESIGN and carries the
"rebuild pre-launch" marker — do not file it as stale. Present-state surfaces must state
merkle-only reality. Deleting launch-state prose as drift, and describing merkle-only as
the end state, are the same misclassification in opposite directions.

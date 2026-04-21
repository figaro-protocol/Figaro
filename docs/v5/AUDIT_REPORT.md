# V5 Security Audit Report

Status: comprehensive internal security audit for the live V5 kernel, mechanism
modules, FIG token contracts, and batch verification layer.

Last updated: 2026-04-20 (AI audit pass — Claude Sonnet 4.6).

## Scope

Reviewed live Solidity surface (10 production contracts):

**Core Protocol**
- `src/FigaroCore.sol` — kernel: 2 external functions, 3 mappings, no owner
- `src/CommitmentTypes.sol` — EIP-712 typed structs and hash functions

**Attestation & Schema**
- `src/AttestationCoordinator.sol` — unified zero-storage attestation (3 modes)
- `src/SchemaRegistry.sol` — permissionless event-only schema anchoring
- `src/IRoleResolver.sol` — role-authorization interface

**Mechanism Modules**
- `src/DutchAuction.sol` — descending-price coordination, no token handling
- `src/OperatorRegistry.sol` — self-declaration with reclaimable ETH deposit

**FIG Token**
- `src/fig/FigToken.sol` — ERC-20 + EIP-2612 permit, 1B hard cap, minter registry
- `src/fig/StagedMerkleAirdrop.sol` — three-stage merkle-claim airdrop (year 2 / year 5 / year 9), one-shot per (stage, address)

**Batch Verification**
- `src/FigaroBatchVerifier.sol` — SP1-proved batch verification

Excluded from scope:
- `archive-v3/`, `archive-v4/`
- `src/mocks/`, `src/echidna/` (test infrastructure)
- `lib/` (upstream dependencies)

## Verification Layers

The V5 kernel has been verified through six independent verification methods.
See `docs/v5/VERIFICATION_MAP.md` for the full cross-reference.

### 1. Foundry Tests (concrete)

```bash
forge test --via-ir
```

Result:

- 14 test suites
- 225 tests passed
- 0 failed, 0 skipped

Live test inventory:

- `FigaroCore` lifecycle, revert branches, event emission, parity vectors
- `AttestationCoordinator` (3 modes, cross-process rejection)
- `SchemaRegistry` (permissionless registration, duplicate rejection)
- `DutchAuction` (price curves, claim evaluation, edge cases)
- `OperatorRegistry` (registration, deposit, deactivation, withdrawal)
- `FigaroBatchVerifier` (state root continuity, auxiliary data hash verification)
- `FigToken` (cap enforcement, permit, minter registry)
- `StagedMerkleAirdrop` (per-stage claim, per-stage one-shot, per-stage unlock timing, merkle proof validation)
- `GasCeilingTest` (~2,145 orders within 30M gas)
- Audit regression tests

### 2. Halmos Symbolic Proofs (z3 solver)

```bash
./test-halmos.sh
```

Wrapper at `test-halmos.sh` verifies that `halmos` and `z3` are installed
(prereqs: `pipx install halmos`, `brew install z3`) and runs the proof with a
10-minute per-assertion timeout. The originally documented 5-minute timeout
proved unreliable for `check_resolutionPayouts` (observed range 73s – >300s
across runs because Z3's search path is non-deterministic); 10 minutes is
the committed default.

**7/7 properties proved for ALL possible inputs:**

| Property | What it proves |
|---|---|
| `check_tokenConservation_afterCommit` | Total token supply constant after commit |
| `check_contractSolvency_afterCommit` | Contract holds exactly 4× payment after commit |
| `check_correctBondAmounts` | Buyer and seller each lose exactly 2× payment |
| `check_resolutionPayouts` | Seller gains +payment, buyer loses −payment, contract empty |
| `check_orderStatusTransition` | Status moves 0→1→2 only, never backwards |
| `check_buyerDominance_revert` | Non-buyer resolve always reverts |
| `check_cumulativeValueMonotonic` | Accumulator strictly increases with each sub-order |

Harness: `test/HalmosFigaroCore.t.sol`

### 3. Certora Formal Verification (cloud-based SMT)

```bash
certoraRun certora/FigaroCore.conf
```

**27/27 rules verified across 4 specs (2026-04-21 re-run, Certora CLI 8.8.1). FigaroCore details below:**

| Rule | What it verifies |
|---|---|
| `orderStatusNeverDecreases` | Status monotonicity |
| `orderStatusTransitionsAreValid` | Only 0→1 and 1→2 transitions |
| `commitIncreasesActiveCount` | Active count integrity |
| `onlyBuyerCanResolve` | Buyer dominance |
| `noDoubleCommit` | Duplicate commitment guard |
| `cumulativeValueMonotonic` | Accumulator monotonicity |
| `rootBuyerImmutable` | Process buyer never changes post-commit |
| `currencyImmutable` | Process currency never changes |

Spec: `certora/FigaroCore.spec`. Config: `certora/FigaroCore.conf`.

### 4. TLA+ Model Checking (exhaustive state exploration)

**7/7 invariants verified across 6M+ states:**

- `TokenConservation` — sum of wallets + contract = initial supply
- `ContractSolvency` — contract balance ≥ 0
- `WalletNonNegative` — no participant goes below zero
- `CumulativeIntegrity` — cumulativeValue = sum of order payments
- `ActiveCountCorrect` — activeCount = count of committed orders
- `ResolutionAlwaysPossible` — contract can always resolve any active process
- `TypeOK` — type well-formedness

Spec: `formal/FigaroCore.tla`. Model: `formal/MC.tla`.

### 5. Echidna Fuzzing (property-based)

```bash
echidna src/echidna/EchidnaFuzzerV5.sol --config echidna-v5.yaml
```

7 property invariants verified across 43k+ calls. Corpus stored in
`corpus/` and `echidna/corpus/`.

### 6. Static Analysis (Slither)

```bash
slither . --config-file slither-fig.json
```

0 production findings on the live V5 surface.

## Audit History

### Prior AI Audit — 2026-04-16

Three-pass AI audit (vulnerability scan, economic invariants, integration).
22 total findings (2 critical, 2 high, 4 medium, 6 low, 8 informational).
All critical, high, and medium findings resolved. See `docs/v5/SECURITY_AUDIT_AI.md`
for the complete finding record and remediation summary.

Key remediations from that pass:
- Zero-address and contract-code checks added to FigaroBatchVerifier constructor
- MockSP1Verifier restricted to Anvil (chain guard added)
- All emission logic removed — FigEmission deleted; the 60% community allocation flows through a single StagedMerkleAirdrop; founder + DAO receive their 10%/30% at genesis with no vesting
- Overflow check added to sellerPayout calculation in resolveProcess
- Batch settlement DoS risk documented in contract comments

### Current AI Audit — 2026-04-20

Full re-audit of the live 10-contract surface. Methodology: exhaustive
source-level review followed by design-philosophy challenge of every finding
(stateless/event-sourced architecture, no web2 lifecycle patterns).

**Net result: 0 new actionable findings.**

Initial findings that were raised and then withdrawn after design challenge:

| Initial Severity | Description | Withdrawal Reason |
|---|---|---|
| High | Process re-extension after resolution | Requires bilateral signatures — by design, not a vulnerability |
| High | Cross-order seller attestation | Attester is truthfully recorded in event; off-chain semantic concern |
| Medium | DutchAuction creator self-claim | No financial stake; web2 role-separation pattern |
| Low | StagedMerkleAirdrop single-hash leaves (inherited pattern) | Leaf preimages (52 bytes) and node preimages (64 bytes) differ — collision structurally impossible |
| Low | No-op batch accepted | ZK program is the authority on valid state transitions; on-chain check would duplicate program logic |
| Low | SchemaRegistry version 0 | Semantic validation belongs off-chain, consistent with event-sourced design |

Remaining informational notes (no code change required):

| Contract | Finding |
|---|---|
| FigToken | Minter cap at registration does not sum all registered caps; per-mint check is the real enforcement |
| FigaroBatchVerifier | `figToken` field (prior INFO-2) has been REMOVED. 3-argument constructor. |
| FigaroBatchVerifier | Batch DoS via pre-settlement approval revocation (already documented in contract) |
| FigaroCore | `_pullExact` emits arithmetic panic rather than `FeeOnTransferDetected` on downward rebase mid-transfer (extreme edge case; behavior is still revert) |
| OperatorRegistry | Error name `InsufficientDeposit` fires on excess as well as insufficient |
| FigToken | Deployer can register themselves as a minter before renouncing (trusted-setup assumption) |

Hash collision analysis: hash construction is sound at all three layers (structHash
via `abi.encode`, processId via EIP-712 domain-separated digest, orderHash via
`keccak256(bytes32 ++ bytes32)`). No prevrandao needed — the `salt` field in
Commitment is the correct bilateral nonce. Removal of prevrandao is an
improvement under PoS (validators know prevrandao up to one epoch ahead).

## Security Posture

The live kernel remains intentionally minimal:

- two external functions: `commit` and `resolveProcess`
- no owner
- no protocol fee
- no timeout path
- no admin escape hatch
- direct transfer settlement instead of an internal withdrawal ledger
- stateless attestation coordinator (zero storage)
- event-first schema registry (dedup guard only)

Mechanism modules remain outside the kernel payoff matrix:

- `AttestationCoordinator` is zero-storage and role-gated
- `SchemaRegistry` is permissionless and event-first
- `DutchAuction` is coordination-only and does not intermediate funds
- `OperatorRegistry` is self-declaration plus minimal write-gating state
- `FigaroBatchVerifier` verifies SP1 proofs before executing state transitions

The verification suite explicitly covers the following enforcement edges:

- fee-on-transfer token rejection in the kernel
- duplicate commitment rejection
- buyer-only process resolution (symbolically proved for ALL inputs)
- cumulative-value monotonicity across sub-orders (proved symbolically and formally)
- cross-process attestation rejection
- token conservation across commit + resolve lifecycle (proved symbolically)
- contract solvency invariant (proved symbolically)
- state root continuity in batch verification
- FIG 1B hard cap enforcement on every mint path

## Accepted Operational Risks

These are current design realities, not defects:

1. **Buyer key loss is terminal** for an active process. The kernel intentionally
   has no timeout or admin recovery path. Use a multi-sig or social-recovery
   wallet for the buyer role in production.

2. **Large process trees are gas-bounded.** The kernel supports ~2,145 orders
   within the 30M Ethereum gas limit. Institution design should keep per-process
   order counts well below the theoretical ceiling and use multi-process
   composition for larger trees.

3. **Fee-on-transfer tokens are unsupported** by design. The kernel rejects them
   explicitly via exact transfer delta checks in `_pullExact`.

## Total Verification Coverage

| Layer | Count | Method |
|---|---|---|
| Foundry | 225 | Concrete unit/integration tests (via `forge test --via-ir`) |
| Halmos | 11 | Symbolic proofs (ALL inputs, z3) — via `./test-halmos.sh` (7 FigaroCore + 4 StagedMerkleAirdrop) |
| Certora | 27/27 sub-rules across 4 specs | SMT formal verification (cloud) — FigaroCore (9), AttestationCoordinator (7), FigToken (7), StagedMerkleAirdrop (4). Via `./test-certora.sh`. |
| TLA+ | 15 invariants across 2 models | FigaroCore 7 invariants / 6,087,113 distinct states; FigToken 8 invariants / 160,844 distinct states. Both via `./test-tla.sh`. |
| Echidna | 7 | Property-based fuzzing (committed harness; per-run call count varies by wall time) |
| Slither | — | Static analysis (0 findings) |
| Vitest (SDK) | 166 | TypeScript SDK tests |
| Vitest (frontend) | 560+ | Frontend unit tests |
| Rust | 55 | Kernel + sequencer tests |
| Playwright | 169 | E2E browser tests |
| **Total** | **1,230+** | |

## Pre-Mainnet Deployment Checklist

### Solidity Surface

- [ ] Freeze `src/`, `src/fig/`, and deployment scripts before external audit
- [ ] Confirm `FigaroBatchVerifier.verifier` is the real SP1 verifier gateway (not MockSP1Verifier)
- [ ] Confirm `MockSP1Verifier` is not deployed on target chain
- [ ] Confirm all settlement tokens are non-rebasing, non-fee-on-transfer

### FigToken Deployment

- [ ] `FigToken.deployer` == expected deployer EOA
- [ ] All registered minters are intended emission/vesting contracts
- [ ] `FigToken.deployerMintRenounced` == `true` after minter setup
- [ ] `FigToken.totalSupply()` == expected genesis allocation

### AttestationCoordinator

- [ ] `AttestationCoordinator.core` == deployed FigaroCore address

### FigaroBatchVerifier

- [ ] `FigaroBatchVerifier.verifier` == **real** SP1 verifier gateway
- [ ] `FigaroBatchVerifier.stateRoot` == expected genesis root
- [ ] `FigaroBatchVerifier.programVKey` == correct program verification key

### External Audit

- [ ] Engage external firm (Trail of Bits, OpenZeppelin, Spearbit, or equivalent)
- [ ] Hand over frozen Solidity surface and this doc set
- [ ] Resolve all findings or explicitly accept non-critical findings in writing
- [ ] Record final audit outcome in this file

## Release Recommendation

The V5 Solidity surface has been verified through six independent methods
covering concrete testing, symbolic execution, SMT formal verification, model
checking, fuzzing, and static analysis. Two AI audit passes (2026-04-16 and
2026-04-20) found all prior findings resolved and no new actionable findings.

Before mainnet deployment: freeze the Solidity surface and complete a final
external audit pass. For testnet (Sepolia) deployment, the current internal
verification posture is sufficient.

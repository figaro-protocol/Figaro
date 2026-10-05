// SPDX-License-Identifier: MIT
// Certora CVL — FigaroBatchVerifier's state root chains, batch to batch.
//
// What the rules state, for every call and every input:
//   1. A batch resolves only from the root the verifier holds, and leaves the
//      root the batch names: the batch's `prevRoot` equals `stateRoot` before
//      the call, and `stateRoot` after the call is the batch's `newRoot`.
//   2. Each resolved batch advances `batchCount` by exactly one.
//   3. No other function moves `stateRoot` or `batchCount`.
// Together: the `BatchSettled` events form one unbroken chain from the
// constructor's initial root to the current `stateRoot`, numbered 1, 2, 3, …
// with no gap — a state that cannot be reached is proved here, not watched.
//
// The contract is read through `certora/harness/FigaroBatchVerifierHarness.sol`,
// which adds only `decodedRoots`: the two roots, decoded from the public
// values by the contract's own `_decodePV`.
//
// Summarized (none of these writes the verifier's storage):
//   verifyProof        — the SP1 verifier; NONDET: any proof is accepted, so
//                        the rules hold whatever the proof system admits
//   contentHashOf      — the ClauseRegistry anchor read; a view
//   applyBatchAccrual  — the UsageCounter write, behind try/catch
//   SafeERC20 transfers — token moves; a token cannot write the verifier's
//                        storage, and `nonReentrant` refuses a re-entry into
//                        `settleBatch` (rule 3 covers every other entry)
//   the hash helpers and `_emitAttestations` — pure or event-only; their
//                        results only decide whether the call reverts, which
//                        every rule already allows

methods {
    function stateRoot() external returns (bytes32) envfree;
    function batchCount() external returns (uint64) envfree;
    function decodedRoots(bytes) external returns (bytes32, bytes32) envfree;

    function _.verifyProof(bytes32, bytes, bytes) external => NONDET;
    function _.contentHashOf(bytes32) external => NONDET;
    function _.applyBatchAccrual(uint8, bytes32, IUsageCounter.BatchAccrual[], address[]) external => NONDET;

    function SafeERC20.safeTransfer(address, address, uint256) internal => NONDET;
    function SafeERC20.safeTransferFrom(address, address, address, uint256) internal => NONDET;

    function FigaroBatchVerifier._hashPositions(FigaroBatchVerifier.NetPosition[] calldata) internal returns (bytes32) => NONDET;
    function FigaroBatchVerifier._hashAttestations(FigaroBatchVerifier.AttestationData[] calldata) internal returns (bytes32) => NONDET;
    function FigaroBatchVerifier._hashSpecBindings(FigaroBatchVerifier.SpecBinding[] calldata) internal returns (bytes32) => NONDET;
    function FigaroBatchVerifier._hashUsage(FigaroBatchVerifier.BatchUsageData calldata) internal returns (bytes32) => NONDET;
    function FigaroBatchVerifier._emitAttestations(FigaroBatchVerifier.AttestationData[] calldata) internal => NONDET;
}

// ═══════════════════════════════════════════════════════════════════
// RULE 1: A batch resolves from the held root and leaves the named root
// ═══════════════════════════════════════════════════════════════════

rule settleBatchChainsTheRoot(
    bytes proof,
    bytes publicValues,
    FigaroBatchVerifier.NetPosition[] positions,
    FigaroBatchVerifier.BatchEventData batchEvents,
    FigaroBatchVerifier.BatchUsageData usage
) {
    env e;
    bytes32 prevRoot;
    bytes32 newRoot;
    prevRoot, newRoot = decodedRoots(publicValues);

    bytes32 before = stateRoot();
    settleBatch(e, proof, publicValues, positions, batchEvents, usage);

    assert before == prevRoot, "a batch resolves only from the root the verifier holds";
    assert stateRoot() == newRoot, "a resolved batch leaves the root it names";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 2: Each resolved batch is numbered one past the last
// ═══════════════════════════════════════════════════════════════════

rule settleBatchCountsOneBatch(
    bytes proof,
    bytes publicValues,
    FigaroBatchVerifier.NetPosition[] positions,
    FigaroBatchVerifier.BatchEventData batchEvents,
    FigaroBatchVerifier.BatchUsageData usage
) {
    env e;
    mathint before = batchCount();
    settleBatch(e, proof, publicValues, positions, batchEvents, usage);
    assert to_mathint(batchCount()) == before + 1, "each resolved batch advances the count by one";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 3: Nothing but settleBatch moves the root or the count
// ═══════════════════════════════════════════════════════════════════

rule onlySettleBatchMovesTheRoot(method f)
    filtered { f -> f.selector != sig:settleBatch(bytes, bytes, FigaroBatchVerifier.NetPosition[], FigaroBatchVerifier.BatchEventData, FigaroBatchVerifier.BatchUsageData).selector }
{
    env e;
    calldataarg args;
    bytes32 rootBefore = stateRoot();
    uint64 countBefore = batchCount();
    f(e, args);
    assert stateRoot() == rootBefore, "only settleBatch moves the state root";
    assert batchCount() == countBefore, "only settleBatch moves the batch count";
}

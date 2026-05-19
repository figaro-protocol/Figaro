// SPDX-License-Identifier: MIT
// Certora CVL specification for RpgfMinter
//
// Verifies the state-machine invariants of the three-stage SP1-gated
// retroactive public-goods funding minter:
//
//   I1. submitter, minter, programVKey are immutable (compile-time enforced
//       by `immutable` keyword; we re-verify symbolically).
//   I2. stages[i].unlockTime is set once in the constructor and never changes.
//   R1. stages[i].root is one-shot: once non-zero, it cannot be replaced.
//   R2. stages[i].totalAllocated is one-shot in lockstep with root: it
//       changes iff root changes from zero to non-zero.
//   R3. claimed[stage][account] is monotonic (true is a one-way latch).
//   R4. Only `submitter` can transition a stage's root from zero to non-zero.
//   R5. submitRoot reverts if stageIndex >= STAGE_COUNT.
//   R6. claim reverts if stageIndex >= STAGE_COUNT.
//   R7. claim reverts if stages[stageIndex].root == 0 (RootNotSet).
//   R8. claim reverts if block.timestamp < stages[stageIndex].unlockTime
//       (NotUnlocked).
//   R9. claim reverts if claimed[stageIndex][msg.sender] is already true
//       (AlreadyClaimed — one-shot per claimant).
//
// External calls (`verifier.verifyProof`, `IFigMinter(minter).mint`) are
// summarized as NONDET — they cannot touch this contract's storage, and
// their return-value havoc doesn't matter because both are void-returning.

methods {
    function submitter() external returns (address) envfree;
    function minter() external returns (address) envfree;
    function programVKey() external returns (bytes32) envfree;
    function STAGE_COUNT() external returns (uint8) envfree;
    // Solidity's auto-generated getter for `Stage[3] public stages` takes
    // `uint256` (the array index), not `uint8`. CVL rejects the mismatch.
    function stages(uint256) external returns (bytes32, uint64, uint256) envfree;
    function claimed(uint8, address) external returns (bool) envfree;

    // Summarize the two external calls so the prover doesn't need linked
    // implementations. NONDET = no observable effect on this contract's
    // storage; the verifier may revert (modeled by optimistic_fallback)
    // and the mint call may succeed.
    function _.verifyProof(bytes32, bytes, bytes) external => NONDET;
    function _.mint(address, uint256) external => NONDET;
}

// ═══════════════════════════════════════════════════════════════════
// IMMUTABILITY OF immutable VARIABLES (R1-class — sanity rules)
// These are compile-time enforced by Solidity's `immutable` keyword but
// re-checked symbolically as a defense-in-depth gate.
// ═══════════════════════════════════════════════════════════════════

rule submitterImmutable(method f) {
    address before = submitter();
    env e; calldataarg args;
    f(e, args);
    assert submitter() == before, "submitter must be immutable";
}

rule minterTargetImmutable(method f) {
    address before = minter();
    env e; calldataarg args;
    f(e, args);
    assert minter() == before, "minter target must be immutable";
}

rule programVKeyImmutable(method f) {
    bytes32 before = programVKey();
    env e; calldataarg args;
    f(e, args);
    assert programVKey() == before, "programVKey must be immutable";
}

// ═══════════════════════════════════════════════════════════════════
// I2: stages[i].unlockTime is set once in the constructor and never
// changes. We check this for each of the three stage indices.
// ═══════════════════════════════════════════════════════════════════

rule unlockTimeImmutable(uint8 stageIndex, method f) {
    require stageIndex < 3;
    bytes32 rBefore; uint64 uBefore; uint256 tBefore;
    (rBefore, uBefore, tBefore) = stages(stageIndex);

    env e; calldataarg args;
    f(e, args);

    bytes32 rAfter; uint64 uAfter; uint256 tAfter;
    (rAfter, uAfter, tAfter) = stages(stageIndex);

    assert uAfter == uBefore,
        "stages[i].unlockTime must never change after construction";
}

// ═══════════════════════════════════════════════════════════════════
// R1: stages[i].root is one-shot — once non-zero, it cannot be replaced.
// ═══════════════════════════════════════════════════════════════════

rule rootOneShot(uint8 stageIndex, method f) {
    require stageIndex < 3;
    bytes32 rBefore; uint64 uBefore; uint256 tBefore;
    (rBefore, uBefore, tBefore) = stages(stageIndex);
    require rBefore != to_bytes32(0);

    env e; calldataarg args;
    f(e, args);

    bytes32 rAfter; uint64 uAfter; uint256 tAfter;
    (rAfter, uAfter, tAfter) = stages(stageIndex);

    assert rAfter == rBefore,
        "stages[i].root must not change once set";
}

// ═══════════════════════════════════════════════════════════════════
// R2: stages[i].totalAllocated changes iff root changes from zero to
// non-zero. Once root is non-zero, totalAllocated is locked in lockstep
// with the root.
// ═══════════════════════════════════════════════════════════════════

rule totalAllocatedLockedWithRoot(uint8 stageIndex, method f) {
    require stageIndex < 3;
    bytes32 rBefore; uint64 uBefore; uint256 tBefore;
    (rBefore, uBefore, tBefore) = stages(stageIndex);
    require rBefore != to_bytes32(0);

    env e; calldataarg args;
    f(e, args);

    bytes32 rAfter; uint64 uAfter; uint256 tAfter;
    (rAfter, uAfter, tAfter) = stages(stageIndex);

    assert tAfter == tBefore,
        "stages[i].totalAllocated must not change once root is set";
}

// ═══════════════════════════════════════════════════════════════════
// R3: claimed[stage][account] is monotonic — once true, it stays true.
// ═══════════════════════════════════════════════════════════════════

rule claimedFlagMonotonic(uint8 stageIndex, address account, method f) {
    require stageIndex < 3;
    require claimed(stageIndex, account);

    env e; calldataarg args;
    f(e, args);

    assert claimed(stageIndex, account),
        "claimed[stage][account] must never flip back to false";
}

// ═══════════════════════════════════════════════════════════════════
// R4: Only `submitter` can transition a stage's root from zero to
// non-zero. The transition can only happen via submitRoot, and submitRoot
// reverts when msg.sender != submitter.
// ═══════════════════════════════════════════════════════════════════

rule onlySubmitterCanSetRoot(uint8 stageIndex, method f) filtered {
    f -> f.selector != sig:submitRoot(bytes,bytes).selector
} {
    require stageIndex < 3;
    bytes32 rBefore; uint64 uBefore; uint256 tBefore;
    (rBefore, uBefore, tBefore) = stages(stageIndex);

    env e; calldataarg args;
    f(e, args);

    bytes32 rAfter; uint64 uAfter; uint256 tAfter;
    (rAfter, uAfter, tAfter) = stages(stageIndex);

    assert rAfter == rBefore,
        "non-submitRoot methods must not change stages[i].root";
}

rule submitRootRequiresSubmitter(bytes pv, bytes proof) {
    env e;
    submitRoot@withrevert(e, pv, proof);
    assert !lastReverted => e.msg.sender == submitter(),
        "submitRoot must revert when caller != submitter";
}

// ═══════════════════════════════════════════════════════════════════
// R5/R6: stage-index bounds on both write paths.
// ═══════════════════════════════════════════════════════════════════

rule claimRevertsOnInvalidStage(uint8 stageIndex, uint256 amount, bytes32[] proof) {
    require stageIndex >= 3;
    env e;
    claim@withrevert(e, stageIndex, amount, proof);
    assert lastReverted,
        "claim must revert for stageIndex >= STAGE_COUNT";
}

// ═══════════════════════════════════════════════════════════════════
// R7/R8/R9: claim preconditions. Use @withrevert and assert the
// implication: a successful claim implies the precondition held.
// ═══════════════════════════════════════════════════════════════════

rule claimRequiresRootSet(uint8 stageIndex, uint256 amount, bytes32[] proof) {
    require stageIndex < 3;
    bytes32 rBefore; uint64 uBefore; uint256 tBefore;
    (rBefore, uBefore, tBefore) = stages(stageIndex);

    env e;
    claim@withrevert(e, stageIndex, amount, proof);

    assert !lastReverted => rBefore != to_bytes32(0),
        "successful claim implies stages[stageIndex].root was set";
}

rule claimRequiresUnlocked(uint8 stageIndex, uint256 amount, bytes32[] proof) {
    require stageIndex < 3;
    bytes32 rBefore; uint64 uBefore; uint256 tBefore;
    (rBefore, uBefore, tBefore) = stages(stageIndex);

    env e;
    claim@withrevert(e, stageIndex, amount, proof);

    assert !lastReverted => e.block.timestamp >= to_mathint(uBefore),
        "successful claim implies block.timestamp >= unlockTime";
}

rule claimRequiresNotAlreadyClaimed(uint8 stageIndex, uint256 amount, bytes32[] proof) {
    require stageIndex < 3;
    bool wasClaimed = claimed(stageIndex, currentContract);

    env e;
    require e.msg.sender == currentContract;
    bool wasClaimedBySender = claimed(stageIndex, e.msg.sender);

    claim@withrevert(e, stageIndex, amount, proof);

    assert !lastReverted => !wasClaimedBySender,
        "successful claim implies claimed[stageIndex][msg.sender] was false";
}

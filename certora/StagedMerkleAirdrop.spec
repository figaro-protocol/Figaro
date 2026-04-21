// SPDX-License-Identifier: MIT
// Certora CVL specification for StagedMerkleAirdrop
//
// Proves three state-machine invariants for the three-stage community airdrop:
//   (1) The claimed[stage][account] flag is monotonic — once true, never false.
//   (2) Per-stage stored configuration (root + unlockTime) is immutable after
//       construction.
//   (3) The minter address is immutable after construction.
//
// Merkle-inclusion semantics and unlock-time enforcement are covered by the
// Halmos harness in test/HalmosStagedMerkleAirdrop.t.sol — Certora's parametric
// rules here complement those symbolic proofs.

methods {
    function claimed(uint8, address) external returns (bool) envfree;
    // `stages` is backed by a fixed-size public array; Solidity's auto-getter
    // takes the index as `uint256`, not the element's declared field type.
    function stages(uint256) external returns (bytes32, uint64) envfree;
    function minter() external returns (address) envfree;
    function STAGE_COUNT() external returns (uint8) envfree;
}

// ═══════════════════════════════════════════════════════════════════
// RULE 1: claimed[stage][account] is monotonic
//
// Once the claimed flag for a (stage, account) pair is true, no external
// function can transition it back to false.
// ═══════════════════════════════════════════════════════════════════

rule claimedIsMonotonic(uint8 stageIndex, address account, method f) {
    require stageIndex < 3;
    bool before = claimed(stageIndex, account);

    env e;
    calldataarg args;
    f(e, args);

    bool afterCall = claimed(stageIndex, account);

    assert !(before && !afterCall),
        "A set claimed flag must never transition back to false";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 2: Stage configuration (root + unlockTime) is immutable
//
// After construction, no external function may mutate stages[i].root or
// stages[i].unlockTime. The three immutable roots and three immutable
// unlock timestamps are the backbone of the airdrop's integrity.
// ═══════════════════════════════════════════════════════════════════

rule stageConfigImmutable(uint256 stageIndex, method f) {
    require stageIndex < 3;
    bytes32 rootBefore;
    uint64 unlockBefore;
    rootBefore, unlockBefore = stages(stageIndex);

    env e;
    calldataarg args;
    f(e, args);

    bytes32 rootAfter;
    uint64 unlockAfter;
    rootAfter, unlockAfter = stages(stageIndex);

    assert rootAfter == rootBefore,
        "Stage root must never change after construction";
    assert unlockAfter == unlockBefore,
        "Stage unlockTime must never change after construction";
}

// ═══════════════════════════════════════════════════════════════════
// RULE 3: Minter address is immutable
//
// The `minter` immutable set in the constructor must never change.
// ═══════════════════════════════════════════════════════════════════

rule minterImmutable(method f) {
    address minterBefore = minter();

    env e;
    calldataarg args;
    f(e, args);

    address minterAfter = minter();

    assert minterAfter == minterBefore,
        "Minter address must never change after construction";
}

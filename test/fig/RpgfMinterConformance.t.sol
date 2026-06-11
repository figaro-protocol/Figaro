// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {FigToken} from "src/fig/FigToken.sol";
import {RpgfMinter} from "src/fig/RpgfMinter.sol";
import {MockSP1Verifier} from "src/mocks/MockSP1Verifier.sol";

/// @title RpgfMinterConformanceTest
/// @notice End-to-end conformance harness. Shares a canonical input with
///         prover/rpgf/tests/conformance_test.rs — both sides compute
///         the same Merkle root (this test inline via sorted-pair
///         Keccak256, the Rust aggregator via figaro_rpgf::aggregate)
///         and this test exercises the full claim path against the
///         shared root, asserting every author's FIG balance lands
///         exactly where the Rust aggregator says it should.
///
/// @dev Canonical input:
///        4 clauses, clause_ids = bytes32(1), bytes32(2), bytes32(3), bytes32(4)
///        (chosen so wCategory = 1.0 — none match the tier-1 set
///         {figaro-modalities-v1, figaro-geo-v2})
///        Each clause: 100 processes, 50 pairs, chainPos = 1
///                     (uniform parameters → equal scores → pre-cap
///                      share = 25% each)
///        Cap = 15% → cap binds for all four; each settles at 15%
///        Per-author allocation: 15% × 300M FIG = 45M ether
///        Total allocated: 180M ether (60% of 300M Y2 budget)
///        Remaining 40% unallocated by design (cap bounds
///        concentration; doesn't force full budget consumption).
contract RpgfMinterConformanceTest is Test {
    FigToken internal token;
    RpgfMinter internal minter;
    MockSP1Verifier internal verifier;

    address internal sequencer = address(0xBEEF);

    address internal authorA = 0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa;
    address internal authorB = 0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB;
    address internal authorC = 0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC;
    address internal authorD = 0xDDdDddDdDdddDDddDDddDDDDdDdDDdDDdDDDDDDd;

    bytes32 internal constant CLAUSE_A = bytes32(uint256(1));
    bytes32 internal constant CLAUSE_B = bytes32(uint256(2));
    bytes32 internal constant CLAUSE_C = bytes32(uint256(3));
    bytes32 internal constant CLAUSE_D = bytes32(uint256(4));

    bytes32 internal constant PROGRAM_VKEY = bytes32(uint256(0xDEAD));

    uint256 internal constant PER_AUTHOR_AMOUNT = 45_000_000 ether;
    uint256 internal constant TRANCHE_BUDGET = 300_000_000 ether;
    uint256 internal constant EXPECTED_TOTAL_ALLOCATED = 180_000_000 ether;
    uint32 internal constant EXPECTED_CLAUSE_COUNT = 4;

    /// @dev Canonical Merkle root. Same constant lives in
    ///      prover/rpgf/tests/conformance_test.rs. The two
    ///      implementations must agree on this value; if either
    ///      drifts the conformance is broken.
    bytes32 internal constant EXPECTED_ROOT =
        0x7de1fc7dc27443aa3efe86f5da98a2d3f18d31f8ca1e612da4a91c8cce497fec;

    bytes32 internal leafA;
    bytes32 internal leafB;
    bytes32 internal leafC;
    bytes32 internal leafD;
    bytes32 internal h01;
    bytes32 internal h23;

    function setUp() public {
        token = new FigToken();
        verifier = new MockSP1Verifier();

        uint64 unlockY2 = uint64(block.timestamp + 1);
        uint64[3] memory unlocks = [unlockY2, unlockY2 + 1, unlockY2 + 2];
        minter = new RpgfMinter(address(token), address(verifier), PROGRAM_VKEY, sequencer, unlocks);
        token.registerMinter(address(minter), 600_000_000 ether);

        // Build the canonical 4-leaf tree inline. Leaf order matches
        // the Rust aggregator's clause_id-sorted snapshot order:
        // bytes32(1) < bytes32(2) < bytes32(3) < bytes32(4).
        leafA = keccak256(abi.encodePacked(authorA, PER_AUTHOR_AMOUNT));
        leafB = keccak256(abi.encodePacked(authorB, PER_AUTHOR_AMOUNT));
        leafC = keccak256(abi.encodePacked(authorC, PER_AUTHOR_AMOUNT));
        leafD = keccak256(abi.encodePacked(authorD, PER_AUTHOR_AMOUNT));
        h01 = _sortedPair(leafA, leafB);
        h23 = _sortedPair(leafC, leafD);
    }

    function _sortedPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a <= b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    /// @notice The load-bearing conformance assertion: this Solidity
    ///         test's inline Merkle root MUST equal the hardcoded
    ///         EXPECTED_ROOT (which itself matches Rust's output).
    function test_InlineMerkleRootMatchesCanonical() public view {
        bytes32 inlineRoot = _sortedPair(h01, h23);
        assertEq(inlineRoot, EXPECTED_ROOT, "Solidity inline root drifted from canonical");
    }

    function _submitCanonicalRoot() internal {
        bytes memory publicValues = abi.encode(
            uint8(0), EXPECTED_ROOT, EXPECTED_TOTAL_ALLOCATED, EXPECTED_CLAUSE_COUNT
        );
        vm.prank(sequencer);
        minter.submitRoot(publicValues, hex"");
    }

    function test_AllFourAuthorsClaimExpectedAmounts() public {
        _submitCanonicalRoot();
        vm.warp(block.timestamp + 2);

        bytes32[] memory proofA = new bytes32[](2);
        proofA[0] = leafB;
        proofA[1] = h23;
        bytes32[] memory proofB = new bytes32[](2);
        proofB[0] = leafA;
        proofB[1] = h23;
        bytes32[] memory proofC = new bytes32[](2);
        proofC[0] = leafD;
        proofC[1] = h01;
        bytes32[] memory proofD = new bytes32[](2);
        proofD[0] = leafC;
        proofD[1] = h01;

        vm.prank(authorA);
        minter.claim(0, PER_AUTHOR_AMOUNT, proofA);
        vm.prank(authorB);
        minter.claim(0, PER_AUTHOR_AMOUNT, proofB);
        vm.prank(authorC);
        minter.claim(0, PER_AUTHOR_AMOUNT, proofC);
        vm.prank(authorD);
        minter.claim(0, PER_AUTHOR_AMOUNT, proofD);

        assertEq(token.balanceOf(authorA), PER_AUTHOR_AMOUNT, "A balance");
        assertEq(token.balanceOf(authorB), PER_AUTHOR_AMOUNT, "B balance");
        assertEq(token.balanceOf(authorC), PER_AUTHOR_AMOUNT, "C balance");
        assertEq(token.balanceOf(authorD), PER_AUTHOR_AMOUNT, "D balance");

        // Sanity: total minted equals what the Rust aggregator computed
        // as total_allocated_wei. Conformance across the whole pipeline.
        uint256 totalMinted = token.balanceOf(authorA) + token.balanceOf(authorB)
            + token.balanceOf(authorC) + token.balanceOf(authorD);
        assertEq(totalMinted, EXPECTED_TOTAL_ALLOCATED, "total minted = canonical total");
    }

    function test_StoredRootMatchesCanonicalAfterSubmit() public {
        _submitCanonicalRoot();
        (bytes32 storedRoot,, uint256 storedTotal) = minter.stages(0);
        assertEq(storedRoot, EXPECTED_ROOT);
        assertEq(storedTotal, EXPECTED_TOTAL_ALLOCATED);
    }

    function test_RecaimByAuthorFailsAsOneShot() public {
        _submitCanonicalRoot();
        vm.warp(block.timestamp + 2);

        bytes32[] memory proofA = new bytes32[](2);
        proofA[0] = leafB;
        proofA[1] = h23;

        vm.prank(authorA);
        minter.claim(0, PER_AUTHOR_AMOUNT, proofA);

        vm.prank(authorA);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.AlreadyClaimed.selector, 0, authorA));
        minter.claim(0, PER_AUTHOR_AMOUNT, proofA);
    }

    function test_ClaimWithWrongAmountFails() public {
        _submitCanonicalRoot();
        vm.warp(block.timestamp + 2);

        bytes32[] memory proofA = new bytes32[](2);
        proofA[0] = leafB;
        proofA[1] = h23;

        vm.prank(authorA);
        vm.expectRevert(RpgfMinter.InvalidProof.selector);
        minter.claim(0, PER_AUTHOR_AMOUNT + 1, proofA);
    }

    function test_NonAuthorCannotClaim() public {
        _submitCanonicalRoot();
        vm.warp(block.timestamp + 2);

        bytes32[] memory proofA = new bytes32[](2);
        proofA[0] = leafB;
        proofA[1] = h23;

        address impostor = address(0xE);
        vm.prank(impostor);
        vm.expectRevert(RpgfMinter.InvalidProof.selector);
        minter.claim(0, PER_AUTHOR_AMOUNT, proofA);
    }
}

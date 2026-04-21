// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {FigToken} from "src/fig/FigToken.sol";
import {StagedMerkleAirdrop} from "src/fig/StagedMerkleAirdrop.sol";

/// @title StagedMerkleAirdropTest
/// @notice Foundry tests for the three-stage merkle-claim airdrop used in the
///         canonical FIG allocation (30% yr2 / 20% yr5 / 10% yr9 of total supply).
contract StagedMerkleAirdropTest is Test {
    FigToken internal token;
    StagedMerkleAirdrop internal airdrop;

    address internal deployer = address(this);
    address internal alice = address(0xA);
    address internal bob = address(0xB);
    address internal carol = address(0xC);

    uint256 internal constant AMOUNT = 100 ether;

    uint64 internal unlockY2;
    uint64 internal unlockY5;
    uint64 internal unlockY9;

    bytes32 internal rootY2;
    bytes32 internal rootY5;
    bytes32 internal rootY9;

    bytes32[] internal aliceProofY2;
    bytes32[] internal bobProofY2;
    bytes32[] internal aliceProofY5;
    bytes32[] internal carolProofY5;

    function setUp() public {
        token = new FigToken();

        // Two-leaf trees per stage keep proof generation simple:
        // Stage 0 (yr 2): alice + bob
        // Stage 1 (yr 5): alice + carol
        // Stage 2 (yr 9): alice only (single-leaf tree = leaf is root)
        {
            bytes32 aLeaf = keccak256(abi.encodePacked(alice, AMOUNT));
            bytes32 bLeaf = keccak256(abi.encodePacked(bob, AMOUNT));
            (bytes32 lo, bytes32 hi) = aLeaf < bLeaf ? (aLeaf, bLeaf) : (bLeaf, aLeaf);
            rootY2 = keccak256(abi.encodePacked(lo, hi));
            aliceProofY2 = new bytes32[](1);
            aliceProofY2[0] = bLeaf;
            bobProofY2 = new bytes32[](1);
            bobProofY2[0] = aLeaf;
        }
        {
            bytes32 aLeaf = keccak256(abi.encodePacked(alice, AMOUNT));
            bytes32 cLeaf = keccak256(abi.encodePacked(carol, AMOUNT));
            (bytes32 lo, bytes32 hi) = aLeaf < cLeaf ? (aLeaf, cLeaf) : (cLeaf, aLeaf);
            rootY5 = keccak256(abi.encodePacked(lo, hi));
            aliceProofY5 = new bytes32[](1);
            aliceProofY5[0] = cLeaf;
            carolProofY5 = new bytes32[](1);
            carolProofY5[0] = aLeaf;
        }
        {
            // Single-leaf tree: leaf IS root, proof is empty
            rootY9 = keccak256(abi.encodePacked(alice, AMOUNT));
        }

        unlockY2 = uint64(block.timestamp + 2 * 365 days);
        unlockY5 = uint64(block.timestamp + 5 * 365 days);
        unlockY9 = uint64(block.timestamp + 9 * 365 days);

        bytes32[3] memory roots = [rootY2, rootY5, rootY9];
        uint64[3] memory unlocks = [unlockY2, unlockY5, unlockY9];
        airdrop = new StagedMerkleAirdrop(address(token), roots, unlocks);

        // Deployer funds itself enough to register the airdrop minter.
        // Airdrop cap = 600M mirrors the canonical allocation at 1:1 scale here.
        token.registerMinter(address(airdrop), 600_000_000 ether);
    }

    // ── Constructor validation ──────────────────────────────────────────

    function test_ConstructorRevertsOnZeroMinter() public {
        bytes32[3] memory roots = [rootY2, rootY5, rootY9];
        uint64[3] memory unlocks = [unlockY2, unlockY5, unlockY9];
        vm.expectRevert(StagedMerkleAirdrop.ZeroMinter.selector);
        new StagedMerkleAirdrop(address(0), roots, unlocks);
    }

    function test_ConstructorRevertsOnZeroRoot() public {
        bytes32[3] memory roots = [rootY2, bytes32(0), rootY9];
        uint64[3] memory unlocks = [unlockY2, unlockY5, unlockY9];
        vm.expectRevert(abi.encodeWithSelector(StagedMerkleAirdrop.ZeroRoot.selector, 1));
        new StagedMerkleAirdrop(address(token), roots, unlocks);
    }

    function test_ConstructorStoresImmutables() public view {
        assertEq(airdrop.minter(), address(token));
        (bytes32 r0, uint64 u0) = airdrop.stages(0);
        (bytes32 r1, uint64 u1) = airdrop.stages(1);
        (bytes32 r2, uint64 u2) = airdrop.stages(2);
        assertEq(r0, rootY2);
        assertEq(r1, rootY5);
        assertEq(r2, rootY9);
        assertEq(u0, unlockY2);
        assertEq(u1, unlockY5);
        assertEq(u2, unlockY9);
    }

    // ── Unlock timing ───────────────────────────────────────────────────

    function test_CannotClaimBeforeUnlock() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(StagedMerkleAirdrop.NotUnlocked.selector, 0));
        airdrop.claim(0, AMOUNT, aliceProofY2);
    }

    function test_CannotClaimLaterStageWhileEarlierStageStillLocked() public {
        vm.warp(unlockY5 + 1);
        vm.prank(alice);
        airdrop.claim(1, AMOUNT, aliceProofY5);
        assertEq(token.balanceOf(alice), AMOUNT);
    }

    // ── Happy path ──────────────────────────────────────────────────────

    function test_CanClaimStage0AfterUnlock() public {
        vm.warp(unlockY2 + 1);
        vm.prank(alice);
        airdrop.claim(0, AMOUNT, aliceProofY2);
        assertEq(token.balanceOf(alice), AMOUNT);
        assertTrue(airdrop.claimed(0, alice));
        assertFalse(airdrop.claimed(1, alice));
        assertFalse(airdrop.claimed(2, alice));
    }

    function test_AliceCanClaimAllThreeStagesIndependently() public {
        vm.warp(unlockY2 + 1);
        vm.prank(alice);
        airdrop.claim(0, AMOUNT, aliceProofY2);

        vm.warp(unlockY5 + 1);
        vm.prank(alice);
        airdrop.claim(1, AMOUNT, aliceProofY5);

        vm.warp(unlockY9 + 1);
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(alice);
        airdrop.claim(2, AMOUNT, emptyProof);

        assertEq(token.balanceOf(alice), AMOUNT * 3);
    }

    // ── One-shot per (stage, account) ───────────────────────────────────

    function test_CannotClaimSameStageTwice() public {
        vm.warp(unlockY2 + 1);
        vm.prank(alice);
        airdrop.claim(0, AMOUNT, aliceProofY2);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(StagedMerkleAirdrop.AlreadyClaimed.selector, 0, alice));
        airdrop.claim(0, AMOUNT, aliceProofY2);
    }

    // ── Proof validation ────────────────────────────────────────────────

    function test_CannotClaimWithWrongProofForStage() public {
        vm.warp(unlockY2 + 1);
        // aliceProofY5 is valid for stage 1 but not stage 0
        vm.prank(alice);
        vm.expectRevert(StagedMerkleAirdrop.InvalidProof.selector);
        airdrop.claim(0, AMOUNT, aliceProofY5);
    }

    function test_CannotClaimIfNotInTree() public {
        vm.warp(unlockY2 + 1);
        address eve = address(0xE);
        vm.prank(eve);
        vm.expectRevert(StagedMerkleAirdrop.InvalidProof.selector);
        airdrop.claim(0, AMOUNT, aliceProofY2);
    }

    function test_CannotClaimWithAlteredAmount() public {
        vm.warp(unlockY2 + 1);
        vm.prank(alice);
        vm.expectRevert(StagedMerkleAirdrop.InvalidProof.selector);
        airdrop.claim(0, AMOUNT + 1, aliceProofY2);
    }

    // ── Stage bounds ────────────────────────────────────────────────────

    function test_CannotClaimInvalidStage() public {
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(StagedMerkleAirdrop.InvalidStage.selector, 3));
        airdrop.claim(3, AMOUNT, emptyProof);
    }
}

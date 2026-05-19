// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {FigToken} from "src/fig/FigToken.sol";
import {RpgfMinter} from "src/fig/RpgfMinter.sol";
import {ISP1Verifier} from "src/interfaces/ISP1Verifier.sol";
import {MockSP1Verifier} from "src/mocks/MockSP1Verifier.sol";

/// @notice Devnet SP1 verifier that always reverts — used to test
///         that `submitRoot` propagates verifier failures.
contract RevertingSP1Verifier is ISP1Verifier {
    error ProofRejected();

    function verifyProof(
        bytes32, /* programVKey */
        bytes calldata, /* publicValues */
        bytes calldata /* proofBytes */
    ) external pure override {
        revert ProofRejected();
    }
}

contract RpgfMinterTest is Test {
    FigToken internal token;
    RpgfMinter internal minter;
    MockSP1Verifier internal verifier;

    address internal deployer = address(this);
    address internal sequencer = address(0xBEEF);
    address internal alice = address(0xA);
    address internal bob = address(0xB);
    address internal carol = address(0xC);

    bytes32 internal constant PROGRAM_VKEY = bytes32(uint256(0xDEAD));
    uint256 internal constant AMOUNT = 100 ether;

    uint64 internal unlockY2;
    uint64 internal unlockY5;
    uint64 internal unlockY9;

    bytes32 internal rootY2;
    bytes32[] internal aliceProofY2;
    bytes32[] internal bobProofY2;

    bytes32 internal rootY9;

    function setUp() public {
        token = new FigToken();
        verifier = new MockSP1Verifier();

        unlockY2 = uint64(block.timestamp + 2 * 365 days);
        unlockY5 = uint64(block.timestamp + 5 * 365 days);
        unlockY9 = uint64(block.timestamp + 9 * 365 days);

        uint64[3] memory unlocks = [unlockY2, unlockY5, unlockY9];
        minter = new RpgfMinter(
            address(token),
            address(verifier),
            PROGRAM_VKEY,
            sequencer,
            unlocks
        );

        token.registerMinter(address(minter), 600_000_000 ether);

        // Y2 tree: alice + bob, sorted-pair root
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
        // Y9 tree: single-leaf (alice only) — leaf is the root
        rootY9 = keccak256(abi.encodePacked(alice, AMOUNT));
    }

    function _publicValues(uint8 stageIndex, bytes32 root, uint256 totalAllocated, uint32 schemaCount)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(stageIndex, root, totalAllocated, schemaCount);
    }

    function _submit(uint8 stageIndex, bytes32 root, uint256 totalAllocated, uint32 schemaCount) internal {
        vm.prank(sequencer);
        minter.submitRoot(_publicValues(stageIndex, root, totalAllocated, schemaCount), hex"");
    }

    // ── Constructor validation ──────────────────────────────────────────

    function test_ConstructorRevertsOnZeroMinter() public {
        uint64[3] memory unlocks = [unlockY2, unlockY5, unlockY9];
        vm.expectRevert(RpgfMinter.ZeroMinter.selector);
        new RpgfMinter(address(0), address(verifier), PROGRAM_VKEY, sequencer, unlocks);
    }

    function test_ConstructorRevertsOnZeroVerifier() public {
        uint64[3] memory unlocks = [unlockY2, unlockY5, unlockY9];
        vm.expectRevert(RpgfMinter.ZeroVerifier.selector);
        new RpgfMinter(address(token), address(0), PROGRAM_VKEY, sequencer, unlocks);
    }

    function test_ConstructorRevertsIfVerifierNotContract() public {
        uint64[3] memory unlocks = [unlockY2, unlockY5, unlockY9];
        address notAContract = address(0xDEADBEEF);
        vm.expectRevert(RpgfMinter.VerifierNotContract.selector);
        new RpgfMinter(address(token), notAContract, PROGRAM_VKEY, sequencer, unlocks);
    }

    function test_ConstructorRevertsOnZeroSubmitter() public {
        uint64[3] memory unlocks = [unlockY2, unlockY5, unlockY9];
        vm.expectRevert(RpgfMinter.ZeroSubmitter.selector);
        new RpgfMinter(address(token), address(verifier), PROGRAM_VKEY, address(0), unlocks);
    }

    function test_ConstructorStoresImmutables() public view {
        assertEq(minter.minter(), address(token));
        assertEq(address(minter.verifier()), address(verifier));
        assertEq(minter.programVKey(), PROGRAM_VKEY);
        assertEq(minter.submitter(), sequencer);

        (bytes32 r0, uint64 u0, uint256 t0) = minter.stages(0);
        (bytes32 r1, uint64 u1, uint256 t1) = minter.stages(1);
        (bytes32 r2, uint64 u2, uint256 t2) = minter.stages(2);
        assertEq(r0, bytes32(0));
        assertEq(r1, bytes32(0));
        assertEq(r2, bytes32(0));
        assertEq(u0, unlockY2);
        assertEq(u1, unlockY5);
        assertEq(u2, unlockY9);
        assertEq(t0, 0);
        assertEq(t1, 0);
        assertEq(t2, 0);
    }

    // ── submitRoot — authorization & one-shot ───────────────────────────

    function test_OnlySubmitterCanSubmitRoot() public {
        bytes memory pv = _publicValues(0, rootY2, 2 * AMOUNT, 2);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotSubmitter.selector, alice));
        vm.prank(alice);
        minter.submitRoot(pv, hex"");
    }

    function test_SubmitterCanSubmitRoot() public {
        _submit(0, rootY2, 2 * AMOUNT, 2);
        (bytes32 root, uint64 unlockTime, uint256 totalAllocated) = minter.stages(0);
        assertEq(root, rootY2);
        assertEq(unlockTime, unlockY2);
        assertEq(totalAllocated, 2 * AMOUNT);
    }

    function test_RootCanBeSubmittedOnlyOncePerStage() public {
        _submit(0, rootY2, 2 * AMOUNT, 2);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.RootAlreadySet.selector, 0));
        _submit(0, rootY2, 2 * AMOUNT, 2);
    }

    function test_SubmitRootRevertsOnZeroRoot() public {
        vm.expectRevert(RpgfMinter.ZeroRoot.selector);
        _submit(0, bytes32(0), 2 * AMOUNT, 2);
    }

    function test_SubmitRootRevertsOnInvalidStage() public {
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.InvalidStage.selector, uint8(3)));
        _submit(3, rootY2, 2 * AMOUNT, 2);
    }

    function test_SubmitRootPropagatesVerifierFailure() public {
        // Redeploy minter with a reverting verifier in its place.
        RevertingSP1Verifier rev = new RevertingSP1Verifier();
        uint64[3] memory unlocks = [unlockY2, unlockY5, unlockY9];
        RpgfMinter m = new RpgfMinter(
            address(token),
            address(rev),
            PROGRAM_VKEY,
            sequencer,
            unlocks
        );

        bytes memory pv = _publicValues(0, rootY2, 2 * AMOUNT, 2);
        vm.expectRevert(RevertingSP1Verifier.ProofRejected.selector);
        vm.prank(sequencer);
        m.submitRoot(pv, hex"");
    }

    function test_SubmitRootEmitsEvent() public {
        bytes memory pv = _publicValues(0, rootY2, 2 * AMOUNT, 2);
        vm.expectEmit(true, true, false, true);
        emit RpgfMinter.RootSubmitted(0, rootY2, 2 * AMOUNT, 2);
        vm.prank(sequencer);
        minter.submitRoot(pv, hex"");
    }

    // ── claim — root prerequisite ───────────────────────────────────────

    function test_ClaimRevertsBeforeRootSet() public {
        vm.warp(unlockY2 + 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.RootNotSet.selector, 0));
        minter.claim(0, AMOUNT, aliceProofY2);
    }

    // ── claim — unlock timing ───────────────────────────────────────────

    function test_ClaimRevertsBeforeUnlock() public {
        _submit(0, rootY2, 2 * AMOUNT, 2);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotUnlocked.selector, 0));
        minter.claim(0, AMOUNT, aliceProofY2);
    }

    // ── claim — happy path ──────────────────────────────────────────────

    function test_CanClaimAfterRootSetAndUnlock() public {
        _submit(0, rootY2, 2 * AMOUNT, 2);
        vm.warp(unlockY2 + 1);

        vm.expectEmit(true, true, false, true);
        emit RpgfMinter.Claimed(0, alice, AMOUNT);
        vm.prank(alice);
        minter.claim(0, AMOUNT, aliceProofY2);

        assertEq(token.balanceOf(alice), AMOUNT);
        assertTrue(minter.claimed(0, alice));
        assertFalse(minter.claimed(0, bob));
    }

    function test_TwoClaimantsCanClaimSameStage() public {
        _submit(0, rootY2, 2 * AMOUNT, 2);
        vm.warp(unlockY2 + 1);

        vm.prank(alice);
        minter.claim(0, AMOUNT, aliceProofY2);

        vm.prank(bob);
        minter.claim(0, AMOUNT, bobProofY2);

        assertEq(token.balanceOf(alice), AMOUNT);
        assertEq(token.balanceOf(bob), AMOUNT);
    }

    // ── claim — one-shot per (stage, account) ───────────────────────────

    function test_CannotClaimSameStageTwice() public {
        _submit(0, rootY2, 2 * AMOUNT, 2);
        vm.warp(unlockY2 + 1);

        vm.prank(alice);
        minter.claim(0, AMOUNT, aliceProofY2);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.AlreadyClaimed.selector, 0, alice));
        minter.claim(0, AMOUNT, aliceProofY2);
    }

    // ── claim — proof validation ────────────────────────────────────────

    function test_CannotClaimIfNotInTree() public {
        _submit(0, rootY2, 2 * AMOUNT, 2);
        vm.warp(unlockY2 + 1);

        address eve = address(0xE);
        vm.prank(eve);
        vm.expectRevert(RpgfMinter.InvalidProof.selector);
        minter.claim(0, AMOUNT, aliceProofY2);
    }

    function test_CannotClaimWithAlteredAmount() public {
        _submit(0, rootY2, 2 * AMOUNT, 2);
        vm.warp(unlockY2 + 1);

        vm.prank(alice);
        vm.expectRevert(RpgfMinter.InvalidProof.selector);
        minter.claim(0, AMOUNT + 1, aliceProofY2);
    }

    // ── claim — stage bounds ────────────────────────────────────────────

    function test_CannotClaimInvalidStage() public {
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.InvalidStage.selector, uint8(3)));
        minter.claim(3, AMOUNT, emptyProof);
    }

    // ── Multi-stage independence ────────────────────────────────────────

    function test_StagesAreIndependent() public {
        _submit(0, rootY2, 2 * AMOUNT, 2);
        _submit(2, rootY9, AMOUNT, 1);

        vm.warp(unlockY9 + 1);

        // alice claims stage 0
        vm.prank(alice);
        minter.claim(0, AMOUNT, aliceProofY2);

        // alice claims stage 2 (single-leaf tree, empty proof)
        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(alice);
        minter.claim(2, AMOUNT, emptyProof);

        assertEq(token.balanceOf(alice), 2 * AMOUNT);
        assertTrue(minter.claimed(0, alice));
        assertFalse(minter.claimed(1, alice));
        assertTrue(minter.claimed(2, alice));
    }

    function test_Stage1RemainsZeroIfNotSubmitted() public {
        _submit(0, rootY2, 2 * AMOUNT, 2);
        // stage 1 was never submitted; root should still be zero
        (bytes32 r1,, uint256 t1) = minter.stages(1);
        assertEq(r1, bytes32(0));
        assertEq(t1, 0);
    }

    // ── Rust ↔ Solidity ABI conformance ─────────────────────────────────

    /// @notice Canonical test vector — the same 128-byte payload is
    ///         produced by `prover/rpgf/tests/aggregator_test.rs::
    ///         abi_encoding_matches_solidity_layout` via the Rust
    ///         `TrancheOutput::abi_encode_public_values`. This test
    ///         confirms `abi.decode` extracts the same field values
    ///         the Rust side encoded, i.e. the SP1 program's
    ///         `commit_slice` output is consumable by `submitRoot`.
    ///
    ///         Layout (4 × 32-byte words):
    ///           word 0: uint8 tranche_index = 2 (value at byte 31)
    ///           word 1: bytes32 merkle_root = 0x42 × 32
    ///           word 2: uint256 total_allocated = 1_000_000 = 0x0F4240
    ///           word 3: uint32 schema_count = 17 = 0x11
    function test_AbiPublicValuesConformance() public pure {
        bytes memory pv =
            hex"0000000000000000000000000000000000000000000000000000000000000002424242424242424242424242424242424242424242424242424242424242424200000000000000000000000000000000000000000000000000000000000F42400000000000000000000000000000000000000000000000000000000000000011";

        (uint8 stageIndex, bytes32 root, uint256 totalAllocated, uint32 schemaCount) =
            abi.decode(pv, (uint8, bytes32, uint256, uint32));

        assertEq(uint256(stageIndex), 2);
        assertEq(root, bytes32(uint256(0x4242424242424242424242424242424242424242424242424242424242424242)));
        assertEq(totalAllocated, 1_000_000);
        assertEq(uint256(schemaCount), 17);
    }
}

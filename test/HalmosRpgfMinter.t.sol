// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {FigToken} from "src/fig/FigToken.sol";
import {RpgfMinter} from "src/fig/RpgfMinter.sol";
import {ISP1Verifier} from "src/interfaces/ISP1Verifier.sol";

/// @notice Halmos-friendly SP1 verifier — accepts any proof bytes,
///         independent of `block.chainid` (unlike MockSP1Verifier
///         whose Anvil-only require would fight Halmos's symbolic
///         block context).
contract AcceptAllVerifier is ISP1Verifier {
    function verifyProof(bytes32, bytes calldata, bytes calldata) external pure override {
        // Always accepts. Halmos quantifies over the proof bytes regardless.
    }
}

/// @title HalmosRpgfMinter — Symbolic verification of RpgfMinter invariants
/// @notice Replaces the 2026-05-retired HalmosStagedMerkleAirdrop harness
///         with property checks for the new SP1-gated minter. Function
///         names use the `check_` prefix (Halmos convention).
///
/// @dev Properties:
///        H1 claim sets claimed[stage][msg.sender]
///        H2 claim reverts on AlreadyClaimed (one-shot per stage,address)
///        H3 claim reverts on NotUnlocked
///        H4 claim reverts on InvalidStage (stageIndex >= 3)
///        H5 claim reverts on RootNotSet
///        H6 submitRoot reverts on NotSubmitter (auth gate)
///        H7 submitRoot reverts on RootAlreadySet (one-shot per stage)
///        H8 submitRoot reverts on ZeroRoot
contract HalmosRpgfMinter is Test {
    FigToken internal token;
    AcceptAllVerifier internal verifier;
    RpgfMinter internal minter;

    address internal SUBMITTER = address(0xBEEF);
    bytes32 internal constant PROGRAM_VKEY = bytes32(uint256(0xDEAD));

    /// @dev Stage 0 unlock is in the past (1). Stages 1 and 2 are
    ///      far-future, so symbolic quantification cleanly separates
    ///      the unlocked / not-yet-unlocked branches.
    function setUp() public {
        token = new FigToken();
        verifier = new AcceptAllVerifier();

        uint64[3] memory unlocks = [uint64(1), uint64(type(uint64).max - 1), uint64(type(uint64).max)];
        minter = new RpgfMinter(address(token), address(verifier), PROGRAM_VKEY, SUBMITTER, unlocks);
        token.registerMinter(address(minter), 600_000_000 ether);
    }

    /// @dev Pre-submit a root that makes a single (account, amount=1)
    ///      tree resolvable with an empty proof: leaf == root.
    function _submitSingleLeafRoot(uint8 stageIndex, address account, uint256 amount) internal {
        bytes32 leaf = keccak256(abi.encodePacked(account, amount));
        bytes memory pv = abi.encode(stageIndex, leaf, amount, uint32(1));
        vm.prank(SUBMITTER);
        minter.submitRoot(pv, hex"");
    }

    // ── H1: claim sets claimed[stage][msg.sender] ────────────────────────

    function check_claimSetsFlag(address account) public {
        vm.assume(account != address(0));
        uint256 amount = 1;
        _submitSingleLeafRoot(0, account, amount);
        bytes32[] memory emptyProof = new bytes32[](0);

        vm.prank(account);
        minter.claim(0, amount, emptyProof);

        assert(minter.claimed(0, account));
    }

    // ── H2: AlreadyClaimed on second call (one-shot) ────────────────────

    function check_alreadyClaimedReverts(address account) public {
        vm.assume(account != address(0));
        uint256 amount = 1;
        _submitSingleLeafRoot(0, account, amount);
        bytes32[] memory emptyProof = new bytes32[](0);

        vm.prank(account);
        minter.claim(0, amount, emptyProof);

        vm.prank(account);
        try minter.claim(0, amount, emptyProof) {
            assert(false); // must revert
        } catch (bytes memory err) {
            bytes4 sel = bytes4(err);
            assert(sel == RpgfMinter.AlreadyClaimed.selector);
        }
    }

    // ── H3: NotUnlocked when block.timestamp < unlockTime ───────────────

    function check_notUnlockedReverts(address account, uint64 ts) public {
        vm.assume(account != address(0));
        // Stage 1's unlockTime is type(uint64).max - 1, so any ts < that
        // is "not unlocked". Symbolic ts quantifies that.
        vm.assume(ts < type(uint64).max - 1);
        vm.warp(ts);

        uint256 amount = 1;
        _submitSingleLeafRoot(1, account, amount);
        bytes32[] memory emptyProof = new bytes32[](0);

        vm.prank(account);
        try minter.claim(1, amount, emptyProof) {
            assert(false); // must revert
        } catch (bytes memory err) {
            bytes4 sel = bytes4(err);
            assert(sel == RpgfMinter.NotUnlocked.selector);
        }
    }

    // ── H4: InvalidStage for stageIndex >= 3 ────────────────────────────

    function check_invalidStageReverts(uint8 stageIndex, address account, uint256 amount) public {
        vm.assume(stageIndex >= 3);
        bytes32[] memory emptyProof = new bytes32[](0);

        vm.prank(account);
        try minter.claim(stageIndex, amount, emptyProof) {
            assert(false); // must revert
        } catch (bytes memory err) {
            bytes4 sel = bytes4(err);
            assert(sel == RpgfMinter.InvalidStage.selector);
        }
    }

    // ── H5: RootNotSet when stage has not had submitRoot called ─────────

    function check_rootNotSetReverts(address account, uint256 amount) public {
        // No submitRoot call → stages[0].root == bytes32(0).
        bytes32[] memory emptyProof = new bytes32[](0);

        vm.prank(account);
        try minter.claim(0, amount, emptyProof) {
            assert(false); // must revert
        } catch (bytes memory err) {
            bytes4 sel = bytes4(err);
            assert(sel == RpgfMinter.RootNotSet.selector);
        }
    }

    // ── H6: NotSubmitter on submitRoot from non-submitter ──────────────

    function check_submitRootNotSubmitterReverts(address caller, bytes32 root, uint256 totalAllocated)
        public
    {
        vm.assume(caller != SUBMITTER);
        vm.assume(root != bytes32(0));
        bytes memory pv = abi.encode(uint8(0), root, totalAllocated, uint32(1));

        vm.prank(caller);
        try minter.submitRoot(pv, hex"") {
            assert(false); // must revert
        } catch (bytes memory err) {
            bytes4 sel = bytes4(err);
            assert(sel == RpgfMinter.NotSubmitter.selector);
        }
    }

    // ── H7: RootAlreadySet on second submitRoot for same stage ─────────

    function check_submitRootAlreadySetReverts(bytes32 root1, bytes32 root2) public {
        vm.assume(root1 != bytes32(0));
        vm.assume(root2 != bytes32(0));
        bytes memory pv1 = abi.encode(uint8(0), root1, uint256(0), uint32(1));
        bytes memory pv2 = abi.encode(uint8(0), root2, uint256(0), uint32(1));

        vm.prank(SUBMITTER);
        minter.submitRoot(pv1, hex"");

        vm.prank(SUBMITTER);
        try minter.submitRoot(pv2, hex"") {
            assert(false); // must revert
        } catch (bytes memory err) {
            bytes4 sel = bytes4(err);
            assert(sel == RpgfMinter.RootAlreadySet.selector);
        }
    }

    // ── H8: ZeroRoot rejected by submitRoot ────────────────────────────

    function check_submitRootZeroRootReverts(uint256 totalAllocated) public {
        bytes memory pv = abi.encode(uint8(0), bytes32(0), totalAllocated, uint32(1));

        vm.prank(SUBMITTER);
        try minter.submitRoot(pv, hex"") {
            assert(false); // must revert
        } catch (bytes memory err) {
            bytes4 sel = bytes4(err);
            assert(sel == RpgfMinter.ZeroRoot.selector);
        }
    }
}

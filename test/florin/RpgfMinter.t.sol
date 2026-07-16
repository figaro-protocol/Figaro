// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {FlorinToken} from "src/florin/FlorinToken.sol";
import {RpgfMinter} from "src/florin/RpgfMinter.sol";
import {MockArbitrator} from "src/mocks/MockArbitrator.sol";

/// @title RpgfMinterTest
/// @notice Foundry tests for the optimistic RPGF minter: post/challenge/
///         dispute/rule/concede/finalize/claim lifecycle, bond routing,
///         budget backstops, and the florin genesis coupling (minter registered
///         before renounce).
contract RpgfMinterTest is Test {
    FlorinToken internal florin;
    MockArbitrator internal arbitrator;
    RpgfMinter internal minter;

    address internal poster = address(0xA11CE);
    address internal challenger = address(0xB0B);
    address internal alice = address(0xAAA1);
    address internal bob = address(0xBBB2);

    uint256 internal constant BOND = 1 ether;
    uint64 internal constant CHALLENGE_WINDOW = 1 days;
    uint64 internal constant DISPUTE_WINDOW = 2 days;
    uint256 internal constant T0_AMOUNT = 300_000_000 ether;
    uint256 internal constant T1_AMOUNT = 200_000_000 ether;
    uint256 internal constant T2_AMOUNT = 100_000_000 ether;

    uint64 internal t1Post;
    uint64 internal t2Post;

    function setUp() public {
        florin = new FlorinToken();
        arbitrator = new MockArbitrator();

        uint64 nowTs = uint64(block.timestamp);
        t1Post = nowTs + 30 days;
        t2Post = nowTs + 60 days;

        minter = new RpgfMinter(
            address(florin),
            address(arbitrator),
            keccak256("formula-spec-v1"),
            BOND,
            CHALLENGE_WINDOW,
            DISPUTE_WINDOW,
            [nowTs, t1Post, t2Post],
            [T0_AMOUNT, T1_AMOUNT, T2_AMOUNT]
        );

        // Genesis coupling: the minter registers BEFORE renounce, like the
        // deploy flow. 600M cap = sum of tranche budgets.
        florin.registerMinter(address(minter), 600_000_000 ether);
        florin.renounceDeployerMint();

        vm.deal(poster, 100 ether);
        vm.deal(challenger, 100 ether);
    }

    // ── Merkle helpers (OZ standard-tree shape: double-hashed leaves,
    //    sorted-pair internal nodes) ──────────────────────────────────

    function _leaf(address account, uint256 amount) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account, amount))));
    }

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    /// @dev Two-leaf tree: returns (root, proofForLeafA).
    function _twoLeafTree(bytes32 a, bytes32 b) internal pure returns (bytes32 root, bytes32[] memory proofA) {
        root = _hashPair(a, b);
        proofA = new bytes32[](1);
        proofA[0] = b;
    }

    function _postAndFinalize(uint8 trancheId, bytes32 root) internal {
        vm.prank(poster);
        minter.postRoot{value: BOND}(trancheId, root, 0, 1000);
        vm.warp(block.timestamp + CHALLENGE_WINDOW);
        minter.finalize(trancheId);
    }

    // ── Constructor validation ──────────────────────────────────────

    function test_ConstructorRejectsZeroAddresses() public {
        uint64 nowTs = uint64(block.timestamp);
        vm.expectRevert(RpgfMinter.ZeroAddress.selector);
        new RpgfMinter(
            address(0), address(arbitrator), bytes32(0), BOND, 1, 1, [nowTs, nowTs + 1, nowTs + 2], [uint256(1), 1, 1]
        );
        vm.expectRevert(RpgfMinter.ZeroAddress.selector);
        new RpgfMinter(
            address(florin), address(0), bytes32(0), BOND, 1, 1, [nowTs, nowTs + 1, nowTs + 2], [uint256(1), 1, 1]
        );
    }

    function test_ConstructorRejectsZeroBondWindowAmount() public {
        uint64 nowTs = uint64(block.timestamp);
        vm.expectRevert(RpgfMinter.ZeroBond.selector);
        new RpgfMinter(
            address(florin), address(arbitrator), bytes32(0), 0, 1, 1, [nowTs, nowTs + 1, nowTs + 2], [uint256(1), 1, 1]
        );
        vm.expectRevert(RpgfMinter.ZeroWindow.selector);
        new RpgfMinter(
            address(florin), address(arbitrator), bytes32(0), BOND, 0, 1, [nowTs, nowTs + 1, nowTs + 2], [uint256(1), 1, 1]
        );
        vm.expectRevert(RpgfMinter.ZeroAmount.selector);
        new RpgfMinter(
            address(florin), address(arbitrator), bytes32(0), BOND, 1, 1, [nowTs, nowTs + 1, nowTs + 2], [uint256(0), 1, 1]
        );
    }

    function test_ConstructorRejectsNonAscendingPostTimes() public {
        uint64 nowTs = uint64(block.timestamp);
        vm.expectRevert(RpgfMinter.PostTimesNotAscending.selector);
        new RpgfMinter(
            address(florin), address(arbitrator), bytes32(0), BOND, 1, 1, [nowTs, nowTs, nowTs + 1], [uint256(1), 1, 1]
        );
    }

    // ── Post ────────────────────────────────────────────────────────

    function test_PostRootHoldsBondAndRecordsWindow() public {
        vm.prank(poster);
        minter.postRoot{value: BOND}(0, keccak256("root"), 7, 42);
        (address p, bytes32 root, uint64 fromBlock, uint64 toBlock, uint64 postedAt) = minter.postings(0);
        assertEq(p, poster);
        assertEq(root, keccak256("root"));
        assertEq(fromBlock, 7);
        assertEq(toBlock, 42);
        assertGt(postedAt, 0);
        assertEq(address(minter).balance, BOND);
    }

    function test_PostRootRejectsEarlyTranche() public {
        vm.prank(poster);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.PostTooEarly.selector, 1, t1Post));
        minter.postRoot{value: BOND}(1, keccak256("root"), 0, 1);
    }

    function test_PostRootRejectsWrongBondZeroRootDoublePostBadTranche() public {
        vm.prank(poster);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.WrongBond.selector, BOND, BOND - 1));
        minter.postRoot{value: BOND - 1}(0, keccak256("root"), 0, 1);

        vm.prank(poster);
        vm.expectRevert(RpgfMinter.ZeroRoot.selector);
        minter.postRoot{value: BOND}(0, bytes32(0), 0, 1);

        vm.prank(poster);
        minter.postRoot{value: BOND}(0, keccak256("root"), 0, 1);
        vm.prank(challenger);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.PostingActive.selector, 0));
        minter.postRoot{value: BOND}(0, keccak256("other"), 0, 1);

        vm.prank(poster);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.InvalidTranche.selector, 3));
        minter.postRoot{value: BOND}(3, keccak256("root"), 0, 1);
    }

    // ── Challenge ───────────────────────────────────────────────────

    function test_ChallengeVoidsPostingAndOpensCase() public {
        vm.prank(poster);
        minter.postRoot{value: BOND}(0, keccak256("root"), 0, 1);

        vm.prank(challenger);
        uint256 caseId = minter.challenge{value: BOND}(0);

        (,,,, uint64 postedAt) = minter.postings(0);
        assertEq(postedAt, 0, "posting voided");
        (address p, address c, uint64 challengedAt, RpgfMinter.CaseStatus status) = minter.bondCases(caseId);
        assertEq(p, poster);
        assertEq(c, challenger);
        assertGt(challengedAt, 0);
        assertEq(uint8(status), uint8(RpgfMinter.CaseStatus.Open));

        // The slot is free: a corrected root posts immediately.
        vm.prank(challenger);
        minter.postRoot{value: BOND}(0, keccak256("corrected"), 0, 1);
    }

    function test_ChallengeRejectsNoPostingClosedWindowWrongBond() public {
        vm.prank(challenger);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NoActivePosting.selector, 0));
        minter.challenge{value: BOND}(0);

        vm.prank(poster);
        minter.postRoot{value: BOND}(0, keccak256("root"), 0, 1);

        vm.prank(challenger);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.WrongBond.selector, BOND, 2 * BOND));
        minter.challenge{value: 2 * BOND}(0);

        vm.warp(block.timestamp + CHALLENGE_WINDOW);
        vm.prank(challenger);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.ChallengeWindowClosed.selector, 0));
        minter.challenge{value: BOND}(0);
    }

    // ── Concede ─────────────────────────────────────────────────────

    function test_ConcedePaysChallengerBothBonds() public {
        vm.prank(poster);
        minter.postRoot{value: BOND}(0, keccak256("root"), 0, 1);
        vm.prank(challenger);
        uint256 caseId = minter.challenge{value: BOND}(0);

        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.DisputeWindowOpen.selector, caseId));
        minter.concede(caseId);

        vm.warp(block.timestamp + DISPUTE_WINDOW);
        minter.concede(caseId);
        assertEq(minter.withdrawable(challenger), 2 * BOND);

        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.CaseNotOpen.selector, caseId));
        minter.concede(caseId);

        uint256 before = challenger.balance;
        vm.prank(challenger);
        minter.withdrawBonds();
        assertEq(challenger.balance - before, 2 * BOND);
        assertEq(minter.withdrawable(challenger), 0);
    }

    // ── Dispute + ruling ────────────────────────────────────────────

    function test_DisputeIsPosterOnlyWithinWindow() public {
        vm.prank(poster);
        minter.postRoot{value: BOND}(0, keccak256("root"), 0, 1);
        vm.prank(challenger);
        uint256 caseId = minter.challenge{value: BOND}(0);

        vm.prank(challenger);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotPoster.selector, caseId));
        minter.disputeChallenge(caseId);

        vm.warp(block.timestamp + DISPUTE_WINDOW);
        vm.prank(poster);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.DisputeWindowClosed.selector, caseId));
        minter.disputeChallenge(caseId);
    }

    function test_RulingRoutesBonds() public {
        // Poster wins: both bonds to poster.
        vm.prank(poster);
        minter.postRoot{value: BOND}(0, keccak256("root"), 0, 1);
        vm.prank(challenger);
        uint256 caseA = minter.challenge{value: BOND}(0);
        vm.prank(poster);
        minter.disputeChallenge(caseA);
        arbitrator.deliverRuling(address(minter), caseA, minter.RULING_POSTER());
        assertEq(minter.withdrawable(poster), 2 * BOND);

        // Challenger wins: both bonds to challenger.
        vm.prank(poster);
        minter.postRoot{value: BOND}(0, keccak256("root2"), 0, 1);
        vm.prank(challenger);
        uint256 caseB = minter.challenge{value: BOND}(0);
        vm.prank(poster);
        minter.disputeChallenge(caseB);
        arbitrator.deliverRuling(address(minter), caseB, minter.RULING_CHALLENGER());
        assertEq(minter.withdrawable(challenger), 2 * BOND);

        // Refused: each side gets its own bond back.
        vm.prank(poster);
        minter.postRoot{value: BOND}(0, keccak256("root3"), 0, 1);
        vm.prank(challenger);
        uint256 caseC = minter.challenge{value: BOND}(0);
        vm.prank(poster);
        minter.disputeChallenge(caseC);
        arbitrator.deliverRuling(address(minter), caseC, minter.RULING_REFUSED());
        assertEq(minter.withdrawable(poster), 3 * BOND);
        assertEq(minter.withdrawable(challenger), 3 * BOND);
    }

    function test_RuleGatesArbitratorStatusAndRulingRange() public {
        vm.prank(poster);
        minter.postRoot{value: BOND}(0, keccak256("root"), 0, 1);
        vm.prank(challenger);
        uint256 caseId = minter.challenge{value: BOND}(0);

        vm.expectRevert(RpgfMinter.NotArbitrator.selector);
        minter.rule(caseId, 1);

        // Not yet disputed.
        vm.prank(address(arbitrator));
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.CaseNotDisputed.selector, caseId));
        minter.rule(caseId, 1);

        vm.prank(poster);
        minter.disputeChallenge(caseId);
        vm.prank(address(arbitrator));
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.InvalidRuling.selector, 9));
        minter.rule(caseId, 9);
    }

    // ── Finalize ────────────────────────────────────────────────────

    function test_FinalizeRequiresElapsedWindowAndReturnsBond() public {
        vm.prank(poster);
        minter.postRoot{value: BOND}(0, keccak256("root"), 3, 99);

        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.ChallengeWindowOpen.selector, 0));
        minter.finalize(0);

        vm.warp(block.timestamp + CHALLENGE_WINDOW);
        minter.finalize(0);

        (,, bytes32 root, uint64 fromBlock, uint64 toBlock, bool finalized,) = minter.tranches(0);
        assertEq(root, keccak256("root"));
        assertEq(fromBlock, 3);
        assertEq(toBlock, 99);
        assertTrue(finalized);
        assertEq(minter.withdrawable(poster), BOND);

        // Finalized tranche: no reposts, no refinalize.
        vm.prank(poster);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.TrancheFinalized.selector, 0));
        minter.postRoot{value: BOND}(0, keccak256("late"), 0, 1);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.TrancheFinalized.selector, 0));
        minter.finalize(0);
    }

    // ── Claim ───────────────────────────────────────────────────────

    function test_ClaimMintsFlorinAgainstFinalizedRoot() public {
        (bytes32 root, bytes32[] memory proofAlice) = _twoLeafTree(_leaf(alice, 100 ether), _leaf(bob, 50 ether));
        _postAndFinalize(0, root);

        // Anyone may execute the claim; the mint goes to the account.
        vm.prank(bob);
        minter.claim(0, alice, 100 ether, proofAlice);
        assertEq(florin.balanceOf(alice), 100 ether);
        assertTrue(minter.claimed(0, alice));

        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.AlreadyClaimed.selector, 0, alice));
        minter.claim(0, alice, 100 ether, proofAlice);
    }

    function test_ClaimRejectsBadProofWrongAmountUnfinalized() public {
        (bytes32 root, bytes32[] memory proofAlice) = _twoLeafTree(_leaf(alice, 100 ether), _leaf(bob, 50 ether));

        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.TrancheNotFinalized.selector, 0));
        minter.claim(0, alice, 100 ether, proofAlice);

        _postAndFinalize(0, root);

        vm.expectRevert(RpgfMinter.InvalidProof.selector);
        minter.claim(0, alice, 999 ether, proofAlice);

        vm.expectRevert(RpgfMinter.InvalidProof.selector);
        minter.claim(0, bob, 50 ether, proofAlice);
    }

    function test_ClaimEnforcesTrancheBudgetBackstop() public {
        // An over-allocating root (exactly what challenges exist to kill)
        // still cannot exceed the tranche budget at claim time.
        (bytes32 root, bytes32[] memory proofAlice) =
            _twoLeafTree(_leaf(alice, T0_AMOUNT), _leaf(bob, 1 ether));
        _postAndFinalize(0, root);

        minter.claim(0, alice, T0_AMOUNT, proofAlice);

        bytes32[] memory proofBob = new bytes32[](1);
        proofBob[0] = _leaf(alice, T0_AMOUNT);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.TrancheBudgetExceeded.selector, 0));
        minter.claim(0, bob, 1 ether, proofBob);
    }

    function test_FlorinMinterCapBoundsTotalMintingAcrossTranches() public view {
        // The outer FlorinToken cap (600M) is the second backstop.
        (uint256 cap,) = florin.minters(address(minter));
        assertEq(cap, 600_000_000 ether);
        assertEq(florin.totalRegisteredCap(), 600_000_000 ether);
    }

    // ── Withdraw ────────────────────────────────────────────────────

    function test_WithdrawBondsRejectsEmptyBalance() public {
        vm.prank(alice);
        vm.expectRevert(RpgfMinter.NothingToWithdraw.selector);
        minter.withdrawBonds();
    }
}

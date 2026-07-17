// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {DonationRail} from "src/DonationRail.sol";
import {OptimisticMatchPool} from "src/OptimisticMatchPool.sol";
import {MockERC20} from "src/mocks/MockERC20.sol";
import {MockERC20FeeOnTransfer} from "src/mocks/MockERC20FeeOnTransfer.sol";
import {MockArbitrator} from "src/mocks/MockArbitrator.sol";

/// @title OptimisticMatchPoolTest
/// @notice One crowd-steered match round end to end: donations flow through
///         the no-custody rail (strict amounts — fee-on-transfer reverts);
///         the match root posts optimistically, a challenge always voids,
///         bond cases settle on the composed-forum track (the minter's exact
///         mechanics), finalization snapshots the budget, and merkle claims
///         pay the match out. Money legs asserted throughout.
contract OptimisticMatchPoolTest is Test {
    DonationRail internal rail;
    OptimisticMatchPool internal pool;
    MockERC20 internal florin; // the match token (any ERC-20; named for the use case)
    MockERC20 internal usdc; // the donation token
    MockArbitrator internal arbitrator;

    address internal funder = address(0xDA0);
    address internal donorA = address(0xD0A);
    address internal donorB = address(0xD0B);
    address internal recipientX = address(0xEC1);
    address internal recipientY = address(0xEC2);
    address internal poster = address(0xA11CE);
    address internal challenger = address(0xB0B);

    uint256 internal constant BOND = 1 ether;
    uint64 internal constant CHALLENGE_WINDOW = 1 days;
    uint64 internal constant DISPUTE_WINDOW = 2 days;
    uint256 internal constant MATCH_AMOUNT = 100_000 ether;

    uint64 internal donationStart;
    uint64 internal donationEnd;

    function setUp() public {
        rail = new DonationRail();
        florin = new MockERC20("Florin", "FLORIN");
        usdc = new MockERC20("USD Coin", "USDC");
        arbitrator = new MockArbitrator();

        donationStart = uint64(block.timestamp);
        donationEnd = donationStart + 7 days;
        pool = new OptimisticMatchPool(
            address(florin),
            address(usdc),
            address(rail),
            keccak256("match-formula-v1"),
            address(arbitrator),
            BOND,
            CHALLENGE_WINDOW,
            DISPUTE_WINDOW,
            donationStart,
            donationEnd
        );

        // The DAO treasury is ONE funder among all — an ordinary transfer in.
        florin.mint(funder, MATCH_AMOUNT);
        vm.prank(funder);
        florin.transfer(address(pool), MATCH_AMOUNT);

        usdc.mint(donorA, 1_000 ether);
        usdc.mint(donorB, 1_000 ether);
        vm.prank(donorA);
        usdc.approve(address(rail), type(uint256).max);
        vm.prank(donorB);
        usdc.approve(address(rail), type(uint256).max);

        vm.deal(poster, 10 ether);
        vm.deal(challenger, 10 ether);
    }

    // ── Merkle helpers (OZ standard-tree shape) ─────────────────────

    function _leaf(address account, uint256 amount) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account, amount))));
    }

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function _twoLeafTree(bytes32 a, bytes32 b) internal pure returns (bytes32 root, bytes32[] memory proofA) {
        root = _hashPair(a, b);
        proofA = new bytes32[](1);
        proofA[0] = b;
    }

    function _donateAndCloseWindow() internal {
        vm.prank(donorA);
        rail.donate(address(usdc), recipientX, 100 ether);
        vm.prank(donorB);
        rail.donate(address(usdc), recipientX, 25 ether);
        vm.prank(donorB);
        rail.donate(address(usdc), recipientY, 50 ether);
        vm.warp(donationEnd);
    }

    // ── The rail ────────────────────────────────────────────────────

    function test_RailIsNoCustodyPassThrough() public {
        uint256 before = usdc.balanceOf(recipientX);
        vm.prank(donorA);
        rail.donate(address(usdc), recipientX, 100 ether);
        assertEq(usdc.balanceOf(recipientX) - before, 100 ether, "the donation reached the recipient in full");
        assertEq(usdc.balanceOf(address(rail)), 0, "the rail holds nothing");
    }

    function test_RevertWhen_FeeOnTransferDonation() public {
        MockERC20FeeOnTransfer feeToken = new MockERC20FeeOnTransfer("Fee Token", "FEE");
        feeToken.mint(donorA, 100 ether);
        vm.startPrank(donorA);
        feeToken.approve(address(rail), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(DonationRail.DonationAmountMismatch.selector, 100 ether, 100 ether - 1));
        rail.donate(address(feeToken), recipientX, 100 ether);
        vm.stopPrank();
    }

    function test_RevertWhen_ZeroDonation() public {
        vm.expectRevert(DonationRail.ZeroAmount.selector);
        vm.prank(donorA);
        rail.donate(address(usdc), recipientX, 0);
    }

    // ── The round: happy path ───────────────────────────────────────

    function test_RoundEndToEnd_DonateAllocatePostFinalizeClaim() public {
        _donateAndCloseWindow();

        // The (placeholder) allocation: 75k to X, 25k to Y — the real split
        // is the anchored formula's job; the CONTRACT only enforces the
        // optimistic game over whatever root survives.
        (bytes32 root, bytes32[] memory proofX) =
            _twoLeafTree(_leaf(recipientX, 75_000 ether), _leaf(recipientY, 25_000 ether));

        vm.prank(poster);
        pool.postRoot{value: BOND}(root, 0, uint64(block.number));
        vm.warp(block.timestamp + CHALLENGE_WINDOW);
        pool.finalize();
        assertEq(pool.budget(), MATCH_AMOUNT, "finalization snapshots the funded budget");

        pool.claim(recipientX, 75_000 ether, proofX);
        assertEq(florin.balanceOf(recipientX), 75_000 ether, "the match paid out");
        assertEq(florin.balanceOf(address(pool)), MATCH_AMOUNT - 75_000 ether);

        // Poster's bond returns via pull-payment.
        vm.prank(poster);
        pool.withdrawBonds();
        assertEq(poster.balance, 10 ether, "the poster's bond round-tripped");
    }

    function test_RevertWhen_DoubleClaim() public {
        _donateAndCloseWindow();
        (bytes32 root, bytes32[] memory proofX) =
            _twoLeafTree(_leaf(recipientX, 75_000 ether), _leaf(recipientY, 25_000 ether));
        vm.prank(poster);
        pool.postRoot{value: BOND}(root, 0, uint64(block.number));
        vm.warp(block.timestamp + CHALLENGE_WINDOW);
        pool.finalize();
        pool.claim(recipientX, 75_000 ether, proofX);
        vm.expectRevert(abi.encodeWithSelector(OptimisticMatchPool.AlreadyClaimed.selector, recipientX));
        pool.claim(recipientX, 75_000 ether, proofX);
    }

    function test_RevertWhen_ClaimExceedsBudget() public {
        // An unchallenged over-allocating root cannot drain more than the
        // finalized budget — the backstop the optimistic game sits on.
        _donateAndCloseWindow();
        (bytes32 root, bytes32[] memory proofX) =
            _twoLeafTree(_leaf(recipientX, MATCH_AMOUNT + 1 ether), _leaf(recipientY, 1 ether));
        vm.prank(poster);
        pool.postRoot{value: BOND}(root, 0, uint64(block.number));
        vm.warp(block.timestamp + CHALLENGE_WINDOW);
        pool.finalize();
        vm.expectRevert(OptimisticMatchPool.BudgetExceeded.selector);
        pool.claim(recipientX, MATCH_AMOUNT + 1 ether, proofX);
    }

    function test_RevertWhen_PostBeforeDonationWindowCloses() public {
        vm.expectRevert(OptimisticMatchPool.DonationWindowOpen.selector);
        vm.prank(poster);
        pool.postRoot{value: BOND}(keccak256("early"), 0, 1);
    }

    // ── The optimistic game: challenge always voids ─────────────────

    function test_ChallengeAlwaysVoids_BondsEscrowToCaseTrack() public {
        _donateAndCloseWindow();
        vm.prank(poster);
        pool.postRoot{value: BOND}(keccak256("wrong-root"), 0, uint64(block.number));

        uint256 poolEthBefore = address(pool).balance;
        vm.prank(challenger);
        uint256 caseId = pool.challenge{value: BOND}();
        (,, uint64 postedAt,) = _postingTuple();
        assertEq(postedAt, 0, "the posting is voided unconditionally");
        assertEq(address(pool).balance - poolEthBefore, BOND, "both bonds escrowed (post + challenge)");

        // Concession by silence: the challenger takes both bonds.
        vm.warp(block.timestamp + DISPUTE_WINDOW);
        pool.concede(caseId);
        assertEq(pool.withdrawable(challenger), 2 * BOND);
    }

    function test_DisputedCase_ForumRoutesBonds() public {
        _donateAndCloseWindow();
        vm.prank(poster);
        pool.postRoot{value: BOND}(keccak256("root"), 0, uint64(block.number));
        vm.prank(challenger);
        uint256 caseId = pool.challenge{value: BOND}();

        vm.prank(poster);
        pool.disputeChallenge(caseId);
        arbitrator.deliverRuling(
            address(pool),
            caseId,
            1 /* RULING_POSTER */
        );
        assertEq(pool.withdrawable(poster), 2 * BOND, "the forum routed both bonds to the poster");

        // The slot reopened — a corrected root can post and finalize.
        vm.prank(poster);
        pool.withdrawBonds();
        vm.prank(poster);
        pool.postRoot{value: BOND}(keccak256("corrected-root"), 0, uint64(block.number));
    }

    function test_RevertWhen_NonForumRules() public {
        _donateAndCloseWindow();
        vm.prank(poster);
        pool.postRoot{value: BOND}(keccak256("root"), 0, uint64(block.number));
        vm.prank(challenger);
        uint256 caseId = pool.challenge{value: BOND}();
        vm.prank(poster);
        pool.disputeChallenge(caseId);
        vm.expectRevert(OptimisticMatchPool.NotArbitrator.selector);
        vm.prank(challenger);
        pool.rule(caseId, 2);
    }

    // ── Helpers ─────────────────────────────────────────────────────

    function _postingTuple() internal view returns (address, bytes32, uint64, uint64) {
        (address p, bytes32 r,,, uint64 postedAt) = pool.posting();
        return (p, r, postedAt, 0);
    }
}

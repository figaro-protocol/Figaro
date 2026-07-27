// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {MatchPool} from "src/match/MatchPool.sol";
import {MockERC20} from "src/mocks/MockERC20.sol";
import {MockERC20FeeOnTransfer} from "src/mocks/MockERC20FeeOnTransfer.sol";

/// @notice MatchPool — a Gitcoin-modelled round that is its own donation rail.
///         The properties under test are the ones that let the posting
///         apparatus go: donations pass straight through, the QF sums are
///         maintained as they land, and the match is a division at claim time.
contract MatchPoolTest is Test {
    MatchPool pool;
    MockERC20 matchToken;
    MockERC20 donationToken;

    address projectA = address(0xA1);
    address projectB = address(0xB1);
    address donor1 = address(0xD1);
    address donor2 = address(0xD2);
    address donor3 = address(0xD3);

    uint64 constant START = 1_000;
    uint64 constant END = 10_000;
    uint256 constant FLOOR = 1 ether;
    uint256 constant BUDGET = 100_000 ether;

    function setUp() public {
        matchToken = new MockERC20("Florin", "FLORIN");
        donationToken = new MockERC20("Stable", "USD");
        pool = new MatchPool(address(matchToken), address(donationToken), START, END, FLOOR);

        matchToken.mint(address(pool), BUDGET);

        address[3] memory donors = [donor1, donor2, donor3];
        for (uint256 i = 0; i < donors.length; i++) {
            donationToken.mint(donors[i], 1_000_000 ether);
            vm.prank(donors[i]);
            donationToken.approve(address(pool), type(uint256).max);
        }
        vm.warp(START + 1);
    }

    function _donate(address donor, address project, uint256 amount) internal {
        vm.prank(donor);
        pool.donate(project, amount);
    }

    // ── The rail ────────────────────────────────────────────────────

    function test_donationGoesStraightThroughToTheRecipient() public {
        _donate(donor1, projectA, 10 ether);
        // The pool never holds a donation — only the match budget.
        assertEq(donationToken.balanceOf(projectA), 10 ether);
        assertEq(donationToken.balanceOf(address(pool)), 0);
    }

    function test_weightAccruesAsDonationsLand() public {
        _donate(donor1, projectA, 4 ether);
        _donate(donor2, projectA, 9 ether);
        // sumSqrt = sqrt(4e18) + sqrt(9e18); surplus = sumSqrt^2 - 13e18
        uint256 s = pool.sqrt(4 ether) + pool.sqrt(9 ether);
        assertEq(pool.weightOf(projectA), s * s - 13 ether);
        assertEq(pool.totalWeight(), pool.weightOf(projectA));
    }

    function test_refusesBelowFloor() public {
        vm.prank(donor1);
        vm.expectRevert(abi.encodeWithSelector(MatchPool.BelowFloor.selector, FLOOR - 1, FLOOR));
        pool.donate(projectA, FLOOR - 1);
    }

    function test_refusesSelfDonation() public {
        donationToken.mint(projectA, 100 ether);
        vm.startPrank(projectA);
        donationToken.approve(address(pool), type(uint256).max);
        vm.expectRevert(MatchPool.SelfDonation.selector);
        pool.donate(projectA, 10 ether);
        vm.stopPrank();
    }

    function test_refusesOutsideTheWindow() public {
        vm.warp(END);
        vm.prank(donor1);
        vm.expectRevert(MatchPool.DonationsNotOpen.selector);
        pool.donate(projectA, 10 ether);
    }

    function test_refusesFeeOnTransferDonationToken() public {
        MockERC20FeeOnTransfer fee = new MockERC20FeeOnTransfer("Fee", "FEE");
        MatchPool p = new MatchPool(address(matchToken), address(fee), START, END, FLOOR);
        fee.mint(donor1, 1_000 ether);
        vm.startPrank(donor1);
        fee.approve(address(p), type(uint256).max);
        vm.expectRevert();
        p.donate(projectA, 100 ether);
        vm.stopPrank();
    }

    // ── The sybil floor ─────────────────────────────────────────────

    function test_splittingAChequeConjuresNothing() public {
        // The sybil floor holds only if roots are taken PER DONOR. If they were
        // taken per CALL, one wallet splitting 100 into four 25s would score
        // 4*sqrt(25)^2 - 100 > 0 and manufacture surplus for gas alone.
        _donate(donor1, projectA, 100 ether);
        uint256 whole = pool.weightOf(projectA);

        for (uint256 i = 0; i < 4; i++) {
            _donate(donor2, projectB, 25 ether);
        }
        assertEq(pool.weightOf(projectB), whole);
        assertEq(pool.weightOf(projectB), 0);
    }

    function test_donorTotalsAccumulatePerDonor() public {
        _donate(donor1, projectA, 4 ether);
        _donate(donor1, projectA, 5 ether);
        assertEq(pool.donatedBy(projectA, donor1), 9 ether);
        (,, uint64 donors,) = pool.recipientOf(projectA);
        assertEq(donors, 1); // one wallet, two transactions
    }

    function test_singleDonorEarnsNoMatch() public {
        // Surplus form: one donor gives sqrt(a)^2 - a ≈ 0. The cheapest sybil
        // shape — a donor funding their own recipient — earns nothing.
        _donate(donor1, projectA, 100 ether);
        assertEq(pool.weightOf(projectA), 0);
    }

    function test_breadthBeatsDepth() public {
        // One large donor vs three small ones totalling far less.
        _donate(donor1, projectA, 900 ether);
        _donate(donor1, projectB, 3 ether);
        _donate(donor2, projectB, 3 ether);
        _donate(donor3, projectB, 3 ether);
        assertGt(pool.weightOf(projectB), pool.weightOf(projectA));
    }

    // ── Finalize + claim ────────────────────────────────────────────

    function _finalize() internal {
        vm.warp(END + 1);
        pool.finalize();
    }

    function test_finalizeSnapshotsTheBudget() public {
        _donate(donor1, projectA, 4 ether);
        _donate(donor2, projectA, 4 ether);
        _finalize();
        assertTrue(pool.finalized());
        assertEq(pool.budget(), BUDGET);
    }

    function test_finalizeRefusedWhileDonationsOpen() public {
        vm.expectRevert(MatchPool.DonationsStillOpen.selector);
        pool.finalize();
    }

    function test_matchSplitsByWeight() public {
        _donate(donor1, projectA, 4 ether);
        _donate(donor2, projectA, 4 ether);
        _donate(donor1, projectB, 4 ether);
        _donate(donor2, projectB, 4 ether);
        _finalize();

        // Symmetric support → equal weights → equal match, both under the cap.
        assertEq(pool.weightOf(projectA), pool.weightOf(projectB));
        pool.claim(projectA);
        pool.claim(projectB);
        assertEq(matchToken.balanceOf(projectA), matchToken.balanceOf(projectB));
        assertGt(matchToken.balanceOf(projectA), 0);
    }

    function test_capsAtFifteenPercent() public {
        _donate(donor1, projectA, 4 ether);
        _donate(donor2, projectA, 4 ether);
        _finalize();
        // Sole weighted recipient → capped rather than taking the whole pool.
        pool.claim(projectA);
        assertEq(matchToken.balanceOf(projectA), (BUDGET * 15) / 100);
    }

    function test_claimIsOncePerRecipient() public {
        _donate(donor1, projectA, 4 ether);
        _donate(donor2, projectA, 4 ether);
        _finalize();
        pool.claim(projectA);
        vm.expectRevert(MatchPool.AlreadyClaimed.selector);
        pool.claim(projectA);
    }

    function test_claimRefusedBeforeFinalize() public {
        _donate(donor1, projectA, 4 ether);
        _donate(donor2, projectA, 4 ether);
        vm.expectRevert(MatchPool.NotFinalized.selector);
        pool.claim(projectA);
    }

    function test_unweightedRecipientHasNothingToClaim() public {
        _donate(donor1, projectA, 4 ether); // single donor → zero weight
        _donate(donor1, projectB, 4 ether);
        _donate(donor2, projectB, 4 ether);
        _finalize();
        vm.expectRevert(MatchPool.NothingToClaim.selector);
        pool.claim(projectA);
    }

    function test_paidNeverExceedsBudget() public {
        _donate(donor1, projectA, 4 ether);
        _donate(donor2, projectA, 4 ether);
        _donate(donor1, projectB, 9 ether);
        _donate(donor2, projectB, 9 ether);
        _donate(donor3, projectB, 9 ether);
        _finalize();
        pool.claim(projectA);
        pool.claim(projectB);
        assertLe(pool.paid(), pool.budget());
    }

    // ── Maths ───────────────────────────────────────────────────────

    function test_sqrtIsFloorSquareRoot() public view {
        assertEq(pool.sqrt(0), 0);
        assertEq(pool.sqrt(1), 1);
        assertEq(pool.sqrt(3), 1);
        assertEq(pool.sqrt(4), 2);
        assertEq(pool.sqrt(1e18), 1e9);
    }

    function testFuzz_sqrtIsFloorSquareRoot(uint128 n) public view {
        uint256 root = pool.sqrt(n);
        assertLe(root * root, uint256(n));
        assertGt((root + 1) * (root + 1), uint256(n));
    }

    // ── Constructor ─────────────────────────────────────────────────

    function test_constructor_guards() public {
        vm.expectRevert(MatchPool.ZeroAddress.selector);
        new MatchPool(address(0), address(donationToken), START, END, FLOOR);
        vm.expectRevert(MatchPool.ZeroAddress.selector);
        new MatchPool(address(matchToken), address(0), START, END, FLOOR);
        vm.expectRevert(MatchPool.BadWindow.selector);
        new MatchPool(address(matchToken), address(donationToken), END, START, FLOOR);
    }
}

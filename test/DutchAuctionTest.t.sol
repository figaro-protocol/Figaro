// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {DutchAuction} from "../src/DutchAuction.sol";

contract DutchAuctionTest is Test {
    DutchAuction auction;

    uint64 constant DURATION = 30 minutes;
    uint16 constant FLOOR_BPS = 2000; // 20% floor

    bytes32 constant AUCTION_ID = keccak256("auction-1");
    bytes32 constant PROCESS_ID = keccak256("process-1");
    address constant CURRENCY = address(0xC0FFE);

    address creator = address(0xA11CE);
    address driver1 = address(0xD1);
    address driver2 = address(0xD2);

    uint256 constant MAX_PRICE = 100 ether;

    function setUp() public {
        auction = new DutchAuction(DURATION, FLOOR_BPS);
    }

    // ── Constructor ──────────────────────────────────────────────────

    function test_constructor_setsImmutables() public view {
        assertEq(auction.duration(), DURATION);
        assertEq(auction.floorBps(), FLOOR_BPS);
    }

    function test_constructor_revertsZeroDuration() public {
        vm.expectRevert("ZeroDuration");
        new DutchAuction(0, FLOOR_BPS);
    }

    function test_constructor_revertsInvalidFloorBps() public {
        vm.expectRevert("InvalidFloorBps");
        new DutchAuction(DURATION, 10_001);
    }

    // ── createAuction ────────────────────────────────────────────────

    function test_createAuction() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        (address c, uint64 st, uint256 mp, address d, uint256 cp) = auction.auctions(AUCTION_ID);
        assertEq(c, creator);
        assertEq(st, block.timestamp);
        assertEq(mp, MAX_PRICE);
        assertEq(d, address(0));
        assertEq(cp, 0);
    }

    function test_createAuction_emitsEvent() public {
        vm.prank(creator);
        vm.expectEmit(true, true, true, true);
        emit DutchAuction.AuctionCreated(AUCTION_ID, creator, MAX_PRICE, PROCESS_ID, CURRENCY);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);
    }

    function test_createAuction_revertsOnDuplicate() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        vm.prank(creator);
        vm.expectRevert(DutchAuction.AlreadyExists.selector);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);
    }

    function test_createAuction_revertsZeroPrice() public {
        vm.prank(creator);
        vm.expectRevert(DutchAuction.ZeroPrice.selector);
        auction.createAuction(AUCTION_ID, 0, PROCESS_ID, CURRENCY);
    }

    function test_createAuction_permissionless() public {
        // Anyone can create — no owner gate
        vm.prank(driver1);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        (address c,,,,) = auction.auctions(AUCTION_ID);
        assertEq(c, driver1);
    }

    // ── getCurrentPrice ──────────────────────────────────────────────

    function test_getCurrentPrice_atStart() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        uint256 price = auction.getCurrentPrice(AUCTION_ID);
        assertEq(price, MAX_PRICE);
    }

    function test_getCurrentPrice_atMidpoint() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        // Advance to halfway through duration
        vm.warp(block.timestamp + DURATION / 2);

        uint256 price = auction.getCurrentPrice(AUCTION_ID);
        // floor = 100e18 * 2000 / 10000 = 20e18
        // drop  = (100e18 - 20e18) * 900 / 1800 = 40e18
        // price = 100e18 - 40e18 = 60e18
        assertEq(price, 60 ether);
    }

    function test_getCurrentPrice_atEnd() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        vm.warp(block.timestamp + DURATION);

        uint256 price = auction.getCurrentPrice(AUCTION_ID);
        // floor = 20 ether
        assertEq(price, 20 ether);
    }

    function test_getCurrentPrice_pastEnd() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        vm.warp(block.timestamp + DURATION * 2);

        uint256 price = auction.getCurrentPrice(AUCTION_ID);
        assertEq(price, 20 ether); // stays at floor
    }

    function test_getCurrentPrice_revertsOnUnknown() public {
        vm.expectRevert(DutchAuction.NotStarted.selector);
        auction.getCurrentPrice(AUCTION_ID);
    }

    function test_constructor_revertsZeroFloorBps() public {
        vm.expectRevert(DutchAuction.ZeroFloorBps.selector);
        new DutchAuction(DURATION, 0);
    }

    // ── claim ────────────────────────────────────────────────────────

    function test_claim_atCurrentPrice() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        vm.warp(block.timestamp + DURATION / 2);

        vm.prank(driver1);
        auction.claim(AUCTION_ID);

        (,,, address d, uint256 cp) = auction.auctions(AUCTION_ID);
        assertEq(d, driver1);
        assertEq(cp, 60 ether);
    }

    function test_claim_emitsEvent() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        vm.warp(block.timestamp + DURATION / 4);
        uint256 expectedPrice = auction.getCurrentPrice(AUCTION_ID);

        vm.prank(driver1);
        vm.expectEmit(true, true, false, true);
        emit DutchAuction.AuctionClaimed(AUCTION_ID, driver1, expectedPrice);
        auction.claim(AUCTION_ID);
    }

    function test_claim_revertsOnDoubleClaim() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        vm.prank(driver1);
        auction.claim(AUCTION_ID);

        vm.prank(driver2);
        vm.expectRevert(DutchAuction.AlreadyClaimed.selector);
        auction.claim(AUCTION_ID);
    }

    function test_claim_revertsOnUnknown() public {
        vm.prank(driver1);
        vm.expectRevert(DutchAuction.NotStarted.selector);
        auction.claim(AUCTION_ID);
    }

    function test_claim_atFloorPrice() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        vm.warp(block.timestamp + DURATION); // at floor

        vm.prank(driver1);
        auction.claim(AUCTION_ID);

        (,,,, uint256 cp) = auction.auctions(AUCTION_ID);
        assertEq(cp, 20 ether);
    }

    function test_claim_atMaxPrice() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        // Claim immediately — price = maxPrice
        vm.prank(driver1);
        auction.claim(AUCTION_ID);

        (,,,, uint256 cp) = auction.auctions(AUCTION_ID);
        assertEq(cp, MAX_PRICE);
    }

    // ── cancel ───────────────────────────────────────────────────────

    function test_cancel_byCreator() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        vm.prank(creator);
        auction.cancel(AUCTION_ID);

        (address c,,,,) = auction.auctions(AUCTION_ID);
        assertEq(c, address(0)); // deleted
    }

    function test_cancel_emitsEvent() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        vm.prank(creator);
        vm.expectEmit(true, false, false, false);
        emit DutchAuction.AuctionCancelled(AUCTION_ID);
        auction.cancel(AUCTION_ID);
    }

    function test_cancel_revertsForNonCreator() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        vm.prank(driver1);
        vm.expectRevert(DutchAuction.NotCreator.selector);
        auction.cancel(AUCTION_ID);
    }

    function test_cancel_revertsAfterClaim() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        vm.prank(driver1);
        auction.claim(AUCTION_ID);

        vm.prank(creator);
        vm.expectRevert(DutchAuction.AlreadyClaimed.selector);
        auction.cancel(AUCTION_ID);
    }

    // ── expire ───────────────────────────────────────────────────────

    function test_expire_afterDuration() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        vm.warp(block.timestamp + DURATION);

        auction.expire(AUCTION_ID); // permissionless

        (address c,,,,) = auction.auctions(AUCTION_ID);
        assertEq(c, address(0)); // deleted
    }

    function test_expire_emitsEvent() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        vm.warp(block.timestamp + DURATION);

        vm.expectEmit(true, false, false, false);
        emit DutchAuction.AuctionExpired(AUCTION_ID);
        auction.expire(AUCTION_ID);
    }

    function test_expire_revertsBeforeDuration() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        vm.warp(block.timestamp + DURATION - 1);

        vm.expectRevert(DutchAuction.NotExpired.selector);
        auction.expire(AUCTION_ID);
    }

    function test_expire_revertsAfterClaim() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        vm.prank(driver1);
        auction.claim(AUCTION_ID);

        vm.warp(block.timestamp + DURATION);

        vm.expectRevert(DutchAuction.AlreadyClaimed.selector);
        auction.expire(AUCTION_ID);
    }

    function test_expire_revertsOnUnknown() public {
        vm.expectRevert(DutchAuction.NotStarted.selector);
        auction.expire(AUCTION_ID);
    }

    function test_expire_permissionless() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        vm.warp(block.timestamp + DURATION);

        // Anyone can expire — not just creator
        vm.prank(driver2);
        auction.expire(AUCTION_ID);

        (address c,,,,) = auction.auctions(AUCTION_ID);
        assertEq(c, address(0));
    }

    // ── Slot reuse after delete ──────────────────────────────────────

    function test_canReuseAuctionIdAfterCancel() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        vm.prank(creator);
        auction.cancel(AUCTION_ID);

        // Same ID can be reused
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, 50 ether, PROCESS_ID, CURRENCY);

        (,, uint256 mp,,) = auction.auctions(AUCTION_ID);
        assertEq(mp, 50 ether);
    }

    function test_canReuseAuctionIdAfterExpire() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        vm.warp(block.timestamp + DURATION);
        auction.expire(AUCTION_ID);

        // Same ID can be reused
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, 75 ether, PROCESS_ID, CURRENCY);

        (,, uint256 mp,,) = auction.auctions(AUCTION_ID);
        assertEq(mp, 75 ether);
    }

    // ── Price curve edge cases ───────────────────────────────────────

    function test_priceDecay_linearAt25Percent() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        vm.warp(block.timestamp + DURATION / 4);

        // floor = 20e18, range = 80e18
        // drop at 25% = 80e18 * 450 / 1800 = 20e18
        // price = 100e18 - 20e18 = 80e18
        assertEq(auction.getCurrentPrice(AUCTION_ID), 80 ether);
    }

    function test_priceDecay_linearAt75Percent() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        vm.warp(block.timestamp + (DURATION * 3) / 4);

        // drop at 75% = 80e18 * 1350 / 1800 = 60e18
        // price = 100e18 - 60e18 = 40e18
        assertEq(auction.getCurrentPrice(AUCTION_ID), 40 ether);
    }

    function test_priceDecay_smallMaxPrice() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, 100, PROCESS_ID, CURRENCY); // 100 wei

        vm.warp(block.timestamp + DURATION / 2);

        // floor = 100 * 2000 / 10000 = 20
        // drop = (100 - 20) * 900 / 1800 = 40
        // price = 100 - 40 = 60
        assertEq(auction.getCurrentPrice(AUCTION_ID), 60);
    }

    // ── 100% floor (no decay) ───────────────────────────────────────

    function test_fullFloor_noPriceDecay() public {
        // floorBps = 10_000 → floor = maxPrice → no decay
        DutchAuction noDecay = new DutchAuction(DURATION, 10_000);

        vm.prank(creator);
        noDecay.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        // At start: price = maxPrice (floor == max)
        assertEq(noDecay.getCurrentPrice(AUCTION_ID), MAX_PRICE);

        // At midpoint: still maxPrice
        vm.warp(block.timestamp + DURATION / 2);
        assertEq(noDecay.getCurrentPrice(AUCTION_ID), MAX_PRICE);

        // At end: still maxPrice (floor == max)
        vm.warp(block.timestamp + DURATION / 2);
        assertEq(noDecay.getCurrentPrice(AUCTION_ID), MAX_PRICE);
    }

    // ── Cancel on non-existent auction ──────────────────────────────

    function test_cancel_revertsOnNonExistent() public {
        vm.prank(creator);
        vm.expectRevert(DutchAuction.NotCreator.selector);
        auction.cancel(AUCTION_ID);
    }

    // ── Claim past duration (at floor) ──────────────────────────────

    function test_claim_pastDuration_atFloor() public {
        vm.prank(creator);
        auction.createAuction(AUCTION_ID, MAX_PRICE, PROCESS_ID, CURRENCY);

        vm.warp(block.timestamp + DURATION * 10);

        vm.prank(driver1);
        auction.claim(AUCTION_ID);

        (,,,, uint256 cp) = auction.auctions(AUCTION_ID);
        assertEq(cp, 20 ether); // floor price
    }
}

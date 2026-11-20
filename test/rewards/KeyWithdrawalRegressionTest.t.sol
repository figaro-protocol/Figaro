// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {RpgfIntegrationTest} from "test/rewards/RpgfIntegrationTest.t.sol";
import {CommitmentTypes} from "src/core/kernel/CommitmentTypes.sol";
import {ClauseRegistry} from "src/registries/ClauseRegistry.sol";
import {UsageCounter} from "src/rewards/UsageCounter.sol";
import {RpgfMinter} from "src/rewards/RpgfMinter.sol";

/// The forfeit at the claim, held as a regression (`docs/DESIGN_DECISIONS.md`
/// § 41): the live-stake check runs at the count and at the claim, so a
/// designer that withdraws its key's stake before claiming forfeits its
/// unclaimed closed periods, and a designer that claims first keeps them.
contract KeyWithdrawalRegressionTest is RpgfIntegrationTest {
    /// A key whose stake was withdrawn never scores: the counter's live-stake
    /// gate reads the flag the withdrawal sets.
    function test_withdrawnClauseKeyNeverScores() public {
        bytes32 k = keccak256("a withdrawn clause");
        address designer = address(0xD351);
        vm.startPrank(designer);
        clauses.registerClause(k, "ipfs://k"); // the fixture's deposit is 0
        clauses.withdrawDeposit(k);
        vm.stopPrank();
        CommitmentTypes.Commitment memory c = _settle(k, 1);
        vm.expectRevert(abi.encodeWithSelector(UsageCounter.ClauseAgreementOrProcessNotRegistered.selector, k));
        counter.recordClauseUsage(c, k, keccak256(CLAUSE_DATA), new bytes32[](0));
    }

    /// The forfeit: a designer that withdraws its stake before claiming loses
    /// its unclaimed closed periods. The share stays in the period's total and
    /// nobody mints it. Nothing restores the stake: the key can never be
    /// registered again.
    function test_withdrawBeforeClaim_forfeitsTheUnclaimedPeriod() public {
        CommitmentTypes.Commitment memory c = _settle(GEO_KEY, 7);
        counter.recordClauseUsage(c, GEO_KEY, keccak256(CLAUSE_DATA), new bytes32[](0));
        assertGt(counter.scoreOf(0, GEO_KEY, 0), 0);
        vm.warp(P0_END + 1);
        assertTrue(counter.periodClosed(0));
        RpgfMinter.ClauseOrProcessKey[] memory ks = new RpgfMinter.ClauseOrProcessKey[](1);
        ks[0] = RpgfMinter.ClauseOrProcessKey({kind: 0, key: GEO_KEY});
        assertEq(minter.claimable(0, author, ks), T0, "the designer earned the whole period-0 budget");

        vm.prank(author);
        clauses.withdrawDeposit(GEO_KEY);

        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotAuthorOfRecord.selector, uint8(0), GEO_KEY, author));
        minter.claim(0, ks);
        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.AlreadyRegistered.selector, GEO_KEY));
        clauses.registerClause(GEO_KEY, "ipfs://geo");
        assertEq(minter.minted(0), 0, "the forfeited share is never minted");
        assertEq(counter.totalScoreIn(0), counter.scoreOf(0, GEO_KEY, 0), "the score stays in the period's total");
    }

    /// The order that keeps the period: claim, then withdraw the stake.
    function test_claimThenWithdraw_keepsTheEarnedPeriod() public {
        CommitmentTypes.Commitment memory c = _settle(GEO_KEY, 7);
        counter.recordClauseUsage(c, GEO_KEY, keccak256(CLAUSE_DATA), new bytes32[](0));
        vm.warp(P0_END + 1);
        RpgfMinter.ClauseOrProcessKey[] memory ks = new RpgfMinter.ClauseOrProcessKey[](1);
        ks[0] = RpgfMinter.ClauseOrProcessKey({kind: 0, key: GEO_KEY});

        vm.startPrank(author);
        minter.claim(0, ks);
        clauses.withdrawDeposit(GEO_KEY);
        vm.stopPrank();
        assertEq(florin.balanceOf(author), T0);

        // A use after the withdrawal earns nothing further.
        CommitmentTypes.Commitment memory late = _settle(GEO_KEY, 8);
        vm.expectRevert(abi.encodeWithSelector(UsageCounter.ClauseAgreementOrProcessNotRegistered.selector, GEO_KEY));
        counter.recordClauseUsage(late, GEO_KEY, keccak256(CLAUSE_DATA), new bytes32[](0));
    }
}

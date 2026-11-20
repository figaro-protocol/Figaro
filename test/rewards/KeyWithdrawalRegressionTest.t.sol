// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {RpgfIntegrationTest} from "test/rewards/RpgfIntegrationTest.t.sol";
import {CommitmentTypes} from "src/core/kernel/CommitmentTypes.sol";
import {ClauseRegistry} from "src/registries/ClauseRegistry.sol";
import {AgreementRegistry} from "src/registries/AgreementRegistry.sol";
import {ProcessRegistry} from "src/registries/ProcessRegistry.sol";
import {UsageCounter} from "src/rewards/UsageCounter.sol";
import {RpgfMinter} from "src/rewards/RpgfMinter.sol";

/// @dev A front-runner that registers a pending key and asks for its stake
///      back in the same transaction, then tries to take the stake at once.
contract KeyFrontRunner {
    function takeClause(ClauseRegistry r, bytes32 k) external payable {
        r.registerClause{value: msg.value}(k, "ipfs://junk");
        r.requestWithdrawal(k);
    }

    function takeAgreement(AgreementRegistry r, bytes32 k) external payable {
        r.registerAgreement{value: msg.value}(k, "ipfs://junk");
        r.requestWithdrawal(k);
    }

    function takeProcess(ProcessRegistry r, bytes32 k) external payable {
        r.registerProcess{value: msg.value}(k, "ipfs://junk");
        r.requestWithdrawal(k);
    }

    function claimClause(ClauseRegistry r, bytes32 k) external {
        r.withdraw(k);
    }

    function claimAgreement(AgreementRegistry r, bytes32 k) external {
        r.withdraw(k);
    }

    function claimProcess(ProcessRegistry r, bytes32 k) external {
        r.withdraw(k);
    }

    receive() external payable {}
}

/// The two findings of a blind audit of the registries and the designer
/// rewards, held as regressions (`docs/DESIGN_DECISIONS.md` § 41):
///   1. a front-runner that registers a key and withdraws its stake in one
///      transaction holds that stake locked for the cooldown;
///   2. a designer that withdraws its key's stake before claiming forfeits
///      its unclaimed closed periods, as the claim-time live-stake check
///      intends; a designer that claims first keeps them.
contract KeyWithdrawalRegressionTest is RpgfIntegrationTest {
    // STAKE (0.05 ether) and COOLDOWN (28 days) are the fixture's.

    /// Front-run and withdraw: the key is still lost to its intended designer
    /// (first-write-wins, § 7), but the attempt costs one stake locked for the
    /// cooldown in each registry, and no call releases it earlier.
    function test_frontRunAndWithdraw_locksTheStakeForTheCooldown() public {
        ClauseRegistry stakedC = new ClauseRegistry(STAKE, COOLDOWN);
        AgreementRegistry stakedA = new AgreementRegistry(STAKE, COOLDOWN);
        ProcessRegistry stakedP = new ProcessRegistry(STAKE, COOLDOWN);
        bytes32 victimKey = keccak256("victim spec bytes");
        address attacker = address(0xBAD);
        address victim = address(0x600D);
        vm.deal(attacker, 1 ether);
        vm.deal(victim, 1 ether);
        KeyFrontRunner runner = new KeyFrontRunner();

        uint256 before = attacker.balance;
        vm.startPrank(attacker);
        runner.takeClause{value: STAKE}(stakedC, victimKey);
        runner.takeAgreement{value: STAKE}(stakedA, victimKey);
        runner.takeProcess{value: STAKE}(stakedP, victimKey);
        vm.stopPrank();
        assertEq(attacker.balance, before - 3 * STAKE, "three stakes leave the attacker");
        assertEq(address(stakedC).balance, STAKE, "the clause stake stays locked");
        assertEq(address(stakedA).balance, STAKE, "the agreement stake stays locked");
        assertEq(address(stakedP).balance, STAKE, "the assembly stake stays locked");

        uint256 unlockAt = block.timestamp + COOLDOWN;
        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.CooldownActive.selector, unlockAt));
        runner.claimClause(stakedC, victimKey);
        vm.expectRevert(abi.encodeWithSelector(AgreementRegistry.CooldownActive.selector, unlockAt));
        runner.claimAgreement(stakedA, victimKey);
        vm.expectRevert(abi.encodeWithSelector(ProcessRegistry.CooldownActive.selector, unlockAt));
        runner.claimProcess(stakedP, victimKey);

        // The key is withdrawn for good: its intended designer cannot register it.
        vm.prank(victim);
        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.AlreadyRegistered.selector, victimKey));
        stakedC.registerClause{value: STAKE}(victimKey, "ipfs://real");
        (address by, bool withdrawn) = stakedC.depositOf(victimKey);
        assertEq(by, address(runner));
        assertTrue(withdrawn);

        // Only after the cooldown does the stake come back.
        vm.warp(unlockAt);
        runner.claimClause(stakedC, victimKey);
        runner.claimAgreement(stakedA, victimKey);
        runner.claimProcess(stakedP, victimKey);
        assertEq(address(runner).balance, 3 * STAKE, "paid back only after the cooldown");
    }

    /// The one-call payout is gone from all three registries: a call by its
    /// signature finds no function and no fallback, and moves no stake.
    function test_theOneCallWithdrawDepositIsGone() public {
        ClauseRegistry stakedC = new ClauseRegistry(STAKE, COOLDOWN);
        AgreementRegistry stakedA = new AgreementRegistry(STAKE, COOLDOWN);
        ProcessRegistry stakedP = new ProcessRegistry(STAKE, COOLDOWN);
        bytes32 k = keccak256("a key");
        vm.deal(address(this), 1 ether);
        stakedC.registerClause{value: STAKE}(k, "ipfs://c");
        stakedA.registerAgreement{value: STAKE}(k, "ipfs://a");
        stakedP.registerProcess{value: STAKE}(k, "ipfs://p");

        address[3] memory regs = [address(stakedC), address(stakedA), address(stakedP)];
        for (uint256 i = 0; i < regs.length; i++) {
            (bool ok,) = regs[i].call(abi.encodeWithSignature("withdrawDeposit(bytes32)", k));
            assertFalse(ok, "no one-call payout");
            assertEq(regs[i].balance, STAKE, "the stake stays");
        }
    }

    /// A key whose stake was withdrawn at the request never scores: the
    /// counter's live-stake gate reads the flag the request sets.
    function test_withdrawnClauseKeyNeverScores() public {
        bytes32 k = keccak256("victim clause");
        KeyFrontRunner runner = new KeyFrontRunner();
        runner.takeClause(clauses, k); // the fixture's deposit is 0
        CommitmentTypes.Commitment memory c = _settle(k, 1);
        vm.expectRevert(abi.encodeWithSelector(UsageCounter.ClauseAgreementOrProcessNotRegistered.selector, k));
        counter.recordClauseUsage(c, k, keccak256(CLAUSE_DATA), new bytes32[](0));
    }

    /// The forfeit, as intended: the live-stake check runs at the claim as
    /// well as at the count, so a designer that requests its stake back before
    /// claiming loses its unclaimed closed periods. The share stays in the
    /// period's total and nobody mints it. Nothing restores the stake: the key
    /// can never be registered again.
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
        clauses.requestWithdrawal(GEO_KEY);

        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(RpgfMinter.NotAuthorOfRecord.selector, uint8(0), GEO_KEY, author));
        minter.claim(0, ks);
        vm.prank(author);
        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.AlreadyRegistered.selector, GEO_KEY));
        clauses.registerClause(GEO_KEY, "ipfs://geo");
        assertEq(minter.minted(0), 0, "the forfeited share is never minted");
        assertEq(counter.totalScoreIn(0), counter.scoreOf(0, GEO_KEY, 0), "the score stays in the period's total");
    }

    /// The ordering that keeps the period: claim, then request the stake back.
    /// The cooldown runs after the request, so claiming first costs nothing.
    function test_claimThenWithdraw_keepsTheEarnedPeriod() public {
        CommitmentTypes.Commitment memory c = _settle(GEO_KEY, 7);
        counter.recordClauseUsage(c, GEO_KEY, keccak256(CLAUSE_DATA), new bytes32[](0));
        vm.warp(P0_END + 1);
        RpgfMinter.ClauseOrProcessKey[] memory ks = new RpgfMinter.ClauseOrProcessKey[](1);
        ks[0] = RpgfMinter.ClauseOrProcessKey({kind: 0, key: GEO_KEY});

        vm.startPrank(author);
        minter.claim(0, ks);
        clauses.requestWithdrawal(GEO_KEY);
        vm.stopPrank();
        assertEq(florin.balanceOf(author), T0);

        // A use after the request earns nothing further.
        CommitmentTypes.Commitment memory late = _settle(GEO_KEY, 8);
        vm.expectRevert(abi.encodeWithSelector(UsageCounter.ClauseAgreementOrProcessNotRegistered.selector, GEO_KEY));
        counter.recordClauseUsage(late, GEO_KEY, keccak256(CLAUSE_DATA), new bytes32[](0));
    }
}

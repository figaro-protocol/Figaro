// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "forge-std/Test.sol";
import {MembersRegistry} from "src/protocol/registries/MembersRegistry.sol";
import {UsageCounter} from "src/protocol/usage/UsageCounter.sol";
import {MockClauseOrAssemblyStake} from "test/helpers/MockClauseOrAssemblyStake.sol";

/// @title HalmosMembersRegistry — the state machine the Sybil bound rests on
///
/// @notice The RPGF Sybil price is an ECONOMIC claim: sustaining `N` fabricated
///         identities across a reward period `P` costs `deposit · N · T / P`,
///         where `T` is the withdrawal cooldown. That claim is provable on
///         paper, but it is only *about this contract* if the contract actually
///         behaves the way the model assumes. These are those assumptions,
///         proved symbolically — for ALL inputs and orderings, not for the
///         paths a concrete test happened to walk.
///
///         Four properties, each load-bearing for a different term:
///
///           P1  no deposit is strandable      — the deposit is a STAKE, not a
///                                               fee; if it could be trapped the
///                                               "cost" would be a transfer and
///                                               the model's participation
///                                               assumption fails.
///           P2  re-registration while pending — THE anti-recycling property.
///               costs a SECOND deposit          Without it one deposit serves
///                                               N identities in sequence, the
///                                               `N` term vanishes, and
///                                               fabricating breadth costs O(1)
///                                               capital however wide it goes.
///           P3  de-surfacing is immediate      — the `T / P` term. Eligibility
///               and does not self-heal           must end at REQUEST time, not
///                                               at claim time, or the attacker
///                                               gets the cooldown for free.
///           P4  the counter reads exactly      — the linkage. A perfect gate
///               that gate                        the reward does not consult
///                                               prices nothing.
///
///         Halmos convention: `check_` prefix, not `test_`.
///
/// @dev    WHAT THIS DOES NOT PROVE: the economic bound itself. No amount of
///         state-machine verification says the deposit is big ENOUGH — that is
///         the Tullock rent-dissipation argument, and it is paper work. This
///         proves the machine that argument describes is the machine that
///         shipped. Keep the two claims apart; conflating them is how a
///         mechanism ends up "formally verified" and still farmable.
contract HalmosMembersRegistry is Test {
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);

    // ── P1: no deposit is strandable ────────────────────────────────

    /// The registry holds at least what it owes. Solvency is what makes the
    /// deposit a stake rather than a fee: every wei booked to `pendingDeposit`
    /// is present to be claimed, for any deposit size and any cooldown.
    function check_solvency_holdsWhateverTwoMembersDo(
        uint96 deposit,
        uint32 cooldown,
        bool aliceRequests,
        bool bobRequests,
        bool aliceWithdraws
    ) public {
        MembersRegistry r = new MembersRegistry(deposit, cooldown);
        vm.deal(ALICE, uint256(deposit) * 2 + 1 ether);
        vm.deal(BOB, uint256(deposit) * 2 + 1 ether);

        vm.prank(ALICE);
        r.register{value: deposit}("ipfs://a");
        vm.prank(BOB);
        r.register{value: deposit}("ipfs://b");

        if (aliceRequests) {
            vm.prank(ALICE);
            r.requestWithdrawal();
        }
        if (bobRequests) {
            vm.prank(BOB);
            r.requestWithdrawal();
        }
        if (aliceWithdraws && aliceRequests) {
            vm.warp(r.releaseAt(ALICE));
            vm.prank(ALICE);
            r.withdraw();
        }

        assertGe(
            address(r).balance,
            r.pendingDeposit(ALICE) + r.pendingDeposit(BOB),
            "the registry must hold everything it owes"
        );
    }

    /// A pending deposit is claimable the moment its cooldown elapses, and the
    /// claim pays exactly what was booked — no rounding, no residue, no path
    /// where the ETH is owed but unreachable.
    function check_pendingIsAlwaysClaimableInFull(uint96 deposit, uint32 cooldown) public {
        MembersRegistry r = new MembersRegistry(deposit, cooldown);
        vm.deal(ALICE, uint256(deposit) + 1 ether);

        vm.prank(ALICE);
        r.register{value: deposit}("ipfs://a");
        vm.prank(ALICE);
        r.requestWithdrawal();

        uint256 owed = r.pendingDeposit(ALICE);
        uint256 before = ALICE.balance;

        vm.warp(r.releaseAt(ALICE));
        assertTrue(r.withdrawable(ALICE), "the chain says it is claimable");
        vm.prank(ALICE);
        r.withdraw();

        assertEq(ALICE.balance, before + owed, "paid in full");
        assertEq(r.pendingDeposit(ALICE), 0, "and the debt is cleared");
    }

    // ── P2: THE anti-recycling property ─────────────────────────────

    /// Re-registering while a withdrawal is pending costs a SECOND deposit —
    /// the locked ETH cannot fund it.
    ///
    /// This is the property the whole `deposit · N · T / P` bound stands on.
    /// If the pending balance could be re-used, an attacker would cycle ONE
    /// deposit through N identities: register, trade, request, re-register as
    /// someone new. Capital cost would be O(1) no matter how much breadth was
    /// fabricated, and the deposit would price nothing at all.
    function check_reRegisteringWhilePendingCostsASecondDeposit(uint96 deposit, uint32 cooldown) public {
        vm.assume(deposit > 0);
        MembersRegistry r = new MembersRegistry(deposit, cooldown);
        vm.deal(ALICE, uint256(deposit) * 2);

        vm.prank(ALICE);
        r.register{value: deposit}("ipfs://a");
        vm.prank(ALICE);
        r.requestWithdrawal();

        uint256 lockedBefore = r.pendingDeposit(ALICE);
        uint256 heldBefore = address(r).balance;

        // The member is free to re-surface immediately — but pays again.
        vm.prank(ALICE);
        r.register{value: deposit}("ipfs://a-again");

        assertEq(address(r).balance, heldBefore + deposit, "the second registration is funded with NEW capital");
        assertEq(r.pendingDeposit(ALICE), lockedBefore, "the locked deposit is untouched");
        assertTrue(r.registered(ALICE), "and the member is surfaced again");
    }

    /// The same thing stated as the attacker would try it: re-registering
    /// without sending value fails. There is no path from "I have ETH locked
    /// here" to "therefore I am registered".
    function check_cannotReRegisterOutOfTheLockedDeposit(uint96 deposit, uint32 cooldown) public {
        vm.assume(deposit > 0);
        MembersRegistry r = new MembersRegistry(deposit, cooldown);
        vm.deal(ALICE, uint256(deposit));

        vm.prank(ALICE);
        r.register{value: deposit}("ipfs://a");
        vm.prank(ALICE);
        r.requestWithdrawal();

        // Low-level, because Halmos does not model `expectRevert`: the
        // assertion is on the call's own success flag.
        vm.prank(ALICE);
        (bool ok,) = address(r).call{value: 0}(abi.encodeCall(MembersRegistry.register, ("ipfs://free-ride")));
        assertFalse(ok, "locked ETH can never fund a fresh registration");
    }

    // ── P3: de-surfacing is immediate, and does not self-heal ───────

    /// `registered()` goes false at REQUEST time — while the ETH is still
    /// locked — and claiming does not turn it back on. The gap between request
    /// and claim is the cooldown the economic model charges for; if
    /// eligibility survived into it, the attacker would keep earning
    /// throughout and `T` would drop out of the bound.
    function check_registrationEndsAtRequestAndDoesNotComeBack(uint96 deposit, uint32 cooldown) public {
        MembersRegistry r = new MembersRegistry(deposit, cooldown);
        vm.deal(ALICE, uint256(deposit) + 1 ether);

        vm.prank(ALICE);
        r.register{value: deposit}("ipfs://a");
        assertTrue(r.registered(ALICE));

        vm.prank(ALICE);
        r.requestWithdrawal();
        assertFalse(r.registered(ALICE), "de-surfaced at REQUEST, not at claim");

        vm.warp(r.releaseAt(ALICE));
        vm.prank(ALICE);
        r.withdraw();
        assertFalse(r.registered(ALICE), "and claiming does not re-register anyone");
    }

    /// The cooldown cannot be short-circuited: before `releaseAt` the claim
    /// reverts, for every deposit and every cooldown and every instant in
    /// between. (`cooldown > 0` because a zero cooldown is claimable in the
    /// same block by construction — a deliberate degenerate case, covered
    /// concretely in `MembersRegistryTest`.)
    function check_theCooldownCannotBeSkipped(uint96 deposit, uint32 cooldown, uint32 elapsed) public {
        vm.assume(cooldown > 0);
        vm.assume(elapsed < cooldown);
        MembersRegistry r = new MembersRegistry(deposit, cooldown);
        vm.deal(ALICE, uint256(deposit) + 1 ether);

        vm.prank(ALICE);
        r.register{value: deposit}("ipfs://a");
        vm.prank(ALICE);
        r.requestWithdrawal();

        vm.warp(block.timestamp + elapsed);

        assertFalse(r.withdrawable(ALICE), "the chain refuses early");
        vm.prank(ALICE);
        (bool ok,) = address(r).call(abi.encodeCall(MembersRegistry.withdraw, ()));
        assertFalse(ok, "and the claim itself reverts, for every instant before releaseAt");
    }

    // ── P4: the counter reads exactly that gate ─────────────────────

    /// The reward consults the SAME predicate this contract enforces. A
    /// perfectly-priced identity that the counter never checks prices nothing,
    /// so the linkage is part of the mechanism, not plumbing.
    ///
    /// Stated on the BATCH path because it is directly reachable: the direct
    /// path needs a signed, kernel-resolved order, which symbolic ECDSA cannot
    /// reach (it is covered concretely by
    /// `UsageCounterTest.test_sellerLeavingTheRegistryStopsCounting`).
    function check_theCounterAdmitsUsageExactlyWhileTheStakeIsLive(uint96 deposit, bool leaves) public {
        MembersRegistry members = new MembersRegistry(deposit, 1 days);
        vm.deal(ALICE, uint256(deposit) + 1 ether);
        vm.prank(ALICE);
        members.register{value: deposit}("ipfs://a");

        address verifier = address(this);
        uint64[] memory periods = new uint64[](1);
        periods[0] = type(uint64).max;
        UsageCounter counter = new UsageCounter(
            address(0xC0FFEE),
            address(members),
            address(new MockClauseOrAssemblyStake()),
            address(new MockClauseOrAssemblyStake()),
            verifier,
            keccak256("prov"),
            new bytes32[](0),
            1,
            periods
        );

        if (leaves) {
            vm.prank(ALICE);
            members.requestWithdrawal();
        }

        UsageCounter.BatchAccrual[] memory accruals = new UsageCounter.BatchAccrual[](1);
        accruals[0] = UsageCounter.BatchAccrual(keccak256("clauseOrAssembly"), 1, 1);
        address[] memory sellers = new address[](1);
        sellers[0] = ALICE;

        (bool admitted,) = address(counter)
            .call(abi.encodeCall(UsageCounter.applyBatchAccrual, (0, keccak256("prov"), accruals, sellers)));

        // THE LINKAGE, in both directions: the counter admits usage if and
        // only if the registry still reports a live stake.
        assertEq(admitted, members.registered(ALICE), "admission tracks `registered` exactly");
        assertEq(admitted, !leaves, "and leaving is what turns it off");

        (,, uint256 score) = counter.batchAccrualOf(keccak256("clauseOrAssembly"), 0);
        assertEq(score > 0, admitted, "nothing accrues on a refused batch");
    }
}

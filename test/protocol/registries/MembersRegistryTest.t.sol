// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "src/protocol/registries/MembersRegistry.sol";

contract MembersRegistryTest is Test {
    MembersRegistry reg;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    uint256 constant REG_DEPOSIT = 0.001 ether;
    uint256 constant COOLDOWN = 7 days;

    function setUp() public {
        reg = new MembersRegistry(REG_DEPOSIT, COOLDOWN);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    // ── Registration ────────────────────────────────────────────────────

    function test_01_register_emits_event() public {
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit MembersRegistry.MemberRegistered(alice, "ipfs://alice-profile");
        reg.register{value: REG_DEPOSIT}("ipfs://alice-profile");
    }

    function test_02_register_reverts_on_double_registration() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://x");

        vm.prank(alice);
        vm.expectRevert(MembersRegistry.AlreadyRegistered.selector);
        reg.register{value: REG_DEPOSIT}("ipfs://y");
    }

    function test_register_reverts_insufficient_fee() public {
        vm.prank(alice);
        vm.expectRevert(MembersRegistry.InsufficientDeposit.selector);
        reg.register{value: REG_DEPOSIT - 1}("ipfs://x");
    }

    function test_register_reverts_excess_deposit() public {
        vm.prank(alice);
        vm.expectRevert(MembersRegistry.InsufficientDeposit.selector);
        reg.register{value: REG_DEPOSIT + 1}("ipfs://x");
    }

    function test_register_works_with_zero_deposit() public {
        MembersRegistry freeReg = new MembersRegistry(0, COOLDOWN);
        vm.prank(alice);
        freeReg.register("ipfs://x");
    }

    // ── The registered() gate — what RPGF reads ─────────────────────────

    function test_registered_tracksLiveStakeNotPendingFunds() public {
        assertFalse(reg.registered(alice));

        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://a");
        assertTrue(reg.registered(alice));

        // De-surfacing is at REQUEST, not at claim: the RPGF gate closes the
        // moment the member asks to leave, even though the ETH stays locked.
        vm.prank(alice);
        reg.requestWithdrawal();
        assertFalse(reg.registered(alice));
        assertEq(reg.pendingDeposit(alice), REG_DEPOSIT);
    }

    // ── Profile update ──────────────────────────────────────────────────

    function test_updateProfile_emits_event() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://v1");

        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit MembersRegistry.MemberProfileUpdated(alice, "ipfs://v2");
        reg.updateProfile("ipfs://v2");
    }

    function test_updateProfile_reverts_when_not_registered() public {
        vm.prank(alice);
        vm.expectRevert(MembersRegistry.NotRegistered.selector);
        reg.updateProfile("ipfs://nope");
    }

    function test_updateProfile_only_self() public {
        // Bob registers; Alice tries to update bob's profile by calling
        // updateProfile herself. msg.sender == alice, _registered[alice] == false,
        // so the call reverts with NotRegistered — there is no path through
        // which one address can update another's metadataURI.
        vm.prank(bob);
        reg.register{value: REG_DEPOSIT}("ipfs://bob-v1");

        vm.prank(alice);
        vm.expectRevert(MembersRegistry.NotRegistered.selector);
        reg.updateProfile("ipfs://malicious");
    }

    function test_updateProfile_does_not_change_deposit() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://v1");

        uint256 contractBalBefore = address(reg).balance;

        // updateProfile is non-payable; the deposit is untouched.
        vm.prank(alice);
        reg.updateProfile("ipfs://v2");

        assertEq(address(reg).balance, contractBalBefore);
    }

    // ── Multi-member isolation ──────────────────────────────────────────

    function test_two_members_independent() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://alice");

        vm.prank(bob);
        reg.register{value: REG_DEPOSIT}("ipfs://bob");

        // Alice's registration is independent of Bob's — alice can leave
        // without affecting bob's registered state.
        vm.prank(alice);
        reg.requestWithdrawal();

        assertTrue(reg.registered(bob));
        vm.prank(bob);
        vm.expectRevert(MembersRegistry.AlreadyRegistered.selector);
        reg.register{value: REG_DEPOSIT}("ipfs://bob-v2");
    }

    // ── Withdrawal: request de-surfaces, cooldown gates the ETH ─────────

    function test_requestWithdrawal_emits_with_release_time() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://e");

        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit MembersRegistry.MemberWithdrawalRequested(alice, REG_DEPOSIT, block.timestamp + COOLDOWN);
        reg.requestWithdrawal();

        assertEq(reg.releaseAt(alice), block.timestamp + COOLDOWN);
    }

    function test_requestWithdrawal_reverts_not_registered() public {
        vm.prank(alice);
        vm.expectRevert(MembersRegistry.NotRegistered.selector);
        reg.requestWithdrawal();
    }

    function test_withdraw_reverts_during_cooldown() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://w");

        vm.prank(alice);
        reg.requestWithdrawal();
        uint256 unlockAt = reg.releaseAt(alice);

        vm.warp(unlockAt - 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MembersRegistry.CooldownActive.selector, unlockAt));
        reg.withdraw();
    }

    function test_withdraw_returns_deposit_after_cooldown() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://w");

        vm.prank(alice);
        reg.requestWithdrawal();

        uint256 balBefore = alice.balance;
        vm.warp(reg.releaseAt(alice));

        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit MembersRegistry.MemberWithdrawn(alice, REG_DEPOSIT);
        reg.withdraw();

        assertEq(alice.balance, balBefore + REG_DEPOSIT);
        assertEq(reg.pendingDeposit(alice), 0);
        assertEq(reg.releaseAt(alice), 0);
    }

    function test_withdraw_reverts_when_nothing_pending() public {
        vm.prank(alice);
        vm.expectRevert(MembersRegistry.NothingPending.selector);
        reg.withdraw();
    }

    function test_withdraw_cannot_be_claimed_twice() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://w");
        vm.prank(alice);
        reg.requestWithdrawal();
        vm.warp(reg.releaseAt(alice));
        vm.prank(alice);
        reg.withdraw();

        vm.prank(alice);
        vm.expectRevert(MembersRegistry.NothingPending.selector);
        reg.withdraw();
    }

    function test_withdrawableIsTheChainsOwnAnswer() public {
        // The claim affordance must read this, never compare `releaseAt`
        // against a wall clock — the two drift, and a UI that compares them
        // disables a legitimate claim (or offers one that reverts).
        assertFalse(reg.withdrawable(alice), "nothing pending");

        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://w");
        assertFalse(reg.withdrawable(alice), "registered, nothing requested");

        vm.prank(alice);
        reg.requestWithdrawal();
        assertFalse(reg.withdrawable(alice), "requested, cooldown running");

        vm.warp(reg.releaseAt(alice) - 1);
        assertFalse(reg.withdrawable(alice), "one second short");

        vm.warp(reg.releaseAt(alice));
        assertTrue(reg.withdrawable(alice), "cooldown elapsed");

        vm.prank(alice);
        reg.withdraw();
        assertFalse(reg.withdrawable(alice), "claimed");
    }

    // ── The anti-rage-quit property this parameter exists for ───────────

    function test_reregistrationIsImmediateButCostsASecondDeposit() public {
        // THE mechanism. A member may come back at once — de-surfacing is not a
        // ban — but the first deposit is still locked, so returning requires
        // fresh capital. Sustaining N identities therefore costs N deposits held
        // for the cooldown, not one deposit recycled N times.
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://v1");

        vm.prank(alice);
        reg.requestWithdrawal();

        // Re-registration is allowed immediately...
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://v2");
        assertTrue(reg.registered(alice));

        // ...and the first deposit is still held by the contract, unclaimable.
        assertEq(reg.pendingDeposit(alice), REG_DEPOSIT);
        assertEq(address(reg).balance, 2 * REG_DEPOSIT);

        uint256 unlockAt = reg.releaseAt(alice);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MembersRegistry.CooldownActive.selector, unlockAt));
        reg.withdraw();
    }

    function test_repeatedRequestsAccumulateAndRestartTheClock() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://v1");
        vm.prank(alice);
        reg.requestWithdrawal();

        skip(1 days);

        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://v2");
        vm.prank(alice);
        reg.requestWithdrawal();

        // Both deposits are pending, and the whole balance unlocks on the LATER
        // request's schedule.
        assertEq(reg.pendingDeposit(alice), 2 * REG_DEPOSIT);
        assertEq(reg.releaseAt(alice), block.timestamp + COOLDOWN);

        uint256 balBefore = alice.balance;
        vm.warp(reg.releaseAt(alice));
        vm.prank(alice);
        reg.withdraw();
        assertEq(alice.balance, balBefore + 2 * REG_DEPOSIT);
    }

    // ── Degenerate parameterisations ────────────────────────────────────

    function test_zeroCooldown_claimableInTheSameBlock() public {
        MembersRegistry fastReg = new MembersRegistry(REG_DEPOSIT, 0);

        vm.prank(alice);
        fastReg.register{value: REG_DEPOSIT}("ipfs://f");

        uint256 balBefore = alice.balance;
        vm.prank(alice);
        fastReg.requestWithdrawal();
        vm.prank(alice);
        fastReg.withdraw();

        assertEq(alice.balance, balBefore + REG_DEPOSIT);
    }

    function test_zeroDeposit_withdrawalSucceedsWithNoTransfer() public {
        MembersRegistry freeReg = new MembersRegistry(0, COOLDOWN);

        vm.prank(alice);
        freeReg.register("ipfs://f");

        vm.prank(alice);
        freeReg.requestWithdrawal();

        vm.warp(freeReg.releaseAt(alice));
        vm.prank(alice);
        freeReg.withdraw(); // no ETH to transfer, should still succeed
        assertEq(freeReg.releaseAt(alice), 0);
    }

    // ── No funds are strandable ─────────────────────────────────────────

    function testFuzz_everyDepositIsEventuallyClaimable(uint96 deposit, uint32 cooldown) public {
        MembersRegistry r = new MembersRegistry(deposit, cooldown);
        vm.deal(alice, uint256(deposit) + 1 ether);

        vm.prank(alice);
        r.register{value: deposit}("ipfs://fuzz");
        vm.prank(alice);
        r.requestWithdrawal();

        uint256 balBefore = alice.balance;
        vm.warp(r.releaseAt(alice));
        vm.prank(alice);
        r.withdraw();

        assertEq(alice.balance, balBefore + deposit);
        assertEq(address(r).balance, 0);
    }
}

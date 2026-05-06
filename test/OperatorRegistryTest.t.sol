// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/OperatorRegistry.sol";

contract OperatorRegistryTest is Test {
    OperatorRegistry reg;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    uint256 constant REG_DEPOSIT = 0.001 ether;
    uint256 constant LOCK_PERIOD = 365 days;

    function setUp() public {
        reg = new OperatorRegistry(REG_DEPOSIT, LOCK_PERIOD);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    // ── Registration ────────────────────────────────────────────────────

    function test_01_register_emits_event() public {
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit OperatorRegistry.OperatorRegistered(alice, "ipfs://alice-profile");
        reg.register{value: REG_DEPOSIT}("ipfs://alice-profile");
    }

    function test_02_register_reverts_on_double_registration() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://x");

        vm.prank(alice);
        vm.expectRevert(OperatorRegistry.AlreadyRegistered.selector);
        reg.register{value: REG_DEPOSIT}("ipfs://y");
    }

    function test_register_reverts_insufficient_fee() public {
        vm.prank(alice);
        vm.expectRevert(OperatorRegistry.InsufficientDeposit.selector);
        reg.register{value: REG_DEPOSIT - 1}("ipfs://x");
    }

    function test_register_reverts_excess_deposit() public {
        vm.prank(alice);
        vm.expectRevert(OperatorRegistry.InsufficientDeposit.selector);
        reg.register{value: REG_DEPOSIT + 1}("ipfs://x");
    }

    function test_register_works_with_zero_deposit() public {
        OperatorRegistry freeReg = new OperatorRegistry(0, LOCK_PERIOD);
        vm.prank(alice);
        freeReg.register("ipfs://x");
    }

    // ── Profile update ──────────────────────────────────────────────────

    function test_updateProfile_emits_event() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://v1");

        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit OperatorRegistry.OperatorProfileUpdated(alice, "ipfs://v2");
        reg.updateProfile("ipfs://v2");
    }

    function test_updateProfile_reverts_when_not_registered() public {
        vm.prank(alice);
        vm.expectRevert(OperatorRegistry.NotRegistered.selector);
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
        vm.expectRevert(OperatorRegistry.NotRegistered.selector);
        reg.updateProfile("ipfs://malicious");
    }

    function test_updateProfile_does_not_reset_lock() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://v1");

        // Advance most of the lock period
        vm.warp(block.timestamp + LOCK_PERIOD - 1 hours);

        // Update profile — must not push the lock forward
        vm.prank(alice);
        reg.updateProfile("ipfs://v2");

        // Advance the remaining hour and confirm withdraw is permitted
        vm.warp(block.timestamp + 1 hours);
        vm.prank(alice);
        reg.withdraw();
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

    // ── Multi-operator isolation ────────────────────────────────────────

    function test_two_operators_independent() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://alice");

        vm.prank(bob);
        reg.register{value: REG_DEPOSIT}("ipfs://bob");

        // Alice's registration is independent of Bob's — alice can withdraw
        // (after lock) without affecting bob's registered state.
        vm.warp(block.timestamp + LOCK_PERIOD);

        vm.prank(alice);
        reg.withdraw();

        // Bob is still registered and cannot re-register
        vm.prank(bob);
        vm.expectRevert(OperatorRegistry.AlreadyRegistered.selector);
        reg.register{value: REG_DEPOSIT}("ipfs://bob-v2");
    }

    // ── Deposit Withdrawal ──────────────────────────────────────────────

    function test_withdraw_after_lock_period() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://w");

        // Advance past lock period
        vm.warp(block.timestamp + LOCK_PERIOD);

        uint256 balBefore = alice.balance;
        vm.prank(alice);
        reg.withdraw();
        assertEq(alice.balance, balBefore + REG_DEPOSIT);
    }

    function test_withdraw_emits_event() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://e");

        vm.warp(block.timestamp + LOCK_PERIOD);

        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit OperatorRegistry.OperatorWithdrawn(alice, REG_DEPOSIT);
        reg.withdraw();
    }

    function test_withdraw_reverts_deposit_locked() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://l");

        // One second before lock expires
        vm.warp(block.timestamp + LOCK_PERIOD - 1);

        vm.prank(alice);
        vm.expectRevert(OperatorRegistry.DepositLocked.selector);
        reg.withdraw();
    }

    function test_withdraw_reverts_not_registered() public {
        vm.prank(alice);
        vm.expectRevert(OperatorRegistry.NotRegistered.selector);
        reg.withdraw();
    }

    function test_withdraw_enables_reregistration() public {
        // Register
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://v1");

        // Withdraw after lock
        vm.warp(block.timestamp + LOCK_PERIOD);
        vm.prank(alice);
        reg.withdraw();

        // Re-register with fresh deposit
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://v2");
    }

    function test_withdraw_zero_deposit_succeeds() public {
        OperatorRegistry freeReg = new OperatorRegistry(0, LOCK_PERIOD);

        vm.prank(alice);
        freeReg.register("ipfs://f");

        vm.warp(block.timestamp + LOCK_PERIOD);

        vm.prank(alice);
        freeReg.withdraw(); // no ETH to transfer, should still succeed
    }

    function test_reregistration_restarts_lock_period() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://v1");

        // Cycle through withdraw + re-register
        vm.warp(block.timestamp + LOCK_PERIOD);
        vm.prank(alice);
        reg.withdraw();

        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://v2");

        // Fresh registration must wait its own lock period before withdraw
        vm.prank(alice);
        vm.expectRevert(OperatorRegistry.DepositLocked.selector);
        reg.withdraw();
    }
}

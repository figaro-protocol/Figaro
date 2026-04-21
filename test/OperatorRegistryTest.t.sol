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
        emit OperatorRegistry.OperatorRegistered(alice, OperatorRegistry.OperatorRole.Merchant, "ipfs://alice-profile");
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Merchant, "ipfs://alice-profile");
    }

    function test_02_register_reverts_on_None_role() public {
        vm.prank(alice);
        vm.expectRevert(OperatorRegistry.InvalidRole.selector);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.None, "ipfs://x");
    }

    function test_03_register_reverts_on_double_registration() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Merchant, "ipfs://x");

        vm.prank(alice);
        vm.expectRevert(OperatorRegistry.AlreadyRegistered.selector);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Driver, "ipfs://y");
    }

    function test_04_register_Both_role() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Both, "ipfs://both");
    }

    function test_register_reverts_insufficient_fee() public {
        vm.prank(alice);
        vm.expectRevert(OperatorRegistry.InsufficientDeposit.selector);
        reg.register{value: REG_DEPOSIT - 1}(OperatorRegistry.OperatorRole.Merchant, "ipfs://x");
    }

    function test_register_reverts_excess_deposit() public {
        vm.prank(alice);
        vm.expectRevert(OperatorRegistry.InsufficientDeposit.selector);
        reg.register{value: REG_DEPOSIT + 1}(OperatorRegistry.OperatorRole.Merchant, "ipfs://x");
    }

    function test_register_works_with_zero_deposit() public {
        OperatorRegistry freeReg = new OperatorRegistry(0, LOCK_PERIOD);
        vm.prank(alice);
        freeReg.register(OperatorRegistry.OperatorRole.Merchant, "ipfs://x");
    }

    // ── Update ──────────────────────────────────────────────────────────

    function test_05_updateProfile_emits_event() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Merchant, "ipfs://v1");

        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit OperatorRegistry.OperatorUpdated(alice, OperatorRegistry.OperatorRole.Both, "ipfs://v2");
        reg.updateProfile(OperatorRegistry.OperatorRole.Both, "ipfs://v2");
    }

    function test_06_updateProfile_reverts_unregistered() public {
        vm.prank(alice);
        vm.expectRevert(OperatorRegistry.NotRegistered.selector);
        reg.updateProfile(OperatorRegistry.OperatorRole.Merchant, "ipfs://x");
    }

    function test_07_updateProfile_reverts_None_role() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Merchant, "ipfs://v1");

        vm.prank(alice);
        vm.expectRevert(OperatorRegistry.InvalidRole.selector);
        reg.updateProfile(OperatorRegistry.OperatorRole.None, "ipfs://x");
    }

    function test_updateProfile_reverts_when_deactivated() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Merchant, "ipfs://v1");

        vm.prank(alice);
        reg.deactivate();

        vm.prank(alice);
        vm.expectRevert(OperatorRegistry.NotActive.selector);
        reg.updateProfile(OperatorRegistry.OperatorRole.Both, "ipfs://v2");
    }

    // ── Deactivate / Reactivate ─────────────────────────────────────────

    function test_08_deactivate_emits_event() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Driver, "ipfs://d");

        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit OperatorRegistry.OperatorDeactivated(alice);
        reg.deactivate();
    }

    function test_09_deactivate_reverts_unregistered() public {
        vm.prank(alice);
        vm.expectRevert(OperatorRegistry.NotRegistered.selector);
        reg.deactivate();
    }

    function test_deactivate_reverts_when_already_deactivated() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Driver, "ipfs://d");

        vm.prank(alice);
        reg.deactivate();

        vm.prank(alice);
        vm.expectRevert(OperatorRegistry.AlreadyDeactivated.selector);
        reg.deactivate();
    }

    function test_10_reactivate_emits_event() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Merchant, "ipfs://r");

        vm.prank(alice);
        reg.deactivate();

        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit OperatorRegistry.OperatorReactivated(alice);
        reg.reactivate();
    }

    function test_11_reactivate_reverts_unregistered() public {
        vm.prank(bob);
        vm.expectRevert(OperatorRegistry.NotRegistered.selector);
        reg.reactivate();
    }

    function test_reactivate_reverts_when_already_active() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Merchant, "ipfs://r");

        vm.prank(alice);
        vm.expectRevert(OperatorRegistry.AlreadyActive.selector);
        reg.reactivate();
    }

    // ── Multi-operator isolation ────────────────────────────────────────

    function test_12_two_operators_independent() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Merchant, "ipfs://alice");

        vm.prank(bob);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Driver, "ipfs://bob");

        // Alice deactivates — Bob unaffected (no revert)
        vm.prank(alice);
        reg.deactivate();

        vm.prank(bob);
        reg.updateProfile(OperatorRegistry.OperatorRole.Both, "ipfs://bob-v2");
    }

    // ── Deposit Withdrawal ──────────────────────────────────────────────

    function test_withdraw_after_lock_period() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Merchant, "ipfs://w");

        vm.prank(alice);
        reg.deactivate();

        // Advance past lock period
        vm.warp(block.timestamp + LOCK_PERIOD);

        uint256 balBefore = alice.balance;
        vm.prank(alice);
        reg.withdraw();
        assertEq(alice.balance, balBefore + REG_DEPOSIT);
    }

    function test_withdraw_emits_event() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Driver, "ipfs://e");

        vm.prank(alice);
        reg.deactivate();

        vm.warp(block.timestamp + LOCK_PERIOD);

        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit OperatorRegistry.OperatorWithdrawn(alice, REG_DEPOSIT);
        reg.withdraw();
    }

    function test_withdraw_reverts_still_active() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Merchant, "ipfs://a");

        vm.prank(alice);
        vm.expectRevert(OperatorRegistry.StillActive.selector);
        reg.withdraw();
    }

    function test_withdraw_reverts_deposit_locked() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Merchant, "ipfs://l");

        vm.prank(alice);
        reg.deactivate();

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
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Merchant, "ipfs://v1");

        // Deactivate + withdraw
        vm.prank(alice);
        reg.deactivate();
        vm.warp(block.timestamp + LOCK_PERIOD);
        vm.prank(alice);
        reg.withdraw();

        // Re-register with fresh deposit
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Driver, "ipfs://v2");
    }

    function test_withdraw_zero_deposit_succeeds() public {
        OperatorRegistry freeReg = new OperatorRegistry(0, LOCK_PERIOD);

        vm.prank(alice);
        freeReg.register(OperatorRegistry.OperatorRole.Merchant, "ipfs://f");

        vm.prank(alice);
        freeReg.deactivate();

        vm.warp(block.timestamp + LOCK_PERIOD);

        vm.prank(alice);
        freeReg.withdraw(); // no ETH to transfer, should still succeed
    }
}

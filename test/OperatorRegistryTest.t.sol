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

    // ── Multi-operator isolation ────────────────────────────────────────

    function test_two_operators_independent() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Merchant, "ipfs://alice");

        vm.prank(bob);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Driver, "ipfs://bob");

        // Alice's registration is independent of Bob's — alice can withdraw
        // (after lock) without affecting bob's registered state.
        vm.warp(block.timestamp + LOCK_PERIOD);

        vm.prank(alice);
        reg.withdraw();

        // Bob is still registered and cannot re-register
        vm.prank(bob);
        vm.expectRevert(OperatorRegistry.AlreadyRegistered.selector);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Both, "ipfs://bob-v2");
    }

    // ── Deposit Withdrawal ──────────────────────────────────────────────

    function test_withdraw_after_lock_period() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Merchant, "ipfs://w");

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

        vm.warp(block.timestamp + LOCK_PERIOD);

        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit OperatorRegistry.OperatorWithdrawn(alice, REG_DEPOSIT);
        reg.withdraw();
    }

    function test_withdraw_reverts_deposit_locked() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Merchant, "ipfs://l");

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

        // Withdraw after lock
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

        vm.warp(block.timestamp + LOCK_PERIOD);

        vm.prank(alice);
        freeReg.withdraw(); // no ETH to transfer, should still succeed
    }

    function test_reregistration_restarts_lock_period() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Merchant, "ipfs://v1");

        // Cycle through withdraw + re-register
        vm.warp(block.timestamp + LOCK_PERIOD);
        vm.prank(alice);
        reg.withdraw();

        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}(OperatorRegistry.OperatorRole.Merchant, "ipfs://v2");

        // Fresh registration must wait its own lock period before withdraw
        vm.prank(alice);
        vm.expectRevert(OperatorRegistry.DepositLocked.selector);
        reg.withdraw();
    }
}

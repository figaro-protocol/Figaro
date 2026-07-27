// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "src/protocol/registries/SellerRegistry.sol";

contract SellerRegistryTest is Test {
    SellerRegistry reg;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    uint256 constant REG_DEPOSIT = 0.001 ether;

    function setUp() public {
        reg = new SellerRegistry(REG_DEPOSIT);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    // ── Registration ────────────────────────────────────────────────────

    function test_01_register_emits_event() public {
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit SellerRegistry.SellerRegistered(alice, "ipfs://alice-profile");
        reg.register{value: REG_DEPOSIT}("ipfs://alice-profile");
    }

    function test_02_register_reverts_on_double_registration() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://x");

        vm.prank(alice);
        vm.expectRevert(SellerRegistry.AlreadyRegistered.selector);
        reg.register{value: REG_DEPOSIT}("ipfs://y");
    }

    function test_register_reverts_insufficient_fee() public {
        vm.prank(alice);
        vm.expectRevert(SellerRegistry.InsufficientDeposit.selector);
        reg.register{value: REG_DEPOSIT - 1}("ipfs://x");
    }

    function test_register_reverts_excess_deposit() public {
        vm.prank(alice);
        vm.expectRevert(SellerRegistry.InsufficientDeposit.selector);
        reg.register{value: REG_DEPOSIT + 1}("ipfs://x");
    }

    function test_register_works_with_zero_deposit() public {
        SellerRegistry freeReg = new SellerRegistry(0);
        vm.prank(alice);
        freeReg.register("ipfs://x");
    }

    // ── Profile update ──────────────────────────────────────────────────

    function test_updateProfile_emits_event() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://v1");

        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit SellerRegistry.SellerProfileUpdated(alice, "ipfs://v2");
        reg.updateProfile("ipfs://v2");
    }

    function test_updateProfile_reverts_when_not_registered() public {
        vm.prank(alice);
        vm.expectRevert(SellerRegistry.NotRegistered.selector);
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
        vm.expectRevert(SellerRegistry.NotRegistered.selector);
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

    // ── Multi-seller isolation ────────────────────────────────────────

    function test_two_sellers_independent() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://alice");

        vm.prank(bob);
        reg.register{value: REG_DEPOSIT}("ipfs://bob");

        // Alice's registration is independent of Bob's — alice can withdraw
        // without affecting bob's registered state.
        vm.prank(alice);
        reg.withdraw();

        // Bob is still registered and cannot re-register
        vm.prank(bob);
        vm.expectRevert(SellerRegistry.AlreadyRegistered.selector);
        reg.register{value: REG_DEPOSIT}("ipfs://bob-v2");
    }

    // ── Deposit Withdrawal (no time lock — K4: withdraw de-surfaces) ────

    function test_withdraw_returns_deposit() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://w");

        uint256 balBefore = alice.balance;
        vm.prank(alice);
        reg.withdraw();
        assertEq(alice.balance, balBefore + REG_DEPOSIT);
    }

    function test_withdraw_immediately_after_register() public {
        // No lock: the stake is reclaimable at any time. The cost of the
        // round-trip is off-chain — a withdrawn seller de-surfaces from
        // discovery (indexers fold SellerWithdrawn as invalidation).
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://now");

        vm.prank(alice);
        reg.withdraw();
    }

    function test_withdraw_emits_event() public {
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://e");

        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit SellerRegistry.SellerWithdrawn(alice, REG_DEPOSIT);
        reg.withdraw();
    }

    function test_withdraw_reverts_not_registered() public {
        vm.prank(alice);
        vm.expectRevert(SellerRegistry.NotRegistered.selector);
        reg.withdraw();
    }

    function test_withdraw_enables_reregistration() public {
        // Register
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://v1");

        // Withdraw
        vm.prank(alice);
        reg.withdraw();

        // Re-register with fresh deposit
        vm.prank(alice);
        reg.register{value: REG_DEPOSIT}("ipfs://v2");
    }

    function test_withdraw_zero_deposit_succeeds() public {
        SellerRegistry freeReg = new SellerRegistry(0);

        vm.prank(alice);
        freeReg.register("ipfs://f");

        vm.prank(alice);
        freeReg.withdraw(); // no ETH to transfer, should still succeed
    }
}

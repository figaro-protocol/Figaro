// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ProcessRegistry} from "src/registries/ProcessRegistry.sol";

contract ProcessRegistryTest is Test {
    ProcessRegistry registry;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    bytes32 constant PROCESS_DESIGN_HASH = keccak256("canonical-composition-subset");
    string constant CONTENT_URI = "ipfs://QmCoffeeShop";
    uint256 constant DEPOSIT = 0.001 ether;
    uint256 constant COOLDOWN = 28 days;

    function setUp() public {
        registry = new ProcessRegistry(DEPOSIT, COOLDOWN);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    // ── Registration — happy path ────────────────────────────────────────

    function test_registerProcess_happy() public {
        vm.prank(alice);
        registry.registerProcess{value: DEPOSIT}(PROCESS_DESIGN_HASH, CONTENT_URI);

        (address registeredBy, uint64 registeredAt, bool withdrawn, string memory uri) =
            registry.bindings(PROCESS_DESIGN_HASH);

        assertEq(registeredBy, alice);
        assertGt(registeredAt, 0);
        assertEq(withdrawn, false);
        assertEq(uri, CONTENT_URI);
        assertEq(address(registry).balance, DEPOSIT);
    }

    function test_registerProcess_emitsEvent() public {
        vm.expectEmit(true, true, false, true, address(registry));
        emit ProcessRegistry.ProcessRegistered(PROCESS_DESIGN_HASH, alice, CONTENT_URI);

        vm.prank(alice);
        registry.registerProcess{value: DEPOSIT}(PROCESS_DESIGN_HASH, CONTENT_URI);
    }

    // ── Registration — deposit revert paths ─────────────────────────────

    function test_registerProcess_revertsOnUnderpay() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ProcessRegistry.WrongDeposit.selector, DEPOSIT - 1, DEPOSIT));
        registry.registerProcess{value: DEPOSIT - 1}(PROCESS_DESIGN_HASH, CONTENT_URI);
    }

    function test_registerProcess_revertsOnOverpay() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ProcessRegistry.WrongDeposit.selector, DEPOSIT + 1 wei, DEPOSIT));
        registry.registerProcess{value: DEPOSIT + 1 wei}(PROCESS_DESIGN_HASH, CONTENT_URI);
    }

    function test_registerProcess_revertsOnZeroDeposit() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ProcessRegistry.WrongDeposit.selector, 0, DEPOSIT));
        registry.registerProcess(PROCESS_DESIGN_HASH, CONTENT_URI);
    }

    // ── Registration — content revert paths ──────────────────────────────

    function test_registerProcess_revertsOnDuplicateProcess() public {
        // Identity is the composition: the same processDesignHash cannot anchor
        // twice, regardless of who calls or which document URI they carry.
        vm.prank(alice);
        registry.registerProcess{value: DEPOSIT}(PROCESS_DESIGN_HASH, "ipfs://A");

        vm.expectRevert(abi.encodeWithSelector(ProcessRegistry.ProcessAlreadyRegistered.selector, PROCESS_DESIGN_HASH));
        vm.prank(bob);
        registry.registerProcess{value: DEPOSIT}(PROCESS_DESIGN_HASH, "ipfs://B");
    }

    function test_registerProcess_revertsOnEmptyContentURI() public {
        vm.prank(alice);
        vm.expectRevert(ProcessRegistry.EmptyContentURI.selector);
        registry.registerProcess{value: DEPOSIT}(PROCESS_DESIGN_HASH, "");
    }

    function test_registerProcess_revertsOnZeroProcessDesignHash() public {
        vm.prank(alice);
        vm.expectRevert(ProcessRegistry.ZeroProcessDesignHash.selector);
        registry.registerProcess{value: DEPOSIT}(bytes32(0), CONTENT_URI);
    }

    // ── Permissionless ───────────────────────────────────────────────────

    function test_registerProcess_permissionless() public {
        bytes32 aliceComposition = keccak256("alice-composition");
        bytes32 bobComposition = keccak256("bob-composition");

        vm.prank(alice);
        registry.registerProcess{value: DEPOSIT}(aliceComposition, "ipfs://A");

        vm.prank(bob);
        registry.registerProcess{value: DEPOSIT}(bobComposition, "ipfs://B");

        (address aliceRegisteredBy,,,) = registry.bindings(aliceComposition);
        (address bobRegisteredBy,,,) = registry.bindings(bobComposition);
        assertEq(aliceRegisteredBy, alice);
        assertEq(bobRegisteredBy, bob);
        assertEq(address(registry).balance, DEPOSIT * 2);
    }

    // ── Stake withdrawal: request, then claim after the cooldown ──────────

    function test_requestWithdrawal_flagsAtOnce_paysNothing_bindingStays() public {
        vm.prank(alice);
        registry.registerProcess{value: DEPOSIT}(PROCESS_DESIGN_HASH, CONTENT_URI);

        uint256 balanceBefore = alice.balance;
        vm.prank(alice);
        registry.requestWithdrawal(PROCESS_DESIGN_HASH);

        // The stake stops counting as live at the request; the ETH stays.
        (,, bool withdrawn,) = registry.bindings(PROCESS_DESIGN_HASH);
        assertTrue(withdrawn, "withdrawn at the request");
        assertEq(alice.balance, balanceBefore, "nothing paid at the request");
        assertEq(address(registry).balance, DEPOSIT, "the stake stays locked");
        assertEq(registry.releaseAt(PROCESS_DESIGN_HASH), block.timestamp + COOLDOWN);
        assertFalse(registry.withdrawable(PROCESS_DESIGN_HASH));
    }

    function test_requestWithdrawal_emitsWithdrawalRequested() public {
        vm.prank(alice);
        registry.registerProcess{value: DEPOSIT}(PROCESS_DESIGN_HASH, CONTENT_URI);

        vm.expectEmit(true, true, false, true, address(registry));
        emit ProcessRegistry.WithdrawalRequested(PROCESS_DESIGN_HASH, alice, DEPOSIT, block.timestamp + COOLDOWN);
        vm.prank(alice);
        registry.requestWithdrawal(PROCESS_DESIGN_HASH);
    }

    function test_withdraw_beforeCooldown_reverts() public {
        vm.prank(alice);
        registry.registerProcess{value: DEPOSIT}(PROCESS_DESIGN_HASH, CONTENT_URI);
        vm.prank(alice);
        registry.requestWithdrawal(PROCESS_DESIGN_HASH);
        uint256 unlockAt = block.timestamp + COOLDOWN;

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ProcessRegistry.CooldownActive.selector, unlockAt));
        registry.withdraw(PROCESS_DESIGN_HASH);

        vm.warp(unlockAt - 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ProcessRegistry.CooldownActive.selector, unlockAt));
        registry.withdraw(PROCESS_DESIGN_HASH);
        assertEq(address(registry).balance, DEPOSIT, "no early release");
    }

    function test_withdraw_afterCooldown_paysOnce() public {
        vm.prank(alice);
        registry.registerProcess{value: DEPOSIT}(PROCESS_DESIGN_HASH, CONTENT_URI);
        vm.prank(alice);
        registry.requestWithdrawal(PROCESS_DESIGN_HASH);

        vm.warp(block.timestamp + COOLDOWN);
        assertTrue(registry.withdrawable(PROCESS_DESIGN_HASH));
        uint256 balanceBefore = alice.balance;
        vm.expectEmit(true, true, false, true, address(registry));
        emit ProcessRegistry.DepositWithdrawn(PROCESS_DESIGN_HASH, alice, DEPOSIT);
        vm.prank(alice);
        registry.withdraw(PROCESS_DESIGN_HASH);

        assertEq(alice.balance, balanceBefore + DEPOSIT);
        assertEq(address(registry).balance, 0);
        assertEq(registry.releaseAt(PROCESS_DESIGN_HASH), 0);
        assertFalse(registry.withdrawable(PROCESS_DESIGN_HASH));

        vm.prank(alice);
        vm.expectRevert(ProcessRegistry.NothingPending.selector);
        registry.withdraw(PROCESS_DESIGN_HASH);
    }

    function test_withdraw_withoutRequest_reverts() public {
        vm.prank(alice);
        registry.registerProcess{value: DEPOSIT}(PROCESS_DESIGN_HASH, CONTENT_URI);

        vm.prank(alice);
        vm.expectRevert(ProcessRegistry.NothingPending.selector);
        registry.withdraw(PROCESS_DESIGN_HASH);
    }

    function test_zeroCooldown_claimableInTheSameBlock() public {
        ProcessRegistry free = new ProcessRegistry(DEPOSIT, 0);
        vm.startPrank(alice);
        free.registerProcess{value: DEPOSIT}(PROCESS_DESIGN_HASH, CONTENT_URI);
        free.requestWithdrawal(PROCESS_DESIGN_HASH);
        assertTrue(free.withdrawable(PROCESS_DESIGN_HASH));
        free.withdraw(PROCESS_DESIGN_HASH);
        vm.stopPrank();
        assertEq(address(free).balance, 0);
    }

    function test_requestWithdrawal_onlyOnce() public {
        vm.prank(alice);
        registry.registerProcess{value: DEPOSIT}(PROCESS_DESIGN_HASH, CONTENT_URI);
        vm.prank(alice);
        registry.requestWithdrawal(PROCESS_DESIGN_HASH);

        vm.prank(alice);
        vm.expectRevert(ProcessRegistry.AlreadyWithdrawn.selector);
        registry.requestWithdrawal(PROCESS_DESIGN_HASH);
    }

    function test_withdrawal_registeredByOnly() public {
        vm.prank(alice);
        registry.registerProcess{value: DEPOSIT}(PROCESS_DESIGN_HASH, CONTENT_URI);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ProcessRegistry.NotRegisteredBy.selector, bob, alice));
        registry.requestWithdrawal(PROCESS_DESIGN_HASH);

        vm.prank(alice);
        registry.requestWithdrawal(PROCESS_DESIGN_HASH);
        vm.warp(block.timestamp + COOLDOWN);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ProcessRegistry.NotRegisteredBy.selector, bob, alice));
        registry.withdraw(PROCESS_DESIGN_HASH);
    }

    function test_withdrawal_revertsOnUnknownKey() public {
        bytes32 unknown = keccak256("never-existed");
        vm.prank(alice);
        vm.expectRevert(ProcessRegistry.NotRegistered.selector);
        registry.requestWithdrawal(unknown);
        vm.prank(alice);
        vm.expectRevert(ProcessRegistry.NotRegistered.selector);
        registry.withdraw(unknown);
    }

    function test_withdraw_revertsWhenPaymentRejected() public {
        // A registrant that cannot receive ETH: its code reverts on every call
        // (PUSH1 0 PUSH1 0 REVERT), so the payment's plain call returns false
        // and the claim reverts as a whole — the stake stays held and still
        // pending, rather than cleared against a payment that never landed.
        address rejecter = address(0x4E7EC7);
        vm.etch(rejecter, hex"60006000fd");
        vm.deal(rejecter, DEPOSIT);

        vm.prank(rejecter);
        registry.registerProcess{value: DEPOSIT}(PROCESS_DESIGN_HASH, CONTENT_URI);
        vm.prank(rejecter);
        registry.requestWithdrawal(PROCESS_DESIGN_HASH);
        uint256 unlockAt = block.timestamp + COOLDOWN;
        vm.warp(unlockAt);

        vm.prank(rejecter);
        vm.expectRevert(ProcessRegistry.TransferFailed.selector);
        registry.withdraw(PROCESS_DESIGN_HASH);

        assertEq(registry.releaseAt(PROCESS_DESIGN_HASH), unlockAt, "still pending");
        assertEq(address(registry).balance, DEPOSIT);
    }

    function test_withdrawal_doesNotAllowReRegistration() public {
        // Permanence: requesting and claiming the stake does NOT release the
        // binding for re-registration.
        vm.prank(alice);
        registry.registerProcess{value: DEPOSIT}(PROCESS_DESIGN_HASH, CONTENT_URI);
        vm.prank(alice);
        registry.requestWithdrawal(PROCESS_DESIGN_HASH);
        vm.warp(block.timestamp + COOLDOWN);
        vm.prank(alice);
        registry.withdraw(PROCESS_DESIGN_HASH);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ProcessRegistry.ProcessAlreadyRegistered.selector, PROCESS_DESIGN_HASH));
        registry.registerProcess{value: DEPOSIT}(PROCESS_DESIGN_HASH, "ipfs://hijack");
    }

    // ── No owner, no pause, no upgrade ───────────────────────────────

    function test_noOwner_noPauseNoUpgrade() public {
        // ProcessRegistry has no owner, no pause and no upgrade path: such a call
        // finds no function and no fallback, so it fails, and a registered
        // entry stays registered.
        vm.prank(alice);
        registry.registerProcess{value: DEPOSIT}(PROCESS_DESIGN_HASH, "ipfs://QmAssembly");

        bytes[9] memory probes = [
            abi.encodeWithSignature("owner()"),
            abi.encodeWithSignature("transferOwnership(address)", alice),
            abi.encodeWithSignature("renounceOwnership()"),
            abi.encodeWithSignature("pause()"),
            abi.encodeWithSignature("unpause()"),
            abi.encodeWithSignature("paused()"),
            abi.encodeWithSignature("upgradeTo(address)", address(this)),
            abi.encodeWithSignature("upgradeToAndCall(address,bytes)", address(this), bytes("")),
            abi.encodeWithSignature("setDeposit(uint256)", 0)
        ];
        for (uint256 i = 0; i < probes.length; i++) {
            vm.prank(alice);
            (bool ok,) = address(registry).call(probes[i]);
            assertFalse(ok, "the registry answers an ownership, pause or upgrade call");
        }
        (address registeredBy,,,) = registry.bindings(PROCESS_DESIGN_HASH);
        assertEq(registeredBy, alice, "the assembly stays registered");
    }
}

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

    function setUp() public {
        registry = new ProcessRegistry(DEPOSIT);
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

    // ── Deposit withdrawal ───────────────────────────────────────────────

    function test_withdrawDeposit_happy() public {
        vm.prank(alice);
        registry.registerProcess{value: DEPOSIT}(PROCESS_DESIGN_HASH, CONTENT_URI);

        uint256 balanceBefore = alice.balance;
        vm.prank(alice);
        registry.withdrawDeposit(PROCESS_DESIGN_HASH);

        assertEq(alice.balance, balanceBefore + DEPOSIT);
        assertEq(address(registry).balance, 0);

        // Binding stays — only the withdrawn flag flips.
        (address registeredBy,, bool withdrawn, string memory uri) = registry.bindings(PROCESS_DESIGN_HASH);
        assertEq(registeredBy, alice, "registeredBy preserved after withdraw");
        assertEq(withdrawn, true);
        assertEq(uri, CONTENT_URI, "contentURI preserved after withdraw");
    }

    function test_withdrawDeposit_emitsEvent() public {
        vm.prank(alice);
        registry.registerProcess{value: DEPOSIT}(PROCESS_DESIGN_HASH, CONTENT_URI);

        vm.expectEmit(true, true, false, true, address(registry));
        emit ProcessRegistry.DepositWithdrawn(PROCESS_DESIGN_HASH, alice, DEPOSIT);

        vm.prank(alice);
        registry.withdrawDeposit(PROCESS_DESIGN_HASH);
    }

    function test_withdrawDeposit_immediately() public {
        // No time lock (K4): the stake is reclaimable at any time. The
        // round-trip is priced off-chain — a withdrawn assembly
        // de-surfaces from discovery (readers filter on the live stake).
        vm.prank(alice);
        registry.registerProcess{value: DEPOSIT}(PROCESS_DESIGN_HASH, CONTENT_URI);

        vm.prank(alice);
        registry.withdrawDeposit(PROCESS_DESIGN_HASH);
    }

    function test_withdrawDeposit_revertsOnDoubleWithdraw() public {
        vm.prank(alice);
        registry.registerProcess{value: DEPOSIT}(PROCESS_DESIGN_HASH, CONTENT_URI);

        vm.prank(alice);
        registry.withdrawDeposit(PROCESS_DESIGN_HASH);

        vm.prank(alice);
        vm.expectRevert(ProcessRegistry.AlreadyWithdrawn.selector);
        registry.withdrawDeposit(PROCESS_DESIGN_HASH);
    }

    function test_withdrawDeposit_revertsByNonRegisteredBy() public {
        vm.prank(alice);
        registry.registerProcess{value: DEPOSIT}(PROCESS_DESIGN_HASH, CONTENT_URI);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ProcessRegistry.NotRegisteredBy.selector, bob, alice));
        registry.withdrawDeposit(PROCESS_DESIGN_HASH);
    }

    function test_withdrawDeposit_revertsOnUnknownAssembly() public {
        vm.prank(alice);
        vm.expectRevert(ProcessRegistry.NotRegistered.selector);
        registry.withdrawDeposit(keccak256("never-existed"));
    }

    function test_withdrawDeposit_revertsWhenRefundRejected() public {
        // A registrant that cannot receive ETH: its code reverts on every call
        // (PUSH1 0 PUSH1 0 REVERT), so the refund's plain call returns false
        // and the withdrawal reverts as a whole — the stake stays held and
        // un-withdrawn rather than being flagged against a refund that never
        // landed.
        address rejecter = address(0x4E7EC7);
        vm.etch(rejecter, hex"60006000fd");
        vm.deal(rejecter, DEPOSIT);

        vm.prank(rejecter);
        registry.registerProcess{value: DEPOSIT}(PROCESS_DESIGN_HASH, CONTENT_URI);

        vm.prank(rejecter);
        vm.expectRevert(ProcessRegistry.TransferFailed.selector);
        registry.withdrawDeposit(PROCESS_DESIGN_HASH);

        (,, bool withdrawn,) = registry.bindings(PROCESS_DESIGN_HASH);
        assertFalse(withdrawn);
        assertEq(address(registry).balance, DEPOSIT);
    }

    function test_withdrawDeposit_doesNotAllowReRegistration() public {
        // Permanence guarantee: once a composition is bound, withdrawing the
        // deposit does NOT release the binding for re-registration.
        vm.prank(alice);
        registry.registerProcess{value: DEPOSIT}(PROCESS_DESIGN_HASH, CONTENT_URI);

        vm.prank(alice);
        registry.withdrawDeposit(PROCESS_DESIGN_HASH);

        // Bob tries to take over the composition — must fail.
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

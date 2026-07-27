// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {AssemblyRegistry} from "src/protocol/registries/AssemblyRegistry.sol";

contract AssemblyRegistryTest is Test {
    AssemblyRegistry registry;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    bytes32 constant COMPOSITION_HASH = keccak256("canonical-composition-subset");
    string constant CONTENT_URI = "ipfs://QmCoffeeShop";
    uint256 constant DEPOSIT = 0.001 ether;

    function setUp() public {
        registry = new AssemblyRegistry(DEPOSIT);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    // ── Registration — happy path ────────────────────────────────────────

    function test_registerAssembly_happy() public {
        vm.prank(alice);
        registry.registerAssembly{value: DEPOSIT}(COMPOSITION_HASH, CONTENT_URI);

        (
            address author,
            uint64 registeredAt,
            bool withdrawn,
            string memory uri
        ) = registry.bindings(COMPOSITION_HASH);

        assertEq(author, alice);
        assertGt(registeredAt, 0);
        assertEq(withdrawn, false);
        assertEq(uri, CONTENT_URI);
        assertEq(address(registry).balance, DEPOSIT);
    }

    function test_registerAssembly_emitsEvent() public {
        vm.expectEmit(true, true, false, true, address(registry));
        emit AssemblyRegistry.AssemblyRegistered(COMPOSITION_HASH, alice, CONTENT_URI);

        vm.prank(alice);
        registry.registerAssembly{value: DEPOSIT}(COMPOSITION_HASH, CONTENT_URI);
    }

    // ── Registration — deposit revert paths ─────────────────────────────

    function test_registerAssembly_revertsOnUnderpay() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(AssemblyRegistry.WrongDeposit.selector, DEPOSIT - 1, DEPOSIT)
        );
        registry.registerAssembly{value: DEPOSIT - 1}(COMPOSITION_HASH, CONTENT_URI);
    }

    function test_registerAssembly_revertsOnOverpay() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(AssemblyRegistry.WrongDeposit.selector, DEPOSIT + 1 wei, DEPOSIT)
        );
        registry.registerAssembly{value: DEPOSIT + 1 wei}(COMPOSITION_HASH, CONTENT_URI);
    }

    function test_registerAssembly_revertsOnZeroDeposit() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(AssemblyRegistry.WrongDeposit.selector, 0, DEPOSIT)
        );
        registry.registerAssembly(COMPOSITION_HASH, CONTENT_URI);
    }

    // ── Registration — content revert paths ──────────────────────────────

    function test_registerAssembly_revertsOnDuplicateComposition() public {
        // Identity is the composition: the same compositionHash cannot anchor
        // twice, regardless of who calls or which document URI they carry.
        vm.prank(alice);
        registry.registerAssembly{value: DEPOSIT}(COMPOSITION_HASH, "ipfs://A");

        vm.expectRevert(
            abi.encodeWithSelector(
                AssemblyRegistry.CompositionAlreadyRegistered.selector, COMPOSITION_HASH
            )
        );
        vm.prank(bob);
        registry.registerAssembly{value: DEPOSIT}(COMPOSITION_HASH, "ipfs://B");
    }

    function test_registerAssembly_revertsOnEmptyContentURI() public {
        vm.prank(alice);
        vm.expectRevert(AssemblyRegistry.EmptyContentURI.selector);
        registry.registerAssembly{value: DEPOSIT}(COMPOSITION_HASH, "");
    }

    function test_registerAssembly_revertsOnZeroCompositionHash() public {
        vm.prank(alice);
        vm.expectRevert(AssemblyRegistry.ZeroCompositionHash.selector);
        registry.registerAssembly{value: DEPOSIT}(bytes32(0), CONTENT_URI);
    }

    // ── Permissionless ───────────────────────────────────────────────────

    function test_registerAssembly_permissionless() public {
        bytes32 aliceComposition = keccak256("alice-composition");
        bytes32 bobComposition = keccak256("bob-composition");

        vm.prank(alice);
        registry.registerAssembly{value: DEPOSIT}(aliceComposition, "ipfs://A");

        vm.prank(bob);
        registry.registerAssembly{value: DEPOSIT}(bobComposition, "ipfs://B");

        (address aliceAuthor,,,) = registry.bindings(aliceComposition);
        (address bobAuthor,,,) = registry.bindings(bobComposition);
        assertEq(aliceAuthor, alice);
        assertEq(bobAuthor, bob);
        assertEq(address(registry).balance, DEPOSIT * 2);
    }

    // ── Deposit withdrawal ───────────────────────────────────────────────

    function test_withdrawDeposit_happy() public {
        vm.prank(alice);
        registry.registerAssembly{value: DEPOSIT}(COMPOSITION_HASH, CONTENT_URI);

        uint256 balanceBefore = alice.balance;
        vm.prank(alice);
        registry.withdrawDeposit(COMPOSITION_HASH);

        assertEq(alice.balance, balanceBefore + DEPOSIT);
        assertEq(address(registry).balance, 0);

        // Binding stays — only the withdrawn flag flips.
        (
            address author,
            ,
            bool withdrawn,
            string memory uri
        ) = registry.bindings(COMPOSITION_HASH);
        assertEq(author, alice, "author preserved after withdraw");
        assertEq(withdrawn, true);
        assertEq(uri, CONTENT_URI, "contentURI preserved after withdraw");
    }

    function test_withdrawDeposit_emitsEvent() public {
        vm.prank(alice);
        registry.registerAssembly{value: DEPOSIT}(COMPOSITION_HASH, CONTENT_URI);

        vm.expectEmit(true, true, false, true, address(registry));
        emit AssemblyRegistry.DepositWithdrawn(COMPOSITION_HASH, alice, DEPOSIT);

        vm.prank(alice);
        registry.withdrawDeposit(COMPOSITION_HASH);
    }

    function test_withdrawDeposit_immediately() public {
        // No time lock (K4): the stake is reclaimable at any time. The
        // round-trip is priced off-chain — a withdrawn assembly
        // de-surfaces from discovery (readers filter on the live stake).
        vm.prank(alice);
        registry.registerAssembly{value: DEPOSIT}(COMPOSITION_HASH, CONTENT_URI);

        vm.prank(alice);
        registry.withdrawDeposit(COMPOSITION_HASH);
    }

    function test_withdrawDeposit_revertsOnDoubleWithdraw() public {
        vm.prank(alice);
        registry.registerAssembly{value: DEPOSIT}(COMPOSITION_HASH, CONTENT_URI);

        vm.prank(alice);
        registry.withdrawDeposit(COMPOSITION_HASH);

        vm.prank(alice);
        vm.expectRevert(AssemblyRegistry.AlreadyWithdrawn.selector);
        registry.withdrawDeposit(COMPOSITION_HASH);
    }

    function test_withdrawDeposit_revertsByNonAuthor() public {
        vm.prank(alice);
        registry.registerAssembly{value: DEPOSIT}(COMPOSITION_HASH, CONTENT_URI);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(AssemblyRegistry.NotAuthor.selector, bob, alice));
        registry.withdrawDeposit(COMPOSITION_HASH);
    }

    function test_withdrawDeposit_revertsOnUnknownComposition() public {
        vm.prank(alice);
        vm.expectRevert(AssemblyRegistry.NotRegistered.selector);
        registry.withdrawDeposit(keccak256("never-existed"));
    }

    function test_withdrawDeposit_doesNotAllowReRegistration() public {
        // Permanence guarantee: once a composition is bound, withdrawing the
        // deposit does NOT release the binding for re-registration.
        vm.prank(alice);
        registry.registerAssembly{value: DEPOSIT}(COMPOSITION_HASH, CONTENT_URI);

        vm.prank(alice);
        registry.withdrawDeposit(COMPOSITION_HASH);

        // Bob tries to take over the composition — must fail.
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(
                AssemblyRegistry.CompositionAlreadyRegistered.selector, COMPOSITION_HASH
            )
        );
        registry.registerAssembly{value: DEPOSIT}(COMPOSITION_HASH, "ipfs://hijack");
    }
}

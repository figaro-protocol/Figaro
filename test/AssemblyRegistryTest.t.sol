// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {AssemblyRegistry} from "../src/AssemblyRegistry.sol";

contract AssemblyRegistryTest is Test {
    AssemblyRegistry registry;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    bytes32 constant CONTENT_HASH = keccak256("some-canonical-manifest-bytes");
    string constant METADATA_URI = "ipfs://QmCoffeeShop";
    uint256 constant DEPOSIT = 0.001 ether;
    uint256 constant LOCK_PERIOD = 1095 days; // 3 years

    function setUp() public {
        registry = new AssemblyRegistry(DEPOSIT, LOCK_PERIOD);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    // ── Registration — happy path ────────────────────────────────────────

    function test_registerAssembly_happy() public {
        vm.prank(alice);
        registry.registerAssembly{value: DEPOSIT}("my-coffee-shop", CONTENT_HASH, METADATA_URI);

        bytes32 slugHash = keccak256(bytes("my-coffee-shop"));
        (
            address author,
            uint64 registeredAt,
            bool withdrawn,
            bytes32 contentHash,
            string memory uri
        ) = registry.bindings(slugHash);

        assertEq(author, alice);
        assertGt(registeredAt, 0);
        assertEq(withdrawn, false);
        assertEq(contentHash, CONTENT_HASH);
        assertEq(uri, METADATA_URI);
        assertEq(address(registry).balance, DEPOSIT);
    }

    function test_registerAssembly_emitsEvent() public {
        bytes32 slugHash = keccak256(bytes("my-coffee-shop"));

        vm.expectEmit(true, true, false, true, address(registry));
        emit AssemblyRegistry.AssemblyRegistered(
            slugHash, alice, "my-coffee-shop", CONTENT_HASH, METADATA_URI
        );

        vm.prank(alice);
        registry.registerAssembly{value: DEPOSIT}("my-coffee-shop", CONTENT_HASH, METADATA_URI);
    }

    // ── Registration — deposit revert paths ─────────────────────────────

    function test_registerAssembly_revertsOnUnderpay() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(AssemblyRegistry.WrongDeposit.selector, DEPOSIT - 1, DEPOSIT)
        );
        registry.registerAssembly{value: DEPOSIT - 1}("my-coffee-shop", CONTENT_HASH, METADATA_URI);
    }

    function test_registerAssembly_revertsOnOverpay() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(AssemblyRegistry.WrongDeposit.selector, DEPOSIT + 1 wei, DEPOSIT)
        );
        registry.registerAssembly{value: DEPOSIT + 1 wei}("my-coffee-shop", CONTENT_HASH, METADATA_URI);
    }

    function test_registerAssembly_revertsOnZeroDeposit() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(AssemblyRegistry.WrongDeposit.selector, 0, DEPOSIT)
        );
        registry.registerAssembly("my-coffee-shop", CONTENT_HASH, METADATA_URI);
    }

    // ── Registration — content revert paths ──────────────────────────────

    function test_registerAssembly_revertsOnDuplicateSlug() public {
        vm.prank(alice);
        registry.registerAssembly{value: DEPOSIT}("my-coffee-shop", CONTENT_HASH, "ipfs://A");

        vm.expectRevert(
            abi.encodeWithSelector(AssemblyRegistry.SlugAlreadyRegistered.selector, "my-coffee-shop")
        );
        vm.prank(bob);
        registry.registerAssembly{value: DEPOSIT}("my-coffee-shop", CONTENT_HASH, "ipfs://B");
    }

    function test_registerAssembly_revertsOnEmptySlug() public {
        vm.prank(alice);
        vm.expectRevert(AssemblyRegistry.EmptySlug.selector);
        registry.registerAssembly{value: DEPOSIT}("", CONTENT_HASH, METADATA_URI);
    }

    function test_registerAssembly_revertsOnEmptyMetadataURI() public {
        vm.prank(alice);
        vm.expectRevert(AssemblyRegistry.EmptyMetadataURI.selector);
        registry.registerAssembly{value: DEPOSIT}("my-coffee-shop", CONTENT_HASH, "");
    }

    function test_registerAssembly_revertsOnEmptyContentHash() public {
        vm.prank(alice);
        vm.expectRevert(AssemblyRegistry.EmptyContentHash.selector);
        registry.registerAssembly{value: DEPOSIT}("my-coffee-shop", bytes32(0), METADATA_URI);
    }

    // ── Permissionless ───────────────────────────────────────────────────

    function test_registerAssembly_permissionless() public {
        vm.prank(alice);
        registry.registerAssembly{value: DEPOSIT}("alice-shop", CONTENT_HASH, "ipfs://A");

        vm.prank(bob);
        registry.registerAssembly{value: DEPOSIT}("bob-shop", CONTENT_HASH, "ipfs://B");

        (address aliceAuthor,,,,) = registry.bindings(keccak256(bytes("alice-shop")));
        (address bobAuthor,,,,) = registry.bindings(keccak256(bytes("bob-shop")));
        assertEq(aliceAuthor, alice);
        assertEq(bobAuthor, bob);
        assertEq(address(registry).balance, DEPOSIT * 2);
    }

    // ── Deposit withdrawal ───────────────────────────────────────────────

    function test_withdrawDeposit_happy() public {
        vm.prank(alice);
        registry.registerAssembly{value: DEPOSIT}("my-coffee-shop", CONTENT_HASH, METADATA_URI);

        // Fast-forward past the lock.
        vm.warp(block.timestamp + LOCK_PERIOD);

        uint256 balanceBefore = alice.balance;
        vm.prank(alice);
        registry.withdrawDeposit("my-coffee-shop");

        assertEq(alice.balance, balanceBefore + DEPOSIT);
        assertEq(address(registry).balance, 0);

        // Binding stays — only the withdrawn flag flips.
        bytes32 slugHash = keccak256(bytes("my-coffee-shop"));
        (
            address author,
            ,
            bool withdrawn,
            bytes32 contentHash,
            string memory uri
        ) = registry.bindings(slugHash);
        assertEq(author, alice, "author preserved after withdraw");
        assertEq(withdrawn, true);
        assertEq(contentHash, CONTENT_HASH, "contentHash preserved after withdraw");
        assertEq(uri, METADATA_URI, "metadataURI preserved after withdraw");
    }

    function test_withdrawDeposit_emitsEvent() public {
        vm.prank(alice);
        registry.registerAssembly{value: DEPOSIT}("my-coffee-shop", CONTENT_HASH, METADATA_URI);
        vm.warp(block.timestamp + LOCK_PERIOD);

        bytes32 slugHash = keccak256(bytes("my-coffee-shop"));
        vm.expectEmit(true, true, false, true, address(registry));
        emit AssemblyRegistry.DepositWithdrawn(slugHash, alice, DEPOSIT);

        vm.prank(alice);
        registry.withdrawDeposit("my-coffee-shop");
    }

    function test_withdrawDeposit_revertsBeforeLockElapses() public {
        vm.prank(alice);
        registry.registerAssembly{value: DEPOSIT}("my-coffee-shop", CONTENT_HASH, METADATA_URI);

        uint64 unlocksAt = uint64(block.timestamp) + uint64(LOCK_PERIOD);

        // One second before unlock — still locked.
        vm.warp(unlocksAt - 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AssemblyRegistry.DepositLocked.selector, unlocksAt));
        registry.withdrawDeposit("my-coffee-shop");
    }

    function test_withdrawDeposit_revertsOnDoubleWithdraw() public {
        vm.prank(alice);
        registry.registerAssembly{value: DEPOSIT}("my-coffee-shop", CONTENT_HASH, METADATA_URI);
        vm.warp(block.timestamp + LOCK_PERIOD);

        vm.prank(alice);
        registry.withdrawDeposit("my-coffee-shop");

        vm.prank(alice);
        vm.expectRevert(AssemblyRegistry.AlreadyWithdrawn.selector);
        registry.withdrawDeposit("my-coffee-shop");
    }

    function test_withdrawDeposit_revertsByNonAuthor() public {
        vm.prank(alice);
        registry.registerAssembly{value: DEPOSIT}("my-coffee-shop", CONTENT_HASH, METADATA_URI);
        vm.warp(block.timestamp + LOCK_PERIOD);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(AssemblyRegistry.NotAuthor.selector, bob, alice));
        registry.withdrawDeposit("my-coffee-shop");
    }

    function test_withdrawDeposit_revertsOnUnknownSlug() public {
        vm.prank(alice);
        vm.expectRevert(AssemblyRegistry.NotRegistered.selector);
        registry.withdrawDeposit("never-existed");
    }

    function test_withdrawDeposit_doesNotAllowReRegistration() public {
        // Permanence guarantee: once a slug is bound, withdrawing the
        // deposit does NOT release the slug for re-registration.
        vm.prank(alice);
        registry.registerAssembly{value: DEPOSIT}("local-commerce", CONTENT_HASH, METADATA_URI);
        vm.warp(block.timestamp + LOCK_PERIOD);

        vm.prank(alice);
        registry.withdrawDeposit("local-commerce");

        // Bob tries to take over the slug — must fail.
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(AssemblyRegistry.SlugAlreadyRegistered.selector, "local-commerce")
        );
        registry.registerAssembly{value: DEPOSIT}("local-commerce", CONTENT_HASH, "ipfs://hijack");
    }
}

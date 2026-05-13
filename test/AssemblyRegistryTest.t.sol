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

    function setUp() public {
        registry = new AssemblyRegistry();
    }

    // ── Registration — happy path ────────────────────────────────────────

    function test_registerAssembly_happy() public {
        vm.prank(alice);
        registry.registerAssembly("my-coffee-shop", CONTENT_HASH, METADATA_URI);

        bytes32 slugHash = keccak256(bytes("my-coffee-shop"));
        (
            address author,
            bytes32 contentHash,
            string memory uri,
            uint64 registeredAt
        ) = registry.bindings(slugHash);

        assertEq(author, alice);
        assertEq(contentHash, CONTENT_HASH);
        assertEq(uri, METADATA_URI);
        assertGt(registeredAt, 0);
    }

    function test_registerAssembly_emitsEvent() public {
        bytes32 slugHash = keccak256(bytes("my-coffee-shop"));

        vm.expectEmit(true, true, false, true, address(registry));
        emit AssemblyRegistry.AssemblyRegistered(
            slugHash, alice, "my-coffee-shop", CONTENT_HASH, METADATA_URI
        );

        vm.prank(alice);
        registry.registerAssembly("my-coffee-shop", CONTENT_HASH, METADATA_URI);
    }

    // ── Registration — revert paths ──────────────────────────────────────

    function test_registerAssembly_revertsOnDuplicateSlug() public {
        vm.prank(alice);
        registry.registerAssembly("my-coffee-shop", CONTENT_HASH, "ipfs://A");

        vm.expectRevert(
            abi.encodeWithSelector(AssemblyRegistry.SlugAlreadyRegistered.selector, "my-coffee-shop")
        );
        vm.prank(bob);
        registry.registerAssembly("my-coffee-shop", CONTENT_HASH, "ipfs://B");
    }

    function test_registerAssembly_revertsOnEmptySlug() public {
        vm.expectRevert(AssemblyRegistry.EmptySlug.selector);
        registry.registerAssembly("", CONTENT_HASH, METADATA_URI);
    }

    function test_registerAssembly_revertsOnEmptyMetadataURI() public {
        vm.expectRevert(AssemblyRegistry.EmptyMetadataURI.selector);
        registry.registerAssembly("my-coffee-shop", CONTENT_HASH, "");
    }

    function test_registerAssembly_revertsOnEmptyContentHash() public {
        vm.expectRevert(AssemblyRegistry.EmptyContentHash.selector);
        registry.registerAssembly("my-coffee-shop", bytes32(0), METADATA_URI);
    }

    // ── Permissionless ───────────────────────────────────────────────────

    function test_registerAssembly_permissionless() public {
        vm.prank(alice);
        registry.registerAssembly("alice-shop", CONTENT_HASH, "ipfs://A");

        vm.prank(bob);
        registry.registerAssembly("bob-shop", CONTENT_HASH, "ipfs://B");

        (address aliceAuthor,,,) = registry.bindings(keccak256(bytes("alice-shop")));
        (address bobAuthor,,,) = registry.bindings(keccak256(bytes("bob-shop")));
        assertEq(aliceAuthor, alice);
        assertEq(bobAuthor, bob);
    }
}

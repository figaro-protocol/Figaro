// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {AssemblyRegistry} from "../src/AssemblyRegistry.sol";
import {IAssemblyValidator} from "../src/IAssemblyValidator.sol";
import {DirectSaleV1Validator} from "../src/assemblyValidators/DirectSaleV1Validator.sol";

contract AssemblyRegistryTest is Test {
    AssemblyRegistry registry;
    DirectSaleV1Validator validator;

    bytes32 constant DIRECT_SALE_CLASS_ID = keccak256("direct-sale-v1");
    bytes32 constant OTHER_CLASS_ID = keccak256("local-commerce-v1");

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        registry = new AssemblyRegistry();
        validator = new DirectSaleV1Validator();
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    function _validManifest() internal pure returns (bytes memory) {
        string[] memory modalities = new string[](2);
        modalities[0] = "consume-onsite";
        modalities[1] = "pickup";
        return abi.encode(
            "my-coffee-shop",
            "My Coffee Shop",
            uint8(1), // klerosCourt = general
            uint8(3), // klerosMinJurors
            modalities
        );
    }

    function _bindDirectSaleValidator() internal {
        registry.setValidator(DIRECT_SALE_CLASS_ID, validator);
    }

    // ── Validator binding ────────────────────────────────────────────────

    function test_setValidator_binds() public {
        _bindDirectSaleValidator();
        assertEq(address(registry.validators(DIRECT_SALE_CLASS_ID)), address(validator));
    }

    function test_setValidator_revertsOnDuplicate() public {
        _bindDirectSaleValidator();
        vm.expectRevert(
            abi.encodeWithSelector(AssemblyRegistry.ValidatorAlreadyBound.selector, DIRECT_SALE_CLASS_ID)
        );
        registry.setValidator(DIRECT_SALE_CLASS_ID, validator);
    }

    function test_setValidator_revertsOnClassMismatch() public {
        // Bind direct-sale validator under a wrong classId — validator's
        // assemblyClassId() doesn't match, so registry rejects.
        vm.expectRevert(
            abi.encodeWithSelector(
                AssemblyRegistry.ValidatorClassMismatch.selector,
                OTHER_CLASS_ID,
                DIRECT_SALE_CLASS_ID
            )
        );
        registry.setValidator(OTHER_CLASS_ID, validator);
    }

    // ── Registration — happy path ────────────────────────────────────────

    function test_registerAssembly_happy() public {
        _bindDirectSaleValidator();

        vm.prank(alice);
        registry.registerAssembly(
            "my-coffee-shop",
            DIRECT_SALE_CLASS_ID,
            _validManifest(),
            "ipfs://QmCoffeeShop"
        );

        bytes32 slugHash = keccak256(bytes("my-coffee-shop"));
        (address author, bytes32 classId, bytes32 contentHash, string memory uri, uint64 registeredAt) =
            registry.bindings(slugHash);

        assertEq(author, alice);
        assertEq(classId, DIRECT_SALE_CLASS_ID);
        assertEq(contentHash, keccak256(_validManifest()));
        assertEq(uri, "ipfs://QmCoffeeShop");
        assertGt(registeredAt, 0);
    }

    function test_registerAssembly_emitsEvent() public {
        _bindDirectSaleValidator();

        bytes32 slugHash = keccak256(bytes("my-coffee-shop"));
        bytes memory manifest = _validManifest();
        bytes32 contentHash = keccak256(manifest);

        vm.expectEmit(true, true, true, true, address(registry));
        emit AssemblyRegistry.AssemblyRegistered(
            slugHash,
            DIRECT_SALE_CLASS_ID,
            alice,
            "my-coffee-shop",
            contentHash,
            "ipfs://QmCoffeeShop"
        );

        vm.prank(alice);
        registry.registerAssembly("my-coffee-shop", DIRECT_SALE_CLASS_ID, manifest, "ipfs://QmCoffeeShop");
    }

    // ── Registration — revert paths ──────────────────────────────────────

    function test_registerAssembly_revertsOnDuplicateSlug() public {
        _bindDirectSaleValidator();

        vm.prank(alice);
        registry.registerAssembly("my-coffee-shop", DIRECT_SALE_CLASS_ID, _validManifest(), "ipfs://A");

        vm.expectRevert(
            abi.encodeWithSelector(AssemblyRegistry.SlugAlreadyRegistered.selector, "my-coffee-shop")
        );
        vm.prank(bob);
        registry.registerAssembly("my-coffee-shop", DIRECT_SALE_CLASS_ID, _validManifest(), "ipfs://B");
    }

    function test_registerAssembly_revertsWhenValidatorMissing() public {
        // No validator bound for DIRECT_SALE_CLASS_ID.
        vm.expectRevert(
            abi.encodeWithSelector(AssemblyRegistry.ValidatorNotSet.selector, DIRECT_SALE_CLASS_ID)
        );
        registry.registerAssembly(
            "my-coffee-shop", DIRECT_SALE_CLASS_ID, _validManifest(), "ipfs://A"
        );
    }

    function test_registerAssembly_revertsOnEmptySlug() public {
        _bindDirectSaleValidator();
        vm.expectRevert(AssemblyRegistry.EmptySlug.selector);
        registry.registerAssembly("", DIRECT_SALE_CLASS_ID, _validManifest(), "ipfs://A");
    }

    function test_registerAssembly_revertsOnEmptyMetadataURI() public {
        _bindDirectSaleValidator();
        vm.expectRevert(AssemblyRegistry.EmptyMetadataURI.selector);
        registry.registerAssembly("my-coffee-shop", DIRECT_SALE_CLASS_ID, _validManifest(), "");
    }

    // ── Validator-rejection paths (delegated to DirectSaleV1Validator) ───

    function test_registerAssembly_revertsOnDeliveryModality() public {
        _bindDirectSaleValidator();

        string[] memory modalities = new string[](2);
        modalities[0] = "consume-onsite";
        modalities[1] = "deliver:seller-assigned";
        bytes memory manifest = abi.encode(
            "my-coffee-shop", "My Coffee Shop", uint8(1), uint8(3), modalities
        );

        vm.expectRevert(
            abi.encodeWithSelector(DirectSaleV1Validator.InvalidModality.selector, "deliver:seller-assigned")
        );
        registry.registerAssembly("my-coffee-shop", DIRECT_SALE_CLASS_ID, manifest, "ipfs://A");
    }

    function test_registerAssembly_revertsOnUnsetKleros() public {
        _bindDirectSaleValidator();

        string[] memory modalities = new string[](1);
        modalities[0] = "pickup";
        bytes memory manifest = abi.encode(
            "my-coffee-shop", "My Coffee Shop", uint8(0), uint8(3), modalities
        );

        vm.expectRevert(abi.encodeWithSelector(DirectSaleV1Validator.InvalidKlerosCourt.selector, uint8(0)));
        registry.registerAssembly("my-coffee-shop", DIRECT_SALE_CLASS_ID, manifest, "ipfs://A");
    }

    function test_registerAssembly_revertsOnEmptyModalities() public {
        _bindDirectSaleValidator();

        string[] memory modalities = new string[](0);
        bytes memory manifest = abi.encode(
            "my-coffee-shop", "My Coffee Shop", uint8(1), uint8(3), modalities
        );

        vm.expectRevert(DirectSaleV1Validator.EmptyModalities.selector);
        registry.registerAssembly("my-coffee-shop", DIRECT_SALE_CLASS_ID, manifest, "ipfs://A");
    }

    function test_registerAssembly_revertsOnDuplicateModality() public {
        _bindDirectSaleValidator();

        string[] memory modalities = new string[](2);
        modalities[0] = "pickup";
        modalities[1] = "pickup";
        bytes memory manifest = abi.encode(
            "my-coffee-shop", "My Coffee Shop", uint8(1), uint8(3), modalities
        );

        vm.expectRevert(
            abi.encodeWithSelector(DirectSaleV1Validator.DuplicateModality.selector, "pickup")
        );
        registry.registerAssembly("my-coffee-shop", DIRECT_SALE_CLASS_ID, manifest, "ipfs://A");
    }

    // ── Permissionless ───────────────────────────────────────────────────

    function test_registerAssembly_permissionless() public {
        _bindDirectSaleValidator();

        vm.prank(alice);
        registry.registerAssembly("alice-shop", DIRECT_SALE_CLASS_ID, _validManifest(), "ipfs://A");

        vm.prank(bob);
        registry.registerAssembly("bob-shop", DIRECT_SALE_CLASS_ID, _validManifest(), "ipfs://B");

        bytes32 aliceSlug = keccak256(bytes("alice-shop"));
        bytes32 bobSlug = keccak256(bytes("bob-shop"));
        (address aliceAuthor,,,,) = registry.bindings(aliceSlug);
        (address bobAuthor,,,,) = registry.bindings(bobSlug);
        assertEq(aliceAuthor, alice);
        assertEq(bobAuthor, bob);
    }
}

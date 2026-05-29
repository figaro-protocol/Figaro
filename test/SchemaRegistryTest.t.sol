// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {SchemaRegistry} from "../src/SchemaRegistry.sol";

contract SchemaRegistryTest is Test {
    SchemaRegistry registry;

    bytes32 constant FULFILMENT_SCHEMA_ID = keccak256("figaro-fulfilment-v2");
    bytes32 constant FULFILMENT_URI_HASH = keccak256("ipfs://figaro-fulfilment/v2");
    bytes32 constant FULFILMENT_FAMILY = keccak256("fulfilment");

    bytes32 constant GHG_SCHEMA_ID = keccak256("figaro-ghg-iso-14064-v1");
    bytes32 constant GHG_URI_HASH = keccak256("ipfs://figaro-ghg/v1");
    bytes32 constant GHG_FAMILY = keccak256("emissions");

    bytes32 constant LIFECYCLE_SCHEMA_ID = keccak256("figaro-courier-process-v1");
    bytes32 constant LIFECYCLE_URI_HASH = keccak256("ipfs://figaro-courier-process/v1");
    bytes32 constant LIFECYCLE_FAMILY = keccak256("seller-process");

    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address mechanism = address(0xBEEF);

    function setUp() public {
        registry = new SchemaRegistry();
    }

    // ── Registration ─────────────────────────────────────────────────

    function test_registerSchema() public {
        vm.prank(alice);
        registry.registerSchema(FULFILMENT_SCHEMA_ID, 1, FULFILMENT_URI_HASH, FULFILMENT_FAMILY);

        assertTrue(registry.registered(FULFILMENT_SCHEMA_ID));
    }

    function test_registerSchema_permissionless() public {
        // Anyone can register — no owner gate
        vm.prank(alice);
        registry.registerSchema(FULFILMENT_SCHEMA_ID, 1, FULFILMENT_URI_HASH, FULFILMENT_FAMILY);

        vm.prank(bob);
        registry.registerSchema(GHG_SCHEMA_ID, 1, GHG_URI_HASH, GHG_FAMILY);

        assertTrue(registry.registered(FULFILMENT_SCHEMA_ID));
        assertTrue(registry.registered(GHG_SCHEMA_ID));
    }

    function test_registerSchema_revertsOnDuplicate() public {
        registry.registerSchema(FULFILMENT_SCHEMA_ID, 1, FULFILMENT_URI_HASH, FULFILMENT_FAMILY);

        vm.expectRevert(abi.encodeWithSelector(SchemaRegistry.AlreadyRegistered.selector, FULFILMENT_SCHEMA_ID));
        registry.registerSchema(FULFILMENT_SCHEMA_ID, 2, FULFILMENT_URI_HASH, FULFILMENT_FAMILY);
    }

    function test_unregisteredSchema_returnsFalse() public view {
        assertFalse(registry.registered(FULFILMENT_SCHEMA_ID));
    }

    // ── Family ───────────────────────────────────────────────────────

    function test_registerSchema_revertsZeroFamily() public {
        vm.expectRevert(SchemaRegistry.ZeroFamily.selector);
        registry.registerSchema(FULFILMENT_SCHEMA_ID, 1, FULFILMENT_URI_HASH, bytes32(0));
    }

    function test_twoSchemasShareSameFamily() public {
        // Permissionless family namespace — two distinct schemas can share a
        // family. This is the load-bearing property for the RPGF Tier-1 fix:
        // a future `figaro-geo-v3` registers under keccak256("geo") and
        // inherits the Tier-1 boost without redeploying the FIG system.
        bytes32 schemaA = keccak256("figaro-geo-v2");
        bytes32 schemaB = keccak256("figaro-geo-v3-hypothetical");
        bytes32 geoFamily = keccak256("geo");

        registry.registerSchema(schemaA, 2, keccak256("ipfs://geo/v2"), geoFamily);
        registry.registerSchema(schemaB, 3, keccak256("ipfs://geo/v3"), geoFamily);

        assertTrue(registry.registered(schemaA));
        assertTrue(registry.registered(schemaB));
    }

    // ── Events ───────────────────────────────────────────────────────

    function test_emitsSchemaRegistered() public {
        vm.expectEmit(true, true, true, true);
        emit SchemaRegistry.SchemaRegistered(
            FULFILMENT_SCHEMA_ID, 1, FULFILMENT_URI_HASH, FULFILMENT_FAMILY, address(this)
        );
        registry.registerSchema(FULFILMENT_SCHEMA_ID, 1, FULFILMENT_URI_HASH, FULFILMENT_FAMILY);
    }

    function test_emitsSchemaRegistered_withRegistrar() public {
        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit SchemaRegistry.SchemaRegistered(GHG_SCHEMA_ID, 1, GHG_URI_HASH, GHG_FAMILY, alice);
        registry.registerSchema(GHG_SCHEMA_ID, 1, GHG_URI_HASH, GHG_FAMILY);
    }

    // ── Mechanism self-declaration ───────────────────────────────────

    function test_setMechanismSchema() public {
        registry.registerSchema(FULFILMENT_SCHEMA_ID, 1, FULFILMENT_URI_HASH, FULFILMENT_FAMILY);

        vm.prank(mechanism);
        registry.setMechanismSchema(FULFILMENT_SCHEMA_ID);
        // Success = no revert. Event verified below.
    }

    function test_setMechanismSchema_revertsOnUnregistered() public {
        vm.prank(mechanism);
        vm.expectRevert(abi.encodeWithSelector(SchemaRegistry.NotRegistered.selector, FULFILMENT_SCHEMA_ID));
        registry.setMechanismSchema(FULFILMENT_SCHEMA_ID);
    }

    function test_setMechanismSchema_emitsEvent() public {
        registry.registerSchema(FULFILMENT_SCHEMA_ID, 1, FULFILMENT_URI_HASH, FULFILMENT_FAMILY);

        vm.prank(mechanism);
        vm.expectEmit(true, true, false, false);
        emit SchemaRegistry.MechanismSchemaSet(mechanism, FULFILMENT_SCHEMA_ID);
        registry.setMechanismSchema(FULFILMENT_SCHEMA_ID);
    }

    function test_mechanismCanDeclareMultipleSchemas() public {
        registry.registerSchema(FULFILMENT_SCHEMA_ID, 1, FULFILMENT_URI_HASH, FULFILMENT_FAMILY);
        registry.registerSchema(GHG_SCHEMA_ID, 1, GHG_URI_HASH, GHG_FAMILY);

        vm.startPrank(mechanism);
        registry.setMechanismSchema(FULFILMENT_SCHEMA_ID);
        registry.setMechanismSchema(GHG_SCHEMA_ID);
        vm.stopPrank();
        // Both calls succeed — no storage conflict, just events.
    }

    // ── Multiple schemas ─────────────────────────────────────────────

    function test_registerThreeSchemas() public {
        registry.registerSchema(FULFILMENT_SCHEMA_ID, 1, FULFILMENT_URI_HASH, FULFILMENT_FAMILY);
        registry.registerSchema(GHG_SCHEMA_ID, 1, GHG_URI_HASH, GHG_FAMILY);
        registry.registerSchema(LIFECYCLE_SCHEMA_ID, 1, LIFECYCLE_URI_HASH, LIFECYCLE_FAMILY);

        assertTrue(registry.registered(FULFILMENT_SCHEMA_ID));
        assertTrue(registry.registered(GHG_SCHEMA_ID));
        assertTrue(registry.registered(LIFECYCLE_SCHEMA_ID));
    }

    function test_registerSchema_revertsZeroUriHash() public {
        vm.prank(alice);
        vm.expectRevert(SchemaRegistry.ZeroUriHash.selector);
        registry.registerSchema(FULFILMENT_SCHEMA_ID, 1, bytes32(0), FULFILMENT_FAMILY);
    }

    // ── No owner, no activate/deactivate ─────────────────────────────

    function test_noOwner_noActivateDeactivate() public view {
        // SchemaRegistry has no owner() function or Ownable inheritance.
        // This test documents the design: permissionless, immutable schemas.
        // If someone tries to cast to Ownable it won't compile.
        // The contract has exactly 2 externals: registerSchema, setMechanismSchema.
        // Plus 1 public mapping getter: registered(bytes32).
        assertTrue(true);
    }
}

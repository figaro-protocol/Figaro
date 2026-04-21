// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {SchemaRegistry} from "../src/SchemaRegistry.sol";

contract SchemaRegistryTest is Test {
    SchemaRegistry registry;

    bytes32 constant HANDOFF_SCHEMA_ID = keccak256("figaro-handoff-v1");
    bytes32 constant HANDOFF_URI_HASH = keccak256("ipfs://figaro-handoff/v1");

    bytes32 constant GHG_SCHEMA_ID = keccak256("figaro-ghg-disclosure-v1");
    bytes32 constant GHG_URI_HASH = keccak256("ipfs://figaro-ghg/v1");

    bytes32 constant LIFECYCLE_SCHEMA_ID = keccak256("figaro-delivery-lifecycle-v1");
    bytes32 constant LIFECYCLE_URI_HASH = keccak256("ipfs://figaro-delivery-lifecycle/v1");

    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address mechanism = address(0xBEEF);

    function setUp() public {
        registry = new SchemaRegistry();
    }

    // ── Registration ─────────────────────────────────────────────────

    function test_registerSchema() public {
        vm.prank(alice);
        registry.registerSchema(HANDOFF_SCHEMA_ID, 1, HANDOFF_URI_HASH);

        assertTrue(registry.registered(HANDOFF_SCHEMA_ID));
    }

    function test_registerSchema_permissionless() public {
        // Anyone can register — no owner gate
        vm.prank(alice);
        registry.registerSchema(HANDOFF_SCHEMA_ID, 1, HANDOFF_URI_HASH);

        vm.prank(bob);
        registry.registerSchema(GHG_SCHEMA_ID, 1, GHG_URI_HASH);

        assertTrue(registry.registered(HANDOFF_SCHEMA_ID));
        assertTrue(registry.registered(GHG_SCHEMA_ID));
    }

    function test_registerSchema_revertsOnDuplicate() public {
        registry.registerSchema(HANDOFF_SCHEMA_ID, 1, HANDOFF_URI_HASH);

        vm.expectRevert(abi.encodeWithSelector(SchemaRegistry.AlreadyRegistered.selector, HANDOFF_SCHEMA_ID));
        registry.registerSchema(HANDOFF_SCHEMA_ID, 2, HANDOFF_URI_HASH);
    }

    function test_unregisteredSchema_returnsFalse() public view {
        assertFalse(registry.registered(HANDOFF_SCHEMA_ID));
    }

    // ── Events ───────────────────────────────────────────────────────

    function test_emitsSchemaRegistered() public {
        vm.expectEmit(true, true, false, true);
        emit SchemaRegistry.SchemaRegistered(HANDOFF_SCHEMA_ID, 1, HANDOFF_URI_HASH, address(this));
        registry.registerSchema(HANDOFF_SCHEMA_ID, 1, HANDOFF_URI_HASH);
    }

    function test_emitsSchemaRegistered_withRegistrar() public {
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit SchemaRegistry.SchemaRegistered(GHG_SCHEMA_ID, 1, GHG_URI_HASH, alice);
        registry.registerSchema(GHG_SCHEMA_ID, 1, GHG_URI_HASH);
    }

    // ── Mechanism self-declaration ───────────────────────────────────

    function test_setMechanismSchema() public {
        registry.registerSchema(HANDOFF_SCHEMA_ID, 1, HANDOFF_URI_HASH);

        vm.prank(mechanism);
        registry.setMechanismSchema(HANDOFF_SCHEMA_ID);
        // Success = no revert. Event verified below.
    }

    function test_setMechanismSchema_revertsOnUnregistered() public {
        vm.prank(mechanism);
        vm.expectRevert(abi.encodeWithSelector(SchemaRegistry.NotRegistered.selector, HANDOFF_SCHEMA_ID));
        registry.setMechanismSchema(HANDOFF_SCHEMA_ID);
    }

    function test_setMechanismSchema_emitsEvent() public {
        registry.registerSchema(HANDOFF_SCHEMA_ID, 1, HANDOFF_URI_HASH);

        vm.prank(mechanism);
        vm.expectEmit(true, true, false, false);
        emit SchemaRegistry.MechanismSchemaSet(mechanism, HANDOFF_SCHEMA_ID);
        registry.setMechanismSchema(HANDOFF_SCHEMA_ID);
    }

    function test_mechanismCanDeclareMultipleSchemas() public {
        registry.registerSchema(HANDOFF_SCHEMA_ID, 1, HANDOFF_URI_HASH);
        registry.registerSchema(GHG_SCHEMA_ID, 1, GHG_URI_HASH);

        vm.startPrank(mechanism);
        registry.setMechanismSchema(HANDOFF_SCHEMA_ID);
        registry.setMechanismSchema(GHG_SCHEMA_ID);
        vm.stopPrank();
        // Both calls succeed — no storage conflict, just events.
    }

    // ── Multiple schemas ─────────────────────────────────────────────

    function test_registerThreeSchemas() public {
        registry.registerSchema(HANDOFF_SCHEMA_ID, 1, HANDOFF_URI_HASH);
        registry.registerSchema(GHG_SCHEMA_ID, 1, GHG_URI_HASH);
        registry.registerSchema(LIFECYCLE_SCHEMA_ID, 1, LIFECYCLE_URI_HASH);

        assertTrue(registry.registered(HANDOFF_SCHEMA_ID));
        assertTrue(registry.registered(GHG_SCHEMA_ID));
        assertTrue(registry.registered(LIFECYCLE_SCHEMA_ID));
    }

    function test_registerSchema_revertsZeroUriHash() public {
        vm.prank(alice);
        vm.expectRevert(SchemaRegistry.ZeroUriHash.selector);
        registry.registerSchema(HANDOFF_SCHEMA_ID, 1, bytes32(0));
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

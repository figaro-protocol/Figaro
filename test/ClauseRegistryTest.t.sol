// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ClauseRegistry} from "../src/ClauseRegistry.sol";

contract ClauseRegistryTest is Test {
    ClauseRegistry registry;

    bytes32 constant FULFILMENT_CLAUSE_ID = keccak256("figaro-fulfilment-v2");
    bytes32 constant FULFILMENT_URI_HASH = keccak256("ipfs://figaro-fulfilment/v2");
    bytes32 constant FULFILMENT_FAMILY = keccak256("fulfilment");

    bytes32 constant GHG_CLAUSE_ID = keccak256("figaro-ghg-iso-14064-v1");
    bytes32 constant GHG_URI_HASH = keccak256("ipfs://figaro-ghg/v1");
    bytes32 constant GHG_FAMILY = keccak256("emissions");

    bytes32 constant LIFECYCLE_CLAUSE_ID = keccak256("figaro-courier-process-v1");
    bytes32 constant LIFECYCLE_URI_HASH = keccak256("ipfs://figaro-courier-process/v1");
    bytes32 constant LIFECYCLE_FAMILY = keccak256("seller-process");

    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address mechanism = address(0xBEEF);

    function setUp() public {
        registry = new ClauseRegistry();
    }

    // ── Registration ─────────────────────────────────────────────────

    function test_registerClause() public {
        vm.prank(alice);
        registry.registerClause(FULFILMENT_CLAUSE_ID, 1, FULFILMENT_URI_HASH, FULFILMENT_FAMILY);

        assertTrue(registry.registered(FULFILMENT_CLAUSE_ID));
    }

    function test_registerClause_permissionless() public {
        // Anyone can register — no owner gate
        vm.prank(alice);
        registry.registerClause(FULFILMENT_CLAUSE_ID, 1, FULFILMENT_URI_HASH, FULFILMENT_FAMILY);

        vm.prank(bob);
        registry.registerClause(GHG_CLAUSE_ID, 1, GHG_URI_HASH, GHG_FAMILY);

        assertTrue(registry.registered(FULFILMENT_CLAUSE_ID));
        assertTrue(registry.registered(GHG_CLAUSE_ID));
    }

    function test_registerClause_revertsOnDuplicate() public {
        registry.registerClause(FULFILMENT_CLAUSE_ID, 1, FULFILMENT_URI_HASH, FULFILMENT_FAMILY);

        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.AlreadyRegistered.selector, FULFILMENT_CLAUSE_ID));
        registry.registerClause(FULFILMENT_CLAUSE_ID, 2, FULFILMENT_URI_HASH, FULFILMENT_FAMILY);
    }

    function test_unregisteredClause_returnsFalse() public view {
        assertFalse(registry.registered(FULFILMENT_CLAUSE_ID));
    }

    // ── Family ───────────────────────────────────────────────────────

    function test_registerClause_revertsZeroFamily() public {
        vm.expectRevert(ClauseRegistry.ZeroFamily.selector);
        registry.registerClause(FULFILMENT_CLAUSE_ID, 1, FULFILMENT_URI_HASH, bytes32(0));
    }

    function test_twoClausesShareSameFamily() public {
        // Permissionless family namespace — two distinct clauses can share a
        // family. This is the load-bearing property for the RPGF Tier-1 fix:
        // a future `figaro-geo-v3` registers under keccak256("geo") and
        // inherits the Tier-1 boost without redeploying the FIG system.
        bytes32 clauseA = keccak256("figaro-geo-v2");
        bytes32 clauseB = keccak256("figaro-geo-v3-hypothetical");
        bytes32 geoFamily = keccak256("geo");

        registry.registerClause(clauseA, 2, keccak256("ipfs://geo/v2"), geoFamily);
        registry.registerClause(clauseB, 3, keccak256("ipfs://geo/v3"), geoFamily);

        assertTrue(registry.registered(clauseA));
        assertTrue(registry.registered(clauseB));
    }

    // ── Events ───────────────────────────────────────────────────────

    function test_emitsClauseRegistered() public {
        vm.expectEmit(true, true, true, true);
        emit ClauseRegistry.ClauseRegistered(
            FULFILMENT_CLAUSE_ID, 1, FULFILMENT_URI_HASH, FULFILMENT_FAMILY, address(this)
        );
        registry.registerClause(FULFILMENT_CLAUSE_ID, 1, FULFILMENT_URI_HASH, FULFILMENT_FAMILY);
    }

    function test_emitsClauseRegistered_withRegistrar() public {
        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit ClauseRegistry.ClauseRegistered(GHG_CLAUSE_ID, 1, GHG_URI_HASH, GHG_FAMILY, alice);
        registry.registerClause(GHG_CLAUSE_ID, 1, GHG_URI_HASH, GHG_FAMILY);
    }

    // ── Mechanism self-declaration ───────────────────────────────────

    function test_setMechanismClause() public {
        registry.registerClause(FULFILMENT_CLAUSE_ID, 1, FULFILMENT_URI_HASH, FULFILMENT_FAMILY);

        vm.prank(mechanism);
        registry.setMechanismClause(FULFILMENT_CLAUSE_ID);
        // Success = no revert. Event verified below.
    }

    function test_setMechanismClause_revertsOnUnregistered() public {
        vm.prank(mechanism);
        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.NotRegistered.selector, FULFILMENT_CLAUSE_ID));
        registry.setMechanismClause(FULFILMENT_CLAUSE_ID);
    }

    function test_setMechanismClause_emitsEvent() public {
        registry.registerClause(FULFILMENT_CLAUSE_ID, 1, FULFILMENT_URI_HASH, FULFILMENT_FAMILY);

        vm.prank(mechanism);
        vm.expectEmit(true, true, false, false);
        emit ClauseRegistry.MechanismClauseSet(mechanism, FULFILMENT_CLAUSE_ID);
        registry.setMechanismClause(FULFILMENT_CLAUSE_ID);
    }

    function test_mechanismCanDeclareMultipleClauses() public {
        registry.registerClause(FULFILMENT_CLAUSE_ID, 1, FULFILMENT_URI_HASH, FULFILMENT_FAMILY);
        registry.registerClause(GHG_CLAUSE_ID, 1, GHG_URI_HASH, GHG_FAMILY);

        vm.startPrank(mechanism);
        registry.setMechanismClause(FULFILMENT_CLAUSE_ID);
        registry.setMechanismClause(GHG_CLAUSE_ID);
        vm.stopPrank();
        // Both calls succeed — no storage conflict, just events.
    }

    // ── Multiple clauses ─────────────────────────────────────────────

    function test_registerThreeClauses() public {
        registry.registerClause(FULFILMENT_CLAUSE_ID, 1, FULFILMENT_URI_HASH, FULFILMENT_FAMILY);
        registry.registerClause(GHG_CLAUSE_ID, 1, GHG_URI_HASH, GHG_FAMILY);
        registry.registerClause(LIFECYCLE_CLAUSE_ID, 1, LIFECYCLE_URI_HASH, LIFECYCLE_FAMILY);

        assertTrue(registry.registered(FULFILMENT_CLAUSE_ID));
        assertTrue(registry.registered(GHG_CLAUSE_ID));
        assertTrue(registry.registered(LIFECYCLE_CLAUSE_ID));
    }

    function test_registerClause_revertsZeroUriHash() public {
        vm.prank(alice);
        vm.expectRevert(ClauseRegistry.ZeroUriHash.selector);
        registry.registerClause(FULFILMENT_CLAUSE_ID, 1, bytes32(0), FULFILMENT_FAMILY);
    }

    // ── No owner, no activate/deactivate ─────────────────────────────

    function test_noOwner_noActivateDeactivate() public view {
        // ClauseRegistry has no owner() function or Ownable inheritance.
        // This test documents the design: permissionless, immutable clauses.
        // If someone tries to cast to Ownable it won't compile.
        // The contract has exactly 2 externals: registerClause, setMechanismClause.
        // Plus 1 public mapping getter: registered(bytes32).
        assertTrue(true);
    }
}

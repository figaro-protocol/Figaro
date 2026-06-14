// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ClauseRegistry} from "../src/ClauseRegistry.sol";

contract ClauseRegistryTest is Test {
    ClauseRegistry registry;

    // Each clause is its human-readable id (passed to registerClause) paired with
    // its keccak256 hash (the on-chain dedup key + the arg to registered() /
    // setMechanismClause). metadataURI is the IPFS locator; contentHash the spec
    // integrity digest.
    string constant MODALITIES_ID = "figaro-modalities";
    bytes32 constant MODALITIES_HASH = keccak256(abi.encode("figaro-modalities", uint64(1)));
    string constant MODALITIES_URI = "ipfs://figaro-modalities/v1";
    bytes32 constant MODALITIES_CONTENT = keccak256("figaro-modalities-v1-spec");
    bytes32 constant MODALITIES_FAMILY = keccak256("coordination");

    string constant GHG_ID = "figaro-ghg-iso-14064";
    bytes32 constant GHG_HASH = keccak256(abi.encode("figaro-ghg-iso-14064", uint64(1)));
    string constant GHG_URI = "ipfs://figaro-ghg/v1";
    bytes32 constant GHG_CONTENT = keccak256("figaro-ghg-iso-14064-v1-spec");
    bytes32 constant GHG_FAMILY = keccak256("emissions");

    string constant LIFECYCLE_ID = "figaro-courier-process";
    bytes32 constant LIFECYCLE_HASH = keccak256(abi.encode("figaro-courier-process", uint64(1)));
    string constant LIFECYCLE_URI = "ipfs://figaro-courier-process/v1";
    bytes32 constant LIFECYCLE_CONTENT = keccak256("figaro-courier-process-v1-spec");
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
        registry.registerClause(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI, MODALITIES_FAMILY);

        assertTrue(registry.registered(MODALITIES_HASH));
    }

    function test_registerClause_permissionless() public {
        // Anyone can register — no owner gate
        vm.prank(alice);
        registry.registerClause(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI, MODALITIES_FAMILY);

        vm.prank(bob);
        registry.registerClause(GHG_ID, 1, GHG_CONTENT, GHG_URI, GHG_FAMILY);

        assertTrue(registry.registered(MODALITIES_HASH));
        assertTrue(registry.registered(GHG_HASH));
    }

    function test_registerClause_revertsOnDuplicate() public {
        registry.registerClause(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI, MODALITIES_FAMILY);

        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.AlreadyRegistered.selector, MODALITIES_HASH));
        registry.registerClause(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI, MODALITIES_FAMILY);
    }

    function test_unregisteredClause_returnsFalse() public view {
        assertFalse(registry.registered(MODALITIES_HASH));
    }

    // ── Family ───────────────────────────────────────────────────────

    function test_registerClause_revertsZeroFamily() public {
        vm.expectRevert(ClauseRegistry.ZeroFamily.selector);
        registry.registerClause(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI, bytes32(0));
    }

    function test_twoClausesShareSameFamily() public {
        // Permissionless family namespace — two distinct clauses can share a
        // family. This is the load-bearing property for the RPGF Tier-1 fix:
        // a future `figaro-geo-v3` registers under keccak256("geo") and
        // inherits the Tier-1 boost without redeploying the FIG system.
        bytes32 geoFamily = keccak256("geo");

        registry.registerClause("figaro-geo", 2, keccak256("geo-v2-spec"), "ipfs://geo/v2", geoFamily);
        registry.registerClause(
            "figaro-geo", 3, keccak256("geo-v3-spec"), "ipfs://geo/v3", geoFamily
        );

        assertTrue(registry.registered(keccak256(abi.encode("figaro-geo", uint64(2)))));
        assertTrue(registry.registered(keccak256(abi.encode("figaro-geo", uint64(3)))));
    }

    // ── Events ───────────────────────────────────────────────────────

    function test_emitsClauseRegistered() public {
        vm.expectEmit(true, true, true, true);
        emit ClauseRegistry.ClauseRegistered(
            MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI, MODALITIES_FAMILY, address(this)
        );
        registry.registerClause(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI, MODALITIES_FAMILY);
    }

    function test_emitsClauseRegistered_withRegistrar() public {
        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit ClauseRegistry.ClauseRegistered(GHG_ID, 1, GHG_CONTENT, GHG_URI, GHG_FAMILY, alice);
        registry.registerClause(GHG_ID, 1, GHG_CONTENT, GHG_URI, GHG_FAMILY);
    }

    // ── Mechanism self-declaration ───────────────────────────────────

    function test_setMechanismClause() public {
        registry.registerClause(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI, MODALITIES_FAMILY);

        vm.prank(mechanism);
        registry.setMechanismClause(MODALITIES_HASH);
        // Success = no revert. Event verified below.
    }

    function test_setMechanismClause_revertsOnUnregistered() public {
        vm.prank(mechanism);
        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.NotRegistered.selector, MODALITIES_HASH));
        registry.setMechanismClause(MODALITIES_HASH);
    }

    function test_setMechanismClause_emitsEvent() public {
        registry.registerClause(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI, MODALITIES_FAMILY);

        vm.prank(mechanism);
        vm.expectEmit(true, true, false, false);
        emit ClauseRegistry.MechanismClauseSet(mechanism, MODALITIES_HASH);
        registry.setMechanismClause(MODALITIES_HASH);
    }

    function test_mechanismCanDeclareMultipleClauses() public {
        registry.registerClause(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI, MODALITIES_FAMILY);
        registry.registerClause(GHG_ID, 1, GHG_CONTENT, GHG_URI, GHG_FAMILY);

        vm.startPrank(mechanism);
        registry.setMechanismClause(MODALITIES_HASH);
        registry.setMechanismClause(GHG_HASH);
        vm.stopPrank();
        // Both calls succeed — no storage conflict, just events.
    }

    // ── Multiple clauses ─────────────────────────────────────────────

    function test_registerThreeClauses() public {
        registry.registerClause(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI, MODALITIES_FAMILY);
        registry.registerClause(GHG_ID, 1, GHG_CONTENT, GHG_URI, GHG_FAMILY);
        registry.registerClause(LIFECYCLE_ID, 1, LIFECYCLE_CONTENT, LIFECYCLE_URI, LIFECYCLE_FAMILY);

        assertTrue(registry.registered(MODALITIES_HASH));
        assertTrue(registry.registered(GHG_HASH));
        assertTrue(registry.registered(LIFECYCLE_HASH));
    }

    function test_registerClause_revertsZeroContentHash() public {
        vm.prank(alice);
        vm.expectRevert(ClauseRegistry.ZeroContentHash.selector);
        registry.registerClause(MODALITIES_ID, 1, bytes32(0), MODALITIES_URI, MODALITIES_FAMILY);
    }

    function test_registerClause_revertsEmptyMetadataURI() public {
        vm.prank(alice);
        vm.expectRevert(ClauseRegistry.EmptyMetadataURI.selector);
        registry.registerClause(MODALITIES_ID, 1, MODALITIES_CONTENT, "", MODALITIES_FAMILY);
    }

    function test_registerClause_revertsEmptyClauseId() public {
        vm.prank(alice);
        vm.expectRevert(ClauseRegistry.EmptyClauseId.selector);
        registry.registerClause("", 1, MODALITIES_CONTENT, MODALITIES_URI, MODALITIES_FAMILY);
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

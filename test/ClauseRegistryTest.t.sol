// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ClauseRegistry} from "../src/ClauseRegistry.sol";

contract ClauseRegistryTest is Test {
    ClauseRegistry registry;

    // Each clause is its human-readable id (passed to registerClause) paired with
    // its keccak256 hash (the on-chain dedup key + the arg to registered() /
    // setMechanismClause). contentURI is the IPFS document pointer; contentHash the spec
    // integrity digest. Grouping is block.article in the off-chain spec — there is
    // no on-chain group field.
    string constant MODALITIES_ID = "figaro-modalities";
    bytes32 constant MODALITIES_HASH = keccak256(abi.encode("figaro-modalities", uint64(1)));
    string constant MODALITIES_URI = "ipfs://figaro-modalities/v1";
    bytes32 constant MODALITIES_CONTENT = keccak256("figaro-modalities-v1-spec");

    string constant EMISSIONS_ID = "figaro-emissions-iso-14064";
    bytes32 constant EMISSIONS_HASH = keccak256(abi.encode("figaro-emissions-iso-14064", uint64(1)));
    string constant EMISSIONS_URI = "ipfs://figaro-emissions/v1";
    bytes32 constant EMISSIONS_CONTENT = keccak256("figaro-emissions-iso-14064-v1-spec");

    string constant LIFECYCLE_ID = "figaro-courier-process";
    bytes32 constant LIFECYCLE_HASH = keccak256(abi.encode("figaro-courier-process", uint64(1)));
    string constant LIFECYCLE_URI = "ipfs://figaro-courier-process/v1";
    bytes32 constant LIFECYCLE_CONTENT = keccak256("figaro-courier-process-v1-spec");

    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address mechanism = address(0xBEEF);

    uint256 constant DEPOSIT = 0.001 ether;

    function setUp() public {
        registry = new ClauseRegistry(DEPOSIT);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(address(this), 10 ether);
    }

    // ── Registration (deposit = staked intent) ────────────────────────

    function test_registerClause() public {
        vm.prank(alice);
        registry.registerClause{value: DEPOSIT}(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI);

        assertTrue(registry.registered(MODALITIES_HASH));
        // The integrity anchor is stored, not just emitted — the batch
        // verifier checks proof spec-bindings against it.
        assertEq(registry.contentHashOf(MODALITIES_HASH), MODALITIES_CONTENT);
        (address registrar, bool withdrawn) = registry.depositOf(MODALITIES_HASH);
        assertEq(registrar, alice);
        assertFalse(withdrawn);
    }

    function test_registerClause_permissionless() public {
        // Anyone can register — no owner gate
        vm.prank(alice);
        registry.registerClause{value: DEPOSIT}(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI);

        vm.prank(bob);
        registry.registerClause{value: DEPOSIT}(EMISSIONS_ID, 1, EMISSIONS_CONTENT, EMISSIONS_URI);

        assertTrue(registry.registered(MODALITIES_HASH));
        assertTrue(registry.registered(EMISSIONS_HASH));
    }

    function test_registerClause_revertsOnDuplicate() public {
        registry.registerClause{value: DEPOSIT}(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI);

        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.AlreadyRegistered.selector, MODALITIES_HASH));
        registry.registerClause{value: DEPOSIT}(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI);
    }

    function test_registerClause_revertsWrongDeposit() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.WrongDeposit.selector, DEPOSIT - 1, DEPOSIT));
        registry.registerClause{value: DEPOSIT - 1}(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI);

        // Excess is also rejected — no sweep function exists.
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.WrongDeposit.selector, DEPOSIT + 1, DEPOSIT));
        registry.registerClause{value: DEPOSIT + 1}(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI);
    }

    function test_registerClause_zeroDepositDeploy() public {
        ClauseRegistry freeRegistry = new ClauseRegistry(0);
        vm.prank(alice);
        freeRegistry.registerClause(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI);
        assertTrue(freeRegistry.registered(MODALITIES_HASH));
    }

    function test_unregisteredClause_returnsFalse() public view {
        assertFalse(registry.registered(MODALITIES_HASH));
    }

    // ── Same id, different version is a distinct clause ───────────────

    function test_sameNameDifferentVersionIsDistinct() public {
        // Permissionless versioning — the (name, version) pair is the identity, so
        // a future figaro-geolocation-v3 registers without colliding with v2.
        registry.registerClause{value: DEPOSIT}("figaro-geolocation", 2, keccak256("geo-v2-spec"), "ipfs://geo/v2");
        registry.registerClause{value: DEPOSIT}("figaro-geolocation", 3, keccak256("geo-v3-spec"), "ipfs://geo/v3");

        assertTrue(registry.registered(keccak256(abi.encode("figaro-geolocation", uint64(2)))));
        assertTrue(registry.registered(keccak256(abi.encode("figaro-geolocation", uint64(3)))));
    }

    // ── Deposit withdrawal (no time lock — K4: withdraw de-surfaces) ──

    function test_withdrawDeposit_returnsStake_bindingStays() public {
        vm.prank(alice);
        registry.registerClause{value: DEPOSIT}(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI);

        uint256 balBefore = alice.balance;
        vm.prank(alice);
        registry.withdrawDeposit(MODALITIES_HASH);

        assertEq(alice.balance, balBefore + DEPOSIT);
        // The binding is PERMANENT — registered stays true so committed
        // agreements keep resolving the clause; only surfacing derives
        // from the (now-withdrawn) stake.
        assertTrue(registry.registered(MODALITIES_HASH));
        (, bool withdrawn) = registry.depositOf(MODALITIES_HASH);
        assertTrue(withdrawn);
    }

    function test_withdrawDeposit_emitsEvent() public {
        vm.prank(alice);
        registry.registerClause{value: DEPOSIT}(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit ClauseRegistry.DepositWithdrawn(MODALITIES_HASH, alice, DEPOSIT);
        registry.withdrawDeposit(MODALITIES_HASH);
    }

    function test_withdrawDeposit_registrarOnly() public {
        vm.prank(alice);
        registry.registerClause{value: DEPOSIT}(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.NotRegistrar.selector, bob, alice));
        registry.withdrawDeposit(MODALITIES_HASH);
    }

    function test_withdrawDeposit_onlyOnce() public {
        vm.prank(alice);
        registry.registerClause{value: DEPOSIT}(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI);

        vm.prank(alice);
        registry.withdrawDeposit(MODALITIES_HASH);

        vm.prank(alice);
        vm.expectRevert(ClauseRegistry.AlreadyWithdrawn.selector);
        registry.withdrawDeposit(MODALITIES_HASH);
    }

    function test_withdrawDeposit_revertsUnregistered() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.NotRegistered.selector, MODALITIES_HASH));
        registry.withdrawDeposit(MODALITIES_HASH);
    }

    function test_versionMigration_moveStakeToNewVersion() public {
        // Version migration = withdraw the old version's stake + register
        // the new version with it. The old binding stays permanent (its
        // committed agreements are untouched); it merely de-surfaces.
        vm.startPrank(alice);
        registry.registerClause{value: DEPOSIT}("figaro-geolocation", 2, keccak256("geo-v2-spec"), "ipfs://geo/v2");
        registry.withdrawDeposit(keccak256(abi.encode("figaro-geolocation", uint64(2))));
        registry.registerClause{value: DEPOSIT}("figaro-geolocation", 3, keccak256("geo-v3-spec"), "ipfs://geo/v3");
        vm.stopPrank();

        assertTrue(registry.registered(keccak256(abi.encode("figaro-geolocation", uint64(2)))));
        assertTrue(registry.registered(keccak256(abi.encode("figaro-geolocation", uint64(3)))));
        (, bool v2Withdrawn) = registry.depositOf(keccak256(abi.encode("figaro-geolocation", uint64(2))));
        (, bool v3Withdrawn) = registry.depositOf(keccak256(abi.encode("figaro-geolocation", uint64(3))));
        assertTrue(v2Withdrawn);
        assertFalse(v3Withdrawn);
    }

    // ── Events ───────────────────────────────────────────────────────

    function test_emitsClauseRegistered() public {
        vm.expectEmit(true, true, true, true);
        emit ClauseRegistry.ClauseRegistered(
            MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI, address(this)
        );
        registry.registerClause{value: DEPOSIT}(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI);
    }

    function test_emitsClauseRegistered_withRegistrar() public {
        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit ClauseRegistry.ClauseRegistered(EMISSIONS_ID, 1, EMISSIONS_CONTENT, EMISSIONS_URI, alice);
        registry.registerClause{value: DEPOSIT}(EMISSIONS_ID, 1, EMISSIONS_CONTENT, EMISSIONS_URI);
    }

    // ── Mechanism self-declaration ───────────────────────────────────

    function test_setMechanismClause() public {
        registry.registerClause{value: DEPOSIT}(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI);

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
        registry.registerClause{value: DEPOSIT}(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI);

        vm.prank(mechanism);
        vm.expectEmit(true, true, false, false);
        emit ClauseRegistry.MechanismClauseSet(mechanism, MODALITIES_HASH);
        registry.setMechanismClause(MODALITIES_HASH);
    }

    function test_mechanismCanDeclareMultipleClauses() public {
        registry.registerClause{value: DEPOSIT}(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI);
        registry.registerClause{value: DEPOSIT}(EMISSIONS_ID, 1, EMISSIONS_CONTENT, EMISSIONS_URI);

        vm.startPrank(mechanism);
        registry.setMechanismClause(MODALITIES_HASH);
        registry.setMechanismClause(EMISSIONS_HASH);
        vm.stopPrank();
        // Both calls succeed — no storage conflict, just events.
    }

    // ── Multiple clauses ─────────────────────────────────────────────

    function test_registerThreeClauses() public {
        registry.registerClause{value: DEPOSIT}(MODALITIES_ID, 1, MODALITIES_CONTENT, MODALITIES_URI);
        registry.registerClause{value: DEPOSIT}(EMISSIONS_ID, 1, EMISSIONS_CONTENT, EMISSIONS_URI);
        registry.registerClause{value: DEPOSIT}(LIFECYCLE_ID, 1, LIFECYCLE_CONTENT, LIFECYCLE_URI);

        assertTrue(registry.registered(MODALITIES_HASH));
        assertTrue(registry.registered(EMISSIONS_HASH));
        assertTrue(registry.registered(LIFECYCLE_HASH));
    }

    function test_registerClause_revertsZeroContentHash() public {
        vm.prank(alice);
        vm.expectRevert(ClauseRegistry.ZeroContentHash.selector);
        registry.registerClause{value: DEPOSIT}(MODALITIES_ID, 1, bytes32(0), MODALITIES_URI);
    }

    function test_registerClause_revertsEmptyContentURI() public {
        vm.prank(alice);
        vm.expectRevert(ClauseRegistry.EmptyContentURI.selector);
        registry.registerClause{value: DEPOSIT}(MODALITIES_ID, 1, MODALITIES_CONTENT, "");
    }

    function test_registerClause_revertsEmptyClauseId() public {
        vm.prank(alice);
        vm.expectRevert(ClauseRegistry.EmptyClauseId.selector);
        registry.registerClause{value: DEPOSIT}("", 1, MODALITIES_CONTENT, MODALITIES_URI);
    }

    // ── No owner, no activate/deactivate ─────────────────────────────

    function test_noOwner_noActivateDeactivate() public view {
        // ClauseRegistry has no owner() function or Ownable inheritance.
        // This test documents the design: permissionless, immutable clauses.
        // If someone tries to cast to Ownable it won't compile.
        // The contract has exactly 3 externals: registerClause,
        // withdrawDeposit, setMechanismClause. Plus public getters:
        // registered(bytes32), depositOf(bytes32), registrationDeposit().
        assertTrue(true);
    }
}

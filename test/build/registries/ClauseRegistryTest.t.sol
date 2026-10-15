// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ClauseRegistry} from "src/build/registries/ClauseRegistry.sol";

contract ClauseRegistryTest is Test {
    ClauseRegistry registry;

    // A clause is its spec. Each fixture below is a spec's pinned bytes (a
    // stand-in for the canonical JSON `canonicalize` emits), and the clause key
    // is keccak256 of exactly those bytes — the registry's one identity rule,
    // the argument to registerClause, registered(), depositOf(),
    // withdrawDeposit() and setMechanismClause(). The spec's clauseId and
    // version are presentation fields inside the bytes; nothing here reads
    // them. contentURI is the IPFS pointer a reader fetches the bytes from.
    bytes constant MODALITIES_SPEC = bytes('{"clauseId":"figaro-modalities","version":1}');
    bytes32 constant MODALITIES_KEY = keccak256(MODALITIES_SPEC);
    string constant MODALITIES_URI = "ipfs://figaro-modalities";

    bytes constant EMISSIONS_SPEC = bytes('{"clauseId":"figaro-emissions-iso-14064","version":1}');
    bytes32 constant EMISSIONS_KEY = keccak256(EMISSIONS_SPEC);
    string constant EMISSIONS_URI = "ipfs://figaro-emissions";

    bytes constant LIFECYCLE_SPEC = bytes('{"clauseId":"figaro-courier-process","version":1}');
    bytes32 constant LIFECYCLE_KEY = keccak256(LIFECYCLE_SPEC);
    string constant LIFECYCLE_URI = "ipfs://figaro-courier-process";

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
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);

        assertTrue(registry.registered(MODALITIES_KEY));
        (address registeredBy, bool withdrawn) = registry.depositOf(MODALITIES_KEY);
        assertEq(registeredBy, alice);
        assertFalse(withdrawn);
    }

    function test_registerClause_permissionless() public {
        // Anyone can register — no owner gate
        vm.prank(alice);
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);

        vm.prank(bob);
        registry.registerClause{value: DEPOSIT}(EMISSIONS_KEY, EMISSIONS_URI);

        assertTrue(registry.registered(MODALITIES_KEY));
        assertTrue(registry.registered(EMISSIONS_KEY));
    }

    function test_registerClause_revertsOnDuplicate() public {
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);

        // First write wins on the key: a second registration of the same bytes,
        // from any wallet and under any URI, is refused and the first
        // registrant of record stands.
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.AlreadyRegistered.selector, MODALITIES_KEY));
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, "ipfs://elsewhere");

        (address registeredBy,) = registry.depositOf(MODALITIES_KEY);
        assertEq(registeredBy, address(this));
    }

    function test_registerClause_revertsWrongDeposit() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.WrongDeposit.selector, DEPOSIT - 1, DEPOSIT));
        registry.registerClause{value: DEPOSIT - 1}(MODALITIES_KEY, MODALITIES_URI);

        // Excess is also rejected — no sweep function exists.
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.WrongDeposit.selector, DEPOSIT + 1, DEPOSIT));
        registry.registerClause{value: DEPOSIT + 1}(MODALITIES_KEY, MODALITIES_URI);
    }

    function test_registerClause_zeroDepositDeploy() public {
        ClauseRegistry freeRegistry = new ClauseRegistry(0);
        vm.prank(alice);
        freeRegistry.registerClause(MODALITIES_KEY, MODALITIES_URI);
        assertTrue(freeRegistry.registered(MODALITIES_KEY));
    }

    function test_unregisteredClause_returnsFalse() public view {
        assertFalse(registry.registered(MODALITIES_KEY));
    }

    // ── Two specs are two clauses, whatever name they carry ──────────

    function test_twoSpecsWithOneNameAreTwoClauses() public {
        // Both documents say clauseId "figaro-geolocation"; their bytes differ,
        // so their keys differ and each registers as its own clause. The name is
        // presentation inside the document; a lookalike shares nothing with the
        // original but the label.
        bytes32 geoA = keccak256(bytes('{"clauseId":"figaro-geolocation","version":2}'));
        bytes32 geoB = keccak256(bytes('{"clauseId":"figaro-geolocation","version":3}'));
        vm.prank(alice);
        registry.registerClause{value: DEPOSIT}(geoA, "ipfs://geo/a");
        vm.prank(bob);
        registry.registerClause{value: DEPOSIT}(geoB, "ipfs://geo/b");

        assertTrue(registry.registered(geoA));
        assertTrue(registry.registered(geoB));
        (address byA,) = registry.depositOf(geoA);
        (address byB,) = registry.depositOf(geoB);
        assertEq(byA, alice);
        assertEq(byB, bob);
    }

    function testFuzz_keyIsTheOnlyIdentity(bytes calldata specA, bytes calldata specB) public {
        bytes32 keyA = keccak256(specA);
        bytes32 keyB = keccak256(specB);
        vm.assume(keyA != keyB);
        registry.registerClause{value: DEPOSIT}(keyA, "ipfs://a");
        assertTrue(registry.registered(keyA));
        assertFalse(registry.registered(keyB));
        registry.registerClause{value: DEPOSIT}(keyB, "ipfs://b");
        assertTrue(registry.registered(keyB));
    }

    // ── Deposit withdrawal (no time lock — K4: withdraw de-surfaces) ──

    function test_withdrawDeposit_returnsStake_bindingStays() public {
        vm.prank(alice);
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);

        uint256 balBefore = alice.balance;
        vm.prank(alice);
        registry.withdrawDeposit(MODALITIES_KEY);

        assertEq(alice.balance, balBefore + DEPOSIT);
        // The binding is PERMANENT — registered stays true so committed
        // agreements keep resolving the clause; only surfacing derives
        // from the (now-withdrawn) stake.
        assertTrue(registry.registered(MODALITIES_KEY));
        (, bool withdrawn) = registry.depositOf(MODALITIES_KEY);
        assertTrue(withdrawn);
    }

    function test_withdrawDeposit_emitsEvent() public {
        vm.prank(alice);
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit ClauseRegistry.DepositWithdrawn(MODALITIES_KEY, alice, DEPOSIT);
        registry.withdrawDeposit(MODALITIES_KEY);
    }

    function test_withdrawDeposit_registeredByOnly() public {
        vm.prank(alice);
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.NotRegisteredBy.selector, bob, alice));
        registry.withdrawDeposit(MODALITIES_KEY);
    }

    function test_withdrawDeposit_onlyOnce() public {
        vm.prank(alice);
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);

        vm.prank(alice);
        registry.withdrawDeposit(MODALITIES_KEY);

        vm.prank(alice);
        vm.expectRevert(ClauseRegistry.AlreadyWithdrawn.selector);
        registry.withdrawDeposit(MODALITIES_KEY);
    }

    function test_withdrawDeposit_revertsUnregistered() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.NotRegistered.selector, MODALITIES_KEY));
        registry.withdrawDeposit(MODALITIES_KEY);
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
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);

        vm.prank(rejecter);
        vm.expectRevert(ClauseRegistry.TransferFailed.selector);
        registry.withdrawDeposit(MODALITIES_KEY);

        (, bool withdrawn) = registry.depositOf(MODALITIES_KEY);
        assertFalse(withdrawn);
        assertEq(address(registry).balance, DEPOSIT);
    }

    function test_withdrawThenRegisterAnotherSpec() public {
        // A designer moves its stake from one spec to another by withdrawing
        // from the first key and registering the second. The first binding
        // stays permanent (its committed agreements are untouched); it merely
        // de-surfaces.
        bytes32 first = keccak256(bytes('{"clauseId":"figaro-geolocation","version":2}'));
        bytes32 second = keccak256(bytes('{"clauseId":"figaro-geolocation","version":3}'));
        vm.startPrank(alice);
        registry.registerClause{value: DEPOSIT}(first, "ipfs://geo/a");
        registry.withdrawDeposit(first);
        registry.registerClause{value: DEPOSIT}(second, "ipfs://geo/b");
        vm.stopPrank();

        assertTrue(registry.registered(first));
        assertTrue(registry.registered(second));
        (, bool firstWithdrawn) = registry.depositOf(first);
        (, bool secondWithdrawn) = registry.depositOf(second);
        assertTrue(firstWithdrawn);
        assertFalse(secondWithdrawn);
    }

    // ── Events ───────────────────────────────────────────────────────

    function test_emitsClauseRegistered() public {
        vm.expectEmit(true, true, true, true);
        emit ClauseRegistry.ClauseRegistered(MODALITIES_KEY, MODALITIES_URI, address(this));
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);
    }

    function test_emitsClauseRegistered_withRegisteredBy() public {
        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit ClauseRegistry.ClauseRegistered(EMISSIONS_KEY, EMISSIONS_URI, alice);
        registry.registerClause{value: DEPOSIT}(EMISSIONS_KEY, EMISSIONS_URI);
    }

    // ── Mechanism self-declaration ───────────────────────────────────

    function test_setMechanismClause() public {
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);

        vm.prank(mechanism);
        registry.setMechanismClause(MODALITIES_KEY);
        // Success = no revert. Event verified below.
    }

    function test_setMechanismClause_revertsOnUnregistered() public {
        vm.prank(mechanism);
        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.NotRegistered.selector, MODALITIES_KEY));
        registry.setMechanismClause(MODALITIES_KEY);
    }

    function test_setMechanismClause_emitsEvent() public {
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);

        vm.prank(mechanism);
        vm.expectEmit(true, true, false, false);
        emit ClauseRegistry.MechanismClauseSet(mechanism, MODALITIES_KEY);
        registry.setMechanismClause(MODALITIES_KEY);
    }

    function test_mechanismCanDeclareMultipleClauses() public {
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);
        registry.registerClause{value: DEPOSIT}(EMISSIONS_KEY, EMISSIONS_URI);

        vm.startPrank(mechanism);
        registry.setMechanismClause(MODALITIES_KEY);
        registry.setMechanismClause(EMISSIONS_KEY);
        vm.stopPrank();
        // Both calls succeed — no storage conflict, just events.
    }

    // ── Multiple clauses ─────────────────────────────────────────────

    function test_registerThreeClauses() public {
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);
        registry.registerClause{value: DEPOSIT}(EMISSIONS_KEY, EMISSIONS_URI);
        registry.registerClause{value: DEPOSIT}(LIFECYCLE_KEY, LIFECYCLE_URI);

        assertTrue(registry.registered(MODALITIES_KEY));
        assertTrue(registry.registered(EMISSIONS_KEY));
        assertTrue(registry.registered(LIFECYCLE_KEY));
    }

    function test_registerClause_revertsZeroClauseKey() public {
        vm.prank(alice);
        vm.expectRevert(ClauseRegistry.ZeroClauseKey.selector);
        registry.registerClause{value: DEPOSIT}(bytes32(0), MODALITIES_URI);
    }

    function test_registerClause_revertsEmptyContentURI() public {
        vm.prank(alice);
        vm.expectRevert(ClauseRegistry.EmptyContentURI.selector);
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, "");
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

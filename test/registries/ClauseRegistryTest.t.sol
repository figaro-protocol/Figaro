// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ClauseRegistry} from "src/registries/ClauseRegistry.sol";

contract ClauseRegistryTest is Test {
    ClauseRegistry registry;

    // A clause is its spec. Each fixture below is a spec's pinned bytes (a
    // stand-in for the canonical JSON `canonicalize` emits), and the clause key
    // is keccak256 of exactly those bytes — the registry's one identity rule,
    // the argument to registerClause, registered(), depositOf(),
    // requestWithdrawal() and withdraw(). The spec's clauseId and
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
    uint256 constant COOLDOWN = 28 days;

    function setUp() public {
        registry = new ClauseRegistry(DEPOSIT, COOLDOWN);
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
        ClauseRegistry freeRegistry = new ClauseRegistry(0, COOLDOWN);
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

    // ── Stake withdrawal: request, then claim after the cooldown ──────────

    function test_requestWithdrawal_flagsAtOnce_paysNothing_bindingStays() public {
        vm.prank(alice);
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);

        uint256 balanceBefore = alice.balance;
        vm.prank(alice);
        registry.requestWithdrawal(MODALITIES_KEY);

        // The stake stops counting as live at the request; the ETH stays.
        (, bool withdrawn) = registry.depositOf(MODALITIES_KEY);
        assertTrue(withdrawn, "withdrawn at the request");
        assertEq(alice.balance, balanceBefore, "nothing paid at the request");
        assertEq(address(registry).balance, DEPOSIT, "the stake stays locked");
        assertEq(registry.releaseAt(MODALITIES_KEY), block.timestamp + COOLDOWN);
        assertFalse(registry.withdrawable(MODALITIES_KEY));
    }

    function test_requestWithdrawal_emitsWithdrawalRequested() public {
        vm.prank(alice);
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);

        vm.expectEmit(true, true, false, true, address(registry));
        emit ClauseRegistry.WithdrawalRequested(MODALITIES_KEY, alice, DEPOSIT, block.timestamp + COOLDOWN);
        vm.prank(alice);
        registry.requestWithdrawal(MODALITIES_KEY);
    }

    function test_withdraw_beforeCooldown_reverts() public {
        vm.prank(alice);
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);
        vm.prank(alice);
        registry.requestWithdrawal(MODALITIES_KEY);
        uint256 unlockAt = block.timestamp + COOLDOWN;

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.CooldownActive.selector, unlockAt));
        registry.withdraw(MODALITIES_KEY);

        vm.warp(unlockAt - 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.CooldownActive.selector, unlockAt));
        registry.withdraw(MODALITIES_KEY);
        assertEq(address(registry).balance, DEPOSIT, "no early release");
    }

    function test_withdraw_afterCooldown_paysOnce() public {
        vm.prank(alice);
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);
        vm.prank(alice);
        registry.requestWithdrawal(MODALITIES_KEY);

        vm.warp(block.timestamp + COOLDOWN);
        assertTrue(registry.withdrawable(MODALITIES_KEY));
        uint256 balanceBefore = alice.balance;
        vm.expectEmit(true, true, false, true, address(registry));
        emit ClauseRegistry.DepositWithdrawn(MODALITIES_KEY, alice, DEPOSIT);
        vm.prank(alice);
        registry.withdraw(MODALITIES_KEY);

        assertEq(alice.balance, balanceBefore + DEPOSIT);
        assertEq(address(registry).balance, 0);
        assertEq(registry.releaseAt(MODALITIES_KEY), 0);
        assertFalse(registry.withdrawable(MODALITIES_KEY));

        vm.prank(alice);
        vm.expectRevert(ClauseRegistry.NothingPending.selector);
        registry.withdraw(MODALITIES_KEY);
    }

    function test_withdraw_withoutRequest_reverts() public {
        vm.prank(alice);
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);

        vm.prank(alice);
        vm.expectRevert(ClauseRegistry.NothingPending.selector);
        registry.withdraw(MODALITIES_KEY);
    }

    function test_zeroCooldown_claimableInTheSameBlock() public {
        ClauseRegistry free = new ClauseRegistry(DEPOSIT, 0);
        vm.startPrank(alice);
        free.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);
        free.requestWithdrawal(MODALITIES_KEY);
        assertTrue(free.withdrawable(MODALITIES_KEY));
        free.withdraw(MODALITIES_KEY);
        vm.stopPrank();
        assertEq(address(free).balance, 0);
    }

    function test_requestWithdrawal_onlyOnce() public {
        vm.prank(alice);
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);
        vm.prank(alice);
        registry.requestWithdrawal(MODALITIES_KEY);

        vm.prank(alice);
        vm.expectRevert(ClauseRegistry.AlreadyWithdrawn.selector);
        registry.requestWithdrawal(MODALITIES_KEY);
    }

    function test_withdrawal_registeredByOnly() public {
        vm.prank(alice);
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.NotRegisteredBy.selector, bob, alice));
        registry.requestWithdrawal(MODALITIES_KEY);

        vm.prank(alice);
        registry.requestWithdrawal(MODALITIES_KEY);
        vm.warp(block.timestamp + COOLDOWN);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.NotRegisteredBy.selector, bob, alice));
        registry.withdraw(MODALITIES_KEY);
    }

    function test_withdrawal_revertsOnUnknownKey() public {
        bytes32 unknown = keccak256("never-existed");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.NotRegistered.selector, unknown));
        registry.requestWithdrawal(unknown);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.NotRegistered.selector, unknown));
        registry.withdraw(unknown);
    }

    function test_withdraw_revertsWhenPaymentRejected() public {
        // A registrant that cannot receive ETH: its code reverts on every call
        // (PUSH1 0 PUSH1 0 REVERT), so the payment's plain call returns false
        // and the claim reverts as a whole — the stake stays held and still
        // pending, rather than cleared against a payment that never landed.
        address rejecter = address(0x4E7EC7);
        vm.etch(rejecter, hex"60006000fd");
        vm.deal(rejecter, DEPOSIT);

        vm.prank(rejecter);
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);
        vm.prank(rejecter);
        registry.requestWithdrawal(MODALITIES_KEY);
        uint256 unlockAt = block.timestamp + COOLDOWN;
        vm.warp(unlockAt);

        vm.prank(rejecter);
        vm.expectRevert(ClauseRegistry.TransferFailed.selector);
        registry.withdraw(MODALITIES_KEY);

        assertEq(registry.releaseAt(MODALITIES_KEY), unlockAt, "still pending");
        assertEq(address(registry).balance, DEPOSIT);
    }

    function test_withdrawal_doesNotAllowReRegistration() public {
        // Permanence: requesting and claiming the stake does NOT release the
        // binding for re-registration.
        vm.prank(alice);
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);
        vm.prank(alice);
        registry.requestWithdrawal(MODALITIES_KEY);
        vm.warp(block.timestamp + COOLDOWN);
        vm.prank(alice);
        registry.withdraw(MODALITIES_KEY);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ClauseRegistry.AlreadyRegistered.selector, MODALITIES_KEY));
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, "ipfs://hijack");
    }

    function test_requestThenRegisterAnotherSpec() public {
        // A designer moves its stake from one spec to another by requesting
        // the withdrawal on the first key and registering the second. The
        // first binding stays permanent (its committed agreements are
        // untouched); it de-surfaces at the request.
        bytes32 first = keccak256(bytes('{"clauseId":"figaro-geolocation","version":2}'));
        bytes32 second = keccak256(bytes('{"clauseId":"figaro-geolocation","version":3}'));
        vm.startPrank(alice);
        registry.registerClause{value: DEPOSIT}(first, "ipfs://geo/a");
        registry.requestWithdrawal(first);
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

    // ── No mechanism self-declaration ────────────────────────────────

    /// The registry serves no `setMechanismClause(bytes32)`: the declaration was
    /// built for a retired design and nothing read its event. A call to the old
    /// selector finds no function and no fallback, so it reverts.
    function test_noMechanismSelfDeclaration() public {
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);

        vm.prank(mechanism);
        (bool ok,) = address(registry).call(abi.encodeWithSignature("setMechanismClause(bytes32)", MODALITIES_KEY));
        assertFalse(ok, "setMechanismClause is served");
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

    function test_noOwner_noActivateDeactivate() public {
        // ClauseRegistry has no owner and no way to deactivate a clause: an
        // ownership or activation call finds no function and no fallback, so
        // it fails, and a registered clause stays registered.
        vm.prank(alice);
        registry.registerClause{value: DEPOSIT}(MODALITIES_KEY, MODALITIES_URI);

        bytes[6] memory probes = [
            abi.encodeWithSignature("owner()"),
            abi.encodeWithSignature("transferOwnership(address)", alice),
            abi.encodeWithSignature("renounceOwnership()"),
            abi.encodeWithSignature("activate(bytes32)", MODALITIES_KEY),
            abi.encodeWithSignature("deactivate(bytes32)", MODALITIES_KEY),
            abi.encodeWithSignature("setActive(bytes32,bool)", MODALITIES_KEY, false)
        ];
        for (uint256 i = 0; i < probes.length; i++) {
            vm.prank(alice);
            (bool ok,) = address(registry).call(probes[i]);
            assertFalse(ok, "the registry answers an ownership or activation call");
        }
        assertTrue(registry.registered(MODALITIES_KEY), "the clause stays registered");
    }
}

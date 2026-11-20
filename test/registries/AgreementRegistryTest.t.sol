// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {AgreementRegistry} from "src/registries/AgreementRegistry.sol";

contract AgreementRegistryTest is Test {
    AgreementRegistry registry;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    bytes32 constant AGREEMENT_HASH = keccak256("canonical-agreement-clauses");
    string constant CONTENT_URI = "ipfs://QmAgreement";
    uint256 constant DEPOSIT = 0.001 ether;
    uint256 constant COOLDOWN = 28 days;

    function setUp() public {
        registry = new AgreementRegistry(DEPOSIT, COOLDOWN);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    // ── Registration — happy path ────────────────────────────────────────

    function test_registerAgreement_happy() public {
        vm.prank(alice);
        registry.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, CONTENT_URI);

        (address registeredBy, uint64 registeredAt, bool withdrawn, string memory uri) =
            registry.bindings(AGREEMENT_HASH);

        assertEq(registeredBy, alice);
        assertGt(registeredAt, 0);
        assertEq(withdrawn, false);
        assertEq(uri, CONTENT_URI);
        assertEq(address(registry).balance, DEPOSIT);
    }

    function test_registerAgreement_emitsEvent() public {
        vm.expectEmit(true, true, false, true, address(registry));
        emit AgreementRegistry.AgreementRegistered(AGREEMENT_HASH, alice, CONTENT_URI);

        vm.prank(alice);
        registry.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, CONTENT_URI);
    }

    // ── Registration — stake revert paths ───────────────────────────────

    function test_registerAgreement_revertsOnUnderpay() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AgreementRegistry.WrongDeposit.selector, DEPOSIT - 1, DEPOSIT));
        registry.registerAgreement{value: DEPOSIT - 1}(AGREEMENT_HASH, CONTENT_URI);
    }

    function test_registerAgreement_revertsOnOverpay() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AgreementRegistry.WrongDeposit.selector, DEPOSIT + 1 wei, DEPOSIT));
        registry.registerAgreement{value: DEPOSIT + 1 wei}(AGREEMENT_HASH, CONTENT_URI);
    }

    function test_registerAgreement_revertsOnZeroDeposit() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AgreementRegistry.WrongDeposit.selector, 0, DEPOSIT));
        registry.registerAgreement(AGREEMENT_HASH, CONTENT_URI);
    }

    // ── Registration — content revert paths ──────────────────────────────

    function test_registerAgreement_revertsOnDuplicateAgreement() public {
        // Identity is the composition: the same agreementHash cannot anchor
        // twice, regardless of who calls or which document URI they carry.
        vm.prank(alice);
        registry.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, "ipfs://A");

        vm.expectRevert(abi.encodeWithSelector(AgreementRegistry.AgreementAlreadyRegistered.selector, AGREEMENT_HASH));
        vm.prank(bob);
        registry.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, "ipfs://B");
    }

    function test_registerAgreement_revertsOnEmptyContentURI() public {
        vm.prank(alice);
        vm.expectRevert(AgreementRegistry.EmptyContentURI.selector);
        registry.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, "");
    }

    function test_registerAgreement_revertsOnZeroAgreementHash() public {
        vm.prank(alice);
        vm.expectRevert(AgreementRegistry.ZeroAgreementHash.selector);
        registry.registerAgreement{value: DEPOSIT}(bytes32(0), CONTENT_URI);
    }

    /// The two reserved format keys are constants of the agreement and
    /// assembly formats, never an agreement: a registration at either reverts.
    function test_registerAgreement_revertsOnTheReservedKeys() public {
        bytes32 provenance = keccak256("figaro-agreement-provenance");
        bytes32 terms = keccak256("figaro-assembly-terms");
        assertEq(registry.PROVENANCE_LEAF_KEY(), provenance);
        assertEq(registry.PROCESS_TERMS_LEAF_KEY(), terms);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AgreementRegistry.ReservedKeyIsNotARegistration.selector, provenance));
        registry.registerAgreement{value: DEPOSIT}(provenance, CONTENT_URI);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AgreementRegistry.ReservedKeyIsNotARegistration.selector, terms));
        registry.registerAgreement{value: DEPOSIT}(terms, CONTENT_URI);
    }

    // ── Permissionless ───────────────────────────────────────────────────

    function test_registerAgreement_permissionless() public {
        bytes32 aliceAgreement = keccak256("alice-agreement");
        bytes32 bobAgreement = keccak256("bob-agreement");

        vm.prank(alice);
        registry.registerAgreement{value: DEPOSIT}(aliceAgreement, "ipfs://A");

        vm.prank(bob);
        registry.registerAgreement{value: DEPOSIT}(bobAgreement, "ipfs://B");

        (address aliceRegisteredBy,,,) = registry.bindings(aliceAgreement);
        (address bobRegisteredBy,,,) = registry.bindings(bobAgreement);
        assertEq(aliceRegisteredBy, alice);
        assertEq(bobRegisteredBy, bob);
        assertEq(address(registry).balance, DEPOSIT * 2);
    }

    // ── Stake withdrawal: request, then claim after the cooldown ──────────

    function test_requestWithdrawal_flagsAtOnce_paysNothing_bindingStays() public {
        vm.prank(alice);
        registry.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, CONTENT_URI);

        uint256 balanceBefore = alice.balance;
        vm.prank(alice);
        registry.requestWithdrawal(AGREEMENT_HASH);

        // The stake stops counting as live at the request; the ETH stays.
        (,, bool withdrawn,) = registry.bindings(AGREEMENT_HASH);
        assertTrue(withdrawn, "withdrawn at the request");
        assertEq(alice.balance, balanceBefore, "nothing paid at the request");
        assertEq(address(registry).balance, DEPOSIT, "the stake stays locked");
        assertEq(registry.releaseAt(AGREEMENT_HASH), block.timestamp + COOLDOWN);
        assertFalse(registry.withdrawable(AGREEMENT_HASH));
    }

    function test_requestWithdrawal_emitsWithdrawalRequested() public {
        vm.prank(alice);
        registry.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, CONTENT_URI);

        vm.expectEmit(true, true, false, true, address(registry));
        emit AgreementRegistry.WithdrawalRequested(AGREEMENT_HASH, alice, DEPOSIT, block.timestamp + COOLDOWN);
        vm.prank(alice);
        registry.requestWithdrawal(AGREEMENT_HASH);
    }

    function test_withdraw_beforeCooldown_reverts() public {
        vm.prank(alice);
        registry.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, CONTENT_URI);
        vm.prank(alice);
        registry.requestWithdrawal(AGREEMENT_HASH);
        uint256 unlockAt = block.timestamp + COOLDOWN;

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AgreementRegistry.CooldownActive.selector, unlockAt));
        registry.withdraw(AGREEMENT_HASH);

        vm.warp(unlockAt - 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AgreementRegistry.CooldownActive.selector, unlockAt));
        registry.withdraw(AGREEMENT_HASH);
        assertEq(address(registry).balance, DEPOSIT, "no early release");
    }

    function test_withdraw_afterCooldown_paysOnce() public {
        vm.prank(alice);
        registry.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, CONTENT_URI);
        vm.prank(alice);
        registry.requestWithdrawal(AGREEMENT_HASH);

        vm.warp(block.timestamp + COOLDOWN);
        assertTrue(registry.withdrawable(AGREEMENT_HASH));
        uint256 balanceBefore = alice.balance;
        vm.expectEmit(true, true, false, true, address(registry));
        emit AgreementRegistry.DepositWithdrawn(AGREEMENT_HASH, alice, DEPOSIT);
        vm.prank(alice);
        registry.withdraw(AGREEMENT_HASH);

        assertEq(alice.balance, balanceBefore + DEPOSIT);
        assertEq(address(registry).balance, 0);
        assertEq(registry.releaseAt(AGREEMENT_HASH), 0);
        assertFalse(registry.withdrawable(AGREEMENT_HASH));

        vm.prank(alice);
        vm.expectRevert(AgreementRegistry.NothingPending.selector);
        registry.withdraw(AGREEMENT_HASH);
    }

    function test_withdraw_withoutRequest_reverts() public {
        vm.prank(alice);
        registry.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, CONTENT_URI);

        vm.prank(alice);
        vm.expectRevert(AgreementRegistry.NothingPending.selector);
        registry.withdraw(AGREEMENT_HASH);
    }

    function test_zeroCooldown_claimableInTheSameBlock() public {
        AgreementRegistry free = new AgreementRegistry(DEPOSIT, 0);
        vm.startPrank(alice);
        free.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, CONTENT_URI);
        free.requestWithdrawal(AGREEMENT_HASH);
        assertTrue(free.withdrawable(AGREEMENT_HASH));
        free.withdraw(AGREEMENT_HASH);
        vm.stopPrank();
        assertEq(address(free).balance, 0);
    }

    function test_requestWithdrawal_onlyOnce() public {
        vm.prank(alice);
        registry.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, CONTENT_URI);
        vm.prank(alice);
        registry.requestWithdrawal(AGREEMENT_HASH);

        vm.prank(alice);
        vm.expectRevert(AgreementRegistry.AlreadyWithdrawn.selector);
        registry.requestWithdrawal(AGREEMENT_HASH);
    }

    function test_withdrawal_registeredByOnly() public {
        vm.prank(alice);
        registry.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, CONTENT_URI);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(AgreementRegistry.NotRegisteredBy.selector, bob, alice));
        registry.requestWithdrawal(AGREEMENT_HASH);

        vm.prank(alice);
        registry.requestWithdrawal(AGREEMENT_HASH);
        vm.warp(block.timestamp + COOLDOWN);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(AgreementRegistry.NotRegisteredBy.selector, bob, alice));
        registry.withdraw(AGREEMENT_HASH);
    }

    function test_withdrawal_revertsOnUnknownKey() public {
        bytes32 unknown = keccak256("never-existed");
        vm.prank(alice);
        vm.expectRevert(AgreementRegistry.NotRegistered.selector);
        registry.requestWithdrawal(unknown);
        vm.prank(alice);
        vm.expectRevert(AgreementRegistry.NotRegistered.selector);
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
        registry.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, CONTENT_URI);
        vm.prank(rejecter);
        registry.requestWithdrawal(AGREEMENT_HASH);
        uint256 unlockAt = block.timestamp + COOLDOWN;
        vm.warp(unlockAt);

        vm.prank(rejecter);
        vm.expectRevert(AgreementRegistry.TransferFailed.selector);
        registry.withdraw(AGREEMENT_HASH);

        assertEq(registry.releaseAt(AGREEMENT_HASH), unlockAt, "still pending");
        assertEq(address(registry).balance, DEPOSIT);
    }

    function test_withdrawal_doesNotAllowReRegistration() public {
        // Permanence: requesting and claiming the stake does NOT release the
        // binding for re-registration.
        vm.prank(alice);
        registry.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, CONTENT_URI);
        vm.prank(alice);
        registry.requestWithdrawal(AGREEMENT_HASH);
        vm.warp(block.timestamp + COOLDOWN);
        vm.prank(alice);
        registry.withdraw(AGREEMENT_HASH);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(AgreementRegistry.AgreementAlreadyRegistered.selector, AGREEMENT_HASH));
        registry.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, "ipfs://hijack");
    }

    // ── No owner, no pause, no upgrade ───────────────────────────────

    function test_noOwner_noPauseNoUpgrade() public {
        // AgreementRegistry has no owner, no pause and no upgrade path: such a call
        // finds no function and no fallback, so it fails, and a registered
        // entry stays registered.
        vm.prank(alice);
        registry.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, CONTENT_URI);

        bytes[9] memory probes = [
            abi.encodeWithSignature("owner()"),
            abi.encodeWithSignature("transferOwnership(address)", alice),
            abi.encodeWithSignature("renounceOwnership()"),
            abi.encodeWithSignature("pause()"),
            abi.encodeWithSignature("unpause()"),
            abi.encodeWithSignature("paused()"),
            abi.encodeWithSignature("upgradeTo(address)", address(this)),
            abi.encodeWithSignature("upgradeToAndCall(address,bytes)", address(this), bytes("")),
            abi.encodeWithSignature("setDeposit(uint256)", 0)
        ];
        for (uint256 i = 0; i < probes.length; i++) {
            vm.prank(alice);
            (bool ok,) = address(registry).call(probes[i]);
            assertFalse(ok, "the registry answers an ownership, pause or upgrade call");
        }
        (address registeredBy,,,) = registry.bindings(AGREEMENT_HASH);
        assertEq(registeredBy, alice, "the agreement stays registered");
    }
}

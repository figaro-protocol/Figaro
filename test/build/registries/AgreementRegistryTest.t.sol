// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {AgreementRegistry} from "src/build/registries/AgreementRegistry.sol";

contract AgreementRegistryTest is Test {
    AgreementRegistry registry;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    bytes32 constant AGREEMENT_HASH = keccak256("canonical-agreement-clauses");
    string constant CONTENT_URI = "ipfs://QmAgreement";
    uint256 constant DEPOSIT = 0.001 ether;

    function setUp() public {
        registry = new AgreementRegistry(DEPOSIT);
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
        assertEq(registry.ASSEMBLY_TERMS_LEAF_KEY(), terms);

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

    // ── Stake withdrawal ─────────────────────────────────────────────────

    function test_withdrawDeposit_happy() public {
        vm.prank(alice);
        registry.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, CONTENT_URI);

        uint256 balanceBefore = alice.balance;
        vm.prank(alice);
        registry.withdrawDeposit(AGREEMENT_HASH);

        assertEq(alice.balance, balanceBefore + DEPOSIT);
        assertEq(address(registry).balance, 0);

        // Binding stays — only the withdrawn flag flips.
        (address registeredBy,, bool withdrawn, string memory uri) = registry.bindings(AGREEMENT_HASH);
        assertEq(registeredBy, alice, "registeredBy preserved after withdraw");
        assertEq(withdrawn, true);
        assertEq(uri, CONTENT_URI, "contentURI preserved after withdraw");
    }

    function test_withdrawDeposit_emitsEvent() public {
        vm.prank(alice);
        registry.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, CONTENT_URI);

        vm.expectEmit(true, true, false, true, address(registry));
        emit AgreementRegistry.DepositWithdrawn(AGREEMENT_HASH, alice, DEPOSIT);

        vm.prank(alice);
        registry.withdrawDeposit(AGREEMENT_HASH);
    }

    function test_withdrawDeposit_immediately() public {
        // No time lock: the stake is reclaimable at any time. The
        // round-trip is priced off-chain — a withdrawn agreement
        // de-surfaces from discovery (readers filter on the live stake).
        vm.prank(alice);
        registry.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, CONTENT_URI);

        vm.prank(alice);
        registry.withdrawDeposit(AGREEMENT_HASH);
    }

    function test_withdrawDeposit_revertsOnDoubleWithdraw() public {
        vm.prank(alice);
        registry.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, CONTENT_URI);

        vm.prank(alice);
        registry.withdrawDeposit(AGREEMENT_HASH);

        vm.prank(alice);
        vm.expectRevert(AgreementRegistry.AlreadyWithdrawn.selector);
        registry.withdrawDeposit(AGREEMENT_HASH);
    }

    function test_withdrawDeposit_revertsByNonRegisteredBy() public {
        vm.prank(alice);
        registry.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, CONTENT_URI);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(AgreementRegistry.NotRegisteredBy.selector, bob, alice));
        registry.withdrawDeposit(AGREEMENT_HASH);
    }

    function test_withdrawDeposit_revertsOnUnknownAgreement() public {
        vm.prank(alice);
        vm.expectRevert(AgreementRegistry.NotRegistered.selector);
        registry.withdrawDeposit(keccak256("never-existed"));
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
        registry.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, CONTENT_URI);

        vm.prank(rejecter);
        vm.expectRevert(AgreementRegistry.TransferFailed.selector);
        registry.withdrawDeposit(AGREEMENT_HASH);

        (,, bool withdrawn,) = registry.bindings(AGREEMENT_HASH);
        assertFalse(withdrawn);
        assertEq(address(registry).balance, DEPOSIT);
    }

    function test_withdrawDeposit_doesNotAllowReRegistration() public {
        // Permanence guarantee: once an agreement is bound, withdrawing the
        // stake does NOT release the binding for re-registration.
        vm.prank(alice);
        registry.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, CONTENT_URI);

        vm.prank(alice);
        registry.withdrawDeposit(AGREEMENT_HASH);

        // Bob tries to take over the agreement — must fail.
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(AgreementRegistry.AgreementAlreadyRegistered.selector, AGREEMENT_HASH));
        registry.registerAgreement{value: DEPOSIT}(AGREEMENT_HASH, "ipfs://hijack");
    }
}

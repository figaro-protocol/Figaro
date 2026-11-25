// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KeyRegistryTestBase} from "test/registries/KeyRegistryTestBase.sol";
import {AgreementRegistry} from "src/registries/AgreementRegistry.sol";

/// @notice `AgreementRegistry` under the tests every key registry shares
///         (`KeyRegistryTestBase`), with its own registration call, errors
///         and events, and the reserved keys only this registry refuses.
contract AgreementRegistryTest is KeyRegistryTestBase {
    function _r() internal view returns (AgreementRegistry) {
        return AgreementRegistry(registry);
    }

    function _deploy(uint256 deposit) internal override returns (address) {
        return address(new AgreementRegistry(deposit));
    }

    function _register(bytes32 key, string memory uri, uint256 value) internal override {
        _r().registerAgreement{value: value}(key, uri);
    }

    function _expectRegistered(bytes32 key, address registeredBy, string memory uri) internal override {
        vm.expectEmit(true, true, false, true, registry);
        emit AgreementRegistry.AgreementRegistered(key, registeredBy, uri);
    }

    function _expectWithdrawn(bytes32 key, address registeredBy, uint256 amount) internal override {
        vm.expectEmit(true, true, false, true, registry);
        emit AgreementRegistry.DepositWithdrawn(key, registeredBy, amount);
    }

    function _errAlreadyRegistered(bytes32 key) internal pure override returns (bytes memory) {
        return abi.encodeWithSelector(AgreementRegistry.AgreementAlreadyRegistered.selector, key);
    }

    function _errZeroKey() internal pure override returns (bytes memory) {
        return abi.encodeWithSelector(AgreementRegistry.ZeroAgreementHash.selector);
    }

    function _errWrongDeposit(uint256 provided, uint256 required) internal pure override returns (bytes memory) {
        return abi.encodeWithSelector(AgreementRegistry.WrongDeposit.selector, provided, required);
    }

    function _errEmptyContentURI() internal pure override returns (bytes memory) {
        return abi.encodeWithSelector(AgreementRegistry.EmptyContentURI.selector);
    }

    function _errNotRegistered() internal pure override returns (bytes memory) {
        return abi.encodeWithSelector(AgreementRegistry.NotRegistered.selector);
    }

    function _errNotRegisteredBy(address caller, address registeredBy) internal pure override returns (bytes memory) {
        return abi.encodeWithSelector(AgreementRegistry.NotRegisteredBy.selector, caller, registeredBy);
    }

    function _errAlreadyWithdrawn() internal pure override returns (bytes memory) {
        return abi.encodeWithSelector(AgreementRegistry.AlreadyWithdrawn.selector);
    }

    function _errTransferFailed() internal pure override returns (bytes memory) {
        return abi.encodeWithSelector(AgreementRegistry.TransferFailed.selector);
    }

    // ── What only this registry does ─────────────────────────────────

    /// The two reserved format keys are constants of the agreement and
    /// assembly formats, never an agreement: a registration at either reverts.
    function test_registerAgreement_revertsOnTheReservedKeys() public {
        bytes32 provenance = keccak256("figaro-agreement-provenance");
        bytes32 terms = keccak256("figaro-assembly-terms");
        assertEq(_r().PROVENANCE_LEAF_KEY(), provenance);
        assertEq(_r().PROCESS_TERMS_LEAF_KEY(), terms);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AgreementRegistry.ReservedKeyIsNotARegistration.selector, provenance));
        _register(provenance, CONTENT_URI, DEPOSIT);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AgreementRegistry.ReservedKeyIsNotARegistration.selector, terms));
        _register(terms, CONTENT_URI, DEPOSIT);
    }

    /// The registry never checks that an agreementHash is a merkle root over
    /// clauses: any nonzero key but the two reserved ones registers, and a
    /// reader recomputes the root from the document at contentURI.
    function testFuzz_registerAgreement_acceptsAnyKeyItDoesNotReserve(bytes32 key) public {
        vm.assume(key != bytes32(0));
        vm.assume(key != _r().PROVENANCE_LEAF_KEY() && key != _r().PROCESS_TERMS_LEAF_KEY());
        vm.prank(alice);
        _register(key, CONTENT_URI, DEPOSIT);
        (address registeredBy,,,) = _bindings(key);
        assertEq(registeredBy, alice, "a key that is no root of anything is bound");
    }
}

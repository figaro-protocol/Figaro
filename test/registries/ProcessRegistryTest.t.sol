// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {KeyRegistryTestBase} from "test/registries/KeyRegistryTestBase.sol";
import {ProcessRegistry} from "src/registries/ProcessRegistry.sol";

/// @notice `ProcessRegistry` under the tests every key registry shares
///         (`KeyRegistryTestBase`), with its own registration call, errors
///         and events. It reserves no key but zero.
contract ProcessRegistryTest is KeyRegistryTestBase {
    function _r() internal view returns (ProcessRegistry) {
        return ProcessRegistry(registry);
    }

    function _deploy(uint256 deposit) internal override returns (address) {
        return address(new ProcessRegistry(deposit));
    }

    function _register(bytes32 key, string memory uri, uint256 value) internal override {
        _r().registerProcess{value: value}(key, uri);
    }

    function _expectRegistered(bytes32 key, address registeredBy, string memory uri) internal override {
        vm.expectEmit(true, true, false, true, registry);
        emit ProcessRegistry.ProcessRegistered(key, registeredBy, uri);
    }

    function _expectWithdrawn(bytes32 key, address registeredBy, uint256 amount) internal override {
        vm.expectEmit(true, true, false, true, registry);
        emit ProcessRegistry.DepositWithdrawn(key, registeredBy, amount);
    }

    function _errAlreadyRegistered(bytes32 key) internal pure override returns (bytes memory) {
        return abi.encodeWithSelector(ProcessRegistry.ProcessAlreadyRegistered.selector, key);
    }

    function _errZeroKey() internal pure override returns (bytes memory) {
        return abi.encodeWithSelector(ProcessRegistry.ZeroProcessDesignHash.selector);
    }

    function _errWrongDeposit(uint256 provided, uint256 required) internal pure override returns (bytes memory) {
        return abi.encodeWithSelector(ProcessRegistry.WrongDeposit.selector, provided, required);
    }

    function _errEmptyContentURI() internal pure override returns (bytes memory) {
        return abi.encodeWithSelector(ProcessRegistry.EmptyContentURI.selector);
    }

    function _errNotRegistered() internal pure override returns (bytes memory) {
        return abi.encodeWithSelector(ProcessRegistry.NotRegistered.selector);
    }

    function _errNotRegisteredBy(address caller, address registeredBy) internal pure override returns (bytes memory) {
        return abi.encodeWithSelector(ProcessRegistry.NotRegisteredBy.selector, caller, registeredBy);
    }

    function _errAlreadyWithdrawn() internal pure override returns (bytes memory) {
        return abi.encodeWithSelector(ProcessRegistry.AlreadyWithdrawn.selector);
    }

    function _errTransferFailed() internal pure override returns (bytes memory) {
        return abi.encodeWithSelector(ProcessRegistry.TransferFailed.selector);
    }

    // ── What only this registry does ─────────────────────────────────

    /// The registry never checks that a processDesignHash is a merkle root
    /// over agreements: any nonzero key registers, and a reader recomputes
    /// the root from the document at contentURI. Zero is the one key it refuses.
    function testFuzz_registerProcess_acceptsAnyNonzeroKey(bytes32 key) public {
        vm.assume(key != bytes32(0));
        vm.prank(alice);
        _register(key, CONTENT_URI, DEPOSIT);
        (address registeredBy,,,) = _bindings(key);
        assertEq(registeredBy, alice, "a key that is no root of anything is bound");
    }
}

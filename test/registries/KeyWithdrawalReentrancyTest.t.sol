// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ClauseRegistry} from "src/registries/ClauseRegistry.sol";
import {AgreementRegistry} from "src/registries/AgreementRegistry.sol";
import {ProcessRegistry} from "src/registries/ProcessRegistry.sol";

/// @notice A registrant whose receive hook calls `withdrawDeposit` again,
///         from inside the stake's transfer. It records what the inner call
///         returned and lets the outer call finish, so the test reads both.
contract ReenteringRegistrant {
    address public immutable registry;
    bytes32 public key;
    uint256 public innerCalls;
    bool public innerSucceeded;
    bytes4 public innerSelector;

    constructor(address registry_) {
        registry = registry_;
    }

    function register(bytes4 registerSelector, bytes32 key_) external payable {
        key = key_;
        (bool ok,) = registry.call{value: msg.value}(abi.encodeWithSelector(registerSelector, key_, "ipfs://spec"));
        require(ok, "register failed");
    }

    function withdraw() external {
        (bool ok,) = registry.call(abi.encodeWithSignature("withdrawDeposit(bytes32)", key));
        require(ok, "outer withdraw failed");
    }

    receive() external payable {
        innerCalls++;
        (bool ok, bytes memory ret) = registry.call(abi.encodeWithSignature("withdrawDeposit(bytes32)", key));
        innerSucceeded = ok;
        if (ret.length >= 4) innerSelector = bytes4(ret);
    }
}

/// @notice A rival that registers a key and withdraws its stake inside one
///         call, so one transaction leaves the key bound and withdrawn.
contract KeyBurner {
    function burn(address registry, bytes4 registerSelector, bytes32 key) external payable {
        (bool ok,) = registry.call{value: msg.value}(abi.encodeWithSelector(registerSelector, key, "ipfs://burn"));
        require(ok, "register failed");
        (ok,) = registry.call(abi.encodeWithSignature("withdrawDeposit(bytes32)", key));
        require(ok, "withdraw failed");
    }

    receive() external payable {}
}

/// @notice The one-call stake withdrawal of the three key registries pays a
///         stake once, even to a registrant that calls back from inside the
///         transfer. Each registry sets its withdrawn flag before it sends
///         the tokens; these tests hold that order. A second registrant's
///         stake sits in the registry throughout, as what a drain would take.
contract KeyWithdrawalReentrancyTest is Test {
    uint256 internal constant STAKE = 0.01 ether;
    bytes32 internal constant KEY = keccak256("reentering registrant's key");
    bytes32 internal constant OTHER_KEY = keccak256("another registrant's key");
    address internal other = makeAddr("other registrant");

    function _run(address registry, bytes4 registerSelector, bytes4 alreadyWithdrawn) internal {
        vm.deal(other, STAKE);
        vm.prank(other);
        (bool ok,) = registry.call{value: STAKE}(abi.encodeWithSelector(registerSelector, OTHER_KEY, "ipfs://other"));
        assertTrue(ok, "the other registrant registers");

        ReenteringRegistrant attacker = new ReenteringRegistrant(registry);
        attacker.register{value: STAKE}(registerSelector, KEY);
        assertEq(registry.balance, 2 * STAKE, "the registry holds both stakes");

        attacker.withdraw();

        assertEq(attacker.innerCalls(), 1, "the receive hook ran once");
        assertFalse(attacker.innerSucceeded(), "the call from inside the transfer is refused");
        assertEq(attacker.innerSelector(), alreadyWithdrawn, "refused as already withdrawn");
        assertEq(address(attacker).balance, STAKE, "the registrant holds one stake");
        assertEq(registry.balance, STAKE, "the other registrant's stake stays in the registry");

        vm.prank(address(attacker));
        (bool again, bytes memory ret) = registry.call(abi.encodeWithSignature("withdrawDeposit(bytes32)", KEY));
        assertFalse(again, "a later withdrawal is refused");
        assertEq(bytes4(ret), alreadyWithdrawn, "refused as already withdrawn, after the transfer too");
    }

    function test_clauseRegistry_aWithdrawalFromInsideTheTransferIsRefused() public {
        ClauseRegistry registry = new ClauseRegistry(STAKE);
        _run(address(registry), ClauseRegistry.registerClause.selector, ClauseRegistry.AlreadyWithdrawn.selector);
    }

    function test_agreementRegistry_aWithdrawalFromInsideTheTransferIsRefused() public {
        AgreementRegistry registry = new AgreementRegistry(STAKE);
        _run(
            address(registry), AgreementRegistry.registerAgreement.selector, AgreementRegistry.AlreadyWithdrawn.selector
        );
    }

    function test_processRegistry_aWithdrawalFromInsideTheTransferIsRefused() public {
        ProcessRegistry registry = new ProcessRegistry(STAKE);
        _run(address(registry), ProcessRegistry.registerProcess.selector, ProcessRegistry.AlreadyWithdrawn.selector);
    }

    // ── A key burned for the price of gas (docs/DESIGN_DECISIONS.md § 41) ──

    /// A rival registers `KEY` and withdraws in one transaction: its stake
    /// comes back whole, the key stays bound for good and no one can register
    /// it again, and the designer escapes only by registering other bytes.
    function _burn(address registry, bytes4 registerSelector, bytes4 alreadyRegistered) internal {
        KeyBurner rival = new KeyBurner();
        vm.deal(address(this), 2 * STAKE);
        rival.burn{value: STAKE}(registry, registerSelector, KEY);
        assertEq(address(rival).balance, STAKE, "the rival ends with its stake back");
        assertEq(registry.balance, 0, "the registry holds nothing for the burned key");

        address designer = makeAddr("designer");
        vm.deal(designer, 2 * STAKE);
        vm.prank(designer);
        (bool ok, bytes memory ret) =
            registry.call{value: STAKE}(abi.encodeWithSelector(registerSelector, KEY, "ipfs://designer"));
        assertFalse(ok, "the designer cannot register the burned key");
        assertEq(ret, abi.encodeWithSelector(alreadyRegistered, KEY), "refused as already registered");

        vm.prank(address(rival));
        (ok, ret) = registry.call{value: 0}(abi.encodeWithSignature("withdrawDeposit(bytes32)", KEY));
        assertFalse(ok, "the rival cannot withdraw twice");

        vm.prank(designer);
        (ok,) = registry.call{value: STAKE}(abi.encodeWithSelector(registerSelector, OTHER_KEY, "ipfs://designer"));
        assertTrue(ok, "the designer registers the changed bytes' key");
        assertEq(registry.balance, STAKE, "and its stake is held");
    }

    function test_clauseRegistry_aKeyRegisteredAndWithdrawnInOneTransactionIsBurnedForEveryone() public {
        ClauseRegistry registry = new ClauseRegistry(STAKE);
        _burn(address(registry), ClauseRegistry.registerClause.selector, ClauseRegistry.AlreadyRegistered.selector);
    }

    function test_agreementRegistry_aKeyRegisteredAndWithdrawnInOneTransactionIsBurnedForEveryone() public {
        AgreementRegistry registry = new AgreementRegistry(STAKE);
        _burn(
            address(registry),
            AgreementRegistry.registerAgreement.selector,
            AgreementRegistry.AgreementAlreadyRegistered.selector
        );
    }

    function test_processRegistry_aKeyRegisteredAndWithdrawnInOneTransactionIsBurnedForEveryone() public {
        ProcessRegistry registry = new ProcessRegistry(STAKE);
        _burn(
            address(registry),
            ProcessRegistry.registerProcess.selector,
            ProcessRegistry.ProcessAlreadyRegistered.selector
        );
    }
}

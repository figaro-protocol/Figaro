// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";

/// @notice The two reads every key registry under this base shares, in one
///         shape: `AgreementRegistry` and `ProcessRegistry` each bind a key to
///         (registrant, time, withdrawn, content URI) and return its stake by
///         `withdrawDeposit(key)`.
interface IKeyBindings {
    function bindings(bytes32 key)
        external
        view
        returns (address registeredBy, uint64 registeredAt, bool depositWithdrawn, string memory contentURI);

    function withdrawDeposit(bytes32 key) external;
}

/// @title KeyRegistryTestBase — the tests `AgreementRegistry` and `ProcessRegistry` share
/// @notice The two registries are separate contracts by design, each with its
///         own registration function, errors and events. Their behavior on a
///         key is the same, so the tests of that behavior are written once,
///         here, and each registry's test contract supplies its own contract:
///         its registration call, and every error and event by the selector
///         and signature of THAT registry, so a shared test stays exact about
///         each registry's own errors and events. What one registry has and
///         the other lacks (`AgreementRegistry`'s reserved keys) stays in that
///         registry's own test contract.
abstract contract KeyRegistryTestBase is Test {
    address internal registry;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    bytes32 internal constant KEY = keccak256("a-registered-key");
    string internal constant CONTENT_URI = "ipfs://QmKey";
    uint256 internal constant DEPOSIT = 0.001 ether;

    // ── What each registry supplies ─────────────────────────────────

    /// @dev Deploys the registry under test at a registration stake of `deposit`.
    function _deploy(uint256 deposit) internal virtual returns (address);

    /// @dev Calls the registry's own registration function with `value` wei.
    function _register(bytes32 key, string memory uri, uint256 value) internal virtual;

    /// @dev Arms `vm.expectEmit` and emits the registry's own registration event.
    function _expectRegistered(bytes32 key, address registeredBy, string memory uri) internal virtual;

    /// @dev Arms `vm.expectEmit` and emits the registry's own withdrawal event.
    function _expectWithdrawn(bytes32 key, address registeredBy, uint256 amount) internal virtual;

    /// @dev The registry's own errors, encoded as it reverts with them.
    function _errAlreadyRegistered(bytes32 key) internal pure virtual returns (bytes memory);
    function _errZeroKey() internal pure virtual returns (bytes memory);
    function _errWrongDeposit(uint256 provided, uint256 required) internal pure virtual returns (bytes memory);
    function _errEmptyContentURI() internal pure virtual returns (bytes memory);
    function _errNotRegistered() internal pure virtual returns (bytes memory);
    function _errNotRegisteredBy(address caller, address registeredBy) internal pure virtual returns (bytes memory);
    function _errAlreadyWithdrawn() internal pure virtual returns (bytes memory);
    function _errTransferFailed() internal pure virtual returns (bytes memory);

    function setUp() public virtual {
        registry = _deploy(DEPOSIT);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function _bindings(bytes32 key) internal view returns (address, uint64, bool, string memory) {
        return IKeyBindings(registry).bindings(key);
    }

    // ── Registration — happy path ────────────────────────────────────────

    function test_register_happy() public {
        vm.prank(alice);
        _register(KEY, CONTENT_URI, DEPOSIT);

        (address registeredBy, uint64 registeredAt, bool withdrawn, string memory uri) = _bindings(KEY);
        assertEq(registeredBy, alice);
        assertGt(registeredAt, 0);
        assertEq(withdrawn, false);
        assertEq(uri, CONTENT_URI);
        assertEq(registry.balance, DEPOSIT);
    }

    function test_register_emitsEvent() public {
        _expectRegistered(KEY, alice, CONTENT_URI);
        vm.prank(alice);
        _register(KEY, CONTENT_URI, DEPOSIT);
    }

    // ── Registration — stake revert paths ───────────────────────────────

    function test_register_revertsOnUnderpay() public {
        vm.prank(alice);
        vm.expectRevert(_errWrongDeposit(DEPOSIT - 1, DEPOSIT));
        _register(KEY, CONTENT_URI, DEPOSIT - 1);
    }

    function test_register_revertsOnOverpay() public {
        vm.prank(alice);
        vm.expectRevert(_errWrongDeposit(DEPOSIT + 1 wei, DEPOSIT));
        _register(KEY, CONTENT_URI, DEPOSIT + 1 wei);
    }

    function test_register_revertsOnZeroDeposit() public {
        vm.prank(alice);
        vm.expectRevert(_errWrongDeposit(0, DEPOSIT));
        _register(KEY, CONTENT_URI, 0);
    }

    // ── Registration — content revert paths ──────────────────────────────

    function test_register_revertsOnDuplicateKey() public {
        // Identity is the key: the same key cannot anchor twice, regardless of
        // who calls or which document URI they carry.
        vm.prank(alice);
        _register(KEY, "ipfs://A", DEPOSIT);

        vm.expectRevert(_errAlreadyRegistered(KEY));
        vm.prank(bob);
        _register(KEY, "ipfs://B", DEPOSIT);
    }

    function test_register_revertsOnEmptyContentURI() public {
        vm.prank(alice);
        vm.expectRevert(_errEmptyContentURI());
        _register(KEY, "", DEPOSIT);
    }

    function test_register_revertsOnZeroKey() public {
        vm.prank(alice);
        vm.expectRevert(_errZeroKey());
        _register(bytes32(0), CONTENT_URI, DEPOSIT);
    }

    // ── Permissionless ───────────────────────────────────────────────────

    function test_register_permissionless() public {
        bytes32 aliceKey = keccak256("alice-key");
        bytes32 bobKey = keccak256("bob-key");

        vm.prank(alice);
        _register(aliceKey, "ipfs://A", DEPOSIT);
        vm.prank(bob);
        _register(bobKey, "ipfs://B", DEPOSIT);

        (address aliceRegisteredBy,,,) = _bindings(aliceKey);
        (address bobRegisteredBy,,,) = _bindings(bobKey);
        assertEq(aliceRegisteredBy, alice);
        assertEq(bobRegisteredBy, bob);
        assertEq(registry.balance, DEPOSIT * 2);
    }

    // ── Stake withdrawal ─────────────────────────────────────────────────

    function test_withdrawDeposit_happy() public {
        vm.prank(alice);
        _register(KEY, CONTENT_URI, DEPOSIT);

        uint256 balanceBefore = alice.balance;
        vm.prank(alice);
        IKeyBindings(registry).withdrawDeposit(KEY);

        assertEq(alice.balance, balanceBefore + DEPOSIT);
        assertEq(registry.balance, 0);

        // Binding stays — only the withdrawn flag flips.
        (address registeredBy,, bool withdrawn, string memory uri) = _bindings(KEY);
        assertEq(registeredBy, alice, "registeredBy preserved after withdraw");
        assertEq(withdrawn, true);
        assertEq(uri, CONTENT_URI, "contentURI preserved after withdraw");
    }

    function test_withdrawDeposit_emitsEvent() public {
        vm.prank(alice);
        _register(KEY, CONTENT_URI, DEPOSIT);

        _expectWithdrawn(KEY, alice, DEPOSIT);
        vm.prank(alice);
        IKeyBindings(registry).withdrawDeposit(KEY);
    }

    function test_withdrawDeposit_immediately() public {
        // No time lock: the stake is reclaimable at any time. The round-trip
        // is priced off-chain — a withdrawn key de-surfaces from discovery
        // (readers filter on the live stake).
        vm.prank(alice);
        _register(KEY, CONTENT_URI, DEPOSIT);
        uint256 aliceBefore = alice.balance;
        uint256 registryBefore = registry.balance;

        // Same block as the registration: no time passes.
        vm.prank(alice);
        IKeyBindings(registry).withdrawDeposit(KEY);

        assertEq(alice.balance - aliceBefore, DEPOSIT, "the registrant receives the deposit in full");
        assertEq(registryBefore - registry.balance, DEPOSIT, "the registry's balance falls by the deposit");
        (,, bool withdrawn,) = _bindings(KEY);
        assertTrue(withdrawn, "the binding reads as withdrawn");
    }

    function test_withdrawDeposit_revertsOnDoubleWithdraw() public {
        vm.prank(alice);
        _register(KEY, CONTENT_URI, DEPOSIT);
        vm.prank(alice);
        IKeyBindings(registry).withdrawDeposit(KEY);

        vm.prank(alice);
        vm.expectRevert(_errAlreadyWithdrawn());
        IKeyBindings(registry).withdrawDeposit(KEY);
    }

    function test_withdrawDeposit_revertsByNonRegisteredBy() public {
        vm.prank(alice);
        _register(KEY, CONTENT_URI, DEPOSIT);

        vm.prank(bob);
        vm.expectRevert(_errNotRegisteredBy(bob, alice));
        IKeyBindings(registry).withdrawDeposit(KEY);
    }

    function test_withdrawDeposit_revertsOnUnknownKey() public {
        vm.prank(alice);
        vm.expectRevert(_errNotRegistered());
        IKeyBindings(registry).withdrawDeposit(keccak256("never-existed"));
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
        _register(KEY, CONTENT_URI, DEPOSIT);

        vm.prank(rejecter);
        vm.expectRevert(_errTransferFailed());
        IKeyBindings(registry).withdrawDeposit(KEY);

        (,, bool withdrawn,) = _bindings(KEY);
        assertFalse(withdrawn);
        assertEq(registry.balance, DEPOSIT);
    }

    function test_withdrawDeposit_doesNotAllowReRegistration() public {
        // Permanence guarantee: once a key is bound, withdrawing the stake
        // does NOT release the binding for re-registration.
        vm.prank(alice);
        _register(KEY, CONTENT_URI, DEPOSIT);
        vm.prank(alice);
        IKeyBindings(registry).withdrawDeposit(KEY);

        // Bob tries to take over the key — must fail.
        vm.prank(bob);
        vm.expectRevert(_errAlreadyRegistered(KEY));
        _register(KEY, "ipfs://hijack", DEPOSIT);
    }

    // ── No owner, no pause, no upgrade ───────────────────────────────

    function test_noOwner_noPauseNoUpgrade() public {
        // The registry has no owner, no pause and no upgrade path: such a call
        // finds no function and no fallback, so it fails, and a registered
        // entry stays registered.
        vm.prank(alice);
        _register(KEY, CONTENT_URI, DEPOSIT);

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
            (bool ok,) = registry.call(probes[i]);
            assertFalse(ok, "the registry answers an ownership, pause or upgrade call");
        }
        (address registeredBy,,,) = _bindings(KEY);
        assertEq(registeredBy, alice, "the key stays registered");
    }
}

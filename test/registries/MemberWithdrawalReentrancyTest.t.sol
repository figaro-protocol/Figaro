// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {MembersRegistry} from "src/registries/MembersRegistry.sol";

/// @notice A member whose receive hook calls the registry again from inside
///         the stake's transfer: `withdraw` in one mode; in the other,
///         `register` with the stake just received and then `withdraw`. It
///         keeps what each inner call returned and lets the outer call finish,
///         so the test reads both.
contract ReenteringMember {
    MembersRegistry public immutable registry;
    bool public immutable reenterRegister;
    uint256 public innerCalls;
    bool public registerSucceeded;
    bool public withdrawSucceeded;
    bytes4 public withdrawSelector;

    constructor(MembersRegistry registry_, bool reenterRegister_) {
        registry = registry_;
        reenterRegister = reenterRegister_;
    }

    function register() external payable {
        registry.register{value: msg.value}("ipfs://member");
    }

    function requestWithdrawal() external {
        registry.requestWithdrawal();
    }

    function withdraw() external {
        registry.withdraw();
    }

    receive() external payable {
        innerCalls++;
        if (reenterRegister) {
            (registerSucceeded,) = address(registry).call{value: registry.registrationDeposit()}(
                abi.encodeCall(MembersRegistry.register, ("ipfs://member-again"))
            );
        }
        (bool ok, bytes memory ret) = address(registry).call(abi.encodeCall(MembersRegistry.withdraw, ()));
        withdrawSucceeded = ok;
        if (ret.length >= 4) withdrawSelector = bytes4(ret);
    }
}

/// @notice `MembersRegistry.withdraw` pays a pending stake once, even to a
///         member that calls back from inside the transfer. It clears
///         `pendingDeposit` and `releaseAt` before it sends the stake; these
///         tests hold that order. A second member's stake sits in the registry
///         throughout, as what a drain would take.
contract MemberWithdrawalReentrancyTest is Test {
    uint256 internal constant STAKE = 0.01 ether;
    uint256 internal constant COOLDOWN = 1 days;
    address internal other = makeAddr("other member");
    MembersRegistry internal registry;

    function setUp() public {
        registry = new MembersRegistry(STAKE, COOLDOWN);
        vm.deal(other, STAKE);
        vm.prank(other);
        registry.register{value: STAKE}("ipfs://other");
    }

    /// @dev Registers `member`, requests its withdrawal and waits out the
    ///      cooldown, so the next `withdraw` pays.
    function _pending(ReenteringMember member) internal {
        member.register{value: STAKE}();
        member.requestWithdrawal();
        vm.warp(block.timestamp + COOLDOWN);
        assertEq(address(registry).balance, 2 * STAKE, "the registry holds both stakes");
    }

    /// A `withdraw` from inside the transfer finds nothing pending and is
    /// refused; the member holds one stake, the other member's stays, and a
    /// later `withdraw` is refused too.
    function test_aWithdrawFromInsideTheTransferIsRefusedAndPaysNothing() public {
        ReenteringMember member = new ReenteringMember(registry, false);
        _pending(member);

        member.withdraw();

        assertEq(member.innerCalls(), 1, "the receive hook ran once");
        assertFalse(member.withdrawSucceeded(), "the withdraw from inside the transfer is refused");
        assertEq(member.withdrawSelector(), MembersRegistry.NothingPending.selector, "refused as nothing pending");
        assertEq(address(member).balance, STAKE, "the member holds one stake");
        assertEq(address(registry).balance, STAKE, "the other member's stake stays in the registry");
        assertEq(registry.pendingDeposit(address(member)), 0, "nothing pending");
        assertEq(registry.releaseAt(address(member)), 0, "no release time");

        vm.prank(address(member));
        vm.expectRevert(MembersRegistry.NothingPending.selector);
        registry.withdraw();
    }

    /// A `register` from inside the transfer is a fresh registration paid
    /// with the stake just received, since `requestWithdrawal` already cleared
    /// the member's registration. It succeeds, and the `withdraw` after it
    /// finds nothing pending: the new stake is live, not pending. The registry
    /// holds the new stake beside the other member's, and the new stake comes
    /// back only through a new request and a new cooldown.
    function test_aRegisterFromInsideTheTransferIsAFreshStakeAndPaysNothingTwice() public {
        ReenteringMember member = new ReenteringMember(registry, true);
        _pending(member);

        member.withdraw();

        assertEq(member.innerCalls(), 1, "the receive hook ran once");
        assertTrue(member.registerSucceeded(), "the registration from inside the transfer is taken");
        assertFalse(member.withdrawSucceeded(), "the withdraw after it is refused");
        assertEq(member.withdrawSelector(), MembersRegistry.NothingPending.selector, "refused as nothing pending");
        assertTrue(registry.registered(address(member)), "the member is registered again");
        assertEq(address(member).balance, 0, "the stake received went into the new registration");
        assertEq(address(registry).balance, 2 * STAKE, "the registry holds the new stake and the other member's");
        assertEq(registry.pendingDeposit(address(member)), 0, "nothing pending");
        assertEq(registry.releaseAt(address(member)), 0, "no release time");

        member.requestWithdrawal();
        vm.prank(address(member));
        vm.expectRevert(abi.encodeWithSelector(MembersRegistry.CooldownActive.selector, block.timestamp + COOLDOWN));
        registry.withdraw();
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "src/mocks/MockDisperse.sol";
import "src/mocks/MockERC20.sol";

/// @notice Recipient that rejects ETH — proves the batch is atomic.
contract EtherRejector {
    receive() external payable {
        revert("no");
    }
}

/// @title MockDisperseTest — interface/behavior parity with canonical Disperse.app
contract MockDisperseTest is Test {
    MockDisperse internal disperse;
    MockERC20 internal token;

    address internal sender = address(0xA11CE);
    address internal r1 = address(0xB0B1);
    address internal r2 = address(0xB0B2);

    function setUp() public {
        disperse = new MockDisperse();
        token = new MockERC20("Mock", "MOCK");
        token.mint(sender, 1_000 ether);
        vm.deal(sender, 1_000 ether);
    }

    function test_disperseEther_paysLegsAndRefundsRemainder() public {
        address[] memory to = new address[](2);
        to[0] = r1;
        to[1] = r2;
        uint256[] memory val = new uint256[](2);
        val[0] = 1 ether;
        val[1] = 2 ether;

        uint256 before = sender.balance;
        vm.prank(sender);
        disperse.disperseEther{value: 5 ether}(to, val); // 2 ether overpaid

        assertEq(r1.balance, 1 ether);
        assertEq(r2.balance, 2 ether);
        assertEq(sender.balance, before - 3 ether, "remainder refunded, canonical behavior");
        assertEq(address(disperse).balance, 0, "disperser never holds funds");
    }

    function test_disperseEther_atomic_rejectingRecipientRevertsWholeBatch() public {
        EtherRejector rejector = new EtherRejector();
        address[] memory to = new address[](2);
        to[0] = r1;
        to[1] = address(rejector);
        uint256[] memory val = new uint256[](2);
        val[0] = 1 ether;
        val[1] = 1 ether;

        uint256 before = sender.balance;
        vm.prank(sender);
        vm.expectRevert();
        disperse.disperseEther{value: 2 ether}(to, val);

        assertEq(r1.balance, 0, "no partial disperse");
        assertEq(sender.balance, before, "caller keeps everything on revert");
    }

    function test_disperseToken_aggregatePullThenLegs() public {
        address[] memory to = new address[](2);
        to[0] = r1;
        to[1] = r2;
        uint256[] memory val = new uint256[](2);
        val[0] = 10 ether;
        val[1] = 20 ether;

        vm.startPrank(sender);
        token.approve(address(disperse), 30 ether);
        disperse.disperseToken(IERC20(address(token)), to, val);
        vm.stopPrank();

        assertEq(token.balanceOf(r1), 10 ether);
        assertEq(token.balanceOf(r2), 20 ether);
        assertEq(token.balanceOf(sender), 970 ether);
        assertEq(token.balanceOf(address(disperse)), 0, "aggregate fully paid out");
    }

    function test_disperseTokenSimple_perLegPulls() public {
        address[] memory to = new address[](2);
        to[0] = r1;
        to[1] = r2;
        uint256[] memory val = new uint256[](2);
        val[0] = 5 ether;
        val[1] = 7 ether;

        vm.startPrank(sender);
        token.approve(address(disperse), 12 ether);
        disperse.disperseTokenSimple(IERC20(address(token)), to, val);
        vm.stopPrank();

        assertEq(token.balanceOf(r1), 5 ether);
        assertEq(token.balanceOf(r2), 7 ether);
        assertEq(token.balanceOf(address(disperse)), 0, "simple path never routes through the contract");
    }

    function test_disperseToken_atomic_insufficientAllowanceRevertsWholeBatch() public {
        address[] memory to = new address[](2);
        to[0] = r1;
        to[1] = r2;
        uint256[] memory val = new uint256[](2);
        val[0] = 10 ether;
        val[1] = 20 ether;

        vm.startPrank(sender);
        token.approve(address(disperse), 15 ether); // less than the 30 aggregate
        vm.expectRevert();
        disperse.disperseToken(IERC20(address(token)), to, val);
        vm.stopPrank();

        assertEq(token.balanceOf(r1), 0, "no partial disperse");
        assertEq(token.balanceOf(sender), 1_000 ether);
    }

    function test_lengthMismatch_revertsViaBoundsCheck() public {
        address[] memory to = new address[](2);
        to[0] = r1;
        to[1] = r2;
        uint256[] memory val = new uint256[](1);
        val[0] = 1 ether;

        vm.prank(sender);
        vm.expectRevert(); // canonical contract has no explicit check; OOB panics, batch reverts
        disperse.disperseEther{value: 1 ether}(to, val);
    }
}

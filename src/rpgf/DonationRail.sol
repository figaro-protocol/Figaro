// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title DonationRail — the no-custody donation event surface
/// @notice A rail, not an interceptor: `donate` moves the donor's tokens
///         STRAIGHT THROUGH to the recipient and emits the one event a match
///         formula consumes. There is no recipient registry — the recipient
///         set of a round is EMERGENT from these events (anyone donates to
///         any address), and a round's formula filters them by token and
///         window. The rail holds nothing, owns nothing, and gates nothing.
/// @dev    Strict-amount discipline (the house rule): the recipient must
///         receive exactly `amount` — fee-on-transfer or rebasing tokens
///         revert, because the emitted amount IS the formula's input and must
///         equal the value that moved. A self-donation moves nothing and
///         reverts on the same check.
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any
///      kind, express or implied. No liability is accepted for loss, damages,
///      or bugs. Use at your own risk.
contract DonationRail {
    using SafeERC20 for IERC20;

    error ZeroAmount();
    error ZeroRecipient();
    error DonationAmountMismatch(uint256 expected, uint256 received);

    /// @notice The match formula's input record: who signalled for whom, in
    ///         what token, with how much.
    event Donation(address indexed token, address indexed donor, address indexed recipient, uint256 amount);

    function donate(address token, address recipient, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroRecipient();
        uint256 balanceBefore = IERC20(token).balanceOf(recipient);
        IERC20(token).safeTransferFrom(msg.sender, recipient, amount);
        uint256 received = IERC20(token).balanceOf(recipient) - balanceBefore;
        if (received != amount) revert DonationAmountMismatch(amount, received);
        emit Donation(token, msg.sender, recipient, amount);
    }
}

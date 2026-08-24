// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title MockSwapVenue — devnet/test stand-in for a swap venue
/// @notice Mirrors the MockERC20 mock pattern. Swaps an input
///         token for an output token at a settable rate: pulls `amountIn` of
///         `tokenIn` from the caller (which must have approved this venue) and
///         sends the output to `recipient` from this contract's pre-funded
///         liquidity. The coordinator forwards
///         `abi.encodeCall(MockSwapVenue.swap, ...)` as opaque swap
///         calldata, exactly as it would forward SwapRouter02
///         `exactOutputSingle(...)` calldata in production — the coordinator is
///         venue-agnostic and only asserts the output-balance delta. Like the
///         production venue, this one pulls its input by ERC-20 allowance.
contract MockSwapVenue {
    uint256 public rateNumerator = 1;
    uint256 public rateDenominator = 1;

    /// @notice Set the swap rate: amountOut = amountIn * numerator / denominator.
    function setRate(uint256 numerator, uint256 denominator) external {
        require(denominator != 0, "denominator=0");
        rateNumerator = numerator;
        rateDenominator = denominator;
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, address recipient)
        external
        returns (uint256 amountOut)
    {
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        amountOut = (amountIn * rateNumerator) / rateDenominator;
        IERC20(tokenOut).transfer(recipient, amountOut);
    }
}

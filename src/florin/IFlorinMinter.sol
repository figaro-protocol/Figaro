// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IFlorinMinter
/// @dev DISCLAIMER: This interface is provided as-is, without warranty of any kind, express or implied. No liability is accepted for loss, damages, or bugs. Use at your own risk.
interface IFlorinMinter {
    function mint(address to, uint256 amount) external;
}

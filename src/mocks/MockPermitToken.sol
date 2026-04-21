// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockPermitToken
/// @notice Test ERC-20 that implements EIP-2612 permit(), nonces(), and DOMAIN_SEPARATOR().
///         Used to verify the permit-first approval flow in Figaro's *WithPermit entry points.
contract MockPermitToken is ERC20Permit {
    constructor() ERC20("Mock Permit Token", "MPMT") ERC20Permit("Mock Permit Token") {
        _mint(msg.sender, 1_000_000 ether);
    }

    /// @notice Permissionless mint for test setup.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockPermitToken
/// @notice Second devnet ERC-20 (EIP-2612-capable, incidental). Deployed by Deploy.s.sol as
///         NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS; used as the swap-funding input token and the
///         MOCKP seller-catalogue token.
contract MockPermitToken is ERC20Permit {
    constructor() ERC20("Mock Permit Token", "MPMT") ERC20Permit("Mock Permit Token") {
        _mint(msg.sender, 1_000_000 ether);
    }

    /// @notice Permissionless mint for test setup.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

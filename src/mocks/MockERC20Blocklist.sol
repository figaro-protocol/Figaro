// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice An ERC-20 with an issuer blocklist — the USDC shape. A transfer
///         from or to a blocked wallet reverts, so a blocked party's payout
///         leg reverts the whole resolution it sits in. Foundry tests only.
contract MockERC20Blocklist is ERC20 {
    mapping(address => bool) public blocked;

    error Blocked(address wallet);

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocked(address wallet, bool isBlocked) external {
        blocked[wallet] = isBlocked;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (blocked[from]) revert Blocked(from);
        if (blocked[to]) revert Blocked(to);
        super._update(from, to, value);
    }
}

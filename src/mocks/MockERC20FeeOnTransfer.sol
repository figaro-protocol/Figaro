// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Simple ERC20 that charges a 1 wei fee on `transferFrom` to simulate
/// fee-on-transfer tokens for testing rejection paths in `FigaroCore`.
contract MockERC20FeeOnTransfer is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @dev charge a 1 wei fee on transferFrom by transferring `amount - 1`.
    function transferFrom(address from, address to, uint256 amount) public virtual override returns (bool) {
        require(amount > 1, "Amount too small for fee");
        // perform reduced transfer to simulate on-transfer fee
        _transfer(from, to, amount - 1);
        // decrease allowance as normal
        uint256 currentAllowance = allowance(from, msg.sender);
        require(currentAllowance >= amount, "ERC20: transfer amount exceeds allowance");
        _approve(from, msg.sender, currentAllowance - amount);
        return true;
    }
}

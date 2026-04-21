// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Minimal ERC-20 used by Echidna campaigns and Foundry replays.
///      Extracted so coverage compilation can skip the full fuzzer harness.
contract EchidnaToken is ERC20, Ownable {
    constructor(address initialOwner) ERC20("Echidna Token", "ECH") Ownable(initialOwner) {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}

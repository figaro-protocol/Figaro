// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title MockDisperse — devnet stand-in for the canonical public multisender
/// @notice Mirrors the verified interface and behavior of Disperse.app
///         (`0xD152f549545093347A162Dce210e7293f1452150`, deployed 2018,
///         same address across 16 chains, no owner): `disperseEther` sends
///         each leg and refunds any remainder to the caller; `disperseToken`
///         pulls the total once then pays each leg; `disperseTokenSimple`
///         pulls each leg directly. Every batch is atomic — any failed leg
///         reverts the whole call. Mainnet composes the canonical deployment
///         (fifth noun — composition, not a Figaro-owned duplicate); this
///         mock exists only so devnet can rehearse that composition.
contract MockDisperse {
    function disperseEther(address[] calldata recipients, uint256[] calldata values) external payable {
        for (uint256 i = 0; i < recipients.length; i++) {
            payable(recipients[i]).transfer(values[i]);
        }
        uint256 balance = address(this).balance;
        if (balance > 0) {
            payable(msg.sender).transfer(balance);
        }
    }

    function disperseToken(IERC20 token, address[] calldata recipients, uint256[] calldata values) external {
        uint256 total = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            total += values[i];
        }
        require(token.transferFrom(msg.sender, address(this), total));
        for (uint256 i = 0; i < recipients.length; i++) {
            require(token.transfer(recipients[i], values[i]));
        }
    }

    function disperseTokenSimple(IERC20 token, address[] calldata recipients, uint256[] calldata values) external {
        for (uint256 i = 0; i < recipients.length; i++) {
            require(token.transferFrom(msg.sender, recipients[i], values[i]));
        }
    }
}

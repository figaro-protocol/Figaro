// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {FlorinToken} from "../florin/FlorinToken.sol";

/// @title Echidna property-based tests for FlorinToken
contract EchidnaFlorinToken {
    // Property: MAX_SUPPLY is never exceeded
    function echidna_max_supply_never_exceeded() public view returns (bool) {
        return token.totalSupply() <= token.MAX_SUPPLY();
    }

    // Property: Deployer can always renounce without revert
    function echidna_deployer_can_renounce() public returns (bool) {
        // Should never revert
        token.renounceDeployerMint();
        return true;
    }

    // Property: Deployer cannot mint after renouncing
    function echidna_deployer_cannot_mint_after_renounce() public returns (bool) {
        // Renounce deployer minting (idempotent)
        token.renounceDeployerMint();
        // Now minting as deployer should always fail
        (bool ok,) = address(token).call(abi.encodeWithSignature("mint(address,uint256)", deployer, 1 ether));
        return !ok;
    }

    // Property: Minter cannot exceed its cap
    function echidna_minter_cap_enforced() public returns (bool) {
        (uint256 cap, uint256 minted) = token.minters(address(this));
        if (minted < cap) {
            uint256 toMint = cap - minted;
            token.mint(deployer, toMint);
        }
        (, uint256 mintedAfter) = token.minters(address(this));
        return mintedAfter <= cap;
    }

    // Property: Cannot register zero address as minter
    function echidna_no_zero_address_minter() public returns (bool) {
        (bool ok,) =
            address(token).call(abi.encodeWithSignature("registerMinter(address,uint256)", address(0), 1 ether));
        return !ok;
    }

    // Property: Minting to zero address fails
    function echidna_no_mint_to_zero_address() public returns (bool) {
        (bool ok,) = address(token).call(abi.encodeWithSignature("mint(address,uint256)", address(0), 1 ether));
        return !ok;
    }
    FlorinToken public token;
    address public deployer = address(this);
    address public user1 = address(0xCAFE);
    address public user2 = address(0xF00D);

    constructor() {
        token = new FlorinToken();
        // Register this contract as a minter with a large cap
        token.registerMinter(address(this), 1_000_000_000 ether);
        // Mint some tokens to users for testing (deployer is msg.sender)
        token.mint(user1, 1_000_000 ether);
        token.mint(user2, 1_000_000 ether);
        // Approve this contract to transfer tokens on behalf of user1 and user2
        // (simulate user approval for fuzzing)
        token.approve(address(this), type(uint256).max);
    }

    // Property: Total supply always equals sum of all balances
    function echidna_total_supply_matches_balances() public view returns (bool) {
        uint256 total = token.balanceOf(deployer) + token.balanceOf(user1) + token.balanceOf(user2);
        return total == token.totalSupply();
    }

    // Property: Contract can mint and transfer its own tokens without violating supply
    function echidna_contract_transfer_preserves_supply() public returns (bool) {
        uint256 amount = uint256(keccak256(abi.encodePacked(block.timestamp, block.difficulty))) % 1_000_000 ether;
        uint256 supplyBefore = token.totalSupply();
        if (token.balanceOf(deployer) >= amount && amount > 0) {
            token.transfer(user1, amount);
        }
        return token.totalSupply() == supplyBefore;
    }

    // ---
}

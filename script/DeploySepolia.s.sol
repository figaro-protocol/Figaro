// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/console.sol";
import {DeployPublicStack} from "./DeployBase.s.sol";

/// @title DeploySepolia — Sepolia testnet rehearsal of the full Figaro stack
///
/// @notice The mainnet deployment (`DeployPublicStack`, script/DeployBase.s.sol)
///         with no divergence in what is deployed: the same contracts, order,
///         parameters, yearly schedule, 28-day cooldown and allocation, and the
///         treasury read from DAO_WALLET as mainnet reads it, a Safe that stands
///         on the chain before this script runs. The script deploys no mock.
///         scripts/deploy-sepolia.sh is the one way to run it.
///
///         Its one difference is in what it prints: the treasury address, once
///         after the minter is registered and once in the summary as
///         NEXT_PUBLIC_DAO_TREASURY, which scripts/deploy-sepolia.sh parses
///         into the record's `daoTreasury`.
contract DeploySepolia is DeployPublicStack {
    address internal _daoTreasury;

    /// @dev Sepolia prints the treasury it read: its wrapper records the
    ///      printed value (the mainnet wrapper records DAO_WALLET directly).
    function _logTreasury() internal override {
        _daoTreasury = vm.envAddress("DAO_WALLET");
        console.log("DAO_WALLET (treasury):  ", _daoTreasury);
    }

    function _logTreasurySummary() internal view override {
        console.log("  NEXT_PUBLIC_DAO_TREASURY=             ", _daoTreasury);
    }
}

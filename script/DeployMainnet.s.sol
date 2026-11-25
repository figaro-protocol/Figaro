// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DeployPublicStack} from "./DeployBase.s.sol";

/// @title DeployMainnet — Mainnet deployment of the full Figaro protocol stack
///
/// @notice Deploys all production contracts with no mocks: the deployment,
///         its schedule, its allocation and its parameters are
///         `DeployPublicStack` (script/DeployBase.s.sol), the one deployment
///         mainnet and Sepolia share. All security-sensitive inputs are read
///         from environment variables (listed there) so they can be verified
///         independently before broadcast; scripts/deploy-mainnet.sh is the
///         one way to run it.
///
///         Mainnet adds nothing to the shared deployment: it is the reference
///         every other chain's script is stated against.
contract DeployMainnet is DeployPublicStack {}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "src/mocks/MockERC20.sol";

/// @notice A second ERC-20 instance for the swap coordinator's scene: the
///         party's input token and the process's bond currency are two tokens,
///         and Certora links one contract per name.
contract MockERC20B is MockERC20 {
    constructor() MockERC20("Mock B", "MOCKB") {}
}

/// @notice The first instance, named so the conf can link it.
contract MockERC20A is MockERC20 {
    constructor() MockERC20("Mock A", "MOCKA") {}
}

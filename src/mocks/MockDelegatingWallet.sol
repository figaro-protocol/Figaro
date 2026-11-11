// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title MockDelegatingWallet — account code that delegates every call to an implementation (Foundry tests only)
/// @notice Stands in for the proxy most smart wallets are: the account's own
///         code holds no logic, DELEGATECALLs an implementation with the gas
///         it was given and hands back the implementation's answer or its
///         revert. A validation therefore runs one call frame below the
///         account, so when it runs out of gas the proxy still returns with
///         the 1/64 it kept (EIP-150), and its caller sees a failed call that
///         left more gas than a call that ran out in its own frame. A test
///         etches this code at a party's address over a `MockERC1271Wallet`
///         implementation; storage is the party's own. NEVER deploy this on a
///         real network.
contract MockDelegatingWallet {
    /// @notice The code every call is delegated to.
    address public immutable implementation;

    constructor(address implementation_) {
        implementation = implementation_;
    }

    fallback() external payable {
        address target = implementation;
        assembly {
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), target, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            if iszero(ok) { revert(0, returndatasize()) }
            return(0, returndatasize())
        }
    }
}

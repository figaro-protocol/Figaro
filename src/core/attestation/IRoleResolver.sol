// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IRoleResolver
/// @custom:audit-status UNAUDITED — This interface has not been reviewed by an independent security auditor.
/// @notice Authorization a seller address grants for attestations on its orders.
///
/// A seller is an ECDSA EOA, so it implements this only through EIP-7702 code
/// installed on its own address; whatever that code authorizes is the seller's
/// own act. No contract in this repository implements it.
interface IRoleResolver {
    /// @notice Returns true if `caller` is authorized to act on `orderHash`.
    /// @param orderHash The order commitment hash.
    /// @param caller    The address claiming authorization.
    function isAuthorized(bytes32 orderHash, address caller) external view returns (bool);
}

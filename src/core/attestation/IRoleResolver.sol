// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IRoleResolver
/// @custom:audit-status UNAUDITED — This interface has not been reviewed by an independent security auditor.
/// @notice Role-authorization interface for mechanism contracts.
///
/// Mechanism contracts implement this to let the AttestationCoordinator
/// verify that a caller is authorized for a given order without hard-coding
/// mechanism-specific role lookups.
interface IRoleResolver {
    /// @notice Returns true if `caller` is authorized to act on `orderHash`.
    /// @param orderHash The order commitment hash.
    /// @param caller    The address claiming authorization.
    function isAuthorized(bytes32 orderHash, address caller) external view returns (bool);
}

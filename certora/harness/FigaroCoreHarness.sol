// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "src/core/kernel/FigaroCore.sol";

/// @notice FigaroCore with one added pure view: the order hash exactly as
///         `commit` and `resolveProcess` compute it, so a Certora invariant can
///         quantify over an order's commitment (its preimage) without the spec
///         re-implementing the struct hash.
contract FigaroCoreHarness is FigaroCore {
    using CommitmentTypes for CommitmentTypes.Commitment;

    function orderHashOf(bytes32 processId, CommitmentTypes.Commitment calldata c) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(processId, c.hashStruct()));
    }
}

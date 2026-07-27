// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title CommitmentTypes — Enforcement-only commitment struct
/// @notice Defines the typed-data structure that both parties sign off-chain.
///         Fixed-size struct with 9 fields. No dynamic arrays.
library CommitmentTypes {
    /// @notice Parameters both parties agree to off-chain.
    ///
    /// @dev Root orders:
    ///      - processId = bytes32(0)
    ///      - expectedCumulativeValue = payment
    ///      The kernel derives processId as the EIP-712 digest.
    ///
    /// @dev Sub-orders:
    ///      - processId = target process
    ///      - expectedCumulativeValue = previousCumulative + payment
    ///        (contract-verified against the live accumulator)
    struct Commitment {
        bytes32 processId;
        address buyer;
        address seller;
        address currency;
        uint256 payment;
        uint256 expectedCumulativeValue;
        bytes32 agreementHash;
        uint256 salt;
        uint256 deadline;
    }

    bytes32 internal constant COMMITMENT_TYPEHASH = keccak256(
        "Commitment(bytes32 processId,address buyer,address seller,address currency,uint256 payment,uint256 expectedCumulativeValue,bytes32 agreementHash,uint256 salt,uint256 deadline)"
    );

    /// @notice Compute the EIP-712 struct hash for a Commitment.
    /// @dev Fixed-size struct — no dynamic array encoding needed.
    function hashStruct(Commitment memory c) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                COMMITMENT_TYPEHASH,
                c.processId,
                c.buyer,
                c.seller,
                c.currency,
                c.payment,
                c.expectedCumulativeValue,
                c.agreementHash,
                c.salt,
                c.deadline
            )
        );
    }
}

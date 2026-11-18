// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title CommitmentTypes — Enforcement-only commitment struct
/// @notice Defines the typed-data structure that both parties sign off-chain,
///         and the agreement format's one merkle leaf (`clauseLeaf`).
///         Fixed-size struct with 9 fields. No dynamic arrays.
library CommitmentTypes {
    /// @notice Parameters both parties agree to off-chain.
    ///
    /// @dev Root orders:
    ///      - processId = bytes32(0)
    ///      - runningTotal = payment
    ///      FigaroCore derives processId as the EIP-712 digest.
    ///
    /// @dev Sub-orders:
    ///      - processId = target process
    ///      - runningTotal = previousCumulative + payment
    ///        (contract-verified against the live accumulator)
    struct Commitment {
        bytes32 processId;
        address buyer;
        address seller;
        address token;
        uint256 payment;
        uint256 runningTotal;
        bytes32 checkoutHash;
        uint256 salt;
        uint256 commitDeadline;
    }

    bytes32 internal constant COMMITMENT_TYPEHASH = keccak256(
        "Commitment(bytes32 processId,address buyer,address seller,address token,uint256 payment,uint256 runningTotal,bytes32 checkoutHash,uint256 salt,uint256 commitDeadline)"
    );

    /// @notice The agreement format's leaf — one clause of the agreement a
    ///         commitment's `checkoutHash` is the merkle root over:
    ///         `keccak256(keccak256(key ‖ dataHash))`, the key a clause key or the
    ///         format's reserved provenance key, `dataHash` the keccak256 of the
    ///         clause's committed bytes. Double-hashed so a leaf (a 32-byte outer
    ///         preimage) never collides with an internal node (64 bytes). The one
    ///         definition `AttestationCoordinator` and `UsageCounter` open proofs
    ///         against, and the SDK's `computeClauseLeaf` builds. An assembly's
    ///         tree uses its own shape, with a domain, which the Core never builds.
    function clauseLeaf(bytes32 key, bytes32 dataHash) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encodePacked(key, dataHash))));
    }

    /// @notice Compute the EIP-712 struct hash for a Commitment.
    /// @dev Fixed-size struct — no dynamic array encoding needed.
    function hashStruct(Commitment memory c) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                COMMITMENT_TYPEHASH,
                c.processId,
                c.buyer,
                c.seller,
                c.token,
                c.payment,
                c.runningTotal,
                c.checkoutHash,
                c.salt,
                c.commitDeadline
            )
        );
    }
}

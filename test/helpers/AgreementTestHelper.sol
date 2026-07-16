// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgreementTestHelper
/// @notice Pure-function merkle helpers for building test agreements and their
///         inclusion proofs. Mirrors the off-chain
///         `frontend*/lib/core/agreement.ts` layout:
///           leaf_i = keccak256(clauseId_i || keccak256(sectionData_i))
///           root   = OZ-style sorted-pair merkle root over sorted leaves
///           proof  = sibling hashes walking the leaf up to the root
///         Used by AttestationCoordinator tests so each commitment's
///         `agreementHash` is a real merkle root and attestations can carry
///         valid inclusion proofs.
library AgreementTestHelper {
    /// @dev Compute the merkle leaf for one clause clause.
    function leafFor(bytes32 clauseId, bytes memory sectionData) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encodePacked(clauseId, keccak256(sectionData)))));
    }

    /// @dev Compute the agreement merkle root for an ordered list of leaves.
    ///      Leaves are sorted internally so the caller order doesn't matter.
    function rootFor(bytes32[] memory leaves) internal pure returns (bytes32) {
        if (leaves.length == 0) return bytes32(0);
        bytes32[] memory layer = _sorted(leaves);
        while (layer.length > 1) {
            layer = _nextLayer(layer);
        }
        return layer[0];
    }

    /// @dev Compute the inclusion proof for a leaf at position `unsortedIdx` in
    ///      the caller's `leaves` array. Returns the sibling-hash sequence
    ///      verifiable via OpenZeppelin `MerkleProof.verify`.
    function proofFor(bytes32[] memory leaves, uint256 unsortedIdx)
        internal
        pure
        returns (bytes32[] memory proof)
    {
        bytes32 target = leaves[unsortedIdx];
        bytes32[] memory layer = _sorted(leaves);
        uint256 idx = _indexOf(layer, target);

        // Size the proof array by walking the tree once.
        uint256 proofLen = 0;
        {
            bytes32[] memory scratch = _clone(layer);
            uint256 scratchIdx = idx;
            while (scratch.length > 1) {
                uint256 sib = scratchIdx % 2 == 0 ? scratchIdx + 1 : scratchIdx - 1;
                if (sib < scratch.length) proofLen++;
                scratch = _nextLayer(scratch);
                scratchIdx = scratchIdx / 2;
            }
        }

        proof = new bytes32[](proofLen);
        uint256 out = 0;
        while (layer.length > 1) {
            uint256 sib = idx % 2 == 0 ? idx + 1 : idx - 1;
            if (sib < layer.length) {
                proof[out++] = layer[sib];
            }
            layer = _nextLayer(layer);
            idx = idx / 2;
        }
    }

    /// @dev Convenience: for a single-section agreement (one clause clause),
    ///      the merkle root equals the leaf and the proof is empty.
    function singleSectionRoot(bytes32 clauseId, bytes memory sectionData) internal pure returns (bytes32) {
        return leafFor(clauseId, sectionData);
    }

    // ── internals ───────────────────────────────────────────────────────────

    function _nextLayer(bytes32[] memory layer) private pure returns (bytes32[] memory next) {
        uint256 nextLen = (layer.length + 1) / 2;
        next = new bytes32[](nextLen);
        for (uint256 i = 0; i < layer.length; i += 2) {
            next[i / 2] = (i + 1 < layer.length) ? _hashPair(layer[i], layer[i + 1]) : layer[i];
        }
    }

    function _hashPair(bytes32 a, bytes32 b) private pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function _sorted(bytes32[] memory arr) private pure returns (bytes32[] memory) {
        bytes32[] memory out = _clone(arr);
        // Insertion sort — small N in tests.
        for (uint256 i = 1; i < out.length; i++) {
            bytes32 key = out[i];
            uint256 j = i;
            while (j > 0 && out[j - 1] > key) {
                out[j] = out[j - 1];
                j--;
            }
            out[j] = key;
        }
        return out;
    }

    function _clone(bytes32[] memory arr) private pure returns (bytes32[] memory out) {
        out = new bytes32[](arr.length);
        for (uint256 i = 0; i < arr.length; i++) {
            out[i] = arr[i];
        }
    }

    function _indexOf(bytes32[] memory arr, bytes32 target) private pure returns (uint256) {
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] == target) return i;
        }
        revert("leaf not in tree");
    }
}

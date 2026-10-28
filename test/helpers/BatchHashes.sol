// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "src/core/verifier/FigaroBatchVerifier.sol";

/// @notice The four calldata hashes `FigaroBatchVerifier.settleBatch` checks
///         against public values 4–7, packed the way the guest's
///         `compute_*_hash` functions pack them (`prover/lib/src/kernel.rs`).
///         Built from `abi.encodePacked`, never from the contract's assembly,
///         so a slip in the contract's hand-rolled packing (a wrong offset, a
///         missing length prefix) shows up as a mismatch instead of being
///         mirrored. The byte-exact cross-language lock is
///         `FigaroBatchVerifierTest.test_packerHashes_matchTheRustVectors`.
library BatchHashes {
    /// @dev token(20) ‖ user(20) ‖ deposit(32) ‖ payout(32) per position.
    function positions(FigaroBatchVerifier.NetPosition[] memory ps) internal pure returns (bytes32) {
        bytes memory packed;
        for (uint256 i = 0; i < ps.length; i++) {
            packed = bytes.concat(packed, abi.encodePacked(ps[i].token, ps[i].user, ps[i].deposit, ps[i].payout));
        }
        return keccak256(packed);
    }

    /// @dev orderHash(32) ‖ processId(32) ‖ attester(20) ‖ clauseId(32) ‖ stage(1) ‖ contentRef(32).
    function attestations(FigaroBatchVerifier.AttestationData[] memory atts) internal pure returns (bytes32) {
        bytes memory packed;
        for (uint256 i = 0; i < atts.length; i++) {
            packed = bytes.concat(
                packed,
                abi.encodePacked(
                    atts[i].orderHash,
                    atts[i].processId,
                    atts[i].attester,
                    atts[i].clauseId,
                    atts[i].stage,
                    atts[i].contentRef
                )
            );
        }
        return keccak256(packed);
    }

    /// @dev clauseId(32) ‖ specHash(32) per binding.
    function bindings(FigaroBatchVerifier.SpecBinding[] memory bs) internal pure returns (bytes32) {
        bytes memory packed;
        for (uint256 i = 0; i < bs.length; i++) {
            packed = bytes.concat(packed, abi.encodePacked(bs[i].clauseId, bs[i].specHash));
        }
        return keccak256(packed);
    }

    /// @dev period(1) ‖ provenanceLeaf(32) ‖ len(8) ‖ [key(32) ‖ kind(1) ‖ processId(32) ‖ seller(20)]*.
    function usage(FigaroBatchVerifier.BatchUsageData memory u) internal pure returns (bytes32) {
        bytes memory packed = abi.encodePacked(u.period, u.provenanceLeaf, uint64(u.uses.length));
        for (uint256 i = 0; i < u.uses.length; i++) {
            packed = bytes.concat(
                packed,
                abi.encodePacked(u.uses[i].clauseOrAssembly, u.uses[i].kind, u.uses[i].processId, u.uses[i].seller)
            );
        }
        return keccak256(packed);
    }
}

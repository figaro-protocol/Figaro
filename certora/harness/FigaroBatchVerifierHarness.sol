// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "src/core/verifier/FigaroBatchVerifier.sol";

/// @notice FigaroBatchVerifier as Certora reads it: the contract unchanged,
///         plus two entry points that expose its own internal code.
///         `decodedRoots` decodes the two roots from a batch's public values
///         with the contract's own decoder, so `BatchVerifierStateRoot.spec`
///         can name what `settleBatch` read. `executePositions` runs the
///         contract's own `_executePositions`, the one step of `settleBatch`
///         that moves tokens, so `BatchVerifierTokenOps.spec` proves that step
///         alone.
contract FigaroBatchVerifierHarness is FigaroBatchVerifier {
    constructor(address _verifier, bytes32 _programVKey, address _clauseRegistry, address _usageCounter)
        FigaroBatchVerifier(_verifier, _programVKey, _clauseRegistry, _usageCounter)
    {}

    function decodedRoots(bytes calldata publicValues) external pure returns (bytes32 prevRoot, bytes32 newRoot) {
        DecodedPV memory pv = _decodePV(publicValues);
        return (pv.prevRoot, pv.newRoot);
    }

    function executePositions(NetPosition[] calldata positions) external {
        _executePositions(positions);
    }
}

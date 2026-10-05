// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "src/core/verifier/FigaroBatchVerifier.sol";

/// @notice FigaroBatchVerifier as Certora reads it for `BatchVerifierStateRoot.spec`:
///         the contract unchanged, plus one pure view that decodes the two
///         roots from a batch's public values with the contract's own
///         decoder, so a rule can name what `settleBatch` read.
contract FigaroBatchVerifierHarness is FigaroBatchVerifier {
    constructor(
        address _verifier,
        bytes32 _programVKey,
        address _clauseRegistry,
        address _usageCounter,
        bytes32 _initialRoot
    ) FigaroBatchVerifier(_verifier, _programVKey, _clauseRegistry, _usageCounter, _initialRoot) {}

    function decodedRoots(bytes calldata publicValues) external pure returns (bytes32 prevRoot, bytes32 newRoot) {
        DecodedPV memory pv = _decodePV(publicValues);
        return (pv.prevRoot, pv.newRoot);
    }
}

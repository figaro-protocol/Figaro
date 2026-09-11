// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "src/core/verifier/ISP1Verifier.sol";

/// @title MockSP1Verifier — Accepts any proof (devnet / Anvil testing only)
/// @notice Drop-in replacement for the real SP1 verifier gateway.
///         NEVER deploy this on a real network — it provides zero security.
contract MockSP1Verifier is ISP1Verifier {
    error InvalidProof();

    /// @notice When set, every proof is rejected — so a test can show that the
    ///         verifier's proof check is what stands between a batch and the state root.
    bool public rejectProofs;

    constructor() {
        require(block.chainid == 31337, "MockSP1Verifier: Anvil only");
    }

    function setRejectProofs(bool reject) external {
        rejectProofs = reject;
    }

    /// @notice Succeeds unless `rejectProofs` is set. Does not validate proof bytes.
    function verifyProof(
        bytes32,
        /* programVKey */
        bytes calldata,
        /* publicValues */
        bytes calldata /* proofBytes */
    )
        external
        view
        override
    {
        if (rejectProofs) revert InvalidProof();
    }
}

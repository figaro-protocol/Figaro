// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "../interfaces/ISP1Verifier.sol";

/// @title MockSP1Verifier — Accepts any proof (devnet / Anvil testing only)
/// @notice Drop-in replacement for the real SP1 verifier gateway.
///         NEVER deploy this on a real network — it provides zero security.
contract MockSP1Verifier is ISP1Verifier {
    constructor() {
        require(block.chainid == 31337, "MockSP1Verifier: Anvil only");
    }

    /// @notice Always succeeds. Does not validate proof bytes.
    function verifyProof(
        bytes32,
        /* programVKey */
        bytes calldata,
        /* publicValues */
        bytes calldata /* proofBytes */
    )
        external
        pure
        override
    {
        // Accept everything — mock only.
    }
}

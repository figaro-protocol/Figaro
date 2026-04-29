// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title MockKlerosArbitrator — Returns a fixed arbitration cost (devnet / Anvil only)
/// @notice Stand-in for Kleros's KlerosLiquid / KlerosCore arbitrator on private
///         testnets where the real Kleros stack isn't deployed. The
///         `arbitrationCost` getter returns a deterministic small value so the
///         dispute UI can render a deposit estimate; no real arbitration happens.
/// @dev    Used only by `MockKlerosArbitrableProxy`. Never deploy on a real chain
///         — the constructor reverts unless `block.chainid == 31337`. To run on
///         a different testnet, change the chainid guard intentionally.
contract MockKlerosArbitrator {
    /// @notice Fixed arbitration cost the mock returns. 0.01 ETH is small
    ///         enough to be cheap on testnet ETH but non-zero so the UI's
    ///         "deposit estimate" displays a realistic-looking number.
    uint256 public constant MOCK_ARBITRATION_COST = 0.01 ether;

    error MockOnlyOnAnvil();

    constructor() {
        if (block.chainid != 31337) revert MockOnlyOnAnvil();
    }

    /// @notice Mirrors the Kleros arbitrator interface.
    /// @dev    Ignores `extraData`; real Kleros computes per-subcourt cost.
    ///         Mock returns the same value for every subcourt so the UI's
    ///         "auto-recompute on subcourt change" behavior is observable
    ///         (returns the same number, but the call still happens).
    function arbitrationCost(
        bytes calldata /* extraData */
    )
        external
        pure
        returns (uint256)
    {
        return MOCK_ARBITRATION_COST;
    }
}

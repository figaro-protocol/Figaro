// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IRpgfArbitrator — the composed bond-settlement forum seam
/// @notice Minimal, provider-agnostic dispute seam for RpgfMinter bond cases.
///         The minter never lets a forum decide whether a mint happens — a
///         challenged root is ALWAYS void, and only a root that survives a
///         full unchallenged window mints. The forum decides one objective,
///         money-only question: which side of a bond case was right about a
///         deterministic recompute, so the loser's bond pays the winner.
///         Any arbitration provider (Kleros via an adapter contract, a
///         bespoke panel, a devnet mock) implements this one function and
///         calls `rule` back on the minter. The forum choice is deployment
///         config, never protocol code.
/// @dev DISCLAIMER: This interface is provided as-is, without warranty of any
///      kind, express or implied. No liability is accepted for loss, damages,
///      or bugs. Use at your own risk.
interface IRpgfArbitrator {
    /// @notice Open a dispute for a minter bond case. `msg.value` carries the
    ///         arbitration fee (provider-defined; a mock may accept zero).
    /// @param caseId The RpgfMinter bond-case index the ruling will target.
    function createDispute(uint256 caseId) external payable;
}

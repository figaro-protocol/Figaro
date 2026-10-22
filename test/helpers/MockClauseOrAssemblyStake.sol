// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Test double for the designer-side stake gate `UsageCounter` reads —
///         it implements both the `ClauseRegistry.depositOf` and the
///         `AssemblyRegistry.bindings` / `AgreementRegistry.bindings` shapes (the
///         last two are one shape), so one instance can stand in for any of the
///         three registries. Every key is LIVE by default, so a counting test
///         need not register anything; `kill(key)` marks one un-live to
///         exercise the `ClauseAgreementOrAssemblyNotRegistered` gate. This keeps the
///         counter's counting properties isolated from real registration
///         mechanics, exactly as `batchVerifier` is a plain EOA in the suite.
contract MockClauseOrAssemblyStake {
    /// @dev Keys explicitly marked un-live (withdrawn / never registered).
    mapping(bytes32 => bool) public dead;

    address public constant STAKER = address(0x5742E);

    function kill(bytes32 clauseOrAssembly) external {
        dead[clauseOrAssembly] = true;
    }

    /// @dev `ClauseRegistry.depositOf` shape.
    function depositOf(bytes32 clauseKey) external view returns (address registeredBy, bool withdrawn) {
        if (dead[clauseKey]) return (address(0), false);
        return (STAKER, false);
    }

    /// @dev `AssemblyRegistry.bindings` / `AgreementRegistry.bindings` shape.
    function bindings(bytes32 assemblyHash)
        external
        view
        returns (address registeredBy, uint64 registeredAt, bool depositWithdrawn, string memory contentURI)
    {
        if (dead[assemblyHash]) return (address(0), 0, false, "");
        return (STAKER, 1, false, "");
    }
}

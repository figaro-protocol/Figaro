// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Test double for the CLAUSE-OR-ASSEMBLY-side stake gate `UsageCounter`
///         reads — it implements both the `ClauseRegistry.depositOf` and the
///         `AssemblyRegistry.bindings` shapes, so one instance can stand in for
///         either registry (or both). Every key is LIVE by default, so a
///         counting test need not register anything; `kill(clauseOrAssembly)`
///         marks one un-live to exercise the `ClauseOrAssemblyNotRegistered`
///         gate. This keeps the counter's counting properties isolated from real
///         registration mechanics, exactly as `batchVerifier` is a plain EOA in
///         the suite.
contract MockClauseOrAssemblyStake {
    /// @dev Clauses and assemblies explicitly marked un-live (withdrawn / never
    ///      registered).
    mapping(bytes32 => bool) public dead;

    address public constant STAKER = address(0x5742E);

    function kill(bytes32 clauseOrAssembly) external {
        dead[clauseOrAssembly] = true;
    }

    /// @dev `ClauseRegistry.depositOf` shape.
    function depositOf(bytes32 idHash) external view returns (address registrar, bool withdrawn) {
        if (dead[idHash]) return (address(0), false);
        return (STAKER, false);
    }

    /// @dev `AssemblyRegistry.bindings` shape.
    function bindings(bytes32 compositionHash)
        external
        view
        returns (address author, uint64 registeredAt, bool depositWithdrawn, string memory contentURI)
    {
        if (dead[compositionHash]) return (address(0), 0, false, "");
        return (STAKER, 1, false, "");
    }
}

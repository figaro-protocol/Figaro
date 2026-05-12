// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title IAssemblyValidator
/// @notice Per-assembly-class content validator. Implementations are deployed
///         once per assembly class (e.g. "direct-sale-v1", "local-commerce-v1")
///         and registered via `AssemblyRegistry.setValidator(classId, validator)`.
///         Each validator knows the exact ABI-encoded shape of a manifest for
///         ONE assembly class.
///
/// @dev Parallel to `ISchemaValidator` but bound to assembly classes rather
///      than schemas. The two artifact families (schemas vs assemblies) have
///      their own registries and validator interfaces per the protocol's
///      separation-of-concerns doctrine.
///
/// @dev Call convention: `content` is ABI-encoded per the assembly class's
///      manifest tuple. Clients encode with `abi.encode(...)`; validators
///      decode with `abi.decode(content, (...))`. No on-chain JSON parsing.
///      The canonical manifest spec lives off-chain (IPFS via the
///      AssemblyRegistry binding's `metadataURI`); the on-chain validator
///      and off-chain client both derive the ABI tuple shape from it.
///
/// @dev Validators MUST be pure — no external state reads, no external
///      calls, no use of `block.*` / `tx.*`. The interface declares
///      `validate` as `external view` (not `pure`) to keep parameterized
///      test-mock validators compilable; production validators MUST declare
///      their `validate` override as `external pure override`.
///
/// @dev Validators MUST revert on invalid content; on valid content they
///      simply return. A successful `staticcall` is a valid manifest; a
///      revert is invalid.
///
/// @dev First-write-wins registration in AssemblyRegistry: once a validator
///      is bound to a classId, it cannot be replaced. This preserves the
///      "no admin" invariant and prevents a rug where a permissive validator
///      is swapped in after assemblies are registered.
interface IAssemblyValidator {
    /// @notice Validate `content` against the assembly class identified by
    ///         `classId`. Reverts on invalid content; returns silently on
    ///         valid content.
    /// @param classId  The assembly class this validator handles. Must match
    ///                 the validator's bound classId.
    /// @param content  ABI-encoded manifest bytes per the class's encoding.
    function validate(bytes32 classId, bytes calldata content) external view;

    /// @notice The exact assembly class this validator is bound to.
    /// @dev Allows callers and registries to verify binding before accepting
    ///      a validator for a given class.
    function assemblyClassId() external view returns (bytes32);
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title ISchemaValidator
/// @notice Per-schema content validator. Implementations are deployed once
///         per schema-id and registered via an optional registry (e.g. a
///         `setValidator(schemaId, validator)` extension on
///         AttestationCoordinator). Each validator knows the exact shape
///         of content for ONE schema.
///
/// @dev The call convention for `content` is ABI-encoded per-schema tuple —
///      clients encode with `abi.encode(...)` matching the schema's field
///      order, validators decode with `abi.decode(content, (...))`. This
///      avoids on-chain JSON parsing. The canonical JSON spec lives
///      off-chain (IPFS via SchemaRegistry.uriHash); the on-chain validator
///      and off-chain client both derive the ABI tuple shape from it.
///
/// @dev Validators MUST be pure — no external state reads, no external
///      calls, no use of `block.*` / `tx.*` / msg.value / chainid. Reading
///      external state would make validation non-deterministic across calls
///      with the same `(schemaId, stage, sectionData, content)`, breaking
///      attestation reproducibility for indexers and downstream consumers.
///
///      The interface declares `validate` as `external view` (not `pure`)
///      to keep parameterized test-mock validators compilable — Solidity
///      treats reads of `immutable` constructor-set values as `view`, so a
///      mock that takes `schemaId` as a constructor argument requires `view`.
///      Production validators MUST declare their `validate` override as
///      `external pure override` — the EVM then enforces purity at the
///      runtime dispatch site (any state read reverts via STATICCALL).
///
///      All 14 production validators in `src/schemaValidators/` declare
///      `external pure override`. Any new third-party validator that uses
///      the looser `view` shape forfeits the EVM-enforced determinism
///      guarantee — review carefully before binding via `setValidator`.
///
///      Validators MUST revert on invalid content; on valid content they
///      simply return. This keeps the call convention simple: a successful
///      `staticcall` is a valid content; a revert is invalid.
///
/// @dev First-write-wins registration (when wired into AttestationCoordinator):
///      once a validator is registered for a schemaId, it cannot be changed.
///      This preserves the "no admin" invariant and prevents a rug where a
///      permissive validator is swapped in after attestations are recorded.
interface ISchemaValidator {
    /// @notice Validate `content` against the schema identified by `schemaId`
    ///         at lifecycle `stage`. Reverts on invalid content; returns
    ///         silently on valid content.
    /// @param schemaId    The schema this validator handles. Must match the
    ///                    validator's bound schemaId (implementations may
    ///                    revert if mismatched).
    /// @param stage       Lifecycle stage (matches AttestationCoordinator.stage).
    /// @param sectionData ABI-encoded or JSON-canonical bytes of the
    ///                    committed agreement clause for this schema. May be
    ///                    empty if the caller is not proving section inclusion
    ///                    (e.g. on a legacy test path). The AttestationCoordinator
    ///                    is responsible for cryptographic binding between
    ///                    `sectionData` and the signed `agreementHash` via a
    ///                    merkle inclusion proof. Validators receive `sectionData`
    ///                    so they can cross-check that runtime `content`'s
    ///                    immutable fields match what was committed at contract-
    ///                    signing time. Schema-specific cross-check logic is
    ///                    additive: a validator MAY ignore `sectionData` (format
    ///                    checks on `content` alone) if it has no committed
    ///                    parameters to cross-check.
    /// @param content     ABI-encoded content bytes per the schema's encoding.
    function validate(bytes32 schemaId, uint8 stage, bytes calldata sectionData, bytes calldata content) external view;

    /// @notice The exact schemaId this validator is bound to.
    /// @dev Allows callers and registries to verify binding before accepting
    ///      a validator for a given schema.
    function schemaId() external view returns (bytes32);
}

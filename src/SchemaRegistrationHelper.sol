// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "./SchemaRegistry.sol";
import "./AttestationCoordinator.sol";

/// @title SchemaRegistrationHelper — Atomic schema-register + validator-bind
/// @custom:security-contact security@figaro.org
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice Combines `SchemaRegistry.registerSchema` + `AttestationCoordinator.setValidator`
///         into a single transaction. Closes the front-running window between
///         the two writes for non-bootstrap schemas — the M-1 finding from the
///         2026-04-26 Web3 normal-pass audit (see `docs/v5/SECURITY_AUDIT_AI.md`).
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any kind, express or implied. No liability is accepted for loss, damages, or bugs. Use at your own risk.
///
///         Why a helper contract instead of a method on AttestationCoordinator:
///         per DESIGN_DECISIONS.md #13, the kernel-discipline framing prefers
///         keeping `SchemaRegistry` and `AttestationCoordinator` as independently
///         addressable primitives. The helper is opt-in syntactic sugar — schema
///         authors who want atomic register+bind use it; those who don't can
///         still call the two primitives separately. Neither AC nor SchemaRegistry
///         gains a dependency on the other; both remain canonical-purpose.
///
///         No state, no admin, no fee. Anyone can call. The helper has no
///         privileges over its target contracts — both `registerSchema` and
///         `setValidator` are permissionless on the underlying contracts, so
///         the helper is just composing two public calls atomically.
///
///         Bootstrap-time atomicity (the 14 reference figaro-* validators)
///         remains via `script/Deploy.s.sol:_deployAndRegisterValidators` —
///         the deploy script bundles the two writes inline within a single
///         broadcast transaction. The helper is for post-deploy schema authors.
///
///         Behavioral note: when a schema is registered through the helper, the
///         `SchemaRegistered` event records the helper's address as the
///         `registrar`, not the calling user's address. Schema authors who
///         want to be on record as the registrar (e.g., for off-chain
///         provenance / discovery) should call `SchemaRegistry.registerSchema`
///         directly — this trades atomicity for registrar-identity. The
///         atomic-bind property protects against malicious-validator
///         front-running; the registrar-identity property is informational.
contract SchemaRegistrationHelper {
    /// @notice The canonical SchemaRegistry this helper writes to.
    SchemaRegistry public immutable schemaRegistry;
    /// @notice The canonical AttestationCoordinator this helper binds validators on.
    AttestationCoordinator public immutable attestationCoordinator;

    error ZeroAddress();

    constructor(address _schemaRegistry, address _attestationCoordinator) {
        if (_schemaRegistry == address(0)) revert ZeroAddress();
        if (_attestationCoordinator == address(0)) revert ZeroAddress();
        schemaRegistry = SchemaRegistry(_schemaRegistry);
        attestationCoordinator = AttestationCoordinator(_attestationCoordinator);
    }

    /// @notice Register a new schema in SchemaRegistry AND bind its validator
    ///         in AttestationCoordinator atomically — both writes happen in
    ///         the same transaction, so no front-runner can capture the
    ///         validator binding between them.
    /// @param schemaId  keccak256 of the human-readable schema name.
    /// @param version   Schema version number (passed through to SchemaRegistry).
    /// @param uriHash   keccak256 of the off-chain spec URI.
    /// @param validator Address of the deployed `ISchemaValidator` contract for `schemaId`.
    /// @dev Reverts on any of the underlying contract reverts:
    ///      - `SchemaRegistry.AlreadyRegistered(schemaId)` if schema is already registered
    ///      - `SchemaRegistry.ZeroUriHash()` if uriHash is zero
    ///      - `AttestationCoordinator.ZeroValidator()` if validator is zero
    ///      - `AttestationCoordinator.ValidatorAlreadySet(schemaId)` if a binding already exists
    ///      - `AttestationCoordinator.InvalidValidatorBinding(schemaId, ...)` on schemaId mismatch
    ///      Solidity transaction semantics guarantee atomicity: any revert in the
    ///      second call rolls back the first call (and vice versa).
    function registerSchemaAndValidator(bytes32 schemaId, uint64 version, bytes32 uriHash, address validator) external {
        schemaRegistry.registerSchema(schemaId, version, uriHash);
        attestationCoordinator.setValidator(schemaId, validator);
    }
}

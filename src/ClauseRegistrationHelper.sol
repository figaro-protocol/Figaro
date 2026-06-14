// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "./ClauseRegistry.sol";
import "./AttestationCoordinator.sol";

/// @title ClauseRegistrationHelper — Atomic clause-register + validator-bind
/// @custom:security-contact security@figaro.org
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice Combines `ClauseRegistry.registerClause` + `AttestationCoordinator.setValidator`
///         into a single transaction. Closes the front-running window between
///         the two writes for non-bootstrap clauses — the M-1 finding from the
///         2026-04-26 Web3 normal-pass audit (see `docs/v5/AUDIT_REPORT.md`
///         §"AI Audit Pass — 2026-04-26").
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any kind, express or implied. No liability is accepted for loss, damages, or bugs. Use at your own risk.
///
///         Why a helper contract instead of a method on AttestationCoordinator:
///         per DESIGN_DECISIONS.md #13, the kernel-discipline framing prefers
///         keeping `ClauseRegistry` and `AttestationCoordinator` as independently
///         addressable primitives. The helper is opt-in syntactic sugar — clause
///         authors who want atomic register+bind use it; those who don't can
///         still call the two primitives separately. Neither AC nor ClauseRegistry
///         gains a dependency on the other; both remain canonical-purpose.
///
///         No state, no admin, no fee. Anyone can call. The helper has no
///         privileges over its target contracts — both `registerClause` and
///         `setValidator` are permissionless on the underlying contracts, so
///         the helper is just composing two public calls atomically.
///
///         Bootstrap-time atomicity (the 14 reference figaro-* validators)
///         remains via `script/Deploy.s.sol:_deployAndRegisterValidators` —
///         the deploy script bundles the two writes inline within a single
///         broadcast transaction. The helper is for post-deploy clause authors.
///
///         Behavioral note: when a clause is registered through the helper, the
///         `ClauseRegistered` event records the helper's address as the
///         `registrar`, not the calling user's address. Clause authors who
///         want to be on record as the registrar (e.g., for off-chain
///         provenance / discovery) should call `ClauseRegistry.registerClause`
///         directly — this trades atomicity for registrar-identity. The
///         atomic-bind property protects against malicious-validator
///         front-running; the registrar-identity property is informational.
contract ClauseRegistrationHelper {
    /// @notice The canonical ClauseRegistry this helper writes to.
    ClauseRegistry public immutable clauseRegistry;
    /// @notice The canonical AttestationCoordinator this helper binds validators on.
    AttestationCoordinator public immutable attestationCoordinator;

    error ZeroAddress();

    constructor(address _clauseRegistry, address _attestationCoordinator) {
        if (_clauseRegistry == address(0)) revert ZeroAddress();
        if (_attestationCoordinator == address(0)) revert ZeroAddress();
        clauseRegistry = ClauseRegistry(_clauseRegistry);
        attestationCoordinator = AttestationCoordinator(_attestationCoordinator);
    }

    /// @notice Register a new clause in ClauseRegistry AND bind its validator
    ///         in AttestationCoordinator atomically — both writes happen in
    ///         the same transaction, so no front-runner can capture the
    ///         validator binding between them.
    /// @param clauseId    Human-readable clause name (e.g. "figaro-courier-process-v1").
    /// @param version     Clause version number (passed through to ClauseRegistry).
    /// @param contentHash keccak256 of the canonical spec JSON.
    /// @param metadataURI Off-chain spec locator (IPFS).
    /// @param family      keccak256 of the family slug (passed through to ClauseRegistry).
    /// @param validator   Address of the deployed `IClauseValidator` contract for `clauseId`.
    /// @dev Reverts on any of the underlying contract reverts:
    ///      - `ClauseRegistry.AlreadyRegistered(clauseId)` if clause is already registered
    ///      - `ClauseRegistry.EmptyMetadataURI()` / `EmptyClauseId()` / `ZeroContentHash()` / `ZeroFamily()`
    ///      - `AttestationCoordinator.ZeroValidator()` if validator is zero
    ///      - `AttestationCoordinator.ValidatorAlreadySet(clauseId)` if a binding already exists
    ///      - `AttestationCoordinator.InvalidValidatorBinding(clauseId, ...)` on clauseId mismatch
    ///      Solidity transaction semantics guarantee atomicity: any revert in the
    ///      second call rolls back the first call (and vice versa). The validator is
    ///      bound under the clauseId HASH — the canonical on-chain key.
    function registerClauseAndValidator(
        string calldata clauseId,
        uint64 version,
        bytes32 contentHash,
        string calldata metadataURI,
        bytes32 family,
        address validator
    ) external {
        clauseRegistry.registerClause(clauseId, version, contentHash, metadataURI, family);
        attestationCoordinator.setValidator(keccak256(abi.encode(clauseId, version)), validator);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title ClauseRegistry — Permissionless, event-only clause anchoring
/// @custom:security-contact security@figaro.org
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice On-chain dedup guard + event emission for clause registration.
///         No owner, no getters, no stored structs. Indexers reconstruct
///         the full registry from events.
///
///         Clauses anchor the off-chain vocabulary used by agreementHash
///         pre-images, AttestationCoordinator attestations, and mechanism
///         modules. The clauseId is keccak256 of a human-readable name
///         (e.g. "figaro-courier-process-v1", "figaro-ghg-iso-14064-v1").
///
///         Registration is permissionless — anyone can register a clause.
///         The clauseId is self-authenticating (content-addressed). Once
///         registered, a clause cannot be removed or deactivated. Clause
///         governance is a convention-layer concern, not enforcement.
///
///         Mechanism self-declaration: any contract can emit which clause
///         it uses. Frontends read these events to determine encoding.
///
///         Family tag: each clause declares a `family` (bytes32, typically
///         keccak256 of a category slug such as "geo" or "fulfilment").
///         The family is the unit the RPGF substrate-broadening formula
///         weights — Tier-1 family hashes are deploy-frozen in the SP1
///         program (see `prover/rpgf/src/formula.rs`), so registering a
///         new clause under an existing Tier-1 family confers the Tier-1
///         weight without touching the kernel or formula. The on-chain
///         namespace is open — anyone can mint a new family by passing
///         a fresh hash; only `bytes32(0)` is rejected.
///
/// @dev V3 ManifestClauseRegistry had: Ownable, Clause struct storage,
///      activate/deactivate state machine, getters, counter. All removed.
///      Only the dedup guard (has this clauseId been registered?) and
///      events survive.
contract ClauseRegistry {
    /// @notice Dedup guard — true if clauseId has been registered.
    mapping(bytes32 => bool) public registered;

    // ── Events ──────────────────────────────────────────────────────

    /// @notice Emitted when a new clause is registered.
    /// @param clauseId   keccak256 of the human-readable clause name.
    /// @param version    Clause version number.
    /// @param uriHash    keccak256 of the off-chain spec URI (IPFS, etc.).
    /// @param family     keccak256 of the family slug (e.g. "geo", "fulfilment").
    ///                   Indexers + the RPGF SP1 program key Tier-1 weighting off
    ///                   this; new clauses joining an existing Tier-1 family
    ///                   inherit the weight without redeployment.
    /// @param registrar  Address that registered the clause.
    event ClauseRegistered(
        bytes32 indexed clauseId, uint64 version, bytes32 uriHash, bytes32 indexed family, address indexed registrar
    );

    /// @notice Emitted when a mechanism declares which clause it uses.
    /// @param mechanism  The declaring contract address (msg.sender).
    /// @param clauseId   The clause the mechanism declares.
    event MechanismClauseSet(address indexed mechanism, bytes32 indexed clauseId);

    // ── Errors ──────────────────────────────────────────────────────

    error AlreadyRegistered(bytes32 clauseId);
    error NotRegistered(bytes32 clauseId);
    error ZeroUriHash();
    error ZeroFamily();

    // ── Clause registration (permissionless) ────────────────────────

    /// @notice Register a clause. Anyone can call. Reverts if already registered.
    /// @param clauseId  keccak256 of the human-readable clause name.
    /// @param version   Clause version number.
    /// @param uriHash   keccak256 of the off-chain spec URI.
    /// @param family    keccak256 of the family slug (e.g. `keccak256("geo")`).
    ///                  Permanently bound to the clause; consumed by the RPGF
    ///                  Tier-1 weighting in `prover/rpgf/src/formula.rs`.
    function registerClause(bytes32 clauseId, uint64 version, bytes32 uriHash, bytes32 family) external {
        if (uriHash == bytes32(0)) revert ZeroUriHash();
        if (family == bytes32(0)) revert ZeroFamily();
        if (registered[clauseId]) revert AlreadyRegistered(clauseId);
        registered[clauseId] = true;
        emit ClauseRegistered(clauseId, version, uriHash, family, msg.sender);
    }

    // ── Mechanism self-declaration (permissionless) ─────────────────

    /// @notice Declare which clause this mechanism uses. Any contract can call.
    ///         Reverts if the clause has not been registered.
    /// @param clauseId  A registered clause ID.
    function setMechanismClause(bytes32 clauseId) external {
        if (!registered[clauseId]) revert NotRegistered(clauseId);
        emit MechanismClauseSet(msg.sender, clauseId);
    }
}

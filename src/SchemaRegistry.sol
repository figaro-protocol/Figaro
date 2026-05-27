// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title SchemaRegistry — Permissionless, event-only schema anchoring
/// @custom:security-contact security@figaro.org
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice On-chain dedup guard + event emission for schema registration.
///         No owner, no getters, no stored structs. Indexers reconstruct
///         the full registry from events.
///
///         Schemas anchor the off-chain vocabulary used by agreementHash
///         pre-images, AttestationCoordinator attestations, and mechanism
///         modules. The schemaId is keccak256 of a human-readable name
///         (e.g. "figaro-courier-process-v1", "figaro-ghg-iso-14064-v1").
///
///         Registration is permissionless — anyone can register a schema.
///         The schemaId is self-authenticating (content-addressed). Once
///         registered, a schema cannot be removed or deactivated. Schema
///         governance is a convention-layer concern, not enforcement.
///
///         Mechanism self-declaration: any contract can emit which schema
///         it uses. Frontends read these events to determine encoding.
///
///         Family tag: each schema declares a `family` (bytes32, typically
///         keccak256 of a category slug such as "geo" or "fulfilment").
///         The family is the unit the RPGF substrate-broadening formula
///         weights — Tier-1 family hashes are deploy-frozen in the SP1
///         program (see `prover/rpgf/src/formula.rs`), so registering a
///         new schema under an existing Tier-1 family confers the Tier-1
///         weight without touching the kernel or formula. The on-chain
///         namespace is open — anyone can mint a new family by passing
///         a fresh hash; only `bytes32(0)` is rejected.
///
/// @dev V3 ManifestSchemaRegistry had: Ownable, Schema struct storage,
///      activate/deactivate state machine, getters, counter. All removed.
///      Only the dedup guard (has this schemaId been registered?) and
///      events survive.
contract SchemaRegistry {
    /// @notice Dedup guard — true if schemaId has been registered.
    mapping(bytes32 => bool) public registered;

    // ── Events ──────────────────────────────────────────────────────

    /// @notice Emitted when a new schema is registered.
    /// @param schemaId   keccak256 of the human-readable schema name.
    /// @param version    Schema version number.
    /// @param uriHash    keccak256 of the off-chain spec URI (IPFS, etc.).
    /// @param family     keccak256 of the family slug (e.g. "geo", "fulfilment").
    ///                   Indexers + the RPGF SP1 program key Tier-1 weighting off
    ///                   this; new schemas joining an existing Tier-1 family
    ///                   inherit the weight without redeployment.
    /// @param registrar  Address that registered the schema.
    event SchemaRegistered(
        bytes32 indexed schemaId, uint64 version, bytes32 uriHash, bytes32 indexed family, address indexed registrar
    );

    /// @notice Emitted when a mechanism declares which schema it uses.
    /// @param mechanism  The declaring contract address (msg.sender).
    /// @param schemaId   The schema the mechanism declares.
    event MechanismSchemaSet(address indexed mechanism, bytes32 indexed schemaId);

    // ── Errors ──────────────────────────────────────────────────────

    error AlreadyRegistered(bytes32 schemaId);
    error NotRegistered(bytes32 schemaId);
    error ZeroUriHash();
    error ZeroFamily();

    // ── Schema registration (permissionless) ────────────────────────

    /// @notice Register a schema. Anyone can call. Reverts if already registered.
    /// @param schemaId  keccak256 of the human-readable schema name.
    /// @param version   Schema version number.
    /// @param uriHash   keccak256 of the off-chain spec URI.
    /// @param family    keccak256 of the family slug (e.g. `keccak256("geo")`).
    ///                  Permanently bound to the schema; consumed by the RPGF
    ///                  Tier-1 weighting in `prover/rpgf/src/formula.rs`.
    function registerSchema(bytes32 schemaId, uint64 version, bytes32 uriHash, bytes32 family) external {
        if (uriHash == bytes32(0)) revert ZeroUriHash();
        if (family == bytes32(0)) revert ZeroFamily();
        if (registered[schemaId]) revert AlreadyRegistered(schemaId);
        registered[schemaId] = true;
        emit SchemaRegistered(schemaId, version, uriHash, family, msg.sender);
    }

    // ── Mechanism self-declaration (permissionless) ─────────────────

    /// @notice Declare which schema this mechanism uses. Any contract can call.
    ///         Reverts if the schema has not been registered.
    /// @param schemaId  A registered schema ID.
    function setMechanismSchema(bytes32 schemaId) external {
        if (!registered[schemaId]) revert NotRegistered(schemaId);
        emit MechanismSchemaSet(msg.sender, schemaId);
    }
}

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
///         (e.g. "figaro-delivery-lifecycle-v1", "figaro-ghg-iso-14064-v1").
///
///         Registration is permissionless — anyone can register a schema.
///         The schemaId is self-authenticating (content-addressed). Once
///         registered, a schema cannot be removed or deactivated. Schema
///         governance is a convention-layer concern, not enforcement.
///
///         Mechanism self-declaration: any contract can emit which schema
///         it uses. Frontends read these events to determine encoding.
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
    /// @param registrar  Address that registered the schema.
    event SchemaRegistered(bytes32 indexed schemaId, uint64 version, bytes32 uriHash, address indexed registrar);

    /// @notice Emitted when a mechanism declares which schema it uses.
    /// @param mechanism  The declaring contract address (msg.sender).
    /// @param schemaId   The schema the mechanism declares.
    event MechanismSchemaSet(address indexed mechanism, bytes32 indexed schemaId);

    // ── Errors ──────────────────────────────────────────────────────

    error AlreadyRegistered(bytes32 schemaId);
    error NotRegistered(bytes32 schemaId);
    error ZeroUriHash();

    // ── Schema registration (permissionless) ────────────────────────

    /// @notice Register a schema. Anyone can call. Reverts if already registered.
    /// @param schemaId  keccak256 of the human-readable schema name.
    /// @param version   Schema version number.
    /// @param uriHash   keccak256 of the off-chain spec URI.
    function registerSchema(bytes32 schemaId, uint64 version, bytes32 uriHash) external {
        if (uriHash == bytes32(0)) revert ZeroUriHash();
        if (registered[schemaId]) revert AlreadyRegistered(schemaId);
        registered[schemaId] = true;
        emit SchemaRegistered(schemaId, version, uriHash, msg.sender);
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

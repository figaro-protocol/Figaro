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
///         modules. The clauseId is the human-readable name (e.g.
///         "figaro-courier-process", "figaro-ghg"); the on-chain key is
///         keccak256(abi.encode(clauseId, version)).
///
///         Registration is permissionless — anyone can register a clause.
///         The clauseId is self-authenticating (name-derived). Once
///         registered, a clause cannot be removed or deactivated. Clause
///         governance is a convention-layer concern, not enforcement.
///
///         Mechanism self-declaration: any contract can emit which clause
///         it uses. Frontends read these events to determine encoding.
///
///         Grouping: a clause's group is `block.article` in its off-chain spec
///         JSON (integrity-bound by contentHash). The registry stores identity +
///         integrity only — there is NO on-chain group field. The RPGF substrate-
///         broadening formula, when restored, derives its group key as
///         keccak256(article) from the contentHash-verified spec; nothing is
///         stored on-chain for it (derive, don't store).
///
/// @dev V3's clause registry had: Ownable, Clause struct storage,
///      activate/deactivate state machine, getters, counter. All removed.
///      Only the dedup guard (has this clauseId been registered?) and
///      events survive.
contract ClauseRegistry {
    /// @notice Dedup guard — true if clauseId (by keccak256 hash) has been registered.
    mapping(bytes32 => bool) public registered;

    // ── Events ──────────────────────────────────────────────────────

    /// @notice Emitted when a new clause is registered.
    /// @param clauseId    Human-readable clause name (e.g. "figaro-courier-process").
    ///                    Non-indexed so the string is recoverable from the log —
    ///                    indexers reconstruct the clauseId without a preimage table.
    /// @param version     Clause version number.
    /// @param contentHash keccak256 of the canonical off-chain spec JSON — integrity.
    /// @param metadataURI Off-chain spec locator (IPFS, etc.). The pointer that lets
    ///                    any reader FETCH the spec from chain state alone — the same
    ///                    role `metadataURI` plays in SellerRegistry / AssemblyRegistry.
    /// @param registrar   Address that registered the clause.
    event ClauseRegistered(
        string clauseId, uint64 version, bytes32 contentHash, string metadataURI, address indexed registrar
    );

    /// @notice Emitted when a mechanism declares which clause it uses.
    /// @param mechanism  The declaring contract address (msg.sender).
    /// @param clauseId   The clause the mechanism declares.
    event MechanismClauseSet(address indexed mechanism, bytes32 indexed clauseId);

    // ── Errors ──────────────────────────────────────────────────────

    error AlreadyRegistered(bytes32 clauseId);
    error NotRegistered(bytes32 clauseId);
    error EmptyClauseId();
    error EmptyMetadataURI();
    error ZeroContentHash();

    // ── Clause registration (permissionless) ────────────────────────

    /// @notice Register a clause. Anyone can call. Reverts if already registered.
    /// @param clauseId    Human-readable clause name (e.g. "figaro-courier-process").
    ///                    The on-chain key is its keccak256 hash.
    /// @param version     Clause version number.
    /// @param contentHash keccak256 of the canonical spec JSON (integrity).
    /// @param metadataURI Off-chain spec locator (IPFS) — readers FETCH the spec from it.
    function registerClause(string calldata clauseId, uint64 version, bytes32 contentHash, string calldata metadataURI)
        external
    {
        if (bytes(clauseId).length == 0) revert EmptyClauseId();
        if (bytes(metadataURI).length == 0) revert EmptyMetadataURI();
        if (contentHash == bytes32(0)) revert ZeroContentHash();
        bytes32 idHash = keccak256(abi.encode(clauseId, version));
        if (registered[idHash]) revert AlreadyRegistered(idHash);
        registered[idHash] = true;
        emit ClauseRegistered(clauseId, version, contentHash, metadataURI, msg.sender);
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

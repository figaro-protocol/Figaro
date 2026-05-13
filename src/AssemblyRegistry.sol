// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title AssemblyRegistry — Permissionless assembly anchoring
/// @custom:security-contact security@figaro.org
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice On-chain dedup guard + event emission for assembly registration.
///         Parallel to `SchemaRegistry` (schemas) and `OperatorRegistry`
///         (operators) — each artifact family carries its own anchor per
///         the protocol's separation-of-concerns doctrine.
///
///         An assembly is a composition template that USES schemas. The
///         registry binds a slug to (contentHash, metadataURI): the slug
///         is the human-readable identifier; contentHash is keccak256 of
///         the canonical off-chain manifest; metadataURI points to that
///         manifest (typically IPFS).
///
///         The contract does NOT validate manifest content. It cannot —
///         the manifest lives off-chain; the contract only stores its
///         hash and URI. Per-clause content validation happens at the
///         per-schema layer when each order's clauses are attested at
///         commit time.
///
///         The per-process gas ceiling (2,145 orders, documented in
///         `FigaroCore.sol:240-250`) is a property of the kernel
///         resolveProcess path. Honest publishers enforce it client-side
///         before calling registerAssembly; buyers independently verify
///         off-chain before committing orders under an assembly. The
///         contract makes no claim about node count — any cap stated
///         here would be self-declared by the caller and unenforceable
///         against off-chain content.
///
///         No owner, no admin, no fee. Slug binding is first-write-wins
///         and permanent — no transferAssembly, no removeAssembly.
///         Authors who want to publish a revised assembly register a
///         new slug.
///
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any
///      kind, express or implied. No liability is accepted for loss, damages,
///      or bugs. Use at your own risk.
contract AssemblyRegistry {
    struct AssemblyBinding {
        address author;
        bytes32 contentHash;
        string metadataURI;
        uint64 registeredAt;
    }

    /// @notice slugHash (keccak256 of slug bytes) → binding details.
    mapping(bytes32 => AssemblyBinding) public bindings;

    // ── Events ──────────────────────────────────────────────────────────

    /// @notice Emitted when an assembly is registered.
    /// @param slugHash     keccak256 of the slug.
    /// @param author       Address that registered the assembly.
    /// @param slug         Human-readable slug (full string).
    /// @param contentHash  keccak256 of the canonical off-chain manifest.
    /// @param metadataURI  Off-chain manifest URI (typically IPFS).
    event AssemblyRegistered(
        bytes32 indexed slugHash, address indexed author, string slug, bytes32 contentHash, string metadataURI
    );

    // ── Errors ──────────────────────────────────────────────────────────

    error EmptySlug();
    error EmptyMetadataURI();
    error EmptyContentHash();
    error SlugAlreadyRegistered(string slug);

    // ── Assembly registration (permissionless, first-write-wins) ────────

    /// @notice Register an assembly. The contract anchors identity
    ///         (slug → contentHash + URI). Content validity is the
    ///         publisher's responsibility off-chain; per-clause validity
    ///         is the per-schema validator's responsibility at commit
    ///         time.
    /// @param slug         Human-readable slug. Bound permanently.
    /// @param contentHash  keccak256 of the canonical off-chain manifest.
    /// @param metadataURI  Off-chain manifest pointer (typically IPFS).
    function registerAssembly(string calldata slug, bytes32 contentHash, string calldata metadataURI) external {
        if (bytes(slug).length == 0) revert EmptySlug();
        if (bytes(metadataURI).length == 0) revert EmptyMetadataURI();
        if (contentHash == bytes32(0)) revert EmptyContentHash();

        bytes32 slugHash = keccak256(bytes(slug));
        if (bindings[slugHash].registeredAt != 0) revert SlugAlreadyRegistered(slug);

        bindings[slugHash] = AssemblyBinding({
            author: msg.sender,
            contentHash: contentHash,
            metadataURI: metadataURI,
            registeredAt: uint64(block.timestamp)
        });

        emit AssemblyRegistered(slugHash, msg.sender, slug, contentHash, metadataURI);
    }
}

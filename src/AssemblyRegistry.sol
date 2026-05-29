// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title AssemblyRegistry — Permissionless assembly anchoring with reclaimable deposit
/// @custom:security-contact security@figaro.org
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice On-chain dedup guard + event emission for assembly registration.
///         Parallel to `ClauseRegistry` (clauses) and `SellerRegistry`
///         (sellers) — each artifact family carries its own anchor per
///         the protocol's separation-of-concerns doctrine.
///
///         An assembly is a composition template that USES clauses. The
///         registry binds a slug to (contentHash, metadataURI): the slug
///         is the human-readable identifier; contentHash is keccak256 of
///         the canonical off-chain manifest; metadataURI points to that
///         manifest (typically IPFS).
///
///         The contract does NOT validate manifest content. It cannot —
///         the manifest lives off-chain; the contract only stores its
///         hash and URI. Per-clause content validation happens at the
///         per-clause layer when each order's clauses are attested at
///         commit time.
///
///         The per-process gas ceiling (2,145 orders, documented in
///         `FigaroCore.sol:240-250`) is a property of the kernel
///         resolveProcess path. Publish-side and buyer-side clients
///         enforce it; the contract makes no claim about node count
///         because that claim would be unenforceable against off-chain
///         content.
///
///         SPAM PROTECTION: registration requires an ETH deposit
///         (`registrationDeposit`, immutable at deploy). After the
///         lock period elapses, the author can call `withdrawDeposit`
///         to reclaim their ETH. The slug binding is permanent — it
///         is NOT cleared on withdraw, because buyers and sellers
///         that reference the slug rely on its content staying
///         stable. The deposit is purely an upfront Sybil-resistance
///         tax with a refund path, not a fee.
///
///         No owner, no admin, no fee extraction. Slug binding is
///         first-write-wins and permanent — no transferAssembly,
///         no removeAssembly.
///
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any
///      kind, express or implied. No liability is accepted for loss, damages,
///      or bugs. Use at your own risk.
contract AssemblyRegistry {
    /// @notice Deposit amount in wei required at registration. Immutable
    ///         at deploy.
    /// @dev Sybil-resistance mechanism, not a fee. The protocol does not
    ///      redistribute it; no party has authority to seize it. After
    ///      `depositLockPeriod` elapses, the author can withdraw the
    ///      exact same amount via `withdrawDeposit`.
    uint256 public immutable registrationDeposit;

    /// @notice Minimum lock duration before deposit can be withdrawn (seconds).
    /// @dev Together with `registrationDeposit`, this is the Sybil-
    ///      resistance knob. Without the lock, an attacker could
    ///      register, withdraw, recycle the same ETH across many
    ///      identities — "1 ETH = N assemblies over time" — at the
    ///      cost of N transactions. The lock makes recycling expensive
    ///      in TIME as well as capital. Permanence of the slug binding
    ///      means a spam-published slug is permanently burned (cannot
    ///      be re-registered), so each spam costs both deposit + lock
    ///      + an irrevocable slug.
    ///
    ///      Deploy-time choice. Devnet uses 3 years (1,095 days).
    ///      Mainnet duration should be set with explicit reasoning
    ///      recorded in deployment notes.
    uint256 public immutable depositLockPeriod;

    struct AssemblyBinding {
        address author;
        uint64 registeredAt;
        // 8-byte register; packs into the first storage slot with author + bool.
        bool depositWithdrawn;
        bytes32 contentHash;
        string metadataURI;
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

    /// @notice Emitted when an author withdraws their deposit. The slug
    ///         binding stays in place; only the deposit moves.
    /// @param slugHash  keccak256 of the slug.
    /// @param author    Address that withdrew.
    /// @param amount    Deposit amount returned (always equals
    ///                  `registrationDeposit`).
    event DepositWithdrawn(bytes32 indexed slugHash, address indexed author, uint256 amount);

    // ── Errors ──────────────────────────────────────────────────────────

    error EmptySlug();
    error EmptyMetadataURI();
    error EmptyContentHash();
    error SlugAlreadyRegistered(string slug);
    error WrongDeposit(uint256 provided, uint256 required);
    error NotRegistered();
    error NotAuthor(address caller, address author);
    error DepositLocked(uint64 unlocksAt);
    error AlreadyWithdrawn();
    error TransferFailed();

    // ── Constructor ─────────────────────────────────────────────────────

    /// @param _registrationDeposit  Required deposit per registration (wei).
    /// @param _depositLockPeriod    Lock duration in seconds.
    constructor(uint256 _registrationDeposit, uint256 _depositLockPeriod) {
        registrationDeposit = _registrationDeposit;
        depositLockPeriod = _depositLockPeriod;
    }

    // ── Assembly registration (permissionless, first-write-wins) ────────

    /// @notice Register an assembly. Requires `registrationDeposit` ETH.
    ///         The contract anchors identity (slug → contentHash + URI).
    ///         Content validity is the publisher's responsibility
    ///         off-chain; per-clause validity is the per-clause
    ///         validator's responsibility at commit time.
    /// @param slug         Human-readable slug. Bound permanently.
    /// @param contentHash  keccak256 of the canonical off-chain manifest.
    /// @param metadataURI  Off-chain manifest pointer (typically IPFS).
    function registerAssembly(string calldata slug, bytes32 contentHash, string calldata metadataURI) external payable {
        if (msg.value != registrationDeposit) revert WrongDeposit(msg.value, registrationDeposit);
        if (bytes(slug).length == 0) revert EmptySlug();
        if (bytes(metadataURI).length == 0) revert EmptyMetadataURI();
        if (contentHash == bytes32(0)) revert EmptyContentHash();

        bytes32 slugHash = keccak256(bytes(slug));
        if (bindings[slugHash].registeredAt != 0) revert SlugAlreadyRegistered(slug);

        bindings[slugHash] = AssemblyBinding({
            author: msg.sender,
            registeredAt: uint64(block.timestamp),
            depositWithdrawn: false,
            contentHash: contentHash,
            metadataURI: metadataURI
        });

        emit AssemblyRegistered(slugHash, msg.sender, slug, contentHash, metadataURI);
    }

    // ── Deposit withdrawal (author-only, post-lock) ─────────────────────

    /// @notice Reclaim the registration deposit after the lock elapses.
    ///         The slug binding is NOT cleared — only the deposit
    ///         moves. Callable only by the original author, and only
    ///         once per binding.
    /// @param slug The slug whose deposit to withdraw.
    function withdrawDeposit(string calldata slug) external {
        bytes32 slugHash = keccak256(bytes(slug));
        AssemblyBinding storage binding = bindings[slugHash];
        if (binding.registeredAt == 0) revert NotRegistered();
        if (msg.sender != binding.author) revert NotAuthor(msg.sender, binding.author);
        if (binding.depositWithdrawn) revert AlreadyWithdrawn();

        uint64 unlocksAt = binding.registeredAt + uint64(depositLockPeriod);
        if (block.timestamp < unlocksAt) revert DepositLocked(unlocksAt);

        // Checks-effects-interactions: flag THEN transfer.
        binding.depositWithdrawn = true;
        emit DepositWithdrawn(slugHash, msg.sender, registrationDeposit);

        (bool ok,) = msg.sender.call{value: registrationDeposit}("");
        if (!ok) revert TransferFailed();
    }
}

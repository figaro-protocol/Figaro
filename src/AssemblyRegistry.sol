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
///         An assembly is a composition template that USES clauses. Its
///         identity IS its composition: compositionHash is keccak256 of
///         the canonical composition subset of the off-chain assembly
///         template (the composed agreements — their clauses, values, and
///         topology; editorial prose excluded, so renaming never forks
///         identity). The registry keys bindings by compositionHash:
///         identical compositions collapse to one binding, and no
///         caller-chosen name exists on-chain to squat. The human-readable
///         slug is presentation, derived off-chain as a pure function of
///         compositionHash.
///
///         contentURI points at the full pinned template document
///         (typically IPFS) — including the editorial prose the hash
///         excludes. Readers fetch the document from contentURI and verify
///         it by recomputing compositionHash from its composition subset.
///
///         The contract does NOT validate assembly-template content. It cannot —
///         the document lives off-chain; the contract only stores its
///         hash and URI. Clause content well-formedness is an off-chain
///         concern (the Layer-A SDK at composition/sign time); on-chain,
///         the AttestationCoordinator merkle-binds each attestation to
///         the signed agreement without validating content shape.
///
///         The per-process gas ceiling (~1,240 orders, documented in
///         `FigaroCore.sol`) is a property of the kernel
///         resolveProcess path. Publish-side and buyer-side clients
///         enforce it; the contract makes no claim about node count
///         because that claim would be unenforceable against off-chain
///         content.
///
///         SPAM PROTECTION: registration requires an ETH deposit
///         (`registrationDeposit`, immutable at deploy). After the
///         lock period elapses, the author can call `withdrawDeposit`
///         to reclaim their ETH. The composition binding is permanent —
///         it is NOT cleared on withdraw, because buyers and sellers
///         that reference the assembly rely on its content staying
///         stable. The deposit is purely an upfront Sybil-resistance
///         tax with a refund path, not a fee.
///
///         Authorship is first-write-wins on the compositionHash: whoever
///         anchors a composition first is its author-of-record. Editorial
///         prose is not identity, so a front-runner can anchor someone
///         else's composition under their own prose — the same accepted
///         squatting economics as ClauseRegistry name registration; the
///         deposit is the cost floor.
///
///         No owner, no admin, no fee extraction. The composition binding
///         is first-write-wins and permanent — no transferAssembly,
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
    ///      in TIME as well as capital. Permanence of the composition
    ///      binding means a spam-published composition is permanently
    ///      burned (cannot be re-registered), so each spam costs both
    ///      deposit + lock + an irrevocable binding.
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
        string contentURI;
    }

    /// @notice compositionHash (keccak256 of the canonical composition
    ///         subset of the template) → binding details.
    mapping(bytes32 => AssemblyBinding) public bindings;

    // ── Events ──────────────────────────────────────────────────────────

    /// @notice Emitted when an assembly is registered.
    /// @param compositionHash keccak256 of the canonical composition subset
    ///                        of the off-chain assembly template — the
    ///                        assembly's identity.
    /// @param author          Address that registered the assembly.
    /// @param contentURI      Full off-chain assembly-template document URI
    ///                        (typically IPFS).
    event AssemblyRegistered(bytes32 indexed compositionHash, address indexed author, string contentURI);

    /// @notice Emitted when an author withdraws their deposit. The
    ///         composition binding stays in place; only the deposit moves.
    /// @param compositionHash The composition whose deposit was withdrawn.
    /// @param author          Address that withdrew.
    /// @param amount          Deposit amount returned (always equals
    ///                        `registrationDeposit`).
    event DepositWithdrawn(bytes32 indexed compositionHash, address indexed author, uint256 amount);

    // ── Errors ──────────────────────────────────────────────────────────

    error EmptyContentURI();
    error ZeroCompositionHash();
    error CompositionAlreadyRegistered(bytes32 compositionHash);
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
    ///         The contract anchors identity (compositionHash → contentURI).
    ///         Content validity is the publisher's responsibility
    ///         off-chain; clause content well-formedness is the off-chain
    ///         Layer-A SDK's concern — there is no on-chain content
    ///         validation.
    /// @param compositionHash keccak256 of the canonical composition subset
    ///                        of the off-chain assembly template.
    /// @param contentURI      Full off-chain assembly-template document
    ///                        pointer (typically IPFS).
    function registerAssembly(bytes32 compositionHash, string calldata contentURI) external payable {
        if (msg.value != registrationDeposit) revert WrongDeposit(msg.value, registrationDeposit);
        if (compositionHash == bytes32(0)) revert ZeroCompositionHash();
        if (bytes(contentURI).length == 0) revert EmptyContentURI();

        if (bindings[compositionHash].registeredAt != 0) revert CompositionAlreadyRegistered(compositionHash);

        bindings[compositionHash] = AssemblyBinding({
            author: msg.sender, registeredAt: uint64(block.timestamp), depositWithdrawn: false, contentURI: contentURI
        });

        emit AssemblyRegistered(compositionHash, msg.sender, contentURI);
    }

    // ── Deposit withdrawal (author-only, post-lock) ─────────────────────

    /// @notice Reclaim the registration deposit after the lock elapses.
    ///         The composition binding is NOT cleared — only the deposit
    ///         moves. Callable only by the original author, and only
    ///         once per binding.
    /// @param compositionHash The composition whose deposit to withdraw.
    function withdrawDeposit(bytes32 compositionHash) external {
        AssemblyBinding storage binding = bindings[compositionHash];
        if (binding.registeredAt == 0) revert NotRegistered();
        if (msg.sender != binding.author) revert NotAuthor(msg.sender, binding.author);
        if (binding.depositWithdrawn) revert AlreadyWithdrawn();

        uint64 unlocksAt = binding.registeredAt + uint64(depositLockPeriod);
        if (block.timestamp < unlocksAt) revert DepositLocked(unlocksAt);

        // Checks-effects-interactions: flag THEN transfer.
        binding.depositWithdrawn = true;
        emit DepositWithdrawn(compositionHash, msg.sender, registrationDeposit);

        (bool ok,) = msg.sender.call{value: registrationDeposit}("");
        if (!ok) revert TransferFailed();
    }
}

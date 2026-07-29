// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title ClauseRegistry — Permissionless clause anchoring with reclaimable deposit
/// @custom:security-contact figarosecurity@gmail.com
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice On-chain dedup guard + event emission for clause registration.
///         No owner, minimal storage. Indexers reconstruct the full
///         registry from events.
///
///         STAKED INTENT: registering requires an ETH deposit
///         (`registrationDeposit`, immutable at deploy) — registering IS
///         declaring intent to generate transactions. Surfacing derives
///         from the live stake: readers hide artifacts whose deposit has
///         been withdrawn (withdraw = de-surface), so polluting the
///         registry costs deposit × time-surfaced. There is no time lock.
///         The clause BINDING is permanent — never cleared on withdraw —
///         because committed agreements reference it forever; only the
///         stake and the surfacing move.
///
///         WITHDRAW GATE (commits == resolves): a registrar should not
///         withdraw while processes composed from the clause are in
///         flight. The usage count lives in the indexer — the same count
///         the RPGF program pays on — so the gate is enforced at the
///         protocol surface (SDK/frontend refuse while commits > resolves)
///         and hardens on-chain when the RPGF proof apparatus returns.
///         The contract itself cannot hold the count: the kernel is frozen
///         and carries no composition provenance.
///
///         Clauses anchor the off-chain vocabulary used by agreementHash
///         pre-images, AttestationCoordinator attestations, and mechanism
///         modules. The clauseId is the human-readable name (e.g.
///         "figaro-courier-process", "figaro-emissions"); the on-chain key is
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
///         JSON (integrity-bound by contentHash). There is NO on-chain group
///         field and never will be — grouping is a READER concern (the drawer's
///         headings), derived from the spec, never stored.
///
///         There is NO reward tag either. The 600M reward is UNIFORM (ratified
///         2026-07-29): every artifact's score is its real usage alone, with no
///         category, tag, or weight — so the registry stores no incentive input.
///         (A `rpgfTag` field existed until then, as a predecessor `family` did
///         before it — both deleted as the reward stopped privileging any class.)
///
/// @dev V3's clause registry had: Ownable, Clause struct storage,
///      activate/deactivate state machine, getters, counter. All removed.
///      Only the dedup guard (has this clauseId been registered?) and
///      events survive.
contract ClauseRegistry {
    /// @notice Deposit amount in wei required at registration. Immutable at
    ///         deploy. Sybil-resistance stake, not a fee — no party can
    ///         seize it; the registrar reclaims it via `withdrawDeposit`.
    uint256 public immutable registrationDeposit;

    /// @notice Dedup guard — true if clauseId (by keccak256 hash) has been registered.
    ///         Never cleared: the binding is permanent even after the
    ///         deposit is withdrawn.
    mapping(bytes32 => bool) public registered;

    /// @notice The integrity anchor — keccak256 of the canonical off-chain
    ///         spec JSON, stored at registration (identity + integrity is
    ///         this registry's whole purpose). This is the trust anchor the
    ///         proof apparatus binds witness specs to: the batch verifier
    ///         checks each proof's (clause key → spec-bytes hash) binding
    ///         against this mapping, so an in-proof clause validation is
    ///         only accepted for the exact spec the registry anchors.
    ///         Never cleared — committed agreements reference it forever.
    mapping(bytes32 => bytes32) public contentHashOf;

    /// @dev Stake accounting per clause key. `registrar` is the depositor
    ///      of record; `withdrawn` marks the stake reclaimed (= de-surfaced).
    struct DepositState {
        address registrar;
        bool withdrawn;
    }

    /// @notice clause key (keccak256(abi.encode(clauseId, version))) → stake state.
    mapping(bytes32 => DepositState) public depositOf;

    // ── Events ──────────────────────────────────────────────────────

    /// @notice Emitted when a new clause is registered.
    /// @param clauseId    Human-readable clause name (e.g. "figaro-courier-process").
    ///                    Non-indexed so the string is recoverable from the log —
    ///                    indexers reconstruct the clauseId without a preimage table.
    /// @param version     Clause version number.
    /// @param contentHash keccak256 of the canonical off-chain spec JSON — integrity.
    /// @param contentURI  Off-chain spec document URI (IPFS, etc.). The pointer that
    ///                    lets any reader FETCH the spec from chain state alone —
    ///                    the same role `contentURI` plays in AssemblyRegistry. (The
    ///                    pinned document IS the content, hence not "metadataURI" —
    ///                    SellerRegistry keeps that name because its mutable profile
    ///                    genuinely is metadata about a wallet-keyed identity.)
    /// @param registrar   Address that registered the clause.
    event ClauseRegistered(
        string clauseId, uint64 version, bytes32 contentHash, string contentURI, address indexed registrar
    );

    /// @notice Emitted when a registrar withdraws their deposit. The clause
    ///         binding stays in place; only the stake moves — readers
    ///         de-surface the clause for NEW compositions, while committed
    ///         agreements keep resolving it.
    /// @param clauseId  The clause key (keccak256(abi.encode(clauseId, version))).
    /// @param registrar Address that withdrew.
    /// @param amount    Deposit returned (always equals `registrationDeposit`).
    event DepositWithdrawn(bytes32 indexed clauseId, address indexed registrar, uint256 amount);

    /// @notice Emitted when a mechanism declares which clause it uses.
    /// @param mechanism  The declaring contract address (msg.sender).
    /// @param idHash     The declared clause's identity HASH —
    ///                   `keccak256(abi.encode(clauseId, version))`, never
    ///                   the raw name string.
    event MechanismClauseSet(address indexed mechanism, bytes32 indexed idHash);

    // ── Errors ──────────────────────────────────────────────────────

    error AlreadyRegistered(bytes32 clauseId);
    error NotRegistered(bytes32 clauseId);
    error EmptyClauseId();
    error EmptyContentURI();
    error ZeroContentHash();
    error WrongDeposit(uint256 provided, uint256 required);
    error NotRegistrar(address caller, address registrar);
    error AlreadyWithdrawn();
    error TransferFailed();

    // ── Constructor ─────────────────────────────────────────────────

    /// @param _registrationDeposit Required deposit per registration (wei).
    constructor(uint256 _registrationDeposit) {
        registrationDeposit = _registrationDeposit;
    }

    // ── Clause registration (permissionless) ────────────────────────

    /// @notice Register a clause. Anyone can call. Requires
    ///         `registrationDeposit` ETH (exact — no sweep function
    ///         exists). Reverts if already registered.
    /// @param clauseId    Human-readable clause name (e.g. "figaro-courier-process").
    ///                    The on-chain key is its keccak256 hash.
    /// @param version     Clause version number.
    /// @param contentHash keccak256 of the canonical spec JSON (integrity).
    /// @param contentURI  Off-chain spec document URI (IPFS) — readers FETCH the spec from it.
    function registerClause(string calldata clauseId, uint64 version, bytes32 contentHash, string calldata contentURI)
        external
        payable
    {
        if (msg.value != registrationDeposit) {
            revert WrongDeposit(msg.value, registrationDeposit);
        }
        if (bytes(clauseId).length == 0) revert EmptyClauseId();
        if (bytes(contentURI).length == 0) revert EmptyContentURI();
        if (contentHash == bytes32(0)) revert ZeroContentHash();
        bytes32 idHash = keccak256(abi.encode(clauseId, version));
        if (registered[idHash]) revert AlreadyRegistered(idHash);
        registered[idHash] = true;
        contentHashOf[idHash] = contentHash;
        depositOf[idHash] = DepositState({registrar: msg.sender, withdrawn: false});
        emit ClauseRegistered(clauseId, version, contentHash, contentURI, msg.sender);
    }

    // ── Deposit withdrawal (registrar-only) ─────────────────────────

    /// @notice Reclaim the registration deposit. The clause binding is NOT
    ///         cleared — only the stake moves; readers de-surface the
    ///         clause for new compositions. Callable only by the original
    ///         registrar, once. Version migration = withdraw the old
    ///         version's stake + register the new version.
    /// @dev The commits == resolves gate is protocol-surface (indexer
    ///      count; see the contract notice) — the chain carries no
    ///      composition provenance to enforce it here.
    /// @param idHash The clause key (keccak256(abi.encode(clauseId, version))).
    function withdrawDeposit(bytes32 idHash) external {
        DepositState storage state = depositOf[idHash];
        if (!registered[idHash]) revert NotRegistered(idHash);
        if (msg.sender != state.registrar) revert NotRegistrar(msg.sender, state.registrar);
        if (state.withdrawn) revert AlreadyWithdrawn();

        // Checks-effects-interactions: flag THEN transfer.
        state.withdrawn = true;
        emit DepositWithdrawn(idHash, msg.sender, registrationDeposit);

        (bool ok,) = msg.sender.call{value: registrationDeposit}("");
        if (!ok) revert TransferFailed();
    }

    // ── Mechanism self-declaration (permissionless) ─────────────────

    /// @notice Declare which clause this mechanism uses. Any contract can call.
    ///         Reverts if the clause has not been registered.
    /// @param idHash  A registered clause's identity HASH —
    ///                `keccak256(abi.encode(clauseId, version))` (the SDK's
    ///                `computeClauseKey`), NOT the raw name `registerClause`
    ///                takes as its string parameter.
    function setMechanismClause(bytes32 idHash) external {
        if (!registered[idHash]) revert NotRegistered(idHash);
        emit MechanismClauseSet(msg.sender, idHash);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title ClauseRegistry — Permissionless clause anchoring with reclaimable deposit
/// @custom:security-contact figarosecurity@gmail.com
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice On-chain dedup guard + event emission for clause registration: one of the
///         protocol's four registries (clauses, registered agreements, assemblies,
///         members), parallel, reading none of the others. No owner, minimal storage.
///
///         A CLAUSE IS ITS SPEC. The clause key is `keccak256` of the spec's
///         pinned bytes — the canonical JSON the designer pins (the SDK's
///         `computeClauseKey(spec)`, which is `canonicalContentHash(spec)`).
///         The key is the identity and the content hash at once: a reader
///         fetches the bytes from `contentURI` and checks
///         `keccak256(bytes) == clauseKey`. The spec's own `clauseId` and
///         `version` are presentation fields inside the document — a title
///         and a lineage counter a human reads; nothing on chain reads them.
///         Two specs that carry the same name are two clauses; a lookalike
///         shares nothing with the original but its label.
///
///         STAKED INTENT: registering requires an ETH deposit
///         (`registrationDeposit`, immutable at deploy) — registering IS
///         declaring intent to generate transactions. Surfacing derives
///         from the live stake: readers hide clauses whose deposit has
///         been withdrawn (withdraw = de-surface), so polluting the
///         registry costs deposit × time-surfaced. There is no time lock.
///         The clause BINDING is permanent — never cleared on withdraw —
///         because committed agreements reference it forever; only the
///         stake and the surfacing move.
///
///         WITHDRAW GATE (commits == resolves): the registering wallet should not
///         withdraw while processes composed from the clause are in
///         flight. The usage count lives in the indexer — the same count
///         the RPGF program pays on — so the gate is enforced at the
///         protocol surface (SDK/frontend refuse while commits > resolves).
///         The contract itself cannot hold the count: FigaroCore is frozen
///         and carries no composition provenance, so there is no on-chain
///         hardening of this gate.
///
///         Clauses anchor the off-chain vocabulary used by checkoutHash
///         pre-images, AttestationCoordinator attestations, and mechanism
///         modules: an agreement's leaf carries the clause key, and the batch
///         verifier accepts an in-proof clause validation only for a key
///         registered here.
///
///         Registration is permissionless and first-write-wins on the key —
///         anyone can register a clause, and the first registrant of a key is
///         its designer of record. The registry takes the key as given and
///         never sees the bytes; a key whose bytes nobody can produce is a
///         registration no reader can verify. Once registered, a clause
///         cannot be removed or deactivated. Clause governance is a
///         convention-layer concern, not enforcement.
///
///         Mechanism self-declaration: any contract can emit which clause
///         it uses. Frontends read these events to determine encoding.
///
///         Grouping: a clause's group is `block.design.article` in its spec —
///         inside the bytes the key hashes. There is NO on-chain group field
///         and never will be — grouping is a READER concern (the drawer's
///         headings), derived from the spec, never stored.
///
///         There is NO reward tag either. The 600M reward is UNIFORM:
///         every clause's, registered agreement's and assembly's score is
///         its real usage alone, with no category, tag, or weight — so the
///         registry stores no incentive input.
///
/// @dev Storage is the dedup guard (has this key been registered?) and the
///      stake state per key; everything else is the event.
contract ClauseRegistry {
    /// @notice Deposit amount in wei required at registration. Immutable at
    ///         deploy. Sybil-resistance stake, not a fee — no party can
    ///         seize it; the registering wallet reclaims it via `withdrawDeposit`.
    uint256 public immutable registrationDeposit;

    /// @notice Dedup guard — true if this clause key has been registered.
    ///         Never cleared: the binding is permanent even after the
    ///         deposit is withdrawn. The batch verifier reads it to accept
    ///         an in-proof clause validation: the key IS the spec hash, so a
    ///         registered key anchors at most one document.
    mapping(bytes32 => bool) public registered;

    /// @dev Stake accounting per clause key. `registeredBy` is the designer of record
    ///      (the role AssemblyRegistry and AgreementRegistry store under the same
    ///      name); `withdrawn` marks the stake reclaimed (= de-surfaced).
    struct DepositState {
        address registeredBy;
        bool withdrawn;
    }

    /// @notice clause key → stake state.
    mapping(bytes32 => DepositState) public depositOf;

    // ── Events ──────────────────────────────────────────────────────

    /// @notice Emitted when a new clause is registered.
    /// @param clauseKey    keccak256 of the spec's pinned bytes — the clause's
    ///                     identity and its content hash.
    /// @param contentURI   Off-chain spec document URI (IPFS, etc.). The pointer that
    ///                     lets any reader FETCH the spec from chain state alone and
    ///                     verify it against `clauseKey` — the same role `contentURI`
    ///                     plays in AssemblyRegistry and AgreementRegistry. (The pinned document IS the
    ///                     content, hence not "metadataURI" — MembersRegistry keeps
    ///                     that name because its mutable profile genuinely is
    ///                     metadata about a wallet-keyed identity.)
    /// @param registeredBy Address that registered the clause.
    event ClauseRegistered(bytes32 indexed clauseKey, string contentURI, address indexed registeredBy);

    /// @notice Emitted when the registering wallet withdraws its deposit. The clause
    ///         binding stays in place; only the stake moves — readers
    ///         de-surface the clause for NEW compositions, while committed
    ///         agreements keep resolving it.
    /// @param clauseKey    The clause key.
    /// @param registeredBy Address that withdrew.
    /// @param amount       Deposit returned (always equals `registrationDeposit`).
    event DepositWithdrawn(bytes32 indexed clauseKey, address indexed registeredBy, uint256 amount);

    /// @notice Emitted when a mechanism declares which clause it uses.
    /// @param mechanism  The declaring contract address (msg.sender).
    /// @param clauseKey  The declared clause's key.
    event MechanismClauseSet(address indexed mechanism, bytes32 indexed clauseKey);

    // ── Errors ──────────────────────────────────────────────────────

    error AlreadyRegistered(bytes32 clauseKey);
    error NotRegistered(bytes32 clauseKey);
    error ZeroClauseKey();
    error EmptyContentURI();
    error WrongDeposit(uint256 provided, uint256 required);
    error NotRegisteredBy(address caller, address registeredBy);
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
    ///         exists). Reverts if the key is already registered.
    /// @param clauseKey  keccak256 of the spec's pinned bytes (the SDK's
    ///                   `computeClauseKey(spec)`).
    /// @param contentURI Off-chain spec document URI (IPFS) — readers FETCH the
    ///                   spec from it and check its hash against `clauseKey`.
    function registerClause(bytes32 clauseKey, string calldata contentURI) external payable {
        if (msg.value != registrationDeposit) {
            revert WrongDeposit(msg.value, registrationDeposit);
        }
        if (clauseKey == bytes32(0)) revert ZeroClauseKey();
        if (bytes(contentURI).length == 0) revert EmptyContentURI();
        if (registered[clauseKey]) revert AlreadyRegistered(clauseKey);
        registered[clauseKey] = true;
        depositOf[clauseKey] = DepositState({registeredBy: msg.sender, withdrawn: false});
        emit ClauseRegistered(clauseKey, contentURI, msg.sender);
    }

    // ── Deposit withdrawal (registeredBy-only) ──────────────────────

    /// @notice Reclaim the registration deposit. The clause binding is NOT
    ///         cleared — only the stake moves; readers de-surface the
    ///         clause for new compositions. Callable only by the recorded
    ///         `registeredBy`, once. A designer moves its stake to a new spec
    ///         by withdrawing from the old key and registering the new one.
    /// @dev The commits == resolves gate is protocol-surface (indexer
    ///      count; see the contract notice) — the chain carries no
    ///      composition provenance to enforce it here.
    /// @param clauseKey The clause key.
    function withdrawDeposit(bytes32 clauseKey) external {
        DepositState storage state = depositOf[clauseKey];
        if (!registered[clauseKey]) revert NotRegistered(clauseKey);
        if (msg.sender != state.registeredBy) revert NotRegisteredBy(msg.sender, state.registeredBy);
        if (state.withdrawn) revert AlreadyWithdrawn();

        // Checks-effects-interactions: flag THEN transfer.
        state.withdrawn = true;
        emit DepositWithdrawn(clauseKey, msg.sender, registrationDeposit);

        (bool ok,) = msg.sender.call{value: registrationDeposit}("");
        if (!ok) revert TransferFailed();
    }

    // ── Mechanism self-declaration (permissionless) ─────────────────

    /// @notice Declare which clause this mechanism uses. Any contract can call.
    ///         Reverts if the clause has not been registered.
    /// @param clauseKey A registered clause's key.
    function setMechanismClause(bytes32 clauseKey) external {
        if (!registered[clauseKey]) revert NotRegistered(clauseKey);
        emit MechanismClauseSet(msg.sender, clauseKey);
    }
}

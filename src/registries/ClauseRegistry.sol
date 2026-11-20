// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title ClauseRegistry — Permissionless clause anchoring with reclaimable deposit
/// @custom:security-contact figarosecurity@gmail.com
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice On-chain dedup guard + event emission for clause registration: one of the
///         protocol's four registries (clauses, registered agreements, assemblies,
///         members), parallel, reading none of the others. No owner, minimal storage.
///
///         A CLAUSE IS ITS SPEC. The clause key is `keccak256` of the
///         canonical JSON of the spec without its top-level `block`, the
///         presentation (the SDK's `computeClauseKey(spec)`). The key is the
///         identity and the content hash at once: a reader fetches the
///         document from `contentURI`, drops `block`, canonicalizes it and
///         checks its hash against `clauseKey`. The spec's own `clauseId` and
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
///         registry costs deposit × time-surfaced. Withdrawal takes two
///         steps: `requestWithdrawal` de-surfaces at once, and `withdraw`
///         pays the deposit out after `withdrawalCooldown`.
///         The clause BINDING is permanent — never cleared on withdraw —
///         because committed agreements reference it forever; only the
///         stake and the surfacing move.
///
///         WITHDRAW GATE (commits == resolves): the registering wallet should not
///         withdraw while processes composed from the clause are in
///         flight. The usage count lives in the indexer — the same count
///         the designer rewards pay on — so the gate is advisory: the SDK derives
///         it and the frontend offers no reclaim while an open trade this wallet witnessed composes it, or while the gate cannot be read.
///         `requestWithdrawal` checks none of it; the contract cannot hold the count: FigaroCore is frozen
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
///         Grouping: a clause's group is `block.design.article` in its spec —
///         in the `block`, outside the bytes the key hashes. There is NO on-chain group field
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
    ///         seize it; the registering wallet reclaims it via `requestWithdrawal`
    ///         then `withdraw`.
    uint256 public immutable registrationDeposit;

    /// @notice Seconds between requesting a withdrawal and being able to
    ///         claim the stake. Immutable at deploy. Zero means claimable in
    ///         the same block (still a two-call sequence).
    /// @dev The same parameter `MembersRegistry` carries, for a different
    ///      attack. A one-step withdrawal let a front-runner register a
    ///      pending key and take its stake back in the same transaction,
    ///      leaving the key withdrawn for good and its intended designer
    ///      locked out at the price of gas. With the cooldown, every key so
    ///      taken holds one stake locked for the cooldown: the stake prices
    ///      the attempt (`docs/DESIGN_DECISIONS.md` § 7).
    uint256 public immutable withdrawalCooldown;

    /// @notice Dedup guard — true if this clause key has been registered.
    ///         Never cleared: the binding is permanent even after the
    ///         deposit is withdrawn. The batch verifier reads it to accept
    ///         an in-proof clause validation: the key IS the spec hash, so a
    ///         registered key anchors at most one document.
    mapping(bytes32 => bool) public registered;

    /// @dev Stake accounting per clause key. `registeredBy` is the designer of record
    ///      (the role ProcessRegistry and AgreementRegistry store under the same
    ///      name); `withdrawn` marks the stake reclaimed (= de-surfaced).
    struct DepositState {
        address registeredBy;
        bool withdrawn;
    }

    /// @notice clause key → stake state.
    mapping(bytes32 => DepositState) public depositOf;

    /// @notice clause key → timestamp from which the requested stake may be
    ///         claimed. Zero means no pending withdrawal: never requested, or
    ///         already paid out.
    mapping(bytes32 => uint256) public releaseAt;

    // ── Events ──────────────────────────────────────────────────────

    /// @notice Emitted when a new clause is registered.
    /// @param clauseKey    keccak256 of the canonical spec without `block` —
    ///                     the clause's identity and its content hash.
    /// @param contentURI   Off-chain spec document URI (IPFS, etc.). The pointer that
    ///                     lets any reader FETCH the spec from chain state alone and
    ///                     verify it against `clauseKey` — the same role `contentURI`
    ///                     plays in ProcessRegistry and AgreementRegistry. (The pinned document IS the
    ///                     content, hence not "metadataURI" — MembersRegistry keeps
    ///                     that name because its mutable profile genuinely is
    ///                     metadata about a wallet-keyed identity.)
    /// @param registeredBy Address that registered the clause.
    event ClauseRegistered(bytes32 indexed clauseKey, string contentURI, address indexed registeredBy);

    /// @notice Emitted when the registering wallet requests its stake back.
    ///         THE DE-SURFACING SIGNAL: the stake stops counting as live at
    ///         this event, while the ETH stays locked until `releaseAt`.
    ///         The binding stays in place.
    /// @param clauseKey    The clause key.
    /// @param registeredBy Address that requested the withdrawal.
    /// @param amount       Stake to be returned (always equals `registrationDeposit`).
    /// @param releaseAt    Timestamp from which `withdraw` pays it out.
    event WithdrawalRequested(
        bytes32 indexed clauseKey, address indexed registeredBy, uint256 amount, uint256 releaseAt
    );

    /// @notice Emitted when the registering wallet is paid its deposit back,
    ///         after the cooldown. The clause binding stays in place; readers
    ///         de-surfaced the clause for NEW compositions at
    ///         `WithdrawalRequested`, while committed agreements keep resolving it.
    /// @param clauseKey    The clause key.
    /// @param registeredBy Address paid.
    /// @param amount       Deposit returned (always equals `registrationDeposit`).
    event DepositWithdrawn(bytes32 indexed clauseKey, address indexed registeredBy, uint256 amount);

    // ── Errors ──────────────────────────────────────────────────────

    error AlreadyRegistered(bytes32 clauseKey);
    error NotRegistered(bytes32 clauseKey);
    error ZeroClauseKey();
    error EmptyContentURI();
    error WrongDeposit(uint256 provided, uint256 required);
    error NotRegisteredBy(address caller, address registeredBy);
    error AlreadyWithdrawn();
    error TransferFailed();
    error NothingPending();
    error CooldownActive(uint256 releaseAt);

    // ── Constructor ─────────────────────────────────────────────────

    /// @param _registrationDeposit Required deposit per registration (wei).
    /// @param _withdrawalCooldown  Seconds a requested withdrawal stays locked.
    constructor(uint256 _registrationDeposit, uint256 _withdrawalCooldown) {
        registrationDeposit = _registrationDeposit;
        withdrawalCooldown = _withdrawalCooldown;
    }

    // ── Views ───────────────────────────────────────────────────────────

    /// @notice Whether the requested stake on a key can be claimed now.
    /// @dev The chain answers this, never a client clock — the same view
    ///      `MembersRegistry.withdrawable` gives for a member.
    function withdrawable(bytes32 key) external view returns (bool) {
        uint256 unlockAt = releaseAt[key];
        return unlockAt != 0 && block.timestamp >= unlockAt;
    }

    // ── Clause registration (permissionless) ────────────────────────

    /// @notice Register a clause. Anyone can call. Requires
    ///         `registrationDeposit` ETH (exact — no sweep function
    ///         exists). Reverts if the key is already registered.
    /// @param clauseKey  keccak256 of the canonical spec without `block` (the
    ///                   SDK's `computeClauseKey(spec)`).
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

    // ── Stake withdrawal (registeredBy-only, two steps) ─────────────────

    /// @notice Start reclaiming the registration stake. Marks the stake
    ///         withdrawn at once, so readers de-surface the clause and it stops
    ///         counting as live from this call; the ETH becomes claimable
    ///         through `withdraw` after `withdrawalCooldown`. The binding is NOT
    ///         cleared. Callable only by the stored `registeredBy`, and only
    ///         once per key. A designer moves its stake to a new spec by
    ///         withdrawing from the old key and registering the new one.
    /// @dev The commits == resolves gate is advisory and off-chain (indexer
    ///      count; see the contract notice): this function does not check it,
    ///      since the chain carries no composition provenance to check.
    /// @param clauseKey The key whose stake to reclaim.
    function requestWithdrawal(bytes32 clauseKey) external {
        DepositState storage state = depositOf[clauseKey];
        if (!registered[clauseKey]) revert NotRegistered(clauseKey);
        if (msg.sender != state.registeredBy) revert NotRegisteredBy(msg.sender, state.registeredBy);
        if (state.withdrawn) revert AlreadyWithdrawn();

        state.withdrawn = true;
        uint256 unlockAt = block.timestamp + withdrawalCooldown;
        releaseAt[clauseKey] = unlockAt;

        emit WithdrawalRequested(clauseKey, msg.sender, registrationDeposit, unlockAt);
    }

    /// @notice Claim a requested stake whose cooldown has elapsed. Callable
    ///         only by the stored `registeredBy`; pays `registrationDeposit`
    ///         once. No one can release it early.
    /// @param clauseKey The key whose stake to claim.
    function withdraw(bytes32 clauseKey) external {
        DepositState storage state = depositOf[clauseKey];
        if (!registered[clauseKey]) revert NotRegistered(clauseKey);
        if (msg.sender != state.registeredBy) revert NotRegisteredBy(msg.sender, state.registeredBy);
        uint256 unlockAt = releaseAt[clauseKey];
        if (unlockAt == 0) revert NothingPending();
        if (block.timestamp < unlockAt) revert CooldownActive(unlockAt);

        // Checks-effects-interactions: clear THEN transfer.
        delete releaseAt[clauseKey];
        emit DepositWithdrawn(clauseKey, msg.sender, registrationDeposit);

        (bool ok,) = msg.sender.call{value: registrationDeposit}("");
        if (!ok) revert TransferFailed();
    }
}

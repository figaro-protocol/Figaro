// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title AgreementRegistry — Permissionless agreement anchoring with a reclaimable stake
/// @custom:security-contact figarosecurity@gmail.com
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice On-chain dedup guard + event emission for agreement registration.
///         Parallel to `ClauseRegistry` (clauses), `ProcessRegistry`
///         (assemblies) and `MembersRegistry` (members) — each family
///         carries its own anchor per the protocol's separation-of-concerns
///         doctrine, and this contract reads none of them.
///
///         A registered agreement is the clauses composed for ONE order
///         with the designer's fills, value-free: a reusable unit a
///         designer binds into any assembly, in any position, as is. Its identity
///         IS its composition: agreementHash is the merkle root over one leaf per
///         composed clause, the clause key and the canonical bytes of the fills
///         the designer gave it, so a clause's membership is a merkle proof. The
///         document names no topology: who follows whom is the assembly entry's
///         `follows`, and a signed agreement carries it as the format's topology
///         leaf. Editorial prose is excluded, so renaming never forks identity. The registry keys
///         bindings by agreementHash: identical compositions collapse to one
///         binding, and no caller-chosen name exists on-chain to squat.
///
///         contentURI points at the full pinned agreement document
///         (typically IPFS) — including the editorial prose the key
///         excludes. Readers fetch the document from contentURI and verify
///         it by recomputing the merkle root over its `clauses`.
///
///         The contract does NOT validate agreement content. It cannot — the
///         document lives off-chain; the contract only stores its key and
///         URI. Clause content well-formedness is an off-chain concern (the
///         SDK's off-chain validator at composition and sign time); on-chain, the
///         AttestationCoordinator merkle-binds each attestation to the signed
///         agreement without validating content shape.
///
///         The agreementHash is a design-time key, never the runtime
///         `checkoutHash` a commitment carries: an order instantiating a
///         registered agreement carries the agreement format's reserved
///         provenance leaf, whose bytes name the agreementHash and the
///         processDesignHash of the assembly it came from, under its own
///         `checkoutHash`.
///
///         STAKED INTENT: registration requires an ETH stake
///         (`registrationDeposit`, immutable at deploy) — registering IS
///         declaring intent to generate transactions. Surfacing derives from
///         the live stake: readers hide agreements whose stake has been
///         withdrawn (withdraw = de-surface), so polluting the registry costs
///         stake × time-surfaced. Withdrawal takes two steps:
///         `requestWithdrawal` de-surfaces at once, and `withdraw` pays the
///         stake out after `withdrawalCooldown`. The binding is
///         permanent — it is NOT cleared on withdraw, because the assemblies
///         that compose the agreement and the orders that instantiate it rely
///         on its content staying stable; only the stake and the surfacing
///         move.
///
///         WITHDRAW GATE (commits == resolves): the registering wallet should
///         not withdraw while processes instantiating the agreement are in
///         flight. `UsageCounter` counts only resolved, recorded uses, never a
///         commit, so the in-flight count lives in the indexer (commits without
///         resolution, attributed by each order's decoded provenance) and the
///         gate is advisory: the SDK derives it, the frontend offers no
///         reclaim while an open trade this wallet witnessed composes it or the gate cannot be read, and `requestWithdrawal` checks none of it.
///
///         The designer of record is first-write-wins on the agreementHash:
///         whoever anchors a composition first is its designer of record.
///         Editorial prose is not identity, so a front-runner can anchor
///         someone else's composition under their own prose — the same
///         accepted squatting economics as `ProcessRegistry`; the stake is
///         the cost floor.
///
///         No owner, no admin, no charge kept. The binding is first-write-wins
///         and permanent — no transferAgreement, no removeAgreement.
///
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any
///      kind, express or implied. No liability is accepted for loss, damages,
///      or bugs. Use at your own risk.
contract AgreementRegistry {
    /// @notice The agreement format's reserved provenance leaf key,
    ///         `keccak256("figaro-agreement-provenance")` — a format constant,
    ///         never a registration and never an agreementHash.
    bytes32 public constant PROVENANCE_LEAF_KEY = keccak256("figaro-agreement-provenance");

    /// @notice The key of an assembly tree's terms leaf,
    ///         `keccak256("figaro-assembly-terms")` — a format constant, never
    ///         a registration and never an agreementHash.
    bytes32 public constant PROCESS_TERMS_LEAF_KEY = keccak256("figaro-assembly-terms");

    /// @notice Stake in wei required at registration. Immutable at deploy.
    /// @dev Sybil-resistance stake, never a charge. The protocol does not
    ///      redistribute it; no party has authority to seize it. The
    ///      registering wallet reclaims the exact amount via `requestWithdrawal`, which
    ///      de-surfaces at once, then `withdraw` after `withdrawalCooldown` —
    ///      which de-surfaces the agreement (readers filter on the live
    ///      stake), so spam costs stake × time-surfaced plus an irrevocably
    ///      burned binding.
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

    struct AgreementBinding {
        address registeredBy;
        uint64 registeredAt;
        // 8-byte register; packs into the first storage slot with registeredBy + bool.
        bool depositWithdrawn;
        string contentURI;
    }

    /// @notice agreementHash (the merkle root over the agreement's clause
    ///         leaves) → binding details.
    mapping(bytes32 => AgreementBinding) public bindings;

    /// @notice agreementHash → timestamp from which the requested stake may be
    ///         claimed. Zero means no pending withdrawal: never requested, or
    ///         already paid out.
    mapping(bytes32 => uint256) public releaseAt;

    // ── Events ──────────────────────────────────────────────────────────

    /// @notice Emitted when an agreement is registered.
    /// @param agreementHash The merkle root over the agreement's clause
    ///                     leaves — the agreement's identity.
    /// @param registeredBy Address that registered the agreement.
    /// @param contentURI   Full off-chain agreement document URI (typically
    ///                     IPFS).
    event AgreementRegistered(bytes32 indexed agreementHash, address indexed registeredBy, string contentURI);

    /// @notice Emitted when the registering wallet requests its stake back.
    ///         THE DE-SURFACING SIGNAL: the stake stops counting as live at
    ///         this event, while the ETH stays locked until `releaseAt`.
    ///         The binding stays in place.
    /// @param agreementHash The key the stake was placed on.
    /// @param registeredBy Address that requested the withdrawal.
    /// @param amount       Stake to be returned (always equals `registrationDeposit`).
    /// @param releaseAt    Timestamp from which `withdraw` pays it out.
    event WithdrawalRequested(
        bytes32 indexed agreementHash, address indexed registeredBy, uint256 amount, uint256 releaseAt
    );

    /// @notice Emitted when the registering wallet is paid its stake back,
    ///         after the cooldown. The binding stays in place; readers
    ///         de-surfaced the agreement at `WithdrawalRequested`.
    /// @param agreementHash The key the stake was placed on.
    /// @param registeredBy Address paid.
    /// @param amount       Stake returned (always equals
    ///                     `registrationDeposit`).
    event DepositWithdrawn(bytes32 indexed agreementHash, address indexed registeredBy, uint256 amount);

    // ── Errors ──────────────────────────────────────────────────────────

    error EmptyContentURI();
    error ZeroAgreementHash();
    error AgreementAlreadyRegistered(bytes32 agreementHash);
    error WrongDeposit(uint256 provided, uint256 required);
    error NotRegistered();
    error NotRegisteredBy(address caller, address registeredBy);
    error AlreadyWithdrawn();
    error TransferFailed();
    error NothingPending();
    error CooldownActive(uint256 releaseAt);
    /// @notice One of the two reserved format keys was offered as an
    ///         agreementHash.
    error ReservedKeyIsNotARegistration(bytes32 key);

    // ── Constructor ─────────────────────────────────────────────────────

    /// @param _registrationDeposit Required stake per registration (wei).
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

    // ── Agreement registration (permissionless, first-write-wins) ───────

    /// @notice Register an agreement. Requires `registrationDeposit` ETH.
    ///         The contract anchors identity (agreementHash → contentURI).
    ///         The two reserved format keys are refused: the provenance leaf
    ///         key and the assembly terms leaf key are constants of the
    ///         formats, never an agreement.
    ///         Content validity is the publisher's responsibility off-chain;
    ///         clause content well-formedness is the SDK's off-chain validator's
    ///         concern — there is no on-chain content validation.
    /// @param agreementHash The merkle root over the agreement's clause
    ///                     leaves.
    /// @param contentURI   Full off-chain agreement document pointer
    ///                     (typically IPFS).
    function registerAgreement(bytes32 agreementHash, string calldata contentURI) external payable {
        if (msg.value != registrationDeposit) revert WrongDeposit(msg.value, registrationDeposit);
        if (agreementHash == bytes32(0)) revert ZeroAgreementHash();
        if (agreementHash == PROVENANCE_LEAF_KEY || agreementHash == PROCESS_TERMS_LEAF_KEY) {
            revert ReservedKeyIsNotARegistration(agreementHash);
        }
        if (bytes(contentURI).length == 0) revert EmptyContentURI();

        if (bindings[agreementHash].registeredAt != 0) revert AgreementAlreadyRegistered(agreementHash);

        bindings[agreementHash] = AgreementBinding({
            registeredBy: msg.sender,
            registeredAt: uint64(block.timestamp),
            depositWithdrawn: false,
            contentURI: contentURI
        });

        emit AgreementRegistered(agreementHash, msg.sender, contentURI);
    }

    // ── Stake withdrawal (registeredBy-only, two steps) ─────────────────

    /// @notice Start reclaiming the registration stake. Marks the stake
    ///         withdrawn at once, so readers de-surface the agreement and it stops
    ///         counting as live from this call; the ETH becomes claimable
    ///         through `withdraw` after `withdrawalCooldown`. The binding is NOT
    ///         cleared. Callable only by the stored `registeredBy`, and only
    ///         once per key.
    /// @dev The commits == resolves gate is advisory and off-chain (indexer
    ///      count; see the contract notice): this function does not check it,
    ///      since the chain carries no composition provenance to check.
    /// @param agreementHash The key whose stake to reclaim.
    function requestWithdrawal(bytes32 agreementHash) external {
        AgreementBinding storage binding = bindings[agreementHash];
        if (binding.registeredAt == 0) revert NotRegistered();
        if (msg.sender != binding.registeredBy) revert NotRegisteredBy(msg.sender, binding.registeredBy);
        if (binding.depositWithdrawn) revert AlreadyWithdrawn();

        binding.depositWithdrawn = true;
        uint256 unlockAt = block.timestamp + withdrawalCooldown;
        releaseAt[agreementHash] = unlockAt;

        emit WithdrawalRequested(agreementHash, msg.sender, registrationDeposit, unlockAt);
    }

    /// @notice Claim a requested stake whose cooldown has elapsed. Callable
    ///         only by the stored `registeredBy`; pays `registrationDeposit`
    ///         once. No one can release it early.
    /// @param agreementHash The key whose stake to claim.
    function withdraw(bytes32 agreementHash) external {
        AgreementBinding storage binding = bindings[agreementHash];
        if (binding.registeredAt == 0) revert NotRegistered();
        if (msg.sender != binding.registeredBy) revert NotRegisteredBy(msg.sender, binding.registeredBy);
        uint256 unlockAt = releaseAt[agreementHash];
        if (unlockAt == 0) revert NothingPending();
        if (block.timestamp < unlockAt) revert CooldownActive(unlockAt);

        // Checks-effects-interactions: clear THEN transfer.
        delete releaseAt[agreementHash];
        emit DepositWithdrawn(agreementHash, msg.sender, registrationDeposit);

        (bool ok,) = msg.sender.call{value: registrationDeposit}("");
        if (!ok) revert TransferFailed();
    }
}

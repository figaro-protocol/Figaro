// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title ProcessRegistry — Permissionless assembly anchoring with reclaimable deposit
/// @custom:security-contact figarosecurity@gmail.com
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice On-chain dedup guard + event emission for assembly registration.
///         Parallel to `ClauseRegistry` (clauses), `AgreementRegistry`
///         (agreements) and `MembersRegistry` (members) — each family carries
///         its own anchor per the protocol's separation-of-concerns doctrine.
///
///         An assembly is a list of registered agreements; its
///         identity IS its composition: processDesignHash is the merkle root,
///         under the assembly tree's own leaf convention (the leaf domain
///         `keccak256("figaro-assembly-leaf")` mixed in), over one leaf per
///         agreement (key: its agreementHash; bytes: `{"agreement":i,"clauses":{…},"follows":[…]}`)
///         and the terms leaf when assembly-scoped clauses are composed
///         (editorial prose excluded). The registry keys bindings by processDesignHash:
///         identical compositions collapse to one binding, and no
///         caller-chosen name exists on-chain to squat. The human-readable
///         slug is presentation, derived off-chain as a pure function of
///         processDesignHash.
///
///         contentURI points at the full pinned assembly document
///         (typically IPFS) — including the editorial prose the root
///         excludes. Readers fetch the document from contentURI and verify
///         it by rebuilding the root from its agreements and terms.
///
///         The contract does NOT validate assembly content. It cannot —
///         the document lives off-chain; the contract only stores its
///         hash and URI. Clause content well-formedness is an off-chain
///         concern (the Layer-A SDK at composition/sign time); on-chain,
///         the AttestationCoordinator merkle-binds each attestation to
///         the signed agreement without validating content shape.
///
///         The per-process gas ceiling (set by the chain's per-transaction gas
///         cap and its block gas limit, documented in `FigaroCore.sol`) is a property
///         of the FigaroCore resolveProcess path. Publish-side and buyer-side clients
///         enforce it; the contract makes no claim about node count
///         because that claim would be unenforceable against off-chain
///         content.
///
///         STAKED INTENT: registration requires an ETH deposit
///         (`registrationDeposit`, immutable at deploy) — registering IS
///         declaring intent to generate transactions. Surfacing derives
///         from the live stake: readers hide assemblies whose deposit has
///         been withdrawn (withdraw = de-surface), so polluting the
///         registry costs deposit × time-surfaced. Withdrawal takes two steps:
///         `requestWithdrawal` de-surfaces at once, and `withdraw` pays the
///         stake out after `withdrawalCooldown`.
///         The composition binding is permanent — it is NOT cleared on
///         withdraw, because buyers and sellers that reference the
///         assembly rely on its content staying stable; only the stake
///         and the surfacing move.
///
///         WITHDRAW GATE (commits == resolves): the registering wallet should not
///         withdraw while processes composed from the assembly are in
///         flight. The in-flight count lives in the indexer (commits without
///         resolution, attributed by each order's decoded provenance), so
///         the gate is advisory: the SDK derives it and the frontend offers no
///         reclaim while an open trade this wallet witnessed composes it or the gate cannot be read; `requestWithdrawal` checks none of it. `FigaroCore` never calls the registries
///         and carries no usage, so no contract can learn the count and there
///         is no on-chain hardening of this gate.
///
///         The designer of record is first-write-wins on the processDesignHash:
///         whoever anchors a composition first is its designer of record. Editorial
///         prose is not identity, so a front-runner can anchor someone
///         else's composition under their own prose — the same accepted
///         squatting economics as `ClauseRegistry` and `AgreementRegistry`,
///         each first-write-wins on its own key; the deposit is the cost floor.
///
///         No owner, no admin, no fee extraction. The composition binding
///         is first-write-wins and permanent — no transferAssembly,
///         no removeAssembly.
///
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any
///      kind, express or implied. No liability is accepted for loss, damages,
///      or bugs. Use at your own risk.
contract ProcessRegistry {
    /// @notice Deposit amount in wei required at registration. Immutable
    ///         at deploy.
    /// @dev Sybil-resistance stake, not a fee. The protocol does not
    ///      redistribute it; no party has authority to seize it. The
    ///      registering wallet reclaims the exact amount via `requestWithdrawal`, which
    ///      de-surfaces at once, then `withdraw` after `withdrawalCooldown` —
    ///      which de-surfaces the assembly (readers filter on the live
    ///      stake), so spam costs deposit × time-surfaced plus an
    ///      irrevocably burned composition binding.
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

    struct ProcessBinding {
        address registeredBy;
        uint64 registeredAt;
        // 8-byte register; packs into the first storage slot with registeredBy + bool.
        bool depositWithdrawn;
        string contentURI;
    }

    /// @notice processDesignHash (the merkle root over the assembly's
    ///         agreements and terms) → binding details.
    mapping(bytes32 => ProcessBinding) public bindings;

    /// @notice processDesignHash → timestamp from which the requested stake may be
    ///         claimed. Zero means no pending withdrawal: never requested, or
    ///         already paid out.
    mapping(bytes32 => uint256) public releaseAt;

    // ── Events ──────────────────────────────────────────────────────────

    /// @notice Emitted when an assembly is registered.
    /// @param processDesignHash The merkle root over the off-chain
    ///                        assembly's agreements and terms — the
    ///                        assembly's identity.
    /// @param registeredBy    Address that registered the assembly.
    /// @param contentURI      Full off-chain assembly document URI
    ///                        (typically IPFS).
    event ProcessRegistered(bytes32 indexed processDesignHash, address indexed registeredBy, string contentURI);

    /// @notice Emitted when the registering wallet requests its stake back.
    ///         THE DE-SURFACING SIGNAL: the stake stops counting as live at
    ///         this event, while the ETH stays locked until `releaseAt`.
    ///         The binding stays in place.
    /// @param processDesignHash The key the stake was placed on.
    /// @param registeredBy Address that requested the withdrawal.
    /// @param amount       Stake to be returned (always equals `registrationDeposit`).
    /// @param releaseAt    Timestamp from which `withdraw` pays it out.
    event WithdrawalRequested(
        bytes32 indexed processDesignHash, address indexed registeredBy, uint256 amount, uint256 releaseAt
    );

    /// @notice Emitted when the registering wallet is paid its stake back,
    ///         after the cooldown. The binding stays in place; readers
    ///         de-surfaced the assembly at `WithdrawalRequested`.
    /// @param processDesignHash The key the stake was placed on.
    /// @param registeredBy Address paid.
    /// @param amount       Stake returned (always equals
    ///                     `registrationDeposit`).
    event DepositWithdrawn(bytes32 indexed processDesignHash, address indexed registeredBy, uint256 amount);

    // ── Errors ──────────────────────────────────────────────────────────

    error EmptyContentURI();
    error ZeroProcessDesignHash();
    error ProcessAlreadyRegistered(bytes32 processDesignHash);
    error WrongDeposit(uint256 provided, uint256 required);
    error NotRegistered();
    error NotRegisteredBy(address caller, address registeredBy);
    error AlreadyWithdrawn();
    error TransferFailed();
    error NothingPending();
    error CooldownActive(uint256 releaseAt);

    // ── Constructor ─────────────────────────────────────────────────────

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

    // ── Assembly registration (permissionless, first-write-wins) ────────

    /// @notice Register an assembly. Requires `registrationDeposit` ETH.
    ///         The contract anchors identity (processDesignHash → contentURI).
    ///         Content validity is the publisher's responsibility
    ///         off-chain; clause content well-formedness is the off-chain
    ///         Layer-A SDK's concern — there is no on-chain content
    ///         validation.
    /// @param processDesignHash The merkle root over the off-chain
    ///                        assembly's agreements and terms.
    /// @param contentURI      Full off-chain assembly document
    ///                        pointer (typically IPFS).
    function registerProcess(bytes32 processDesignHash, string calldata contentURI) external payable {
        if (msg.value != registrationDeposit) revert WrongDeposit(msg.value, registrationDeposit);
        if (processDesignHash == bytes32(0)) revert ZeroProcessDesignHash();
        if (bytes(contentURI).length == 0) revert EmptyContentURI();

        if (bindings[processDesignHash].registeredAt != 0) revert ProcessAlreadyRegistered(processDesignHash);

        bindings[processDesignHash] = ProcessBinding({
            registeredBy: msg.sender,
            registeredAt: uint64(block.timestamp),
            depositWithdrawn: false,
            contentURI: contentURI
        });

        emit ProcessRegistered(processDesignHash, msg.sender, contentURI);
    }

    // ── Stake withdrawal (registeredBy-only, two steps) ─────────────────

    /// @notice Start reclaiming the registration stake. Marks the stake
    ///         withdrawn at once, so readers de-surface the assembly and it stops
    ///         counting as live from this call; the ETH becomes claimable
    ///         through `withdraw` after `withdrawalCooldown`. The binding is NOT
    ///         cleared. Callable only by the stored `registeredBy`, and only
    ///         once per key.
    /// @dev The commits == resolves gate is advisory and off-chain (indexer
    ///      count; see the contract notice): this function does not check it,
    ///      since the chain carries no composition provenance to check.
    /// @param processDesignHash The key whose stake to reclaim.
    function requestWithdrawal(bytes32 processDesignHash) external {
        ProcessBinding storage binding = bindings[processDesignHash];
        if (binding.registeredAt == 0) revert NotRegistered();
        if (msg.sender != binding.registeredBy) revert NotRegisteredBy(msg.sender, binding.registeredBy);
        if (binding.depositWithdrawn) revert AlreadyWithdrawn();

        binding.depositWithdrawn = true;
        uint256 unlockAt = block.timestamp + withdrawalCooldown;
        releaseAt[processDesignHash] = unlockAt;

        emit WithdrawalRequested(processDesignHash, msg.sender, registrationDeposit, unlockAt);
    }

    /// @notice Claim a requested stake whose cooldown has elapsed. Callable
    ///         only by the stored `registeredBy`; pays `registrationDeposit`
    ///         once. No one can release it early.
    /// @param processDesignHash The key whose stake to claim.
    function withdraw(bytes32 processDesignHash) external {
        ProcessBinding storage binding = bindings[processDesignHash];
        if (binding.registeredAt == 0) revert NotRegistered();
        if (msg.sender != binding.registeredBy) revert NotRegisteredBy(msg.sender, binding.registeredBy);
        uint256 unlockAt = releaseAt[processDesignHash];
        if (unlockAt == 0) revert NothingPending();
        if (block.timestamp < unlockAt) revert CooldownActive(unlockAt);

        // Checks-effects-interactions: clear THEN transfer.
        delete releaseAt[processDesignHash];
        emit DepositWithdrawn(processDesignHash, msg.sender, registrationDeposit);

        (bool ok,) = msg.sender.call{value: registrationDeposit}("");
        if (!ok) revert TransferFailed();
    }
}

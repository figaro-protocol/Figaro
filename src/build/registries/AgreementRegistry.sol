// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title AgreementRegistry — Permissionless agreement anchoring with a reclaimable stake
/// @custom:security-contact figarosecurity@gmail.com
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice On-chain dedup guard + event emission for agreement registration.
///         Parallel to `ClauseRegistry` (clauses), `AssemblyRegistry`
///         (assemblies) and `MembersRegistry` (members) — each family
///         carries its own anchor per the protocol's separation-of-concerns
///         doctrine, and this contract reads none of them.
///
///         A registered agreement is the clauses composed for ONE order
///         slot with the designer's fills, value-free: a reusable unit a
///         designer binds into any slot of any assembly as is. Its identity
///         IS its composition: agreementKey is the canonical content hash of
///         `{ clauses }` — the clause keys and the fills the designer gave
///         them, the topology clause composed with `{}` (who follows whom is
///         the assembly's fact, never the agreement's), editorial prose
///         excluded, so renaming never forks identity. The registry keys
///         bindings by agreementKey: identical compositions collapse to one
///         binding, and no caller-chosen name exists on-chain to squat.
///
///         contentURI points at the full pinned agreement document
///         (typically IPFS) — including the editorial prose the key
///         excludes. Readers fetch the document from contentURI and verify
///         it by recomputing agreementKey from its `clauses`.
///
///         The contract does NOT validate agreement content. It cannot — the
///         document lives off-chain; the contract only stores its key and
///         URI. Clause content well-formedness is an off-chain concern (the
///         SDK's off-chain validator at composition and sign time); on-chain, the
///         AttestationCoordinator merkle-binds each attestation to the signed
///         agreement without validating content shape.
///
///         The agreementKey is a design-time key, never the runtime
///         `agreementHash` a commitment carries: an order instantiating a
///         registered agreement carries the agreement format's reserved
///         provenance leaf, whose bytes name the agreementKey and the
///         compositionHash of the assembly it came from, under its own
///         `agreementHash`.
///
///         STAKED INTENT: registration requires an ETH stake
///         (`registrationDeposit`, immutable at deploy) — registering IS
///         declaring intent to generate transactions. Surfacing derives from
///         the live stake: readers hide agreements whose stake has been
///         withdrawn (withdraw = de-surface), so polluting the registry costs
///         stake × time-surfaced. There is no time lock. The binding is
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
///         gate is enforced at the protocol surface (SDK and frontend refuse).
///
///         The designer of record is first-write-wins on the agreementKey:
///         whoever anchors a composition first is its designer of record.
///         Editorial prose is not identity, so a front-runner can anchor
///         someone else's composition under their own prose — the same
///         accepted squatting economics as `AssemblyRegistry`; the stake is
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
    ///         never a registration and never an agreementKey.
    bytes32 public constant PROVENANCE_LEAF_KEY = keccak256("figaro-agreement-provenance");

    /// @notice The key of an assembly tree's terms leaf,
    ///         `keccak256("figaro-assembly-terms")` — a format constant, never
    ///         a registration and never an agreementKey.
    bytes32 public constant ASSEMBLY_TERMS_LEAF_KEY = keccak256("figaro-assembly-terms");

    /// @notice Stake in wei required at registration. Immutable at deploy.
    /// @dev Sybil-resistance stake, never a charge. The protocol does not
    ///      redistribute it; no party has authority to seize it. The
    ///      registering wallet reclaims the exact amount via `withdrawDeposit`
    ///      — which de-surfaces the agreement (readers filter on the live
    ///      stake), so spam costs stake × time-surfaced plus an irrevocably
    ///      burned binding. No time lock.
    uint256 public immutable registrationDeposit;

    struct AgreementBinding {
        address registeredBy;
        uint64 registeredAt;
        // 8-byte register; packs into the first storage slot with registeredBy + bool.
        bool depositWithdrawn;
        string contentURI;
    }

    /// @notice agreementKey (the canonical content hash of the agreement's
    ///         `clauses`) → binding details.
    mapping(bytes32 => AgreementBinding) public bindings;

    // ── Events ──────────────────────────────────────────────────────────

    /// @notice Emitted when an agreement is registered.
    /// @param agreementKey The canonical content hash of the agreement's
    ///                     `clauses` — the agreement's identity.
    /// @param registeredBy Address that registered the agreement.
    /// @param contentURI   Full off-chain agreement document URI (typically
    ///                     IPFS).
    event AgreementRegistered(bytes32 indexed agreementKey, address indexed registeredBy, string contentURI);

    /// @notice Emitted when the registering wallet withdraws its stake. The
    ///         binding stays in place; only the stake moves.
    /// @param agreementKey The agreement whose stake was withdrawn.
    /// @param registeredBy Address that withdrew.
    /// @param amount       Stake returned (always equals
    ///                     `registrationDeposit`).
    event DepositWithdrawn(bytes32 indexed agreementKey, address indexed registeredBy, uint256 amount);

    // ── Errors ──────────────────────────────────────────────────────────

    error EmptyContentURI();
    error ZeroAgreementKey();
    error AgreementAlreadyRegistered(bytes32 agreementKey);
    error WrongDeposit(uint256 provided, uint256 required);
    error NotRegistered();
    error NotRegisteredBy(address caller, address registeredBy);
    error AlreadyWithdrawn();
    error TransferFailed();
    /// @notice One of the two reserved format keys was offered as an
    ///         agreementKey.
    error ReservedKeyIsNotARegistration(bytes32 key);

    // ── Constructor ─────────────────────────────────────────────────────

    /// @param _registrationDeposit  Required stake per registration (wei).
    constructor(uint256 _registrationDeposit) {
        registrationDeposit = _registrationDeposit;
    }

    // ── Agreement registration (permissionless, first-write-wins) ───────

    /// @notice Register an agreement. Requires `registrationDeposit` ETH.
    ///         The contract anchors identity (agreementKey → contentURI).
    ///         The two reserved format keys are refused: the provenance leaf
    ///         key and the assembly terms leaf key are constants of the
    ///         formats, never an agreement.
    ///         Content validity is the publisher's responsibility off-chain;
    ///         clause content well-formedness is the SDK's off-chain validator's
    ///         concern — there is no on-chain content validation.
    /// @param agreementKey The canonical content hash of the agreement's
    ///                     `clauses`.
    /// @param contentURI   Full off-chain agreement document pointer
    ///                     (typically IPFS).
    function registerAgreement(bytes32 agreementKey, string calldata contentURI) external payable {
        if (msg.value != registrationDeposit) revert WrongDeposit(msg.value, registrationDeposit);
        if (agreementKey == bytes32(0)) revert ZeroAgreementKey();
        if (agreementKey == PROVENANCE_LEAF_KEY || agreementKey == ASSEMBLY_TERMS_LEAF_KEY) {
            revert ReservedKeyIsNotARegistration(agreementKey);
        }
        if (bytes(contentURI).length == 0) revert EmptyContentURI();

        if (bindings[agreementKey].registeredAt != 0) revert AgreementAlreadyRegistered(agreementKey);

        bindings[agreementKey] = AgreementBinding({
            registeredBy: msg.sender,
            registeredAt: uint64(block.timestamp),
            depositWithdrawn: false,
            contentURI: contentURI
        });

        emit AgreementRegistered(agreementKey, msg.sender, contentURI);
    }

    // ── Stake withdrawal (registeredBy-only) ────────────────────────────

    /// @notice Reclaim the registration stake. The binding is NOT cleared —
    ///         only the stake moves; readers stop offering the agreement for new
    ///         compositions (assemblies composed from it still hydrate). Callable only by the stored
    ///         `registeredBy`, and only once per binding.
    /// @dev The commits == resolves gate is protocol-surface (indexer count;
    ///      see the contract notice).
    /// @param agreementKey The agreement whose stake to withdraw.
    function withdrawDeposit(bytes32 agreementKey) external {
        AgreementBinding storage binding = bindings[agreementKey];
        if (binding.registeredAt == 0) revert NotRegistered();
        if (msg.sender != binding.registeredBy) revert NotRegisteredBy(msg.sender, binding.registeredBy);
        if (binding.depositWithdrawn) revert AlreadyWithdrawn();

        // Checks-effects-interactions: flag THEN transfer.
        binding.depositWithdrawn = true;
        emit DepositWithdrawn(agreementKey, msg.sender, registrationDeposit);

        (bool ok,) = msg.sender.call{value: registrationDeposit}("");
        if (!ok) revert TransferFailed();
    }
}

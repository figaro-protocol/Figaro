// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "./FigaroCore.sol";
import "./CommitmentTypes.sol";
import "./IRoleResolver.sol";

/// @title AttestationCoordinator — Unified stateless attestation
/// @custom:security-contact security@figaro.org
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice Zero-storage, role-gated attestation coordinator. Emits
///         schema-typed attestation events for lifecycle, GHG, proximity,
///         and any future attestation domain.
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any kind, express or implied. No liability is accepted for loss, damages, or bugs. Use at your own risk.
///
///         The current kernel stores no per-order data — only a 1-byte
///         nullifier (`orderStatus`) and a process accumulator. Role
///         verification works by having callers supply the commitment
///         struct; the coordinator recomputes the orderHash to verify
///         the order exists and extracts the role from the struct.
///
/// @dev Three attestation modes:
///      - attestAsSeller:    caller provides their commitment to prove seller role
///      - attestAsBuyer:     caller provides processId; buyer is in ProcessState
///      - attestViaResolver: caller provides commitment; seller implements IRoleResolver
contract AttestationCoordinator {
    using CommitmentTypes for CommitmentTypes.Commitment;

    FigaroCore public immutable core;

    // ── Events ──────────────────────────────────────────────────────

    /// @notice A role-gated attestation against a registered schema.
    event Attestation(
        bytes32 indexed orderHash,
        bytes32 indexed processId,
        address indexed attester,
        bytes32 schemaId,
        uint8 stage,
        bytes32 contentRef
    );

    // ── Errors ──────────────────────────────────────────────────────

    error NotAuthorized();
    error ProcessMismatch();
    error UnknownOrder();

    // ── Constructor ─────────────────────────────────────────────────

    constructor(address _core) {
        require(_core != address(0), "ZeroAddress");
        core = FigaroCore(_core);
    }

    // ── Seller attestations ─────────────────────────────────────────

    /// @notice Attest as the seller of an order.
    /// @param roleCommitment The commitment proving the caller's seller role.
    ///        The coordinator recomputes orderHash and verifies it exists.
    /// @param orderHash The order being attested (may differ from role order
    ///        for cross-order attestation within the same process).
    /// @param schemaId  Schema defining the attestation vocabulary.
    /// @param stage     Numeric stage within the schema.
    /// @param contentRef Optional off-chain evidence reference (0 if none).
    function attestAsSeller(
        CommitmentTypes.Commitment calldata roleCommitment,
        bytes32 orderHash,
        bytes32 schemaId,
        uint8 stage,
        bytes32 contentRef
    ) external {
        bytes32 processId = _verifySeller(roleCommitment, orderHash);
        emit Attestation(orderHash, processId, msg.sender, schemaId, stage, contentRef);
    }

    // ── Buyer attestations ──────────────────────────────────────────

    /// @notice Attest as the buyer of a process.
    /// @param processId The process the buyer belongs to.
    /// @param orderHash The order being attested.
    /// @param schemaId  Schema defining the attestation vocabulary.
    /// @param stage     Numeric stage within the schema.
    /// @param contentRef Optional off-chain evidence reference (0 if none).
    function attestAsBuyer(bytes32 processId, bytes32 orderHash, bytes32 schemaId, uint8 stage, bytes32 contentRef)
        external
    {
        _verifyBuyer(processId, orderHash);
        emit Attestation(orderHash, processId, msg.sender, schemaId, stage, contentRef);
    }

    // ── Mechanism-delegated attestations ─────────────────────────────

    /// @notice Attest via the order's seller (mechanism contract).
    /// @dev The seller extracted from the commitment must implement IRoleResolver.
    /// @param commitment The commitment whose seller implements IRoleResolver.
    /// @param schemaId  Schema defining the attestation vocabulary.
    /// @param stage     Numeric stage within the schema.
    /// @param contentRef Optional off-chain evidence reference (0 if none).
    function attestViaResolver(
        CommitmentTypes.Commitment calldata commitment,
        bytes32 schemaId,
        uint8 stage,
        bytes32 contentRef
    ) external {
        (bytes32 orderHash, bytes32 processId) = _requireKnownCommitment(commitment);
        address seller = commitment.seller;
        if (!IRoleResolver(seller).isAuthorized(orderHash, msg.sender)) {
            revert NotAuthorized();
        }
        emit Attestation(orderHash, processId, msg.sender, schemaId, stage, contentRef);
    }

    // ── Internal ────────────────────────────────────────────────────

    /// @dev Recompute orderHash from commitment, verify it exists in Core.
    function _requireKnownCommitment(CommitmentTypes.Commitment calldata c)
        internal
        view
        returns (bytes32 orderHash, bytes32 processId)
    {
        processId = c.processId == bytes32(0) ? _computeDigest(c) : c.processId;

        bytes32 structHash = c.hashStruct();
        orderHash = keccak256(abi.encodePacked(processId, structHash));

        if (core.orderStatus(orderHash) == 0) revert UnknownOrder();
    }

    /// @dev Verify msg.sender is seller of roleCommitment; enforce same process.
    function _verifySeller(CommitmentTypes.Commitment calldata roleCommitment, bytes32 orderHash)
        internal
        view
        returns (bytes32 processId)
    {
        bytes32 roleOrderHash;
        (roleOrderHash, processId) = _requireKnownCommitment(roleCommitment);
        if (roleCommitment.seller != msg.sender) revert NotAuthorized();

        // Same-order attestation: no cross-check needed
        if (roleOrderHash == orderHash) return processId;

        bytes32 targetProcessId = core.orderProcessId(orderHash);
        if (targetProcessId == bytes32(0)) revert UnknownOrder();
        if (targetProcessId != processId) revert ProcessMismatch();
    }

    /// @dev Verify msg.sender is root buyer of the process; enforce same process.
    function _verifyBuyer(bytes32 processId, bytes32 orderHash) internal view {
        (address rootBuyer,,,) = core.processes(processId);
        if (rootBuyer == address(0)) revert UnknownOrder();
        if (rootBuyer != msg.sender) revert NotAuthorized();
        bytes32 targetProcessId = core.orderProcessId(orderHash);
        if (targetProcessId == bytes32(0)) revert UnknownOrder();
        if (targetProcessId != processId) revert ProcessMismatch();
    }

    /// @dev Compute the EIP-712 digest for a root commitment (processId derivation).
    ///      Binds to FigaroCore.DOMAIN_SEPARATOR() so there is a single source
    ///      of truth for the domain and no risk of silent drift if FigaroCore's
    ///      domain inputs ever change.
    function _computeDigest(CommitmentTypes.Commitment calldata c) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", core.DOMAIN_SEPARATOR(), c.hashStruct()));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "src/kernel/CommitmentTypes.sol";
import "./IRoleResolver.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @notice Minimal FigaroCore surface the coordinator reads.
interface IFigaroCore {
    function orderStatus(bytes32 orderHash) external view returns (uint8);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

/// @title AttestationCoordinator — Merkle-gated stateless attestation
/// @custom:security-contact figarosecurity@gmail.com
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice Zero-storage, role-gated, merkle-gated attestation coordinator.
///         Emits clause-typed attestation events for lifecycle, emissions, proximity,
///         and any future attestation domain.
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any kind, express or implied. No liability is accepted for loss, damages, or bugs. Use at your own risk.
///
///         The current kernel stores no per-order data — only a 1-byte
///         nullifier (`orderStatus`) and a process accumulator. Role
///         verification works by having callers supply the commitment
///         struct; the coordinator recomputes the orderHash to verify
///         the order exists and extracts the role from the struct.
///
/// @dev Three attestation modes — each caller supplies one or two `Commitment`
///      structs so the coordinator can (a) verify role authority, (b) read the
///      signed `agreementHash` without new kernel state, and (c) verify the
///      attestation matches a clause in the signed contract.
///      - attestAsSeller:    caller supplies role + target commitments
///                           (role proves seller identity + process; target
///                           carries the order being attested and its
///                           agreementHash for the receipt). For same-order
///                           attestation pass the same commitment twice.
///      - attestAsBuyer:     caller supplies the target commitment only
///                           (`c.buyer == processes[c.processId].rootBuyer` by
///                           commit invariant, so `msg.sender == c.buyer`
///                           authorizes the call).
///      - attestViaResolver: caller supplies the target commitment only; the
///                           seller address must authorize `msg.sender` via
///                           `IRoleResolver`.
///
/// @dev Agreement binding (mandatory):
///      Every `attest*` call carries an inclusion proof showing the attestation's
///      clause and clause data are leaves of the order's signed `agreementHash`
///      merkle root. A seller who signed an emissions clause naming "ISO 14064-1" at commit
///      time cannot fire a runtime emissions attestation under a different standard —
///      the inclusion proof won't open. This closes the drift where runtime
///      declarations could contradict the signed contract.
///
///      Leaf format: `keccak256(bytes.concat(keccak256(abi.encodePacked(clauseId, keccak256(sectionData)))))`
///      — double-hashed so the leaf domain (32-byte preimage) can never collide
///      with the internal-node domain (64-byte preimage); a crafted agreement
///      cannot replay one of its own internal nodes as a signed section leaf.
///      Tree: OpenZeppelin `MerkleProof` with sorted-pair hashing.
///      Empty / unbound attestation is blocked — callers must prove a clause.
///
/// @dev Content encoding:
///      `content` is ABI-encoded per the clause's spec (off-chain JSON spec
///      anchored via ClauseRegistry.uriHash). The chain does not decode or
///      validate it — well-formedness is the off-chain SDK's job (honest
///      authors) and a read-time concern (downstream forums reject garbage).
///      The on-chain `contentRef` recorded in the Attestation event is
///      `keccak256(content)` — content is cryptographically bound to its hash.
contract AttestationCoordinator {
    using CommitmentTypes for CommitmentTypes.Commitment;

    IFigaroCore public immutable core;

    // ── Events ──────────────────────────────────────────────────────

    /// @notice A role-gated, merkle-checked attestation against a signed clause.
    /// @dev `contentRef` is always `keccak256(content)` — content is bound to its hash on-chain.
    event Attestation(
        bytes32 indexed orderHash,
        bytes32 indexed processId,
        address indexed attester,
        bytes32 clauseId,
        uint8 stage,
        bytes32 contentRef
    );

    // ── Errors ──────────────────────────────────────────────────────

    error NotAuthorized();
    error ProcessMismatch();
    error UnknownOrder();
    error OrderResolved();
    error InvalidInclusionProof(bytes32 agreementHash, bytes32 clauseId);

    // ── Constructor ─────────────────────────────────────────────────

    constructor(address _core) {
        require(_core != address(0), "ZeroAddress");
        core = IFigaroCore(_core);
    }

    // ── Seller attestations ─────────────────────────────────────────

    /// @notice Attest as the seller of `role`, against the order in `target`.
    /// @dev For same-order attestation pass the same commitment twice. For
    ///      cross-order attestation within the same process (e.g. a seller
    ///      attesting a lifecycle stage against the root order using their
    ///      sub-order commitment as role), pass distinct `role` and `target`
    ///      commitments — the coordinator verifies both are committed and in
    ///      the same process. The inclusion proof is verified against
    ///      `target.agreementHash` (the clause being declared lives in the
    ///      target's signed contract, not the role's).
    function attestAsSeller(
        CommitmentTypes.Commitment calldata role,
        CommitmentTypes.Commitment calldata target,
        bytes32 clauseId,
        uint8 stage,
        bytes calldata sectionData,
        bytes32[] calldata proof,
        bytes calldata content
    ) external {
        (, bytes32 roleProcessId) = _requireKnownCommitment(role);
        if (role.seller != msg.sender) revert NotAuthorized();

        (bytes32 targetOrderHash, bytes32 targetProcessId) = _requireKnownCommitment(target);
        if (roleProcessId != targetProcessId) revert ProcessMismatch();

        bytes32 contentRef = _verifyInclusion(target.agreementHash, clauseId, sectionData, proof, content);
        emit Attestation(targetOrderHash, targetProcessId, msg.sender, clauseId, stage, contentRef);
    }

    // ── Buyer attestations ──────────────────────────────────────────

    /// @notice Attest as the buyer of the target order.
    /// @dev `msg.sender` must equal `target.buyer`. By commit invariant,
    ///      `target.buyer == processes[target.processId].rootBuyer` for every
    ///      committed order, so this authorizes the rootBuyer for any order
    ///      in their process (covering the cross-order case implicitly —
    ///      pass the target order's commitment).
    function attestAsBuyer(
        CommitmentTypes.Commitment calldata target,
        bytes32 clauseId,
        uint8 stage,
        bytes calldata sectionData,
        bytes32[] calldata proof,
        bytes calldata content
    ) external {
        (bytes32 targetOrderHash, bytes32 targetProcessId) = _requireKnownCommitment(target);
        if (msg.sender != target.buyer) revert NotAuthorized();

        bytes32 contentRef = _verifyInclusion(target.agreementHash, clauseId, sectionData, proof, content);
        emit Attestation(targetOrderHash, targetProcessId, msg.sender, clauseId, stage, contentRef);
    }

    // ── Mechanism-delegated attestations ─────────────────────────────

    /// @notice Attest via the target order's seller (mechanism contract).
    /// @dev The seller extracted from the commitment must implement IRoleResolver
    ///      and return `true` for `isAuthorized(orderHash, msg.sender)`.
    function attestViaResolver(
        CommitmentTypes.Commitment calldata target,
        bytes32 clauseId,
        uint8 stage,
        bytes calldata sectionData,
        bytes32[] calldata proof,
        bytes calldata content
    ) external {
        (bytes32 targetOrderHash, bytes32 targetProcessId) = _requireKnownCommitment(target);
        if (!IRoleResolver(target.seller).isAuthorized(targetOrderHash, msg.sender)) {
            revert NotAuthorized();
        }

        bytes32 contentRef = _verifyInclusion(target.agreementHash, clauseId, sectionData, proof, content);
        emit Attestation(targetOrderHash, targetProcessId, msg.sender, clauseId, stage, contentRef);
    }

    // ── Internal ────────────────────────────────────────────────────

    /// @dev Verify the clause is a committed leaf of the order's signed
    ///      agreement and return the runtime content's hash. The chain binds
    ///      the attestation to the signed contract (merkle inclusion) and to
    ///      its content (`keccak256(content)`); it does not validate content
    ///      shape — that is an off-chain SDK / read-time concern.
    ///      Leaf = `keccak256(keccak256(clauseId || keccak256(sectionData)))`
    ///      (double-hashed — leaf/node domain separation), sorted-pair merkle
    ///      tree as produced by the off-chain agreement helpers.
    function _verifyInclusion(
        bytes32 agreementHash,
        bytes32 clauseId,
        bytes calldata sectionData,
        bytes32[] calldata proof,
        bytes calldata content
    ) internal pure returns (bytes32) {
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encodePacked(clauseId, keccak256(sectionData)))));
        if (!MerkleProof.verify(proof, agreementHash, leaf)) {
            revert InvalidInclusionProof(agreementHash, clauseId);
        }

        return keccak256(content);
    }

    /// @dev Recompute orderHash from commitment, verify it is ACTIVE
    ///      (committed, unresolved) in Core. Attestation is runtime evidence
    ///      within an open process; `resolveProcess` dissolves the
    ///      transaction-scoped institution, so the evidence window closes with
    ///      it — a post-resolve attestation would dilute the finality the
    ///      resolve mechanism is designed to produce. Resolution is
    ///      process-atomic, so this gate is uniform across role and target.
    function _requireKnownCommitment(CommitmentTypes.Commitment calldata c)
        internal
        view
        returns (bytes32 orderHash, bytes32 processId)
    {
        processId = c.processId == bytes32(0) ? _computeDigest(c) : c.processId;

        bytes32 structHash = c.hashStruct();
        orderHash = keccak256(abi.encodePacked(processId, structHash));

        uint8 status = core.orderStatus(orderHash);
        if (status == 0) revert UnknownOrder();
        if (status != 1) revert OrderResolved();
    }

    /// @dev Compute the EIP-712 digest for a root commitment (processId derivation).
    ///      Binds to FigaroCore.DOMAIN_SEPARATOR() so there is a single source
    ///      of truth for the domain and no risk of silent drift if FigaroCore's
    ///      domain inputs ever change.
    function _computeDigest(CommitmentTypes.Commitment calldata c) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", core.DOMAIN_SEPARATOR(), c.hashStruct()));
    }
}

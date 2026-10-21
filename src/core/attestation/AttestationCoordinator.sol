// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "src/core/kernel/CommitmentTypes.sol";
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
///         The current FigaroCore stores no per-order data — only a 1-byte
///         nullifier (`orderStatus`) and a process accumulator. Role
///         verification works by having callers supply the commitment
///         struct; the coordinator recomputes the orderHash to verify
///         the order exists and extracts the role from the struct.
///
/// @dev Two attestation modes — each caller supplies the `Commitment` struct of
///      the order it attests about, so the coordinator can (a) verify the caller
///      is that order's party, (b) read the signed `checkoutHash` without new
///      FigaroCore state, and (c) verify the attestation matches a clause in the
///      signed agreement. A party attests about its own obligation, on its own
///      order.
///      - attestAsSeller:    `msg.sender == target.seller` authorizes the call.
///      - attestAsBuyer:     `msg.sender == target.buyer` authorizes the call
///                           (`c.buyer == processes[c.processId].rootBuyer` by
///                           commit invariant).
///
/// @dev Agreement binding (mandatory):
///      Every `attest*` call carries an inclusion proof showing the attestation's
///      clause and clause data are leaves of the order's signed `checkoutHash`
///      merkle root. A seller who signed an emissions clause naming "ISO 14064-1" at commit
///      time cannot fire a runtime emissions attestation under a different standard —
///      the inclusion proof won't open. This closes the drift where runtime
///      declarations could contradict the signed agreement.
///
///      Leaf format: `keccak256(bytes.concat(keccak256(abi.encodePacked(clauseId, keccak256(clauseData)))))`
///      — double-hashed so the leaf domain (32-byte preimage) can never collide
///      with the internal-node domain (64-byte preimage); a crafted agreement
///      cannot replay one of its own internal nodes as a signed clause leaf.
///      Tree: OpenZeppelin `MerkleProof` with sorted-pair hashing.
///      Empty / unbound attestation is blocked — callers must prove a clause.
///
/// @dev Content encoding:
///      An attestation's content is ABI-encoded per the clause's spec (off-chain
///      JSON spec whose pinned bytes hash to the clause key ClauseRegistry registers) and lives OFF-CHAIN — in
///      (optionally encrypted) IPFS for a `private`-disposition clause, in the
///      open for a `public` one. The chain never sees the preimage: the caller
///      supplies only `contentRef` (`keccak256(content)`) and `clauseDataHash`
///      (`keccak256(clauseData)`) — the FINGERPRINTS. So a private attestation's
///      plaintext never touches public, permanent calldata; only its hash does.
///      The chain does not decode or validate content — well-formedness is the
///      off-chain SDK's job (honest authors) and a read-time concern (downstream
///      forums reject garbage). The `contentRef` recorded in the Attestation
///      event binds the off-chain content to its hash, exactly as the batched
///      path's `bytes32` convention does.
contract AttestationCoordinator {
    using CommitmentTypes for CommitmentTypes.Commitment;

    IFigaroCore public immutable core;

    // ── Events ──────────────────────────────────────────────────────

    /// @notice A role-gated, merkle-checked attestation against a signed clause.
    /// @dev `contentRef` is the caller-supplied `keccak256(content)` — content is
    ///      bound to its hash, but the preimage lives off-chain, never in calldata.
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
    error UnknownOrder();
    error OrderResolved();
    error InvalidInclusionProof(bytes32 checkoutHash, bytes32 clauseId);

    // ── Constructor ─────────────────────────────────────────────────

    constructor(address _core) {
        require(_core != address(0), "ZeroAddress");
        core = IFigaroCore(_core);
    }

    // ── Seller attestations ─────────────────────────────────────────

    /// @notice Attest as the seller of the target order.
    /// @dev `msg.sender` must equal `target.seller`: a seller attests about a
    ///      clause of its own order, and of no other. The inclusion proof is
    ///      verified against `target.checkoutHash`.
    function attestAsSeller(
        CommitmentTypes.Commitment calldata target,
        bytes32 clauseId,
        uint8 stage,
        bytes32 clauseDataHash,
        bytes32[] calldata proof,
        bytes32 contentRef
    ) external {
        (bytes32 targetOrderHash, bytes32 targetProcessId) = _requireKnownCommitment(target);
        if (msg.sender != target.seller) revert NotAuthorized();

        _verifyInclusion(target.checkoutHash, clauseId, clauseDataHash, proof);
        emit Attestation(targetOrderHash, targetProcessId, msg.sender, clauseId, stage, contentRef);
    }

    // ── Buyer attestations ──────────────────────────────────────────

    /// @notice Attest as the buyer of the target order.
    /// @dev `msg.sender` must equal `target.buyer`. By commit invariant,
    ///      `target.buyer == processes[target.processId].rootBuyer` for every
    ///      committed order: the buyer is a party to every order of its
    ///      process, and attests on each by passing that order's commitment.
    function attestAsBuyer(
        CommitmentTypes.Commitment calldata target,
        bytes32 clauseId,
        uint8 stage,
        bytes32 clauseDataHash,
        bytes32[] calldata proof,
        bytes32 contentRef
    ) external {
        (bytes32 targetOrderHash, bytes32 targetProcessId) = _requireKnownCommitment(target);
        if (msg.sender != target.buyer) revert NotAuthorized();

        _verifyInclusion(target.checkoutHash, clauseId, clauseDataHash, proof);
        emit Attestation(targetOrderHash, targetProcessId, msg.sender, clauseId, stage, contentRef);
    }

    // ── Internal ────────────────────────────────────────────────────

    /// @dev Verify the clause is a committed leaf of the order's signed
    ///      agreement. The chain binds the attestation to the signed agreement
    ///      (merkle inclusion) and, separately, to its content (the caller's
    ///      `contentRef`, emitted verbatim); it does not validate content shape —
    ///      that is an off-chain SDK / read-time concern. The leaf is built from
    ///      the caller-supplied `clauseDataHash` (`keccak256(clauseData)`), never a
    ///      preimage, so a `private` clause's plaintext never touches calldata; a
    ///      wrong hash simply fails to open, so this is exactly as sound as taking
    ///      the preimage.
    ///      Leaf = `keccak256(keccak256(clauseId || clauseDataHash))` (double-hashed —
    ///      leaf/node domain separation), sorted-pair merkle tree as produced by
    ///      the off-chain agreement helpers.
    function _verifyInclusion(bytes32 checkoutHash, bytes32 clauseId, bytes32 clauseDataHash, bytes32[] calldata proof)
        internal
        pure
    {
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encodePacked(clauseId, clauseDataHash))));
        if (!MerkleProof.verify(proof, checkoutHash, leaf)) {
            revert InvalidInclusionProof(checkoutHash, clauseId);
        }
    }

    /// @dev Recompute orderHash from commitment, verify it is ACTIVE
    ///      (committed, unresolved) in Core. Attestation is runtime evidence
    ///      within an open process; `resolveProcess` dissolves the
    ///      transaction-scoped institution, so the evidence window closes with
    ///      it — a post-resolve attestation would dilute the finality the
    ///      resolve mechanism is designed to produce. Resolution is
    ///      process-atomic, so this gate is uniform across a process's orders.
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

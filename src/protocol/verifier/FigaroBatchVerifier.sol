// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "src/protocol/verifier/ISP1Verifier.sol";

/// @notice Minimal ClauseRegistry surface the verifier reads — the
///         integrity anchor for witness specs.
interface IClauseRegistryAnchor {
    function contentHashOf(bytes32 idHash) external view returns (bytes32);
}

/// @title FigaroBatchVerifier — Settles batched Figaro operations via SP1 proof
/// @custom:security-contact figarosecurity@gmail.com
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice Accepts a zero-knowledge proof that a batch of protocol operations
///         (commits, resolves, attestations) produces a valid state transition.
///         The contract verifies the proof, checks every witness-spec binding
///         against the live ClauseRegistry, reconciles net token positions,
///         re-emits protocol-compatible attestation events, and advances the
///         state root. Registry mutations are NOT batched — they are
///         once-per-artifact ETH-staked intents that stay on the direct path.
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any kind, express or implied. No liability is accepted for loss, damages, or bugs. Use at your own risk.
///
///         Kernel philosophy: no owner, no fee, no upgrade path. If the program
///         changes, deploy a new verifier.
///
///         The spec-binding check is what makes the in-proof clause validation
///         OPEN-WORLD: the guest validates content against a witness spec and
///         commits (clause key → keccak256(spec bytes)); this contract accepts
///         the batch only if each binding equals
///         `ClauseRegistry.contentHashOf(clauseKey)`. The program verification
///         key covers the ENGINE, the registry anchors the constraint set —
///         a never-seen clause settles through the proven path with zero code
///         changes, and a permissive-spec substitution cannot settle.
///
///         Public values (ABI-encoded, 7 × 32-byte words):
///           0: prevStateRoot     (bytes32)
///           1: newStateRoot      (bytes32)
///           2: chainId           (uint64, left-padded to 32 bytes)
///           3: verifyingContract (address, left-padded to 32 bytes)
///           4: tokenOpsHash      (bytes32)
///           5: attestationEventsHash (bytes32)
///           6: specBindingsHash  (bytes32)
contract FigaroBatchVerifier is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Immutables ────────────────────────────────────────────────

    ISP1Verifier public immutable verifier;
    bytes32 public immutable programVKey;
    IClauseRegistryAnchor public immutable clauseRegistry;

    // ── State ─────────────────────────────────────────────────────

    bytes32 public stateRoot;
    uint64 public batchCount;

    // ── Structs (calldata-submitted, hash-verified) ───────────────

    struct NetPosition {
        address token;
        address user;
        uint256 deposit;
        uint256 payout;
    }

    struct AttestationData {
        bytes32 orderHash;
        bytes32 processId;
        address attester;
        bytes32 clauseId;
        uint8 stage;
        bytes32 contentRef;
    }

    /// @dev One (clause key → witness-spec hash) binding the batch's
    ///      in-proof clause gates validated against. Deduplicated and
    ///      sorted ascending by (clauseId, specHash) in the prover.
    struct SpecBinding {
        bytes32 clauseId;
        bytes32 specHash;
    }

    /// @dev Wraps the event arrays to reduce settleBatch parameter count
    ///      and avoid stack-too-deep.
    struct BatchEventData {
        AttestationData[] attestations;
        SpecBinding[] specBindings;
    }

    // ── Events (protocol-compatible re-emissions) ─────────────────

    /// @notice Summary event emitted per settled batch.
    event BatchSettled(
        uint64 indexed batchId, bytes32 indexed prevStateRoot, bytes32 indexed newStateRoot, uint256 positionCount
    );

    /// @dev WARNING: This event shares its topic hash with AttestationCoordinator.Attestation.
    ///      Indexers MUST filter by contract address to distinguish batch from direct events.
    event Attestation(
        bytes32 indexed orderHash,
        bytes32 indexed processId,
        address indexed attester,
        bytes32 clauseId,
        uint8 stage,
        bytes32 contentRef
    );

    // ── Errors ────────────────────────────────────────────────────

    error StateRootMismatch(bytes32 expected, bytes32 actual);
    error ChainIdMismatch(uint64 expected, uint64 actual);
    error VerifyingContractMismatch(address expected, address actual);
    error PositionHashMismatch();
    error AttestationHashMismatch();
    error SpecBindingsHashMismatch();
    /// @dev The proof validated content against a spec the registry does
    ///      not anchor for this clause key — including the unregistered
    ///      case (`contentHashOf` returns zero, which never equals a
    ///      witness spec's hash).
    error SpecBindingMismatch(bytes32 clauseId, bytes32 anchored, bytes32 proven);
    error FeeOnTransferDetected();
    error ZeroVerifier();
    error VerifierNotContract();
    error ZeroClauseRegistry();

    // ── Constructor ───────────────────────────────────────────────

    /// @param _verifier       Address of the SP1 verifier gateway (or mock).
    /// @param _programVKey    The verification key of the Figaro kernel program.
    /// @param _clauseRegistry The live ClauseRegistry — the witness-spec anchor.
    /// @param _initialRoot    The initial state root (genesis or migrated from prior verifier).
    constructor(address _verifier, bytes32 _programVKey, address _clauseRegistry, bytes32 _initialRoot) {
        if (_verifier == address(0)) revert ZeroVerifier();
        if (_verifier.code.length == 0) revert VerifierNotContract();
        if (_clauseRegistry == address(0)) revert ZeroClauseRegistry();
        verifier = ISP1Verifier(_verifier);
        programVKey = _programVKey;
        clauseRegistry = IClauseRegistryAnchor(_clauseRegistry);
        stateRoot = _initialRoot;
    }

    // ── Internal decode struct (avoids stack-too-deep) ─────────

    struct DecodedPV {
        bytes32 prevRoot;
        bytes32 newRoot;
        uint64 chainId;
        address verifyingContract;
        bytes32 tokenOpsHash;
        bytes32 attEventsHash;
        bytes32 specBindingsHash;
    }

    // ── Batch settlement ──────────────────────────────────────────

    /// @notice Settle a batch of Figaro protocol operations.
    /// @param proof        The SP1 validity proof for the batch.
    /// @param publicValues ABI-encoded public values (7 × 32-byte words).
    /// @param positions    Net token positions to reconcile (hash-verified against proof).
    /// @param events       Attestation events to re-emit + spec bindings to
    ///                     check against the ClauseRegistry (both hash-verified).
    function settleBatch(
        bytes calldata proof,
        bytes calldata publicValues,
        NetPosition[] calldata positions,
        BatchEventData calldata events
    ) external nonReentrant {
        // ── 1. Verify the SP1 proof ───────────────────────────────
        verifier.verifyProof(programVKey, publicValues, proof);

        // ── 2. Decode and validate public values ──────────────────
        DecodedPV memory pv = _decodePV(publicValues);

        if (pv.prevRoot != stateRoot) {
            revert StateRootMismatch(stateRoot, pv.prevRoot);
        }
        if (pv.chainId != uint64(block.chainid)) {
            revert ChainIdMismatch(uint64(block.chainid), pv.chainId);
        }
        if (pv.verifyingContract != address(this)) {
            revert VerifyingContractMismatch(address(this), pv.verifyingContract);
        }

        // ── 3. Verify auxiliary data hashes ───────────────────────
        if (_hashPositions(positions) != pv.tokenOpsHash) {
            revert PositionHashMismatch();
        }
        if (_hashAttestations(events.attestations) != pv.attEventsHash) {
            revert AttestationHashMismatch();
        }
        if (_hashSpecBindings(events.specBindings) != pv.specBindingsHash) {
            revert SpecBindingsHashMismatch();
        }

        // ── 4. Anchor every witness spec to the live registry ─────
        _checkSpecBindings(events.specBindings);

        // ── 5. Execute token transfers ────────────────────────────
        _executePositions(positions);

        // ── 6. Re-emit protocol events ────────────────────────────
        _emitAttestations(events.attestations);

        // ── 7. Advance state ──────────────────────────────────────
        stateRoot = pv.newRoot;
        uint64 newBatchId = ++batchCount;

        emit BatchSettled(newBatchId, pv.prevRoot, pv.newRoot, positions.length);
    }

    // ── Decode helper ─────────────────────────────────────────────

    function _decodePV(bytes calldata publicValues) internal pure returns (DecodedPV memory pv) {
        (
            pv.prevRoot,
            pv.newRoot,
            pv.chainId,
            pv.verifyingContract,
            pv.tokenOpsHash,
            pv.attEventsHash,
            pv.specBindingsHash
        ) = abi.decode(publicValues, (bytes32, bytes32, uint64, address, bytes32, bytes32, bytes32));
    }

    // ── Hash functions (byte-exact parity with Rust kernel) ───────

    /// @dev Pack: token(20) + user(20) + deposit(32) + payout(32) = 104 bytes per position.
    function _hashPositions(NetPosition[] calldata positions) internal pure returns (bytes32) {
        uint256 len = positions.length;
        bytes memory packed = new bytes(len * 104);
        uint256 offset;
        for (uint256 i = 0; i < len; i++) {
            address token = positions[i].token;
            address user = positions[i].user;
            uint256 dep = positions[i].deposit;
            uint256 pay = positions[i].payout;
            assembly {
                let dst := add(add(packed, 32), offset)
                mstore(dst, shl(96, token))
                mstore(add(dst, 20), shl(96, user))
                mstore(add(dst, 40), dep)
                mstore(add(dst, 72), pay)
            }
            offset += 104;
        }
        return keccak256(packed);
    }

    /// @dev Pack: orderHash(32) + processId(32) + attester(20) + clauseId(32) + stage(1) + contentRef(32)
    ///      = 149 bytes per attestation.
    function _hashAttestations(AttestationData[] calldata attestations) internal pure returns (bytes32) {
        uint256 len = attestations.length;
        bytes memory packed = new bytes(len * 149);
        uint256 offset;
        for (uint256 i = 0; i < len; i++) {
            bytes32 orderHash = attestations[i].orderHash;
            bytes32 processId = attestations[i].processId;
            address attester = attestations[i].attester;
            bytes32 clauseId = attestations[i].clauseId;
            uint8 stage = attestations[i].stage;
            bytes32 contentRef = attestations[i].contentRef;
            assembly {
                let dst := add(add(packed, 32), offset)
                mstore(dst, orderHash)
                mstore(add(dst, 32), processId)
                mstore(add(dst, 64), shl(96, attester))
                mstore(add(dst, 84), clauseId)
                // stage is 1 byte at offset 116
                mstore8(add(dst, 116), stage)
                mstore(add(dst, 117), contentRef)
            }
            offset += 149;
        }
        return keccak256(packed);
    }

    /// @dev Pack: clauseId(32) + specHash(32) = 64 bytes per binding,
    ///      matching the Rust `compute_spec_bindings_hash`.
    function _hashSpecBindings(SpecBinding[] calldata bindings) internal pure returns (bytes32) {
        uint256 len = bindings.length;
        bytes memory packed = new bytes(len * 64);
        uint256 offset;
        for (uint256 i = 0; i < len; i++) {
            bytes32 clauseId = bindings[i].clauseId;
            bytes32 specHash = bindings[i].specHash;
            assembly {
                let dst := add(add(packed, 32), offset)
                mstore(dst, clauseId)
                mstore(add(dst, 32), specHash)
            }
            offset += 64;
        }
        return keccak256(packed);
    }

    // ── Spec-binding anchor check ─────────────────────────────────

    /// @dev The open-world gate: each witness spec the proof validated
    ///      against must be the exact document the registry anchors for
    ///      that clause key. One SLOAD-backed external view call per
    ///      distinct clause per batch (the prover deduplicates).
    function _checkSpecBindings(SpecBinding[] calldata bindings) internal view {
        for (uint256 i = 0; i < bindings.length; i++) {
            bytes32 anchored = clauseRegistry.contentHashOf(bindings[i].clauseId);
            if (anchored != bindings[i].specHash) {
                revert SpecBindingMismatch(bindings[i].clauseId, anchored, bindings[i].specHash);
            }
        }
    }

    // ── Token execution ───────────────────────────────────────────

    /**
     * @dev BATCH SETTLEMENT DOS RISK
     * If any user in a batch revokes approval before settleBatch executes, the entire batch reverts.
     * Mitigation: Sequencer MUST verify approvals immediately before proof submission.
     * Users SHOULD maintain approvals until batch settlement is confirmed.
     * See audit finding L-6.
     */

    /// @dev Reconcile net positions. For each (token, user):
    ///      - deposit > payout → pull (deposit - payout) from user
    ///      - payout > deposit → push (payout - deposit) to user
    ///      Users must have approved this contract for their net deposit.
    function _executePositions(NetPosition[] calldata positions) internal {
        for (uint256 i = 0; i < positions.length; i++) {
            NetPosition calldata p = positions[i];

            if (p.deposit > p.payout) {
                // User owes — pull net deposit
                _pullExact(IERC20(p.token), p.user, p.deposit - p.payout);
            } else if (p.payout > p.deposit) {
                uint256 net = p.payout - p.deposit;
                // Only normal settlement — transfer from contract balance
                IERC20(p.token).safeTransfer(p.user, net);
            }
            // deposit == payout → no transfer needed
        }
    }

    /// @dev Pull exactly `amount` from `from`. Rejects fee-on-transfer tokens.
    ///      Matches FigaroCore._pullExact() pattern.
    function _pullExact(IERC20 token, address from, uint256 amount) internal {
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        if (token.balanceOf(address(this)) - before != amount) {
            revert FeeOnTransferDetected();
        }
    }

    // ── Event re-emission ─────────────────────────────────────────

    function _emitAttestations(AttestationData[] calldata attestations) internal {
        for (uint256 i = 0; i < attestations.length; i++) {
            emit Attestation(
                attestations[i].orderHash,
                attestations[i].processId,
                attestations[i].attester,
                attestations[i].clauseId,
                attestations[i].stage,
                attestations[i].contentRef
            );
        }
    }
}

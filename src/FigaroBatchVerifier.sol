// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/ISP1Verifier.sol";

/// @title FigaroBatchVerifier — Settles batched Figaro operations via SP1 proof
/// @custom:security-contact security@figaro.org
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice Accepts a zero-knowledge proof that a batch of protocol operations
///         (commits, resolves, attestations, schema registrations, operator
///         mutations) produces a valid state transition. The contract verifies
///         the proof, reconciles net token positions, re-emits protocol-
///         compatible events, and advances the state root.
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any kind, express or implied. No liability is accepted for loss, damages, or bugs. Use at your own risk.
///
///         Kernel philosophy: no owner, no fee, no upgrade path. If the program
///         changes, deploy a new verifier.
///
///         Public values (ABI-encoded, 8 × 32-byte words):
///           0: prevStateRoot   (bytes32)
///           1: newStateRoot    (bytes32)
///           2: chainId         (uint64, left-padded to 32 bytes)
///           3: verifyingContract (address, left-padded to 32 bytes)
///           4: tokenOpsHash    (bytes32)
///           5: attestationEventsHash (bytes32)
///           6: schemaEventsHash (bytes32)
///           7: operatorEventsHash (bytes32)
contract FigaroBatchVerifier is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Immutables ────────────────────────────────────────────────

    ISP1Verifier public immutable verifier;
    bytes32 public immutable programVKey;

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
        bytes32 schemaId;
        uint8 stage;
        bytes32 contentRef;
    }

    struct SchemaData {
        bytes32 schemaId;
        uint64 version;
        bytes32 uriHash;
        address registrar;
    }

    struct MechanismSchemaData {
        address mechanism;
        bytes32 schemaId;
    }

    /// @dev Operator events are a tagged union in the prover.
    ///      tag: 1=Registered, 2=Updated, 3=Deactivated, 4=Reactivated
    ///      role + metadataURI are only used for tags 1 and 2.
    struct OperatorEventInput {
        uint8 tag;
        address operator;
        uint8 role;
        string metadataURI;
    }

    /// @dev Wraps all event arrays to reduce settleBatch parameter count
    ///      and avoid stack-too-deep.
    struct BatchEventData {
        AttestationData[] attestations;
        SchemaData[] schemas;
        MechanismSchemaData[] mechanismSchemas;
        OperatorEventInput[] operatorEvents;
    }

    // ── Events (protocol-compatible re-emissions) ─────────────────

    /// @notice Summary event emitted per settled batch.
    /// @dev WARNING: Batch events use the same topic hashes as direct-path events (AttestationCoordinator, SchemaRegistry, OperatorRegistry).
    ///      Indexers MUST filter by contract address to distinguish batch from direct events. See audit finding M-3.
    event BatchSettled(
        uint64 indexed batchId, bytes32 indexed prevStateRoot, bytes32 indexed newStateRoot, uint256 positionCount
    );

    /// @dev WARNING: This event shares its topic hash with AttestationCoordinator.Attestation. Indexers MUST filter by contract address.
    event Attestation(
        bytes32 indexed orderHash,
        bytes32 indexed processId,
        address indexed attester,
        bytes32 schemaId,
        uint8 stage,
        bytes32 contentRef
    );

    /// @dev WARNING: This event shares its topic hash with SchemaRegistry.SchemaRegistered. Indexers MUST filter by contract address.
    event SchemaRegistered(bytes32 indexed schemaId, uint64 version, bytes32 uriHash, address indexed registrar);

    /// @dev WARNING: This event shares its topic hash with SchemaRegistry.MechanismSchemaSet. Indexers MUST filter by contract address.
    event MechanismSchemaSet(address indexed mechanism, bytes32 indexed schemaId);

    /// @dev WARNING: This event shares its topic hash with OperatorRegistry.OperatorRegistered. Indexers MUST filter by contract address.
    event OperatorRegistered(address indexed operator, uint8 role, string metadataURI);

    /// @dev WARNING: This event shares its topic hash with OperatorRegistry.OperatorUpdated. Indexers MUST filter by contract address.
    event OperatorUpdated(address indexed operator, uint8 role, string metadataURI);

    /// @dev WARNING: This event shares its topic hash with OperatorRegistry.OperatorDeactivated. Indexers MUST filter by contract address.
    event OperatorDeactivated(address indexed operator);
    /// @dev WARNING: This event shares its topic hash with OperatorRegistry.OperatorReactivated. Indexers MUST filter by contract address.
    event OperatorReactivated(address indexed operator);

    // ── Errors ────────────────────────────────────────────────────

    error StateRootMismatch(bytes32 expected, bytes32 actual);
    error ChainIdMismatch(uint64 expected, uint64 actual);
    error VerifyingContractMismatch(address expected, address actual);
    error PositionHashMismatch();
    error AttestationHashMismatch();
    error SchemaHashMismatch();
    error OperatorHashMismatch();
    error InvalidOperatorTag(uint8 tag);
    error FeeOnTransferDetected();
    error ZeroVerifier();
    error VerifierNotContract();

    // ── Constructor ───────────────────────────────────────────────

    /// @param _verifier   Address of the SP1 verifier gateway (or mock).
    /// @param _programVKey The verification key of the Figaro kernel program.
    /// @param _initialRoot The initial state root (genesis or migrated from prior verifier).
    constructor(address _verifier, bytes32 _programVKey, bytes32 _initialRoot) {
        if (_verifier == address(0)) revert ZeroVerifier();
        if (_verifier.code.length == 0) revert VerifierNotContract();
        verifier = ISP1Verifier(_verifier);
        programVKey = _programVKey;
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
        bytes32 schEventsHash;
        bytes32 opEventsHash;
    }

    // ── Batch settlement ──────────────────────────────────────────

    /// @notice Settle a batch of Figaro protocol operations.
    /// @param proof        The SP1 validity proof for the batch.
    /// @param publicValues ABI-encoded public values (8 × 32-byte words).
    /// @param positions    Net token positions to reconcile (hash-verified against proof).
    /// @param events       Attestation, schema, and operator events to re-emit (hash-verified).
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
        if (_hashSchemas(events.schemas, events.mechanismSchemas) != pv.schEventsHash) revert SchemaHashMismatch();
        if (_hashOperatorEvents(events.operatorEvents) != pv.opEventsHash) {
            revert OperatorHashMismatch();
        }

        // ── 4. Execute token transfers ────────────────────────────
        _executePositions(positions);

        // ── 5. Re-emit protocol events ────────────────────────────
        _emitAttestations(events.attestations);
        _emitSchemas(events.schemas, events.mechanismSchemas);
        _emitOperatorEvents(events.operatorEvents);

        // ── 6. Advance state ──────────────────────────────────────
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
            pv.schEventsHash,
            pv.opEventsHash
        ) = abi.decode(publicValues, (bytes32, bytes32, uint64, address, bytes32, bytes32, bytes32, bytes32));
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

    /// @dev Pack: orderHash(32) + processId(32) + attester(20) + schemaId(32) + stage(1) + contentRef(32)
    ///      = 149 bytes per attestation.
    function _hashAttestations(AttestationData[] calldata attestations) internal pure returns (bytes32) {
        uint256 len = attestations.length;
        bytes memory packed = new bytes(len * 149);
        uint256 offset;
        for (uint256 i = 0; i < len; i++) {
            bytes32 orderHash = attestations[i].orderHash;
            bytes32 processId = attestations[i].processId;
            address attester = attestations[i].attester;
            bytes32 schemaId = attestations[i].schemaId;
            uint8 stage = attestations[i].stage;
            bytes32 contentRef = attestations[i].contentRef;
            assembly {
                let dst := add(add(packed, 32), offset)
                mstore(dst, orderHash)
                mstore(add(dst, 32), processId)
                mstore(add(dst, 64), shl(96, attester))
                mstore(add(dst, 84), schemaId)
                // stage is 1 byte at offset 116
                mstore8(add(dst, 116), stage)
                mstore(add(dst, 117), contentRef)
            }
            offset += 149;
        }
        return keccak256(packed);
    }

    /// @dev Schemas: schemaId(32) + version(8) + uriHash(32) + registrar(20) = 92 bytes each.
    ///      Mechanisms: mechanism(20) + schemaId(32) = 52 bytes each.
    ///      Combined into one hash matching the Rust `compute_schema_events_hash`.
    function _hashSchemas(SchemaData[] calldata schemas, MechanismSchemaData[] calldata mechanisms)
        internal
        pure
        returns (bytes32)
    {
        uint256 sLen = schemas.length;
        uint256 mLen = mechanisms.length;
        bytes memory packed = new bytes(sLen * 92 + mLen * 52);
        uint256 offset;
        for (uint256 i = 0; i < sLen; i++) {
            bytes32 schemaId = schemas[i].schemaId;
            uint64 version = schemas[i].version;
            bytes32 uriHash = schemas[i].uriHash;
            address registrar = schemas[i].registrar;
            assembly {
                let dst := add(add(packed, 32), offset)
                mstore(dst, schemaId)
                // version is uint64 = 8 bytes, big-endian at offset 32
                mstore(add(dst, 32), shl(192, version))
                mstore(add(dst, 40), uriHash)
                mstore(add(dst, 72), shl(96, registrar))
            }
            offset += 92;
        }
        for (uint256 i = 0; i < mLen; i++) {
            address mechanism = mechanisms[i].mechanism;
            bytes32 schemaId = mechanisms[i].schemaId;
            assembly {
                let dst := add(add(packed, 32), offset)
                mstore(dst, shl(96, mechanism))
                mstore(add(dst, 20), schemaId)
            }
            offset += 52;
        }
        return keccak256(packed);
    }

    /// @dev Tagged union matching Rust `compute_operator_events_hash`:
    ///      0x01 Registered:  tag(1) + operator(20) + role(1) + keccak256(metadataURI)(32) = 54
    ///      0x02 Updated:     tag(1) + operator(20) + role(1) + keccak256(metadataURI)(32) = 54
    ///      0x03 Deactivated: tag(1) + operator(20) = 21
    ///      0x04 Reactivated: tag(1) + operator(20) = 21
    function _hashOperatorEvents(OperatorEventInput[] calldata events) internal pure returns (bytes32) {
        // Variable-length records — compute total size first, then fill.
        uint256 len = events.length;
        uint256 totalBytes;
        for (uint256 i = 0; i < len; i++) {
            uint8 tag = events[i].tag;
            if (tag == 1 || tag == 2) {
                totalBytes += 54;
            } else if (tag == 3 || tag == 4) {
                totalBytes += 21;
            } else {
                revert InvalidOperatorTag(tag);
            }
        }
        bytes memory packed = new bytes(totalBytes);
        uint256 offset;
        for (uint256 i = 0; i < len; i++) {
            uint8 tag = events[i].tag;
            address op = events[i].operator;
            if (tag == 1 || tag == 2) {
                uint8 role = events[i].role;
                bytes32 uriHash = keccak256(bytes(events[i].metadataURI));
                assembly {
                    let dst := add(add(packed, 32), offset)
                    mstore8(dst, tag)
                    mstore(add(dst, 1), shl(96, op))
                    mstore8(add(dst, 21), role)
                    mstore(add(dst, 22), uriHash)
                }
                offset += 54;
            } else {
                assembly {
                    let dst := add(add(packed, 32), offset)
                    mstore8(dst, tag)
                    mstore(add(dst, 1), shl(96, op))
                }
                offset += 21;
            }
        }
        return keccak256(packed);
    }

    // ── Token execution ───────────────────────────────────────────

    /// @dev Reconcile net positions. For each (token, user):
    ///      - deposit > payout → pull (deposit - payout) from user
    ///      - payout > deposit → push (payout - deposit) to user
    ///      Emission logic removed.
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

    /**
     * @dev BATCH SETTLEMENT DOS RISK
     * If any user in a batch revokes approval before settleBatch executes, the entire batch reverts.
     * Mitigation: Sequencer MUST verify approvals immediately before proof submission.
     * Users SHOULD maintain approvals until batch settlement is confirmed.
     * See audit finding L-6.
     */

    function _emitAttestations(AttestationData[] calldata attestations) internal {
        for (uint256 i = 0; i < attestations.length; i++) {
            emit Attestation(
                attestations[i].orderHash,
                attestations[i].processId,
                attestations[i].attester,
                attestations[i].schemaId,
                attestations[i].stage,
                attestations[i].contentRef
            );
        }
    }

    function _emitSchemas(SchemaData[] calldata schemas, MechanismSchemaData[] calldata mechanisms) internal {
        for (uint256 i = 0; i < schemas.length; i++) {
            emit SchemaRegistered(schemas[i].schemaId, schemas[i].version, schemas[i].uriHash, schemas[i].registrar);
        }
        for (uint256 i = 0; i < mechanisms.length; i++) {
            emit MechanismSchemaSet(mechanisms[i].mechanism, mechanisms[i].schemaId);
        }
    }

    function _emitOperatorEvents(OperatorEventInput[] calldata events) internal {
        for (uint256 i = 0; i < events.length; i++) {
            uint8 tag = events[i].tag;
            if (tag == 1) {
                emit OperatorRegistered(events[i].operator, events[i].role, events[i].metadataURI);
            } else if (tag == 2) {
                emit OperatorUpdated(events[i].operator, events[i].role, events[i].metadataURI);
            } else if (tag == 3) {
                emit OperatorDeactivated(events[i].operator);
            } else {
                emit OperatorReactivated(events[i].operator);
            }
        }
    }
}

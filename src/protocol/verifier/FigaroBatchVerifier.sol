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

/// @notice Minimal UsageCounter surface the verifier writes — the RPGF
///         bridge. Local-minimal binding per the coordinator exemplar,
///         never a vendored dependency; the struct is re-declared here
///         for the same reason the interface is.
interface IUsageCounter {
    struct BatchAccrual {
        bytes32 clauseOrAssembly;
        uint64 c;
        uint64 d;
    }

    function applyBatchAccrual(
        uint8 period,
        bytes32 claimedProvenance,
        BatchAccrual[] calldata accruals,
        address[] calldata sellers
    ) external;
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
///         once-per-clause-or-assembly ETH-staked intents that stay on the
///         direct path.
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
///         RPGF: a batch-settled process never acquires kernel status,
///         so `UsageCounter`'s direct path — which requires
///         `FigaroCore.orderStatus == RESOLVED` — can never see batched
///         trade. Without a bridge the 600M would measure a shrinking
///         fraction of real adoption exactly as the protocol scales, so
///         this contract carries the accrual across: the guest proves
///         each clause or assembly's cumulative `(c, d)`, and one write
///         per clause or assembly per batch lands it. The gates the proof
///         cannot see (open period, live seller stake, exclusions) are the
///         counter's own and are checked there, not here.
///
///         Public values (ABI-encoded, 8 × 32-byte words):
///           0: prevStateRoot     (bytes32)
///           1: newStateRoot      (bytes32)
///           2: chainId           (uint64, left-padded to 32 bytes)
///           3: verifyingContract (address, left-padded to 32 bytes)
///           4: tokenOpsHash      (bytes32)
///           5: attestationEventsHash (bytes32)
///           6: specBindingsHash  (bytes32)
///           7: usageAccrualHash  (bytes32)
contract FigaroBatchVerifier is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Immutables ────────────────────────────────────────────────

    ISP1Verifier public immutable verifier;
    bytes32 public immutable programVKey;
    IClauseRegistryAnchor public immutable clauseRegistry;
    /// @notice The RPGF counter this verifier is the proof-gated writer for.
    IUsageCounter public immutable usageCounter;

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

    /// @dev The batch's RPGF accrual, hash-verified against
    ///      `usageAccrualHash`. Kept as its own parameter rather than
    ///      folded into `BatchEventData`: this is not event data, it is
    ///      a state write to another contract, and the two stay
    ///      separate. All four fields enter the hash preimage.
    struct BatchUsageData {
        /// @dev The period the accrual lands in. The COUNTER decides
        ///      whether this is the open one — the sequencer's clock has
        ///      no authority here.
        uint8 period;
        /// @dev The provenance clause key the guest proved assembly
        ///      claims against; the counter matches it to its own.
        bytes32 provenanceClause;
        /// @dev Per-clause-or-assembly CUMULATIVE (c, d) after this batch,
        ///      sorted by clause-or-assembly key in the prover.
        IUsageCounter.BatchAccrual[] accruals;
        /// @dev Distinct sellers of record behind the accruals, sorted.
        address[] sellers;
    }

    // ── Events (protocol-compatible re-emissions) ─────────────────

    /// @notice Summary event emitted per settled batch.
    event BatchSettled(
        uint64 indexed batchId, bytes32 indexed prevStateRoot, bytes32 indexed newStateRoot, uint256 positionCount
    );

    /// @notice The batch settled its TOKEN positions, but its RPGF accrual was
    ///         dropped because `UsageCounter.applyBatchAccrual` reverted — a
    ///         seller unstaked between prove and submit (`SellerNotStaked`), the
    ///         open period advanced across a boundary (`PeriodMismatch`), or the
    ///         proven provenance clause did not match. Settlement is decoupled
    ///         from the reward on purpose: a reward-tier gate must never unwind
    ///         another party's trade. The dropped accrual is recovered by the
    ///         next batch that touches the same clauses and assemblies (the
    ///         counter's write
    ///         is a cumulative overwrite), or forgone — conservative under-pay,
    ///         never over-pay.
    /// @param batchId The batch whose accrual was skipped.
    /// @param reason  The low-level revert data from the counter (for indexers).
    event BatchAccrualSkipped(uint64 indexed batchId, bytes reason);

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
    error UsageAccrualHashMismatch();
    /// @dev The proof validated content against a spec the registry does
    ///      not anchor for this clause key — including the unregistered
    ///      case (`contentHashOf` returns zero, which never equals a
    ///      witness spec's hash).
    error SpecBindingMismatch(bytes32 clauseId, bytes32 anchored, bytes32 proven);
    error FeeOnTransferDetected();
    error ZeroVerifier();
    error VerifierNotContract();
    error ZeroClauseRegistry();
    error ZeroUsageCounter();

    // ── Constructor ───────────────────────────────────────────────

    /// @param _verifier       Address of the SP1 verifier gateway (or mock).
    /// @param _programVKey    The verification key of the Figaro kernel program.
    /// @param _clauseRegistry The live ClauseRegistry — the witness-spec anchor.
    /// @param _usageCounter   The RPGF counter this verifier writes batch accrual to.
    /// @param _initialRoot    The initial state root (genesis or migrated from prior verifier).
    constructor(
        address _verifier,
        bytes32 _programVKey,
        address _clauseRegistry,
        address _usageCounter,
        bytes32 _initialRoot
    ) {
        if (_verifier == address(0)) revert ZeroVerifier();
        if (_verifier.code.length == 0) revert VerifierNotContract();
        if (_clauseRegistry == address(0)) revert ZeroClauseRegistry();
        if (_usageCounter == address(0)) revert ZeroUsageCounter();
        verifier = ISP1Verifier(_verifier);
        programVKey = _programVKey;
        clauseRegistry = IClauseRegistryAnchor(_clauseRegistry);
        usageCounter = IUsageCounter(_usageCounter);
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
        bytes32 usageAccrualHash;
    }

    // ── Batch settlement ──────────────────────────────────────────

    /// @notice Settle a batch of Figaro protocol operations.
    /// @param proof        The SP1 validity proof for the batch.
    /// @param publicValues ABI-encoded public values (8 × 32-byte words).
    /// @param positions    Net token positions to reconcile (hash-verified against proof).
    /// @param events       Attestation events to re-emit + spec bindings to
    ///                     check against the ClauseRegistry (both hash-verified).
    /// @param usage        The batch's RPGF accrual (hash-verified). Pass empty
    ///                     arrays for a batch that credits no usage.
    function settleBatch(
        bytes calldata proof,
        bytes calldata publicValues,
        NetPosition[] calldata positions,
        BatchEventData calldata events,
        BatchUsageData calldata usage
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
        if (_hashUsage(usage) != pv.usageAccrualHash) {
            revert UsageAccrualHashMismatch();
        }

        // ── 4. Anchor every witness spec to the live registry ─────
        _checkSpecBindings(events.specBindings);

        // ── 5. Execute token transfers ────────────────────────────
        _executePositions(positions);

        // ── 6. Re-emit protocol events ────────────────────────────
        _emitAttestations(events.attestations);

        // ── 7. Carry the RPGF accrual across the settlement crease ─
        //    The numbers are the proof's; the reward's own gates (open
        //    period, live seller stake, registration, exclusions)
        //    are the counter's and are enforced there. A batch with no usage
        //    claims passes empty arrays and the call is a no-op — which is
        //    what keeps trade settling after accrual closes.
        //
        //    DECOUPLED FROM SETTLEMENT (audit Fix 1a): the call is wrapped so
        //    an accrual-gate revert — a seller who unstaked between prove and
        //    submit (`SellerNotStaked`), a period boundary crossed in flight
        //    (`PeriodMismatch`), a provenance mismatch — can NEVER unwind the
        //    token settlement executed in step 5. A reward-tier gate must not
        //    block another party's trade. The counter already skips excluded
        //    and unregistered keys internally (it does not revert on
        //    those); this catch covers the whole-batch reverts that remain.
        //    On failure the accrual is dropped wholesale — recovered by the
        //    next batch's cumulative overwrite, or forgone (conservative
        //    under-pay, never over-pay). `batchCount + 1` is the id this batch
        //    receives at step 8.
        //
        //    The catch is a catch-ALL, but it does NOT silently swallow a
        //    misconfiguration: the counter's only non-gate revert is
        //    `NotBatchVerifier` (msg.sender != its immutable batchVerifier), and
        //    that address is this contract — the deploy scripts predict this
        //    verifier's address, pass it to the counter's constructor, and assert
        //    the prediction (`require(_batchVerifier == predictedVerifier)`), so
        //    the counter can only ever accept THIS verifier. `NotBatchVerifier`
        //    is therefore unreachable at runtime; every revert that reaches this
        //    catch is a genuine accrual-gate skip, surfaced via the event.
        try usageCounter.applyBatchAccrual(usage.period, usage.provenanceClause, usage.accruals, usage.sellers) {
        // accrual applied
        }
        catch (bytes memory reason) {
            emit BatchAccrualSkipped(batchCount + 1, reason);
        }

        // ── 8. Advance state ──────────────────────────────────────
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
            pv.specBindingsHash,
            pv.usageAccrualHash
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

    /// @dev Pack: period(1) ++ provenanceClause(32)
    ///            ++ len(accruals)(8) ++ [clauseOrAssembly(32) ++ c(8) ++ d(8)]*
    ///            ++ len(sellers)(8)  ++ [seller(20)]*
    ///      matching the Rust `compute_usage_accrual_hash`.
    ///
    ///      BOTH LENGTHS ARE PREFIXED, and they must be. An accrual
    ///      record is 48 bytes and a seller 20, so five accruals and
    ///      twelve sellers span the same 240 bytes: without the
    ///      prefixes, one preimage could be re-split into a different
    ///      (accruals, sellers) pair — letting a submitter present
    ///      accruals whose sellers were never stake-checked while the
    ///      hash still matched.
    ///      Unlike the sibling hashers above, this layout's trailing
    ///      fields are NARROWER than a word (`d` is 8 bytes, a seller
    ///      20), so the final `mstore` of each would write past the
    ///      buffer. The buffer therefore carries 32 bytes of slack and
    ///      its length is truncated to the exact span before hashing —
    ///      the overrun lands in the slack, and keccak sees only the
    ///      packed bytes.
    function _hashUsage(BatchUsageData calldata usage) internal pure returns (bytes32) {
        uint256 accrualCount = usage.accruals.length;
        uint256 sellerCount = usage.sellers.length;
        uint256 span = 49 + accrualCount * 48 + sellerCount * 20;
        bytes memory packed = new bytes(span + 32);

        uint8 period = usage.period;
        bytes32 provenance = usage.provenanceClause;
        assembly {
            let dst := add(packed, 32)
            mstore8(dst, period)
            mstore(add(dst, 1), provenance)
            mstore(add(dst, 33), shl(192, accrualCount))
        }

        uint256 offset = 41;
        for (uint256 i = 0; i < accrualCount; i++) {
            bytes32 clauseOrAssembly = usage.accruals[i].clauseOrAssembly;
            uint64 c = usage.accruals[i].c;
            uint64 d = usage.accruals[i].d;
            assembly {
                let dst := add(add(packed, 32), offset)
                mstore(dst, clauseOrAssembly)
                mstore(add(dst, 32), shl(192, c))
                mstore(add(dst, 40), shl(192, d))
            }
            offset += 48;
        }

        assembly {
            mstore(add(add(packed, 32), offset), shl(192, sellerCount))
        }
        offset += 8;

        for (uint256 i = 0; i < sellerCount; i++) {
            address seller = usage.sellers[i];
            assembly {
                mstore(add(add(packed, 32), offset), shl(96, seller))
            }
            offset += 20;
        }

        // Drop the slack so keccak covers exactly the packed span.
        assembly {
            mstore(packed, span)
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

// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "src/core/verifier/ISP1Verifier.sol";
import "src/core/kernel/CommitmentTypes.sol";

/// @notice Minimal ClauseRegistry surface the verifier reads — the
///         anchor for witness specs. A clause key is keccak256 of the spec's
///         pinned bytes, so a registered key anchors at most one document.
interface IClauseRegistryAnchor {
    function registered(bytes32 clauseKey) external view returns (bool);
}

/// @notice Minimal UsageCounter surface the verifier writes — the RPGF
///         bridge. Local-minimal binding per the coordinator exemplar,
///         never a vendored dependency; the struct is re-declared here
///         for the same reason the interface is.
interface IUsageCounter {
    struct BatchAccrual {
        bytes32 clauseOrAssembly;
        uint8 kind;
        uint64 c;
        uint64 d;
    }

    function applyBatchAccrual(
        uint8 period,
        bytes32 claimedProvenanceLeaf,
        BatchAccrual[] calldata accruals,
        address[] calldata sellers
    ) external;
}

/// @title FigaroBatchVerifier — Resolves batched Figaro operations via SP1 proof
/// @custom:security-contact figarosecurity@gmail.com
/// @custom:audit-status UNAUDITED — This contract has not been reviewed by an independent security auditor.
/// @notice Accepts a zero-knowledge proof that a batch of protocol operations
///         (commits, resolves, attestations) produces a valid state transition.
///         The contract verifies the proof, checks every witness-spec binding
///         against the live ClauseRegistry, reconciles net token positions,
///         re-emits protocol-compatible attestation events, and advances the
///         state root. Registry mutations are NOT batched — they are
///         once-per-clause-agreement-or-assembly ETH-staked intents that stay on the
///         direct path.
/// @dev DISCLAIMER: This contract is provided as-is, without warranty of any kind, express or implied. No liability is accepted for loss, damages, or bugs. Use at your own risk.
///
///         The Core's philosophy: no owner, no fee, no upgrade path. If the program
///         changes, deploy a new verifier.
///
///         The spec-binding check is what makes the in-proof clause validation
///         OPEN-WORLD: the guest validates content against a witness spec and
///         commits (clause key, keccak256(spec bytes)); the clause key IS the
///         spec hash, so this contract accepts the batch only if the two words
///         of each binding are equal and `ClauseRegistry.registered(clauseKey)`.
///         The program verification key covers the ENGINE, the registry
///         anchors the constraint set — a never-seen clause resolves through
///         the proven path with zero code changes, and a permissive-spec
///         substitution cannot resolve.
///
///         RPGF: a batch-resolved process never acquires FigaroCore status,
///         so `UsageCounter`'s direct path — which requires
///         `FigaroCore.orderStatus == RESOLVED` — can never see batched
///         trade. Without a bridge the 600M would measure a shrinking
///         fraction of real adoption exactly as the protocol scales, so
///         this contract carries the accrual across: the guest proves
///         each clause's, agreement's or assembly's cumulative `(c, d)`, and one write
///         per clause, agreement or assembly per batch lands it. The gates the proof
///         cannot see (open period, the seller of record's live member stake, registration) are the
///         counter's own and are checked there, not here.
///
///         Public values (ABI-encoded, 10 × 32-byte words):
///           0: prevStateRoot     (bytes32)
///           1: newStateRoot      (bytes32)
///           2: chainId           (uint64, left-padded to 32 bytes)
///           3: verifyingContract (address, left-padded to 32 bytes)
///           4: tokenOpsHash      (bytes32)
///           5: attestationEventsHash (bytes32)
///           6: specBindingsHash  (bytes32)
///           7: usageAccrualHash  (bytes32)
///           8: blockTimestamp    (uint64, left-padded to 32 bytes)
///           9: operationsHash    (bytes32) — keccak256 of the batch's operation
///              stream: every commit and resolve the batch applied, whole, and
///              every usage claim. `settleBatch` takes the stream as calldata
///              and refuses a batch whose bytes do not hash to this word, so a
///              batch cannot land without publishing, in its own transaction,
///              the signed operations behind its root; with the `usage`
///              argument's period and provenance leaf and the public values'
///              chain binding and clock, they rebuild the state behind it.
contract FigaroBatchVerifier is ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;
    using CommitmentTypes for CommitmentTypes.Commitment;

    // ── Immutables ────────────────────────────────────────────────

    ISP1Verifier public immutable verifier;
    /// @notice The circuit the bound verifier names (`VERIFIER_HASH()`): one
    ///         routed `SP1Verifier`, never a gateway, so no route owner can
    ///         freeze the path between a proven batch and its resolution.
    bytes32 public immutable verifierHash;
    bytes32 public immutable programVKey;
    IClauseRegistryAnchor public immutable clauseRegistry;
    /// @notice The RPGF counter this verifier is the proof-gated writer for.
    IUsageCounter public immutable usageCounter;

    /// @notice The widest gap allowed between the clock the guest checked
    ///         deadlines against (committed in the public values) and this
    ///         block's timestamp. It bounds a prover-chosen time to reality —
    ///         a batch is proven then submitted, so a few minutes of lag is
    ///         normal — while keeping the guest's deadline gate meaningful: a
    ///         caller cannot pick an arbitrary past time to bond an
    ///         already-expired signed commitment.
    uint64 public constant MAX_BATCH_STALENESS = 1 hours;

    /// @notice The length of the public values, in bytes: ten 32-byte words.
    ///         A stream of any other length is another program's, or a
    ///         malformed one, and is refused by name before anything reads it.
    uint256 public constant PUBLIC_VALUES_LENGTH = 320;

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

    /// @dev One (clause key, witness-spec hash) binding the batch's
    ///      in-proof clause gates validated against. Deduplicated and
    ///      sorted ascending by (clauseId, specHash) in the prover. The clause
    ///      key is keccak256 of the spec's pinned bytes, so a well-formed
    ///      binding carries the same word in both fields; the two-field layout
    ///      is what the guest's public values hash.
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
        /// @dev The provenance leaf key the guest proved agreement and assembly
        ///      claims against; the counter matches it to its own.
        bytes32 provenanceLeaf;
        /// @dev Per-(kind, key) CUMULATIVE (c, d) after this batch,
        ///      sorted by (key, kind) in the prover.
        IUsageCounter.BatchAccrual[] accruals;
        /// @dev Distinct sellers of record behind the accruals, sorted.
        address[] sellers;
    }

    // ── Events (protocol-compatible re-emissions) ─────────────────

    // ── The Core's own order and process events, emitted from the stream ──
    // A batched order is published as a direct one is: the same events, the
    // same fields, the same ids (derived under this contract's EIP-712 domain,
    // the one the batch's signatures were made under), so an event reader
    // folds both paths by filtering on two addresses.
    event OrderCommitted(
        bytes32 indexed orderHash,
        bytes32 indexed processId,
        address indexed buyer,
        address seller,
        address currency,
        uint256 payment,
        uint256 cumulativeValue,
        bytes32 checkoutHash,
        uint256 salt,
        uint256 deadline
    );
    event OrderSeller(bytes32 indexed orderHash, address indexed seller);
    event OrderCurrency(bytes32 indexed orderHash, address indexed currency);
    event OrderResolved(
        bytes32 indexed orderHash, bytes32 indexed processId, uint256 sellerPayout, uint256 buyerPayout
    );
    event ProcessResolved(bytes32 indexed processId, address indexed buyer, uint256 orderCount);

    /// @notice Summary event emitted per resolved batch.
    event BatchSettled(
        uint64 indexed batchId, bytes32 indexed prevStateRoot, bytes32 indexed newStateRoot, uint256 positionCount
    );

    /// @notice The batch resolved its TOKEN positions, but its RPGF accrual was
    ///         dropped because `UsageCounter.applyBatchAccrual` reverted — a
    ///         seller unstaked between prove and submit (`SellerNotStaked`), the
    ///         open period advanced across a boundary (`PeriodMismatch`), or the
    ///         proven provenance leaf did not match. Resolution is decoupled
    ///         from the reward on purpose: a reward-tier gate must never unwind
    ///         another party's trade. The dropped accrual is recovered by the
    ///         next batch that touches the same clauses, agreements and assemblies (the
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
    error OperationsHashMismatch();
    error MalformedOperationStream();
    error VerifierNotPinned();
    error BatchTimestampOutOfRange(uint64 committed, uint64 current);
    error PublicValuesLengthMismatch(uint256 expected, uint256 actual);
    /// @dev The proof validated content against a spec whose hash is not the
    ///      clause key it names: the key IS the spec hash, so the two differ
    ///      only when the witness is some other document.
    error SpecBindingMismatch(bytes32 clauseId, bytes32 proven);
    /// @dev The proof validated content against a spec whose key the
    ///      registry has never registered.
    error ClauseNotRegistered(bytes32 clauseId);
    error FeeOnTransferDetected();
    error ZeroVerifier();
    error VerifierNotContract();
    error ZeroClauseRegistry();
    error ZeroUsageCounter();

    // ── Constructor ───────────────────────────────────────────────

    /// @param _verifier       Address of the SP1 verifier gateway (or mock).
    /// @param _programVKey    The verification key of the Figaro guest program.
    /// @param _clauseRegistry The live ClauseRegistry — the witness-spec anchor.
    /// @param _usageCounter   The RPGF counter this verifier writes batch accrual to.
    ///         The state root starts at `genesisRoot()`, the empty state's,
    ///         computed here and never supplied: a verifier always starts on a
    ///         state anyone can rebuild from nothing.
    constructor(address _verifier, bytes32 _programVKey, address _clauseRegistry, address _usageCounter)
        EIP712("FigaroCore", "3")
    {
        if (_verifier == address(0)) revert ZeroVerifier();
        if (_verifier.code.length == 0) revert VerifierNotContract();
        if (_clauseRegistry == address(0)) revert ZeroClauseRegistry();
        if (_usageCounter == address(0)) revert ZeroUsageCounter();
        // The pin: the bound contract names its circuit. A gateway has no
        // `VERIFIER_HASH()` and is refused here, so the path from a proven
        // batch to its resolution has no owner who can freeze it.
        bytes32 named;
        try ISP1VerifierWithHash(_verifier).VERIFIER_HASH() returns (bytes32 h) {
            named = h;
        } catch {
            revert VerifierNotPinned();
        }
        if (named == bytes32(0)) revert VerifierNotPinned();
        verifier = ISP1Verifier(_verifier);
        verifierHash = named;
        programVKey = _programVKey;
        clauseRegistry = IClauseRegistryAnchor(_clauseRegistry);
        usageCounter = IUsageCounter(_usageCounter);
        stateRoot = genesisRoot();
    }

    /// @notice The root of the empty mirror state: one `keccak256("")` per
    ///         map (processes, order status, order → process) and the usage
    ///         leg's keccak over three zero-length sections, hashed flat, as
    ///         the guest's `KernelState::compute_root` does on nothing.
    function genesisRoot() public pure returns (bytes32) {
        bytes32 emptyMap = keccak256("");
        bytes32 emptyUsage = keccak256(abi.encodePacked(uint64(0), uint64(0), uint64(0)));
        return keccak256(abi.encodePacked(emptyMap, emptyMap, emptyMap, emptyUsage));
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
        uint64 blockTimestamp;
        bytes32 operationsHash;
    }

    // ── Batch resolution ──────────────────────────────────────────

    /// @notice Resolve a batch of Figaro protocol operations.
    /// @param proof        The SP1 validity proof for the batch.
    /// @param publicValues ABI-encoded public values (10 × 32-byte words).
    /// @param positions    Net token positions to reconcile (hash-verified against proof).
    /// @param events       Attestation events to re-emit + spec bindings to
    ///                     check against the ClauseRegistry (both hash-verified).
    /// @param usage        The batch's RPGF accrual (hash-verified). Pass empty
    ///                     arrays for a batch that credits no usage.
    /// @param operations   The batch's operation stream (hash-verified against
    ///                     public value 9): every commit and resolve it applied,
    ///                     whole, and every usage claim, in the guest's canonical
    ///                     bytes (`prover/lib/src/operation_stream.rs`). The
    ///                     contract reads none of it; it is published so that
    ///                     anyone can rebuild the state behind the new root from
    ///                     this transaction and the ones before it.
    function settleBatch(
        bytes calldata proof,
        bytes calldata publicValues,
        NetPosition[] calldata positions,
        BatchEventData calldata events,
        BatchUsageData calldata usage,
        bytes calldata operations
    ) external nonReentrant {
        if (publicValues.length != PUBLIC_VALUES_LENGTH) {
            revert PublicValuesLengthMismatch(PUBLIC_VALUES_LENGTH, publicValues.length);
        }

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
        // Bind the guest's deadline clock to reality: the committed timestamp
        // must not be in the future and must be recent. Without this, the
        // prover-chosen `block_timestamp` the guest checks every deadline
        // against is unconstrained, and a caller of this permissionless
        // function could pick `0` to bond a signed commitment whose deadline
        // has long expired — one the direct path rejects.
        if (pv.blockTimestamp > block.timestamp || block.timestamp - pv.blockTimestamp > MAX_BATCH_STALENESS) {
            revert BatchTimestampOutOfRange(pv.blockTimestamp, uint64(block.timestamp));
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
        if (keccak256(operations) != pv.operationsHash) {
            revert OperationsHashMismatch();
        }

        // ── 4. Anchor every witness spec to the live registry ─────
        _checkSpecBindings(events.specBindings);

        // ── 5. Execute token transfers ────────────────────────────
        _executePositions(positions);

        // ── 6. Publish the batch's orders and resolutions as the Core does ─
        _emitAttestations(events.attestations);
        _emitOperations(operations);

        // ── 7. Carry the RPGF accrual across the resolution crease ─
        //    The numbers are the proof's; the reward's own gates (open
        //    period, the seller of record's live member stake, registration)
        //    are the counter's and are enforced there. A batch with no usage
        //    claims passes empty arrays and the call is a no-op — which is
        //    what keeps trade resolving after accrual closes.
        //
        //    DECOUPLED FROM RESOLUTION: the call is wrapped so
        //    an accrual-gate revert — a seller who unstaked between prove and
        //    submit (`SellerNotStaked`), a period boundary crossed in flight
        //    (`PeriodMismatch`), a provenance mismatch — can NEVER unwind the
        //    token resolution executed in step 5. A reward-tier gate must not
        //    block another party's trade. The counter already skips
        //    unregistered keys internally (it does not revert on
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
        try usageCounter.applyBatchAccrual(usage.period, usage.provenanceLeaf, usage.accruals, usage.sellers) {
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
        // Words 8 and 9 are blockTimestamp and operationsHash — read from the
        // calldata slice rather than a wider tuple abi.decode, which tips
        // settleBatch over the legacy-codegen stack limit. The SP1 verifier
        // already bound the whole 320-byte stream to the proof, so these read
        // committed words.
        pv.blockTimestamp = uint64(uint256(bytes32(publicValues[256:288])));
        pv.operationsHash = bytes32(publicValues[288:320]);
    }

    // ── Hash functions (byte-exact parity with the Rust mirror) ───────

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

    /// @dev Pack: period(1) ++ provenanceLeaf(32)
    ///            ++ len(accruals)(8) ++ [clauseOrAssembly(32) ++ kind(1) ++ c(8) ++ d(8)]*
    ///            ++ len(sellers)(8)  ++ [seller(20)]*
    ///      — span 49 + 49n + 20m bytes for n accruals and m sellers —
    ///      matching the Rust `compute_usage_accrual_hash`.
    ///
    ///      BOTH LENGTHS ARE PREFIXED, and they must be. An accrual
    ///      entry is 49 bytes and a seller 20, so twenty accruals and
    ///      forty-nine sellers span the same 980 bytes: without the
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
        uint256 span = 49 + accrualCount * 49 + sellerCount * 20;
        bytes memory packed = new bytes(span + 32);

        uint8 period = usage.period;
        bytes32 provenance = usage.provenanceLeaf;
        assembly {
            let dst := add(packed, 32)
            mstore8(dst, period)
            mstore(add(dst, 1), provenance)
            mstore(add(dst, 33), shl(192, accrualCount))
        }

        uint256 offset = 41;
        for (uint256 i = 0; i < accrualCount; i++) {
            bytes32 clauseOrAssembly = usage.accruals[i].clauseOrAssembly;
            uint8 kind = usage.accruals[i].kind;
            uint64 c = usage.accruals[i].c;
            uint64 d = usage.accruals[i].d;
            assembly {
                let dst := add(add(packed, 32), offset)
                mstore(dst, clauseOrAssembly)
                mstore8(add(dst, 32), kind)
                mstore(add(dst, 33), shl(192, c))
                mstore(add(dst, 41), shl(192, d))
            }
            offset += 49;
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
    ///      against must be the exact document a registered clause key names.
    ///      The key IS the spec hash, so the binding's two words must be equal,
    ///      and the key must be registered. One SLOAD-backed external view call
    ///      per distinct clause per batch (the prover deduplicates).
    function _checkSpecBindings(SpecBinding[] calldata bindings) internal view {
        for (uint256 i = 0; i < bindings.length; i++) {
            bytes32 clauseKey = bindings[i].clauseId;
            if (bindings[i].specHash != clauseKey) {
                revert SpecBindingMismatch(clauseKey, bindings[i].specHash);
            }
            if (!clauseRegistry.registered(clauseKey)) revert ClauseNotRegistered(clauseKey);
        }
    }

    // ── Token execution ───────────────────────────────────────────

    /**
     * @dev BATCH RESOLUTION DOS RISK
     * If any user in a batch revokes approval before settleBatch executes, the entire batch reverts.
     * Mitigation: Sequencer MUST verify approvals immediately before proof submission.
     * Users SHOULD maintain approvals until batch resolution is confirmed.
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
                // Only normal resolution — transfer from contract balance
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

    // ── The operation stream, read for its events ───────────────────
    // The stream's bytes are the guest's (`prover/lib/src/operation_stream.rs`):
    // `0x01 commitment sig sig` for a commit, `0x02 processId sig count
    // commitment*` for a resolution, `0x03 commitment key kind … proof` for a
    // usage claim; a commitment is 252 packed bytes, a signature 65, a count
    // a big-endian uint16. A proven batch's stream is well-formed by
    // construction (the proof bound its hash); the refusal below is the
    // decoder's, never a judgment.

    uint256 private constant COMMITMENT_BYTES = 252;
    uint256 private constant SIGNATURE_BYTES = 65;

    function _emitOperations(bytes calldata s) internal {
        uint256 p;
        uint256 n = s.length;
        while (p < n) {
            uint256 tag = _byteAt(s, p);
            p += 1;
            if (tag == 0x01) {
                CommitmentTypes.Commitment memory c = _readCommitment(s, p);
                p += COMMITMENT_BYTES + 2 * SIGNATURE_BYTES;
                _emitCommitted(c);
            } else if (tag == 0x02) {
                bytes32 processId = _wordAt(s, p);
                p += 32 + SIGNATURE_BYTES;
                uint256 count = _countAt(s, p);
                p += 2;
                address buyer;
                for (uint256 i = 0; i < count; i++) {
                    CommitmentTypes.Commitment memory c = _readCommitment(s, p);
                    p += COMMITMENT_BYTES;
                    buyer = c.buyer;
                    _emitResolved(processId, c);
                }
                emit ProcessResolved(processId, buyer, count);
            } else if (tag == 0x03) {
                p += COMMITMENT_BYTES + 32; // the order and the key
                uint256 kind = _byteAt(s, p);
                p += 1;
                if (kind == 0 || kind == 2) {
                    p += 32;
                } else if (kind == 1) {
                    p += 64;
                    p += 2 + _countAt(s, p) * 32;
                } else {
                    revert MalformedOperationStream();
                }
                p += 2 + _countAt(s, p) * 32;
            } else {
                revert MalformedOperationStream();
            }
            if (p > n) revert MalformedOperationStream();
        }
    }

    // The stream is read with `calldataload` at an offset into `s`: a word,
    // a byte or a big-endian uint16, each bounds-checked by the caller's
    // final `p > n` refusal (a read past the end loads zero bytes, which the
    // check then rejects as a short stream).

    function _wordAt(bytes calldata s, uint256 p) private pure returns (bytes32 w) {
        assembly ("memory-safe") {
            w := calldataload(add(s.offset, p))
        }
    }

    function _byteAt(bytes calldata s, uint256 p) private pure returns (uint256 b) {
        assembly ("memory-safe") {
            b := shr(248, calldataload(add(s.offset, p)))
        }
    }

    function _countAt(bytes calldata s, uint256 p) private pure returns (uint256 c) {
        assembly ("memory-safe") {
            c := shr(240, calldataload(add(s.offset, p)))
        }
    }

    function _readCommitment(bytes calldata s, uint256 p) private pure returns (CommitmentTypes.Commitment memory c) {
        c.processId = _wordAt(s, p);
        c.buyer = address(bytes20(_wordAt(s, p + 32)));
        c.seller = address(bytes20(_wordAt(s, p + 52)));
        c.currency = address(bytes20(_wordAt(s, p + 72)));
        c.payment = uint256(_wordAt(s, p + 92));
        c.expectedCumulativeValue = uint256(_wordAt(s, p + 124));
        c.checkoutHash = _wordAt(s, p + 156);
        c.salt = uint256(_wordAt(s, p + 188));
        c.deadline = uint256(_wordAt(s, p + 220));
    }

    /// @dev The ids FigaroCore derives at commit, under this contract's domain:
    ///      a root order's processId is its EIP-712 digest, an extension names
    ///      its process; the orderHash is keccak256(processId ‖ structHash).
    function _emitCommitted(CommitmentTypes.Commitment memory c) private {
        bytes32 structHash = c.hashStruct();
        bytes32 processId = c.processId == bytes32(0) ? _hashTypedDataV4(structHash) : c.processId;
        bytes32 orderHash = keccak256(abi.encodePacked(processId, structHash));
        emit OrderSeller(orderHash, c.seller);
        emit OrderCurrency(orderHash, c.currency);
        emit OrderCommitted(
            orderHash,
            processId,
            c.buyer,
            c.seller,
            c.currency,
            c.payment,
            c.expectedCumulativeValue,
            c.checkoutHash,
            c.salt,
            c.deadline
        );
    }

    /// @dev The payouts FigaroCore.resolveProcess computes: the seller its bond
    ///      and payment (2G + P), the buyer its bond less the payment (P).
    function _emitResolved(bytes32 processId, CommitmentTypes.Commitment memory c) private {
        bytes32 orderHash = keccak256(abi.encodePacked(processId, c.hashStruct()));
        emit OrderResolved(orderHash, processId, c.expectedCumulativeValue * 2 + c.payment, c.payment);
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

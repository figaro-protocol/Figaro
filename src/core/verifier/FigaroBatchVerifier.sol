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
    struct BatchUse {
        bytes32 clauseOrAssembly;
        uint8 kind;
        bytes32 processId;
        address seller;
    }

    function applyBatchAccrual(uint8 period, bytes32 claimedProvenanceLeaf, BatchUse[] calldata uses) external;
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
///         OPEN-WORLD: for an attestation sent in the plaintext form the guest validates content against a witness spec and
///         commits (clause key, keccak256(spec bytes)); a hash-only attestation commits no binding; the clause key IS the
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
///         this contract carries the uses across: the guest proves each
///         use — a resolved process that used a clause, agreement or
///         assembly, and the seller of the order it was proved through —
///         and the counter counts every use into the same tally a direct
///         call feeds. The gates the proof cannot see (open period, the
///         seller's live member stake, registration, a process already
///         counted) are the counter's own and are checked there, not here.
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
///
///         A resolve comes in two forms, as `FigaroCore.resolveProcess`'s
///         `msg.sender == rootBuyer` admits the buyer's key and any code the
///         buyer's wallet installed while it held the key. The first, the
///         buyer's ECDSA signature, the guest recovers. The second, bytes the
///         buyer's own account code validates (ERC-1271), the guest cannot
///         check: it applies the resolve on the process, the value and the
///         order list alone and publishes the bytes in the stream's `0x04`
///         entry. `settleBatch` reads the entry, derives the
///         `ResolveProcess(processId, cumulativeValue)` digest under this
///         contract's domain, requires the buyer's account to have code, and
///         calls its `isValidSignature`, before any token moves; any answer
///         but the magic value reverts the whole batch, because the proven
///         root already holds the resolve, so the entry cannot be dropped
///         alone. On both paths only the buyer's wallet, by its key or by its
///         code, resolves.
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

    /// @dev The batch's uses, hash-verified against
    ///      `usageAccrualHash`. Kept as its own parameter rather than
    ///      folded into `BatchEventData`: this is not event data, it is
    ///      a state write to another contract, and the two stay
    ///      separate. All three fields enter the hash preimage.
    struct BatchUsageData {
        /// @dev The period the uses land in. The COUNTER decides
        ///      whether this is the open one — the sequencer's clock has
        ///      no authority here.
        uint8 period;
        /// @dev The provenance leaf key the guest proved agreement and assembly
        ///      claims against; the counter matches it to its own.
        bytes32 provenanceLeaf;
        /// @dev One entry per (kind, key, process) the batch's claims
        ///      proved, in the order of the claims.
        IUsageCounter.BatchUse[] uses;
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

    /// @notice The batch's operation stream and the inputs its replay needs
    ///         beside it: the clock the guest checked deadlines against and
    ///         the usage period and provenance leaf its claims were applied
    ///         under (the chain id and the verifying contract are the chain's
    ///         and this contract's). Emitted in the same transaction as
    ///         `BatchSettled`, so the state behind any root is rebuilt from
    ///         this contract's logs alone, however the call reached it.
    event BatchOperations(
        uint64 indexed batchId, uint64 blockTimestamp, uint8 usagePeriod, bytes32 provenanceLeaf, bytes operations
    );

    /// @notice Summary event emitted per resolved batch.
    event BatchSettled(
        uint64 indexed batchId, bytes32 indexed prevStateRoot, bytes32 indexed newStateRoot, uint256 positionCount
    );

    /// @notice The batch resolved its TOKEN positions, but its uses were not
    ///         counted because `UsageCounter.applyBatchAccrual` reverted — the
    ///         open period advanced across a boundary (`PeriodMismatch`), the
    ///         reward's last period ended (`AccrualClosed`), or the proven
    ///         provenance leaf did not match. Resolution is decoupled from the
    ///         reward on purpose: a reward-tier gate must never unwind
    ///         another party's trade. The uses stay uncounted, so a later batch
    ///         may prove them again; until one does, the reward under-pays,
    ///         never over-pays.
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
    /// @dev A resolve in the wallet-code form names a buyer whose account
    ///      has no code to ask: only the buyer's ECDSA signature can resolve
    ///      for it, in the first form.
    error BuyerHasNoCode(bytes32 processId, address buyer);
    /// @dev The buyer's account code did not answer the resolve's digest and
    ///      bytes with the ERC-1271 magic value (it answered otherwise,
    ///      reverted, or returned no word).
    error WalletCodeAuthorizationRefused(bytes32 processId, address buyer);

    // ── Constructor ───────────────────────────────────────────────

    /// @param _verifier       Address of the SP1 verifier gateway (or mock).
    /// @param _programVKey    The verification key of the Figaro guest program.
    /// @param _clauseRegistry The live ClauseRegistry — the witness-spec anchor.
    /// @param _usageCounter   The counter this verifier hands each batch's uses to.
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
    ///         map (processes, order status, order → process), hashed flat, as
    ///         the guest's `KernelState::compute_root` does on nothing.
    function genesisRoot() public pure returns (bytes32) {
        bytes32 emptyMap = keccak256("");
        return keccak256(abi.encodePacked(emptyMap, emptyMap, emptyMap));
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
    /// @param usage        The batch's uses (hash-verified). Pass an empty
    ///                     array for a batch that credits no usage.
    /// @param operations   The batch's operation stream (hash-verified against
    ///                     public value 9): every commit and resolve it applied,
    ///                     whole, and every usage claim, in the guest's canonical
    ///                     bytes (`prover/lib/src/operation_stream.rs`). The
    ///                     contract reads it for the Core's events and asks the
    ///                     buyer's code about each `0x04` entry, before any
    ///                     token moves; it is published so that anyone can
    ///                     rebuild the state behind the new root from this
    ///                     transaction and the ones before it.
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
        //    and ask the buyer's code about every wallet-code resolve,
        //    against the state before the batch moves a token: the state the
        //    relay's own check read, never a payout's.
        _walkOperations(operations, false);

        // ── 5. Execute token transfers ────────────────────────────
        _executePositions(positions);

        // ── 6. Publish the batch's orders and resolutions as the Core does ─
        _emitAttestations(events.attestations);
        _walkOperations(operations, true);

        // ── 7. Hand the batch's uses to the counter ─────────────────
        //    The uses are the proof's; the reward's own gates (open
        //    period, each seller's live member stake, registration, a
        //    process already counted) are the counter's and are enforced
        //    there. A batch with no usage claims passes an empty array and
        //    the call is a no-op — which is what keeps trade resolving after
        //    accrual closes.
        //
        //    DECOUPLED FROM RESOLUTION: the call is wrapped so
        //    a whole-batch revert — a period boundary crossed in flight
        //    (`PeriodMismatch`), a provenance mismatch — can NEVER unwind the
        //    token resolution executed in step 5. A reward-tier gate must not
        //    block another party's trade. The counter skips a use that fails
        //    a per-use gate (it does not revert on those); this catch covers
        //    the whole-batch reverts that remain. On failure no use of the
        //    batch is counted, and a later batch may prove them again
        //    (conservative under-pay, never over-pay). `batchCount + 1` is the
        //    id this batch receives at step 8.
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
        try usageCounter.applyBatchAccrual(usage.period, usage.provenanceLeaf, usage.uses) {
        // uses counted
        }
        catch (bytes memory reason) {
            emit BatchAccrualSkipped(batchCount + 1, reason);
        }

        // ── 8. Advance state ──────────────────────────────────────
        stateRoot = pv.newRoot;
        uint64 newBatchId = ++batchCount;

        emit BatchOperations(newBatchId, pv.blockTimestamp, usage.period, usage.provenanceLeaf, operations);
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
    ///            ++ len(uses)(8) ++ [clauseOrAssembly(32) ++ kind(1) ++ processId(32) ++ seller(20)]*
    ///      — span 41 + 85n bytes for n uses —
    ///      matching the Rust `compute_usage_accrual_hash`.
    ///
    ///      Unlike the sibling hashers above, this layout's trailing
    ///      field is NARROWER than a word (a seller is 20 bytes), so its
    ///      `mstore` writes past the buffer. The buffer therefore carries
    ///      32 bytes of slack and its length is truncated to the exact span
    ///      before hashing — the overrun lands in the slack, and keccak sees
    ///      only the packed bytes.
    function _hashUsage(BatchUsageData calldata usage) internal pure returns (bytes32) {
        uint256 useCount = usage.uses.length;
        uint256 span = 41 + useCount * 85;
        bytes memory packed = new bytes(span + 32);

        uint8 period = usage.period;
        bytes32 provenance = usage.provenanceLeaf;
        assembly {
            let dst := add(packed, 32)
            mstore8(dst, period)
            mstore(add(dst, 1), provenance)
            mstore(add(dst, 33), shl(192, useCount))
        }

        uint256 offset = 41;
        for (uint256 i = 0; i < useCount; i++) {
            bytes32 clauseOrAssembly = usage.uses[i].clauseOrAssembly;
            uint8 kind = usage.uses[i].kind;
            bytes32 processId = usage.uses[i].processId;
            address seller = usage.uses[i].seller;
            assembly {
                let dst := add(add(packed, 32), offset)
                mstore(dst, clauseOrAssembly)
                mstore8(add(dst, 32), kind)
                mstore(add(dst, 33), processId)
                mstore(add(dst, 65), shl(96, seller))
            }
            offset += 85;
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
     * Two causes revert the entire batch after its proof: a user who revokes approval before settleBatch
     * executes, and a buyer whose wallet code refuses its wallet-code resolve at step 4 though it validated
     * the bytes when the relay asked.
     * Mitigation: Sequencer MUST verify approvals and ask each buyer's code immediately before proof submission.
     * Users SHOULD maintain approvals, and wallet code its answer, until batch resolution is confirmed.
     */

    /// @dev Reconcile net positions in two passes over the guest's order: every
    ///      pull (deposit > payout, from a user who approved its net deposit) before
    ///      any push (payout > deposit), so no payout waits on a pull listed after
    ///      it: per token, the batch lands when its holding plus its pulls covers its payouts.
    function _executePositions(NetPosition[] calldata positions) internal {
        for (uint256 i = 0; i < positions.length; i++) {
            NetPosition calldata p = positions[i];
            if (p.deposit > p.payout) _pullExact(IERC20(p.token), p.user, p.deposit - p.payout);
        }
        for (uint256 i = 0; i < positions.length; i++) {
            NetPosition calldata p = positions[i];
            if (p.payout > p.deposit) {
                uint256 net = p.payout - p.deposit;
                // Only normal resolution — transfer from contract balance
                IERC20(p.token).safeTransfer(p.user, net);
            }
        }
        // deposit == payout → no transfer in either pass
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
    // usage claim, `0x04 processId len authorization count commitment*` for a
    // resolution authorized by the buyer's wallet code; a commitment is 252
    // packed bytes, a signature 65, a count or a length a big-endian uint16.
    // A proven batch's stream is well-formed by construction (the proof bound
    // its hash); the refusal below is the decoder's, never a judgment. The
    // one judgment the stream carries to this contract is the wallet-code
    // resolve's, and it is the buyer's code's, asked in `_checkWalletCode`.

    uint256 private constant COMMITMENT_BYTES = 252;
    uint256 private constant SIGNATURE_BYTES = 65;

    /// @dev The batch path's resolve authorization, the type the guest's
    ///      `resolve_struct_hash` hashes (`prover/lib/src/eip712.rs`).
    bytes32 private constant RESOLVE_PROCESS_TYPEHASH =
        keccak256("ResolveProcess(bytes32 processId,uint256 cumulativeValue)");
    /// @dev ERC-1271's magic value, `isValidSignature(bytes32,bytes)`'s selector.
    bytes4 private constant ERC1271_MAGIC_VALUE = 0x1626ba7e;

    /// @dev Walk the stream. With `publish` false, ask the buyer's code about
    ///      every `0x04` entry and emit nothing (step 4); with `publish` true,
    ///      emit the Core's events for every commit and resolution (step 6).
    function _walkOperations(bytes calldata s, bool publish) internal {
        uint256 p;
        uint256 n = s.length;
        while (p < n) {
            uint256 tag = _byteAt(s, p);
            p += 1;
            if (tag == 0x01) {
                if (publish) _emitCommitted(_readCommitment(s, p));
                p += COMMITMENT_BYTES + 2 * SIGNATURE_BYTES;
            } else if (tag == 0x02) {
                bytes32 processId = _wordAt(s, p);
                p += 32 + SIGNATURE_BYTES;
                uint256 count = _countAt(s, p);
                p += 2;
                if (publish) {
                    address buyer;
                    for (uint256 i = 0; i < count; i++) {
                        CommitmentTypes.Commitment memory c = _readCommitment(s, p + i * COMMITMENT_BYTES);
                        buyer = c.buyer;
                        _emitResolved(processId, c);
                    }
                    emit ProcessResolved(processId, buyer, count);
                }
                p += count * COMMITMENT_BYTES;
            } else if (tag == 0x04) {
                p = _resolveByWalletCode(s, p, publish);
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

    /// @dev A `0x04` entry from its process id on. With `publish` false the
    ///      buyer's code is asked; with `publish` true the entry publishes as
    ///      a `0x02` one does. The cumulative value is the listed payments' sum
    ///      (the guest applied the resolve only while the process held it,
    ///      every order of the process listed) and the buyer is the listed
    ///      orders' (every order of a process carries its root buyer).
    ///      Returns the offset past the entry.
    function _resolveByWalletCode(bytes calldata s, uint256 p, bool publish) private returns (uint256) {
        bytes32 processId = _wordAt(s, p);
        uint256 len = _countAt(s, p + 32);
        uint256 at = p + 34;
        if (at + len + 2 > s.length) revert MalformedOperationStream();
        bytes calldata authorization = s[at:at + len];
        p = at + len;
        uint256 count = _countAt(s, p);
        p += 2;
        if (count == 0 || p + count * COMMITMENT_BYTES > s.length) revert MalformedOperationStream();
        address buyer = address(bytes20(_wordAt(s, p + 32)));
        if (!publish) {
            uint256 cumulativeValue;
            for (uint256 i = 0; i < count; i++) {
                cumulativeValue += uint256(_wordAt(s, p + i * COMMITMENT_BYTES + 92));
            }
            _checkWalletCode(processId, buyer, cumulativeValue, authorization);
            return p + count * COMMITMENT_BYTES;
        }
        for (uint256 i = 0; i < count; i++) {
            _emitResolved(processId, _readCommitment(s, p));
            p += COMMITMENT_BYTES;
        }
        emit ProcessResolved(processId, buyer, count);
        return p;
    }

    /// @dev Ask the buyer's account code whether `authorization` authorizes
    ///      resolving `processId` at `cumulativeValue`: the ERC-1271 call,
    ///      a STATICCALL with the gas left, reading one word of the answer
    ///      (a longer answer is never copied). An account with no code is
    ///      refused by name; the whole answer word is compared with the magic
    ///      value left-aligned and zero-padded, as OpenZeppelin's
    ///      `SignatureChecker` compares it, and any other word refuses the
    ///      batch.
    function _checkWalletCode(bytes32 processId, address buyer, uint256 cumulativeValue, bytes calldata authorization)
        private
        view
    {
        if (buyer.code.length == 0) revert BuyerHasNoCode(processId, buyer);
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(RESOLVE_PROCESS_TYPEHASH, processId, cumulativeValue)));
        bytes memory query = abi.encodeWithSelector(ERC1271_MAGIC_VALUE, digest, authorization);
        bool ok;
        bytes32 answer;
        assembly ("memory-safe") {
            ok := staticcall(gas(), buyer, add(query, 32), mload(query), 0, 32)
            if lt(returndatasize(), 32) { ok := 0 }
            answer := mload(0)
        }
        if (!ok || answer != bytes32(ERC1271_MAGIC_VALUE)) revert WalletCodeAuthorizationRefused(processId, buyer);
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
